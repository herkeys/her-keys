# Staging fixture ledger and test evidence

Authorized ref: `fhhudicklmpofuzkxeqe`. **No hosted fixture created or email sent this sprint.** Every planned fixture below is unallocated; there are no UUIDs, credentials, resource rows or cleanup claims to publish. The historical recipient authorization does not establish current mailbox access.

| Fixture | Planned case | Hosted result |
|---|---|---|
| HKDEL-A | Ordinary deletion, enabled service writes then denied pending writes, full independently verified cleanup | NOT RUN |
| HKDEL-B | Restore before deadline; confirm Auth and preserved local namespace | NOT RUN |
| HKDEL-C | Shared household and child; other adult data unchanged, operator-assisted review | NOT RUN |
| HKDEL-D | Provider timeout, retry exhaustion and reviewed retry | NOT RUN |
| HKDEL-E | Stop/lease expiry, stale actor rejection and retry | NOT RUN |
| HKDEL-F | Crash after Auth disappearance, independent final verification | NOT RUN |
| HKDEL-G | Web OTP, failed/ambiguous replacement, delivery and replay | NOT RUN |
| HKDEL-H | Premium test store and identity isolation | NOT RUN |

The existing temporary blueprint validates the Staging target, run marker and both owned fixture identities; it only backdates the exact scoped request and keeps the global cron job disabled. The RPC has been retired and must be reinstalled only for a controlled test run, then removed and independently verified absent. Update approved run ledger with account UUID, owned resources and original/test deadline, without retaining OTPs, private receipts, emails or tokens. Do not run with nonempty unrelated scope or unverified secrets/recipient. The old endpoint being listed is not authorization or proof of behavior.

| Evidence | Environment | Command and result |
|---|---|---|
| Integrated source suite | Windows / Node 24, candidate `a73d3b9` | `npm test`: 5,682 pass, 0 fail, 0 skip; 1,130 suites. |
| SQL lifecycle, privileges, resource isolation, recovery and migration scope | PGlite and Node, same candidate, synthetic local accounts | `node --import ./tests/support/register-ts.mjs --import ./tests/support/register-jsx.mjs --test 'tests/accountDeletion/*.test.mjs' tests/migrationChain.test.mjs tests/meals/boundary.test.mjs`: 131 pass, zero failures. |
| Backend types | Deno, same candidate | `deno check --config supabase/functions/deno.json` on seven affected entrypoints and `supabase/blueprints/staging-deletion-v2-certification.ts`: PASS. |
| Mobile types | Windows / Node 24, same candidate | `npm run typecheck`: PASS. |
| Mobile release identity and source exports | Windows / Node 24, same candidate | `npm run verify:release-identity` and `node node_modules/expo/bin/cli export --platform ios --platform android --output-dir ../hk-deletion-mobile-exports`: PASS; iOS and Android Hermes bundles written. No Production EAS environment, simulator, native build or physical device used. |
| Website transport, status and receipt | Node 24, website `b83faa0`, mocked responses | `node --test 'tests/deletion-*.test.mjs'`: 5 pass. |
| Website routing | Local production server at website `b83faa0` | HTTP GET both routes: 200, no-referrer, no-store, noindex. No hosted or browser-interaction certification. |

Before/after: live SQL showed immediate hash replacement at baseline. Local post-repair tests cover no rotation on queued/failed/unconfirmed sends, rotation on delivered status, deadline unchanged, duplicate coalescing, ambiguous send with explicit single-use restore, late delivery inert after restore, and reconciliation lease exclusivity. Remaining hosted evidence includes fault injection against the real worker, Auth unban failure/retry, email inbox delivery, watchdog failure and real-device cleanup. No time acceleration was applied to a hosted request.
