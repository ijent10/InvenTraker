import { NextResponse } from "next/server"

import { DEFAULT_ORG_ID, orgCollectionPath } from "@/lib/firestore-schema"
import { adminDb } from "@/lib/firebase-admin"
import { parseInventoryImportFile, type ImportExpirationBehavior } from "@/lib/import-parser"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const supportedExtensions = new Set([
  "csv",
  "tsv",
  "txt",
  "xlsx",
  "xls",
  "pdf",
  "docx",
  "doc",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
  "tif",
  "tiff"
])

const maxImportBytes = 25 * 1024 * 1024

function extensionFor(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? ""
}

function isExpirationBehavior(value: string): value is ImportExpirationBehavior {
  return value === "None" || value === "Some items" || value === "All items"
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

async function persistImport({
  result,
  orgId,
  defaultUnit,
  expirationBehavior
}: {
  result: Awaited<ReturnType<typeof parseInventoryImportFile>>
  orgId: string
  defaultUnit: string
  expirationBehavior: ImportExpirationBehavior
}) {
  const db = await adminDb()
  if (!db) {
    return {
      attempted: true,
      persisted: false,
      message: "Parsed successfully, but Firebase Admin is not configured locally, so this stayed as a review preview."
    }
  }

  const { FieldValue } = await import("firebase-admin/firestore")
  const recordId = `inventory-import-${Date.now()}-${slugify(result.fileName) || "file"}`
  await db
    .collection(orgCollectionPath(orgId, "formSaves"))
    .doc(recordId)
    .set(
      {
        type: "inventoryImport",
        status: "Parsed for review",
        sourceFile: {
          fileName: result.fileName,
          fileType: result.fileType,
          parser: result.source.parser,
          sourceKind: result.source.kind
        },
        options: {
          defaultUnit,
          expirationBehavior
        },
        result: jsonSafe(result),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        source: "web-import"
      },
      { merge: true }
    )

  return {
    attempted: true,
    persisted: true,
    id: recordId,
    message: "Import parsed and saved as a review draft."
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const sourceFile = formData.get("sourceFile")

    if (!(sourceFile instanceof File)) {
      return NextResponse.json({ error: "Choose a file before importing." }, { status: 400 })
    }

    if (sourceFile.size === 0) {
      return NextResponse.json({ error: "The selected file is empty." }, { status: 400 })
    }

    if (sourceFile.size > maxImportBytes) {
      return NextResponse.json({ error: "The selected file is larger than the 25 MB import limit." }, { status: 400 })
    }

    const extension = extensionFor(sourceFile.name)
    if (!supportedExtensions.has(extension)) {
      return NextResponse.json(
        {
          error:
            "That file type is not supported yet. Use CSV, Excel, PDF, Word, TXT, or a common image file for now."
        },
        { status: 400 }
      )
    }

    const rawExpirationBehavior = String(formData.get("expirationBehavior") ?? "None")
    const expirationBehavior = isExpirationBehavior(rawExpirationBehavior) ? rawExpirationBehavior : "None"
    const defaultUnit = String(formData.get("defaultUnit") ?? "eaches").trim() || "eaches"
    const orgId = String(formData.get("orgId") ?? DEFAULT_ORG_ID).trim() || DEFAULT_ORG_ID
    const shouldPersist = String(formData.get("persist") ?? "true") !== "false"

    const result = await parseInventoryImportFile(sourceFile, { defaultUnit, expirationBehavior })
    const persistence = shouldPersist
      ? await persistImport({ result, orgId, defaultUnit, expirationBehavior })
      : { attempted: false, persisted: false, message: "Import parsed as a local preview only." }

    return NextResponse.json({
      ...result,
      persistence,
      message: "Import parsed and staged for review."
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Import failed."
      },
      { status: 500 }
    )
  }
}
