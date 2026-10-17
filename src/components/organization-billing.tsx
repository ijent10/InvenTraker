"use client"
import { useEffect, useRef, useState } from "react"
import { useAuthSession } from "@/lib/auth-session"
import { billingPlans } from "@/lib/billing/tiers"

type Tier = keyof typeof billingPlans
type Quote = { fingerprint: string; baseCents: number; storeCents: number; employeeCents: number; totalCents: number; extraStoreUnitCents: number; extraEmployeeUnitCents: number; storeNames: Record<string, string>; quantities: { additionalStoreQuantity: number; additionalEmployeeQuantity: number; stores: { storeId: string; employees: number; includedEmployees: number; additionalEmployees: number }[] } }
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)
export function OrganizationBilling() {
  const session = useAuthSession()
  const [tier, setTier] = useState<Tier>("builder")
  const [quote, setQuote] = useState<Quote | null>(null)
  const [configured, setConfigured] = useState(false)
  const [subscription, setSubscription] = useState<{ status: string; tierId: Tier | null; renewal: string | null; cancelAtPeriodEnd: boolean } | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const requestId = useRef("")
  const targetOrg = typeof window !== "undefined" && session.platformAdmin ? new URLSearchParams(window.location.search).get("org") || session.orgId : session.orgId
  useEffect(() => {
    const controller = new AbortController()
    setQuote(null); setConfigured(false); setSubscription(null); setMessage(""); requestId.current = crypto.randomUUID()
    if (!session.user || (!session.platformAdmin && session.status !== "ready")) return () => controller.abort()
    const user = session.user
    void (async () => {
      try {
        const token = await user.getIdToken()
        const response = await fetch(`/api/billing/quote?tier=${tier}`, { headers: { Authorization: `Bearer ${token}`, "x-inventracker-org": targetOrg }, signal: controller.signal, cache: "no-store" })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Billing could not be loaded.")
        if (!controller.signal.aborted) { setQuote(data.quote); setConfigured(data.configured); setSubscription(data.subscription) }
      } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Billing could not be loaded.") }
    })()
    return () => controller.abort()
  }, [session.user, session.status, session.platformAdmin, targetOrg, tier, refresh])
  async function open(action: "checkout" | "portal") {
    if (!session.user || !quote) return
    setBusy(true); setMessage("")
    try {
      const response = await fetch(`/api/stripe/${action}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await session.user.getIdToken()}`, "x-inventracker-org": targetOrg }, body: JSON.stringify(action === "checkout" ? { tierId: tier, requestId: requestId.current, quoteFingerprint: quote.fingerprint } : {}) })
      const data = await response.json()
      if (!response.ok || !data.url) throw new Error(data.error || "Billing is temporarily unavailable.")
      window.location.assign(data.url)
    } catch (error) { setMessage(error instanceof Error ? error.message : "Billing is temporarily unavailable.") }
    finally { setBusy(false) }
  }
  return <div className="space-y-6">
    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm">Sandbox setup: these are test subscriptions. Live billing is not enabled.</div>
    <div className="grid gap-4 md:grid-cols-3">{(Object.keys(billingPlans) as Tier[]).map((id) => {
      const plan = billingPlans[id]
      return <button type="button" key={id} aria-pressed={tier === id} disabled={busy} onClick={() => setTier(id)} className={`rounded-2xl border p-5 text-left ${tier === id ? "border-sky-400 bg-sky-400/10" : "border-white/10 bg-white/5"}`}>
        <span className="block text-lg font-semibold">{plan.name}</span><span className="mt-2 block text-2xl font-bold">{money(plan.baseCents)}<span className="text-sm font-normal"> / month</span></span>
        <span className="mt-3 block text-sm">{plan.includedStores} {plan.includedStores === 1 ? "store" : "stores"} · {plan.includedEmployeesPerStore} employees per store</span>
        <span className="mt-2 block text-sm">Extra store: {money(plan.extraStoreCents)}/month<br />Extra employee: {money(plan.extraEmployeeCents)}/month</span>
        <span className="mt-3 block text-sm">{id === "builder" ? "Inventory operations" : id === "basic" ? "Inventory, health checks and files" : "All Basic features, Assistant and branding"}</span>
      </button>
    })}</div>
    <p className="text-sm text-slate-400">Employees count only at their primary store. Each store has its own employee allowance, including additional paid stores. Pending invitations and organization owners are excluded.</p>
    {quote && <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h2 className="text-lg font-semibold">Your monthly price</h2>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><dt>Base plan</dt><dd className="text-right">{money(quote.baseCents)}</dd><dt>{quote.quantities.additionalStoreQuantity} additional stores</dt><dd className="text-right">{money(quote.storeCents)}</dd><dt>{quote.quantities.additionalEmployeeQuantity} additional employees</dt><dd className="text-right">{money(quote.employeeCents)}</dd><dt className="font-semibold">Monthly total before tax</dt><dd className="text-right text-lg font-bold">{money(quote.totalCents)}</dd></dl>
      <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="pb-2 text-left font-semibold">Employees by primary store</caption><thead><tr className="text-slate-400"><th className="py-2">Store</th><th>Employees</th><th>Included</th><th>Additional</th></tr></thead><tbody>{quote.quantities.stores.map((store, index) => <tr key={store.storeId} className="border-t border-white/10"><td className="py-3">{quote.storeNames[store.storeId] || `Store ${index + 1}`}</td><td>{store.employees}</td><td>{store.includedEmployees}</td><td>{store.additionalEmployees}</td></tr>)}</tbody></table></div>
      {subscription && <p className="mt-4 text-sm">Current subscription: {subscription.tierId || "Not started"} · {subscription.status}{subscription.cancelAtPeriodEnd ? " · cancels at period end" : ""}</p>}
      {!configured && <p className="mt-4 text-sm text-amber-200">Checkout is being set up. You can review pricing now; no subscription has been started.</p>}
      <div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={!configured || busy || Boolean(subscription && !["not_started", "canceled", "incomplete_expired"].includes(subscription.status))} onClick={() => void open("checkout")} className="rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Opening…" : "Continue to sandbox checkout"}</button><button type="button" disabled={!configured || busy || !subscription} onClick={() => void open("portal")} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold disabled:opacity-40">Manage billing</button><button type="button" disabled={busy} onClick={() => setRefresh((value) => value + 1)} className="rounded-xl px-4 py-3 text-sm font-semibold">Refresh price</button></div>
      <p className="mt-4 text-xs text-slate-400">Your subscription status updates after payment confirmation. Refresh this page if it has not updated. Changes to store or employee counts need a new review before billing quantities change.</p>
    </div>}
    {message && <p role="alert" className="rounded-xl border border-amber-400/30 p-4 text-sm text-amber-200">{message}</p>}
  </div>
}
