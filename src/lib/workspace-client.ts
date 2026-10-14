import { auth } from "@/lib/firebase"
import { dashboardLayoutSchema, type DashboardLayout, type DeviceClass } from "./workspace-contracts"

export async function workspaceRequest(orgId: string, device: DeviceClass, update?: { layout: DashboardLayout; expectedRevision: number }) {
  const user = auth?.currentUser
  if (!user) throw new Error("Sign in to save your home screen.")
  const response = await fetch(`/api/v1/workspace/layout?device=${device}`, {
    method: update ? "PUT" : "GET",
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, "x-inventracker-org": orgId, "Content-Type": "application/json" },
    ...(update ? { body: JSON.stringify(update) } : {}), cache: "no-store"
  })
  const data = await response.json()
  if (response.status === 409) return { conflict: dashboardLayoutSchema.parse(data.current), layout: null }
  if (!response.ok) throw new Error(data.message ?? data.error?.message ?? "Your layout could not be saved. Try again.")
  return { conflict: null, layout: data.layout ? dashboardLayoutSchema.parse(data.layout) : null }
}
