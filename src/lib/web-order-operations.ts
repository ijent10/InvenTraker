"use client"

import { auth } from "@/lib/firebase"
import type { OrderRecommendationRun } from "@/lib/ordering-engine"

type Envelope<T> = { data: T; error?: { code: string; message: string } }

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function request<T>(path: string, method: "POST" | "PUT", payload: Record<string, unknown>, orgId: string, retrySafe = false) {
  const user = auth?.currentUser
  if (!user) throw new Error("Sign in before changing orders.")
  const token = await user.getIdToken()
  let operationKey = ""
  let body = payload
  if (retrySafe) {
    operationKey = `inventracker.pending-order-operation.${user.uid}.${await digest(`${path}:${JSON.stringify(payload)}`)}`
    const operationId = window.localStorage.getItem(operationKey) || crypto.randomUUID()
    window.localStorage.setItem(operationKey, operationId)
    body = { operationId, ...payload }
  }
  const response = await fetch(path, {
    method,
    headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-inventracker-client": "web", "x-inventracker-org": orgId },
    body: JSON.stringify(body)
  })
  const result = await response.json().catch(() => null) as Envelope<T> | null
  if (!response.ok) throw new Error(result?.error?.message ?? "The order service could not complete this request.")
  if (operationKey) window.localStorage.removeItem(operationKey)
  if (!result) throw new Error("The order service returned an unreadable response.")
  return result.data
}

export function recommendWebOrder(orgId: string, storeId: string, vendorId: string) {
  return request<OrderRecommendationRun & { vendor: { id: string; name: string; expectedArrival: string; orderDueAt: string | null } }>(
    "/api/mobile/v1/orders/recommend", "POST", { storeId, vendorId }, orgId
  )
}

export function saveWebOrder(orgId: string, orderId: string, payload: Record<string, unknown>) {
  return request<{ order: Record<string, unknown> }>(`/api/mobile/v1/orders/${encodeURIComponent(orderId)}`, "PUT", payload, orgId, true)
}

export function transitionWebOrder(orgId: string, orderId: string, payload: Record<string, unknown>) {
  return request<{ orderId: string; previousStatus: string; status: string }>(`/api/mobile/v1/orders/${encodeURIComponent(orderId)}/transition`, "POST", payload, orgId, true)
}
