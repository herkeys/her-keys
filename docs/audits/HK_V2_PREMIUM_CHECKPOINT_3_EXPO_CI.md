# Her Keys V2 — Checkpoint 3 Expo / CI

Date: 2026-10-14. Branch `codex/v2-premium-pass-a`. **Hard stop; feature work remains gated.** Client integration source `7eb6592348422dd54e6b3b5d3377c03b75694078`; strict integration/input guards `420365ac64f5d189a1eb3f5f2d77ed4fb8b7fe17`; SDK source `bbe7f209e3f731d81717d76ce24bafe3f5c8835e`; final code/workflow source `0f27acfa44874e4d15b20888af23952a8d205fbf`. Both exact-source workflows completed FAIL solely on deletion issue #9. See final results below.

## Dependency repair

| Root dependency | Before | After | Reason |
|---|---|---|---|
| expo | ~57.0.28 | ~57.0.29 | exact failing CI / Expo compatibility recommendation |
| expo-auth-session | ~57.0.15 | ~57.0.16 | same |
| expo-constants | ~57.0.21 | ~57.0.22 | same |
| expo-linking | ~57.0.12 | ~57.0.13 | same |
| expo-notifications | ~57.0.22 | ~57.0.23 | same |
| expo-router | ~57.0.26 | ~57.0.27 | same |
| react-native-reanimated | auto-installed 4.6.0, no root pin | 4.5.1 | SDK 57 recommended pair; 4.6.0 demanded Worklets 0.12.x, incompatible with native core's peer range |
| react-native-worklets | auto-installed 0.12.2, no root pin | 0.10.1 | SDK 57 bundledNativeModules recommendation; satisfies core and Reanimated, avoids floating peer selection |

Deletion-owner PGlite 0.5.9 was imported unchanged as a dev dependency in the merge, not added as a Premium runtime requirement. SDK remains 57, React remains 19.2.3 and React Native remains 0.86.3. Native identity/configuration are unchanged. No Expo validation exclusions or overrides were added.

`expo-modules-core` 57.0.22→57.0.23 is **transitive**, one physical root-resolvable copy. The first six-package update nested it under expo; `require.resolve('expo-modules-core/package.json')` failed from the project, while expo-constants/linking import that module. Native peer pins, npm dedupe and lock placement repaired that. A temporary direct core installation was rejected by Doctor and removed: final package.json has no direct core dependency, and Doctor is not suppressed. Fresh-lock install must reproduce the one-copy graph.

Every changed lock entry/version/reason and dependency parent is in `v2-premium-pass-a-checkpoint3/dependency-changes.json`. Exact producer: `node docs/audits/v2-premium-pass-a-checkpoint3/dependency-evidence-producer.cjs`; baseline `420365a`; local. It asserts one root-resolvable transitive core and refuses a direct dependency. Resolver-selected transitive changes stay inside the Expo install/dedupe dependency graph; no unrelated root API dependency was upgraded. Final diff is 8 root entries (six patches, two native pins), plus the governed lockfile.

Producer commands, environment local:

```powershell
node node_modules/expo/bin/cli install expo@~57.0.29 expo-auth-session@~57.0.16 expo-constants@~57.0.22 expo-linking@~57.0.13 expo-notifications@~57.0.23 expo-router@~57.0.27
node node_modules/expo/bin/cli install react-native-reanimated react-native-worklets
npm dedupe --no-audit --no-fund
```

Reference producers: fetched [Expo v57 SDK](https://docs.expo.dev/versions/v57.0.0/), [Router](https://docs.expo.dev/versions/v57.0.0/sdk/router/) and [Reanimated](https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/) versioned docs, plus installed expo/bundledNativeModules.json and native package peer declarations. Sources were read before repair; never inferred from an unversioned latest SDK.

## Local preflight before final exact-SHA workflow

| Check | Result | Exact producer | Environment / artifact |
|---|---|---|---|
| Expo compatibility | PASS | node node_modules/expo/bin/cli install --check | local; expo-install-check.txt |
| Doctor | PASS, 21/21 | npx --yes expo-doctor@1.20.4 | local; expo-doctor.txt |
| Native dependency tree | PASS, no invalid peers; one core | npm ls expo-modules-core react-native-reanimated react-native-worklets --all; dependency evidence producer | local; native-module-tree.txt / dependency-changes.json |
| TypeScript | PASS after fresh exact-lock install at bbe7f209e3f731d81717d76ce24bafe3f5c8835e | node node_modules/typescript/bin/tsc --noEmit | local; fresh-lock-bbe7f20-typecheck.txt |
| iOS/Android release identities | PASS | node scripts/verify-release-identity.mjs | local; release-identity.txt |
| Resolved native config | PASS evaluation, no native build | node node_modules/expo/bin/cli config --type introspect | local; no Production/provider calls |
| iOS JS/Hermes bundle | PASS working-tree preflight | node node_modules/expo/bin/cli export --platform ios --output-dir "$env:TEMP/herkeys-v2-pass-a-ios-export" --max-workers 2 | local; ios-bundle-export.txt; native runtime NOT RUN |
| Android JS/Hermes bundle | PASS working-tree preflight | node node_modules/expo/bin/cli export --platform android --output-dir "$env:TEMP/herkeys-v2-pass-a-android-export" --max-workers 2 | local; android-bundle-export.txt; native runtime NOT RUN |
| Fresh exact-lock install / stable full suite | install PASS; suite FAIL: 4655 tests, 4646 pass, 9 fail, 0 skipped at bbe7f20 | npm ci --no-audit --no-fund; npm test | local; fresh-lock-bbe7f20-full-suite.txt; failures analyzed below |

These working-tree SDK checks are preflight evidence; exact-SHA CI below is still the mandatory gate. Bundle export is compilation of application JavaScript/assets only, not an EAS/native build, store artifact, device journey or a purchase. The iOS export initially ran while core was temporarily direct; final lock-only topology retains that same module/version transitively. No native signing/permission/schema drift was introduced.

## Mandatory workflows

Both existing workflows now also run on push to `codex/v2-premium-pass-a`; **all mandatory steps are preserved**:

- Her Keys V2 Integration Gate, job v2-repository-validation (Node 22).
- Account deletion source validation, job validate (Node 24, additionally Deno checks).

No main/store/release allow-list change; workflow triggers grant no deployment permission. Both jobs must pass on the final exact SHA before CI can be called green. Current known source blocker remains [deletion/privacy issue #9](https://github.com/herkeys/her-keys/issues/9): combined-chain tests reject unclassified Premium resources and terminal verification fails. The failing tests and strict registry remain intact; mobile integration does not edit deletion worker/registry or backend-owned SQL. Provider/native readiness #11/#12 remains unanswered.

## Checkpoint decision

**Until both exact-SHA workflows finish successfully, Checkpoint 3 is FAIL/BLOCKED.** No Premium feature work, Staging activation, EAS build or Pass B may follow without management accepting a documented exception. An open deletion/privacy P0 always keeps the unified V2 release candidate FAIL, regardless of SDK preflight successes. Exact run URLs, heads, job/step results and final stable source test totals will be appended as the run evidence becomes available.

## Exact-SHA evidence and remaining blocker

SDK source `bbe7f209e3f731d81717d76ce24bafe3f5c8835e`:

| Workflow | Run / exact head | Result |
|---|---|---|
| Her Keys V2 Integration Gate | [38625443749](https://github.com/herkeys/her-keys/actions/runs/38625443749), bbe7f209e3f731d81717d76ce24bafe3f5c8835e | FAIL; install, backend boundary, release identity, TypeScript, Doctor and both Expo configs PASS; full suite 4655/4646 pass/9 fail/0 skipped; compatibility/evidence boundary skipped after failure |
| Account deletion source validation | [38625443847](https://github.com/herkeys/her-keys/actions/runs/38625443847), same exact head | FAIL; install, identity and TypeScript PASS; full suite same totals; downstream compatibility/Doctor/Deno skipped |

The fresh local lock install produced the same 4655/4646/9/0 totals, root-resolvable transitive core and passing TypeScript. One earlier local TypeScript invocation overlapped npm ci replacing node_modules, producing incomplete-install declaration errors; it is superseded by the post-install run and both independent clean CI checks, not treated as a source defect. No test tolerance was changed.

One of nine failures was an obsolete global Calendar dependency ban on Reanimated, introduced by the explicit SDK-native peer pins. Calendar's no-gesture/no-Reanimated **source-import guard remains intact**. The package guard now retains every Calendar-library ban and additionally requires both infrastructure peers to equal the installed Expo SDK's bundledNativeModules versions, with no dev duplicates. Targeted Calendar suite: 18/18, zero skips. Remaining eight counted failures are six deletion SQL failures plus two failed parent tests, all issue #9.

Follow-up source `0f27acfa44874e4d15b20888af23952a8d205fbf` preserves every mandatory check and runs independent compatibility/Doctor/config/Deno checks with `if: !cancelled()` after a failed suite. There is no continue-on-error, test exclusion or successful override: any failing command still fails the job. This exposes additional blockers instead of hiding diagnostics behind the known deletion failure.

Deletion failures: database cleanup and shared-policy isolation raise P0001 `unclassified_resource`; the dependent purged proof raises `terminal_verification_failed`; resource coverage fails for shared, former_member and single households. These are real combined-chain privacy failures, not mocked provider unavailability. The migration harness includes all canonical Premium migrations. Worker/registry/backend authorization SQL are unchanged. Required next action: deletion lifecycle owner resolves [#9](https://github.com/herkeys/her-keys/issues/9), covering every Premium resource and provider identifier, and proves deletion plus unrelated-account preservation; then rerun both workflows at the resulting exact SHA. No owner response or approved exception has been received.

Raw job/step snapshots and failure excerpts are in `v2-premium-pass-a-checkpoint3/ci-bbe7f20-*.json` / `ci-bbe7f20-failures.txt`. Producers: `gh run view <id> --json name,headSha,url,conclusion,jobs` and `gh run view <id> --log-failed`; environment GitHub Actions. Local producer commands are labeled separately. [Draft PR #13](https://github.com/herkeys/her-keys/pull/13) targets the convergence branch and is not release approval.

## Final code / workflow results

Exact head **0f27acfa44874e4d15b20888af23952a8d205fbf**; full application suites on both Node 22 and 24: **4655 tests, 4647 pass, 8 counted failures, 0 cancelled, 0 skipped**. All six actual failures are the deletion SQL cases described above, with two failed parent tests. Calendar and all client integration/identity/consent guards pass. The prior timing-sensitive calendar assertion passes in both clean CI environments, without changing its tolerance.

| Workflow / job | Exact run | Mandatory step verdicts |
|---|---|---|
| Her Keys V2 Integration Gate / v2-repository-validation | [38626302663](https://github.com/herkeys/her-keys/actions/runs/38626302663) | install PASS; backend boundary PASS; identity PASS; TypeScript PASS; full suite FAIL (#9 only); compatibility PASS; Doctor PASS; public config PASS; native config PASS; evidence boundary PASS |
| Account deletion source validation / validate | [38626302655](https://github.com/herkeys/her-keys/actions/runs/38626302655) | install PASS; identity PASS; TypeScript PASS; full suite FAIL (#9 only); compatibility PASS; Doctor PASS; Deno setup PASS; fixture/proof/lock Deno check PASS; lifecycle endpoint Deno check PASS |

No mandatory validation step was skipped; only setup-node post-job cache saving was automatically skipped after the failed job. Neither job is green. JSON records every step, timestamps, job URL and exact head; `ci-0f27acf-test-summary.txt` and `ci-0f27acf-failures.txt` retain totals and failure evidence. Fresh-lock native peer tree also passes locally (`fresh-lock-peer-tree.txt`).

**Decision: Checkpoint 2 client/shared source integration is complete; Checkpoint 3 remains FAIL/BLOCKED and is a mandatory hard stop.** Dependency/Expo/TypeScript/Deno/source integration blockers in this lane are repaired. The complete V2 release candidate remains FAIL with open P0 #9. Do not start feature work until both workflows are green at the new owner-integrated SHA or management explicitly accepts a documented exception. Hosted/provider/native journeys remain NOT RUN/BLOCKED, not source-test PASS. No Production activation or Pass B occurred.

The next evidence commit only records these already completed exact-source results; it changes no application, lockfile, workflow or backend source. Its own push still invokes both mandatory workflows, and the final checkpoint report must identify their exact head and results rather than infer green from this prior run.
