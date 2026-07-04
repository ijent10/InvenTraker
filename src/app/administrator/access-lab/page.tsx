import { ArrowLeft } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { PermissionLab } from "@/components/permission-lab"
import { ButtonLink } from "@/components/ui"

export default function AccessLabPage() {
  return (
    <>
      <PageHeader
        title="Permission lab"
        description="Sign in as different Firebase users and verify exactly which tabs, pages, and permission groups are available."
        actions={
          <ButtonLink href="/administrator" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to administrator
          </ButtonLink>
        }
      />

      <PermissionLab />
    </>
  )
}
