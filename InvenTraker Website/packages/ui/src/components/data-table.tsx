import type { ReactNode } from "react"

export interface TableColumn<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  className?: string
}

export function DataTable<T>({ columns, rows, empty }: { columns: TableColumn<T>[]; rows: T[]; empty: string }) {
  if (rows.length === 0) {
    return <div className="rounded-2xl border p-6 text-sm text-[color:var(--app-muted)]">{empty}</div>
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[color:var(--app-border)]">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-white/5 text-left">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[color:var(--app-muted)] ${column.className ?? ""}`}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t border-[color:var(--app-border)]">
              {columns.map((column) => (
                <td key={column.key} className={`px-4 py-3 ${column.className ?? ""}`}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
