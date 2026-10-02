"use client"

import { auth } from "@/lib/firebase"

type StockOperationResponse<T> = {
  data: T
  error?: { code: string; message: string }
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function postStockOperation<T>(endpoint: string, payload: Record<string, unknown>, orgId: string) {
  const user = auth?.currentUser
  if (!user) throw new Error("Sign in before changing inventory.")

  const token = await user.getIdToken()
  const key = `inventracker.pending-stock-operation.${user.uid}.${await digest(`${endpoint}:${JSON.stringify(payload)}`)}`
  const operationId = window.localStorage.getItem(key) || crypto.randomUUID()
  window.localStorage.setItem(key, operationId)

  const response = await fetch(`/api/mobile/v1/actions/${endpoint}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-inventracker-client": "web",
      "x-inventracker-org": orgId
    },
    body: JSON.stringify({ operationId, ...payload })
  })
  const body = await response.json().catch(() => null) as StockOperationResponse<T> | null
  if (!response.ok) throw new Error(body?.error?.message ?? "The inventory change could not be saved.")
  window.localStorage.removeItem(key)
  if (!body) throw new Error("The inventory service returned an unreadable response.")
  return body.data
}

export function saveWebSpotCheck({
  orgId,
  storeId,
  itemId,
  expectedRevision,
  frontStock,
  backStock,
  reason
}: {
  orgId: string
  storeId: string
  itemId: string
  expectedRevision: number
  frontStock: number
  backStock: number
  reason: string
}) {
  return postStockOperation("spot-check", {
    storeId,
    lines: [{ itemId, expectedRevision, frontStock, backStock, reason }]
  }, orgId)
}

export function saveWebParChange({
  orgId,
  storeId,
  itemId,
  expectedRevision,
  par,
  reorderPoint,
  reason
}: {
  orgId: string
  storeId: string
  itemId: string
  expectedRevision: number
  par: number
  reorderPoint: number
  reason: string
}) {
  return postStockOperation<{ revision: number }>("par-change", {
    storeId,
    itemId,
    expectedRevision,
    par,
    reorderPoint,
    reason
  }, orgId)
}
