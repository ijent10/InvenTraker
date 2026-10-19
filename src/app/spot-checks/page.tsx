import { PageHeader } from "@/components/page-header"
import { OperationSessions } from "@/components/operation-sessions"
export default function SpotChecksPage() {
  return <><PageHeader title="Spot checks" description="Count store stock, save your progress, and review adjustments before posting." /><OperationSessions kind="count" /></>
}
