"use client"

import { useEffect, useMemo, useState } from "react"
import { signInWithEmailAndPassword } from "firebase/auth"
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Loader2, Plus, Sparkles, Trash2 } from "lucide-react"

import { Button, Field, Panel, StatusPill, TextArea, TextInput } from "@/components/ui"
import { auth } from "@/lib/firebase"
import {
  recommendSignupPlan,
  recommendStoreNickname,
  type SignupEmployee,
  type SignupPayload,
  type SignupStore
} from "@/lib/signup"

type CheckoutState = "idle" | "working"

type WizardStep = {
  id: string
  eyebrow: string
  title: string
  subtitle: string
}

const steps: WizardStep[] = [
  {
    id: "name",
    eyebrow: "Step 1",
    title: "What is your name?",
    subtitle: "This becomes the organization owner profile."
  },
  {
    id: "login",
    eyebrow: "Step 2",
    title: "What email and password should you use?",
    subtitle: "The account is activated after Stripe confirms a trial or payment."
  },
  {
    id: "organization",
    eyebrow: "Step 3",
    title: "What is the organization called?",
    subtitle: "Use the company name employees will recognize."
  },
  {
    id: "stores",
    eyebrow: "Step 4",
    title: "What stores should we create first?",
    subtitle: "Each store needs a nickname. Street address is usually the best default."
  },
  {
    id: "employees",
    eyebrow: "Step 5",
    title: "Who should be invited first?",
    subtitle: "Add employee names and emails for the initial rollout."
  },
  {
    id: "business",
    eyebrow: "Step 6",
    title: "What kind of business is this?",
    subtitle: "Use normal language. This helps suggest the right plan."
  },
  {
    id: "plan",
    eyebrow: "Final step",
    title: "Here is the plan that fits best.",
    subtitle: "Start a trial or checkout to create the organization database."
  }
]

function emptyStore(): SignupStore {
  return { location: "", nickname: "" }
}

function emptyEmployee(): SignupEmployee {
  return { firstName: "", lastName: "", email: "" }
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function normalizeEmployees(count: number, employees: SignupEmployee[]) {
  const desiredCount = Math.max(0, count)
  const next = employees.slice(0, desiredCount)
  while (next.length < desiredCount) next.push(emptyEmployee())
  return next
}

export function CreateAccountWizard({
  initiallyOpen = false,
  onCollapse,
  showHeaderAction = true
}: {
  initiallyOpen?: boolean
  onCollapse?: () => void
  showHeaderAction?: boolean
}) {
  const [open, setOpen] = useState(initiallyOpen)
  const [stepIndex, setStepIndex] = useState(0)
  const [ownerFirstName, setOwnerFirstName] = useState("")
  const [ownerLastName, setOwnerLastName] = useState("")
  const [ownerEmail, setOwnerEmail] = useState("")
  const [password, setPassword] = useState("")
  const [organizationName, setOrganizationName] = useState("")
  const [stores, setStores] = useState<SignupStore[]>([emptyStore()])
  const [employeeCount, setEmployeeCount] = useState(1)
  const [employees, setEmployees] = useState<SignupEmployee[]>([emptyEmployee()])
  const [businessDescription, setBusinessDescription] = useState("")
  const [checkoutState, setCheckoutState] = useState<CheckoutState>("idle")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (initiallyOpen) setOpen(true)
  }, [initiallyOpen])

  const payload = useMemo<SignupPayload>(
    () => ({
      ownerFirstName,
      ownerLastName,
      ownerEmail,
      organizationName,
      stores,
      employeeCount,
      employees,
      businessDescription
    }),
    [businessDescription, employeeCount, employees, organizationName, ownerEmail, ownerFirstName, ownerLastName, stores]
  )
  const recommendation = useMemo(() => recommendSignupPlan(payload), [payload])
  const currentStep = steps[stepIndex]
  const progress = Math.round(((stepIndex + 1) / steps.length) * 100)
  const storesComplete = stores.every((store) => store.location.trim() && store.nickname.trim())
  const employeeRowsComplete = employeeCount === 0 || employees.every((employee) => employee.firstName.trim() && employee.lastName.trim() && validEmail(employee.email))
  const stepComplete =
    (currentStep.id === "name" && ownerFirstName.trim() && ownerLastName.trim()) ||
    (currentStep.id === "login" && validEmail(ownerEmail) && password.length >= 6) ||
    (currentStep.id === "organization" && organizationName.trim()) ||
    (currentStep.id === "stores" && storesComplete) ||
    (currentStep.id === "employees" && employeeRowsComplete) ||
    (currentStep.id === "business" && businessDescription.trim()) ||
    currentStep.id === "plan"
  const canCheckout =
    ownerFirstName.trim() &&
    ownerLastName.trim() &&
    validEmail(ownerEmail) &&
    password.length >= 6 &&
    organizationName.trim() &&
    storesComplete &&
    employeeRowsComplete &&
    businessDescription.trim()

  function collapse() {
    setOpen(false)
    onCollapse?.()
  }

  function updateStore(index: number, field: keyof SignupStore, value: string) {
    setStores((current) =>
      current.map((store, storeIndex) => {
        if (storeIndex !== index) return store
        if (field === "location") {
          const suggestedNickname = recommendStoreNickname(value)
          const shouldReplaceNickname = !store.nickname.trim() || store.nickname === recommendStoreNickname(store.location)
          return { location: value, nickname: shouldReplaceNickname ? suggestedNickname : store.nickname }
        }
        return { ...store, [field]: value }
      })
    )
  }

  function updateEmployee(index: number, field: keyof SignupEmployee, value: string) {
    setEmployees((current) => current.map((employee, employeeIndex) => (employeeIndex === index ? { ...employee, [field]: value } : employee)))
  }

  function updateEmployeeCount(value: string) {
    const parsed = Number.parseInt(value, 10)
    const nextCount = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
    setEmployeeCount(nextCount)
    setEmployees((current) => normalizeEmployees(nextCount, current))
  }

  function nextStep() {
    setError("")
    setStepIndex((current) => Math.min(current + 1, steps.length - 1))
  }

  function previousStep() {
    setError("")
    setStepIndex((current) => Math.max(current - 1, 0))
  }

  async function startTrialWorkspace() {
    setCheckoutState("working")
    setMessage("")
    setError("")

    try {
      const response = await fetch("/api/signup/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signup: payload,
          password
        })
      })
      const result = (await response.json().catch(() => null)) as { email?: string; error?: string } | null
      if (!response.ok || !result?.email) throw new Error(result?.error ?? "Could not create trial workspace.")

      if (auth) {
        await signInWithEmailAndPassword(auth, result.email, password)
      }

      setMessage("Workspace created. Taking you to the dashboard.")
      window.location.assign("/dashboard")
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not create trial workspace.")
    } finally {
      setCheckoutState("idle")
    }
  }

  function renderStep() {
    if (currentStep.id === "name") {
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name">
            <TextInput value={ownerFirstName} onChange={(event) => setOwnerFirstName(event.target.value)} autoComplete="given-name" autoFocus />
          </Field>
          <Field label="Last name">
            <TextInput value={ownerLastName} onChange={(event) => setOwnerLastName(event.target.value)} autoComplete="family-name" />
          </Field>
        </div>
      )
    }

    if (currentStep.id === "login") {
      return (
        <div className="grid gap-4">
          <Field label="Email">
            <TextInput value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} type="email" autoComplete="email" autoFocus />
          </Field>
          <Field label="Password" hint="At least 6 characters. This is used only after trial/payment activation.">
            <TextInput value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" />
          </Field>
        </div>
      )
    }

    if (currentStep.id === "organization") {
      return (
        <Field label="Organization name">
          <TextInput value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="The Fresh Market" autoFocus />
        </Field>
      )
    }

    if (currentStep.id === "stores") {
      return (
        <div className="grid gap-3">
          {stores.map((store, index) => (
            <div key={index} className="grid gap-3 rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3 md:grid-cols-[1fr_0.7fr_auto]">
              <Field label={`Store ${index + 1} location`}>
                <TextInput
                  value={store.location}
                  onChange={(event) => updateStore(index, "location", event.target.value)}
                  placeholder="123 Main St, Pittsburgh, PA"
                  autoFocus={index === 0}
                />
              </Field>
              <Field label="Nickname">
                <TextInput value={store.nickname} onChange={(event) => updateStore(index, "nickname", event.target.value)} placeholder="Main St" />
              </Field>
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  disabled={stores.length === 1}
                  onClick={() => setStores((current) => current.filter((_, storeIndex) => storeIndex !== index))}
                  icon={<Trash2 className="h-4 w-4" />}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          <Button variant="secondary" className="w-fit" onClick={() => setStores((current) => [...current, emptyStore()])} icon={<Plus className="h-4 w-4" />}>
            Add another store
          </Button>
        </div>
      )
    }

    if (currentStep.id === "employees") {
      return (
        <div className="grid gap-4">
          <Field label="Number of employees">
            <TextInput value={String(employeeCount)} onChange={(event) => updateEmployeeCount(event.target.value)} type="number" min={0} autoFocus />
          </Field>
          {employees.length > 0 ? (
            <div className="grid gap-3">
              {employees.map((employee, index) => (
                <div key={index} className="grid gap-3 rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-3 md:grid-cols-3">
                  <Field label={`Employee ${index + 1} first name`}>
                    <TextInput value={employee.firstName} onChange={(event) => updateEmployee(index, "firstName", event.target.value)} autoComplete="off" />
                  </Field>
                  <Field label="Last name">
                    <TextInput value={employee.lastName} onChange={(event) => updateEmployee(index, "lastName", event.target.value)} autoComplete="off" />
                  </Field>
                  <Field label="Email">
                    <TextInput value={employee.email} onChange={(event) => updateEmployee(index, "email", event.target.value)} type="email" autoComplete="off" />
                  </Field>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-4 text-sm text-[var(--app-muted)]">
              No employee invites will be added at signup.
            </div>
          )}
        </div>
      )
    }

    if (currentStep.id === "business") {
      return (
        <Field label="Business description">
          <TextArea
            value={businessDescription}
            onChange={(event) => setBusinessDescription(event.target.value)}
            placeholder="Example: We are a grocery market with bakery, beer and wine, prepared foods, and department managers."
            autoFocus
          />
        </Field>
      )
    }

    return (
      <div className="grid gap-4">
        <div className="rounded-md border border-[var(--app-accent)] bg-[var(--app-accent-soft)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--app-accent)] text-[var(--app-on-accent)]">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--app-text)]">{recommendation.name}</p>
                <p className="mt-1 text-sm leading-6 text-[var(--app-muted)]">{recommendation.summary}</p>
              </div>
            </div>
            <StatusPill tone="blue">{recommendation.seats} seats</StatusPill>
          </div>
          <ul className="mt-4 grid gap-2 text-sm leading-6 text-[var(--app-muted)]">
            {recommendation.why.map((reason) => (
              <li key={reason} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-4 text-sm leading-6 text-[var(--app-muted)]">
          Billing plans are paused for now. InvenTracker will create the organization, owner member record, stores, and employee invitations now, then mark Stripe linking as pending for later.
        </div>
      </div>
    )
  }

  return (
    <Panel id="create-account" className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[var(--app-text)]">Create an account</h2>
          <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">A guided setup for new organizations.</p>
        </div>
        {showHeaderAction ? (
          <Button variant={open ? "ghost" : "secondary"} onClick={open ? collapse : () => setOpen(true)} icon={<Building2 className="h-4 w-4" />}>
            {open ? "Close" : "Create an account"}
          </Button>
        ) : null}
      </div>

      {!open ? (
        <div className="mt-5 rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-4 text-sm leading-6 text-[var(--app-muted)]">
          New organizations answer a few setup questions, get a recommended plan, then start a Stripe trial or checkout.
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-panel border border-[var(--app-border)] bg-[var(--app-panel-strong)]">
          <div className="border-b border-[var(--app-border)] p-4">
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-[var(--app-control-bg)]">
              <div className="h-full rounded-full bg-[var(--app-accent)] transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-[var(--app-accent)]">{currentStep.eyebrow}</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-normal text-[var(--app-text)]">{currentStep.title}</h3>
                <p className="app-tip mt-2 text-sm leading-6 text-[var(--app-muted)]">{currentStep.subtitle}</p>
              </div>
              <StatusPill>{stepIndex + 1} / {steps.length}</StatusPill>
            </div>
          </div>

          <div className="p-4 sm:p-6">{renderStep()}</div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] p-4">
            <Button variant="ghost" disabled={stepIndex === 0 || checkoutState === "working"} onClick={previousStep} icon={<ArrowLeft className="h-4 w-4" />}>
              Back
            </Button>
            {currentStep.id === "plan" ? (
          <Button
                disabled={!canCheckout || checkoutState === "working"}
                onClick={() => void startTrialWorkspace()}
                icon={checkoutState === "working" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              >
                Create trial workspace
              </Button>
            ) : (
              <Button disabled={!stepComplete} onClick={nextStep} icon={<ArrowRight className="h-4 w-4" />}>
                Continue
              </Button>
            )}
          </div>

          {message || error ? (
            <div className="border-t border-[var(--app-border)] px-4 py-3">
              {message ? <p className="text-sm font-semibold text-emerald-300">{message}</p> : null}
              {error ? <p className="text-sm font-semibold text-rose-300">{error}</p> : null}
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  )
}
