import { NextResponse } from "next/server"

import {
  documentIdFor,
  embeddingForChunk,
  normalizeDocumentType,
  normalizeVisibilityScope,
  parseBusinessDocument
} from "@/lib/document-ingestion"
import { adminDb } from "@/lib/firebase-admin"
import { DEFAULT_ORG_ID, firestoreCollections } from "@/lib/firestore-schema"

function stringValue(value: FormDataEntryValue | null, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a PDF, DOCX, TXT, Markdown, CSV, or JSON file." }, { status: 400 })
    }

    const title = stringValue(formData.get("title"), file.name.replace(/\.[^.]+$/, ""))
    const documentType = normalizeDocumentType(formData.get("documentType"))
    const categoryId = stringValue(formData.get("categoryId"), "cat-policies")
    const department = stringValue(formData.get("department"), "Store Operations")
    const visibilityScope = normalizeVisibilityScope(formData.get("visibilityScope"))
    const visibilityLabels = stringValue(formData.get("visibilityLabels"), "All employees")
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean)
    const effectiveDate = stringValue(formData.get("effectiveDate"))
    const expirationDate = stringValue(formData.get("expirationDate"))
    const parsed = await parseBusinessDocument(file)
    const documentId = documentIdFor(title, file.name)
    const now = new Date().toISOString()
    const metadata = {
      id: documentId,
      documentId,
      title,
      fileName: file.name,
      fileType: parsed.fileType,
      documentType,
      categoryId,
      department,
      organizationId: DEFAULT_ORG_ID,
      version: "draft",
      uploadedBy: "Current user",
      uploadedAt: now,
      approvedStatus: "draft",
      effectiveDate: effectiveDate || undefined,
      expirationDate: expirationDate || undefined,
      sourceType: "uploaded",
      visibility: {
        scope: visibilityScope,
        labels: visibilityLabels.length ? visibilityLabels : ["All employees"]
      },
      storagePath: `orgs/${DEFAULT_ORG_ID}/companyFiles/${documentId}/${file.name}`,
      viewerUrl: `/files?document=${documentId}`,
      openedCount: 0,
      favoritedBy: [],
      tags: [documentType, department, parsed.fileType],
      summary: parsed.text.slice(0, 220) || "Uploaded document awaiting parser review.",
      parsingStatus: parsed.chunks.length ? "embedded" : "failed",
      parser: parsed.parser,
      updatedAt: now
    }

    const chunks = parsed.chunks.map((chunk, index) => ({
      id: `${documentId}-chunk-${index + 1}`,
      chunkId: `${documentId}-chunk-${index + 1}`,
      documentId,
      title,
      sectionTitle: chunk.sectionTitle,
      headingPath: chunk.headingPath,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      text: chunk.text,
      tableData: chunk.tableData,
      embedding: embeddingForChunk(chunk.text),
      embeddingModel: "local-hash-128",
      approvedStatus: "draft",
      createdAt: now,
      updatedAt: now
    }))

    const db = await adminDb()
    if (!db) {
      return NextResponse.json({
        message: "Parsed file in preview mode. Configure Firebase Admin to persist documents.",
        persisted: false,
        file: metadata,
        chunksCreated: chunks.length
      })
    }

    const { FieldValue } = await import("firebase-admin/firestore")
    const batch = db.batch()
    const orgRef = db.collection(firestoreCollections.orgs).doc(DEFAULT_ORG_ID)
    batch.set(orgRef.collection(firestoreCollections.companyFiles).doc(documentId), {
      ...metadata,
      uploadedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    })
    chunks.forEach((chunk) => {
      batch.set(orgRef.collection(firestoreCollections.documentChunks).doc(chunk.chunkId), {
        ...chunk,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      })
    })
    await batch.commit()

    return NextResponse.json({
      message: `Uploaded ${title} as a draft with ${chunks.length} searchable chunk${chunks.length === 1 ? "" : "s"}.`,
      persisted: true,
      documentId,
      chunksCreated: chunks.length
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "File ingestion failed." }, { status: 500 })
  }
}
