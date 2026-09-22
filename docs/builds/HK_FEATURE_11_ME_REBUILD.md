# HK-FEATURE-11 — Me / Rebuild OS

Branch `feature/11-me-rebuild-os`, worktree `C:\Users\jsmit\Her-Keys-F11`, forked from `integration/wave2-f01-f08` @
`363e473fdf053547a21a41a67b7f62bd9aa2bcdf` (WAVE3_BASE, tagged `wave2-final`). Built independently of the Wave 3 siblings
F09 (Money) and F10 (Work / Career): no sibling branch is merged, imported or modified.

Governing documents (this session): the F11 build brief, and the **F11 Final Management Addendum**, which controls wherever the
two conflict. Where this ledger cites "Addendum X" it means that addendum's section X.

Me / Rebuild gives her a private place to name what she wants to keep visible in her own life, and lets that intention connect
cleanly to the canonical actions she chooses to take. It is not therapy, not a journal, not a score, not a second Tasks/Goals/
Systems/Calendar/Capacity system.

---

## F11-M0 — Environment gate + privacy-foundation preflight (BLOCKING)

### Environment gate (recorded before any change)

```
(from C:\Users\jsmit\Her-Keys-W2I)
git fetch origin                                            -> (no output; up to date)
git status --short                                          -> (clean)
git branch --show-current                                   -> integration/wave2-f01-f08
git rev-parse HEAD                                          -> 363e473fdf053547a21a41a67b7f62bd9aa2bcdf
git remote -v                                               -> origin git@github-herkeys:herkeys/her-keys.git (fetch/push)
git ls-remote origin refs/heads/integration/wave2-f01-f08   -> 363e473fdf053547a21a41a67b7f62bd9aa2bcdf   (MATCH)
git worktree list  -> Her Keys (feature/01-today-chief-of-staff 0a893ba), Her-Keys-F09 (feature/09-money-os 77e6dd0),
                      Her-Keys-F10 (feature/10-work-career-os 363e473), Her-Keys-W2I (integration/wave2-f01-f08 363e473)
```

No `feature/11*` branch existed locally or on origin. Created:
`git worktree add -b feature/11-me-rebuild-os C:\Users\jsmit\Her-Keys-F11 363e473fdf053547a21a41a67b7f62bd9aa2bcdf`.
Mini-gate: `feature/11-me-rebuild-os` @ `363e473`, working tree clean. `main`, `feature/09-money-os` and
`feature/10-work-career-os` were not touched.

### Environment incidents (diagnosed, not worked around destructively)

1. **Dependencies.** The first `node_modules` junction pointed at the main checkout (`C:\Users\jsmit\Her Keys\node_modules`), which
   is now EMPTY (0 entries): `tsc` and every test file failed with `MODULE_NOT_FOUND` — not a code failure. The real installs live in
   `Her-Keys-W2I`, `-F09`, `-F10` (351 packages each). `package-lock.json` of F11 and W2I are byte-identical (same WAVE3_BASE), so the
   F11 junction was re-pointed to `C:\Users\jsmit\Her-Keys-W2I\node_modules` (only the junction itself was removed and recreated;
   no dependency directory of any worktree was deleted or modified; W2I still holds 351 packages). `tsc --noEmit` then ran clean.
2. **Docker Desktop 4.85 would not start** (`initializing Inference manager: listening on unix://…\Docker\run\dockerInference: remove …:
   The file cannot be accessed by the system`, then the same for `%LOCALAPPDATA%\docker-secrets-engine\engine.sock`). AF_UNIX socket
   reparse points on this machine had become undeletable (error 1920, even a freshly created one). With the owner's permission to
   restart Docker, the two socket directories were renamed aside (`Docker\run.stale-20260922b`, `docker-secrets-engine.stale-20260922`;
   nothing deleted) and Docker started in seconds. The Supabase containers came back healthy (`storage` unhealthy, as usual on
   Windows; the harness needs only `db` + `auth`).

### M0 — the owner-private scope, as it actually exists in WAVE3_BASE

Inspected, not assumed. The foundation already has exactly one owner-private scope, and it is fully enforced end to end.

| Record | Finding (evidence) |
|---|---|
| **SCOPE NAME** | `personal` — `VISIBILITY_SCOPES` (`src/domain/schemaPrimitives.ts:32`); every foundation schema pins `scope: z.literal('personal')` (e.g. `GoalSchema`, `src/domain/foundation/structure.ts`). The cloud comment is explicit: "'personal', 'professional' and 'coparent-shared' rows are OWNER-ONLY" (`20260919231500_build4_cloud_schema.sql:316-318`). |
| **LOCAL REPRESENTATION** | Rows carry `scope: 'personal'`. The local store belongs to ONE account: `AccountBindingSchema { accountId, householdId, … }` (`src/domain/account/binding.ts`); a household that belongs to a different signed-in account is QUARANTINED — "recorded, preserved and never rendered, uploaded or merged" (`QuarantineSchema`, same file, B4-P0-035). Ownership locally = the bound account. |
| **CLOUD REPRESENTATION** | Foundation (owner-pinned) tables: `profile_id uuid NOT NULL` + `scope text NOT NULL DEFAULT 'personal'` + `CHECK (scope = 'personal')`, generated from the manifest `src/domain/sync/foundationSpecs.ts` by `supabase/tools/gen-foundation-sql.mjs`. Shared-content tables (tasks, events, systems, categories, meals): `owner_profile_id` NOT NULL exactly for the owner-private scopes (`*_owner_scope_check`). |
| **RLS BEHAVIOR** | Foundation tables: `USING/WITH CHECK ((SELECT auth.uid()) = profile_id AND private.is_household_member(household_id))` for SELECT/INSERT/UPDATE; no DELETE policy. Shared tables: `private.can_access_scoped_row(household_id, scope, owner_profile_id)` = member AND (scope IN household/child OR owner = caller). References between foundation rows are same-household AND same-owner composite FKs `(x_id, household_id, profile_id)`. |
| **SYNC BEHAVIOR** | Push stamps `profile_id := ctx.profileId` (`foundationProjection.ts:63`); `sync_push` probes collisions on the OWNER boundary `(household_id, local_id, profile_id)`. Every owner-private write is logged with `owner_profile_id` (`log_row_change('household_id','profile_id')`), and `change_log_select_scoped` shows an owner-tagged entry to its owner only. `sync_pull` is SECURITY INVOKER, so a pull cannot see another owner's change entries; the rows themselves are then fetched under RLS. |

**Live verification (executed, disposable ENV C databases, 2026-09-22):**

```
node supabase/tests/run.mjs 10   -> 33/33 checks passed   (member: DENY another member personal task; unrelated: DENY … even with the exact household uuid)
node supabase/tests/run.mjs 20   -> 16/16 checks passed   (member: DENY another owner professional/coparent-shared row; owner: DENY a second member private row)
node supabase/tests/run.mjs 57   -> 46/46 checks passed   (same-household member B: sees NONE of A's private goals; unrelated user C: sees nothing;
                                                            a row cannot reference ANOTHER MEMBER'S private row, even inside the same household)
node supabase/tests/run.mjs 90   -> 17/17 checks passed   (change cursor)
```

The one leg no existing suite asserted directly — the change log's owner filter against a SAME-household member — was probed read-only
in the populated `b4_env_c` (every statement inside a rolled-back transaction):

```
superuser view: owner-tagged entries for A = 6          (A and B are both members of household af497baa-…)
A sees own owner-tagged entries = 6
B (same household) sees A's owner-tagged entries = 0
C (unrelated) sees A's owner-tagged entries = 0
C sees any household-A entries = 0
```

The four M0 obligations: (1) local persistence associates truth with the individual owner — PASS; (2) sync preserves that ownership —
PASS; (3) RLS denies another authenticated member of the SAME household — PASS; (4) a second unrelated household is denied — PASS.

**M0: PASS.** RebuildFocus defaults to — and is pinned to — `personal`. No F11-specific scope is invented.

### Shared Wave 3 privacy signal (Addendum V)

**AVAILABLE SHARED FOUNDATION PRIMITIVE.** The `personal` owner-private scope (owner-pinned foundation table + `profile_id` +
owner-only RLS + owner-tagged change log + same-owner composite FKs) is a general primitive, not an F11 artifact. On the evidence above
it is suitable for F09 Money, F10 Work / Career and F12 Life Admin / Documents wherever they need owner-private truth. Two caveats any
of them must honour, recorded rather than solved here:

- It is a *two-level* model: owner-private vs household-visible. There is no "shared with one named member" scope
  (`coparent-shared` is owner-only by design, B4-P0-038).
- A foundation table's reference to a SHARED-content table (tasks, events, systems, meals) is a same-household FK
  `(id, household_id)`, not same-owner. FK checks bypass RLS, so a private row may reference a household row (intended) — and a
  referencing table must use `ON DELETE CASCADE` toward shared targets, or a household member's deletion could surface an FK error that
  reveals a hidden reference. (No client can DELETE those tables today; only server-side deletions reach them.)

This ledger does not claim any sibling uses it.

---

## Test accounting — ENTRY (WAVE3_BASE, before any F11 change)

Recorded from raw runner output in `C:\Users\jsmit\Her-Keys-F11` @ `363e473`, serially.

```
tsc --noEmit                                  -> exit 0 (clean)
node --test --test-concurrency=1 tests/**     -> ℹ tests 2814  ℹ suites 614  ℹ pass 2812  ℹ fail 2  (cancelled 0, skipped 0, todo 0)
node supabase/tests/run.mjs                   -> NOT a clean full count at entry (see "Backend harness at ENTRY" below)
```

**Backend harness at ENTRY — raw results, not rounded to the recorded 1028/1028.** Four full runs of the UNCHANGED base (no F11
code existed yet), each run alone (no other `run.mjs`; checked with `Get-CimInstance Win32_Process`):

| Run | Result | Where it stopped |
|---|---|---|
| 1 | 1016 ok, 2 FAIL, then `HARNESS ERROR: Cannot read properties of undefined (reading 'responsibility')` | Home journey: device B hydrated `[]` |
| 2 | 816 ok, 3 FAIL, then `HARNESS ERROR: … (reading 'id')` | sync-integration X / 13 / 13b: the empty second device hydrated nothing |
| 3 | 817 ok, 2 FAIL, then `HARNESS ERROR: … (reading 'id')` | sync-integration 13 / 13b |
| 4 (instrumented) | 985 ok, 5 FAIL, then `HARNESS ERROR: Cannot read properties of null (reading 'queue')` | composition, meals, kids journeys: a write never became visible to the other side |
| journeys only (`run.mjs journeys`) | **240/240 checks passed** | — |

Every failure is in the real-HTTP API journeys and is a DIFFERENT check each time; every non-journey environment (ENV A, B, B3, D,
E, C and parity) passed in every run. An instrumented run (a once-a-second poller of `pg_stat_activity` + the pull barrier
`pg_snapshot_xmin(pg_current_snapshot())`) found NO long-open transaction holding the barrier during the journeys, but found the
database container extremely slow right after the Docker/WSL restart (`DROP DATABASE … WITH (FORCE)` taking 18–22 s; single DDL
statements taking seconds). Classification: **environmental, timing-dependent, pre-existing at WAVE3_BASE** — not F11 (no F11 code
existed). It is re-measured at M5 and at exit, and it is not counted as a PASS anywhere.

**The two failing application tests are pre-existing at WAVE3_BASE and are not F11's.** Both live in `tests/meals/boundary.test.mjs`
(`[BV1..BV5]` and `[BM1..BM3]`) and have one cause: the F08 Meals semantic-boundary scan (`scripts-dev/meals-boundary-scan.cjs`)
enumerates local branches matching `feature/0*` and flags any whose merge-base with HEAD is above F08's own base `38ab7f1`.
`feature/09-money-os` (created after Wave 2 was certified at 2814/2814) matches `feature/0*` and forks from 363e473, so it is reported:

```
G: sibling history reaches HEAD: feature/09-money-os: shares history with HEAD above the baseline (363e473)
```

Proven independent of F11: the same scan run read-only in `Her-Keys-W2I` (HEAD = 363e473, no F11 change anywhere) returns exactly
this finding. See integration candidate `HK-INT-W3-F08-SCAN` below — this scan is not Wave-3 aware and will also fail for every Wave 3
feature that adds a migration, table or sync kind.

---

## F11-M1 — Typed-relationship primitive audit + RebuildFocus semantic/model contract

### Prior-implementation audit (read-only, against WAVE3_BASE)

| # | Primitive | Class | Evidence and F11 use |
|---|---|---|---|
| 1 | Personal/"me" category semantics | **REUSE** (filing) / me-role **NOT PRESENT** | `SYSTEM_ROLES` = kids, home, money, meals, work, wellbeing, relationships, coparenting (`schemaPrimitives.ts:29`). Starter `cat-wellbeing` and `cat-relationships` are `scope: 'personal'` (`categories.ts:14-23`). No `me`/`rebuild` role. F11 adds no role. |
| 2 | Personal-scope data | **REUSE** (+ first production caller) | `addTask(..., { scope })` accepts `'personal'` (`tasks.ts:30`), projected with `owner_profile_id` (`projection.ts:302`), owner-only under `can_access_scoped_row`. No production UI created a personal Task before F11; every form hard-codes `household`. |
| 3 | Goal | **PRESERVE**, REUSE as link target | `GoalSchema` (`foundation/structure.ts:151-164`): owner-private, `active/achieved/paused/abandoned`. `addGoal` has **no production caller** and there is no Goal screen, so a Focus→Goal link is domain/sync-real but has no user path (MP-11-04). |
| 4 | Goal↔Task relationship | **PRESERVE** | Only `Dependency.relation = 'part_of'` (drives `goalProgress`/`stepsOf`). Not repurposed for Focus. |
| 5 | Systems / routines | **PRESERVE**, REUSE as link target | `HouseholdSystemSchema` has **no status** (no pause/archive); runs/step completion NOT PRESENT (F04 MP-01/03/08). Systems attention = `delegation_unanswered` only. |
| 6 | Energy / effort / low-energy alternative | **REUSE** (read-only) | Task facet `energyDemand`; `Dependency.relation = 'alternative_to'` read by `alternativesTo()` (`domain/structure.ts:163`). F11 may display an existing alternative; it never creates one and adds no energy model. |
| 7 | Capacity | **PRESERVE** | `detectCapacityPressure` (`dailyLoadIssues.ts:224-253`) counts task/event minutes. A Focus has no duration and is not read by it. |
| 8 | Attention / briefing / Today / One Move | **PRESERVE** | `attentionFor` (task/intent/responsibility/event/needsMe), `todayView`, One Move pool = open tasks + NeedsMe (`oneMove.ts:151-167`). RebuildFocus enters none of them (Addenda F, S). |
| 9 | Personal-domain route / Life registration | Me route **NOT PRESENT**; hub **REFINE** (one fixed row) | Life hub `app/(app)/life/index.tsx` is a hard-coded `StatusList` + fixed rows; no registration mechanism exists (HK-INT-WAVE2-LIFE-REGISTRATION). F11 adds one fixed row and one route file. |
| 10 | Onboarding "rebuilding toward" goals | **PRESERVE** | `onboardingOptions.ts:15-22`. Never auto-converted into a Focus. |
| 11 | Pattern / momentum | **PRESERVE** / scoring **NOT PRESENT** | No streak/momentum scoring exists; copy guarantees ban it. F11 builds none. |
| 12 | Generic entity relationship | **REUSE the typed-reference primitive**; generic link **NOT PRESENT** | ADR-005 `typedRef.ts` + manifest `type: 'ref'` field = `<prefix>_type` + ONE real typed FK column per kind, CHECK that exactly the column named by the type is set. `Dependency`/`EvidenceLink`/`Responsibility` each carry a specific meaning and are not repurposed. |
| 13 | Archive / tombstone | **PRESERVE** | Retire-by-status everywhere (Task `archived`, Event `removed`, Goal `abandoned`); no client hard delete; only `discovery` tombstones. Focus `archived` is a status, never a delete. |
| 14 | Provenance / confidence | **REUSE** | `ProvenanceSchema`, `provenanceFor(origin, userProvenance())` (demo → `demo-seed`). |
| 15 | Demo mode | **PRESERVE** (active, not retired) | `dataMode.ts` (dev defaults to demo); the change observer ignores non-`empty` origins (`changeObserver.ts:37-38`); claim refuses demo (`refused_demo`). F11 rows are stamped through `provenanceFor`, so demo Focuses are `demo-seed` and never sync. |
| 16 | Archive / "Past items" UI | shared screen **NOT PRESENT** | Only feature-local sections (Home "Recently marked done", Co-parent "Recently completed"). → `PENDING-INTEGRATION — PAST FOCUSES VIEW` (Addendum L). |
| 17 | Explicit user order | **NOT PRESENT** (user-facing) | Category `sortOrder` has no user reorder; no ReorderControls (F04 MP-10). → Addendum K deterministic order. |
| 18 | Copy / design | **PRESERVE** | Paper and Ink tokens `src/design/tokens.ts`; feature-local `copy.ts`; copy-guarantee tests. |

### Relationship architecture — decision (Addendum B)

The foundation HAS a typed domain-reference primitive that meets every Addendum B requirement, so F11 reuses it instead of
inventing a table shape:

| Requirement | Met by |
|---|---|
| typed target identity | manifest `{ type: 'ref', kinds: [...] }` → `target_type` + `target_task_id` / `target_event_id` / `target_system_id` / `target_goal_id` |
| referential integrity | each typed column is a REAL composite FK: task/event/system → `(id, household_id)`; goal (owner-private) → `(id, household_id, profile_id)`, i.e. same household AND same owner |
| exactly one target | generated `target_ref_check`: `(target_type = k) = (target_k_id IS NOT NULL)` for every k, with `target_type NOT NULL` |
| scope / provenance / persistence / sync | owner-pinned foundation table: `profile_id`, `scope = 'personal'`, standard provenance, change-log trigger, push/pull through the one engine |

`target_type` is a discriminator next to typed FKs, not a polymorphic id: nothing resolves a target from `(type, id)` alone. In
application code the target is the existing discriminated union `refOf(['task','goal','system','event'])` = `{ kind, id }`.
There is exactly ONE F11-owned link table (`rebuild_focus_links`). One typed-FK union table is the repository's existing convention
(`dependencies`, `recurrence_rules`, `evidence_links`, `external_references` all use it), so four per-kind tables would be the
conflicting pattern.

### Link-row privacy (Addendum C) — enforced by construction

- A link row is owner-pinned like its Focus: `profile_id NOT NULL`, owner-only SELECT/INSERT/UPDATE policies, no DELETE policy or grant.
- Its Focus reference is the composite FK `(focus_id, household_id, profile_id) → rebuild_focuses(id, household_id, profile_id)`, so a
  link can only belong to its Focus's own owner. A same-household member who crafts a row naming another member's Focus id gets the
  SAME `23503` as for an id that does not exist — the error carries no existence signal.
- Change-log entries for Focus and link rows carry `owner_profile_id`, hidden from everyone but the owner (proved in M0).
- Targets on shared tables use `ON DELETE CASCADE`: a server-side deletion of a task/event/system silently removes the owner's link
  instead of refusing with an FK error that would reveal it. Goal targets are owner-private, so only their owner can reach them anyway.
- The linked canonical Task/Event/System/Goal row is NOT modified by linking — no `rebuildFocusId` column anywhere (shared-schema stop
  rule). A household member who can see a household Task sees nothing on it that points at a Focus.

### RebuildFocus semantic contract

A RebuildFocus MEANS: "this is an area I have chosen to keep visible." It is not a measurable objective, obligation, diagnosis,
problem, deficiency, task, routine, performance target, or something that must be completed.

- **Identity** is `focus.id`. The title is display only: duplicates are allowed; renaming changes nothing else (Addendum I).
- **Minimum content** is a non-empty trimmed title, state, owner, provenance, createdAt. No Task/Goal/System/Event is required
  (Addendum D).
- **States**: `active` (keep visible), `paused` (she is intentionally not asking Her Keys to surface it now), `archived` (no longer on
  the Rebuild surface). None is a judgment; there is no `completed`, `failed`, `behind` or `abandoned`. Any state may move to any other.
- **Independence**: pausing or archiving a Focus mutates no linked Task/Goal/System/Event; completing or archiving a linked item never
  changes the Focus.
- **Today**: RebuildFocus contributes NO attention candidate, One Move candidate, ranking input or capacity minutes (Addenda F, S).
  A linked canonical Task reaches Today only through existing Task logic.
- **No guilt signal** (Addendum E): an active Focus with no open next-action Task is not a problem state. It shows a quiet inline
  "Add a next step" invitation. There are no timers of any length.
- **No suggestion engine** (Addendum G): Her Keys never invents an action from a title. She writes the next step; saving it creates a
  canonical Task. Opening the form creates nothing (Addendum H).

### RebuildFocus V1 model (the smallest truthful one)

```
RebuildFocus  (AppState.rebuildFocuses; cloud public.rebuild_focuses; sync kind 'rebuildFocus', rank 2)
  id          local id                         (cloud: uuid id + local_id)
  title       string, trimmed, 1..200          display only
  note        string | null, trimmed, 1..500   optional brief context; never copied, logged or surfaced elsewhere (Addendum J)
  state       'active' | 'paused' | 'archived'
  createdAt, updatedAt   instants              (cloud: origin_created_at / origin_updated_at + server created_at/updated_at/revision)
  provenance  ProvenanceSchema                 user-action (demo-seed in a demo household)
  scope       'personal'                       owner: the bound account locally; profile_id in the cloud

RebuildFocusLink  (AppState.rebuildFocusLinks; cloud public.rebuild_focus_links; sync kind 'rebuildFocusLink', rank 3)
  id
  focusId     → RebuildFocus.id                (cloud: focus_id, same-owner composite FK)
  target      { kind: 'task'|'goal'|'system'|'event', id }
  relation    'next_action' | 'supports'       next_action ⇒ target.kind = 'task'
  status      'active' | 'removed'             unlinking is a status change, never a delete
  createdAt, updatedAt, provenance, scope 'personal'
```

Not in the model, deliberately: progress, score, confidence score, streak, health/wellness/mood score, inferred priority, completion
percentage, success metric, `archivedAt` (no foundation lifecycle requires it; `updatedAt` records the change), sort order (no user
ordering primitive exists).

**"No next step"** = zero ACTIVE links with `relation = 'next_action'` whose Task is `status = 'open'`. An archived or completed Task,
or a removed link, is inert for this count (Addenda N, O).

**Order** (Addendum K): ACTIVE Focuses, then PAUSED; within each, `createdAt` ascending, tie-break `id` ascending; ARCHIVED excluded.

### Schema plan (M5; additive)

One new migration `supabase/migrations/2026092xxxxxxx_f11_rebuild_focus.sql`, pinned to LF:

1. the two tables, their keys, constraints, indexes, triggers, owner-only policies and column grants — GENERATED from the manifest by
   `gen-foundation-sql.mjs` into marker regions in THIS file (the generator learns a per-spec `migration` key; the Build 4 migration's
   generated regions must stay byte-identical, and `--check` covers both files);
2. `change_log_entity_table_check` re-created with the two new tables added (the list is otherwise unchanged);
3. `public.sync_push` replaced with the same signature (ACL preserved), its body identical to the F05 version except for the two new
   owner-private tables in its allow-list — the same pattern F05 used.

No existing table, column, policy or function other than those two is changed. No F11 column is added to Task, Goal, System, Event,
Member, Child, Person or Capacity. `sync_pull`, `log_row_change`, claim and bootstrap are generic and unchanged. A Focus created before
an account is bound reaches the cloud through the ordinary post-binding seed, like every foundation kind the claim does not carry.

### Cut-line decisions recorded at M1

- **Me Now** (brief): V1 shows only items explicitly linked to a Focus. `scope = 'personal'` is a PRIVACY scope, not a life-domain
  classification, and no truthful general "about me" classification exists → MP-11-01.
- **Goal link**: supported in domain, schema and sync; no user path exists because the product has no Goal surface → MP-11-04.
- **Recent Progress**: completed linked Tasks, and a linked Goal's recorded `completed` observation; System step completion is NOT
  PRESENT in the canonical model → that source is SAFE-UNAVAILABLE.
- **Talk It Out → RebuildFocus**: PENDING WAVE 3 INTEGRATION; the interpreter is not modified.

Mini-gate after M0/M1: `feature/11-me-rebuild-os` @ `8e770a2`; working tree: M2 work in progress (uncommitted), nothing else.

---

## F11-M2 — Local model, commands, persistence, lifecycle

### What was built

| File | Role |
|---|---|
| `src/domain/rebuild/schema.ts` (new) | `RebuildFocusSchema`, `RebuildFocusLinkSchema` (strict; trimmed title 1..200; optional trimmed note 1..500; `state` active/paused/archived; `scope: 'personal'`; target `refOf(['task','goal','system','event'])`; `next_action ⇒ task`). |
| `src/domain/rebuild/commands.ts` (new) | Pure transitions: `addRebuildFocus`, `renameRebuildFocus`, `setRebuildFocusNote`, `pauseRebuildFocus`/`resumeRebuildFocus`/`archiveRebuildFocus` (`setRebuildFocusState`), `linkToFocus`, `unlinkFromFocus`, `addNextStep`; `focusInputProblem` for forms. |
| `src/domain/rebuild/read.ts` (new) | `orderedFocuses` (Addendum K), `liveLinksOf`, `openNextActions` / `hasOpenNextAction` (only a live `next_action` link to an `open` Task counts). |
| `src/domain/state.ts` (shared) | `AppState.rebuildFocuses` (max 200) and `AppState.rebuildFocusLinks` (max 5000), both `.default([])`; integrity: unique ids, link → existing Focus, link → existing typed target, one live link per (Focus, target). |
| `src/state/initialState.ts`, `src/data/seed/demoHousehold.ts` (shared) | the two empty collections in the typed literals. The demo household seeds NO Focus (it seeds no Goal either), so demo mode shows the V1 empty state. |
| `tests/support/legacyShapes.mjs` (shared test infrastructure) | `V4_ROOTS` gains the two F11 roots, so a "what v1–v3 stored" fixture derived from the live shape does not carry them. |

**Persistence without an envelope bump.** The two collections are `.default([])`, the precedent F08 set for `MealPlanEntry.slot` and
`status`: a household saved before F11 still validates as envelope v4 and loads with no Focuses (tested). `src/persistence/**` is
untouched.

**Shared-file changes, each with its reason** (for the Wave 3 integration review; F11 did not edit the F08 scan's allowlist):
`src/domain/state.ts` (the two roots + integrity), `src/state/initialState.ts` and `src/data/seed/demoHousehold.ts` (typed literals),
`tests/support/legacyShapes.mjs` (historical-shape fixture plumbing).

### Tests — `tests/rebuild/focus.model.test.mjs` (17 tests, 6 suites; 17/17)

Title-only Focus valid and creates no Task/Goal/System/Event/link · no score/progress/streak/priority/completion field, no
completed/failed/behind/abandoned state · trimmed storage, blank refused, note bounded at 500 · duplicate titles allowed, replayed save
of one id is one Focus · demo household → `demo-seed` · rename keeps id, links and linked Task · note set/change/clear · PAUSED DOES
NOT MEAN FAILED (Task stays open, links untouched) · ARCHIVED DOES NOT MEAN FAILED (kept, off-surface, history kept, resumable) · TASK
COMPLETED DOES NOT MEAN FOCUS COMPLETED; completed and archived Tasks are inert for "open next action" · Addendum K order · link
validation (next action must be a Task; missing target; archived Focus; duplicate) · unlink is `removed`, nothing else changes ·
load-time integrity refuses orphan/dangling/duplicate links · relaunch through the real store + in-memory storage recovers the same
Focus · a pre-F11 save loads with no Focuses · pause / rename / archive each survive relaunch while the Task stays open.

### Test accounting (M2 checkpoint)

```
tsc --noEmit                               -> exit 0
full app suite (serial)                    -> ℹ tests 2831  ℹ suites 620  ℹ pass 2825  ℹ fail 6   (before the legacyShapes fix)
legacyCatalogRemediation + persistence + migrationV3ToV4, after the fix -> 79/79
```

The four transient failures were one cause (the historical-shape helper did not strip F11's new roots, so the FROZEN v1–v3
validators correctly refused the "legacy" fixture); fixed in the fixture helper, not in any validator. The remaining two failures are
the pre-existing F08 scan tests (ENTRY).
