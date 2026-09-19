# Build 4 — Phase 1 completion report

**Scope:** repo-owned Supabase baseline, Staging only (B4-P0-053).
**Status:** all Phase 1 gates passed. Awaiting owner review.
**Branch:** `build/04-cloud-identity-sync`. Not pushed, no PR, no merge.

| Fact | Value |
|---|---|
| Organization | `qouxjbueadjitgpchwtj` |
| Staging project ref | `fhhudicklmpofuzkxeqe` |
| Production project ref | `npykvnxnehlsdlbumzwk` — **never linked, never queried, never mutated** |
| CLI | machine-installed Supabase CLI **2.109.1**, not upgraded |
| Hosted Postgres | 17.6.1.166 |
| Local Postgres | 17.6 (local Supabase stack) |
| Baseline version | `20260919230054` |
| Baseline file | `supabase/migrations/20260919230054_build4_baseline.sql` |
| Raw pull SHA-256 | `ab52451d83fed96c0eab0a5902d16ff395918d7d8c8506da76840fbd8a69e04c` |
| Reviewed SHA-256 (noise removal) | `08868f85cd24c37655174658626c2cac2d796d9d28475b5ad447f446a43a1469` |
| Reviewed SHA-256 (final, after ACL normalization) | `8bc38d66fcffbb9fa83502329bd4738a53a8446dd5ce89327013751872f8f16f` |
| Gating digest, hosted and local | `c55d9b80d604211a5841260709b27f47` over **961** catalog facts |

## 1. CLI identity gate — PASS

`projects list` and `orgs list` under the process-scoped PAT returned exactly one organization
(`qouxjbueadjitgpchwtj`) and exactly two projects, Her Keys Staging and Her Keys Production, both in
that organization and both `linked:false` at the time of the check.

**No K Scan project or organization is visible under this token, and none was touched.** The stored
K Scan CLI login was not used and not modified; no `supabase login` was run (B4-P0-054, B4-P0-056).

## 2. Credential discipline — PASS

`SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` (Staging only) were process-scoped for the
session. Neither value was printed, committed, written to `.env`, or set at Windows User or System
level. No Production database password was requested or used (B4-P0-054).

## 3. Staging-only link — PASS

`supabase link --project-ref fhhudicklmpofuzkxeqe`. Stored link state verified afterwards:
`supabase/.temp/project-ref` contains exactly `fhhudicklmpofuzkxeqe`, and
`supabase/.temp/linked-project.json` names "Her Keys Staging" in org `qouxjbueadjitgpchwtj`.
`supabase/.temp/` is gitignored via `supabase/.gitignore`. An independent read-only
`migration list` confirmed the linked target. Production was never linked.

## 4. Pre-capture state and remote history precheck — PASS

Before capture: `supabase/migrations/` contained only `.gitkeep`, zero `.sql` files, no partial pull
artifacts; Docker healthy. Remote Staging migration history was empty (`{"migrations":[]}`) — the
expected unreconciled state. Nothing was repaired at that point.

## 5. Hosted chain of trust — PASS

The locked fingerprint tool was re-run against Staging **before** capture and before any remote
mutation, using the tool's own documented read-only method (a `SELECT` inside a rolled-back
transaction, `search_path` pinned to `''`). Tool hashes verified against the Commit A lock:

| File | SHA-256 |
|---|---|
| `supabase/tools/schema-lines.sql` | `1b159be53544cabf94d0893ac728561c9d6df7d8c23a599e29d8099ff7945a6b` |
| `supabase/tools/schema-fingerprint.mjs` | `5ba8c323f4f7e678d3a89da6de806f1f1315e95f073ac6e5769239772d2a1379` |
| `supabase/tools/README.md` | `eb7de120648223b41299315c84d04a433adf563d9843cac49f6e80273c6313b9` |

Result: 16 rows, **961 facts**, gating digest **`c55d9b80d604211a5841260709b27f47`** — an exact
reproduction of the historical digest, with all 15 dimension digests also identical. No
cross-comparison was made against any other digest algorithm.

## 6. Baseline capture — PASS

Captured with `db pull build4_baseline --linked --schema public,private`, producing exactly one
migration file. `--yes`, `--force` and every auto-confirm mechanism were avoided.

**Operational finding worth recording.** With the CLI's agent auto-detection active (the default in
an agent session), `db pull` does **not** display the `Update remote migration history table? [Y/n]`
prompt and silently takes its default of *Yes*. This was proven against a throwaway **local**
database, never Staging: the probe returned `"remoteHistoryUpdated":true` and created
`supabase_migrations.schema_migrations` in the probe database. Passing the documented global flag
`--agent no` restores the real prompt, which was then answered **n**. `--agent no` is not an
auto-confirm mechanism; it is what makes the required "answer NO" possible in a non-interactive
shell. B4-P0-055 requires that answer, so this flag is load-bearing for any future repetition of
this step.

Verified afterwards: `migration list` reported `local 20260919230054 / remote ""` — the remote
history was **not** updated by the pull.

## 7. Baseline review — PASS

Full inventory, function inventory, normalization log, excluded platform internals and privilege
review are recorded in `supabase/tools/baselines/phase1-baseline-review.md`.

Summary: 14 tables, 148 columns, 130 constraints (14 PK, 26 FK, 84 CHECK, 6 UNIQUE), 51 indexes,
37 policies, 12 revision triggers, 3 functions, RLS enabled on all 14 tables.

**Revision triggers exist on 12 of the 14 tables** (absent on `discovery_answers` and
`action_records`). This matches the authority record and was not "corrected" to 14.

Two normalizations were made, both documented with reason and impact:

1. **Generated noise.** `DROP EXTENSION pg_net;` removed — platform-managed extension teardown
   emitted only because the CLI shadow database ships `pg_net` while Staging does not have it.
   Dimension `info.extensions` (informational). Application impact NONE.
2. **ACL replay normalization (owner-authorized).** 17 explicit `REVOKE` statements added, each
   derived from the captured hosted Staging privilege facts. Application impact NONE.
   **These REVOKEs do not tighten Staging; they make a fresh local reconstruction match the
   privileges already present on Staging.**

No app-owned structure was altered: no change to tables, columns, PKs, FKs, CHECK or unique
constraints, indexes, RLS enablement, policies, triggers, function bodies, security modes,
`search_path`, ownership or signatures.

## 8. Local reproduction — PASS

A fresh local database was recreated entirely from the reviewed migration using
`supabase db reset --local`. `db reset --linked` was never run and no real `db push` was ever run.
The migration applied without error, including the `private` schema, all policies, the `ensure_rls`
event trigger and the REVOKE block.

### First attempt — failed, and why that mattered

The first reproduction (after noise removal only) **failed** app-owned parity on three gating
dimensions, every difference being the local replay *more permissive* than Staging, with zero
hosted-only lines:

| Dimension | Hosted | Local | Extra locally |
|---|---|---|---|
| `privileges.relations` | 336 | 448 | 112 — `anon` gained all 8 privileges on all 14 tables |
| `privileges.functions` | 8 | 13 | 5 — `PUBLIC` gained EXECUTE on all 3 functions; `anon` and `authenticated` on `rls_auto_enable()` |
| `privileges.effective` | 205 | 310 | 105 |

Cause: the capture replays the stock `ALTER DEFAULT PRIVILEGES` grants before creating the objects,
and carries no compensating `REVOKE`; PostgreSQL additionally grants `EXECUTE` to `PUBLIC` on new
functions. This is the hazard recorded in **B4-P0-040**. Phase 1 stopped there and the owner
authorized the narrow ACL normalization.

### Second attempt — PASS

After the authorized REVOKEs, the local reproduction reports gating digest
**`c55d9b80d604211a5841260709b27f47`** over **961** facts — identical to hosted Staging.

## 9. Fingerprint artifact and dimension parity — PASS

`supabase/tools/baselines/phase1-staging-fingerprint.json` records project ref, baseline version and
filename, all three baseline hashes, tool hashes, CLI version, hosted and local Postgres versions,
hosted gating digest and fact count, dimension classifications, hosted and local dimension digests,
the app-owned parity result, explained platform differences, the normalization log and the row and
auth census. It contains no credentials.

| Dimension | Class | Hosted | Local | Parity |
|---|---|---|---|---|
| `schemas` | app-owned | 2 | 2 | MATCH |
| `relations` | app-owned | 14 | 14 | MATCH |
| `columns` | app-owned | 148 | 148 | MATCH |
| `constraints` | app-owned | 130 | 130 | MATCH |
| `indexes` | app-owned | 51 | 51 | MATCH |
| `triggers` | app-owned | 12 | 12 | MATCH |
| `functions` | app-owned | 3 | 3 | MATCH |
| `policies` | app-owned | 37 | 37 | MATCH |
| `privileges.schemas` | app-owned | 9 | 9 | MATCH |
| `privileges.default_acl` | app-owned | 6 | 6 | MATCH |
| `privileges.relations` | app-owned | 336 | 336 | MATCH |
| `privileges.functions` | app-owned | 8 | 8 | MATCH |
| `privileges.effective` | app-owned | 205 | 205 | MATCH |
| `info.event_triggers` | platform / informational | 7 | 7 | MATCH |
| `info.extensions` | platform / informational | 5 | 6 | differs, explained (`pg_net`) |

`types` and `privileges.columns` are empty on both sides and emit no row. No dimension was
reclassified or weakened to make the gate pass.

## 10. Row and auth census — PASS

Pre-repair and post-repair, against linked Staging, read-only: 15 entities counted (the 14
application tables plus `auth.users`), **0 nonzero**, total **0** rows and **0** auth users.

## 11. Recovery posture — recorded, nothing changed

Staging: region `us-west-2`, `walg_enabled: true`, `pitr_enabled: false`, **0 listed physical
backups**. Recorded as found. No plan upgrade, no PITR purchase, no paid backup enabled, no
Production call (B4-P0-052 / OD-2).

Owner-gated recovery command shape, **not run**:

```
npx --no-install supabase migration repair 20260919230054 --status reverted
```

## 12. Staging migration-history reconciliation — PASS

Executed only after every pre-repair gate passed, with the authorization ceremony printed first and
the exact CLI 2.109.1 syntax confirmed from `migration repair --help`:

```
npx --no-install supabase migration repair 20260919230054 --status applied --linked
```

Result: `Repaired migration history: [20260919230054] => applied`,
`{"versions":["20260919230054"],"status":"applied","repairAll":false}`.

No manual insert into any migration table. No `db push` was used to establish the baseline
(B4-P0-055).

## 13. Zero-pending verification — PASS

- `migration list`: `local 20260919230054 / remote 20260919230054` — local and remote agree.
- `db push --dry-run`: **"Remote database is up to date"** — zero pending migrations.
  `DRY_RUN = EXECUTED`. No real `db push` was run. The CLI was not upgraded.

## 14. Post-repair fingerprint — PASS

The same locked method re-run against Staging after the repair returned an identical result:
**961 facts**, gating digest **`c55d9b80d604211a5841260709b27f47`**, every dimension digest
unchanged including the informational ones. Migration bookkeeping lives in the `supabase_migrations`
schema, which is outside the `public`/`private` fingerprint scope, so no application drift occurred
and none was confused with bookkeeping.

## 15. Advisors — PASS

Staging only, read-only, through the existing Supabase MCP path:

- **Security: clean.** Zero findings.
- **Performance: 29 `unused_index` INFO findings**, the expected posture for an empty database.

This matches the prior recorded posture exactly (checkpoint section 5). No differences to report.

## 16. Repo ownership — PASS

Files created or changed in Phase 1, all within the allowed list:

- `supabase/migrations/20260919230054_build4_baseline.sql` (new, the only `.sql` migration)
- `supabase/tools/baselines/phase1-staging-fingerprint.json` (new)
- `supabase/tools/baselines/phase1-baseline-review.md` (new)
- `docs/builds/BUILD4_PHASE1_COMPLETION.md` (this file, new)
- `docs/builds/BUILD4.md`, `docs/builds/BUILD4_PHASE0_CHECKPOINT.md` (status lines only)

No application source, dependency, configuration, Auth or product file was changed. `supabase/config.toml`
was not modified. The fingerprint tool was not modified.

## 17. Deferred finding for SD4

The baseline retains the stock `ALTER DEFAULT PRIVILEGES` statements granting `anon`, `authenticated`
and `service_role` on TABLES, SEQUENCES and ROUTINES in schema `public`. Any object created **after**
this baseline will again inherit those grants unless the migration creating it revokes them
explicitly. Phase 1 deliberately did not redesign default privileges — it reproduced current hosted
privileges faithfully. Recorded for SD4 / the future schema migration phase. Related decision:
**B4-P0-040**.

## 18. Cross-check against B4-P0-053 and the CLI bridge decisions

| Decision | Requirement | Result |
|---|---|---|
| B4-P0-053 | Phase 1 is database baseline / migration foundation only | Honoured. No local schema v3, no Supabase runtime client, no auth, no account namespaces, no claim/bootstrap/sync runtime, no RevenueCat change, no account deletion, no schema deltas S1–S12, no RLS changes, no RPCs, no Edge Functions. |
| B4-P0-054 | Process-scoped credentials, no `supabase login`, identity gate first, Staging-only link, Production never linked, one remote command at a time | Honoured in full. |
| B4-P0-055 | `db pull` with history update answered NO; inspect and reproduce locally first; `migration repair --status applied` against Staging only after gates; no manual history insert; no `db push` baseline; post-repair verifications | Honoured in full. |
| B4-P0-050 / 051 | No Production mutation; Staging first | Honoured. Zero Production calls of any kind this phase. |
| B4-P0-052 / OD-2 | No plan upgrade, no PITR purchase | Honoured. Posture recorded only. |
| B4-P0-056 | Only the two Her Keys projects; K Scan out of scope | Honoured. No K Scan project, org or credential was touched. |
| B4-P0-040 | Never rely on default grants | Applied. The parity gate caught the default-grant widening and it was corrected in the baseline. |

## 19. Containment

Branch `build/04-cloud-identity-sync` throughout. No push, no PR, no merge. `main` unchanged.
Staging application schema unchanged, Staging application data unchanged; the only remote change is
Staging migration bookkeeping. Production: no call, no link, no mutation. K Scan: no interaction.

## 20. Outstanding

- Owner review of this report.
- Secret cleanup in the owner's original PowerShell process (the assistant does not control that
  shell and makes no claim that it was cleared).
