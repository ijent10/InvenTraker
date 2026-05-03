import { AppShell } from "@/components/app-shell"
import { OrgContextProvider } from "@/hooks/use-org-context"

export default function SignedInLayout({ children }: { children: React.ReactNode }) {
  return (
    <OrgContextProvider>
      <AppShell>{children}</AppShell>
    </OrgContextProvider>
  )
}
