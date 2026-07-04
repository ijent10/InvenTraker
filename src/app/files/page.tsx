import { Upload } from "lucide-react"

import { CompanyFilesManager } from "@/components/company-files-manager"
import { PageHeader } from "@/components/page-header"
import { StatusPill } from "@/components/ui"
import { can } from "@/lib/permissions"
import { getCompanyFileCategories, getCompanyFileChunks, getCompanyFiles } from "@/lib/server-data"

export default async function FilesPage({
  searchParams
}: {
  searchParams?: {
    document?: string
  }
}) {
  const [files, categories, chunks] = await Promise.all([getCompanyFiles(), getCompanyFileCategories(), getCompanyFileChunks()])
  const canUpload = can("files.upload") || can("files.manage") || can("organization.manage")

  return (
    <>
      <PageHeader
        title="Files"
        description="Approved company files, policies, SOPs, vendor sheets, guides, and document sources for the assistant."
        actions={
          canUpload ? (
            <StatusPill tone="green">
              <Upload className="mr-1 inline h-3.5 w-3.5" />
              Upload enabled
            </StatusPill>
          ) : (
            <StatusPill>View only</StatusPill>
          )
        }
      />

      <CompanyFilesManager files={files} categories={categories} chunks={chunks} activeDocumentId={searchParams?.document} canUpload={canUpload} />
    </>
  )
}
