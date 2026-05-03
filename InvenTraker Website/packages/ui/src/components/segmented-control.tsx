import { cn } from "../lib/cn"

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange
}: {
  options: Array<{ label: string; value: T }>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex rounded-2xl border border-[color:var(--app-border)] bg-white/5 p-1">
      {options.map((option) => {
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-xl px-3 py-2 text-sm font-semibold transition",
              active ? "bg-[color:var(--app-surface)] shadow" : "text-[color:var(--app-muted)]"
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
