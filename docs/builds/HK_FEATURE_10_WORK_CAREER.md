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
| Status | IN PROGRESS — M1–M5 substantially complete; M6 hostile self-review and final validation pending |

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
| `supabase/tests/run.mjs 58` (foundation integrity, incl. new §15 CareerOpportunity doctrine + widened-Dependency proofs) | *(recorded once the run completes — see §12)* |
| Full `supabase/tests/run.mjs` (ENV A/B/B3/D/E/C, all suites) | *(pending — will confirm the 35-table interlock, fresh-install and populated-upgrade paths)* |

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

*(To be executed and recorded in M6, alongside the hostile self-review. Each of the 8 required mutations —
relationship, interview, stage, closure, privacy, identity, One Move, money-boundary — will be applied to a
throwaway copy, confirmed to make the relevant test fail, then discarded. No mutant is committed.)*

## 11. Application test suite

| Point | tests | suites | pass | fail | notes |
|---|---|---|---|---|---|
| ENTRY (pristine `Her-Keys-W2I`, before any F10 change) | 2814 | 614 | 2812 | 2 | Both fails are `tests/meals/boundary.test.mjs` — F08's own hostile-audit scan (`scripts-dev/meals-boundary-scan.cjs`) flags `feature/09-money-os`'s local branch as "sibling history reaching HEAD," a structural false positive: F09's branch tip is *identical* to `WAVE3_BASE`, which sits above the scan's hardcoded pre-F08 baseline commit, so it looks like sibling contamination when it is really just the shared Wave 3 fork point. Confirmed present in F10's own worktree *before any code change*, from a clean `git worktree add`. Not caused by F10; not F10's to fix (F08's own committed regression test). |
| After M2 (foundation schema + sync + domain commands) | 2817 | 614 | 2809 | 8 | Fixed during the pass (real, required maintenance, not defects): `V4_EMPTY_COLLECTIONS`/`V4_ROOTS` needed `careerOpportunities` (legacy migration + test fixture builders build a full `AppState` literal); `FOUNDATION_SPECS.length`/table-uniqueness assertions and `SYNC_ENTITY_KINDS.length` needed 18→19 / 29→30; `richHousehold.mjs` needed one opportunity+task+dependency row so the generic "one row of every kind" projection/roundtrip tests exercise the new kind; `organizationLabel`→`organizationName` rename (design-independence lint false-positive, §3.3). |
| After M3 (UI + Today integration) | 2817 | 614 | 2813 | 4 | Two more of the same F08-scan false positive (now also naming `src/domain/routeAccess.ts` as a changed "PROTECTED" file — again, an accurate but not-applicable-to-F10 finding from a script scoped to F08's own diff). One real, required fix: `tests/monetization.test.mjs`'s exhaustive "every onboarding-guarded screen must close after completion" loop needed `opportunity-editor` added to its exclusion list, alongside `event-editor`/`task-editor` (same guard type: opens once the app itself is unlocked, is not an onboarding step). |
| Current | 2817 | 614 | 2813 | 2 (meals/boundary only) | Fixed the monetization gap; the two remaining fails are the pre-existing, out-of-scope F08 scan limitation, documented above. |

**ENTRY = 2814 / EXIT = 2817 (+3: the demo-seed opportunity's task, the new Dependency edge, and the
opportunity row itself add exactly 3 new assertions where fixtures assert exact totals — no test
disappeared without a named reason.)**

## 12. Backend harness accounting

*(Populated once the full `supabase/tests/run.mjs` run completes: ENTRY backend check count, EXIT count,
delta, and the fresh-install / populated-upgrade / RLS matrix results.)*

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
| M1 — prior-implementation audit + domain model | *(pre-commit)* | COMPLETE |
| M2 — canonical opportunity, commands, local persistence, sync manifest | *(pre-commit)* | COMPLETE |
| M3 — Work/Career projections + UI | *(pre-commit)* | COMPLETE |
| M4 — Calendar/Capacity/Today integration | *(pre-commit)* | COMPLETE (scoped per ADDENDUM Q/S; see F10-MP-07) |
| M5 — sync/backend/privacy | *(pre-commit)* | IN PROGRESS — suite 57 verified (52/52); suite 58 and the full harness pending |
| M6 — hostile self-review + certification | not started | PENDING |
