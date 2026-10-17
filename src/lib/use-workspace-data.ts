"use client"

import { useEffect, useState } from "react"
import { auth } from "@/lib/firebase"
import type { WorkspaceData } from "./workspace-providers"

export function useWorkspaceData(orgId: string, uid: string | undefined, ready: boolean, widgetIds: string) {
  const [storeId, setStoreId] = useState("")
  const [attempt, setAttempt] = useState(0)
  const [snapshot, setSnapshot] = useState<{ key: string; data: WorkspaceData; receivedAt: number } | null>(null)
  const [failure, setFailure] = useState("")
  useEffect(() => { setStoreId("") }, [orgId, uid])
  const key = `${uid}:${orgId}:${storeId}:${widgetIds}`
  useEffect(() => {
    if (!uid || !ready) return
    let controller: AbortController | null = null
    let probeController: AbortController | null = null
    let observedStoreId = storeId
    let stockRevision: number | null = null
    let probeBusy = false
    let disposed = false
    let busy = false
    setFailure("")
    async function refresh() {
      if (document.visibilityState === "hidden" || busy) return
      busy = true
      controller = new AbortController()
      const timeout = setTimeout(() => controller?.abort(), 20_000)
      try {
        const user = auth?.currentUser
        if (!user || user.uid !== uid) throw new Error("Sign in to load store summaries.")
        const response = await fetch(`/api/v1/workspace/widgets?widgets=${encodeURIComponent(widgetIds)}${storeId ? `&storeId=${encodeURIComponent(storeId)}` : ""}`, {
          headers: { Authorization: `Bearer ${await user.getIdToken()}`, "x-inventracker-org": orgId }, cache: "no-store", signal: controller.signal
        })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error?.message || "Store summaries could not load.")
        if (!disposed) { observedStoreId = body.storeId; stockRevision = typeof body.stockRevision === "number" ? body.stockRevision : null; setSnapshot({ key, data: body as WorkspaceData, receivedAt: Date.now() }); setFailure("") }
      } catch (error) {
        if (!disposed) setFailure(controller?.signal.aborted ? "Store summaries took too long. Try refreshing." : error instanceof Error ? error.message : "Store summaries could not load.")
      } finally { clearTimeout(timeout); busy = false }
    }
    async function probeChanges() {
      if (disposed || busy || probeBusy || !observedStoreId || stockRevision === null || document.visibilityState === "hidden") return
      const checkedStore = observedStoreId
      probeBusy = true
      probeController = new AbortController()
      const timeout = setTimeout(() => probeController?.abort(), 10_000)
      try {
        const user = auth?.currentUser
        if (!user || user.uid !== uid) return
        const response = await fetch(`/api/v1/workspace/invalidation?storeId=${encodeURIComponent(checkedStore)}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}`, "x-inventracker-org": orgId }, cache: "no-store", signal: probeController.signal })
        if (!response.ok) { if (!disposed) void refresh(); return }
        const data = await response.json()
        if (!disposed && checkedStore === observedStoreId && data.storeId === checkedStore && typeof data.stockRevision === "number" && data.stockRevision !== stockRevision) void refresh()
      } catch { /* The full-summary polling fallback remains independent of event delivery. */ }
      finally { clearTimeout(timeout); probeBusy = false }
    }
    void refresh()
    const probeInterval = setInterval(() => void probeChanges(), 15_000)
    const interval = setInterval(() => void refresh(), 60_000)
    const resume = () => void refresh()
    window.addEventListener("online", resume)
    document.addEventListener("visibilitychange", resume)
    return () => { disposed = true; controller?.abort(); probeController?.abort(); clearInterval(probeInterval); clearInterval(interval); window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume) }
  }, [orgId, uid, ready, storeId, key, attempt, widgetIds])
  const current = ready && snapshot?.key === key ? snapshot : null
  return { data: current?.data ?? null, error: failure, stale: Boolean(current && (failure || Date.now() - current.receivedAt > 120_000)), setStoreId, refresh: () => setAttempt((value) => value + 1) }
}
