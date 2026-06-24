export function Button({
  children,
  variant = "primary"
}: {
  children: React.ReactNode
  variant?: "primary" | "secondary"
}) {
  const styles =
    variant === "primary"
      ? "border-blue-500 bg-blue-600 text-white hover:bg-blue-500"
      : "border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800"

  return (
    <button className={`h-10 rounded-md border px-4 text-sm font-semibold transition ${styles}`}>
      {children}
    </button>
  )
}

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-panel border border-slate-800 bg-slate-900/70 ${className}`}>{children}</section>
}

export function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "green" | "amber" | "neutral" }) {
  const styles = {
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    neutral: "border-slate-700 bg-slate-800 text-slate-300"
  }

  return <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${styles[tone]}`}>{children}</span>
}
