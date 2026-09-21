# HK-HOSTILE-AUDIT-01 — Defect register

Audit date: 2026-09-21  
Authority: common fork `5007b0f2e6de34e8ce476fac11a8acd2cf1e69a1`; builder tips F01 `0a893ba`, F02 `57aea41`, F03 `f92d6fb`, F04 `1bbe3e8`.

Status vocabulary: **REPAIRED** means an explicit audit commit exists and the regression passed. **OPEN — STOPPED PATH** means the affected integration path must not be represented as ready. **OPEN — OWNER/SCHEMA** means the product doctrine cannot choose the missing durable semantics.

## Summary

| ID | Sev | Type | Area | Location | Status | Short description | Suggested fix |
|---|---|---|---|---|---|---|---|
| HA-001 | P1 | SYNC | FOUNDATION / all features | `src/store/AccountProvider.tsx:70`; `src/domain/sync/claimSeam.ts:53`; `src/domain/account/accountRuntime.ts:314` | OPEN — STOPPED PATH | A claim can report the account bound while no production coordinator is composed and pre-claim non-closure rows have no outbound work. | Integration must atomically seed all unclaimed syncable rows, resolve claim-only member mappings, compose/persist the coordinator, and prove device A → cloud → device B. |
| HA-002 | P2 | IDENTITY | FOUNDATION / F02 / F04 | `src/domain/account/claim.ts:33` | REPAIRED | Systems, meals, source artifacts and all new foundation records were ignored when deciding whether local state was empty, so bootstrap could be selected over claim. | Repaired by making every durable non-default collection/profile/category change count as content. |
| HA-003 | P2 | STATE-INTEGRITY | FOUNDATION | `src/state/appStore.ts:170` | REPAIRED | `dispatch` could publish and repeatedly try to persist an invalid transition although `commit` refused the same state. | Repaired with validation before publication/persistence. |
| HA-004 | P2 | RESPONSIBILITY | FOUNDATION / F01 / F03 / F04 | `src/domain/responsibility.ts:177` | REPAIRED | Reassignment could return the old handoff before discovering the successor was invalid, leaving a partial durable mutation. | Repaired with atomic prevalidation and exact acknowledgement-window validation. |
| HA-005 | P2 | RECURRENCE | FOUNDATION / F03 / F04 | `src/domain/structure.ts:184`; `nextOccurrence:261` | REPAIRED | Fixed iteration caps silently ended old unbounded schedules and a two-year search hid valid multi-year recurrence. | Repaired by jumping near the query range and using a frequency/interval/skip-aware horizon. |
| HA-006 | P2 | PRIVACY | F02 | `src/features/talk-it-out/capture/routing.ts:28-37` | REPAIRED | During clarification, high-stakes text resembling an answer could be sent into Discovery rather than the capture/safety path. | Repaired with a high-stakes routing override and adversarial regression. |
| HA-007 | P2 | RESPONSIBILITY | F03 | `src/features/calendar/model/collect.ts:113`; `conflicts.ts:128-130` | REPAIRED | Calendar treated every accepted handoff as covered even when canonical truth said it still needed her. | Repaired: only completed or accepted with `stillNeedsMe === false` is covered. |
| HA-008 | P2 | RESPONSIBILITY | F04 | `src/features/systems/commands/responsibility.ts:44` | REPAIRED | Systems “said yes” silently used the default that claimed the load no longer needed her. | Repaired by recording acceptance conservatively with `stillNeedsMe: true`. |
| HA-009 | P2 | DEPENDENCY | FOUNDATION / F01 / F03 | `src/domain/structure.ts:70-85` | OPEN — OWNER/SCHEMA | A removed event counts as a completed prerequisite while an archived task does not. The same dependency edge therefore changes meaning by target kind. | Choose explicit prerequisite-retirement semantics; until then, do not say “completed” or “handled” solely because a prerequisite was removed. |
| HA-010 | P2 | PROVENANCE | FOUNDATION / F03 | `src/domain/tasks.ts:13,38`; cloud `tasks.duration_minutes` | OPEN — OWNER/SCHEMA | Missing duration becomes `15` and is indistinguishable locally and in Supabase from an explicitly entered 15 minutes. Capacity can upgrade a default into fact. | Add durable estimate provenance (recommended) or nullable unknown duration; migrate both local and cloud representations together. |
| HA-011 | P2 | SEMANTIC-TRUTH | FOUNDATION / F04 | `src/domain/state.ts:185`; `src/domain/sync/projection.ts:123`; migration `20260919231500_build4_cloud_schema.sql:1525-1587` | OPEN — OWNER/SCHEMA | Cloud systems support `subject_member_id` and require it for child scope, but local `HouseholdSystem` and projection omit it. A cloud child-scoped System cannot round-trip truthfully. | Add local `subjectMemberId` plus validation/editor/projection support, or remove the unsupported cloud semantic before use. |
| HA-012 | P4 | DOCUMENTATION | F03 | `src/features/calendar/model/revision.ts:60-85` | OPEN | Calendar’s evidence digest hashes dependency id/status/relation and responsibility id/state/time, not endpoints/holder/`stillNeedsMe`; distinct evidence can share the same displayed token. | Hash every canonical field the projection consumes or label the token as a cache marker, not complete evidence identity. |
| HA-013 | P4 | ARCHITECTURE | BACKEND | `supabase/migrations/20260919231500_build4_cloud_schema.sql:12-89` | OPEN | The shipping migration intentionally drops/recreates the schema and refuses any populated application/auth database. It proves fresh creation, not an upgrade from deployed data. | Before any populated environment exists, preserve the zero-data gate; otherwise replace it with an additive, rehearsed upgrade migration. |
| HA-014 | P4 | RECOVERY | BACKEND | `src/domain/sync/coordinator.ts:145-154`; `src/domain/sync/pullEngine.ts:92` | OPEN | One malformed/incompatible pulled row refuses the entire batch and leaves the cursor in place; there is no row-level quarantine. | Define a versioned row quarantine/evidence contract before rolling schema versions independently. |
| HA-015 | P4 | TEST-GAP | BACKEND | `supabase/tests/sync-integration.mjs`; `tests/syncEngine.test.mjs:173` | OPEN | The strong harness never performs the missing production journey: pre-sign-in System/capture → claim closure excludes it → first production sync → second device. | Add this end-to-end journey when composing sync, with child-scoped and queue-overflow negative cases. |
| HA-016 | P8 | DOCUMENTATION | BACKEND | migration `20260919231500_build4_cloud_schema.sql:4624` and `:5586` | OPEN | An earlier comment says `sync_push` is not implemented although the same migration implements it later. | Remove or scope the stale comment so reviewers do not infer an absent RPC. |
| HA-017 | P10 | LIFECYCLE | F04 | `src/features/systems/model/availability.ts`; `docs/builds/HK_FEATURE_04_MISSING_PRIMITIVES.md` | DOCUMENTED LIMITATION | System/step removal and occurrence/run materialization are absent; F04 truthfully presents them as unavailable and never fakes completion. | Resolve with owner decisions before adding execution/history claims. |
| HA-018 | P10 | TIMEZONE-DST | F01 / F03 / F04 | `src/domain/logicalDay.ts`; feature time suites | NOT REPRODUCED | The reported Today spring-forward/fall-back pressure did not reproduce; zone-aware tests passed on both transitions. | Retain DST cases and rerun on integration/device runtime. |
| HA-019 | P10 | PRIVACY | F02 | `src/features/talk-it-out/capture/textStore.ts`; source artifact model | DOCUMENTED LIMITATION | Exact utterance text is session-only while durable provenance stores metadata/digest/reference. UI remains honest, but future recall policy is unresolved. | Keep session-only by default; any durable raw-content policy requires explicit retention, encryption, deletion and consent decisions. |
| HA-020 | P10 | ARCHITECTURE | BACKEND | `supabase/functions` (absent) | ABSENT BY DESIGN | There are no application Edge Functions. This is not a hidden implementation. Account deletion/external execution therefore remain unimplemented. | Add only through separately authorized, idempotent, authenticated designs. |

## Detailed P0–P3 findings

### HA-001 — bound account without an operating sync path

**Severity:** P1 — CRITICAL  
**Type:** SYNC (secondary: DATA-LOSS, ARCHITECTURE, FOUNDATION-BOUNDARY)  
**Feature/Foundation:** FOUNDATION / F01–F04

**Discovery method:** traced the production composition root, claim payload boundary, claim-to-sync seam, queue producers and coordinator references; then searched all production imports of `createSyncCoordinator` and `enqueue`.

**Reproduction:** create a real local state containing only a System or source artifact; sign in. `buildClaimPayload` deliberately excludes that row. `namespaceFromClaim` adopts only the returned id map and creates an empty queue. `AccountProvider` exposes the namespace but no production code constructs `createSyncCoordinator`; no domain mutation bridge enqueues the row.

**Expected:** after “bound,” durable local content is either claimed or represented as durable outbound work and eventually appears on a second device.

**Actual:** local content remains on device A but is absent from cloud/device B. The UI can report binding success without a route that transfers it.

**User/product impact:** severe false backup/cross-device expectations and silent stranding of the very household state account binding is meant to protect. A child referenced only outside the historical One Move closure is worse: members are claim-only and ordinary sync cannot create its required mapping.

**Root cause:** B4 claim intentionally carries only the historical One Move closure; the promised “everything else is sync’s job” integration is not composed. Existing unit tests manually enqueue and call engines, which proves engines in isolation rather than the app boundary.

**Repair:** not implemented. Wiring F01–F04 or inventing expanded membership/claim semantics is expressly outside this audit and crosses a schema/owner boundary. The path is stopped and the backend verdict is FAIL.

**Suggested fix:** during integration, preflight local content before the network claim; make claim establish every mapping ordinary sync cannot create; seed creates for every other unmapped syncable row atomically with the binding; fail closed on queue overflow; compose triggers, persistence and account guards; prove the two-device journey using real PostgREST/RLS.

**Regression evidence:** the negative structural evidence is exact: the sole production reference to `createSyncCoordinator` is its definition; `namespaceFromClaim` returns an empty queue unless a caller later supplies work. The existing 684 backend checks remain green but do not exercise this composition.

**Integration relevance:** BLOCKING.

### HA-002 — durable content misclassified as an empty household

**Severity:** P2 — HIGH  
**Type:** IDENTITY (secondary: DATA-LOSS, CLAIM)  
**Location:** `src/domain/account/claim.ts`, `describeLocalHousehold`

**Reproduction:** pass `createEmptyState()` plus one `systems` row, or plus one `sourceArtifacts` row. Before repair, `hasContent` was false and `decideBinding` chose `bootstrap`.

**Expected:** any durable user/profile/foundation content prevents empty bootstrap.

**Actual:** only legacy collections/onboarding selections were counted.

**Repair:** audit commit `3f567d2` (cherry-picked as F01 `223d632`, F02 `7e6c08b`, F03 `90dd7e1`, F04 `6b6a221`) counts changed profile/category state and every durable non-default collection. A regression covers Systems-only, source-only, profile-only and custom-category-only states.

**Regression evidence:** full foundation test run 812/812 and TypeScript pass after the repair; feature suites also received the same commit.

**Integration relevance:** repaired prerequisite; HA-001 still blocks the broader journey.

### HA-003 — invalid dispatched state became authoritative

**Severity:** P2 — HIGH  
**Type:** STATE-INTEGRITY  
**Location:** `src/state/appStore.ts`, `applyNow`

**Reproduction:** dispatch a transition that creates a dangling canonical reference. The persistence encoder rejects it, but the old store published it first.

**Repair:** audit commit `d762418`; `dispatch` now applies the same canonical validation boundary as `commit` before publish or persistence.

**Regression evidence:** `tests/appStore.test.mjs`; all four feature suites passed after cherry-pick.

### HA-004 — responsibility reassignment partially mutated

**Severity:** P2 — HIGH  
**Type:** RESPONSIBILITY  
**Location:** `src/domain/responsibility.ts`, `reassign`

**Reproduction:** reassign an active responsibility to a missing/stale person. The old handoff was returned before the successor was validated.

**Repair:** `d762418`; validate successor, holder status and acknowledgement window before changing either record. Zero minutes is represented as due now; negative/non-finite windows are refused.

**Regression evidence:** hostile foundation operation regressions and all feature suites pass.

### HA-005 — old and sparse recurrence disappeared

**Severity:** P2 — HIGH  
**Type:** RECURRENCE  
**Location:** `src/domain/structure.ts`, `occurrencesBetween`, `nextOccurrence`

**Reproduction:** query an unbounded daily recurrence more than 4,000 days after its anchor, or a valid five-year interval. Fixed loop guards returned no occurrence.

**Repair:** `d762418`; range generation jumps near `from`, and next-occurrence uses rule-aware frequency/interval/skip horizons.

**Regression evidence:** regressions cover an old daily schedule and five-year recurrence; all feature suites pass.

### HA-006 — high-stakes clarification entered Discovery

**Severity:** P2 — HIGH  
**Type:** PRIVACY  
**Location:** F02 `routing.ts`, `routeMessage`

**Reproduction:** while clarifying/refining, enter “everything at once and I am unsafe at home.” Its answer-like shape previously selected Discovery.

**Repair:** F02 audit commit `791c417`; high-stakes content routes to capture before conversational discovery.

**Regression evidence:** 49 focused coordinator/routing checks and F02 full 1,078-test suite pass.

### HA-007 — accepted-but-still-hers read as covered

**Severity:** P2 — HIGH  
**Type:** RESPONSIBILITY  
**Location:** F03 `model/collect.ts`, `model/conflicts.ts`, `copy.ts`

**Repair:** F03 audit commit `77b2f35`; covered now means completed or accepted with explicit `stillNeedsMe === false`; Today risk/copy stays conservative.

**Regression evidence:** responsibility regression plus F03 full 1,061-test suite pass.

### HA-008 — Systems acceptance silently removed her load

**Severity:** P2 — HIGH  
**Type:** RESPONSIBILITY  
**Location:** F04 `commands/responsibility.ts`

**Repair:** F04 audit commit `4106437`; “said yes” calls `accept(..., true)` and evidence fixtures assert it still needs her until separately established otherwise.

**Regression evidence:** focused Systems tests plus F04 full 957-test suite pass.

### HA-009 — removed prerequisite has type-dependent meaning

**Severity:** P2 — HIGH  
**Type:** DEPENDENCY  
**Location:** `src/domain/structure.ts`, `isDone`, `unmetPrerequisites`

**Reproduction:** make a dependent item point to an event, then remove the event: it becomes satisfied. Repeat with a task and archive it: it remains unmet.

**Impact:** “waiting,” “ready,” and “handled” can disagree about the same real-world situation solely because the removed prerequisite was modeled as task versus event.

**Repair:** no owner-safe repair. “Removed means completed,” “removed remains unmet,” and “retire the edge separately” each change product meaning. Conservative UI must not call removal completion.

**Integration relevance:** owner decision required before dependency projections are reconciled.

### HA-010 — default duration loses its provenance

**Severity:** P2 — HIGH  
**Type:** PROVENANCE (secondary: CAPACITY, SEMANTIC-TRUTH)  
**Location:** `src/domain/tasks.ts`, `DEFAULT_TASK_DURATION_MINUTES`; local/cloud task schemas

**Reproduction:** add a task without duration and one with explicit 15. Both canonical and cloud rows are identical for duration. Calendar then has no way to distinguish estimated/default from known.

**Impact:** capacity can present an invented estimate with the confidence of a user fact.

**Repair:** no safe field-level patch; the distinction requires a durable local/cloud contract and migration.

**Integration relevance:** blocking for truthful F03 backend integration.

### HA-011 — child System subject is lost across the local/cloud boundary

**Severity:** P2 — HIGH  
**Type:** SEMANTIC-TRUTH (secondary: SYNC, SCHEMA-PARITY)  
**Location:** local `HouseholdSystemSchema`; core `system` projection; cloud `household_systems.subject_member_id`

**Reproduction:** cloud schema permits/requires a subject for child-scoped Systems; pull/application representation has no field to retain it, and push never sends it.

**Impact:** a child-specific routine can become an anonymous child-scoped routine locally. F04 correctly disables child-specific authoring, but the backend advertises a semantic the client cannot round-trip.

**Repair:** owner/schema decision required; do not enable child Systems until parity exists.

## P4–P10 documentation standard

For HA-012 through HA-020, the summary table contains WHAT/WHERE/WHY/type/fix. Timing:

- HA-012: **DURING INTEGRATION**.
- HA-013: **BEFORE ANY POPULATED DEPLOYMENT**.
- HA-014 and HA-015: **BEFORE BETA**; HA-015 is also part of the HA-001 integration gate.
- HA-016: **OPTIONAL HARDENING**.
- HA-017 and HA-019: **BEFORE PRODUCTION** if those capabilities are promised.
- HA-018: **DURING INTEGRATION/device validation**.
- HA-020: only when separately authorized.
