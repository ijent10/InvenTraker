import { z } from "zod"

import { MobileApiError, mobileError } from "@/lib/mobile-api"
import { promoteOpenFoodFactsStaging } from "@/lib/open-food-facts-import"
import { requirePlatformPrincipal } from "@/lib/platform/principal"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({ stagingId: z.string().trim().min(1).max(128) })

export async function POST(request: Request) {
  try {
    const principal = await requirePlatformPrincipal(request)
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw new MobileApiError("A valid staging ID is required.", 400, "invalid_staging_id")
    return Response.json({ data: await promoteOpenFoodFactsStaging(principal.db, parsed.data.stagingId, principal.uid) })
  } catch (error) {
    return mobileError(error)
  }
}
