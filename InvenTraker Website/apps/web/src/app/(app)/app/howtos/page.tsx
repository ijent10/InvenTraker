"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { AppCard, SearchInput, appButtonClass } from "@inventracker/ui"
import { useQuery } from "@tanstack/react-query"

import { PageHead } from "@/components/page-head"
import { useOrgContext } from "@/hooks/use-org-context"
import { fetchHowToGuides } from "@/lib/data/firestore"

export default function HowToLibraryPage() {
  const { activeOrgId, activeStoreId } = useOrgContext()
  const [search, setSearch] = useState("")

  const { data: guides = [] } = useQuery({
    queryKey: ["howtos", activeOrgId, activeStoreId],
    queryFn: () => fetchHowToGuides(activeOrgId, activeStoreId),
    enabled: Boolean(activeOrgId)
  })

  const filtered = useMemo(
    () => guides.filter((guide) => guide.title.toLowerCase().includes(search.toLowerCase())),
    [guides, search]
  )

  return (
    <div>
      <PageHead
        title="How-To Library"
        subtitle="Searchable guides with versioning and step blocks."
        actions={<Link className={appButtonClass("primary")} href="/app/howtos/new">Create guide</Link>}
      />
      <AppCard>
        <SearchInput value={search} onChange={setSearch} placeholder="Search guides" />
        <ul className="mt-4 space-y-3">
          {filtered.map((guide) => (
            <li key={guide.id} className="rounded-2xl border border-app-border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{guide.title}</p>
                  <p className="secondary-text">v{guide.version} · {guide.scope === "org" ? "Org" : `Store ${guide.storeId}`}</p>
                </div>
                <Link className={appButtonClass("secondary")} href={`/app/howtos/${guide.id}`}>
                  Edit
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </AppCard>
    </div>
  )
}
