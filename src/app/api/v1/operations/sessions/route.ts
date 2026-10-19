import { getSessions, mutateSession } from "@/lib/engines/operations/sessions-http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const GET = getSessions
export const POST = mutateSession
