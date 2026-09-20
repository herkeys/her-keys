# B4-INGESTION-LOCK — the ingestion and reasoning contract

| | |
|---|---|
| Purpose | Freeze the product-intelligence ingestion and reasoning contract before backend implementation begins consuming it |
| Status | **FROZEN FOR IMPLEMENTATION** (2026-09-19) |
| Authority above this | SD4 (**CLOSED**), `BUILD4.md`, `BUILD4_PHASE0_CHECKPOINT.md`. This contract never overrides an SD4 or B4-P0 decision |
| Versioned by | Git commit SHA. This document is authoritative at the commit that contains it |
| Not | A new SD4 decision. No SD4 register row is created, reopened or renumbered by this work |

Naming: this workstream is **B4-INGESTION-LOCK**, never "Phase 4" — that label collides with existing Build 4 phase numbering.

---

## 1. The canonical funnel

```
USER EXPRESSION
  -> INTERPRETATION
  -> STRUCTURED DOMAIN STATE
  -> PROVENANCE / CONFIDENCE / SCOPE
  -> REASONING
  -> RECOMMENDATION OR CANDIDATE ACTION
  -> APPROVAL / AUTONOMY GATE
  -> DURABLE MUTATION
  -> FUTURE REASONING / SYNC
```

This is a **semantic contract**, not a type hierarchy. Her Keys already models these stages as concrete domain records, so no universal wrapper was introduced. The primitives added here (`src/domain/reasoning/`) are the smallest shared vocabulary the funnel actually needs: they classify and derive from existing records rather than re-modelling them.

**No stored shape changed.** Local persistence stays at `CURRENT_SCHEMA_VERSION = 2`. Local v3 is deferred (B4-P0-060/061) and this pass did not implement any part of it.

---

## 2. Surface trace matrix

| Surface | Input source | Current output | Domain type | Persistence | Owner / scope | Subject | Provenance | Confidence | Consumer | Sync expectation | Gap |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Onboarding | Catalog option taps | `goalIds` / `strengthIds` / `struggleIds` | `Onboarding` | `appState.onboarding` | personal | — | `onboarding` (derived) | n/a — stated | Operating Profile, routing | yes | **no gap** |
| Operating Profile | Onboarding answers | Framed hypotheses | `OperatingProfile` | **never persisted** | personal | — | `ai-inference`-class | `possible` (hardcoded) | Preview screen | never | **no gap** — correctly recomputed (B4-P0-003) |
| Talk It Out | Free text + scripted options | Conversation + structured answers | `ConversationState` → `DiscoveryRecord` | `appState.discovery` | personal | — | `talk-it-out` | `WorkingHypothesis.confidence` | Discovery replay | yes (structure only) | **closed this pass** — boundary was implicit |
| Today | Domain state | Rendered day | projections | — | mixed | — | derived | — | UI | n/a | **no gap** |
| Tasks | Capture screens | `Task` | `Task` | `appState.tasks` | any | `subjectMemberId` | `user-action` | n/a | Daily Load, One Move | yes | **no gap** |
| Events / calendar | Capture screens | `CalendarEvent` | `CalendarEvent` | `appState.events` | any | `subjectMemberId` | `event.source` + `origin` | n/a | Daily Load | yes | **no gap** |
| Daily Load | `projectStateDay(state, today)` | Issues + tier | `DailyLoadIssues` | **never persisted** | personal | — | `system-derived` | — | Today, One Move | never | **no gap** — canonical input verified |
| One Move | `projectStateDay` + `state.needsMe` | Decision per logical day | `OneMoveRecord` | `appState.oneMoves` | personal | target id | `system-derived` | — | Today | yes (SD4-016/017) | **no gap** |
| Discovery | Talk It Out | Structured answers | `DiscoveryRecord` | `appState.discovery` | personal | — | `talk-it-out` | — | Replay | yes | **no gap** |
| Needs Me | Capture | `NeedsMeItem` | `NeedsMeItem` | `appState.needsMe` | personal | — | `user-action` | — | One Move | yes | **no gap** |
| Household categories | Starters + `addCategory` | `HouseholdCategory` | same | `appState.categories` | per-category scope | — | `systemRole` distinguishes starter from hers | — | Everything | yes | **no gap** |
| Household systems | Demo only | `HouseholdSystem` | same | `appState.systems` | any | — | `demo-seed` | — | — | yes | **no production producer** (known, HR-07) |
| Meals | Demo only | `MealPlanEntry` | same | `appState.meals` | any | — | `demo-seed` | — | — | yes | **no production producer** (known, HR-07) |
| Member / child context | Demo only | `Child` | `Child` | `appState.children` | child | self | `demo-seed` | — | Kids overview | yes | **no production create path** (known, B4-P0-066) |
| ActionRecord | Daily Load approvals | Append-only ledger | `ActionRecord` | `appState.actions` | personal | `targetId` | `user-action` (decision) | — | Undo, audit | yes, insert-only | **no gap** |
| Demo household | Seed | Full fixture | all | `origin: 'demo'` | — | — | `demo-seed` | — | Dev only | **never** (B4-P0-010) | **no gap** |
| Real household | First launch | Empty + 8 starters | all | `origin: 'empty'` | — | — | derived | — | Everything | yes | **no gap** |

---

## 3. Information semantics

`src/domain/reasoning/semantics.ts`. Applied **only where the distinction changes behavior** — no record is forced to carry a label it does not need.

| Kind | Semantic | Why |
|---|---|---|
| event, task | `commitment` | Time already given away, or intent not yet spent |
| needsMe, discovery, onboarding struggle | `observation` | Something noticed, not yet concluded |
| onboarding goal | `goal` · strength | `fact` |
| category | `preference` | How this household chooses to organise |
| oneMove | `recommendation` | Proposed, not decided |
| operatingProfileInsight | `inference` | Worked out on her behalf |
| actionRecord | `decision` | She approved or declined |
| talkItOutMessage | `conversation-only` | Never durable |

**Two rules enforce the funnel:**

- `mayMutateDurableState()` — `inference`, `pattern` and `conversation-only` may **never** mutate durable state on their own.
- `requiresApproval()` — `recommendation`, `inference` and `pattern` must pass the approval gate first.

**An AI/model inference may never become a user-confirmed fact merely because it was persisted.** That is enforced in code, not convention (section 4).

---

## 4. Confidence

Vocabulary is unchanged and not re-invented: **`possible` · `likely` · `established`** (`src/types/onboarding.ts`, HER_KEYS_PRODUCT.md §15).

**THE CONFIDENCE PROMOTION BOUNDARY is `promoteConfidence()` in `src/domain/reasoning/confidence.ts`.** It is the only function permitted to return a level higher than the one it was given. Everything else — persistence, hydration, sync, rendering, recomputation — passes confidence through unchanged.

| Rule | Mechanism |
|---|---|
| Persistence never promotes | The function takes **no storage parameter**; a round trip has nothing to promote with. `confidenceAfterPersistence()` states the identity and is asserted by test |
| Only explicit user confirmation reaches `established` | `userConfirmed` is the sole route. A model, however corroborated, cannot promote its own inference into a stated fact |
| Stated claims promote sooner than inferences | Threshold 1 corroboration if `isUserStated(source)`, otherwise 3 — and an inference still stops at `likely` |
| Confidence never falls here | Retraction is a separate act, not a side effect of weak evidence |
| Unrecognised source fails safe | Treated as not-user-stated, the stricter branch |

---

## 5. Provenance

`src/domain/reasoning/provenance.ts`. Origins: `onboarding · user-action · talk-it-out · system-derived · import-sync · ai-inference · demo-seed`.

**Provenance is DERIVED, never stored.** Every origin this product can currently produce is already recoverable from state we keep — `origin` separates demo from real, `event.source` separates seeded from captured, `systemRole` separates the eight starters from a household's own, and every remaining entity has exactly one producer.

Two reasons this matters:

1. Adding a `source` column to every entity is a **stored-shape change**, and local schema is pinned at v2 until the deferred v3 migration. It was not available to us.
2. A derived answer **cannot drift out of step** with the row it describes.

`import-sync` and `ai-inference` are declared but not yet produced by any code path. They exist so Build 4 sync and the later agents have a name to write rather than forcing a union widening at the moment they land.

No transcript is persisted to provide provenance, and no heavyweight provenance subsystem was built.

---

## 6. Scope and subject

SD4-approved semantics are preserved exactly: `personal · household · child · professional · coparent-shared`.

**A child-scoped durable object must identify the child.** Locally this is `findIntegrityProblems` ("a `child`-scoped record must name a real child"); in the cloud it is the NHR-01 / A2 composite foreign key. **No second child identity representation was created** — `subjectMemberId` is the single representation, and the A2 framework is honored.

Recorded from SD4: the cloud narrows `subjectMemberId` to children only, while Build 3 local integrity permits the adult. No production path writes an adult subject, so no real household is affected; local v3 must narrow `checkSubject` to match.

---

## 7. Conversation / state-mutation boundary

`classifyConversationOutcome()` in `src/domain/reasoning/conversationBoundary.ts` is the explicit, testable line between talking and remembering.

| Outcome | Meaning | Mutates? |
|---|---|---|
| `conversation-only` (`no-topic`) | Unmatched turn, nothing stored | **No** |
| `conversation-only` (`unchanged`) | Same answers re-submitted | **No** |
| `structured-discovery` | Matched investigation | Yes — structure only |
| `clear-discovery` | She left the topic | Yes — clears |

Before this pass the decision lived inside the write function, so *"did that turn change my household?"* could only be answered by reading the implementation. `applyDiscoveryConversation` now delegates to the classifier, so the question is answerable and asserted in isolation.

Talk It Out keeps its **LISTEN → HYPOTHESIS → CLARIFY** architecture. It can already distinguish topic-matched investigations from conversation-only content; the topic catalog is where new categories (task, money, child need, co-parent, work) are added without structural change. **No live AI networking was introduced.** Not every conversation is forced into durable state.

---

## 8. Operating Profile

`buildOperatingProfile()` produces **framed hypotheses, not a flat copy of onboarding answers**: it reframes selections into labelled insights and names what it explicitly does not know (`stillLearning`).

- It is **recomputed, never persisted** — correct under B4-P0-003, and it means an inference can never be read back as stored fact.
- Every insight starts at `possible`. Inference is not hardened into fact.
- User-stated and system-inferred stay distinguishable via `isUserStated()`.

---

## 9. Daily Load / One Move consumption

Both consume **canonical domain state**, verified by trace:

- `dailyLoadDecisions.ts:97` → `projectStateDay(state, today)` → `assessDailyLoadIssues(day.events, day.tasks, …)`
- `loadTier.ts:27` → the same projection
- `oneMove.ts` → `projectStateDay(state, date).tasks` + `state.needsMe`

**No duplicated screen state.** Approved One Move semantics are untouched: logical day, `selected`, `withheld`/`cleared`, completion, conflict evidence. **No SD4 decision was reopened.**

---

## 10. Future framework compatibility

Verified that the frozen contract does not structurally prevent any of these. None was built.

| Future | Compatible? | Why |
|---|---|---|
| Calendar OS | **Yes** | `CalendarEvent` carries scope, subject, commitment, travel and preparation already |
| Kids OS | **Yes** | Child scope + `subjectMemberId` + the A2 cloud invariant. Needs a child create path (B4-P0-066) |
| Co-Parent Logistics | **Yes** | `coparent-shared` scope exists and is owner-only until collaboration is intentionally built |
| Financial OS | **Yes** | Category-scoped; `money` system role already reserved |
| Home OS | **Yes** | `HouseholdSystem` + `home` role |
| Meals OS | **Yes** | `MealPlanEntry` + `meals` role |
| Career OS | **Yes** | `professional` scope + `work` role |

Readiness for **Discovery Agent, Pattern Intelligence, Capacity Model, Momentum Agent** is structural only: the semantics, confidence and provenance hooks exist for them to write into. **No speculative agent implementation was added.**

---

## 11. Intentional non-goals

- No universal wrapper or second type system.
- No live AI or model networking.
- No local schema v3, no stored-shape change, no schema-version bump.
- No heavyweight provenance subsystem, no persisted transcripts.
- No speculative agents.
- No user-visible onboarding question added, removed, reworded or reordered.
- No SD4 decision reopened.

---

## 12. Freeze criteria

| Criterion | Result |
|---|---|
| 0 P0 | **Met** |
| 0 P1 | **Met** |
| Full local validation passes | **Met** — 355/355 tests, `tsc` clean, Expo Doctor 20/21 (patch drift only, unchanged) |
| Contract artifact exists | **This document** |
| Trace matrix exists | §2 |
| Confidence promotion boundary named | `promoteConfidence()`, §4 |
| Conversation/state-mutation boundary explicit | `classifyConversationOutcome()`, §7 |
| Provenance round trip tested | `tests/ingestionReasoning.test.mjs` |
| Child subject invariant tested | same |
| Demo/real separation preserved | `isSyncable()`, tested |
| Test-count delta explained | 336 → 355, +19 new, 0 removed |

**B4-INGESTION-LOCK is FROZEN FOR IMPLEMENTATION.** Reopening requires an integration failure, a P0/P1, an unrepresentable product requirement, or explicit owner direction — not preference or elegance.

---

## 13. Owner product-cleanup candidates

Recorded, not acted on. None blocks implementation.

| Candidate | Note |
|---|---|
| `buildOperatingProfile` matches `struggles` on **display labels**, not option ids | `describeUnknown()` switches on strings like `'Financial avoidance'`. Renaming a user-visible label would silently change reasoning. Keying on option id would be a behavioral-visible change and is therefore left for owner direction |
| Systems and meals have no production create path | Carried from SD4 HR-07; they are designed and synced but never exercised |
| Children have no production create path | B4-P0-066, deferred |
