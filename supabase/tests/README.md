# Her Keys — local backend security harness

Deterministic, re-runnable proof that the Build 4 cloud schema behaves as the
frozen SD4 architecture requires. It runs **entirely against a disposable local
database** and never contacts a remote project.

```
node supabase/tests/run.mjs          # everything: quality, ENV A, ENV B, ENV C
node supabase/tests/run.mjs 60       # one numbered ENV C file
```

Exit code is non-zero if any check fails, so it drops straight into CI.

## Local-only guarantee

Every database call names an **explicit local container and database**. The
Supabase CLI is never asked to resolve a linked project, and nothing here reads
a credential.

- Target container: `supabase_db_Her_Keys`, overridable with
  `HERKEYS_LOCAL_DB_CONTAINER`.
- Databases created and dropped by the harness: `b4_env_a`, `b4_env_a_tx`,
  `b4_env_b1`, `b4_env_b2`, `b4_env_c`.
- **Never used:** `supabase db push`, `supabase db remote commit`,
  `supabase migration repair`, `supabase login`, any `--linked` operation,
  Staging, Production.

`supabase/.temp/project-ref` may still contain a Staging ref left over from
Phase 1. The harness ignores it entirely; that is why it talks to the container
directly rather than through the CLI.

## Prerequisites

1. Docker running.
2. The local stack up: `npx supabase start`. If the `storage` container is
   unhealthy on Windows, start without it — only `db` and `auth` are needed:
   `npx supabase start -x storage,imgproxy,studio,edge-runtime,realtime,vector,mailpit,pooler,logflare`
3. Node 20+.

## Environment sequencing

Three logically separate lifecycles, because the zero-data interlock and the
post-migration security tests must never share one.

| Env | Purpose | Shape |
|---|---|---|
| **ENV A** | empty apply | baseline + Build 4 on an empty surface; must succeed. Also runs a *poisoned* migration to prove a late failure rolls the whole restructuring back |
| **ENV B1** | interlock attack | a protected application table holds a row; the migration must **abort** with no partial state |
| **ENV B2** | interlock attack | `auth.users` holds a row; same requirement |
| **ENV B3** | interlock attack | a FOUNDATION table (`goals`) holds a row on an already-migrated database; a re-run must abort naming it, with the row and all 34 tables intact (B4-FOUNDATION-BUILDOUT-01) |
| **ENV C** | post-apply security | migrate **while empty**, *then* insert synthetic users and fixtures, *then* run the numbered suites |

**ENV C is never re-migrated after it is populated.** A harness that tried to
would be a harness defect, not a reason to weaken the interlock.

## Synthetic fixture policy

Synthetic `auth.users` rows and application fixtures are **authorized for ENV B
and ENV C only**, because these are disposable local databases. They are local,
deterministic, fixed-uuid and re-creatable. **No synthetic user or fixture may
ever exist in Staging or Production.**

`helpers/00-auth-stub.sql` provides the parts of Supabase Auth the schema
depends on (`auth.users`, the real `auth.uid()` definition) so a bare database
can host the baseline. `helpers/01-test-helpers.sql` holds harness-only helpers
in their own `herkeys_test` schema — deliberately **not** in `public`, because
the migration revokes function privileges there and would otherwise strip the
harness itself.

The fingerprint database loads **only** the auth stub, so no test artifact can
appear in the captured schema.

## Reusable identity fixtures

`helpers/10-fixtures.sql` builds the cast the account/auth/claim wave will need,
so that wave does not reinvent identity setup:

| Actor | Role |
|---|---|
| **USER A** `1111…` | owner of household A |
| **USER B** `2222…` | second adult member of household A, not the owner |
| **USER C** `3333…` | owner of an unrelated household |
| **CHILD A** | child member of household A, no profile |

Households and owner profiles are created through the **real** `bootstrap_account`
RPC, so fixtures exercise the shipping path rather than a parallel hand-built one.
USER B exists so the "same household, different member" row of the RLS matrix is
reachable at all — Build 4 products only ever create one adult per household.

## Impersonating a caller

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
-- ... assertions ...
ROLLBACK;
```

**Fixture keyword presence is not coverage.** A B4-BACKEND-01 claim test looked
like it exercised a targeted historical One Move insert; it actually landed on an
existing row and took the conflict branch, so the insert path was never tested at
all. Assert the branch or outcome, not the presence of a word in a fixture.

`herkeys_test.test_denied('<sql>')` returns true when a statement is refused,
which is how denial cases are asserted without aborting the file.

## Writing a check

Each numbered file emits lines the runner parses:

```sql
SELECT CASE WHEN <condition> THEN 'PASS' ELSE 'FAIL' END || ' | <description>';
```

Files start with `\pset format unaligned` and `\pset tuples_only on`. Every file
must be **self-contained** — it may not depend on a row another file created,
because any file can be run alone.

## Suites

| File | Covers |
|---|---|
| `00-interlock.sql` | post-apply invariants the interlock protects; deferred mechanisms absent |
| `10-rls-matrix.sql` | anon / owner / same-household member / unrelated / service_role |
| `20-scope-isolation.sql` | personal, professional, child, coparent-shared, household |
| `30-child-subject.sql` | NHR-01 rules 1–3, both write and membership-mutation directions |
| `40-server-columns.sql` | server-owned columns refused by privilege, not corrected by trigger |
| `50-privileges.sql` | three-layer PUBLIC/anon posture, load-bearing grants, platform untouched |
| `56-provenance.sql` | B4-FE01-001/-005: no row without a producer (all nine tables), closed vocabularies, demo-seed refused, confidence exactly for claims, lineage bound to household and owner, a client can move confidence and nothing about where a row came from |
| `57-foundation-rls.sql` | the 18 foundation tables' access model: catalog claims (RLS, no anon, no client DELETE, evidence un-updatable, executions/outcomes un-insertable, no credential column) and real roles (owner, same-household member, stranger, anon) |
| `58-foundation-integrity.sql` | 130+ constraint cases asserted by REASON: typed references, exact money, child proof, cycles, one live owner, one answer per intent, set-once revoke/retract, decided freeze, pattern/recurrence/observation/external/capacity rules |
| `61-household-context.sql` | `resolve_household_context` and `sync_pull`: named, single, ambiguous, foreign, none, anon; the LIMIT-1 function is gone |
| `60-trusted-context.sql` | NHR-06 attacks on `is_trusted_server_context()` |
| `70-claim-bootstrap.sql` | bootstrap, claim, idempotent retry, demo refusal, conflict evidence |
| `72-claim-closure.sql` | B4-BE02-OR-001 dependency closure: targeted historical One Moves, child/category closure, server-enforced boundedness, retry identity, divergent-retry refusal, rollback census |
| `73-claim-v2.sql` | claim payload version 2: v1 refused, provenance required, demo refused, artifact closure and extras, external artifacts refused, facets and exact value carried, retry/replay/divergence, all-or-nothing |
| `74-sync-push.sql` | B4-BE03-OR-001: SD4-006 push identity — create, same-install replay, cross-install local_id collision, server-owned columns, RLS and allow-list |
| `80-revision-cas.sql` | optimistic concurrency; revision is not the cursor |
| `90-change-cursor.sql` | change_log, committed_xid, snapshot barrier |
| `92-one-move.sql` | logical day server-derived and frozen, typed targets, uniqueness |
| `95-action-records.sql` | immutability, cloud-uuid references, payload bounds |
| `99-fail-closed.sql` | the assertion detects breakage and does not false-positive on platform objects |

**Test-only defaults.** `helpers/05-test-defaults.sql` gives `producer` a default of `user-action` in ENV C ONLY, so the older
suites can insert plain fixtures. The shipped schema has no such default (ENV A asserts it), and `56-provenance.sql` drops the default
inside its own transaction to prove the real behaviour. `helpers/01-test-helpers.sql` adds `herkeys_test.error_of` and
`herkeys_test.ins`, which report WHY a statement was refused so the foundation suites assert on the reason.

Three further sections live in `run.mjs` rather than in a `.sql` file, because
they exercise the CLIENT against the server or need two artifacts compared:

- **authorization parity** (`authorization-parity.mjs`) — 25 cases run through `executionAuthorization()` in TypeScript AND
  `guard_execution_authorization()` in the database; the same verdict, with the same named reason, is required of both.

- **client payload -> real RPC** — the real `buildClaimPayload` output fed to the
  real claim RPC, so a drift between the two sides fails here rather than on a
  device.
- **sync engine** (`sync-integration.mjs`) — six multi-device journeys (the last two are the foundation: one device writes 21 kinds and a
  fresh second device hydrates identically; two devices deciding the same intent / owner / half-cycle offline keep one answer and the loser as evidence) over real
  HTTP, real PostgREST, real RLS, real CAS, real change_log and the real snapshot
  barrier. Each simulated device has its own persisted blob, queue, cursor,
  mappings, `origin_device_id` and coordinator, and shares nothing in memory.
  Fault injection happens only at the client-side transport boundary: the
  request really is sent and the server really does commit; only the answer is
  discarded. A fully mocked transport cannot prove a case whose whole point is
  that client and server disagree.

Interlock **behaviour** (ENV A/B) and the **snapshot barrier** live in
`run.mjs`, not in a `.sql` file: the first cannot re-apply a migration from
inside an already-migrated database, and the second needs two genuinely
concurrent sessions.

## Cleanup

The runner drops `b4_probe`, `b4_fp_pre` and `b4_fp_post` on every start. Those
are ad-hoc databases a manual investigation may leave behind; clearing them
deterministically means a stray database is never mistaken for unexplained
local state, and durable evidence has to live here instead.

The runner drops and recreates its databases at the start of each run, so state
never leaks between runs. It does not drop them afterwards, which leaves the
last run inspectable. `herkeys_test_definer`, a cluster-wide role created by the
trusted-context suite, is dropped by that file and re-created idempotently.

## Fingerprint

The schema fingerprint is separate from this harness and uses the **unmodified**
locked Phase 1 tool:

```
node supabase/tools/schema-fingerprint.mjs print-sql --mode digest > fp.sql
docker exec -i supabase_db_Her_Keys psql -U postgres -d postgres -At -f - < fp.sql
```

Result and reconciliation: `supabase/tools/baselines/build4-local-fingerprint.json`.
It is a **local** digest and is explicitly not a Staging or Production digest.
