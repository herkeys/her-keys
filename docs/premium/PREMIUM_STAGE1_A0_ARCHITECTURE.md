# Her Keys Premium — Stage 1, Milestone A0: Architecture and Authority Contracts

| Item | Value |
| --- | --- |
| Branch | `feature/herkeys-premium-stage1` |
| ENTRY SHA | `c660e5927c934f7bd2c172df5fb691e2075d40ee` (`integration/build2-shared-consumer-repair`, verified current on `origin` at fetch, 2026-10-13) |
| Customer-facing name | **Her Keys Premium** |
| Technical entitlement | `her_keys_plus` (unchanged; stable RevenueCat identifier) |
| Supersedes in part | `docs/builds/BUILD25_MONETIZATION_FOUNDATION.md` §3 (see §3 below) |
| Evidence level of this document | design authority; nothing here is `STAGING_VERIFIED` |

ENTRY baseline: `tsc --noEmit` clean; `npm test` 4109/4112 pass. The 3 failures are the Meals boundary scan
(`[BM1]`, `[BV1]`, `[BV7]`), the stale-ref family the shared-consumer handoff already recorded; none concerns
monetization. Expo Doctor is recorded in the Stage 1 ledger.

**Product rule that every decision below serves:** Premium gates work *performed by Her Keys*, never her ability to
reach and manage her own life. Entitlement authorizes **new Premium computation**; it never gates reading what she
already owns.

---

## 1. Identity authority

| Identity | What it is | Authority |
| --- | --- | --- |
| Supabase Auth UUID (`auth.users.id`) | The one account identity | Account authority for every Premium row |
| RevenueCat App User ID | Set by the client with `Purchases.logIn(<Supabase UUID>)` and nothing else | Provider-side key; **equals the Supabase UUID by construction** for every purchase made inside Her Keys |
| RevenueCat anonymous ID (`$RCAnonymousID:…`) | RevenueCat's own device-scoped id before `logIn` | **Never** mapped to an account; never grants Premium |
| RevenueCat `original_app_user_id` / `aliases` | History of ids a subscriber has used | Evidence only. An alias is never an account. |

### 1.1 Current client behaviour (verified in source, not assumed)

* `src/monetization/revenueCatClient.ts` `identifyRevenueCatAccount(accountId)` calls `Purchases.logIn(accountId)` and
  confirms `Purchases.getAppUserID() === accountId`; `null` calls `Purchases.logOut()`.
* `src/store/accountRuntimeInstance.ts` identifies **before** publishing a bound account, so no purchase UI is
  reachable while anonymous or mid-switch (`withAccountSdkOperation` serialises logIn/logOut/restore/paywall).
* `presentRevenueCatPaywall`, `restoreRevenueCatPurchases`, `fetchActiveEntitlementIds` all refuse to act unless the
  SDK's current App User ID is exactly the identified account.
* `PremiumCheckoutAfterConsent` presents checkout only for a bound account **after** mandatory consent.

**Required default (kept): no anonymous purchase initiation.** Stage 1 adds nothing that weakens this.

### 1.2 Server-side identity resolution (new, A1)

`premium_subscriber_identities(provider_user_id, account_id, kind, status, source)` maps provider ids to accounts.

1. A provider id is **account-grade** only if it is a canonical UUID **and** exists in `auth.users`. `$RCAnonymousID:*`,
   `$RCAnonymousID` aliases and non-UUID ids are `kind='anonymous'`, `status='rejected'`: recorded as evidence, never
   resolved to an account.
2. For a webhook event the *current* `app_user_id` is the only id auto-verified. `original_app_user_id` and `aliases`
   are stored as `kind='alias'` evidence.
3. If the set `{app_user_id} ∪ (aliases ∩ auth.users)` names **more than one** existing account, the event is
   `ambiguous`: it is stored, **no grant is made**, and the affected accounts are queued for authenticated
   reconciliation (§4 of A1). Reconciliation grants only what RevenueCat's own subscriber record for that exact App
   User ID reports.
4. `TRANSFER` events never grant from webhook arrival alone. Every account in `transferred_from ∪ transferred_to`
   that is account-grade is reconciled; the projection then reflects RevenueCat's present ownership.
5. An entitlement is **never** moved automatically between accounts by Her Keys. RevenueCat's configured transfer
   behaviour decides ownership; Her Keys only *reads* the outcome.

### 1.3 Scenarios

| Scenario | Behaviour |
| --- | --- |
| Restore on another device, same account | `logIn(uuid)` then restore; same App User ID → same subscriber → projection unchanged. |
| Two Her Keys accounts on one phone | `logOut` → `logIn(other uuid)` each switch (serialised). Account B reads B's own projection; A's cached state is discarded on account change (A3). |
| Purchase begun under account A, device switches to B | The paywall/restore wrappers abort when `getAppUserID()` ≠ the owner captured at call time; the result is discarded, never applied to B. Server projection is keyed by the App User ID RevenueCat bills, which is A. |
| Store account restored under a different Her Keys account | RevenueCat's Restore/Transfer behaviour decides. Her Keys never forces a transfer. The `TRANSFER` event + reconciliation moves the projection; an ambiguous result grants nothing until reconciled. |
| Account deletion then new account | Deletion marks lifecycle `deletion_pending` (overrides entitlement, §5). A new account has a **new** UUID and a **new** App User ID: it starts `free`. The old store subscription history in RevenueCat/stores is untouched. |
| Anonymous purchase | Not initiable. If one existed it would carry an anonymous id and never resolve (§1.2.1). |

### 1.4 RevenueCat Restore/Transfer behaviour — recorded configuration

The project's current "Restore Purchases behaviour" setting lives in the RevenueCat dashboard and **cannot be read or
changed from this workstream** (no dashboard access; changing it needs owner approval). Recorded as:

* **Observed:** `NOT_READ` — requires an owner screenshot or dashboard read in the Staging plan.
* **Required by this design:** any of RevenueCat's documented modes is *safe* because Her Keys never assumes ownership
  moved; it reconciles. The recommended mode for Her Keys is the dashboard default **"Transfer to new App User ID"**,
  because it keeps a paying customer paying when she signs in on a new account; the cost is that the previous account
  loses access, which is surfaced by `ownership_changed` copy (A3).
* **Decision requested:** OD-P1-01 (§12).

---

## 2. Subscription versus shared participation

Stage 1 is **purchaser-bound**: Premium is a fact about one account (`premium_entitlements.account_id`).

* A co-parent must not inherit the subscriber's private Premium data → Premium state never appears in any
  household-shared read; household RLS is untouched.
* A trusted helper does not become a subscriber.
* Household membership is **never** proof of purchase; no code path derives Premium from `household_members`.
* Sharing permission (who can see a record) is evaluated by the existing scope/RLS model, separately from entitlement.
* No automatic ownership transfer.

**Future one-household-pays sponsorship** is designed as a *separate* concept, not an extension of the entitlement
row: a future `premium_sponsorships(sponsor_account_id, feature_key, beneficiary_account_id, scope, accepted_at,
revoked_at)` that can authorize *named shared capabilities* (Village delegation, Co-Parent Plus exports) for a
beneficiary, evaluated beside — never replacing — the individual entitlement. Stage 1 does **not** create that table or
enable inheritance (OD-P1-02 if the owner wants it sooner).

---

## 3. Source-of-truth hierarchy (evolution of Build 2.5)

| Layer | Role | May it authorize protected work? |
| --- | --- | --- |
| RevenueCat | Authoritative external purchase/subscription lifecycle | Indirectly (feeds the projection) |
| **Supabase `premium_entitlements` projection** | **Server authorization authority**, derived from verified RevenueCat facts | **Yes — the only one** |
| RevenueCat client SDK (`CustomerInfo`) | Immediate local purchase status and UI hint | **No** |
| Client feature manifest | Presentation and discovery | **No** |
| Postgres RLS | Account/resource ownership | Ownership only, never Premium |

**Build 2.5 §3 stated:** *"`her_keys_plus` active in CustomerInfo is the only source of `isPlus`."* That was correct
while nothing server-side existed and nothing was gated. **Stage 1 amends it:** CustomerInfo remains the immediate
*display* signal (and the trigger for reconciliation), but for any protected operation the **server** decides. When they
disagree the server controls and `usePremiumFeature` initiates a supported reconcile. The client **never invents
Premium from a cache**: `EntitlementState` persisted nowhere (Build 2.5 M3 stands), and the new server-state cache is
presentation-only, account-keyed and discarded on any account change.

Build 2.5's "no persisted `isPlus`" regression control still holds for **AppState** (household state). The server
projection lives in its own service-only tables, outside household state and outside sync.

---

## 4. Canonical entitlement states

Server-computed, in this precedence: `deletion_pending` (lifecycle overlay) → provider-derived state.

| State | Meaning (verified provider facts only) | New Premium compute | Stored-data access | Client display | Recovery action | Transition trigger | Freshness requirement | Audit event |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `unknown` | No trustworthy projection: none yet, stale beyond policy, ambiguous identity, or reconcile failed | **Denied** (`entitlement_unknown`) | Full | "Checking your subscription…" + Retry | Retry verification (rate-limited reconcile) | No row; `needs_reconcile`; expiry passed without fresh reconcile; ambiguity | n/a | `entitlement.unknown` |
| `free` | Reconciled/observed: no `her_keys_plus` entitlement | Denied (`requires_premium`) unless a feature has an approved Free allowance | Full | Upgrade affordance | Open paywall / Restore | Reconcile finds none | none required for *denial*; purchase flow forces a reconcile | `entitlement.free` |
| `premium_active` | Entitlement unexpired by RevenueCat `expires_date` (or lifetime) | **Allowed** | Full | Premium active | — | INITIAL_PURCHASE, RENEWAL, UNCANCELLATION, PRODUCT_CHANGE, SUBSCRIPTION_EXTENDED, reconcile | Valid until `expires_at` (hard). After it, see `premium_expired`/§6 | `entitlement.active` |
| `premium_canceled_active` | Auto-renew off (`unsubscribe_detected_at`) but still within the paid term | **Allowed until `expires_at`** | Full | "Ends on <date>" | Resubscribe | CANCELLATION (UNSUBSCRIBE) / reconcile with unsubscribe flag | same as active | `entitlement.canceled_active` |
| `premium_billing_grace` | Store reports a billing issue **and** RevenueCat reports `grace_period_expires_date` in the future | **Allowed until `grace_expires_at`** (never invented) | Full | "Update your payment method" | Open store payment settings | BILLING_ISSUE with non-null grace expiry / reconcile | until `grace_expires_at` | `entitlement.billing_grace` |
| `premium_expired` | Term (and any provider grace) ended without renewal | Denied (`entitlement_expired`) | **Full — saved reports and approved items remain readable** | "Premium ended" + Resubscribe | Resubscribe / Restore | EXPIRATION; or `now > expires_at` confirmed by a fresh reconcile | A reconcile ≤ 10 min old must confirm expiry, else `unknown` (late-renewal webhook protection) | `entitlement.expired` |
| `premium_revoked` | Refunded / revoked by the store or RevenueCat support | Denied (`entitlement_expired`) | Full | "Premium was refunded" | Resubscribe if desired | CANCELLATION with refund semantics (`cancel_reason` CUSTOMER_SUPPORT / `refunded_at` in reconcile) | revocation holds until a **later** purchase event | `entitlement.revoked` |
| `deletion_pending` | Account lifecycle restriction (deactivated / deletion workflow) — **not** a RevenueCat event | **Denied** (`account_deactivated`) | Governed by the deletion workstream, not by Premium | Account deletion notice | Restore account (deletion workstream) | `account_deletion_requests.status ∈ {deactivated, restoring, processing, retry_pending, failed_requires_action}` | evaluated live on every decision | `lifecycle.deletion_pending` |

Rules:

* A canceled subscription still inside its paid term is **never** revoked early.
* Grace access reflects `grace_period_expires_date` from the provider. Her Keys adds **no** grace of its own.
* `premium_revoked` cannot be undone by an *older* event. Only a purchase/renewal event with a later
  `event_timestamp_ms` (or a reconcile that shows an active entitlement with a later purchase) clears it.
* The state is **derived at read time** from stored facts plus `now()` (`premium_entitlement_state(...)`), so expiry
  needs no cron and cannot be missed.

---

## 5. Premium access decision contract

The server evaluates, **in this order**, the following independent checks and returns the **first** failure (all
evaluated checks are written to the audit row). Ownership, consent and entitlement are never merged into one boolean.

| # | Check | Failure `reason` |
| --- | --- | --- |
| 1 | Valid authenticated identity (JWT verified server-side; account id comes **only** from the JWT) | HTTP 401 (never reaches the decision) |
| 2 | Account lifecycle active | `account_deactivated` |
| 3 | Ownership of the resource (household membership from `household_members`, never a client-supplied id alone) | `ownership_denied` |
| 4 | Feature exists, is released, not killed, app version ≥ minimum | `feature_disabled` |
| 5 | Backend operational readiness (global kill switch / maintenance) | `service_unavailable` |
| 6 | Qualifying entitlement, **or** an approved Free allowance for this feature | `requires_premium` / `entitlement_unknown` / `entitlement_expired` |
| 7 | AI consent (only if the feature requires external AI processing) | `requires_ai_consent` |
| 8 | Quota and cost-budget availability (atomic reservation) | `quota_exhausted` (or `rate_limited`) |

`allowed` is returned only when all pass. Response: `{ outcome, reason, entitlementState, quota:{used,limit,periodEnd,
remaining}, nextAction, decisionId }` with `nextAction ∈ {none, open_paywall, restore_purchases, retry_verification,
grant_ai_consent, wait_for_reset, update_app, none}`.

Rationale for the order: identity/lifecycle/ownership first so a denial never leaks entitlement or quota facts to
someone who may not ask; readiness before entitlement so an outage is not mis-reported as "upgrade"; consent before
quota so a declined-consent request consumes nothing.

---

## 6. Webhook event matrix (RevenueCat, verified against current documentation)

Authentication: configured `Authorization` header (constant-time compare) **and**, when an HMAC secret is configured,
`X-RevenueCat-Webhook-Signature: t=<unix>,v1=<hex>`; `v1 = HMAC-SHA256(secret, "<t>.<raw body bytes>")`, compared in
constant time; `|now − t|` outside tolerance (default 300 s) rejected. `t` is regenerated by RevenueCat on every
attempt, so replay protection is **(a)** timestamp tolerance, **(b)** durable event-id dedupe. Retries reuse the same
event `id`. Delivery is at-least-once with up to 5 retries (5/10/20/40/80 min); return 200 only after the event is
**durably stored**.

| Event type | Facts it contributes | Projection effect | Notes |
| --- | --- | --- | --- |
| `INITIAL_PURCHASE` | expiration, product, store, period, environment | active; clears `canceled`, `billing_issue`; clears `revoked` **only if** event ts > `revoked_at_ts` | |
| `RENEWAL` | new expiration | as above | An older RENEWAL cannot override a newer REVOKE/EXPIRATION |
| `UNCANCELLATION` | clears cancel | `premium_canceled_active → premium_active` | |
| `CANCELLATION` | `cancel_reason` | `UNSUBSCRIBE`/`BILLING_ERROR`/`PRICE_INCREASE`/`UNKNOWN` ⇒ `canceled_at`, access until expiry. `CUSTOMER_SUPPORT` ⇒ treated as **revocation** (documentation: cancellations also carry refunds; there is no REFUND type) and reconciled | Refund ambiguity resolved by reconcile, not guessed |
| `BILLING_ISSUE` | `grace_period_expiration_at_ms` (nullable) | non-null & future ⇒ `billing_grace`; null ⇒ no extra access | Never invents a grace period |
| `EXPIRATION` | `expiration_reason` | `expired`; `SUBSCRIPTION_PAUSED` ⇒ revoke access only for pause | |
| `PRODUCT_CHANGE` | new product, expiration | active (new product) | |
| `SUBSCRIPTION_PAUSED` | pause | access ends at period end; reconcile | |
| `SUBSCRIPTION_EXTENDED` | new expiration | active | |
| `REFUND_REVERSED` | — | queue reconcile (state decided by RevenueCat) | |
| `TRANSFER` | `transferred_from`, `transferred_to` | **No grant from the event.** Reconcile every account-grade id in either list | §1.2.4 |
| `SUBSCRIBER_ALIAS` (deprecated), `PURCHASE_REDEEMED`, `TEMPORARY_ENTITLEMENT_GRANT`, `NON_RENEWING_PURCHASE` | identity/evidence | stored; queue reconcile | |
| `TEST` | — | stored `ignored_test`; no projection effect | |
| Anything else (`INVOICE_ISSUANCE`, `EXPERIMENT_*`, `VIRTUAL_CURRENCY_*`, `PRICE_INCREASE_*`, unknown future types) | — | stored `ignored_unknown`; **never an error**; if it names an account-grade subscriber, queue a reconcile | New types arrive without a version change |

Event processing rules: idempotency key `(environment, event.id)` unique; **per-field last-writer-wins by
`event_timestamp_ms`** (an older event never overwrites a newer field); final authority for any ambiguity is the
authenticated RevenueCat REST read of the exact App User ID.

Environment separation: a Staging project accepts only `SANDBOX` events for projection; a Production project accepts
only `PRODUCTION`. A mismatched event is stored with status `ignored_environment` (evidence kept, no grant).
Staging and Production use independent credentials and endpoints.

Dead letter: an event that fails processing is retried by the backlog processor; after 5 failed attempts it becomes
`dead_letter`, an audit/alert row is written, and the account is marked `needs_reconcile` so the customer is not
stranded while operators investigate.

---

## 7. Shared-participant license policy (Stage 1: not enabled)

* No household-wide entitlement inheritance in Stage 1.
* Future shared capabilities are authorized by **sponsorship** (§2) evaluated alongside, never in place of, the
  individual entitlement.
* A sponsor's sponsorship never exposes the sponsor's private data; it authorizes only the *named shared capability*
  for the *named beneficiary* over *explicitly shared* records.
* Revoking a sponsorship (or the sponsor's Premium ending) ends **new** shared computation; shared records already
  created remain readable by those they were shared with.

---

## 8. Threat model

| ID | Threat | Mitigation | Test |
| --- | --- | --- | --- |
| T1 | Forged webhook | Authorization header + HMAC over raw body, constant-time, timestamp window, secrets server-side | A1 webhook negative tests |
| T2 | Replay of a captured webhook | Timestamp tolerance + unique event id | replay/duplicate tests |
| T3 | Client-public SDK key used as webhook auth | Never accepted; only the dedicated webhook secrets | static source scan |
| T4 | Free user calls a Premium endpoint directly | Server decision (§5); JWT account only | A2 authorization tests |
| T5 | Forged `isPremium` in request body | Body is never read for entitlement; schema is strict | A2 forged-boolean test |
| T6 | Cross-account grant via alias/transfer | §1.2 resolution; ambiguity ⇒ no grant | identity tests |
| T7 | Out-of-order event resurrects revoked access | Per-field LWW + `revoked_at_ts` monotonic clearing | out-of-order tests |
| T8 | Quota race (N concurrent requests exceed limit) | Single-statement conditional UPDATE under row lock; idempotency keys | concurrent quota test (local DB) |
| T9 | Fabricated Premium in Production | `test_fixture` source structurally excluded; no client path; runtime-config CHECK | fixture-boundary tests |
| T10 | Cost exhaustion | Per-account quota + per-minute rate limit + global daily cost cap per feature | quota tests |
| T11 | Prompt injection via captured content | Untrusted-data framing, strict zod schemas, reject-on-invalid, deterministic fallbacks | C tests |
| T12 | Entitlement gates stored data | RLS on customer data **never** joins entitlement | RLS-independence test |
| T13 | PII in logs | Metadata-only operational logs; no content, no e-mail, no device ids | log-shape tests |
| T14 | Secret leakage | `sk_…`/webhook secrets never in `src`/`app`; `.env.example` placeholders only | source scan |
| T15 | Deleted/deactivated account keeps spending | Lifecycle check precedes entitlement | lifecycle tests |
| T16 | Stale projection after silent expiry | Expiry derived from `expires_at`; reconcile freshness gate | freshness tests |

---

## 9. Retention and privacy review

| Table | Contains | Retention | Deletion lifecycle |
| --- | --- | --- | --- |
| `premium_events` | Provider event evidence: event id/type/timestamps, subscriber id(s), product, environment, **no purchase price, no e-mail, no device identifiers** (stripped at ingestion; allow-list copy) | 400 days after processing, then payload nulled (id/type/ts kept) | On account deletion, `account_id` is nulled and payload dropped; the event row stays as non-personal ledger evidence only if required for dispute (owner decision OD-P1-06) |
| `premium_entitlements` | State facts (dates, product, store, flags) | While account exists | Deleted with the account (`ON DELETE CASCADE`) |
| `premium_subscriber_identities` | Provider id ↔ account | While account exists | Cascade |
| `premium_usage`, `premium_usage_events` | Counters + idempotency keys, **no content** | 14 months | Cascade |
| `premium_authorization_audit` | Decision outcomes + reason codes, **no content** | 90 days | Cascade |
| `premium_decisions` (A4 ledger) | References + typed snapshots needed for undo | While account exists | Cascade; content stays in its own domain store |
| `premium_feature_config` | Global manifest | permanent | n/a |

Telemetry: **no new Production telemetry collection is enabled** by this stage. Operational metrics are SQL views over
the metadata-only tables above, readable only by service role; any external dashboard/alert export requires privacy
and retention review (OD-P1-05).

---

## 10. Test matrix (summary; full list in the ledger)

Entitlement: valid purchase, unauthorized webhook, bad signature/authorization, stale timestamp, replay, duplicate,
out-of-order renewal/expiration, refund/revocation, cancel-while-paid, grace, alias, transfer, unknown subscriber,
account switch during purchase, restore under another account, stale projection, reconcile failure, projection
recovery. Authorization: free JWT direct call, forged boolean, wrong account, wrong household, wrong child, consent
declined, feature disabled, deletion pending, quota exhausted, concurrent quota, retry after partial processing,
revoked entitlement, saved data readable after expiry. Consumer: Free Today/Calendar/manual task/Talk It Out unchanged;
paywall launch and return-to-feature; verification-delay recovery; restore; cross-account; offline; small-screen
accessibility; Android/iOS navigation parity. Features: domain mutation, idempotency, stale-state, ownership, partial
failure, recovery; mutation tests with negative controls.

---

## 11. Recovery and rollback plan (summary; runbook in `PREMIUM_STAGE1_OPERATIONS.md`)

Additive migration only. Disable a feature: `premium_feature_config.enabled=false` (server) — Free is unaffected.
Stop AI processing: `kill_switch=true` on AI features. Halt the webhook processor: `premium_runtime_config.
webhook_processing=false` (events are still durably stored). Replay failed events: reset status to `received`.
Recover a wrong projection: recompute from `premium_events` + reconcile; **never delete customer evidence**. Forward-fix
over downgrade; the migration has a reviewed non-destructive "disable" path and a documented reverse (drop) path that
is only valid before any Production row exists.

---

## 12. Decisions requiring the owner (safest default stated; affected operation only)

| ID | Decision | Safest default (applied) | Impact if not decided |
| --- | --- | --- | --- |
| OD-P1-01 | RevenueCat Restore/Transfer behaviour setting (read-only to this stage) | Treat any mode as safe by reconciling; recommend "Transfer to new App User ID" | Customer-facing "ownership changed" copy may not match dashboard |
| OD-P1-02 | Household-wide / sponsored entitlement | Not enabled | Village/Co-Parent Plus ship purchaser-bound only |
| OD-P1-03 | Final Free Smart Inbox capture allowance and Premium fair-use limits | Free allowance seeded as `0 / proposed_not_approved`; Premium limit is a *test-only controlled* figure | No customer-facing number is activated |
| OD-P1-04 | Production subscription activation, EAS build, store submission | NOT AUTHORIZED | Public sales not ready |
| OD-P1-05 | New Production telemetry/retention commitments | None enabled | Dashboards remain service-role SQL only |
| OD-P1-06 | Retention of `premium_events` evidence after account deletion | Anonymise (null `account_id`, drop payload) | Dispute handling after deletion limited to event ids |
| OD-P1-07 | Sandbox purchases against Production backend | Recorded, **not** granted | TestFlight/internal testers need Staging backend |
| OD-P1-08 | Staging deployment of migration + Edge Functions | Not performed; request prepared in Stage 1 handoff | STAGING_E2E stays NOT_RUN |
