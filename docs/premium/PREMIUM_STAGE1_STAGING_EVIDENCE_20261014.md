# Her Keys Premium Stage 1 — Hosted Backend Evidence (2026-10-14)
Evidence classification: **STAGING_VERIFIED for deployment, unauthenticated GET/POST negative probes and database permissions ONLY**. Does not promote earlier SOURCE_VALIDATED webhook, entitlement, quota, purchase, or device matrices to STAGING_VERIFIED.

## Provenance
- Source: `herkeys/her-keys` Premium SHA `e4462d2a5cb42706a8523f6ba45248ee9396d02e`.
- Environment Staging Supabase `fhhudicklmpofuzkxeqe`; Production safeguards `npykvnxnehlsdlbumzwk`.
- Backend owner scope only. **No Production Premium function deployed, no customer grant, no RC catalog/pricing change, no device EAS build.**
- Staging database contains both additive Premium migrations; runtime `environment=staging`, `premium_enabled=true`, `webhook_processing=false`, `allow_test_fixtures=false`.
- Production contains both migrations; runtime `environment=production`, `premium_enabled=false`, `webhook_processing=false`, `allow_test_fixtures=false`. Account deletion remains `enabled=false,dry_run=true` in both.

## Hosted database privilege evidence
The audit used `pg_class` RLS flags, `has_table_privilege(anon/authenticated)`, `has_function_privilege(anon/authenticated)`, `pg_proc`, `pg_constraint`, and `premium_health()`.
- Staging and Production: **11/11** public Premium base tables `relrowsecurity=true`, `relforcerowsecurity=true`; `anon` table rights **zero**, direct authenticated writes **zero**. `premium_decisions` alone grants authenticated SELECT; its RLS limits to the deciding account.
- **Only four** `premium_*` functions have authenticated EXECUTE: `premium_decision_record`, `premium_decision_transition`, `premium_feature_manifest`, `premium_my_entitlement`. All other Premium RPCs and all anon RPC calls denied.
- No `premium_*fixture*` stored function; no test-fixture entitlement row observed on Production.
- Production fixture constraint is `premium_no_fixtures_in_production CHECK (NOT (allow_test_fixtures AND environment='production'))`; verified by reading `pg_get_constraintdef`, not by attempting a Production WRITE.
- Health Staging: `ok:false`, sole alert `webhook_processing_halted` (expected). Health Production: `ok:false`, alerts `webhook_processing_halted`, `premium_globally_disabled` (expected); no dead letter/backlog/reconciliation errors.

## Deployed Staging Edge Functions (read back from Supabase)
| Function | Version | Status | verify_jwt | Deployment artifact SHA-256 |
|---|---:|---|---|---|
| `premium-gate` | 1 | ACTIVE | true | `366307e1be3369f38031d3f29bd835a89568e703d272101021189b9202264bab` |
| `premium-reconcile` | 1 | ACTIVE | true | `c115d42e4fb4d91ed52696153d3f0466bd0f0790ccaacd5657b104a2ffd07cab` |
| `smart-inbox-extract` | 1 | ACTIVE | true | `52f7187bf041051d088c694c09145e41d3947920fefe4660075e725992e976e8` |
| `revenuecat-webhook` | 1 | ACTIVE | false (custom webhook auth) | `0261ac7e7b20dfe54c08ec6fc1e5792ebe9ab305771af379d487d5dabb5fd694` |
| `premium-ops` | 1 | ACTIVE | false (custom operator auth) | `65a8829ac70012f1b515a5d7965e65edb018fcc2a6f63cba11ed9f30e2760557` |

Every deployment used explicitly fetched source files plus the recursive dependency closure; each bundle passed a missing-relative-import check. No functions deployed to Production.

## Real Staging HTTP evidence
Use Staging's **existing** `pg_net` HTTP client; requests made to Staging's public function URLs. Responses read from `net._http_response` and independently corroborated in Supabase `function_edge_logs` around 18:16–18:18 UTC.

| Request ID | Request | Actual HTTP | Body / meaning |
|---:|---|---:|---|
| 340 | GET premium-gate, no Authorization | 401 | `UNAUTHORIZED_NO_AUTH_HEADER` |
| 341 | GET premium-reconcile, no Authorization | 401 | `UNAUTHORIZED_NO_AUTH_HEADER` |
| 342 | GET smart-inbox-extract, no Authorization | 401 | `UNAUTHORIZED_NO_AUTH_HEADER` |
| 343 | GET revenuecat-webhook | 405 | `method_not_allowed` |
| 344 | GET premium-ops | 405 | `method_not_allowed` |
| 346 | POST webhook, no Authorization | 503 | `not_configured` — fail closed; **secret not set** |
| 347 | POST webhook, invalid Authorization | 503 | `not_configured` — fail closed, not the intended configured 401 |
| 348 | POST ops, no x-premium-ops-secret | 503 | `not_configured` — fail closed; **secret not set** |
| 349 | POST ops, invalid operator credential | 503 | `not_configured` |
| 350 | POST gate, missing JWT | 401 | `UNAUTHORIZED_NO_AUTH_HEADER` |
| 351 | POST smart-inbox, missing JWT | 401 | `UNAUTHORIZED_NO_AUTH_HEADER` |

After all negative probes: `premium_events=0`, `premium_entitlements=0`, `premium_authorization_audit=0` on Staging. **No grant or event was produced.** These probes are not a successful signed webhook test.

## Item-by-item backend certification
| Item | Status | Evidence artifact | Environment | Notes |
|---|---|---|---|---|
| 1 Staging safeguards | PASS | Permission/RLS/RPC/fixture audit and `premium_health()` above | Staging | Expected paused-webhook warning |
| 2 Five function deployment + GET | PASS | Function manifest, SHA-256, HTTP request IDs 340–344; function logs | Staging | All ACTIVE v1, 401/405 GET |
| 3 Webhook security matrix | BLOCKED | POST 346–347 = 503 `not_configured`; events count 0 | Staging | Secrets and Sandbox webhook absent; can't claim expected signed 401 |
| 4 Sandbox purchase A/B + restore | BLOCKED | No provider webhook, native product, or test subscriber; 0 grants | Staging / RC Sandbox | Actual checkout and device are platform/release scope |
| 5 Cancel / expiration / grace / refund | BLOCKED | No authenticated SANDBOX event path | Staging | Keep source tests at SOURCE_VALIDATED |
| 6 Real-JWT authorization matrix | BLOCKED | Negative 401 on missing JWT, but no real Staging signed-in A/B JWT | Staging | No forged Boolean / wrong-household authenticated calls attempted |
| 7 Hosted quotas / concurrency | NOT RUN | Local real PostgreSQL concurrency remains SOURCE_VALIDATED only | Staging | Requires test accounts and server-authorized entitlement |
| 8 Operations rehearsal | BLOCKED | POST 348–349 = 503; health `webhook_processing_halted` | Staging | Operator secret absent; cannot process/reconcile events |
| 9 Live Smart Inbox | NOT RUN | No approved model spend/evaluation or model identifier | Staging | `GEMINI_API_KEY` not verified/set |
| 10 Premium account deletion privacy | BLOCKED | GitHub issue [#9](https://github.com/herkeys/her-keys/issues/9) | Staging and source | Deletion owner must implement and sign off |
| 11 Production safeguards | PASS | Production `pg_constraint`, permission/RLS, fixture count, `premium_health()` output | Production, read-only | 11 forced-RLS tables, 4 RPCs, no fixtures, switches off |

## Next secured action (owner-required; do not paste secrets in chat)
1. Set Supabase **Staging Edge Function Secrets**: `PREMIUM_ENVIRONMENT=staging`, `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_WEBHOOK_HMAC_SECRET`, `REVENUECAT_SECRET_API_KEY`, `PREMIUM_OPS_SECRET`. `GEMINI_API_KEY` only upon explicit model-spend approval; optionally `GEMINI_MODEL`.
2. Configure RevenueCat **one Sandbox-only webhook** to `https://fhhudicklmpofuzkxeqe.supabase.co/functions/v1/revenuecat-webhook` with matching Authorization header and HMAC. The connected RevenueCat webhook API **cannot set the Authorization header**; it requires dashboard action by owner. Do not register a webhook without auth/signing.
3. Re-run unauthorized, wrong-Authorization, bad-HMAC, stale timestamp tests; only then deliver authenticated sandbox TEST and lifecycle events. `webhook_processing` remains OFF until negative tests pass and the operator agrees to the processing rehearsal.
4. Platform/release owner provides two Staging Auth test sessions and device/store Sandbox journey. Deletion owner signs off issue #9.
5. Explicitly verify `PREMIUM_ENVIRONMENT` within Edge secrets: setting the **database runtime** environment does NOT set Edge's `Deno.env`; if absent, runtime defaults to `local`, so do not guess.

The audit does **not** claim the entire Staging release as PASS, does not activate either Production Premium or Production account deletion, and does not modify native product/price/entitlement mappings.
