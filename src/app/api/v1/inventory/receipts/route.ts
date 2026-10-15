import { handleReceiving } from "@/lib/engines/inventory/receiving-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(request: Request) { return handleReceiving(request, "engine") }
