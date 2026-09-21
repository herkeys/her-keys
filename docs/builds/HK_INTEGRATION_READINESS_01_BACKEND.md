# HK-INTEGRATION-READINESS-01 — backend and sync composition

Local only. No remote, staging or production change. The one schema change is an **additive local migration**; applying it to any
real environment is **OWNER-GATED — PRODUCTION MIGRATION REQUIRED BEFORE INTEGRATION RELEASE**.

## 1. Sync composition before and after

### Before (reproduced on untouched `c2e56b9`)

```
sign in ─▶ accountRuntime.resolveBinding ─▶ claim RPC (One Move closure only) ─▶ namespaceFromClaim (id map, EMPTY queue) ─▶ "accountBound"
                                                                                   └── nothing constructs a coordinator
canonical mutation ─▶ appStore.dispatch/commit ─▶ persist state            (no queue intent anywhere)
```
Reproduced: a task outside the closure had no mapping and no outbound work; a post-bind mutation queued nothing; the only reference to
`createSyncCoordinator` in production was its definition; and, once a coordinator was composed by hand, its first pull overwrote local
onboarding with the server default. The existing harness hid all of it by hand-assembling a coordinator and hand-calling `enqueue`.

### After

```
                        ┌──────────────────────────────── composeAccountApp (ONE function; production root and every test call it) ───────┐
 canonical mutation ─▶  appStore.commit/dispatch ── observe() ─▶ changeObserver: diff prev→next ─▶ queue intent  ─┐                            │
   (any feature)                                                                                                  ├─ ONE envelope write ─▶ disk
                                                              state ─────────────────────────────────────────────┘                            │
 sign in / restore ─▶ accountRuntime ── every state change ─▶ syncRuntime.onAccountState                                                       │
        claim (v3) ─▶ namespaceFromClaim + seedNamespace  (same write as the binding)                                                          │
        accountBound ─▶ syncRuntime.start: reconcile, ONE coordinator, request('authRestored')                                                 │
        any other state (signed out, degraded, switched, quarantined, refused) ─▶ syncRuntime.stop (generation bump, timers cancelled)         │
 coordinator cycle:  FETCH pull (network) ─▶ APPLY in the store turn against CURRENT state ─▶ PUSH queue ─▶ MERGE result into CURRENT queue     │
 app foreground ─▶ syncRuntime.request('foreground')   local mutation ─▶ debounced request   offline ─▶ bounded backoff (no polling)          │
                        └────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Lifecycle guarantees (each is a test in `tests/hk-ir01/syncComposition.test.mjs`, and again against PostgreSQL in
`supabase/tests/journey-composition.mjs`): exactly one coordinator per bound account; the same session applied twice, a repeated
callback, or a re-resolved binding builds none; sign-out, degraded session, account switch and quarantine stop it; a cycle in flight when
that happens can neither commit (stale generation) nor keep uploading (account guard); restart resumes from the persisted blob with no
second claim and no duplicate rows; offline at bind loses nothing (the seed is in the same write as the binding).

## 2. Claim and seed behaviour

* **Claim v3** (`claimPayloadVersion: 3`, additive SQL migration; v2 still accepted unchanged): every child is claimed (a child's cloud
  identity can be created by claim and by nothing else — `household_members` has no client write grant), display names are normalised
  to what the database accepts, and each task carries its `durationSource` (`null` stays `null`).
* **`seedNamespace`** (same write as the binding): (1) **adopt** the `onboarding_state` row the server created — `sync_push` refuses to
  create it, and a pull would otherwise overwrite her onboarding — and queue her real onboarding over it as an UPDATE; (2) queue an update
  for any starter category she changed; (3) queue an update for any carried row she edited while the claim was in flight; (4) queue a create
  for every other unmapped row: bounded (ceiling `MAX_QUEUE_ITEMS − 100`, headroom for her next edit), dependency-ordered, **never dropped** —
  the seed is stateless (derived from state + mappings + queue), so a crash loses nothing and a large backlog drains in rounds.
* **Hydration gate.** A device that has not heard from the cloud (`unhydrated`) is hydrated by its first pull; the runtime does not seed or
  top up until it is `ready` (seeding a fresh device would create rows the cloud already holds). One durable pull batch completes
  hydration (`unhydrated → ready`); previously nothing advanced it. A crash mid-pull leaves the device `unhydrated` and the next launch reads
  again — never a half-hydrated household.
* **Children on second devices.** Pull hydrates `household_members` rows with `member_type = 'child'` (read-only; adults are accounts).
* **A pull is complete for its range** (IR-D11). `sync_pull` has no limit and its cursor is a transaction id; a claim writes a whole
  household in ONE transaction, so there is no cursor value between two of its rows and a response cannot be paged by count. The engine
  therefore consumes the whole response, adopts the server's barrier as the cursor, and bounds only the *row requests* (`PULL_FETCH_CHUNK`
  = 100 ids ≈ 4 KB of `id=in.(...)`, under the 8 KB request line most gateways refuse past). A failure part-way through discards what was
  read (nothing applied, cursor unmoved) and the next cycle reads it again. The old engine kept the first 200 rows and stayed at the old
  cursor, which re-read the same 200 rows forever: a second device never hydrated a household with more than ~200 changed rows.

## 3. Sync-capable canonical kinds (28) and mapping-only kinds (2)

| Kind | Local collection | Classification |
|---|---|---|
| `category` | `categories` | starters: **ADOPTED** (server made them); changed starters and custom ones: **CLAIMED** if in the closure, else **QUEUED AFTER CLAIM** |
| `event`, `system`, `meal` | `events`, `systems`, `meals` | **QUEUED AFTER CLAIM** (the claim never carries them) |
| `task`, `needsMe` | `tasks`, `needsMe` | **CLAIMED** (One Move closure) / **QUEUED AFTER CLAIM** |
| `oneMove` | `oneMoves` | **CLAIMED** (all history; `logical_day` can only enter through claim); new ones **QUEUED** (server derives the day) |
| `onboarding` | `onboarding` | **ADOPTED** at bind, then **UPDATED** (a create is refused by design) |
| `discovery` | `discovery` | **QUEUED** (topic; tombstone on clear). *Answers are not transported — debt D2.* |
| `action` | `actions` | **QUEUED** (append-only: create only) |
| `sourceArtifact` | `sourceArtifacts` | **CLAIMED** if a carried row names it, else **QUEUED** (metadata + digest + reference only) |
| `interpretation`, `externalReference`, `observation`, `authority`, `intent`, `decision`, `person`, `responsibility`, `dependency`, `recurrence`, `goal`, `systemStep`, `capacity`, `pattern`, `evidenceLink` | matching collections | **QUEUED AFTER CLAIM** |
| `execution`, `outcome` | `executions`, `outcomes` | **PULLED ONLY** (server-written; a device cannot forge one) |
| `household` | `household` | mapping-only, **CLAIMED** |
| `member` | `user`, `children` | mapping-only: owner created by bootstrap; children **CLAIMED** (v3) and **PULLED** on second devices |

**Intentionally local-only:** `migrationEvidence`, `migrationLineage` (local record of what a migration could not carry; a canary in one
never appears in any row sent or any cloud table — proved against PostgreSQL); quarantined corrupt bytes (they live in a separate storage key,
not in `AppState`); presentation and view-model state; `user.displayName` / `household.displayName` (no screen collects one — owner decision
HR-05 — and membership is claim-only).

**Demo exclusions.** A demo household is refused by the claim on both sides, the observer never queues for `origin: 'demo'`, and the runtime
refuses to start on one. **Raw-source exclusions.** `AppState` never holds Talk It Out's exact words (session-only in F02); source artifacts
carry metadata/digest/reference only. F02's validation branch proves that no outbound payload, envelope or queue item contains the raw utterance.
**Undecided readings (owner decision OD-A — RESOLVED, repaired, closed).** A reading that she has not accepted syncs as structured state (kind,
dates, amount, child, hint, state, open question, chain) but its `title`, which is copied or derived from her words, is sent as a neutral label
(`To-do to review` / `Event to review` / `Note to review`); only an accepted reading carries its own title, in the same update that records the
decision. A rejected or superseded reading stays neutral. A reading that arrives neutral cannot be accepted until she names it. Proven in-model,
through Feature 02's own reader and pipeline, and against PostgreSQL (SEMANTICS §4; main ledger §6.6.2). The device that heard her keeps the reading
locally as before.

## 4. Account switch, restart, second device

* **Switch (A → B):** B's sign-in finds A's household → quarantine → `boundOther`; A's coordinator stops; nothing starts for B; A's pending
  rows are never uploaded under B (0 requests made, verified in-model and against PostgreSQL).
* **Restart:** persisted `identity.sync` (queue, mappings, cursor, evidence) survives; `restore()` resumes the same account, does not claim
  again, and converges after an interrupted seed with no duplicates.
* **Second device:** proved through the runtime against PostgreSQL: tasks equal with duration knowledge intact; the child and the
  child-scoped System/task name the same child; pulled state produces no outbound work; a removed prerequisite reads "needs review".
  *Adopting an existing cloud household on a device with no binding (R7/R10 in `BUILD4_PHASE0_CHECKPOINT.md §4`) is a recorded contract that
  is **not implemented** — a server `superseded_by_cloud` refusal stays an honest, recorded refusal. The tests build device B's identity the way
  that step will leave it.*

## 5. Migration, RLS, fingerprint

`supabase/migrations/20260921120000_ir01_duration_source_and_claim_v3.sql` — additive; shipping migration and baseline untouched; pinned to LF.

| Change | Detail |
|---|---|
| `tasks.duration_source text NULL` | CHECK `NULL or user\|default\|inferred`, **no default**, column-level INSERT/UPDATE for `authenticated` only |
| `claim_local_household` | `CREATE OR REPLACE`, same signature, `SECURITY DEFINER`, empty `search_path`, ACL preserved; v3 = all children + `durationSource`; v2 unchanged |
| constraints / RLS / triggers | RLS unchanged; no policy or trigger added; HA-011 needs no schema change |

**Evidence** (`supabase/tests`): suite 75 claim v3 (34 checks), suite 76 (40 checks: `duration_source` and `household_systems.subject_member_id`
attacked as owner / stranger / anon — WITH CHECK, FK substitution, `household_id` reassignment, server-owned column), **ENV D** (15 checks: a
*populated* pre-migration database upgraded in place — no row lost or rewritten, every existing 15 keeps `NULL`, a v2 claim replays idempotently,
a v3 claim works, RLS and privileges hold, rollback assumption), ENV A/C fresh install, and the 28-check real-database journey. Two
same-statement snapshot traps in my own new SQL suites were found and fixed so no `NULL` expectation can pass vacuously.

**Rollback assumptions:** `ALTER TABLE tasks DROP COLUMN duration_source` plus restoring the shipped v2 function body undo the schema; the
provenance values written meanwhile cannot be reconstructed. No down-migration is shipped.

**Fingerprint** — intentional, understood change (not drift):

| | Gating digest | Facts |
|---|---|---|
| PRE-REPAIR baseline (`build4-foundation-local-fingerprint.json`) | `199ed4d4c1b37cd654b5853e91cbde27` | 3,613 |
| **NEW** (`ir01-local-fingerprint.json`, verified `MATCH`) | `43e7c8a4402a3387cb2e1add4170921e` | **3,617** |

On two otherwise-identical bare databases IR01 changes exactly four dimensions: `columns` 713→714, `constraints` 678→679,
`privileges.columns` 719→721, and the `claim_local_household` body (`functions`, 27→27). All 13 other dimensions still match the old baseline.
Migration SHA-256 (working tree): baseline `81909daa…` (LF git form `8bc38d66…`); shipping `1e9169de…` (**unchanged**); IR01 `73db6639…`.
The shared local stack database had the additive migration applied (the sync journeys run against it); the harness now verifies that.

## 6. Performance

The observer runs on every change and walks only collections whose reference changed: an untouched 5,000-row collection costs **~0.01 ms**
per observed change; one edit inside it **~1–3 ms** (measured in `syncComposition.test.mjs`; 1.05 ms quiet, more under load). The queue is bounded
(500) with seed headroom; the seed is stateless and drains in bounded rounds (700 tasks proven in the pure seed, 450 through the runtime on
PostgreSQL, 2,000 through the runtime in-model in about 3.5 s for both devices together, i.e. linear). No polling was introduced: triggers are foreground, local mutation,
and bounded backoff only while work is queued and offline. No repeated full serialization was added (intent rides the existing envelope write).
Pull cost is proportional to the household, not to its history: entities are de-duplicated before any row body is requested, requests are
chunked at 100 ids, and the whole batch is applied and written once (a 450-task household: 5 task requests; the entire two-device in-model
journey, sending 450 rows and pulling them back, runs in about one second).

## 7. Defects found during repair (new; P0–P3 repaired, others recorded)

| ID | Sev | Type | Where | Finding | Status |
|---|---|---|---|---|---|
| IR-D1 | P1 | DATA-LOSS | `pullEngine`/`apply` (latent) | First pull after bind overwrote local onboarding with the server default | **REPAIRED** (seed adopts + queues; tested) |
| IR-D2 | P2 | SYNC | `sync_push` allow-list | `onboarding_state` cannot be created by push though `onboarding` is a create/update kind → permanent validation evidence | **REPAIRED** (adopt, then update only) |
| IR-D3 | P1 | DATA-LOSS | `coordinator.commit` | Replaced state derived at cycle start; would silently discard edits made during any network wait | **REPAIRED** (store turn + fetch/apply split + `mergePushResult`) |
| IR-D4 | P2 | SYNC | `pullEngine` | `household_members` never pulled → a second device cannot resolve a child; a child-subject row would stall the cursor forever | **REPAIRED** (child hydration) |
| IR-D5 | P2 | LIFECYCLE | `SyncNamespace.hydration` | `unhydrated → ready` was never advanced; seeding a fresh device would duplicate the cloud's rows | **REPAIRED** (advance + gate) |
| IR-D6 | P3 | UI-DEFAULT | `TaskForm.tsx:34` | Prefilled `'15'` indistinguishable from typed 15 (audit missed) | **REPAIRED** (touched vs default) |
| IR-D10 | P3 | SYNC | `syncRuntime.request` (my own new loop) | A household above the queue ceiling (400) was sent only in part: the loop stopped when the first cycle drained the queue, leaving the held-back rows until some later trigger. Found by the 450-task test | **REPAIRED** (look again after each cycle; 450 tasks now leave in ONE sign-in — in-model and against PostgreSQL) |
| IR-D11 | P2 | SYNC | `pullEngine.fetchPullBatch`, `supabaseSyncTransport.pull` (pre-existing since B4) | A pull response of more than one batch (200 rows) kept the first 200 and left the cursor unmoved → the same 200 re-read forever; a second device never hydrated a household with more than ~200 changed rows, and a fake that ignored the limit hid it | **REPAIRED** (a pull is complete for its range; only row requests are chunked; `PULL_BATCH_SIZE` → `PULL_FETCH_CHUNK`, transport `limit` argument removed). 450 tasks hydrate through the real `sync_pull` |
| IR-D12 | P3 | SYNC | `changeBridge.unsyncedRows` (my own new top-up) | A row the server refuses for its CONTENT leaves the queue as evidence and never gets a mapping, so the stateless top-up derived it as "owed" again on every trigger: the same refused row re-sent forever, with a new piece of evidence each time. Found by attacking the top-up with a scripted refusal | **REPAIRED** (a row whose create already ended as evidence is not owed; it waits for a decision). Asked once, recorded once, new work flows past it |
| IR-D7 | P4 | SEMANTICS | `needsMe.ts:56` | `resolved` also means "promoted to a task" | recorded |
| IR-D8 | P4 | PARITY | Task/Event integrity | local rule admits the adult user id as subject; the cloud FK does not | recorded |
| IR-D9 | P4 | PARITY | Meal, Category | cloud has `subject_member_id`, local has none | recorded |

## 8. Remaining backend debt

D1 R7/R10 adoption of an existing cloud household on a new device (contract recorded, unimplemented; owner decision on quarantine UX);
D2 `discovery_answers` has no transport; D3 a mutation arriving while 500 items are queued sets `backlog` (durable, surfaced) but the
un-queued *update* is not auto-recovered (creates are, via the stateless seed); D4 no row-level pull quarantine (HA-014); D5 no network-restored
event (no NetInfo dependency) — backoff covers it; D6 post-bind child creation has no server path (and no app path exists); D7 HA-013 destructive
shipping migration stays zero-data-only; D8 `sync_pull` has no server-side bound: a device far behind (or a new one) receives one metadata
row (`table, id, op, revision`, ~100 bytes) per change-log row since its cursor, and the engine de-duplicates by entity before it requests any
row body. Bounding that on the server needs a composite `(xid, seq)` cursor — an owner-gated server change, not a client one, and not needed
at household scale (the real-database journey pulls a 450-task household in five row requests); D9 a device's own pushes return through its
next pull and are fetched again although the revision it already holds is current (in the in-model journey device A re-read 400 rows it
had just written). Skipping a row whose mapped revision is already ≥ the change row's revision is a safe optimisation, deliberately not made here;
D10 `SyncNamespace.backlog` is only ever set (queue overflow, or 200 unresolved evidence entries) and nothing clears it, and no path exists to
resolve evidence (`resolved` is never set to true), so a transient overflow leaves the "needs attention" state on for good. Conservative on
purpose — an update that overflowed is not auto-recovered (D3), so clearing it would be a lie — but it needs a resolve/recover flow (found by the
F01 validation; F01's `SyncNotice` no longer prints "0 changes need your attention" for it); D11 HA-014 is a little sharper now: the pull batch is
everything settled, so one incompatible row refuses the whole household's batch (the cursor still does not move and nothing is corrupted).
