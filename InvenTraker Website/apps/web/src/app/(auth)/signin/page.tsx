import Link from "next/link"
import { redirect } from "next/navigation"
import { appButtonClass } from "@inventracker/ui"
import { AuthCard } from "@/components/auth-card"

type SearchParams = Record<string, string | string[] | undefined>

function hasSensitiveQueryParams(searchParams: SearchParams): boolean {
  return ["email", "password", "pass", "pwd"].some((key) => {
    const value = searchParams[key]
    return typeof value === "string" ? value.length > 0 : Array.isArray(value) ? value.length > 0 : false
  })
}

export default function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  if (hasSensitiveQueryParams(searchParams)) {
    const next = typeof searchParams.next === "string" ? searchParams.next : undefined
    if (next) {
      redirect(`/signin?next=${encodeURIComponent(next)}`)
    }
    redirect("/signin")
  }

  return (
    <div className="grid gap-10 md:grid-cols-[1.2fr_1fr]">
      <section>
        <Link href="/" className={appButtonClass("secondary", "mb-6 !h-9 !w-auto !px-3 !py-2")}>
          ← Back
        </Link>
        <h1 className="page-title">Welcome back</h1>
        <p className="secondary-text mt-2 max-w-xl">Sign in to open your dashboard, switch organizations, and manage inventory operations.</p>
      </section>
      <section>
        <AuthCard mode="signin" />
        <p className="mt-4 text-center text-sm text-app-muted">
          New here? <Link href="/signup" className="text-blue-400">Create account</Link>
        </p>
      </section>
    </div>
  )
}
