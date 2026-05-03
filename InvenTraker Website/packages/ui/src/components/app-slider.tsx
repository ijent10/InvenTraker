import * as React from "react"
import { cn } from "../lib/cn"

export type AppSliderProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">

export const AppSlider = React.forwardRef<HTMLInputElement, AppSliderProps>(function AppSlider(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      type="range"
      className={cn(
        "h-2 w-full cursor-pointer appearance-none rounded-full bg-[color:var(--app-surface-soft)] accent-[color:var(--accent)]",
        className
      )}
      {...props}
    />
  )
})
