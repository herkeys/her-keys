# Her Keys Premium — Stage 1, Milestone D: Momentum Foundation

Status: **source-validated** (see the ledger for the four evidence levels). Longitudinal pattern intelligence is **not** activated.

Momentum measures **mental load removed**, not tasks completed. In Stage 1 it is a *truthful, real-data-capable weekly review* and the
data foundation beneath it. It says only what recorded evidence supports, and it says "not enough yet" when that is the truth.

## 1. What it reads (reuse, not new storage)

| Source | What Momentum takes from it | Owner / scope |
|---|---|---|
| `state.observations` (append-only `BehaviorObservation`, ADR-026) | completed / deferred outcomes of tasks, needs-me items, One Moves, routines ("system"), responsibilities (accepted / completed) | the household's own records; `scope: personal` |
| Premium decision ledger (`premium_decisions`, feature `daily_load_premium`) | which moves she approved, declined or undid | the deciding account (RLS: ownership only) |
| `state.patterns` | only a pattern **she confirmed**, to reach `established` | the household's own records |

It creates **no new durable domain type and no migration.** A saved review is a ledger receipt (§7).

Deliberately not read in v1: Google Calendar events (not in app state), event reschedules, capture accept/decline, goals, meals, free-text of any kind.
Each of these has no honest reading as "load removed", and the review says plainly that it cannot see outside calendars.

## 2. Do not double count

**One real thing is one event.** Observations dedupe by id; a decision phase dedupes by decision id and phase.

**A suggestion she approved is not a postponement she made.** When she approves a Premium Daily Load move to a *later* day, the task system
correctly writes a `deferred` observation (the task did move later). Counting it as her postponing would (a) blame her for a move Her Keys
proposed and (b) count one move twice. So each applied decision **claims at most one** matching observation, and a claimed observation is
reported only as the decision. A match requires: same task, the same starting day, the same destination day, and the observation falling inside
the decision's life widened by a 10-minute clock-skew allowance; the observation nearest the apply time wins; one observation is never claimed
twice. A move to an *earlier* day writes no observation, so the decision alone is the record. An undone suggestion is reported as undone, not as a win.

If the receipts cannot be read, **the review is not built** (§6): attributing without them would be guessing.

## 3. Windows

* **Reporting period:** seven logical days ending today, inclusive (the household's logical day, in its time zone). The actual dates are always shown.
  Rolling, not calendar-aligned, so a review is never empty on a Monday and never a partial week.
* **Comparison period:** the equal-length period immediately before. Shown **only** if that period also had enough history; otherwise the review says so.
* **Pattern lookback:** 28 days ending today (four occurrences of any weekday).
* Records dated after today never enter a review. A later "reopened" cannot un-finish what was finished.

## 4. Counts (and nothing else)

Distinct tasks finished (a completed-then-reopened task is not finished; finishing twice is once), items done, One Moves, routines done / skipped /
missed, tasks she moved to a later day (and how many times), tasks finished that she had put off before, suggested changes approved (net of undone),
undone, declined, and handoffs accepted / completed. A zero count is never mentioned. Nothing is rated, scored, ranked or called an improvement.

**No time estimate exists.** There is no defensible calculation of "time recovered" from these records, so none is made, and the copy audit pins the
absence of hours, minutes saved, conflicts "prevented", scores, percentages, streaks and praise. If a future stage adds an estimate it must be labelled
as an estimate and carry its method.

## 5. Evidence confidence

| Tier | Meaning | Grounded in |
|---|---|---|
| (none) | one occurrence is an event, never a pattern | < 2 independent sightings |
| `possible` | seen twice | 2 independent sightings |
| `likely` | seen on 3+ different days | **3** independent sightings — the *existing* promotion rule for an inference (`reasoning/confidence.ts` `promoteConfidence`); Momentum calls that function, it does not restate the number |
| `established` | she confirmed it | only a `confirmed` entry in `state.patterns` that matches; **no count of sightings ever reaches it** |

"Independent" is the existing `independentCorroborations`: two postponements by one producer on one logical day are **one** sighting; rows from one
source artifact are one. Two pattern kinds exist: *repeated postponement* (the same task moved again and again) and *weekday slippage* (≥ 2 different
tasks planned for the same weekday were moved on ≥ 2 different dates — a single task moved repeatedly is reported once, as the task pattern).
Every pattern carries its sighting count, first and last day, and the ids of the observations it stands on (capped at 10).

## 6. Insufficient history

A review is **withheld** unless the period has ≥ **5** recorded things on ≥ **3** different days. Below that, the sheet shows what exists so far and what a
review needs, e.g. "So far there is 1 thing recorded across 1 day. A review needs at least 5 things across at least 3 different days." It makes no
accomplishment up. This state is answered **locally**: no authorization is requested and no quota is used. A week with nothing in it costs nothing.

The numbers 5 and 3 (and the 28-day lookback) are **product judgements, not measurements** — the smallest values that avoid calling noise a finding.
They are named constants (`THRESHOLDS`), each has a boundary test, and they are open to the owner as **OD-P1-09**.

## 7. Authority, ownership, saved reviews

* **Premium gates new analysis, never access to stored data.** Opening a *new* review calls the single server authorization boundary (`momentum_report`;
  entitlement, quota, ownership). A refusal exposes no report and writes nothing.
* **Saved reviews** are ledger decisions of kind `momentum.weekly_review`, state `applied`. The snapshot holds aggregate counts, each pattern's tier and
  sighting count, and **typed references** (`{kind:"task", id}`) — never a title, note, amount or observation content. Titles are looked up in the household's
  *current* records when shown; a review reopened after an item was deleted says "An item you've since removed". A snapshot must pass the same strict
  schema the reader enforces and fit the 4,000-byte column, otherwise it is not written.
* **Readable without a subscription.** RLS on `premium_decisions` is ownership-only; a saved review stays readable after Premium expires. A card appears for an
  account that has Premium **or** already has saved reviews; a Free account with none sees nothing (no standing upsell on Today).
* **Isolation.** Everything is keyed to the bound account's household; an account switch drops the open review and the saved list. Another household's
  receipts never enter a review or a list.
* **Next step.** At most one, offered only at `likely` or stronger: "look at *this repeatedly moved item*". Approving **records her choice** as a ledger
  receipt (`momentum.next_step`, under the review's own authorization) and changes nothing in her household. Momentum never moves, completes or deletes anything.
* **Replay.** One review key per household per day (`momentum-week-<today>`): reopening is a replay, never a second charge; a receipt from the first open of the
  day is kept as-of that time and an interrupted save is finished on the next open.

## 8. Privacy, retention, deletion

* The Momentum computation reads only the household's own records and the caller's own receipts. It sends **nothing** to a third party and uses no model.
* Receipts hold counts and typed references only; no content is duplicated into analytics. The service-only metric views count decisions by feature, kind and
  status — no content, no e-mail, no household text.
* **Retention / deletion:** saved reviews are `premium_decisions` rows and follow that table's retention (A0 §9). On account deletion the deleting lifecycle
  (owned by another engineer, **not modified here**) must delete the account's ledger rows; Momentum adds no table that needs a separate rule. **Dependency to
  confirm at integration:** the account-deletion lifecycle's table list includes `premium_decisions`.

## 9. What is not claimed

* No longitudinal pattern intelligence beyond a 28-day lookback; "established" patterns exist only if she confirms them elsewhere.
* No claim about how a week *felt*, no causal claim, no forecast.
* No Momentum report was produced from a real household; every figure in the tests is built through the domain's own writers over fixtures.

## 10. Evidence (source level)

`tests/premiumDomain/momentum.test.mjs` (51: windows, dedupe, attribution, counts, history boundaries, confidence tiers, determinism, snapshot),
`momentumFlow.test.mjs` (23: authorization order, replay, interrupted save, isolation, saved-after-expiry, next step), `momentumUi.test.mjs` (11: rendered card
and sheet, Free / signed-out / account switch), `momentumCopy.test.mjs` (13: forbidden-claims audit). **Mutation: 40 / 40 killed** (see the ledger for the list).
