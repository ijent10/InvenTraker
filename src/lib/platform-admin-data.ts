import type { PlatformSubscription, StoreRecord } from "@/lib/demo-data"

export type PlatformOrganization = {
  id: string
  name: string
  owner: string
  ownerEmail: string
  plan: PlatformSubscription["plan"]
  status: PlatformSubscription["status"]
  stores: StoreRecord[]
  seats: number
}

export function slugifyAdminId(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96)
}

export function buildPlatformOrganizations(subscriptions: PlatformSubscription[], stores: StoreRecord[]): PlatformOrganization[] {
  return subscriptions.map((subscription, index) => ({
    id: slugifyAdminId(subscription.organization) || subscription.id,
    name: subscription.organization,
    owner: subscription.ownerEmail.split("@")[0] || "Owner",
    ownerEmail: subscription.ownerEmail,
    plan: subscription.plan,
    status: subscription.status,
    stores: index === 0 ? stores : stores.slice(0, 1),
    seats: subscription.seats
  }))
}
