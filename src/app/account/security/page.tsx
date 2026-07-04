import { ArrowLeft, KeyRound, Mail } from "lucide-react"

import { ActionButton } from "@/components/action-button"
import { PageHeader } from "@/components/page-header"
import { SignInPanel } from "@/components/sign-in-panel"
import { ButtonLink, Field, Panel, TextInput } from "@/components/ui"
import { getCurrentEmployee } from "@/lib/account-data"

export default async function AccountSecurityPage() {
  const employee = await getCurrentEmployee()

  return (
    <>
      <PageHeader
        title="Sign-in and security"
        description="Change your sign-in email and password without changing employee permissions."
        actions={
          <ButtonLink href="/account" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to account
          </ButtonLink>
        }
      />

      <div className="mb-6">
        <SignInPanel compact />
      </div>

      <Panel className="max-w-4xl p-4">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold text-[var(--app-text)]">Account credentials</h2>
            <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">These actions are saved through the same database-backed save system used elsewhere.</p>
          </div>
        </div>

        <form className="grid gap-4">
          <Field label="Email">
            <TextInput name="email" type="email" defaultValue={employee.email} autoComplete="email" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password">
              <TextInput name="newPassword" type="password" placeholder="Enter a new password" autoComplete="new-password" />
            </Field>
            <Field label="Confirm password">
              <TextInput name="confirmPassword" type="password" placeholder="Confirm password" autoComplete="new-password" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton icon={<Mail className="h-4 w-4" />}>Update email</ActionButton>
            <ActionButton variant="secondary" icon={<KeyRound className="h-4 w-4" />}>
              Update password
            </ActionButton>
          </div>
        </form>
      </Panel>
    </>
  )
}
