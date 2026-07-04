import { ArrowLeft } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { TipsPreferenceControl } from "@/components/tips-preference-control"
import { ButtonLink } from "@/components/ui"

export default function AccountTipsPage() {
  return (
    <>
      <PageHeader
        title="Tips and summaries"
        description="Control whether helper descriptions, page summaries, and explanatory notes appear throughout your workspace."
        actions={
          <ButtonLink href="/account" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to account
          </ButtonLink>
        }
      />

      <TipsPreferenceControl />
    </>
  )
}
