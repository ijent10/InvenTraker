import { db } from "./lib/firebase-admin"

type Result = { label: string; ok: boolean; details: string }

async function firstDoc(path: string) {
  const snap = await db.collection(path).limit(1).get()
  return snap.empty ? null : snap.docs[0]
}

function checkFields(data: Record<string, unknown>, fields: string[]) {
  const missing = fields.filter((field) => !(field in data))
  return { ok: missing.length === 0, missing }
}

async function checkCollection(path: string, fields: string[]): Promise<Result> {
  const docSnap = await firstDoc(path)
  if (!docSnap) {
    return { label: path, ok: false, details: "collection empty or missing" }
  }
  const { ok, missing } = checkFields(docSnap.data() as Record<string, unknown>, fields)
  return {
    label: path,
    ok,
    details: ok ? "ok" : `missing fields: ${missing.join(", ")}`
  }
}

async function checkOptionalCollection(path: string, fields: string[]): Promise<Result> {
  const docSnap = await firstDoc(path)
  if (!docSnap) {
    return { label: path, ok: true, details: "optional collection empty" }
  }
  const { ok, missing } = checkFields(docSnap.data() as Record<string, unknown>, fields)
  return {
    label: path,
    ok,
    details: ok ? "ok" : `missing fields: ${missing.join(", ")}`
  }
}

async function checkStoreSubcollections(orgId: string, regionId: string, districtId: string, storeId: string) {
  const checks: Array<Promise<Result>> = [
    checkCollection(
      `organizations/${orgId}/regions/${regionId}/districts/${districtId}/stores/${storeId}/departments`,
      ["name"]
    ),
    checkCollection(
      `organizations/${orgId}/regions/${regionId}/districts/${districtId}/stores/${storeId}/locations`,
      ["name"]
    ),
    checkCollection(
      `organizations/${orgId}/regions/${regionId}/districts/${districtId}/stores/${storeId}/inventoryBatches`,
      [
        "organizationId",
        "storeId",
        "itemId",
        "quantity",
        "unit",
        "expiresAt",
        "source",
        "createdAt",
        "updatedAt"
      ]
    ),
    checkCollection(
      `organizations/${orgId}/regions/${regionId}/districts/${districtId}/stores/${storeId}/wasteRecords`,
      ["organizationId", "storeId", "itemId", "quantity", "unit", "reason", "createdAt", "createdBy"]
    ),
    checkCollection(`organizations/${orgId}/regions/${regionId}/districts/${districtId}/stores/${storeId}/orders`, [
      "organizationId",
      "storeId",
      "vendorId",
      "status",
      "createdAt",
      "createdBy"
    ]),
    checkCollection(`organizations/${orgId}/regions/${regionId}/districts/${districtId}/stores/${storeId}/toDo`, [
      "organizationId",
      "storeId",
      "type",
      "title",
      "dueAt",
      "status",
      "createdAt",
      "createdBy"
    ]),
    checkOptionalCollection(
      `organizations/${orgId}/regions/${regionId}/districts/${districtId}/stores/${storeId}/transfers`,
      [
        "organizationId",
        "storeId",
        "itemId",
        "itemName",
        "barcode",
        "quantity",
        "unit",
        "fromDepartmentId",
        "toDepartmentId",
        "createdByUid",
        "createdAt"
      ]
    ])
  ]

  const orderDoc = await firstDoc(
    `organizations/${orgId}/regions/${regionId}/districts/${districtId}/stores/${storeId}/orders`
  )
  if (orderDoc) {
    checks.push(
      checkCollection(
        `organizations/${orgId}/regions/${regionId}/districts/${districtId}/stores/${storeId}/orders/${orderDoc.id}/lines`,
        ["itemId", "suggestedQty", "unit", "rationale", "caseRounded"]
      )
    )
  }

  return Promise.all(checks)
}

async function main() {
  const results: Result[] = []

  const topChecks = await Promise.all([
    checkCollection("users", ["email", "displayName", "createdAt", "lastLoginAt", "platformRoles"]),
    checkCollection("organizations", ["name", "createdAt", "status", "planId", "subscription", "ownerUserIds"]),
    checkCollection("mediaAssets", [
      "organizationId",
      "ownerUserId",
      "type",
      "storagePath",
      "contentType",
      "originalName",
      "sizeBytes",
      "createdAt"
    ]),
    checkCollection("auditLogs", [
      "actorUserId",
      "organizationId",
      "targetPath",
      "action",
      "createdAt"
    ]),
    checkCollection("platformPreferenceProfiles", [
      "userId",
      "organizationId",
      "platform",
      "theme",
      "accentColor",
      "boldText",
      "createdAt",
      "updatedAt"
    ])
  ])
  results.push(...topChecks)

  const orgSnap = await firstDoc("organizations")
  if (!orgSnap) {
    console.error("No organizations found to validate nested schema")
    process.exit(1)
  }

  const orgId = orgSnap.id

  const orgLevelChecks = await Promise.all([
    checkCollection(`organizations/${orgId}/members`, ["organizationId", "userId", "role", "storeIds", "createdAt"]),
    checkCollection(`organizations/${orgId}/vendors`, ["name", "orderingDays", "cutoffTimeLocal", "leadDays"]),
    checkCollection(`organizations/${orgId}/items`, [
      "name",
      "unit",
      "defaultExpirationDays",
      "minQuantity",
      "qtyPerCase",
      "caseSize",
      "price",
      "tags",
      "archived",
      "createdAt",
      "updatedAt"
    ]),
    checkCollection(`organizations/${orgId}/productionProducts`, [
      "name",
      "yieldQuantity",
      "yieldUnit",
      "storeScoped",
      "createdAt",
      "updatedAt"
    ]),
    checkCollection(`organizations/${orgId}/howtos`, [
      "title",
      "description",
      "tags",
      "scope",
      "version",
      "updatedAt",
      "updatedBy",
      "createdAt",
      "createdBy"
    ]),
    checkCollection(`organizations/${orgId}/regions`, ["name"]),
    checkOptionalCollection(`organizations/${orgId}/storeAccessRequests`, [
      "organizationId",
      "requesterUid",
      "targetStoreId",
      "status",
      "createdAt"
    ]),
    checkOptionalCollection(`organizations/${orgId}/itemSubmissions`, [
      "organizationId",
      "storeId",
      "submittedByUid",
      "status",
      "itemDraft",
      "createdAt",
      "updatedAt"
    ]),
    checkOptionalCollection(`organizations/${orgId}/settings`, ["legacyInventoryFallbackDisabled"])
  ])
  results.push(...orgLevelChecks)

  const prodDoc = await firstDoc(`organizations/${orgId}/productionProducts`)
  if (prodDoc) {
    results.push(
      await checkCollection(`organizations/${orgId}/productionProducts/${prodDoc.id}/ingredients`, [
        "itemId",
        "quantity",
        "unit"
      ])
    )
  }

  const howtoDoc = await firstDoc(`organizations/${orgId}/howtos`)
  if (howtoDoc) {
    results.push(
      await checkCollection(`organizations/${orgId}/howtos/${howtoDoc.id}/steps`, [
        "stepNumber",
        "createdAt",
        "updatedAt"
      ])
    )
    const stepDoc = await firstDoc(`organizations/${orgId}/howtos/${howtoDoc.id}/steps`)
    if (stepDoc) {
      results.push(
        await checkCollection(`organizations/${orgId}/howtos/${howtoDoc.id}/steps/${stepDoc.id}/blocks`, [
          "type",
          "orderIndex"
        ])
      )
    }
  }

  const regionDoc = await firstDoc(`organizations/${orgId}/regions`)
  if (!regionDoc) {
    results.push({ label: `organizations/${orgId}/regions`, ok: false, details: "no region docs" })
  } else {
    const regionId = regionDoc.id
    results.push(await checkCollection(`organizations/${orgId}/regions/${regionId}/districts`, ["name"]))
    const districtDoc = await firstDoc(`organizations/${orgId}/regions/${regionId}/districts`)
    if (!districtDoc) {
      results.push({
        label: `organizations/${orgId}/regions/${regionId}/districts`,
        ok: false,
        details: "no district docs"
      })
    } else {
      const districtId = districtDoc.id
      results.push(
        await checkCollection(`organizations/${orgId}/regions/${regionId}/districts/${districtId}/stores`, [
          "name",
          "status",
          "districtId",
          "regionId",
          "lastSyncAt"
        ])
      )

      const storeDoc = await firstDoc(`organizations/${orgId}/regions/${regionId}/districts/${districtId}/stores`)
      if (!storeDoc) {
        results.push({
          label: `organizations/${orgId}/regions/${regionId}/districts/${districtId}/stores`,
          ok: false,
          details: "no store docs"
        })
      } else {
        results.push(...(await checkStoreSubcollections(orgId, regionId, districtId, storeDoc.id)))
      }
    }
  }

  let failed = 0
  for (const row of results) {
    console.log(`${row.ok ? "✅" : "❌"} ${row.label} :: ${row.details}`)
    if (!row.ok) failed += 1
  }

  if (failed > 0) {
    console.error(`Schema verification failed with ${failed} violation(s)`)
    process.exit(1)
  }

  console.log("Schema verification passed")
}

void main()
