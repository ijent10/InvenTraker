import { ArrowLeft } from "lucide-react"

import { DashboardCustomizer } from "@/components/dashboard-customizer"
import { PageHeader } from "@/components/page-header"
import { ButtonLink } from "@/components/ui"

export default function AccountDashboardCustomizationPage() {
  return (
    <>
      <PageHeader
        title="Dashboard customization"
        description="Choose exactly which tiles and widgets appear on your home dashboard."
        actions={
          <ButtonLink href="/account" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to account
          </ButtonLink>
        }
      />

      <DashboardCustomizer />
    </>
  )
}
