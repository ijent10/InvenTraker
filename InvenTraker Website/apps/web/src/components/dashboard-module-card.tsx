import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { AppCard, IconTile, MetricChip } from "@inventracker/ui"

export function DashboardModuleCard({
  href,
  icon,
  title,
  subtitle,
  color,
  metric
}: {
  href: string
  icon: LucideIcon
  title: string
  subtitle: string
  color: string
  metric: string
}) {
  return (
    <Link href={href}>
      <AppCard className="h-full transition hover:-translate-y-0.5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <IconTile icon={icon} color={color} />
            <h2 className="card-title">{title}</h2>
          </div>
          <MetricChip label="Now" value={metric} />
        </div>
        <p className="secondary-text">{subtitle}</p>
      </AppCard>
    </Link>
  )
}
