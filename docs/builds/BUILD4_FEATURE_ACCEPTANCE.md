# B4-FEATURE-ACCEPTANCE-01 — Ultimate Product Framework Audit

| | |
|---|---|
| Mode | **READ-ONLY PRODUCT / ARCHITECTURE ACCEPTANCE AUDIT** |
| Branch | `build/04-cloud-identity-sync` |
| HEAD | `32b1601bc7edfa52992a92f1a744167211ee36c1` (verified, worktree clean) |
| Shipping migration SHA-256 | `275e9d1cd81a3d4361715a6d91a084ad95de2ccbd83c67f56e6ca0d3143e8436` (verified) |
| Local Build 4 gating digest | `d2b319d0253613d6a5c1dd36ef906da6` / 1300 facts (verified against `supabase/tools/baselines/build4-local-fingerprint.json`) |
| App tests | **454 / 454** (re-run this pass) |
| Backend harness | **365 / 365** (re-run this pass, local disposable databases only) |
| Remote commands | **NONE** |
| Implementation changes | **NONE** — this document is the only artifact written |
| Question answered | Can the current Build 4 foundation support an AI household chief of staff, or does it force expensive rewiring later? |
| Later change | **Read §15 first.** Everything above is the audit as written at `32b1601`. The classification, the shipping migration hash and the fingerprint quoted here are the PRE-B4-FOUNDATION-BUILDOUT-01 values; the CURRENT ones are in §15 |
| Result | **FOUNDATION EXPANSION REQUIRED BEFORE STAGING** |

This audit does **not** authorize implementation, Staging, or Production.

---

## 1. Entry gate

| Check | Expected | Observed | Result |
|---|---|---|---|
| HEAD | `32b1601b…` | `32b1601bc7edfa52992a92f1a744167211ee36c1` | PASS |
| Worktree | clean | clean (`git status --porcelain` empty) | PASS |
| Branch | `build/04-cloud-identity-sync` | same | PASS |
| Shipping migration digest | `275e9d1c…` | `sha256sum supabase/migrations/20260919231500_build4_cloud_schema.sql` matches | PASS |
| Local gating digest / fact count | `d2b319d0…` / 1300 | `build4-local-fingerprint.json:83-84` | PASS |
| App tests | 454 / 454 | `npm test` → `pass 454 / fail 0`, 92 suites | PASS |
| Backend harness | 365 / 365 | `node supabase/tests/run.mjs` → `365/365 checks passed`, exit 0 | PASS |

Audit proceeds. No stop-rule condition (§59) is met.

---

## 2. Current Build 4 foundation — summary

What exists is a **narrow, deep, unusually disciplined foundation**. The quality is not in question; the question is reach.

**Strengths that carry directly into the product ambition**

- **One canonical household state.** `AppState` (`src/domain/state.ts`) is a single strict-validated object holding every durable fact. Every reasoning surface reads it — `projectStateDay()` → Daily Load → One Move — with no duplicated screen state. This is exactly the substrate cross-domain reasoning needs.
- **Derived intelligence is never persisted.** Daily Load, load tier, Operating Profile, life status, One Move view and provenance are all recomputed. No inference can be read back as a stored fact.
- **A real confidence boundary.** `promoteConfidence()` (`src/domain/reasoning/confidence.ts`) is the single function permitted to raise a level; persistence takes no part in it; only explicit user confirmation reaches `established`.
- **A real conversation/mutation boundary.** `classifyConversationOutcome()` decides in one testable place whether a turn changed the household.
- **Structural child-subject integrity.** The `(id, household_id, member_type)` composite foreign key (NHR-01 / A2) proves a child subject is a real child of the same household with no trigger and no RLS involved.
- **A correct incremental sync engine.** `change_log` is a pointer log on an `xid8` cursor (not `seq`, not `updated_at`); per-row `revision` is CAS only; queue coalescing reads canonical state at push time; unresolved intent becomes durable evidence and is never discarded.
- **Typed One Move targets.** `target_task_id` / `target_needs_me_id` with a closed shape CHECK — the deliberate replacement for the unsafe polymorphic reference that produced `MIGRATION_EVIDENCE_REASONS = ['LEGACY_REAL_CATALOG_ONE_MOVE']`.
- **An immutable decision ledger.** `action_records` is append-only at three layers: no UPDATE/DELETE policy, no UPDATE grant, and `forbid_ledger_mutation()` which binds even the table owner.

**The shape of the limitation**

The foundation models **what a household is** with real rigour. It does not yet model **what a household owes, who owes it, what may be done about it without asking, or where a fact came from**. Those four are the cross-cutting primitives the ambition needs, and each is required by five or more future modules.

---

## 3. Domain inventory

### 3.1 Local durable state — `AppState`, local schema v3

| Collection | Cap | Key fields | Scope | Sync |
|---|---|---|---|---|
| `origin` | — | `'demo' \| 'empty'` | — | never (`demo` refused, B4-P0-010) |
| `household` | 1 | `id`, `displayName` | `household` | mapping-only (claim) |
| `user` | 1 | `id`, `displayName`, `timezone` | `personal` | mapping-only (claim) |
| `children[]` | 20 | `id`, `displayName`, `birthDate` | `child` | mapping-only (claim) |
| `categories[]` | 200 | `name`, `systemRole`, `status`, `sortOrder` | any | yes |
| `events[]` | 5000 | `title`, `categoryId`, `subjectMemberId`, `startsAt`, `endsAt`, `location`, `notes`, `commitment`, `status`, `travelMinutesBefore/After`, `preparationMinutes`, `source` | any | yes |
| `tasks[]` | 5000 | `title`, `categoryId`, `subjectMemberId`, `durationMinutes`, `commitment`, `dueDate`, `plan`, `notes`, `status`, `completedAt` | any | yes |
| `systems[]` | 500 | `name`, `description`, `categoryId` | any | yes |
| `meals[]` | 1000 | `date`, `title`, `categoryId` | any | yes |
| `onboarding` | 1 | `goalIds`, `strengthIds`, `struggleIds`, `lastStep`, `completedAt` | `personal` | yes |
| `oneMoves[]` | 4000 | `forDate`, `targetId`, `targetType`, `status`, `decidedAt`, `completedAt` | `personal` | yes |
| `needsMe[]` | 1000 | `title`, `status`, `dueDate`, `categoryId` (nullable), `createdAt` | `personal` | yes |
| `discovery` | 1 | `topicId`, `answers[≤2]{questionId, optionId}` | `personal` | yes |
| `actions[]` | 10 000 | 7-way discriminated union; `logicalDate`, `actor`, `source`, `approval`, `targetId`, `reason`, `before`, `after` | `personal` | insert-only |
| `migrationEvidence[]` | 4000 | `kind: 'one-move'`, `reason`, `sourceSchemaVersion`, `original{…}` | — | **local-only, never synced** |

Envelope (`src/persistence/envelope.ts`): `schemaVersion` (3), `appVersion`, `savedAt`, `writeSeq`, `identity` (binding / claim receipt / quarantine / `SyncNamespace`), `data`.

### 3.2 Derived, never persisted

`DailyLoadAssessment`, `DailyLoadIssues`, `LoadTier`, `OperatingProfile`, `ConversationState`, `DayView` (`projectStateDay`), life status, tomorrow preview, `OneMoveView`, and **all provenance**.

### 3.3 Cloud — 16 tables

Client-syncable (10 kinds → 10 tables): `household_categories`, `events`, `tasks`, `household_systems`, `meal_plan_entries`, `onboarding_state`, `one_move_records`, `needs_me_items`, `discovery_records` (+`discovery_answers` as a child), `action_records`.

Claim-only, no client write grant: `households`, `household_members`, `profiles`.

Server-only / transport: `account_claims` (no client access), `change_log` (client `SELECT` only; written solely by the `SECURITY DEFINER` `log_row_change()` trigger).

Immutable: `action_records`. Soft-deletable: `discovery_records` only (`deleted_at`). Every other kind has no DELETE policy and no DELETE privilege.

### 3.4 Identity, security and claim

- **Account identity is the Supabase Auth user UUID and nothing else** (`src/domain/account/identity.ts`). Apple/Google are authentication *provenance*, deliberately separate.
- **One account owns exactly one household, and a household has exactly one owner** — `household_members_one_household_per_owner_uq` and `household_members_one_owner_per_household_uq`.
- **`household_members` has no client INSERT at all.** Members exist only because `bootstrap_account` or `claim_local_household` made them.
- **A member is an account-bearing adult or a non-account child, and nothing else** — `household_members_check` requires `member_type='adult' AND profile_id IS NOT NULL` or `member_type='child' AND profile_id IS NULL AND birth_date IS NOT NULL`.
- **Scope drives RLS.** `private.can_access_scoped_row()`: `household`/`child` → any member; `personal`/`professional`/**`coparent-shared`** → owner only.
- **Claim payload v1** carries One Move history plus its minimum transitive dependency set (task → category → child subject; needsMe → category) **and nothing else**; the server rejects extras rather than ignoring them.
- **RevenueCat entitlement is never persisted into household state** (`src/monetization/entitlement.ts`, enforced by a source scan in `tests/monetization.test.mjs`).
- **Tokens never reach household storage** (B4-P0-013); sessions live behind `src/domain/account/secureSession.ts`.

---

## 4. Cross-cutting intelligence primitive inventory (§8)

Verified against `src/domain/state.ts`, `src/types/`, `src/domain/reasoning/`, and `supabase/migrations/20260919231500_build4_cloud_schema.sql`. Absences were confirmed by exhaustive grep over `src/`, `app/` and `supabase/migrations/`.

| # | Primitive | Status | Evidence — what exists / what does not |
|---|---|---|---|
| 1 | SOURCE / PROVENANCE | **PARTIAL** | `ProvenanceSource` union of 7 exists, incl. unused `import-sync` and `ai-inference`. But it is **derived, never stored**: `provenanceOfTask()` returns `'user-action'` unconditionally for a real household. `events.source` is the only stored source column and the cloud CHECK narrows it to `'user'`. Correct only while each entity has exactly one producer. |
| 2 | CONFIDENCE | **PARTIAL** | Vocabulary + `promoteConfidence()` boundary exist and are tested. **No durable record carries a confidence.** Only `WorkingHypothesis.confidence` (in-memory) and `OperatingProfileInsight.confidence` (recomputed, hardcoded `'possible'`). No column anywhere. |
| 3 | OWNER / RESPONSIBLE PARTY | **MISSING** | `owner_profile_id` is a **privacy** owner driving RLS, and is not even stored locally — it is derived from `scope` at projection time (`ownerFor()`). `subjectMemberId` is the *subject*. Nothing answers "who is responsible for doing this". |
| 4 | SUBJECT / CHILD | **PRESENT** | `subjectMemberId` + composite FK `(id, household_id, member_type)` → `household_members`, `ON DELETE RESTRICT`. Structural, trigger-free. |
| 5 | SCOPE | **PRESENT** | 5 values, CHECK-enforced on every scope-bearing table, RLS-enforced via `can_access_scoped_row`, paired with an `owner_scope_check` so a private row can never lack an owner. |
| 6 | NEEDS-ME | **PARTIAL** | A separate personal-scope entity (`title`, `status`, `dueDate`, nullable `categoryId`), **not a dimension**. "Does this task need me personally?" is unaskable. |
| 7 | DELEGATABILITY | **MISSING** | `src/domain/recommendationActions.ts:17` states it outright: *"DELEGATE and REPLACE are not implemented — there is no delegate-target concept."* |
| 8 | DELEGATION STATE | **MISSING** | No requested / accepted / declined / acknowledged representation anywhere. |
| 9 | ESTIMATED EFFORT | **PARTIAL** | `task.durationMinutes` (0–1440, NOT NULL) only. Events imply duration from start/end and add `preparationMinutes`. `needsMe`, `systems`, `meals` carry **no** effort — `needsMeAsOneMoveItem()` deliberately omits `estimatedMinutes` rather than guess. |
| 10 | HARD VS FLEXIBLE | **PRESENT** | `commitment: 'fixed' \| 'flexible'` on tasks and events, CHECK-enforced both sides, consumed by `isMovable()` and `ProtectItemAction`. Absent on every other kind. |
| 11 | DEADLINE | **PARTIAL** | `task.dueDate` and `needsMe.dueDate`, both `date` — **calendar-day granularity only**. No time-of-day deadline is representable. |
| 12 | EARLIEST / LATEST WINDOW | **MISSING** | `TaskPlan` is `unplanned \| day{date} \| timed{startsAt}` — a *point*, never a window. Grep for earliest/latest/window fields returns only Daily Load's in-memory transition gaps. |
| 13 | DEPENDENCY | **MISSING** | No dependency, prerequisite or parent/child relation on any entity. (`DEPENDENCY_RANK` in `syncTypes.ts` is push ordering, not a product graph.) |
| 14 | RECURRENCE | **MISSING** | Zero occurrences of recurrence / rrule / repeat in `src/domain`, `src/types`, the migrations or the editors. |
| 15 | CAPACITY IMPACT | **PARTIAL / derived** | `CAPACITY_DAY_START_MINUTES = 6*60`, `CAPACITY_DAY_END_MINUTES = 22*60` and `REQUIRED_TRANSITION_BUFFER_MINUTES = 45` are **module constants**, identical for every household. `availableMinutes` / `neededMinutes` / `pressureMinutes` are computed, never stored, never per-person. |
| 16 | TRAVEL / TRANSITION | **PARTIAL** | `travelMinutesBefore`, `travelMinutesAfter`, `preparationMinutes` (0–240) exist **on events only**. Tasks have none, so a task can never carry travel. |
| 17 | FINANCIAL IMPACT | **MISSING** | No amount, currency or monetary type anywhere. `money` exists only as a `systemRole` label on a category. |
| 18 | CONSEQUENCE / RISK | **MISSING** | The three reason codes (`transition_buffer_shortfall`, `capacity_pressure`, `user_requested_protection`) are diagnostic causes, not consequence classes. |
| 19 | AUTOMATION ELIGIBILITY | **MISSING** | Nothing. |
| 20 | APPROVAL / AUTONOMY LEVEL | **PARTIAL** | `approval: 'approved' \| 'declined'` records the *outcome* of a per-action human decision. `actor: z.literal('user')` and cloud `action_records_source_check` pins `source = 'her_keys_recommendation'`. `requiresApproval(semantic)` exists as a rule. **No stored authority or policy model of any kind.** |
| 21 | REVERSIBILITY | **PARTIAL** | `before`/`after` pairs on 5 of 7 action types describe *what* an undo would restore. No reversibility classification, no undo executor. |
| 22 | EXTERNAL SOURCE IDENTITY | **MISSING** | No provider, external id, etag, version or direction column. `local_id` + `origin_device_id` are Her Keys install identity, not external-system identity. |
| 23 | EXTERNAL ACTION IDENTITY | **MISSING** | Nothing. |
| 24 | REASONING EVIDENCE | **PARTIAL** | `ActionRecord.reason` is genuinely strong: a typed discriminated payload, uuid-validated references (`windowBeforeEventId`, `windowAfterEventId`, `recommendedTaskId`, `consideredTaskId`), size-bounded, with `action_records_type_agreement_check` cross-validating type × approval × `reason.code`. But it is a **closed union of 3 codes**, and it exists only on ledger rows. One Move stores **no** reason at all — "why this One Move?" has no evidence record. |
| 25 | ACTION RESULT / OUTCOME | **MISSING** | The ledger records a decision, not an execution attempt or its result. And because the ledger is immutable, an outcome can never be attached to an existing row. |
| 26 | ACKNOWLEDGEMENT / ACCEPTANCE | **MISSING** | No second party exists to acknowledge anything. |
| 27 | PATTERN STATE | **MISSING as durable** | `semanticOf` has a `'pattern'` semantic and `mayMutateDurableState()` correctly excludes it — the *rules* exist, the *storage* does not. |

**Present: 3. Partial: 9. Missing: 15. Not needed as shared primitive: 0.**

### 4.1 A silent absence worth naming: completion history

There is **no behavioral history**. `task.completedAt` is a mutable field on the task, not an append-only event. Completing, reopening and re-completing a task leaves a single timestamp. `action_records` records decisions on *Her Keys recommendations* only — it never records that she finished something on her own.

Every capability that depends on "what she actually does over time" — Pattern Intelligence, Operating Profile promotion beyond `possible`, capacity learning, delegation reliability, the product contract's own §14 *"96% of financial obligations were completed on time"* example — has **no source data today**.

---

## 5. The universal obligation / commitment question (§9)

**Do these objects need a shared intelligence contract, or does each module add its own dimensions?**

The candidate objects — task, school form, bill, appointment, chore, reimbursement, delegated responsibility, work deadline, meal preparation, repair, packing requirement — all need, at minimum: *deadline · effort · responsibility · flexibility · consequence · dependency · Needs-Me · capacity impact · automation eligibility*.

**Evidence that independent addition produces drift.** It already has, in miniature:

- `commitment` exists on `task` and `event` but not on `needsMe`, `system` or `meal`.
- `dueDate` exists on `task` and `needsMe`, but they are *different lanes* — `needsMe` is personal-scope-only, has no category requirement, no duration and no commitment, while `task` requires a category.
- Travel and preparation minutes exist on `event` but not on `task`, so an errand modelled as a task can never carry travel while the same errand modelled as an event can.
- `estimatedMinutes` on `OneMoveItem` is optional *because* one of its two source kinds has no duration and the code refuses to fabricate one.

Four modules, four inconsistent answers to the same three questions. Adding money, home, kids-forms, meals-prep and work independently multiplies that by five.

**Verdict: a reusable typed contract is required — and it must not be a table.**

The correct shape given this codebase is a **typed facet interface that concrete domain types implement**, not a new entity and not a JSON blob:

```
CommitmentFacets            // a TypeScript interface + zod facet schema
  dueAt            : Instant | null      // replaces/augments date-only dueDate
  effortMinutes    : number | null
  flexibility      : 'fixed' | 'flexible' | 'deferrable'
  earliestStart    : Instant | null
  latestFinish     : Instant | null
  consequence      : 'low' | 'medium' | 'high' | 'critical' | null
  needsMePersonally: boolean | null
  responsibleId    : MemberRef | null
  transitionMinutes: { before, after } | null
```

Tasks stay tasks; events stay events; bills, when they arrive, are bills. Each implements the facets it can honestly answer, and reasoning reads the facet interface rather than each module's private column names. Storage is per-table nullable columns — which is what makes it additive.

**Classification: FOUNDATION EXPANSION REQUIRED — F2.** The *shape* decision must be made before the second implementer exists; the *columns* can land per module.

---

## 6. Feature Acceptance Matrix

Columns are compressed for width. Every row states: current foundation · current evidence · missing primitives · impact axes · required change · classification · rationale. Impact axes are abbreviated as **D** domain, **L** local persistence, **C** cloud/schema, **S** sync, **Sec** security/scope, **A** action/autonomy.

### 6.1 Cross-cutting foundations

| # | Capability | User job | Current foundation | Current evidence | Missing primitives | D / L / C / S / Sec / A impact | Required change | Class | Rationale |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Stored provenance / source identity** | "Where did this come from, and may you trust it?" | `ProvenanceSource` union of 7; derived per entity | `src/domain/reasoning/provenance.ts`; `events.source` CHECK narrowed to `'user'` in cloud | stored source discriminator; producer identity; original-source reference | D: `source` facet on 8 kinds · L: v4 migration, derived backfill · C: `ADD COLUMN` ×8 + widen `events_source_check` · S: `UPDATABLE_COLUMNS` + projection + apply ×8 · Sec: none · A: none | Store what is currently derived, on every content row, before a second producer exists | **FOUNDATION EXPANSION REQUIRED** | The derivation is sound *only because each entity has exactly one producer*. `provenanceOfTask()` returns `'user-action'` unconditionally. `isUserStated()` reads that value and feeds `promoteConfidence()`, so a wrong provenance silently lowers the corroboration threshold from 3 to 1 and lets a model's inference reach `likely`. That is a correctness coupling into a **frozen** boundary, not a missing convenience. |
| 2 | **Action authorization, consequence & outcome** | "May you do this without asking, and did it work?" | `ActionRecord`: 7 types, `approval`, typed `reason`, `before`/`after`; immutable ledger | `src/domain/state.ts` `actionBase`; `action_records_*_check` ×8 in migration | authority/policy model; consequence class; proposal state; execution attempt; external action id; result; observation | D: new proposal + outcome types · L: v4 · C: new table(s), widen 3 CHECKs, widen `change_log_entity_table_check` · S: 1–2 new kinds, new `sync_push` allow-list entries · Sec: new RLS, new grants · A: **the whole axis** | Widen `actor`/`source`, add authority + consequence, add a mutable proposal/outcome seam beside the immutable ledger | **FOUNDATION EXPANSION REQUIRED** | Today the first autonomous action **cannot be inserted at all**: local `actor: z.literal('user')` and cloud `CHECK (source = 'her_keys_recommendation')` are hard refusals, not gaps. The ledger is immutable at three layers, so an outcome can never be attached to an action row — an outcome model must be a sibling, and that sibling's relationship to the ledger is a schema decision, not a feature decision. |
| 3 | **Universal commitment contract** (§9) | "Treat an obligation as an obligation, whatever module it lives in" | `commitment` + `durationMinutes` + `dueDate` on tasks; partial on events | §5 above | the 9 facets in §5 | D: facet interface · L: v4 · C: nullable columns per table · S: per-kind column lists · Sec: none · A: feeds consequence | Define the typed facet contract now; add columns per module | **FOUNDATION EXPANSION REQUIRED** | Drift is already observable across four existing kinds. |

### 6.2 Capture and ingestion

| # | Capability | User job | Current foundation | Current evidence | Missing primitives | Impact | Required change | Class | Rationale |
|---|---|---|---|---|---|---|---|---|---|
| 4 | **Voice-first Talk It Out** (§10) | "Just tell me what's going on" | Deterministic scripted discovery loop; structured-answer-only persistence; conversation boundary | `src/features/talk-it-out/engine.ts` — *"nothing here is a language model"*; `DiscoveryRecordSchema.answers.max(2)`; `discovery_answers_answer_order_check CHECK (answer_order >= 1 AND <= 2)` | utterance/source artifact; structured candidate; clarification-pending state; durable confidence; user correction; reprocessing | D: 3 new types · L: v4 · C: 2–3 tables · S: 2–3 kinds · Sec: personal-only, new content class · A: candidate→accept is an approval | Add a source-artifact + candidate store **outside** canonical state; widen the answer cap; store confidence | **FOUNDATION EXPANSION REQUIRED** | Today a matched topic yields at most **two** `(questionId, optionId)` pairs that must resolve against the shipped script or `replayDiscovery()` returns `null`. One messy sentence producing a task, a bill, a worry and a deadline has nowhere to land, and nothing links the four to the sentence. |
| 5 | **Life Inbox / multi-source ingestion** (§11) | "Forward it to Her Keys and forget it" | Nothing. `migrationEvidence` is the only lineage-shaped structure | `MigrationEvidenceSchema` — `kind: z.literal('one-move')`, local-only, absent from `SYNC_ENTITY_KINDS` | source provider; external source id; source version; received-at; original evidence; duplicate detection; retraction; source→domain lineage | D: source artifact + lineage · L: v4 · C: 2 tables + FK from produced rows · S: 2 kinds · Sec: **new data class** (email/document content) · A: confirmation gate | Source artifact table + lineage edges + confidence + confirmation state | **FOUNDATION EXPANSION REQUIRED** | The one-email-five-facts test fails cleanly today: the five rows would be unrelated, and the email itself would be unrepresentable. Nothing collapses the email into a task — because nothing can ingest it at all. |
| 6 | **Capture without category knowledge** (§42) | "Tell me first, sort it later" | `NeedsMeItem` is explicitly the uncategorized lane | `NeedsMeItemSchema`: `categoryId: Id.nullable()` + comment *"Category and due date are add-ons for later, never required at capture time"* | — (routing belongs to #5) | D: none · L: none · C: none · S: none · Sec: none · A: none | Route candidates to a kind after classification | **EXTENSION** | Capture-first works, but **only** into Needs Me. `tasks.category_id`, `events.category_id`, `household_systems.category_id` and `meal_plan_entries.category_id` are all `NOT NULL`, so four of the five shapes require classification *at insert*. That is exactly why candidates must live outside canonical state until classified (#5) — not a blocker, but the reason the candidate store is real. |

### 6.3 Reasoning and output

| # | Capability | User job | Current foundation | Current evidence | Missing primitives | Impact | Required change | Class | Rationale |
|---|---|---|---|---|---|---|---|---|---|
| 7 | **Daily briefing — from today's inputs** (§12) | "What matters today?" | `projectStateDay` + `todaysIssues` + `loadTierForDay` + `oneMoveForDay` + `tomorrowPreview` | `src/domain/dailyLoadDecisions.ts`, `src/domain/tomorrowPreview.ts`, `src/features/today/` | — | none | A projection over existing domain state | **EXTENSION** | "What matters today / what needs her / what can wait / what the One Move should be" is already computable from one canonical state. |
| 8 | **Daily briefing — full ritual** (§38) | "What should I know this morning?" | as above | `change_log` is a **pointer** log: `(entity_table, entity_id, op, row_revision)` with no content, cloud-only | *what changed since yesterday*; delegated state; unacknowledged; approvals pending; what Her Keys handled | D: projection only · L: local change journal, if offline briefing is required · C: none new of its own · S: none · Sec: none · A: reads #2 | Nothing of its own once #2, #14, #16 exist — plus a decision on where "what changed" is sourced | **FOUNDATION EXPANSION REQUIRED** | The briefing needs **no primitive of its own** — a genuinely good result. But four of its ten lines have no source, and "what changed since yesterday" cannot be answered offline: `change_log` lives in the cloud and records only that a row changed, never how. |
| 9 | **Spoken briefing output** | "Read it to me" | — | Briefing is a projection (#7) | — | none | An output channel over #7/#8 | **EXTENSION** | No persistence, identity, sync or security implication. |
| 10 | **Capacity Intelligence** (§13) | "Is this day actually possible?" | Real transition-gap and capacity-pressure math over a canonical projection | `computeDailyLoad.ts`, `dailyLoadIssues.ts`; `CAPACITY_DAY_START/END_MINUTES`; `REQUIRED_TRANSITION_BUFFER_MINUTES = 45` | task-level travel; scheduling windows; dependencies; recurrence; energy; per-household capacity config; **completion history** | D: facets (#3) · L: v4 · C: nullable columns on `tasks`, plus a capacity-config home · S: 2 kinds · Sec: none · A: none | Facets on tasks; make the day-window and buffer household data rather than constants | **FOUNDATION EXPANSION REQUIRED** | Estimated duration: **yes** (`durationMinutes`). Fixed vs flexible: **yes** (`commitment`). Scheduling windows: **no**. Travel on tasks: **no**. Dependencies: **no**. Historical completion behaviour: **no source exists** (§4.1). Cross-type reasoning already works because everything reads one `AppState`. This does **not** require redesigning tasks/events/systems — nullable columns suffice. |
| 11 | **Adaptive scheduling** (§14) | "Put the work somewhere it can actually happen" | `commitment` protects fixed items; `ProtectItemAction` makes protection permanent; move/drop/shorten mutations exist with re-validation against a live verdict | `src/domain/recommendationActions.ts`; `approveMoveEvent` moves a flexible event to **the same time tomorrow** | earliest/latest window; splittability; dependency; preferred time; consequence-driven priority | D: facets · L: v4 · C: nullable columns on `tasks`/`events` · S: 2 kinds · Sec: none · A: autonomy level per move (#2) | Scheduling facets + a placement engine | **FOUNDATION EXPANSION REQUIRED** | Hostile question — *"where is scheduling flexibility stored?"* Answer: in a **binary** `commitment` flag and a `TaskPlan` that is a point, not a window. A scheduler can therefore only express "same time tomorrow", which is literally what the shipped mutation does. Identity and semantics are not at risk; the inputs are missing. |
| 12 | **One Move extensibility** (§15) | "One thing today, and the right one" | Typed targets, logical-day uniqueness, server-owned logical day, withheld-on-overload rule | `one_move_records`: `target_task_id`, `target_needs_me_id`, `target_type_check CHECK (IN ('task','needsMe'))`, `target_shape_check` closed CASE; local `targetType` enum + `findIntegrityProblems` | candidate abstraction; reasoning projection (#39); leverage/urgency/consequence inputs | D: enum widen · L: v4 per kind · C: column + FK + index + 2 CHECK rewrites **per kind** · S: `UPDATABLE_COLUMNS.oneMove` widen · Sec: none · A: none | A candidate abstraction that keeps typed targets without N-column growth | **FOUNDATION EXPANSION REQUIRED** | One Move *can* expand without restructuring its persistence model — that was the point of B4-BE02, and returning to polymorphism would re-create the exact failure `MIGRATION_EVIDENCE_REASONS = ['LEGACY_REAL_CATALOG_ONE_MOVE']` exists to record. But the product intends 8+ target kinds, and each costs a column, an FK, an index, two CHECK rewrites and three client edits. That is the §45 "feature-flag architecture by accident" signal: safe per step, expensive in aggregate. |
| 13 | **AI decomposition** (§16) | "Break this into something I can start" | Tasks with duration; catalog One Moves | No `parentId` on any entity; `onboarding.goalIds` are catalog option ids, not goal entities | parent/child relation; goal identity with progress; dependency graph; generated-vs-user provenance (#1); acceptance state | D: 2 new relations · L: v4 · C: self-FK on `tasks` + goal table · S: 1–2 kinds · Sec: none · A: acceptance is an approval | Parent/child + goal entity + dependency + acceptance | **FOUNDATION EXPANSION REQUIRED** | A goal today is a string id in an array with a 50-element cap and no progress, status or relation to any task. A generated step is indistinguishable from one she wrote (#1). |
| 14 | **Delegation** (§17) | "Make it genuinely someone else's" | Nothing | `recommendationActions.ts:17`; `household_members_check` forbids an adult without a `profile_id`; `household_members` has **no client INSERT grant** | responsible party; delegate identity; requested/accepted/declined/acknowledged; due; reassignment; escalation; return-to-user; delivery channel; delivery acknowledgement; still-needs-me | D: responsibility model · L: v4 · C: widen `household_members_check`, new privileged RPC, new table · S: 1–2 kinds · Sec: **membership boundary change** — `is_household_member` keys the entire RLS model off this table · A: sending a request is an action with consequence | A non-account person representation + a responsibility/handoff contract | **FOUNDATION EXPANSION REQUIRED** | The standard is not "`task.assignee` exists". It is whether Her Keys knows the load actually left her head — and today **there is nobody to delegate to**: a co-parent, nanny or grandparent is an adult without an account, which `household_members_check` refuses outright. |
| 15 | **Closed-loop responsibility** (§18) | "Did the pickup actually get covered?" | Nothing | as #14 | the delegation lifecycle plus risk escalation and fallback | as #14, plus time-based risk evaluation | Smallest reusable contract: `Responsibility { subjectRef, responsibleRef, state, requestedAt, respondedAt, dueAt, confirmedAt, returnsToUserAt }` | **FOUNDATION EXPANSION REQUIRED** | The soccer-pickup lifecycle has **no representable state at any step**. |
| 16 | **Proactive automation** (§19) | "Handle it, and tell me you did" | `ActionRecord` records decisions; `requiresApproval()` states the rule | `actionBase`: `actor: z.literal('user')`, `source: z.literal('her_keys_recommendation')`; `action_records_source_check`; `forbid_ledger_mutation()` | proposal; reasoning evidence on proposals; confidence; consequence; authorization level; approval actor+timestamp; reversibility class; execution attempt; provider action id; success/failure; result; compensation; observation | depends on #2 | The #2 package | **FOUNDATION EXPANSION REQUIRED** | ActionRecord is **not** sufficient, and its existence is not evidence that it is. It records a *human decision on a Her Keys proposal after the fact*. It cannot express a pending proposal, a non-human actor, an execution attempt, or a result — and being immutable, it never will be able to carry one. |
| 17 | **Autonomy / approval model** (§20) | "Decide what you may do alone" | Nothing durable | `FEATURE_ACCESS` / `PAYWALL_POLICY` are *entitlement*, explicitly not household state | action category; risk; max autonomous amount; reversible vs irreversible; personal/child/financial; one-time vs persistent; suggest/prepare/approve/auto | D: authority model · L: v4 · C: new table + RLS · S: 1 kind · Sec: **this is a permission store** · A: the whole axis | A reusable authority model keyed on (category, consequence, reversibility) | **FOUNDATION EXPANSION REQUIRED** | Hostile question — *"if Her Keys is authorized to act automatically, where is that permission stored?"* Answer: **nowhere**. The product contract §16 names Recommend / Approve & Execute / Autopilot as core direction; none of the three is representable. |
| 18 | **Action consequence model** (§40) | "Know the difference between a reminder and a payment" | Reason *codes* only | `action_records_type_agreement_check` maps 7 types to 3 diagnostic codes | consequence / risk classification | D: enum · L: v4 · C: column + CHECK · S: 1 kind · Sec: none · A: gates #17 | A consequence class on proposals and actions | **FOUNDATION EXPANSION REQUIRED** | Approval rules **cannot** be expressed safely without it: "move an internal reminder" and "initiate a financial transaction" are indistinguishable to every rule the system can currently write. |
| 19 | **Observe outcome / closed loop** (§41) | "Did it actually work?" | Nothing | Ledger is immutable and insert-only (`ALLOWED_OPS.action = ['create']`, `UPDATABLE_COLUMNS.action = []`) | action→outcome relation; verification attempt; observation record | D: outcome type · L: v4 · C: sibling table + FK to `action_records` · S: 1 kind · Sec: none · A: closes the loop | An outcome record referencing an action, never mutating it | **FOUNDATION EXPANSION REQUIRED** | The ledger's immutability is correct and should stay. It simply means the outcome must be a sibling, and that relationship is a schema decision best made while the ledger is empty. |
| 20 | **Smart notifications** (§21) | "Interrupt me only when it matters" | Nothing — zero occurrences of `notif` in the entire repository | grep over `src/`, `app/`, `supabase/` | derived-intent model; push identity; delivery record | D: intent projection · L: none · C: push token store (**new, server-side**) · S: none · Sec: new · A: reads #2/#18 | A shared derived-intent projection once its inputs exist | **FOUNDATION EXPANSION REQUIRED** | Risk-based notification is a projection over primitives other rows supply. It needs a shared intent model so each module does not invent its own trigger, but nothing existing is rewired. |
| 38 | **Cross-domain reasoning** (§43) | "See my whole life at once" | **One canonical `AppState`; every surface reads it** | `dailyLoadDecisions.ts` → `projectStateDay(state, today)`; `oneMove.ts` → same projection + `state.needsMe`; no duplicated screen state | the *inputs*: money, forms, delegation state, child obligations | D: inherits other rows · L/C/S/Sec/A: none of its own | Nothing architectural — only input coverage | **FOUNDATION EXPANSION REQUIRED** | **The reasoning surface is already right.** Scenario A/B/C/D each fail not because reasoning cannot see across domains, but because a $35 payment, a permission form, a custody transition and an unacknowledged delegation have no representation to see. This is the most favourable finding in the audit: the hard architectural part is done. |
| 39 | **Reasoning explainability** (§39) | "Why this?" | `ActionRecord.reason` — typed, uuid-validated, size-bounded, cross-checked against type and approval | `action_records_reason_check`, `action_records_reason_refs_check`, `action_records_type_agreement_check` | evidence on *recommendations*, not only on decisions; open reason vocabulary | D: evidence contract · L: v4 · C: column or sibling + CHECK widening per code · S: 1 kind · Sec: none · A: attaches to proposals | A lightweight structured reasoning-evidence contract, reusable across recommendation kinds | **FOUNDATION EXPANSION REQUIRED** | Provenance + confidence + ActionRecord are **not** enough. The ledger explains a *decision she already made*; One Move — the product's single most visible recommendation — stores **no reason at all**. Chain-of-thought is correctly out of scope; structured product evidence is what is missing. |

### 6.4 Domain modules

| # | Capability | Current foundation | Current evidence | Missing primitives | Impact | Required change | Class | Rationale |
|---|---|---|---|---|---|---|---|---|
| 21 | **Calendar OS — internal** (§22) | `CalendarEvent` with scope, subject, commitment, travel, prep, status, category | `CalendarEventSchema`; cloud `events` mirrors it | recurrence (#3); protected-time as a first-class idea | D/L/C/S small · Sec none · A none | Recurrence + capacity blocks as event kinds | **EXTENSION** | Personal, child, school, work, custody and appointment events are all expressible today via `categoryId` + `scope` + `subjectMemberId`. Protected time is a fixed personal event. |
| 22 | **Calendar OS — external sources** (§22) | Nothing | no provider/external-id column | external reference (#23); direction; authority | D/L/C/S: per #23 · Sec: provider tokens have **no server-side home** · A: writes back are actions | #23 plus a token boundary | **FOUNDATION EXPANSION REQUIRED** | See #23 and #24. |
| 23 | **External integration identity** (§33) | Nothing | grep: no provider, external id, etag, version or direction anywhere | provider; external account; external object id; version/etag; last-observed state; direction; source-of-truth authority; sync status; domain relationship | D: new ref type · L: v4 · C: new table or per-table columns + unique `(provider, external_id)` · S: 1 kind, plus a `sync_push` allow-list entry · Sec: **token storage is a new boundary** — `secureSession` is device-local SecureStore and B4-P0-013 keeps tokens out of household storage entirely · A: external writes are actions | A shared external-reference primitive | **FOUNDATION EXPANSION REQUIRED** | Seven future consumers need the identical tuple (calendar, email, school feed, payments, delegation delivery, grocery, external tasks). This is the §45 repeated-need signal in its clearest form. A server-side connector additionally breaks an assumption: `local_id` is `NOT NULL` on every content table and means *"a device minted this"* — a server-originated row has no device. |
| 24 | **Integration feedback-loop prevention** (§34) | `local_id` + `origin_device_id` + `sync_push` collision semantics prove *Her Keys install* origin | SD4-006 collision handling in `public.sync_push` | external id + direction + self-write marker | as #23 | #23, with direction and a self-write marker | **FOUNDATION EXPANSION REQUIRED** | The architecture solves the *analogous* problem well — it can already tell "device A wrote this" from "device B wrote this" without merging. It has no vocabulary for "**I** wrote this into Google, and this is it coming back". |
| 25 | **Kids OS** (§23) | Child members; `child` scope; `subjectMemberId`; the A2 composite FK; `kids` systemRole | `household_members_*_member_type_key`; `*_child_scope_subject_check` on every content table | child create path (product-surface, B4-P0-066); documents/forms (#5); transport (#14); expenses (#27); packing (lists) | D/L/C/S: none of its own · Sec: none | Feature work + the shared primitives other rows supply | **EXTENSION** | A2 already gives structurally-proven child scope and subject. As the prompt notes, "no production create path" is a product-surface gap, not a foundation failure — and it is the only Kids-specific one. |
| 26 | **Co-parent logistics** (§24) | `coparent-shared` scope exists on all 5 scope enums | `can_access_scoped_row`: `coparent-shared` resolves to **owner-only**; migration comment: *"never a grant of access to another account"* | non-account person (#14); responsibility lifecycle (#15); reimbursement = money (#27) + responsibility; custody schedule = recurrence (#3) | D: per #14/#15 · L: v4 · C: RLS predicate change on **live rows** if real sharing is ever built · Sec: **the boundary itself** · A: requests are actions | Keep logistics owner-only; build #14/#15; treat true sharing as a separate, later decision | **FOUNDATION EXPANSION REQUIRED** | Logistics and legal-record are correctly separable: everything §24 lists (packing, handoffs, transport responsibility, expense requests) is *logistics* and needs only #14/#15/#27. **Naming risk worth recording:** the scope is called `coparent-shared` but is semantically `coparent-private`. Nothing shares today, and nothing should be widened to make a feature easier. |
| 27 | **Money OS** (§25) | `money` systemRole reserved on a category | no amount, currency or monetary type in the repository | amount; currency; due/paid state; recurrence; account reference; reimbursement; subscription; cash timing; payment approval; external transaction id | D: new module · L: v4 · C: new table + sync + RLS · S: 1–2 kinds · Sec: **new data class** · A: **payment is the highest consequence class** — needs #17/#18 | A financial-obligation module built on #3, #17, #18, #23 | **FOUNDATION EXPANSION REQUIRED** | The module itself is ordinary domain work. It is classified here because it is the **first consumer of four missing shared primitives at once**, and because a bill is the clearest case where consequence and authorization cannot be improvised per module. |
| 28 | **Home OS** (§26) | Tasks + `home` systemRole + `HouseholdSystem` | `SYSTEM_ROLES` includes `home` | recurrence (#3); contractors (#14); cost (#27); duration on non-tasks (#3) | none of its own | Feature work over shared primitives | **EXTENSION** | Maintenance, repairs, supplies and projects are all tasks with a `home` category. Nothing home-*specific* is missing — which is precisely the §45 evidence that the gaps are shared, not per-module. |
| 29 | **Meals OS** (§27) | `MealPlanEntry` (`date`, `title`, `categoryId`, `scope`); `meals` systemRole | `meal_plan_entries` columns; `UPDATABLE_COLUMNS.meal` | prep duration; completion/skip status; preferences; budget; groceries; external order (#23); child constraints | D: columns · L: v4 · C: `ADD COLUMN` + a grocery relation · S: `UPDATABLE_COLUMNS.meal` · Sec: none | Widen the entry; add a grocery relation | **EXTENSION** | **Answering §27 directly: `meal_plan_entries` is too narrow for Meals OS, but not wrongly shaped.** It is a date-title-category tuple with no effort, no state and no relations. Everything needed is additive — and it has no production create path today (HR-07), so nothing real is disturbed. |
| 30 | **Work / Career OS** (§28) | `professional` scope; `work` systemRole; tasks; events; categories | `VISIBILITY_SCOPES` includes `professional`; owner-only RLS for it | none work-specific | none | Ordinary feature work | **ACCEPTED** | Meetings are events, deadlines are `task.dueDate`, projects are categories, applications are tasks, interviews are events. Work/home capacity interaction already works because both read one `AppState`. It inherits the general gaps and adds none. |
| 31 | **Wellbeing + relationships** (§29) | `wellbeing` and `relationships` systemRoles; `personal` scope; `commitment: 'fixed'` | `SYSTEM_ROLES` | recurrence (#3); energy patterns (#33) | none | Ordinary feature work | **ACCEPTED** | Protected personal time is a fixed personal-scope event; a support network is relationship-category items. These stay *context feeding* Capacity and Decision Intelligence, exactly as §29 requires. No therapy/diagnostic modelling is needed or implied. |
| 32 | **Household Systems as an engine** (§30) | `HouseholdSystem` = `id`, `name`, `description`, `categoryId`, `scope`, `subjectMemberId` | `household_systems` table; `UPDATABLE_COLUMNS.system = ['category_id','description','name','origin_updated_at','scope','subject_member_id']` | trigger; recurrence; steps; owner; delegation; automation level; last run; next run; exception handling | D: system becomes an engine · L: v4 · C: many columns + a steps relation · S: `UPDATABLE_COLUMNS.system` · Sec: none · A: automation level is #17 | Add trigger + recurrence + steps + run history | **FOUNDATION EXPANSION REQUIRED** | **Answering §30 directly: `household_systems` is not structurally sufficient.** It is a *label with a description*, not a system. None of the nine capabilities §30 lists is representable — there is no trigger, no schedule, no step, no owner, no run. It also has no production create path (HR-07), so expanding it disturbs nothing. |

### 6.5 Learning, profile and participation

| # | Capability | Current foundation | Current evidence | Missing primitives | Impact | Required change | Class | Rationale |
|---|---|---|---|---|---|---|---|---|
| 33 | **Pattern Intelligence** (§31) | Confidence vocabulary + promotion boundary; `'pattern'` semantic already excluded from durable mutation | `promoteConfidence()`; `mayMutateDurableState()`; `requiresApproval()` | durable pattern state; evidence references; **behavioral history** (§4.1) | D: pattern + evidence types · L: v4 · C: 2 tables, evidence rows referencing domain ids · S: 1–2 kinds · Sec: personal · A: patterns require approval before acting | A bounded pattern + evidence-reference store | **FOUNDATION EXPANSION REQUIRED** | The *rules* are already right and already tested — inference ≠ fact, persistence ≠ promotion. What is missing is (a) somewhere to keep a pattern and (b) anything to base one on. Hostile question — *"if a future AI decides something is Established, what evidence supports the promotion?"* Today: **none exists**, because there is no completion history and no observation record. Evidence can reference domain occurrences by id without a giant analytics store, which is the right shape. |
| 34 | **Operating Profile** (§32) | Recomputed, never persisted; framed hypotheses; names what it does not know; keyed on stable option ids (AMD-01) | `buildOperatingProfile()`; `stillLearning`; every insight starts at `possible` | its *inputs*: observed behaviour (#33), autonomy preference (#17) | none of its own | Keep it derived | **ACCEPTED** | It should **stay recomputed**. Durability is not what it needs; evidence is. Persisting it would be the exact mistake the architecture already avoids — turning an inference into a stored fact. The §32 dimensions it cannot express are all missing *inputs*, not missing profile storage. |
| 35 | **Shared household participation** (§35) | Deliberately absent; scope model already distinguishes personal/professional/child/household/coparent-shared | `household_members_one_owner_per_household_uq`; `one_household_per_owner_uq`; no client INSERT on `household_members`; `private.current_household_id()` uses `LIMIT 1` **with no ORDER BY** | second-member representation; invitation; per-scope grant; multi-household namespace | D: membership · L: **`SyncNamespace` holds exactly one `householdId`** · C: RLS + membership RPC · S: cursor is per-namespace · Sec: the core boundary · A: none | Not now. When built: a membership RPC, a scope-grant model, and a decision on `current_household_id()` | **FOUNDATION EXPANSION REQUIRED** | Correctly not built. Two structural facts to record for later: (1) `private.current_household_id()` returns an **arbitrary** row if an account is ever a member of two households, and `sync_pull` depends on it; (2) the local sync namespace and `IdentityRecord.binding` are singular in `householdId`, so multi-household is a namespace change, not a policy change. |
| 36 | **Rebuilding guidance / education** (§36) | Categories, systems, One Move, onboarding goals all readable | `AppState` is one object | goal entity with progress (#13) | none of its own | Ordinary feature work | **EXTENSION** | Programs can read current life state, One Move and systems as projections. They do not need a separate product framework. Progress is tasks and systems; the only gap is that a goal is a catalog string, not an entity (#13). |
| 37 | **Community** (§37) | One account, one household; personal scope owner-only; **no cross-account read path exists anywhere** | `can_access_scoped_row`; every policy is `auth.uid()`-bound | — | none | A separate surface with no household-data sharing | **EXTENSION** | No foundation blocker is obvious. Moderated groups, expert sessions, cohorts and peer support carry no household data, so they do not touch the account/privacy architecture. Recorded and not designed, per §37. |

---

## 7. Counts (mechanically derived from §6)

| Classification | Count |
|---|---|
| **ACCEPTED** | **3** |
| **EXTENSION** | **9** |
| **FOUNDATION EXPANSION REQUIRED** | **27** |
| **BLOCKED / CONTRADICTED** | **0** |
| **Total rows** | **39** |

| Foundation urgency | Count | Rows |
|---|---|---|
| **F1 — must before Staging** | **2** | #1, #2 |
| **F2 — should before the associated feature** | **22** | #3, #4, #5, #10, #11, #12, #13, #14, #15, #16, #17, #18, #19, #22, #23, #24, #26, #27, #32, #33, #35, #38 |
| **F3 — safe to add with the feature** | **3** | #8, #20, #39 |

ACCEPTED rows: #30 Work/Career OS, #31 Wellbeing + relationships, #34 Operating Profile.
EXTENSION rows: #6, #7, #9, #21, #25, #28, #29, #36, #37.

**Note on the F1 count.** Only two rows are F1, and 20 of the 22 F2 rows depend on one or both of them. That concentration is the finding: the foundation is not broadly wrong, it is missing two load-bearing primitives that almost everything else waits on.

---

## 8. Shared Primitive Matrix (§52)

For each candidate: who needs it · what exists today · why that is or is not sufficient · minimum shape · storage · sync · security · now or later.

### SP-1 · Provenance / Source Identity — **FOUNDATION NOW (F1)**

- **Required by:** Voice (#4), Life Inbox (#5), Decomposition (#13), Pattern Intelligence (#33), Explainability (#39), External Identity (#23), Feedback-loop prevention (#24), and the confidence boundary itself.
- **Current equivalent:** `ProvenanceSource` derived per entity in `src/domain/reasoning/provenance.ts`.
- **Why insufficient:** The derivation is a statement about *producers*, not about *rows*. It is correct only while each entity has exactly one producer, and the ingestion-lock document says so explicitly. `isUserStated()` reads it and feeds `promoteConfidence()`, so a wrong answer lowers the corroboration threshold from 3 to 1.
- **Minimum shape:** `source: ProvenanceSource` (non-null) on every content row, plus `sourceArtifactId: uuid | null` for rows produced by ingestion.
- **Local / cloud:** both. Local v4; cloud `ADD COLUMN` on 8 tables + widen `events_source_check`.
- **Sync:** yes — 8 kinds × (`UPDATABLE_COLUMNS`, projection, apply).
- **Security:** none new. Provenance is not sensitive.
- **Now or later:** **NOW.** The backfill is honest only while the derivation is still sound.

### SP-2 · Action Authorization, Consequence & Outcome — **FOUNDATION NOW (F1)**

- **Required by:** Proactive Automation (#16), Autonomy (#17), Consequence (#18), Outcome (#19), Adaptive Scheduling (#11), Delegation send (#14), Money payment (#27), Calendar write (#22), Notifications (#20), Explainability (#39).
- **Current equivalent:** `ActionRecord` — an immutable ledger of human decisions on Her Keys recommendations.
- **Why insufficient:** It cannot express a *pending proposal*, a *non-human actor*, an *execution attempt* or a *result*. `actor: z.literal('user')` and `CHECK (source = 'her_keys_recommendation')` make the first autonomous action **un-insertable**, not merely under-described. And `forbid_ledger_mutation()` means no outcome can ever be attached to an existing row.
- **Minimum shape:** three pieces, kept separate on purpose —
  - `AutomationAuthority { categoryRef, consequenceClass, reversibility, mode: suggest|prepare|approve|auto, limit?, persistent }`
  - `ActionProposal { id, kind, targetRef, reasoningEvidence, confidence, consequence, requiredMode, state: proposed|approved|declined|executing|executed|failed, approvedBy, approvedAt }` — **mutable**
  - `ActionOutcome { actionRef, attemptedAt, externalActionId?, result, observedAt, observation }` — append-only, sibling to the ledger
- **Local / cloud:** both. The ledger itself keeps its shape; `actor` and `source` widen.
- **Sync:** yes — 1–2 new kinds, new `sync_push` allow-list entries, new `change_log_entity_table_check` values.
- **Security:** significant. An authority store is a permission store; it must be `personal` scope, owner-only, and never client-writable without an explicit approval path.
- **Now or later:** **NOW.** The ledger is the one permanently unrewritable table, and its constraints currently refuse the product's own stated direction.

### SP-3 · Commitment Intelligence (facets) — **F2**

- **Required by:** Capacity (#10), Scheduling (#11), Money (#27), Home (#28), Meals (#29), Kids (#25), Work (#30), Systems (#32), Decomposition (#13), One Move (#12), Briefing (#8). **Eleven consumers.**
- **Current equivalent:** `commitment` + `durationMinutes` + `dueDate` + `TaskPlan` on tasks; partial on events.
- **Why insufficient:** Four existing kinds already answer the same three questions four different ways (§5).
- **Minimum shape:** the typed facet interface in §5. **Not a table, not a blob.**
- **Local / cloud:** both, as nullable columns per implementing table. **Sync:** per-kind column lists. **Security:** none new.
- **Now or later:** **shape now, columns per module.**

### SP-4 · Dependency Graph — **F2**

Required by Scheduling (#11), Decomposition (#13), Capacity (#10), Systems (#32), Briefing (#8). Nothing exists. Minimum shape: a typed edge `{ fromRef, toRef, kind: 'blocks'|'parent' }`, or a self-FK where the relation is strictly hierarchical. Local + cloud, 1 sync kind, no security change. Later, with the first consumer — but the *shape* should be decided alongside SP-3 so scheduling and decomposition do not each invent one.

### SP-5 · Recurrence / System Trigger — **F2**

Required by Systems (#32), Calendar (#21), Home (#28), Meals (#29), Money (#27), Co-parent custody (#26), Wellbeing (#31). **Seven consumers, zero implementations.** Minimum shape: a rule plus `lastRunAt` / `nextDueAt` plus an exception list. Local + cloud, 1 sync kind. Later — but it is the second-clearest repeated need after SP-2, and seven modules inventing it independently is the §45 failure mode.

### SP-6 · Responsibility / Delegation — **F2**

Required by Delegation (#14), Closed loop (#15), Co-parent (#26), Kids transport (#25), Home contractors (#28), Shared participation (#35), Briefing (#8). Current equivalent: **none** — `owner_profile_id` is privacy, `subjectMemberId` is subject. Minimum shape: a non-account `Person` representation plus `Responsibility { subjectRef, responsibleRef, state, requestedAt, respondedAt, dueAt, confirmedAt, returnsToUserAt, stillNeedsMe }`. **Security is the notable axis:** admitting a non-account adult to `household_members` changes `private.is_household_member`, which keys the entire RLS model. Later — but the membership CHECK widening is easier to reason about on an empty database.

### SP-7 · External Reference — **F2**

Required by Calendar OS (#22), Life Inbox (#5), Money (#27), Delegation delivery (#14), Meals grocery (#29), Automation (#16), Feedback-loop prevention (#24). **Seven consumers, zero implementations.** Current equivalent: `local_id` + `origin_device_id` — Her Keys install identity, not external identity. Minimum shape: `{ provider, externalAccountRef, externalObjectId, version, lastObservedAt, direction, authority, syncState, domainRef }` with `UNIQUE (provider, external_object_id)`. **Security:** provider tokens have **no home** — `secureSession` is device-local and B4-P0-013 keeps tokens out of household storage; a server-side connector needs an encrypted server-side token store, which is a genuinely new boundary. Later, but the `local_id` convention for server-originated rows should be decided before any row carries one.

### SP-8 · Ingestion Source Artifact + Structured Candidate — **F2**

Required by Voice (#4), Life Inbox (#5), Capture-without-category (#6), Cross-domain reasoning (#38), Explainability (#39), Pattern evidence (#33). Current equivalent: `MigrationEvidenceSchema` is the only lineage-shaped structure and it is local-only, single-purpose and unsynced. Minimum shape: `SourceArtifact { provider, externalId, receivedAt, contentRef, interpretationState }` + `Candidate { artifactRef, proposedKind, proposedFields, confidence, state: pending|clarifying|accepted|rejected, acceptedRowRef }`. **Candidates must live outside canonical state** — that is what lets capture precede classification while `category_id` stays `NOT NULL`.

**Owner decision required:** §11 asks that "original evidence" be retained, while the conversation boundary forbids persisting her words. Those are compatible for a *forwarded artifact* (an email she sent Her Keys) and in tension for a *spoken utterance*. This audit does not resolve it.

### SP-9 · Durable Confidence — **F2**

Required by Voice (#4), Life Inbox (#5), Pattern Intelligence (#33), Operating Profile inputs (#34), Explainability (#39), Automation (#16). Current equivalent: the vocabulary and `promoteConfidence()` exist; **no durable row carries a level.** Minimum shape: `confidence: ConfidenceLevel` on inference-bearing rows only — never on user-stated facts, which have no confidence by definition. Local + cloud. **The promotion boundary must remain the single writer.**

### SP-10 · Reasoning Evidence — **F3**

Required by Explainability (#39), One Move (#12), Notifications (#20), Automation (#16), Scheduling (#11). Current equivalent: `ActionRecord.reason` — genuinely good, but a closed 3-code union attached only to decisions. Minimum shape: the same discipline (typed code + named uuid references + size bound) generalized to recommendations, with a vocabulary that widens without a CHECK rewrite per code. Structured product evidence only — deadline, capacity conflict, dependency, pattern, preference, explicit instruction. **Never chain-of-thought.**

### SP-11 · Behavioral History — **F2**

Required by Pattern Intelligence (#33), Capacity learning (#10), Operating Profile evidence (#34), Delegation reliability (#15), the product contract's own §14 example. Current equivalent: **none** (§4.1). Minimum shape: a bounded append-only completion/observation log referencing domain rows by id. This is the single input without which confidence can never honestly leave `possible`.

### SP-12 · Capacity Configuration — **F3**

Required by Capacity (#10), Scheduling (#11), Briefing (#8). Current equivalent: `CAPACITY_DAY_START_MINUTES`, `CAPACITY_DAY_END_MINUTES`, `REQUIRED_TRANSITION_BUFFER_MINUTES` — module constants identical for every household. Minimum shape: per-household, per-person values with the constants as defaults. Purely additive.

**Candidates evaluated and rejected as shared primitives:** a universal `items`/`objects`/`entities` table (§46 — domain semantics matter, and the typed One Move target exists precisely because polymorphism already failed here once); a universal wrapper type over all domain records (already rejected by B4-INGESTION-LOCK §1 and still correct); a generic analytics event store (SP-11 can reference domain rows by id instead).

---

## 9. Rewiring risk for each F1 (§54)

### F1 · #1 — Stored provenance / source identity

**If not fixed now, what must be rewired later:**

| Axis | Concrete rework |
|---|---|
| Local persistence | A v4 migration over live households, backfilling `source` on `events`, `tasks`, `needsMe`, `categories`, `systems`, `meals`, `oneMoves`, `discovery` from `provenanceOf*()`. Honest **only while the derivation is still sound** — i.e. only before a second producer ships. |
| Cloud migration | `ALTER TABLE … ADD COLUMN source` on 8 tables; drop and re-add `events_source_check` (currently `source = 'user'`); a `private.is_trusted_server_context()` backfill over every existing row. |
| Sync | `UPDATABLE_COLUMNS` for 8 kinds; `toCloudRow` for 8 kinds; `applyCloudRow` for 8 kinds. |
| Identity mapping | None. |
| RLS | None. |
| ActionRecord references | None. |
| Claim payload | `ClaimTask`, `ClaimNeedsMeItem`, `ClaimCategory` gain a field → `claimPayloadVersion` 2, and `claim_local_household` must accept both. |
| Conflict framework | None. |
| Existing user data | Every pre-expansion row must be backfilled, and rows created *after* a second producer ships but *before* the column exists are **permanently unattributable**. |

### F1 · #2 — Action authorization, consequence & outcome

**If not fixed now, what must be rewired later:**

| Axis | Concrete rework |
|---|---|
| Local persistence | `actionBase.actor` and `.source` widen from `z.literal` to enums; `ActionRecordSchema` gains members; `findIntegrityProblems` gains reference checks per new type; v4 (or v5) migration. |
| Cloud migration | Drop and re-add `action_records_source_check`, `action_records_action_type_check`, `action_records_type_agreement_check` (a 7-way cross-product that must be rewritten wholesale, not extended); add `authority`, `consequence`, `approved_by`, `approved_at`; create the proposal and outcome tables. |
| Sync queue representation | New kinds in `SYNC_ENTITY_KINDS`, `CLOUD_TABLE`, `IDENTITY_COLUMN`, `ALLOWED_OPS`, `UPDATABLE_COLUMNS`, `DEPENDENCY_RANK`, `kindOfLocalId`, plus `toCloudRow` / `applyCloudRow` arms. A proposal is **mutable**, so it is the first kind needing full CAS semantics on a new table. |
| Identity mapping | New mapping kinds. |
| RLS policies | New policies for the proposal and outcome tables; an authority store needs owner-only policies and must not be client-writable without an approval path. |
| ActionRecord references | `action_records.target_id` is a deliberate **soft** reference with no FK. An outcome referencing an action needs a real FK — deciding its `ON DELETE` behaviour against a `RESTRICT`ed `actor_profile_id` is easier before rows exist. |
| Claim payload | Claim does not carry actions today; an autonomy policy created pre-account would need to. |
| Conflict framework | A proposal is the first entity where two devices can legitimately race on an approval. `EVIDENCE_KINDS` may need a new member. |
| Change cursor | `change_log_entity_table_check` is a closed 12-value CHECK; each new table must be added or its changes never reach a second device. |
| Existing user data | Historical ledger rows stay truthful — they genuinely were user-approved. But they are permanently silent on authority and consequence, and being immutable they can never be annotated. Any later analysis of "how has autonomy behaved over time" has a hard, unfixable start date. |

---

## 10. Required deep dives (§56)

### A · Voice / multi-source ingestion

**Hostile question: "If voice identifies a bill, where does that bill live?"**

Trace: `advance()` in `src/features/talk-it-out/engine.ts` matches free text against a shipped topic catalog and returns messages + `ConversationState` + quick replies. `classifyConversationOutcome()` then decides durability. The only durable output is `DiscoveryRecord { topicId, answers[≤2] }`, capped at two answers locally and by `discovery_answers_answer_order_check CHECK (answer_order >= 1 AND answer_order <= 2)` in the cloud.

A bill has **nowhere to live**: there is no financial entity, no amount type, and the closest shape — a `Task` — requires a `NOT NULL` `category_id` and cannot carry an amount. A `NeedsMeItem` could hold the title, losing the amount, the due-date semantics and the fact that it came from speech.

**Hostile question: "If a school email creates four domain facts, how do we retain lineage?"**

It does not. The four rows would carry no reference to each other and no reference to the email. The only lineage-shaped structure in the codebase is `MigrationEvidenceSchema`, and it is `kind: z.literal('one-move')`, local-only, and absent from `SYNC_ENTITY_KINDS`.

**Required pipeline vs. what exists**

| Stage | Exists? |
|---|---|
| UTTERANCE | No durable representation (correctly — words are not stored) |
| INTERPRETATION | Deterministic script matching only |
| STRUCTURED CANDIDATES | **No** — there is no candidate state between "said" and "stored" |
| CLARIFICATION | Yes, but only as a scripted `pendingQuestion`, capped at 2 |
| ACCEPTED STATE | Yes — the domain entities |
| REASONING | Yes, over accepted state |

**Verdict: FOUNDATION EXPANSION REQUIRED (F2), dependent on F1 #1.** The missing piece is the candidate stage, not transcript storage — and keeping transcripts out remains correct.

### B · Capacity Intelligence

**What genuinely works.** `projectStateDay()` produces one `DayView`; `listTransitionGaps()` walks it correctly, including the subtle case where an event nested inside a longer one must not open a gap; `assessDailyLoadIssues()` detects overlap, transition conflict, capacity pressure, tight window and overdue with a documented priority and deterministic tie-breaks; travel and preparation minutes are consumed where she entered them; logical day and timezone are handled properly, including DST-safe arithmetic.

**What does not.**

| §13 requirement | Status |
|---|---|
| Calendar availability, hard commitments, flexible commitments | **Yes** |
| Task effort | **Yes** — `durationMinutes` |
| Travel time, transition buffers | **Events only.** Tasks cannot carry travel |
| Child logistics, custody transitions | Events with child subject — but no custody schedule (needs SP-5) |
| Work constraints | `professional` scope events |
| Recurring routines | **No** (SP-5) |
| Meal requirements | `MealPlanEntry` has no duration |
| Financial constraints | **No** |
| Energy / low-energy alternatives | **No** |
| Deadlines | Date-granularity only |
| Dependencies | **No** (SP-4) |
| Historical completion behaviour | **No source exists** (§4.1) |

**Direct answers to §13's questions.** Estimated duration: yes. Fixed vs flexible: yes. Scheduling windows: no. Travel/transition requirements: on events only. Capacity reasoning across domain types: **yes, already** — everything reads one `AppState`. User-specific patterns influencing planning without becoming facts: the *rules* exist (`mayMutateDurableState`, `requiresApproval`), the *storage* does not. **Would Capacity Intelligence require redesigning tasks/events/systems? No** — nullable columns suffice.

### C · Adaptive scheduling

**Hostile question: "If Motion-like scheduling moves a task, where is scheduling flexibility stored?"**

In `commitment: 'fixed' | 'flexible'` — a boolean — and in `TaskPlan`, which is `unplanned | day{date} | timed{startsAt}`: a point, never a window. There is no earliest start, no latest finish, no splittability, no minimum chunk and no preferred time.

The consequence is visible in the shipped code: `approveMoveEvent()` moves a flexible event to **the same time tomorrow**, preserving duration, because that is the only placement the model can express. `isMovable()` requires `flexible && !dueToday && durationMinutes > 0`.

What *is* right: protection is real and permanent (`ProtectItemAction` converts flexible → fixed and Her Keys never re-proposes); every mutation re-validates against a freshly computed verdict so a stale screen cannot act; one decision per logical day per issue class; and every move writes a ledger row with a typed reason and a before/after pair — which is the skeleton of "explain why something moved".

**Verdict: FOUNDATION EXPANSION REQUIRED (F2).** Identity and semantics are not at risk. The scheduler's inputs are.

### D · Delegation / responsibility

**Hostile question: "If a delegated task is accepted, where is acceptance represented?"**

Nowhere — and more fundamentally, **there is nobody to accept it.**

`household_members_check` permits exactly two member shapes: `adult` with a `profile_id` (an account), or `child` with no `profile_id` and a `birth_date`. A co-parent, nanny, grandparent or neighbour is an adult without an account and is therefore **not representable**. `household_members` additionally has no client INSERT grant at all — membership is created only by `bootstrap_account` and `claim_local_household`.

The code says so plainly: `src/domain/recommendationActions.ts:17` — *"DELEGATE and REPLACE are not implemented — there is no delegate-target concept … and faking either would mean claiming an execution capability Her Keys doesn't have."* That is the right call, and it is also the measure of the gap.

Against §17's checklist: responsibility owner **no**; delegated-to **no**; delegated timestamp **no**; accepted/declined **no**; acknowledged **no**; due date on the delegation **no**; completion **no**; reassignment **no**; escalation **no**; returns-to-user **no**; still-needs-me **no**; delivery channel **no**; delivery acknowledgement **no**. Thirteen of thirteen.

**Verdict: FOUNDATION EXPANSION REQUIRED (F2).** This is a shared responsibility/handoff model, not a `task.assignee` column — five other modules need the same lifecycle.

### E · Proactive automation / autonomy

**Hostile question: "If Her Keys is authorized to act automatically, where is that permission stored?"**

Nowhere. There is no authority, permission, autonomy or automation storage of any kind. `FEATURE_ACCESS` and `PAYWALL_POLICY` are entitlement, and `src/monetization/` is explicitly forbidden from persisting into household state.

**Hostile question: "If Her Keys acts, how do we know the action actually succeeded?"**

It cannot. `ActionRecord` has no result, no attempt, no external action id and no observation — and `forbid_ledger_mutation()` guarantees one can never be added to an existing row.

**Inspecting ActionRecord against §19's list** (not assuming sufficiency because it exists):

| §19 requirement | ActionRecord |
|---|---|
| action proposal | **No** — a row exists only after she decided |
| reasoning evidence | **Yes** — typed, uuid-validated, size-bounded, cross-checked |
| confidence | No |
| consequence level | No |
| authorization level | No |
| approval actor | Partial — `actor: z.literal('user')`, which cannot say anything else |
| approval timestamp | Partial — `createdAt` is the row's time |
| reversibility | Partial — `before`/`after` on 5 of 7 types; no classification |
| execution attempt | No |
| external provider / action id | No |
| success / failure | No |
| result | No |
| compensation / undo | No executor |
| post-action observation | No |

Four of fourteen, two of them partial. And `CHECK (source = 'her_keys_recommendation')` plus `actor: z.literal('user')` mean the first autonomous action is **refused at insert**, not merely recorded thinly.

**Verdict: FOUNDATION EXPANSION REQUIRED — F1.**

### F · External integration identity

**Hostile question: "If a task comes from Google Calendar and Her Keys writes it back, how does it avoid a feedback loop?"**

It cannot, today — but the architecture already solves the structurally identical problem for its own devices, which is encouraging. `sync_push` implements SD4-006: a row arriving with a known `(household_id, local_id)` but a **different** `origin_device_id` is treated as a distinct entity, given a fresh uuid, and reported as `local_id_collision`. It **never merges**. That is exactly the discipline external identity needs — applied to the wrong axis.

What is missing is the tuple: `provider`, `external_account`, `external_object_id`, `version`/`etag`, `last_observed_state`, `direction`, `source_of_truth_authority`, `sync_status`. Without `direction` and an external id, an ingested copy of Her Keys' own write is indistinguishable from a genuine new external event.

Two structural notes for later:

1. `local_id` is `NOT NULL` on every content table and means *"a device minted this."* A server-side connector is not a device. A convention (for example `ext:<provider>:<hash>`) fits the existing regex, but it becomes durable in every row, so it is worth deciding before any row carries one.
2. **Provider tokens have no home.** `secureSession` is device-local SecureStore and B4-P0-013 keeps tokens out of household storage entirely. A server-side connector needs an encrypted server-side token store — a new security boundary, not an extension of an existing one.

**Verdict: FOUNDATION EXPANSION REQUIRED (F2), and it is the clearest repeated-need signal after SP-2 — seven consumers, zero implementations.**

### G · Cross-domain reasoning

**This is the best result in the audit.** The reasoning *surface* is already correct: one canonical `AppState`, one projection (`projectStateDay`), and every consumer reading it rather than a screen's copy. B4-INGESTION-LOCK §9 verified that by trace, and it still holds.

Walking §43's scenarios:

- **A — field trip + $35 + form + custody transition + work meeting.** One reasoning operation *can* see them, if they exist. Events, the work meeting and the custody transition exist. The $35 and the permission form do not. **Blocker: missing domain objects, not missing reasoning.**
- **B — electric bill + car repair + school fee + cash constraint → today's One Move.** Money reasoning cannot affect One Move because no financial obligation exists and `one_move_records.target_type` is closed to `('task','needsMe')`. **Blocker: SP-3/Money + the One Move target-kind cost (#12).**
- **C — practice + travel + meal prep + work end time → the real evening.** Three of four work: practice is an event, travel is `travelMinutesBefore/After`, work end is an event. Meal prep does not — `MealPlanEntry` has no duration. **Blocker: one missing facet.**
- **D — unacknowledged delegated pickup + work conflict → elevate risk.** Neither delegation nor acknowledgement nor a risk class exists. **Blocker: SP-6 + SP-2.**

**Hostile question: "If a reimbursement is both Money and Co-parent Logistics, which module owns it?"** Structurally, exactly one: every content row has a single `NOT NULL` `category_id` and a single `scope`, and `household_categories_system_role_uq` makes `systemRole` unique per household. Cross-domain objects are **single-homed**. Resolvable additively with a facet or tag relation without touching `category_id` — but it must be a deliberate decision, not a per-module workaround.

### H · Daily briefing

The briefing needs **no primitive of its own**, which is itself the finding: it is a projection, and the architecture is projection-shaped.

| Briefing line | Source today |
|---|---|
| What matters today | `projectStateDay` + `todaysIssues` |
| What changed since yesterday | **None offline.** `change_log` is cloud-only and content-free |
| What is at risk | `dailyLoadIssues` (schedule risk only) |
| What needs her personally | `state.needsMe` — but only as a separate lane, never as a dimension |
| What can wait | `commitment` + `dueDate` |
| What is delegated | **None** (SP-6) |
| What is unacknowledged | **None** (SP-6) |
| What Her Keys already handled | **None** (SP-2) |
| Upcoming constraint | `tomorrowPreview` |
| What the One Move should be | `oneMoveForDay` |

Six of ten are live. **Verdict: FOUNDATION EXPANSION REQUIRED (F3)** — it inherits its gaps and contributes none, except one decision: where "what changed since yesterday" is sourced, since `change_log` cannot answer it offline or descriptively.

### I · Money / co-parent interaction

The reimbursement case is where both modules' gaps meet. It needs: an amount (SP-3/Money), a responsible party and an acceptance state (SP-6), a consequence class and an authorization level if Her Keys is to request or pay it (SP-2), and a single-homing decision (§10 G above).

**The `coparent-shared` naming risk, recorded plainly:** the scope is named as though it shares, and `private.can_access_scoped_row()` resolves it to **owner-only** — the migration comment says *"coparent-shared is never permission to share with another account."* The semantics are right for Build 4; the name will mislead a future implementer into assuming a grant exists. Widening that predicate later would be widening a security boundary over live rows, which §48 warns against doing to make a feature easier.

**Logistics vs legal record stay cleanly separable.** Everything §24 lists — custody schedule, exchange logistics, packing, handoffs, shared responsibilities, reimbursements, expense requests, acceptance, schedule changes, transport responsibility — is logistics, served by SP-5 + SP-6 + Money. None of it requires a court-evidence architecture, and none should pull one in.

### J · One Move extensibility

**Hostile question: "If a bill affects today's One Move, how does One Move reference it?"**

It cannot. `one_move_records.target_type` is `CHECK (target_type = ANY (ARRAY['task','needsMe']))`, with `target_task_id` and `target_needs_me_id` as separate nullable FKs and `one_move_records_target_shape_check` as a closed `CASE` binding status to exactly which column is populated. Locally, `OneMoveRecordSchema.targetType` is the same two-value enum and `findIntegrityProblems` checks exactly those two.

**Are typed targets, a candidate abstraction and a reasoning projection sufficient?** Typed targets: **yes, and they must stay.** The polymorphic alternative already failed here — `MIGRATION_EVIDENCE_REASONS = ['LEGACY_REAL_CATALOG_ONE_MOVE']` and the entire `MigrationEvidenceSchema` exist because a v1→v2 migration stamped `targetType: 'catalog'` onto real households' One Moves and produced unresolvable targets. Returning to polymorphism to make expansion cheap would re-create that exact incident.

**Can One Move expand without restructuring its persistence model again? Yes — but at a repeated, enumerable cost per target kind:** a nullable FK column, a foreign key, a partial index, a `target_type_check` widening, a `target_shape_check` **rewrite** (it is a `CASE`, not an extensible list), a local enum widening, a `findIntegrityProblems` arm, and a `UPDATABLE_COLUMNS.oneMove` entry. Eight artifacts. The product intends 8+ target kinds.

Selection inputs available today: urgency (`dueDate`), effort (`durationMinutes`), load tier (`loadTierForDay`), logical day, and the already-done set. Missing: leverage, consequence, dependency, strengths/struggles as reasoning input (onboarding ids are read by the Operating Profile but never by One Move), and patterns.

**Verdict: FOUNDATION EXPANSION REQUIRED (F2).** The persistence model is sound; the *target-kind registration cost* is the thing to decide deliberately, and this audit does not prescribe the shape.

---

## 11. Sync, identity, security and ActionRecord survival (§47–§50)

### Does the current sync framework survive the proposed expansion? **YES.**

Adding an entity kind is a bounded, enumerable edit at exactly nine sites, each in one file:

| Site | File |
|---|---|
| `SYNC_ENTITY_KINDS`, `CLOUD_TABLE`, `IDENTITY_COLUMN`, `ALLOWED_OPS`, `UPDATABLE_COLUMNS`, `DEPENDENCY_RANK` | `src/domain/sync/syncTypes.ts` |
| `toCloudRow` arm | `src/domain/sync/projection.ts` |
| `applyCloudRow` arm | `src/domain/sync/apply.ts` |
| `kindOfLocalId` arm | `src/domain/sync/claimSeam.ts` |
| `sync_push` allow-list | migration — **hardcoded table list, must be edited** |
| `change_log_entity_table_check` | migration — **closed 12-value CHECK, must be edited** |

The cursor design (`committed_xid`, not `seq`), CAS-on-`revision`, payload-free coalescing queue, dependency-ranked push and durable conflict evidence are all kind-agnostic and need no change. New capabilities can persist, claim where required, push, pull, hydrate a second device, survive conflict, preserve provenance and identity, and respect account namespaces **without inventing a parallel sync system** — which is the §49 test, and it passes.

One caveat: a **mutable proposal** entity (SP-2) would be the first new kind needing full CAS plus an approval race, and `EVIDENCE_KINDS` may need a member for it.

### Does the current identity model survive? **YES, within one account and one household.**

`AccountId` = Supabase Auth uuid, cleanly separated from provider provenance. Server-owned row ids with `local_id` as origin evidence and idempotency key. SD4-006 collision semantics are sound. Two limits to record:

1. `local_id NOT NULL` encodes "a device minted this"; server-originated rows need a convention (SP-7).
2. `private.current_household_id()` is `SELECT … LIMIT 1` **with no ORDER BY**, and `sync_pull` depends on it. Deterministic today because exactly one membership can exist; arbitrary the moment multi-membership does. Combined with `SyncNamespace.householdId` and `AccountBinding.householdId` both being singular, **shared household participation is a namespace change, not a policy change.**

### Does the current security / scope model survive? **YES for the five existing scopes; three new decisions are needed.**

The scope machinery is genuinely reusable: `scope` + `owner_profile_id` + an `owner_scope_check` pairing + `can_access_scoped_row` covers personal, household, child, professional and coparent-shared consistently on every table. New capabilities inherit it.

Three things it does **not** currently answer, and none should be resolved by widening permissions to make a feature easier (§48):

- **Financial data** is a new sensitivity class with no precedent in the model.
- **External provider tokens** have no server-side home at all (SP-7).
- **`coparent-shared` is owner-only despite its name** — real collaboration means changing an RLS predicate over live rows.

Child data stays governed by the A2 composite FK, which is the strongest invariant in the schema and should be preserved verbatim through any expansion.

### Does the current ActionRecord model survive? **NO — not as the automation ledger.**

It survives, correctly and unchanged, as the **decision ledger**: an immutable, append-only record of what she approved or declined on a Her Keys proposal, with typed reasons and before/after pairs. That is valuable and should not be weakened.

It does **not** survive as the record of autonomous action. `actor: z.literal('user')` and `CHECK (source = 'her_keys_recommendation')` refuse the first autonomous insert; there is no proposal state, no authority, no consequence, no execution attempt and no result; and three-layer immutability means an outcome can never be attached. **SP-2 must sit beside it, not inside it.**

---

## 12. Recommended minimum foundation-expansion package

Scoped deliberately small. This is what the evidence supports doing **before Staging**, not everything the product will eventually need.

**Must (F1) — 2 items**

1. **SP-1 · Stored provenance / source identity.** A `source` discriminator on every content row plus a nullable source-artifact reference. Local v4 + `ADD COLUMN` ×8 + widen `events_source_check` + 8 sync kinds + `claimPayloadVersion` 2. *Do it now because the honest backfill is only available while each entity still has exactly one producer, and because `promoteConfidence()` already reads the value.*
2. **SP-2 · Action authorization, consequence & outcome.** Widen `actor`/`source`; add a consequence class and an authority model; add a **mutable** proposal entity and an **append-only** outcome entity beside the immutable ledger. *Do it now because the ledger currently refuses the product's own stated direction, and because the outcome↔action relationship is a schema decision best made on an empty table.*

**Strongly consider bundling (F2, highest leverage)**

3. **SP-3 · Commitment facets** — decide the *typed contract*; land columns per module. Eleven consumers.
4. **SP-7 · External reference** — decide the *tuple and the `local_id` convention for server-originated rows*; build no connector. Seven consumers.
5. **SP-6 · Responsibility** — decide whether a **non-account person** is admissible to `household_members`, since that widening touches `private.is_household_member`, which keys the entire RLS model.

**The strategic argument for bundling.** Section 0 of the shipping migration refuses to run against a database holding any row, and says so in terms: *"Do NOT truncate, delete, or export-and-restore to satisfy this guard. Return to the owner for a non-destructive migration design."* Today both environments hold zero rows, so a clean restructure is free. That window closes permanently the first time Staging carries a real household. Every item above is individually additive and survivable later — but doing five coordinated schema decisions once, on an empty database, is materially cheaper and lower-risk than five live migrations with five local schema versions, five backfills and five claim-payload versions.

---

## 13. Explicitly safe to defer

- **Community (#37)** — no foundation blocker; no household data crosses the account boundary.
- **Shared household participation (#35)** — correctly unbuilt. Record the `current_household_id()` `LIMIT 1` and the singular `SyncNamespace.householdId` as the two things to revisit; change neither now.
- **Co-parent *collaboration*** — keep `coparent-shared` owner-only. Build logistics, not sharing.
- **Smart notification delivery (#20)** — a projection plus a push-token store; nothing existing is rewired.
- **Spoken briefing output (#9)** — an output channel.
- **Meals OS widening (#29)** and **Home OS (#28)** — ordinary additive work with no production create path to disturb.
- **Rebuilding guidance (#36)** — projections over existing state.
- **Reasoning-evidence generalization (SP-10)** — real and needed, but it can ride with its first consumer.
- **Capacity configuration (SP-12)** — constants → household data, purely additive.
- **Legal-record / court-evidence architecture** — explicitly out of scope and should stay out.
- **Any connector implementation** — decide the identity tuple; build no integration.

---

## 14. Final status

**FOUNDATION EXPANSION REQUIRED BEFORE STAGING**

Not because the foundation is wrong. It is the most disciplined layer in the repository: one canonical state, derived intelligence never persisted, a real confidence boundary, structural child-subject integrity, a correct incremental cursor, typed One Move targets chosen *because* polymorphism already failed once, and a three-layer-immutable decision ledger. **Nothing is BLOCKED or CONTRADICTED.** The reasoning surface that cross-domain intelligence needs is already built and already correct.

It is because two load-bearing primitives are absent, 20 of the 22 F2 capabilities wait on one or both of them, and the free destructive-restructure window closes the moment Staging holds a real row.

| Question | Answer |
|---|---|
| **F1 FOUNDATION WORK BEFORE STAGING** | **YES** |
| **READY FOR LOCAL HOSTILE INTEGRATION AUDIT** | **AFTER FOUNDATION EXPANSION** |
| **READY FOR STAGING** | **NO** |

Staging is **not** authorized by this audit.


---

## 15. POST-B4-FOUNDATION-BUILDOUT DELTA

Appended by B4-FOUNDATION-BUILDOUT-01. Sections 1 to 14 above are the audit exactly as it stood at HEAD `32b1601` and are kept as history; the only edit to them is one pointer row under the header table. The classification, the shipping migration hash and the local fingerprint have since changed, and both the old and the new values are recorded here (Addendum 01 A5). The counts below are derived from the matrix in §6 and from the closed register in `BUILD4_FOUNDATION_BUILDOUT.md`, and `tests/foundationLedger.test.mjs` re-derives and compares them on every run.

### 15.1 What changed underneath the audit

| | PRE-B4-FOUNDATION-BUILDOUT-01 (the values in this audit) | CURRENT (as of B4-FOUNDATION-BUILDOUT-01) |
|---|---|---|
| Shipping migration SHA-256 (working-tree form) | `275e9d1cd81a3d4361715a6d91a084ad95de2ccbd83c67f56e6ca0d3143e8436` | `1e9169de4cf21c46e2167089328de94ce07cb1fcf005c0461dece1b28ec8a7cb` |
| Baseline migration SHA-256 | `8bc38d66fcffbb9fa83502329bd4738a53a8446dd5ce89327013751872f8f16f` | unchanged |
| Local gating digest / facts | `d2b319d0253613d6a5c1dd36ef906da6` / 1300 | `199ed4d4c1b37cd654b5853e91cbde27` / 3613 |
| Application tables | 16 | 34 |
| Local schema version | 3 (this audit's "v4 migration" was a recommendation) | 4 |
| `claimPayloadVersion` | 1 | 2 |
| App tests | 454 / 454 | 705 / 705 |
| Backend harness | 365 / 365 | 684 / 684 |
| Remote commands | none | none |

The fingerprint change is attributed fact by fact (2387 explained, 0 unexplained) in `supabase/tools/baselines/build4-foundation-reconciliation.json`. The old baseline file keeps every digest and now carries a `superseded_by` pointer instead of being rewritten.

### 15.2 Classification, before and after

| Classification | PRE (§7) | CURRENT |
|---|---|---|
| ACCEPTED | 3 | 14 |
| EXTENSION | 9 | 25 |
| FOUNDATION EXPANSION REQUIRED | 27 | 0 |
| STOPPED | n/a | 0 |
| BLOCKED / CONTRADICTED | 0 | 0 |
| Total rows | 39 | 39 |

| Foundation urgency still outstanding | PRE | CURRENT |
|---|---|---|
| F1 — must before Staging | 2 | 0 |
| F2 — should before the associated feature | 22 | 0 |
| F3 — safe to add with the feature | 3 | 0 |

The twelve rows that were not FOUNDATION EXPANSION REQUIRED are unchanged: they are consumers of the primitives and none was reclassified. ACCEPTED here means the foundation for the row is complete and nothing further is needed; EXTENSION means the foundation is complete and building the feature is additive future work. Neither means a feature was built.

### 15.3 The 27 rows

| # | Capability | Urgency | PRE | CURRENT | Ledger row |
|---|---|---|---|---|---|
| 1 | Stored provenance / source identity | F1 | FOUNDATION EXPANSION REQUIRED | **ACCEPTED** | FE-01 |
| 2 | Action authorization, consequence & outcome | F1 | FOUNDATION EXPANSION REQUIRED | **ACCEPTED** | FE-02 |
| 3 | Universal commitment contract | F2 | FOUNDATION EXPANSION REQUIRED | **ACCEPTED** | FE-03 |
| 4 | Voice-first Talk It Out | F2 | FOUNDATION EXPANSION REQUIRED | **EXTENSION** | FE-04 |
| 5 | Life Inbox / multi-source ingestion | F2 | FOUNDATION EXPANSION REQUIRED | **EXTENSION** | FE-05 |
| 8 | Daily briefing — full ritual | F3 | FOUNDATION EXPANSION REQUIRED | **EXTENSION** | FE-06 |
| 10 | Capacity Intelligence | F2 | FOUNDATION EXPANSION REQUIRED | **EXTENSION** | FE-07 |
| 11 | Adaptive scheduling | F2 | FOUNDATION EXPANSION REQUIRED | **EXTENSION** | FE-08 |
| 12 | One Move extensibility | F2 | FOUNDATION EXPANSION REQUIRED | **ACCEPTED** | FE-09 |
| 13 | AI decomposition | F2 | FOUNDATION EXPANSION REQUIRED | **EXTENSION** | FE-10 |
| 14 | Delegation | F2 | FOUNDATION EXPANSION REQUIRED | **EXTENSION** | FE-11 |
| 15 | Closed-loop responsibility | F2 | FOUNDATION EXPANSION REQUIRED | **EXTENSION** | FE-12 |
| 16 | Proactive automation | F2 | FOUNDATION EXPANSION REQUIRED | **EXTENSION** | FE-13 |
| 17 | Autonomy / approval model | F2 | FOUNDATION EXPANSION REQUIRED | **ACCEPTED** | FE-14 |
| 18 | Action consequence model | F2 | FOUNDATION EXPANSION REQUIRED | **ACCEPTED** | FE-15 |
| 19 | Observe outcome / closed loop | F2 | FOUNDATION EXPANSION REQUIRED | **ACCEPTED** | FE-16 |
| 20 | Smart notifications | F3 | FOUNDATION EXPANSION REQUIRED | **EXTENSION** | FE-17 |
| 38 | Cross-domain reasoning | F2 | FOUNDATION EXPANSION REQUIRED | **ACCEPTED** | FE-18 |
| 39 | Reasoning explainability | F3 | FOUNDATION EXPANSION REQUIRED | **ACCEPTED** | FE-19 |
| 22 | Calendar OS — external sources | F2 | FOUNDATION EXPANSION REQUIRED | **EXTENSION** | FE-20 |
| 23 | External integration identity | F2 | FOUNDATION EXPANSION REQUIRED | **ACCEPTED** | FE-21 |
| 24 | Integration feedback-loop prevention | F2 | FOUNDATION EXPANSION REQUIRED | **ACCEPTED** | FE-22 |
| 26 | Co-parent logistics | F2 | FOUNDATION EXPANSION REQUIRED | **EXTENSION** | FE-23 |
| 27 | Money OS | F2 | FOUNDATION EXPANSION REQUIRED | **EXTENSION** | FE-24 |
| 32 | Household Systems as an engine | F2 | FOUNDATION EXPANSION REQUIRED | **EXTENSION** | FE-25 |
| 33 | Pattern Intelligence | F2 | FOUNDATION EXPANSION REQUIRED | **EXTENSION** | FE-26 |
| 35 | Shared household participation | F2 | FOUNDATION EXPANSION REQUIRED | **EXTENSION** | FE-27 |

### 15.4 The audit's final questions, as of now

| Question | PRE (§14) | CURRENT |
|---|---|---|
| F1 FOUNDATION WORK BEFORE STAGING | YES | **NO.** Both F1 rows (#1, #2) are ACCEPTED and verified |
| READY FOR LOCAL HOSTILE INTEGRATION AUDIT | AFTER FOUNDATION EXPANSION | **YES** |
| READY FOR STAGING | NO | **NO.** Unchanged. Nothing here authorizes Staging, and the hostile audit has not been run |

The strategic argument in §12 was that the free destructive-restructure window closes the first time Staging holds a row. It was used: the shipping migration was restructured while both environments still hold zero rows, the zero-data interlock now enumerates all 34 tables, and no remote was touched.
