# Account deletion engineering closeout — 2026-10-19

The deletion-owned source repairs pass the complete local suite: **5,233/5,233**, zero failures, at source checkpoint **6267a299206a4e9e48ca987891e7c971567c1223**. All original eight failure outcomes are repaired. Hosted Staging proves request/recovery, replay refusal, shared review and reconciliation, independent Auth/resource absence, minimal terminal proof, and real RevenueCat customer deletion with another customer preserved. This is a source engineering closeout with explicit release gates, not full native/store/Production certification.

Mobile draft: [PR #39](https://github.com/herkeys/her-keys/pull/39). Website draft: [PR #9](https://github.com/herkeys/her-keys-web/pull/9). Website exact-head CI passed: [c751f9e run](https://github.com/herkeys/her-keys-web/actions/runs/39278472014). Exact mobile source CI: [6267a299 run](https://github.com/herkeys/her-keys/actions/runs/39279605347); it was queued when this report was prepared. The final documentation commit receives its own exact-head run through the unchanged full integration gate. Consult the PR check for that immutable final SHA/run; no queued run is reported as PASS.

## Source authority and isolation

- Fetched mobile base: `c7dca1ec13956e16e03b66ae64346be73829e077`, PR #38. Both discovery references were fetched and inspected. `origin/codex/account-deletion` ended at `4aefa5f20adc38fc867e5a354f1faf279fab65a0`; convergence ended at `1a0d25e25b8ac0587b448eda392c7a12e6c682c0`. Their deletion implementation is an ancestor of the shared candidate. The shared candidate, rather than an older deletion branch, was selected.
- Branch: `repair/account-deletion-crossplatform-closeout-20261019`; managed worktree `C:/Users/jsmit/.codex/worktrees/deletion-crossplatform-closeout/Her Keys`.
- Repair commits: `8c3106f8389bf3755a0d57b799b7f6371400a064` (classification, independent verification, device fencing, monitoring), `4c87beab9a979e878e435f5fcd32d7df751fd9d6` (interrupted provider aggregate recovery), `6267a299206a4e9e48ca987891e7c971567c1223` (former adult private-receipt ownership). Later commits contain documentation/evidence only unless explicitly identified otherwise.
- Website source base: `f4e1fab8b651107ee0ab6129dde65f6c6cb4caa2`, existing unpublished deletion branch. Repair source: `c751f9e7eb18575ecc86e2bd4ad862349d648324`. `origin/main` remains `b8939095f5a1aec9877864635a7cafcfa521d1a2`; the draft includes that ancestor plus the existing unpublished deletion implementation. No new legal-document edit was made in this repair.
- PR #38 was checked again and remained at the selected base. No unrelated branch was merged, frozen, reset or modified. The original `C:/Users/jsmit/Her Keys` working copy and its pre-existing dirty/untracked files were preserved. No EAS build was initiated.

## Root causes and resulting behavior

The original registry predated 11 public Premium tables and private AI reporting. Its public-table guard correctly failed closed, but did not identify offending names. That prevented database cleanup and caused the downstream terminal test to fail. Seven Premium tables now have explicit account cleanup. Three global configuration/aggregate tables have exact non-account classifications. The mixed-customer event ledger is selectively de-identified; it is never indiscriminately deleted. Private AI reports and reviewer identifiers are independently covered.

Terminal completion now recounts all 50 owned tables and the two custom resource groups, checks shared cases, legacy/current Storage ownership and multipart uploads, checks available Auth subresources, and requires affirmative provider/Storage/Auth/database evidence. The five-field, 365-day proof remains unchanged. Missing required tables still block completion. Hosted testing found the welcome-email ledger intentionally absent on Staging but present in Production; only this exact reviewed optional resource can be absent and records `schema_state=not_deployed`.

Device checks/request/import/reset operations now reject late account and A-B-A results, preserve the replacement account's credential, namespace receipts and sign-out, and refuse stale sessions as namespace authority. Native key operations and reminder scheduling/cancellation are serialized. An unavailable or expired proof cannot clear local data; explicitly confirmed local reset remains separate.

The provider worker requires a positive Auth 404 and records verified identity-provider names at initiation. A generic aggregate cannot skip individual provider evidence. A crash after the individual acknowledgements but before the aggregate write is repaired on retry without repeating already verified provider work. An actual scoped hosted failure injection verified this recovery path.

A separate adversarial scenario exposed a retained Premium receipt as the only evidence that a former adult still owned information in a household. Ownership discovery now considers every registered table with a household link, independently of whether the table's deletion action is account-private. The negative control reproduces the old miss; the repaired worker preserves the receipt and escalates instead of cascading it away. The equivalent hosted probe was rolled back completely.

## Verification

| Layer | Evidence |
|---|---|
| Complete local source suite | `evidence/full-suite-at-6267a299.txt`: 5,233 pass, zero failure/skipped/cancelled |
| Original failure reproduction | `evidence/original-eight-reproduction.txt`: real SQL classification errors and downstream terminal failure |
| Complete resource fixtures | All 50 registry tables populated for single/shared/former-member isolation; another adult and unrelated household byte-identical |
| Additional private ownership negative control | `evidence/private-owner-regression.txt`, 13 pass including migration governance |
| Device operation races | `evidence/device-runtime-final.txt`, 17 pass; source tests, not native-device evidence |
| Provider failure/retry | `evidence/providers-final.txt`, 8 pass; hosted aggregate-ack retry proof in `staging-provider-ack-retry.json` |
| TypeScript / Deno | TypeScript succeeded; deletion entrypoints and temporary harness checked by Deno |
| Expo | SDK 57 versioned documentation read before code; compatibility check passed; Doctor 21/21 passed |
| Website | TypeScript, lint, optimized Next build and two receipt/status regressions passed; CI on exact web SHA is enabled |
| Hosted Staging | See updated `staging-certification.md` and function parity manifest; all nine deployed deletion bundles match the current source file graph |
| Docker SQL/PostgREST harness | Attempted, blocked because Docker's Linux daemon was unavailable even after starting the installed Desktop app; fresh PGlite migration and real-SQL lifecycle tests passed |
| Android | Emulator ADB came online but Android package manager/boot did not become ready after normal and cold starts; no app journey PASS claimed |
| iOS | Windows host has no Xcode/iOS Simulator; NOT_RUN |

## Remaining release boundaries

1. Public `/delete-account` is a disabled placeholder and `/account/restore` returns 404. PR #9 is ready for controlled website review/publication; no deployment was performed.
2. Published Privacy/Terms still contain support/deletion URL placeholders and lack the precise approved lifecycle disclosures. `legal-handoff.md` identifies exact sections. Engineering did not rewrite/publish legal documents or change store declarations.
3. Live Apple and Google revocation remain `SKIPPED_OWNER_DECISION`, hence NOT_VERIFIED. Actual Apple Developer entitlements/provider configuration and physical/simulator journeys are unverified.
4. The full hosted all-resource/concurrency/provider-outage matrix, vendor logs/backups retention approvals and an independently hosted watchdog remain distinct certification gaps. Historical blob/email/retention delivery evidence is retained with its original date, not relabelled as a fresh run.
5. GitHub Actions queues are external state. Local success is not a substitute for a finished exact-head CI run. Build-manager integration remains contingent on the final PR check and owner review.

Production was read-only. It remains `enabled=false`, `dry_run=true`, with no destructive processing activation. Four additive migrations and seven function bundles require separate explicit Production deployment approval; the manifest does not authorize activation. Two Production bundles already match source and need no replacement. Store/native/legal/provider approval requirements do not justify weakening source guards or claiming completion.
