import { handleDiscard } from "@/lib/engines/inventory/discard-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(request: Request) { return handleDiscard(request, "engine") }
