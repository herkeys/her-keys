# B4-FOUNDATION-BUILDOUT-01 — the 27-row foundation buildout

**This is a live status ledger, not an approval gate.** Owner authority:
`B4-FEATURE-ACCEPTANCE-01` (`docs/builds/BUILD4_FEATURE_ACCEPTANCE.md`, banked as J0
`db0989bea6e4672d537a83f3e16e7fa56ed3b378`) plus the base prompt and Addenda 01 and 02.

| | |
|---|---|
| Branch | `build/04-cloud-identity-sync` |
| Entry HEAD | `32b1601bc7edfa52992a92f1a744167211ee36c1` |
| J0 (audit banked) | `db0989bea6e4672d537a83f3e16e7fa56ed3b378` |
| SD4 | **CLOSED** — not reopened. New structures derive authority from the audit and this buildout (`B4-FE01-xxx`) |
| Remote commands | **NONE** |

## 0. Entry gate (verified mechanically before any change)

| Check | Expected | Observed |
|---|---|---|
| HEAD | `32b1601bc7edfa52992a92f1a744167211ee36c1` | `32b1601bc7edfa52992a92f1a744167211ee36c1` |
| Worktree | only the audit artifact | only `docs/builds/BUILD4_FEATURE_ACCEPTANCE.md` (untracked) |
| App tests | 454 / 454 | `pass 454 / fail 0` |
| Backend harness | 365 / 365 | `365/365 checks passed`, exit 0 |
| Baseline migration SHA-256 | `8bc38d66fcffbb9fa83502329bd4738a53a8446dd5ce89327013751872f8f16f` | match |
| Shipping migration SHA-256 | `275e9d1cd81a3d4361715a6d91a084ad95de2ccbd83c67f56e6ca0d3143e8436` | match |
| Local fingerprint | `d2b319d0253613d6a5c1dd36ef906da6` / 1300 facts | **recomputed live**: `#GATING 1300 d2b319d0253613d6a5c1dd36ef906da6` |

## 1. Row-state language

Progress states (this ledger): `NOT STARTED` · `IN PROGRESS` · `IMPLEMENTED` · `VERIFIED` · `STOPPED`.

- **IMPLEMENTED** = typed domain semantics + local persistence + cloud schema + RLS + declared-and-wired
  sync participation (each where applicable) + at least one future-shaped test proving the row's user
  job is representable.
- **VERIFIED** = IMPLEMENTED, the future-shaped test passes, second-device hydration is confirmed where
  the primitive is synced, and fingerprint reconciliation is clean for the row's objects.

Final classifications: exactly `ACCEPTED` · `EXTENSION` · `STOPPED`. Success = ACCEPTED + EXTENSION = 27, STOPPED = 0.

## 2. Reconciliation (mechanical)

Extracted by `tests/foundationLedger.test.mjs`, which parses the audit matrix and this register on every run.

| Quantity | Value |
|---|---|
| Matrix rows in the audit | 39 |
| Classified `FOUNDATION EXPANSION REQUIRED` | **27** |
| FE register rows below | **27** |
| Audit rows with no FE row | 0 |
| FE rows mapped to more than one audit row | 0 |
| Audit rows mapped by more than one FE row | 0 |

Non-FE rows (12): #6 #7 #9 #21 #25 #28 #29 #36 #37 EXTENSION; #30 #31 #34 ACCEPTED. They are **consumers** of the
primitives below; none is reclassified here and none is built as a module.

## 3. FE REGISTER

Audit numbering is the audit's own matrix row number. `Primitives` reference the authority IDs in §4.

### FE-01 — Stored provenance / source identity
- AUDIT ROW: #1
- AUDIT CAPABILITY: Stored provenance / source identity
- USER JOB: "Where did this come from, and may you trust it?"
- CURRENT GAP: `provenanceOfTask()` returns `'user-action'` unconditionally; provenance is derived from entity type, never stored; `isUserStated()` feeds `promoteConfidence()`, so a wrong value lowers the corroboration threshold 3 → 1.
- MISSING PRIMITIVE(S): B4-FE01-001, -002 (lineage anchor), -005
- DOMAIN IMPACT: `provenance` facet on 9 content kinds; producer vocabulary; entity-type derivation removed.
- LOCAL-PERSISTENCE IMPACT: v3 → v4, provable backfill, LEGACY/UNKNOWN where unprovable.
- CLOUD/SCHEMA IMPACT: `producer`, `source_artifact_id`, `confidence` on 9 tables; `events.source` replaced.
- SYNC IMPACT: 9 kinds — `UPDATABLE_COLUMNS` (`confidence` only), projection, apply.
- SECURITY IMPACT: none new; `producer`/`source_artifact_id` are never client-UPDATEable.
- ACTION/AUTONOMY IMPACT: none.
- IMPLEMENTATION APPROACH: ADR-001..004.
- STATUS: IN PROGRESS

### FE-02 — Action authorization, consequence & outcome
- AUDIT ROW: #2
- AUDIT CAPABILITY: Action authorization, consequence & outcome
- USER JOB: "May you do this without asking, and did it work?"
- CURRENT GAP: `actor` is `z.literal('user')` and `action_records_source_check` pins `her_keys_recommendation`; ledger is immutable at three layers so no outcome can attach to it.
- MISSING PRIMITIVE(S): B4-FE01-007..012
- DOMAIN IMPACT: authority, consequence taxonomy, intent, decision, execution, outcome types.
- LOCAL-PERSISTENCE IMPACT: 5 collections; executions/outcomes are pull-populated only.
- CLOUD/SCHEMA IMPACT: 5 tables, a server-side authorization-coverage trigger; `action_records` untouched.
- SYNC IMPACT: 3 push+pull kinds, 2 pull-only kinds; `change_log_entity_table_check`, `sync_push` allow-list.
- SECURITY IMPACT: owner-only RLS; execution/outcome have no client INSERT grant.
- ACTION/AUTONOMY IMPACT: the whole axis — representation only, no executor.
- IMPLEMENTATION APPROACH: ADR-007..010.
- STATUS: NOT STARTED

### FE-03 — Universal commitment contract
- AUDIT ROW: #3
- AUDIT CAPABILITY: Universal commitment contract (§9)
- USER JOB: "Treat an obligation as an obligation, whatever module it lives in."
- CURRENT GAP: `commitment`/`dueDate`/travel exist on some kinds and not others (§5 of the audit).
- MISSING PRIMITIVE(S): B4-FE01-015, -016, -020
- DOMAIN IMPACT: one typed facet interface implemented by task, event, meal, system; read through one accessor.
- LOCAL-PERSISTENCE IMPACT: nullable facet fields on `tasks`/`events`/`meals`/`systems`.
- CLOUD/SCHEMA IMPACT: nullable columns; no new table.
- SYNC IMPACT: per-kind column lists only.
- SECURITY IMPACT: none.
- ACTION/AUTONOMY IMPACT: feeds consequence.
- IMPLEMENTATION APPROACH: ADR-014, -015.
- STATUS: NOT STARTED

### FE-04 — Voice-first Talk It Out
- AUDIT ROW: #4
- AUDIT CAPABILITY: Voice-first Talk It Out (§10)
- USER JOB: "Just tell me what's going on."
- CURRENT GAP: a matched topic yields at most two scripted answers; one messy sentence producing a task, a bill, a worry and a deadline has nowhere to land and nothing links them to the sentence.
- MISSING PRIMITIVE(S): B4-FE01-002, -003, -005
- DOMAIN IMPACT: source artifact (utterance), structured candidates, clarification state, correction, reprocessing.
- LOCAL-PERSISTENCE IMPACT: `sourceArtifacts[]`, `candidates[]`.
- CLOUD/SCHEMA IMPACT: `source_artifacts`, `candidates`.
- SYNC IMPACT: 2 push+pull kinds.
- SECURITY IMPACT: owner-only; **no transcript is stored** (ADR-011).
- ACTION/AUTONOMY IMPACT: accepting a candidate is a user decision.
- IMPLEMENTATION APPROACH: ADR-011, -012.
- STATUS: IN PROGRESS

### FE-05 — Life Inbox / multi-source ingestion
- AUDIT ROW: #5
- AUDIT CAPABILITY: Life Inbox / multi-source ingestion (§11)
- USER JOB: "Forward it to Her Keys and forget it."
- CURRENT GAP: the one-email-five-facts test fails: the rows would be unrelated and the email unrepresentable.
- MISSING PRIMITIVE(S): B4-FE01-002, -003, -004
- DOMAIN IMPACT: source artifact + lineage + duplicate detection + retraction + confirmation state.
- LOCAL-PERSISTENCE IMPACT: as FE-04.
- CLOUD/SCHEMA IMPACT: `UNIQUE (household, profile, content_digest)`; provenance FK on produced rows.
- SYNC IMPACT: as FE-04.
- SECURITY IMPACT: new data class (email/document metadata); content is never stored.
- ACTION/AUTONOMY IMPACT: confirmation gate.
- IMPLEMENTATION APPROACH: ADR-011, -012, -013.
- STATUS: IN PROGRESS

### FE-06 — Daily briefing — full ritual
- AUDIT ROW: #8
- AUDIT CAPABILITY: Daily briefing — full ritual (§38)
- USER JOB: "What should I know this morning?"
- CURRENT GAP: four of ten briefing lines have no source; "what changed since yesterday" cannot be answered offline (`change_log` is cloud-only and content-free).
- MISSING PRIMITIVE(S): B4-FE01-025 (derived), reads -006, -011, -012, -014, -019
- DOMAIN IMPACT: one projection over shared primitives; no module-private knowledge.
- LOCAL-PERSISTENCE IMPACT: none (derived). "What changed" is sourced from row timestamps + append-only evidence (ADR-018).
- CLOUD/SCHEMA IMPACT: none.
- SYNC IMPACT: none of its own (LOCAL-ONLY, derived).
- SECURITY IMPACT: none.
- ACTION/AUTONOMY IMPACT: reads intents/decisions/executions.
- IMPLEMENTATION APPROACH: ADR-018.
- STATUS: NOT STARTED

### FE-07 — Capacity Intelligence
- AUDIT ROW: #10
- AUDIT CAPABILITY: Capacity Intelligence (§13)
- USER JOB: "Is this day actually possible?"
- CURRENT GAP: no task travel, no windows, no dependencies, no energy, constants identical for every household, no completion history.
- MISSING PRIMITIVE(S): B4-FE01-015, -016, -006, -017
- DOMAIN IMPACT: capacity facets; per-household capacity profile; behavioral history as input.
- LOCAL-PERSISTENCE IMPACT: task facets + `capacity` singleton.
- CLOUD/SCHEMA IMPACT: nullable task columns + `capacity_profiles`.
- SYNC IMPACT: `task` widened, 1 new singleton kind.
- SECURITY IMPACT: owner-only.
- ACTION/AUTONOMY IMPACT: none.
- IMPLEMENTATION APPROACH: ADR-015, -025.
- STATUS: NOT STARTED

### FE-08 — Adaptive scheduling
- AUDIT ROW: #11
- AUDIT CAPABILITY: Adaptive scheduling (§14)
- USER JOB: "Put the work somewhere it can actually happen."
- CURRENT GAP: flexibility is a binary flag and `TaskPlan` is a point, so the only expressible move is "same time tomorrow".
- MISSING PRIMITIVE(S): B4-FE01-015, -016, -017
- DOMAIN IMPACT: earliest/latest window, splittability, minimum chunk, preferred time, dependency, consequence-driven priority inputs.
- LOCAL-PERSISTENCE IMPACT: task/event facets; `dependencies[]`.
- CLOUD/SCHEMA IMPACT: nullable columns; `dependencies`.
- SYNC IMPACT: `task`/`event` widened; 1 new kind.
- SECURITY IMPACT: none.
- ACTION/AUTONOMY IMPACT: per-move autonomy uses -007.
- IMPLEMENTATION APPROACH: ADR-015, -016.
- STATUS: NOT STARTED

### FE-09 — One Move extensibility
- AUDIT ROW: #12
- AUDIT CAPABILITY: One Move extensibility (§15)
- USER JOB: "One thing today, and the right one."
- CURRENT GAP: each new target kind costs a column, an FK, an index, two CHECK rewrites and three client edits; One Move stores no reason.
- MISSING PRIMITIVE(S): B4-FE01-027, -028, -024
- DOMAIN IMPACT: typed-target registry; reasoning evidence for "why this One Move".
- LOCAL-PERSISTENCE IMPACT: `targetType` widened; provenance on One Move.
- CLOUD/SCHEMA IMPACT: typed-reference convention applied once, generated from one registry.
- SYNC IMPACT: `UPDATABLE_COLUMNS.oneMove` widened; typed refs resolve through mappings.
- SECURITY IMPACT: none.
- ACTION/AUTONOMY IMPACT: none.
- IMPLEMENTATION APPROACH: ADR-005, -021.
- STATUS: NOT STARTED

### FE-10 — AI decomposition
- AUDIT ROW: #13
- AUDIT CAPABILITY: AI decomposition (§16)
- USER JOB: "Break this into something I can start."
- CURRENT GAP: no parent/child, no goal entity, no dependency graph; a generated step is indistinguishable from one she wrote.
- MISSING PRIMITIVE(S): B4-FE01-021, -017, -001, -003, -006
- DOMAIN IMPACT: goal entity, `part_of` relation, generated-vs-user provenance, acceptance via confirmation.
- LOCAL-PERSISTENCE IMPACT: `goals[]`, `dependencies[]`.
- CLOUD/SCHEMA IMPACT: `goals`, `dependencies`.
- SYNC IMPACT: 2 kinds.
- SECURITY IMPACT: owner-only.
- ACTION/AUTONOMY IMPACT: acceptance is an approval.
- IMPLEMENTATION APPROACH: ADR-012, -016.
- STATUS: NOT STARTED

### FE-11 — Delegation
- AUDIT ROW: #14
- AUDIT CAPABILITY: Delegation (§17)
- USER JOB: "Make it genuinely someone else's."
- CURRENT GAP: there is nobody to delegate to — a co-parent, nanny or grandparent is an adult without an account, which `household_members_check` refuses.
- MISSING PRIMITIVE(S): B4-FE01-013, -014
- DOMAIN IMPACT: non-account person + responsibility/handoff contract.
- LOCAL-PERSISTENCE IMPACT: `people[]`, `responsibilities[]`.
- CLOUD/SCHEMA IMPACT: `household_people`, `responsibilities`. **`household_members` and `is_household_member` are not touched** (ADR-019).
- SYNC IMPACT: 2 kinds.
- SECURITY IMPACT: owner-only; membership boundary unchanged.
- ACTION/AUTONOMY IMPACT: sending a request is an action with consequence (-008).
- IMPLEMENTATION APPROACH: ADR-019.
- STATUS: NOT STARTED

### FE-12 — Closed-loop responsibility
- AUDIT ROW: #15
- AUDIT CAPABILITY: Closed-loop responsibility (§18)
- USER JOB: "Did the pickup actually get covered?"
- CURRENT GAP: the soccer-pickup lifecycle has no representable state at any step.
- MISSING PRIMITIVE(S): B4-FE01-014, -006, -019
- DOMAIN IMPACT: requested → acknowledged → accepted/declined → completed / returned; still-needs-me; unacknowledged derived.
- LOCAL-PERSISTENCE IMPACT: as FE-11.
- CLOUD/SCHEMA IMPACT: state-machine CHECKs; one current responsibility per subject.
- SYNC IMPACT: as FE-11.
- SECURITY IMPACT: owner-only.
- ACTION/AUTONOMY IMPACT: escalation is attention intent, not delivery.
- IMPLEMENTATION APPROACH: ADR-019.
- STATUS: NOT STARTED

### FE-13 — Proactive automation
- AUDIT ROW: #16
- AUDIT CAPABILITY: Proactive automation (§19)
- USER JOB: "Handle it, and tell me you did."
- CURRENT GAP: ActionRecord cannot express a pending proposal, a non-human actor, an execution attempt or a result.
- MISSING PRIMITIVE(S): B4-FE01-007..012
- DOMAIN IMPACT: intent → decision → execution → outcome, all append-only.
- LOCAL-PERSISTENCE IMPACT: as FE-02.
- CLOUD/SCHEMA IMPACT: as FE-02.
- SYNC IMPACT: as FE-02.
- SECURITY IMPACT: execution requires server-verified authorization.
- ACTION/AUTONOMY IMPACT: representation-only; nothing executes.
- IMPLEMENTATION APPROACH: ADR-007..010.
- STATUS: NOT STARTED

### FE-14 — Autonomy / approval model
- AUDIT ROW: #17
- AUDIT CAPABILITY: Autonomy / approval model (§20)
- USER JOB: "Decide what you may do alone."
- CURRENT GAP: nowhere stores a permission; none of Recommend / Approve & Execute / Autopilot is representable.
- MISSING PRIMITIVE(S): B4-FE01-007, -008
- DOMAIN IMPACT: authority keyed on (category, consequence, boundary) with mode and persistence.
- LOCAL-PERSISTENCE IMPACT: `authorities[]`.
- CLOUD/SCHEMA IMPACT: `automation_authorities`.
- SYNC IMPACT: 1 push+pull CAS kind (revoke is the only update).
- SECURITY IMPACT: **a permission store** — owner-only, `producer` must be `user-action`, never household-readable.
- ACTION/AUTONOMY IMPACT: the model itself.
- IMPLEMENTATION APPROACH: ADR-006, -008.
- STATUS: NOT STARTED

### FE-15 — Action consequence model
- AUDIT ROW: #18
- AUDIT CAPABILITY: Action consequence model (§40)
- USER JOB: "Know the difference between a reminder and a payment."
- CURRENT GAP: "move an internal reminder" and "initiate a financial transaction" are indistinguishable to every rule the system can write.
- MISSING PRIMITIVE(S): B4-FE01-008
- DOMAIN IMPACT: action category × consequence level × reversibility, with a total default profile per category.
- LOCAL-PERSISTENCE IMPACT: fields on authority/intent/execution.
- CLOUD/SCHEMA IMPACT: CHECK-enforced closed vocabularies.
- SYNC IMPACT: none of its own.
- SECURITY IMPACT: gates -007.
- ACTION/AUTONOMY IMPACT: gates autonomy.
- IMPLEMENTATION APPROACH: ADR-008.
- STATUS: NOT STARTED

### FE-16 — Observe outcome / closed loop
- AUDIT ROW: #19
- AUDIT CAPABILITY: Observe outcome / closed loop (§41)
- USER JOB: "Did it actually work?"
- CURRENT GAP: the ledger is immutable, so an outcome must be a sibling; that relationship is a schema decision.
- MISSING PRIMITIVE(S): B4-FE01-011, -012
- DOMAIN IMPACT: append-only outcome history; one execution → many observations.
- LOCAL-PERSISTENCE IMPACT: `executions[]`, `outcomes[]` (pull-populated).
- CLOUD/SCHEMA IMPACT: `action_executions`, `action_outcomes`, real FKs.
- SYNC IMPACT: 2 PULL-only kinds.
- SECURITY IMPACT: no client INSERT grant.
- ACTION/AUTONOMY IMPACT: closes the loop.
- IMPLEMENTATION APPROACH: ADR-007.
- STATUS: NOT STARTED

### FE-17 — Smart notifications
- AUDIT ROW: #20
- AUDIT CAPABILITY: Smart notifications (§21)
- USER JOB: "Interrupt me only when it matters."
- CURRENT GAP: zero occurrences of `notif` in the repository; no shared intent model.
- MISSING PRIMITIVE(S): B4-FE01-019 (derived)
- DOMAIN IMPACT: attention reasons (deadline, risk, conflict, approval required, unacknowledged delegation, changed external source, Needs Me, capacity overload).
- LOCAL-PERSISTENCE IMPACT: none (derived).
- CLOUD/SCHEMA IMPACT: none. No push-token store is created.
- SYNC IMPACT: LOCAL-ONLY.
- SECURITY IMPACT: none.
- ACTION/AUTONOMY IMPACT: reads -007, -008.
- IMPLEMENTATION APPROACH: ADR-018.
- STATUS: NOT STARTED

### FE-18 — Cross-domain reasoning
- AUDIT ROW: #38
- AUDIT CAPABILITY: Cross-domain reasoning (§43)
- USER JOB: "See my whole life at once."
- CURRENT GAP: scenarios A–D fail only for lack of input coverage; the reasoning surface is already right.
- MISSING PRIMITIVE(S): B4-FE01-031 (inherits all)
- DOMAIN IMPACT: none of its own.
- LOCAL-PERSISTENCE IMPACT: none.
- CLOUD/SCHEMA IMPACT: none.
- SYNC IMPACT: none.
- SECURITY IMPACT: none.
- ACTION/AUTONOMY IMPACT: none.
- IMPLEMENTATION APPROACH: scenario tests A–D against real relational rows; no JSON bag carries a fact (Addendum 01 A6).
- STATUS: NOT STARTED

### FE-19 — Reasoning explainability
- AUDIT ROW: #39
- AUDIT CAPABILITY: Reasoning explainability (§39)
- USER JOB: "Why this?"
- CURRENT GAP: One Move — the most visible recommendation — stores no reason at all.
- MISSING PRIMITIVE(S): B4-FE01-024
- DOMAIN IMPACT: structured product evidence (typed code + named references); never chain-of-thought.
- LOCAL-PERSISTENCE IMPACT: `evidenceLinks[]`.
- CLOUD/SCHEMA IMPACT: `evidence_links` with an open, format-checked code vocabulary.
- SYNC IMPACT: 1 immutable push+pull kind.
- SECURITY IMPACT: owner-only.
- ACTION/AUTONOMY IMPACT: attaches to intents.
- IMPLEMENTATION APPROACH: ADR-022.
- STATUS: NOT STARTED

### FE-20 — Calendar OS — external sources
- AUDIT ROW: #22
- AUDIT CAPABILITY: Calendar OS — external sources (§22)
- USER JOB: "My real calendar and Her Keys agree."
- CURRENT GAP: no provider/external-id column; provider tokens have no server-side home.
- MISSING PRIMITIVE(S): B4-FE01-004 plus the token boundary
- DOMAIN IMPACT: external reference to an event with direction, authority and Her Keys-created vs externally-created origin.
- LOCAL-PERSISTENCE IMPACT: `externalReferences[]`.
- CLOUD/SCHEMA IMPACT: `external_references`, unique on (household, provider, account, object).
- SYNC IMPACT: 1 kind.
- SECURITY IMPACT: **no credential column anywhere**; enforced by a source-scan test (ADR-013).
- ACTION/AUTONOMY IMPACT: external writes are actions (-011).
- IMPLEMENTATION APPROACH: ADR-013.
- STATUS: IN PROGRESS

### FE-21 — External integration identity
- AUDIT ROW: #23
- AUDIT CAPABILITY: External integration identity (§33)
- USER JOB: (shared) "Recognise the same object every time it appears."
- CURRENT GAP: no provider, external id, etag, version or direction anywhere; `local_id` means "a device minted this".
- MISSING PRIMITIVE(S): B4-FE01-004
- DOMAIN IMPACT: the shared tuple (provider, external account, external object id, version/etag, last observed, direction, authority, status, linked object).
- LOCAL-PERSISTENCE IMPACT: as FE-20.
- CLOUD/SCHEMA IMPACT: as FE-20; server-originated `local_id` convention `ext:<provider>:<hash>` fixed now.
- SYNC IMPACT: as FE-20.
- SECURITY IMPACT: as FE-20.
- ACTION/AUTONOMY IMPACT: as FE-20.
- IMPLEMENTATION APPROACH: ADR-013.
- STATUS: IN PROGRESS

### FE-22 — Integration feedback-loop prevention
- AUDIT ROW: #24
- AUDIT CAPABILITY: Integration feedback-loop prevention (§34)
- USER JOB: "Don't create it twice when it comes back."
- CURRENT GAP: an ingested copy of Her Keys' own write is indistinguishable from a genuine new external event.
- MISSING PRIMITIVE(S): B4-FE01-004, -011
- DOMAIN IMPACT: `origin = her_keys` + write execution + unique external identity.
- LOCAL-PERSISTENCE IMPACT: as FE-20.
- CLOUD/SCHEMA IMPACT: as FE-20.
- SYNC IMPACT: as FE-20.
- SECURITY IMPACT: as FE-20.
- ACTION/AUTONOMY IMPACT: links the external object to the execution that wrote it.
- IMPLEMENTATION APPROACH: ADR-013.
- STATUS: IN PROGRESS

### FE-23 — Co-parent logistics
- AUDIT ROW: #26
- AUDIT CAPABILITY: Co-parent logistics (§24)
- USER JOB: "Handoffs, packing, transport and reimbursements without a fight."
- CURRENT GAP: needs a non-account person, a responsibility lifecycle, money and recurrence for custody schedules.
- MISSING PRIMITIVE(S): B4-FE01-013, -014, -018, -020
- DOMAIN IMPACT: none co-parent-specific; logistics are composed from shared primitives.
- LOCAL-PERSISTENCE IMPACT: none of its own.
- CLOUD/SCHEMA IMPACT: none of its own. **`coparent-shared` stays owner-only.**
- SYNC IMPACT: none of its own.
- SECURITY IMPACT: no widening; logistics are not a legal-record architecture.
- ACTION/AUTONOMY IMPACT: requests are actions with consequence.
- IMPLEMENTATION APPROACH: ADR-006, -019.
- STATUS: NOT STARTED

### FE-24 — Money OS
- AUDIT ROW: #27
- AUDIT CAPABILITY: Money OS (§25)
- USER JOB: "Bills, fees and reimbursements as obligations I can reason about."
- CURRENT GAP: no amount, currency or monetary type anywhere.
- MISSING PRIMITIVE(S): B4-FE01-020, -008, -007, -004
- DOMAIN IMPACT: exact integer-minor-unit value facet on tasks/events/candidates; financial consequence; payment authority limit.
- LOCAL-PERSISTENCE IMPACT: `value` facet.
- CLOUD/SCHEMA IMPACT: `value_amount_minor bigint`, `value_currency`, `value_direction`; never floating point.
- SYNC IMPACT: per-kind column lists.
- SECURITY IMPACT: new sensitivity class; owner-only where authority is involved.
- ACTION/AUTONOMY IMPACT: financial action is the highest consequence class.
- IMPLEMENTATION APPROACH: ADR-014. No Money OS, bank connectivity or payments.
- STATUS: NOT STARTED

### FE-25 — Household Systems as an engine
- AUDIT ROW: #32
- AUDIT CAPABILITY: Household Systems as an engine (§30)
- USER JOB: "A system that runs, not a label."
- CURRENT GAP: no trigger, schedule, step, owner or run.
- MISSING PRIMITIVE(S): B4-FE01-022, -018, -014, -006, -007
- DOMAIN IMPACT: system + recurrence + steps + responsibility + automation level; runs/exceptions are observations.
- LOCAL-PERSISTENCE IMPACT: `systemSteps[]`; `automationMode`, `effortMinutes` on systems.
- CLOUD/SCHEMA IMPACT: `system_steps`; two columns on `household_systems`.
- SYNC IMPACT: 1 new kind; `system` widened.
- SECURITY IMPACT: owner-only.
- ACTION/AUTONOMY IMPACT: automation level uses the shared mode vocabulary.
- IMPLEMENTATION APPROACH: ADR-017, -022.
- STATUS: NOT STARTED

### FE-26 — Pattern Intelligence
- AUDIT ROW: #33
- AUDIT CAPABILITY: Pattern Intelligence (§31)
- USER JOB: "Learn how I actually live, without deciding for me."
- CURRENT GAP: nowhere to keep a pattern and nothing to base one on (no completion history, no observation record).
- MISSING PRIMITIVE(S): B4-FE01-023, -024, -006, -005
- DOMAIN IMPACT: bounded pattern + evidence links; corroboration counts independent evidence, not repeated rows.
- LOCAL-PERSISTENCE IMPACT: `patterns[]`, `observations[]`.
- CLOUD/SCHEMA IMPACT: `patterns`, `behavior_observations`, `evidence_links`.
- SYNC IMPACT: 3 kinds.
- SECURITY IMPACT: owner-only.
- ACTION/AUTONOMY IMPACT: a pattern needs approval before acting (`requiresApproval('pattern')`).
- IMPLEMENTATION APPROACH: ADR-022.
- STATUS: NOT STARTED

### FE-27 — Shared household participation
- AUDIT ROW: #35
- AUDIT CAPABILITY: Shared household participation (§35)
- USER JOB: "Bring another person in later without rebuilding."
- CURRENT GAP: `private.current_household_id()` is `LIMIT 1` with no ORDER BY and `sync_pull` depends on it.
- MISSING PRIMITIVE(S): B4-FE01-026, -013, -006 (scopes stay fail-closed)
- DOMAIN IMPACT: none beyond an explicit household-context contract.
- LOCAL-PERSISTENCE IMPACT: none. `SyncNamespace.householdId` stays singular (recorded, not changed).
- CLOUD/SCHEMA IMPACT: `private.resolve_household_context(uuid)`; `sync_pull(p_cursor, p_household_id)`; `current_household_id()` removed.
- SYNC IMPACT: `sync_pull` and the transport gain the household parameter.
- SECURITY IMPACT: no broadening; wrong/foreign/missing context is refused.
- ACTION/AUTONOMY IMPACT: none.
- IMPLEMENTATION APPROACH: ADR-019, -020. No collaboration is built.
- STATUS: NOT STARTED

## 4. Governance IDs

| ID | Primitive | FE rows |
|---|---|---|
| B4-FE01-001 | Stored provenance (`producer`, `sourceArtifactId`) | 01, 10 |
| B4-FE01-002 | Source artifact + lineage anchor | 01, 04, 05 |
| B4-FE01-003 | Structured candidate | 04, 05, 10 |
| B4-FE01-004 | External reference identity | 05, 20, 21, 22, 24 |
| B4-FE01-005 | Durable confidence (single writer `promoteConfidence`) | 01, 04, 26 |
| B4-FE01-006 | Behavior observation (append-only) | 07, 10, 12, 25, 26, 27 |
| B4-FE01-007 | Automation authority | 02, 13, 14, 24, 25 |
| B4-FE01-008 | Action category / consequence / reversibility taxonomy | 02, 13, 14, 15, 24 |
| B4-FE01-009 | Action intent | 02, 13 |
| B4-FE01-010 | Intent decision | 02, 13 |
| B4-FE01-011 | Execution record | 02, 13, 16, 22 |
| B4-FE01-012 | Outcome observation | 02, 13, 16 |
| B4-FE01-013 | Household person (non-account) | 11, 23, 27 |
| B4-FE01-014 | Responsibility | 11, 12, 23, 25 |
| B4-FE01-015 | Commitment facets | 03, 07, 08 |
| B4-FE01-016 | Capacity metadata (facets + capacity profile) | 03, 07, 08 |
| B4-FE01-017 | Dependency edge | 07, 08, 10 |
| B4-FE01-018 | Recurrence rule | 23, 25 |
| B4-FE01-019 | Attention intent (derived) | 06, 12, 17 |
| B4-FE01-020 | Money value type | 03, 23, 24 |
| B4-FE01-021 | Goal | 10 |
| B4-FE01-022 | System steps + automation level | 25 |
| B4-FE01-023 | Pattern | 26 |
| B4-FE01-024 | Evidence link | 09, 19, 26 |
| B4-FE01-025 | Briefing projection (derived) | 06 |
| B4-FE01-026 | Household context contract | 27 |
| B4-FE01-027 | Typed reference convention | 09 |
| B4-FE01-028 | One Move typed-target registry | 09 |
| B4-FE01-029 | Local persistence v4 | all |
| B4-FE01-030 | Claim payload v2 | 01, 03 |
| B4-FE01-031 | Cross-domain projection | 18 |

## 5. Architecture decisions (`B4-FE01-ADR-xxx`)

Recorded under Addendum 02 B18: every candidate outcome preserved the same user-facing semantic, so the smallest typed,
reversible, fail-closed, lossless, cross-domain-reusable option was chosen.

- **ADR-001 Producer vocabulary.** Stored `producer` reuses the existing `ProvenanceSource` literals (`onboarding`, `user-action`,
  `talk-it-out`, `system-derived`, `import-sync`, `ai-inference`, `demo-seed`) and adds `automation` and `legacy-unknown`. No rename, so no
  existing test churns. Owner-vocabulary mapping: USER DIRECT = `user-action`; TALK IT OUT = `talk-it-out`; EXTERNAL OBSERVATION =
  `import-sync`; HER KEYS INFERENCE = `ai-inference`; HER KEYS AUTOMATION = `automation`; SYSTEM/BOOTSTRAP = `system-derived`; DEMO SEED =
  `demo-seed`; LEGACY/UNKNOWN = `legacy-unknown`; plus the existing `onboarding` (user-stated intake).
- **ADR-002 Provenance shape.** `{ producer, artifactId | null, confidence | null }`. `confidence` is non-null exactly for `ai-inference` and
  `import-sync`; user-stated facts carry no confidence by definition. `producer` and `artifactId` are immutable; only
  `promoteConfidence()` may raise `confidence`. `legacy-unknown` is **not** user-stated (conservative, Addendum 02 B23).
- **ADR-003 What is not stamped.** `ActionRecord` already stores durable provenance (`actor`, `source`); `provenanceOfAction` now reads those
  stored fields instead of the entity type. Identity roots (`household`, `user`, `children`) are established by account binding and are not
  content rows. `migrationEvidence` is migration lineage, not a semantic source.
- **ADR-004 Migration lineage.** Recorded separately from `producer`, in `migrationEvidence` as a `provenance-backfill` entry of per-collection
  tallies `(collection, producer, rule, count)`. Rows are never stamped "migration".
- **ADR-005 Typed references.** One convention replaces every polymorphic reference: a `<prefix>_type` discriminator plus one nullable
  typed FK column per kind, composite `(id, household_id)` so a reference cannot cross households, an exactly-one CHECK, and a partial
  index. Adding a kind is one registry edit applied by one helper, not eight hand edits per table.
- **ADR-006 Owner-private by default.** Every new table is `scope = 'personal'` with `profile_id` as the owner and the standard `(SELECT auth.uid())`
  policies. Widening later is additive (relax the CHECK, add a policy). `coparent-shared` is not widened.
- **ADR-007 Evidence class.** Observations, intents, decisions, executions, outcomes and evidence links are append-only and CAS-free
  (`forbid_ledger_mutation`). Executions and outcomes are written only through the trusted server boundary (no client INSERT grant) and are
  PULL-only on the client — automation authority is not client authority.
- **ADR-008 Consequence taxonomy.** Closed vocabularies: `ActionCategory` (8), `ConsequenceLevel` (4), `Reversibility` (3), `AutonomyMode` (4).
  Each category has a total default profile so a rule can distinguish "move an internal reminder" from "initiate a financial action".
- **ADR-009 No mutable proposal.** Authorization state is derived from append-only rows; two devices approving one intent collide on a partial
  UNIQUE and surface as a domain conflict, not a CAS race.
- **ADR-010 ActionRecord untouched.** Its constraints, immutability and shape are unchanged; new structures link to it, never into it.
- **ADR-011 No content in the canonical store.** A source artifact stores kind, provider, received-at, a SHA-256 digest (dedupe) and an opaque
  `contentRef`. A spoken utterance stores **no transcript**. This resolves the audit's owner-decision tension for voice without weakening the
  conversation boundary.
- **ADR-012 Candidates are typed drafts.** Outside canonical state, so capture precedes classification while `category_id` stays NOT NULL.
  Acceptance creates the real row with `producer = ai-inference` and `confidence = established` (user-confirmed), never `user-action`.
- **ADR-013 External identity.** `UNIQUE (household, provider, external_account, external_object_id)`; `origin` and `authority` distinguish Her
  Keys-created from externally-created. Server-originated rows use `local_id = ext:<provider>:<hash>`. No token/credential column exists anywhere
  in AppState or the cloud schema; a source scan enforces it.
- **ADR-014 Money.** A value facet, not a module: `{ amountMinor (safe integer), currency (ISO 4217), direction }`. Never floating point.
- **ADR-015 Commitment facets.** Nullable columns on the kinds that can honestly answer them, read through one `commitmentFacetsOf()`.
- **ADR-016 Dependencies.** One edge table with three relations — `requires`, `part_of`, `alternative_to` — one convention for every future
  feature. Cycles are rejected locally and by trigger.
- **ADR-017 Recurrence.** One typed rule table; exceptions are `skipped` observations; no computed next-run is stored.
- **ADR-018 Derived projections.** Attention (FE-17) and briefing (FE-06) are pure projections. "What changed since yesterday" is sourced from
  per-row `updatedAt`/`createdAt` plus the append-only evidence tables; no separate change journal is created.
- **ADR-019 People are not members.** `household_people` is a separate owner-private table. `household_members`, `is_household_member` and the
  RLS keyed off them are unchanged. Participation can later be added by linking a person to an account.
- **ADR-020 Household context.** `private.resolve_household_context(uuid)`: an explicit household must be one the caller belongs to; an omitted one
  resolves only when exactly one membership exists, otherwise it raises. `sync_pull(p_cursor, p_household_id DEFAULT NULL)`; the client always passes it.
- **ADR-021 One Move targets.** Extended through ADR-005 to task, needsMe, event, system and responsibility. Column names for the existing two are preserved.
- **ADR-022 Patterns and evidence.** A pattern's confidence **is** its provenance confidence. Evidence is `evidence_links` to real observations.
  Corroboration counts independent evidence groups (one source artifact, or one producer-day), so one producer is not corroboration.
- **ADR-023 v4.** v3 is frozen in `legacySchemasV3.ts` before any shape change. New collections migrate as empty; existing rows migrate losslessly.
- **ADR-024 Claim v2.** `claimPayloadVersion` 2. The closure extends to the source artifacts a claimed row's provenance names; an artifact that
  carries an external reference is refused (external references cannot exist before an account). Version 1 is refused.
- **ADR-025 Capacity profile.** A singleton with nullable overrides; the module constants remain the defaults.
- **ADR-026 Observation validity.** A closed table of which outcomes are legal for which subject kind, enforced locally and by CHECK.

## 6. Provenance backfill matrix (v3 → v4)

Classified from the code that can produce each record class, before any migration code was written.

| Record class | What existing state proves the source | Semantic source | User-stated | Migration lineage | Ambiguity rule |
|---|---|---|---|---|---|
| tasks | `origin='demo'`; else `createdAt` is written only by `addTask` (Build 3 capture) | `demo-seed` / `user-action` | NO / YES | tally `task:user-action:created-at-stamped-by-capture` | `createdAt = null` in a non-demo household is an unstamped pre-Build-3 row → `legacy-unknown` |
| events | `source='demo'` or `origin='demo'`; else `source='user'` written only by `addEvent` | `demo-seed` / `user-action` | NO / YES | tally per rule | none — the stored field is the proof |
| Needs Me | `origin='demo'`; else written only by `captureNeedsMeItem` | `demo-seed` / `user-action` | NO / YES | tally per rule | none |
| One Move | `origin='demo'`; else chosen only by the recommendation engine | `demo-seed` / `system-derived` | NO / NO | tally per rule | catalog rows were already remediated to evidence (OR-002) |
| household categories | `origin='demo'`; `systemRole ≠ null` = starter set; `systemRole = null` = `addCategory` | `demo-seed` / `system-derived` / `user-action` | NO / NO / YES | tally per rule | none |
| household systems | `origin='demo'`; no production create path exists (HR-07) | `demo-seed` / `legacy-unknown` | NO / UNKNOWN | tally per rule | a non-demo system cannot be attributed → unknown |
| meal entries | same as systems | `demo-seed` / `legacy-unknown` | NO / UNKNOWN | tally per rule | same |
| onboarding | `origin='demo'`; else the intake flow | `demo-seed` / `onboarding` | NO / YES | tally per rule | none |
| Discovery record | `origin='demo'`; else written only by a Talk It Out turn | `demo-seed` / `talk-it-out` | NO / YES | tally per rule | none |
| Discovery answers | part of the Discovery record | inherits the record | inherits | inherits | none |
| ActionRecords | stored `actor='user'`, `source='her_keys_recommendation'` | read from the stored fields | YES (the decision) | unchanged | not stamped; already durable |
| household / user / children | established by account binding | not content rows | — | unchanged | not classified as user content |
| migrationEvidence | it IS lineage | none | — | grows a `provenance-backfill` entry | never re-derived |

"Do not use entity type as provenance": every non-demo attribution above rests on a stored field or on the fact that exactly one code path can write it,
and where neither holds the answer is `legacy-unknown`, never a guess.

## 7. Sync participation matrix (new primitives)

Classes: PUSH · PULL · PUSH+PULL · SERVER-ONLY · IMMUTABLE/EVIDENCE · CAS · CAS-FREE · LOCAL-ONLY (derived).

| Primitive | Cloud table | Class |
|---|---|---|
| source artifact | `source_artifacts` | PUSH+PULL · CAS (`retracted_at` is the only update) |
| candidate | `candidates` | PUSH+PULL · CAS |
| external reference | `external_references` | PUSH+PULL · CAS |
| behavior observation | `behavior_observations` | PUSH+PULL · IMMUTABLE/EVIDENCE · CAS-FREE |
| automation authority | `automation_authorities` | PUSH+PULL · CAS (`revoked_at` is the only update) |
| action intent | `action_intents` | PUSH+PULL · IMMUTABLE/EVIDENCE · CAS-FREE |
| intent decision | `intent_decisions` | PUSH+PULL · IMMUTABLE/EVIDENCE · CAS-FREE · partial UNIQUE per intent |
| action execution | `action_executions` | **PULL** · SERVER-ONLY write · IMMUTABLE/EVIDENCE |
| action outcome | `action_outcomes` | **PULL** · SERVER-ONLY write · IMMUTABLE/EVIDENCE |
| household person | `household_people` | PUSH+PULL · CAS |
| responsibility | `responsibilities` | PUSH+PULL · CAS |
| dependency | `dependencies` | PUSH+PULL · CAS |
| recurrence rule | `recurrence_rules` | PUSH+PULL · CAS |
| goal | `goals` | PUSH+PULL · CAS |
| system step | `system_steps` | PUSH+PULL · CAS |
| capacity profile | `capacity_profiles` | PUSH+PULL · CAS · singleton keyed (household, profile) |
| pattern | `patterns` | PUSH+PULL · CAS |
| evidence link | `evidence_links` | PUSH+PULL · IMMUTABLE/EVIDENCE · CAS-FREE |
| attention intent | — | LOCAL-ONLY (derived) |
| briefing projection | — | LOCAL-ONLY (derived) |
| migration lineage | — | LOCAL-ONLY (`migrationEvidence`) |

## 8. Predicted schema delta (recorded BEFORE the shipping migration is edited)

| Dimension | Baseline for this buildout | Predicted | Basis |
|---|---|---|---|
| Application tables | 16 | **34** | +18 listed in §7 |
| Columns | 219 | ~600 (+380, estimate) | 18 tables × ~19 columns; provenance (3) on 9 existing tables; task/event/meal/system facets; `events.source` replaced |
| Constraints | 191 | ~800 (+600, estimate) | per-table CHECK/FK/UNIQUE; typed-reference shape and household-composite FKs |
| Indexes | 82 | ~200 (+120, estimate) | owner/household lookups; one partial index per typed-reference column |
| Triggers | 41 | ~120 (+80, estimate) | force_id, updated_at, log_row_change, immutability, set-once, cycle, authorization |
| Functions | 20 | +5..7 | `resolve_household_context`, authorization-coverage, dependency-cycle, set-once, provenance guard; `current_household_id` removed; `sync_pull` re-signed |
| Policies | 39 | ~90 (+51) | 3 per client-writable table, 1 per pull-only table |
| Privileges (relations / columns / functions / effective) | 281 / 192 / 40 / 159 | all rise; **anon and PUBLIC stay empty** | explicit per-table column grants; no INSERT grant on executions/outcomes |
| Claim version | 1 | **2** | `ClaimTask`, `ClaimNeedsMeItem`, `ClaimCategory` gain provenance and facets; closure gains source artifacts |
| Zero-data interlock | 16 tables + `auth.users` | **34 tables + `auth.users`** | every new table is enumerated in both census blocks and the `LOCK TABLE` list |
| Shipping migration SHA-256 | `275e9d1c…8436` | changes | expected |
| Local fingerprint | `d2b319d0…` / 1300 | changes in every gating dimension | expected |

Each row is a runway, not a prison (Addendum 02 B16). Any revision is recorded below with the original prediction, the discovered requirement, why, the revised
prediction, the actual, and the authority ID.

## 9. J-series and checkpoints

| Commit | Contents | SHA | State |
|---|---|---|---|
| J0 | audit banked | `db0989bea6e4672d537a83f3e16e7fa56ed3b378` | done |
| J1 | this ledger, register, ADRs, predicted delta | `02131234f19066e3fcb3ca95caf26e5ec63f8949` | done |
| J2 | stored provenance on 9 kinds; local v4 + provable backfill + frozen v3; source artifacts and external references (local); confidence writer | _(this commit)_ | in this commit |

The numbering below J1 follows the buildout order (A truth → B action → C shared intelligence → D domain readiness → E durability → F closure); the base
prompt's suggested numbering is a shape, not a contract.

## 10. Defect ledger

Every defect found is recorded with: ID · severity · in/out of FE scope · discovered in · root cause · repair commit · regression test · status.

### Product defects

_None found so far._

### Test-construction defects (Addendum 02 B12 — recorded separately, not counted as product regressions)

| ID | Where | What was wrong | Repair | Status |
|---|---|---|---|---|
| TCD-001 | `tests/legacyCatalogRemediation.test.mjs`, `tests/persistence.test.mjs` | Historical (v1/v2) fixtures were derived from the LIVE state factory. That was harmless while the live shape was v3; once v4 added fields, the fixtures stopped being historical and failed the frozen validators for the wrong reason. | `tests/support/legacyShapes.mjs` derives a historical shape by REMOVING what a later version added. Byte-exact v3 envelopes now come from the v3 code itself (`tests/fixtures/v3`, SHA-256 pinned). | CLOSED |
| TCD-002 | `tests/foundationTruth.test.mjs` (mine) | A convoluted assertion compared two distinct object instances. | Replaced with an identity assertion. | CLOSED |
| TCD-003 | `supabase/tests/sync-integration.mjs` | Row literals lacked the now-required field, so the integrity gate correctly refused them. | Added provenance to the literals. The gate was right. | CLOSED |

## 12. Existing tests modified by v4 (base prompt section 67)

None was weakened. Each moved because a stored shape gained a required field, or because a semantic was replaced with one the audit required.

| Test | Old expectation | New expectation | Why the old one was wrong / what moved | Authority |
|---|---|---|---|---|
| ingestionReasoning: "every producer in the product has a derivable provenance" | `provenanceOfTask(realState, undefined) === 'user-action'` | replaced by "…stores its own provenance" plus a no-fallback test and an explicit legacy-unknown test | It answered for a task that did not exist, from the KIND of entity — the exact fabrication FE-01 names | B4-FE01-001 |
| ingestionReasoning: "provenance survives a persistence round trip" | derived per event | the whole stored provenance object survives | derivation replaced by storage | B4-FE01-001 |
| ingestionReasoning: "demo-origin data is never syncable" | derived | read from stored provenance | same | B4-FE01-001 |
| build3Audit.capture B3-AUD-019 | an edit cannot rewrite `source` | an edit cannot rewrite `provenance`, on tasks AND events, and a patched-in `source` is not stored | **strengthened**: same invariant, now on the field that replaced the flag | B4-FE01-001 |
| events: "create" | `events[0].source === 'user'` | `provenance.producer === 'user-action'` and no `source` key | one source of truth, not two | ADR-001 |
| persistence: "v1 data carried forward" | migrated event `source === 'demo'` | `provenance = demo-seed`, no `source` | v3 -> v4 retires the flag | ADR-004 |
| build3Audit.migration ×5 | sections v2 did not change are deep-equal to the v1 bytes; re-encodes as v3; hostile mislabel ladder 2/3/4 | equal after removing ONLY `provenance`; re-encodes as the current version; ladder 2/3 -> `migration_failed`, 4 -> `invalid_state`, 5 -> `future_version` | the ladder moved up one rung; losslessness is now proven against the authentic v1 bytes with only the one intended addition removed | ADR-023 |
| legacyCatalogRemediation ×9 | `CURRENT_SCHEMA_VERSION === 3`; fixtures from the live factory | `=== 4`; fixtures from `toV3Shape` | TCD-001 | ADR-023 |
| claimPayload, syncEngine, accountRuntime, categories, discoveryPersistence, oneMove, appStore | row literals without provenance | literals carry provenance | fixture shape only | ADR-001 |

## 11. Out-of-scope findings (Addendum 01 A3)

_None yet._
