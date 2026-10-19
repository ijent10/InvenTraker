import { PageHeader } from "@/components/page-header"
import { OperationSessions } from "@/components/operation-sessions"
export default function ReceivingPage() {
  return <><PageHeader title="Receiving" description="Record deliveries and approve received quantities before they enter inventory." /><OperationSessions kind="receiving" /></>
}
