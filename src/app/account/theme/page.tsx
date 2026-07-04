import { ArrowLeft, Palette, SlidersHorizontal } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { ThemePresetGrid } from "@/components/theme-preset-grid"
import { ButtonLink, Panel, StatusPill } from "@/components/ui"
import { personalThemePresets } from "@/lib/demo-data"
import { getOrganizationBranding } from "@/lib/server-data"

export default async function ThemePage() {
  const organizationBranding = await getOrganizationBranding()

  return (
    <>
      <PageHeader
        title="Theme"
        description="Choose a named theme, then open the builder if you want to create and save your own."
        actions={
          <>
            <ButtonLink href="/account" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
              Back to account
            </ButtonLink>
            <ButtonLink href="/account/theme-builder" icon={<SlidersHorizontal className="h-4 w-4" />}>
              Theme builder
            </ButtonLink>
          </>
        }
      />

      <Panel className="p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-[var(--app-text)]">
              <Palette className="h-5 w-5 text-[var(--app-accent)]" />
              Named themes
            </h2>
            <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">Theme presets can be light or dark. Builder-created themes use light/base colors and generate dark automatically.</p>
          </div>
          <StatusPill tone="blue">Personal</StatusPill>
        </div>

        <ThemePresetGrid presets={personalThemePresets} defaultThemeName={organizationBranding.defaultTheme} />
      </Panel>
    </>
  )
}
