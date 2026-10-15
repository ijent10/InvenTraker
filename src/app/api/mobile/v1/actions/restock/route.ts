import { handleRestock } from "@/lib/engines/inventory/restock-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(request: Request) { return handleRestock(request, "mobile") }
