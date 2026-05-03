"use client"

import { useEffect, useState } from "react"
import { AppButton, AppCard, AppInput, appButtonClass } from "@inventracker/ui"
import { useQuery } from "@tanstack/react-query"
import { updateEmail, updatePassword } from "firebase/auth"

import { PageHead } from "@/components/page-head"
import { useAuthUser } from "@/hooks/use-auth-user"
import { useOrgContext } from "@/hooks/use-org-context"
import { auth } from "@/lib/firebase/client"
import {
  fetchAccountProfile,
  saveAccountProfile,
  uploadMediaAsset
} from "@/lib/data/firestore"

export default function AccountSettingsPage() {
  const { user } = useAuthUser()
  const { activeOrgId } = useOrgContext()

  const [email, setEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [employeeId, setEmployeeId] = useState("")
  const [profileImageUrl, setProfileImageUrl] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data: accountProfile } = useQuery({
    queryKey: ["account-profile", user?.uid],
    queryFn: () => fetchAccountProfile(user?.uid ?? ""),
    enabled: Boolean(user?.uid)
  })

  useEffect(() => {
    setEmail(accountProfile?.email ?? user?.email ?? "")
    setFirstName(accountProfile?.firstName ?? "")
    setLastName(accountProfile?.lastName ?? "")
    setEmployeeId(accountProfile?.employeeId ?? "")
    setProfileImageUrl(accountProfile?.profileImageUrl ?? "")
  }, [accountProfile, user?.email])

  const saveProfile = async () => {
    if (!user) return
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      await saveAccountProfile(activeOrgId, user.uid, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        employeeId: employeeId.trim(),
        profileImageUrl: profileImageUrl.trim(),
        email: email.trim()
      })
      setStatusMessage("Account profile saved.")
    } catch {
      setErrorMessage("Could not save account profile.")
    }
  }

  const saveEmail = async () => {
    if (!auth?.currentUser) return
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      await updateEmail(auth.currentUser, email.trim())
      await saveProfile()
      setStatusMessage("Email updated.")
    } catch {
      setErrorMessage("Email update requires a recent login. Sign out/in and try again.")
    }
  }

  const savePassword = async () => {
    if (!auth?.currentUser || !newPassword.trim()) return
    setStatusMessage(null)
    setErrorMessage(null)
    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match.")
      return
    }
    try {
      await updatePassword(auth.currentUser, newPassword)
      setNewPassword("")
      setConfirmPassword("")
      setStatusMessage("Password updated.")
    } catch {
      setErrorMessage("Password update requires a recent login. Sign out/in and try again.")
    }
  }

  const uploadProfileImage = async (file: File) => {
    if (!user || !activeOrgId) return
    setStatusMessage(null)
    setErrorMessage(null)
    try {
      const uploaded = await uploadMediaAsset({
        file,
        orgId: activeOrgId,
        userId: user.uid,
        type: "image"
      })
      if (!uploaded?.downloadUrl) return
      setProfileImageUrl(uploaded.downloadUrl)
      await saveAccountProfile(activeOrgId, user.uid, {
        profileImageUrl: uploaded.downloadUrl
      })
      setStatusMessage("Profile image updated.")
    } catch {
      setErrorMessage("Could not upload profile image.")
    }
  }

  return (
    <div>
      <PageHead title="Account" subtitle="Profile, security, and employee information." />
      <div className="grid gap-4 xl:grid-cols-2">
        <AppCard>
          <h2 className="card-title">Profile</h2>
          <div className="mt-4 grid gap-3">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 overflow-hidden rounded-full border border-app-border bg-app-surface-soft">
                {profileImageUrl ? (
                  <img
                    src={profileImageUrl}
                    alt="Profile"
                    className="h-14 w-14 object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-app-muted">
                    {(user?.email?.slice(0, 1) ?? "U").toUpperCase()}
                  </div>
                )}
              </div>
              <label className={appButtonClass("secondary", "cursor-pointer !h-9 !px-3 !py-2")}>
                Upload Image
                <AppInput
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (!file) return
                    void uploadProfileImage(file)
                  }}
                />
              </label>
            </div>
            <AppInput
              placeholder="First name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
            <AppInput
              placeholder="Last name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
            <AppInput
              placeholder="Employee ID"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
            />
            <AppButton onClick={() => void saveProfile()}>
              Save profile
            </AppButton>
          </div>
        </AppCard>

        <AppCard>
          <h2 className="card-title">Security</h2>
          <div className="mt-4 grid gap-4">
            <div className="rounded-2xl border border-app-border bg-app-surface-soft p-4">
              <p className="text-sm font-semibold">Sign-in Email</p>
              <p className="secondary-text mt-1 text-xs">Used for login and password recovery.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <AppInput
                  className="flex-1"
                  placeholder="Email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <AppButton variant="secondary" className="sm:min-w-36" onClick={() => void saveEmail()}>
                  Save Email
                </AppButton>
              </div>
            </div>

            <div className="rounded-2xl border border-app-border bg-app-surface-soft p-4">
              <p className="text-sm font-semibold">Password</p>
              <p className="secondary-text mt-1 text-xs">Choose a strong password with at least 8 characters.</p>
              <div className="mt-3 grid gap-2">
                <AppInput
                  placeholder="New password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
                <AppInput
                  placeholder="Confirm password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
                <AppButton variant="secondary" className="justify-center sm:self-start" onClick={() => void savePassword()}>
                  Save Password
                </AppButton>
              </div>
              <p className="secondary-text mt-2 text-xs">If this fails, sign out and sign back in, then retry.</p>
            </div>
          </div>
        </AppCard>
      </div>

      {statusMessage ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {statusMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {errorMessage}
        </div>
      ) : null}
    </div>
  )
}
