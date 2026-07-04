import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { ButtonLink, Panel } from "@/components/ui"
import { historyTiles, type HistoryActionType } from "@/lib/demo-data"
import { getHistoryRecords } from "@/lib/server-data"

export default async function HistoryRecordPage({
  params
}: {
  params: { historyType: HistoryActionType; recordId: string }
}) {
  const tile = historyTiles.find((candidate) => candidate.type === params.historyType)
  const historyRecords = await getHistoryRecords()
  const record = historyRecords.find((candidate) => candidate.type === params.historyType && candidate.id === params.recordId)

  if (!tile || !record) notFound()

  return (
    <>
      <PageHeader
        title={record.summary}
        description={`${record.label} response detail for ${record.userName}.`}
        actions={
          <ButtonLink href={`/history/${params.historyType}`} variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to {tile.title}
          </ButtonLink>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <Panel className="p-4">
          <h2 className="font-semibold text-[var(--app-text)]">Performed by</h2>
          <div className="mt-4 grid gap-3 text-sm">
            {[
              ["Name", record.userName],
              ["Employee ID", record.employeeId],
              ["Department", record.department],
              ["Title", record.title],
              ["Store", record.store],
              ["Date", record.date],
              ["Time", record.time]
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3">
                <p className="text-xs font-semibold uppercase text-[var(--app-subtle)]">{label}</p>
                <p className="mt-1 font-semibold text-[var(--app-text)]">{value}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-4">
          <h2 className="font-semibold text-[var(--app-text)]">Responses</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(record.responses ?? [{ label: "Summary", value: record.summary }]).map((response) => (
              <div key={response.label} className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3">
                <p className="text-xs font-semibold uppercase text-[var(--app-subtle)]">{response.label}</p>
                <p className="mt-1 font-semibold text-[var(--app-text)]">{response.value}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  )
}
