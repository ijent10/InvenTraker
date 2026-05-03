"use client"

import { useQuery } from "@tanstack/react-query"

import { PublicWebsiteRenderer } from "@/components/public-website-renderer"
import { fetchPublicWebsiteBySlug } from "@/lib/data/firestore"

export default function PublicWebsitePage({ params }: { params: { siteSlug: string } }) {
  const { data: site, isLoading } = useQuery({
    queryKey: ["public-website", params.siteSlug],
    queryFn: () => fetchPublicWebsiteBySlug(params.siteSlug),
    staleTime: 60_000
  })

  if (isLoading) {
    return <div className="min-h-screen bg-slate-50 p-8 text-slate-600">Loading...</div>
  }

  if (!site) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-900">
        <div className="max-w-md text-center">
          <p className="text-3xl font-semibold">Site unavailable</p>
          <p className="mt-3 text-slate-600">This customer website has not been published yet.</p>
        </div>
      </main>
    )
  }

  return <PublicWebsiteRenderer site={site} />
}
