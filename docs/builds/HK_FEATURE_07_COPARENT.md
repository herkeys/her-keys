# HK-FEATURE-07-COPARENT — Co-Parent Logistics build ledger

Branch `feature/07-coparent-logistics` · worktree `C:\Users\jsmit\Her-Keys-F07` · LOCAL ONLY (no push, no PR, no merge).

> Status of this document: **COMPLETE — verdict PASS WITH DOCUMENTED DEBT (§45).** Sections 1–20 are the CP0/CP1 contracts, written and committed *before* any UI existed;
> sections 21–45 record what was built, attacked and measured. Every figure is from a command run at the final code head (§44); nothing is carried over from a prompt.

---

## 1. Source / fork

| Item | Value |
|---|---|
| Baseline branch | `repair/hk-integration-readiness-01` |
| Fork commit | `14bd58ed3bdcb557ba308dfe2ecbc65253dba5e1` (IR10 — the FINAL repair/report HEAD, docs-only over `9dbe02a`) |
| Tested code state beneath it | `9dbe02a` (IR9c) — `git merge-base --is-ancestor 9dbe02a 14bd58e` = true; `git diff --name-only 9dbe02a 14bd58e` = `docs/builds/HK_INTEGRATION_READINESS_01.md` only |
| Feature branch | `feature/07-coparent-logistics` |
| Worktree | `C:\Users\jsmit\Her-Keys-F07` (new, isolated; `node_modules` is a PowerShell junction to the main checkout, `package*.json` byte-identical) |
| Sibling ancestry | **none** — forked directly from the repaired foundation; not descended from F01–F06/F08 or any `audit/*` / `validate/*` branch |
| Concurrent sibling worktrees (not touched) | `Her-Keys-F05` (`feature/05-kids-os`, `14bd58e`), `Her-Keys-F06` (`feature/06-home-os`), F01–F04, IR01 and its validation worktrees |

## 2. Baseline verification (CP0, mechanical)

The prompt's baseline claims were checked against the repository, not trusted. **No disagreement was found.**

| Claim | Evidence | Result |
|---|---|---|
| `14bd58e` exists and is the repair HEAD | `git rev-parse repair/hk-integration-readiness-01` = `14bd58ed…` | ✔ |
| `9dbe02a` is the tested code state beneath it | ancestor check + docs-only diff (above); ledger §6.7 "Computed at code HEAD `9dbe02a`" | ✔ |
| HA-001/009/010/011 repaired, OD-A closed | `docs/builds/HK_INTEGRATION_READINESS_01.md` §6, §6.9 ("CLOSED — OD-A") | ✔ |
| TypeScript | `tsc --noEmit` (`--max-old-space-size=1600`) in the F07 worktree at `14bd58e` | **clean, exit 0** |
| Application suite | serial run at `14bd58e` in the F07 worktree | **975 tests / 207 suites, 975 pass, 0 fail** |
| Targeted IR01 (163), backend harness (800), mutation (35) | recorded in the repair ledger §6.7 for `9dbe02a`; the F07 worktree's code is byte-identical | re-run at CP6 / CP8 (harness is run once, alone: shared container) |
| Migration hashes (working tree) | baseline `81909daa…` (CRLF working-tree form; LF git blob `8bc38d66…`), shipping `1e9169de…`, IR01 `73db6639…` | all equal to the ledger |
| Schema fingerprint | read-only measurement of the shared local DB (`supabase_db_Her_Keys`, default `postgres`), `verify --against baselines/ir01-local-fingerprint.json` | **MATCH — `43e7c8a4402a3387cb2e1add4170921e` / 3617** |
| Existing Life / co-parent routes | `app/(app)/life/` has `index, kids, home, money, meals, work, needs-me, other-tasks` — **no `coparent` route**; no `src/features/coparent` | nothing to inherit, nothing to collide |

## 3. Inherited implementation (what Feature 07 stands on)

Read-only, by default, for the whole build. Feature 07 adds files under `src/features/coparent/`, one route file, tests, fixtures and docs.

| Need | Inherited canonical primitive | File · symbol |
|---|---|---|
| Household / member identity | `AppState.household`, `user` (timezone), `children[]` | `domain/state.ts` |
| Child identity | `Child { id, displayName, birthDate, scope:'child' }` | `domain/state.ts` `ChildSchema` |
| Non-account person | `HouseholdPerson { id, displayName, relationship, channel, status }` | `domain/foundation/responsibility.ts` |
| Person create / archive | `addPerson`, `archivePerson` | `domain/responsibility.ts` |
| Handoff | `CalendarEvent` (child = `subjectMemberId`, `location`, `startsAt/endsAt`, facets) | `domain/state.ts`, `domain/events.ts` `addEvent/updateEvent/removeEvent` |
| Preparation | `Task` + `Dependency{ requires: event → task }` | `domain/tasks.ts`, `domain/structure.ts` `addDependency` |
| Responsibility lifecycle | `Responsibility` `owned·requested·acknowledged·accepted·declined·completed·returned` | `domain/responsibility.ts` `delegate/acknowledge/accept/decline/completeResponsibility/returnToSelf/reassign/needsMePersonally` |
| Standing / readiness (HA-009) | `standingOf`, `blockersOf`, `unavailablePrerequisitesOf`, `readinessOf` | `domain/structure.ts` |
| Recurrence | `RecurrenceRule` + `addRecurrence/occurrencesOf/nextOccurrence` | `domain/foundation/structure.ts`, `domain/structure.ts` |
| Amount | `value: Money{amountMinor,currency,direction}` on task and event | `domain/foundation/money.ts`, `commitment.ts` |
| Time | `logicalDateAt`, `zonedTimeToEpochMs`, `wallClockMinutesAt`, `state.user.timezone` | `domain/logicalDay.ts` |
| Category semantics | `categoryWithRole(state,'coparenting')` (starter `cat-coparenting`, scope `coparent-shared`) | `domain/categories.ts` |
| Request / execution evidence | intent → decision → execution → outcome; `intentLifecycle` | `domain/authorization.ts`, `foundation/authorization.ts` |
| Persistence / sync | `store.commit(transition)` → `validateAppState` → write queue → change observer → `composeAccountApp` | `state/appStore.ts`, `store/composeAccountApp.ts` |
| Sync kinds already pushable | `event, task, person, responsibility, dependency, recurrence` (`ALLOWED_OPS`) | `domain/sync/foundationSpecs.ts`, `syncTypes.ts` |

## 4. Feature WHY

Child transitions create a large amount of invisible coordination. Feature 07 exists so she does not have to reconstruct, from calendar +
texts + notes + memory + receipts + bags + other people's promises, *what the next transition is, what must happen before it, who owns
what, whether they accepted it, whether it is actually covered, and what money is still open.* The goal is not to manage the
relationship; it is to reduce operational reconstruction — without claiming agreement, legal authority, payment, completion, coverage or
certainty Her Keys does not have. Tie-breakers used for every ambiguity: preserve truth → reduce mental load → preserve agency →
preserve context → make the next moment easier → support learning → one coherent product → no work to manage the tool.

## 5. Foundation trace (CP1)

Every row was read in source, not assumed. Full symbol list in §3; the decisions those reads forced are §6–§20. Additional facts that
shaped the build:

* `AppState` has **no** child status; `validateAppState` rejects a reference to a missing child (`findIntegrityProblems`). → §6, MP-07-04.
* `children` cannot be created after binding (IR01 backend ledger D6; `member` is MAPPING-ONLY). → MP-07-01.
* `addPerson` exists and `person` is a pushable, mutable sync kind (`household_people`); `delegate` refuses an archived or unknown person.
* `archivePerson` does **not** cascade: a live `accepted` responsibility keeps pointing at an archived person. → §7, §12.
* `accept(state, ctx, id, stillNeedsMe = false)` defaults to "no longer needs her". Feature 07 never relies on that default: she chooses. → §12.
* `updateEvent` edits only `title, categoryId, subjectMemberId, startsAt, endsAt, location, notes, commitment, travel*, preparationMinutes`
  and never scope/status/facets; `updateTask` never `value`; **nothing writes `needsMePersonally`** (fixtures set it by spread). → MP-07-11.
* `store.commit` resolves `true` when a transition changes nothing — so a "stale" refusal must be reported through the transition, not the boolean. → §10.
* `projectDay` does not expand recurrences; `standingOf(event)` never returns "satisfied" (an event never completes). → §15, MP-07-02/05.
* Cloud `behavior_observations.outcome_validity_check` allows only `cancelled|rescheduled` for an event. → OC-1.
* `coparent-shared` enforcement — **§19**.
* The root navigator does not mount until the store is settled; `(app)` is guarded by onboarding; a `boundOther` device opens only
  `account-conflict`. Life screens inherit all of that. `status:'recovery'` (`snapshot.recovery`) starts a FRESH household — an empty
  projection there is *not* "nothing recorded". → §21 (hub), copy audit.

## 6. Child identity

* A transition's child is `event.subjectMemberId`, resolved **by id** against `state.children`. Never by name, position or "first match".
* Three states, all explicit: `known` (id is a current child) · `not_recorded` (`subjectMemberId === null`) · `unavailable`
  (`missing` — id not in `children`; `not_a_child` — id is the adult account user).
* `not_recorded` / `unavailable` records are **NEEDS REVIEW**; they are never re-attached, never shown as an ordinary transition.
* The editor requires a child and refuses to save without one; an edit can never drop `subjectMemberId`. Changing the child is an
  explicit choice on the form, never a side effect.
* No child lifecycle exists (MP-07-04); `childStanding()` is the single function to extend. Addendum K scenarios are covered by
  defensive-projection tests on hand-built (unvalidated) state and marked accordingly.
* No child in the household → a named blocked state (MP-07-01). Feature 07 does not create children.

## 7. Counterpart-person identity (CP1 contract C)

| Question | Answer (evidence) |
|---|---|
| Canonical non-account people exist? | **Yes.** `HouseholdPerson`, `AppState.people`, cloud `household_people`; deliberately not household members. |
| Can one be associated with a commitment? | **Yes**, through `Responsibility{ about: event\|task, responsiblePersonId }` — the only person↔commitment association that exists. |
| May Feature 07 select an existing person? | **Yes** — active people only (`delegate`'s `validHolder`). |
| Is there an approved person-creation path? | **Yes** — `addPerson`, provenance user-action, synced. The editor's "Add someone" uses it and nothing else. |
| No suitable person yet? | The editor offers "Add someone" inline (name + relationship from `PERSON_RELATIONSHIPS`; channel `unspecified`). No phantom person, no free-text stand-in. |
| Archived / removed people | `status:'archived'`; nothing cascades. A live responsibility on an archived (or missing) person is **NEEDS REVIEW**: never `covered`, never `accepted`, never silently reassigned to her. |
| Same-name people | Distinct by `id`. Pickers disambiguate same-name people by relationship and add-order; projection never groups or de-duplicates by name. |

Relationship copy (Addendum H): "Co-parent" only when `relationship === 'co-parent'`; "Caregiver" only when `'caregiver'`; other
recorded relationships are shown as recorded ("recorded as grandparent"); otherwise the person's own name. Never "co-parent" merely
because a person appears in this feature.

## 8. Multi-counterpart behavior

Nothing assumes one co-parent. The counterpart of a record is whoever the record's own responsibility names; different children,
different transitions and different follow-ups can name different people, including two people with the same display name. The hub is
organised by **child + transition/need**, never by adult (Addendum I): no "Alex's items" / "Ex #1" sections exist.

## 9. Handoff representation contract (CP1 gate B) — **YES, representable; proceed**

A handoff is composed **only** of existing canonical rows. No `CustodyEvent`, `HandoffRecord`, `ParentingTimeEvent` or `CoParentEvent`.

| Aspect | Canonical representation |
|---|---|
| The handoff | one `CalendarEvent`, `status:'active'` |
| Is a co-parent-logistics record | its `categoryId` resolves to the category whose `systemRole === 'coparenting'` (any status). `systemRole` is explicit semantic metadata, "never inferred from a name" (`categories.ts`) |
| Child | `event.subjectMemberId` (§6) |
| Date/time | `startsAt` / `endsAt` (absolute instants; wall-clock in the household timezone) |
| Location | `event.location` (optional; null = not recorded, never "somewhere") |
| Counterpart / who is responsible | ≤ 1 live `Responsibility` about `{event,id}` (§12) |
| Recurrence | ≤ 1 active `RecurrenceRule` about the event (§15) |
| Preparation | `Task`s tied by active `Dependency{relation:'requires', from:event, to:task}` (§13) — the pattern the foundation's own rich fixture uses |
| Needs her personally | `event.needsMePersonally` (`true`/`false`/`null`) combined by the shared `needsMePersonally()` |
| Provenance | `provenanceFor(state.origin, userProvenance())` |
| Visibility scope | `coparent-shared` (owner-only — §19) |
| Lifecycle / outcome | `active` → `removed` (via `removeEvent`, observation `cancelled`). **No completion outcome exists** (MP-07-02 / OC-1) |
| Persistence / sync | `store.commit` → local envelope; kinds `event, person, responsibility, dependency, recurrence, task` are pushable; no Feature 07 sync code |

**Direction contract (Addendum E).** There is no direction semantic and Feature 07 does not invent one. The user's own title is shown
verbatim; "Drop-off / Pickup / Handoff" starters only write words into an editable title. Direction is never inferred from who created
the row, from the responsibility holder, or from the title. (MP-07-03.)

## 10. Handoff create / edit

* **Create** (`createHandoff`) is one atomic transition: `addEvent` (+ optional facet) → optional `addPerson` → optional `delegate`
  → optional `addRecurrence`. Any refusal returns the original state and a named outcome; nothing partial is committed.
* **Edit** (`editHandoff`) takes the row the editor was opened on (`baseUpdatedAt`) and refuses if the row has changed since
  (`stale`), so a sync pull or another edit is never silently overwritten. It edits only title, time, location, notes, commitment and
  (explicitly) child; it never touches the counterpart (that is a responsibility action), never changes scope or status, and reconciles
  the recurrence rule to the time she chose (a rule is replaced — old one `ended`, new one active — never patched in place).
* `store.commit` resolves `true` for a no-op, so staleness is carried by the transition's outcome, not by the boolean.

## 11. Handoff truth

Allowed factual labels: **Planned / Scheduled**, **Waiting on someone**, **Accepted — recorded by you** (only when a responsibility is
`accepted`), **Covered — recorded by you** (§12), **Removed**, **This time has passed — nothing is recorded about whether it happened**.
Never: agreed, court-ordered, required, complied, violation, missed by the other parent. A planned handoff is never "agreed"; no state
inflates a user record into a third-party fact. Where it materially matters the copy says "You recorded …".

## 12. Responsibility lifecycle and the action map

Responsibility states are **user-recorded**: the model says of itself "Nothing here delivers a message". Feature 07 labels them so
("You recorded …"), and adds "Her Keys has not contacted <name>" only when there is no execution evidence about the record.

| Stage shown | Canonical evidence | Coverage |
|---|---|---|
| Nobody recorded | no live/latest responsibility naming a person | **unknown** — never "you're handling it" |
| With you | live holder `self` (`owned`/`returned`), or `needsMePersonally === true` | not covered |
| You recorded a request to X | `requested` | not covered |
| You recorded that X acknowledged | `acknowledged` | not covered |
| You recorded that X accepted (still needs you) | `accepted` ∧ `stillNeedsMe = true` | **not covered** (ACCEPTED ≠ COVERED) |
| Covered — you recorded that X accepted and it no longer needs you | `accepted` ∧ `stillNeedsMe = false` ∧ person `active` | **covered** |
| You recorded that X declined | `declined` | not covered; back with you |
| You recorded X's part complete | `completed` | completed (evidence: `completedAt`) |
| Needs review | holder person `archived` or missing (any state) | **needs_review** — never positive |

Answer overdue = the shared `isUnacknowledged(r, now)` (requested ∧ `ackDueAt` passed): "no answer recorded since …" — never "ignored".

**Actions Feature 07 performs** (all existing domain transitions, no new mutations on shared semantics): `addPerson`, `delegate`
("Record that you've asked X"), `acknowledge`, `accept` (**always with her explicit `stillNeedsMe`**), `decline`,
`completeResponsibility`, `returnToSelf`, `reassign`. **Does not perform:** `archivePerson` (People OS), `observeUnacknowledged`
(system-derived history), creating an `owned`/self row (it would block `delegate`/`reassign` — `reassign` cannot leave a self holder),
any intent / authority / execution.

## 13. Preparation / packing

* A preparation item is an existing `Task` in the co-parenting category, child-linked, `scope:'coparent-shared'`.
* Linked to a handoff by `Dependency{requires, event → task}` (`addDependency`). Where no link is recorded the item is shown
  **"Not linked to a specific handoff"** — Feature 07 never infers a link from dates or child.
* "Done" means only that the task is `completed` (`completedAt`). It is worded **"Marked done"**, never "packed", "sent",
  "delivered" or "received". Removal (`archiveTask`) is **"No longer on the list"** — `standingOf` = `unavailable`, never satisfied.
* No preparation recorded is **unknown**, not "nothing needs packing" and not "ready".

## 14. Dependency behavior

`readinessOf(event)`: `blocked` (a live prerequisite pending) · `needsReview` (a prerequisite is retired/missing — REMOVED ≠ COMPLETED) ·
`ready` (all satisfied). Feature 07 shows **"All preparation you listed is marked done"** only when ≥ 1 item is linked and all are
satisfied, and **"No preparation recorded"** when none is linked. The correction path for a retired item is the shared
`removeDependency`; history is never rewritten.

## 15. Recurrence

* One active rule per handoff (`addRecurrence`), `timezone` = household timezone, `anchorDate` = the handoff's household-local date,
  `timeOfDayMinutes` = its household-local start. Supported: weekly (`interval` 1), every 2 weeks (alternating), monthly.
* The recorded event is the anchor occurrence. **Next transition** = the anchor if it has not ended, otherwise the shared
  `nextOccurrence` (which honours recorded exceptions), converted with `zonedTimeToEpochMs` in the rule's timezone.
* Copy: "Repeats every 2 weeks on Friday — the pattern you recorded." Never "custody schedule", "parenting plan", "court schedule".
  **RECURRENCE DEFINITION ≠ OTHER PARTY AGREEMENT.**
* A derived date has no responsibility/preparation of its own (MP-07-05): "Recorded for <anchor date>. Nothing is recorded for this date."

## 16. Money / reimbursement follow-up (CP1 contract 5–6)

**Money/value capability fact: PRESENT.** `value: Money{amountMinor,currency,direction}` on task and event (`commitment.ts`), pushable
(`value_amount_minor/currency/direction` in `existingUpdatable`). → Tier-1 AB/AC/AD apply **as written**; AH7 (no-amount variant) is
**NOT-APPLICABLE — FOUNDATION CAPABILITY PRESENT** (amounts exist, so the amountless variant is not the fallback).

**Reimbursement follow-up contract (the task bridge).** A follow-up is a co-parenting-category `Task` with `value` (amount, currency,
direction), optional child, `dueDate` = follow-up date, and an optional counterpart = the holder of a responsibility about the task
("You recorded a request to X"). It represents *work she intends to do*, never a debt. Membership rule: **co-parenting category ∧ task
∧ `value !== null`**. The amount is required (> 0) in the follow-up editor — "no amount" is not $0 and is not a follow-up.
Direction is her explicit choice (never defaulted); currency is explicit (MP-07-08).

## 17. Payment-truth boundary

Displayed: task **open** ("Follow up by <date>") · task **marked done** with the fixed sentence "Her Keys has no record of a payment." ·
the amount as **"Amount you entered"**. Never displayed unless explicit evidence exists: OWED, REQUESTED (as a fact), PAID, SETTLED.
The only payment evidence Feature 07 will ever show is an `action_outcomes` row of kind `paid` under an execution whose intent is
about the follow-up task — worded "A connected service reported a payment" (none can exist on this baseline; tested with pulled fixture rows).
Expense recorded ≠ owed · amount entered ≠ agreed · receipt ≠ agreed · task created ≠ request sent · task completed ≠ payment received.

## 18. Request / communication boundary

No chat, SMS, email, read receipts, message evidence, sentiment or scoring. Feature 07 creates **no** intents, authorities, decisions,
executions or outcomes and contacts no one. It renders "sent" / "delivered" only from real `succeeded` executions / `delivered`
outcomes about the record's intents (`delegation_request`, `outbound_message`) via the shared `intentLifecycle`. Otherwise:
"Her Keys has not contacted <name>."

## 19. Sharing / privacy-scope truth (CP1 contract D) — **OWNER-ONLY SCOPE LABEL**

`coparent-shared` **does not give another person access.** Evidence:

* SD4-033 (`BUILD4_SD4_CLOUD_SCHEMA.md`): "`coparent-shared` is owner-only for all of Build 4. It is a private category … never a grant of access to another account."
* RLS: `private.can_access_scoped_row()` — `household`/`child` → any member; `personal`/`professional`/**`coparent-shared`** → owner only (`BUILD4_FEATURE_ACCEPTANCE.md`, matrix "another member is the owner → DENY all — including the owner of the household").
* Executable proof: `supabase/tests/20-scope-isolation.sql` (a `coparent-shared` task: owner allow, other member deny).
* The counterpart is not an account and not a household member; nothing in the app sends or exposes data to another adult.

Therefore Feature 07 **never renders** "Shared with X", "X can see this", "Visible to both parents", "Sent to X" or the raw scope label.
The one privacy line it may show, only on detail and only for an owner-only row, is: **"Only your account can open this in Her Keys."**
Feature 07 creates its rows as `coparent-shared` (the most private choice); it never rewrites an existing row's scope (MP-07-14).

## 20. Legal / custody boundary

Feature 07 organises operational logistics. It never infers or states custody percentage, legal parenting time, legal residence,
decision-making authority, pickup authorization, contempt, violation, compliance or enforceability, and never calls its records
court-ready, admissible, verified, a legal record or custody proof. A user-typed statement stays her own words ("You recorded: …"). Copy
is centralised in `src/features/coparent/copy.ts` and mechanically audited (§ copy-truth audit).

**Timezone / canonical-time contract (Addendum F).** All entry, display and recurrence arithmetic use `state.user.timezone` (the household
zone), or a rule's own explicit `timezone`; **never** `deviceTimeZone()`, never a zone inferred from a location string, a city name or a
person. Instants are absolute, so the same handoff is the same moment on every device. When the device zone differs the hub says so
once ("Times are shown in your household time zone, <zone>."). Spring-forward and fall-back follow `zonedTimeToEpochMs` (nonexistent
hour → forward; repeated hour → first).

**Location / time privacy treatment (Addendum L).** The exact location is not printed on the hub; the hub row shows child, day and time,
title and status. Location appears on the transition detail behind an explicit "Show location" control that re-hides on leaving. Nothing
logs or analyses a location, title or note; the reveal state is component-local and keyed by household + transition, so an account switch
cannot carry a revealed location across. This is a deliberate glanceability decision for a possibly-contentious-separation user, not a
claim of confidentiality: Today/Calendar (out of scope) still show an event's location (MP-07-12).

---

## 21. Hub

* **Route.** ONE new file, `app/(app)/life/coparent.tsx` (path `/life/coparent`), composing `CoParentScreen`. Its `mode` param selects the view (hub when absent; `handoff`, `followup`, `new-handoff`, `edit-handoff`, `new-prep`, `new-followup`, `edit-followup`), so a detail or editor is the same route pushed with different params and Back returns to the hub. The header title is set inside the screen with `<Stack.Screen options={{ title }} />` (Expo Router SDK 57). `_layout.tsx` and the Life `index.tsx` are untouched (HK-INT-WAVE2-LIFE-REGISTRATION).
* **Availability first.** `availabilityOf(snapshot, account)` runs before anything renders: *loading* shows only a loading state; *unrecovered* (damaged / newer / unreadable / other-mode storage → a FRESH household) shows only that notice, with no hub and no create action; *another account's household* renders nothing. So an empty projection can never be shown while hydration is incomplete or for data that could not be read (tests AZ / BA, mutants M28 / M29).
* **Organised by child + need, never by the other adult.** Sections in fixed order, each shown only when it has content: **Next handoff** (the chronologically next one — never skipped because it needs review), **Needs you**, **Waiting on someone**, **Needs review**, **Coming up** (collapsed to five with "Show N more"), **Preparation** (grouped under each child), **Money to follow up**, **Recently completed**. Every handoff appears in exactly ONE place (sections hold ids; test BC), and no sentence or heading is about an adult.
* **Truth on the face of a row.** Each row says child, day and time, title, and — in words — who is recorded as responsible and how far it got, or that nobody is; whether preparation is recorded; whether anything needs review. Status tags ("Needs you", "Waiting", "Covered", "Repeats") are never the only carrier of a state.
* **No location on the hub** (§36). No score, percentage, rating, streak or "reliability" anywhere. A zone note appears only when the device zone differs from the household zone.
* **Named blocked states** instead of dead controls: no child → "A child comes first"; no or archived co-parenting category. The create buttons are disabled and the notice above them is the explanation.
* **Empty state** says only "Nothing coming up is recorded here" and that the screen shows what she recorded in Her Keys — never "all caught up", never a claim about the relationship or the legal situation.
* **Footnote** on every hub: it shows only what was recorded, it isn't a legal record, and it doesn't say what anyone agreed to; and "Her Keys hasn't contacted anyone."

## 22. Transition detail

* **Facts:** child, title, when (household zone; "Next: …" for a derived repeat date), status ("Happening now" / "This time has passed. Nothing is recorded about whether it happened."), then, only where they apply, the repeat pattern ("Repeats every 2 weeks on Friday. This is the pattern you recorded."; a derived date adds "Recorded for <date>. Nothing is recorded for this date."), responsibility, "needs you" reasons, preparation, review notices, and what is **not recorded** (needs-you, outcome).
* **Location:** the row says only "A location is recorded" or "No location recorded". With a location there is a **Show location** control; the text renders only while revealed, and the reveal is keyed by household + handoff so it resets on leaving or switching account.
* **Responsibility actions come only from `availableResponsibilityActions(view)`** (the domain rules said up front): "Record that you've asked someone"; then *acknowledged*, *accepted and I need do nothing more*, *accepted and I still need to act*, *declined*, *their part complete*, *a different person*, *take it back*, *it still / no longer needs me*. An unavailable counterpart is offered only "Record a different person" and "Take it back" — never a positive recording. Every label begins "Record …": it records what SHE says happened; nothing is sent.
* **Preparation:** the readiness sentence and each linked item with its exact standing ("Open", "Marked done", "Removed from the list. Not marked done."), "Mark done" and "Remove from the list" for open items, "Unlink" for a linked one, and "Add preparation" pre-linked to this handoff.
* **Edit** opens the handoff editor from the row as it is (child, times, location, notes, commitment, "needs you", repeat — the counterpart is a responsibility action, not an editor field). **Remove handoff** is a two-step in-place confirm; removal is "Removed", never "completed".
* **Owner-only line:** "Only your account can open this in Her Keys." — shown only when the row really is owner-only.
* **Follow-up detail:** title, child, "Amount you entered: 80.00 USD" with "An amount you entered isn't an agreed amount.", follow-up date, status ("Follow-up open" / "Marked done. Her Keys has no record of a payment."), the responsibility lines and actions, and — only from a real `paid` outcome — "A connected service reported a payment."
* **Editors** open empty — no child among several, no date, no time, no length, no direction, no currency is guessed (one child is pre-selected *visibly*; a currency she already used is pre-selected *and labelled* as such). Title starters only fill the title text. An unfinished new person in the picker is never silently dropped. A stale row turns Save off and says why.

## 23. Backend / sync

* **No schema change and no feature-specific sync.** Feature 07 writes only kinds that are already pushable and mutable (`event`, `task`, `person`, `responsibility`, `dependency`, `recurrence`, plus append-only `observation` from the shared transitions). Every write is a canonical mutation the store's change observer queues; there is no queue, transport, coordinator or table of its own.
* **Proofs of the production composition.**
  * `tests/coparent/syncComposition.test.mjs` — **6** tests through `composeAccountApp` against the in-model cloud: the representative journey and a second device (identical projection), only synced canonical kinds written, offline create + edit → restart offline → reconnect (one row, edit applied), lost acknowledgement (no duplicate), permanent refusal (record kept, surfaced, not hammered), a 460-row household above the queue and pull thresholds.
  * `supabase/tests/run-coparent.mjs` — **34 checks** against real local PostgreSQL / PostgREST / RLS / the real claim RPC (§24), including client A → queue → PostgreSQL → client B in both directions, restart, and account switch.
  * `node supabase/tests/run.mjs` at the final head — **800 / 800** (the repair ledger's figure), run once, alone.
  * Mutants M25 / M26 (disconnect the production composition; stop the observer queueing) fail the composition suite.
* **A real defect found by this journey** (§31, D1): the claim corrupted child names containing an "s" ("Josie" → "Jo ie"), which the pull then wrote back to the device. Repaired with one line and pinned by `tests/claimDisplayName.test.mjs` and mutant M27.
* `owner_profile_id` is set by the existing projection for `coparent-shared` (`ownerFor`), which the real database journey proved (the `owner_scope_check` CHECK would otherwise refuse the row).

## 24. RLS / security

**Materially applicable, so attacked** — Feature 07 files its rows as owner-only `coparent-shared`, and "scope label ≠ sharing" is a headline claim. There is **no new backend representation**, so the inherited certified common posture is otherwise unchanged and the common RLS suite was not duplicated. Against the real rows Feature 07 wrote (`run-coparent.mjs`):

| Actor | Attack / read | Result |
|---|---|---|
| **Owner** (P) | read own `coparent-shared` events (2) and tasks (3) | **allowed** — 2 / 3 |
| **Same-household member** (Q, legitimately added) | read household-scope rows | **allowed** (the session works — blocking everyone is not a PASS) |
| Same-household member | read the owner's `coparent-shared` events and tasks | **0 rows** — `coparent-shared` is not sharing |
| Same-household member | read the owner-private people, responsibilities, dependencies, recurrence rules | **0 rows** |
| Same-household member | update an owner-only handoff; insert an owner-only row as a forged owner | **0 rows updated; refused, `42501`** |
| **Unrelated authenticated account** (R) | read events / tasks / people / responsibilities; update; plant an event | **0 rows; nothing changed; plant refused `42501`** |
| **Anonymous** | read any of the above | **0 rows / refused** |
| Account switch on one device | P's household under account R | **quarantined (`boundOther`), no sync started, 0 requests** |

The attacks changed nothing (no location rewritten, nothing planted, same event count). Security facts also inspected mechanically: the shipping `private.can_access_scoped_row` opens only `household` / `child` to members (`tests/coparent/sharing.test.mjs`).

## 25. Offline / restart

* **Create → edit → restart (local).** `editing.test.mjs › J`: a real store persists; a relaunch on the same storage brings back the same child id, counterpart id, recurrence and responsibility.
* **Offline create + edit → restart offline → reconnect.** `syncComposition.test.mjs › K`: the change and its intent are durable in one write; a fresh runtime from the persisted envelope alone shows the handoff with its child and counterpart identities intact; on reconnect the cloud holds exactly one event / person / responsibility, the edit is applied, and a second device converges — with **no upgrade**: a recorded request never arrives as accepted.
* **Restart against the real database.** No duplicate rows and no second claim (`run-coparent.mjs`, counts unchanged across restart).
* **No** data loss, duplicate handoff, lost child or counterpart identity, responsibility upgrade, false agreement, false payment or stale preparation state was observed in any of these.
## 26. Scenario assertion map

**Scenario prose is not coverage.** This table is GENERATED from the executable registry (`tests/fixtures/coparent/scenarios/index.mjs`, rendered by `scripts-dev/f07-scenario-map.mjs`). `tests/coparent/scenarioMap.test.mjs` mechanically verifies that (1) every required scenario (Tier 1, addendum Tier 1, Tier 2, Tier 3) has exactly one entry, (2) every named assertion exists as a real test title in its file, (3) every fixture reproduces its hand-written expected evidence, is deterministic, and matches its pinned semantic output (`tests/fixtures/coparent/scenarios/golden/<id>.json` — child, counterpart, transition/responsibility/coverage state, preparation, dependency standing, recurrence, amount, follow-up state, sharing state, unknown facts, available actions). "suite property" rows are cross-cutting behaviours proven by the named tests rather than by one semantic fixture. `journey` = `supabase/tests/run-coparent.mjs` (real PostgreSQL / PostgREST / RLS).

| ID | Scenario | Status | Fixture (semantic output) | Named assertions (test file › title) |
|---|---|---|---|---|
| | **TIER 1** | | | |
| A | No co-parent logistics records | PASS | `golden/A.json` | core › A: no records<br>state › A/AG |
| B | One child / one upcoming handoff | PASS | `golden/B.json` | core › B/F/G |
| C | Multiple children | PASS | `golden/C.json` | core › C: multiple children |
| D | Different children, different counterpart adults | PASS | `golden/D.json` | identity › D: different children keep different counterpart adults |
| E | Two counterpart adults with the same display name | PASS | `golden/E.json` | identity › E: two people with the SAME display name |
| F | Handoff with known date/time | PASS | `golden/F.json` | core › B/F/G<br>schedule › AJ: an evening handoff |
| G | Handoff with unknown location | PASS | `golden/G.json` | core › B/F/G |
| H | Create handoff | PASS | suite property | editing › H: creating with a NEW counterpart<br>editing › create is ALL-OR-NOTHING<br>core › B/F/G |
| I | Edit handoff | PASS | suite property | editing › I: an edit keeps scope<br>core › I: editing keeps child identity |
| J | Restart after create/edit | PASS | suite property | editing › J: create + edit are durable |
| K | Offline create → reconnect | PASS | suite property | syncComposition › K: create + edit OFFLINE |
| L | Second device receives correct child identity | PASS | suite property | syncComposition › a representative journey<br>run-coparent (real PostgreSQL) › journey |
| M | Second device receives correct counterpart identity | PASS | suite property | syncComposition › a representative journey<br>run-coparent (real PostgreSQL) › journey |
| N | Assigned responsibility, unaccepted | PASS | `golden/N.json` | responsibility › N: a recorded request |
| O | Accepted responsibility not automatically covered | PASS | `golden/O.json` | responsibility › O: accepted is not covered |
| P | Covered only when common semantics support it | PASS | `golden/P.json` | responsibility › P: covered only |
| Q | User is responsible | PASS | `golden/Q.json` | responsibility › Q: "you are responsible" |
| R | Other adult assigned but item remains unresolved | PASS | `golden/R.json` | responsibility › R: another adult |
| S | Preparation/packing task | PASS | `golden/S.json` | preparation › S: preparation is an ordinary canonical task |
| T | Completed packing task does not claim other household received | PASS | `golden/T.json` | preparation › T: a completed preparation task |
| U | Removed preparation prerequisite is unavailable, not completed | PASS | `golden/U.json` | preparation › U: a REMOVED prerequisite |
| V | Recurring transition using existing recurrence | PASS | `golden/V.json` | schedule › V: weekly<br>schedule › every 2 weeks keeps its phase |
| W | Recurring transition not described as a legal custody schedule | PASS | suite property | schedule › W: the wording never calls<br>copyTruth › no COPY string carries an unsupported claim |
| X | User-recorded planned handoff not described as agreed | PASS | `golden/X.json` | responsibility › N: a recorded request<br>copyTruth › zero unsupported claims in anything |
| Y | Recorded-complete not described as legal compliance | PASS ¹ | `golden/Y.json` | responsibility › a recorded-complete responsibility |
| Z | Counterpart later archived / removed | PASS | `golden/Z.json` | responsibility › Z/AA: an accepted, covered counterpart<br>identity › AP: a responsibility naming a person |
| AA | No automatic reassignment after counterpart invalidation | PASS | `golden/AA.json` | responsibility › Z/AA: an accepted, covered counterpart<br>identity › archiving a person changes nothing |
| AB | Child-related amount / follow-up task | PASS | `golden/AB.json` | money › AB: a child-related follow-up |
| AC | Follow-up task completion does not become payment received | PASS | `golden/AC.json` | money › AC: completing the follow-up |
| AD | Amount entered does not become agreed debt | PASS | `golden/AD.json` | money › AD: an amount she entered |
| AE | Feature remains useful without the other adult's account | PASS | `golden/AE.json` | sharing › the counterpart needs no account |
| AF | No data-sharing claim without actual access evidence | PASS | `golden/AF.json` | sharing › CP1 capability fact<br>sharing › no presentation, for any state |
| AG | Empty state does not imply relationship/logistics are problem-free | PASS | `golden/AG.json` | state › A/AG |
| AH1 | User is sending / dropping off | PASS | `golden/AH1.json` | direction › AH1: the user-sending handoff |
| AH2 | User is receiving / picking up | PASS | `golden/AH2.json` | direction › AH2: the user-receiving handoff |
| AH3 | Cross-timezone canonical-time stability | PASS | `golden/AH3.json` | schedule › AH3: created in one zone |
| AH4 | Child later archived / invalidated | PASS ¹ | `golden/AH4.json` | identity › AO/K: a handoff whose child is not in the household |
| AH5 | Exact handoff location is not exposed on broad hub surfaces | PASS | `golden/AH5.json` | core › the hub view never carries the location text<br>copyTruth › the exact location is never on the hub |
| AH6 | Recently Completed requires actual completion evidence | PASS | `golden/AH6.json` | preparation › AH6: recently completed requires |
| AH7 | No canonical amount facet → truthful follow-up without amount | NOT-APPLICABLE ¹ | suite property | money › AB: a child-related follow-up |
| | **TIER 2** | | | |
| AH | Dense fixture with 3–5 children | PASS | suite property | state › AH: a dense household |
| AI | 100+ logistics-related records | PASS | suite property | state › AI: 100+ logistics records |
| AJ | Midnight / logical-day rollover | PASS | suite property | schedule › AJ: logical-day rollover |
| AK | Spring-forward | PASS | suite property | schedule › AK: spring-forward<br>schedule › AK: a weekly 9:00 AM pattern |
| AL | Fall-back / repeated hour | PASS | suite property | schedule › AL: fall-back |
| AM | Account A → sign out → Account B | PASS | suite property | state › AM: Account A<br>run-coparent (real PostgreSQL) › journey |
| AN | Demo / account isolation | PASS | suite property | state › AN: the demo household |
| AO | Malformed child reference | PASS | suite property | identity › AO: the adult account user is not a child<br>identity › a handoff filed with no child |
| AP | Malformed counterpart reference | PASS | suite property | identity › AP: a responsibility naming a person |
| AQ | Stale handoff editor | PASS | `golden/AQ.json` | editing › AQ: a stale editor is refused |
| AR | Double-save | PASS | suite property | editing › AR: a double-tap on Save<br>editing › a single concurrent double-submit |
| AS | Sync retry | PASS | suite property | syncComposition › AS: a lost acknowledgement |
| AT | Permanent server refusal | PASS | suite property | syncComposition › AT: a permanent server refusal |
| AU | Large household above historical queue / pull thresholds | PASS | suite property | syncComposition › AU: a household above the queue |
| AV | Local-only state excluded from cloud | PASS | suite property | state › AV: using the feature writes only synced<br>syncComposition › only synced canonical kinds are written |
| AW | Stable deterministic ordering | PASS | suite property | state › AW: order is deterministic |
| AX | Screen-reader responsibility state | PASS | suite property | copyTruth › every screen-reader label states |
| AY | Screen-reader unknown state | PASS | suite property | copyTruth › every screen-reader label states |
| AZ | Loading ≠ empty | PASS | suite property | state › AZ: LOADING is not EMPTY |
| BA | Quarantined / unrecovered ≠ empty | PASS | suite property | state › BA: an unrecovered household |
| BB | Common factual attention semantics do not contradict Calendar | PASS ¹ | suite property | preparation › property: for every combination<br>responsibility › answer overdue is the shared clock-derived fact |
| BC | Same transition projected in several sections remains one canonical truth | PASS | suite property | state › BC: the same handoff |
| BD | Scope label does not create sharing behavior | PASS | suite property | sharing › every row Feature 07 creates<br>sharing › the view says only |
| BE | No sibling Wave 2 imports | PASS | suite property | copyTruth › BE: no sibling-feature import |
| BF | Raw Talk It Out source excluded | PASS | suite property | privacy › BF: |
| BG | Privacy / secret scan | PASS | suite property | privacy › BG: |
| BH | RLS attacks where materially applicable | PASS ¹ | suite property | run-coparent (real PostgreSQL) › journey |
| | **TIER 3 (conditional)** | | | |
| BI | Existing canonical request / execution lifecycle | PASS ¹ | suite property | responsibility › request evidence |
| BJ | Existing explicit acceptance lifecycle | PASS | suite property | responsibility › O: accepted is not covered |
| BK | Existing explicit reimbursement-payment outcome | PASS ¹ | suite property | money › payment is shown ONLY from a real `paid` outcome |
| BL | Existing canonical task → handoff relationship | PASS ¹ | suite property | preparation › S: preparation is an ordinary canonical task |
| BM | Existing shared collaboration semantics | NOT-APPLICABLE ¹ | suite property | sharing › CP1 capability fact |
| BN | Existing relationship-role semantic | PASS ¹ | suite property | identity › a person recorded as something other than co-parent |
| BO | Existing recurring Systems relationship | NOT-APPLICABLE ¹ | suite property | — |
| BP | Existing document / admin relationship | NOT-APPLICABLE ¹ | suite property | — |

**Notes (¹)**

* **Y** — A HANDOFF cannot be recorded complete (no event outcome exists — MP-07-02 / OC-1, capability stopped); the responsibility completion is what is recorded, and it is worded "You recorded …".
* **AH4** — The foundation has no child lifecycle (MP-07-04), so an "archived" child cannot be stored; the projection is proven on hand-built (unvalidated) state where the child is no longer in the household: NEEDS REVIEW, never re-attached, never matched by name.
* **AH7** — NOT-APPLICABLE — FOUNDATION CAPABILITY PRESENT: the `value` money facet exists on tasks and events (foundation/money.ts, commitment.ts), so AB / AC / AD apply as written. No amountless variant is manufactured.
* **BB** — Feature 07 derives every timing/readiness fact from the shared primitives (isUnacknowledged, standingOf, readinessOf) and does not import attentionFor (MP-07-13). The shared Calendar itself is F03 and is integrated later (HK-INT-COPARENT-CALENDAR-01).
* **BH** — Materially applicable: Feature 07 files its rows as owner-only `coparent-shared`. Attacked against the real rows by owner / same-household member / stranger / anon (34 checks in run-coparent.mjs); no new backend representation exists, so the inherited certified common posture is otherwise unchanged.
* **BI** — READ-ONLY: the intent → execution → outcome model exists; no provider exists, so Feature 07 only renders "sent"/"delivered" from rows that exist (tested with pulled fixture rows). It creates none.
* **BK** — READ-ONLY: a `paid` outcome under a succeeded `financial_action` execution about the task is the only payment evidence shown; none can be produced by a device on this baseline.
* **BL** — EXISTS: Dependency{requires, event → task}. No new relationship was created.
* **BM** — `coparent-shared` is an owner-only label (SD4-033); no collaboration semantic exists to consume.
* **BN** — EXISTS: HouseholdPerson.relationship (PERSON_RELATIONSHIPS). Used only as recorded; no global child → co-parent relation was invented.
* **BO** — No relationship between a System and a handoff exists, and Feature 07 creates no System (HK-INT-COPARENT-SYSTEMS-01).
* **BP** — No document primitive exists on this baseline; Life Admin is a later domain (HK-INT-COPARENT-LIFEADMIN-01).

## 27. Tier 1 results

**40 items: 39 PASS, 1 NOT-APPLICABLE, 0 SAFE-UNAVAILABLE, 0 DEFERRED-IN-RUN, 0 FAIL.** (A–AG = 33 core scenarios; AH1–AH7 = the addendum's seven.) Full mapping in §26.

* **Not a plain PASS, with the reason on the record:**
  * **AH7 — NOT-APPLICABLE (foundation capability PRESENT).** The `value` money facet exists on tasks and events, so AB / AC / AD apply as written and PASS; no amountless variant was manufactured.
  * **Y — PASS for what exists.** A *handoff* cannot be recorded complete (no event outcome exists, MP-07-02 / OC-1); the counterpart's *responsibility* completion is what is recorded, worded "You recorded …", and never as compliance.
  * **AH4 — PASS by defensive projection.** The foundation has no child lifecycle (MP-07-04), so an "archived" child cannot be stored; on hand-built (unvalidated) state where the child is no longer in the household the handoff and its preparation are NEEDS REVIEW, never re-attached and never matched by name.
* Every scenario has a fixture, named assertions, expected semantic evidence, a test file and a result (§26); none rests on a JSX snapshot.

## 28. Tier 2 results

**27 items (AH–BH): 27 PASS.** Builder hardening: every supported defect found was repaired (§31). Notes: **BB** is proven against the shared primitives (`isUnacknowledged`, `standingOf`, `readinessOf`) because the shared Calendar is F03 and is integrated later; **BH** (RLS) was materially applicable and attacked against the real rows (§24); **AM** and the account switch were exercised both in-model and against the real database (quarantine, 0 requests). No item is documented debt.

## 29. Tier 3 results

**8 conditional items: 5 PASS, 3 NOT-APPLICABLE — none manufactured.**

| Item | Result | Note |
|---|---|---|
| BI existing request/execution lifecycle | PASS (read-only) | the intent → execution → outcome model exists; no provider exists, so Feature 07 only *renders* "sent"/"delivered" from rows that exist, and creates none |
| BJ existing acceptance lifecycle | PASS | the responsibility lifecycle is used exactly as recorded |
| BK explicit reimbursement-payment outcome | PASS (read-only) | a `paid` outcome under a succeeded `financial_action` execution about the task is the only payment evidence shown; a device cannot produce one |
| BL task → handoff relationship | PASS (exists) | `Dependency{requires, event → task}` |
| BM shared collaboration semantics | NOT-APPLICABLE | `coparent-shared` is an owner-only label; nothing to consume |
| BN relationship-role semantic | PASS (exists) | `HouseholdPerson.relationship`, used only as recorded |
| BO recurring Systems relationship | NOT-APPLICABLE | no System ↔ handoff relationship exists; Feature 07 creates no System |
| BP document / admin relationship | NOT-APPLICABLE | no document primitive exists |
## 30. Mutation evidence (test-the-test)

`scripts-dev/f07-mutation-check.cjs` changes ONE source line the way a defect would, runs the tests meant to catch it, and restores the file byte for byte. It exits non-zero if any mutant survives, does not apply exactly once, or a file is not restored. Run serially at the final head (`33e44be`+): **42 caught, 0 survived, 0 broken.** `git status` was clean before and after.

The 11 failure modes the contract requires (child identity, counterpart identity, assigned≠covered, agreement, legal, packing, reimbursement, counterpart invalidation, sharing, sync composition, loading≠empty) each have at least one mutant below (M1–M3, M4–M5, M6–M8, M9–M10, M11–M12, M13–M15, M16–M19, M20–M21/M42, M22–M24, M25–M27, M28–M29), plus hardening mutants.

**Honest history.** The FIRST full run caught 38 of 42; four SURVIVED (M28 loading-by-status, M32 unrelated-edit schedule anchor, M38 next handoff needing review, M39 tie ordering) — each was a scenario no test exercised. A test was added for each and all four now fail under their mutant. One earlier mutant-shaped defect was found without a script: the stale-edit check that trusted `updatedAt` alone (D2, M31 now pins it).

| Mutant | Result | Guards | The defect it introduces |
|---|---|---|---|
| M1 | **CAUGHT** (5 failing) | child identity | a handoff's child is looked up by position (the first child), not by id |
| M2 | **CAUGHT** (14 failing) | child identity | creating a handoff drops the child (subjectMemberId is never written) |
| M3 | **CAUGHT** (2 failing) | child identity | an edit drops the child when the form is saved |
| M4 | **CAUGHT** (1 failing) | counterpart identity | a person is found by DISPLAY NAME, so two people named Alex collapse into the first |
| M5 | **CAUGHT** (3 failing) | counterpart identity | same-name people share one label (the picker cannot tell them apart) |
| M6 | **CAUGHT** (4 failing) | assigned != covered | a merely requested (assigned) counterpart counts as covering the handoff |
| M7 | **CAUGHT** (2 failing) | accepted != covered | an acceptance alone (still needs her) counts as covered |
| M8 | **CAUGHT** (1 failing) | assigned != requested | an `owned` person row (no request recorded) is worded as a request |
| M9 | **CAUGHT** (5 failing) | planned != agreed | a recorded request is worded "agreed to this" |
| M10 | **CAUGHT** (5 failing) | planned != agreed | the repeat line says the other party agreed |
| M11 | **CAUGHT** (6 failing) | schedule != legal | an operational recurrence is worded as a custody schedule |
| M12 | **CAUGHT** (4 failing) | complete != compliance | a recorded-complete responsibility is worded as compliance |
| M13 | **CAUGHT** (2 failing) | packed != received | a completed preparation item is worded as delivered to the other household |
| M14 | **CAUGHT** (2 failing) | removed != packed | a REMOVED preparation item reads as done |
| M15 | **CAUGHT** (2 failing) | no packing != ready | an empty preparation list reads as "all marked done" |
| M16 | **CAUGHT** (3 failing) | follow-up done != payment | a completed follow-up task is worded as payment received |
| M17 | **CAUGHT** (3 failing) | follow-up done != payment | completing the follow-up task makes the payment evidence "reported paid" |
| M18 | **CAUGHT** (1 failing) | amount entered != agreed | a zero amount is accepted as a follow-up about money |
| M19 | **CAUGHT** (1 failing) | no direction != default | the money direction is defaulted when she did not choose one |
| M20 | **CAUGHT** (3 failing) | invalidated counterpart | an archived counterpart keeps the positive coverage it had |
| M42 | **CAUGHT** (3 failing) | invalidated counterpart | the stale "no longer needs you" of an archived counterpart still reads as not needing her |
| M21 | **CAUGHT** (1 failing) | invalidated counterpart | a positive answer can be recorded for an archived person |
| M22 | **CAUGHT** (6 failing) | scope label != sharing | the privacy line claims the record is shared with the other parent |
| M23 | **CAUGHT** (2 failing) | scope label != sharing | Feature 07 files its rows household-visible instead of owner-only |
| M24 | **CAUGHT** (1 failing) | scope label != sharing | the presenter says nothing-about-visibility rows are owner-only too |
| M25 | **CAUGHT** (5 failing) | production composition | composeAccountApp stops telling the sync runtime about account state (a bound account never starts sync) |
| M26 | **CAUGHT** (5 failing) | production composition | the change observer stops queueing (a canonical mutation never becomes sync intent) |
| M27 | **CAUGHT** (3 failing) | child name across the boundary | the claim mangles a child's name again (the /s+/ defect) |
| M28 | **CAUGHT** (1 failing) | loading != empty | the screen is allowed to render (and so to say "nothing recorded") while hydration is incomplete |
| M29 | **CAUGHT** (1 failing) | unrecovered != empty | a household that could not be read is treated as ready (and would render empty) |
| M30 | **CAUGHT** (2 failing) | stale editor | an editor opened on an old row overwrites newer content |
| M31 | **CAUGHT** (1 failing) | stale editor | staleness is decided by updatedAt alone (blind to two edits in one clock tick) |
| M32 | **CAUGHT** (1 failing) | recurrence edit | saving an unrelated field re-anchors the recorded schedule |
| M33 | **CAUGHT** (1 failing) | location privacy | the hub view carries the exact location text |
| M34 | **CAUGHT** (1 failing) | household zone | a handoff is placed in the DEVICE zone instead of the household zone |
| M35 | **CAUGHT** (1 failing) | household isolation | a view for the wrong household is built anyway |
| M36 | **CAUGHT** (1 failing) | answer overdue | an unanswered request never becomes an overdue fact |
| M37 | **CAUGHT** (1 failing) | one live owner | a second recorded counterpart is not refused as already recorded |
| M38 | **CAUGHT** (1 failing) | next handoff | the next handoff skips a handoff that needs review (hides the actual next one) |
| M39 | **CAUGHT** (1 failing) | ordering | time ties are ordered by array position (no id tie-break) |
| M40 | **CAUGHT** (2 failing) | recently completed | a REMOVED preparation item is listed as recently completed |
| M41 | **CAUGHT** (1 failing) | no invented link | a preparation task is linked to the next handoff for the same child without an edge |

## 31. Defects found / repaired

Found by reproduction (real-database journey, store tests, golden-fixture review, source audits, UI build), repaired inside approved Feature 07 semantics unless marked.

| ID | Sev | Where | Defect | Found by | Result |
|---|---|---|---|---|---|
| **D1** | **P1** | **shared** `src/domain/account/claim.ts` `cloudDisplayName` | the whitespace collapse was `/s+/g` (the LETTER s): a child named Josie reached PostgreSQL as "Jo ie", Chris → "Chri", Ross → "Ro", and the pull wrote the corrupted name back to the device. Present on every branch forked from `14bd58e` | real-PostgreSQL journey (a check on the child's stored name) | **REPAIRED** (one line, `61e9af1`), `tests/claimDisplayName.test.mjs` (4), mutant M27; **include once at integration** (HK-INT-COPARENT-CLAIM-NAME-01) |
| D2 | P2 | feature `mutations.ts` | stale-edit check compared `updatedAt` alone: two edits inside one clock tick let an old editor overwrite newer content | store test `commitMutation reports the NAMED outcome` | **REPAIRED** — revision token = `updatedAt` + content digest (+ recorded schedule); mutants M30 / M31 |
| D3 | P2 | feature `projection.ts` | an accepted counterpart who was later archived still reported `needsMe: false` (a stale "no longer needs you") | golden-fixture review of scenario Z | **REPAIRED** — needs her review (`needsMe: true`); mutant M42 |
| D4 | P3 | feature `present.ts` | doubled full stops in screen-reader labels; the detail repeated "No one is recorded as responsible" as both a line and an "unknown" | copy-truth run | **REPAIRED** (`spoken()`, `alreadyStated`) |
| D5 | P3 | feature `mutations.ts` | a handoff with no recorded child could not be opened for editing — the very repair for it | UI build | **REPAIRED** — seed opens with the child unchosen; save refused until one is chosen |
| D6 | P3 | feature `copy.ts` | the empty state said "Nothing recorded here yet", untrue for a household with only past handoffs | review of the empty-state contract | **REPAIRED** — "Nothing coming up is recorded here" |
| D7 | P3 | feature `present.ts` | status tags were inline strings outside `COPY`; prep "For:" labels were identical for two same-title handoffs on one day | UI build | **REPAIRED** (`COPY.tags`; label includes the time) |
| D8 | P4 | shared `reasoning/attention.ts` | `attentionFor`'s `risk` branch treats an *acknowledged* delegation as "handled elsewhere" (contradicts ACKNOWLEDGED ≠ ACCEPTED ≠ COVERED) | foundation trace | **RECORDED, not repaired** (MP-07-13); Feature 07 does not import it |
| D9 | P4 | shared `features/calendar/EventForm.tsx` | files every event as `household` scope even in the co-parenting category | foundation trace | **RECORDED** (MP-07-14) |
| D10 | P4 | shared `responsibility.ts` `accept()` | defaults `stillNeedsMe` to `false` ("no longer needs her") | foundation trace | **RECORDED**; Feature 07 never relies on it — she always chooses |
| D11 | P5 | feature semantics | removing a handoff leaves its responsibility row as it was (history is not rewritten); the hub excludes it | design review | **DOCUMENTED** |

No P0 defect was found. Nothing above required a schema change.

## 32. Missing primitives — see `HK_FEATURE_07_MISSING_PRIMITIVES.md` (MP-07-01 … MP-07-14)
## 33. Integration candidates

Recorded for the controlled integration phase. **Feature 07 implemented none of the sibling systems**; each row says what it provides and what integration must verify.

| ID | Direction | What Feature 07 provides | What integration must verify |
|---|---|---|---|
| HK-INT-COPARENT-TODAY-01 | unresolved transition logistics → Today briefing | `buildCoParentLogisticsView(...).needsMeIds / waitingIds / needsReviewIds` and `TransitionView.section` (a pure, id-based, non-mutating view) | Today reads the SAME facts (no second judgement); it must not re-derive "covered" from `acknowledged` |
| HK-INT-COPARENT-CALENDAR-01 | handoffs / transitions → shared Calendar | handoffs are ordinary `CalendarEvent`s (co-parenting category, `coparent-shared`), one anchor row per recurring pattern; derived dates via the shared `nextOccurrence` | Calendar must expand recurrence rules if it wants future dates (`projectDay` does not, MP-07-05); a co-parenting event's LOCATION is shown wherever Calendar shows events (MP-07-12) — decide whether co-parenting events need the same progressive disclosure there |
| HK-INT-COPARENT-KIDS-01 | child transition context → Kids OS | child identity by id; `needsMe`, readiness and money follow-up per child | Kids must not rebuild the transition layer; it may link into `life/coparent` |
| HK-INT-COPARENT-KIDS-ATTENTION-01 | Kids "Needs Attention" ↔ Co-Parent "Needs you" | both may judge the SAME child / commitment / preparation task / responsibility / dependency | **REQUIRED reconciliation:** identical canonical facts must not produce contradictory judgements; Feature 07 grounds its judgement only in `isUnacknowledged`, `standingOf`, `readinessOf` and the responsibility record |
| HK-INT-COPARENT-PEOPLE-01 | responsibility / counterpart relationships → People OS | the counterpart is only ever the holder of a responsibility; persons are created through `addPerson`; relationship words only as recorded | People OS owns archive/manage; it should say what "follow up with X" means (MP-07-10) and whether a per-child counterpart relation is wanted (MP-07-09) |
| HK-INT-COPARENT-MONEY-01 | reimbursement follow-up → Money OS | the task bridge: co-parenting `Task` + `value{amountMinor,currency,direction}` + `dueDate` + optional responsibility | `direction: 'inflow'` on a Feature 07 follow-up means "money she intends to follow up about", **not** owed or agreed; Money OS must not read it as a receivable without its own lifecycle (MP-07-07); a household currency does not exist (MP-07-08) |
| HK-INT-COPARENT-SYSTEMS-01 | repeating transition prep → Systems | preparation items and the `requires` edge; a repeat rule on the handoff | Systems may attach a routine; Feature 07 creates no System and duplicates no run engine |
| HK-INT-COPARENT-LIFEADMIN-01 | documents/admin related to transitions → Life Admin | nothing (no document primitive exists) | Life Admin decides whether a document may be linked to a handoff; Feature 07 never stores or names a legal document |
| HK-INT-TIO-COPARENT-01 | Talk It Out → reviewed logistics proposal | a reading may later be ACCEPTED into a handoff through the same mutations; Feature 07 never reads a reading or raw source (test BF) | acceptance goes through `createHandoff`/`createPreparation` with the user's confirmation and non-`user-action` provenance if inferred |
| HK-INT-WAVE2-LIFE-REGISTRATION | final Life hub registration | ONE route file `app/(app)/life/coparent.tsx` (path `/life/coparent`); `_layout.tsx` and `index.tsx` are untouched | register the route in the Life hub and set its header in `_layout.tsx`; no generalized Life plugin system was built |
| **HK-INT-COPARENT-CLAIM-NAME-01** | shared repair | the one-line fix `cloudDisplayName /s+/ → /\s+/` (commit `61e9af1`) + `tests/claimDisplayName.test.mjs` | **the same defect is present on EVERY branch forked from `14bd58e` (F05, F06, F08 …); include the fix ONCE at integration. No real environment holds a corrupted name (nothing was applied remotely), but any real household claimed by a client with the defect would hold "Jo ie"-style names and need a data repair — owner-gated** |
| HK-INT-COPARENT-CHILD-CREATE-01 | child creation after binding | (consumes children; creates none) | Kids OS owns MP-07-01; until it exists a real household with no child sees a named blocked state |
| HK-INT-COPARENT-EVENTSCOPE-01 | generic event editor scope | (n/a) | `EventForm` files every event as `household` scope, even in the co-parenting category (MP-07-14) — decide whether the category's own scope should default |
| HK-INT-COPARENT-ATTENTION-ACK-01 | shared attention | (avoids `attentionFor`) | `attentionFor`'s `risk` branch treats an *acknowledged* delegation as "handled elsewhere" (MP-07-13), contradicting ACKNOWLEDGED ≠ ACCEPTED ≠ COVERED |
| HK-INT-COPARENT-BACKEND-01 | backend harness | `supabase/tests/run-coparent.mjs` (34 checks) is a standalone runner beside `run.mjs` (a shared file this build did not edit) | fold `coparentJourneys(check, psql)` into `run.mjs` next to `productionCompositionJourneys` |
## 34. Accessibility

* **State is never carried by colour alone.** Every row's `accessibilityLabel` speaks child, day and time, tags, and the responsibility / coverage / preparation / unknown sentences *in words*; tags ("Needs you", "Covered", …) are also spoken. Copy-truth audit: every hub row label matches its child, a clock time, and a recorded-responsibility phrase; no doubled full stops.
* **Unknown is said, not implied** (`No one is recorded as responsible`, `No preparation recorded`, `Not recorded whether this needs you personally`, `No location recorded`) — in the row, in the detail and in the spoken label.
* **Roles and labels.** Every pressable has `accessibilityRole` and a label (UI render tests (c)); headings are `header`; errors are `alert`; live notices are polite.
* **No swipe-only or gesture-only action.** Everything is a button; removal is an in-place two-step confirm, not an alert or a swipe.
* **Touch targets.** The UI render test asserts none is below the design system's touch floor.
* **Disabled controls are explained.** Create buttons disabled by a blocked state carry an `accessibilityHint` and a visible notice.
* **Not verified:** real screen-reader behaviour (TalkBack/VoiceOver) and colour contrast on a device — see §39. The design-system contrast suite covers the tokens used.
## 35. Performance

**Methodology (recorded, not asserted).**

| Item | Value |
|---|---|
| Environment | Windows 11 Home 10.0.26200, developer laptop; other sessions, Docker and an emulator running concurrently (memory-starved host) |
| JS runtime | Node v24.14.0 |
| Mode | `node --test` with TypeScript type-stripping, **test mode** (no bundler, no minification, no Hermes) |
| Fixture | 175 records: 60 handoffs (a fifth recurring, a third with a counterpart), ~90 linked preparation items, 25 follow-ups; 3 children; `state.test.mjs › AI: 100+ logistics records` |
| Samples | 25 builds per run, the first (cold) included; median and p95 of the 25 |
| Measured | `buildCoParentLogisticsView` — the whole projection (no rendering) |

**Results (three independent runs of the same test):** median **6.30 ms** / p95 **11.10 ms** (first run: cold module + JIT warm-up, host under load); median **2.92 ms** / p95 **6.68 ms**; median **2.64 ms** / p95 **3.84 ms** (final full-suite run). Soft target: bounded projection **< 100 ms median** — met by more than an order of magnitude, and the test asserts it.

**What this is and is not.** Desktop Node is *algorithmic* evidence: the projection is linear in the household (indexed maps, one pass per collection, no per-record scan of the whole state). It is **not** device UI performance: Hermes, first render and layout on a phone were not measured (§39). Determinism is asserted alongside speed (two builds deep-equal; reversing the stored arrays changes nothing).
## 36. Privacy

**Was additional glanceability protection for handoff location/timing considered, and what treatment was chosen?**
Yes — considered deliberately, against the real UI structure (Addendum L). Decision:

* **The hub never carries a location.** `TransitionView` holds only `hasLocation: boolean`; the location TEXT exists on `TransitionDetailView` alone (test *"the hub view never carries the location text"*, mutant M33). Hub rows show child, day and time, title and status — the minimum needed to answer "what is the next handoff?".
* **The exact location is behind an explicit control on detail** ("Show location" / "Hide location"). It is hidden by default, shown only while revealed, and the reveal is component-local state keyed by `household id + handoff id`, so leaving the screen or switching household forgets it (UI tests *(b)* and the account-switch case).
* **Screen-reader labels on the hub never include a location** (copy-truth audit); the detail label says only "A location is recorded".
* **Nothing logs or analyses a location, title or note**: no `console`, no analytics, no storage API (source audit, test BG).
* **What this is not:** it is a glanceability decision for a user who may share a phone or screen in a contentious situation — not a claim of confidentiality. The same event still appears in Today/Calendar with its location (those surfaces are out of scope; recorded as MP-07-12 / HK-INT-COPARENT-CALENDAR-01). No "hide" toggle, blur or lock was added: that would be security theatre without a device-level control.

**Other privacy facts**

* **Owner-only by construction.** Every row Feature 07 creates is `coparent-shared` (the most private scope). That scope is an owner-only *label*, not sharing (§19); the only visibility sentence is "Only your account can open this in Her Keys." and it appears only when the row is actually owner-only.
* **No other person is contacted, notified, invited or exposed.** The counterpart needs no account; the feature holds no address, phone or e-mail (a person's `channel` is left `unspecified`).
* **No raw source.** Feature 07 never reads a Talk It Out reading or source artifact and never writes one (test BF, with a canary).
* **Account switching isolates households.** The projection holds no module-level state; a device holding another account's household opens nothing (`availabilityOf` → `other_account`); the projection built for one household contains none of another's child, title, place, person or amount (tests AM/AN; real-database quarantine check).
* **Demo isolation.** A handoff created in the demo household is `demo-seed` provenance and never reaches the cloud.
* **Secret scan.** Zero credential patterns in every file Feature 07 owns (test BG). The one JWT-shaped string in the owned files is the *published* Supabase local-demo anon key that the repo's own harness (`support/syncDevice.mjs`) already carries; the scan treats that exact value as documentation, not a secret.
* **Sensitive words are only the user's own.** Titles, locations and notes are stored exactly as typed in their own columns; no free text is copied into observations or evidence.

## 37. Test accounting

| Suite | Baseline `14bd58e` | Final head | Note |
|---|---|---|---|
| Full application suite (serial) | 975 tests / 207 suites | **1258 tests / 239 suites, 1258 pass, 0 fail, 0 skipped** | **+283 tests / +32 suites** |
| Targeted IR01 (`tests/hk-ir01`) | 163 / 163 | **163 / 163** | unchanged |
| Backend harness (`supabase/tests/run.mjs`, real local PostgreSQL + PostgREST) | 800 / 800 (repair ledger) | **800 / 800** | run once, alone, at `f698878` (already carrying the claim repair). It exercises the backend and foundation, not the feature: `git diff --name-only f698878 HEAD -- supabase src/domain src/store src/platform src/persistence src/state` is **empty**, so its result stands for the final head |
| Feature 07 real-database journey (`run-coparent.mjs`) | — | **34 / 34** | run three times: the first run (33 / 34) found D1; re-run after the repair (34 / 34); and again at the final head (34 / 34) |
| Mutation check (`f07-mutation-check.cjs`) | — | **42 caught, 0 survived, 0 broken** | first full run 38 / 42 (§30) |
| TypeScript (`tsc --noEmit`, `--max-old-space-size=1600`) | clean | **clean, exit 0** | includes the UI, route and all new tests' sources |
| Expo Doctor | 21 / 21 | **21 / 21, no issues** | |
| Android export (`expo export`, Metro + Hermes) | one bundle | **exit 0, one 6.5 MB Hermes bundle that CONTAINS Feature 07** | see the export caveat below |

**New tests (+283):** `ui` 80 · `scenarioMap` 36 · `copyTruth` 24 · `responsibility` 18 · `schedule` 18 · `state` 17 · `editing` 15 · `money` 15 · `identity` 14 · `preparation` 11 · `core` 9 · `direction` 6 · `sharing` 6 · `syncComposition` 6 · `privacy` 4 (= 279 in `tests/coparent`) · `claimDisplayName` 4 (shared repair regression).

**Inherited-test disposition (mission requirement): PRESERVED — all 975.** `git diff --name-status 14bd58e HEAD -- tests` shows only additions; **no inherited test was rewritten, replaced or removed.** (One new file, `tests/claimDisplayName.test.mjs`, pins the shared repair.)

**Export caveat, and a finding for every parallel worktree.** A worktree whose `node_modules` is a *junction* to the main checkout does **not** bundle its own routes: Expo's Babel plugin computes the app root relative to the junction path, but Metro resolves the route context from the package's *real* path, which lands in the **main checkout's** `app/`. The first export here exited 0 and produced a 6.3 MB bundle that contained the main checkout's routes (`other-tasks`, `needs-me`) and **none** of Feature 07's strings — so it was discarded as evidence. A truthful export was made from a scratch copy of the worktree with a *real* `expo-router` and junctions for everything else (scratch removed afterwards; the main `node_modules` was verified untouched); that bundle contains "Co-parent logistics", "Show location", the owner-only line and the payment sentence. Other worktrees' recorded "Android export exit 0" gates should be re-checked for the same hazard.

## 38. Schema / fingerprint

**No Feature 07 schema change was made, planned or needed.** No migration was created; no RLS, sync kind, column or table was added; `git diff --name-only 14bd58e HEAD -- supabase/migrations supabase/tools src/domain/sync` is empty.

| | Value |
|---|---|
| OLD fingerprint (repair baseline) | `43e7c8a4402a3387cb2e1add4170921e` / 3617 facts |
| NEW fingerprint (final head, read-only measurement of the shared local DB, `verify --against baselines/ir01-local-fingerprint.json`) | `43e7c8a4402a3387cb2e1add4170921e` / 3617 — **MATCH** |
| Migration SHA-256 (working tree) | baseline `81909daa46a9a2d124fb69a7a2f246cb434b7defbddf17f97d4aba0956ec3b47` (CRLF working-tree form; LF git blob `8bc38d66…8f16f`, the expected form) · shipping `1e9169de4cf21c46e2167089328de94ce07cb1fcf005c0461dece1b28ec8a7cb` · IR01 `73db663974354f0c968b6b11b0a92f901aff6e5f464ad9bcfc953ff43a1901a4` — **all unchanged** |
| RLS impact / sync impact / rollback | none / none / not applicable (nothing to roll back) |
| Owner-approved schema work | none (OC-1 would need one additive constraint change and is **not** approved or implemented) |

The shared local database was used additively by the journey (fresh random users and households; nothing dropped, reset or altered). The fingerprint was measured *after* those runs and is unchanged.

## 39. Device evidence

**NOT EXECUTED — ENVIRONMENTAL LIMITATION.** No screenshot, device recording or on-device interaction is claimed, and none was fabricated.

* The only running emulator (`emulator-5554`) is another session's runtime (the AVDs `HerKeys_Runtime` / `HerKeys_Runtime_B` belong to parallel sessions) and must not be taken over.
* The host was memory-starved throughout (≈ 0.7–1.0 GB free physical; other sessions, Docker and an emulator running). Starting a second emulator plus Metro would risk starving the other sessions.
* The Browser-pane preview tool runs the dev server in the *original* project directory (a documented hazard of this multi-worktree setup), and a junction-`node_modules` worktree bundles the main checkout's routes (§37), so a preview from here would not show Feature 07.
* What was verified instead: **tsc** over every source file; **80 render tests** of the presentational components under the react-native stub (roles, labels, touch floor, reveal behaviour, every state on the hub and both details); a **Metro + Hermes export** whose bundle contains the screen; and pure tests of the container decisions. **Not verified on a device:** layout and appearance, the "Show location" reveal reset on navigation blur (`useFocusEffect`), same-pathname `router.push` stack behaviour (taken from the SDK 57 docs), keyboard behaviour, TalkBack/VoiceOver, colour contrast on screen. These are the reasons for the verdict qualifier in §45.

## 40. Shared-file changes

**Exactly one shared source file changed, by one line** (`git diff --name-status 14bd58e HEAD` outside Feature 07's own namespaces shows only this and its test):

| File | Change | Reproduced need | Extension points inspected | New durable semantic? | Regression coverage |
|---|---|---|---|---|---|
| `src/domain/account/claim.ts` | `.replace(/s+/g, ' ')` → `.replace(/\s+/g, ' ')` in `cloudDisplayName` | the real-database journey found a child named Josie stored as "Jo ie" and pulled back into local state | none — the corruption happens inside the claim; no feature-owned composition can avoid it | **No** (restores the documented intent: NFC, single spaces, trimmed) | new `tests/claimDisplayName.test.mjs` (4) + mutant M27; existing `claimPayload` suite unchanged and passing |

Everything else Feature 07 added is in its own namespaces: `src/features/coparent/**` (incl. `ui/`), `app/(app)/life/coparent.tsx`, `tests/coparent/**`, `tests/fixtures/coparent/**`, `supabase/tests/journey-coparent.mjs` + `run-coparent.mjs` (a standalone runner beside the shared `run.mjs`, which was not edited), `scripts-dev/f07-*`, `docs/builds/HK_FEATURE_07_*`. `app/(app)/life/_layout.tsx`, the Life `index.tsx`, `app.json` and every design-system file are untouched.

## 41. Sibling-import result

**CLEAN BY ISOLATED-BRANCH CONSTRUCTION + MECHANICAL VERIFICATION.** The branch was forked directly from `14bd58e` with no sibling ancestry, and no sibling exists in it to import. Mechanical verification (this proves the isolated branch is clean; it does **not** prove that future integrated code has no cross-feature conflicts — that is verified during integration, §33):

* `grep` for `feature/05|06|08` and `src/features/(kids|home|meals|today|calendar|life|systems|money|work|daily-load|one-move|talk-it-out|tasks|onboarding)` over every Feature 07 file: **zero** matches outside the audit's own regex.
* Every relative import in Feature 07 source resolves to `src/features/coparent/`, `src/domain/`, `src/design/`, `src/store/` or `src/state/` (test **BE**, run in the suite). No import of any sync mechanism (queue, engine, coordinator, transport, bridge, observer).
* The feature-boundary rule holds: route file composes the screen; domain reasoning lives in `projection.ts` / `mutations.ts` / `present.ts`; no domain reasoning in JSX.
## 42. Owner checkpoints — see `HK_FEATURE_07_OWNER_CHECKPOINTS.md` (OC-1 prepared; capability stopped, everything else continues)
## 43. Considered / deferred

| Item | Decision | Why |
|---|---|---|
| Record that a HANDOFF took place ("recorded complete") | **Stopped — OC-1** | events have no outcome (local and cloud CHECK); needs a migration and owner approval. Everything else continues; the responsibility's completion is the only completion recorded |
| Create a child after binding | Not built (MP-07-01) | Kids OS / server path; Feature 07 shows a named blocked state, never a phantom child |
| Structured handoff direction | Not built (MP-07-03) | a new durable semantic that is not required; the user's own title carries it, and nothing is inferred |
| File an EXISTING event as a handoff (recategorise) | Deferred | an edit of a shared row's category; not needed for the contract, and an edit never changes another feature's row silently |
| Skip / cancel ONE occurrence of a repeating handoff | Deferred | the foundation's `skipOccurrence` excludes events and the event outcome vocabulary allows only cancelled/rescheduled (MP-07-05) |
| Per-occurrence responsibility and preparation | Deferred | responsibility and dependency attach to the anchor row; a derived date says "nothing is recorded for this date" |
| Re-open a completed preparation item / follow-up | Deferred | no re-open transition exists in `domain/tasks.ts` |
| Archive or edit a person from this feature | Not built | People OS owns management; Feature 07 only *handles* an archived counterpart |
| A household currency | Not built (MP-07-08) | no household currency exists; the editor asks explicitly and only suggests a currency she already used |
| Reminders / notifications / snooze | Not built | no delivery infrastructure; the feature contacts and notifies no one |
| Compact hub rows (one line for "nothing recorded") | Considered | hub rows are collapsed to five and grouped; per-row unknown lines were kept because a missing answer must be *said*, not implied |
| A "co-parent score", fairness or reliability view | **Refused by contract** | not built, not proposed |
| Messaging, invitations, sharing, evidence export | **Refused by contract** | not built, not proposed |
| Folding `run-coparent.mjs` into `run.mjs` | Deferred to integration | `run.mjs` is a shared file; a standalone runner avoids touching it |
| On-device / emulator visual pass | See §39 | environmental |
## 44. Exit gates

Computed at **code HEAD `33e44be`** on `feature/07-coparent-logistics` (this ledger's own commit changes only `docs/`; `git diff --stat 33e44be HEAD -- src app supabase tests package.json scripts-dev` is empty). Git status was clean before and after every gate, including after each mutation run.

| Gate | Result |
|---|---|
| Exact branch / HEAD | `feature/07-coparent-logistics`; forked from `14bd58ed3bdcb557ba308dfe2ecbc65253dba5e1` (no sibling ancestry) |
| TypeScript | **clean** (exit 0) |
| Full application suite (serial) | **1258 / 1258** (207 → 239 suites) |
| Feature 07 suites | **279** in `tests/coparent` (+ **4** shared-repair regression) — §37 |
| Tier 1 / Tier 2 / Tier 3 | **39 PASS + 1 N/A / 27 PASS / 5 PASS + 3 N/A**, none DEFERRED, none FAIL — §27–§29 |
| Scenario assertion map | generated and **mechanically verified** (every scenario → real test titles + pinned semantic fixture) — §26 |
| Mutation / test-the-test | **42 caught, 0 survived, 0 broken** — §30 |
| Backend harness (real PostgreSQL + PostgREST) | **800 / 800** |
| Actual application sync-composition test | **6 / 6** (`composeAccountApp`); disconnecting the composition (M25 / M26) fails it |
| Real PostgreSQL representative journey | **34 / 34** |
| Second-device round trip | in-model **and** real database, **both directions** (A → B and B → A) |
| Offline / restart | offline create + edit → restart offline → reconnect: one row, edit applied, identities intact; real-DB restart: no duplicates |
| Account switch · demo isolation | in-model (AM, AN) and real database (quarantine, 0 requests) |
| Retry / refusal | lost acknowledgement → no duplicate; permanent refusal → record kept, surfaced, not hammered |
| Child identity · counterpart identity · same-name people | identity suite (14) + real-DB checks; mutants M1–M5 |
| Responsibility · handoff · recurrence · preparation · reimbursement truth | responsibility (18), schedule (18), preparation (11), money (15); mutants M6–M19 |
| False-payment · false-agreement · false-legal · false-sharing | mutants M9–M12, M16–M17, M22–M24 and the copy-truth audit (24) — all caught |
| Person invalidation | Z / AA; mutants M20–M21, M42; cross-device in the real-DB journey |
| Privacy / raw-source scan | BF / BG (4 tests): zero hits, canary never shown, nothing logged |
| RLS | materially applicable → attacked (owner / member / stranger / anon): 8 RLS checks of the 34 (+ the account-switch quarantine check) — §24 |
| Expo Doctor | **21 / 21** |
| Android export | **exit 0, 6.5 MB Hermes bundle containing Feature 07** (from a scratch copy; the junction-worktree hazard is documented in §37) |
| Migration hashes · schema fingerprint | **unchanged** · `43e7c8a4402a3387cb2e1add4170921e` / 3617 **MATCH** |
| Performance | projection median 2.64–6.30 ms on 175 records (soft target < 100 ms) — §35 |
| Accessibility | labels in words, roles, touch floor, no swipe-only action (80 render tests); **device / screen-reader not verified** — §34, §39 |
| Copy-truth audit | **zero** unsupported claims across the COPY catalogue, every presentation of the showcase household, and the UI source |
| Affordance audit | **zero** TODO / fake / dead / unexplained controls; no message / send / share / invite control exists |
| Shared-file report | one line in `claim.ts` + its regression test — §40 |
| Sibling-import grep · feature-boundary grep | **zero** · **clean** — §41 |

## 45. Final verdict

### Minimum shippable Feature 07 — all 19 items

| # | She can … | Evidence |
|---|---|---|
| 1 | open the feature through a direct feature-owned route | `app/(app)/life/coparent.tsx` (`/life/coparent`); in the Metro/Hermes bundle; wiring tests |
| 2 | see the next represented child transition | hub "Next handoff" = the chronologically next one (`identity › the NEXT handoff…`, M38) |
| 3 | identify the correct child | id-based `ChildRef`; C, AO/K, mutants M1–M3 |
| 4 | identify the responsible / counterpart person where known | `counterpart` by person id; D, E, real DB |
| 5 | understand what she needs to do | "Needs you" / "Waiting on someone" / "Needs review" with reasons in words |
| 6 | distinguish assignment from acceptance / coverage | assigned ≠ requested ≠ acknowledged ≠ accepted ≠ covered; N / O / P; M6–M8 |
| 7 | see preparation / packing work | preparation per handoff and per child; S / T / U |
| 8 | create real transition-related preparation work | `createPreparation` + explicit `requires` edge |
| 9 | create a real canonical child-linked handoff | `createHandoff` (H; real DB) — needs a child in the household (MP-07-01) |
| 10 | meaningfully edit it | `editHandoff`, stale-safe (I, AQ) |
| 11 | use supported recurrence for repeated transitions | weekly / every 2 weeks / monthly via the shared rule (V) |
| 12 | preserve child and counterpart identities on restart | J; K; real-DB restart |
| 13 | survive offline → reconnect | K |
| 14 | round-trip supported state to a second device | in-model + real DB, both directions (L, M) |
| 15 | use a bounded monetary follow-up path | task bridge with exact amount (AB) |
| 16 | never turn a follow-up task into proof of payment | AC; M16, M17 |
| 17 | never turn an operational schedule into a legal custody claim | W; M11 |
| 18 | remain useful without the other parent having an account | AE — no account, no channel, no contact |
| 19 | never imply data is shared | AF, BD; M22–M24 |

### Completion value statement

**After Feature 07, a woman can** open the Co-parent logistics screen (route `/life/coparent`; putting an entry point in the Life hub is left to integration) and see, in one calm place, her next child handoff — which child, when, and what is *recorded* about who is responsible and how far it got, with a request she recorded kept distinct from an acknowledgement, an acceptance and actual coverage. She can add and edit real handoffs (including repeating patterns), record what she asked of someone and what she was told, tie preparation to each handoff, and keep a follow-up on a child-related cost with the exact amount she entered — all of it durable, synced to a second device and safe offline — without the other parent needing an account, without anything being sent, and without Her Keys claiming agreement, legal status, payment, sharing or completion it does not have. (A household that has no child recorded sees a named blocked state until one exists; child creation belongs to Kids OS.)

### The final questions

1. **Can she understand the next child transition without reconstructing it from several places?** Yes — the next handoff, its child, time, responsibility, preparation and unknowns are on one screen; the exact location is one tap away.
2. **Can different children have different counterpart adults without identity corruption?** Yes — by id, in tests (D) and against the real database.
3. **Can two people with the same display name remain distinct?** Yes — distinct ids, unique labels, two "Alex" rows in PostgreSQL (E, M4–M5).
4. **Can she distinguish assignment, acceptance and actual coverage?** Yes — five separate stages; covered only when accepted, she said it no longer needs her, and the person is available.
5. **Can she see what needs preparing before a transition?** Yes — readiness sentence plus each item; no list is never "ready".
6. **Can she create and edit a real canonical child-linked handoff?** Yes — one canonical event, child by id, owner-only scope, all-or-nothing, stale-safe.
7. **Does it survive restart and second-device sync?** Yes — restart, offline→reconnect, and both directions against real PostgreSQL.
8. **Can recurring transitions use shared recurrence without becoming a second custody-calendar model?** Yes — one shared rule per handoff; derived dates only; "the pattern you recorded".
9. **Can a planned transition ever be described as agreed?** No — the wording is "You recorded a request …"; mutants M9–M10 are caught.
10. **Can an operational schedule ever be described as a legal custody schedule?** No — M11 caught; the copy audit forbids the vocabulary.
11. **Can a completed operational record be presented as proof of legal compliance?** No — a handoff cannot even be recorded complete (OC-1); a responsibility's completion reads "You recorded … part as complete" (M12).
12. **Can she track a child-related monetary follow-up without Her Keys pretending an obligation was established?** Yes — "Amount you entered … isn't an agreed amount".
13. **Can completing a follow-up task falsely mark payment as received?** No — "Marked done. Her Keys has no record of a payment."; payment appears only from a real `paid` outcome (M16–M17).
14. **Does counterpart-person removal invalidate stale positive claims?** Yes — NEEDS REVIEW, no positive recording offered, nothing reassigned; cross-device in the real-DB journey (M20–M21, M42).
15. **Does it remain useful when the other parent has no account?** Yes — nothing requires or contacts them.
16. **Does any scope label falsely imply sharing?** No — `coparent-shared` is owner-only (proved in the migration and by attack); the only line is "Only your account can open this in Her Keys."
17. **Does it avoid messaging / collaboration infrastructure?** Yes — no intent, execution, message, invite or share exists in the feature; source-audited.
18. **Does it reuse canonical household truth instead of creating handoff / task / person / payment universes?** Yes — event, task, person, responsibility, dependency, recurrence, `value` facet; no new entity.
19. **Can future intelligence reason from the state without being given false agreement, payment or legal certainty?** Yes — every view field states its source (`recordedBy: 'you'`, evidence flags, `coverage`), unknown stays unknown, and no field can carry those claims.
20. **Were new durable semantics proposed?** One — a handoff outcome ("this took place"), proposed as OC-1 and **not implemented**.
21. **Were owner checkpoints triggered?** One (OC-1); only that capability is stopped.
22. **Were schema changes made?** **No.** Fingerprint and migration hashes unchanged.
23. **Were sibling imports introduced?** **No** — clean by isolated-branch construction and mechanical verification (§41).

### Replacement claim

The builder concludes only that Feature 07 satisfies **this approved Feature 07 build contract**. It does **not** conclude that Her Keys replaces any co-parenting app: it intentionally reproduces no legal-evidence, court-record or messaging-platform functionality, and market-level adequacy is an owner / product judgment.

### Documented debt (none of it undermines truth, durability, security or the core floor)

1. **OC-1 — a handoff itself cannot be recorded complete** (owner checkpoint prepared; capability stopped; needs one additive constraint change and approval).
2. **No on-device / visual verification** (environmental, §39): layout, the location-reveal reset on blur, same-pathname push behaviour, keyboard, TalkBack/VoiceOver and on-screen contrast are unverified; everything decidable without a device is tested.
3. **A real household with no child cannot create a handoff** until Kids OS provides child creation (MP-07-01) — shown as a named blocked state, never a phantom child.
4. **Shared-foundation gaps recorded, not repaired:** `attentionFor` treats acknowledged as handled (MP-07-13); the generic event editor files co-parenting events household-visible (MP-07-14); `accept()` defaults `stillNeedsMe` to false (Feature 07 never relies on it).
5. **The shared claim repair must be included once at integration** (HK-INT-COPARENT-CLAIM-NAME-01); every branch forked from `14bd58e` carries the defect, and any real household claimed by an unrepaired client would need a data repair (owner-gated; nothing was applied remotely).
6. **`run-coparent.mjs` is a standalone runner** to fold into `run.mjs` at integration.

### Verdict

**HK-FEATURE-07-COPARENT = PASS WITH DOCUMENTED DEBT**

**READY FOR INDEPENDENT FEATURE 07 AUDIT = YES**

**READY FOR WAVE 2 INTEGRATION = YES** — meaning only that Feature 07 itself has no known blocker to later controlled integration. It does not authorize a merge. Nothing was pushed, opened as a PR, merged, rebased, squashed or amended; no remote service (Supabase staging/production, Apple, Google, EAS, Gemini, RevenueCat, messaging, banking) was contacted.
