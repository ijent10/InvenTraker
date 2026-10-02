import { z } from "zod"

import { firestoreCollections } from "@/lib/firestore-schema"
import { money } from "@/lib/order-contract"
import { recommendOrder } from "@/lib/ordering-engine"
import { assertStoreAccess, mobileEnvelope, mobileError, orgCollection, requireMobilePrincipal } from "@/lib/mobile-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const requestSchema = z.object({ storeId: z.string().min(1), vendorId: z.string().min(1) })

function days(value: unknown, fallback: number) {
  const match = String(value ?? "").match(/\d+/)
  if (/next day/i.test(String(value ?? ""))) return 1
  return match ? Math.max(1, Number(match[0])) : fallback
}

function nextArrival(leadTimeDays: number, deliveryDays: number[]) {
  const arrival = new Date(Date.now() + leadTimeDays * 86_400_000)
  if (!deliveryDays.length) return arrival.toISOString()
  for (let offset = 0; offset < 7; offset += 1) {
    if (deliveryDays.includes(arrival.getUTCDay())) return arrival.toISOString()
    arrival.setUTCDate(arrival.getUTCDate() + 1)
  }
  return arrival.toISOString()
}

export async function POST(request: Request) {
  try {
    const principal = await requireMobilePrincipal(request, "orders.create")
    const parsed = requestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return Response.json({ error: { code: "invalid_request", message: "Choose a store and vendor." } }, { status: 400 })
    await assertStoreAccess(principal, parsed.data.storeId)
    const [vendorSnapshot, inventorySnapshot, batchSnapshot, orderSnapshot, productSnapshot] = await Promise.all([
      orgCollection(principal, firestoreCollections.vendors).doc(parsed.data.vendorId).get(),
      orgCollection(principal, firestoreCollections.inventory).where("storeId", "==", parsed.data.storeId).get(),
      orgCollection(principal, firestoreCollections.inventoryBatches).where("storeId", "==", parsed.data.storeId).get(),
      orgCollection(principal, firestoreCollections.orders).where("storeId", "==", parsed.data.storeId).get(),
      orgCollection(principal, firestoreCollections.products).get()
    ])
    if (!vendorSnapshot.exists) return Response.json({ error: { code: "vendor_not_found", message: "Vendor was not found." } }, { status: 404 })
    const rawVendor = vendorSnapshot.data() ?? {}
    const leadTimeDays = Number(rawVendor.leadTimeDays ?? days(rawVendor.leadTime, 2))
    const deliveryDays = Array.isArray(rawVendor.deliveryDays) ? rawVendor.deliveryDays.map(Number).filter((day) => day >= 0 && day <= 6) : []
    const expectedArrival = typeof rawVendor.expectedArrival === "string"
      ? rawVendor.expectedArrival
      : nextArrival(leadTimeDays, deliveryDays)
    const run = recommendOrder({
      storeId: parsed.data.storeId,
      vendor: {
        id: vendorSnapshot.id,
        name: String(rawVendor.name ?? "Vendor"),
        minimumAmount: money(rawVendor.minimumAmount ?? rawVendor.minimum),
        leadTimeDays,
        coverageDays: Number(rawVendor.coverageDays ?? 2),
        catalog: Array.isArray(rawVendor.catalog) ? rawVendor.catalog.map(String) : undefined,
        orderDueAt: typeof rawVendor.orderDueAt === "string" ? rawVendor.orderDueAt : undefined,
        expectedArrival,
        deliveryDays,
        products: Array.isArray(rawVendor.products) ? rawVendor.products.map((product) => ({
          sku: String(product.sku ?? ""), orderUnit: String(product.orderUnit ?? "case"),
          packSize: Math.max(1, Number(product.packSize ?? 1)), minimumOrderQuantity: Number(product.minimumOrderQuantity ?? 0),
          orderIncrement: Math.max(1, Number(product.orderIncrement ?? 1)), unitCostAmount: money(product.unitCostAmount)
        })) : undefined
      },
      inventory: inventorySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as never,
      batches: batchSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as never,
      openOrders: orderSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as never,
      costs: productSnapshot.docs.map((doc) => {
        const data = doc.data()
        return { sku: typeof data.sku === "string" ? data.sku : undefined, name: String(data.name ?? ""), unitCost: money(data.unitCostAmount ?? data.lastCost ?? data.averagePrice) }
      })
    })
    return Response.json(mobileEnvelope({
      ...run,
      vendor: { id: vendorSnapshot.id, name: String(rawVendor.name ?? "Vendor"), expectedArrival, orderDueAt: rawVendor.orderDueAt ?? null }
    }))
  } catch (error) {
    return mobileError(error)
  }
}
