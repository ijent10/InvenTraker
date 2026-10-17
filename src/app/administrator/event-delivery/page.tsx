import { EventDeliveryMonitor } from "@/components/event-delivery-monitor"
import { PageHeader } from "@/components/page-header"
export default function EventDeliveryPage() {
  return <><PageHeader title="Event delivery" description="Review workspace update delivery, queued work, and retained failures." /><EventDeliveryMonitor /></>
}
