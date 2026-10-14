# Her Keys Premium final configuration — exact-scope execution ledger

Date: 2026-10-14. Repository: `herkeys/her-keys`. Branch: `codex/v2-premium-final-config`. Base: independent green Premium source `4be74a99423ae620c586b5a8f92abf1a954068c7`.

## Completed implementation (SOURCE evidence)
- `scripts-dev/premium-final-config/core.mjs`: explicit Staging and Production project IDs, boolean-only local secret checks for expected environment, required names and cross-environment distinctness; RevenueCat lifecycle fixtures and raw-body timestamped HMAC helpers; deterministic mismatch categories. It accepts no public client SDK key as server authority.
- `scripts-dev/premium-final-config.mjs`: executable operator commands `preflight`, `smoke`, `reconcile`, `tester add/remove`, `window enable/verify/disable`. Mutations are pinned to the Staging project and require Supabase Admin, real JWT-bound subscriber state and a recent signed TEST event. Production is read-only; activation reads Production flags and aborts if not fail-closed. The operator's ephemeral shell supplies the secrets, which are never printed, stored in Git or included in logs.
- `supabase/functions/_shared/premium/staging_tester_guard.sql`: Staging-only operator SQL source (not part of cross-environment migration chain); exact version was applied to Staging using the authorized Supabase migration tool. The server checks **auth.users.raw_app_meta_data** (admin-only) for `herkeys_premium_tester=true` when a paid feature's `rollout_status='staging_only'`. User metadata or a forged `isPremium` field cannot bypass it. Importantly the guard does **not** fabricate Premium entitlements and does not bypass membership, consent, cost/quota or deletion lifecycle. Production was not modified.
- Local tests `tests/premiumFinalConfig/{preflight,fixtures,securityBoundaries,sourceGuards,webhookIntegration}.test.mjs`, including real shipped webhook parser/HMAC validator imports; existing Premium webhook, idempotency, replay, revenue source, RLS and quota source suites are preserved. Strict CI validates the full application suite, TypeScript, Expo Doctor and release identity.
- `docs/premium/PREMIUM_FINAL_CONFIG_RUNBOOK.md`: dashboard-only human steps, exact nonsecret settings names, two RC webhook targets, activation and rollback.

## Live verification, Staging
- Supabase project `fhhudicklmpofuzkxeqe`; runtime `environment=staging`, `premium_enabled=true`, `webhook_processing=false`, `allow_test_fixtures=false`.
- `premium_staging_allowlist_guard_ready()=true` after successful Staging-only SQL installation.
- Three paid flags `daily_load_premium`, `smart_inbox_extract`, `momentum_report`: all remain `enabled=false`, `released=false`. Village and Co-Parent Plus remain unreleased.
- Account deletion remains `enabled=false`, `dry_run=true`.
- No new paid entitlement grant, secret, RC catalog/product or OAuth config mutation.

## Live verification, Production (READ-ONLY)
- Supabase project `npykvnxnehlsdlbumzwk`; runtime `environment=production`, `premium_enabled=false`, `webhook_processing=false`, `allow_test_fixtures=false`.
- Premium paid flags remain OFF. Account deletion remains `enabled=false`, `dry_run=true`; Premium base tables have forced RLS.
- `premium_staging_allowlist_guard_ready()` absent; the Staging-only guard was not deployed to Production.
- Five original Premium Edge Functions stay live and fail-closed, per earlier environment-alignment report. Production function bundles and secrets were not changed. Staging `revenuecat-webhook` and `premium-ops` were advanced to ACTIVE v2 with `requireHmac` for Staging as well as Production; existing Production functions remain v1.

## Provider configuration remains HUMAN-DEPENDENT
- RC project `proj93809efe`, entitlement `her_keys_plus` and its names/offerings untouched.
- Previously registered RC webhook `whintgr2afbbcfb32` (Sandbox→Staging), `whintgrf7d1c93842` (Production→Production). Authorization and HMAC and matching Supabase Edge secrets must be configured in dashboards; do not invent credential values.
- Before credentials: webhook/operator POST returns `503 not_configured`, the expected fail-closed state. The CLI's preflight should return FAIL; this is a correct expected result, not a certificate of Staging delivery.
- Requires a human-triggered genuine signed RevenueCat TEST event, two real Staging Auth accounts, one provider-confirmed Staging subscriber and explicit evidence before activation. Synthetic fixture HMAC receipt is **transport evidence only**, never purchase proof.
- `PREMIUM_ENVIRONMENT` in the DB and a local shell variable do **not** prove the Edge runtime's `Deno.env`; human secret read-back and live signed environment-filter tests must confirm there is no cross-wiring.

## Governance and deployment note
The Staging-only operator SQL was initially created under `supabase/migrations` and installed in Staging, but the existing repository migration-chain governance requires one shared chain usable by both environments. It was therefore **retained byte-identically** under `supabase/functions/_shared/premium` instead of introducing an unapproved Production migration. This means Staging's actual applied migration history contains an operator-only change that is intentionally absent from the shared migration chain; the release owner must reconcile Staging migration-history drift when eventually converging a public release. The strict Meals boundary scanner retains the final-config tooling ownership; the Staging guard SQL is now in the existing Premium backend namespace. No security assertion was disabled. The underlying application deletion code/tests remain unchanged.

## Open PASS/FAIL gates and evidence levels
- Preflight validator SOURCE implementation: prepared; expected live result FAIL while dashboard secrets absent.
- Webhook harness fixture/HMAC SOURCE: tested in CI once exact-SHA results are green. Hosted signed webhook: NOT RUN.
- Reconciliation runner SOURCE: implemented. A real subscriber comparison and force resync: NOT RUN.
- Staging allowlist guard: STAGING STRUCTURAL PASS, signed-in attacker + bona fide paid tester matrix: NOT RUN.
- Production fail-closed: live DB READ-BACK PASS; no Production mutation.
- Real Smart Inbox Gemini evaluation, mobile device/EAS/store purchase: NOT RUN, separate owner authorization.
- Account deletion issue #9 remains deferred for internal tests; Production deletion disabled.

## Required next sequence
1. Configure **distinct** RevenueCat webhook Authorization/HMAC and Supabase Edge secrets in both projects.
2. Run operator preflight on both; verify no secret output and 401 (instead of 503) on unauthorized POST.
3. Run genuine signed RevenueCat Sandbox TEST plus negative HMAC/replay/environment cases; inspect durable `premium_events`.
4. Add allowlisted Staging Auth user A/B; run actual Sandbox purchase/restore and RC reconciliation with no account transfer/grant from event alone.
5. Run `window enable` for proven subscriber; nonallowlisted Free must still be denied paid computation; execute all hosted hostile feature tests.
6. Roll back Staging if any failure (`window disable`), preserve receipts and event evidence.

**This execution ledger is not Staging paid-feature certification or Production launch approval.**

## Source repair / hosted negative evidence update
- A strict CI failure at run 38640219569 identified a Premium SQL operator path outside the permitted backend namespace. The SQL source was moved, byte-for-byte, to `supabase/functions/_shared/premium/staging_tester_guard.sql` and removed from the old path, without relaxing the boundary test. The subsequent run 38641101029 exposed two new test-file path/comment-matching mistakes, both corrected without suppressing tests. The final run must be evaluated on the resulting exact SHA.
- Staging `revenuecat-webhook` v2 SHA-256 `88e1c2283dc4e58a58c1730a74c8377b20fd394a71d994f392c4a94d3a82d49c`; `premium-ops` v2 SHA-256 `9374b81f67b4987cc666bdc2b2f019d0d5d0f4e49105479df2371131661d82c4`. Production keeps the original v1 function versions. Staging source readback shows `requireHmac: deployment === 'production' || deployment === 'staging'`.
- Live missing-credential POST requests after Staging deployment returned `503 not_configured`: Staging pg_net request IDs 398–399 and Production IDs 8–9, both 503. Runtime readback: Staging `staging,true,false,false`; Production `production,false,false,false`; deletion controls `enabled=false,dry_run=true` in both. No credentials were added or logged.
- The preflight now performs no-write positive-credential probes using deliberately malformed authenticated payloads (expected 400) as well as no-credential probes (expected 401), so a 401 alone cannot falsely certify that an operator's secret matches an Edge secret. These changes are SOURCE level until exact-SHA CI and real dashboard setup.
