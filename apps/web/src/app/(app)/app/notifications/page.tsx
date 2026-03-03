"use client"

import { useEffect, useMemo, useState } from "react"
import { AppButton, AppCard, AppCheckbox, AppInput, AppTextarea, TipBanner } from "@inventracker/ui"
import { useQuery } from "@tanstack/react-query"

import { PageHead } from "@/components/page-head"
import { useAuthUser } from "@/hooks/use-auth-user"
import { useOrgContext } from "@/hooks/use-org-context"
import {
  createOrgNotification,
  fetchOrgNotifications,
  fetchOrgSettings,
  fetchStoreSettings,
  uploadMediaAsset,
  type RoleTemplateRecord
} from "@/lib/data/firestore"
import {
  removeOrgNotificationByCallable,
  sendOrgNotification,
  type SendOrgNotificationRequest
} from "@/lib/firebase/functions"

type RoleOption = RoleTemplateRecord & {
  source: "org" | "store"
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    const code = String((error as { code?: string }).code ?? "").toLowerCase()
    const rawMessage = String((error as { message?: string }).message ?? "").trim()
    const normalized = rawMessage.toLowerCase()

    if (code.includes("permission-denied")) {
      return "You do not have permission to perform that action."
    }
    if (code.includes("unauthenticated")) {
      return "Your session expired. Please sign in again."
    }
    if (normalized === "internal" || code.includes("internal")) {
      return fallback
    }
    if (rawMessage.length > 0) {
      return rawMessage
    }
  }
  return fallback
}

export default function NotificationsPage() {
  const { user } = useAuthUser()
  const { activeOrgId, activeStore, activeStoreId, effectivePermissions } = useOrgContext()

  const [name, setName] = useState("")
  const [content, setContent] = useState("")
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [targetRoleTitles, setTargetRoleTitles] = useState<string[]>([])
  const [delivery, setDelivery] = useState<"immediate" | "scheduled">("immediate")
  const [scheduledDate, setScheduledDate] = useState("")
  const [scheduledTime, setScheduledTime] = useState("09:00")
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)

  const { data: orgSettings } = useQuery({
    queryKey: ["notifications-org-settings", activeOrgId],
    queryFn: () => fetchOrgSettings(activeOrgId),
    enabled: Boolean(activeOrgId)
  })

  const { data: storeSettings } = useQuery({
    queryKey: ["notifications-store-settings", activeOrgId, activeStore?.id],
    queryFn: () => fetchStoreSettings(activeOrgId, activeStore!),
    enabled: Boolean(activeOrgId && activeStore)
  })

  const { data: notifications = [], refetch } = useQuery({
    queryKey: ["notifications", activeOrgId, activeStoreId],
    queryFn: () => fetchOrgNotifications(activeOrgId, activeStoreId || undefined),
    enabled: Boolean(activeOrgId)
  })

  const roleOptions = useMemo<RoleOption[]>(() => {
    const options: RoleOption[] = [
      {
        id: "builtin-owner",
        title: "Owner",
        baseRole: "Owner",
        permissionFlags: {},
        source: "org"
      }
    ]
    for (const role of orgSettings?.jobTitles ?? []) {
      options.push({ ...role, source: "org" })
    }
    for (const role of storeSettings?.jobTitles ?? []) {
      options.push({ ...role, source: "store" })
    }

    const seen = new Set<string>()
    return options.filter((entry) => {
      const key = entry.title.trim().toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [orgSettings?.jobTitles, storeSettings?.jobTitles])

  useEffect(() => {
    if (roleOptions.length === 0) {
      setTargetRoleTitles([])
      return
    }
    setTargetRoleTitles((previous) => {
      if (previous.length > 0) return previous
      return roleOptions.map((role) => role.title)
    })
  }, [roleOptions])

  const resetForm = () => {
    setName("")
    setContent("")
    setAttachmentFile(null)
    setTargetRoleTitles([])
    setDelivery("immediate")
    setScheduledDate("")
    setScheduledTime("09:00")
  }

  const resolveAssetType = (file: File): "image" | "video" | "pdf" | "file" => {
    const type = file.type.toLowerCase()
    const name = file.name.toLowerCase()
    if (type.startsWith("image/")) return "image"
    if (type.startsWith("video/")) return "video"
    if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf"
    return "file"
  }

  const send = async () => {
    if (!activeOrgId || !user?.uid || isSending) return
    setStatusMessage(null)
    setErrorMessage(null)

    if (!name.trim()) {
      setErrorMessage("Name is required.")
      return
    }
    if (!content.trim()) {
      setErrorMessage("Content is required.")
      return
    }
    const assetType = attachmentFile ? resolveAssetType(attachmentFile) : null
    const effectiveRoleTargets =
      targetRoleTitles.length > 0 ? targetRoleTitles : roleOptions.map((role) => role.title)
    if (!effectiveRoleTargets.length) {
      setErrorMessage("Create at least one role before sending notifications.")
      return
    }

    let scheduledFor: Date | undefined
    if (delivery === "scheduled") {
      if (!scheduledDate || !scheduledTime) {
        setErrorMessage("Choose both date and time for a scheduled notification.")
        return
      }
      const parsed = new Date(`${scheduledDate}T${scheduledTime}`)
      if (Number.isNaN(parsed.getTime())) {
        setErrorMessage("Scheduled date/time is invalid.")
        return
      }
      scheduledFor = parsed
    }

    try {
      setIsSending(true)
      const uploadedAsset = attachmentFile
        ? await uploadMediaAsset({
            file: attachmentFile,
            orgId: activeOrgId,
            storeId: activeStoreId || undefined,
            userId: user.uid,
            type: assetType ?? "file"
          })
        : null
      if (attachmentFile && !uploadedAsset) {
        setErrorMessage("Could not upload the file.")
        return
      }

      const requestPayload: SendOrgNotificationRequest = {
        orgId: activeOrgId,
        name,
        content,
        roleTargets: effectiveRoleTargets,
        dispatchMode: delivery,
        senderName: user.displayName ?? user.email ?? ""
      }

      if (activeStoreId) {
        requestPayload.storeId = activeStoreId
      }
      if (scheduledFor) {
        requestPayload.scheduledFor = scheduledFor.toISOString()
      }
      if (uploadedAsset) {
        requestPayload.attachmentAssetId = uploadedAsset.id
        requestPayload.attachmentName = uploadedAsset.originalName
        requestPayload.attachmentUrl = uploadedAsset.downloadUrl
        requestPayload.attachmentContentType = uploadedAsset.contentType
        requestPayload.attachmentSizeBytes = uploadedAsset.sizeBytes
      }

      try {
        const callableResult = await sendOrgNotification(requestPayload)
        if (!callableResult?.ok) {
          throw new Error("Callable send failed.")
        }
      } catch (callableError) {
        // Compatibility fallback for older deployed callables.
        await createOrgNotification(activeOrgId, user.uid, {
          name,
          content,
          roleTargets: effectiveRoleTargets,
          dispatchMode: delivery,
          scheduledFor,
          storeId: activeStoreId || undefined,
          senderName: user.displayName ?? user.email ?? "",
          attachmentAssetId: uploadedAsset?.id,
          attachmentName: uploadedAsset?.originalName,
          attachmentUrl: uploadedAsset?.downloadUrl,
          attachmentContentType: uploadedAsset?.contentType,
          attachmentSizeBytes: uploadedAsset?.sizeBytes
        })
        void callableError
      }
      await refetch()
      setStatusMessage(delivery === "scheduled" ? "Notification scheduled." : "Notification sent.")
      resetForm()
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Could not send notification."))
    } finally {
      setIsSending(false)
    }
  }

  if (!effectivePermissions.sendNotifications) {
    return (
      <div>
        <PageHead title="Notifications" subtitle="Send messages to selected roles." />
        <AppCard>
          <p className="secondary-text">You do not have permission to send notifications.</p>
        </AppCard>
      </div>
    )
  }

  return (
    <div>
      <PageHead title="Notifications" subtitle="Create immediate or scheduled notifications by role." />
      <div className="space-y-4">
        <TipBanner
          title="Tip"
          message="Use scheduled notifications for opening tasks and immediate notifications for urgent updates."
          accentColor="#10B981"
        />

        <div className="grid gap-4 xl:grid-cols-[1.2fr_1.8fr]">
          <AppCard>
            <h2 className="card-title">New Notification</h2>
            <div className="mt-4 grid gap-3">
              <AppInput placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} />
              <AppTextarea
                placeholder="Content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
              <div className="rounded-2xl border border-app-border p-3">
                <p className="mb-2 text-sm font-semibold">Attachment file</p>
                <AppInput
                  type="file"
                  className="h-auto border-dashed py-2"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null
                    setAttachmentFile(file)
                  }}
                />
                {attachmentFile ? (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-app-border bg-app-surface-soft px-3 py-2">
                    <p className="truncate text-sm">{attachmentFile.name}</p>
                    <AppButton className="h-8 px-2 text-xs" variant="secondary" onClick={() => setAttachmentFile(null)}>
                      Remove
                    </AppButton>
                  </div>
                ) : (
                  <p className="secondary-text mt-2 text-xs">Optional: attach any file.</p>
                )}
              </div>

              <div className="rounded-2xl border border-app-border p-3">
                <p className="mb-2 text-sm font-semibold">Roles to receive</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {roleOptions.map((roleOption) => {
                    const checked = targetRoleTitles.includes(roleOption.title)
                    return (
                      <AppCheckbox
                        key={`${roleOption.source}-${roleOption.id}`}
                        checked={checked}
                        onChange={(event) =>
                          setTargetRoleTitles((prev) => {
                            if (event.target.checked) return [...new Set([...prev, roleOption.title])]
                            return prev.filter((entry) => entry !== roleOption.title)
                          })
                        }
                        label={roleOption.title}
                      />
                    )
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-app-border p-3">
                <p className="mb-2 text-sm font-semibold">Delivery</p>
                <div className="grid grid-cols-2 gap-2">
                  <AppButton
                    className={`w-full ${delivery === "immediate" ? "!border-[color:var(--accent)] !text-[color:var(--app-text)]" : ""}`}
                    variant="secondary"
                    onClick={() => setDelivery("immediate")}
                  >
                    Immediate
                  </AppButton>
                  <AppButton
                    className={`w-full ${delivery === "scheduled" ? "!border-[color:var(--accent)] !text-[color:var(--app-text)]" : ""}`}
                    variant="secondary"
                    onClick={() => setDelivery("scheduled")}
                  >
                    Scheduled
                  </AppButton>
                </div>

                {delivery === "scheduled" ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <AppInput
                      type="date"
                      value={scheduledDate}
                      onChange={(event) => setScheduledDate(event.target.value)}
                    />
                    <AppInput
                      type="time"
                      value={scheduledTime}
                      onChange={(event) => setScheduledTime(event.target.value)}
                    />
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <AppButton onClick={() => void send()} disabled={isSending}>
                  {isSending ? "Sending..." : "Send"}
                </AppButton>
                <AppButton variant="secondary" onClick={resetForm}>
                  Reset
                </AppButton>
              </div>
            </div>
          </AppCard>

          <AppCard>
            <h2 className="card-title">Recent Notifications</h2>
            <div className="mt-4 space-y-2">
              {notifications.length === 0 ? (
                <p className="secondary-text">No notifications yet.</p>
              ) : (
                notifications.map((entry) => {
                  const canCancelScheduled =
                    entry.dispatchMode === "scheduled" && String(entry.status).toLowerCase() === "queued"

                  return (
                    <div key={entry.id} className="rounded-xl border border-app-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{entry.name}</p>
                          <p className="text-xs text-app-muted">{entry.content}</p>
                        </div>
                        <span className="rounded-full border border-app-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-app-muted">
                          {entry.status}
                        </span>
                      </div>
                      {entry.attachmentName ? (
                        <div className="mt-2">
                          {entry.attachmentUrl ? (
                            <a
                              href={entry.attachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center rounded-lg border border-app-border px-2 py-1 text-xs text-accent hover:bg-app-surface-soft"
                            >
                              {entry.attachmentName}
                            </a>
                          ) : (
                            <p className="text-xs text-app-muted">{entry.attachmentName}</p>
                          )}
                        </div>
                      ) : null}
                      <p className="secondary-text mt-2 text-xs">
                        Roles: {entry.roleTargets.join(", ") || "All"}
                        {entry.dispatchMode === "scheduled" && entry.scheduledFor
                          ? ` · Scheduled ${entry.scheduledFor.toLocaleString()}`
                          : " · Immediate"}
                      </p>
                      {canCancelScheduled ? (
                        <div className="mt-3 flex justify-end">
                          <AppButton
                            variant="secondary"
                            className="!h-8 !border-rose-500/40 !px-3 !text-rose-300"
                            onClick={() => {
                              void (async () => {
                                if (!activeOrgId) return
                                setStatusMessage(null)
                                setErrorMessage(null)
                                try {
                                  const result = await removeOrgNotificationByCallable({
                                    orgId: activeOrgId,
                                    notificationId: entry.id
                                  })
                                  if (!result?.ok) {
                                    setErrorMessage("Only queued scheduled notifications can be removed.")
                                    return
                                  }
                                  await refetch()
                                  setStatusMessage("Scheduled notification removed.")
                                } catch (error) {
                                  setErrorMessage(getErrorMessage(error, "Could not remove notification."))
                                }
                              })()
                            }}
                          >
                            Cancel
                          </AppButton>
                        </div>
                      ) : null}
                    </div>
                  )
                })
              )}
            </div>
          </AppCard>
        </div>

        {statusMessage ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {statusMessage}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </div>
  )
}
