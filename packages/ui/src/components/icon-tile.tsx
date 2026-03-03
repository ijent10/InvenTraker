import type { LucideIcon } from "lucide-react"
import { cn } from "../lib/cn"

export function IconTile({ icon: Icon, color, className }: { icon: LucideIcon; color: string; className?: string }) {
  return (
    <div
      className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", className)}
      style={{ backgroundColor: `${color}20` }}
    >
      <Icon className="h-6 w-6" style={{ color }} />
    </div>
  )
}
