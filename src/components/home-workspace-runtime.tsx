"use client"

import { WorkspaceHome } from "@/components/workspace-home"
import { DashboardWidgetGrid } from "@/components/dashboard-widget-grid"
import type { ShiftNote } from "@/lib/demo-data"

export function HomeWorkspaceRuntime(props: { widgetStats?: Record<string, { value?: string; detail?: string }>; shiftNotes?: ShiftNote[] }) {
  return process.env.NEXT_PUBLIC_WORKSPACE_LAYOUT_V2 === "false" ? <DashboardWidgetGrid {...props} /> : <WorkspaceHome {...props} />
}
