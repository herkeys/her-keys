# Build 3 — Home Surface Hostile Audit

**This is not the Wave 2 Feature 06 audit.** It does not certify
`HK-FEATURE-06-HOME`, and it must not be read as doing so. Why, and what was
audited instead, is set out in §1.

---

## 1. Scope correction — why this is not the F06 audit

The audit was commissioned against Feature 06 — Home OS, at source HEAD
`46b4d19` on branch `feature/06-home-os`, worktree `C:\Users\jsmit\Her-Keys-F06`.
**None of that is present in this repository**, and no part of it could be
reached from the environment the audit ran in.

Verified, not assumed:

| Required by the brief | Found |
|---|---|
| Source HEAD `46b4d19` | `git cat-file -t 46b4d19` → *Not a valid object name*, after `git fetch --all --prune` |
| Last tested HEAD `68f9b87` | *Not a valid object name* |
| Branch `feature/06-home-os` | Absent. `git ls-remote --heads origin` returns exactly `main`, `audit/build1-hostile-initial`, `build/01-core-experience` |
| Worktree `C:\Users\jsmit\Her-Keys-F06` | A Windows path on the author's machine; this audit ran in a Linux container holding a fresh clone of `github.com/herkeys/her-keys` |
| Another repository holding F06 | `list_repos` returns one repository for the account: `herkeys/her-keys` |

The builder evidence in the brief describes a tree this repository is not:

| Builder claim | State of this repository |
|---|---|
| Full app suite 1200/1200 | 29 test files, 336 tests, 73 suites, run by `node --test` |
| Backend harness 826/826 against real PostgreSQL | No backend exists. No `supabase/`, `migrations/`, `backend/` or `server/` directory. The only occurrence of "Supabase" in source is a comment at `src/persistence/appStateRepository.ts:9` noting that such an implementation *could* replace the local one |
| Schema fingerprint `43e7c8a4…/3617`, migration hashes | No schema and no migrations to fingerprint |
| Home mutation check 47/47, inherited 35/35 | No mutation harness in the repository |
| 225 Home additions | Home is one 41-line read-only component and a 10-line route |

Auditing `main` and reporting it as F06 would reproduce precisely the failure
the brief names in Area Q and Area R #18 — a green result from the wrong
checkout. That was declined.

**What was audited instead**, on the instruction of the requester: the Home
surface as it actually exists at `bab9773` (identical to `origin/main`), the
Build 3 state. The hostile method from the brief was applied to it; the areas
that have no counterpart in this tree are listed as NOT APPLICABLE in §9 with
the reason.

---

## 2. Audited source and branch

| | |
|---|---|
| Audited source HEAD | `bab9773226e3b81928af04d5a303596b16502710` (`docs: certify Build 3 at runtime on Android`), identical to `origin/main` |
| Audit branch | `claude/home-os-feature-audit-ig2q1y` |
| Repair commit | `1e558ae` |
| Environment | Linux container; Node 22.22.2; `npm install` from the committed lockfile |

No merge, rebase, squash, amend or force-push was performed. No pull request
was opened. No schema, migration, credential or remote environment was
touched. The branch was pushed at the requester's explicit instruction, to
keep the ledger from being destroyed with the ephemeral container; everything
else stayed local.

---

## 3. What the Home surface actually is

| Piece | Location | Lines |
|---|---|---|
| Home screen | `app/(app)/life/home.tsx` | 10 |
| Home overview | `src/features/home/HomeOverview.tsx` | 41 |
| Shared task list it renders | `src/features/life/CategoryTaskList.tsx` | — |
| Home's Life-hub reading | `describeHome` in `src/features/life/lifeStatus.ts` | — |
| Task list semantics | `src/domain/taskLists.ts` | — |

`HomeOverview` is read-only. It filters `systems` by the `home` category and
renders the shared `CategoryTaskList` for that category. It creates nothing,
edits nothing, and assigns nothing.

Consequently the Home contract in the brief is **largely unrepresented** in
this tree. There is no responsibility model: `attentionFor` returns zero hits
across `src app tests docs`, as do `serviceVisit`, PostgREST and RLS. The
assigned / requested / acknowledged / accepted / covered vocabulary exists
only as prose in `docs/builds/BUILD3_REAL_LIFE_DAILY_LOAD.md`. There is no
service-visit model, no Home recurrence engine, no duration provenance and no
dependency model. Those areas could not be attacked because there is nothing
to attack — recorded in §9, not scored as passes.

What *is* real here is the truth question: **Home's Life-hub row is the app's
reassurance surface.** It is what she reads instead of opening the screen.
That is where the audit concentrated, and where it found defects.

---

## 4. Method

1. Verify the source HEAD (§1).
2. Map the Home domain, projection, store and UI paths by reading them.
3. Build hostile states directly against canonical transitions (`addTask`,
   `completeTask`, `archiveCategory`) and read what each surface renders —
   rather than re-running the existing suite and trusting green.
4. Compare, for every state, what the Home **screen** lists against what the
   Life **hub** claims. Divergence between the two is the defect signature.
5. Repair in-scope defects, pin each with a regression test, then plant
   mutants to prove those tests can fail.
6. Recompute every gate at the final head.

---

## 5. Builder claims reproduced, and disproved

**Reproduced at this head** (against this tree, not the builder's):

- TypeScript clean — `npx tsc --noEmit`, exit 0.
- Suite green — 336/336, 73 suites, at the audited source HEAD.

**Disproved / not reproducible:** every numeric claim in §1's second table.
They describe a tree that is not this one. No builder number is reused
anywhere in this ledger as audit evidence.

**One claim disproved on its own terms.** The builder's position is that the
Home work is covered by tests. The repair in §6 changed three user-facing
strings in `describeHome` and `describeTasks`, and **not one of the 336
existing tests moved.** `describeHome`, `clearCount` and `shownOnLife` have
zero references anywhere under `tests/`. The Home reading was unpinned.

---

## 6. Defects found and repaired

### HOME-AUD-001 — the Home row answers open household work with a count of systems — **P2**

*Area A, K, L. Repaired in `1e558ae`.*

`projectDay` includes a task in today's slice only if it is due, planned or
timed for today. Everything undated or still ahead is absent. `describeHome`
treated that absence as "nothing to say" and fell through to its systems
count:

```ts
const fromTasks = describeTasks(tasks, '');
if (fromTasks.needsAttention || fromTasks.value !== '') return fromTasks;
return { value: `${systems.length} systems running`, needsAttention: false };
```

Proved with three real, open, undated Home tasks in a state that
`validateAppState` accepts:

| Surface | Before |
|---|---|
| `/life/home` (`openTasksInCategory`) | lists all three |
| Life hub Home row | `"0 systems running"`, `needsAttention: false` |
| `LifeStatusSummary` header | `"5 of 5 clear"` |
| Spoken by `StatusList` | `"Home: 0 systems running"` |

The hub reported Home clear while three unresolved household tasks sat on her
list, and changed the subject to systems to do it. Violates *preserve truth*
(decision order 1), *missing ≠ completed*, and the Home contract's "must NOT
claim more than the recorded state supports".

After: `"3 on your list, nothing due"`.

`needsAttention` is deliberately left `false` — nothing is genuinely due, and
the documented contract is that a category "needs you" only when something is
due today. The defect was the claim, not the flag.

### HOME-AUD-002 — `"0 systems running"` — **P3**

*Area L, M. Repaired in `1e558ae`.*

An empty Home rendered a count of nothing, spoken as `"Home: 0 systems
running"`. Now `"Nothing on your list"` — a statement about her list, never
about the house, matching `HomeOverview`'s own `"Nothing home-related on your
list."`. Singular is also fixed: one system is `"1 system running"`.

### HOME-AUD-003 — an overdue Home task announced as "due today" — **P3**

*Area L. Repaired in `1e558ae`.*

`TaskItem.dueToday` is true for overdue tasks as well (`dueDate <= date`).
`describeTasks` counted them together, so a task due `2026-09-01`, read on
`2026-09-16`, produced `"1 thing due today"` on the hub while the Home screen
beside it said `"Overdue since Sep 1"`. The two surfaces contradicted each
other, and the hub understated the position.

Now `"1 thing overdue"`, or `"1 due today, 2 overdue"` for a mix. The
codebase already knew the distinction — `tomorrowPreview.ts:35` filters on
`daysOverdue === 0` — so this aligns the hub with semantics the tree already
held.

**Note on blast radius:** `describeTasks` is shared by the Kids and Money
readings, which are corrected identically. This was judged in scope because
the helper is private to the Life feature file, not shared foundation, and
because Home's reading could not be made truthful without it.

---

## 7. Attacks that held

Recorded as evidence, not as absence of testing. Each is now pinned in
`tests/homeSurfaceAudit.test.mjs`.

- **Archived Home category does not strand work.** With the category
  archived, `hasOwnTaskList` goes false, the row leaves the Life hub, and
  `openTasksWithoutList` picks the task up under "Other open tasks". The
  screen still lists it if reached directly. No disappearing work.
- **A second category claiming the `home` role is refused.** Had it been
  allowed, `categoryWithRole` (a `.find()`) would pick one while
  `hasOwnTaskList` excluded *both* from "Other open tasks" — the second
  category's tasks would be listed nowhere. `findIntegrityProblems`
  (`src/domain/state.ts:420`) rejects it: `duplicate category systemRole home`.
- **Overdue tasks reach the projection.** `projectDay` uses `dueDate <= date`,
  so overdue work is not dropped from today.
- **Tasks planned for a day already past** remain reachable, standing
  `unscheduled`, and are counted on her list.
- **No secrets, no client-side privileged access.** Scans for
  `service_role`, `sk_live`/`sk_test`, JWT-shaped literals and private-key
  headers across `src app tests`: clean. No `fetch`, `XMLHttpRequest`,
  `axios` or `createClient(` anywhere in `src/features` or `src/domain`.
- **No sibling-feature imports.** `src/features/home/` imports only
  `react-native`, `../../design/*`, `../../store/useHousehold` and the shared
  `../life/CategoryTaskList`.

---

## 8. Mutation evidence

Eight hostile defects planted one at a time against the repaired tree, each
reverted after; harness restored every file (`git status` clean afterwards).

| # | Planted defect | Caught by |
|---|---|---|
| M1 | Unresolved home work answered with a systems count | unresolved work stays visible |
| M2 | Empty Home announces "0 systems running" | unresolved work stays visible |
| M3 | Overdue folded back into "due today" | overdue is not "due today" |
| M4 | Completed tasks counted as open | unresolved work stays visible |
| M5 | Open counts ignore which category a task is in | unresolved work stays visible |
| M6 | Archived category keeps its own task list (work stranded) | work stays reachable |
| M7 | A second category may claim the home role | work stays reachable |
| M8 | A single system announced in the plural | row never claims the house is fine |

**8 / 8 caught. No survivors.**

---

## 9. Areas not executed, and why

Stated plainly rather than scored. None of these is a pass.

| Area | Status | Reason |
|---|---|---|
| B — responsibility / coverage truth | **NOT APPLICABLE** | No responsibility model exists in this tree. `attentionFor` has zero occurrences; no assigned/requested/acknowledged/accepted/covered states are represented in code |
| D — repeats / recurrence | **NOT APPLICABLE** | No Home recurrence model. Recurrence appears only as prose in the Build 3 doc |
| E — service visits / time | **NOT APPLICABLE** | No service-visit model. `serviceVisit` has zero occurrences |
| G — duration provenance | **NOT APPLICABLE** | `Task.durationMinutes` is a plain integer defaulting to 15; there is no provenance field to preserve or promote |
| H — dependencies / readiness | **NOT APPLICABLE** | No dependency or prerequisite model |
| I — sync / durability, second device | **NOT EXECUTED** | Persistence is local `AsyncStorage` only. There is no queue, no sync, no second device and no account switch in this tree. (Local durability and the write queue are covered by the pre-existing `persistence` and `writeQueue` suites, which were not re-derived here) |
| J — real PostgreSQL / RLS | **NOT EXECUTED** | No backend exists to attack |
| P — schema / migration / fingerprint | **NOT EXECUTED** | No SQL schema and no migrations exist |
| Q — Android export, bundle content | **NOT EXECUTED** | Requires an Expo/EAS export this environment cannot perform, and — given §1 — it would prove a property of `main`, not of F06 |
| M — device / TalkBack validation | **NOT EXECUTED** | No device or emulator available. Code-level accessibility *was* audited (§10); no screenshots are offered and none were produced |
| Expo Doctor | **NOT EXECUTED** | Not re-derived; the network egress proxy in this environment blocks `docs.expo.dev`, so the versioned-docs step required by `AGENTS.md` could not be completed either. The repair touches no Expo API — it is pure projection logic in `lifeStatus.ts`, `taskLists.ts` and two hooks — so the risk to this diff is nil, but the gate is recorded as unmet |

---

## 10. Accessibility findings (code-level)

`StatusList` (`src/design/components/StatusList.tsx`) hands a screen reader
`accessibilityLabel={`${item.label}: ${item.value}`}` and nothing else. The
attention dot is a bare `View` and the tint is colour — **neither reaches a
screen reader**. So the row's `value` string is the *entire* accessible
account of the category's state.

That makes every defect in §6 an accessibility defect as well:
`"Home: 0 systems running"` was the complete spoken state of a household with
three unresolved tasks.

After the repair, attention is carried by the words in every case —
`"overdue"`, `"due today"`, `"nothing due"` — and this is pinned. The
punctuation-regression class flagged in the brief (`"Asked Sam , no answer
yet"`) is pinned by a test asserting no space-before-punctuation, no doubled
space, no trailing punctuation and no empty value across six Home states.

Not repaired, recorded as debt: the attention dot carries no
`accessible={false}`, and the `›` chevron is a bare text glyph. Both appear
inert to a screen reader because the `Pressable` supplies its own label, but
neither is explicitly marked decorative.

---

## 11. Performance / density

`openTaskCountsByCategory` is a single pass over `state.tasks` building a
`Map`, deliberately chosen over calling `openTasksInCategory` per category
(which sorts, and would be O(categories × tasks) per render). It is memoized
in `useHousehold` on `state`.

200 open Home tasks project and render a correct count, pinned by test. No
full-collection scan was introduced per edit. No hard performance requirement
exists in this tree and none was invented.

---

## 12. Wave 2 integration candidates

Not repaired here — shared surfaces, recorded for the integration stage.

### WAVE2-CAND-01 — `clearCount` calls a category "clear" on "nothing due today" alone

- **Location:** `clearCount`, `src/features/life/lifeStatus.ts`; rendered by
  `LifeStatusSummary.tsx` as `"{clear} of {statuses.length} clear"`.
- **Evidence:** with two open undated Home tasks, the header still reads
  `"5 of 5 clear"`. Confirmed still true after the §6 repair.
- **Affected behaviour:** the word *clear* is doing reassurance work that
  "nothing is due today" does not support, across every category at once.
- **Does Home work around it safely?** Yes, now. The Home row beside it
  carries the truth itself (`"2 on your list, nothing due"`), so the pairing
  no longer reads as "Home is handled". Pinned by test so a change to
  `clearCount` is a decision rather than a drift.
- **Suggested resolution:** decide at integration whether "clear" means
  "nothing due today" or "nothing open", and make the header say which.
- **Severity if unresolved:** P3 — reassurance the record does not support.

### WAVE2-CAND-02 — "systems running" is a claim the record cannot support

- **Location:** `describeHome`, `src/features/life/lifeStatus.ts`;
  `HouseholdSystem` in `src/domain/state.ts:155`; the "Running in the
  background" heading in `HomeOverview.tsx`.
- **Evidence:** `HouseholdSystem` is `{ id, name, description, categoryId,
  scope }`. There is no status, no last-observed date, no evidence field of
  any kind. Nothing in the record establishes that a system is *running*.
- **Affected behaviour:** the word asserts an ongoing household state Her Keys
  has no way to observe — the same family as *scheduled visit ≠ visit
  occurred*.
- **Does Home work around it safely?** Partly. After the repair the phrase
  can no longer stand in for unresolved work, which was the harm. The word
  itself is untouched, because narrowing it is a shared-domain decision about
  what a system record means.
- **Suggested resolution:** either give `HouseholdSystem` an observable state,
  or reword to something the record supports (e.g. "2 systems set up").
- **Severity if unresolved:** P4 — an unsupported claim, now non-load-bearing.

### WAVE2-CAND-03 — an archived Home category leaves the Life hub silently

- **Location:** `categoriesInOrder` (active-only) feeding `deriveLifeStatus`;
  `hasOwnTaskList`, `src/domain/taskLists.ts`.
- **Evidence:** §7. Work stays reachable under "Other open tasks", so this is
  not a disappearance — but the Home row vanishes with no trace, and
  `/life/home` still renders the archived category's tasks if reached
  directly.
- **Does Home work around it safely?** Yes — no work is lost, and this is
  pinned by test.
- **Suggested resolution:** decide at integration whether an archived category
  holding open work should say so somewhere.
- **Severity if unresolved:** P5.

---

## 13. Debt recorded, not repaired

- **HOME-AUD-004 (P5).** When something *is* due, the row reports only the
  due count: one due plus three undated reads `"1 thing due today"` while four
  Home tasks are open. The statement is true and the attention flag is
  correct, so it was left alone rather than widening the repair.
- **Accessibility decorations** — §10, final paragraph.
- **`HomeOverview` renders its "Running in the background" heading even with
  no systems**, giving an empty section. Cosmetic; untouched.

---

## 14. Final gates, recomputed at the final head

| # | Gate | Result |
|---|---|---|
| 1 | TypeScript (`npx tsc --noEmit`) | **clean**, exit 0 |
| 2 | Full application suite (`npm test`) | **353 / 353**, 79 suites, 0 failures |
| 3 | Home targeted suite (`tests/homeSurfaceAudit.test.mjs`) | **17 / 17**, 6 suites |
| 4 | Home mutation suite | **8 / 8 caught**, no survivors |
| 5 | Secret / privacy scan | clean |
| 6 | Direct-network-call scan (`src/features`, `src/domain`) | clean |
| 7 | Sibling-import scan (`src/features/home/`) | clean |
| 8 | Clean-tree check | clean at commit |
| 9–17 | Backend harness, RLS, schema fingerprint, migration hashes, Expo Doctor, Android export, device/TalkBack | **NOT EXECUTED** — §9 |

Baseline for comparison: 336 tests / 73 suites at the audited source HEAD.
The repair adds 17 tests and 6 suites, and changes no existing assertion.

---

## 15. Verdict

**HK-BUILD3-AUDIT-HOME-SURFACE — PASS WITH DOCUMENTED DEBT**

- Three defects found inside the audited scope (one P2, two P3). All three
  repaired, regressed and mutation-checked.
- No open P0–P3 defects remain in the audited scope.
- Three Wave 2 integration candidates recorded, none repaired here.
- Debt recorded in §13.

**Certified audited HEAD:** the commit adding this ledger, on
`claude/home-os-feature-audit-ig2q1y`, with repair `1e558ae` beneath it.

### What this verdict does not say

It does **not** certify `HK-FEATURE-06-HOME`. It does not clear Feature 06
for Wave 2 integration. It says nothing about the builder's 1200-test suite,
their PostgreSQL harness, their schema fingerprint or their Android export,
because none of that was reachable from this environment (§1).

The F06 audit remains **NOT EXECUTED**. To run it, `feature/06-home-os` must
be pushed to `herkeys/her-keys` — or the audit must be run on the machine
holding `C:\Users\jsmit\Her-Keys-F06`. Until then the builder's
*PASS WITH DOCUMENTED DEBT* on F06 stands unverified: neither confirmed nor
disproved.

One finding here does travel, though, and is worth carrying into that audit:
**the Home reading was unpinned.** Three user-facing strings changed and 336
tests stayed green. If F06's 225 Home additions are tested the same way its
Build 3 ancestor was, a green suite is not evidence that Home tells the truth.
