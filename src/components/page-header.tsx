export function PageHeader({
  title,
  description,
  actions
}: {
  title: string
  description: string
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-normal text-white sm:text-3xl">{title}</h1>
        <p className="app-tip mt-2 max-w-2xl text-sm leading-6 text-slate-400">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div> : null}
    </div>
  )
}
