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

Mini-gate after M2: `feature/11-me-rebuild-os` @ `da1b0f7`, working tree clean.

---

## F11-M3 — Focus → canonical Task relationship, relaunch, and the Today seam

No new production code was needed beyond M2's `addNextStep` / `linkToFocus`: M3 is the proof that the relationship behaves as the
contract says across the canonical systems it touches. `tests/rebuild/focus.relationships.test.mjs` (15 tests, 4 suites; 15/15):

| Contract | Evidence |
|---|---|
| **Focus → Task** | Saving a next step creates exactly ONE canonical Task (`scope: 'personal'`, `user-action`, her exact title, the category she chose) and ONE `next_action` link; no Goal/System/Event; the Focus row is not modified; the Focus note is never copied into the Task. Blank step, archived Focus and missing category create nothing. A paused Focus may still gain a step. |
| **Relaunch** | Focus + link + open Task recovered through the real store and in-memory storage. |
| **Today (Addenda F, S)** | `buildTodayView` is deep-equal with and without a Focus (with a note); neither title nor note appears anywhere in its strings; `attentionFor` is identical. |
| **One Move** | One Move decides the day identically with and without a Focus; no record ever targets a Focus. A next-step Task planned for today is shown by Today as a task and selected by One Move as `task` — ordinary rules only. |
| **Capacity** | `projectStateDay` (what Daily Load reads) is identical with twelve Focuses and with none: zero invented minutes. |
| **Focus → Goal / System / Event** | Linking leaves every linked row unchanged and adds no Focus field to any canonical row; a household-visible System stays household-visible under a private link. Goal achieved / abandoned and Event removed leave the Focus exactly as it was; the links remain as history and none counts as a next action. Archiving the Focus touches no Goal, System, Event or Task. |
| **Task invalidation (Addenda N, O)** | Only an OPEN linked next-action Task counts: completed and archived Tasks drop out; a link whose Task is absent is inert (no crash, no count); a Focus-created Task is edited through the ordinary `updateTask`; an unlinked Task is never a next step. |

**Low-energy support**: no F11 energy model. The M4 home may show an existing `alternative_to` Task for a linked next step via the
existing `alternativesTo()`; F11 never creates one.

Mini-gate after M3: `feature/11-me-rebuild-os` @ `7115c6d`, working tree clean.

---

## F11-M4 — Me / Rebuild UI

### Where it lives (Life, not a tab)

- **Route** `app/(app)/life/rebuild.tsx` — one route; `mode` picks the view (home when absent, `new`, `focus`), `id` names the Focus,
  `step=1` opens its next-step form. It sets its own header title (the Co-Parent pattern), so the PROTECTED Life stack layout
  (`app/(app)/life/_layout.tsx`) is untouched. No new top-level tab; the Life hub is not redesigned.
- **Life hub** `app/(app)/life/index.tsx` — ONE fixed row, "Me / Rebuild", value = number of ACTIVE Focuses ("Nothing named yet" /
  "1 focus" / "n focuses"). A count of what she chose, never a score or a nudge.
- **Feature** `src/features/rebuild/`: `copy.ts` (every sentence), `availability.ts` (the gate), `model.ts` (pure projection),
  `RebuildHomeBody.tsx`, `FocusEditorBody.tsx`, `FocusDetailBody.tsx` (pure bodies), `RebuildScreen.tsx` (the only file that knows the
  store and the router; every write is one of the canonical commands).

### The home

- **Gate first** (the Co-Parent / Systems rule, kept as its own copy like theirs): loading, an unreadable household and ANOTHER
  ACCOUNT'S household show no Focus and never the empty state; a session that must not write shows read-only and disables every add.
- **Zero active Focuses (Addendum Q)**: one calm question — "What's one part of your life you'd like to make more room for?" — with
  "Add one Focus" and "Not now". No section headings are drawn. Paused Focuses, if any, stay reachable in a quiet list.
- **Verdict** (factual, deterministic): a step due today or past its own date → "One personal step needs attention today." / "n …";
  otherwise the next dated thing she connected (a step's due date or a linked calendar item) → "Next: {title}, {day}."; otherwise
  "Nothing here needs attention today." It never says a Focus lacks a step (Addendum E), never praises, never warns.
- **Current focuses** in the Addendum K order; each shows its open next steps (with an EXISTING lighter alternative when she recorded
  one) or, when it has none, a quiet ghost button "Add a next step" — an invitation, not an alert, uncolored and uncounted.
- **Needs attention**: only open next steps of ACTIVE Focuses whose own due date is today or past. Paused/archived contribute nothing
  (Addendum M). Omitted when empty.
- **Recent progress**: the latest three factual completions among linked items (completed Tasks, reached Goals), newest first, with no
  time window (Addendum P). Omitted when empty.
- **Paused**: a quiet list, below. **Archived**: not on this surface (PENDING-INTEGRATION — PAST FOCUSES VIEW, MP-11-02).

### A Focus

Title (rename in place), state line (Active / Paused — not shown as current / Archived), the note — shown ONLY here, on her own
Focus — with add/edit/remove; next steps with Mark done (canonical `completeTask`) and Edit (the existing `/task-editor`); "Add a next
step" opens an inline form (step text + "File it under" category chips, defaulting to the first active owner-private-scope category by
the household's own order — a SCOPE, never a name); Connected items (Goal / Routine / Calendar) with Disconnect; "Connect something
already here" (routines; upcoming calendar items, the next 20 — a list length, not a time policy); Pause / Resume; Archive behind a
confirmation ("It stays saved, and it leaves this page. Its steps stay exactly as they are.").

**AFFORDANCE ≠ TASK (Addendum H).** Opening the step form, arriving with it open from the home, and typing all write NOTHING; only
Save runs `addNextStep`, once, with her text. Cancel writes nothing.

**Focus vs Goal (Addendum R)**: the new-Focus form shows two plain lines ("Focus: an area you want to keep visible." / "Goal:
something specific you're working toward."). Nothing classifies what she types.

### Tests — `tests/rebuild/ui.test.mjs` (27 tests; 27/27)

Projection: zero-Focus shape; E (no guilt signal, and no clock — a month later reads the same); verdict order; M (paused/archived
contribute nothing); P (latest 3, newest first, two weeks old still counts; a reached linked Goal counts, an unlinked completion does
not); MISSED ROUTINE ≠ REGRESSION (a missed and a skipped linked System leave home and detail deep-equal); G (an existing
alternative is shown, none is invented); J (the note is in no home/verdict/attention/progress string and not copied to the Task); Me
Now = explicit links only; K; default category by scope not name. Availability: loading / unrecovered / other account never render
the empty question or a Focus title. Rendered: Q; H on the home (tapping only asks to open the form); read-only disables adds; R
(distinction copy, blank refused, title-only accepted); H on the Focus (open → type → nothing; Save → exactly one personal Task with
her words; Cancel → nothing); archive asks first and touches only the Focus; pause / resume / rename / mark-done each run exactly one
command. **T — static copy audit**: every string and every sentence a copy function can form is free of the banned list (healing
journey, better version of yourself, doing great, falling behind, wellness/wellbeing/self-care/personal-growth score, score, streak,
proud, amazing, behind, neglect, should have, fail, journey, heal, therapy, self-care, mood, diagnos, %).

### Test accounting (M4 checkpoint, measured before any M5 change)

```
tsc --noEmit                   -> exit 0
full app suite (serial)        -> ℹ tests 2873  ℹ suites 630  ℹ pass 2871  ℹ fail 2   (the two pre-existing F08-scan tests)
```

Device evidence: this app has no `react-native-web`, so the browser preview cannot render it; an Android emulator pass is decided at
M6 (see "Device evidence").

Mini-gate after M4: `feature/11-me-rebuild-os` @ `cbad348`; working tree: M5 work in progress only.

---

## F11-M5 — Cloud schema, sync, RLS, fresh-client behavior

### No F11-specific sync system

`rebuildFocus` and `rebuildFocusLink` are two more entries in the ONE manifest (`src/domain/sync/foundationSpecs.ts`). Everything
per-kind is derived from it: the cloud table, identity column, allowed operations (`create`, `update`; no tombstone), client-updatable
columns, dependency rank (Focus 2, link 3), the push projection and the pull projection. The queue, push engine, CAS, change cursor,
pull engine, retry, refused-row evidence, account binding and the post-binding seed are the existing ones, unchanged.

Two additive rules in shared sync code, each with its reason:

| File | Change | Why |
|---|---|---|
| `src/domain/sync/clash.ts` | a `rebuildFocusLink` ADOPT rule | Two devices that each connected the same item to the same Focus made ONE relationship; the pulled row adopts the unsent local one instead of producing two live links (the `dependency` precedent). |
| `src/platform/supabaseSyncTransport.ts` | `rebuild_focus_links_live_link_uq` in `DOMAIN_INVARIANTS`; `redactRowValues()` | The unique index is two devices deciding the same slot (domain conflict, not malformed data). PostgreSQL's "Failing row contains (…)" detail would copy a private title/note into sync evidence (Addendum J); the values are dropped, the constraint name kept. This protects every private row, not only F11's. |

### Schema — one additive migration

`supabase/migrations/20260922180000_f11_rebuild_focus.sql` (LF-pinned in `.gitattributes`; sha256
`3f7d711fe05aae9e061472f04bc2bcf8cb36600e9f59f42ecb0f91efa74a5677`):

1. `private.rebuild_focus_link_target_visible()` — BEFORE INSERT on links; runs as the CALLER; looks a task/event/system target up
   under the caller's own RLS; "not there" and "someone else's private row" both answer `23503 rebuild_focus_links: the linked task is
   not available`. REVOKEd from PUBLIC, anon, authenticated.
2. The two tables — GENERATED by `gen-foundation-sql.mjs` into this file's own `f11-tables` / `f11-grants` regions. The generator
   gained a per-spec `migration` key (`LATER_MIGRATIONS`) and `generateLater()`; the Build 4 shipping migration's generated regions are
   byte-identical (`git hash-object` before = after), and `--check` now covers both files.
3. `REVOKE ALL ON TABLE … FROM PUBLIC, anon, authenticated; GRANT ALL … TO service_role;` — nothing relies on a default (Build 4 §9).
   *Found by suite 78 on its first run: without it the stock default privileges had handed `authenticated` table-level
   INSERT/UPDATE/DELETE. Fixed before commit.*
4. `change_log_entity_table_check` re-created with the two tables added (list otherwise identical).
5. `public.sync_push` replaced, same signature; `diff` against the F05 body = one comment line + the two table names.
6. `SELECT private.assert_app_schema_secured();` then `COMMIT`.

### Schema bookkeeping

```
OLD FINGERPRINT   WAVE3_BASE (IR01 + F08 + F05), default-equivalent local database:  3629 facts   96f93f3d46dcf5735e7a0b50996944bf
NEW FINGERPRINT   WAVE3_BASE + F11:                                                   3826 facts   ab23dba46c7b1353917cdbc786231327
EXACT DELTA       +199 / -2
  relations            35 -> 37    (+2   rebuild_focuses, rebuild_focus_links)
  columns             716 -> 755   (+39  17 + 22)
  constraints         681 -> 717   (+37 -1: the old change_log_entity_table_check definition is replaced by the new one)
  indexes             284 -> 300   (+16  5 + 11, incl. rebuild_focus_links_live_link_uq)
  triggers            104 -> 111   (+7   force_id / set_updated_at / log_change on both; target_visible on links)
  policies             85 -> 91    (+6   owner-only SELECT / INSERT / UPDATE on both; no DELETE)
  functions            28 -> 29    (+2 -1: the new trigger function; sync_push's new body replaces its old one)
  privileges.columns  725 -> 764   (+39) · privileges.relations 587 -> 621 (+34) · privileges.effective 310 -> 326 (+16)
  privileges.functions 55 -> 56    (+1)
  5 of 16 dimensions unchanged.
MIGRATION FILE    supabase/migrations/20260922180000_f11_rebuild_focus.sql
```

Derivation (`supabase/tools/f11-fingerprint.mjs derive --write`; artifacts `supabase/tools/baselines/wave3-base-local-fingerprint.json`
and `f11-local-fingerprint.json`): three scratch databases (through F05 without F08 / full WAVE3_BASE / + F11); the shared default
database read-only reproduced the committed F05 baseline exactly (3621, `8bf3c7c6…`), proving both the Node digest and that no session
had moved it; OLD = shared rows + the F08 delta (+8, all additive); NEW = OLD − the two replaced facts + the 199 added. **Every one of
the 201 changed facts names an F11 object** (`rebuild_focus*`, `change_log_entity_table_check`, `sync_push`), and both removed facts
were verified present in OLD. The shared default database was never migrated.

### Results

| Evidence | Result |
|---|---|
| FRESH-INSTALL (ENV A: every migration on an empty surface) | F11 applies; 36 tables; owner-only policies naming `profile_id` on both tables, no DELETE policy; no DELETE and nothing for anon/PUBLIC; `sync_push` still SECURITY INVOKER; the trigger function is not a definer and not client-callable; no `*focus*`/`*rebuild*` column on any existing table. (Run inside the full harness; see exit accounting.) |
| POPULATED-UPGRADE (ENV D: a database already holding households, a claim, tasks and a child) | F11 applies with no abort; every table keeps its row count; every member and task byte-identical; nothing written to the change log; the owner then pushes a Focus through `sync_push` (`created`), a retry answers `already_exists` with no second row, and its change-log entry carries her id; fail-closed assertion passes. |
| RLS attack matrix (ENV C suite `78-f11-rebuild-focus.sql`) | **62/62.** Catalog (RLS on, nothing for anon, no DELETE, no client UPDATE of identity/owner/focus/target columns, no polymorphic id column); owner allowed; typed-reference invariants (next action ⇒ task; type/column mismatch; two targets; no target; duplicate live link; blank/untrimmed title; 501-char note; "failed" state; household scope); same-household B: reads 0 Focuses, 0 links, 0 change-log entries, still sees the shared Task with nothing on it naming a Focus, cannot read A's private Task, write/edit/unlink as A; **a link naming A's private Focus fails exactly like a link naming no Focus, and linking to A's PRIVATE Task answers with the very same error text as a Task that does not exist**; cannot link A's private Goal; may link her own Focus to the shared Task; A cannot see B's Focus or link; unrelated C: reads nothing, cannot write into household A, a crafted cross-household link is refused and nothing is written; anon: reads and writes denied; a hard-deleted shared Task removes the links to it silently and leaves the Focus exactly as it was; sync_push: owner push created, pushing a Focus that names another owner denied. |
| SYNC — app composition (`tests/rebuild/sync.test.mjs`, in-memory cloud, production composition) | **9/9.** Focus + note + private next-step Task + typed link reach the cloud and a FRESH second device reconstructs them by identity with nothing re-queued; a Focus named before sign-in reaches the cloud via the post-binding seed; archive travels and does not resurrect, even after later pulls; pause + rename travel with id and link unchanged; offline create/edit/pause are immediate and durable and reach the cloud on reconnect; a STALE rename never overwrites the newer cloud truth; a REFUSED row becomes evidence that contains none of her words and blocks nothing else; the same item linked on two devices is ONE live link on the device. |
| SYNC — real PostgreSQL / PostgREST / RLS (`supabase/tests/journey-rebuild.mjs`, private stack) | **24/24** (`node supabase/tests/run.mjs rebuild`, gated on no other harness): claim via the real RPC; the Focus row is owner-private with its note; the next step is an owner-private Task; the link is typed (exactly one FK, next_action, owned by her); change-log entries carry her id; queue drained; a fresh device reconstructs Focus + relationship with no outbound work; archive by CAS, Task untouched; archived on B and on a THIRD fresh device; a same-household second member reads no Focus, no link, pulls no F11 change (while still pulling households/members/categories) and cannot edit; an unrelated account reads nothing and cannot plant; the attacks changed nothing. |

### Account-switch isolation and demo

Account switch is the existing binding/quarantine machinery (a household bound to another account is never rendered, uploaded or
merged) plus F11's gate: `rebuildAvailabilityOf(…, { kind: 'boundOther' })` shows no Focus title and no empty state (tested). Focus
data never leaves the owner's local store except to her own cloud rows, and the cloud answers another account with nothing (journey
+ suite 78). Demo mode is ACTIVE: a demo household's Focus is stamped `demo-seed` (tested), and the change observer ignores non-`empty`
origins, so demo Focuses never queue, sync or claim; the demo seed contains no Focus.

### Shared test infrastructure touched (each with its reason)

`tests/foundationSpecs.test.mjs` (20 kinds, 18 of them Build 4; each table checked in ITS migration; change-log/push allow-lists read
from their LATEST definitions, so a later migration must still carry every earlier kind), `supabase/tests/run.mjs` (F11 in ENV A / C /
D, quality checks, 36-table count, the five-migration list, `rebuild` mode, the journey in full runs), `supabase/tests/private-stack.mjs`
(F11 in the private stack's sequence).

### Test accounting (M5 checkpoint)

```
tsc --noEmit                         -> exit 0
full app suite (serial)              -> ℹ tests 2888  ℹ suites 634  ℹ pass 2884  ℹ fail 4
  2 pre-existing F08-scan tests (ENTRY) +
  2 pinned-inventory tests that F11 legitimately changes, then updated with their reason:
    tests/hk-ir01/changeBridge.test.mjs  "29 kinds: 27 pushed"  -> "31 kinds: 29 pushed" (the two F11 kinds are client-written)
    tests/foundationRoundtrip.test.mjs   "a row of every synced kind is present" -> tests/support/richHousehold.mjs now holds a Focus,
                                          its next step and a Goal link (added after One Move is decided), so the lossless round trip
                                          and sync-integration's real-HTTP journey cover F11's kinds too
  rerun of every suite touched by those two changes (round trip, change bridge, acceptance 2/3, all Today suites, token boundary)
                                     -> ℹ tests 304  ℹ pass 304  ℹ fail 0
node supabase/tests/run.mjs 78       -> 62/62 checks passed
node supabase/tests/run.mjs rebuild  -> 24/24 checks passed (gated: no other harness running)
```

### Environment note — parallel sessions

During M5 other sessions (their processes: `supabase/tests/run.mjs`, `run-f12.mjs 78`, `run-f13.mjs --journeys`) were using the same
container and the same private-stack names. One ungated `run.mjs rebuild` of mine started while another session's full `run.mjs` was
running; both recreate `f08_stack` / `f08_postgrest`, so either run may have disturbed the other's journeys. Every later harness run of
F11 was gated on no other harness process (`gated-harness.sh`, polling `Get-CimInstance Win32_Process`). Integration candidate
`HK-INT-W3-HARNESS-ISOLATION`.
