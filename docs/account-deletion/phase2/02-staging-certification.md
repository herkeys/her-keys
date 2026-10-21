# Hosted Staging certification — account deletion Phase 2 (2026-10-20)

Staging `fhhudicklmpofuzkxeqe`. **Gate `STAGING_DELETION_E2E=BLOCKED`.**

## Why blocked

This session had no Her Keys Supabase management access (DEL-P2-013). The local Supabase CLI is authenticated only to the K Scan organization, and the Supabase connector needs the owner's OAuth approval. Without it, deployed bundle hashes, migration history, controls, cron state and secret names could not be read, and no fixture could be seeded or scoped. Phase 2 also changed three shared deletion modules (DEL-P2-001/002), so Staging now trails source (DEL-P2-012).

Nothing on Staging was mutated in Phase 2. Phase 1 restored controls to `enabled=false, dry_run=true, test_scope_only=false`, zero scoped accounts and zero active destructive jobs; that is the last verified state (2026-10-19).

## Live Staging calls that were made (non-mutating, synthetic inputs)

| Call | Input | Result |
|---|---|---|
| `restore-account` (via web page) | random 43-char token | Error → "Recovery could not complete…" (no restore) |
| `begin-web-deletion` (via web page) | nonexistent `deletion-p2-*@example.invalid` | Generic non-enumerating notice; `shouldCreateUser=false` (no account) |
| `deletion-status` (via web page) | random 43-char receipt | Non-success; not shown as deleted |
| `monitor-account-deletions` (watchdog) | wrong HMAC key | 401 → `watchdog_unauthorized` |

## Matrix status

Phase 1 hosted evidence (`../staging-certification.md`, 2026-10-19 runs 1769–1780) is **retained with its original dates** and not re-labelled as Phase 2 runs.

| Brief §5 row | Phase 1 hosted evidence | Phase 2 |
|---|---|---|
| 1 Account creation / binding | PASS (fixtures) | — |
| 2 Recent-auth requirement | PASS (stale session refused) | — |
| 3–5 Request, access restriction, sync denial | PASS (ban, session revocation, RLS zero rows) | — |
| 6–9 Recovery email, token acceptance, replacement, replay refusal | PASS (1769) | Web restore page verified locally (22/22) |
| 8/11 Token expiry / post-deadline refusal | Covered in SQL tests; hosted post-deadline refusal not separately recorded | **REMAINING** |
| 12–16 Purge, cleanup, Auth absence, provider evidence, terminal proof | PASS (1770, 1772, 1773) | Apple-legacy and Google-invalid outcomes **REMAINING** (new code) |
| 17 Status polling | PASS | Web status handling verified locally |
| 18 Completion notification | Historical 2026-10-14 delivery; not drained in 2026-10-19 scoped runs | **REMAINING** (new email lines) |
| 19–20 Recovery-data cleanup; proof retention/expiry | Historical 2026-10-14 daily expiry | — |
| Shared households, former member, concurrent insert | PASS (1772; lock-wait 3381 ms; rolled-back probe) | — |
| Worker fencing / interruption / requeue | PASS (1769–1780) | — |
| Provider: RevenueCat | LIVE PASS (1773) | — |
| Provider outages: Auth / Storage / Resend unavailable | Source tests; one hosted injected post-Auth retry (1780) | **REMAINING** hosted injection |
| Apple revocation error / missing credentials / legacy | Source only | **REMAINING**; source PASS in Phase 2 |
| Google revocation error / already revoked | Source only | **REMAINING**; source PASS in Phase 2 |
| Retry exhaustion → actionable status | Source; health counters | **REMAINING** hosted |

## Remaining hosted runs (once access and DEL-P2-001/002 approval exist)

Use the Phase 1 scoped mechanism: `deletion_certification_fixture=true` users, a unique run marker, `test_scope_only=true` plus an expiring `deletion_test_scope` row, and the owned synthetic deadline override only. The normal scheduler stays inactive.

1. Deploy the 7 functions (manifest) to Staging; read back hashes vs `03-production-promotion-manifest.md`.
2. **Apple legacy:** fixture with an `apple` identity snapshot and no credential row → terminal proof; request evidence `apple_revoked='manual_revocation_required'` before finish; outbox email contains the Stop Using steps.
3. **Apple outage:** fixture with a credential row and a deliberately invalid `APPLE_DELETION_CLIENT_ID` in a scoped test function variant, or a blocked egress host → `requires_retry`, no terminal proof, health `failed>0` after the ceiling.
4. **Google invalid:** fixture with a Calendar connection whose token is a syntactically valid but revoked/garbage refresh token → Google `invalid_token` → `credential_already_invalid`, terminal proof, connection rows gone.
5. **Resend unavailable:** scoped `DELETION_EMAIL_ENABLED=false` or an invalid key → outbox failure counted in `email_problems`; the lifecycle still completes; alert raised.
6. **Retry exhaustion:** RevenueCat key unset for the scoped run → `failed_requires_action` after `max_attempts`; monitor reports `failed>0`; external watchdog run fails.
7. Restore controls; remove scope rows; verify zero owned fixtures; record evidence JSON under `evidence/`.
