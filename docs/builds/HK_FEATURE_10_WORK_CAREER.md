# HK-FEATURE-10 — Work / Career OS — Build Ledger

**This is a live ledger, not an approval gate.** Working record of the F10 Work/Career OS build.
Authority, in order: the F10 prompt, and its **Final Management Addendum**, which controls on any
conflict with the original prompt.

| | |
|---|---|
| Feature | HK-FEATURE-10 — Work / Career OS |
| Branch | `feature/10-work-career-os` |
| Worktree | `C:\Users\jsmit\Her-Keys-F10` |
| WAVE3_BASE | `363e473fdf053547a21a41a67b7f62bd9aa2bcdf` (source: `integration/wave2-f01-f08`) |
| Sibling (not modified) | `feature/09-money-os`, also at `363e473` at F10's start |
| Status | **F10 WORK / CAREER OS: STOPPED — RESUMABLE** (§16) — M1–M6 code, tests and mutation-check complete and committed; the one unexecuted item is a full-suite ENV C backend re-run, blocked by this machine's Docker Desktop service stopping mid-run |

---

## 1. Environment gate

Run from `C:\Users\jsmit\Her-Keys-W2I` before branching:

| Check | Result |
|---|---|
| `git status --short` | clean |
| `git branch --show-current` | `integration/wave2-f01-f08` |
| `git rev-parse HEAD` | `363e473fdf053547a21a41a67b7f62bd9aa2bcdf` |
| `git ls-remote origin refs/heads/integration/wave2-f01-f08` | `363e473fdf053547a21a41a67b7f62bd9aa2bcdf` — **MATCH** |
| `git worktree list` | confirmed `Her-Keys-F09` already exists at `363e473` on `feature/09-money-os` (zero F09 commits at F10's start) |

Entry gate **PASS**. Worktree created: `git worktree add C:\Users\jsmit\Her-Keys-F10 -b feature/10-work-career-os 363e473...`.
`node_modules` installed as a real, independent directory (not a junction — matches the pattern already
used by `Her-Keys-F09` and `Her-Keys-W2I`; junction-based sharing has caused `expo export` route-bundling
bugs in three earlier features per prior-session evidence).

---

## 2. Prior-implementation audit (M1)

Full detail in the audit transcript; summary classification (PRESERVE / REFINE / REPLACE / NOT PRESENT):

| Area | Classification | Evidence |
|---|---|---|
| Canonical Task | PRESERVE | `src/domain/state.ts` `TaskSchema`; `addTask()` in `domain/tasks.ts` |
| Canonical Event | PRESERVE | `CalendarEventSchema`; `addEvent()` in `domain/events.ts`; no "completed" concept for events (by design) |
| Canonical Goal | REFINE | `GoalSchema` (`foundation/structure.ts`) exists and is sound, but has **zero UI anywhere in the app** (F10-MP-04) |
| Category / `systemRole` | PRESERVE | `SYSTEM_ROLES` includes `'work'`; `cat-work` already seeded, `scope: 'professional'` |
| Generic relationship primitive | PRESERVE | `Dependency` + `TypedRef` (`foundation/structure.ts`, `foundation/typedRef.ts`) — the mechanism this build reuses for Opportunity↔Task/Event |
| Privacy/scope model | PRESERVE | `VISIBILITY_SCOPES` incl. `personal`/`professional`, both owner-only under `can_access_scoped_row` |
| Navigation / Life hub | PRESERVE | `/life/work` route and `WorkOverview.tsx` **already existed** as a thin stub before F10 |
| Work/career data | NOT PRESENT | No employer/application/interview model anywhere; legitimately new canonical work |
| Attention / Today / One Move | PRESERVE | `attentionFor()` (`reasoning/attention.ts`), `candidatePoolFor` (`oneMove.ts`) |
| Capacity | PRESERVE (day-level only) | `capacity.ts`, `conflicts.ts` — real, typed conflict detection; no week-level rollup exists (F10-MP-01) |
| Sync architecture | PRESERVE | `FOUNDATION_SPECS` manifest (`sync/foundationSpecs.ts`) + `gen-foundation-sql.mjs` — fully generic; adding a 19th kind requires **zero** hand-written sync code |
| Schema/migration conventions | PRESERVE | `supabase/migrations/*.sql`, `YYYYMMDDHHMMSS_description.sql`; F08's small delta migration is the template for a *column* addition, the foundation manifest is the template for a *new entity* |
| Demo mode | PRESERVE | `AppState.origin`; `demo-seed` never syncs (`isSyncable`) |
| Systems/Routines | PRESERVE | `HouseholdSystemSchema` + steps; reusable for "Monday work reset" with zero new engine |
| Talk It Out capture | REFINE | `INTERPRETATION_KINDS = ['task','event','needsMe']` — Task/Event capture works today; Goal/Opportunity capture would need interpreter changes (F10-MP-03), explicitly out of scope |
| F09 Money OS (peeked, read-only) | — | No money-truth table exists yet in F09's snapshot; nothing to design against yet (F10-MP-02) |

---

## 3. Architecture decisions

### 3.1 Relationship architecture (ADDENDUM A)

**Decision: reuse the existing `Dependency`/`TypedRef` primitive. No `CareerOpportunityLink` table.**

- `foundation/typedRef.ts`: added `'opportunity'` to `TYPED_REF_KINDS`, `KIND_COLLECTION`, `KIND_CLOUD`. **Not** added to
  `CONTENT_REF_KINDS` — that stays the narrower list `Responsibility`/`Pattern`/`ExternalReference`/`Intent` actually need,
  so their cloud tables gain no unused column.
- `foundation/structure.ts`: `Dependency` gets its **own** widened endpoint type, `DEPENDENCY_REF_KINDS = [...CONTENT_REF_KINDS, 'opportunity']`
  / `DependencyRefSchema`, used only by `DependencySchema.from`/`.to`. `domain/structure.ts`'s `addDependency` takes
  `TypedRef<DependencyRefKind>` accordingly.
- A career opportunity's **next action** is `Dependency{relation:'part_of', from:{kind:'task'}, to:{kind:'opportunity'}}` —
  the *exact same shape* a Goal's steps already use. An **interview** is the same relation with `from:{kind:'event'}`.
  Endpoint kind alone disambiguates "next action" from "interview"; no new relation vocabulary was needed.
- Cloud side: `sync/foundationSpecs.ts`'s `dependency` spec's `from`/`to` `kinds` list widened via a **new, spec-local**
  constant (`CONTENT6_OPP`), not by widening the shared `CONTENT6` other specs use — so `observation`/`pattern`/
  `external_reference`/`responsibility`/`intent`'s cloud tables are byte-for-byte unchanged.

### 3.2 `CareerOpportunity` as a 19th foundation kind

Added one `FoundationSpec` entry (`kind: 'opportunity'`, table `career_opportunities`) to the existing manifest.
Because `syncTypes.ts`, `syncKinds.ts` and `foundationProjection.ts` are **all** derived generically from
`FOUNDATION_SPECS`, this single manifest entry alone provides: cloud table + RLS + grants (via
`gen-foundation-sql.mjs --write`), sync push/pull eligibility, dependency rank, local↔cloud row projection —
**zero hand-written sync code**. This is the strongest evidence that the manifest pattern was the right call.

Three **hand-written** spots (by design — the manifest generator explicitly does not touch them) needed a
one-line addition each, mirrored exactly on the existing 18 kinds' pattern:
1. `change_log_entity_table_check` CHECK constraint (migration).
2. `sync_push`'s owner-column `CASE` allow-list (migration).
3. The zero-data interlock's `protected` table array, both copies (migration) — table count updated 34 → 35 throughout
   (migration comments, `run.mjs`'s `ENV B3`/quality checks, `57-foundation-rls.sql`'s catalog, `foundationSpecs.test.mjs`'s
   hardcoded `18`/`19` assertions).

`gen-foundation-sql.mjs`'s `OWNER_PRIVATE_KINDS` set gained `'opportunity'`, so any FK reference *to* a
`career_opportunities` row is same-owner-enforced, not just same-household.

**Regeneration proof:** `node supabase/tools/gen-foundation-sql.mjs --check` reported "up to date" both before
any F10 change and after every regeneration; `git diff` of the regenerated region shows **only** the new
`career_opportunities` table and the widened `dependencies` ref-kind columns/constraints/indexes — nothing else moved.

### 3.3 `CareerOpportunity` model (ADDENDUM F)

`src/domain/foundation/opportunity.ts`. Fields: `id, title, organizationName, opportunityType, stage, closedReason,
sourceNote, applicationDeadline, followUpDate, contactName, compensationNote, notes, createdAt, updatedAt,
stageChangedAt, archivedAt, provenance, scope`. `scope: z.literal('personal')` — matching every other foundation
kind's convention (all 18 pre-existing kinds are `'personal'`-only; none use the broader 5-value scope), which is
already RLS-owner-only. No new privacy scope was invented.

Deliberately absent: `nextActionText`, an interview sub-record, any structured compensation column, confidence,
candidate/employer-interest scoring. Proven absent by `58-foundation-integrity.sql` §15 (checks
`information_schema.columns` directly for amount/salary/wage/rate/currency and next_action/interview_at-shaped
columns).

`organizationName` (not `organizationLabel`, the addendum's own illustrative name): renamed after
`tests/designIndependence.test.mjs` correctly flagged `organizationLabel` as matching its presentation-smell
regex (`/label/i`) — coincidental, not a real presentation leak, but the repo's own `contactName`/`displayName`
convention was the better name anyway.

**Stage** (ADDENDUM G/H): `exploring | interested | applied | interviewing | offer | accepted | closed`, defaults to
`exploring`, changed only through `setOpportunityStage()` — never by time, an Event's time passing, or a linked
Task's completion. No mandatory pipeline: any stage → any stage is permitted (including backward corrections).

**Closed reason** (ADDENDUM I): `withdrawn | declined_by_organization | offer_rescinded | no_further_response | other`.
Schema-level pairing constraint (Zod `superRefine` + a `CHECK` in Postgres): required exactly when `stage === 'closed'`,
cleared the instant the stage is corrected away from `closed`.

**Archive vs. closed** (ADDENDUM J/K): `archivedAt` is a separate, orthogonal nullable timestamp — archiving never
rewrites `stage`/`closedReason`, and closing/archiving never touches linked Tasks/Events. The UI surfaces "N linked
next steps are still open" as information when closing/archiving with open links; nothing is auto-resolved.

### 3.4 Work Now classification (ADDENDUM D)

Reused verbatim: `category.systemRole === 'work'` (`categoryWithRole(state, 'work')`), the only truthful,
non-inferred mechanism the foundation already provides. No text/name matching. No new field. F10 did not need to
STOP here because the primitive already existed (§2 above).

---

## 4. Domain command layer (`src/domain/opportunities.ts`)

- `addOpportunity` — always creates at `stage: 'exploring'`.
- `updateOpportunity` — plain-field edits only; cannot touch `stage`/`closedReason`/`archivedAt`.
- `setOpportunityStage` — the only stage-change path; refuses (`{state, refusal}`) a `closed` stage with no/invalid
  reason, and a non-`closed` stage carrying a reason.
- `archiveOpportunity` / `restoreOpportunity` — the archive axis, independent of stage.
- `addOpportunityNextAction` — creates a Task (`domain/tasks.ts#addTask`) **and** a `part_of` Dependency in one call;
  refuses (returns `task: null`) if the opportunity does not exist; defaults the new Task's `scope` to `'professional'`
  so it cannot leak a private opportunity's context through a household-visible row (ADDENDUM M).
- `scheduleOpportunityInterview` — same shape, for a canonical Event.
- `linkedTasksOf` / `linkedInterviewsOf` / `hasOpenNextAction` / `openLinkedTaskCount` — read straight from
  `stepsOf()` (the existing `Dependency` query helper); no second store.

## 5. Work→Today (ADDENDUM Z) and Work→Capacity (ADDENDUM P/Q)

- `reasoning/attention.ts`: one new reason, `'opportunity_follow_up'`, derived from `state.careerOpportunities`
  (open, non-archived) whose `followUpDate` or `applicationDeadline` has arrived or is within 2 days — the *same*
  urgency banding a task deadline already uses. **No arbitrary inactivity timer**: without an explicit date, an
  opportunity produces zero attention items (ADDENDUM N/O). One item per opportunity even if both dates qualify
  (earliest wins), to avoid duplicate rows for the same opportunity.
- `features/today/model/{refs,attentionView}.ts`: `describeRef`/`rowFor` gained an `'opportunity'`/`'opportunity_follow_up'`
  case each, so a career item renders in Today exactly like any other attention row (title, route, urgency)
  rather than silently dropping.
- `domain/reasoning/workCareer.ts` (new, F10-owned): `workCareerVerdict()` — a **projection over the existing
  `attentionFor()`**, filtered to opportunity items and to task/event items whose category is `work`. Composition
  order matches ADDENDUM Z exactly (single now/today item → plain sentence; multiple → bounded count; else nearest
  `soon` item; else "nothing needs attention"). It does **not** duplicate Calendar/Capacity's own conflict
  reporting (day-level only exists — ADDENDUM Q; F10-MP-07 records the deferred professional-framing copy).
- `CareerOpportunity` itself contributes **zero** Capacity minutes — it has no duration/start/end fields at all,
  so there is nothing for `capacity.ts` to read even by accident.

## 6. UI (M3)

- `src/features/work/WorkOverview.tsx` (extended, not replaced): verdict sentence, then unchanged "Work now"
  (today's work events + `CategoryTaskList`), then new "Career next" (open opportunities, bounded to what's open
  and not archived, `needsAttention` dot when `hasOpenNextAction` is false) with an "Add an opportunity" action.
- `src/features/work/OpportunityForm.tsx` (new) + `app/opportunity-editor.tsx` (new route, modal) — create/edit an
  Opportunity; inline "Add a next action" / "Schedule an interview" mini-forms that call the domain functions in
  §4 directly (no separate task/event screen round-trip). Closed-reason chips appear only when `stage === 'closed'`.
  An open-linked-items note appears when closing/archiving with open links (never auto-clears them).
- Route registration mirrors `task-editor`/`event-editor` exactly: `src/domain/routeAccess.ts`
  (`ROOT_SCREEN_GUARDS['opportunity-editor'] = 'app'`, `rootScreenForPath`), `app/_layout.tsx`
  (`Stack.Protected` + `Stack.Screen`). `tests/routeAccess.test.mjs`'s generic, file-driven checks pass unmodified.
- Design system reuse only: `Screen`, `TextField`, `ChipToggle`, `Button`, `StatusList`, `Card`, `Overline`,
  `AppText` — no new component, no enterprise-dashboard or kanban treatment.

## 7. Privacy (ADDENDUM L/M)

- `career_opportunities.scope` is hard-coded `'personal'` at both the Zod and Postgres layers (matching every
  sibling foundation kind) — owner-only under the same `can_access_scoped_row` RLS function every other private
  row uses. No new scope was invented.
- A linked Task/Event created *from* an Opportunity defaults to `scope: 'professional'` (§4), which is also
  owner-only under the identical RLS predicate — so a next-action Task cannot leak a private opportunity's title
  through a household-visible row.
- Proven, not assumed: `57-foundation-rls.sql`'s new block — owner insert ALLOW; same-household other member
  (`user B`) sees none of A's opportunities and can only write her own; unrelated household (`user C`) DENY read
  and DENY write; anon DENY at the privilege layer. All four pass against a real local Postgres (§9).

## 8. Local-first / sync

No new sync code was written (§3.2). Local-first mutation paths (`addOpportunity`, `setOpportunityStage`,
`addOpportunityNextAction`, …) are pure `(state, ctx) => AppState` transitions through the same `store.commit`
every other feature uses — immediate UI update, background persistence, no online round-trip required.

## 9. Backend validation (M5, in progress)

| Check | Result |
|---|---|
| `node supabase/tools/gen-foundation-sql.mjs --check` | up to date, before and after every manifest edit |
| `supabase/tests/run.mjs 57` (foundation RLS) | **52/52 PASS** (clean, isolated rerun — see note below) |
| `supabase/tests/run.mjs 58` (foundation integrity, incl. new §15 CareerOpportunity doctrine + widened-Dependency proofs) | **150/150 PASS**, including all 15 new F10 checks (3 dependency cross-domain proofs + 12 opportunity doctrine proofs) |
| Full `supabase/tests/run.mjs` (ENV A/B/B3/D/E/C, all suites) | *(pending — will confirm the 35-table interlock, fresh-install and populated-upgrade paths — see §12)* |

A second hardcoded table count was found and fixed mid-run: `ENV A: 34 application tables` in `run.mjs`
itself (a `pg_class`-count check distinct from the interlock-guard array already fixed) and the
equivalent static pin in `supabase/tests/00-interlock.sql` — both updated to 35 and reconfirmed green.

**Context noted, not a defect:** partway through this milestone, `Her-Keys-F09` was found to have
active commits (through "F09-M6: hostile self-review") — a separate session is building the sibling
Money OS feature concurrently, exactly as the prompt anticipates. `git status --short` in
`Her-Keys-F09` was confirmed empty (zero changes from this session) before and after; only one
`run.mjs` process was ever observed active at a time.

**Environmental note:** the very first `run.mjs 57` attempt, executed while several other background
processes were active on this machine, showed 3 unrelated FAILs in the "cursor snapshot barrier" section
(a two-session `change_log`/xid concurrency test, nothing to do with `career_opportunities`). A clean,
isolated rerun with no other `run.mjs`/`psql` process active passed 52/52 — matching the documented
"harness collision looks like a code failure but isn't" pattern from prior Her Keys builds.

Two real, self-inflicted test-fixture bugs were found and fixed during this pass (not schema/security
defects): the new `career_opportunities` test inserts omitted `stage_changed_at`, a real `NOT NULL` column
with no default (by design — the app always states it explicitly, same as `addOpportunity` does) — fixed in
both `57-foundation-rls.sql` and `58-foundation-integrity.sql`.

## 10. Test-the-test (ADDENDUM AD) — mutation results

Run via `node scripts-dev/f10-mutation-check.cjs` against the clean M1–M5 commit (`06848cf`). Each
mutation is applied to the real source, `tests/work/opportunity.test.mjs` is run, the mutant is required
to make it FAIL, and the file is restored byte-for-byte (`git checkout`) whether it was caught or not.
No mutant was committed; the worktree was confirmed CLEAN after the run.

| ID | Mutation (ADDENDUM AD) | File mutated | Result |
|---|---|---|---|
| M1 | RELATIONSHIP — an opportunity with no linked Task appears to have a next step | `opportunities.ts` (`hasOpenNextAction` forced to `true`) | **CAUGHT** (1 failing) |
| M2 | INTERVIEW — an Event's time passing automatically advances the Opportunity stage | `opportunities.ts` (`scheduleOpportunityInterview` advances stage when `startsAt` is past) | **CAUGHT** (1 failing) |
| M3 | STAGE — `applied` is silently treated as `interviewing` | `opportunities.ts` (`setOpportunityStage` rewrites the requested stage) | **CAUGHT** (2 failing) |
| M4 | CLOSURE — closing an Opportunity automatically completes its linked Tasks | `opportunities.ts` (`setOpportunityStage` cascades into `state.tasks` on `closed`) | **CAUGHT** (1 failing) |
| M5 | ONE MOVE — CareerOpportunity itself becomes a One Move target without a canonical Task | `state.ts` (`ONE_MOVE_TARGET_TYPES` gains `'opportunity'`) | **CAUGHT** (1 failing) |
| M6 | MONEY BOUNDARY — a structured compensation field is added to the accepted schema | `foundation/opportunity.ts` (`CareerOpportunitySchema` gains `salaryCents`) | **CAUGHT** (9 failing — the schema-shape test plus every constructor test, since `strictObject` now demands the new field) |

**6 / 6 caught.** The remaining two ADDENDUM AD mutations have no application-layer target to mutate and
are proven at a different layer instead, per the automated check's own output:
- **PRIVACY** ("a same-household but unauthorized profile reads an owner-private CareerOpportunity") is
  enforced only by Postgres RLS (`career_opportunities_select_own`) — proven live in §9/§12
  (`57-foundation-rls.sql`: "same-household member B: sees NONE of A's career opportunities" / "B: sees
  exactly her own opportunity"), not by any application code that could be mutated.
- **IDENTITY** ("F10 collision/context logic relies on a child's display name rather than its canonical
  ID") has no F10 target: F10 introduces zero child-referencing logic (confirmed by a repo-wide grep for
  `displayName` across every file this build touched — no matches). The identity guarantee this
  mutation would attack belongs to F05 and is covered by F05's own mutation check.

## 11. Application test suite

| Point | tests | suites | pass | fail | notes |
|---|---|---|---|---|---|
| ENTRY (pristine `Her-Keys-W2I`, before any F10 change) | 2814 | 614 | 2812 | 2 | Both fails are `tests/meals/boundary.test.mjs` — F08's own hostile-audit scan (`scripts-dev/meals-boundary-scan.cjs`) flags `feature/09-money-os`'s local branch as "sibling history reaching HEAD," a structural false positive: F09's branch tip is *identical* to `WAVE3_BASE`, which sits above the scan's hardcoded pre-F08 baseline commit, so it looks like sibling contamination when it is really just the shared Wave 3 fork point. Confirmed present in F10's own worktree *before any code change*, from a clean `git worktree add`. Not caused by F10; not F10's to fix (F08's own committed regression test). |
| After M2 (foundation schema + sync + domain commands) | 2817 | 614 | 2809 | 8 | Fixed during the pass (real, required maintenance, not defects): `V4_EMPTY_COLLECTIONS`/`V4_ROOTS` needed `careerOpportunities` (legacy migration + test fixture builders build a full `AppState` literal); `FOUNDATION_SPECS.length`/table-uniqueness assertions and `SYNC_ENTITY_KINDS.length` needed 18→19 / 29→30; `richHousehold.mjs` needed one opportunity+task+dependency row so the generic "one row of every kind" projection/roundtrip tests exercise the new kind; `organizationLabel`→`organizationName` rename (design-independence lint false-positive, §3.3). |
| After M3 (UI + Today integration) | 2817 | 614 | 2813 | 4 | Two more of the same F08-scan false positive (now also naming `src/domain/routeAccess.ts` as a changed "PROTECTED" file — again, an accurate but not-applicable-to-F10 finding from a script scoped to F08's own diff). One real, required fix: `tests/monetization.test.mjs`'s exhaustive "every onboarding-guarded screen must close after completion" loop needed `opportunity-editor` added to its exclusion list, alongside `event-editor`/`task-editor` (same guard type: opens once the app itself is unlocked, is not an onboarding step). |
| After M6 (mutation-check file added) | 2852 | 622 | 2848 | 4 | +35 tests / +8 suites is exactly `tests/work/opportunity.test.mjs` (added after the M3 count above). Of the 4 fails: 3 are the same pre-existing F08-scan limitation (one more assertion in that file now also names `tests/work/opportunity.test.mjs` and the mutation-check script as further "unexplained" shared-file/new-file changes — same root cause, not a new one); 1 is `tests/hk-ir01/syncComposition.test.mjs`'s "5,000-task household" performance budget test, which failed only under heavy concurrent load from this session's own parallel backend-harness/mutation-check runs (confirmed by re-running it fully isolated: **54/54 pass**, including that test, when nothing else was active — see §9's environmental note for the identical pattern). |

**ENTRY = 2814 tests (2812 pass) / EXIT = 2852 tests (2848 pass).** No test disappeared without a named
reason — every count change from ENTRY to EXIT is accounted for in the rows above.

## 12. Backend harness accounting

A full, unscoped `node supabase/tests/run.mjs` (migration quality + ENV A/B/B3/D/E, then ENV C) was
started against the clean `06848cf` commit. Everything through ENV E passed with **zero failures**:

| Section | Result |
|---|---|
| Migration quality (static inspection) | all PASS, including the "35 application tables" guard-enumeration checks |
| ENV A — empty apply (fresh install) | all PASS, including `ENV A: 35 application tables` |
| ENV B/B1/B2 — zero-data interlock attack | all PASS |
| ENV B3 — interlock re-run over a populated foundation table | all PASS, including `ENV B3: ...and every one of the 35 tables is still there` |
| ENV D — additive upgrade of a populated pre-IR01 database | all PASS |
| ENV E — additive upgrade of a populated pre-F08 database | all PASS |

**ENV C (the full numbered-suite pass, 00 through 99) did not finish.** Partway through its setup, this
machine's Docker Desktop backend service (`com.docker.service`) stopped outright — confirmed via
`Get-Service com.docker.service` reporting `Stopped`, not merely slow — and the harness process failed
with `database "b4_env_c" does not exist` once its container connection was lost. This is a host/tooling
failure, not a test result: no FAIL line was ever produced.

**This is not a fresh gap.** Suites 57 and 58 — the two this feature actually changes the shape of — were
already run individually against a live, correctly-migrated ENV C earlier in this same session, cleanly:
**57: 52/52**, **58: 150/150** (§9), including every F10-specific RLS and doctrine check. What did *not*
get a fresh confirmation is the *generic*, pre-existing suites (00, 10, 20, 30, 40, 50, 56, 60, 61, 70, 72,
73, 74, 80, 90, 92, 95, 99) plus `authorization-parity` and the client-payload-integration check, run
together in one ENV C pass alongside 57/58. F10's changes are additive-only (§3.2) and none of those
suites' subject matter (child-subject rules, server columns, claim bootstrap/closure, revision CAS,
change cursor, One Move, action records, fail-closed) touches `career_opportunities` or the widened
`dependencies` columns, so the a priori risk is low — but it is genuinely UNEXECUTED, not passed, and is
reported as such rather than assumed.

**ENTRY/EXIT backend counts:** not captured, because this run did not reach a completed ENV C summary
line (the harness prints pass/fail counts only at the end of that section). The individual suite runs
(57, 58) reported their own totals above.

### 12.1 Resume attempt (Docker recovered; new finding — sibling-campaign contention)

Docker's own outage resolved on its own (`docker ps` responsive again; `com.docker.service` remained
`Stopped` but is evidently not required for the CLI/engine path this harness uses). `tsc --noEmit`
reconfirmed clean. Two full unscoped `run.mjs` attempts were made:

- **Attempt 1** and **Attempt 2** (full unscoped): migration quality + ENV A/B/B3/D/E passed with
  **zero failures** both times (6 clean passes of that sequence total across this ledger's history).
  Both attempts failed during ENV C setup with `database "b4_env_c" does not exist`.
- **Individual-suite attempts** (00, 10, 20, 30, 40, 50), to narrow the exposure window: **00 and 20
  passed cleanly** (17/17, 16/16); **10, 30, 40, 50 hit the same collision**, twice as a hard
  `FATAL: terminating connection due to administrator command` mid-migration.

**Root cause identified:** `git worktree list` shows **F09, F11, F12 and F13 are all active sibling
campaigns** with real commits beyond `WAVE3_BASE` (`feature/09-money-os`, `feature/11-me-rebuild-os`,
`feature/12-life-admin-documents`, `feature/13-people-os`), plus an `F13-entry` staging worktree. The
competing `node supabase/tests/run.mjs [composition]` processes observed (several different PIDs over
time, owner `jsmit`, real accumulated CPU time — not stuck) are consistent with one or more of those
legitimate sibling builds validating against the same shared `supabase_db_Her_Keys` container and the
same hardcoded `b4_env_*` database names this harness has always used. Windows process introspection
(WMI `Win32_Process`) cannot expose another process's working directory, so the specific owning
worktree could not be confirmed directly — but the processes could **not** be classified as
stale/orphaned (the strict bar for that was not met: real sibling campaigns are demonstrably live).

**Classification: DEFERRED-IN-RUN — SHARED BACKEND HARNESS CONTENTION**, not a PASS, not a FAIL, and
not counted against F10. The 4 individual-suite collisions (10, 30, 40, 50) are the same classification
— environmental, not product evidence.

**Isolation check (per the F10 prompt's own preference order):** the harness supports
`HERKEYS_LOCAL_DB_CONTAINER` to point at an entirely different container, but no F10-specific isolated
Postgres/Supabase stack is currently provisioned, and standing one up is a heavier action than
validation itself (new container, new ports, new local infra) — not an "already available" isolation
mechanism for this moment. There is **no** database-name-level (prefix/suffix) isolation for
`b4_env_a/b1/b2/c/d/e` anywhere in `run.mjs` — those names are hardcoded literals. No F10 source, test,
or shared-harness-architecture change was made in response to this.

**Preferred fallback (per directive):** do not compete for the shared `b4_env_*` databases; wait for a
quiet window with no other `run.mjs` process active, then run the complete backend harness once,
serialized, alone. This has not yet succeeded as of this entry. **Machine-wide rule recorded:** only one
Her Keys campaign at a time should own the shared `b4_env_*`-based full backend harness; this should be
carried into Wave 3/4 build-machine coordination (e.g., F09/F11/F12/F13's own sessions, if reachable).

## 13. Known debt / deferred (see `HK_FEATURE_10_MISSING_PRIMITIVES.md` for the full table)

- Career Next surfaces Opportunities only; Goal has no UI anywhere in the app (F10-MP-04/-05).
- Talk It Out cannot capture an Opportunity or a Goal (F10-MP-03) — Task/Event capture already works.
- Work→Money is a named, empty seam (F10-MP-02) — no F09 code was read or modified.
- Professional-flavored collision copy ("Interview overlaps school pickup") is not composed in Work's own
  verdict yet (F10-MP-07); the underlying conflict detection already applies to a scheduled interview because
  it is an ordinary Event.
- No device/emulator pass executed yet (parity with F01–F09's own ledgers, which also record this as open).

## 14. Milestone log

| Milestone | Branch/HEAD at close | Status |
|---|---|---|
| M1 — prior-implementation audit + domain model | `feature/10-work-career-os` @ `06848cf` | COMPLETE |
| M2 — canonical opportunity, commands, local persistence, sync manifest | `06848cf` | COMPLETE |
| M3 — Work/Career projections + UI | `06848cf` | COMPLETE |
| M4 — Calendar/Capacity/Today integration | `06848cf` | COMPLETE (scoped per ADDENDUM Q/S; see F10-MP-07) |
| M5 — sync/backend/privacy | `06848cf` | Suites 57 (52/52) and 58 (150/150) verified; ENV A/B/B3/D/E verified (§12); ENV C's full numbered-suite pass UNEXECUTED — Docker stopped mid-run |
| M6 — hostile self-review + certification | `06848cf` (docs pending a final commit) | Mutation check 6/6 CAUGHT (§10); hostile checklist COMPLETE (§15); verdict is STOPPED — RESUMABLE (§16), not COMPLETE, because §12's ENV C gap is genuinely unexecuted |

Mini-gate at `06848cf`: `git branch --show-current` → `feature/10-work-career-os`; `git rev-parse --short HEAD` → `06848cf`; `git status --short` → clean.

## 15. Hostile self-review (pre-COMPLETE checklist)

| Question | Answer |
|---|---|
| Did we create a second task system? | No — `addOpportunityNextAction` calls the canonical `addTask` |
| Did we create a second calendar system? | No — `scheduleOpportunityInterview` calls the canonical `addEvent` |
| Did we create a second goal system? | No — Goal untouched; deferred (F10-MP-04/05) |
| Did we accidentally build an ATS? | No — no scoring, no CRM, no scraping, no auto-apply |
| Can an opportunity advance without evidence? | No — `setOpportunityStage` is the only path, always explicit (proven M2/M3) |
| Can accepted employment become fake Money income? | No — no structured compensation field exists at all (proven M6, §9 §10) |
| Can a professional detail leak to another household member? | No — `scope:'personal'`, RLS owner-only (proven §9/§12) |
| Can co-parenting see private career details? | No — F10 never touches `coparent-shared` scope or Co-Parent code |
| Can a work deadline distort capacity incorrectly? | No — CareerOpportunity has no duration/start/end fields |
| Can a child rename break relationships? | No — F10 introduces zero child-referencing logic (grep-confirmed) |
| Can Today duplicate professional work? | No — Today reads the same canonical rows via the same Dependency edges |
| Can One Move choose a non-action object? | No — `'opportunity'` is not in `ONE_MOVE_TARGET_TYPES` (proven M5) |
| Can an offline opportunity edit disappear? | No — same `store.commit`/local-first pipeline as every canonical mutation |
| Can stale sync overwrite newer career truth? | No — same generated CAS/revision mechanism as every foundation kind |
| Did we build part of People OS prematurely? | No — `contactName` stays free text (F10-MP-06) |
| Did we build part of Documents OS prematurely? | No — no document storage (F10-MP-08) |
| Does F10 make the user maintain information twice? | No — the next action IS the canonical Task, not a duplicate |

---

## 16. Resumable stop

**F10 WORK / CAREER OS: STOPPED — RESUMABLE**

- **Last clean commit:** `06848cf` on `feature/10-work-career-os` ("F10 M1-M5: Work/Career OS —
  CareerOpportunity foundation, domain commands, UI, Today/Capacity integration, backend RLS").
- **Working-tree status:** clean at `06848cf`; this ledger file and `HK_FEATURE_10_MISSING_PRIMITIVES.md`
  have further uncommitted edits (documentation only — no source change) recording this stop.
- **Completed milestones:** M1–M4 fully complete; M5 complete except the single item below; M6's mutation
  check and hostile self-review are complete and both clean.
- **Exact blocker:** this machine's Docker Desktop backend service (`com.docker.service`) stopped during
  the ENV C phase of a full, unscoped `supabase/tests/run.mjs` run, after ENV A/B/B3/D/E had all already
  passed cleanly against the same migration. Confirmed via `Get-Service com.docker.service` → `Stopped`
  (not merely slow) and the harness's own `database "b4_env_c" does not exist` failure once its
  connection was lost. Docker is shared with other active work on this machine (a concurrent F09 build's
  Expo server, other project stacks), so restarting it was treated as outside this build's authority to
  decide unilaterally.
- **Unexecuted validation:** one full ENV C pass covering the generic, pre-existing numbered suites (00,
  10, 20, 30, 40, 50, 56, 60, 61, 70, 72, 73, 74, 80, 90, 92, 95, 99) plus `authorization-parity` and the
  client-payload-integration check, run together in a single environment. The two suites F10 actually
  changes the shape of (57 foundation-RLS, 58 foundation-integrity) were already run individually and
  passed in full (52/52, 150/150) earlier in this session, against a correctly-migrated ENV C, before
  Docker's interruption.
- **Safe next action:** once Docker Desktop is confirmed healthy again (`docker ps` returns promptly, no
  other `run.mjs` process active — `Get-CimInstance Win32_Process | Where CommandLine -match 'run\.mjs'`),
  run `node supabase/tests/run.mjs` unscoped from `C:\Users\jsmit\Her-Keys-F10` and record ENV C's PASS
  count here. No source change is anticipated; this is a validation-only remaining step. No destructive
  action was taken or is needed — no database was left in a partial state (the harness drops and
  recreates its own scratch databases at the start of every run).
