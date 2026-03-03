import Link from "next/link"
import { appButtonClass } from "@inventracker/ui"
import { AuthCard } from "@/components/auth-card"

export default function SignUpPage() {
  return (
    <div className="grid gap-10 md:grid-cols-[1.2fr_1fr]">
      <section>
        <Link href="/" className={appButtonClass("secondary", "mb-6 !h-9 !w-auto !px-3 !py-2")}>
          ← Back
        </Link>
        <h1 className="page-title">Create your InvenTraker account</h1>
        <p className="secondary-text mt-2 max-w-xl">
          Sign up with email or use your company code + employee ID to join your organization.
        </p>
      </section>
      <section>
        <AuthCard mode="signup" />
        <p className="mt-4 text-center text-sm text-app-muted">
          Already have one? <Link href="/signin" className="text-blue-400">Sign in</Link>
        </p>
      </section>
    </div>
  )
}
