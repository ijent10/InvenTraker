import { nationalSignals, productEvidence, wasteSignals } from "@/lib/ai/product-intelligence"
import { readAssistantProductMemory } from "@/lib/ai/memory-store"
import { buildOrderingAwareness } from "@/lib/ai/ordering-awareness"
import { assistantPrivacyPayload } from "@/lib/ai/privacy"
import type { AiOperationalContext } from "@/lib/ai/types"
import { getCentralCatalogProducts, getCompanyFiles, getInventoryItems, getProducts, getStores } from "@/lib/server-data"

export async function buildOperationalContext(): Promise<AiOperationalContext> {
  const [centralCatalog, inventoryItems, products, stores, assistantMemory, companyFiles] = await Promise.all([
    getCentralCatalogProducts(),
    getInventoryItems(),
    getProducts(),
    getStores(),
    readAssistantProductMemory(),
    getCompanyFiles()
  ])
  const activeStore = stores[0]
  const orderingAwareness = await buildOrderingAwareness(activeStore)

  return {
    generatedAt: new Date().toISOString(),
    storeName: activeStore?.name ?? "Liberty Ave",
    centralCatalog: centralCatalog.map((product) => ({
      centralProductId: product.id,
      name: product.name,
      sku: product.sku,
      nutrition: product.nutrition,
      averagePrice: product.averagePrice,
      averageExpirationDays: product.averageExpirationDays,
      averageQuantityInCase: product.averageQuantityInCase,
      images: product.images
    })),
    organizationProducts: products.map((product) => ({
      productId: product.id,
      centralProductId: product.centralProductId,
      name: product.name,
      sku: product.sku,
      department: product.department,
      category: product.category,
      defaultUnit: product.defaultUnit,
      expires: product.expires,
      nutrition: product.nutrition
    })),
    inventory: inventoryItems.map((item) => ({
      centralProductId: item.centralProductId,
      orgProductId: item.orgProductId,
      storeId: item.storeId,
      name: item.name,
      sku: item.sku,
      department: item.department,
      category: item.category,
      onHand: item.onHand,
      frontStock: item.frontStock,
      backStock: item.backStock,
      par: item.par,
      reorderPoint: item.reorderPoint,
      unit: item.unit,
      vendor: item.vendor,
      price: item.price,
      quantityInCase: item.quantityInCase,
      expires: item.expires,
      status: item.status
    })),
    products: productEvidence,
    assistantMemory,
    waste: wasteSignals,
    nationalSignals,
    orderingAwareness,
    approvedDocuments: companyFiles
      .filter((file) => file.approvedStatus === "approved")
      .map((file) => ({
        documentId: file.documentId,
        documentTitle: file.title,
        fileName: file.fileName,
        documentType: file.documentType,
        confidence: 1,
        reason: `${file.department} approved document available to document retrieval.`,
        approvedStatus: file.approvedStatus,
        viewerUrl: file.viewerUrl
      }))
  }
}

export function findProductInContext(question: string, context: AiOperationalContext) {
  const normalized = question.toLowerCase()

  return (
    context.products.find((product) => normalized.includes(product.productName.toLowerCase())) ??
    context.inventory.find((item) => normalized.includes(item.name.toLowerCase()))
  )
}

export function summarizeContextForModel(context: AiOperationalContext) {
  return {
    privacy: assistantPrivacyPayload(),
    storeName: context.storeName,
    centralCatalog: context.centralCatalog,
    organizationProducts: context.organizationProducts,
    inventory: context.inventory,
    products: context.products.map((product) => ({
      productName: product.productName,
      sku: product.sku,
      kosherStatus: product.kosherStatus,
      allergens: product.allergens,
      dietaryNotes: product.dietaryNotes,
      handlingNotes: product.handlingNotes
    })),
    assistantMemory: context.assistantMemory.map((memory) => ({
      productName: memory.productName,
      sku: memory.sku,
      department: memory.department,
      category: memory.category,
      factType: memory.factType,
      normalizedValue: memory.normalizedValue,
      confidence: memory.confidence,
      summary: memory.summary,
      evidence: memory.evidence,
      sourceLabels: memory.sourceLabels
    })),
    waste: context.waste,
    nationalSignals: context.nationalSignals,
    orderingAwareness: context.orderingAwareness,
    approvedDocuments: context.approvedDocuments
  }
}
