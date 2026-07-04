import Link from "next/link"
import { ArrowRight, Gauge, Info, KeyRound, Palette, Settings, UserCircle } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Panel, StatusPill } from "@/components/ui"
import { getCurrentEmployee } from "@/lib/account-data"

const accountSections = [
  {
    title: "Employee profile",
    description: "View your employee ID, title, department, location, status, and personal record.",
    href: "/account/profile",
    icon: UserCircle,
    tone: "from-sky-500 to-cyan-400"
  },
  {
    title: "Sign-in and security",
    description: "Change email, update password, and manage sign-in details.",
    href: "/account/security",
    icon: KeyRound,
    tone: "from-violet-500 to-fuchsia-400"
  },
  {
    title: "Theme",
    description: "Choose a named theme or open the builder to create your own.",
    href: "/account/theme",
    icon: Palette,
    tone: "from-emerald-500 to-teal-400"
  },
  {
    title: "Tips and summaries",
    description: "Turn helper text and section summaries on or off.",
    href: "/account/tips",
    icon: Info,
    tone: "from-blue-500 to-indigo-400"
  },
  {
    title: "Dashboard customization",
    description: "Choose exactly which tiles and widgets appear on your home dashboard.",
    href: "/account/dashboard-customization",
    icon: Gauge,
    tone: "from-lime-500 to-emerald-400"
  },
  {
    title: "Workspace settings",
    description: "Open general settings that belong with your account tools.",
    href: "/settings",
    icon: Settings,
    tone: "from-orange-500 to-amber-400"
  }
] as const

export default async function AccountPage() {
  const employee = await getCurrentEmployee()

  return (
    <>
      <PageHeader
        title="Personal account"
        description="Pick the setting you want to change. Each section opens on its own page so account settings stay clean."
      />

      <Panel className="mb-6 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--app-subtle)]">Signed in as</p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--app-text)]">{employee.name || employee.email || "Workspace user"}</h2>
            <p className="mt-1 text-sm text-[var(--app-muted)]">
              {employee.jobTitle || "No title"} - {employee.department || "No department"} - {employee.location || "No location"}
            </p>
          </div>
          <StatusPill tone={employee.status === "Active" ? "green" : "blue"}>{employee.status}</StatusPill>
        </div>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {accountSections.map((section) => {
          const Icon = section.icon

          return (
            <Link
              key={section.href}
              href={section.href}
              className="group rounded-panel border border-[var(--app-border)] bg-[var(--app-panel)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--app-accent)] hover:bg-[var(--app-control-bg-hover)]"
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${section.tone} text-white shadow-lg shadow-black/20`}
                >
                  <Icon className="h-6 w-6" />
                </span>
                <ArrowRight className="h-4 w-4 text-[var(--app-subtle)] transition group-hover:translate-x-1 group-hover:text-[var(--app-accent)]" />
              </div>
              <h2 className="mt-4 font-semibold text-[var(--app-text)]">{section.title}</h2>
              <p className="app-tip mt-2 text-sm leading-6 text-[var(--app-muted)]">{section.description}</p>
            </Link>
          )
        })}
      </div>
    </>
  )
}
