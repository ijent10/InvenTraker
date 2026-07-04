import { ArrowLeft, SlidersHorizontal } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { ThemeControls } from "@/components/theme-controls"
import { ButtonLink, Panel } from "@/components/ui"
import { getOrganizationBranding } from "@/lib/server-data"

export default async function ThemeBuilderPage() {
  const organizationBranding = await getOrganizationBranding()

  return (
    <>
      <PageHeader
        title="Theme builder"
        description="Build, preview, save, and name your personal workspace colors."
        actions={
          <ButtonLink href="/account/theme" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to theme
          </ButtonLink>
        }
      />

      <Panel className="p-4">
        <div className="mb-4">
          <h2 className="flex items-center gap-2 font-semibold text-[var(--app-text)]">
            <SlidersHorizontal className="h-5 w-5 text-[var(--app-accent)]" />
            Custom theme controls
          </h2>
          <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">Pick the colors you want, preview the palette, and save it across devices when signed in.</p>
        </div>

        <ThemeControls
          defaultAccent={organizationBranding.accentColor}
          defaultSecondary={organizationBranding.secondaryColor}
          defaultMode={organizationBranding.defaultMode}
        />
      </Panel>
    </>
  )
}
