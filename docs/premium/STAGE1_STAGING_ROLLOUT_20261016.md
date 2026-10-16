# Premium Stage 1 — Staging rollout checkpoint (2026-10-16)

The three approved Stage 1 Premium features have been switched on for internal Staging testing only.

Project: fhhudicklmpofuzkxeqe

| Feature | Enabled | Released | Rollout |
|---|---|---|---|
| daily_load_premium | true | true | staging_only |
| smart_inbox_extract | true | true | staging_only |
| momentum_report | true | true | staging_only |
| village_delegation | false | false | not_released |
| coparent_plus | false | false | not_released |

Precondition checks confirmed the Staging Premium runtime was enabled, webhook processing was disabled, and the server's Staging tester-allowlist guard was ready. A single guarded database transaction changed the three Stage 1 flags and bumped their manifest revisions. Existing quotas and AI consent requirements were preserved.

This does not grant paid entitlements. The server still requires authorized tester access, genuine provider-derived subscription state, household ownership, any required AI processing consent, and feature-specific quotas.

Production remains unchanged: Premium runtime and webhook processing off; Stage 1 features not released.

## Production launch gates

- Complete all three real feature workflows on an authenticated Android test account and verify correct persistence, undo/consent, and failures.
- Obtain native subscription IDs and store terms from Apple and Google; configure RevenueCat packages using verified source data.
- Confirm EAS public SDK keys belong to the correct RevenueCat applications.
- Certify webhook signatures, secure entitlement reconciliation, revocations, and restore.
- Test responsive Welcome Tree and Premium UI on actual Android hardware; check iOS parity.
- Enable Production services only after explicit commercial launch approval.
- If paid subscriptions exist, halt new sales without interrupting renewal/refund/revocation processing or access already purchased.

No store or Production settings were changed during this checkpoint.
