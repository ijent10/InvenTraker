import Link from "next/link"
import { Plus } from "lucide-react"

import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { ButtonLink, Panel, StatusPill } from "@/components/ui"
import { getHealthChecks } from "@/lib/server-data"

function HealthCheckStatus({ status }: { status: "Current" | "Due today" | "Overdue" }) {
  if (status !== "Due today") {
    return <StatusPill tone={status === "Current" ? "green" : "red"}>{status}</StatusPill>
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-300">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        <path
          d="M17.5 4.5C13 4.5 9 6.4 9 9.1c0 3 6.1 2.7 6.1 5.8 0 2.8-4.4 4.6-8.6 4.6"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {status}
    </span>
  )
}

export default async function HealthChecksPage() {
  const healthChecks = await getHealthChecks()

  return (
    <>
      <PageHeader
        title="Health checks"
        description="Checklist templates, completion schedules, last completed details, and response history by employee."
        actions={
          <ButtonLink href="/health-checks/drafts" icon={<Plus className="h-4 w-4" />}>
            New check
          </ButtonLink>
        }
      />

      <Panel>
        <DataTable
          columns={["Check", "Store", "Schedule", "Last completed", "Completed by", "Status", "Responses"]}
          rows={healthChecks.map((check) => [
            <Link key={`${check.id}-name`} href={`/health-checks/${check.id}`} className="font-semibold text-[var(--app-text)] hover:text-[var(--app-accent)]">
              {check.name}
            </Link>,
            check.store,
            check.schedule,
            check.lastCompleted,
            check.completedBy,
            <HealthCheckStatus key={`${check.id}-status`} status={check.status} />,
            `${check.responses} saved`
          ])}
        />
      </Panel>
    </>
  )
}
