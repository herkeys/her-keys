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

Full regression and exact-head CI results will be recorded after completion. An initial local invocation omitted the repository TypeScript loaders and was stopped after module-resolution failures; it is not valid product-failure evidence. The corrected serial run includes both repository loaders.

## Live external observations

Both Her Keys Supabase projects reported ACTIVE_HEALTHY. Read-only inspection of deployed herkeys-ai source in both environments confirms an unconditional affirmative, current-version AI consent gate before provider invocation. Both deployed functions still import Zod 4.6.5: server patch deployment is outstanding.

RevenueCat project proj93809efe:

- Apple app app55f51de583 retains com.herkeys.app. Subscription key validation PASS. App Store Connect API key is not configured.
- Google app app3311d4868e retains com.heykeys.app. Catalog and base-plan permissions PASS. Subscription-purchase permissions BLOCKED: store reports package not found.
- No sibling Apple app in this project supplies a reusable App Store Connect credential.
- The previously documented local encrypted credential path `%LOCALAPPDATA%/HerKeys/billing/herkeys-revenuecat-asc-key.clixml` is absent. This does not establish that no credential exists elsewhere.
- Staging webhook whintgr2afbbcfb32 points to Staging, sandbox environment; Production whintgrf7d1c93842 points to Production, production environment. Both active. Authentication and delivery are NOT_YET_VERIFIED by this pass.
- Daily Load Premium, Smart Inbox extraction and Momentum are enabled/released in both databases; Staging rollout is staging_only, Production general. Village and Co-Parent Plus are disabled/unreleased. Runtime reachability and successful actions are NOT_YET_VERIFIED by this pass.
- Both live runtime configurations keep checkout_enabled=false and test_store_checkout_enabled=false. Production allow_test_fixtures=false; Staging true. Premium and webhook processing are enabled in both.
- Router source inspection shows web cold starts bypass +native-intent. The native filter alone is insufficient evidence of protection across all platforms. Follow-up remediation required before the security entry-point check can pass.

No hosted configuration, migration or function deployment has been made by this checkpoint. No checkout gate has been changed. No signed build or store submission has been generated.

## Remaining execution

Finish baseline review, complete source regression and green exact-head CI; create and merge the focused baseline PR into V2 convergence. Then continue authentication and actual recovery delivery, consent management and revocation, hostile isolation, all core features and journeys, deployed/source reconciliation, RevenueCat/paywall/store integration and webhook delivery, activation matrix and final platform handoff. Keep native purchase certification NOT_RUN until actual native evidence exists. Do not treat this ledger as completion of any unverified category.
