# Her Keys V2 Codex execution ledger

Status: IN PROGRESS. This is an engineering checkpoint, not integration certification.

## Source authority

- Starting remote and local convergence SHA verified: `a8cbf21dd707dfc5a5f27abf8355fba6eb89c996`.
- Historical baseline `c37fa45c09facb370f8b6a7bd476a067818aaf3a` is an ancestor.
- Original working directory is on `feature/welcome-tree-auth-frontend` with unrelated modifications; preserved.
- Isolated engineering worktree: `C:/Users/jsmit/Her-Keys-Codex-V2`, branch `codex/v2-engineering-20261113`.
- Remote open PR count at entry: zero. Historical branch tips preserved.
- Starting CI run 43318856678 failed Expo compatibility and Doctor; TypeScript and application tests passed there.
- Read the required Sonnet handoff, product contract, and versioned Expo SDK 57 reference before editing code.

## Baseline repair

Ten SDK 57 dependencies aligned using npm 10.9.10: expo 57.0.33, auth-session 57.0.17, constants 57.0.24, image-manipulator 57.0.22, image-picker 57.0.21, linking 57.0.14, location 57.0.23, notifications 57.0.25, router 57.0.31, splash-screen 57.0.11. Zod patched from 4.6.5 to 4.6.7 in the app and AI function source. Compatible shell-quote patch applied to the development dependency chain.

Observed local checks: Expo install compatibility PASS; Expo Doctor 21/21 PASS; TypeScript PASS; release identity PASS; native introspection exited zero. One expo-modules-core installation. React Native 0.86.3, Reanimated 4.5.1 and Worklets 0.10.1 preserved. Native transitive review caught an unrelated gesture-handler update; its original 3.3.0 lock entry was restored and npm 10 validated the resulting lockfile. Among React Native and expo-modules-core package entries, only the required expo-modules-core SDK patch changes (57.0.24 to 57.0.26).

Audit: starting 17 reported vulnerabilities (one critical); after patch alignment and shell-quote update, six remain (zero critical, three high, three moderate). These totals include dependency-chain entries, not six distinct exploits. Router/query-string/decode-uri-component remains vulnerable; the native input filter is mitigation, not a dependency fix. Fingerprint/minimatch tooling advisory remains. No SDK 58 migration or forced audit fix performed.

Baseline PR #45 merged into the authorized V2 convergence branch at `1926676bb4a5e9f5a5232e9b7444bafeb30fbd09`. Repair commits: `0f5da909d64e33f0a9cdc3f061ab7705e02502b5` and `0a93e9c745abc1eab110983d0167c5c1dc715385`. Exact-head push CI 43424556478 and PR CI 43424566512 both PASS at the latter repair SHA: 5,563 source tests passed, zero failed/skipped; 127 launch-critical tests passed; all other workflow checks passed. Local focused Meals boundary (13), deep-link (22), native dependency (6) checks pass 41/41 after npm 10 clean installation. Merge-head CI must be checked independently.

An initial local invocation omitted the repository TypeScript loaders and was stopped after module-resolution failures; it is not valid product-failure evidence. The corrected serial run finished 5,562 pass / 1 fail / 0 skipped; the failure required preserving the established Expo tilde range syntax, repaired without changing tests. The focused suite then passed 6/6 and the complete corrected tree passed CI as above.

## Live external observations

Both Her Keys Supabase projects reported ACTIVE_HEALTHY. Inspection of deployed herkeys-ai source in both environments confirms an unconditional affirmative, current-version AI consent gate before provider invocation. The approved Zod patch is now deployed: Staging version 21, Production version 13. Both retrieved bundles match reviewed source, both require JWTs, and both reject anonymous-role and missing authentication with 401. See V2_CODEX_BACKEND_DEPLOYMENTS_20261113.md for identity, sequence, verification limits and rollback.

RevenueCat project proj93809efe:

- Apple app app55f51de583 retains com.herkeys.app. Subscription key validation PASS. App Store Connect API key is not configured.
- Google app app3311d4868e retains com.heykeys.app. Catalog and base-plan permissions PASS. Subscription-purchase permissions BLOCKED: store reports package not found.
- No sibling Apple app in this project supplies a reusable App Store Connect credential.
- The previously documented local encrypted credential path `%LOCALAPPDATA%/HerKeys/billing/herkeys-revenuecat-asc-key.clixml` is absent. This does not establish that no credential exists elsewhere.
- Staging webhook whintgr2afbbcfb32 points to Staging, sandbox environment; Production whintgrf7d1c93842 points to Production, production environment. Both active. Authentication and delivery are NOT_YET_VERIFIED by this pass.
- Daily Load Premium, Smart Inbox extraction and Momentum are enabled/released in both databases; Staging rollout is staging_only, Production general. Village and Co-Parent Plus are disabled/unreleased. Runtime reachability and successful actions are NOT_YET_VERIFIED by this pass.
- Both live runtime configurations keep checkout_enabled=false and test_store_checkout_enabled=false. Production allow_test_fixtures=false; Staging true. Premium and webhook processing are enabled in both.
- Router source inspection shows web cold starts bypass +native-intent. The native filter alone is insufficient evidence of protection across all platforms. Follow-up remediation required before the security entry-point check can pass.
- Resend reports herkeys.app verified with sending enabled, DKIM and SPF records verified; tracking disabled. This is configuration evidence, not recovery delivery certification. Resend conversation ID for continued tool calls: `01a1d4dc-d319-72de-b4c6-708c08058fd3`.
- Supabase CLI defaults to an unrelated account; do not deploy with that CLI identity. The Her Keys Supabase connector reaches both intended projects. Auth provider/SMTP settings are not exposed by that connector. Browser inventory had no accessible browser host; native Chrome access timed out awaiting app access. Dashboard-only settings remain unverified.

Only the reviewed AI-function Zod dependency patch has been deployed. No hosted configuration, schema, migration, RLS or checkout gate has been changed. No signed build or store submission has been generated.

## Consent management and account transition repair

Implementation in progress: Your Account offers explicit AI-choice review using the approved existing disclosure, then grant or revoke. The adapter appends only the AI receipt and confirms the observed decision; it does not restate mandatory legal acceptance. Read the newest receipt per policy type so repeated AI changes cannot hide older legal acceptance. Unknown outcomes are reported as unconfirmed; new choices remain disabled until the ledger is checked. Account-key remount drops late UI save results.

Confirmed defect CODEX-CONSENT-01 (P1): the legal gate's pending save used the current session reference to advance stage after await, so an old-account save could move a replacement account to the optional permissions screen; previous legal selections also survived account changes. Repair fences each save by account-lifetime object, captures its session before awaiting, drops stale completion, resets selections, and prevents duplicate submit before render. Regression exercises A to B and A to B to A while the save is pending.

Focused consent/account-status/governance tests: 79/79 pass; TypeScript passes. Shipping AI-handler executable tests: 20/20 pass. Full local source regression: 5,571/5,571 pass, zero failures/skips. Exact-head push CI 43435776947 and PR CI 43435830419 PASS at `c2da6c2d5274662ce7d26603179fce288bc6a105`, including complete regression, TypeScript, release identity, Expo compatibility, Doctor and public/native config. PR #46 merged at `6fc197d674a854b264143d4e3e114169e5096172`. This is source evidence; real authenticated Staging revocation remains outstanding. Merge-head CI must be checked independently.

## Link and product carry-forward repairs

Consent merge-head CI 43436366530 PASS at 6fc197d674a854b264143d4e3e114169e5096172.

CODEX-LINK-01: native-intent does not cover browser cold starts, and the native catch returned unvalidated input on error. Added a documented custom entry, a pure shared URL predicate, and a pre-Router browser guard for initial URL, history and fragment changes. Failed sanitization prevents Router loading; hostile history stops listeners and recovers at a clean root. Native intent fails closed and the independent Google callback parser rejects malformed/oversized URLs. Valid Unicode, literal-percent values and PKCE codes retain behavior. The current SDK 57 primary parser uses URLSearchParams and handles the tested malformed/nested input quickly; bundled React Navigation fallback still contains query-string/decode-uri-component. Advisory remains unresolved at dependency level. No SDK 58 migration.

V2UP-A-P3: an unfinished One Move adding work is now withdrawn when the day becomes overloaded, without removing its task. The store rechecks on transitions; completed history and a withheld day's stability remain preserved. Tests cover immediate change, idempotence and restart durability. The old stable-selection test was updated to the explicit overloaded-day product contract, not removed or skipped.

V2UP-E-P3a: deletion panel uses the canonical Privacy Policy URL. V2UP-E-P3c: new Premium, sync and persistence notices use the existing iOS announcement hook while retaining Android live regions; no conditional hooks or new platform branches.

Focused checks: link suites 29/29; One Move/Today/Premium 86/86; status announcements 13/13. TypeScript, release identity and Expo install compatibility pass. Both iOS and Android Metro development bundles from index.js succeed (2,207 and 2,337 modules); output is temporary, non-bytecode, unsigned development JavaScript, not an IPA/AAB. An initial PowerShell stderr warning produced an ambiguous command status; a cached repeat through cmd.exe confirmed exit 0. No signed build, store upload or commercial activation.

Full source regression and new PR CI are pending. RevenueCat live product and full paywall observations are in V2_CODEX_REVENUECAT_20261113.md; no paywall/store writes were made.

## Remaining execution

Baseline PR #45 and consent PR #46 are merged. Next: close the external-link entry-point coverage gap, carry-forward product defects and hostile isolation, authentication and actual recovery delivery, live revocation, all core feature journeys, remaining deployed/source reconciliation, RevenueCat/paywall/store integration and webhook delivery, activation matrix and final platform handoff. The Expo custom-entry guide supports initialization before expo-router/entry; native-intent does not protect web cold starts. Investigate a pre-router web guard and all auth callback listeners without claiming the dependency advisory fixed. Keep native purchase certification NOT_RUN until actual native evidence exists. Do not treat this ledger as completion of any unverified category.
