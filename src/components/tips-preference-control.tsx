"use client"

import { useEffect, useState } from "react"
import { Info } from "lucide-react"

import { Button, Panel, StatusPill } from "@/components/ui"
import { readCloudWorkspacePreferences, writeCloudWorkspacePreferences } from "@/lib/cloud-preferences"
import { readStoredTipsPreference, storeTipsPreference } from "@/lib/tips"

export function TipsPreferenceControl() {
  const [showTips, setShowTips] = useState(true)
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setShowTips(readStoredTipsPreference())
    readCloudWorkspacePreferences()
      .then((preferences) => {
        if (typeof preferences?.showTips === "boolean") {
          setShowTips(preferences.showTips)
          storeTipsPreference(preferences.showTips)
        }
      })
      .catch(() => {
        setShowTips(readStoredTipsPreference())
      })
  }, [])

  async function updateTips(nextValue: boolean) {
    setShowTips(nextValue)
    setMessage("")
    storeTipsPreference(nextValue)
    setSaving(true)

    const synced = await writeCloudWorkspacePreferences({ showTips: nextValue }).catch(() => false)
    setMessage(synced ? "Tip preference saved to the database." : "Tip preference saved in this browser. Sign in to sync it across devices.")
    setSaving(false)
  }

  return (
    <Panel className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-[var(--app-text)]">
            <Info className="h-5 w-5 text-[var(--app-accent)]" />
            Tips and summaries
          </h2>
          <p className="app-tip mt-1 max-w-3xl text-sm leading-6 text-[var(--app-muted)]">
            Control whether helper descriptions, page summaries, and explanatory notes appear throughout your workspace.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={showTips ? "blue" : "neutral"}>{showTips ? "Tips on" : "Tips off"}</StatusPill>
          <Button variant={showTips ? "secondary" : "primary"} disabled={saving} onClick={() => void updateTips(!showTips)}>
            {showTips ? "Turn tips off" : "Turn tips on"}
          </Button>
        </div>
      </div>
      {message ? <p className="mt-3 text-sm font-semibold text-[var(--app-muted)]">{message}</p> : null}
    </Panel>
  )
}
