# HK-FEATURE-07-COPARENT — Co-Parent Logistics build ledger

Branch `feature/07-coparent-logistics` · worktree `C:\Users\jsmit\Her-Keys-F07` · LOCAL ONLY (no push, no PR, no merge).

> Status of this document: **IN PROGRESS.** Sections 1–20 are the CP0/CP1 evidence and contracts (settled before any UI was built).
> Sections marked `PENDING` are completed at the checkpoint that produces their evidence. Nothing in a `PENDING` section is a claim.

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

## 21. Hub — PENDING (CP3)
## 22. Transition detail — PENDING (CP4)
## 23. Backend / sync — PENDING (CP6)
## 24. RLS / security — PENDING (CP6)
## 25. Offline / restart — PENDING (CP6)
## 26. Scenario assertion map — PENDING (CP7/CP8)
## 27. Tier 1 results — PENDING
## 28. Tier 2 results — PENDING
## 29. Tier 3 results — PENDING
## 30. Mutation evidence — PENDING (CP7)
## 31. Defects found / repaired — PENDING
## 32. Missing primitives — see `HK_FEATURE_07_MISSING_PRIMITIVES.md` (MP-07-01 … MP-07-14)
## 33. Integration candidates — PENDING (CP8)
## 34. Accessibility — PENDING
## 35. Performance — PENDING
## 36. Privacy — PENDING (design decisions in §19–§20)
## 37. Test accounting — PENDING
## 38. Schema / fingerprint — baseline `43e7c8a4… / 3617` verified at CP0; final re-verification PENDING (CP8). No Feature 07 schema change is planned or made.
## 39. Device evidence — PENDING
## 40. Shared-file changes — PENDING (planned: **none** — Feature 07 owns `src/features/coparent/**`, `app/(app)/life/coparent.tsx`, tests, docs)
## 41. Sibling-import result — PENDING (CP8)
## 42. Owner checkpoints — see `HK_FEATURE_07_OWNER_CHECKPOINTS.md` (OC-1 prepared; capability stopped, everything else continues)
## 43. Considered / deferred — PENDING
## 44. Exit gates — PENDING (CP8)
## 45. Final verdict — PENDING (CP8)
