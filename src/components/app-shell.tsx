"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Bell, Search } from "lucide-react"

import { navigation } from "@/lib/navigation"

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-slate-800 bg-slate-950/95 px-4 py-5 lg:block">
        <Link href="/dashboard" className="flex items-center gap-3">
          <Image src="/inventracker-mark.svg" alt="" width={40} height={40} />
          <div>
            <p className="text-base font-semibold">InvenTracker</p>
            <p className="text-xs text-slate-400">Inventory operations</p>
          </div>
        </Link>

        <nav className="mt-8 space-y-1">
          {navigation.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
                  active
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-slate-900 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
          <div className="flex h-16 items-center gap-4 px-4 sm:px-6 lg:px-8">
            <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
              <Image src="/inventracker-mark.svg" alt="" width={36} height={36} />
              <span className="font-semibold">InvenTracker</span>
            </Link>

            <div className="ml-auto flex items-center gap-3">
              <label className="hidden h-10 w-80 items-center gap-2 rounded-md border border-slate-800 bg-slate-900 px-3 text-sm text-slate-400 md:flex">
                <Search className="h-4 w-4" />
                <input
                  className="w-full bg-transparent text-slate-100 outline-none placeholder:text-slate-500"
                  placeholder="Search items, orders, vendors"
                />
              </label>
              <button className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-800 text-slate-300 transition hover:bg-slate-900 hover:text-white">
                <Bell className="h-4 w-4" />
              </button>
              <div className="hidden rounded-md border border-slate-800 px-3 py-2 text-sm text-slate-300 sm:block">
                Store Ops
              </div>
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto border-t border-slate-800 px-3 py-2 lg:hidden">
            {navigation.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-semibold ${
                    active ? "bg-blue-600 text-white" : "text-slate-300"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
