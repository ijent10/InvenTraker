import { ClipboardCheck, PackageOpen, ArrowLeftRight, Scissors } from "lucide-react"
import { dashboardWidgets } from "./demo-data"

export const workspaceWidgetCatalog = [...dashboardWidgets,
  { id: "count-tasks", title: "Count tasks", detail: "Counts in progress or awaiting review", href: "/spot-checks", icon: ClipboardCheck, type: "Work", size: "Medium", defaultVisible: false, value: "" },
  { id: "delivery-tasks", title: "Delivery tasks", detail: "Deliveries in progress or awaiting review", href: "/receiving", icon: PackageOpen, type: "Work", size: "Medium", defaultVisible: false, value: "" },
  { id: "spot-check", title: "Spot Checks", detail: "Recorded inventory counts", href: "/history/spot-checks", icon: ClipboardCheck, type: "History", size: "Medium", defaultVisible: false, value: "" },
  { id: "receiving", title: "Receiving", detail: "Recorded receiving lines", href: "/history/receive", icon: PackageOpen, type: "History", size: "Medium", defaultVisible: false, value: "" },
  { id: "transfers", title: "Transfers", detail: "Front and back stock movements", href: "/history/transfers", icon: ArrowLeftRight, type: "History", size: "Medium", defaultVisible: false, value: "" },
  { id: "production", title: "Cut & Portion", detail: "Recorded portion operations", href: "/history/portion", icon: Scissors, type: "History", size: "Medium", defaultVisible: false, value: "" }
]
