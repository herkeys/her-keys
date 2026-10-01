# Build 2 backend promotion policy

Build 2 uses staging as the only day-to-day backend. Production is a promotion target, not a development target.

## Hard rules

1. Feature work lands on `build/02-gemini-integration` through reviewed changes.
2. Every candidate must pass the `build2-gate` workflow before it is eligible for backend testing.
3. Development and preview EAS profiles use the Her Keys staging backend. Only the production EAS profile may name production.
4. Gemini/provider credentials are server-side secrets only. No Gemini credential or provider endpoint belongs in Expo public environment variables or client source.
5. Backend changes are deployed to staging first. Production deployment is prohibited until staging verification for the exact candidate SHA is recorded as PASS.
6. Production promotion must use the exact tested SHA. No local uncommitted change, branch tip drift, or “small fix while deploying” is allowed.
7. Database migrations and Edge Functions are reviewed independently. A function-only release does not get permission to alter schema.
8. A failed gate or failed staging smoke test stops promotion. Fix forward on the branch, rerun the full gate, redeploy staging, and retest.
9. Rollback evidence must exist before production promotion: previous known-good function version/SHA and the exact files being promoted.
10. Validation workflows never deploy. Deployment is a separate, explicitly approved action.

## Build 2 production gate

Before production, record:

- candidate SHA
- `build2-gate` PASS
- staging deployment SHA/version
- authenticated Talk It Out smoke test PASS
- invalid provider response/fallback test PASS
- timeout/unavailable fallback test PASS
- no client secret exposure PASS
- production secret presence verified without printing the secret
- production target/project ref independently verified
- rollback SHA/version recorded

No item may be waived by an implementation agent. The Build 2 manager may stop or override a proposed promotion when evidence is incomplete.
