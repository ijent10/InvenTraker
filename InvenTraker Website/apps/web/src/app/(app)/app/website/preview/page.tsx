"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"

import { PublicWebsiteRenderer } from "@/components/public-website-renderer"
import { useOrgContext } from "@/hooks/use-org-context"
import { fetchOrganizationWebsiteConfig } from "@/lib/data/firestore"
import { appButtonClass } from "@inventracker/ui"

export default function WebsiteDraftPreviewPage() {
  const { activeOrg, activeOrgId, effectivePermissions } = useOrgContext()
  const { data: site, isLoading } = useQuery({
    queryKey: ["organization-website-config", activeOrgId],
    queryFn: () => fetchOrganizationWebsiteConfig(activeOrgId, activeOrg?.organizationName ?? "Customer Website"),
    enabled: Boolean(activeOrgId && effectivePermissions.manageWebsite)
  })

  if (!effectivePermissions.manageWebsite) {
    return <div className="p-8 text-sm text-app-muted">You do not have access to preview this website.</div>
  }

  if (isLoading || !site) {
    return <div className="p-8 text-sm text-app-muted">Loading preview...</div>
  }

  return (
    <div>
      <div className="sticky top-0 z-40 border-b border-app-border bg-app-surface px-4 py-3">
        <Link href="/app/website" className={appButtonClass("secondary", "gap-2")}>
          <ArrowLeft className="h-4 w-4" />
          Back to Builder
        </Link>
      </div>
      <PublicWebsiteRenderer site={site} previewMode />
    </div>
  )
}
