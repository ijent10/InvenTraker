import * as React from "react"
import { cn } from "../lib/cn"

export type AppButtonVariant = "primary" | "secondary" | "ghost"

export type AppButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant
}

export function appButtonClass(variant: AppButtonVariant = "primary", className?: string) {
  return cn(
    "inline-flex h-11 items-center justify-center rounded-[14px] px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-50",
    variant === "primary" && "border border-transparent bg-[color:var(--accent)] text-white hover:brightness-110",
    variant === "secondary" &&
      "border border-[color:var(--app-border)] bg-transparent text-[color:var(--app-text)] hover:bg-[color:var(--app-surface-soft)]",
    variant === "ghost" && "border border-transparent bg-transparent text-[color:var(--app-muted)] hover:text-[color:var(--app-text)]",
    className
  )
}

export const AppButton = React.forwardRef<HTMLButtonElement, AppButtonProps>(function AppButton(
  { className, variant = "primary", type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={appButtonClass(variant, className)}
      {...props}
    />
  )
})
