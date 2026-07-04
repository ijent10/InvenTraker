import type { Metadata } from "next"

import { AppShell } from "@/components/app-shell"
import { getEmployees, getNotifications, getOrganizationBranding } from "@/lib/server-data"

export const metadata: Metadata = {
  title: "InvenTracker",
  description: "Inventory, ordering, vendor, and product operations for modern stores."
}

function toClientValue<T>(value: T): T {
  const serialized = JSON.stringify(value)
  return serialized ? (JSON.parse(serialized) as T) : value
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [initialBranding, employees, notifications] = await Promise.all([getOrganizationBranding(), getEmployees(), getNotifications()])
  const initialEmployee = employees[0]

  return (
    <html lang="en">
      <head>
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/app.css" />
      </head>
      <body>
        <AppShell
          initialBranding={toClientValue(initialBranding)}
          initialEmployee={toClientValue(initialEmployee)}
          notifications={toClientValue(notifications)}
        >
          {children}
        </AppShell>
      </body>
    </html>
  )
}
