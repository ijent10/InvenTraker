export function DataTable({
  columns,
  rows
}: {
  columns: string[]
  rows: Array<Array<React.ReactNode>>
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--app-border)] text-xs uppercase text-[var(--app-subtle)]">
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-[var(--app-border)] last:border-0">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-4 align-middle text-[var(--app-muted)]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
