import type { Metadata } from "next"
import "./globals.css"
import { AppProviders } from "@/components/providers"

export const metadata: Metadata = {
  title: "InvenTraker",
  description: "Fast barcode-first inventory, expirations, waste, ordering, insights."
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
