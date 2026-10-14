# Her Keys Premium — Stage 1, Milestone E: The Village and Co-Parent Plus Contracts

Status: **reviewed contracts only.** No table, function, screen or flag for either pillar was built in Stage 1, on purpose: both features share *people who are
not the purchaser*, and an unfinished sharing screen is a privacy risk, not a roadmap checkbox. Both feature keys stay `released = false` in
`premium_feature_config` (`village_delegation`, `coparent_plus`). This document is the contract a later stage builds against, and what it must prove first.

## 0. What both pillars inherit from Stage 1 (compatibility, not new machinery)

| Concern | Stage 1 mechanism both pillars MUST reuse | Consequence |
|---|---|---|
| Who may create new Premium work | `premium_authorize` (entitlement, ownership, kill switch, quota, rate limit) — **purchaser-bound** (A0 §2, §7) | Creating an offer / shared record needs the *creator's* Premium. Household membership is never proof of purchase. **No automatic ownership transfer, ever.** |
| Access to what already exists | **Ownership / sharing only** — never entitlement (A0 §5; "Premium gates computation, never access to stored data") | An expired subscription never hides a record, an offer already accepted, or an export of what was already shared. |
| Receipts, versions, undo | the shared decision ledger (`premium_decisions`: typed refs + minimal snapshots, state machine, derived idempotency keys) | Offer / revoke / acknowledge / reimburse are ledger events with typed references; **no content duplicated into analytics.** |
| Identity of the other person | a **real, separate Her Keys account** of their own (never the purchaser's credentials, never a household membership) | The other person is a *participant*, not a `household_members` row. Neither pillar changes who owns a household. |
| Isolation | RLS by account id; every cross-account read goes through an explicit **share record** | There is no query path from a participant to any household table. |
| Kill switch / rollout | `premium_feature_config.kill_switch`, `enabled`, `released`, `min_app_version` | Either pillar can be stopped without a deploy; stopping blocks *new* work only. |

**Non-goals for both:** payments or money movement; messaging between participants; location sharing; AI interpretation of shared content; automatic assignment;
public profiles or discovery of people by e-mail/phone; any claim of legal certification.

---

## 1. The Village

A purchaser (the *host*) asks a trusted person (a *helper*) to take one specific, bounded thing, and the helper can see **only that**.

### 1.1 Invited-person identity
* An invitation is created by the host's account for one household, carries a **single-use random token** (only its SHA-256 is stored; the token travels once, in the link),
  an expiry (default 14 days), and a *display label the host chose* — never the helper's contact details as stored identity.
* Acceptance requires the helper to **sign in to their own Her Keys account** (creating a free one if needed). The token binds to that account on first use; it cannot be
  reused or transferred. The helper never gets a household membership, never a household id, never the host's credentials.
* The helper needs **no Premium**. Only the host's creation of offers is metered.
* No discovery: there is no search by name, e-mail or phone. A person can be invited only by someone who already holds a link to give them.

### 1.2 Restricted resource access
* An offer is a **purpose-built copy**, not a view onto the host's task: `village_assignment` holds only the fields the host explicitly chose to share (a short title, when, where as
  host-typed text, optional note) plus a typed reference *back* to the host's task that the helper cannot dereference.
* RLS: a helper may `SELECT` an assignment only where `participant_account_id = auth.uid()` **and** status is not `revoked`. There is **no join** from a participant to `tasks`, `events`,
  `household_members`, finances, notes, children or any other household table. Later edits to the host's private task do **not** change the helper's copy; the host can re-offer.
* A helper never sees other helpers, other assignments they were not offered, or anything about the host's household beyond the fields in their copy.

### 1.3 Responsibility states
```
offered ──accept──▶ accepted ──complete──▶ completed        (terminal)
   │  ╲                 │  ╲
   │   decline          │   release (helper hands it back) ──▶ released   (terminal; the host is told, neutrally)
   │     ▼              │
   │  declined          └── revoke (host) ──▶ revoked        (terminal)
   ├── expire (clock) ──▶ expired                              (terminal)
   └── revoke (host) ──▶ revoked
```
Every edge is a ledger transition with an actor (host or helper), a server timestamp and a typed reference. Illegal edges are refused by the database, as for Daily Load.
`completed` is the **helper's claim**; the host may confirm it (`confirmed_by_host`), and only a confirmed completion counts as a "confirmed delegation" in Momentum.

### 1.4 Reminder and acknowledgment
* **Acknowledgment** (`acknowledged_at`) means "I have seen this"; it is distinct from accepting. The host sees one of: *not seen*, *seen*, *accepted*, *declined* — nothing about when or where the helper opened it.
* **Reminders** go only to a helper who has **accepted**, only at times the host set when offering, at most 3 per assignment, never after revoke / complete / release, and the helper can mute them.
  Delivery uses the existing local/push notification architecture; its owner must approve the new notification category before any build (dependency, not changed here).

### 1.5 Revocation
* The host can revoke at any time; **reads stop immediately** (RLS checks status), the helper's copy is purged on the next sync, and the action is idempotent and receipted.
* The helper can leave at any time (`release`). Neither action is framed as blame, and **revocation is silent by default** (no push to the helper) because a visible "you were removed" can itself be a risk; the host may opt in to telling them.

### 1.6 Abuse-aware sharing
* Caps: ≤ 10 pending invitations per household, ≤ 3 new invitations per hour; no bulk or broadcast; short fixed-length fields; no URLs or contact details in shared fields (validated like Smart Inbox titles).
* A helper can **block** a host (no further invitations from that account) and **report** an invitation; both are receipted and reviewable by an operator without content.
* Sharing is **opt-in per record**, never inferred. Nothing about a child beyond what the host typed into the offered fields. Location is never collected or derived.
* The kill switch stops new invitations globally; existing accepted assignments stay readable and completable.

### 1.7 Account deletion
* **Host deletes:** all their invitations and assignments are deleted and the helper's copies purged; the helper sees a neutral "this was withdrawn". Household ownership is not transferred.
* **Helper deletes:** their participant rows are anonymised and any open assignment becomes `released`; the host is told neutrally.
* Both flows are executed by the account-deletion lifecycle (owned by another engineer); the contract requires its table list to include the Village tables **before** release.

### 1.8 Tests a build must pass before release
Helper cannot read any household table (negative RLS matrix); revoked → zero rows; token single-use and bound; expired invitation cannot be accepted; illegal transitions refused; reminder cap and mute;
expired Premium does not hide an accepted assignment but denies a *new* offer; deleting either account behaves as §1.7; abuse caps; a Free helper completes an assignment.

---

## 2. Co-Parent Plus

Two parents each keep **their own** account and household, and choose **specific records** to share with each other. Her Keys keeps a faithful, chronological record. It does not
adjudicate, move money, or certify anything.

### 2.1 Irregular custody schedule representation
* A schedule is a set of **periods**: `(start, end, responsible_parent, children, source)` plus explicit **exceptions** (swap, holiday, make-up). `source` is `rule` (materialised from a stored
  rotation such as 2-2-3, with an anchor date and the household time zone) or `manual`. Every materialised period is individually overridable. **"Unset" is a first-class state**; custody is never
  inferred from calendar events.
* A change is `proposed` until the other parent **agrees**; an agreed schedule and each later change are new **versions** (append-only; prior versions kept and marked superseded).

### 2.2 Explicitly shared records
* A record is shared only by an explicit act: `coparent_share(record_type, snapshot, shared_by, shared_with, shared_at)`. The counterpart receives a **snapshot copy** owned by the share, not a view onto the sender's
  data; editing the original does not change what was shared (the sender shares a new version).
* The counterpart is a **separate account** invited exactly as in §1.1 (role `coparent`). Neither parent is added to the other's `household_members`.

### 2.3 Expense allocation
* An expense: integer **amount in minor units**, currency, category (closed list), payer, date, children, and an **allocation**: percentages as integer basis points summing to 10 000, or fixed minor-unit
  amounts summing to the total. Rounding is deterministic (largest remainder, ties to the earlier-listed parent) and the computed owed amount is stored with its inputs so it can be re-derived.
* Allocation uses **only what the sender chose to share**; it never reads either parent's private finances.

### 2.4 Reimbursement requests
```
requested ──ack──▶ acknowledged ──accept──▶ accepted ──both confirm paid──▶ paid_confirmed  (terminal)
    │                    │  ╲
    │                    │   dispute (reason code + short note) ──▶ disputed ──resolve (both)──▶ accepted | withdrawn
    └── withdraw (requester) ──▶ withdrawn (terminal)
```
Her Keys **never moves money**; "paid" is a claim that becomes `paid_confirmed` only when **both** parents confirm. A dispute is recorded, never auto-escalated or auto-resolved.

### 2.5 Receipt attachment
Private storage bucket per share; image/PDF allow-list, size cap, EXIF stripped, malware scanning dependency (an operator decision before build); reads by short-lived signed URL; visible only to the two
parties of the share; deleted with the record or on either account's deletion per §2.9.

### 2.6 Shared-record acknowledgment
**Acknowledged** means "seen", **agreed** means "I accept this" — two different, separately-timestamped facts, server-clocked, immutable. Editing creates a new version; the log shows what changed and who acknowledged which version.

### 2.7 Chronological export
Exports **only records shared by or with the requesting account**, ordered by server timestamp, with version history and acknowledgments, as CSV and PDF. Every export carries this statement verbatim:
*"Exported from Her Keys on <date>. These are records kept by the parents. Her Keys does not verify or certify them, and this is not a court-certified document."* No string anywhere in the feature may
say or imply *certified*, *court-ready*, *legal evidence* or *admissible* (a copy test pins this).

### 2.8 Privacy boundaries
Nothing is shared by default. The counterpart can **never** see: private finances, personal notes, unrelated household information, children not in the shared scope, location, the calendar, other shares, or
the other parent's Premium status. No analytics on content; metrics count shares by type and status only.

### 2.9 Account deletion and multiple-adult households
* **A deletes their account:** A's private data is deleted. For shares A *sent*, B keeps **their received copies** (they are B's records and matter for B's chronology), with A's name replaced by
  "Former co-parent account" and A-authored free text retained only if B had acknowledged it; this default is **OD-P1-10** for the owner. Shares in flight (`requested`, `proposed`) are withdrawn.
* **A household with two adult members** (e.g. parents who still share one household): deleting one adult's account is **not** household deletion and **never transfers ownership**; the remaining adult keeps
  the household. Entitlement is purchaser-bound, so only the purchaser's own Premium ends with their account.
* Account-deletion lifecycle owner must include the Co-Parent tables before release (dependency).

### 2.10 Entitlement shape (decision requested — OD-P1-10)
Safest default: **creating** a share, schedule version, expense or request needs the creator's Premium (`coparent_plus`); **responding** (acknowledge, agree, dispute, confirm paid, export what was shared with you)
needs none, so a Free co-parent is never locked out of a record about their own child. Reading is never gated.

### 2.11 Tests a build must pass before release
Negative RLS matrix (counterpart reads nothing outside shares); snapshot immutability; versioning and supersession; allocation arithmetic (basis points, rounding, sums) incl. property tests; reimbursement state machine; "paid" requires both;
export contains only shared records and the verbatim statement; forbidden-claim copy test; deletion matrix §2.9; Free co-parent can respond; expired Premium keeps everything readable and exportable.

---

## 3. Owner decisions these contracts add

| ID | Decision | Safest default | Affects |
|---|---|---|---|
| OD-P1-10 | Co-Parent entitlement shape and deletion default (§2.9, §2.10) | Creator-pays; respond-free; received copies survive the sender's deletion, anonymised | Co-Parent Plus build and its deletion lifecycle |
| OD-P1-11 | Village host-confirmation of completion (§1.3) and silent-revocation default (§1.5) | Host confirms; silent by default | Village build |
| OD-P1-12 | Notification category for Village reminders (§1.4) | Not enabled | Village reminders |
| OD-P1-13 | Receipt scanning / storage provider (§2.5) | Not enabled | Co-Parent receipts |
