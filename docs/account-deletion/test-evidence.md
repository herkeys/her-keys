# Test evidence

Local Node v24.14.0 and Expo SDK 57. Current source CI uses Node 24. PGlite 0.5.9 runs PostgreSQL 18.6; hosted Staging is PostgreSQL 17.6. Local SQL tests are not substituted for hosted evidence.

Latest full application suite: 4077 PASS, 0 FAIL (full-tests.log), including retention expiry, prior-restored-history removal, restricted shared cases, provider retry and negative/mutation controls. Mobile TypeScript and release identity checks pass. Deno checks pass for the changed worker, retention endpoint and temporary fixture harness. Website production build, TypeScript and ESLint pass. Expo dependency check and Doctor 21/21 previously passed without dependency changes.

The first integration run had pre-existing boundary provenance overclaims; they were assigned to their actual legal/email integration lane. During continuation, another local sibling advanced from the assignment ENTRY ad72ccd. The scanner now recognizes exactly that shared ENTRY without allowing any later sibling commit. Its boundary suite passes. The full suite then passed 4077/4077. No sibling Premium source was merged.

Live Staging evidence is recorded separately in staging-certification.md, automation-certification.md and revenuecat-certification.md. Real request restriction, delivered recovery, explicit browser restoration/replay refusal, scheduler processing, provider async completion, Storage API blob removal, shared preservation, failure alerts and daily proof cleanup have been observed.

Native runtime remains unverified. Automatic approval review rejected the local Expo dev-server launch command as blocked by policy; it was not retried or bypassed. No iOS build/runtime evidence is available from this Windows environment. Live Apple/Google revocation, hosted all-resource fixtures, native offline/reinstall/account-switch flows and the complete hosted adversarial matrix remain release blockers. A mock is not a substitute.

resourceCoverage.test.mjs seeds all 43 registered resources with constraints and immutable-ledger triggers enabled, using governed RLS-authored household population plus explicit provider/consent/automation fixtures. Single-adult cleanup erases every registered owned row; shared and former-member scenarios preserve another adult and an unrelated household byte-for-byte. Discovery answers and child records are included. Provider revocation remains a separate live test, not simulated by database row removal.

The local reset tests cover an account switch before queued reset starts and while persistence flush is blocked. Both preserve replacement-account state. Terminal timestamps must be ordered, within clock tolerance, and expire exactly 365 days after verification.
