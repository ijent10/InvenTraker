import { handleThresholdChange } from "@/lib/engines/inventory/threshold-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(request: Request) { return handleThresholdChange(request, "mobile") }
