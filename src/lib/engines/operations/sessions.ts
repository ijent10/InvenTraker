import { z } from "zod"
import { EngineError, engineDocumentIdSchema } from "../contracts.ts"
import { spotCheckPayloadSchema } from "../inventory/spot-check.ts"
import { receivingPayloadSchema } from "../inventory/receiving.ts"

const details = {
  title: z.string().trim().min(1).max(100),
  assignedTo: engineDocumentIdSchema,
  note: z.string().trim().max(1000).default(""),
  supplierReference: z.string().trim().max(120).default(""),
}
export const sessionContentSchema = z.discriminatedUnion("kind", [
  z.object({ ...details, kind: z.literal("count"), payload: spotCheckPayloadSchema.refine(value => value.lines.length <= 40, "Use at most 40 items per task.") }).strict(),
  z.object({ ...details, kind: z.literal("receiving"), payload: receivingPayloadSchema.refine(value => value.lines.length <= 40, "Use at most 40 items per task.") }).strict(),
])
export const sessionMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), id: z.string().uuid(), storeId: engineDocumentIdSchema, content: sessionContentSchema }).strict(),
  z.object({ action: z.literal("save"), id: z.string().uuid(), expectedRevision: z.number().int().nonnegative(), content: sessionContentSchema }).strict(),
  ...(["submit", "return", "cancel", "post"] as const).map(action => z.object({ action: z.literal(action), id: z.string().uuid(), expectedRevision: z.number().int().nonnegative(), reviewNote: z.string().trim().max(1000).default("") }).strict()),
])
export type SessionContent = z.infer<typeof sessionContentSchema>
export type SessionMutation = z.infer<typeof sessionMutationSchema>
export type OperationSession = SessionContent & {
  id: string; organizationId: string; storeId: string; createdBy: string
  status: "draft" | "submitted" | "posted" | "cancelled"; revision: number
  createdAt: string; updatedAt: string; reviewNote: string
  items: { id: string; name: string; unit: string; frontStock: number; backStock: number; revision: number }[]
  postedBy?: string; postedAt?: string; result?: unknown
}
export function mayReadSession(session: OperationSession, uid: string, manager: boolean) {
  return manager || session.createdBy === uid || session.assignedTo === uid
}
export function transitionSession(session: OperationSession, action: "save" | "submit" | "return" | "cancel" | "post", expectedRevision: number, uid: string, manager: boolean, reviewNote = "") {
  if (!mayReadSession(session, uid, manager)) throw new EngineError("This task is assigned to another employee.", 403, "session_access_denied")
  if (session.revision !== expectedRevision) throw new EngineError("This task changed. Reload the saved version before continuing.", 409, "session_conflict")
  if (action === "post" || action === "return") {
    if (!manager) throw new EngineError("A manager must review this task.", 403, "review_required")
    if (session.status !== "submitted") throw new EngineError("Submit this task for review first.", 409, "invalid_session_state")
    if (action === "return" && !reviewNote) throw new EngineError("Explain what needs to be corrected.", 400, "review_note_required")
  } else if (session.status !== "draft" && !(action === "cancel" && manager && session.status === "submitted")) {
    throw new EngineError("This task can no longer be edited. A manager can return a submitted task for correction.", 409, "invalid_session_state")
  }
  return action === "submit" ? "submitted" : action === "post" ? "posted" : action === "cancel" ? "cancelled" : "draft"
}
