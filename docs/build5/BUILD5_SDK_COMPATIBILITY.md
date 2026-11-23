# Build 5 SDK compatibility decision

**Decision:**
- **Milestone A ships on Expo SDK 57.** It contains everything Build 5 implemented, and Expo was not upgraded.
- **Milestone B (iPhone Duo native features) needs an Expo SDK 58 migration.** That migration was not started. Verdict: **MIGRATION REQUIRED**, for the Duo-native features only.

Baseline `5ed5b30`, investigated 2026-11-23.

## 1. What Milestone A uses, and why it is safe on SDK 57

Build 5 Milestone A uses only APIs already in the SDK 57 tree:

| Capability | API (SDK 57) | Native change? |
|---|---|---|
| Window size, font scale | `useWindowDimensions` (React Native 0.86.3) | No |
| Asymmetric safe areas | `react-native-safe-area-context` 5.7 `SafeAreaView` edges and `useSafeAreaInsets` | No |
| Sidebar navigation | `tabBarPosition: 'left'` on the React Navigation bottom-tabs vendored in `expo-router` 57.0.31 | No |
| Two-pane layouts, dialog sheet | Plain `View` and `Modal` styles | No |

- No dependency, lockfile, `app.json`, `eas.json`, plugin, entitlement or Info.plist key changed.
- The Build 5 JavaScript therefore runs on any binary built from this source, including the existing native configuration.
- iOS and Android `expo export` both pass (`BUILD5_RELEASE_READINESS.md`).

## 2. What needs SDK 58 / Xcode 27.1

Source: Expo, *Supporting iPhone Duo*, 2026-10-23. This was read for this audit. Apple's HIG page *Designing for iPhone Duo* returned only its title to the fetcher and could not be read. HIG-attributed points below are therefore second-hand, through Expo.

| Duo feature | Requires | Stability per Expo | Build 5 |
|---|---|---|---|
| Native tabs placed in the system navigation rail (`NativeTabs`, `preferredPlacement`) | SDK 58 | Recommended path | Not done: JS `Tabs` kept |
| Native `Stack` headers placed in the rail | SDK 58 + iOS 27.1 | Recommended | Not done |
| `useVerticalBarEdgeIOS()` / `verticalBarBehaviorIOS` (expo-status-bar) | SDK 58 | Stable | Not done |
| `expo-hinge` (`getHinge`, `addHingeListener`, `useHinge`) | SDK 58 (npm `expo-hinge` 58.0.2) | Not marked experimental | Not done |
| `<ArrangementView>` (fold-aware split, Expo UI) | SDK 58 + iOS 27.1. Falls back to plain children on older iOS. | Not marked experimental | Not done |
| Expo Router `<SplitView>` | SDK 58 | **Experimental in SDK 58** | Not used. Avoid it until it is stable. |
| iPhone Duo simulator (Device Hub) | Xcode 27.1 | — | Not available on this Windows host |
| EAS image with Xcode 27.1 | `sdk-58` or `latest` image | — | Not used. Builds stay on `auto` → `sdk-57` (Xcode 26.6). |

The SDK 57 to Xcode 27 note from the 2026-11-14 audit still applies: the `latest` image (Xcode 27) needs `ios.enableSceneSupport` on SDK 57. Build 5 changes neither the image nor scene support.

## 3. Dependency compatibility for the SDK 58 migration

npm registry, read 2026-11-23:
- `expo` latest is `58.0.26`.
- The `sdk-57` tag is `57.0.34`.
- `expo-router@58` goes up to `58.0.32`.

None of the items below was installed or built.

| Area | Current | SDK 58 evidence | Status |
|---|---|---|---|
| RevenueCat | `react-native-purchases` / `-ui` ^10.9.1 | 11.0.4 is current (11.0.0 released 2026-10-28). Peer dependency `react-native >= 0.80.0`. | **Out of scope, untested, not a blocker** (owner direction 2026-11-23: RevenueCat has a known connection issue). Build 5 does not touch it. |
| Supabase auth (PKCE, email, OTP) | `@supabase/supabase-js` ^2.116.0 | 2.119.2. JS only. | Likely compatible. NOT VERIFIED. |
| Apple Sign-In | `expo-apple-authentication` ~57.0.2 | Must move to the SDK 58 line | NOT VERIFIED |
| Google OAuth | `expo-auth-session` / `expo-web-browser` 57.x | Must move to the SDK 58 line | NOT VERIFIED |
| OCR | `expo-ocr-kit` 0.1.4 (latest; last published 2026-04-08; peer dependency `expo: *`) | No SDK 58 claim. A native module built against SDK 57's expo-modules-core. | **HIGH RISK.** It needs a native build on SDK 58. |
| Notifications, image picker, location, file system, secure store | 57.x | Must move to the SDK 58 line | NOT VERIFIED |
| Reanimated / Worklets | 4.5.1 / 0.10.1 | `expo-hinge` peer-depends on both | NOT VERIFIED |
| Android | `com.heykeys.app`, versionCode 2 | Any SDK bump changes Android native too | Requires a separate Android export and device pass |
| Lockfile | npm 10 lockfile for CI | Local npm 11 drops a nested `react-native-worklets` entry. Regenerate with `npx -y npm@10.9.4 install --package-lock-only`. | Known trap |

## 4. Migration plan (separate PR, not started)

1. Create a branch off the Build 5 tip, for example `feature/build5-sdk58-migration`. Isolate it in its own worktree.
2. Run `npx expo install expo@^58 --fix`. Then regenerate the lockfile with npm 10 and confirm `npm@10 ci --dry-run`.
3. Decide whether `expo-ocr-kit` can be kept on SDK 58, and build it natively. RevenueCat is excluded from this migration's acceptance criteria (owner direction: known connection issue, not a blocker).
4. Gates:
   - `tsc`, the full suite, Expo Doctor
   - iOS and Android `expo export`
   - a development build on both platforms
   - Hermes provenance check (`BUILD5_RELEASE_READINESS.md` §4)
5. Only then add the Duo-native features, smallest first:
   - native tabs or rail placement behind the existing adaptive layer
   - `useVerticalBarEdgeIOS`-aware insets
   - `ArrangementView` for Calendar or Today, if a hinge-aware split is still wanted
6. **Rollback:** the migration lives on its own branch and PR, so dropping it leaves Milestone A intact. Milestone A has no SDK 58 dependency.

## 5. Verdict

**`EXPO SDK COMPATIBILITY: MIGRATION REQUIRED`**
- This applies to the iPhone Duo native rail, hinge and arrangement features only.
- Milestone A is compatible with SDK 57: exports pass, and nothing native changed.
