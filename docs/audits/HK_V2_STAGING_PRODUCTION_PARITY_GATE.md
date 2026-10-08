# Her Keys V2 — Staging / Production Parity Gate

**Prepared:** 2026-10-08  
**Repository source:** `integration/welcome-tree-auth-runtime` @ `dc56531a5457307471cbf996e0c3051dcc757047`  
**Status:** `PARITY_NOT_CERTIFIED`. This is a verification / promotion contract, NOT a report of live database checks.  
**Safety:** Her Keys projects ONLY; no K Scan project, no destructive resets, no copying credentials, no automatic Production writes.

| Environment | Supabase project ref | Intended role |
|---|---|---|
| Staging | `fhhudicklmpofuzkxeqe` | Device authentication, provider, sync, isolation and feature certification |
| Production | `npykvnxnehlsdlbumzwk` | Protected; promote only after Staging gates pass |

## 1. Parity definition

**Must match in capability/source, not secret values:**
- Applied schema/migration contract: every migration from `supabase/tests/migration-chain.mjs`, particularly F05, F08, F09–F13 and INT13; all tables, views, triggers, functions, indexes and grants required by the current application.
- Row-level security, owner/child/household access policies, `sync_push`/`sync_pull`, change-log semantics, claim/bootstrap RPCs and owner-private table protections. Compare normalized `pg_get_functiondef`, `pg_policies`, `pg_indexes`, permissions and migration version lists; don't infer parity from table names alone.
- Deployed `herkeys-ai`, `calendar-data`, `calendar-oauth` and `weather-context` source hashes and each function's intended JWT setting. `calendar-oauth` has a callback that must remain publicly reachable and therefore has a different JWT deployment setting from protected data functions.
- Supported authentication methods, mobile redirect behavior, access/session policies, account isolation, typed-code OTP behavior when promoted, and legal / security policy capabilities.
- App and EAS profiles must resolve to the **correct project**; verify `EXPO_PUBLIC_HERKEYS_BACKEND`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `EXPO_PUBLIC_HERKEYS_DATA_MODE=empty` without printing secrets.

**Must differ by design:**
- Project URLs / refs, project-specific publishable credentials, Google/Apple provider secrets, Calendar OAuth credentials, token-encryption keys, staging versus production email sender credentials, RevenueCat public keys and store sandbox versus production configurations.
- OAuth authorized redirects include each project's own `https://<project-ref>.supabase.co/auth/v1/callback`. The in-app identity callback is `herkeys://auth/callback`. Calendar's separate app callback is `herkeys://calendar-connected`.
- Stage-specific usage limits / data and test accounts; do NOT clone live users, child records, refresh tokens, private content or production secrets to Staging.

## 2. Known differences / unverified items at audit handoff

These are **earlier agent/dashboard observations**, not freshly queried values from the preparing assistant.

| Item | Staging (reported) | Production (reported) | Decision |
|---|---|---|---|
| Google identity client order | Web ID `857660202409-109l3…` first; native iOS/Android retained | Web ID first; iOS/Android retained | Equivalent, Google runtime still pending |
| Identity app callback | `herkeys://auth/callback` allow-listed | Same allow-listed | Equivalent, test both OSes |
| Email OTP digits | **6** | **8** | **KNOWN DRIFT — HOLD Production until Staging email runtime proof, then promote to 6** |
| Email templates | Default **link-only** | Default **link-only** | Both unsuitable for typed-code UI; add `{{ .Token }}` to Confirm signup and Magic link |
| Custom Her Keys SMTP | **Not configured** | **Not configured** | Requires owner-selected Her Keys transactional sender; no K Scan reuse |
| Anonymous sign-in | OFF | OFF | Equivalent |
| Manual account linking | OFF | OFF | Equivalent |
| Apple identity audiences | Native `com.herkeys.app` | Native `com.herkeys.app` plus services ID | Native equivalent; iOS device proof required |
| Site URL | `http://localhost:3000` | `http://localhost:3000` | Same, but unsuitable release fallback; choose canonical Her Keys web origin |
| `herkeys-ai` | v1 JWT-protected deployed; Gemini secret name present | Same bundle reported; secret name present | Source reported equivalent, authenticated Gemini smoke pending |
| Calendar functions | Activated and identical source reported | Activated and identical source reported | Calendar consent and refresh unproven |
| WeatherKit function | Activated and identical source reported | Activated and identical source reported | WeatherKit authenticated response unproven |
| F01–F13 database/schema | Locally certified only; actual deployed ledger **not freshly checked** | **Not freshly checked** | **P0 — compare live ledgers and normalized schema/RLS before V2 user data** |
| RevenueCat | Store/product configuration deferred | Store/product configuration deferred | Do not gate auth testing; separate commerce release gate |
| Hosting availability | Free Staging may pause | Inspect current Production plan | Distinct operational risk, not schema drift |

The original F01–F13 local backend certification (1,592/1,592 checks) performed **zero Her Keys Staging or Production reads/writes**. Never reinterpret it as proof of remote deployment.

## 3. Required read-only live evidence (Claude Code / authorized Her Keys org session)

1. Verify project identity **by exact ref and display name** before collecting evidence. Stop on any K Scan ref or unexpected organization.
2. Export non-secret migration **version lists** from both databases and compare to the ordered local migration-chain manifest. List missing versions and any different application order; don't apply migrations automatically.
3. Compare normalized public schema signatures: `information_schema.columns`, RLS flags, `pg_policies`, `pg_indexes`, triggers, `pg_get_functiondef` for claim/sync/RLS helpers, grants and Storage policies. If any divergence, classify `MISSING`, `SOURCE_DRIFT`, `INTENTIONAL_ENV_DELTA`; no destructive rebuild.
4. Inventory edge-function deployment versions, **source digests** and `verify_jwt` by name on both projects. Never read or print provider secret values; confirm the necessary secret **names** only.
5. Compare Auth configuration on both projects: Google client order, Apple native audience, callback allow-list, anonymous/manual linking settings, token/session settings, OTP length/expiry, sender/template behavior and rate limits. Record actual observable values, not assumptions.
6. Confirm the resolved EAS Staging test artifact uses the Staging ref and `empty` data mode; verify Production artifact will target Production ref. Print only host/project-ref, never a credential.
7. Preserve a dated evidence matrix with `SOURCE_SHA`, Staging/Production refs, observed setting, parity verdict, proof type, owner action, and any approved intentional difference.
8. Test Staging **end-to-end**: Google Android/iOS, Apple iOS, email OTP (once SMTP is present), authenticated Gemini, Calendar OAuth, WeatherKit, F01–F13 create/edit/sync/RLS, account A→B→A, and new-device restoration behavior. Do not report model/test stubs as real-device proof.

## 4. Controlled promotion (not yet authorized for unattended execution)

After Staging passes and the owner approves Production changes:
1. Write non-destructive missing migrations only after comparing exact migration content and proving populated-upgrade safety.
2. Promote tested matching Edge Function source and reviewed JWT flags; avoid blind overwrites.
3. Configure **Her Keys-only** transactional sender and six-digit `{{ .Token }}` templates; change Production OTP length from 8 to 6. Keep existing sessions/accounts safe.
4. Verify platform provider configuration without unnecessary credential rotation. Never swap Google identity OAuth clients with the distinct Calendar OAuth client.
5. Re-run a controlled authenticated Production smoke test (no test data in real customer households) and repeat read-only parity report.
6. Record `STAGING_PARITY=PASS`, `PRODUCTION_PARITY=PASS`, `AUTH_RUNTIME=PASS`, `FEATURE_BACKEND=PASS`, `SOURCE_SHA=<actual SHA>` **only with actual results**.

## 5. Handoff acceptance

Return:
```text
SOURCE_SHA=
STAGING_REF=fhhudicklmpofuzkxeqe
PRODUCTION_REF=npykvnxnehlsdlbumzwk
SCHEMA_MIGRATION_PARITY=PASS|FAIL|BLOCKED
RLS_RPC_SYNC_PARITY=PASS|FAIL|BLOCKED
EDGE_FUNCTION_SOURCE_PARITY=PASS|FAIL|BLOCKED
EDGE_JWT_POLICY_PARITY=PASS|FAIL|BLOCKED
AUTH_CONFIG_PARITY=PASS|FAIL|INTENTIONAL_DRIFT|BLOCKED
EMAIL_OTP_PARITY=INTENTIONAL_DRIFT_PENDING_SMTP|PASS|FAIL
EAS_TARGET_IDENTITY_PARITY=PASS|FAIL|BLOCKED
STAGING_RUNTIME=PASS|FAIL|BLOCKED
PRODUCTION_PROMOTION=NOT_APPLIED|APPROVED_AND_APPLIED
OVERALL_PARITY=PASS|FAIL|BLOCKED
```
No environment may be called **fully in parity** while Production OTP remains 8 digits and Staging OTP is 6, or while deployed migrations and policies have not been independently compared.
