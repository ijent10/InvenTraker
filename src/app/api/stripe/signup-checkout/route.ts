import { POST as checkout } from "../checkout/route"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function POST(request: Request) { return checkout(request) }
