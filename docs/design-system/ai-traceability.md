# AI / intelligence presentation — traceability (HK-FE-UI-01 §13, K3)

The front end is not a second semantics authority. Every intelligence
presentation pattern maps to a frozen Build 4 durable/domain source; where no
durable counterpart exists, the UI invents nothing (§13 rule). Components:
`src/design/components/intelligence.tsx`. Contract tests:
`tests/design-system/components/intelligence.test.mjs`.

Classification vocabulary (§13): FACT · INFERENCE · RECOMMENDATION · DECISION ·
EXECUTION · OUTCOME.

| UI state/pattern | Durable/domain source | Producer / confidence / action type read | Display treatment | Correction / approval affordance | Class |
|---|---|---|---|---|---|
| `InsightBlock` — “Her Keys noticed…” | `operatingProfileInsight` / `discovery` rows; inference & pattern semantics (`reasoning/semantics.ts`) | producer `ai-inference`; no confidence invented for user-stated rows | Quiet parchment card, 3px plum-left key, explicit “HER KEYS NOTICED” eyebrow. Plum is the one selective AI treatment (owner decision 2) — the register is named in text, never color alone | `onDismiss` (UI-only; durable row untouched) | INFERENCE |
| `RecommendationBlock` — “What I recommend…” | One Move views (`oneMoveForDay`), `requiresApproval()` over the recommendation semantic | One Move = `recommendation` until completed; `approvalRequired: boolean` is the caller's read of the approval policy | Clay action eyebrow “WHAT I RECOMMEND”. Approval-required adds a distinct “NEEDS YOUR YES” marker + primary “Yes, do that”; plain suggestion reads “Do that”. SUGGESTED and APPROVAL-REQUIRED are structurally different (§15) | `onApprove` / `onShowAlternative` / `onNotToday` | RECOMMENDATION |
| `WhyThis` | Structured evidence gathered by the caller from transition windows / capacity facts (`reasoning/attention.ts`, daily-load reason objects) | Short durable-fact statements only; no model transcript, no chain-of-thought (§15) | Neutral dotted list under “WHY THIS” eyebrow | none (evidence is read-only) | FACT |
| `ClarificationPrompt` — “I think this means X. Is that right?” | `Interpretation` rows with `state: 'clarifying'` (`foundation/interpretation.ts`) | `clarification` open-code; interpretation is always `ai-inference`/`import-sync`, never user-stated | The proposed reading sits inside a quiet card introduced as “I think this means:” — a claim, not a fact | `onConfirm` / `onCorrect` | INFERENCE |
| `InterpretationReview` — “What I understood…” | `Interpretation` candidate rows (pending), held outside canonical state until accepted | typed fields passed verbatim by the caller (kind, title, when, amount); component invents no fields | “WHAT I UNDERSTOOD” eyebrow + typed field list on a paper card | `onAccept` (creates the real row with `established`) / `onReject` / `onCorrect` | INFERENCE → DECISION |
| `ConfidenceBadge` | `provenance.confidence` on confidence-bearing rows | `ConfidenceLevel` = `possible` / `likely` / `established` only (`schemaPrimitives.ts`); rendered only when `carriesConfidence(producer)` — never for user-stated facts, never a percentage, never a fourth tier | Soft amber inference tint for possible/likely; confirmation tint for established; uppercase status label | none (displays stored confidence; changes happen via `promoteProvenance`) | INFERENCE (uncertainty) |
| `ProvenanceLabel` | `provenance.producer` on every content row | `PROVENANCE_SOURCES` vocabulary read off the row (`foundation/provenance.ts`) | “You said” / “Her Keys inferred this” / “From Talk It Out” / “Source unknown”… — `legacy-unknown` renders honestly, never as user-stated | none (label of a stored fact) | FACT |
| `ActionStateBlock` — proposed | `ActionIntent` with no decision (`pendingApprovals`, `intentLifecycle().stage === 'proposed'`) | `IntentStage`; intent provenance is Her Keys' (`ai-inference`/`automation`/`system-derived`) | Attention-tinted card, “NEEDS YOUR YES” eyebrow, explicit approval question + “Yes, go ahead” / “No” | `onApprove` / `onDecline` → `IntentDecision` | RECOMMENDATION → DECISION |
| `ActionStateBlock` — approved / attempted | `intentLifecycle().stage` derived from append-only decisions + executions | approved-not-attempted = prepared: waiting treatment “READY — WILL RUN”; attempted = “RUNNING NOW”. A prepared action is never shown as done (§15) | waiting/subtle card, no action buttons | none | DECISION (prepared) |
| `ActionStateBlock` — succeeded (+ outcome) | `ActionExecution.result: 'succeeded'` + latest `ActionOutcome.kind` | OUTCOME_LABEL renders the observed outcome (“DONE — VERIFIED”…) | confirmation/success card | none | EXECUTION + OUTCOME |
| `ActionStateBlock` — failed | `ActionExecution.result: 'failed'` | error class exists on the execution; stage derived | risk card “DIDN’T WORK — NEEDS YOU” — never styled as success | none (repair flows live in the feature, not the pattern) | EXECUTION (failed) |
| `ActionStateBlock` — declined / withdrawn | `IntentDecision.decision: 'declined' | 'withdrawn'` | derived stage | quiet muted card (“YOU SAID NO” / “WITHDRAWN”) | none | DECISION |
| One Move decision ledger (Today, K4) | `ActionRecord` rows (`state.ts`): `approval: 'approved' \| 'declined'` per type | `provenanceOfAction()` → `user-action` / `automation`; completed One Move is the DECISION, the One Move itself stays a RECOMMENDATION (`reasoning/semantics.ts`) | rendered through `RecommendationBlock` + outcome-aware states in K4 | the approve/decline gestures write `ActionRecord` via the existing domain path | DECISION |

## §14 foundation access check — verified before building (K3)

| Required typed access | Where it exists | Status |
|---|---|---|
| Provenance on durable rows | `foundation/provenance.ts` (`Provenance`, `PROVENANCE_SOURCES`, `isUserStated`, `carriesConfidence`) | ✔ |
| Confidence on inference-bearing rows | `schemaPrimitives.ts` `CONFIDENCE_LEVELS` + `provenance.confidence` | ✔ |
| Reasoning evidence | daily-load reason objects, `reasoning/attention.ts`, `reasoning/briefing.ts` aggregates | ✔ |
| Action intent | `foundation/authorization.ts` `ActionIntent`; `pendingApprovals()` | ✔ |
| Intent decision | `IntentDecision`; `DECISIONS` | ✔ |
| Authorization state | `domain/authorization.ts` `intentLifecycle()`, `IntentStage`, `authorityCoverage()` | ✔ |
| Execution record | `ActionExecution`; `EXECUTION_RESULTS` | ✔ |
| Outcome record | `ActionOutcome`; `OUTCOME_KINDS` | ✔ |
| Responsibility state | `foundation/responsibility.ts`; `isActiveResponsibility()`, `unacknowledgedResponsibilities()` | ✔ |

## Recorded gap (per §14 — recorded, not worked around)

Talk It Out is currently a scripted prototype (`src/features/talk-it-out/engine.ts`);
its `confidenceLabel` is an engine-produced display string, and the store layer does
not yet expose every durable line to the view. Components therefore take typed
props only; K5 wires the real rows (interpretations, clarifications) through
without inventing semantics. No parallel UI-only state model was created.
