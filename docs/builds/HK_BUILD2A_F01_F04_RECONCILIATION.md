# Build 2A — reconciling the local F01–F04 validation branches

Date: 2026-10-12. Candidate: `integration/build2a-candidate`. Sources: the four **local-only** branches
`validate/hk-ir01-f01`, `-f02`, `-f03`, `-f04` (tips `af7de73`, `6d2b108`, `31d542d`, `9f006ee`, all 2026-09-21).

**Nothing on those branches was modified, moved or deleted.** Every repair below was *ported onto the candidate* as new commits
(`git cherry-pick -x` keeps each original SHA in the message), so the branches remain exactly as their owner left them and can still be compared.

## 1. What the branches are

Each is *the feature's own tip + the shared foundation repairs (IR1–IR7c, IR9/IR9b: HA-009 removed prerequisites, HA-010 duration provenance, HA-011 System
subject, durable sync composition, OD-A) + a few feature-specific adaptation commits*. A `git cherry` against the candidate shows **every shared foundation
commit already present by patch** (they reached the candidate through `repair/hk-integration-readiness-01`), so the only open question was the
feature-specific commits. The F01–F13 convergence (`6cc0d77`) did **not** bring those in, and in several places later *tightened* the same behaviour
(HK13-D12, D19), so a blind cherry-pick would have been wrong in places. Each commit was therefore applied, conflicts resolved by hand against the
candidate's newer structure, and judged by (a) its own tests, (b) the whole affected suite, (c) a mutant that removes the repair.

## 2. Disposition of every feature-specific commit

| Branch | Commit | Disposition | Candidate commit | Evidence |
|---|---|---|---|---|
| F01 | `9f87da8` accept the repaired TaskForm shape (test) | **ALREADY ABSORBED** — the candidate asserts the stricter `{ ...edits, durationSource }` | — | conflict was only the stricter assertion |
| F01 | `1f9c3ba` a removed/archived/missing prerequisite is never "needed" or "done" (HA-009) | **PORTED + RECONCILED** | `4a6441b` | 245 Today tests; see §3 |
| F01 | `5e879bf` a duration is worded as firmly as its provenance allows (HA-010) | **PORTED + RECONCILED** (largely superseded; inferred case is new) | `b616326` | 15 tests; mutant caught (3) |
| F01 | `980686e` the sync notice never says "0 changes" | **PORTED** (clean) | `e954027` | 4 tests |
| F02 | `de38124` `0ed78fd` `b558fed` `67d98fa` account, round-trip, duration, signed-out tests | **PORTED** (tests only, clean) | `19c4980` `94cc5dc` `d022d16` `80254e9` | account 32, round-trip 15, duration 12 |
| F02 | `4735f19` OD-A: an unnamed reading must be named before it is saved | **PORTED** (compat doc dropped) | `47c1637` | OD-A mutation script **6/6 caught** |
| F02 | `791c417` high-stakes wording never goes to Discovery (audit) | **PORTED + RECONCILED** | `3c61aba` | mutant caught (2); see §3 |
| F03 | `77b2f35` acceptance is not coverage while the load still needs her (audit) | **PORTED** (clean) | `32f0a93` | mutant caught (1) |
| F03 | `0a66e53` `432c261` Calendar carries duration knowledge (HA-010) | **PORTED** (clean) | `414d151` `e8522fc` | 34 tests; mutant caught (16) |
| F03 | `d90b4bf` `da6ed42` a gone prerequisite is neither met nor a blocker (HA-009) | **PORTED** (clean) | `0863006` `414f389` | mutant caught (16) |
| F04 | `4106437` accepting a System is not proof the load left (audit) | **ALREADY PRESENT** (`accept(…, true)`, labelled AUDIT W2-04) | — | conflicts were comment-only |
| F04 | `fdbcfbe` fixtures carry the explicit null subject | **PORTED** (clean) | `31f61a1` | — |
| F04 | `b0bcff2` a System names the child it is about (HA-011) | **PORTED + RECONCILED** | `7f74288` | 178 Systems tests; mutant caught (6); see §3 |
| F04 | `30f1c43` `b572c28` second-device round trip; restart before first sync | **PORTED** (tests, clean) | `1603953` `ca905b8` | 7 tests |
| F04 | `67579ef` compat ledger + two tightened assertions | **PARTLY PORTED** — the two test hunks only | `f3dd5b7` | 185 Systems + sync tests |
| all | compatibility records and "re-validated at …" commits (`86f4be6`, `66e8185`, `e1f9b33`, `2706377`, `af7de73`, `f375f13`, `47f831f`, `6d2b108`, `0e4781e`, `c5db473`, `6ad633c`, `daed728`, `31d542d`, `e552fb7`, `9f006ee`) | **NOT IMPORTED** | — | they record counts, bases and debts of a *different tree*; copying them would misstate this one |

## 3. Where the candidate and the branch genuinely disagreed, and how it was settled

* **F01 One Move after a prerequisite goes (1f9c3ba).** The branch assumed the One Move machinery might still *choose* a task whose only prerequisite was removed.
  The candidate's selection (HK13) never offers a blocked task, and a task with only gone prerequisites is `needsReview`, hence blocked. **The candidate's rule was kept.**
  The recovered corpus and test now build the reachable case, a One Move that was *already selected* when its prerequisite went away, and a new test pins that the machinery no
  longer offers such a task. No selection code changed.
* **F01 duration wording (5e879bf).** The branch worded a default or unrecorded duration "as an estimate". The candidate already goes further: such a duration is **not quoted at
  all** (HK13-D12). That stricter silence is now pinned by test. What the candidate did *not* do is mark an **inferred** duration ("about 25 minutes", read from her words) as
  Her Keys' estimate; it quoted it as plain fact. That is the repair that actually landed (card label `ABOUT 25 MINUTES · ESTIMATE` and the reason line).
* **F02 high-stakes routing (791c417).** Real gap: with the Gemini integration, wording flagged high-stakes that also resembled a scripted answer could be routed to
  the Discovery conversation instead of the capture guard. Fixed by passing `highStakes` into the candidate's own `routeMessage` call (the surrounding Build 2 routing was kept).
* **F02 import-boundary test.** "No Feature 02 file imports the account layer" predates Gemini, which gave the Talk It Out context the AI client. The check keeps its force
  and gains one exact exception: `TalkItOutContext.tsx` may take `herKeysAiClient` from the composition root and nothing else.
* **F04 HA-011.** The candidate's foundation already stores `subjectMemberId` on a System (it validates that child scope requires one), but F04's own code still treated a child's
  System as "child not recorded" and always saved `subjectMemberId: null` (the documented MP-02 limitation). The branch's repair uses the foundation field end to end:
  producer, draft validation, scope-follows-subject, view, editor, stale-editor refusal. For the five conflicting test and evidence files the branch's versions were taken, because
  the candidate had only adapted them to the old limitation (nothing unrelated was lost; verified by diffing both sides against the F04 tip).

## 4. Result

* Candidate before: 3,789 tests (in the shared worktree; 3,752 in a fresh clone at the PR #8 head). After this reconciliation the suite grew by the recovered tests; see the EXIT table in
  `HK_BUILD2A_SOURCE_CONVERGENCE.md` for the exact counts on the final SHA.
* Focused suites at the end of the work: Today 245, Talk It Out 341, Calendar 316, Systems + sync 185, all passing, each repair with at least one mutant that fails without it.
* `tsc` clean after every step.

## 5. What remains open (owner)

* The four `validate/hk-ir01-f0N` branches are untouched and still hold their compatibility records and re-validation notes. They can be retired once the owner is satisfied this record is enough;
  Build 2A did not delete them.
* The F01 `OD-01` (removed prerequisite) wording and the F02 high-stakes policy (`OD-2`: such wording is read as nothing) are **recorded behaviours, not new decisions**; this reconciliation
  neither changes nor closes them.
* Live behaviour on a device is not exercised: these are source and scripted-store tests.
