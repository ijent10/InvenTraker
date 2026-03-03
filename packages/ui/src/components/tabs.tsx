import { cn } from "../lib/cn"

export function Tabs<T extends string>({
  tabs,
  value,
  onChange
}: {
  tabs: Array<{ label: string; value: T }>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const active = tab.value === value
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-semibold",
              active
                ? "border-transparent bg-[color:var(--app-text)] text-[color:var(--app-surface)]"
                : "border-[color:var(--app-border)] text-[color:var(--app-muted)]"
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
