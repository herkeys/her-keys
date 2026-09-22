# Kids Surface — Hostile Audit

## 0. What this document is, and what it is not

This audit was commissioned as **HK-WAVE2-AUDIT-F05-KIDS**: an independent
hostile validation of a completed **Feature 05 — Kids OS** at source HEAD
`aed55a7` on branch `feature/05-kids-os`.

**That source does not exist in this repository, and the audit as
commissioned could not be performed.** What follows is a hostile audit of the
Kids surface that *does* exist, at HEAD `bab9773`, performed in its place at
the owner's direction.

The commissioned deliverable path was `docs/builds/HK_WAVE2_AUDIT_F05_KIDS.md`.
This document is deliberately **not** filed under that name. Filing a Build 3
Kids audit under an "F05 / Wave 2" title would assert a provenance that is
false — the precise class of error this audit exists to catch. It follows the
repository's own convention, `docs/audits/`, instead.

---

## 1. Audited source HEAD

| | |
|---|---|
| **Audited HEAD** | `bab9773226e3b81928af04d5a303596b16502710` |
| **Subject** | `docs: certify Build 3 at runtime on Android` |
| **Branch** | `claude/kids-os-hostile-audit-u5fu69` (== `main`) |
| **Worktree** | primary checkout; no isolated worktree (see §2) |

### 1.1 Disproof of the commissioned source

The commissioned source was verified as absent before any other work. Evidence:

| Check | Result |
|---|---|
| `git cat-file -t aed55a7` | `fatal: Not a valid object name` |
| `git cat-file -t f77d084`, `54a1df1` | not present |
| `git ls-remote origin` | only `main`, `build/01-core-experience`, `audit/build1-hostile-initial`, `refs/pull/1/head` |
| `git fetch origin aed55a7` | `fatal: couldn't find remote ref` |
| Repository depth | 29 commits, **not shallow** — this is the complete history |
| Reachable repositories | `herkeys/her-keys` only |
| Other checkouts on disk | none |

No isolated audit worktree was created, because there was no distinct source
commit to isolate. The audit ran on the primary checkout at `bab9773`.

### 1.2 Feature 05 substrate: absent

Not one Feature 05 contract identifier exists at this HEAD.

| Probe | Hits |
|---|---|
| `supabase/` directory, any migration | none (directory does not exist) |
| `@supabase/supabase-js` in `package.json` | absent |
| `src/domain/account/claim.ts` | does not exist |
| `/s+/` (the known `cloudDisplayName` defect) | **0** — and there are no whitespace-normalizing regexes at all |
| `durationSource`, `prerequisite`, `readiness`, `HA-009` | 0 each |
| `attentionFor`, `needsMePersonally` | 0 each |
| `sync_push`, `syncQueue`, `household_member`, `cloudDisplayName` | 0 each |
| `acknowledged` | 0 |

**Consequence:** the known `/s+/g` → `/\s+/g` repair could not be verified —
there is no `claim.ts` and no such regex to repair. It remains a Wave 2
integration candidate (§12) but this audit contributes no evidence about it.

---

## 2. Audit methodology

Screens have no renderer in this repository, so behaviour was established four
ways, in descending order of strength:

1. **Executing the real shipped state.** The demo household
   (`materializeDemoState`) was projected through `projectStateDay` and the
   actual Kids row expression was evaluated against it. Every P2 finding below
   was *reproduced*, not inferred.
2. **Pure-function tests.** The repaired projection is a pure module and is
   exercised directly by `tests/kidsSurface.test.mjs`.
3. **Mutation testing.** 11 defects were planted in the repaired code and the
   suite was required to fail on each (§11).
4. **Bundle content verification.** An Android export was grepped to prove the
   repaired copy reaches the shipped artifact and the false copy does not (§10).

Source-text regex assertions were treated as **not** evidence of behaviour —
see finding **AUD-K-006**.

---

## 3. Contracts reviewed

- `HER_KEYS_PRODUCT.md` truth rules, in particular `missing ≠ satisfied`,
  `unknown ≠ PLAN IN PLACE`, and `same name ≠ same child`.
- `src/domain/state.ts` — `ChildSchema`, `findIntegrityProblems`.
- `src/domain/projectDay.ts`, `src/domain/taskLists.ts`, `src/domain/categories.ts`.
- `src/features/life/lifeStatus.ts` (the established pure-projection pattern
  the repair follows).

---

## 4. Builder claims reproduced

| Claim | Verdict | Evidence |
|---|---|---|
| Child identity is id-based | **CONFIRMED** | `ChildSchema.id`; `requireUnique('member id', …)`; no name-keyed lookup anywhere |
| Children are never de-duplicated by name | **CONFIRMED** | no name-based dedupe exists in the codebase |
| Child-scoped records must name a real child | **CONFIRMED** | `checkSubject` rejects `scope: 'child'` without a valid `childIds` member |
| Archiving a category keeps its tasks reachable | **CONFIRMED** | `openTasksWithoutList` + existing test at `build3Audit.capture.test.mjs:111` |
| Household bound of 20 children | **CONFIRMED** | `z.array(ChildSchema).max(20)`; 20-child row test added |
| Baseline suite green | **CONFIRMED** | 336 tests / 336 pass / 73 suites at `bab9773` |

## 5. Claims disproved

| Claim | Verdict |
|---|---|
| "Every Life screen with a task list is wired to its role" test covers the Kids screen | **DISPROVED** — it is a source-regex check that cannot fail when the projection breaks (**AUD-K-006**) |
| The Kids surface is behaviourally covered | **DISPROVED** — `KidsOverview.tsx` had **zero** behavioural test coverage before this audit |

---

## 6. Defects found and repaired

All six are inside the Kids surface's own semantics. All are repaired and
regressed.

### AUD-K-001 — P2 — A child Her Keys knows nothing about was reported as covered

`KidsOverview` fell back to the literal string **`'On the family schedule'`**
whenever a child had no events. That is a positive coverage claim — semantically
`PLAN IN PLACE` — backed by *no state whatsoever*. It fired precisely when Her
Keys held the least information.

**Reproduced on the shipped demo household**, not hypothesised:

```
"Josie, 8"  ->  "Josie's soccer practice"
"Theo, 5"   ->  "On the family schedule"     <-- Theo has no events and no tasks
```

Violates `missing ≠ satisfied` and `unknown ≠ PLAN IN PLACE`.

**Repair:** replaced with `NOTHING_ON_RECORD = 'Nothing today'`, matching the
existing house convention (`describeCommitments`). It reports an absence of
record and claims nothing about the day.

### AUD-K-002 — P2 — Child-named tasks were silently dropped from the child's day

The row filtered `day.events` only. A task naming the child — child-*scoped*,
due today — never reached that child's row. Combined with AUD-K-001, a child
whose only commitment was a task was reported as "on the family schedule".

Reproduced on the demo household: `task-3`, *"Email Josie's teacher about the
field trip form"* (`scope: 'child'`, `subjectMemberId: 'child-1'`, due today),
was omitted from Josie's row.

**Repair:** `childCommitments` reads events **and** tasks that name the child.

### AUD-K-003 — P3 — Same-name children were indistinguishable to the user

`${displayName}, ${age}` renders two children named Josie aged 8 as two
identical rows. Identity was never at risk — keys are ids — but the *user*
could not tell whose day was whose.

**Repair:** when two children would read identically, the row appends their own
birth date (`Josie, 8 (born Mar 4, 2019)`). A household fact, never an invented
ordinal. Residual limit documented as **AUD-F05-D1** (§13).

### AUD-K-004 — P3 — The child's day was listed in storage order, not day order

`projectDay` does not sort; it yields items in insertion order. The row joined
them as-is, so a day could read out of sequence under an "Today" heading. Latent
in the demo seed (which happens to be stored chronologically) and therefore
invisible to inspection.

**Repair:** commitments are ordered by time, untimed work last, with a
deterministic tie-break on title then id.

### AUD-K-005 — P3 — Rows that cannot be pressed were not announced as one statement

`StatusList` attached `accessibilityLabel` only to *pressable* rows. Kids child
rows are not pressable, so a screen reader received two ungrouped text nodes.
With AUD-K-003 unrepaired, two same-name children were indistinguishable to a
screen-reader user even when visually distinct.

**Repair (shared component, deliberately minimal):** a non-pressable row is
wrapped in `<View accessible accessibilityLabel={label}>` using the *same*
`label: value` form pressable rows already used. `StatusItem` gains an optional
`accessibilityLabel` override. No pressable behaviour changed. This touches
shared code and is flagged in §12.

### AUD-K-006 — P3 — The only test naming the Kids screen could not fail

`build3Audit.capture.test.mjs:118` asserts the *source text* matches
`categoryIdForRole\('kids'\)` and `<CategoryTaskList categoryId=`. Every defect
above was present while that test passed. It is a wiring assertion presented as
coverage.

**Repair:** the projection was extracted into a pure module
(`src/features/kids/childDay.ts`) — following the existing `lifeStatus.ts`
pattern — and covered by 28 behavioural tests. The original source check was
left intact and still passes.

### Also found: an empty household renders an empty box

`initialState` creates `children: []` and **no path to add a child exists in
this build**. A real (non-demo) household therefore always rendered an empty
bordered surface beneath a "Today" heading, with no explanation.

**Repair:** when there are no children the screen says *"No children saved
yet."* — factual, and it does not offer an affordance that does not exist.

---

## 7. Repair summary

| File | Change |
|---|---|
| `src/features/kids/childDay.ts` | **new** — pure child-day projection |
| `src/features/kids/KidsOverview.tsx` | consumes the projection; honest empty state |
| `src/store/useHousehold.ts` | carries `birthDate` through for disambiguation |
| `src/design/components/StatusList.tsx` | non-pressable rows are one accessible statement |
| `src/features/today/formatDay.ts` | **+** `shortDate` (year-bearing date) |
| `tests/kidsSurface.test.mjs` | **new** — 28 tests, 8 suites |

No sync architecture, identity system, child removal, child rename UI, tab or
Wave 3 capability was added. The repair is confined to the Kids projection plus
one minimal shared accessibility fix.

---

## 8. Findings by audit area

| Area | Verdict |
|---|---|
| **A. Child identity** | **PASS after repair.** Id-based throughout; same name, same name+age, and same name+birth-date all stay distinct; rename preserves identity and day; no name-based dedupe; 20-child ceiling holds. |
| **B. Post-bind add child** | **NOT APPLICABLE** — no account binding, no sync, and no add-child path exists at this HEAD. |
| **C. Pre-bind → claim** | **NOT APPLICABLE** — no `claim.ts`, no binding. |
| **D. Offline / restart / reconnect** | **PARTIAL / NOT APPLICABLE.** Local-first persistence is covered by the pre-existing suites; there is no network path to attack. |
| **E. Responsibility truth** | **NOT APPLICABLE as specified** — no assigned/requested/acknowledged/accepted/covered model exists. The nearest real defect, a false coverage claim, is AUD-K-001. |
| **F. Prerequisites / readiness** | **NOT APPLICABLE** — no dependency model exists (0 hits for `prerequisite`/`readiness`/`HA-009`). Kids invents none, which is the correct outcome. |
| **G. Duration provenance** | **NOT APPLICABLE** — `durationSource` does not exist. `Task.durationMinutes` carries no provenance at this HEAD. Recorded as a gap, not a defect. |
| **H. RLS / authorization** | **NOT EXECUTED — no backend exists.** No PostgreSQL, PostgREST, policy or grant to attack. |
| **I. Sync composition** | **NOT EXECUTED — no sync layer exists.** |
| **J. Copy / UI truth** | **PASS after repair.** AUD-K-001 was the coverage claim; a mechanical scan now asserts no row emits `covered/handled/confirmed/accepted/acknowledged/safe/plan in place/done`. No child is omitted; category-level Kids tasks without a child remain visible via `CategoryTaskList`. No obsolete sign-in gate exists. |
| **K. Accessibility** | **PASS at code/props level** (AUD-K-003, AUD-K-005 repaired). **Device/TalkBack: NOT EXECUTED** — no emulator or device in this environment. No device evidence is claimed. |
| **L. Performance / scale** | **PASS.** 20 children (schema ceiling) all render with distinct keys. The projection is O(children × commitments) with no nested rescans of state. No queue or hydration chunking exists to regress. |
| **M. Privacy / security** | **PASS.** No secrets, tokens or service-role credentials in source (all scan hits are comments, guard names or test assertions). Kids imports nothing from Talk It Out; no privileged API in client code. |
| **N. Migration / fingerprint** | **NOT EXECUTED — no migrations exist.** The reported 3617→3621 fact movement cannot be checked or refuted here. |
| **O. Android export** | **PASS with content verification** — see §10. |
| **P. Test-the-test / mutation** | **PASS** — see §11. |

---

## 9. Final gates

Run at the final audited head, after code changes stopped.

| # | Gate | Result |
|---|---|---|
| 1 | TypeScript | **PASS** — `tsc --noEmit`, clean |
| 2 | Full application suite | **PASS** — **364 tests / 364 pass / 81 suites / 0 fail** |
| 3 | Kids targeted suite | **PASS** — **28 tests / 8 suites / 0 fail** |
| 4 | Inherited repair suite | **PASS** — included in the full run; no pre-existing test was modified |
| 5 | Backend harness | **NOT EXECUTED** — no backend exists at this HEAD |
| 6 | Kids real-PostgreSQL journey | **NOT EXECUTED** — no database exists |
| 7 | RLS positive/negative attacks | **NOT EXECUTED** — no RLS exists |
| 8 | Migration on fresh DB | **NOT EXECUTED** — no migrations exist |
| 9 | Fingerprint comparison | **NOT EXECUTED** — no schema to fingerprint |
| 10 | Migration hash verification | **NOT EXECUTED** — as above |
| 11 | Kids mutation suite | **PASS** — 11 planted, 11 caught, 0 survived |
| 12 | Inherited repair mutation | **NOT APPLICABLE** — the inherited repair does not exist here |
| 13 | Secret / privacy scan | **PASS** — no secrets |
| 14 | Sibling-import scan | **PASS** — Kids imports only `design/`, `store/`, `domain/`, `types/`, plus the pre-existing shared `life/CategoryTaskList` and `today/formatDay` |
| 15 | Feature-boundary scan | **PASS** — only `app/(app)/life/kids.tsx` reaches into `features/kids` |
| 16 | Expo Doctor | **19/21 PASS. 2 NOT EXECUTED** — both are remote-fetch checks blocked by this environment's network policy (proxy `connect_rejected` for `api.expo.dev:443` and `cdp.expo.dev:443`). `app.json` parses as valid JSON locally. Not project defects. |
| 17 | Android export + content verification | **PASS** — see §10 |
| 18 | Clean-tree check | **PASS** — only the intended files changed; `dist/` is gitignored and was removed |

**Baseline for comparison:** 336 tests / 336 pass / 73 suites at `bab9773`
before any change. Net **+28 tests, +8 suites**, no pre-existing test altered.

---

## 10. Android export evidence

`npx expo export --platform android` → exit 0, one Hermes bundle
(`entry-33b3c497375da69abd1a343ae12a5fc4.hbc`, 5,276,551 bytes). Exit 0 was
**not** accepted as a pass; the bundle's string table was inspected:

| String | Required | Found |
|---|---|---|
| `Nothing today` | present | **PRESENT** |
| `No children saved yet.` | present | **PRESENT** |
| `Nothing kids-related on your list.` | present | **PRESENT** |
| `Kids feeds the same picture` | present | **PRESENT** |
| `born ` (disambiguator) | present | **PRESENT** |
| `life/kids` route | present | **PRESENT** |
| **`On the family schedule`** | **absent** | **ABSENT — correct** |

The repaired copy reaches the shipped artifact and the false coverage claim is
gone from it. The worktree/junction trap described in the brief does not apply:
this is a single checkout with real `node_modules`.

---

## 11. Mutation evidence

Each defect was planted in the repaired source, the Kids suite was run, and the
suite was required to fail. All files were restored afterwards (verified by
`git status`).

| # | Planted defect | Result |
|---|---|---|
| M1 | Restore the `On the family schedule` coverage claim | **CAUGHT** (2) |
| M2 | Child day drops tasks, events only | **CAUGHT** (5) |
| M3 | Commitments matched by display name instead of id | **CAUGHT** (2) |
| M4 | Children de-duplicated by display name | **CAUGHT** (8) |
| M5 | Child day no longer put in time order | **CAUGHT** (3) |
| M6 | Same-name children lose the birth-date disambiguator | **CAUGHT** (2) |
| M7 | Rows keyed by label instead of child id | **CAUGHT** (6) |
| M8 | Row stops announcing its value | **CAUGHT** (2) |
| M9 | Untimed work jumps ahead of the timed day | **CAUGHT** (2) |
| M10 | Non-pressable rows stop being one accessible statement | **CAUGHT** (1) |
| M11 | Empty household renders an empty surface again | **CAUGHT** (1) |

**11 planted, 11 caught, 0 survived.**

Mutants from the commissioned list covering sync, RLS, binding, duration
provenance, prerequisites and account switching were **not planted**: the code
paths they target do not exist at this HEAD. Planting them would have produced
mutants that cannot be applied, and reporting them as caught would be
fabricated evidence.

---

## 12. Wave 2 integration candidates

1. **`cloudDisplayName` `/s+/g` → `/\s+/g`.** Not present at this HEAD; this
   audit contributes **no** evidence. It must still land exactly once during
   integration, and its regression coverage must come from the branch that
   actually carries it.
2. **`StatusList` non-pressable accessibility (AUD-K-005) is a shared change.**
   It affects the Life hub, Today summary and every other consumer. It is
   strictly additive and mirrors the existing pressable behaviour, but any
   sibling branch touching `StatusList` must reconcile with it rather than
   duplicate it.
3. **App-wide empty-state copy convention.** `Nothing due`, `Nothing planned`,
   `Nothing captured`, `Nothing on the calendar`, `Nothing today` all state an
   absence of record in language that can read as a claim about the world. The
   Kids repair adopts the existing convention rather than re-litigating it
   locally. Whether that convention should say *"nothing on record"* is a
   foundation-level decision, not a Kids one.
4. **`categoryWithRole` ignores `status`.** It returns a role's category even
   when archived, while `hasOwnTaskList` requires `active`. An archived Kids
   category therefore lists its tasks on both the (deep-link-reachable) Kids
   screen and "Other open tasks". Nothing is lost; it is a duplication. Shared
   behaviour, not a Kids defect — see AUD-F05-D3.
5. **`projectDay` returns unsorted events and tasks.** Kids now sorts for
   itself (AUD-K-004). Any other consumer assuming day order is at the same
   latent risk. Worth resolving once, at the projection.

---

## 13. P4–P10 documented debt

| Id | Item |
|---|---|
| **AUD-F05-D1** | Two children with an identical name **and** identical birth date produce identical labels. Rows stay distinct (keys are ids) and no ordinal is invented. No household fact remains to separate them; resolving it needs a real distinguishing field, not a label trick. Covered by a test that asserts both halves. |
| **AUD-F05-D2** | No path to add a child exists in this build. `initialState` yields `children: []`, so a real household's Kids screen shows only "No children saved yet." — honest, but the surface is inert outside demo mode. Building the path is a feature, not an audit repair. |
| **AUD-F05-D3** | Archived Kids category duplication (see §12 item 4). |
| **AUD-F05-D4** | A kids-category **event** owned by a parent (demo `evt-2`, *"Pick up Josie & Theo"*) appears nowhere on the Kids screen — the screen lists child-named commitments and category **tasks** only. Not a false claim, but an omission. Surfacing it changes what the screen is for, so it is recorded rather than built. |
| **AUD-F05-D5** | `Task` carries no `durationSource`. Explicit 15 and default 15 are indistinguishable. Not a regression — the field never existed here. |

---

## 14. Verdict

**HK-WAVE2-AUDIT-F05-KIDS — CANNOT BE ISSUED.**

The commissioned subject (Feature 05 Kids OS at `aed55a7`) does not exist in
this repository. No verdict, certification or freeze decision about Feature 05
can be derived from this work, and none is offered. Areas B, C, E, F, G, H, I
and N were not executed for that reason, and the reason is that the code is
absent — not that the checks were skipped.

**In its place — HOSTILE AUDIT OF THE KIDS SURFACE AT `bab9773`:**

> **PASS WITH DOCUMENTED DEBT**
>
> - 6 defects found (2 × P2, 4 × P3), all repaired and regressed.
> - **No open P0–P3 defects** in the Kids surface.
> - 364 / 364 tests pass; 11 / 11 mutants caught.
> - Debt recorded as AUD-F05-D1 … D5.

**This certifies the Kids surface at this HEAD only. It does not certify
Feature 05, and nothing here should be read as clearing Feature 05 to freeze
for Wave 2 integration.**

### Final audited HEAD

| | |
|---|---|
| **Source HEAD audited** | `bab9773226e3b81928af04d5a303596b16502710` |
| **Repair + ledger commit** | *this commit* — `audit: the Kids surface stops claiming a child is covered` |
| **Final audited HEAD** | the branch tip at this commit on `claude/kids-os-hostile-audit-u5fu69` |
| **Tree state** | clean |

A commit cannot name its own hash, so the certified head is this commit's
hash, recorded by `git rev-parse HEAD` rather than embedded above. It is the
sole commit on top of `bab9773`; there is no later documentation-only commit.
