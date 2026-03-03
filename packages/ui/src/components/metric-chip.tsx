import { cn } from "../lib/cn"

export function MetricChip({ label, value, className }: { label: string; value: string | number; className?: string }) {
  return (
    <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold", "border-[color:var(--app-border)] bg-white/5", className)}>
      <span className="text-[color:var(--app-muted)]">{label}</span>
      <span>{value}</span>
    </div>
  )
}
