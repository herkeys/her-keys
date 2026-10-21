# Evidence index — 2026-10-19

The source checkpoint is `6267a299206a4e9e48ca987891e7c971567c1223`. This directory contains schema/configuration metadata and owned synthetic fixture results, not customer content or credentials. Public policy/source downloads are kept in ignored local references; `local-reference-hashes.json` records their hashes and disposition. Some captured command logs have trailing whitespace and line endings normalized; outcomes, counts and errors are preserved.

- `original-eight-reproduction.txt`: original eight SQL failures on the selected shared base.
- `full-suite-at-6267a299.txt`: `npm test`, 5,233 pass, zero fail/skipped/cancelled. TypeScript, focused runtime/provider/ownership negatives and Expo compatibility/Doctor logs are separate. Deno checker output is in the worker/monitor/harness files.
- `20261019-*-schema.json`, `*-runtime.json`: fresh read-only public/private/Auth/Storage census and function/policy metadata. Production is an observed predecessor, not a deployed repair.
- `repair-migration-checksums.json` and `../production-promotion-manifest-20261019.json`: four additive canonical source migrations and their actual Staging history identifiers; source LF hashes verified before commit.
- `function-parity-final.json`: all nine Staging graphs read back and compared; seven Production graphs differ, two match. Source file hashes are distinct from transport bundle hashes.
- `staging-initial-blocked.json`, `staging-independent-retry.json`, `staging-shared.json`, `staging-revenuecat.json`, `staging-provider-ack-retry.json`: actual hosted results and deliberately injected retry state. The initial missing-ledger failure is retained, not rewritten as success.
- `revenuecat-absence.json`, `revenuecat-unrelated-preserved.json`: independent customer lookups for the owned fixtures. No paid transaction or store subscription was modified.
- `staging-cleanup-*.json`, `staging-safe-state-final.json`, `staging-health-final.json`: owned fixture teardown, controls off/dry-run, zero scope rows, dropped helper RPC and zero health backlog. Three older 2026-10-14 marked Auth users were preserved; zero *owned* fixtures remain.
- `production-safe-state-final.json`: latest read-only off/dry-run controls, registry 43 and all three installed deletion cron jobs inactive.
- `staging-http-smoke-final.json`: negative/invalid-input HTTP checks for all nine current bundles, not proof of a full user journey.
- `staging-private-owner-probe.json`: reported result of the rolled-back synthetic subtransaction. The full assertion and its reproducing negative control are in `tests/accountDeletion/privateHouseholdOwner.test.mjs` and its log.
- `public-web-observations.json`: actual HTTPS placeholder/recovery status and policy section observations. No legal PDF or full legal text is republished here.
- `staging-advisors.json`, `production-advisors.json`, `*-secret-names.txt`: outstanding warnings and denied secret-name listing (403); no secret values are included.
- `docker-sql-contracts.txt`, `android-emulator*.log`: attempted environments that did not become ready. Docker SQL/PostgREST and native Android/iOS journey results are NOT_RUN, not PASS.

Hosted fixtures populated the new V2 leaves and selected domain records and independently counted all 50 registered tables; complete population of every resource was performed locally. Full hosted adversarial/native/provider certification remains incomplete as described in `../cross-platform-test-matrix.md`. Final exact-head CI belongs to the immutable PR check; a queued run is never a PASS.
