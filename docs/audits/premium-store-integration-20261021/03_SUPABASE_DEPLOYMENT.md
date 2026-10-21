# Supabase deployment
Only Her Keys projects were accessed: Staging fhhudicklmpofuzkxeqe; Production npykvnxnehlsdlbumzwk.

Source migrations:
- 20261021075347_premium_verified_subscription_period.sql: nullable verified period type/start/trial-end columns; service-only CAS writer; own-account display RPC. No backfill, new table, user deletion, entitlement grant, or access-state rule change.
- 20261021083447_premium_test_store_checkout_isolation.sql: separate default-OFF Test Store checkout flag and tester-only RPC, constrained to Staging. Commercial checkout remains independent. Production cannot enable this flag.

Deployment order: disposable full-chain PostgreSQL execution and privilege/CAS tests → Staging migration → Staging functions → live RLS/privilege/count checks → signed provider TEST → equivalent Production migration/functions. The second migration also passed disposable PostgreSQL checks before Staging/Production application. Provider TEST is delivery evidence only.

MCP records migration names under provider-generated versions (first Staging version 20261021080329); source filenames retain CLI-generated creation versions. This historical repository already uses such version/name mappings. Do not run an indiscriminate db push to replay migrations by filename.

Latest verified functions, hashes, migrations and runtime snapshots are recorded in evidence/backend-final.json. Staging versions: gate 7, reconcile 8, extract 7, webhook 9, ops 9; Production versions: all five 6. Corresponding hashes match across environments. Authentication settings: gate/reconcile/extract verify_jwt=true; webhook/ops false with their own HMAC+Authorization or operator-secret authentication. The deployed shared requireUser checks the existing server deletion lifecycle before authenticated work and bounds admin requests; no deletion job is activated.

Provider migration versions: verified period = Staging 20261021080329 / Production 20261021082620; isolated Test Store checkout = Staging 20261021083704 / Production 20261021083707. Native checkout and Test Store checkout are both OFF in both environments at final capture. Production deletion, deletion-monitor and proof-expiry cron jobs remain inactive; existing Staging monitor/proof-expiry jobs were left as found, and its deletion worker remains inactive.

Secret presence: CLI list-secrets returned 403 on both named Her Keys projects. Do not retry that credential path or assume secret plaintext is exportable. Endpoint behavior confirms webhook and operator secrets are configured (401, not 503), and the Staging provider-issued signed TEST confirms the webhook signing/authentication match. No secret was rotated. Production signing was checked fail-closed without creating an event.

Before changes, Staging had two entitlement rows (reconcile/test_fixture) and Production one reconcile row. Counts remain checked after deployment. Existing fixture data is not purchase evidence. Production runtime keeps premium_enabled=true, webhook_processing=true, allow_test_fixtures=false, checkout_enabled=false; the three delivered Premium features remain released/general. Account-deletion processing remains separately controlled.

Rollback: keep checkout disabled; revert affected Edge Functions to the prior candidate source and known deployment config if needed. Leave additive columns in place; older writers clear unsupported period metadata safely. Revert the display RPC/writer definitions to the pre-migration version only if required, preserving ACL/RLS and all rows. Never drop purchase evidence or disable existing subscriber benefits as a rollback shortcut.

