import { handlePortion } from "@/lib/engines/inventory/portion-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(request: Request) { return handlePortion(request, "engine") }
