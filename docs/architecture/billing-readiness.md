# InvenTraker sandbox billing setup — October 17, 2026

## Confirmed monthly USD pricing

| Tier | Base | Stores included | Employees per store | Extra store | Extra employee |
| --- | ---: | ---: | ---: | ---: | ---: |
| Builder | $49.99 | 1 | 5 | $20 | $5 |
| Basic | $99.99 | 2 | 10 | $10 | $3 |
| Pro | $199.99 | 5 | 30 | $7 | $2 |

Builder excludes Assistant, branding, health checks and files. Basic adds health checks and files. Pro includes Basic's features plus Assistant and brand customization. The prior per-store allowances are retained. Employees count only at their primary store; unused allowances do not pool between stores. An additional paid store receives its tier's employee allowance. Active organization owners and pending invitations are excluded from employee counts; active staff without a valid primary store block checkout pending assignment review.

The reviewed monthly amount is `base + max(0, stores - includedStores) × extraStorePrice + sum(max(0, employeesAtPrimaryStore - perStoreAllowance)) × extraEmployeePrice`. Amounts use integer cents. These are licensed subscription quantities, not metered AI usage. Taxes are not included in the quote, and automatic tax has not been activated.

## Stripe sandbox resources

The user selected `InvenTracker sandbox` (`acct_1T3WpWHsUcqxCaTs`). Live mode is untouched.

- Nine active monthly prices were created and read back to verify currency, amount, active status and sandbox mode. One Product per tier and clearly named tier-specific store/employee add-on Products keep invoice lines distinct. IDs are in `src/lib/billing/stripe-sandbox-catalog.json`.
- The existing Basic Product was reused. Its new default price is $99.99; the former $99 sandbox price was archived, not deleted.
- Customer Portal configuration allows invoice history, payment method/customer details and cancellation at period end. Subscription/quantity editing is disabled so customers cannot bypass the app's allowances.
- A sandbox webhook endpoint targets `/api/stripe/webhook` on the Firebase hosted domain, using API version `2026-09-30.endive`. Its signing secret was sent directly to Google Secret Manager without printing it. An initial setup attempt that did not install its secret was disabled.
- Secret containers: `inventraker-stripe-sandbox-key` and `inventraker-stripe-sandbox-webhook-secret`. Runtime and Firebase App Hosting service accounts have secret access. The user stored sandbox server key version 1; its sandbox account identity was verified without printing the key. Both secrets are attached at runtime. No Stripe key belongs in chat, source files or public environment variables. The currently supplied sandbox key is an unrestricted test secret; replace it with a least-privilege restricted key before a live launch.

## Implemented application boundary

`/account/billing` shows all plans, per-store employee counts, included allowances, add-ons and the total before tax. Quote requests recheck Firebase identity, organization ownership or platform-admin authority. Employee callers cannot open billing for an owner. Browser prices, seat counts and owner emails are never authoritative. Return addresses come from trusted application configuration.

Checkout refreshes the trusted organization snapshot and compares the reviewed quote fingerprint. A per-organization checkout lease, command IDs and Stripe idempotency keys protect retries/concurrent requests. Quantities of zero are omitted. Stripe account identity and each selected Price are verified before creating a session. The implementation currently supports this sandbox only and refuses live keys/prices/events.

Customer ownership is persisted in Admin-only root `billingAccounts` / `billingCustomers` records. The portal resolves that mapping; arbitrary email lookup/customer creation was removed. Legacy billing links require an explicit verified migration rather than silently duplicating customers. Administrator links now open the organization-specific review page.

The webhook verifies the raw-body signature, handles checkout completion/async success, subscription lifecycle and paid/failed invoices, and retrieves current canonical subscription state. Durable receipts prevent repeated application; a generation fence rejects concurrent stale refreshes for retry. Only verified customer mappings are applied. A second noncurrent subscription is ignored rather than replacing an active subscription. Subscription access state is recorded only for a recognized tier with valid quantities and a paid active or trialing subscription. Cancellations at period end preserve access while the subscription remains active. The platform subscription summary is updated after canonical confirmation; a browser redirect never activates service.

Unauthenticated paid signup/finalize paths were retired in favor of an authenticated organization flow. Free workspace signup remains available, and it no longer creates unverified Stripe customer links or changes an existing Firebase user's password.

## Configuration and remaining release work

`apphosting.yaml` configures sandbox mode, a trusted hosted return address, and both server/signing secrets at runtime. Runtime deployment `build-2026-10-17-008` / `rollout-2026-10-17-008` succeeded for commit `ccb4438`. Checkout creation and the Customer Portal are enabled in the sandbox. A restricted replacement key needs Account, Product, Price, Subscription and Invoice reads, plus Customer, Checkout Session and Customer Portal writes. Store replacements through Google Secret Manager; never paste keys into chat.

Deployed integration checks passed on October 17, using a temporary isolated organization with three stores and eleven employees assigned primarily to one store:

- Builder $119.99, Basic $112.99 and Pro $199.99 quotes matched the approved allowances. Employees also assigned to a second store were counted only at their primary store.
- The app created a sandbox subscription Checkout Session with three correct line items: Builder base $49.99, two extra stores at $20, and six extra employees at $5. Retrying the command returned the same session; a concurrent new command was rejected. The unused session was expired after validation.
- The organization owner could create a portal session; an employee could not. Invalid webhook signatures were rejected.
- A separate API-created subscription on that verified test customer used Stripe's `pm_card_visa` test method. Its $119.99 paid invoice and actual Stripe-originated signed webhooks updated the deployed app's paid state and quantities. Signed replays of the already processed event were idempotent.
- A test payment failure during a prorated quantity update produced `past_due` and removed the recorded paid-access flag. Paying that invoice with the successful test method restored `active` and the flag through webhooks.
- Period-end cancellation retained the recorded paid-access flag; final cancellation removed it through webhooks.
- The test subscription was canceled, its test customer deleted, and the isolated organization, stores, members, mappings, leases, requests, receipts and subscription summary were removed. Real organizations and inventory were not modified.

The hosted Checkout form itself has not been completed in a browser: the browser connection was unavailable. Payment lifecycle testing used Stripe's public sandbox APIs and actual delivery to the deployed webhook, rather than claiming a hosted-form completion. That browser check remains required before calling the whole checkout experience verified.

This is the initial sandbox billing flow, not production launch approval. Automatic store/employee quantity synchronization, plan-change/proration workflow and full feature entitlement enforcement across web/native/API/Firestore remain pending. `usageSyncRequired` marks account state needing reconciliation; it is not an active background worker. Configure tax registrations and tax behavior before enabling collection. No live checkout or production charges are enabled.

## References

- [Subscription quantities and multiple products](https://docs.stripe.com/billing/subscriptions/quantities)
- [Portal authentication and management](https://docs.stripe.com/customer-management/integrate-customer-portal)
- [Subscription lifecycle webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Isolated sandboxes](https://docs.stripe.com/sandboxes)
- [Recurring tax collection](https://docs.stripe.com/billing/taxes/collect-taxes)
- [Firebase runtime secret configuration](https://firebase.google.com/docs/app-hosting/configure)
