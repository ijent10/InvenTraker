import { redirect } from "next/navigation"
import { DashboardCustomizer } from "@/components/dashboard-customizer"

export default function HomeCustomizationPage() {
  if (process.env.NEXT_PUBLIC_WORKSPACE_LAYOUT_V2 === "false") return <DashboardCustomizer />
  redirect("/dashboard?edit=1#workspace")
}
