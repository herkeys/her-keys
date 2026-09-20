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
| Completion | **COMPLETE.** 27 of 27 rows VERIFIED: ACCEPTED 11, EXTENSION 16, STOPPED 0 (§13). Success under Addendum 01 A7 |
| Hostile audit | **Not started, by instruction.** This wave ends at a verified foundation |

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

`CURRENT GAP` records the gap as it stood at entry and is kept as history. `STATUS`, `FINAL CLASSIFICATION` and `EVIDENCE` record how each row closed.

**Classification rule (applied identically to all 27).** `ACCEPTED`: the row's deliverable is a primitive, contract or boundary that is complete in itself and that later features consume unchanged. `EXTENSION`: the row names a user-facing feature (an engine, an ingestion channel, a workflow, a screen) that the completed primitives now carry; building it is additive future work with no foundation gap behind it. Both mean the foundation is complete. Neither means a feature was built.

**Evidence key.** `A1` / `A2` / `A3` = `tests/foundationAcceptance.test.mjs` / `…2` / `…3`, the row's future-shaped test. `SPEC` = `tests/foundationSpecs.test.mjs` (the manifest, the generator, drift). `RT` = `tests/foundationRoundtrip.test.mjs` (projection in both directions, all 18 kinds). `SQL nn` = `supabase/tests/nn-*.sql`. `PARITY` = `supabase/tests/authorization-parity.mjs` (25 cases through both the TypeScript and the SQL statement of the rule). `F1-F16`, `G1-G18`, `H1-H4` = the journeys against the real local Supabase in `supabase/tests/sync-integration.mjs` (F: one device writes, a second hydrates identically, the server writes and both pull, a stranger reads nothing; G: two devices diverge offline; H: a permission she withdraws). `tokenBoundary` = `tests/tokenBoundary.test.mjs`. `RECON` = `supabase/tools/baselines/build4-foundation-reconciliation.json`, which attributes every changed catalog fact to the object and authority that required it.

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: ACCEPTED
- EVIDENCE: A1 FE-01 · SQL 56 (producer is stored and never defaulted; demo-seed refused; confidence only where an inference exists) · SQL 73 (claim v2 carries provenance) · F3, F8, F16 · RECON: 9 existing tables gained provenance

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: ACCEPTED
- EVIDENCE: A1 FE-02 · SQL 57 (no client INSERT grant on executions or outcomes) · SQL 58 §6-7 · PARITY (TS and SQL agree on all 25 authorization cases) · F10-F13 · G1-G6 · H1-H4 · RECON: action_intents, intent_decisions, action_executions, action_outcomes, automation_authorities

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: ACCEPTED
- EVIDENCE: A1 FE-03 · SPEC and RT (the facets project in both directions) · F4-F5 (an exact value; an unanswered facet is NULL, never a plausible default) · RECON: tasks, events, meal_plan_entries, household_systems

### FE-04 — Voice-first Talk It Out
- AUDIT ROW: #4
- AUDIT CAPABILITY: Voice-first Talk It Out (§10)
- USER JOB: "Just tell me what's going on."
- CURRENT GAP: a matched topic yields at most two scripted answers; one messy sentence producing a task, a bill, a worry and a deadline has nowhere to land and nothing links them to the sentence.
- MISSING PRIMITIVE(S): B4-FE01-002, -003, -005
- DOMAIN IMPACT: source artifact (utterance), structured candidates, clarification state, correction, reprocessing.
- LOCAL-PERSISTENCE IMPACT: `sourceArtifacts[]`, `interpretations[]`.
- CLOUD/SCHEMA IMPACT: `source_artifacts`, `interpretations`.
- SYNC IMPACT: 2 push+pull kinds.
- SECURITY IMPACT: owner-only; **no transcript is stored** (ADR-011).
- ACTION/AUTONOMY IMPACT: accepting a candidate is a user decision.
- IMPLEMENTATION APPROACH: ADR-011, -012.
- STATUS: VERIFIED
- FINAL CLASSIFICATION: EXTENSION
- EVIDENCE: A1 FE-04 · SQL 58 §8 (digest, arrival provenance, retraction) · F2-F3, F8 · tokenBoundary (no credential and no transcript anywhere) · RECON: source_artifacts, interpretations

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: EXTENSION
- EVIDENCE: A1 FE-05 · SQL 58 §8-9 · G12-G15 (one document forwarded from two devices is ONE artifact, adopted rather than conflicted) · RECON: source_artifacts, interpretations

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: EXTENSION
- EVIDENCE: A1 FE-06 · derived and LOCAL-ONLY: it has no stored or synced state of its own, so hydration and reconciliation have nothing to add; it reads rows that F8 proves hydrate identically

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: EXTENSION
- EVIDENCE: A1 FE-07 · SQL 58 §14 · F8 · G16-G18 (one capacity profile per person; the loser keeps its setting as evidence) · RECON: capacity_profiles, task facets

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: EXTENSION
- EVIDENCE: A1 FE-08 · RT · SQL 58 §5 · G9-G11 · F5 · RECON: dependencies, task and event facets

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: ACCEPTED
- EVIDENCE: A1 FE-09 · SQL 58 §1 (typed references are composite foreign keys that prove one household) · SPEC (one registry drives the DDL, the sync wiring and the projection) · PW-001 · RECON: one_move_records

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: EXTENSION
- EVIDENCE: A2 FE-10 · SQL 58 §5 and §14 · G9-G11 (a requirement cycle is never stored, by a device or by the database) · F8 · RECON: goals, dependencies

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: EXTENSION
- EVIDENCE: A2 FE-11 · SQL 58 §3 (a child is proven a child) · SQL 57 (owner-only; the membership boundary is untouched) · G7-G8 · RECON: household_people, responsibilities

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: EXTENSION
- EVIDENCE: A2 FE-12 · SQL 58 §4 (one live owner; the handoff lifecycle) · G7-G8 · A3 scenario D · RECON: responsibilities

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: EXTENSION
- EVIDENCE: A2 FE-13 · PARITY · F10-F13 (an execution is written by the server; a device cannot forge one) · tokenBoundary · RECON: action_executions, action_outcomes

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: ACCEPTED
- EVIDENCE: A2 FE-14 · SQL 58 §7 (only she grants; a financial grant is bounded; it is only ever revoked) · PARITY · H1-H4 (a revocation reaches every device; PD-001) · RECON: automation_authorities

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: ACCEPTED
- EVIDENCE: A2 FE-15 · SPEC (the manifest's closed vocabularies and the migration's CHECKs cannot drift) · PARITY (consequence and boundary compared, TS against SQL) · RECON: action_intents, automation_authorities

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: ACCEPTED
- EVIDENCE: A2 FE-16 · SQL 57 (append-only; pull-only) · F10-F11 (server-written rows reach both devices and the lifecycle derives from them) · RECON: action_executions, action_outcomes

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: EXTENSION
- EVIDENCE: A2 FE-17 · derived and LOCAL-ONLY: no delivery channel, token or schedule exists in stored state · tokenBoundary

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: ACCEPTED
- EVIDENCE: A2 FE-18 · A3 scenarios A-D and the no-JSON-bag test (every foundation field is a typed scalar, a typed reference or a typed structure) · F8

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: ACCEPTED
- EVIDENCE: A3 FE-19 · SQL 58 §14 and SQL 57 (evidence links are append-only; the code vocabulary is open but format-checked) · F8 · RECON: evidence_links

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: EXTENSION
- EVIDENCE: A3 FE-20 · SQL 58 §13 (an external identity is unique; who wrote it is stored) · tokenBoundary · RECON: external_references

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: ACCEPTED
- EVIDENCE: A3 FE-21 · SQL 58 §13 · SPEC (the server-originated local id convention) · RECON: external_references

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: ACCEPTED
- EVIDENCE: A3 FE-22 (resolveObservation recognises the echo of Her Keys' own write) · SQL 58 §13 (identity is unique, so the echo cannot be stored twice) · RECON: external_references

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: EXTENSION
- EVIDENCE: A3 FE-23 · composed from shared primitives; coparent-shared stays owner-only (SQL 57) · RECON: household_people, responsibilities, recurrence_rules

### FE-24 — Money OS
- AUDIT ROW: #27
- AUDIT CAPABILITY: Money OS (§25)
- USER JOB: "Bills, fees and reimbursements as obligations I can reason about."
- CURRENT GAP: no amount, currency or monetary type anywhere.
- MISSING PRIMITIVE(S): B4-FE01-020, -008, -007, -004
- DOMAIN IMPACT: exact integer-minor-unit value facet on tasks/events/interpretations; financial consequence; payment authority limit.
- LOCAL-PERSISTENCE IMPACT: `value` facet.
- CLOUD/SCHEMA IMPACT: `value_amount_minor bigint`, `value_currency`, `value_direction`; never floating point.
- SYNC IMPACT: per-kind column lists.
- SECURITY IMPACT: new sensitivity class; owner-only where authority is involved.
- ACTION/AUTONOMY IMPACT: financial action is the highest consequence class.
- IMPLEMENTATION APPROACH: ADR-014. No Money OS, bank connectivity or payments.
- STATUS: VERIFIED
- FINAL CLASSIFICATION: EXTENSION
- EVIDENCE: A3 FE-24 · SQL 58 §2 (exact minor units, never floating point) · F4 · RT · RECON: value columns on tasks, events and interpretations

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: EXTENSION
- EVIDENCE: A3 FE-25 · SQL 58 §11 and §14 (one active rule per subject; ordered steps) · F8 · RECON: system_steps, recurrence_rules, household_systems

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: EXTENSION
- EVIDENCE: A3 FE-26 · SQL 58 §10 and §12 (only she can establish a pattern; independent evidence) · F8 · RECON: patterns, behavior_observations, evidence_links

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
- STATUS: VERIFIED
- FINAL CLASSIFICATION: EXTENSION
- EVIDENCE: A3 FE-27 · SQL 61 (a named household must be hers; one membership resolves; several without a name raise; none is refused) · SQL 50 (the LIMIT-1 function no longer exists) · F14-F15 (isolation) · RECON: resolve_household_context, sync_pull

## 4. Governance IDs

| ID | Primitive | FE rows |
|---|---|---|
| B4-FE01-001 | Stored provenance (`producer`, `sourceArtifactId`) | 01, 10 |
| B4-FE01-002 | Source artifact + lineage anchor | 01, 04, 05 |
| B4-FE01-003 | Structured candidate (stored as `interpretations`, ADR-012) | 04, 05, 10 |
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
- **ADR-012 Candidates are typed drafts.** (Stored as `interpretations`: Daily Load already has DERIVED recommendation "candidates" that must
  never be persisted, and `tests/dailyLoadPersistence.test.mjs` guards that word in stored state. Renaming mine was the right response; loosening the guard was not.) Outside canonical state, so capture precedes classification while `category_id` stays NOT NULL.
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
| interpretation (a structured candidate) | `interpretations` | PUSH+PULL · CAS |
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

## 8A. Actual delta and the B16 revisions

Measured on the official local stack (`supabase db reset --local`, then the locked fingerprint tool), against the predictions in §8, which are left untouched above.

| Dimension | Baseline | Predicted | Actual | Verdict |
|---|---|---|---|---|
| Application tables | 16 | 34 | **34** (`relations` 17 → 35) | as predicted |
| Columns | 219 | ~600 | **713** | REVISED |
| Constraints | 191 | ~800 | **678** | REVISED |
| Indexes | 82 | ~200 | **284** | REVISED |
| Triggers | 41 | ~120 | **104** | REVISED |
| Functions | 20 | +5..7 | **27** (+7 net: 8 added, `current_household_id` removed) | within the range |
| Policies | 39 | ~90 | **85** | REVISED |
| Privileges: relations / columns / functions / effective | 281 / 192 / 40 / 159 | all rise | **587 / 719 / 53 / 309** | as predicted |
| Claim payload version | 1 | 2 | **2** | as predicted |
| Zero-data interlock | 16 tables + `auth.users` | 34 tables + `auth.users` | **34** in the protected list (asserted by the harness, `00-interlock` and ENV B3) | as predicted, with one refinement: `LOCK TABLE` keeps the 14 baseline tables only, because a relation the migration creates cannot be locked on a first run (the file's own comment, unchanged since SD4) |
| Shipping migration SHA-256 | `275e9d1c…8436` | changes | `1e9169de…a7cb` | as predicted |
| Local fingerprint | `d2b319d0…` / 1300 | changes | `199ed4d4…` / **3613** (net +2313) | as predicted |

The revisions below are recorded at closure, from the measured schema, not as each requirement surfaced; the original predictions were never re-issued mid-build. §8 marks every one of them an estimate, and Addendum 02 B16 treats a prediction as a runway.

| Dimension | Original prediction | Discovered requirement | Revised prediction | Actual | Authority |
|---|---|---|---|---|---|
| Columns | ~600 (~19 per new table) | The 18 new tables average **24.4** columns (439 in all): the typed-reference convention spends one nullable typed column per referenced kind, and every foundation row states its provenance explicitly (`producer`, `source_artifact_id`, `confidence`) instead of inheriting it. The nine existing tables net **+55**. | ~710 | 713 | ADR-005, ADR-001, ADR-002 |
| Constraints | ~800 (+600) | An upper-bound sketch. The generator emits a composite key per typed reference and one exactly-one CHECK per reference, and only the vocabularies a table's semantics require. | ~680 | 678 | ADR-005 |
| Indexes | ~200 (+120) | The typed-reference rule puts a partial covering index on EVERY typed column, so indexes scale with the column count above. | ~285 | 284 | ADR-005 |
| Triggers | ~120 (+80) | An upper-bound sketch. Each table takes the standard set; only six trigger functions are bespoke. | ~105 | 104 | ADR-007, ADR-009 |
| Policies | ~90 (+51) | Evidence tables have no UPDATE policy and the two pull-only tables have SELECT alone, so fewer than three per table. | ~85 | 85 | ADR-006, ADR-007 |

## 9. J-series and checkpoints

| Commit | Contents | SHA | State |
|---|---|---|---|
| J0 | audit banked | `db0989bea6e4672d537a83f3e16e7fa56ed3b378` | done |
| J1 | this ledger, register, ADRs, predicted delta | `02131234f19066e3fcb3ca95caf26e5ec63f8949` | done |
| J2 | stored provenance on 9 kinds; local v4 + provable backfill + frozen v3; source artifacts and external references (local); confidence writer | `fdb3d7fd87893bd2bee04de3f45092a913c33834` | done |
| J3 | the complete v4 local shape and its operations: interpretations, behavioral history, authorization / intents / decisions / executions / outcomes, people and responsibility, dependencies, recurrence, goals, system steps, capacity, patterns and evidence, commitment facets, exact money, One Move target registry, attention, briefing inputs, cross-domain related set | `275ad1ad45a0a9025518306a0be3fee34487a979` | done |
| J4 | the cloud schema for the foundation (18 tables generated from one manifest, stored provenance on 9 existing tables), explicit household context, claim v2, and the sync wiring for 28 kinds | `ec4346d32f6a6a68586377e52c6e49e8a7cd09b9` | done |
| J5 | the backend proof: suites 56 / 57 / 58 / 61 / 73, TypeScript ≡ SQL authorization parity, ENV B3, the F journeys, and the repairs they forced (PD-001..PD-005) | `c53cc252a08bc2a26c57447d1e760ca15d0b5063` | done |
| J6 | acceptance: one future-shaped test per FE row and the four cross-domain scenarios | `b615c4894ea444aee806c0b36e8136ade54567d4` | done |
| J7 | fingerprint reconciliation tool and baseline, the token-boundary test, journeys G12-G18 | `1be71a345da3e4301cbd6c707cb3fc8dd3490db8` | done |
| J8 | regression tests for the repaired defects (H1-H4, claim #29, One Move cross-household), each shown to fail without its repair | `598bca042cf21adddffddea45db05f248104c580` | done |
| J9 | this closure: the ledger, the attestation updates, the POST-B4-FOUNDATION-BUILDOUT DELTA in the audit | the commit that carries this table (see `git log`; a document cannot cite its own hash) | done |

J3 consolidated the base prompt's suggested J1-J6: the v4 shape is ONE schema, so its collections land together with the operations and tests that give them meaning rather than in six half-built states of a single AppState. The rest followed as listed. The prompt's numbering is "a shape, not a contract": the backend proof (J5) and the acceptance suites (J6) were kept apart, and the reconciliation and regression work each needed a commit of their own (J7, J8).

The numbering below J1 follows the buildout order (A truth → B action → C shared intelligence → D domain readiness → E durability → F closure); the base
prompt's suggested numbering is a shape, not a contract.

## 10. Defect ledger

Every defect found is recorded with: ID · severity · in/out of FE scope · discovered in · root cause · repair commit · regression test · status.

### Product defects

Every defect below was found by this wave's own tests, before anything shipped, in code this wave introduced, except PW-001. Nothing reached a remote, and no cloud data exists anywhere (the zero-data interlock is intact). `Sev` is the severity had it shipped. All are CLOSED; none is open.

| ID | Sev | Row | Found / repaired | Root cause | Regression test |
|---|---|---|---|---|---|
| PD-001 | **P1** | FE-14, introduced J4 | repaired J5 (`c53cc25`); regression coverage added J8 (`598bca0`) | `automation_authorities_revoke_only` allowed only `revoked_at` to differ, but every update a device sends also carries `origin_updated_at`, so the database refused her revocation. Her Keys held the revocation locally and never sent it: on a second device the permission she had withdrawn stayed in force, and a new proposal there was still permitted `execute_authorized`. | `sync: H1-H4`. **Fails without the repair** (H2, H3, H4 fail; H4 observed `execute_authorized`) and passes with it. Evidence in §13. |
| PD-002 | P2 | FE-04, FE-05, introduced J4 | repaired J5 | `interpretations_artifact_provenance_check` was `source_artifact_id = artifact_id`. A CHECK that evaluates to NULL passes, so a reading could be stored with no provenance link. Now `source_artifact_id IS NOT NULL AND …`. | SQL 58 §9 "it names the artifact it was read from as its provenance too". Fails without the repair (mutation-verified). |
| PD-003 | P2 | FE-23, FE-25, introduced J4 | repaired J5 | The recurrence weekday and month-day CHECKs read `frequency = 'weekly' AND …`. With a NULL frequency (a manual rule) the whole test is NULL and passes, so a manual rule could carry weekdays. Now `COALESCE(frequency = 'weekly', false)`. | SQL 58 §11 "a MANUAL rule cannot carry weekdays". Fails without the repair (mutation-verified). |
| PD-004 | P3 | FE-10, introduced J4 | repaired J5 | A dependency on itself was reported by the cycle trigger as a cycle rather than by the table's `not_self_check`, so the refusal named the wrong rule. | SQL 58 §5 "a thing cannot require itself" expects `not_self_check`. |
| PD-005 | P3 | claim v2, introduced J4 | repaired J5; regression test J8 | The claim closure counted a source artifact once per row that named it, so the claim record over-reported what it carried. | SQL 73 #29 (a task and a Needs Me item read from one artifact). **Fails without the repair** (mutation-verified). |
| PW-001 | P3 | FE-09, **prior wave** (G2 `6db2d5a`) | repaired J4 (`ec4346d`); regression test J8 | `one_move_records.target_task_id` and `target_needs_me_id` were single-column foreign keys, so a One Move in one household could name a task or Needs Me item from another household (the row's own RLS checked the One Move, not its target). Exposure was limited by unguessable server-generated ids. Now composite `(target, household_id[, profile_id])` keys like every other typed reference. | SQL 58 §1 "a task from ANOTHER household cannot be its target". **Fails without the repair** (mutation-verified). |

**Design findings** (resolved in design, before any DDL was applied; not defects):

- **DF-001. The reference graph had a cycle.** `task → source artifact → external reference → task`, and `external reference ↔ action execution`. A cycle of required foreign keys cannot be inserted in any order. Resolved by removing the two back-pointers (`source_artifacts.external_reference_id`, `external_references.write_execution_id`): an external reference names its artifact through provenance, and the execution that wrote it is found by the reference rather than stored on it. `tests/foundationSpecs.test.mjs` asserts the reference graph is acyclic.
- **DF-002. Concurrent identical facts are one entity, not a conflict.** Two devices that record the same document (same digest), the same external identity, or the same dependency edge before seeing each other describe ONE thing, so the sync engine ADOPTS the cloud's row: the local id maps to it and whatever names it keeps naming it. Genuinely competing answers (a decision, a live owner, a capacity profile, a cycle) DISPLACE the loser, whose intent is kept as conflict evidence. Both branches are proved against the real database (G1-G18).

**Observation.** OBS-001: `cursor: the barrier does NOT advance past the in-flight transaction` (an existing BE03 check, two concurrent sessions) failed once during this wave and passed in every later full run. Its cause was not established; it is timing-sensitive by construction. It is not counted as a defect. The hostile audit should stress it.

**Observation.** OBS-002: `supabase/tools/schema-fingerprint.mjs --source local` shells out to `supabase db query --local`, which on CLI 2.109.1 refuses the tool's multi-statement SQL (`cannot insert multiple commands into a prepared statement`). The tool is locked and was not changed. Every fingerprint in this wave ran the tool's own SQL through `psql` in the local container, the method `BUILD4_BE02_CLAIM_CORRECTION.md` already documents, and the per-dimension comparison against the baseline was scripted. The `--source local` path is a tooling gap for the hostile audit, not a schema finding.

### Test-construction defects (Addendum 02 B12 — recorded separately, not counted as product regressions)

| ID | Where | What was wrong | Repair | Status |
|---|---|---|---|---|
| TCD-001 | `tests/legacyCatalogRemediation.test.mjs`, `tests/persistence.test.mjs` | Historical (v1/v2) fixtures were derived from the LIVE state factory. That was harmless while the live shape was v3; once v4 added fields, the fixtures stopped being historical and failed the frozen validators for the wrong reason. | `tests/support/legacyShapes.mjs` derives a historical shape by REMOVING what a later version added. Byte-exact v3 envelopes now come from the v3 code itself (`tests/fixtures/v3`, SHA-256 pinned). | CLOSED |
| TCD-002 | `tests/foundationTruth.test.mjs` (mine) | A convoluted assertion compared two distinct object instances. | Replaced with an identity assertion. | CLOSED |
| TCD-003 | `supabase/tests/sync-integration.mjs` | Row literals lacked the now-required field, so the integrity gate correctly refused them. | Added provenance to the literals. The gate was right. | CLOSED |
| TCD-004 | `tests/foundationAcceptance*.test.mjs` (new, mine) | The first drafts asserted things the domain correctly refuses: a non-hex digest, `returnToSelf` on a declined responsibility, an `evidenceLinks.support` of `pattern`, a "risk" attention item with no overdue high-consequence task, a token scan run against a household that carried a One Move. | Corrected the tests. The domain was right every time. | CLOSED |
| TCD-005 | `supabase/tests/56..73` (new, mine) | Suite-construction errors while writing the new SQL suites: unbalanced parentheses, a `:'var'` psql variable that is not interpolated inside a `$f$` body (now passed as a parameter), psql `\'` escapes, and a claim-row filter on `kind = 'claim'` when the bootstrap row is `kind = 'bootstrap'`. | Corrected. None touched a shipped object. | CLOSED |

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
| claimPayload, accountRuntime | `claimPayloadVersion === 1` | `=== 2` | the payload gained provenance, facets and the source-artifact closure, and version 1 is refused rather than completed by guessing | B4-FE01-030, ADR-024 |
| needsMe, build3Audit.oneMove | `resolveNeedsMeItem(state, id)` | `resolveNeedsMeItem(state, id, ctx())` | resolving now records the completion it just observed, and a record needs a clock and an id source | B4-FE01-006 |
| categories | `starterCategories('hh-1')` equals the state's categories | `starterCategories('hh-1', demoProvenance())` | the same eight rows; a demo household says the starters are `demo-seed`, every other household `system-derived` | ADR-001 |
| syncEngine | `schemaVersion: 3` | `CURRENT_SCHEMA_VERSION` | the literal envelope followed the version it was written against | ADR-023 |
| backend `00-interlock` | 16 application tables | 34 | the zero-data census enumerates every new table | B4-FE01-029 |
| backend `10`, `30`, `95` | inserts set `events.source` | no `source` | the column was retired; provenance is stored on the row | ADR-001 |
| backend `50-privileges` | authenticated holds EXECUTE on `current_household_id()` and `sync_pull(xid8)` | on `resolve_household_context(uuid)` and `sync_pull(xid8, uuid)`, **plus a new assertion that the LIMIT-1 function no longer exists** | a household is named, never guessed | B4-FE01-026, ADR-020 |
| backend `70`, `72` | `claimPayloadVersion: 1` and rows without `producer` | `2`, and every claimed row states its producer | claim v2 | B4-FE01-030, ADR-024 |
| backend `run.mjs`, helpers `01`, `05`, `sync-integration` | 16 tables; no default `producer`; row literals without provenance | 34 tables, ENV B3, the parity call, `producer` default assertions, a TEST-ONLY default (`05-test-defaults.sql`), provenance in the literals | the shipped schema has no `producer` default; the fixtures that predate it get one only inside the disposable test databases | B4-FE01-001, TCD-003 |

## 11. Out-of-scope findings (Addendum 01 A3)

| ID | Kind | Finding | Handling |
|---|---|---|---|
| OOS-001 | worktree provenance (not a product defect) | `app.json` gained `ios.bundleIdentifier: "com.herkeys.app"` at 15:45 on 2026-09-20, between the J2 and J3 commits. The change was made by something outside this wave (the file's mtime falls inside the session, and no step here writes it). `git add -A` swept it into J3 (`275ad1ad`). | **Left in place.** It may be the owner's own work (an iOS bundle identifier is what an EAS build needs), so reverting it would destroy someone's change; keeping it costs nothing. Staging is explicit from J4 onward so it cannot recur. The owner should confirm it is intended. It is not part of the 27-row scope and does not affect the schema fingerprint. |
| OOS-002 | worktree provenance (not a product defect) | `app.json` was modified again at 17:33 on 2026-09-20, after J3: an Android `package` (`com.herkeys.app`), `extra.eas.projectId` and `owner`. That is what an EAS project setup writes; nothing in this wave writes it. | **Left untouched and never staged.** Every commit from J4 onward stages `docs src tests supabase` only. It is the owner's working change, and the reason the worktree is not clean at the end. It affects no schema, fingerprint or test. |

## 13. Closure

### Outcome

Derived from the register by `tests/foundationLedger.test.mjs`, which asserts this table equals the counts it derives.

| Final classification | Rows |
|---|---|
| ACCEPTED | 11 |
| EXTENSION | 16 |
| STOPPED | 0 |

ACCEPTED: FE-01, 02, 03, 09, 14, 15, 16, 18, 19, 21, 22. EXTENSION: FE-04, 05, 06, 07, 08, 10, 11, 12, 13, 17, 20, 23, 24, 25, 26, 27. ACCEPTED + EXTENSION = 27 and STOPPED = 0, so **B4-FOUNDATION-BUILDOUT-01 = PASS** (Addendum 01 A7). Twenty-seven foundation gaps are now none. No screen, executor, provider connector or collaboration was built, and none was meant to be.

### Gates at close

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| App tests (`npm test`) | **705 / 705** (entry 454 / 454) |
| Backend harness (`node supabase/tests/run.mjs`) | **684 / 684** (entry 365 / 365) |
| Foundation SQL generator `--check` | up to date: no drift between the manifest and the shipping migration |
| Baseline migration SHA-256 | `8bc38d66fcffbb9fa83502329bd4738a53a8446dd5ce89327013751872f8f16f`, **unchanged** |
| Shipping migration SHA-256 (working-tree form) | `1e9169de4cf21c46e2167089328de94ce07cb1fcf005c0461dece1b28ec8a7cb` |
| Official local fingerprint | `199ed4d4c1b37cd654b5853e91cbde27` / 3613 facts, recomputed after the last mutation test restored the stack; all 16 dimension digests equal the baseline (see OBS-002 for how it is measured) |
| Reconciliation | 2350 facts added, 37 removed: **2387 explained, 0 unexplained**, across 44 objects |
| Expo Doctor | 20 / 21, the same three pre-existing patch-level mismatches (`expo`, `expo-constants`, `expo-router`); not upgraded |
| Android export | succeeded |
| Remote commands | **NONE** |

### The shipping migration's hash chain (Addendum 01 A5, Addendum 02 B24)

Working-tree (CRLF) form, computed at every commit that touched the file. Nothing was deleted or rewritten; each value was true when it was written.

| Commit | SHA-256 (first 16 hex unless the value is quoted in full elsewhere) | Label |
|---|---|---|
| G2 `6db2d5a` | `44603a279325514c` | PRE-B4-BE02-OR-001 |
| `24e9fae` | `9feac67283896d31` | B4-BE02 CURRENT, B4-BE03 entry |
| `8c56d6e` | `529e3891101231fa` | B4-BE03 CURRENT |
| `f8fa0e6` | `275e9d1cd81a3d4361715a6d91a084ad95de2ccbd83c67f56e6ca0d3143e8436` | **PRE-B4-FOUNDATION-BUILDOUT-01** |
| J4 `ec4346d` | `45fb73c5cb0bb378` | intermediate, superseded within this wave |
| J5 `c53cc25` | `1e9169de4cf21c46e2167089328de94ce07cb1fcf005c0461dece1b28ec8a7cb` | **CURRENT (as of B4-FOUNDATION-BUILDOUT-01)** |

### B13 — evidence for the one P1 repaired (PD-001)

| Field | Record |
|---|---|
| Defect | A revocation could not reach the database, so a permission she withdrew stayed in force on every other device |
| How it surfaced | The migration was corrected in J5. This ledger's own review then found that NO test exercised the client's real revoke path, so the repair had no regression test until J8 |
| Reproduction | `enforce_single_column_transition('revoked_at')` reinstated on `automation_authorities_revoke_only` in the LOCAL stack only, then `sync: H1-H4` |
| Output with the defect present | `H1` ok · `H2 … [{"revoked_at":null}]` FAIL · `H3 … null` FAIL · `H4 … execute_authorized` FAIL |
| Repair | `enforce_single_column_transition('revoked_at', 'origin_updated_at')`: the one metadata column every client update carries may change alongside `revoked_at`, and nothing else may |
| Output with the repair | `H1 … [null]` · `H2 … [{"revoked_at":"2026-09-20T22:08:39.182+00:00"}]` · `H3 … 2026-09-20T22:08:39.182Z` · `H4 … suggest` |
| Adjacent surface | SQL 58 §7 still holds: a revocation is set once and cannot be moved or undone, and nothing else on an authority is editable, even by the table owner |
| Restoration | `supabase db reset --local`; the fingerprint returned to `199ed4d4…` / 3613 |
| Remote | none |

### B14 — safety defects outside the FE register

**None.** PW-001 is the only prior-wave defect; it is inside FE-09's remit and is P3.

### B26 — final defect table

| | P0 | P1 | P2 | P3 | Open |
|---|---|---|---|---|---|
| Product defects | 0 | 1 (PD-001) | 2 (PD-002, PD-003) | 3 (PD-004, PD-005, PW-001) | **0** |

Also recorded, not counted as product defects: 5 test-construction defects (TCD-001..005), 2 design findings (DF-001, DF-002), 2 out-of-scope worktree findings (OOS-001, OOS-002), 2 observations (OBS-001, OBS-002).

### Test counts

| | Entry | Close |
|---|---|---|
| App tests | 454 | **705** |
| Backend harness checks | 365 | **684** |

New: `foundationSpecs`, `foundationRoundtrip`, `foundationAcceptance`, `foundationAcceptance2`, `foundationAcceptance3`, `foundationOps`, `foundationTruth`, `foundationLedger`, `migrationV3ToV4`, `tokenBoundary` (app); suites 56, 57, 58, 61, 73, the authorization parity check, ENV B3, and journeys F1-F16, G1-G18, H1-H4 (backend). Every existing test that moved is in §12, none weakened.

### What this wave did not do

It built no screen, no executor, no provider connector, no notification delivery, no calendar or email integration, no collaboration and no Money OS. It touched no Staging or Production project and ran no remote command. It did not amend history and did not start the hostile audit. Its next step, by instruction, is the Build 4 local hostile integration audit, which needs the owner's go-ahead. Nothing here authorizes Staging.
