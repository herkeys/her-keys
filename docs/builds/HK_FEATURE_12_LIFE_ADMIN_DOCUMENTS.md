# HK-FEATURE-12 — Life Admin / Documents OS

Branch `feature/12-life-admin-documents`, worktree `C:\Users\jsmit\Her-Keys-F12`, created from
`WAVE3_BASE = 363e473fdf053547a21a41a67b7f62bd9aa2bcdf` (`integration/wave2-f01-f08`). Built independently of the sibling Wave 3
branches F09 (Money), F10 (Work/Career) and F11 (Me/Rebuild): no sibling branch is an ancestor, no sibling code is imported, and no
sibling branch or worktree was modified.

The build brief and its FINAL MANAGEMENT ADDENDUM (the addendum controls where the two differ) define the doctrine. This ledger
records what was actually found, decided and proven, milestone by milestone, written at each milestone rather than reconstructed.

Status vocabulary for scenarios: PASS, SAFE-UNAVAILABLE, NOT-APPLICABLE, DEFERRED-IN-RUN, FAIL. Anything not executed is not PASS.

---

## F12-M0 — Environment + entity privacy + relationship privacy runtime preflight

### Environment gate (recorded before any change)

```
(Her-Keys-W2I) git fetch origin                                 -> (no output)
(Her-Keys-W2I) git status --short                               -> (clean)
(Her-Keys-W2I) git branch --show-current                        -> integration/wave2-f01-f08
(Her-Keys-W2I) git rev-parse HEAD                               -> 363e473fdf053547a21a41a67b7f62bd9aa2bcdf
(Her-Keys-W2I) git remote -v                                    -> origin git@github-herkeys:herkeys/her-keys.git (fetch/push)
(Her-Keys-W2I) git ls-remote origin refs/heads/integration/wave2-f01-f08
                                                                -> 363e473fdf053547a21a41a67b7f62bd9aa2bcdf   (MATCH)
git worktree list (before)  Her Keys 0a893ba [feature/01-today-chief-of-staff]; Her-Keys-F09 77e6dd0 [feature/09-money-os];
                            Her-Keys-F10 363e473 [feature/10-work-career-os]; Her-Keys-F11 363e473 [feature/11-me-rebuild-os];
                            Her-Keys-W2I 363e473 [integration/wave2-f01-f08]
```

`feature/12-*` did not exist locally or on origin, and `C:\Users\jsmit\Her-Keys-F12` did not exist. Created with
`git worktree add -b feature/12-life-admin-documents C:\Users\jsmit\Her-Keys-F12 363e473fdf053547a21a41a67b7f62bd9aa2bcdf`.

### Worktree / dependency safety

- `Her-Keys-W2I`, `Her-Keys-F09` and `Her-Keys-F10` each hold a REAL `node_modules` (352 entries).
- **Anomaly observed, not touched:** the main checkout's `C:\Users\jsmit\Her Keys\node_modules` is an EMPTY real directory
  (last written 2026-09-21 22:13), and `Her-Keys-F11\node_modules` is a junction to it, so F11 currently has no dependencies through
  that link. Neither belongs to F12; nothing was deleted, relinked or reinstalled there. Reported for the owner.
- F12 was given its own real install: `npm ci --no-audit --no-fund` from the base lockfile (583 packages, 352 top-level entries,
  peer-dependency warnings only). No junction into another checkout, so the F05–F07 export trap (route context resolving into another
  tree's `app/`) does not apply. The tree stayed clean (`package-lock.json` unchanged).
- Docker Desktop restarted underneath this session at 18:12 (another session's action; not F12's). F12 waited for the engine and for
  `supabase_db_Her_Keys` to report healthy and did not restart anything.
- A sibling session was running `node supabase/tests/run.mjs 20` (fixed-name `b4_env_*` databases) during M0. F12 therefore runs its
  backend suites in its OWN scratch database, `f12_env`, through `supabase/tests/run-f12.mjs` (same sequence as ENV C: auth stub,
  helpers, baseline, Build 4, IR01, F08, F05, then any `*_f12_*.sql` migration, then test defaults and identity fixtures, migrated
  while empty). The runner refuses any database not named `f12_*`, never touches the default `postgres` database, and drops `f12_env`
  when it finishes.

### Addendum A — prior Wave 3 privacy evidence

Inspected before treating M0 as unknown:

| Sibling | Ledger | Owner-private finding |
|---|---|---|
| F09 Money | `docs/builds/HK_FEATURE_09_MONEY.md` (M1 committed at 77e6dd0) | Row 13: `VISIBILITY_SCOPES = personal, household, child, coparent-shared, professional`; `private.can_access_scoped_row` makes personal/professional/coparent-shared OWNER-ONLY; coparent-shared is the household's most private scope, never a co-parent grant. F09 chose `household` for its own rows and ran NO owner-private runtime proof. |
| F10 Work/Career | none committed | — |
| F11 Me/Rebuild | none committed | — |

So no prior Wave 3 run had PROVEN (at runtime) that WAVE3_BASE has or lacks an owner-private scope. F09's code-level reading is
consistent with what F12 then proved at runtime below (cross-check: AGREES). M0 was therefore executed, not assumed.

### ENTRY test accounting (captured on the clean base, before any F12 file existed)

Command: `npm test` in `Her-Keys-F12` at `363e473`, working tree clean (the two M0 files were parked outside the tree for this run so
the Meals boundary scan, which also reads untracked files, saw the true base).

```
ℹ tests 2814
ℹ suites 614
ℹ pass 2810
ℹ fail 4
ℹ duration_ms 96230
```

The four ENTRY failures, none caused by base code:

| Test | Cause |
|---|---|
| `tests/hk-ir01/syncComposition.test.mjs:842` HA-001 cost | timing budget: one edit in a 5,000-row collection cost 7.991 ms against a 5 ms budget, under host contention (Docker restart + a sibling `run.mjs`). Known flake class ([parallel-worktree-gotchas]). |
| `tests/talkItOutCapture.reader.test.mjs:510` cost | timing ratio: 4x input cost 10.7x (threshold is a quadratic ~16x-class guard), same contention. |
| `tests/meals/boundary.test.mjs:19` [BV1..BV5] | the scan's check G: `feature/09-money-os: shares history with HEAD above the baseline (363e473)`. Wave 3 structure, not code: every Wave 3 sibling forks from the same base. F09 reproduced it on the untouched W2I checkout. |
| `tests/meals/boundary.test.mjs:30` [BM1..BM3] | same finding through the ancestry assertion. |

Backend ENTRY (the known 1028/1028 of the brief) is recorded with the M5 run, where the full harness is executed alone.

### M0 — foundation facts

| Question | Answer (runtime-proven where marked) |
|---|---|
| SCOPE NAME | `personal` (one of `VISIBILITY_SCOPES`, `src/domain/schemaPrimitives.ts:32`). Two server patterns carry it: (1) SCOPED tables (`tasks`, `events`, ...): `scope` + `owner_profile_id`, `tasks_owner_scope_check` makes a personal row carry an owner and a household row carry none; RLS `private.can_access_scoped_row(household_id, scope, owner_profile_id)`. (2) OWNER-PRIVATE foundation tables (`goals`, `dependencies`, `recurrence_rules`, ...): `profile_id NOT NULL`, `scope CHECK = 'personal'`, RLS `auth.uid() = profile_id AND private.is_household_member(household_id)`, uniqueness `(household_id, profile_id, local_id)`. |
| LOCAL REPRESENTATION | A device holds ONE account's state; local rows carry no owner id. Personal scope is explicit on scoped rows (`TaskSchema.scope`, e.g. Systems' `saveDraft` writes `'personal'`) and is the literal type of owner-private core kinds (`NeedsMeItemSchema.scope: z.literal('personal')`). |
| CLOUD REPRESENTATION | as above; the owner is stamped at PUSH time from the bound account (`projection.ts ownerFor(scope, ctx.profileId)` for scoped kinds; `profile_id: ctx.profileId` for owner-private kinds). |
| SYNC BEHAVIOR | `change_log` is a pointer log whose writer (`log_row_change`) stamps `owner_profile_id` from the owner column; its SELECT policy shows a pointer only when `owner_profile_id IS NULL OR = auth.uid()`. `sync_pull` is SECURITY INVOKER, so it returns only the caller's visible pointers; the device re-reads rows under RLS. `sync_push` is SECURITY INVOKER and probes collisions on the table's own uniqueness boundary. RUNTIME-PROVEN. |
| RLS BEHAVIOR | owner: read/write; same-household member: no read, no write, no insert in the owner's name; stranger: nothing, and sync_pull/sync_push naming the other household refused (42501); anon: refused. RUNTIME-PROVEN. |
| SAME-HOUSEHOLD VISIBILITY | none — not the content, not the existence (no row, no count, no change pointer, no pull pointer, including for later edits, removals and purge tombstones). RUNTIME-PROVEN. |

### M0 — synthetic fixture methodology (addendum B/C)

`supabase/tests/78-f12-m0-privacy-preflight.sql`, run by `node supabase/tests/run-f12.mjs 78` in `f12_env`. Built ONLY from existing
primitives, because no F12 table exists yet, in exactly the shape F12 needs:

- owner-private parent record: a `goals` row of USER A (the foundation owner-private pattern F12's LifeRecord will copy);
- owner-private canonical Task: a `tasks` row of USER A with scope `personal`;
- owner-private relationship: a `dependencies` row of USER A (the foundation's ENFORCED typed relationship: one FK column per target
  kind, no `targetKind + targetId`), Task `part_of` record; plus a second private relationship from a HOUSEHOLD-visible Task to the
  same private record, to prove the Task side reveals nothing;
- actors from `helpers/10-fixtures.sql`: USER A (owner of household A), USER B (second adult of household A), USER C (owner of an
  unrelated household), anon.
- All fixture text is synthetic (`M0 PRIVATE PARENT FIXTURE`, ...). The file deletes its own rows at the end so it stays
  self-contained when the whole ENV C set runs.

Result: **36 passed, 0 failed.** Covered: direct table reads (by id, by local id, whole-table counts), direct UPDATE/DELETE (zero rows,
the same answer an absent id gets), INSERT in the owner's name (42501), crafted relationship targets (a link to A's private record is
refused exactly like a link to a non-existent id — same SQLSTATE, same constraint — and the refusal's message/DETAIL/HINT carries no
private title), `sync_push` (owner-keyed uniqueness: B reusing A's local id for an owner-private row gets a fresh row of her own,
`created`, no collision oracle; a relationship pushed in A's name is refused), `sync_pull` from cursor 0 (= fresh-client hydration):
owner receives every pointer, member receives none of the private ones and still receives the household Task, stranger refused,
anon refused; change log for edits, a status removal and a server-side purge tombstone: the owner sees the tombstone, the member sees
nothing.

Test-the-test for M0 (each mutant applied through `HERKEYS_F12_MUTANT_SQL`, never committed):

| Mutant | Result |
|---|---|
| M0-a change_log SELECT shows every household pointer | CAUGHT — 5 checks fail (change_log, per-table count, sync_pull, lifecycle pointers) |
| M0-b relationship rows readable by the whole household | CAUGHT — 2 checks fail |
| M0-c `personal` treated as household-visible in `can_access_scoped_row` | CAUGHT — 3 checks fail |

### M0 — two pre-existing foundation properties, characterised (NOTE lines, not checks)

1. **Known-id FK existence probe.** FK checks bypass RLS. USER B, holding the server uuid of A's PRIVATE Task, can create a
   `dependencies` row of HER OWN pointing at it (ACCEPTED), while a non-existent uuid is refused (23503). This confirms existence of a
   uuid B already holds; it reveals no content and no relationship of A's. B cannot obtain the uuid: it is server-generated
   (`gen_random_uuid`) and never reaches B — no change pointer, no pull pointer (proven above). Pre-existing, Build 4 foundation.
   **F12 closes it for its own link table** (M5: a BEFORE trigger makes "not yours" and "does not exist" the same refusal).
2. **Scoped-table local-id probe.** `tasks` (and every scoped table) is unique on `(household_id, local_id)` across owners, and the
   `sync_push` probe runs under RLS, so B pushing a Task that reuses A's private Task local id gets 23505; a fresh local id is accepted.
   This confirms existence of a guessed local id only. Local ids are `prefix-<epoch-ms base36>-<counter><4 random base36>`, so a
   guess must hit the millisecond, the counter and ~1.7M random values. Pre-existing, Build 4 foundation; applies to every personal
   Task the product already creates. **F12 mitigation:** F12 mints the local ids of the Tasks (and records) it creates with a long
   random component (M3), so an F12-created Task is not practically guessable. Foundation repair (owner-keyed uniqueness for personal
   rows on scoped tables) is registered as `MP-12-01` for Wave 3 integration.

Neither property discloses record content, record existence without a secret identifier, relationship existence, or identifying
metadata through change log / sync projections, which is what addendum B/E require.

### M0 PASS requirements (addendum E)

| Requirement | Result |
|---|---|
| owner-private canonical entity scope exists | PASS — `personal`, both server patterns, runtime-proven |
| canonical Tasks can carry a compatible private scope | PASS — `tasks.scope = 'personal'` with `owner_profile_id`, runtime-proven owner-only |
| private relationship rows can be enforced | PASS — owner-private `dependencies` rows, runtime-proven; F12's link table copies this pattern |
| unauthorized same-household identity cannot infer relationship existence | PASS — no row, no count, no pointer, including from the household-visible Task side |
| sync/change-log does not expose private identifying metadata | PASS — pointers only, owner-stamped, filtered; titles never in a refusal payload |

**F12-M0: PASS.** Proceed to M1.

M0 checkpoint: see the git block recorded with the M0 commit below.
