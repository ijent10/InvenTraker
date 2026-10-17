# Stripe billing readiness — October 17, 2026

## Approved pricing structure

Each subscription tier includes a defined number of stores and a defined employee allowance **per store**. Extra stores and employees above a store's allowance add recurring charges. Unused employee allowances do not pool between stores. The user has proposed the following tier terms; this draft is not connected to Checkout or entitlements yet:

| Tier | Monthly base price (USD) | Included stores | Included employees per store | Assistant | Health checks | Files | Brand customization |
| --- | ---: | ---: | ---: | --- | --- | --- | --- |
| Builder | $50 | 1 | 5 | No | No | No | No |
| Basic | Undecided | 2 | 10 | No | Yes | Yes | Undecided |
| Pro | $200 | 5 | 30 | Yes | Yes* | Yes* | Undecided |

`*` Pro inheriting Basic's health checks/files is the working interpretation of tier progression, not a separately confirmed feature list. Store and employee add-on prices for every tier are undecided. Employee allowances above use the previously confirmed per-store rule. An employee counts only at their primary store. The existing $99/month Basic sandbox price is not automatically adopted. Legacy signup names Starter/Growth/Scale have not been changed until the full catalog, feature rules and migration mapping are finalized.

Proposed calculation:

- Base tier quantity: 1.
- Additional store quantity: `max(0, activeBillableStores - includedStores)`.
- Additional employee quantity: `sum(max(0, billableEmployeesAtStore - includedEmployeesPerStore))`.
- A paid additional store receives the same per-store employee allowance; this interpretation needs confirmation with the final pricing terms.

Illustration only: a tier including 2 stores and 5 employees per store, with 3 stores containing 4, 8 and 6 employees, produces 1 additional store and 4 additional employees. These are example allowances, not configured commercial terms.

`src/lib/billing/quantities.ts` implements a pure preview calculator with the user-confirmed `primary_store` rule: an employee counts only at their primary store, regardless of other store assignments. An attempt to select per-assignment billing is rejected. Employee/store records and assignments must be unique; primary-store mode rejects missing or invalid primary assignments. Unassigned employees are reported separately. This helper is not wired to checkout and creates no charges. Before use, the server must provide a complete authorized snapshot, applying the agreed active employee/owner/invitation/archived-store rules.

## Existing implementation and launch blockers

Repository review found Starter/Growth/Scale signup recommendations and routes for signup Checkout, administrator Checkout and the Customer Portal. Signup currently multiplies one price by employee count. That does not implement the approved base-plus-store-plus-employee model. Local Stripe environment values are empty; this does not establish whether production or the Stripe account is configured.

The portal route currently accepts a browser-supplied email, finds or creates a Stripe customer and opens a session without a server-side ownership check. Administrator Checkout similarly accepts customer details without authenticating the actor. These routes must be secured before enabling billing. Resolve an authenticated organization owner or authorized platform administrator to a persisted organization/customer mapping; never grant portal access through an arbitrary email. Use a configured trusted return origin rather than a supplied Origin header. Existing administrator UI calls also need authenticated headers and explicit organization identity.

No Stripe webhook route was found. Successful redirect/finalize logic cannot keep renewals, payment failures, cancellations or portal changes synchronized. Signed, replay-safe webhooks and durable event receipts are launch requirements, with current subscription state fetched for ordering-sensitive updates. Map customers/subscriptions through persisted Stripe IDs and verified organization ownership, not browser metadata alone. Decide grace-period and access policies explicitly before enforcing delinquency restrictions.

## Implementation sequence

1. Finalize tier allowance counts, base/store/employee prices, billing interval, employee eligibility, primary-store changes and change/proration policy. Confirm treatment of extra stores' employee allowance. Show a complete per-store charge preview before purchase or quantity changes.
2. The user reconnected Stripe and selected **InvenTracker sandbox** for development. A read-only catalog review succeeded: one active Basic Product (`prod_U1a50Ma0yonK6y`) and one licensed USD monthly Price (`price_1T3WvjHsUcqxCaTs1CkqctBm`) at $99/month. No other catalog records were returned (`has_more: false`). The selected sandbox also returned no webhook endpoints and no Customer Portal configurations. No catalog or account settings were changed, and the live account was not inspected. Basic has not been mapped to the app's Starter/Growth/Scale tiers or adopted as approved commercial pricing. Retain these findings to avoid duplicate products. Use this isolated sandbox and a restricted server key stored through Firebase secrets; never paste keys into chat.
3. Use one subscription with a base tier item and positive store/employee overage quantities, with compatible recurring intervals and currency. Model each tier as a separate Product; give add-ons clear line-item names. Persist the price catalog server-side with versions; browser-supplied prices or quantities are not authoritative. Zero overage items are omitted/removed rather than defaulting to one.
4. Implement secure organization-bound Checkout and Customer Portal, signed webhook processing for checkout completion and async success, subscription lifecycle, invoice paid and invoice payment failure. Checkout success alone must not enable service. Do not enable new live checkout until the ownership and webhook requirements are complete.
5. Recalculate allowed quantities from trusted store/employee changes using idempotency, a full snapshot and a durable sync job. Define proration timing before changing subscriptions. Restrict portal quantity controls so they cannot bypass application allowances; keep cancellation/payment-method/invoice self-service available as agreed.
6. Exercise signup, trial transition, additional stores/employees, cross-store assignment, upgrade/downgrade, cancellation, failed payment, retry and duplicate/out-of-order events in the sandbox. Configure tax collection only after reviewing applicable registrations; no tax setting is enabled by this work. Release live billing only after these checks and final commercial terms.

## Official references

- [Subscription quantities and multiple products](https://docs.stripe.com/billing/subscriptions/quantities)
- [Customer Portal authentication and integration](https://docs.stripe.com/customer-management/integrate-customer-portal)
- [Subscription lifecycle webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Isolated Stripe sandboxes](https://docs.stripe.com/sandboxes)
- [Collect taxes for recurring payments](https://docs.stripe.com/billing/taxes/collect-taxes)
