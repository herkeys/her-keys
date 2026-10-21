# Production promotion manifest — account deletion Phase 2 (2026-10-20)

Production `npykvnxnehlsdlbumzwk`. Staging `fhhudicklmpofuzkxeqe`. This supersedes the **function** list of `../production-promotion-manifest-20261019.json` and keeps its **migration** list unchanged. No Production mutation was made in Phase 2.

## Gate results

| Gate | Value | Why |
|---|---|---|
| `PRODUCTION_MIGRATION_READY` | **YES** (artifacts) | Four migrations unchanged since Phase 1; LF checksums re-verified, including on a fresh `autocrlf=true` clone; pass the fresh embedded chain locally |
| `PRODUCTION_FUNCTION_READY` | **NO** | Source is ready, but DEL-P2-001/002 need security/product approval and Staging redeploy plus hosted re-certification first |
| `PRODUCTION_NONDESTRUCTIVE_PROMOTION_APPROVED` | **NO** | No P1 approval recorded |
| `PRODUCTION_DESTRUCTIVE_PROCESSING` | **OFF** | Last verified read-only by Phase 1 (2026-10-19): `enabled=false`, `dry_run=true`, zero active destructive jobs. Not re-read in Phase 2 (no Supabase access, DEL-P2-013). |
| `PRODUCTION_ACTIVATION_READY` | **NO** | See activation prerequisites |

## Migrations (apply once, in order; unchanged from Phase 1)

| # | File | SHA-256 (LF) | Staging history | Production |
|---|---|---|---|---|
| 1 | `20261019144729_account_deletion_v2_resource_certification.sql` | `20b63f9312197ee9dee0809ddc69fc3a399acbae589b38da1a21b64efe858fc6` | 20261019150824 | not applied |
| 2 | `20261019151501_account_deletion_optional_welcome_inventory.sql` | `462f42d8cd1198a6da3ebc65b83527bde07ee32cbb376ab3eae1fac836ca32c3` | 20261019151616 | not applied |
| 3 | `20261019152629_account_deletion_overdue_request_monitor.sql` | `ae02ba5a240d0a5d68b6302faee03b339b06412473c30dbc6b200ea8dd433683` | 20261019152912 | not applied |
| 4 | `20261019153801_account_deletion_private_household_owners.sql` | `ad177babba7adec7bde2df6a5dd1e5670e1f8689024345dd5a55101d4f9bae3d` | 20261019153856 | not applied |

Apply from LF bytes only (DEL-P2-006). Each migration aborts on a contract mismatch rather than half-applying.

SQL privilege and RLS impact (reviewed): new `private.*` tables have RLS on and ALL revoked from PUBLIC/anon/authenticated/service_role. Every new `SECURITY DEFINER` function sets `search_path=''` and has EXECUTE revoked from PUBLIC/anon/authenticated/service_role (only definer-internal callers). Patched functions are re-created from `pg_get_functiondef`, preserving their definer, search path and grants. A new RESTRICTIVE policy on `premium_decisions` requires an active account. New triggers on 7 Premium tables refuse writes for inactive accounts. `account_deletion_control.test_scope_only` defaults to `false` (no behaviour change in Production).

Conflict review with Premium/AI tables: the migration fails closed with `unclassified_resource:<names>` if Production has any public/private table not in the registry or exception list. Production's census from Phase 1 (`../production-schema-census.json`) was fully classified at that time. **Re-run the census immediately before applying**; any new V2 table added since 2026-10-19 blocks the migration until classified.

## Edge Functions (deploy only these seven; source = this branch HEAD)

All seven import `deletionCore.ts`, which changed in Phase 2 (dependency graph from `deno info`):

| Function | verify_jwt | Prod version before | Staging (Phase 1) | Shared modules |
|---|---|---|---|---|
| `request-account-deletion` | true | 5 | 11 | crypto, deletionCore, deletionService, http, supabaseAdmin |
| `restore-account` | false (handler validates token) | 5 | 9 | same |
| `resend-restoration-email` | false (non-enumerating) | 5 | 9 | same |
| `deletion-status` | false (receipt-only) | 5 | 9 | same |
| `begin-web-deletion` | false (non-enumerating) | 5 | 8 | same |
| `monitor-account-deletions` | false (HMAC) | 5 | 11 | + deletionMonitor |
| `process-account-deletions` | false (HMAC) | 5 | 14 | + deletionApple, deletionProviders, deletionWorker |

Already matching, **do not redeploy**: `capture-apple-credential`, `expire-account-deletion-proofs` (they import none of the changed modules).

Changed shared sources (LF SHA-256):

| File | Phase 1 (e265f27) | Phase 2 (this branch) |
|---|---|---|
| `_shared/deletionCore.ts` | `d3d9a5c8…69c93c` | `831ac2e47ab1786b808656b15bc58b87fcd04d867a6f5a71803b4d2f674bc079` |
| `_shared/deletionProviders.ts` | `4bda8b20…b942e7` | `2a46d9e953c2bb59c1c6b7f979a018bf6c099750da4a17f3308214cbec27df97` |
| `_shared/deletionWorker.ts` | `ea0632ca…efb15c` | `d3ee1bea989d3792a626cc956809ca5cee754a4f7c022cd62157eb8bd2d7cdce` |

Unchanged (must match Phase 1 read-back): `deletionService.ts ba884b7b…39dee3`, `deletionMonitor.ts 95134f33…663e3c`, `deletionApple.ts 74e30070…2dc9c`, `crypto.ts 31e3efa4…7ba0cb`, `http.ts 58f66be6…62576a`, `supabaseAdmin.ts a985c9ee…3ef96`.

**Ordering dependency:** the worker calls `command('processing_scope')`, which exists only after migration 1. Migrations first, then functions.

## Secrets (names only; values never read)

`EXTERNAL_TOKEN_ENCRYPTION_KEY_B64`, `REVENUECAT_DELETION_API_KEY`, `REVENUECAT_PROJECT_ID`, `APPLE_DELETION_CLIENT_ID`, `APPLE_DELETION_TEAM_ID`, `APPLE_DELETION_KEY_ID`, `APPLE_DELETION_PRIVATE_KEY`, `RESEND_API_KEY`, `DELETION_EMAIL_ENABLED`, `DELETION_ALERT_RECIPIENT`. Production presence remains **NOT_VERIFIED** (Phase 1: CLI listing 403; Phase 2: no access). GitHub (watchdog): `DELETION_WORKER_KEY` secret, `DELETION_WATCHDOG_ENABLED` and `DELETION_WATCHDOG_PROJECT_URL` variables.

## Phases and approval boundaries

**P0, read-only (authorized; BLOCKED this session).** Re-run on Production: migration history, schema census vs registry, `account_deletion_control`, `cron.job` active flags, function versions and source read-back hashes, secret names, advisors. Queries:

```sql
SELECT enabled, dry_run, test_scope_only, max_attempts, last_run_at FROM public.account_deletion_control;
SELECT jobname, active FROM cron.job WHERE jobname LIKE 'herkeys-account-deletion%';
SELECT version, name FROM supabase_migrations.schema_migrations WHERE name LIKE 'account_deletion%' ORDER BY version;
SELECT count(*) FROM private.deletion_resource_registry;           -- expect 43 before, 50 after migration 1
SELECT status, count(*) FROM public.account_deletion_requests GROUP BY 1;
```

**P1, non-destructive promotion (needs explicit approval of exactly this manifest).**
1. Approvals recorded: DEL-P2-001/002 security/product sign-off; this manifest.
2. Staging first: deploy the 7 functions, read back hashes, run the Phase 2 hosted rows (`02-staging-certification.md` §Remaining), restore controls.
3. Production P0 snapshot, then apply migrations 1–4 in order; record generated history versions; re-run `get_advisors` and the privilege checks.
4. Deploy the 7 functions; read back each graph; compare with the hashes above.
5. Post-deploy smoke (no customer effect): `deletion-status` with a random receipt → non-purged; unauthenticated `request-account-deletion` → 401; `monitor-account-deletions` with no signature → 401; `health` via the signed monitor → `{healthy:true}` or an explainable count; controls still `enabled=false, dry_run=true`; zero active destructive jobs.
6. Expected downtime: none (additive SQL and function swap). Customer-data risk: none while processing is off. Requests made after deploy are deactivated and recoverable, not purged.

**P2, controlled Production test (separate approval).** A disposable Production identity created for the test, scoped via `deletion_test_scope` and `test_scope_only=true`, with a precisely listed set of allowed effects. Never a customer account; never a global deadline change.

**P3, unattended deletion (separate explicit activation).** Needs: P1+P2 complete, website public (AD-009), legal approved (AD-011), native evidence or an accepted gap, the watchdog enabled (DEL-P2-005), and the scheduler plan approved. Never inferred from P1 or P2.

## Stop and rollback

```sql
UPDATE public.account_deletion_control SET enabled=false, dry_run=true WHERE singleton;
SELECT cron.alter_job(job_id:=(SELECT jobid FROM cron.job WHERE jobname='herkeys-account-deletion'), active:=false);
```

Functions: redeploy the previous version (Phase 1 read-back versions are in `../evidence/20261019-npykvnxnehlsdlbumzwk-functions.json`). The Phase 2 function change is backward compatible with existing evidence values. SQL is additive: roll forward only. Never re-introduce an unknown-resource bypass, extend deadlines or restore a deleted identity.

Irreversible effects in P1: none. In P2/P3: Auth, database, Storage and RevenueCat deletion are permanent by design.
