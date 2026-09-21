# HK-HOSTILE-AUDIT-01 — Cross-feature reconciliation

## Reconciliation matrix

| Concern | F01 Today | F02 Talk It Out | F03 Calendar | F04 Systems | Classification | Integration action |
|---|---|---|---|---|---|---|
| Responsibility | Reads canonical holder/state and is conservative about provenance | Produces interpretations, not responsibility acceptance | Repaired accepted-but-still-hers risk | Repaired “said yes” to remain `stillNeedsMe` | ALIGNED after repairs | Preserve `accepted ≠ covered`; reuse one canonical copy vocabulary |
| Recurrence/materialization | Reads attention/dependencies; no run fabrication | Not a recurrence producer | Projects recurrence into planning without claiming completion | Saves definitions and next dates; explicitly no runs/history | ALIGNED WITH LIMITATION | Integration must keep rule, occurrence and completion as different records; do not infer a run from a due date |
| Timezone/logical day | Uses household timezone/logical-day helpers; reported DST bug not reproduced | Stamps instants and uses current conversation context | Dedicated zone/DST projection tests passed | Schedule calculations use the canonical timezone | ALIGNED | Rerun device/runtime DST cases after combining branches |
| Capacity | Describes current load conservatively | Does not claim capacity | Primary projection; default-duration provenance remains unsafe | Step/system durations may remain unknown | OWNER/SCHEMA DECISION REQUIRED | Resolve HA-010 before capacity treats 15 as known |
| Provenance/confidence | Weak provenance weakens briefing language | Separates source artifact, interpretation and accepted fact; exact text session-only | Reads canonical facts but duration-source is absent | Uses canonical provenance for definitions | RECONCILIATION REQUIRED | Add duration estimate provenance; retain session-only source policy unless separately authorized |
| Identity/account | Consumes local canonical state | Can create pre-sign-in source/interpretation state | Consumes/mutates local plans | Can create pre-sign-in Systems | FOUNDATION DEFECT | HA-001 blocks account-backed integration; HA-002 classifier repaired |
| Dependency | Uses removed event as satisfied through foundation | Not primary | Same foundation semantics affect availability/conflicts | Can attach dependencies to definitions | OWNER DECISION REQUIRED | Decide removal vs completion vs edge retirement (OD-01) |
| Lifecycle | Briefing preserves completed/handled history | Interpretation states are explicit and supersession is retained | Preview is ephemeral; accepted action revalidates state | Definition exists without run; removal unavailable | ALIGNED WITH GAPS | Keep unavailable operations unavailable until lifecycle primitives exist |
| Attention | Aggregates risk/needs-me/waiting/handled | Adds unresolved capture attention | Produces conflicts/capacity/needs-place | Produces schedule/responsibility attention | INTEGRATION TASK | Reconcile priority/order and deduplicate the same canonical cause without hiding it |
| Copy | Uses provenance-qualified dependency/decision language | Capture and privacy copy centralized | Repaired responsibility copy; evidence token overstates completeness | Definition/run copy is conservative | RECONCILIATION REQUIRED | Run one integrated copy pass; do not use “handled/running/covered” from weaker states |
| Shared files | Touches `today.tsx`, existing Today cards and new view models | Touches Talk It Out context/screens | Replaces Calendar screen | Replaces Systems route with nested stack | INTEGRATION TASK | Merge deliberately; all four also carry identical audit foundation commits |

## Responsibility

The canonical state supports assignment, acknowledgement, acceptance, return/decline, completion and `stillNeedsMe`. The original F03 and F04 interpretations both collapsed that truth in different directions. Audit commits `77b2f35` and `4106437` restore the same conservative invariant:

> A person accepting responsibility is not proof that the operational load has left her.

F01 already had a provenance-aware responsibility narrative and a regression for accepted-but-still-needs-her. After repair the three consuming features are compatible.

## Recurrence and materialization

Foundation recurrence is a rule definition. `occurrencesBetween`/`nextOccurrence` calculate dates; no canonical occurrence/run is created. F03 can use those dates for planning. F04 can show next schedule and edit/pause/end the definition. Neither may claim a routine ran or completed. The old range guards were a real foundation defect and are repaired; occurrence history remains a product primitive that does not yet exist.

## Timezone and logical day

All branches inherit the same IANA timezone and logical-date utilities. Independent spring-forward/fall-back tests did not reproduce the reported F01 Today defect. The audit does not elevate that lead into a finding. Integration should still execute combined UI/device evidence because JS engine/Intl behavior is runtime-sensitive.

## Capacity and unknowns

F03 is structurally careful with null travel/location/capacity, but every quick-captured task has a numeric duration because foundation writes 15. The value has no source bit, so downstream code cannot be fully truthful. This is not resolvable by wording alone: both local and cloud schemas need to distinguish user fact, default estimate, inferred estimate and unknown (or adopt a smaller explicit contract).

## Provenance, confidence and exact source

F02’s durable SourceArtifact is evidence that input arrived, not a verbatim transcript. Exact input is held only in the session text store. Structured interpretations retain provenance, confidence and lifecycle. No audited UI claimed that the raw words could be recalled after restart, and no logging path containing raw utterance text was found. Durable raw retention remains an owner privacy decision, not an implied requirement.

## Identity, claim and sync

The classifier repair prevents Systems-only and capture-only households from being bootstrapped as empty. It does not complete the integration. Claim only transfers a One Move dependency closure, while ordinary sync is not composed in the production application and the initial namespace contains no work for unrelated local rows. All feature integration must treat HA-001 as a shared blocker rather than independently inventing sync in each screen.

## Dependencies and removed prerequisites

Foundation currently treats a removed event as done, while an archived task is not done. F01 therefore can stop showing a dependency wait that F03 would continue to consider for a task-shaped prerequisite. Existing doctrine does not decide whether removal cancels the obligation, satisfies it, or should retire the dependency edge separately. Integration must not hard-code four different answers.

## Lifecycle and correction

- F01 actions are revalidated against current canonical state before applying.
- F02 interpretation correction supersedes or revises structured readings without rewriting source evidence.
- F03 preview acceptance recomputes against current immutable state identity; its human-facing digest is incomplete evidence (P4) but the acceptance guard itself uses current objects.
- F04 stale editors fingerprint canonical definitions, and unsupported delete/run operations are presented as unavailable rather than fabricated.

## Shared-file collision map

The builder branches are siblings from the exact common fork. Their feature surfaces are mostly disjoint, but integration will collide at:

- route files and root navigation for Today, Life Inbox, Calendar and nested Systems;
- shared state/store tests once the identical audit foundation commits are present;
- Today/daily-load/One Move components touched by F01 versus Calendar concepts introduced by F03;
- canonical responsibility and recurrence copy consumed by F01/F03/F04;
- the single account/sync integration boundary needed by every feature.

No temporary integration merge was committed during this audit.

## Cross-feature readiness

**NOT READY.** Responsibility and recurrence defects found in code were repaired, but HA-001 is an open critical integration boundary and HA-009/HA-010/HA-011 require explicit shared semantics/schema decisions. The feature branches should not each solve these locally.
