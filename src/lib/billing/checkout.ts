import { randomBytes } from "node:crypto"
import { MobileApiError } from "@/lib/mobile-api"
import { billingConfigured, billingCustomerKey, billingOrigin, billingQuote, sandboxStripe, verifyCatalog, type BillingPrincipal } from "./server"
import type { BillingTier } from "./plans"
import catalog from "./stripe-sandbox-catalog.json"

export async function startBillingCheckout(principal: BillingPrincipal, input: { tierId: BillingTier; requestId: string; quoteFingerprint: string }) {
  if (!billingConfigured()) throw new MobileApiError("Sandbox billing is awaiting secure server configuration.", 503, "billing_not_configured")
  const quote = await billingQuote(principal, input.tierId)
  if (!quote.quantities.stores.length) throw new MobileApiError("Add a store before subscribing.", 409, "store_required")
  if (quote.fingerprint !== input.quoteFingerprint) throw new MobileApiError("Store or employee counts changed. Review the updated price before checkout.", 409, "billing_quote_changed")
  const stripe = sandboxStripe()
  const prices = await verifyCatalog(stripe, input.tierId)
  const accountRef = principal.db.collection("billingAccounts").doc(principal.orgId)
  const requestRef = principal.db.collection("billingCheckoutRequests").doc(`${principal.orgId}-${input.requestId}`)
  const lockRef = principal.db.collection("billingCheckoutLocks").doc(principal.orgId)
  const saved = await principal.db.runTransaction(async (transaction) => {
    const [account, previous, lock] = await Promise.all([transaction.get(accountRef), transaction.get(requestRef), transaction.get(lockRef)])
    if (account.data()?.subscriptionId && !["canceled", "incomplete_expired"].includes(String(account.data()?.subscriptionStatus))) throw new MobileApiError("This organization already has a subscription. Use Manage billing.", 409, "subscription_exists")
    if (!account.exists && principal.org.data()?.stripeCustomerId) throw new MobileApiError("An existing billing link needs verification before creating another subscription. Contact support.", 409, "billing_migration_required")
    if (previous.exists) {
      if (previous.data()?.quoteFingerprint !== input.quoteFingerprint || previous.data()?.actorId !== principal.uid) throw new MobileApiError("This checkout request belongs to different details.", 409, "checkout_conflict")
      if (Number(previous.data()?.expiresAt) <= Math.floor(Date.now() / 1000)) throw new MobileApiError("This checkout expired. Refresh the quote to start again.", 409, "checkout_expired")
      return previous.data()!
    }
    if (lock.exists && Number(lock.data()?.expiresAt) > Math.floor(Date.now() / 1000)) throw new MobileApiError("Another checkout is already open for this organization. Complete it or wait for it to expire.", 409, "checkout_in_progress")
    const value = { orgId: principal.orgId, actorId: principal.uid, requestId: input.requestId, quoteFingerprint: input.quoteFingerprint, tierId: input.tierId, quote, origin: billingOrigin(), integrationIdentifier: `inventraker_sandbox_${Array.from(randomBytes(8), (byte) => String.fromCharCode(97 + byte % 26)).join("")}`, expiresAt: Math.floor(Date.now() / 1000) + 1800, createdAt: new Date().toISOString() }
    transaction.create(requestRef, value)
    transaction.set(lockRef, { requestId: input.requestId, expiresAt: value.expiresAt })
    return value
  })
  if ("url" in saved && typeof saved.url === "string") return { url: saved.url }
  let account = (await accountRef.get()).data()
  if (!account?.customerId) {
    const customer = await stripe.customers.create({ name: String(principal.org.data()?.companyName ?? principal.orgId) }, { idempotencyKey: `inventraker:sandbox:customer:${principal.orgId}:v1` })
    if (customer.livemode) throw new Error("A sandbox customer is required.")
    await principal.db.runTransaction(async (transaction) => {
      const existing = await transaction.get(accountRef)
      if (existing.data()?.customerId && existing.data()?.customerId !== customer.id) throw new Error("Customer ownership conflict")
      transaction.set(accountRef, { orgId: principal.orgId, customerId: customer.id, stripeAccountId: catalog.accountId, livemode: false, updatedAt: new Date().toISOString() }, { merge: true })
      transaction.set(principal.db.collection("billingCustomers").doc(billingCustomerKey(customer.id)), { orgId: principal.orgId, customerId: customer.id, stripeAccountId: catalog.accountId, livemode: false })
    })
    account = (await accountRef.get()).data()
  }
  if (account?.stripeAccountId !== catalog.accountId || account?.livemode !== false) throw new Error("Billing account does not belong to this sandbox.")
  const customer = await stripe.customers.retrieve(account.customerId)
  if (customer.deleted) throw new Error("The billing customer was deleted.")
  const lineItems = [{ price: prices.base, quantity: 1 }, ...(quote.quantities.additionalStoreQuantity ? [{ price: prices.store, quantity: quote.quantities.additionalStoreQuantity }] : []), ...(quote.quantities.additionalEmployeeQuantity ? [{ price: prices.employee, quantity: quote.quantities.additionalEmployeeQuantity }] : [])]
  const session = await stripe.checkout.sessions.create({ mode: "subscription", customer: account.customerId, line_items: lineItems, billing_address_collection: "required", success_url: `${saved.origin}/account/billing?checkout=success`, cancel_url: `${saved.origin}/account/billing?checkout=cancelled`, expires_at: saved.expiresAt, integration_identifier: saved.integrationIdentifier, subscription_data: { billing_mode: { type: "flexible" } }, client_reference_id: principal.orgId }, { idempotencyKey: `inventraker:sandbox:checkout:${principal.orgId}:${input.requestId}` })
  if (!session.url || session.livemode) throw new Error("A sandbox checkout URL was not returned.")
  await requestRef.set({ sessionId: session.id, url: session.url, customerId: account.customerId }, { merge: true })
  return { url: session.url }
}
