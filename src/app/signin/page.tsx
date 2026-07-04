import Image from "next/image"

import { SignInExperience } from "@/components/sign-in-experience"

export default function SignInPage({
  searchParams
}: {
  searchParams?: {
    create?: string
    mode?: string
  }
}) {
  const initiallyCreating = searchParams?.create === "1" || searchParams?.mode === "create"

  return (
    <main className="min-h-screen bg-[var(--app-bg)] px-4 py-10 text-[var(--app-text)]">
      <div className="mx-auto mb-8 flex max-w-4xl flex-col items-center text-center">
        <Image src="/inventracker-mark.svg" alt="" width={64} height={64} />
        <h1 className="mt-4 text-3xl font-semibold tracking-normal">Sign in to InvenTracker</h1>
        <p className="app-tip mt-2 max-w-2xl text-sm leading-6 text-[var(--app-muted)]">
          Returning users sign in with email and password. New organizations can create an account through the guided setup.
        </p>
      </div>
      <SignInExperience initiallyCreating={initiallyCreating} />
    </main>
  )
}
