# HK-FEATURE-05-KIDS — Kids OS build ledger

Branch `feature/05-kids-os` · worktree `C:\Users\jsmit\Her-Keys-F05` · forked from `repair/hk-integration-readiness-01` @ `14bd58e`.
Local only. Nothing is pushed, merged, rebased, squashed or amended. No remote environment is touched.

Sections marked **(K#)** were written in that phase. Every section is filled; the verdict is in §37 and every gate is recomputed in §36.

> **CLOSEOUT REPAIR (appended, §38).** After §37 the owner RESOLVED owner checkpoint OC-01 ("Her Keys MUST support adding a child after a household
> has already been bound to an account"). §38 records that repair (new commits, one additive local migration, changed counts, backend and fingerprint
> evidence, defects, final gates and the final verdict). Nothing above was rewritten; where §18, §19, §22, §29, §30, §34, §35, §36 or §37 say a child
> cannot be added after binding, or that there is no schema change, **§38 governs** (each of those sections carries a one-line pointer).

## 1. Source / fork (K0)

See `HK_WAVE2_SOURCE_01.md` for the verified baseline. In one line: the owner replaced the original "certified integrated Wave 1 fork" gate
with the repaired common foundation (report HEAD `14bd58ed…`, tested code `9dbe02a`, docs-only delta proven), so Feature 05 forks from the
final repair/report HEAD and keeps its documentation. Wave 1 is **not** integrated and this build does not pretend otherwise.

## 2. Source-gate evidence (K0)

The original 16-item gate, re-stated under the owner's changed rules. Every "yes" was checked in this tree.

| # | Gate | Result | Evidence |
|---|---|---|---|
| 1 | Common-fork HEAD matches the authority | **PASS** | `git rev-parse HEAD` = `14bd58ed3bdcb557ba308dfe2ecbc65253dba5e1`; `9dbe02a` is its ancestor; the only file between them is `docs/builds/HK_INTEGRATION_READINESS_01.md` |
| 2 | Worktree clean | **PASS** | `git status --short` empty at branch creation |
| 3 | Wave 1 integrated state present | **NOT REQUIRED** (owner rule 2) | F01–F04 are unmerged siblings; nothing imported from them |
| 4 | HA-001 closed (binding → operating sync via the production path) | **PASS** | `accountRuntimeInstance.ts:71` → `composeAccountApp`; `appStoreInstance.ts:25` passes the observer; `syncComposition` 37 + `productionWiring` 7 green; mutants M1–M14 caught |
| 5 | HA-009 closed | **PASS** | `standingOf`/`readinessOf` (`structure.ts:92,149`); `dependencyStanding` 14 green; M15–M18 caught |
| 6 | HA-010 closed | **PASS** | `Task.durationSource`; `durationSource` 24 green; M19–M25, M30, M31 caught |
| 7 | HA-011 closed | **PASS** | `HouseholdSystem.subjectMemberId`; `systemSubject` 16 green; M26–M29 caught |
| 8 | OD-A privacy rule present | **PASS** | `titleForCloud`; `readingTitle` 14 green; M32–M35 caught |
| 9 | Life exists | **PASS** | `app/(app)/life/*`: hub + `kids`, `home`, `meals`, `money`, `work`, `needs-me`, `other-tasks` |
| 10 | Stable Life registration mechanism | **ABSENT — NOT REQUIRED** (owner rule 3) | routes, `Stack.Screen` list and `LIFE_SCREEN_ROUTES` are hardcoded; Kids stays behind `life/kids`; final registration is integration item HK-INT-LIFE-REG-01 |
| 11 | Canonical child identity | **PASS** | `AppState.children` / `ChildSchema` (`state.ts:103`); `household_members` child rows |
| 12 | Canonical association of a task/commitment to a child | **PASS** | `Task.subjectMemberId`, `CalendarEvent.subjectMemberId`, integrity `state.ts:626-633`, cloud composite FK and `child_scope_subject_check` |
| 13 | Responsibility lifecycle preserves assigned ≠ acknowledged ≠ accepted ≠ covered | **PASS** | `owned/requested/acknowledged/accepted/declined/completed/returned` + `stillNeedsMe` + `needsMePersonally`; see §9 |
| 14 | Shared timing/attention identified | **PASS** | `attentionFor` (`reasoning/attention.ts`); `logicalDateAt`, `zonedTimeToEpochMs`; see §8 |
| 15 | Emergency/fallback capabilities inventoried | **PASS (inventory)** | none exist as a concept; what does exist is in §16 |
| 16 | Fingerprint and migration hashes match | **PASS** | `43e7c8a4…` / 3617 MATCH; hashes `81909daa…`(CRLF)/`8bc38d66…`(LF), `1e9169de…`, `73db6639…` |

**Baseline recomputed, one process at a time:** `tsc` exit 0 · suite 975/975 (207 suites) · `tests/hk-ir01` 163/163 · backend harness 800/800 ·
mutation check 35 caught / 0 survived · fingerprint MATCH.

**Finding F-K0-01 — there is no way to create a child.** This is the one concrete foundation gap the source gate found, and it is
recorded in §24 and in `HK_FEATURE_05_OWNER_CHECKPOINT_01.md`. It is a **partial** blocker: everything except adding a child to an
already-signed-in household is buildable inside existing semantics, so Feature 05 continues.

## 3. Inherited implementation (K0) — classification

Life and Kids artifacts that exist at the baseline (entry inventory, each claim checked against the file).

| Artifact | Actual behavior today | Class | Note |
|---|---|---|---|
| `app/(app)/_layout.tsx` five tabs | hardcoded `Tabs.Screen` list (`:30-34`) | **PRESERVE** | primary navigation is not modified |
| `app/(app)/life/_layout.tsx` Life stack | hardcoded `Stack.Screen` list (`:30-37`); `initialRouteName='index'` | **PRESERVE** | untouched; Kids sets its own child-screen titles from inside the screen |
| `app/(app)/life/index.tsx` Life hub | five role rows from `useLifeStatus`, routes from a hardcoded map `LIFE_SCREEN_ROUTES` (`lifeStatus.ts:28-34`); "Five areas" copy is static | **PRESERVE** | not redesigned. Registration of Kids in a future mechanism is HK-INT-LIFE-REG-01 |
| `app/(app)/life/kids.tsx` | 10-line wrapper rendering `KidsOverview` | **REFINE** | keeps the route `/life/kids`; renders the new hub |
| `src/features/kids/KidsOverview.tsx` | lists today's events whose `subjectMemberId` is a child, else the text "On the family schedule"; open tasks of the **kids category** (not per child); rows have no `onPress`; no child screen; no create/edit; a `StatusList` with no empty state (audit B3-AUD-054, still open) | **REPLACE** | *Why it cannot satisfy Feature 05:* it cannot open a child, shows nothing about responsibility, plan gaps or duration truth, has no create/edit, and "On the family schedule" states scheduling that is not recorded (a DUE ≠ SCHEDULED / UNKNOWN ≠ ZERO violation). *Replacement:* `KidsHub` + `ChildDetail`. *Test disposition:* `build3Audit.capture.test.mjs:118-143` REWRITTEN (§29) |
| `CategoryTaskList`, `OtherTasksList`, `NeedsMe*` | generic Life machinery used by other areas | **PRESERVE** | untouched |
| `lifeStatus.ts` kids row (`describeTasks(tasks,'Nothing due')`) | Today's "Also checked" summary for Kids counts category tasks, ignores events and children | **PRESERVE** | it makes no false claim; making it child-aware is HK-INT-KIDS-TODAY-01 |
| `TaskForm` / `EventForm` | category chooser only; hardcode `scope: 'household'`; no child field | **PRESERVE** | Kids has its own editor over the same domain functions; no shared form edit |
| `ChildSchema`, `useHousehold().children` | canonical child + age | **PRESERVE** | |
| Child create path | none | **ABSENT** | F-K0-01 / MP-K-01 |
| Child chooser in any form | none | **ABSENT** | built in the Kids editor |
| Per-child screen | none | **ABSENT** | built (K4) |
| Child-aware Kids status | none | **ABSENT** | built (K2/K3) |
| Meals / Home / Money / Work overviews | static captions, read-only lists | **PRESERVE** (frozen until their builds) | |

## 4. Feature WHY (K0)

Kids OS exists so she does not have to reconstruct each child's operational life from the calendar, tasks, messages, forms and her own
memory. It answers: what is happening with this child, what is coming, what they need, what requires her, what someone else is handling,
whether they accepted it, whether it is actually covered, what we are not ready for, and what she must resolve if the normal plan fails.
It is a **projection and editing surface over canonical household truth**, not a second universe.

## 5. Foundation trace — capability map (K1)

Actual symbols, files and tests. Nothing here was taken from architecture prose.

| Concern | Actual source | Mutations | Tests that pin it |
|---|---|---|---|
| Child / household member | `AppState.children[]`, `ChildSchema` (`state.ts:103`); member id space = `user.id ∪ children[].id` (`state.ts:567`); cloud `household_members` (`member_type='child'`); `member` mapping from the claim; pull hydration (`pullEngine.ts:258-295`) | **none** (F-K0-01) | `claimPayload`, `systemSubject`, `syncComposition` |
| Task | `TaskSchema` (`state.ts:155`) | `addTask`, `updateTask` (editable: title, categoryId, subjectMemberId, durationMinutes, durationSource, commitment, dueDate, plan, notes), `completeTask`, `archiveTask` (`tasks.ts`) | `tasks`, `durationSource` |
| Task ↔ child | `Task.subjectMemberId`; `scope:'child'` requires a real child (`state.ts:626-633`) | via `addTask`/`updateTask` | `hostileAudit`, `syncEngine` |
| Commitment / event | `CalendarEvent` (`state.ts:121`); instants in UTC; `commitment: fixed\|flexible`; `status: active\|removed` | `addEvent`, `updateEvent`, `removeEvent` (`events.ts`) | `events` |
| Event ↔ child | `CalendarEvent.subjectMemberId` | via `addEvent`/`updateEvent` | `events` |
| Responsibility | `ResponsibilitySchema` (`foundation/responsibility.ts:55`): `about` (typed ref), holder `self\|person\|child`, `state`, `stillNeedsMe`, `ackDueAt`, `previousResponsibilityId`; **one live holder per thing** (`state.ts:823-828`) | `delegate`, `acknowledge`, `accept`, `decline`, `completeResponsibility`, `returnToSelf`, `reassign` (`domain/responsibility.ts`) | `foundationOps`, `foundationAcceptance*` |
| People | `HouseholdPersonSchema` (owner-private, `status: active\|archived`) | `addPerson`, `archivePerson` | `foundationOps` |
| Coverage semantics | `needsMePersonally(state, ref, atMs)` (`responsibility.ts:220`): unanswered past `ackDueAt` → true; live holder else → `stillNeedsMe`; declined/returned → true; otherwise the row's facet, **null = unknown** | — | `foundationOps` |
| Dependency | `Dependency` (`requires \| part_of \| alternative_to`) | `addDependency`, `removeDependency` (`structure.ts`) | `dependencyStanding` |
| `standingOf` / `readinessOf` | `structure.ts:92`, `:149` (`satisfied\|pending\|unavailable{retired\|missing}`; `ready\|blocked\|needsReview`) | — | `dependencyStanding` |
| Duration & source | `durationMinutes` + `durationSource` (`user\|default\|inferred\|null`); `durationKnowledgeOf`, `isUserProvidedDuration`, `durationSourceForSave` (`foundation/duration.ts`); default 15 | in `addTask`/`updateTask` | `durationSource` |
| Recurrence | `RecurrenceRule`, `occurrencesOf`, `nextOccurrence` (`structure.ts:250-348`) | `addRecurrence` … | `foundationOps` |
| System subject | `HouseholdSystem.subjectMemberId` (children only) | — | `systemSubject` |
| Household timezone / logical day | `state.user.timezone`; `logicalDateAt`, `wallClockMinutesAt`, `zonedTimeToEpochMs`, `addDays`, `daysBetween`, `ageOn` (`logicalDay.ts`) | — | `logicalDay` |
| Shared attention / timing | `attentionFor(state, nowMs)` → `{reason, urgency, about}` (`reasoning/attention.ts`); consumed by `briefingFor` | — | (pinned by its consumers) |
| Related facts | `relatedTo(state, ref)` (`reasoning/related.ts`): steps, requires, responsibilities, recurrences | — | — |
| Provenance / confidence | `Provenance`, `userProvenance`, `provenanceFor(origin, …)` (demo → `demo-seed`) | — | `provenance` support |
| Persistence | envelope v4 (`CURRENT_SCHEMA_VERSION = 4`), `appStateRepository`, `writeQueue` | store | `persistence`, `appStore` |
| Canonical mutation | `store.commit/dispatch(Transition)`; a `Transition` is `(state, ctx) => state`; an unchanged state resolves `true` | — | `appStore`, `storeObserve` |
| Sync composition | `composeAccountApp`; `changeObserver` → queue intent in the same envelope write; `syncRuntime` | none for features | `syncComposition`, `productionWiring` |
| Demo namespace | `origin: 'demo'`; `provenanceFor` → `demo-seed`; claim refuses (`refused_demo`) | — | `syncComposition` |
| Recovery / quarantine | `validateAppState`, store `recovery` (`invalid`, `future_version`, `mode_mismatch`), account `Quarantine` | — | `appStore`, `persistence` |
| Life registration | **none** (hardcoded) | — | `routeAccess`, `build3Audit.capture` |

## 6. Canonical child identity (K1)

The child is `state.children[i].id`. It is never a name, nickname, index or feature-local id. A child's id space is shared with the adult
user (`user.id`); Kids only ever writes a **child** id (the cloud refuses an adult subject, IR-D8). Ordering for display is deterministic
(`birthDate` then `id`) and is never used as identity. Colliding display names are disambiguated with existing context (age, birth date)
and, only when those are identical too, a stable ordinal; internal ids are never shown.

## 7. Child association (K1)

Task and Event carry `subjectMemberId`. Kids writes `scope: 'child'` with a child subject, which is exactly the pairing the local
integrity rule and the cloud CHECK require. A household-level record (subject `null`, or the adult) is **never** shown under a child.
Editing a Kids item cannot clear its child (a child-scoped row without a child is invalid and the store would refuse it).

## 8. Shared attention primitive (K1)

**Used: `attentionFor(state, nowMs)`** (`src/domain/reasoning/attention.ts`). Kids includes an entry only when the primitive itself returns
an item whose `about` resolves to a child's task/event or to a responsibility about one, for the reasons `deadline`, `risk`,
`unacknowledged_delegation`, `external_source_changed`, `approval_required`. `conflict`, `capacity_overload` (about `null`, whole-day) and
`needs_me` (no child subject) are not child-specific and are not shown. Ordering follows the primitive's own urgency rank.

Where the primitive has no answer, Kids presents the **fact** and no urgency: "Due Thursday", "Hasn't accepted yet", "Something this needed
is no longer available", "Nobody is recorded as handling this". Kids has no risk score, no urgency score and no independent "at risk".
Coherence with Today/Calendar is a test (scenario BB): every shared-attention entry equals an item of `attentionFor`, and nothing the
primitive flags for a child is missing. *Foundation observation MP-K-09:* the primitive's `risk` branch treats `acknowledged` as "handled
elsewhere"; Kids does not correct it (shared file) and states the acknowledged/accepted distinction in its own rows.

## 9. Responsibility action map (K1)

The transitions the foundation supports, and which Kids performs. Kids invents no transition. Nothing here delivers a message: every
step is **her record of what somebody told her** (the model is "what a delivery integration would drive").

| Owner's list | Foundation function | Precondition | Kids performs? | Wording principle |
|---|---|---|---|---|
| ASSIGN / REQUEST | `delegate(about, to:{person\|child}, ackWithinMinutes?, stillNeedsMe?)` | ref exists; no live holder; holder valid (active person / existing child) | **YES** (to a person) from an item's detail, and optionally at creation | "Asked Alex" — never "handled" |
| ACKNOWLEDGE | `acknowledge(id)` | `requested` | **YES** ("Alex has seen it") | seen ≠ yes |
| ACCEPT | `accept(id, stillNeedsMe)` | `requested \| acknowledged` | **YES**, with an **explicit** choice of whether it still needs her (no default) | accepted ≠ covered |
| DECLINE | `decline(id)` | `requested \| acknowledged` | **YES** | it is hers again |
| CLEAR / RETURN | `returnToSelf(id)` | active, not self | **YES** ("Take it back") | |
| REASSIGN | `reassign(id, to, ack?)` | active, valid new holder | **not exposed** (return, then request again) | |
| (finish) | `completeResponsibility(id)` | active | **not exposed** (the item's own completion is a task matter) | |
| (people) | `addPerson` | — | **YES, minimally**, only inside the handoff flow (name + relationship) | People OS owns the network |
| (people) | `archivePerson` | — | **NO** (used by tests to prove invalidation) | |

**Coverage derived by Kids** (from `needsMePersonally`'s own inputs): `covered` only when a live holder who is an **active person** has
`accepted` **and** `stillNeedsMe === false` and the request is not overdue; `accepted, still needs you`; `asked, no answer`; `seen, not accepted`;
`asked, no reply by <date>`; `declined`; `handed back`; `holder no longer available` (archived person — never covered); `held by a child`
(no coverage claim); `nobody recorded`. The words *handled*, *covered*, *taken care of* appear only for the first state.

## 10. Projection contract (K2)

`src/features/kids/projection.ts` — three pure functions, no clock, no network, no mutation:

* `buildKidsView(state, householdId, {nowMs})` → `KidsView` (one `ChildCard` per child, `unattributed` count).
* `buildChildDetail(state, householdId, childId, {nowMs})` → `ChildDetail` (`upcoming`, `needsAttention`, `openWork{needsYou, withSomeoneElse, waiting, nobodyRecorded}`, `routines`, `plans`).
* `buildItemFact(state, householdId, ref, {nowMs})` → one `ItemFact` (used by the editor's responsibility panel).

**Guarantees (each is a test):** deterministic (same state and clock → identical output; also identical however the arrays are ordered, AT); read-only (deep-frozen state projects); a request for a different household returns nothing of the state (AJ); a row naming a child that is not in the household is *counted* (`unattributed`), never assigned to another child (AL); household-level and adult-subject rows are never shown under a child (AB); the same canonical item appears with identical facts in every section it is in (AF).
**Ordering (no hidden score):** children oldest-first then name then id; upcoming by start time then id; open work by due date (undated last), then capture time, then id; attention by the shared primitive's own urgency rank, then date, then id. **Sources:** `attentionFor` (§8), `standingOf`/`readinessOf`/`blockersOf`/`unavailablePrerequisitesOf`, `durationKnowledgeOf`, `needsMePersonally`, `logicalDateAt`. Semantic types are in `types.ts`; there is no score, percentage, rank or Kids-owned urgency anywhere.

## 11. Create / edit behavior (K2/K4)

All writes are feature-owned `Transition`-shaped steps in `mutations.ts` that compose existing domain functions; each returns an **outcome** because the store resolves `true` for an unchanged state (a stale editor, a refused handoff and a no-op must never look like a save). `commitKids` hands the outcome back.
* **Create a task** (`createChildTask`): the child as `subjectMemberId`, `scope: 'child'`, the household's kids-role category (never chosen by name), provenance `user-action`; atomic with an optional `part_of` edge and an optional handoff (either fails → nothing is written).
* **Create an event** (`createChildEvent`): instants computed in the household zone; a time inside the spring-forward gap or a repeated fall-back hour is *reported to her*, live as she types and at save, never silently absorbed (AH, AI); overnight events are not supported (end must be after start on the same day) and say so.
* **Edit** (`editChildTask` / `editChildEvent`): compares a content fingerprint of what the editor opened with the current row (a change that stamps no timestamp, like a Daily Load move, is still caught) → `stale` changes nothing and offers "show the newer version" (AM); only the fields she changed are written; an untouched time keeps its exact stored instant; the child can move to a sibling but can never be cleared; `unchanged` writes nothing.
* **Remove ≠ complete:** removing archives a task (no completion time) or marks an event `removed`; completing records completion (REMOVED ≠ COMPLETED).
* **Add a child** (`addChild`, new `src/domain/children.ts`): validated against the stored shape; offered only while the household is not bound to an account (§24, OC-01), checked again at the moment of saving.
* **Double-tap:** `createSingleFlight` sets its guard synchronously, so a second tap in the same frame is refused (AN, unit + rendered).

## 12. Duration provenance (K2)

Every Kids task producer states the source. Create: an untouched prefill is `default` (the planning default she was shown), a touched field is `user` **even when she confirms the same 15** (default 15 ≠ user 15, proven in the cloud, §18). Edit: an untouched length is never upgraded — a legacy row (`null`) stays unknown across a second save; a touched length is hers. The source is never inferred from the number. Copy: only `user-provided` is worded plainly; `default-estimate` → "(an estimate)", `inferred-estimate` → "(Her Keys estimated)", `unrecorded` → "(not confirmed)"; the form says "This is an estimate until you change it. It isn't something you told Her Keys." Events show a recorded start and end and never say "you said" (MP-K-11). Mutants K-M2, K-M3, K-M22 are caught.

## 13. Dependency behavior (K2)

Kids **reads** prerequisites only through the shared `standingOf` / `readinessOf` / `blockersOf` / `unavailablePrerequisitesOf`: a completed prerequisite is satisfied (T); a removed or archived one is *unavailable/retired*, worded "Something this needed is no longer available. Worth a look." and raised as a fact-entry (U); a missing one is unavailable/missing (V); a live one blocks and is named. Kids never rewrites or removes a dependency row. Its only dependency write is one `part_of` edge (a plan step toward a commitment), through `addDependency`; it offers no chooser for `requires` (MP-K-14). Mutant K-M13 (removed treated as satisfied) is caught.

## 14. Kids hub (K3)

`life/kids` (the existing route) renders `KidsHub`. One quiet card per child: `Sam, 8` (plus "born Mar 3, 2018" only when another name could be mistaken for it), what is next, and only the facts that need her ("2 need you", "1 waiting on someone", "1 need a plan"). No score, rank or percentage. Empty: "Your children will show up here — Add a child and Her Keys can hold their practices, forms and pickups in one place", with the add control only while adding is possible (otherwise one honest sentence). Below the cards, kids-category tasks that name no child stay listed as "Not linked to a child" (the Life guarantee that no open task is out of reach; §3, `unlinkedKidsTasks`). Each card is one accessible button whose label carries identity, next item and the tags.

## 15. Child detail (K4)

`life/child/[childId]`. Sections appear only when they have something real to say: **Next** (raised card, expanded logistics: when, where, who has it and whether that is covered, preparation/travel if recorded, notes as she wrote them, and what is *not recorded*); **Needs attention** (shared-primitive entries with the primitive's own urgency, plus facts with none); **Coming up** (first four inline, the rest behind a labelled, announced toggle); **Open work** grouped *Needs you / With someone else / Waiting on something / Nobody recorded*; **If the plan changes** (§16); **Routines** (child-subject Systems, read-only, no run behavior); add-task / add-event. Item editor: `life/child-item` (create, edit, plan step; responsibility panel; mark done; remove); `life/child-add`.

## 16. Fallback / emergency planning — capability map (K1) and build (K5)

**What the foundation can and cannot evidence** (inventory before any code):

| Possible fact | Available? | Can it prove a fallback? |
|---|---|---|
| assigned person | `Responsibility.responsiblePersonId` | no — it is the normal holder |
| accepted responsibility | `state === 'accepted'`, `stillNeedsMe` | evidence the *arrangement* holds, not that a second option exists |
| known household member / person | `people[]` (`status: active\|archived`), `children[]` | a known person is not an authorized one |
| task to arrange a fallback | any child-linked `Task` (+ a `part_of` edge to the commitment) | **no** — the task is work, not evidence |
| child-linked commitment | `CalendarEvent` with a child subject | the thing the plan is about |
| operational instruction | `notes` (free text) | never parsed for meaning |
| a *distinct* backup party | **none** (MP-K-02) | — |

**Decision (product-WHY doctrine, no owner stop needed).** The readiness of a child's commitment is defined over **existing facts only**:

* **PLAN IN PLACE** — the commitment has a live responsibility held by an **active person**, `accepted`, `stillNeedsMe === false`, and not overdue. Re-derived on every read, so a holder who is later archived can never keep it green.
* **NEEDS A PLAN** — a positive gap: the last responsibility was `declined` or `returned`; the holder is an archived/missing person; or a request is past `ackDueAt`.
* **NOT ENOUGH KNOWN** — anything else: nothing recorded; asked but not yet answered; accepted but "still needs you"; held by a child.

A fallback task (child-linked task + `part_of` edge to the commitment, both existing mechanisms) makes the gap **actionable** and changes the
label **not at all** (AC). The word "backup" is used only for the *action*; the label speaks about the arrangement. The surface carries a
persistent, restrained line: "Her Keys helps you plan. It does not check what a school, a court or a doctor recognises." If the owner meant a
**second, distinct** person, that needs MP-K-02 (an owner checkpoint); this build does not fake it.

**Built (K5).** `FallbackPlanSection` on the child detail, titled "If the plan changes", for each upcoming commitment (and each task somebody was asked to hold). Each row: title (opens the item), when, the label as **text plus tint** ("Plan in place" / "Needs a plan" / "Not enough known"), and one sentence of *why* from the coverage state. Where a gap exists there is a real next step: **"Add a step to sort this out"** opens the ordinary task editor prefilled as a *step of* that commitment (a child-linked task + one `part_of` edge, atomically); once an open step exists the row shows "Open step: …" instead of offering a second one. The label does **not** change when a step is created or even finished (AC; mutant K-M14). Rows with nothing recorded show inline for the soonest three and fold behind an announced toggle beyond that. A person archived after acceptance drops PLAN IN PLACE to NEEDS A PLAN (holder unavailable) **on both devices** after a pull (Z; real database, mutant K-M10). No allowed label is "Ready".

## 17. Legal-authorization boundary (K5)

How the UI avoids being mistaken for an official authorization record: (1) the section carries a persistent, quiet note — *"Her Keys helps you plan. It doesn't check what a school, a court or a doctor recognizes."* — in a subtle card, not a warning screen; (2) the labels speak about the *arrangement* ("a person said yes and it is off your list"), not about a person's standing; the plan sentence adds "Her Keys doesn't know whether Alex is free that day"; (3) no string anywhere says authorized, approved, verified, official, legal, custody, emergency contact or pickup list (`copyTruth.test.mjs` scans every string literal in the copy); (4) a person is "someone on your list of people", never a guardian or contact; (5) Kids stores **no** authorization, contact, document or emergency field — it adds no durable field at all (`boundaries.test.mjs` privacy audit); (6) an unrelated known person, an assigned person or an accepted responsibility never becomes AUTHORIZED, AVAILABLE or CONFIRMED (KNOWN ≠ AUTHORIZED).

## 18. Backend / sync behavior (K6)

*(K6 text. Superseded in part by §38: the closeout repair added one additive LOCAL migration and made `member` a create-only sync kind, so a child added after binding now syncs. The Kids journey grew from 33 to 56 checks.)*

**No new or extended backend representation**: no migration, table, column, RLS policy, sync kind or RPC. Kids writes canonical rows through `store.commit`; the change observer queues them in the same envelope write; the central runtime sends them. Proven against **real local PostgreSQL + PostgREST + the real claim RPC** by `supabase/tests/journey-kids.mjs` (`node supabase/tests/run.mjs kids`: **33 Kids checks**; the standalone run prints 34 because the runner adds its own stack-currency check), every device built by `composeAccountApp`: child identity round trip for two children named Sam (each task/event attributed to the right one by id); default 15 vs user 15 as different cloud rows; an accepted-off-list handoff held by a *person* (not a member); `requires` + `part_of` edges; an edit that confirms 15 turns default into user (revision 2); a second device whose Kids projection is **identical for every child**; archived person → PLAN IN PLACE becomes NEEDS A PLAN on both devices; a 450-task child-linked household (90 each to five children) sent by one sign-in and pulled in bounded requests, projection identical on the second device. Full harness at final HEAD: §36.

## 19. RLS / security (K6)

Over real PostgREST with valid foreign identifiers, five personas: **unauthenticated** (no read, update, delete or insert on `tasks`, `events`, `responsibilities`, `household_people`, `dependencies`, `household_members`); **unrelated account** holding a valid guessed child id and household id (reads nothing; update/delete match nothing; cannot insert into the family's household; **foreign-key substitution** — a task in its *own* household naming the other family's child — refused with SQLSTATE 23503); **owner** (reads every table; may change her own task); **same-household second member** (reads the household's child tasks, events and children; may edit a household child task; **cannot** read, change or delete the owner-private people, responsibilities and dependencies — a known limit, MP-K-13); and the OC-01 evidence below. The generic RLS suites (`10`, `20`, `30`, `57`) are part of the 800 baseline checks and unchanged.
**OC-01, measured (K6; RESOLVED at closeout, see §38):** a child added to a bound household directly through the store gets no cloud identity; its task becomes `unresolvable-dependency` evidence and never leaves the device (never mis-attributed to another child); nothing else is blocked (a later task for another child syncs). This is why the UI never offered it. That measurement is what showed the repair needed a server path.

## 20. Offline / restart (K6)

Real store: child, tasks, event, handoff, dependency and duration provenance all survive a relaunch (`mutations.test.mjs`, L). Real database: a task created offline waits in the durable queue with nothing sent; after a process death **while still offline** it is still there, still about the same child, its length still hers, still queued; on reconnect it is sent **exactly once**, to the right child, with its provenance. A server refusal of one row is recorded once as evidence, never re-sent, and blocks nothing (IR-D12 holds for Kids). Two saves at once both land; a stale edit through the store is reported stale and changes nothing.

## 21. Scenarios (status: PASS unless stated)

Tier 1 — core. Evidence = test (`P`rojection, `M`utations, `V`iews, `J`ourney against PostgreSQL, `S`cenario fixture).
| ID | Status | Evidence | ID | Status | Evidence |
|---|---|---|---|---|---|
| A one child, no records | PASS | P, S | O assigned, unaccepted | PASS | P, S(O,O2) |
| B multiple children | PASS | P, V, S | P accepted ≠ covered | PASS | P, S |
| C colliding names | PASS | P, V, J, identity tests | Q covered | PASS | P, S |
| D one upcoming | PASS | P, S | R requires the user | PASS | P, S |
| E several upcoming | PASS | P, S | S assigned to other, still unresolved | PASS | P, S |
| F unresolved task | PASS | P, S | T completed prerequisite | PASS | P, S |
| G unknown duration | PASS | P, S | U removed prerequisite | PASS | P, S(U,U2), mutant K-M13 |
| H default duration | PASS | P, M, S | V missing prerequisite | PASS | P, S |
| I explicit duration | PASS | P, M, S | W plan in place | PASS | P, S, J |
| J create | PASS | M, V | X gap → NEEDS A PLAN | PASS | P, S |
| K edit | PASS | M | Y → NOT ENOUGH KNOWN | PASS | P, S, mutant K-M11 |
| L restart | PASS | M (real store), J | Z person archived | PASS | P, S, J (both devices), mutant K-M10 |
| M offline → reconnect | PASS | J | AA unrelated person | PASS | P, S |
| N second device identity | PASS | J | AB household-level stays household-level | PASS | P, S, reachability |
| AC task ≠ plan | PASS | P, V, S, mutant K-M14 | AD not mistaken for authorization | PASS | V, copyTruth (§17) |

Tier 2 — hardening. AE dense **PASS** (dense) · AF one item many sections **PASS** (P, dense) · AG midnight/logical day **PASS** (P, time) · AH spring-forward **PASS** (time, M, V) · AI fall-back **PASS** (time, M) · AJ account A→B **PASS** (boundaries: `boundOther` closes the `(app)` group and every Kids route resolves to it; a screen kept from the other account gets nothing; composition journey) · AK demo/account isolation **PASS** (boundaries: everything Kids writes in a demo household is `demo-seed`, not syncable) · AL malformed child reference **PASS** (P) · AM stale editor **PASS** (M, mutant K-M4) · AN double-save **PASS** (dense unit, V) · AO sync retry **PASS** (J offline) · AP server refusal **PASS** (J) · AQ large household **PASS** (dense 450, J 450) · AR local-only state excluded **PASS** (J: the refused row stays device-only; Kids adds no local-only kind) · AS raw Talk It Out source excluded **PASS** (boundaries: Kids never reads interpretations or sources) · AT stable ordering **PASS** (dense shuffle) · AU/AV screen-reader responsibility and unknown/default state **PASS** (V) · AW empty state **PASS** (V) · AX/AY/AZ/BA RLS **PASS** (J, §19) · BB shared attention coherence **PASS** (P, mutant K-M15).

Tier 3 — conditional (not manufactured): BC pickup-authority — **SAFE-UNAVAILABLE** (none certified; MP-K-03) · BD fallback caregiver — **SAFE-UNAVAILABLE** (no distinct backup semantic; arrangement readiness is built over responsibility; MP-K-02) · BE child-subject System — **PASS** (read-only listing) · BF school-form representation — **NOT-APPLICABLE** (a form is an ordinary task and is shown as one) · BG operational instruction — **PASS** for a user's own free-text notes shown as written (no medical inference); no dedicated instruction field exists · BH child archive — **SAFE-UNAVAILABLE** (MP-K-04) · BI recurring commitment — **PASS as a fact** ("Repeats weekly"); occurrences are not expanded (no expansion primitive at the baseline) · BJ intelligence proposal abstraction — **NOT-APPLICABLE** (none exists; none added). No required scenario is DEFERRED-IN-RUN.

## 22. Mutation / test-the-test evidence (K7)

`scripts-dev/f05-mutation-check.cjs` (committed, re-runnable): 23 single-line mutants, the file restored byte for byte after each. Six are the plan's required ones, all **CAUGHT**: child identity (K-M1 first child instead of the chosen one; **S-M1/S-M2 drop a child's identity going to and coming from the cloud, judged by the real-database journey**), duration provenance (K-M2 default 15 → user 15; K-M3 an untouched edit upgrades to hers), dependency truth (K-M13 removed prerequisite read as satisfied), responsibility (K-M8 an unanswered request read as covered; K-M9 accepted-still-yours as covered; K-M5 accept with no explicit answer), fallback readiness (K-M11 nothing recorded as PLAN IN PLACE; K-M14 a step turns the plan green), removed fallback person (K-M10 an archived person still counts, so PLAN IN PLACE survives). Also caught: unknown child accepted (K-M6), the "not linked" list dropping adult-subject tasks (K-M18), colliding names ignored (K-M19), copy claims (K-M21/K-M22), holder filed as someone else's (K-M17), invented urgency (K-M15), household-boundary guard (K-M16), child added while bound (K-M7), stale guard (K-M4), DST gap (K-M20). Result at final HEAD: §36. *(At closeout K-M7 was retargeted, K-M23 and 14 new mutants were added — 38 in all, every one caught: §38.9.)*

## 23. Defects found / repaired

| ID | Sev | Found how | What | Repair |
|---|---|---|---|---|
| D-K1 | P2 | design review of the inherited test | Replacing the Kids screen would have taken kids-category tasks that name no child **out of reach** (they are in no other list) | `unlinkedKidsTasks` + reachability test; inherited capture test rewritten for the intent |
| D-K2 | P3 | AC rendered test | The action to sort out a gap (the main path: nothing recorded) was folded behind a disclosure | Soonest three shown inline; fold only the rest; title opens the item |
| D-K3 | P3 | design review | An accepted-off-list handoff to somebody since **archived** still read "does not need her" (foundation `needsMePersonally` never looks at the person's status) | Kids files it under "needs you"; foundation answer reported as it is (MP-K-16) |
| D-K4 | P4 | design review | A shared attention entry could name an event no longer in the child's list (no row to open) | Shared entries restricted to returned items |
| D-K5 | P2 | reading `accept()` | The foundation's `stillNeedsMe` argument **defaults to false (covered)**; a caller that forgot to ask would silently make it covered | `recordAccepted` refuses anything but an explicit boolean; UI has no default (K-M5) |
| D-K6 | P3 | own review | The editor container labelled children with the UTC date, not the household day | uses `logicalDateAt` |
| D-K7 | P4 | scan | Invisible/literal look-alike and U+FFFF characters in two source files (tooling decoded `\u` escapes) | code points and a named constant |
| D-K8 | P2 | export gate | **The first Android export bundled the MAIN checkout's `app/`, not this worktree's** (the `node_modules` junction makes Expo Router resolve `app/` from the shared copy); it looked green | not counted; worktree given a real `node_modules` with a real `expo-router` copy; the second export contains this worktree's strings and not the old screen's (§36). *Suspicion, unverified:* the IR01 validation exports may have the same blind spot |
| F-K0-01 | — | source gate | No path creates a child | `addChild` (new file, unbound only) + OC-01 |
| MP-K-09 | P4 | reading | `attentionFor` `risk` counts `acknowledged` as handled | not changed (shared file); recorded |

## 24. Missing primitives (K1)

See `HK_FEATURE_05_MISSING_PRIMITIVES.md` (MP-K-01 … MP-K-15). The load-bearing ones: **MP-K-01** no child create path (owner checkpoint for the
post-binding half), **MP-K-02** no distinct backup party, **MP-K-08** no Life registration mechanism.

## 25. Integration candidates

None is implemented; each is a *contract* the later feature consumes. Kids never chooses the user's One Move.
* **HK-INT-LIFE-REG-01** — Life registration. Kids sits behind the existing `life/kids` route; when the shared Life registration mechanism exists it registers `KidsHub` (one entry) and the `child/[childId]`, `child-item`, `child-add` routes move under it. Nothing in the Life hub, layout or tab shell was changed.
* **HK-INT-KIDS-TODAY-01** — Kids attention → Today's briefing. Kids consumes `attentionFor` unchanged; Today can read the same primitive for the same items and cannot disagree. Candidates Today may take: shared attention entries about child-linked items, a fact-entry `not_accepted` / `handed_back` / `holder_unavailable`, and a plan gap (NEEDS A PLAN). Today's Life summary row for Kids (`describeTasks`) still counts category tasks; making it child-aware belongs here.
* **HK-INT-KIDS-CALENDAR-01** — child context → Calendar. Events are the same `CalendarEvent` rows with `subjectMemberId`; Calendar gains "for Sam" by reading the subject; Kids' event editor and Calendar's must converge on one form (Kids owns the child chooser and the DST hints).
* **HK-INT-KIDS-SYSTEMS-01** — repeated child logistics → a System proposal. Child-subject Systems are listed read-only; a repeated preparation sequence could later be proposed, never silently created.
* **HK-INT-TIO-KIDS-01** — Talk It Out → a reviewed child-linked proposal → acceptance → `createChildTask` / `createChildEvent`. Kids imports nothing from Talk It Out and stores no source text; the OD-A neutral-label rule applies to anything that arrives from an undecided reading.
* **HK-INT-KIDS-PEOPLE-01** — child responsibility → People OS. The inline "someone new" (name + relationship) is a placeholder for People OS's network; `archivePerson` has no UI. People and responsibilities are owner-private (MP-K-13).
* **HK-INT-KIDS-COPARENT-01** — child logistics Co-Parent needs: who holds a commitment, whether it is accepted, whether it is covered, and the plan-gap step, all as canonical rows. Kids builds no custody, negotiation, messaging or reimbursement.
* **HK-INT-KIDS-LIFEADMIN-01** — child paperwork: a form is a task and shows as one; Life Admin/Documents will own generalized paperwork.
* **HK-INT-KIDS-CHILD-01** — child creation after binding (OC-01) and child removal/archive (MP-K-04) need the foundation owner's decision.

## 26. Accessibility

Rendered under the RN stub, so this proves the props contract, not pixels or a real screen reader. **Identity:** each hub card and item row is one button whose label carries the child (with birth-date context where names look alike), the item, when, where, who holds it, the coverage sentence, the plan label, and what is not recorded — in a sensible linear order. **State is text first:** every responsibility and plan state has a text label and sentence; tint is a second signal only (`Tag` carries its own text). **Unknown / default / estimated** are said aloud ("Nobody is recorded as handling this", "About 15 minutes (an estimate)", "Not recorded: where"). **Controls:** every pressable target is at least 44 pt (asserted on cards and rows; the design system's buttons are 44–48); disclosure toggles announce `expanded`; errors and stale notices use the alert role; a disabled control (accept "Save" until a choice is made) exposes `disabled`. **No essential drag or swipe.** Dynamic text: rows use `minHeight`, never fixed heights. No animation was added (so reduced motion has nothing to respect). Header titles are set on the native header. *Not done:* a real TalkBack/VoiceOver pass and contrast measurement of the new tinted rows (they reuse approved token pairs).

## 27. Performance methodology / results

`scripts-dev/f05-perf.mjs`, run at K7 on the development machine (win32 x64, 13th Gen Intel i7-1360P ×16, 15.6 GB RAM, **0.44 GB free — a shared, memory-starved host**), **Node v24.14.0 (V8 13.6), types stripped by Node, test mode — NOT Hermes / React Native, NOT a production bundle, NOT device rendering**. One process; 10 warm-up calls, then 60 timed samples per figure; `performance.now()`.
| Fixture | Cold hub | Hub warm median / p95 | Cold detail | Detail warm median / p95 |
|---|---|---|---|---|
| Dense: 6 children, 96 tasks + 60 events (156 child-linked), 54 responsibilities, 30 dependencies | 20.8 ms | **8.06 ms** / 11.84 ms | 3.5 ms | **1.84 ms** / 3.16 ms |
| Large: dense + 450 more open child-linked tasks (606 child-linked) | 26.3 ms | 16.71 ms / 39.36 ms | 5.2 ms | 3.20 ms / 6.04 ms |
Soft targets (hub < 100 ms, detail < 50 ms median): **met** in this environment, with no caching and no architectural distortion (`attentionFor` is computed once per call, and only when a detail needs it). These are algorithmic numbers: rendering cost on a phone was not measured.

## 28. Privacy

Kids stores **no new field**; every row it writes is an existing canonical row. It logs nothing (no `console`, analytics, share or clipboard in the feature — mechanically scanned), sends nothing itself (the store observes and central sync sends), reads no interpretation or source artifact (so no raw Talk It Out utterance or derived title can enter it), and shows notes and instructions only as she wrote them, with no medical inference. It asks for the two facts the stored child requires: a **name and a birth date** (SD4-028 — child-data minimization — remains a deferred privacy review; adding a create path adds collection of data the schema already holds). Account switching cannot expose another household (the `(app)` group is closed while a different account's household is on the device; a projection asked for a different household returns nothing). A demo household is isolated (everything Kids writes there is `demo-seed` and never syncable). People and responsibilities are owner-private in the cloud; a second household member does not see who is handling a child's item (MP-K-13).

## 29. Test accounting

*(Figures at the original close. The closeout repair's recomputed figures — suite 1203, Kids 204, harness 927 — are in §38.7.)*

| | Before (baseline `14bd58e`) | After (final HEAD) |
|---|---|---|
| Application suite | 975 tests / 207 suites | **1176 tests / 252 suites**, 0 fail, 0 skipped |
| New Kids tests (`tests/kids`) | — | **201** across 11 files (children, identity, time, projection, mutations, views, reachability, boundaries, copyTruth, dense, scenarios) + 26 scenario fixtures |
| Backend harness | 800 / 800 | see §36 (Kids journey adds 33 checks) |
| Mutation check | IR01 35 / 35 | Feature 05 23 / 23 (§22); IR01's 35 re-verified at K0 |

**Inherited tests affected — every one classified:** `build3Audit.capture.test.mjs` "every Life screen with a task list is wired to its role…" — **REWRITTEN** (one assertion, rationale in the test comment and §3: its intent — every open kids-category task stays reachable from the Kids screen — is preserved and now proven by `tests/kids/reachability.test.mjs`; the file it pinned, `KidsOverview.tsx`, was REPLACED). Every other inherited test — `routeAccess`, `categories`, `designIndependence`, `tokenBoundary`, `productionWiring`, `foundationAcceptance2`, `claimPayload`, `persistence`, `appStore`, `hostileAudit`, `ingestionReasoning`, `migrationV3ToV4`, the design-system tests and the whole 975 — **PRESERVED**, unmodified, and green. None was deleted, weakened or skipped.
## 30. Schema / fingerprint (K1)

*(K1 text. Superseded by §38.5: the closeout repair applied one additive LOCAL migration; fingerprint `43e7c8a4…`/3617 → `8bf3c7c6…`/3621, exactly three dimensions.)*

**No schema change.** Fingerprint stays `43e7c8a4402a3387cb2e1add4170921e` / 3617 (the certified value at this baseline). No owner-approved schema change occurred.

## 31. Device evidence

**NOT EXECUTED — ENVIRONMENTAL LIMITATION.** The only Android emulator (`emulator-5554`, headless) is another session's runtime and is not to be hijacked, and the host had ~0.6 GB of free commit memory. No screenshot exists and none is claimed. What *does* exist: rendered props-contract tests of every Kids screen (hub, empty, colliding names, detail, plan states, editors, responsibility panel), and a **genuine Metro/Hermes Android bundle of this worktree** (6.4 MB, 1646 modules, every Kids string present, the old Kids screen's strings absent — §36). A real-device pass of: hub, child detail, two children with colliding names, create, edit, responsibility states, fallback planning, empty state and a dense state is still owed. *Trap for whoever does it:* a worktree whose `node_modules` is a junction into another checkout bundles **that checkout's `app/`** (D-K8), and `preview_start` runs in the original directory (see the memory note), so start Metro from this worktree and check its first log line.

## 32. Shared-file changes

Shared common foundation is read-only by default. Every change outside `src/features/kids` and `tests/kids`, and why:
| File | Change | Why unavoidable / why safe |
|---|---|---|
| `src/domain/children.ts` | **NEW** (`addChild`, `checkNewChild`) | No path created a child (F-K0-01). Same `Child` shape, no schema change; a canonical concept, so not hidden in `features/kids`. Covered by `children.test.mjs` |
| `app/(app)/life/kids.tsx` | route now renders `KidsHub` | The existing/direct route (owner rule); same URL |
| `app/(app)/life/child/[childId].tsx`, `child-item.tsx`, `child-add.tsx` | **NEW** routes | Feature-owned routes under Life; no `life/_layout.tsx` edit (titles set from inside the screens) |
| `src/features/kids/KidsOverview.tsx` | **DELETED** (REPLACE) | §3 |
| `tests/build3Audit.capture.test.mjs` | one assertion rewritten | §29 |
| `supabase/tests/journey-composition.mjs` | additive: exports its helpers; `device()` takes an optional `gate` (offline / refuse), default off | lets the Kids journey compose the production path without copying it; a device built without a gate is unchanged |
| `supabase/tests/support/syncDevice.mjs` | additive `anonClient()` | an unauthenticated persona without duplicating the public local key |
| `supabase/tests/run.mjs` | registers `kids`; `kids` skips ENV C; the full run ends with the Kids journey | |
**Not changed:** the schema, migrations, RLS, sync kinds, `state.ts`, the store, `composeAccountApp`, the design system, `routeAccess`, the tab shell, the Life layout and hub, `TaskForm`, `EventForm`.

## 33. Sibling-import result

**Expected: ZERO. Result: ZERO** (`tests/kids/boundaries.test.mjs`, run in the suite, and re-checked at the end by grep, §36): no import of `feature/06`, `feature/07`, `feature/08`, `features/home|meals|coparent|people|life-admin`, `talk-it-out`, `today`, `calendar`, `systems`, `daily-load` or `one-move`; the only feature Kids imports from is `life` (`openTaskLabel`, the machinery the inherited screen already used); no sync mechanism, provider, network or model SDK; no `KidTask` / `KidEvent` / `KidCalendarEntry` / `KidResponsibility` / `KidDependency` / `KidDuration` or second Child model is declared.
## 34. Owner checkpoints encountered (K1)

**OC-01** — creating a child after account binding: proposal written, **nothing built**, rest of Feature 05 continues (`HK_FEATURE_05_OWNER_CHECKPOINT_01.md`). **RESOLVED by the owner and built in the closeout repair (§38); no owner checkpoint remains for Feature 05.**

## 35. Considered / deferred

* **Adding a child to an already-signed-in household** — OC-01 (owner). *At K8: not offered; measured evidence in §19. RESOLVED and built at closeout (§38).*
* **A distinct backup person** (someone other than the normal holder) — MP-K-02; needs a "fallback for" relation. **Interpretation stated for the owner:** the three readiness labels describe whether the *recorded arrangement* holds (PLAN IN PLACE = a live holder who is an active person accepted it and marked it off her list). If the owner meant a second, independent person, that is a new durable semantic and was not faked.
* **Child rename / correct / archive** (MP-K-04, MP-K-05): the cloud member row is read-only to the client.
* **A People screen** (list, edit, archive, contact): People OS. Kids has one inline "someone new" (name + relationship).
* **Recording a `requires` prerequisite in the UI** (MP-K-14), **recurrence occurrence expansion**, **overnight events**, **REASSIGN / complete-responsibility** controls: supported by the foundation, deliberately not exposed.
* **A response deadline** ("expect a reply by …") when asking somebody: `ackDueAt` exists; Kids sets none (so "no reply" arises only from records made elsewhere).
* **Confirming a length** on legacy tasks in bulk, **a real-device pass**, **TalkBack/VoiceOver**, **contrast measurement** of the new tinted rows.
* **Foundation observations, not changed (shared files):** MP-K-09 (`attentionFor` risk counts `acknowledged` as handled), MP-K-16 (`needsMePersonally` ignores an archived holder).

## 36. Exit gates (recomputed at the final code state, one process at a time)

*(The gates of the ORIGINAL close, at `e2603c6`. The closeout repair recomputed every gate at its own final code state: §38.11.)*

Final HEAD = the commit carrying this ledger (`git log -1 --format=%H`); `git diff --stat 99c757f HEAD -- src app supabase tests scripts-dev` is empty, so every gate below ran against the code at the final HEAD. Branch `feature/05-kids-os`; `git status` clean.
| Gate | Result |
|---|---|
| TypeScript (`tsc --noEmit`, `--max-old-space-size=1600`) | **exit 0**, no diagnostics |
| Full application suite (serial) | **1176 tests / 252 suites, 1176 pass, 0 fail, 0 skipped** (baseline 975) |
| Feature 05 suite (`tests/kids`) | **201 tests, all pass**, plus 26 committed scenario fixtures compared |
| Tier 1 / Tier 2 scenarios | **PASS** (§21); Tier 3: 2 PASS, 4 SAFE-UNAVAILABLE / NOT-APPLICABLE, none DEFERRED-IN-RUN |
| Test-the-test | **23 caught, 0 survived, 0 broken**, file restored; includes the six required (§22); the IR01 35/35 was re-verified at K0 |
| Backend harness (`node supabase/tests/run.mjs`, real local PostgreSQL + PostgREST, run alone) | **833 / 833 checks** (baseline 800 + 33 Kids). *An earlier full run died in the pre-existing `sync-integration` while another session's harness was running against the same container (an environmental collision, documented in the memory notes); it was re-run alone once that finished. Also once earlier: `spawnSync docker UNKNOWN` under memory starvation.* |
| Actual app-composition sync test / real PostgreSQL representative journey / second-device round trip / offline-restart / retry-refusal | **PASS** — `journey-kids.mjs`, all devices built by `composeAccountApp` (§18, §20) |
| Account switch · demo isolation | **PASS** (§21 AJ, AK; composition journey) |
| Child identity round trip · colliding-name UX · dependency truth · duration provenance · responsibility truth · fallback truth · fallback-person invalidation | **PASS** (§21, mutants §22) |
| Non-authorization presentation | **PASS** (§17; `copyTruth`) |
| RLS attack matrix | **PASS** — five personas over PostgREST (§19); no new representation to attack |
| Raw-source exclusion | **PASS** (boundaries privacy audit; Kids reads no interpretation or source) |
| Secret scan (every line added since the fork) | **0 hits in 7,940 added lines** (JWT, Supabase/Stripe/AWS/Google keys, private keys, secret assignments, service-role, credentialed URLs) |
| Expo Doctor | **21 / 21 checks, no issues** |
| Android export | **exit 0, one 6.4 MB Hermes bundle, 1646 modules, every Kids string present and the old Kids screen's absent.** *The FIRST export (1635 modules) bundled the main checkout's `app/` because of the `node_modules` junction and is NOT counted (D-K8); it was redone after giving the worktree a real `node_modules`.* |
| Migration SHA-256 | baseline `81909daa…` (CRLF) / `8bc38d66…` (LF), shipping `1e9169de…`, additive `73db6639…` — **all unchanged**; `git diff 14bd58e HEAD -- supabase/migrations` empty |
| Schema fingerprint | **`43e7c8a4402a3387cb2e1add4170921e` / 3617 — MATCH.** No schema change; no owner-approved change occurred |
| Performance | §27 (dense hub 8.06 ms median; detail 1.84 ms; Node, not device) |
| Accessibility · copy · affordance audits | props-level **PASS** (§26); `copyTruth` and the affordance audit run in the suite |
| Shared-file report · feature-boundary grep · sibling-import grep | §32; changed-outside-feature list equals §32; sibling imports **ZERO** (§33) |
| Device / visual validation | **NOT EXECUTED — ENVIRONMENTAL LIMITATION** (§31) |

## 37. Final verdict

> *This is the verdict as it stood at the end of the original build (HEAD `e2603c6`). It is SUPERSEDED by the closeout repair's verdict in §38.14: OC-01 is resolved and no owner checkpoint remains.*

**HK-FEATURE-05-KIDS = PASS WITH DOCUMENTED DEBT**
**READY FOR INDEPENDENT FEATURE 05 AUDIT = YES**
**READY FOR WAVE 2 INTEGRATION = YES** — meaning only that Feature 05 introduces no known blocker to later integration. It does not authorize a merge. Expect textual conflicts in `supabase/tests/run.mjs`, `journey-composition.mjs` and `support/syncDevice.mjs` with other Wave 2 features that also extend the shared harness (all my edits there are additive).

The debt: device evidence not executed (§31); one owner checkpoint open (OC-01, adding a child after sign-in); no distinct backup person (MP-K-02); two foundation observations recorded and not changed (MP-K-09, MP-K-16).

### Completion report

**After Feature 05, a woman can** open Kids from Life, add each of her children before she signs in, and for each child see what is next and what genuinely needs her; tell what she must do from what somebody else was *asked* to hold, and tell "asked", "seen", "said yes" and "said yes and it's off my list" apart; see which upcoming commitments have no arrangement — or one that stopped holding because the person is no longer on her list — and turn that into a real task with one tap; create and edit real tasks and events for one specific child (two children with the same name kept apart), with the length's origin kept as she gave it; and see the same picture on a second device through her account, after a restart, and after being offline.

1. **Understand each child's situation without reconstructing it?** Yes for what is recorded: next item, needs-attention facts, open work by who holds it, fallback state; anything unrecorded is named as unrecorded, not guessed.
2. **What genuinely requires her vs what another person merely appears to own?** Yes: "Needs you" is the foundation's own `needsMePersonally`; "With someone else" excludes anything still marked as needing her; nobody-recorded is its own group and never "needs you".
3. **Accepted vs actual coverage?** Yes: only *accepted by an active person AND marked off her list* reads covered; accepted-but-still-yours does not (mutants K-M8/K-M9/K-M5).
4. **Where a child plan may fall through?** Yes: NEEDS A PLAN (declined, handed back, no reply, holder unavailable) and NOT ENOUGH KNOWN, per upcoming commitment.
5. **A real next step when a plan is missing?** Yes: "Add a step to sort this out" creates a child-linked task attached by one `part_of` edge; an open step is opened, not duplicated.
6. **Avoids implying legal authorization?** Yes (§17): a persistent planning-only note, arrangement-only labels, and a mechanical scan that no string claims authorization, approval, verification or an official record.
7. **Create / edit real canonical child-linked state?** Yes: canonical tasks and events with `subjectMemberId` and `scope: 'child'`; stale-safe; only changed fields written.
8. **Child identity survives restart and sync?** Yes, including two children with the same name, proven in PostgreSQL and on a second device; mutants S-M1/S-M2 prove the test can fail.
9. **Duration provenance survives?** Yes: default 15 and user 15 are different cloud rows; confirming the same number makes it hers; untouched edits never upgrade it.
10. **Dependency truth survives?** Yes: completed = satisfied; removed/archived/missing = unavailable, "review", never done; history never rewritten.
11. **Can a stale or removed responsible person keep the plan green?** No: readiness is re-derived on every read; an archived holder gives NEEDS A PLAN on both devices (K-M10).
12. **Reuses shared attention semantics?** Yes: `attentionFor` consumed unchanged, its urgency shown as given; where it is silent Kids states the fact with none; a test proves nothing it flags is missing and nothing extra has urgency.
13. **Reuses canonical household truth rather than a second universe?** Yes: no `Kid*` model, no new stored field, no new collection; the mechanical scan enforces it.
14. **Can future intelligence reason from this without false certainty?** Yes: every fact carries its provenance-bearing state (duration knowledge, coverage, standing); unknown stays null/named; no AI code or types were added.
15. **New durable semantics proposed?** One: creating a child after account binding (a server path). Proposal written; nothing built.
16. **Owner checkpoints triggered?** One (OC-01). Also two interpretive decisions stated for the owner (§16, §35).
17. **Schema change?** None. Fingerprint `43e7c8a4…`/3617 unchanged.
18. **Sibling imports?** None.

*Replacement-floor note.* This ledger concludes only that the **approved Feature 05 build contract was implemented**. Whether that is sufficient market coverage against family-organizer products is an owner product judgment.

---

## 38. Closeout repair — adding a child after account binding (OC-01 RESOLVED)

*Appended after §37. Nothing above was rewritten; where an earlier section says a child cannot be added after binding, or that there is no schema change, this section governs. Everything is local: nothing was pushed, merged, rebased, squashed or amended, no PR was opened, no remote Supabase, Staging or Production was touched, and no sibling Wave 2 branch was disturbed.*

### 38.1 The decision and the rules it came with
The owner resolved OC-01: **a household bound to an account MUST be able to add a child**, on the EXISTING household-member / child identity model — no second child model, Kids-specific identity table, feature-specific Supabase persistence path, separate sync queue, duplicate household-member abstraction or new account/user identity system. Authority: the account-bound household **owner** only; existing RLS and security preserved. Preferred path: *feature action → canonical store mutation → existing change observer → existing sync → existing household/member backend semantics* — Kids must not know how account sync is implemented. A migration, if genuinely required, is **local only** with old and new fingerprints recorded. The repair was to be the smallest correct one, without redesigning Kids, cleaning unrelated debt or merging siblings.

### 38.2 Commits (local only; the branch was never pushed)
| Commit | What |
|---|---|
| `e2603c6` | **starting HEAD** — the original close (code last changed at `99c757f`) |
| `c22ecdf` | the additive local migration, the SQL security suite (`77`), the harness pins, the new fingerprint baseline |
| `3cabe87` | shared sync support (a child is a create-only `member` kind; the pull adopts its own row) and the one-character name-cleaner repair (D-K9), with their tests |
| `bd1fe91` | Kids offers add-a-child to a household bound to an account |
| `403d19e` | the real-database journey (post-bind child, refusal, RLS attack matrix) and the new mutants |
| `f77d084` | pins that a household bound to an account is offered "Add a child" through the same hub view (the last code/test commit) |
| this documentation commit (`git log -1`) | this ledger, the owner-checkpoint resolution, the register and the backend-doc notes |
Source diff since `e2603c6`: **10 files, +90 / −34 in `src` and `app`; 24 files, +1728 / −69 in total, tests, harness and docs included** (`git diff --stat e2603c6 HEAD -- src app`).

### 38.3 What inspection found before anything was built
* `household_members` is **SELECT-only** to `authenticated` (no INSERT/UPDATE/DELETE grant, exactly one policy). Its rows were created by `bootstrap_account` and `claim_local_household`, both `SECURITY DEFINER`.
* `sync_push` is `SECURITY INVOKER` **on purpose** (B4-P0-025; `74-sync-push.sql` asserts it), so it can only write what the caller may write, and its allow-list did not name `household_members`.
* A claim runs **once per account** (`superseded_by_cloud` afterwards), so it cannot carry a later child.
* Client side, `member` was a *mapping-only* kind: nothing observed `AppState.children`, so a child added after binding got no intent, no queue item and no mapping, and a task naming it became `unresolvable-dependency` evidence (measured at K6).
* **Existing schema and sync kinds therefore did NOT suffice:** a server path was genuinely required, and it is the only server change made.
* One hazard the trace found before it could ship: `applyMembers` (the pull) treated a child whose local id it already held as "taken" and minted a **second** local child. Once a device creates children, a lost acknowledgement plus the coordinator pulling *before* it pushes would have duplicated the child. Repaired (D-K10).

### 38.4 What was built (the minimum)
Full description, the authority table and the differences from the proposal: `HK_FEATURE_05_OWNER_CHECKPOINT_01.md`. In short:
* **Backend** — `supabase/migrations/20260921190000_f05_add_child_after_binding.sql` (one function, one replaced function; LF-pinned; local only).
* **Shared sync** — `syncTypes.ts` (`member` is a create-only pushed kind, rank 0, table `household_members`, no updatable columns), `syncKinds.ts` (`member` ↔ `children`), `projection.ts` (exactly what a person states about a child), `pullEngine.ts` (matched by cloud id; own-row adoption; the `MEMBER_TABLE` special case is now the ordinary table→kind map). The change observer, bridge, queue, coordinator, transport and claim seam are **unchanged**.
* **Kids** — `canAddChild` lifted (`identity.quarantine === null`), one unavailable-notice string reworded, comments. No screen, tab, control, route or design was added.
* **Shared repair (D-K9)** — `src/domain/account/claim.ts`, one character.
* **Not touched:** `state.ts`, the store, `composeAccountApp`, RLS, grants, the schema of any table, `app.json`, the design system, the tab shell, `attentionFor` (MP-K-09) and `needsMePersonally` (MP-K-16).

Shared-file changes since the original §32 (each with why): `src/domain/sync/{syncTypes,syncKinds,projection,pullEngine}.ts` (the minimum shared sync support above); `src/domain/account/claim.ts` (D-K9); `src/domain/children.ts` (comment only); `supabase/migrations/20260921190000_…sql` (NEW); `supabase/tests/run.mjs` (the migration list, ENV A/C/D, stack currency, quality checks), `supabase/tests/77-f05-child-after-binding.sql` (NEW), `supabase/tests/journey-composition.mjs` (`gate.loseAck`, additive), `.gitattributes` (LF pin), `supabase/tools/{README.md,baselines/f05-local-fingerprint.json}`; tests `foundationSpecs`, `hk-ir01/changeBridge`, `hk-ir01/syncComposition` (extended, none weakened); docs `HK_INTEGRATION_READINESS_01_BACKEND.md` (two supersession notes).

### 38.5 Backend and schema evidence
**Fingerprint (the shared LOCAL database, read-only measurement, `supabase/tools/schema-fingerprint.mjs`):**
| | Gating digest | Facts |
|---|---|---|
| **Old** — IR01 baseline, measured on the shared database immediately before the migration reached it | `43e7c8a4402a3387cb2e1add4170921e` | 3617 |
| **New** — measured on the same database after it | `8bf3c7c6367c06b79128eb83147fd17e` | 3621 |

Exactly **three** dimensions differ and every one is intended: `functions` 27 → 28 (the new `private.push_household_child`, and the body digest of `public.sync_push`), `privileges.effective` 309 → 310 (`authenticated` EXECUTE on the new function), `privileges.functions` 53 → 55 (its two EXECUTE entries: `authenticated` and the owner). **No unexplained drift:** an item-level diff on two disposable databases (IR01 schema vs IR01 + F05) lists exactly those lines and nothing else (3610 → 3614 facts there; the shared stack carries seven more facts of its own, unchanged). Columns, constraints, indexes, policies, triggers, relations and every other privilege dimension are byte-identical. The new baseline is `supabase/tools/baselines/f05-local-fingerprint.json`; the shared database verifies against it (`MATCH`).

**Migration hashes (SHA-256):** baseline `81909daa…` (CRLF working tree) / `8bc38d66…` (LF blob) — unchanged; shipping `1e9169de…` (working tree) — unchanged; IR01 `73db6639…` — unchanged; **F05 `21cdfe20…` (LF)**. `git diff e2603c6 HEAD -- supabase/migrations` contains only the new file.

**Applied to:** the shared LOCAL database only (`supabase_db_Her_Keys`, by the harness's stack-currency step) and to disposable `b4_env_*` databases. Not to Staging, Production or any remote project.

**Harness (real local PostgreSQL, run alone):** ENV A/C apply all three migrations; **ENV D upgrades a POPULATED database in place** (2 households, 5 members, 4 tasks, …): nothing lost, nothing rewritten (member and task digests equal before and after), the v2 claim still replays to the same answer, the owner can then add a child, an unrelated account is refused, the fail-closed assertion still passes; the static quality checks pin the migration as additive (no table/column/constraint/index/policy/table-grant change), exactly two functions, LF, and ending in the fail-closed assertion; the harness now expects exactly three migrations.

### 38.6 The 20 required scenarios
"Journey" = `supabase/tests/journey-kids.mjs` against real PostgreSQL/PostgREST; "Composition" = `tests/hk-ir01/syncComposition.test.mjs` (the production composition against a model cloud); "SQL" = `77-f05-child-after-binding.sql`; "Bridge" = `tests/hk-ir01/changeBridge.test.mjs`.
| # | Scenario | Result | Proven by |
|---|---|---|---|
| 1 | add a child before binding | PASS | Journey §1 (Sam, Sam, Josie built through the Kids mutations); Composition "1-3" |
| 2 | bind the account | PASS | Journey "signing in claims the household that Kids built"; Composition "1-3" |
| 3 | the same child survives the claim | PASS | Journey "both children called Sam…", "Josie keeps her EXACT name…"; Composition "1-3" (no ordinary create is sent for a claimed child) |
| 4 | add a different child after binding | PASS | Journey "a child added AFTER binding is one ordinary child row…"; Composition "4, 10, 12"; SQL 1, 1b |
| 5 | restart | PASS | Journey "after a restart the old and the new children all remain…"; Composition "5, 6" |
| 6 | both remain | PASS | the same checks (ids compared before and after; one row each; nothing created twice) |
| 7 | a second device hydrates both | PASS | Journey "a SECOND device hydrates the new child…" and "the Kids projection is identical on both devices for every child"; Composition "7, 11"; SQL 2, 2b |
| 8 | duplicate names stay separate | PASS | Journey "a THIRD child called Sam…"; Composition "8"; SQL 3d, 3e |
| 9 | rename preserves identity | PASS — *a server-side rename* | Journey "a rename made on the server is the SAME child on both devices"; Composition "9"; pull-engine unit tests. **No client rename exists (MP-K-05), so the invariant is proved for the only rename that can happen: one made where the child is held.** |
| 10 | create a child task after post-bind creation | PASS | Journey (task attributed by identity in PostgreSQL); Composition "4, 10, 12"; SQL 8 |
| 11 | the second device maps the task to the right child | PASS | Journey (task and event name `late` on device B); Composition "7, 11" |
| 12 | create a child event after post-bind creation | PASS | Journey; Composition "4, 10, 12" |
| 13 | offline post-bind creation | PASS | Journey "a child added OFFLINE…" and "…survives a restart while offline"; Composition "13, 14" |
| 14 | reconnect syncs exactly once | PASS | Journey "on reconnect the child is created EXACTLY once (one row, one send)" and "a LOST acknowledgement settles on the SAME child"; Composition "13, 14" and "14" |
| 15 | a server-refused child write | PASS | Journey "the SERVER refuses a child from a household member who is not its owner (real 42501)…"; Composition "15, 16"; SQL 4 |
| 16 | the refused row is not resent forever | PASS | Journey "…sent ONCE and never again, and the refused child is not silently deleted"; Composition "15, 16"; Bridge "a child whose CREATE ended as evidence is not owed again" |
| 17 | an account switch does not leak the child | PASS | Journey "account switching…"; Composition "17" |
| 18 | an unrelated-account RLS attack fails | PASS | Journey RLS matrix (anon, unrelated account, non-owner member, the owner's direct writes, the private schema); SQL 2c, 2d, 4b–4f, 7 |
| 19 | a foreign household / member id attack fails | PASS | Journey "stating another household's child id (and a forged revision)…"; SQL 4d, 5f, 5g |
| 20 | demo / local-only stays local | PASS | Journey "a DEMO household and a household that was never signed in…"; Composition "20"; Bridge (observer) |

Identity invariants, each pinned: identity is the id and never the name (pull-engine "hydration never matches by NAME", mutant S-N3); identical names are allowed (#8); a rename never creates a child (#9); restart, reconnect and second-device hydration never duplicate (#5–#7, #14, mutant S-N6); tasks and events keep pointing at the right child (#10–#11); a refusal stays truthful and inspectable and is not retried (#15–#16); no relationship is inferred from a matching name; the child never becomes an account user (SQL 5, 5c; `children.test`).

### 38.7 Test accounting (recomputed at the final code state)
| | Before this repair (`e2603c6`) | After |
|---|---|---|
| Application suite | 1176 tests / 252 suites | **1203 tests / 255 suites, 0 fail, 0 skipped** |
| Kids suite (`tests/kids`) | 201 | **204** (the one gate test became three, and the hub test AW2 is new; the AW hub test was reworded) |
| Shared sync / repair tests run together (`hk-ir01`, `foundationSpecs`, `foundationRoundtrip`, `syncEngine`, `claimPayload`, `accountRuntime`) | — | **340 / 340** |
| Backend harness (`run.mjs`, real PostgreSQL, alone) | 833 | **927 / 927** (+94: SQL 77 = 53 checks; Kids journey 33 → **56**; ENV A +5; ENV D +8; static migration quality +4; stack currency +1) |
| Kids mutation check | 23 | **38 caught, 0 survived, 0 broken** (23 original, K-M23, and 14 new) |
| Inherited tests changed | | `changeBridge` (kind inventory 28 → 29 kinds / 26 → 27 pushed; extended), `foundationSpecs` (the reference-graph test now includes links to `member`; strictly stronger), `children.test` and `views.test` (the old "a bound household may NOT add" pins were replaced on purpose by the owner's decision; K-M7 was retargeted and K-M23 added so both edges stay guarded). **None deleted, skipped or weakened.** |

### 38.8 Security: who can do what (proved against real PostgreSQL / PostgREST)
The owner adds a child; a second member, an unrelated account, an unauthenticated caller, a foreign household id and a foreign member id all fail or are harmless; the owner has **no direct write** to `household_members` (insert, rename and erase are refused); the `private` function is unreachable over PostgREST (`PGRST106`) and, called directly in SQL, refuses a non-owner and an unrelated account; a child cannot be handed an account, a role, another scope or an adult type; a valid foreign member id stated in the caller's own household makes a NEW row and leaves the foreign child untouched; the 20-child bound holds per household; `sync_push` is still `SECURITY INVOKER`; `household_members` still has exactly one policy (SELECT). No service-role credential is in client code (the only occurrence in `src` is a comment in `src/config/supabase.ts` saying it must never reach the client; the journey's clients hold the public anon key plus a user JWT). Secret scan of every line added since the fork: **0 hits in 9,703 lines**.

### 38.9 Mutation results (`scripts-dev/f05-mutation-check.cjs`, one process at a time, clean tree, files restored byte for byte)
**38 caught, 0 survived, 0 inconclusive, 38 mutants**, each file restored byte for byte, the tree clean before and after. The 23 original mutants (including the six the plan required and S-M1/S-M2, judged by the real-database journey) are all still present and all still CAUGHT; K-M7 was **retargeted** (its old meaning, "a child may be added to a bound household", is now the owner's decision) and K-M23 added so both edges of the gate stay guarded. **The five new mutants the closeout required are S-N1, S-N2, S-N3, S-N4 and S-N5.** TypeScript mutants are judged by the sync composition and bridge tests; the SQL ones (a line of the migration) by the SQL security suite in a disposable database.

| Mutant | Guards | What is broken | Verdict |
|---|---|---|---|
| K-M1 | child identity | a created task is attached to the FIRST child instead of the one chosen | CAUGHT (2 failing) |
| K-M6 | child identity | a child that is not in this household is accepted as a subject | CAUGHT (3 failing) |
| S-M1 | child identity (sync out) | the sync projection drops a task's child on the way to the cloud | CAUGHT (17 failing) |
| S-M2 | child identity (sync in) | the pull drops a task's child on the way back from the cloud | CAUGHT (3 failing) |
| K-M18 | reachability / AB | the "not linked to a child" list drops tasks that name the adult | CAUGHT (2 failing) |
| K-M19 | colliding names | two children with the same name are no longer treated as colliding | CAUGHT (5 failing) |
| K-M2 | duration provenance | a DEFAULT 15 is recorded as USER 15 at creation | CAUGHT (2 failing) |
| K-M3 | duration provenance | an edit that never touched the length upgrades it to hers | CAUGHT (1 failing) |
| K-M22 | duration provenance (copy) | a default length is worded as if she gave it | CAUGHT (3 failing) |
| K-M13 | dependency truth | a REMOVED prerequisite is read as satisfied (ready) | CAUGHT (3 failing) |
| K-M8 | responsibility | a request nobody has answered is read as COVERED | CAUGHT (3 failing) |
| K-M9 | responsibility | accepted-but-still-needs-me is read as COVERED | CAUGHT (2 failing) |
| K-M5 | responsibility | accepting with no explicit answer to "still needs you?" is allowed (the foundation defaults it to covered) | CAUGHT (1 failing) |
| K-M17 | responsibility | a handoff to an archived person is filed under "someone else has it" | CAUGHT (1 failing) |
| K-M21 | responsibility (copy) | accepted-but-still-yours is worded as off her list | CAUGHT (2 failing) |
| K-M11 | fallback readiness | nothing recorded is read as PLAN IN PLACE | CAUGHT (4 failing) |
| K-M10 | removed fallback person | a person who has been ARCHIVED still counts as available, so PLAN IN PLACE survives | CAUGHT (2 failing) |
| K-M14 | fallback readiness | creating a step to sort a gap out turns the plan green | CAUGHT (2 failing) |
| K-M15 | shared attention | Kids invents its own urgency for a shared attention item | CAUGHT (2 failing) |
| K-M16 | household boundary | a request for another household is answered with this one's children | CAUGHT (3 failing) |
| K-M7 | account gate (OC-01) | a child may be added to a household that belongs to ANOTHER account (quarantined) | CAUGHT (1 failing) |
| **K-M23** | account gate (OC-01) | the old gate comes back: a child cannot be added to a household bound to an account | CAUGHT (1 failing) |
| K-M4 | stale editor | a stale editor overwrites a newer version | CAUGHT (3 failing) |
| K-M20 | time / DST | a time inside the spring-forward gap is no longer reported | CAUGHT (3 failing) |
| **S-N1** | post-bind child write | a child added after binding is never queued: its create is not an allowed operation | CAUGHT (17 failing) |
| **S-N1b** | post-bind child write | the change bridge cannot see the household's children, so a new one is never observed | CAUGHT (14 failing) |
| **S-N2** | child id round trip (out) | the child's local id changes on its way to the cloud | CAUGHT (7 failing) |
| **S-N2b** | child id round trip (in) | the pull gives a child it already knows a NEW local id | CAUGHT (8 failing) |
| **S-N3** | hydration identity | hydration matches an incoming child to a local one by NAME instead of by id | CAUGHT (4 failing) |
| **S-N4** | authority (SQL) | the function no longer checks that the caller OWNS the household: a member, or an unrelated account calling it, can add a child | CAUGHT (5 failing) |
| **S-N4b** | authority (SQL) | sync_push no longer checks household membership before the child is written | CAUGHT (2 failing) |
| **S-N5** | second device hydration | a second device applies children only while it holds none, so a newly created child never arrives | CAUGHT (7 failing) |
| **S-N6** | lost acknowledgement | the pull does not adopt a child this device created, so a lost acknowledgement makes a duplicate child | CAUGHT (2 failing) |
| **S-N7** | dependency order | a child ranks AFTER the work that names it, so a task is sent before its child has a cloud id | CAUGHT (10 failing) |
| **S-N8** | no child mapped to the account holder (SQL) | the collision probe also matches the account holder's own member row, so a child can be reported as "already created" and mapped to the adult | CAUGHT (1 failing) |
| **S-N9** | child bound (SQL) | the 20-child bound is gone (200) | CAUGHT (2 failing) |
| **S-N11** | child name across the boundary | the name cleaner loses its backslash again: `/s+/` turns every letter s into a space ("Josie" -> "Jo ie") | CAUGHT (3 failing) |
| **S-N10** | server-owned columns (SQL) | the function accepts columns a client must not state (an account, a role) instead of refusing them | CAUGHT (3 failing) |

### 38.10 Defects found and repaired
| ID | Sev | Found how | What | Repair |
|---|---|---|---|---|
| **D-K9** | **P1** | the real-database journey, on the first post-bind child named "Ack lost" (the cloud stored "Ack lo t") | `cloudDisplayName` in `src/domain/account/claim.ts` (shared, from IR01) had `.replace(/s+/g, ' ')` — **no backslash — so every letter `s` in a child's name became a space**: "Josie" → "Jo ie" in the claim payload and, because the pull updates a known child from the cloud row, it would then have **overwritten the name on the device**. The function had no test at all and no earlier journey used a name with a lowercase s. Introduced with the function itself, in commit `66c5440` (IR3, which rewrote `claim.ts`), and live from then until `3cabe87` | one character (`/\s+/g`); unit tests of the cleaner and of the member projection, a composition test, a journey check on "Josie", mutant S-N11 |
| **D-K10** | P2 | tracing `applyMembers` before building | a child this device created whose acknowledgement was lost would be pulled back and minted as a **second** local child | the pull ADOPTS a row this device created (own device id, local child held, mapping free) and settles its pending create; mutant S-N6; Composition "14"; pull-engine unit tests; Journey "a LOST acknowledgement…" |
| D-K11 | P4 | while extending the graph test | the reference-graph test excluded links to `member` ("claim-only, never pushed"), which would have let a wrong rank for a child pass | now included; mutant S-N7 |
| — | test tooling | first journey run | my "settled" helper demanded *no* unresolved evidence, but device A legitimately keeps the refused task from §5 as evidence | measured against that known baseline; not a product defect |
| — | environment | while running the journey | after the Docker Desktop hang, Windows could not reach the Her Keys stack's published port (54321) although the containers were healthy | restarted **only** `supabase_kong_Her_Keys` (this project's gateway, stateless, no database or session touched, no other harness running); nothing else was stopped |
Not fixed on purpose (out of scope): MP-K-09 (`attentionFor` treats `acknowledged` as handled) and MP-K-16 (`needsMePersonally` around an archived holder). Neither is regressed by this repair (the Kids projection tests that pin them pass unchanged).

### 38.11 Gates at the final HEAD (recomputed; one process at a time; nothing reused from the original close)
Final code commit = `f77d084`. Every later commit is documentation only (`git diff --stat f77d084 HEAD -- src app supabase tests scripts-dev` is empty), so each gate below ran against the code at the final HEAD. Branch `feature/05-kids-os`.
| # | Gate | Result |
|---|---|---|
| 1 | TypeScript (`tsc --noEmit`, `--max-old-space-size=1600`) | **exit 0**, no diagnostics |
| 2 | Full application suite (serial) | **1203 tests / 255 suites, 1203 pass, 0 fail, 0 skipped** (was 1176 / 252) |
| 3 | Feature 05 suite (`tests/kids`) | **204 tests, all pass** (was 201) |
| 4 | Shared / inherited tests on this path (`hk-ir01`, `foundationSpecs`, `foundationRoundtrip`, `syncEngine`, `claimPayload`, `accountRuntime`) | **340 / 340 pass** — inside the 1203 above, and run separately |
| 5 | Full backend harness (`node supabase/tests/run.mjs`, real local PostgreSQL + PostgREST, run alone, no other session's harness live, `pg_stat_activity` idle) | **927 / 927 checks** (exit 0) (was 833) |
| 6 | Kids real-DB journey including the POST-BIND child (`journey-kids.mjs`, inside 5; `node supabase/tests/run.mjs kids` alone: 58 = 56 + the two stack-currency checks) | **56 / 56** |
| 7 | RLS / security, positive and negative | SQL suite `77`: **53 / 53** in a disposable database; the journey's RLS matrix: **15 / 15** `kids: RLS` checks over real PostgREST |
| 8 | Kids mutation suite | **38 caught, 0 survived, 0 broken** (§38.9) |
| 9 | Inherited IR01 mutation suite (`ir01-mutation-check.cjs`) | **35 caught, 0 survived, 0 broken** |
| 10 | Secret / privacy scan (every line added since the fork `14bd58e`, at `f77d084`) | **0 hits in 9,703 added lines**; no `service_role` in client code beyond an existing comment |
| 11 | Sibling-import scan | **ZERO** (the only cross-feature import is the inherited `life/openTaskLabel`, in the K6-rewritten audit test) |
| 12 | Schema fingerprint of the shared LOCAL database against the new baseline | **`8bf3c7c6367c06b79128eb83147fd17e` / 3621 — MATCH** (measured on the shared database after the final harness run; it also matches the fresh-database result and differs from the IR01 baseline in exactly the three intended dimensions) |
| 13 | Migration SHA-256 | baseline `81909daa…`/`8bc38d66…`, shipping `1e9169de…`, IR01 `73db6639…` unchanged; F05 `21cdfe20…`; `git diff 14bd58e HEAD -- supabase/migrations` is the one new file |
| 14 | Expo Doctor | **21 / 21, no issues** |
| 15 | Android export, isolated (own output directory; this worktree's own real `node_modules`, so the bundle is this worktree's, not another checkout's) | **exit 0 — and verified by content, not by exit code:** one 6.4 MB Hermes bundle (`entry-cc985d40…hbc`, 6,448,941 bytes), 1646 modules. Present (ASCII, in the bundle): "Your children will show up here", "Add a child and Her Keys can hold their practices…", the route `life/child-add`, "Add a child", `PLAN_IN_PLACE`, and **the closeout's own new string** "This household belongs to another account, so nothing can be added to it here." Absent: the legacy Kids screen's "On the family schedule", "Kids feeds the same picture", "Nothing kids-related on your list", **and the K8 gate's "Children can be added before you sign in" / "Adding one to a signed-in household"** — so the bundle holds the closeout code, not the earlier build. Controls "Her Keys" and "expo-router" found first |
| 16 | Clean tree | `git status` clean after the documentation commit; `app.json` (the owner's) never staged |
| — | Device / visual validation | **NOT EXECUTED — ENVIRONMENTAL LIMITATION** (§38.12) |

### 38.12 Device evidence
**NOT EXECUTED.** The only Android emulator (`emulator-5554`, headless) is another session's runtime and the host had about 0.6 GB of free physical memory during this work; it was not touched, Metro was not started, and no screenshot is claimed. The rendered props-contract tests, the real-database journey and the Android export proof stand in for it. **Retained as integration-stage debt** (§31 still lists what a device pass must cover; add: adding a child while signed in, and seeing it on a second device).

### 38.13 Remaining debt, and remote actions
* Still open, unchanged: no client rename or removal of a child (MP-K-05, MP-K-04); no distinct backup person (MP-K-02); MP-K-09 and MP-K-16 (foundation observations); device evidence not executed.
* The F05 migration must be **applied to Staging and Production by the owner** when the time comes, with the fingerprint check in `supabase/tools/README.md`. It was not, and no remote environment was contacted.
* **Remote actions taken: NONE.** No push, merge, rebase, squash, amend, PR, deploy, staging/production migration or remote Supabase change.

### 38.14 Final verdict
**HK-FEATURE-05-KIDS = PASS WITH DOCUMENTED DEBT**
**CLOSED FOR FEATURE DEVELOPMENT = YES**
**READY FOR WAVE 2 INTEGRATION = YES** · **READY FOR HOSTILE AUDIT = YES**
**NO OWNER CHECKPOINT REMAINING FOR FEATURE 05 = TRUE** (OC-01 is resolved and built)

Every condition the closeout set for this verdict holds: the account-bound add-child path is **real** (a child added to a household bound to an account is one ordinary `household_members` child row in real PostgreSQL), **durable** (the intent is written in the same envelope write as the child, survives a restart and a restart while offline, and is created exactly once on reconnect), **synchronized** (through the ordinary change observer, queue, coordinator and `sync_push`, to a second device under the same identity, with the child's tasks and events attributed to it), **secure** (owner only; a second member, an unrelated account, anon, a foreign household id and a foreign member id all fail or are harmless; `household_members` gained no grant and no policy; the private function is unreachable through PostgREST; all proved against real PostgreSQL/PostgREST, not a model), and **independently pinned by tests** (a real-database journey, an SQL suite, composition and bridge tests, and 38 mutants that all fail the tests, including the five the closeout named).

The debt that remains (unchanged in kind): device evidence not executed (§38.12); no client rename or removal of a child (MP-K-05, MP-K-04); no distinct backup person (MP-K-02); two foundation observations recorded and deliberately not changed (MP-K-09, MP-K-16). **The migration is local only; applying it to Staging or Production is an owner-gated step that was not taken.**

*For the integration and the auditor.* (1) This repair touched shared files — `src/domain/sync/{syncTypes,syncKinds,projection,pullEngine}.ts` (the minimum), `src/domain/account/claim.ts` (one character, D-K9) — and `supabase/tests/run.mjs`, which now pins **three** migrations after the baseline; a sibling Wave 2 feature that also adds a migration or a sync kind will conflict there and must reconcile the pin and the fingerprint baseline chain (`ir01` → `f05`) deliberately, not mechanically. (2) D-K9 was live in the inherited claim path: any child whose name contains a lowercase "s" would have been renamed in the cloud by a claim on the earlier code, so an audit of already-claimed local households is worth one query. The Feature 07 branch found and fixed the same line independently (its commit `61e9af1`, observed read-only in `Her-Keys-F07`, with its own test file): the two one-character fixes are identical and integrate as one, and every other branch forked from `14bd58e` still carries the defect until it does. (3) Attack surface to test hardest: `private.push_household_child` and the three marked hunks of `sync_push` (`20260921190000_…sql`), and the adoption rule in `applyMembers`. (4) Not proven anywhere: a real-device run, and behaviour against Staging/Production.

*Replacement-floor note (unchanged).* This closeout concludes only that the **approved Feature 05 contract, as amended by the owner's OC-01 decision, was implemented**. Whether that is sufficient market coverage against family-organizer products is an owner product judgment.
