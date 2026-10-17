import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { MobileApiError } from "@/lib/mobile-api"
/** Current trusted records, rather than email or stale browser/role claims, authorize platform support queries. */
export async function requirePlatformPrincipal(request: Request) {
  const token = /^Bearer (.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]
  if (!token) throw new MobileApiError("Sign in is required.", 401, "unauthenticated")
  const [auth, db] = await Promise.all([adminAuth(), adminDb()])
  if (!auth || !db) throw new MobileApiError("Administration is unavailable.", 503, "service_unavailable")
  const identity = await auth.verifyIdToken(token, true).catch(() => null)
  if (!identity) throw new MobileApiError("Sign in again.", 401, "invalid_session")
  const admin = await db.collection("platformAdmins").doc(identity.uid).get()
  if (!admin.exists || String(admin.data()?.status ?? "active").toLowerCase() !== "active") throw new MobileApiError("Active platform administrator access is required.", 403, "platform_admin_required")
  return { uid: identity.uid, db }
}
