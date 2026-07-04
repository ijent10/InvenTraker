import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ShieldCheck } from "lucide-react"

import { DataTable } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { ButtonLink, Panel, StatusPill } from "@/components/ui"
import { historyPermissionScopes, historyTiles, type HistoryActionType } from "@/lib/demo-data"
import { getHistoryRecords } from "@/lib/server-data"

export function generateStaticParams() {
  return historyTiles.map((tile) => ({ historyType: tile.type }))
}

export default async function HistoryTypePage({ params }: { params: { historyType: HistoryActionType } }) {
  const tile = historyTiles.find((candidate) => candidate.type === params.historyType)
  if (!tile) notFound()

  const historyRecords = await getHistoryRecords()
  const records = historyRecords.filter((record) => record.type === params.historyType)

  return (
    <>
      <PageHeader
        title={tile.title}
        description={`History of people who performed ${tile.title.toLowerCase()} actions.`}
        actions={
          <ButtonLink href="/history" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to history
          </ButtonLink>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Panel>
          <DataTable
            columns={["User", "Employee ID", "Department", "Title", "Date", "Time", "Summary"]}
            rows={records.map((record) => [
              <Link
                key={`${record.id}-user`}
                href={`/history/${params.historyType}/${record.id}`}
                className="font-semibold text-white hover:text-[var(--app-accent)]"
              >
                {record.userName}
              </Link>,
              record.employeeId,
              record.department,
              record.title,
              record.date,
              record.time,
              record.summary
            ])}
          />
        </Panel>

        <Panel className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/15 text-blue-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Visible scope</h2>
              <p className="app-tip mt-1 text-sm leading-6 text-slate-400">
                This page is designed to filter snippets by permission scope before rendering.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {historyPermissionScopes.map(([scope]) => (
              <StatusPill key={scope}>{scope}</StatusPill>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {records.map((record) => (
              <div key={`${record.id}-scope`} className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
                <p className="text-sm font-semibold text-white">{record.store}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {record.district} · {record.region}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  )
}
