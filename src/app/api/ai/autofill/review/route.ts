import { NextResponse } from "next/server"
import { z } from "zod"

import { adminDb } from "@/lib/firebase-admin"
import type { PendingAutofillField } from "@/lib/ai/types"

const pendingFieldSchema = z.object({
  field: z.string().trim().min(1).max(220),
  label: z.string().trim().min(1).max(220),
  proposedValue: z.string().max(5000),
  currentValue: z.string().max(5000).optional(),
  sourceLabel: z.string().trim().min(1).max(220),
  sourceUrl: z.string().url().optional(),
  confidence: z.enum(["high", "medium", "low"])
})

const requestSchema = z.object({
  batchId: z.string().trim().min(4).max(160),
  productId: z.string().trim().max(160).optional(),
  action: z.enum(["save", "approve", "reject"]),
  fields: z.array(pendingFieldSchema).optional(),
  orgId: z.string().trim().max(120).optional(),
  reviewedBy: z.string().trim().max(120).default("current-user")
})

function numericValue(value: string) {
  const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ""))
  return Number.isFinite(parsed) ? parsed : undefined
}

function setNested(target: Record<string, unknown>, path: string[], value: unknown) {
  const [head, ...tail] = path
  if (!head) return

  if (tail.length === 0) {
    target[head] = value
    return
  }

  const current = target[head]
  const next = current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>) : {}
  target[head] = next
  setNested(next, tail, value)
}

function patchValueForField(field: PendingAutofillField) {
  const numericFields = [
    "caloriesKcal",
    "fatG",
    "saturatedFatG",
    "carbohydratesG",
    "sugarsG",
    "fiberG",
    "proteinG",
    "sodiumMg",
    "saltG",
    "novaGroup"
  ]

  return numericFields.some((numericField) => field.field.endsWith(numericField))
    ? numericValue(field.proposedValue) ?? field.proposedValue
    : field.proposedValue
}

function productPatchFromFields(fields: PendingAutofillField[]) {
  const patch: Record<string, unknown> = {}
  const nutrition: Record<string, unknown> = {}
  let hasNutritionInfo = false

  fields.forEach((field) => {
    const value = patchValueForField(field)

    if (field.field === "product.name") patch.name = value
    if (field.field === "product.brand") patch.brand = value
    if (field.field === "product.barcode") patch.sku = value
    if (field.field === "product.categories") patch.category = value
    if (field.field === "product.imageUrl") {
      patch.imageUrl = value
      nutrition.imageUrl = value
      hasNutritionInfo = true
    }
    if (field.field === "product.ingredientsText") {
      nutrition.ingredientsText = value
      hasNutritionInfo = true
    }
    if (field.field === "product.allergens") {
      nutrition.allergens = value
      hasNutritionInfo = true
    }
    if (field.field === "product.labels") {
      nutrition.labels = value
      hasNutritionInfo = true
    }
    if (field.field.startsWith("product.nutrition.")) {
      const nutritionPath = field.field.replace(/^product\.nutrition\.(perServing\.|per100g\.)?/, "").split(".")
      setNested(nutrition, nutritionPath, value)
      hasNutritionInfo = true
    }
  })

  if (Object.keys(nutrition).length > 0) patch.nutrition = nutrition
  if (hasNutritionInfo) patch.hasNutritionInfo = true

  return patch
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const parsed = requestSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: "Provide a pending batch and review action." }, { status: 400 })
  }

  const orgId = parsed.data.orgId || process.env.AI_AUTOFILL_ORG_ID || process.env.AI_LEARNING_ORG_ID || "demo-org"
  const status = parsed.data.action === "approve" ? "approved" : parsed.data.action === "reject" ? "rejected" : "pending"

  try {
    const db = await adminDb()
    if (!db) {
      return NextResponse.json({
        reviewed: false,
        persisted: false,
        batchId: parsed.data.batchId,
        status,
        message: "Preview mode: review action was acknowledged here, but it was not saved to Firestore yet."
      })
    }
    const { FieldValue } = await import("firebase-admin/firestore")
    const batchRef = db.collection("orgs").doc(orgId).collection("aiPendingAutofills").doc(parsed.data.batchId)
    const batchSnapshot = await batchRef.get()
    const batchData = batchSnapshot.exists ? batchSnapshot.data() ?? {} : {}
    const editedFields = parsed.data.fields
    const productId = parsed.data.productId || (typeof batchData.productId === "string" ? batchData.productId : undefined)

    await batchRef.set(
      {
        status,
        ...(editedFields ? { fields: editedFields } : {}),
        reviewedBy: parsed.data.reviewedBy,
        ...(parsed.data.action === "save" ? { editedAt: FieldValue.serverTimestamp() } : { reviewedAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    )

    let appliedToProduct = false
    if (parsed.data.action === "approve" && productId && editedFields?.length) {
      const productPatch = productPatchFromFields(editedFields)
      if (Object.keys(productPatch).length > 0) {
        await db.collection("orgs").doc(orgId).collection("products").doc(productId).set(
          {
            ...productPatch,
            verifiedAutofillBatchId: parsed.data.batchId,
            verifiedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          },
          { merge: true }
        )
        appliedToProduct = true
      }
    }

    return NextResponse.json({
      reviewed: true,
      persisted: true,
      appliedToProduct,
      batchId: parsed.data.batchId,
      status,
      message:
        parsed.data.action === "save"
          ? "Edited pending fields were saved for review."
          : status === "approved"
            ? appliedToProduct
              ? "Pending autofill was approved and applied to the product record."
              : "Pending autofill was approved."
            : "Pending autofill was rejected."
    })
  } catch (error) {
    return NextResponse.json(
      {
        reviewed: false,
        persisted: false,
        batchId: parsed.data.batchId,
        status,
        error: error instanceof Error ? error.message : "Failed to review pending autofill."
      },
      { status: 500 }
    )
  }
}
