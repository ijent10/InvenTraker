"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, ClipboardList, Clock3, Loader2, Save, Send, X } from "lucide-react"

import { Button, Field, Panel, SelectInput, StatusPill, TextArea, TextInput } from "@/components/ui"
import { writeOrgRecord } from "@/lib/cloud-records"
import { useAuthSession } from "@/lib/auth-session"
import type { InventoryItem, OrderDraft, OrderLine, Product, Vendor } from "@/lib/demo-data"

function moneyToNumber(value: string) {
  const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
}

function lineTotal(line: OrderLine) {
  return moneyToNumber(line.unitCost) * Number(line.quantity || 0)
}

function daysUntil(dateValue: string) {
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return 2
  return Math.max(Math.ceil((date.getTime() - Date.now()) / 86_400_000), 1)
}

function Countdown({ dueAt, onExpired }: { dueAt: string; onExpired?: () => void }) {
  const [remaining, setRemaining] = useState(() => new Date(dueAt).getTime() - Date.now())
  const expiredNotified = useRef(false)

  useEffect(() => {
    function tick() {
      const nextRemaining = new Date(dueAt).getTime() - Date.now()
      setRemaining(nextRemaining)
      if (nextRemaining <= 0 && !expiredNotified.current) {
        expiredNotified.current = true
        onExpired?.()
      }
    }

    tick()
    const interval = window.setInterval(tick, 1000)
    return () => window.clearInterval(interval)
  }, [dueAt, onExpired])

  if (!dueAt || Number.isNaN(new Date(dueAt).getTime())) return <span>Not scheduled</span>
  if (remaining <= 0) return <span>Due now</span>

  const days = Math.floor(remaining / 86_400_000)
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000)
  const minutes = Math.floor((remaining % 3_600_000) / 60_000)
  const seconds = Math.floor((remaining % 60_000) / 1000)

  return (
    <span>
      {days}d {hours}h {minutes}m {seconds}s
    </span>
  )
}

function orderDueLabel(vendor: Vendor) {
  if (!vendor.orderDueAt) return vendor.leadTime === "Next day" ? "Next-day delivery cutoff" : `${vendor.leadTime} lead-time cutoff`

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(vendor.orderDueAt))
}

function expectedArrival(vendor: Vendor) {
  const dueAt = vendor.orderDueAt ? new Date(vendor.orderDueAt) : new Date(Date.now() + 86_400_000)
  const deliveryDate = new Date(dueAt)
  deliveryDate.setDate(deliveryDate.getDate() + daysUntil(vendor.orderDueAt ?? ""))

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(deliveryDate)
}

export function OrderDraftBuilder({
  vendors,
  inventoryItems,
  products,
  orderDrafts,
  initialDraftId
}: {
  vendors: Vendor[]
  inventoryItems: InventoryItem[]
  products: Product[]
  orderDrafts: OrderDraft[]
  initialDraftId?: string
}) {
  const session = useAuthSession()
  const [selectedVendorId, setSelectedVendorId] = useState(vendors[0]?.id ?? "")
  const [activeDraft, setActiveDraft] = useState<OrderDraft | null>(null)
  const [savedMessage, setSavedMessage] = useState("")
  const [saveError, setSaveError] = useState("")
  const [saving, setSaving] = useState(false)

  const selectedVendor = vendors.find((vendor) => vendor.id === selectedVendorId) ?? vendors[0]
  const activeVendor = vendors.find((vendor) => vendor.id === activeDraft?.vendorId || vendor.name === activeDraft?.vendor) ?? selectedVendor

  const productCostByKey = useMemo(() => {
    const costs = new Map<string, string>()
    products.forEach((product) => {
      costs.set(product.name.toLowerCase(), product.lastCost)
      if (product.sku) costs.set(product.sku.toLowerCase(), product.lastCost)
    })
    return costs
  }, [products])

  const estimatedTotal = useMemo(() => (activeDraft?.lines ?? []).reduce((total, line) => total + lineTotal(line), 0), [activeDraft?.lines])
  const minimumTotal = moneyToNumber(activeDraft?.minimum ?? activeVendor?.minimum ?? "$0")
  const minimumGap = Math.max(minimumTotal - estimatedTotal, 0)
  const meetsMinimum = estimatedTotal >= minimumTotal || minimumTotal === 0
  const canCreateOrders = session.can("orders.create")
  const canApproveOrders = session.can("orders.approve")
  const submittedDraft = activeDraft?.status === "Submitted" || activeDraft?.status === "Auto-submitted"
  const effectiveStatus = submittedDraft ? activeDraft.status : meetsMinimum ? "Ready" : "Needs review"

  const minimumRecommendation = useMemo(() => {
    if (!activeDraft || !activeVendor) return ""
    if (meetsMinimum) return "Minimum reached. This draft can be submitted when the order looks right."

    const stableCandidate = activeDraft.lines.find((line) => line.minimumFillCandidate)
    if (stableCandidate) {
      return `${stableCandidate.itemName} was selected as a reasonable minimum-fill item because it is vendor-offered and low risk.`
    }

    return `Still ${formatMoney(minimumGap)} short. Extra ordering is not recommended unless the manager has a stable item from this vendor that can absorb the gap.`
  }, [activeDraft, activeVendor, meetsMinimum, minimumGap])

  useEffect(() => {
    if (!initialDraftId) return
    const draft = orderDrafts.find((candidate) => candidate.id === initialDraftId)
    if (!draft) return
    setSelectedVendorId(draft.vendorId)
    setActiveDraft(draft)
  }, [initialDraftId, orderDrafts])

  function buildSuggestedDraft(vendor: Vendor): OrderDraft {
    const vendorCatalog = new Set((vendor.catalog ?? []).map((sku) => sku.toLowerCase()))
    const offeredItems = inventoryItems.filter((item) => item.vendor === vendor.name && (vendorCatalog.size === 0 || vendorCatalog.has(item.sku.toLowerCase())))
    const seedItems = offeredItems.length > 0 ? offeredItems : inventoryItems.filter((item) => item.vendor === vendor.name)
    const lines: OrderLine[] = seedItems.map((item) => {
      const productCost = productCostByKey.get(item.sku.toLowerCase()) ?? productCostByKey.get(item.name.toLowerCase()) ?? "$0.00"
      const shortage = Math.max(item.par - item.onHand, item.reorderPoint - item.onHand, 0)
      const recommendedQuantity = Math.max(shortage, item.status === "Low" ? item.reorderPoint : 1)

      return {
        id: `${vendor.id}-${item.id}`,
        itemName: item.name,
        sku: item.sku,
        quantity: recommendedQuantity,
        unit: item.unit,
        unitCost: productCost,
        reason:
          item.status === "Low"
            ? `${item.name} is below reorder point. Suggested quantity restores store stock toward par.`
            : `${item.name} is vendor-offered and can be ordered based on par, on-hand stock, and lead time.`,
        vendorOffered: true,
        aiRecommendedQuantity: recommendedQuantity
      }
    })

    const subtotal = lines.reduce((total, line) => total + lineTotal(line), 0)
    const minimum = moneyToNumber(vendor.minimum)
    const gap = Math.max(minimum - subtotal, 0)
    const stableLine = lines.find((line) => {
      const matchingItem = inventoryItems.find((item) => item.sku === line.sku)
      return matchingItem && !matchingItem.expires && moneyToNumber(line.unitCost) > 0
    })

    if (gap > 0 && stableLine && gap <= minimum * 0.35) {
      const extraQuantity = Math.ceil(gap / moneyToNumber(stableLine.unitCost))
      stableLine.quantity += extraQuantity
      stableLine.minimumFillCandidate = true
      stableLine.reason = `${stableLine.reason} Added ${extraQuantity} extra to responsibly reach ${vendor.minimum} minimum; item does not expire.`
    }

    const nextTotal = lines.reduce((total, line) => total + lineTotal(line), 0)
    const dueAt = vendor.orderDueAt ?? new Date(Date.now() + 86_400_000).toISOString()

    return {
      id: `draft-${vendor.id}`,
      vendorId: vendor.id,
      vendor: vendor.name,
      lines,
      items: lines.length,
      estimatedTotal: formatMoney(nextTotal),
      minimum: vendor.minimum,
      status: nextTotal >= minimum ? "Ready" : "Needs review",
      dueBy: orderDueLabel(vendor),
      dueAt,
      expectedArrival: expectedArrival(vendor),
      notes: `Generated from vendor catalog, store par, stock on hand, and ${vendor.minimum} minimum.`,
      autoSubmitAllowed: vendor.autoSubmitAllowed
    }
  }

  function generateDraft() {
    if (!selectedVendor) return
    const existingDraft = orderDrafts.find((draft) => draft.vendorId === selectedVendor.id || draft.vendor === selectedVendor.name)
    setActiveDraft(existingDraft ?? buildSuggestedDraft(selectedVendor))
    setSavedMessage(existingDraft ? `${selectedVendor.name} draft resumed.` : `${selectedVendor.name} draft generated.`)
    setSaveError("")
  }

  function updateLine(lineId: string, nextFields: Partial<OrderLine>) {
    setActiveDraft((current) => {
      if (!current) return current
      const lines = current.lines.map((line) => (line.id === lineId ? { ...line, ...nextFields } : line))
      return { ...current, lines, items: lines.length, estimatedTotal: formatMoney(lines.reduce((total, line) => total + lineTotal(line), 0)) }
    })
  }

  function removeLine(lineId: string) {
    setActiveDraft((current) => {
      if (!current) return current
      const lines = current.lines.filter((line) => line.id !== lineId)
      return { ...current, lines, items: lines.length, estimatedTotal: formatMoney(lines.reduce((total, line) => total + lineTotal(line), 0)) }
    })
  }

  function cancelDraft() {
    setActiveDraft(null)
    setSavedMessage("Draft closed. Nothing was submitted.")
    setSaveError("")
  }

  async function persistDraft(nextStatus: OrderDraft["status"], autoSubmitted = false) {
    if (!activeDraft || !activeVendor) return
    if (nextStatus === "Draft" && !canCreateOrders) {
      setSaveError("You need orders.create permission to save an order draft.")
      return
    }

    if ((nextStatus === "Submitted" || nextStatus === "Auto-submitted") && !canApproveOrders) {
      setSaveError("You need orders.approve permission to submit an order.")
      return
    }

    if ((nextStatus === "Submitted" || nextStatus === "Auto-submitted") && !meetsMinimum) {
      setSaveError(`Submit is locked until the draft reaches ${activeDraft.minimum}.`)
      return
    }

    setSaving(true)
    setSaveError("")
    setSavedMessage("")

    const payload: OrderDraft = {
      ...activeDraft,
      status: nextStatus,
      estimatedTotal: formatMoney(estimatedTotal),
      items: activeDraft.lines.length,
      submittedAt: nextStatus === "Submitted" || nextStatus === "Auto-submitted" ? "Just now" : activeDraft.submittedAt,
      submittedBy: nextStatus === "Submitted" || nextStatus === "Auto-submitted" ? "Ian Jenkins" : activeDraft.submittedBy,
      approvedBy: nextStatus === "Submitted" || nextStatus === "Auto-submitted" ? "Ian Jenkins" : activeDraft.approvedBy,
      autoSubmitAllowed: activeVendor.autoSubmitAllowed
    }

    try {
      await writeOrgRecord("orders", activeDraft.id, { ...payload, source: "web" })
      setActiveDraft(payload)
      setSavedMessage(
        autoSubmitted
          ? `${activeDraft.vendor} order auto-submitted because the cutoff was reached.`
          : nextStatus === "Draft"
            ? `${activeDraft.vendor} draft saved.`
            : `${activeDraft.vendor} order submitted.`
      )
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Order could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  function handleExpired() {
    if (!activeDraft || activeDraft.status === "Submitted" || activeDraft.status === "Auto-submitted") return
    if (!activeDraft.autoSubmitAllowed) {
      setSavedMessage("Cutoff reached. Auto-submit is off for this vendor, so the draft still needs manual review.")
      return
    }
    if (!meetsMinimum) {
      setSaveError(`Cutoff reached, but submit is locked until the draft reaches ${activeDraft.minimum}.`)
      return
    }
    if (!canApproveOrders) {
      setSaveError("Cutoff reached, but orders.approve permission is required before auto-submit can run.")
      return
    }
    void persistDraft("Auto-submitted", true)
  }

  return (
    <Panel id="generate-order" className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-[var(--app-text)]">
            <ClipboardList className="h-5 w-5 text-[var(--app-accent)]" />
            Order draft
          </h2>
          <p className="app-tip mt-1 text-sm leading-6 text-[var(--app-muted)]">
            Select a vendor, generate or resume its draft, review every reason, then save or submit.
          </p>
        </div>
        {activeDraft ? <StatusPill tone={effectiveStatus === "Ready" || effectiveStatus.includes("Submitted") ? "green" : "amber"}>{effectiveStatus}</StatusPill> : null}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-4">
          <Field label="Vendor">
            <SelectInput
              value={selectedVendorId}
              onChange={(event) => {
                setSelectedVendorId(event.target.value)
                setSavedMessage("")
                setSaveError("")
              }}
            >
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </SelectInput>
          </Field>

          {selectedVendor ? (
            <div className="mt-4 rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] p-3 text-sm leading-6 text-[var(--app-muted)]">
              <p className="font-semibold text-[var(--app-text)]">{selectedVendor.name}</p>
              <p>{selectedVendor.leadTime} lead time</p>
              <p>{selectedVendor.minimum} minimum</p>
              <p>{selectedVendor.contact}</p>
              <p className="mt-2 text-xs text-[var(--app-subtle)]">
                Catalog: {selectedVendor.catalog?.join(", ") ?? "Vendor products from inventory"}
              </p>
            </div>
          ) : null}

          <Button className="mt-4 w-full" onClick={generateDraft} disabled={!canCreateOrders} icon={<ClipboardList className="h-4 w-4" />}>
            Generate order
          </Button>
          {!canCreateOrders ? <p className="mt-2 text-xs font-semibold text-amber-300">You need orders.create to generate drafts.</p> : null}
        </div>

        <div className="rounded-md border border-[var(--app-control-border)] bg-[var(--app-control-bg)] p-4">
          {activeDraft ? (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] p-3">
                  <p className="text-xs font-semibold uppercase text-[var(--app-subtle)]">Status</p>
                  <p className="mt-2 font-semibold text-[var(--app-text)]">{effectiveStatus}</p>
                </div>
                <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] p-3">
                  <p className="text-xs font-semibold uppercase text-[var(--app-subtle)]">Due in</p>
                  <p className="mt-2 flex items-center gap-2 font-semibold text-[var(--app-text)]">
                    <Clock3 className="h-4 w-4 text-[var(--app-accent)]" />
                    <Countdown dueAt={activeDraft.dueAt} onExpired={handleExpired} />
                  </p>
                  <p className="mt-1 text-xs text-[var(--app-muted)]">{activeDraft.dueBy}</p>
                </div>
                <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] p-3">
                  <p className="text-xs font-semibold uppercase text-[var(--app-subtle)]">Minimum</p>
                  <p className="mt-2 font-semibold text-[var(--app-text)]">{activeDraft.minimum}</p>
                  <p className="mt-1 text-xs text-[var(--app-muted)]">{meetsMinimum ? "Reached" : `${formatMoney(minimumGap)} short`}</p>
                </div>
                <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] p-3">
                  <p className="text-xs font-semibold uppercase text-[var(--app-subtle)]">Arrival</p>
                  <p className="mt-2 font-semibold text-[var(--app-text)]">{activeDraft.expectedArrival}</p>
                  <p className="mt-1 text-xs text-[var(--app-muted)]">Based on vendor lead time</p>
                </div>
              </div>

              <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-panel)] p-3 text-sm leading-6 text-[var(--app-muted)]">
                <p className="font-semibold text-[var(--app-text)]">Minimum review</p>
                <p className="mt-1">{minimumRecommendation}</p>
              </div>

              <div className="overflow-x-auto rounded-md border border-[var(--app-control-border)]">
                <div className="grid min-w-[940px] grid-cols-[1.35fr_1fr_120px_120px_120px_2fr_44px] gap-2 border-b border-[var(--app-control-border)] bg-[var(--app-panel)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--app-subtle)]">
                  <span>Vendor item</span>
                  <span>SKU</span>
                  <span>Qty</span>
                  <span>Unit</span>
                  <span>Unit cost</span>
                  <span>Reason</span>
                  <span />
                </div>
                {activeDraft.lines.map((line) => (
                  <div
                    key={line.id}
                    className="grid min-w-[940px] grid-cols-[1.35fr_1fr_120px_120px_120px_2fr_44px] gap-2 border-b border-[var(--app-control-border)] px-3 py-3 last:border-b-0"
                  >
                    <div>
                      <p className="font-semibold text-[var(--app-text)]">{line.itemName}</p>
                      {line.minimumFillCandidate ? <p className="mt-1 text-xs text-amber-300">Minimum-fill item</p> : null}
                    </div>
                    <p className="text-sm text-[var(--app-muted)]">{line.sku}</p>
                    <TextInput
                      type="number"
                      min="0"
                      value={line.quantity}
                      disabled={submittedDraft}
                      onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) })}
                    />
                    <p className="text-sm text-[var(--app-muted)]">{line.unit}</p>
                    <p className="text-sm font-semibold text-[var(--app-text)]">{line.unitCost}</p>
                    <p className="text-sm leading-5 text-[var(--app-muted)]">{line.reason}</p>
                    <Button variant="ghost" className="px-2" aria-label={`Remove ${line.itemName}`} onClick={() => removeLine(line.id)} disabled={submittedDraft}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Field label="Order notes">
                <TextArea
                  value={activeDraft.notes ?? ""}
                  disabled={submittedDraft}
                  onChange={(event) => setActiveDraft((current) => (current ? { ...current, notes: event.target.value } : current))}
                />
              </Field>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-[var(--app-muted)]">Estimated total</p>
                  <p className="mt-1 text-2xl font-semibold text-[var(--app-text)]">{formatMoney(estimatedTotal)}</p>
                  {activeDraft.submittedAt ? (
                    <p className="mt-1 text-xs text-[var(--app-muted)]">
                      Submitted by {activeDraft.submittedBy ?? "Unknown"} at {activeDraft.submittedAt}
                    </p>
                  ) : null}
                </div>
                {submittedDraft ? (
                  <StatusPill tone="green">Submitted orders are locked</StatusPill>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={cancelDraft} disabled={saving}>
                      Cancel
                    </Button>
                    <Button variant="secondary" onClick={() => persistDraft("Draft")} disabled={saving || !canCreateOrders} icon={<Save className="h-4 w-4" />}>
                      Save draft
                    </Button>
                    <Button
                      onClick={() => persistDraft("Submitted")}
                      disabled={saving || !meetsMinimum || !canApproveOrders}
                      icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    >
                      Submit
                    </Button>
                  </div>
                )}
              </div>

              {!canApproveOrders ? <p className="text-xs font-semibold text-amber-300">Submit is hidden behind orders.approve permission.</p> : null}

              {savedMessage ? (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-300">
                  <CheckCircle2 className="mr-2 inline h-4 w-4" />
                  {savedMessage}
                </div>
              ) : null}
              {saveError ? (
                <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-300">
                  {saveError}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-md border border-dashed border-[var(--app-control-border)] p-6 text-center">
              <ClipboardList className="h-8 w-8 text-[var(--app-accent)]" />
              <h3 className="mt-3 font-semibold text-[var(--app-text)]">Choose a vendor and generate an order</h3>
              <p className="app-tip mt-2 max-w-md text-sm leading-6 text-[var(--app-muted)]">
                Drafts load from vendor-offered products only. Existing drafts resume where you left off.
              </p>
              {savedMessage ? <p className="mt-3 text-sm font-semibold text-emerald-300">{savedMessage}</p> : null}
            </div>
          )}
        </div>
      </div>
    </Panel>
  )
}
