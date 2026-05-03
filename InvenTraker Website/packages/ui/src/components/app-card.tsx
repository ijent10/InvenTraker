import type { PropsWithChildren } from "react"
import { cn } from "../lib/cn"

export function AppCard({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <section
      className={cn(
        "rounded-[24px] border p-6",
        "border-[color:var(--app-border)] bg-[color:var(--app-surface-soft)] shadow-[var(--app-shadow)]",
        className
      )}
    >
      {children}
    </section>
  )
}
