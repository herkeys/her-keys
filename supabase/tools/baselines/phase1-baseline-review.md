# Build 4 Phase 1 — Staging baseline review

| Field | Value |
|---|---|
| Staging project ref | `fhhudicklmpofuzkxeqe` (org `qouxjbueadjitgpchwtj`) |
| Baseline version | `20260919230054` |
| Baseline filename | `20260919230054_build4_baseline.sql` |
| Raw capture SHA-256 | `ab52451d83fed96c0eab0a5902d16ff395918d7d8c8506da76840fbd8a69e04c` |
| Reviewed SHA-256 (after noise removal) | `08868f85cd24c37655174658626c2cac2d796d9d28475b5ad447f446a43a1469` |
| Reviewed SHA-256 (after ACL normalization) | `8bc38d66fcffbb9fa83502329bd4738a53a8446dd5ce89327013751872f8f16f` |
| CLI | 2.109.1 (not upgraded) |
| Hosted Postgres | 17.6.1.166 |
| Local Postgres | PostgreSQL 17.6 (local Supabase stack) |
| Capture command | `db pull build4_baseline --linked --schema public,private --agent no`, history prompt answered **n** |

## 1. Baseline inventory

| Item | Captured | Phase 0 record | Match |
|---|---|---|---|
| schemas | `private` created (plus `public`) | 2 | yes |
| tables | 14 | 14 | yes |
| constraints | 130 (14 PK, 26 FK, 84 CHECK, 6 UNIQUE) | 130 | yes |
| indexes | 51 (31 explicit, rest constraint-backed) | 51 | yes |
| policies | 37 | 37 | yes |
| triggers | 12 | 12 of 14 tables | yes |
| RLS enabled | 14 of 14 | all | yes |
| functions | 3 | 3 | yes |
| default privileges | 9 `ALTER DEFAULT PRIVILEGES` | 6 acl items | yes |

Tables: `profiles`, `households`, `household_members`, `household_categories`, `events`, `tasks`,
`household_systems`, `meal_plan_entries`, `onboarding_state`, `one_move_records`, `needs_me_items`,
`discovery_records`, `discovery_answers`, `action_records`.

**Revision triggers exist on 12 of the 14 tables** — absent on `discovery_answers` and `action_records`.
This matches the authority record and was **not** "corrected" to 14.

Foreign-key delete actions: 17 `CASCADE`, 8 `RESTRICT`, 1 `SET NULL`.

## 2. Function inventory

| Function | Security | search_path | Hosted EXECUTE holders | Class |
|---|---|---|---|---|
| `private.is_household_member(text)` | SECURITY DEFINER | `''` | `authenticated`, `postgres` | app-owned |
| `public.set_row_updated_at()` | SECURITY INVOKER | `''` | `anon`, `authenticated`, `postgres`, `service_role` | app-owned |
| `public.rls_auto_enable()` | SECURITY DEFINER | `'pg_catalog'` | `postgres`, `service_role` | event-trigger handler |

Platform/informational machinery, confirmed from the capture itself:
`CREATE EVENT TRIGGER ensure_rls ON ddl_command_end WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO') EXECUTE FUNCTION public.rls_auto_enable();`
Event triggers are scored in the non-gating `info.event_triggers` dimension.

Function bodies, `SECURITY DEFINER` status, `search_path` settings, ownership and signatures were
**not** changed.

## 3. Normalization log

### 3.1 Generated-noise removal (bounded-noise protocol)

| Field | Value |
|---|---|
| Original statement | `DROP EXTENSION pg_net;` (line 2) |
| Class | Generated shadow-database portability noise |
| Action | Removed |
| Reason | `pg_net` is platform-managed and lives in the `extensions` schema, not an app-owned `public`/`private` object. It appeared only because the CLI shadow database ships `pg_net` while hosted Staging does not have it. Keeping it would make the baseline tear down a platform extension on replay. |
| Application impact | **NONE** |
| Fingerprint dimension | `info.extensions` (informational, non-gating) |

### 3.2 ACL replay normalization (owner-authorized)

Every REVOKE below was derived from the **captured hosted Staging privilege facts**
(`privileges.relations` and `privileges.functions` detail lines). Nothing was guessed, and no
blanket revoke was used where hosted evidence did not prove that exact effective result.

**These REVOKEs do not tighten Staging. They make a fresh local reconstruction match the privileges
already present on Staging.**

| Affected object | Role | Hosted privilege state | Incorrect local replay state | Exact REVOKE added |
|---|---|---|---|---|
| all 14 application tables | `anon` | no ACL entry at all (hosted grantees are exactly `authenticated`, `postgres`, `service_role`) | all 8 relation privileges, inherited from `ALTER DEFAULT PRIVILEGES` | `REVOKE ALL ON TABLE public.<table> FROM anon;` (14 statements) |
| `private.is_household_member(text)` | `PUBLIC` | EXECUTE held by `authenticated` and `postgres` only | `PUBLIC` also held EXECUTE (PostgreSQL default for new functions) | `REVOKE ALL ON FUNCTION private.is_household_member(text) FROM PUBLIC;` |
| `public.rls_auto_enable()` | `PUBLIC`, `anon`, `authenticated` | EXECUTE held by `postgres` and `service_role` only | `PUBLIC` by PostgreSQL default; `anon` and `authenticated` via `ALTER DEFAULT PRIVILEGES ON ROUTINES` | `REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;` |
| `public.set_row_updated_at()` | `PUBLIC` | EXECUTE held by `anon`, `authenticated`, `postgres`, `service_role` | `PUBLIC` also held EXECUTE | `REVOKE ALL ON FUNCTION public.set_row_updated_at() FROM PUBLIC;` |

Reason (all rows): a fresh replay inherits privileges from the stock `ALTER DEFAULT PRIVILEGES`
statements contained in the capture and from PostgreSQL's default `EXECUTE` grant to `PUBLIC`.
Hosted Staging objects do not hold those privileges, so the replay was more permissive than Staging.

- **Application semantic change: NONE** for every row.
- **Classification: baseline portability / replay normalization** for every row.
- `anon` EXECUTE on `public.set_row_updated_at()` is legitimate on hosted Staging and was
  deliberately **preserved**. A blanket revoke would have broken parity.
- No privilege that exists on hosted Staging was removed. `postgres`, `authenticated` and
  `service_role` holdings are untouched.

Not changed by this normalization: table structure, columns, PKs, FKs, CHECK constraints, unique
constraints, indexes, RLS enablement, RLS policies, triggers, function bodies, security modes,
`search_path`, ownership, signatures.

## 4. Intentionally excluded platform internals

- `pg_net` extension teardown (3.1).
- Nothing else. The capture contains no hosted-only roles (`supabase_admin`, `dashboard_user`),
  no `OWNER TO` statements, and no `auth` / `storage` / `vault` / `realtime` objects.
- The `ensure_rls` event trigger **was kept** in the baseline and applied cleanly locally.

## 5. Privilege review

Roles referenced by the baseline: `anon`, `authenticated`, `service_role`, `postgres` (owner), and
`PUBLIC` (revocations only).

- 28 table grants: `ALL` to `authenticated` and `service_role` on each of the 14 tables.
- 5 function grants (section 2), plus the owner's implicit holdings.
- 9 `ALTER DEFAULT PRIVILEGES` statements — retained unchanged (section 7).
- 17 `REVOKE` statements — the replay normalization in 3.2.

## 6. Reproduction result

A fresh local database was created entirely from the reviewed migration
(`supabase db reset --local`; never `--linked`, never a real `db push`). The migration applied with
no errors, including the `private` schema, all policies, the event trigger and the REVOKE block.

Fingerprint comparison with the locked tooling, hosted vs local:

| | Gating digest | Facts |
|---|---|---|
| Hosted Staging | `c55d9b80d604211a5841260709b27f47` | 961 |
| Local reproduction | `c55d9b80d604211a5841260709b27f47` | 961 |

**All 13 app-owned / portable dimensions match hosted Staging exactly**, including
`privileges.relations` (336), `privileges.functions` (8) and `privileges.effective` (205). No
dimension was reclassified or weakened to make the gate pass.

The only difference is the informational, non-gating `info.extensions` (local 6 vs hosted 5),
explained by `pg_net` per 3.1.

## 7. Deferred finding for SD4 (not solved here)

The baseline retains the stock `ALTER DEFAULT PRIVILEGES` statements granting `anon`,
`authenticated` and `service_role` on TABLES, SEQUENCES and ROUTINES in schema `public`. Any object
created **after** this baseline will again inherit those grants unless the migration creating it
revokes them explicitly. Phase 1 deliberately does not redesign default privileges; this is recorded
as a separate finding for SD4 / the future schema migration phase. Related decision: **B4-P0-040**.

## 8. Census and posture

- Staging application rows: **0** across all 14 tables. `auth.users`: **0**.
- Staging backup posture, recorded as found, nothing upgraded: region `us-west-2`,
  `walg_enabled: true`, `pitr_enabled: false`, 0 listed physical backups.
- Owner-gated recovery command shape:
  `npx --no-install supabase migration repair 20260919230054 --status reverted`
