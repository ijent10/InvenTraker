import * as React from "react"
import { cn } from "../lib/cn"

export type AppCheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: React.ReactNode
  description?: React.ReactNode
}

export const AppCheckbox = React.forwardRef<HTMLInputElement, AppCheckboxProps>(function AppCheckbox(
  { className, label, description, id, ...props },
  ref
) {
  const generatedId = React.useId()
  const resolvedId = id ?? generatedId

  return (
    <label
      htmlFor={resolvedId}
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface-soft)] px-3 py-2 text-sm",
        props.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        className
      )}
    >
      <input
        ref={ref}
        id={resolvedId}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border border-[color:var(--app-border)] bg-[color:var(--app-control-bg)] accent-[color:var(--accent)]"
        {...props}
      />
      <span className="min-w-0">
        {label ? <span className="block font-medium text-[color:var(--app-text)]">{label}</span> : null}
        {description ? <span className="secondary-text block text-xs">{description}</span> : null}
      </span>
    </label>
  )
})
