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
