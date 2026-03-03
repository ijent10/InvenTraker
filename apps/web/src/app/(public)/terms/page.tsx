"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { AppCard, appButtonClass } from "@inventracker/ui"

import { fetchPublicSiteContent } from "@/lib/data/firestore"

export default function TermsPage() {
  const { data } = useQuery({
    queryKey: ["public-site-content", "terms"],
    queryFn: fetchPublicSiteContent,
    staleTime: 60_000
  })

  return (
    <div className="public-landing min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <Link
          href="/"
          className={appButtonClass("secondary", "mb-6 !h-9 !w-auto !px-3 !py-2")}
          style={{ borderColor: "#2563EB", color: "#2563EB" }}
        >
          ← Back
        </Link>
        <h1 className="text-4xl font-bold tracking-tight">Terms of Service</h1>
        <AppCard className="mt-6 bg-white !shadow-[0_10px_30px_rgba(2,6,23,0.08)]">
          <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
            {data?.termsContent || "Terms content is being updated by the admin team."}
          </div>
        </AppCard>
      </div>
    </div>
  )
}
