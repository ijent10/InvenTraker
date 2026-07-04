import { buildOperationalContext } from "@/lib/ai/context"
import { DEFAULT_ORG_ID } from "@/lib/firestore-schema"
import { slugifyIntelligenceId } from "@/lib/intelligence/text"
import type { BusinessRecommendation } from "@/lib/intelligence/types"

function recommendationId(title: string, productName?: string) {
  return `rec-${slugifyIntelligenceId(`${productName ?? "store"}-${title}`)}`
}

function rec(input: Omit<BusinessRecommendation, "id">): BusinessRecommendation {
  return {
    ...input,
    id: recommendationId(input.title, input.productName)
  }
}

export async function generateBusinessRecommendations({ orgId = DEFAULT_ORG_ID }: { orgId?: string } = {}) {
  void orgId
  const context = await buildOperationalContext()
  const recommendations: BusinessRecommendation[] = []
  const wasteByProduct = new Map<string, number>()

  context.waste.forEach((waste) => {
    wasteByProduct.set(waste.productName, (wasteByProduct.get(waste.productName) ?? 0) + waste.quantity)
  })

  context.inventory.forEach((item) => {
    if (item.onHand <= item.reorderPoint) {
      recommendations.push(
        rec({
          type: "stockout_risk",
          title: `${item.name} is near stockout`,
          productName: item.name,
          detail: `${item.name} has ${item.onHand} ${item.unit} on hand against a reorder point of ${item.reorderPoint}.`,
          confidenceScore: 0.84,
          severity: item.onHand === 0 ? "high" : "medium",
          evidence: [
            `On hand: ${item.onHand}`,
            `Reorder point: ${item.reorderPoint}`,
            `Back stock: ${item.backStock}`,
            `Vendor: ${item.vendor}`
          ],
          suggestedAction: "Review the next vendor order and prioritize this item before the store falls below selling floor needs."
        })
      )
    }

    if (item.frontStock < Math.min(item.par, item.reorderPoint + 2) && item.backStock > 0) {
      recommendations.push(
        rec({
          type: "increase_production",
          title: `${item.name} needs floor replenishment`,
          productName: item.name,
          detail: `${item.name} has ${item.frontStock} on the floor and ${item.backStock} in back stock.`,
          confidenceScore: 0.72,
          severity: "medium",
          evidence: [`Front stock: ${item.frontStock}`, `Back stock: ${item.backStock}`, `Par: ${item.par}`],
          suggestedAction: "Restock from back stock before ordering more."
        })
      )
    }

    const wasteQuantity = wasteByProduct.get(item.name) ?? 0
    if (wasteQuantity > 0 && item.onHand > item.reorderPoint) {
      recommendations.push(
        rec({
          type: "reduce_ordering",
          title: `Reduce ordering pressure for ${item.name}`,
          productName: item.name,
          detail: `${item.name} has recent waste and still sits above reorder point.`,
          confidenceScore: 0.7,
          severity: "medium",
          evidence: [`Recent waste quantity: ${wasteQuantity}`, `On hand: ${item.onHand}`, `Reorder point: ${item.reorderPoint}`],
          suggestedAction: "Reduce the next order or hold quantity steady until waste improves."
        })
      )
    }

    if (item.expires && wasteQuantity > 0) {
      recommendations.push(
        rec({
          type: "waste_risk",
          title: `${item.name} has expiration waste risk`,
          productName: item.name,
          detail: `${item.name} expires and has recent waste. This should be reviewed before production or ordering increases.`,
          confidenceScore: 0.78,
          severity: "high",
          evidence: [`Expires: yes`, `Recent waste quantity: ${wasteQuantity}`, `On hand: ${item.onHand}`],
          suggestedAction: "Check dates, consider markdowns, and adjust forecast quantities."
        })
      )
    }
  })

  const hotWeather = context.orderingAwareness?.weather.some((day) => typeof day.temperatureMaxF === "number" && day.temperatureMaxF >= 85)
  if (hotWeather) {
    recommendations.push(
      rec({
        type: "abnormal_movement",
        title: "Hot weather may shift product movement",
        detail: "Forecasted high temperatures may increase beverage, produce, and ready-to-eat movement while changing traffic patterns.",
        confidenceScore: 0.58,
        severity: "low",
        evidence: context.orderingAwareness?.weather
          .filter((day) => typeof day.temperatureMaxF === "number" && day.temperatureMaxF >= 85)
          .slice(0, 3)
          .map((day) => `${day.date}: ${Math.round(day.temperatureMaxF ?? 0)}F high`) ?? [],
        suggestedAction: "Use recent sales/imported movement before increasing fresh production or beverage orders."
      })
    )
  }

  if (context.orderingAwareness?.holidays.length) {
    recommendations.push(
      rec({
        type: "abnormal_movement",
        title: "Holiday window needs seasonal review",
        detail: "The post-delivery window includes a public holiday, so current ordering should be compared against seasonal history.",
        confidenceScore: 0.62,
        severity: "medium",
        evidence: context.orderingAwareness.holidays.map((holiday) => `${holiday.date}: ${holiday.localName}`),
        suggestedAction: "Compare last comparable holiday period before finalizing high-volume orders."
      })
    )
  }

  return {
    generatedAt: new Date().toISOString(),
    storeName: context.storeName,
    sourceSummary: [
      `${context.inventory.length} inventory records analyzed`,
      `${context.waste.length} waste signals analyzed`,
      context.orderingAwareness ? "Weather, holiday, and traffic heuristics loaded" : "Ordering awareness unavailable"
    ],
    recommendations: recommendations.sort((a, b) => b.confidenceScore - a.confidenceScore).slice(0, 12)
  }
}
