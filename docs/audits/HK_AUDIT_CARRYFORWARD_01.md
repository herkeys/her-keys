# HK-AUDIT-CARRYFORWARD-01 — reconciling two off-baseline audit branches

**Date:** 2026-09-21
**Base:** `repair/hk-integration-readiness-01` @ `14bd58e` (the shared foundation Wave 2 is built on)
**Branch:** `repair/hk-audit-carryforward-01`

## What this reconciles

Two audit branches were created against the older Build 3 / `main` baseline (`bab9773`) rather than
against the repaired foundation, and existed only on the remote:

| Branch | Tip | Unique commits |
|---|---|---|
| `claude/kids-os-hostile-audit-u5fu69` | `750daff` | 1 |
| `claude/home-os-feature-audit-ig2q1y` | `63ab042` | 2 (`63ab042`, `1e558ae`) |

Neither was reachable from any local branch, so their findings, repairs and tests existed in exactly
one place. Rather than cherry-pick old commits onto a foundation that had moved 70 commits ahead,
each finding was reconciled against the current code by semantics, and only what is still true was
ported. The two original audit ledgers are retained verbatim beside this file as
`KIDS_SURFACE_HOSTILE_AUDIT.md` and `BUILD3_HOME_SURFACE_AUDIT.md`.

## Verdicts

### Kids surface audit (`750daff`) — superseded, except one shared-component finding

`feature/05-kids-os` deleted `src/features/kids/KidsOverview.tsx` and replaced it with a new Kids OS
(~3,400 lines across 19 files). The audit's `childDay.ts` helper and its `KidsOverview.tsx` edits
target a file that no longer exists, so they are **wrong-source by construction**. The *behaviors*
they were about were each checked against the new architecture:

| # | Finding | Verdict | Evidence in the new architecture |
|---|---|---|---|
| K1 | `StatusList` non-pressable rows carry no accessibility label, so label and value reach a screen reader detached | **STILL APPLICABLE** | `src/design/components/StatusList.tsx` — `if (!item.onPress) return content;`. Identical on IR01 and all four Wave 2 branches; the component feeds 7 surfaces. **PORTED.** |
| K2 | The row said `'On the family schedule'` when nothing was on record — asserting coverage Her Keys could not know | **ALREADY SUPERSEDED** | `feature/05-kids-os` `views/KidsHubView.tsx:19-22` selects on a `hasAnyRecords` flag; `copy.ts:227-228` gives `'Nothing recorded yet.'` / `'Nothing coming up is recorded.'`. No coverage-asserting string is reachable from an empty record set (`copy.ts:14-19`, `:75-99`, `:126`). The string `'On the family schedule'` exists nowhere. |
| K3 | No empty state when the household has no children | **ALREADY SUPERSEDED** | `copy.ts:262` `emptyChild`, plus the `noRecords` path above. |
| K4 | A child's day read only events, so a task naming the child was invisible | **ALREADY SUPERSEDED** | `projection.ts:385-402` buckets both `state.tasks` and `state.events` by `subjectMemberId`, normalizes both to one `ItemFact` shape (`:174-250`), merges at `:408-428`, and counts orphan subjects rather than dropping them. |
| K5 | Commitments appeared in raw storage order | **ALREADY SUPERSEDED** | `projection.ts:254-279` — three comparators, each terminated by `ref.id`; untimed sorts last via `+Infinity`, undated via a `LAST` sentinel; `compareText` is locale-free (`identity.ts:15-16`). Pinned by `tests/kids/projection.test.mjs:100`. |
| K6 | Two children sharing display name and age rendered identically | **ALREADY SUPERSEDED — strictly stronger** | `identity.ts:106-122` disambiguates on a *look-alike* name (NFKD, case/accent/punctuation/homoglyph folded), appending `born <date>` and a stable ordinal for same-birth-date twins; identity is `Child.id` throughout (`identity.ts:7-10`, ordering by `birthDate → collisionKey → id` at `:66-71`). Fires whether or not ages match. |
| K7 | `shortDate()` added to `features/today/formatDay.ts` | **OBSOLETE** | Existed only to serve K6. The equivalent always-year-bearing formatter is `bornText()` (`identity.ts:73-76`), complemented by `dayPhrase()` (`time.ts:22-32`). Adding `shortDate()` would duplicate it. |
| K8 | `useHousehold` exposes `birthDate` on children | **OBSOLETE / WRONG-SOURCE** | Existed only to serve K6; the new Kids OS does not read children through this shape. |

### Home surface audit (`63ab042`, `1e558ae`) — every finding still applicable

None of these were touched by the 70-commit IR01 repair, and none by `feature/06-home-os`. Each was
confirmed live by reading the current code, not inferred from commit age:

| # | Finding | Verdict | Confirmation on the current foundation |
|---|---|---|---|
| H1 | Home's row falls back to `"N systems running"` whenever nothing is due today, so it reports a clear house over open household work | **STILL APPLICABLE** | `lifeStatus.ts:110` on `main`, IR01, F05, F06, F07 and F08 alike. `projectDay.ts:64` drops everything undated or future (`if (!due && !timedToday && !plannedToday) continue;`), so a Home category holding only undated work looks empty to `describeHome` and the hub changes the subject. **PORTED.** |
| H2 | `"1 systems running"` — the fallback was never singularized | **STILL APPLICABLE** | Same line. **PORTED.** |
| H3 | The shared `describeTasks` announces overdue work as "due today" | **STILL APPLICABLE** | `projectDay.ts:63` sets `dueToday` from `task.dueDate <= date` — **`<=`**, so it is true for anything overdue — while `daysOverdue` is tracked separately at `:73`. The category's own screen reads the same task and says `Overdue since …` (`features/life/openTaskLabel.ts:9`). The hub therefore contradicted the screen beside it. Affects every category that routes through `describeTasks` (kids, money, home and the generic reading), not Home alone. **PORTED.** |
| H4 | No way to tell "nothing is due" from "nothing exists" | **STILL APPLICABLE** | `openTaskCountsByCategory` existed on no branch. It is the enabling primitive for H1 and counts with the same `status === 'open'` test the lists use, so a count cannot disagree with the list it summarizes. **PORTED.** |
| H5 | `useHousehold` must expose the open counts for H1 to reach the UI | **STILL APPLICABLE** | **PORTED.** Note `feature/08-meals-os` independently edits both `lifeStatus.ts` (`describeMeals`) and `useHousehold.ts` (`upcomingMealsOf`); the two changes are additive and in different regions, but they meet in the same files at integration. |

## What was ported

Onto `repair/hk-audit-carryforward-01`, off IR01 `14bd58e`:

| File | Change |
|---|---|
| `src/domain/taskLists.ts` | New `openTaskCountsByCategory(state)` — open tasks per category in one pass (H4). |
| `src/features/life/lifeStatus.ts` | `LifeStatusInput.openTaskCounts`; new `describeDue(dueToday, overdue)` splitting the two (H3); `describeHome` now takes the open count and prefers her list over a systems count, singularizes one system, and says `'Nothing on your list'` rather than `'0 systems running'` (H1, H2). |
| `src/features/life/useLifeStatus.ts` | Threads `openTaskCounts` through (H5). |
| `src/store/useHousehold.ts` | Exposes `openTaskCounts` (H5). |
| `src/design/components/StatusList.tsx` | Non-pressable rows are wrapped in `<View accessible accessibilityLabel={…}>`; optional `accessibilityLabel` override honoured for both row kinds (K1). |
| `tests/homeSurfaceAudit.test.mjs` | The audit's regression suite, ported (17 tests). |
| `tests/design-system/components/primitives.test.mjs` | Two new `StatusList` accessibility tests (K1). |
| `tests/categories.test.mjs` | Harness updated for the new required input. |
| `docs/audits/BUILD3_HOME_SURFACE_AUDIT.md`, `docs/audits/KIDS_SURFACE_HOSTILE_AUDIT.md` | The two original ledgers, retained verbatim. |

### New user-visible copy introduced

These are product-visible strings and were approved by the owner as part of authorizing this
carry-forward:

- `"N on your list, nothing due"` (Home, open work with nothing due)
- `"Nothing on your list"` (Home, genuinely empty — replaces `"0 systems running"`)
- `"1 system running"` (singular form)
- `"N things overdue"` / `"1 thing overdue"` / `"N due today, M overdue"` (overdue split)

### One deliberate adaptation, not a blind cherry-pick

The audit's `'a single system is not announced in the plural'` test hand-built a `HouseholdSystem`
in the old `main` shape. `HouseholdSystemSchema` is now a `z.strictObject` requiring
`subjectMemberId`, the system facet fields and `provenance`, so the literal was rebuilt in the shape
the rest of the suite uses (`tests/support/provenance.mjs`). This is a fixture correction; the
assertion it guards is unchanged.

## Evidence

| Gate | Baseline (IR01 `14bd58e`) | This branch |
|---|---|---|
| `tsc --noEmit` | clean | clean |
| Test suite | 975 tests / 975 pass / 207 suites | **994 tests / 994 pass / 213 suites** |

No test was skipped, weakened or deleted. The `+19` are the 17 ported Home regression tests and the
2 new `StatusList` accessibility tests.

## Status and what is deliberately NOT done

This branch is **not merged and not integrated**. It exists so the shared foundation tip does not
move under the four Wave 2 feature branches, which remain at their certified SHAs
(`aed55a7`, `46b4d19`, `5e8c81a`, `9e11ab2`). Landing it is an integration-time decision for the
owner, who should expect the `lifeStatus.ts` / `useHousehold.ts` meeting point with
`feature/08-meals-os` noted under H5.

No Wave 2 audit was performed here, and no Wave 2 feature was modified.

### Incidental observation, not acted on

While confirming K5 against the new Kids OS, `compareUpcoming` (`feature/05-kids-os`
`projection.ts:254-267`) was noted to compute `startMs(a) - startMs(b)` where both operands can be
`+Infinity`, yielding `NaN`. The result is still deterministic — `NaN` is falsy and falls through to
the `ref.kind` / `ref.id` tie-break — so ordering is correct, but the comparator relies on that
rather than stating it. Recorded for the owner; **not** changed here, since `feature/05-kids-os` is
out of scope for this session.
