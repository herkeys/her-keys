# Source baseline and Gate 0

On 2026-11-13 ET GitHub branch-tip queries and SSH `git ls-remote --exit-code` agreed:

| Repo | Branch | SHA |
|---|---|---|
| Mobile | integration/v2-autonomous-upgrade-20261112 | `9bdcff9135c6f3aa2393509827d284b6310108c9` |
| Website | main | `b8939095f5a1aec9877864635a7cafcfa521d1a2` |

[PR #58](https://github.com/herkeys/her-keys/pull/58) merged the iOS/iPad evidence. The prior `8b13fc0c8b971427f46da581f38d9b80b9749b1d` is the merge base; only `docs/audits/HK_IOS_IPAD_V2_EAS_READINESS_AUDIT_20261113.md` changed. Its published test certificate names the older SHA. The sprint uses fresh, isolated branches from the live SHAs.

Baseline validation: mobile `npm test` in a clean detached checkout using the same locked dependencies: 5,681/5,681. Website `npm ci` and `npm run typecheck` passed at main. Lint reported one existing unescaped apostrophe in the unrelated demo; the candidate escapes that JSX literal to restore the full lint gate. The old framework pin also blocked the website candidate build, see HK-DEL-FIX-005.

Website PR #9 head `81c219d5c2645d0cf422f5893167d2ab5386d107` includes Phase 2 `b865fd71c4f8a69ef268b8fd711fd270f34fe6f7`; their trees match. Both are unpublished. The mobile Phase 2 branch is already an ancestor of the integration tip. The retirement of the old Staging certification RPC is confirmed by its absent catalog signature; an Edge function listed as ACTIVE does not establish that the fixture works.

| Item | Baseline |
|---|---|
| Lifecycle schema, nine core Edge bundles | EXISTS / DEPLOYED. Versions, gateway flags and bundle hashes are in the JSON evidence. Both environments have matching corresponding bundle hashes. |
| Source/deployment match | Seven callable entrypoint files and the two unchanged Apple/retention entrypoints match their deployed byte content. Shared `deletionCore.ts`, `deletionWorker.ts`, and `deletionProviders.ts` differ from the integration tip in Production read-back; matching worker bundle hashes establish the same drift in Staging. Do not assume the merged Apple and Google settlement work is deployed. |
| Four October V2 deletion migrations | DEPLOYED in both environments under distinct recorded history versions. Do not replay them from their source timestamps. |
| Provider guard | HISTORICALLY REPAIRED and verified in both current catalogs. Owned by postgres, SECURITY DEFINER, empty search path, no client EXECUTE and no service-role USAGE on private. All ten provider-write triggers enabled: two Calendar tables, Apple credential table and seven Premium tables. The separate Premium event redaction trigger is also enabled. |
| Provider guard runtime | VERIFIED in disposable PostgreSQL for active/pending Calendar writes with service_role. Hosted mutation tests not run; no Production write probe. |
| Registry | 50 registered relations, 24 exceptions, no unclassified public/private ordinary or partitioned table in either project. See exact census. This checks classification, not erasure. |
| Purge scheduler | DEPLOYED / INACTIVE in both. `enabled=false`, `dry_run=true`, no scope entries. Production request and outbox counts were zero. |
| Monitor and retention | Staging schedules ACTIVE; cron dispatch observed and retention success recorded. Production schedules INACTIVE. Cron success is not remote monitor health. |
| Independent watchdog | IMPLEMENTED on integration; file absent from current mobile default branch `main` at `bab9773226e3b81928af04d5a303596b16502710`. Scheduled execution not active from this implementation. |
| Website | CURRENTLY BROKEN in Production for the required self-service journey. Both replacement routes implemented in website draft. |
| Provider/email configuration by secret name | UNKNOWN on this connection; Supabase CLI returned HTTP 403 on both allowed refs. No secret values queried. Health advisor returned no entries on both projects; that doesn't verify secrets or delivery. |

Inputs: GitHub connector PR/ref checks; Supabase management project, migration, and Edge metadata calls; read-only catalog, control, and aggregate queries; public HTTPS GET. See [sanitized evidence](baseline-deployment-evidence.json). Historical controlled Staging evidence remains in [prior certification](../staging-certification.md). GATE-0-GUARD: PASS for catalog and local regression; no repair required. Full Gate 0 remains incomplete.
