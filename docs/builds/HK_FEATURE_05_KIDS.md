# HK-FEATURE-05-KIDS — Kids OS build ledger

Branch `feature/05-kids-os` · worktree `C:\Users\jsmit\Her-Keys-F05` · forked from `repair/hk-integration-readiness-01` @ `14bd58e`.
Local only. Nothing is pushed, merged, rebased, squashed or amended. No remote environment is touched.

Sections marked **(K#)** are filled by that phase; a section that still says PENDING has not been reached.

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

## 10. Projection contract (K2) — PENDING
## 11. Create / edit behavior (K2/K4) — PENDING
## 12. Duration provenance (K2) — PENDING
## 13. Dependency behavior (K2) — PENDING
## 14. Kids hub (K3) — PENDING
## 15. Child detail (K4) — PENDING

## 16. Fallback / emergency planning — capability map (K1); build PENDING (K5)

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

## 17. Legal-authorization boundary — PENDING (K5)
## 18. Backend / sync behavior — PENDING (K6)
## 19. RLS / security — PENDING (K6)
## 20. Offline / restart — PENDING (K6)
## 21. Scenarios — PENDING
## 22. Mutation / test-the-test evidence — PENDING (K7)
## 23. Defects found / repaired — PENDING

## 24. Missing primitives (K1)

See `HK_FEATURE_05_MISSING_PRIMITIVES.md` (MP-K-01 … MP-K-15). The load-bearing ones: **MP-K-01** no child create path (owner checkpoint for the
post-binding half), **MP-K-02** no distinct backup party, **MP-K-08** no Life registration mechanism.

## 25. Integration candidates — PENDING (K8)
## 26. Accessibility — PENDING
## 27. Performance methodology / results — PENDING (K7)
## 28. Privacy — PENDING
## 29. Test accounting — PENDING (dispositions for inherited tests are recorded as they change)
## 30. Schema / fingerprint (K1)

**No schema change.** Fingerprint stays `43e7c8a4402a3387cb2e1add4170921e` / 3617 (the certified value at this baseline). No owner-approved schema change occurred.

## 31. Device evidence — PENDING
## 32. Shared-file changes — PENDING
## 33. Sibling-import result — PENDING (K8)
## 34. Owner checkpoints encountered (K1)

**OC-01** — creating a child after account binding: proposal written, **nothing built**, rest of Feature 05 continues (`HK_FEATURE_05_OWNER_CHECKPOINT_01.md`).

## 35. Considered / deferred — PENDING
## 36. Exit gates — PENDING (K8). Baseline gates are in §2.
## 37. Final verdict — PENDING
