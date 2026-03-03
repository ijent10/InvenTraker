import * as React from "react"
import { cn } from "../lib/cn"

export type AppTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

export const AppTextarea = React.forwardRef<HTMLTextAreaElement, AppTextareaProps>(function AppTextarea(
  { className, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[120px] w-full rounded-[14px] border border-[color:var(--app-border)] bg-[color:var(--app-control-bg)] px-3 py-2.5 text-sm text-[color:var(--app-text)] placeholder:text-[color:var(--app-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
})

