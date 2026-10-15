import { handleStockTransfer } from "@/lib/engines/inventory/transfer-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(request: Request) { return handleStockTransfer(request, "engine") }
