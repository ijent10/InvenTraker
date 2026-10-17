"use client"
import Link from "next/link"
import type { PlatformSubscription } from "@/lib/demo-data"
export function StripeSubscriptionActions({ subscription }: { subscription: PlatformSubscription }) {
  return <Link className="text-sm font-semibold text-sky-300 hover:underline" href={`/account/billing?org=${encodeURIComponent(subscription.id)}`}>Review pricing and manage billing</Link>
}
