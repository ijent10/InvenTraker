"use client"

import { useEffect, useState } from "react"

import { CreateAccountWizard } from "@/components/create-account-wizard"
import { SignupFinalizer } from "@/components/signup-finalizer"
import { SignInPanel } from "@/components/sign-in-panel"

export function SignInExperience({ initiallyCreating = false }: { initiallyCreating?: boolean }) {
  const [creating, setCreating] = useState(initiallyCreating)

  useEffect(() => {
    if (!creating) return
    document.getElementById("create-account")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [creating])

  return (
    <>
      <SignupFinalizer />
      <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        <SignInPanel onCreateAccount={() => setCreating(true)} />
        <CreateAccountWizard initiallyOpen={creating} onCollapse={() => setCreating(false)} />
      </div>
    </>
  )
}
