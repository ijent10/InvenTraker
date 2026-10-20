import { z } from "zod"

import { MobileApiError, mobileError } from "@/lib/mobile-api"
import { runOpenFoodFactsImport } from "@/lib/open-food-facts-import"
import { requirePlatformPrincipal } from "@/lib/platform/principal"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const bodySchema = z.object({
  mode: z.enum(["probe", "validation"]),
  maxAccepted: z.number().int().min(1).max(100).optional(),
  maxScanned: z.number().int().min(1).max(100_000).optional(),
  runId: z.string().trim().min(1).max(160).optional(),
  resumeAfter: z.number().int().min(0).optional()
})

function runSummary(document: FirebaseFirestore.DocumentSnapshot) {
  const data = document.data() ?? {}
  return {
    runId: document.id, mode: data.mode, status: data.status, scanned: data.scanned ?? 0, staged: data.staged ?? 0,
    rejected: data.rejected ?? 0, skipped: data.skipped ?? 0, checkpointPosition: data.checkpointPosition ?? 0,
    importedAt: data.importedAt, updatedAt: data.updatedAt, completedAt: data.completedAt, failedAt: data.failedAt, error: data.error
  }
}

export async function GET(request: Request) {
  try {
    const { db } = await requirePlatformPrincipal(request)
    const runId = new URL(request.url).searchParams.get("runId")?.trim()
    if (runId) {
      const snapshot = await db.collection("openFoodFactsImportRuns").doc(runId).get()
      if (!snapshot.exists) throw new MobileApiError("Import run was not found.", 404, "import_run_not_found")
      return Response.json({ data: runSummary(snapshot) })
    }
    const snapshot = await db.collection("openFoodFactsImportRuns").orderBy("importedAt", "desc").limit(20).get()
    return Response.json({ data: snapshot.docs.map(runSummary) })
  } catch (error) {
    return mobileError(error)
  }
}

export async function POST(request: Request) {
  try {
    const { db } = await requirePlatformPrincipal(request)
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new MobileApiError("Choose probe or validation and use safe validation limits.", 400, "invalid_import_request")
    return Response.json({ data: await runOpenFoodFactsImport(db, parsed.data) })
  } catch (error) {
    return mobileError(error)
  }
}
