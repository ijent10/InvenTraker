import type { HolidaySignal, NationalSignal, OrderingAwareness, WeatherDailySignal } from "@/lib/ai/types"
import type { StoreRecord } from "@/lib/demo-data"

type GeocodeResult = {
  latitude?: number
  longitude?: number
  name?: string
  admin1?: string
}

type WeatherPayload = {
  daily?: {
    time?: string[]
    weather_code?: number[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    precipitation_sum?: number[]
    wind_speed_10m_max?: number[]
  }
}

type TicketmasterPayload = {
  _embedded?: {
    events?: Array<{
      name?: string
      url?: string
      dates?: {
        start?: {
          localDate?: string
          localTime?: string
        }
      }
      classifications?: Array<{
        segment?: {
          name?: string
        }
        genre?: {
          name?: string
        }
      }>
      _embedded?: {
        venues?: Array<{
          name?: string
          city?: {
            name?: string
          }
        }>
      }
    }>
  }
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

async function fetchJson(url: string, timeoutMs = 4500) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "InvenTracker/0.1 ordering-awareness"
      },
      signal: controller.signal
    })

    if (!response.ok) return undefined
    return response.json()
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

function citySearch(address?: string, storeName?: string) {
  const parts = (address ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length >= 2) return parts.slice(-2).join(" ")
  return parts[0] ?? storeName ?? "Pittsburgh PA"
}

async function geocodeStore(store?: StoreRecord): Promise<GeocodeResult | undefined> {
  const params = new URLSearchParams({
    name: citySearch(store?.address, store?.name),
    count: "1",
    countryCode: "US",
    language: "en",
    format: "json"
  })
  const payload = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`)
  const result = Array.isArray(payload?.results) ? payload.results[0] : undefined
  return result && typeof result === "object" ? (result as GeocodeResult) : undefined
}

async function lookupWeather(geocode: GeocodeResult | undefined): Promise<WeatherDailySignal[]> {
  if (typeof geocode?.latitude !== "number" || typeof geocode.longitude !== "number") return []

  const params = new URLSearchParams({
    latitude: String(geocode.latitude),
    longitude: String(geocode.longitude),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    forecast_days: "10",
    timezone: "auto"
  })
  const payload = (await fetchJson(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)) as WeatherPayload | undefined
  const daily = payload?.daily
  const dates = daily?.time ?? []

  return dates.map((date, index) => ({
    date,
    temperatureMaxF: daily?.temperature_2m_max?.[index],
    temperatureMinF: daily?.temperature_2m_min?.[index],
    precipitationIn: daily?.precipitation_sum?.[index],
    windSpeedMph: daily?.wind_speed_10m_max?.[index],
    weatherCode: daily?.weather_code?.[index]
  }))
}

async function lookupHolidays(startDate: string, endDate: string): Promise<HolidaySignal[]> {
  const years = Array.from(new Set([startDate.slice(0, 4), endDate.slice(0, 4)]))
  const payloads = await Promise.all(years.map((year) => fetchJson(`https://date.nager.at/api/v3/PublicHolidays/${year}/US`)))

  return payloads
    .flatMap((payload) => (Array.isArray(payload) ? payload : []))
    .filter((holiday): holiday is HolidaySignal => {
      if (!holiday || typeof holiday !== "object" || typeof holiday.date !== "string") return false
      return holiday.date >= startDate && holiday.date <= endDate
    })
    .map((holiday) => ({
      date: holiday.date,
      localName: String(holiday.localName ?? holiday.name ?? "Holiday"),
      name: String(holiday.name ?? holiday.localName ?? "Holiday")
    }))
}

function trafficHeuristics(weather: WeatherDailySignal[], holidays: HolidaySignal[]) {
  const heuristics: string[] = []
  const wetDays = weather.filter((day) => typeof day.precipitationIn === "number" && day.precipitationIn >= 0.2)
  const windyDays = weather.filter((day) => typeof day.windSpeedMph === "number" && day.windSpeedMph >= 25)
  const hotDays = weather.filter((day) => typeof day.temperatureMaxF === "number" && day.temperatureMaxF >= 85)
  const coldDays = weather.filter((day) => typeof day.temperatureMinF === "number" && day.temperatureMinF <= 25)

  if (wetDays.length > 0) heuristics.push(`${wetDays.length} wet forecast day${wetDays.length === 1 ? "" : "s"} may slow deliveries and shift customer traffic toward quick trips.`)
  if (windyDays.length > 0) heuristics.push(`${windyDays.length} windy day${windyDays.length === 1 ? "" : "s"} may increase delivery friction and reduce outdoor event traffic.`)
  if (hotDays.length > 0) heuristics.push(`${hotDays.length} hot day${hotDays.length === 1 ? "" : "s"} may increase beverage, produce, and ready-to-eat demand.`)
  if (coldDays.length > 0) heuristics.push(`${coldDays.length} cold day${coldDays.length === 1 ? "" : "s"} may increase soup, bakery, pantry, and comfort-item demand.`)
  if (holidays.length > 0) heuristics.push(`Holiday window includes ${holidays.map((holiday) => holiday.localName).join(", ")}; compare seasonal demand before final order quantities.`)

  if (heuristics.length === 0) {
    heuristics.push("No major weather or holiday pressure found in the current public lookup window; use sales velocity and waste as primary order signals.")
  }

  return heuristics
}

async function lookupNearbyEvents(geocode: GeocodeResult | undefined, startDate: string, endDate: string, store?: StoreRecord): Promise<NationalSignal[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY
  if (!apiKey || typeof geocode?.latitude !== "number" || typeof geocode.longitude !== "number") {
    return [
      {
        title: "Nearby event lookup unavailable",
        detail: `Configure TICKETMASTER_API_KEY to check events near ${store?.address ?? store?.name ?? "the store"} for the post-delivery window.`,
        sourceLabel: "Events connector"
      }
    ]
  }

  const params = new URLSearchParams({
    apikey: apiKey,
    latlong: `${geocode.latitude},${geocode.longitude}`,
    radius: "20",
    unit: "miles",
    startDateTime: `${startDate}T00:00:00Z`,
    endDateTime: `${endDate}T23:59:59Z`,
    size: "5",
    sort: "date,asc"
  })
  const payload = (await fetchJson(`https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`)) as TicketmasterPayload | undefined
  const events = payload?._embedded?.events ?? []

  if (events.length === 0) {
    return [
      {
        title: "No nearby events found",
        detail: "Ticketmaster did not return nearby events in the current post-delivery window.",
        sourceLabel: "Ticketmaster Discovery API"
      }
    ]
  }

  return events.map((event) => {
    const date = event.dates?.start?.localDate
    const venue = event._embedded?.venues?.[0]
    const segment = event.classifications?.[0]?.segment?.name
    const genre = event.classifications?.[0]?.genre?.name
    return {
      title: event.name ?? "Nearby event",
      detail: [date, venue?.name, venue?.city?.name, segment, genre]
        .filter(Boolean)
        .join(" · "),
      sourceLabel: "Ticketmaster Discovery API",
      url: event.url
    }
  })
}

export async function buildOrderingAwareness(store?: StoreRecord, deliveryDate = isoDate(addDays(new Date(), 1))): Promise<OrderingAwareness> {
  const start = deliveryDate
  const end = isoDate(addDays(new Date(`${deliveryDate}T00:00:00.000Z`), 7))
  const geocode = await geocodeStore(store)
  const [weather, holidays, events] = await Promise.all([lookupWeather(geocode), lookupHolidays(start, end), lookupNearbyEvents(geocode, start, end, store)])
  const windowWeather = weather.filter((day) => day.date >= start && day.date <= end)

  return {
    storeName: store?.name ?? "Active store",
    storeAddress: store?.address,
    deliveryDate,
    forecastWindow: {
      start,
      end
    },
    weather: windowWeather,
    holidays,
    trafficHeuristics: trafficHeuristics(windowWeather, holidays),
    eventSignals: events,
    sourceSummary: [
      geocode ? `Open-Meteo geocoded ${geocode.name ?? store?.name ?? "store"}${geocode.admin1 ? `, ${geocode.admin1}` : ""}.` : "Store geocoding was unavailable.",
      windowWeather.length > 0 ? "Open-Meteo forecast loaded for the post-delivery window." : "Weather forecast was unavailable.",
      holidays.length > 0 ? "Nager.Date public holiday data loaded for the post-delivery window." : "No public holidays found in the post-delivery window.",
      events.some((event) => event.sourceLabel === "Ticketmaster Discovery API") ? "Ticketmaster event lookup loaded for nearby events." : "Nearby event lookup needs a configured event provider."
    ]
  }
}
