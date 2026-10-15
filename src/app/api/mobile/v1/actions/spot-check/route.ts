import { handleSpotCheck } from "@/lib/engines/inventory/spot-check-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(request: Request) { return handleSpotCheck(request, "mobile") }
