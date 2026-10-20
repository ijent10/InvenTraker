import { createHash, randomBytes } from "node:crypto"

import { z } from "zod"

import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { mergeDuplicateProduct, normalizeGtin, normalizeOpenFoodFactsProduct } from "@/lib/open-food-facts-import"

type FirestoreDatabase = FirebaseFirestore.Firestore

export class CatalogApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

export type CatalogPrincipal = {
  kind: "user" | "api_key"
  id: string
  orgId: string
  client: string
  scopes: string[]
  db: FirestoreDatabase
}

const editableNutritionSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional()
export const catalogPatchSchema = z.object({
  expectedRevision: z.number().int().min(0).optional(),
  reason: z.string().trim().max(500).optional(),
  patch: z.object({
    productName: z.string().trim().min(1).max(300).optional(),
    brand: z.string().trim().max(300).nullable().optional(),
    brands: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
    manufacturer: z.string().trim().max(300).nullable().optional(),
    description: z.string().trim().max(5_000).nullable().optional(),
    category: z.string().trim().max(300).nullable().optional(),
    subcategory: z.string().trim().max(300).nullable().optional(),
    ingredients: z.string().trim().max(20_000).nullable().optional(),
    allergens: z.array(z.string().trim().min(1).max(160)).max(100).optional(),
    servingSize: z.string().trim().max(160).nullable().optional(),
    quantity: z.string().trim().max(160).nullable().optional(),
    netWeight: z.string().trim().max(160).nullable().optional(),
    packaging: z.string().trim().max(2_000).nullable().optional(),
    imageUrls: z.array(z.string().url().max(2_000)).max(20).optional(),
    nutritionPer100: editableNutritionSchema,
    nutritionPerServing: editableNutritionSchema
  }).strict().refine((value) => Object.keys(value).length > 0, "At least one editable field is required.")
}).strict()

function apiKeyHash(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function bearer(request: Request) {
  return /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim()
}

function hasScope(scopes: string[], required: string) {
  return scopes.includes("*") || scopes.includes(required)
}

export async function requireCatalogPrincipal(request: Request, requiredScope = "catalog:read"): Promise<CatalogPrincipal> {
  const db = await adminDb()
  if (!db) throw new CatalogApiError(503, "service_unavailable", "The product catalog service is unavailable.")

  const presentedKey = request.headers.get("x-api-key")?.trim()
  if (presentedKey) {
    const snapshot = await db.collection("catalogApiKeys").doc(apiKeyHash(presentedKey)).get()
    const key = snapshot.data()
    const scopes = Array.isArray(key?.scopes) ? key.scopes.map(String) : []
    const expiresAt = String(key?.expiresAt ?? "")
    if (!snapshot.exists || key?.status !== "active" || (expiresAt && Date.parse(expiresAt) <= Date.now())) {
      throw new CatalogApiError(401, "invalid_api_key", "The catalog API key is invalid or inactive.")
    }
    if (!hasScope(scopes, requiredScope)) throw new CatalogApiError(403, "insufficient_scope", `The API key requires ${requiredScope}.`)
    void snapshot.ref.set({ lastUsedAt: new Date().toISOString() }, { merge: true })
    return { kind: "api_key", id: snapshot.id, orgId: String(key?.orgId ?? ""), client: String(key?.client ?? "external"), scopes, db }
  }

  const token = bearer(request)
  if (!token) throw new CatalogApiError(401, "unauthenticated", "Send a Firebase bearer token or an API key.")
  const auth = await adminAuth()
  const decoded = auth ? await auth.verifyIdToken(token, true).catch(() => null) : null
  if (!decoded) throw new CatalogApiError(401, "invalid_session", "The sign-in session is invalid or expired.")
  const user = await db.collection("users").doc(decoded.uid).get()
  const requestedOrg = request.headers.get("x-inventracker-org")?.trim()
  const orgId = requestedOrg || String(decoded.orgId ?? user.data()?.defaultOrgId ?? "")
  if (!orgId) throw new CatalogApiError(403, "organization_required", "Choose an organization before using the catalog.")
  const member = await db.collection("orgs").doc(orgId).collection("members").doc(decoded.uid).get()
  const data = member.data()
  if (!member.exists || String(data?.status ?? "active").toLowerCase() !== "active") {
    throw new CatalogApiError(403, "membership_required", "Active organization membership is required.")
  }
  const permissions = Array.isArray(data?.permissions) ? data.permissions.map(String) : []
  const role = String(data?.role ?? data?.jobTitle ?? "").toLowerCase()
  const manager = ["owner", "organization owner", "admin", "administrator", "manager"].includes(role)
  const scopes = ["catalog:read"]
  if (manager || permissions.includes("*") || permissions.includes("products.edit")) scopes.push("catalog:contribute")
  if (manager || permissions.includes("*") || permissions.includes("ai.verifyAutofill")) scopes.push("catalog:write")
  if (manager || permissions.includes("*") || permissions.includes("inventory.view") || permissions.includes("inventory.edit")) scopes.push("inventory:read")
  if (!hasScope(scopes, requiredScope)) throw new CatalogApiError(403, "insufficient_scope", `Your account requires ${requiredScope}.`)
  return { kind: "user", id: decoded.uid, orgId, client: "inventraker", scopes, db }
}

function serialize(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate(): Date }).toDate().toISOString()
  }
  if (Array.isArray(value)) return value.map(serialize)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, serialize(entry)]))
  return value
}

function publicSource(data: FirebaseFirestore.DocumentData, sourceCollection: string): Record<string, unknown> {
  const source: Record<string, unknown> = { ...data }
  delete source.promotedByUid
  delete source.reviewedByUid
  return { ...source, sourceCollection }
}

function catalogNutrition(sourceValue: unknown, editedPer100: unknown, editedPerServing: unknown) {
  const source = sourceValue && typeof sourceValue === "object" ? sourceValue as Record<string, unknown> : {}
  const raw100 = editedPer100 ?? source.per100g ?? source.per100gOr100ml ?? {}
  const rawServing = editedPerServing ?? source.perServing ?? {}
  const addMilligrams = (value: unknown) => {
    const record = value && typeof value === "object" ? { ...(value as Record<string, unknown>) } : {}
    if (record.sodiumMg === undefined && typeof record.sodiumG === "number") record.sodiumMg = record.sodiumG * 1_000
    return record
  }
  return {
    per100g: addMilligrams(raw100),
    perServing: addMilligrams(rawServing),
    servingSize: source.servingSize ?? null,
    servingQuantity: source.servingQuantity ?? null,
    servingQuantityUnit: source.servingQuantityUnit ?? null,
    basis: source.basis ?? null
  }
}

export async function catalogProductByGtin(db: FirestoreDatabase, input: string) {
  const normalizedGtin = normalizeGtin(input)
  if (!normalizedGtin) throw new CatalogApiError(400, "invalid_gtin", "Use a valid UPC, EAN, or GTIN with a correct check digit.")
  const id = `gtin-${normalizedGtin}`
  let snapshot: FirebaseFirestore.DocumentSnapshot | undefined = await db.collection("centralCatalog").doc(id).get()
  let sourceCollection = "centralCatalog"
  if (!snapshot.exists) {
    snapshot = await db.collection("openFoodFactsStaging").doc(id).get()
    sourceCollection = "openFoodFactsStaging"
  }
  if (!snapshot.exists) {
    const [central, staged] = await Promise.all([
      db.collection("centralCatalog").where("normalizedGtin", "==", normalizedGtin).limit(1).get(),
      db.collection("openFoodFactsStaging").where("normalizedGtin", "==", normalizedGtin).limit(1).get()
    ])
    snapshot = central.docs[0] ?? staged.docs[0]
    sourceCollection = central.empty ? "openFoodFactsStaging" : "centralCatalog"
  }
  if (!snapshot?.exists) throw new CatalogApiError(404, "product_not_found", "No catalog product uses that UPC or GTIN.")
  const edit = await db.collection("catalogProductEdits").doc(id).get()
  let source = publicSource(snapshot.data() ?? {}, sourceCollection)
  if (sourceCollection === "openFoodFactsStaging" && needsLiveEnrichment(source)) {
    const enriched = await liveOpenFoodFactsEnrichment(String(source.sourceBarcode ?? input), source)
    if (enriched) {
      source = { ...source, ...enriched }
      await snapshot.ref.set({ ...enriched, lastLiveEnrichmentAt: new Date().toISOString() }, { merge: true }).catch(() => undefined)
    }
  }
  const overlay = edit.data() ?? {}
  const fields = overlay.fields ?? {}
  const productName = fields.productName ?? source.productName ?? source.name ?? ""
  const imageUrls = fields.imageUrls ?? source.imageUrls ?? source.images ?? []
  const brand = fields.brand ?? source.brand ?? (Array.isArray(source.brands) ? source.brands.join(", ") : "")
  const nutrition = catalogNutrition(source.nutrition, fields.nutritionPer100, fields.nutritionPerServing)
  return serialize({
    id,
    gtin: normalizedGtin,
    barcode: source.sourceBarcode ?? source.barcode ?? source.sku ?? input,
    ...source,
    ...fields,
    productName,
    canonicalName: productName,
    brand,
    imageUrls,
    imageURL: Array.isArray(imageUrls) ? imageUrls[0] ?? null : null,
    generalizedCategoryKey: fields.category ?? source.category ?? null,
    standardSize: fields.standardSize ?? source.productQuantity ?? null,
    standardUnit: fields.standardUnit ?? source.productQuantityUnit ?? null,
    nutrition,
    catalogRevision: overlay.revision ?? 0,
    catalogUpdatedAt: overlay.updatedAt ?? null,
    catalogUpdatedBy: overlay.actor ? { kind: overlay.actor.kind, client: overlay.actor.client } : null,
    attribution: source.attribution ?? "Product data from Open Food Facts, licensed under ODbL 1.0.",
    license: source.license ?? "ODbL-1.0"
  }) as Record<string, unknown>
}

function needsLiveEnrichment(source: Record<string, unknown>) {
  const checkedAt = Date.parse(String(source.lastLiveEnrichmentAt ?? ""))
  if (Number.isFinite(checkedAt) && Date.now() - checkedAt < 24 * 60 * 60 * 1_000) return false
  return !Array.isArray(source.imageUrls) || source.imageUrls.length === 0 || !source.ingredients || (!source.netQuantity && !source.productQuantity)
}

async function liveOpenFoodFactsEnrichment(barcode: string, existing: Record<string, unknown>) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6_000)
  try {
    const fields = ["code", "product_name", "product_name_en", "brands", "brands_tags", "generic_name", "generic_name_en", "categories_tags", "ingredients_text", "ingredients_text_en", "allergens_tags", "nutriments", "serving_size", "serving_quantity", "serving_quantity_unit", "quantity", "product_quantity", "product_quantity_unit", "packaging_quantity", "packaging", "packaging_text", "packaging_text_en", "packaging_tags", "countries_tags", "stores", "stores_tags", "image_front_url", "image_url", "image_nutrition_url", "image_ingredients_url", "selected_images", "last_modified_t"].join(",")
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=${fields}`, {
      signal: controller.signal,
      headers: { "user-agent": "InvenTraker/1.0 (shared catalog UPC enrichment)" }
    })
    if (!response.ok) return null
    const body = await response.json() as { status?: number; product?: Record<string, unknown> }
    if (body.status !== 1 || !body.product) return null
    const normalized = normalizeOpenFoodFactsProduct(body.product, new Date().toISOString())
    const record = "record" in normalized ? normalized.record : undefined
    if (!record || record.normalizedGtin !== existing.normalizedGtin) return null
    return mergeDuplicateProduct(existing, record as Record<string, unknown>)
  } catch { return null }
  finally { clearTimeout(timeout) }
}

export async function searchCatalog(db: FirestoreDatabase, query: string, limit: number) {
  const normalizedGtin = normalizeGtin(query)
  if (normalizedGtin) return [await catalogProductByGtin(db, normalizedGtin)]
  const normalizedName = query.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  if (normalizedName.length < 2) throw new CatalogApiError(400, "query_too_short", "Product-name searches require at least two characters.")
  const end = `${normalizedName}\uf8ff`
  const [central, staged] = await Promise.all([
    db.collection("centralCatalog").orderBy("normalizedName").startAt(normalizedName).endAt(end).limit(limit).get(),
    db.collection("openFoodFactsStaging").orderBy("normalizedName").startAt(normalizedName).endAt(end).limit(limit).get()
  ])
  const ids = [...new Set([...central.docs, ...staged.docs].map((doc) => String(doc.data().normalizedGtin ?? doc.id.replace(/^gtin-/, ""))))].slice(0, limit)
  return Promise.all(ids.map((gtin) => catalogProductByGtin(db, gtin)))
}

export async function updateCatalogProduct(principal: CatalogPrincipal, gtin: string, input: z.infer<typeof catalogPatchSchema>) {
  const current = await catalogProductByGtin(principal.db, gtin)
  const id = String(current.id)
  const ref = principal.db.collection("catalogProductEdits").doc(id)
  const eventRef = principal.db.collection("catalogProductEditEvents").doc()
  const now = new Date().toISOString()
  await principal.db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref)
    const revision = Number(existing.data()?.revision ?? 0)
    if (input.expectedRevision !== undefined && input.expectedRevision !== revision) {
      throw new CatalogApiError(409, "revision_conflict", `The product changed after revision ${input.expectedRevision}; reload it and retry.`)
    }
    const fields = { ...(existing.data()?.fields ?? {}), ...input.patch }
    const actor = { kind: principal.kind, id: principal.id, orgId: principal.orgId, client: principal.client }
    transaction.set(ref, { normalizedGtin: current.gtin, fields, revision: revision + 1, updatedAt: now, actor }, { merge: true })
    transaction.create(eventRef, { productId: id, normalizedGtin: current.gtin, patch: input.patch, reason: input.reason ?? "", revision: revision + 1, createdAt: now, actor })
  })
  return catalogProductByGtin(principal.db, gtin)
}

export async function createCatalogApiKey(db: FirestoreDatabase, input: { name: string; client: string; orgId: string; scopes: string[]; expiresAt?: string }, createdByUid: string) {
  const secret = `ivtk_${randomBytes(32).toString("base64url")}`
  const hash = apiKeyHash(secret)
  const now = new Date().toISOString()
  await db.collection("catalogApiKeys").doc(hash).create({ ...input, status: "active", prefix: secret.slice(0, 12), createdAt: now, createdByUid, lastUsedAt: null })
  return { id: hash, apiKey: secret, prefix: secret.slice(0, 12), ...input, createdAt: now }
}

export function catalogApiResponse(error: unknown) {
  if (error instanceof CatalogApiError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status, headers: catalogCorsHeaders() })
  console.error("Catalog API error", error)
  return Response.json({ error: { code: "internal_error", message: "The catalog request could not be completed." } }, { status: 500, headers: catalogCorsHeaders() })
}

export function catalogCorsHeaders() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type, X-API-Key, X-InvenTraker-Org", "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS", "Cache-Control": "no-store" }
}
