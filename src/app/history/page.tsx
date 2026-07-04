import Link from "next/link"
import { ShieldCheck } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Panel, StatusPill } from "@/components/ui"
import { historyPermissionScopes, historyTiles } from "@/lib/demo-data"
import { getHistoryRecords } from "@/lib/server-data"

export default async function HistoryPage() {
  const historyRecords = await getHistoryRecords()

  return (
    <>
      <PageHeader
        title="History"
        description="Operation history for spot checks, restocks, waste, receiving, portions, and orders."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {historyTiles.map((tile) => {
          const Icon = tile.icon
          const count = historyRecords.filter((record) => record.type === tile.type).length
          return (
            <Link key={tile.type} href={`/history/${tile.type}`} className="block">
              <Panel className="h-full p-4 transition hover:border-[var(--app-accent)] hover:bg-slate-900/80">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-blue-200">
                    <Icon className="h-5 w-5" />
                  </div>
                  <StatusPill tone="blue">{count} record{count === 1 ? "" : "s"}</StatusPill>
                </div>
                <h2 className="mt-4 font-semibold text-white">{tile.title}</h2>
                <p className="app-tip mt-2 text-sm leading-6 text-slate-400">{tile.detail}</p>
              </Panel>
            </Link>
          )
        })}
      </div>

      <Panel className="mt-6 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500/15 text-blue-300">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Flexible history permissions</h2>
            <p className="app-tip mt-1 text-sm leading-6 text-slate-400">
              History access can be granted broadly or narrowed to regions, districts, stores, departments, or individuals.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {historyPermissionScopes.map(([scope, detail]) => (
            <div key={scope} className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
              <p className="text-sm font-semibold text-white">{scope}</p>
              <p className="app-tip mt-1 text-sm leading-5 text-slate-400">{detail}</p>
            </div>
          ))}
        </div>
      </Panel>
    </>
  )
}
