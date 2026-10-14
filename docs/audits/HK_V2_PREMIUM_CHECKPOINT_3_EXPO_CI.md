# Her Keys V2 — Checkpoint 3 Expo / CI

Date: 2026-10-14. Branch `codex/v2-premium-pass-a`. **Hard stop; feature work remains gated.** Client integration source `7eb6592348422dd54e6b3b5d3377c03b75694078`; strict integration/input guards `420365ac64f5d189a1eb3f5f2d77ed4fb8b7fe17`. SDK/final workflow SHA and run evidence will be recorded after the exact pushed commit runs.

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
| TypeScript | PASS during SDK work; final committed source rerun required | node node_modules/typescript/bin/tsc --noEmit | local; typecheck.txt |
| iOS/Android release identities | PASS | node scripts/verify-release-identity.mjs | local; release-identity.txt |
| Resolved native config | PASS evaluation, no native build | node node_modules/expo/bin/cli config --type introspect | local; no Production/provider calls |
| iOS JS/Hermes bundle | PASS working-tree preflight | node node_modules/expo/bin/cli export --platform ios --output-dir "$env:TEMP/herkeys-v2-pass-a-ios-export" --max-workers 2 | local; ios-bundle-export.txt; native runtime NOT RUN |
| Android JS/Hermes bundle | PASS working-tree preflight | node node_modules/expo/bin/cli export --platform android --output-dir "$env:TEMP/herkeys-v2-pass-a-android-export" --max-workers 2 | local; android-bundle-export.txt; native runtime NOT RUN |
| Fresh exact-lock install / stable full suite | pending final source rerun | npm ci --no-audit --no-fund; npm test | local; no skips/tolerance changes allowed |

These working-tree SDK checks are preflight evidence; exact-SHA CI below is still the mandatory gate. Bundle export is compilation of application JavaScript/assets only, not an EAS/native build, store artifact, device journey or a purchase. The iOS export initially ran while core was temporarily direct; final lock-only topology retains that same module/version transitively. No native signing/permission/schema drift was introduced.

## Mandatory workflows

Both existing workflows now also run on push to `codex/v2-premium-pass-a`; **all mandatory steps are preserved**:

- Her Keys V2 Integration Gate, job v2-repository-validation (Node 22).
- Account deletion source validation, job validate (Node 24, additionally Deno checks).

No main/store/release allow-list change; workflow triggers grant no deployment permission. Both jobs must pass on the final exact SHA before CI can be called green. Current known source blocker remains [deletion/privacy issue #9](https://github.com/herkeys/her-keys/issues/9): combined-chain tests reject unclassified Premium resources and terminal verification fails. The failing tests and strict registry remain intact; mobile integration does not edit deletion worker/registry or backend-owned SQL. Provider/native readiness #11/#12 remains unanswered.

## Checkpoint decision

**Until both exact-SHA workflows finish successfully, Checkpoint 3 is FAIL/BLOCKED.** No Premium feature work, Staging activation, EAS build or Pass B may follow without management accepting a documented exception. An open deletion/privacy P0 always keeps the unified V2 release candidate FAIL, regardless of SDK preflight successes. Exact run URLs, heads, job/step results and final stable source test totals will be appended as the run evidence becomes available.
