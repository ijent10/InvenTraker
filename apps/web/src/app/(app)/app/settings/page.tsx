"use client"

import { useEffect, useMemo, useState } from "react"
import { AppButton, AppCard, AppCheckbox, AppInput, SegmentedControl } from "@inventracker/ui"
import { accentPalette } from "@inventracker/shared"

import { PageHead } from "@/components/page-head"
import { useAuthUser } from "@/hooks/use-auth-user"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  createFeatureRequest,
  createOrganizationWithInitialStore,
  fetchPreferenceProfile,
  savePreferenceProfile
} from "@/lib/data/firestore"
import { claimOrganizationByCompanyCode, ensureProfile } from "@/lib/firebase/functions"

type ThemeMode = "light" | "dark" | "system"

export default function SettingsPage() {
  const { user } = useAuthUser()
  const { activeOrgId } = useOrgContext()

  const [theme, setTheme] = useState<ThemeMode>("dark")
  const [accent, setAccent] = useState("#2563EB")
  const [boldText, setBoldText] = useState(false)
  const [showTips, setShowTips] = useState(true)
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  const [orgAction, setOrgAction] = useState<"join" | "create">("join")
  const [companyCode, setCompanyCode] = useState("")
  const [employeeId, setEmployeeId] = useState("")
  const [organizationName, setOrganizationName] = useState("")
  const [createCompanyCode, setCreateCompanyCode] = useState("")
  const [storeTitle, setStoreTitle] = useState("")
  const [storeNumber, setStoreNumber] = useState("")
  const [regionName, setRegionName] = useState("")
  const [districtName, setDistrictName] = useState("")
  const [addressLine1, setAddressLine1] = useState("")
  const [addressLine2, setAddressLine2] = useState("")
  const [city, setCity] = useState("")
  const [stateCode, setStateCode] = useState("")
  const [postalCode, setPostalCode] = useState("")
  const [country, setCountry] = useState("USA")
  const [orgMessage, setOrgMessage] = useState<string | null>(null)
  const [orgError, setOrgError] = useState<string | null>(null)
  const [featureTitle, setFeatureTitle] = useState("")
  const [featureContent, setFeatureContent] = useState("")
  const [featureMessage, setFeatureMessage] = useState<string | null>(null)
  const [featureError, setFeatureError] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme === "system" ? "dark" : theme
    document.documentElement.style.setProperty("--accent", accent)
    document.documentElement.style.setProperty("--accent-strong", accent)
    document.documentElement.classList.toggle("bold-text", boldText)
    document.documentElement.dataset.showTips = showTips ? "true" : "false"
    if (user?.uid && activeOrgId) {
      localStorage.setItem(`web_show_tips_${user.uid}_${activeOrgId}`, showTips ? "true" : "false")
    }
  }, [accent, activeOrgId, boldText, showTips, theme, user?.uid])

  useEffect(() => {
    const run = async () => {
      if (!user || !activeOrgId) return
      try {
        await ensureProfile({ userId: user.uid, orgId: activeOrgId, platform: "WEB" })
        const profile = await fetchPreferenceProfile(user.uid, activeOrgId, "WEB")
        if (!profile) return
        setTheme(profile.theme)
        setAccent(profile.accentColor)
        setBoldText(profile.boldText)
        setShowTips(profile.showTips)
      } catch {
        // Keep defaults when profile access is unavailable.
      }
    }
    void run()
  }, [activeOrgId, user])

  const profileId = useMemo(
    () => (user && activeOrgId ? `${user.uid}_${activeOrgId}_WEB` : ""),
    [activeOrgId, user]
  )

  const persist = async () => {
    if (!user || !activeOrgId || !profileId) return
    setSettingsMessage(null)
    setSettingsError(null)
    try {
      await savePreferenceProfile({
        id: profileId,
        userId: user.uid,
        organizationId: activeOrgId,
        platform: "WEB",
        theme,
        accentColor: accent,
        boldText,
        showTips
      })
      setSettingsMessage("Settings saved.")
    } catch {
      setSettingsError("Could not save settings.")
    }
  }

  const joinOrganization = async () => {
    if (!companyCode.trim() || !employeeId.trim()) return
    setOrgMessage(null)
    setOrgError(null)
    try {
      const claimed = await claimOrganizationByCompanyCode({
        companyCode: companyCode.trim().toUpperCase(),
        employeeId: employeeId.trim()
      })
      if (!claimed) {
        setOrgError("Could not join organization.")
        return
      }
      setOrgMessage(`Joined ${claimed.orgName}. Refreshing...`)
      window.location.assign("/app")
    } catch (error) {
      const message = String((error as { message?: string } | undefined)?.message ?? "")
      setOrgError(message || "Could not join organization. Contact your company IT department.")
    }
  }

  const createOrganization = async () => {
    if (!user?.uid) return
    if (!organizationName.trim() || !storeTitle.trim() || !addressLine1.trim() || !city.trim() || !stateCode.trim() || !postalCode.trim()) {
      setOrgError("Organization name + store title + full address are required.")
      return
    }
    setOrgMessage(null)
    setOrgError(null)
    try {
      const result = await createOrganizationWithInitialStore(user.uid, {
        organizationName: organizationName.trim(),
        companyCode: createCompanyCode.trim() || undefined,
        store: {
          title: storeTitle.trim(),
          storeNumber: storeNumber.trim() || undefined,
          regionName: regionName.trim() || undefined,
          districtName: districtName.trim() || undefined,
          addressLine1: addressLine1.trim(),
          addressLine2: addressLine2.trim() || undefined,
          city: city.trim(),
          state: stateCode.trim(),
          postalCode: postalCode.trim(),
          country: country.trim() || "USA"
        }
      })
      if (!result.orgId) {
        setOrgError("Could not create organization.")
        return
      }
      setOrgMessage("Organization created. Refreshing...")
      window.location.assign("/app")
    } catch (error) {
      const message = String((error as { message?: string } | undefined)?.message ?? "")
      setOrgError(message || "Could not create organization.")
    }
  }

  const submitFeature = async () => {
    if (!featureTitle.trim() || !featureContent.trim()) {
      setFeatureError("Title and content are required.")
      return
    }
    setFeatureMessage(null)
    setFeatureError(null)
    try {
      await createFeatureRequest({
        title: featureTitle,
        content: featureContent,
        email: user?.email ?? undefined,
        uid: user?.uid ?? undefined,
        organizationId: activeOrgId || undefined
      })
      setFeatureTitle("")
      setFeatureContent("")
      setFeatureMessage("Feature request submitted.")
    } catch {
      setFeatureError("Could not submit feature request.")
    }
  }

  return (
    <div>
      <PageHead
        title="Settings"
        subtitle="Appearance, notifications, and organization management."
        actions={
          <AppButton onClick={() => void persist()}>
            Save Settings
          </AppButton>
        }
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <AppCard>
          <h2 className="card-title">Web Appearance</h2>
          <div className="mt-4 space-y-4">
            <SegmentedControl
              options={[
                { label: "Light", value: "light" },
                { label: "Dark", value: "dark" },
                { label: "System", value: "system" }
              ]}
              value={theme}
              onChange={(value) => setTheme(value as ThemeMode)}
            />
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {accentPalette.map((entry) => (
                  <AppButton
                    key={entry.value}
                    onClick={() => setAccent(entry.value)}
                    variant="secondary"
                    className="!h-10 !rounded-xl !px-2 !text-xs"
                    style={{ backgroundColor: `${entry.value}20`, color: entry.value }}
                  >
                    {entry.name}
                  </AppButton>
                ))}
              </div>
            <AppCheckbox
              checked={boldText}
              onChange={(event) => setBoldText(event.target.checked)}
              label="Bold text (accessibility)"
            />
            <AppCheckbox
              checked={showTips}
              onChange={(event) => setShowTips(event.target.checked)}
              label="Show tips across the web app"
            />
            <div className="rounded-xl border border-app-border px-3 py-2 text-sm text-app-muted">
              Notifications and data scope settings are profile-based and can be expanded here.
            </div>
          </div>
        </AppCard>

        <AppCard>
          <h2 className="card-title">Add Organization</h2>
          <p className="secondary-text mt-2">Join an existing company or create a new organization with a starting store.</p>
          <div className="mt-4">
            <SegmentedControl
              options={[
                { label: "Join", value: "join" },
                { label: "Create", value: "create" }
              ]}
              value={orgAction}
              onChange={(value) => setOrgAction(value as "join" | "create")}
            />
          </div>

          {orgAction === "join" ? (
            <div className="mt-4 grid gap-3">
              <AppInput
                className="uppercase"
                placeholder="Company code"
                value={companyCode}
                onChange={(event) => setCompanyCode(event.target.value.toUpperCase())}
              />
              <AppInput
                placeholder="Employee ID"
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
              />
              <AppButton onClick={() => void joinOrganization()}>
                Join Organization
              </AppButton>
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              <AppInput
                placeholder="Organization name"
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
              />
              <AppInput
                className="uppercase"
                placeholder="Company code (optional)"
                value={createCompanyCode}
                onChange={(event) => setCreateCompanyCode(event.target.value.toUpperCase())}
              />
              <div className="grid grid-cols-2 gap-3">
                <AppInput
                  placeholder="Store title"
                  value={storeTitle}
                  onChange={(event) => setStoreTitle(event.target.value)}
                />
                <AppInput
                  placeholder="Store number (optional)"
                  value={storeNumber}
                  onChange={(event) => setStoreNumber(event.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <AppInput
                  placeholder="Region (optional)"
                  value={regionName}
                  onChange={(event) => setRegionName(event.target.value)}
                />
                <AppInput
                  placeholder="District (optional)"
                  value={districtName}
                  onChange={(event) => setDistrictName(event.target.value)}
                />
              </div>
              <AppInput
                placeholder="Address line 1"
                value={addressLine1}
                onChange={(event) => setAddressLine1(event.target.value)}
              />
              <AppInput
                placeholder="Address line 2 (optional)"
                value={addressLine2}
                onChange={(event) => setAddressLine2(event.target.value)}
              />
              <div className="grid grid-cols-3 gap-3">
                <AppInput
                  placeholder="City"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                />
                <AppInput
                  placeholder="State"
                  value={stateCode}
                  onChange={(event) => setStateCode(event.target.value)}
                />
                <AppInput
                  placeholder="Postal code"
                  value={postalCode}
                  onChange={(event) => setPostalCode(event.target.value)}
                />
              </div>
              <AppInput
                placeholder="Country"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
              />
              <AppButton onClick={() => void createOrganization()}>
                Create Organization
              </AppButton>
            </div>
          )}
        </AppCard>

        <AppCard>
          <h2 className="card-title">Request Feature</h2>
          <p className="secondary-text mt-2">Send product requests directly to the InvenTraker roadmap inbox.</p>
          <div className="mt-4 grid gap-3">
            <AppInput
              placeholder="Title"
              value={featureTitle}
              onChange={(event) => setFeatureTitle(event.target.value)}
            />
            <AppInput
              placeholder="Content"
              value={featureContent}
              onChange={(event) => setFeatureContent(event.target.value)}
            />
            <AppButton onClick={() => void submitFeature()}>
              Submit Request
            </AppButton>
          </div>
          {featureMessage ? (
            <div className="mt-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {featureMessage}
            </div>
          ) : null}
          {featureError ? (
            <div className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {featureError}
            </div>
          ) : null}
        </AppCard>
      </div>

      {settingsMessage ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {settingsMessage}
        </div>
      ) : null}
      {settingsError ? (
        <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {settingsError}
        </div>
      ) : null}
      {orgMessage ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {orgMessage}
        </div>
      ) : null}
      {orgError ? (
        <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {orgError}
        </div>
      ) : null}
    </div>
  )
}
