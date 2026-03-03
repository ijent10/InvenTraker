import * as React from "react"
import { cn } from "../lib/cn"

export type AppSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>

export const AppSelect = React.forwardRef<HTMLSelectElement, AppSelectProps>(function AppSelect(
  { className, children, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-11 w-full rounded-[14px] border border-[color:var(--app-border)] bg-[color:var(--app-control-bg)] px-3 text-sm text-[color:var(--app-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
})

