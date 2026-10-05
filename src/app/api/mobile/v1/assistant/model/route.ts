import { mobileEnvelope, mobileError, requireMobilePrincipal } from "@/lib/mobile-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    await requireMobilePrincipal(request)
    const bucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    if (!bucket) throw new Error("The assistant model store is not configured.")
    return Response.json(mobileEnvelope({
      id: "inventracker-qwen3-0.6b-q5km-v1",
      name: "InvenTracker on-device assistant",
      downloadURL: `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/models%2Finventracker-qwen3-0.6b-q5km%2FQwen3-0.6B.Q5_K_M.gguf?alt=media`,
      sha256: "7888de3385a567fcc971a6bbecbdd77862b8a4a6bf911a13560420ea577fe8fe",
      bytes: 444416064
    }))
  } catch (error) { return mobileError(error) }
}
