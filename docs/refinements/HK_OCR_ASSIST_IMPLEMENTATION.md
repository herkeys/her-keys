# HK OCR ASSIST — Implementation Report

**Verdict: `OCR ASSIST: LOCALLY VALIDATED — DEVICE CERTIFICATION PENDING`**
**Two-fix closeout verdict: `OCR TWO-FIX CLOSEOUT: COMPLETE`** — see the addendum at the end of
this report for the Android-permission-inventory correction and the `expo-ocr-kit` exact-version
pin; §5 and §12 above it were corrected in place, everything else in the body below is unchanged
from the original implementation pass.

This environment is a Linux cloud container with no Android SDK, no emulator/device, and no
Xcode/macOS. Every native-runtime claim below is therefore `NOT_EXECUTED —
ENVIRONMENTAL LIMITATION` on both platforms; nothing here claims Android device proof. What
*is* executed, and is real: `npm ci`, `tsc --noEmit`, the full Node test suite (64 OCR-specific
tests after the closeout), a mutation-testing harness that patches real source and proves 9 of the
guarantees fail when broken, and a static architecture guard (with its own test-the-test) that
proves the feature cannot reach the network, cloud storage, or an `ai-inference` provenance — and,
since the closeout, that reads the real installed `expo-image-picker` Android manifest to keep the
permission inventory honest.

---

## 1. Source branch / SHA

- Source branch: `refinement/weather-calendar-scaffold`
- Source SHA (verified against `origin`, exact match): `6b0efa49501a3ad3f4a5af70f9d88bbab8ea74a1`
  ("Calendar: make OAuth callback non-cacheable and bound pending state")
- Work branch: `refinement/ocr-assist`, created as a new git worktree at
  `/home/user/her-keys-ocr-assist`, checked out directly from `origin/refinement/weather-calendar-scaffold`
  at that exact SHA (`git worktree add ../her-keys-ocr-assist -b refinement/ocr-assist
  origin/refinement/weather-calendar-scaffold`).
- Final SHA (this report's commit is the next one on this branch): see `git log -1` on
  `refinement/ocr-assist` at completion.
- **Branch-name deviation, disclosed up front:** the harness pre-assigned this session's push
  branch as `claude/quirky-cerf-0uz94y`, already pointing at the repository's unrelated `main`
  line (a different product wave — "Build 3 / Real-Life Daily Load" — with no shared history with
  `refinement/weather-calendar-scaffold`'s LifeRecord/F12 line). Redirecting that branch onto this
  SHA would have required a force-push, which both the git-safety rules and this task's own "No
  force-push" instruction forbid. The user was asked and chose: push a new branch,
  `refinement/ocr-assist`, from the exact source SHA, and open the PR from there instead of the
  auto-assigned branch. No existing branch was force-pushed or rewritten.

## 2. Baseline certification status

`refinement/weather-calendar-scaffold` @ `6b0efa4` is classified exactly as the task instructs:

**`REFINEMENT BASE — NOT YET FULLY CERTIFIED`**

No certification document in `docs/audits/` or `docs/refinements/` names this exact SHA. The only
full hostile-audit certification found (`docs/audits/HK_F01_F13_HOSTILE_AUDIT.md`,
`HK_F01_F13_BACKEND_CERTIFICATION.md`, `HK_F01_F13_DEFECT_LEDGER.md`,
`HK_F01_F13_INTEGRATION_MAP.md`) covers the earlier F01–F13 core-integration ancestry
(`integration/f01-f13-convergence`), not the current refinement-line HEAD, which additionally
carries FR01 session-continuity repairs, Production/Staging convergence work, local-notification
refinement, and the dormant WeatherKit/Google Calendar scaffolds — none of which have their own
post-hoc certification doc at this SHA.

## 3. Baseline entry test state

Captured **before any OCR change**, on the freshly created worktree at the exact source SHA
(`git status --short` empty — clean):

| Method | Raw output | Interpretation |
|---|---|---|
| `npm ci` | `added 587 packages, and audited 588 packages in 20s` / `13 moderate severity vulnerabilities` (pre-existing, unrelated to OCR) | Clean install, no errors |
| `npm run typecheck` (`tsc --noEmit`) | 7 errors, all in `src/features/calendar/GoogleCalendarPanel.tsx` (1), `src/features/today/TomorrowReminderCard.tsx` (2), `src/features/today/WeatherContextCard.tsx` (4) — all either `Property 'tertiary' does not exist on type ...` (a design-token shape mismatch) or `'weatherAnchorConfig' is possibly 'null'` | **BASELINE FAILURE** — pre-existing, entirely inside the dormant WeatherKit/Google Calendar scaffold files. Confirms the task's own classification that this refinement line is not fully certified. Not touched (see §28). |
| `npm test` (`node --test`) | `# tests 3353` / `# suites 768` / `# pass 3346` / `# fail 7` | 7 **BASELINE FAILURES**, in `tests/hk-f01f13/syncRegistry.test.mjs`, `tests/meals/boundary.test.mjs`, `tests/migrationChain.test.mjs`, `tests/today/guarantees.test.mjs`, `tests/calendarValidation.test.mjs`, `tests/accountRuntime.test.mjs`, `tests/hk-f01f13/handoffOwnership.test.mjs` — all trace back to the same incomplete dormant Weather/Calendar scaffold wiring the typecheck errors point at. None are in `tests/lifeAdmin/` (F12). |
| F12 (`tests/lifeAdmin/*.test.mjs`) test count | `grep -c "test("` across the 8 files: commands 23, copyAudit 10, demo 5, privacy 5, screen 15, sync 13, today 2, view 25 | **98**, all passing at entry |
| Backend/check runnable from this worktree | No Supabase project reachable from this container (no credentials, no network to a Supabase host); `supabase/tests/run-f12.mjs` and similar scripts require a live scratch database. Not run. | `NOT_EXECUTED — ENVIRONMENTAL LIMITATION` (no backend access in this container, independent of OCR) |
| Expo/native config state | No `ios/`/`android/` directories (managed workflow, no CNG prebuild artifacts committed). `app.json` plugins: `expo-router`, `expo-status-bar`, `expo-apple-authentication`, `expo-secure-store`, `expo-web-browser`. No `expo-image-picker`/`expo-camera`/OCR package present. | Clean managed-workflow baseline |
| Local notifications | `src/notifications/*`, `src/platform/localNotifications.ts`, `src/store/LocalNotificationProvider.tsx` — a real, functioning, on-device-only feature (no network, no external credentials), mounted at the app root, gated behind an explicit user opt-in (`enable()`/`disable()`, `AsyncStorage`-backed preference + OS permission). **Not dormant** — active and already opt-in gated, confirmed unchanged (§28). |
| Weather (WeatherKit scaffold) | `WeatherContextCard` mounts on the Today screen but returns `null` immediately: `weatherAnchorConfig` is built from `EXPO_PUBLIC_WEATHER_ANCHOR_LATITUDE/LONGITUDE/...`, blank in `.env.example` with the comment "Leave blank to keep Weather dormant." The backend edge function (`supabase/functions/weather-context`) itself returns `{status:'unavailable', reason:'weatherkit_not_configured'}` without `WEATHERKIT_TEAM_ID`/`SERVICE_ID`/`KEY_ID`/`PRIVATE_KEY_P8`. **Confirmed dormant**, no credentials present, no network call fires. |
| Google Calendar scaffold | `GoogleCalendarPanel`/`useGoogleCalendarBridge` mount on the Calendar screen but every path resolves to `availability: 'dormant'`; the OAuth/data edge functions report `unavailable` without `GOOGLE_CALENDAR_CLIENT_ID/SECRET`/`EXTERNAL_TOKEN_ENCRYPTION_KEY_B64`, none of which are configured. **Confirmed dormant**, no OAuth network call is reachable. |
| Pre-existing failing tests before OCR changes | Yes — the 7 listed above. Distinguished from OCR-introduced failures throughout this report; none were touched or worked around. |

## 4. OCR library chosen

**`expo-ocr-kit@0.1.4`** (npm, `ManojKanth/expo-ocr-kit`, MIT).

## 5. Exact package version

**`"expo-ocr-kit": "0.1.4"`** (exact pin, no `^` range) in `package.json`; `0.1.4` resolved in
`package-lock.json`. Originally recorded as `"^0.1.4"`; pinned exact in the two-fix closeout (see
the addendum at the end of this report) so a future compatible-semver install cannot silently
change its native implementation before deliberate re-validation.

## 6. Compatibility evidence

- Built with the Expo Modules API (`expo-module-scripts` scaffold; `expo-module.config.json`
  declares `apple`/`android`/`web` platforms with native module classes
  `ExpoOcrKitModule`/`expo.modules.ocrkit.ExpoOcrKitModule`) — the same module system Expo's own
  first-party packages (`expo-image-picker`, `expo-image-manipulator`, `expo-file-system`) use,
  and the one Expo has targeted at New Architecture support since SDK 47.
- `npm run typecheck` (real `tsc --noEmit` against this exact repo, RN 0.86.3 / Expo 57.0.24 /
  React 19.2.3 / TypeScript 6.0.3) passes clean against every call site this feature makes into
  `expo-ocr-kit`'s shipped `.d.ts` (`recognizeText(uri: string): Promise<OcrResult>`, where
  `OcrResult = { text: string; blocks: OcrBlock[] }` — no confidence field, handled per §22).
- iOS podspec (`ios/ExpoOcrKit.podspec`, read from the package source): iOS 15.1 minimum, Swift
  5.9, **depends only on `ExpoModulesCore`** — no Google/Firebase iOS pod. This is the concrete
  evidence behind choosing this package over `expo-mlkit-ocr` (§7): it is genuinely native
  (Apple Vision) on iOS, not Google ML Kit wearing an iOS pod.
- Android Gradle dependency (`android/build.gradle`, read from the package source):
  `implementation("com.google.mlkit:text-recognition:16.0.1")` plus
  `androidx.exifinterface:exifinterface:1.3.7` — the **bundled** ML Kit artifact (model shipped
  inside the APK), not `com.google.android.gms:play-services-mlkit-text-recognition` (the
  unbundled, Play-Services-delivered variant). This is the load-bearing fact behind §15/§16.
- The package's own `devDependencies` pin `"expo": "55.0.10-canary-...", "react-native": "0.82.1"`
  — **older** than this repo's Expo 57.0.24 / RN 0.86.3. The author has not verified it against
  this exact stack. `peerDependencies` are open (`"expo": "*", "react-native": "*"`), and
  `tsc`/the Node test suite raise nothing, but this gap is real and is listed as a known
  limitation (§35) and the primary target of the iOS/Android device follow-up (§36).
- Not Expo-Go-compatible (custom native module) — requires a development build or EAS Build,
  same as every other native module already in this project (`expo-apple-authentication`,
  `react-native-purchases`).

## 7. Rejected alternatives

| Package | Why rejected |
|---|---|
| `expo-mlkit-ocr@0.2.7` (`rbayuokt/expo-mlkit-ocr`) | Uses **Google ML Kit on iOS as well as Android** (Apple Vision is only a documented arm64-simulator fallback hack, `withMlkitSimulatorArm64Fix.js`), which means pulling in a Google iOS pod and bumping the iOS deployment target via a required `expo-build-properties` plugin — the opposite of the task's "Apple Vision on iOS" preference and a real footprint increase. 37 GitHub stars, last published 2026-05-06 (~4.5 months stale at time of writing). |
| `expo-text-extractor@2.0.0` (`pchalupa/expo-text-extractor`) | Correct engine split (Vision iOS / ML Kit Android) but its `android/build.gradle` declares `implementation("com.google.android.gms:play-services-mlkit-text-recognition:19.0.1")` — the **unbundled**, Play-Services-delivered model, which downloads on first use. This directly conflicts with the task's explicit, non-negotiable "use BUNDLED MODEL" requirement (offline-first, no hidden first-use network request). Disqualified on that basis alone, despite being the most-starred (72) of the three candidates. |
| `@react-native-ml-kit/text-recognition@2.0.0` | Not an Expo Module (older-style native module, autolinked but not built on the Expo Modules API); uses ML Kit on both platforms (same iOS-engine objection as `expo-mlkit-ocr`); last published 2025-09-01 (~a year stale). |

No candidate is what the task would call heavily maintained; this is disclosed, not hidden, as a
known limitation (§35).

## 8. iOS architecture

`recognizeText(uri)` → native `ExpoOcrKitModule` (Swift, Expo Modules API) → Apple's on-device
Vision framework text recognition. No network call, no third-party iOS SDK beyond
`ExpoModulesCore` itself. iOS 15.1 minimum (already inside this project's likely deployment
target; SDK 57 apps generally target iOS 15.1+ regardless of this feature).

## 9. Android architecture

`recognizeText(uri)` → native `expo.modules.ocrkit.ExpoOcrKitModule` (Kotlin, Expo Modules API) →
`com.google.mlkit:text-recognition:16.0.1`, the bundled (model-in-APK) ML Kit Text Recognition v2
artifact. No Play Services dynamic model delivery, no Firebase.

## 10. Image-picker/camera audit

Before adding anything, the exact existing state was checked (`grep` across `package.json`,
`package-lock.json`, `app.json`):

- `expo-image-picker` — **not installed**.
- `expo-camera` — **not installed**.
- No other picker/camera abstraction exists anywhere in `src/`.

Since nothing existed to reuse, adding a dependency is a native-config-scope change, recorded in
full below. **`expo-camera` was deliberately not added at all** — `expo-image-picker`'s
`launchCameraAsync` already provides camera capture without a live-preview UI, which is all this
feature needs, keeping the native footprint to one fewer module.

Chosen: `expo-image-picker@~57.0.20` (official Expo package, exact SDK-57 version match) for both
"take photo" and "choose existing image" — both use the system picker (`PHPickerViewController` on
iOS; the Android Photo Picker where the OS provides one), which needs no photo-library-wide
permission.

## 11. Exact native/config changes

**`app.json`** — `expo.plugins` array, one new entry appended (verbatim before/after):

```diff
     "plugins": [
       "expo-router",
       "expo-status-bar",
       "expo-apple-authentication",
       "expo-secure-store",
-      "expo-web-browser"
+      "expo-web-browser",
+      [
+        "expo-image-picker",
+        {
+          "photosPermission": false,
+          "cameraPermission": "Her Keys uses the camera to photograph a document for on-device text recognition. The photo is processed on this device and is never uploaded.",
+          "microphonePermission": false
+        }
+      ]
     ],
```

No other key in `app.json` was touched. Bundle/package identifiers, orientation, icons, and every
other existing plugin entry are byte-for-byte unchanged (`git diff` against the source SHA
confirms this — see §3's clean baseline and the full diff stat in §37).

**`package.json`** — four new dependencies added, nothing removed or version-bumped:

```diff
     "expo-crypto": "~57.0.3",
     "expo-dev-client": "~57.0.19",
+    "expo-file-system": "~57.0.7",
+    "expo-image-manipulator": "~57.0.20",
+    "expo-image-picker": "~57.0.20",
     "expo-linking": "~57.0.10",
     "expo-notifications": "~57.0.20",
+    "expo-ocr-kit": "^0.1.4",
     "expo-router": "~57.0.22",
```

(`expo-ocr-kit`'s `^0.1.4` range shown above is the diff from the original commit; it was pinned
exact to `"0.1.4"` in the two-fix closeout — see the addendum at the end of this report and the
corrected §5.)

**`package-lock.json`** — exactly 5 new `node_modules/*` entries: `expo-file-system`,
`expo-image-loader` (transitive dependency of the picker/manipulator pair),
`expo-image-manipulator`, `expo-image-picker`, `expo-ocr-kit`. No existing package's resolved
version changed. `npm ci` after these changes: `added 587 packages, and audited 588 packages`
(baseline) → after: 4 separate `npm install` calls, final state `592 packages` audited, `added 1
package` on the last call (the incremental deltas across the three install commands:
+4 for the official Expo trio, +1 for `expo-ocr-kit`), same 13 pre-existing moderate advisories,
zero new ones introduced by these 5 packages.

## 12. Android permission inventory — INSPECTION ONLY, not a merged manifest

**Corrected in the two-fix closeout** (see the addendum at the end of this report): an earlier
version of this section implied `CAMERA` was the only Android permission this feature's
dependency stack contributes. That was wrong. `expo-image-picker`'s own
`android/src/main/AndroidManifest.xml`, read directly from the installed `~57.0.20` package, was
re-inspected and declares three `<uses-permission>` entries, not one:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
```

**Not executed as a real Gradle/`expo prebuild` merge** — this container has Java 21 and Gradle on
`PATH` but no Android SDK, no `ANDROID_HOME`, no platform tools, so `expo prebuild --platform
android` (attempted; confirmed no SDK) cannot produce a real merged manifest. Everything below is
**inspection of the real, installed package's own declared native config** — read directly from
its shipped `AndroidManifest.xml`, its Gradle file, and Expo's config-plugin source — real source,
not guesswork, but **not a compiled merge**, and labeled `INSPECTION ONLY` throughout. A real
merged-manifest result is Android-native follow-up work (§31).

| Permission | Source | Purpose | Status | Recommendation |
|---|---|---|---|---|
| `android.permission.CAMERA` | `expo-image-picker`'s own `AndroidManifest.xml` (declared directly by the package; not added by its JS config plugin) | Camera capture | Required for the current "Take photo" feature | **KEEP** |
| `android.permission.READ_EXTERNAL_STORAGE` | `expo-image-picker`'s own `AndroidManifest.xml`, `android:maxSdkVersion="32"` | Legacy permission the package contributes for pre-Photo-Picker Android behavior (API ≤ 32) | Present in the installed package; not requested or used by this feature's own code, and not suppressed | **DO NOT remove during this closeout without real Android validation** — see below |
| `android.permission.WRITE_EXTERNAL_STORAGE` | `expo-image-picker`'s own `AndroidManifest.xml`, `android:maxSdkVersion="32"` | Same as above (legacy, capped at API 32) | Same as above | **DO NOT remove during this closeout without real Android validation** |
| `android.permission.RECORD_AUDIO` | Not declared by the package's manifest itself — contributed by `expo-image-picker`'s JS config plugin (`withAndroidImagePickerPermissions`), which **adds it by default** unless `microphonePermission: false` is passed | The plugin assumes video capture may be wanted; this feature never records video or audio | Not needed | **KEEP BLOCKED** — `app.json` sets `"microphonePermission": false`, confirmed in the plugin's own source to run `withBlockedPermissions` (an explicit strip, not merely an omission) |
| `com.google.mlkit:text-recognition`'s own manifest entries | `expo-ocr-kit`'s native Gradle dependency | On-device recognition | No `INTERNET` permission, no Play-Services-model-download permission — the bundled variant does not use Play Services delivery | **KEEP** (the whole point of choosing the bundled artifact — §15) |

Why `READ_EXTERNAL_STORAGE`/`WRITE_EXTERNAL_STORAGE` are recorded rather than suppressed: their
`maxSdkVersion="32"` cap means the OS itself already ignores them on Android 13+ (API 33+), where
the modern Photo Picker/scoped-storage model applies regardless of what the manifest declares.
Nothing in this feature's own code requests or depends on them (capture and library selection both
go through `expo-image-picker`'s modern, permissionless-picker code paths — §10). Blocking them
outright (the way `microphonePermission: false` blocks `RECORD_AUDIO`) was considered and
**deliberately not done in this closeout**: this environment has no Android SDK/emulator to verify
that stripping them does not regress picker behavior on any Android ≤ 32 device or emulator this
project still intends to support. That verification belongs to real Android-native validation
(§31), not to a documentation-and-version-pin closeout. Recorded honestly instead of hidden.

`expo-image-picker`'s manifest also declares a disabled, non-exported
`com.google.android.gms.metadata.ModuleDependencies` `<service>` (a Play Store metadata hint for
installing the Android Photo Picker module on older OS versions — it requests no permission and
performs no runtime behavior), two non-exported cropper activities (`com.canhub.cropper.CropImageActivity`,
`expo.modules.imagepicker.ExpoCropImageActivity`, used only if `allowsEditing` is ever set — this
feature never sets it), a `FileProvider` for handing a picked image to that cropper, and two
`<queries>` entries (package-visibility declarations for the camera/video-capture intents on
Android 11+, not permissions). None of these change the permission inventory above.

A new, permanent, **`INSPECTION ONLY`**-labeled automated check
(`tests/lifeAdmin/ocrArchitectureGuard.test.mjs`) now reads this exact manifest file and this
project's own `app.json` on every test run and asserts: `CAMERA` and the two `maxSdkVersion="32"`
storage permissions are present; `RECORD_AUDIO`, any location permission, any contacts permission,
and any foreground/background-service permission are absent from the package's own manifest; and
`app.json` explicitly sets `microphonePermission: false` and `photosPermission: false` without
inventing a nonexistent storage-permission-blocking option. This replaces any prior source-level
claim that `CAMERA` was the only permission this stack contributes.

**Deliberately excluded from `app.json`'s plugins array, and why** (read directly from each
package's `app.plugin.js`, verbatim source quoted in the git history of this change):

- **`expo-ocr-kit`** — its plugin unconditionally runs
  `AndroidConfig.Permissions.withPermissions(config, ['android.permission.CAMERA'])` with **no
  option to suppress it**, and sets an Info.plist `NSCameraUsageDescription` default
  ("Allow this app to capture receipts for OCR scanning.") if none is already set. Its
  `expo-module.config.json` has **no `"plugin"` key**, meaning the native module autolinks
  (registers) regardless of whether the JS config plugin ever runs — `expo prebuild`'s
  module-linking step and the `app.json` `plugins` array are independent mechanisms in Expo.
  Registering it would only add a second, redundant `CAMERA` permission declaration (already
  covered by `expo-image-picker`) and a permission string this project doesn't want (it doesn't
  match this feature's actual copy). Left out.
- **`expo-file-system`** — its plugin (`withFileSystem`) unconditionally adds
  `android.permission.READ_EXTERNAL_STORAGE`, `android.permission.WRITE_EXTERNAL_STORAGE`, **and
  `android.permission.INTERNET`**. This feature only ever touches the app-private cache directory
  (`Paths.cache`), which needs no storage permission on any Android version this project targets,
  and never performs network I/O — adding `INTERNET` to satisfy an unrelated plugin default would
  directly undercut the "OCR requires no network access" architectural claim this whole feature
  exists to keep. Its `expo-module.config.json` likewise has no `"plugin"` key, so the native
  module autolinks without it. Left out.
- **`expo-image-manipulator`** — ships no `app.plugin.js` at all; nothing to register.

Net effect, corrected: this feature's dependency stack contributes `CAMERA`,
`READ_EXTERNAL_STORAGE` (maxSdk 32), and `WRITE_EXTERNAL_STORAGE` (maxSdk 32) — all three declared
directly by `expo-image-picker`'s own manifest, not by a config plugin this project chose to
register. `RECORD_AUDIO` is explicitly blocked (not merely avoided by omission), and the broader
`INTERNET`/unrestricted-storage grant that `expo-file-system`'s plugin would have added is avoided
entirely by the deliberate choice not to register it (§12's plugin-exclusion list above still
holds; only the permission table itself was wrong).

**Google Play Services / ML Kit inventory** (as required, reported separately): `com.google.mlkit:text-recognition:16.0.1` (bundled variant — no `com.google.android.gms:*` artifact, no Play Services dependency, no Firebase). **Google Play Services was not previously present in this project and is not introduced by this change** (the bundled ML Kit artifact does not require it). Approximate size impact: §16.

## 13. iOS permission/config inventory

Read directly from `expo-image-picker`'s plugin source (`withImagePicker`,
`createPermissionsPlugin`) and `expo-ocr-kit`'s podspec:

| Info.plist key | Source | Value / state | Why |
|---|---|---|---|
| `NSCameraUsageDescription` | `expo-image-picker` plugin, `cameraPermission` option | `"Her Keys uses the camera to photograph a document for on-device text recognition. The photo is processed on this device and is never uploaded."` (explicit, set in `app.json`, overriding the plugin's generic default) | Camera capture (Take photo) |
| `NSPhotoLibraryUsageDescription` | `expo-image-picker` plugin, `photosPermission` option | **Explicitly set to `false`** — the plugin's `createPermissionsPlugin` omits the key entirely when the option is `false`, rather than falling back to its default text | The system photo picker (`PHPickerViewController`) runs out-of-process and needs no library-wide permission; declaring one anyway would misstate what the app can access |
| `NSMicrophoneUsageDescription` | `expo-image-picker` plugin, `microphonePermission` option | **Explicitly set to `false`** (blocked, not merely omitted) | Never records audio or video |

No entitlements are added. No `Info.plist` key beyond `NSCameraUsageDescription` is introduced.
`expo-ocr-kit`'s own default `NSCameraUsageDescription` ("Allow this app to capture receipts for
OCR scanning.") is never reached because `expo-image-picker`'s plugin runs first in the array and
sets the key first (`expo-ocr-kit`'s plugin is a no-op here anyway, since it is not registered —
§12).

iOS podspec/native dependency: `expo-ocr-kit`'s `ios/ExpoOcrKit.podspec` depends only on
`ExpoModulesCore`; iOS 15.1 minimum, Swift 5.9, static framework. No Google/Firebase iOS pod.

## 14. Android native dependency footprint

- `com.google.mlkit:text-recognition:16.0.1` (bundled) — the on-device recognition model.
- `androidx.exifinterface:exifinterface:1.3.7` — `expo-ocr-kit`'s own transitive dependency
  (unrelated to this feature's own EXIF handling, which happens in JS via
  `expo-image-manipulator`'s re-encode step, §17).
- `expo-image-picker`, `expo-image-manipulator`, `expo-file-system` — each ship their own
  first-party Expo native Android modules (`expo.modules.imagepicker.*`,
  `expo.modules.imagemanipulator.*`, `expo.modules.filesystem.*`), already part of the Expo SDK
  57 native footprint pattern used by every other Expo module already in this project.
- No Google Play Services artifact, no Firebase artifact.

## 15. Bundled-model / offline behavior

**Deliberate, load-bearing choice: the bundled ML Kit Text Recognition artifact
(`com.google.mlkit:text-recognition`), not the unbundled/Play-Services one
(`com.google.android.gms:play-services-mlkit-text-recognition`)**, verified from the package's own
`android/build.gradle`. The bundled variant packages the trained recognition model inside the
APK at build time; recognition never depends on a Play Services dynamic-delivery download, so
there is no hidden first-use network request and no unpredictable first-scan latency. This is
exactly the requirement stated for the Android side: "OCR must not require a hidden first-use
network request... use BUNDLED MODEL."

On iOS, Apple's Vision framework ships as part of the OS itself — there is no model-delivery
question at all; recognition is always available offline on any supported iOS version.

## 16. Application-size impact

**Estimated, not measured** (no build tooling available in this container to produce a real
before/after IPA/APK). Google's own published figures for the bundled Latin-script ML Kit Text
Recognition v2 model are on the order of a few megabytes added to the Android APK (the bundled
model trades APK size for offline guarantees — this is the documented tradeoff of choosing
"bundled" over "unbundled"). iOS adds effectively nothing (Vision is a system framework). This
estimate should be replaced with a real measured delta in the iOS/Android device follow-up
(§36).

## 17. Image sanitization / temp lifecycle

`src/features/lifeAdmin/ocrNativeAdapter.ts` is the entire native-facing surface:

1. `pickImage(source)` — camera: `requestCameraPermissionsAsync()` then
   `launchCameraAsync({ exif: false, quality: 0.9 })`; library: `launchImageLibraryAsync({ exif:
   false, quality: 0.9, mediaTypes: ['images'] })` (no permission request at all for the library
   path — the system picker needs none).
2. `sanitizeIntoTemp(uri)` — **re-encodes** the picked/captured image via
   `ImageManipulator.manipulate(uri).renderAsync()` then `.saveAsync({ format: SaveFormat.JPEG,
   compress: 0.9 })` (a real re-encode, not a byte copy — even with no transform actions applied,
   the manipulator rebuilds the JPEG from decoded pixel data, so EXIF/GPS from the source is
   structurally absent from the output, per the task's explicit "re-encode rather than byte-copy"
   requirement). The re-encoded file is then moved (`File.move`) into an app-private directory,
   `Paths.cache` + `her-keys-ocr/`, created on demand (`Directory.create({ idempotent: true })`) —
   never shared/public photo storage, and the original photo-library asset is never touched or
   deleted.
3. `recognizeText(sanitizedUri)` — recognition runs against the sanitized copy only.
4. Cleanup — every exit path removes the temp file: a returned `cleanup()` closure
   (`sanitized.delete()`, guarded by `sanitized.exists`) is invoked by the caller on confirm,
   manual-entry bailout, or cancel (`ScanEntryPoint`'s `finishReview`/`discardScan`, and its
   unmount effect as a backstop); recognition failure calls `cleanup()` immediately before
   returning the error outcome; a module-level `cleanupAllTempScans()` removes the entire
   `her-keys-ocr/` temp directory unconditionally and is called on `ScanEntryPoint` unmount as a
   second backstop against a crash between capture and the first cleanup.

## 18. Candidate model

`src/features/lifeAdmin/ocrCandidate.ts` — `OcrCandidate { recognizedText, dates: OcrDateCandidate[],
issuers: OcrTextCandidate[], references: OcrTextCandidate[], engineConfidence: number | null,
confirmed: false }`. Component-local state only (`useState` inside `ScanEntryPoint`/
`OcrReviewScreen`); never stored in `AppState`, never passed to the store, never synced, never
persisted. `confirmed` is a literal `false` type — nothing in this file can set it to `true`; that
distinction is made entirely by which existing F12 command eventually runs (§23).

## 19. Date-candidate UX

`OcrReviewScreen` renders every recognized date once (`recordDate`), with its nearby recognized
text shown as a hint only (`" — "context""`, sensitive-redacted — §21). Three independent
pickers — one per F12 date field (Expiration/Renew-by/Review) — each offer every candidate date,
"Enter manually," and "None of these," with **no default selection**: every field starts at "Not
set" and stays there until she taps a choice. A date's own nearby text (e.g. "Expires") is never
read to pick a field for her (proven in `ocrReview.test.mjs` and by mutant `OCR7`).

## 20. Multi-candidate behavior

Every recognized date/issuer/reference is offered; nothing is dropped, sorted-and-truncated, or
reduced to "the most likely one." The same candidate date remains selectable for more than one
field simultaneously (picking it for Expiration does not remove it from the Renew-by or Review
pickers). Proven directly (`ocrReview.test.mjs`, `ocrExtract.test.mjs`) and by mutants `OCR8`
(earliest), `OCR9` (first-recognized), `OCR10` (issuer auto-pick), and `OCR12` (truncate-to-first).

## 21. Provenance semantics

**No new provenance state was created.** `OcrReviewScreen`'s only output, `onUseValues(values:
Partial<RecordSheetValues>)`, hands assigned/typed values to the **existing, unmodified**
`RecordSheet` component (`LifeAdminContainer`'s `'create'` sheet state gained one optional field,
`initialOverride?: Partial<RecordSheetValues>`, merged as `{ ...EMPTY_RECORD_VALUES,
...initialOverride }` — the plain "Add record" path is unaffected since it never sets this field).
She must still press that form's own, already-audited Save button; that call reaches
`submitRecord` → `addLifeRecord`/`updateLifeRecord` exactly as manual entry does, with
**`provenance` omitted**, which the domain layer defaults to `userProvenance()` (`producer:
'user-action', confidence: null`) — the exact existing F12 term for "user-confirmed." Verified
directly against the real store (`ocrIntegration.test.mjs`): a record saved from OCR-shaped values
carries `provenance.producer === 'user-action'`, never `'ai-inference'`, and the domain command
itself is proven to default that way when called exactly as this feature calls it. `ai-inference`/
`inferenceProvenance(` do not appear anywhere in the OCR feature's source (architecture guard,
§26). Raw OCR text is never persisted: `SourceArtifact` (the codebase's existing
"evidence of arrival" record, which explicitly forbids storing body/transcript/text) was
inspected and deliberately **not used** — this feature does not create one, so no artifact linkage
exists and entry-path history (which candidate came from OCR) is discarded entirely once she
confirms, exactly as the task specifies ("OCR entry-path history remains transient and is
discarded after confirmation").

## 22. Confidence handling

`expo-ocr-kit`'s `OcrResult` type (`{ text: string; blocks: OcrBlock[] }`) exposes **no confidence
value at all** — verified against the package's own shipped `.d.ts`. Per the task's own rule
("If the OCR engine provides no confidence value: omit the field"), `OcrCandidate.engineConfidence`
is always `null` in this integration; the field exists in the type for forward-compatibility with
an engine that does expose one, but nothing in this feature currently sets it to a number, displays
it, or uses it to rank, filter, or auto-confirm/auto-assign anything (`ocrExtract.test.mjs` proves
passing a non-null confidence never changes which candidates are offered). No percentages, no
high/medium/low language, no `POSSIBLE`/`LIKELY`/`ESTABLISHED` mapping anywhere in the OCR copy
(`ocrCopy.test.mjs`).

## 23. F12 integration seam

Exactly one seam, and it is the smallest possible one: `LifeAdminContainer`'s `SheetState` gained
an optional `initialOverride` field on its existing `'create'` variant, and a new `'scan'` variant
that renders `ScanEntryPoint` (lazy-loaded — see §35 for why). No change to `RecordSheet.tsx`,
`submitRecord`, `addLifeRecord`, `updateLifeRecord`, or any domain command. The OCR review screen's
only effect on the rest of the app is to choose what values a brand-new "Add record" sheet opens
with; from the store's point of view, an OCR-assisted save is indistinguishable from typing the
same values by hand.

## 24. Accessibility

- Every actionable control (`Button`, `ChipToggle`, `TextField`) reuses this project's existing
  design-system primitives, which already carry `accessibilityRole`, `accessibilityLabel`, and
  (for toggles) `accessibilityState.selected` — no new bespoke touchable was built.
- Each candidate date's `AppText` carries an explicit `accessibilityLabel` reading, e.g., "15 March
  2027. Unconfirmed — not yet chosen for any field." — the unconfirmed state is a real accessible
  string, not a color or icon (`ocrReview.test.mjs`; mutant `OCR14` proves removing that label
  fails the test).
  Each per-field picker's heading states its current state in words ("Expiration date — Not set" /
  "Expiration date — Set to 15 March 2027"), read by `Overline`'s existing `<Text>` — no color-only
  distinction anywhere.
- Screen-reader announcements: the "reading" phase (`ScanEntryPoint`) is wrapped in
  `accessibilityLiveRegion="polite"` with the text "Her Keys is reading your photo…"; the
  permission-denied and error phases use `accessibilityRole="alert"`.
- The Continue action's `accessibilityHint` states plainly that nothing is saved until the
  following form's own Save is used ("Opens the usual Add-record form with your choices already
  filled in. Nothing is saved until you save that form.") — verified present in
  `ocrReview.test.mjs`.
- Sensitive reference candidates stay masked (reusing the existing `maskReference`/`Reveal`
  pattern from `RecordDetailSheet`) until an explicit Reveal tap, matching the established F12
  UI rule exactly rather than inventing a new one.
- Not independently verified with a real screen reader (VoiceOver/TalkBack) on a device — that is
  listed under the iOS/Android follow-up (§36) and known limitations (§35), consistent with this
  being a text-tree-level proof, not a device-level one.

## 25. Background-interruption behavior

`ScanEntryPoint` tracks an `AppState` listener; if the app leaves `'active'` while a scan is
`'working'`, a ref is set. When the in-flight `scanForCandidates` promise resolves, that ref is
checked **before** any candidate is shown: if set, the result's `cleanup()` (if a candidate was
produced) is invoked and the flow resets to `'choose'` — it never proceeds into review, never
creates a `LifeRecord`, and clears the transient candidate. This is a **discard-on-resume**, not a
true mid-flight cancellation: `expo-ocr-kit`'s `recognizeText` promise offers no cancellation
token, so the native call is allowed to finish, but its result is never trusted or shown. This is
the honest reading of the task's own "cancel... where supported" language, and is documented as
such rather than overclaimed. Equivalent on Android and iOS (the same JS-level logic runs on both;
not independently device-verified — §36).

## 26. Architecture guard

`tests/lifeAdmin/ocrArchitectureGuard.test.mjs` — a static source scan (regex-based, over the real,
on-disk OCR files) proving:

- No file reaches the network, cloud storage, or a named external OCR/AI API
  (`fetch(`/`XMLHttpRequest`/`axios`/bare `http(s)://`/`supabase`/`storage.from(`/`.upload(`/
  known cloud-AI hostnames).
- No file imports `persistence/`, `domain/sync/`, or `state/appStore` — nothing in this feature
  can reach the write queue, the sync engine, or the canonical store directly.
- No file constructs or names `ai-inference` provenance (`inferenceProvenance(` or the literal
  string `'ai-inference'`).
- The two files that reach native camera/picker/OCR modules (`ocrNativeAdapter.ts`,
  `ScanEntryPoint.tsx`) cannot import `domain/lifeRecords` (so they cannot call
  `addLifeRecord`/`updateLifeRecord` even if someone tried to wire that in later) or
  `domain/state`/`domain/sync` (so a scanned image or its recognized text structurally cannot
  become part of `AppState` or a sync payload).

**Test-the-test**: every one of the checks above is first run against a deliberately violating
synthetic source string (a fake `fetch()` to an OCR API, a fake Supabase upload, a fake import of
each forbidden module, a fake `inferenceProvenance(...)` call, a fake literal `ai-inference`
producer) and asserted to be caught, and once more against clean, unrelated source asserted to be
**not** flagged — so the guard is proven capable of catching a violation before it is trusted
against the real files.

## 27. Test-the-test / mutants

Required mutant | How it is proven | Result
---|---|---
1. bypass confirmation, save candidate directly | Structural: neither native-boundary file can import `domain/lifeRecords` (guard); behaviorally, `OcrReviewScreen` calls no function but its own props (`ocrReview.test.mjs`) | **PROVEN** (static + behavioral)
2. confirmed value saved as `ai-inference` | Guard scans for the string/call; `ocrIntegration.test.mjs` checks the real saved record's provenance | **PROVEN**, plus test-the-test (synthetic violation caught)
3. raw OCR text persisted as evidence | Guard: no persistence/sync import anywhere in the feature | **PROVEN**, plus test-the-test
4. call a cloud OCR endpoint | Guard: no network surface anywhere in the feature | **PROVEN**, plus test-the-test
5. save after cancel | Real mutation `OCR5` (patches `OcrReviewScreen`'s Cancel button to also call `onUseValues`) | **CAUGHT** — 1 failed, 12 passed
6. empty confirmed LifeRecord after OCR failure | Structural: `ScanEntryPoint`'s error phase offers only Choose-photo/Enter-manually/Cancel, and (like all native-boundary code) cannot import the save commands at all (guard) | **PROVEN** (static)
7. auto-assign a date to `expiresOn` because text says "expires" | Real mutation `OCR7` | **CAUGHT** — 4 failed, 9 passed
8. ambiguous dates auto-select earliest | Real mutation `OCR8` | **CAUGHT** — 4 failed, 9 passed
9. ambiguous dates auto-select first | Real mutation `OCR9` | **CAUGHT** — 4 failed, 9 passed
10. name candidate auto-populates issuer | Real mutation `OCR10` | **CAUGHT** — 1 failed, 12 passed
11. sensitive reference unmasked | Real mutation `OCR11` (this exact bug was actually found live during development — see note below) | **CAUGHT** — 2 failed, 11 passed
12. multiple candidates silently keep only first | Real mutation `OCR12` | **CAUGHT** — 2 failed, 20 passed
13. manual fallback blocked behind an error | Real mutation `OCR13` | **CAUGHT** — 1 failed, 12 passed
14. candidate visually different, no accessibility state | Real mutation `OCR14` | **CAUGHT** — 1 failed, 12 passed
15. OCR network/model download introduced | Guard: `NETWORK_OR_CLOUD` pattern, plus §15's bundled-model evidence | **PROVEN**, plus test-the-test
16. transient source image reaches sync/AppState | Guard: native-boundary files cannot import `domain/state`/`domain/sync` | **PROVEN** (static)

All 9 mechanically patchable mutants (`OCR5`, `OCR7`–`OCR14`) were run for real via
`scripts-dev/ocr-assist-mutation-check.cjs` (same method as the project's existing
`life-admin-mutation-check.cjs`: patch real source, run the guarding tests, require a genuine
`AssertionError` — not a crash — then restore byte-for-byte and verify the restore with a SHA-256
check). Raw output:

```
OCR5   cancelling the scan saves nothing                        CAUGHT    1 failed, 12 passed
OCR7   nearby "Expires" text never auto-assigns the expiration field CAUGHT    4 failed, 9 passed
OCR8   ambiguous dates are never auto-picked to the earliest    CAUGHT    4 failed, 9 passed
OCR9   ambiguous dates are never auto-picked to the first recognized CAUGHT    4 failed, 9 passed
OCR10  a name candidate never auto-populates the issuer field   CAUGHT    1 failed, 12 passed
OCR11  a sensitive reference candidate stays masked until Reveal CAUGHT    2 failed, 11 passed
OCR12  multiple recognized dates are all offered                CAUGHT    2 failed, 20 passed
OCR13  manual entry is never blocked from the review screen     CAUGHT    1 failed, 12 passed
OCR14  a candidate date carries a real accessibility state, not just a visual difference CAUGHT    1 failed, 12 passed

9 / 9 mutants caught
```

`git status --short` after the run: empty (every patched file restored byte-for-byte; the
script's own SHA-256 restore check did not fire).

**Honest note on mutant 11**: while first writing `ocrReview.test.mjs`'s masking assertion, the
test genuinely failed against the real (unmutated) implementation — the date-candidate "context"
hint (±40 characters of surrounding recognized text) could include a nearby reference number in
the clear, because the hint was built before the reference regex ran over it. That was a real,
shipped-for-a-moment bug, not a hypothetical; it was fixed (`redactSensitiveContext` in
`ocrExtract.ts`, applied to every candidate's context string) before this report was written, and
is exactly why context hints are redacted against the same reference-token pattern used for
extraction, skipping only tokens that are themselves real calendar dates.

## 28. Dormant-scaffold isolation

`DORMANT SCAFFOLD FILES TOUCHED: none`

Verified by `git diff 6b0efa49501a3ad3f4a5af70f9d88bbab8ea74a1 -- <every dormant/notification
file the entry inspection identified>` producing **zero output** (§3's dormant-scaffold list,
re-checked at exit): `src/config/externalIntelligence.ts`, `src/external/types.ts`,
`src/features/today/WeatherContextCard.tsx`, `src/features/calendar/**`,
`src/platform/externalIntelligenceClient.ts`, `supabase/functions/weather-context/**`,
`supabase/functions/calendar-oauth/**`, `supabase/functions/calendar-data/**`,
`src/notifications/**`, `src/platform/localNotifications.ts`,
`src/store/LocalNotificationProvider.tsx`. `supabase/` as a whole: also zero diff against the
source SHA. Weather remains dormant (no credentials, no anchor configured — unchanged). Google
Calendar remains dormant (no OAuth secrets configured — unchanged). Local notifications remain
real, active, and opt-in-gated exactly as at entry — untouched, not newly activated.

## 29. F12 regression evidence

F12 entry test count: **98** (`tests/lifeAdmin/*.test.mjs`, the 8 pre-existing files). F12 exit
test count: **98** — identical files, identical `test(` count. `git diff` of every pre-existing
`tests/lifeAdmin/*.test.mjs` file against this branch's base commit: **empty** (confirmed
directly, §29 evidence command in §3/§27's methodology). **F12 EXISTING TESTS MODIFIED = 0.**

New OCR-specific tests added (all in new files, none touching an existing one): 22
(`ocrExtract.test.mjs`) + 6 (`ocrCopy.test.mjs`) + 13 (`ocrReview.test.mjs`) + 4
(`ocrIntegration.test.mjs`) + 15 (`ocrArchitectureGuard.test.mjs`) = **60** new tests, all passing
at this report's original writing. The two-fix closeout (addendum, below) added 4 more permission-
inspection cases to `ocrArchitectureGuard.test.mjs`, bringing the OCR-specific total to **64**; F12
remained **98 → 98** with zero existing tests modified through both passes.

## 30. Platform verification table

Claim | iOS | Android
---|---|---
Package resolves/typechecks against this exact stack | EXECUTED (`tsc --noEmit`, real) | EXECUTED (same run — TypeScript is platform-agnostic here)
Native module autolinking is structurally correct (`expo-module.config.json` inspected) | EXECUTED (inspection) | EXECUTED (inspection)
Config plugin output (Info.plist / merged manifest) | NOT_EXECUTED — ENVIRONMENTAL LIMITATION (no macOS/Xcode; inspected the plugin's source instead, §13) | NOT_EXECUTED — ENVIRONMENTAL LIMITATION (no Android SDK; inspected the plugin's source instead, §12)
Camera capture | NOT_EXECUTED — ENVIRONMENTAL LIMITATION | NOT_EXECUTED — ENVIRONMENTAL LIMITATION
Photo picker | NOT_EXECUTED — ENVIRONMENTAL LIMITATION | NOT_EXECUTED — ENVIRONMENTAL LIMITATION
On-device recognition | NOT_EXECUTED — ENVIRONMENTAL LIMITATION | NOT_EXECUTED — ENVIRONMENTAL LIMITATION
Offline / no-network-request proof | NOT_EXECUTED — ENVIRONMENTAL LIMITATION (architectural proof only: §15, §26) | NOT_EXECUTED — ENVIRONMENTAL LIMITATION (same)
Candidate review / assignment / confirmation logic | EXECUTED (Node component tests, `ocrReview.test.mjs`, real render + real interaction, no native modules involved) | EXECUTED (same code, same tests — this logic is platform-agnostic JS/TSX)
Cancellation / background-interruption | NOT_EXECUTED — ENVIRONMENTAL LIMITATION (native `AppState` behavior not device-verifiable here; code-reviewed only) | NOT_EXECUTED — ENVIRONMENTAL LIMITATION
Large-image behavior | NOT_EXECUTED — ENVIRONMENTAL LIMITATION | NOT_EXECUTED — ENVIRONMENTAL LIMITATION
Permission denial | NOT_EXECUTED — ENVIRONMENTAL LIMITATION | NOT_EXECUTED — ENVIRONMENTAL LIMITATION
Manual fallback (F12's existing Add-record form) | EXECUTED (real store, `ocrIntegration.test.mjs`) | EXECUTED (same)

No Android emulator/device and no macOS/Xcode exist in this container; this table is exhaustive
about what actually ran.

## 31. iOS follow-up checklist (first Mac/iPhone validation session)

1. `npx expo prebuild --platform ios` and inspect the generated `Info.plist` for exactly the three
   keys in §13 (and no others introduced by this change).
2. Real device or simulator: tap "Scan with Her Keys" → Take photo → grant camera permission →
   confirm the system camera UI appears and a photo can be captured.
3. Choose photo → confirm the system `PHPickerViewController` appears with **no** photo-library
   permission prompt.
4. Deny camera permission → confirm the "permission was not given" copy appears, "Choose photo"
   and "Enter manually" remain available, and Settings deep-link (if added) works.
5. Scan a real document (e.g. an expired ID or a utility bill with a clear date) → confirm
   Vision-based recognition produces the expected candidates, and cross-check against the actual
   printed text.
6. With the device in Airplane Mode, repeat step 5 and confirm recognition still succeeds
   (the real offline-recognition proof this environment cannot produce).
7. Start a scan, background the app mid-recognition (Home button/App Switcher), return — confirm
   the flow resets to the scan-entry state and no candidate/review screen appears from the
   backgrounded attempt.
8. VoiceOver: swipe through the entry point, action sheet, "reading" state, and review screen;
   confirm every control announces sensibly and the unconfirmed/assigned states are spoken (not
   only shown).
9. Confirm the re-encoded temp file is removed from the app's cache directory after a completed
   scan, a cancelled scan, and a killed-app crash-recovery run (inspect via Xcode's device file
   browser).
10. Measure a real IPA size delta against a build without this feature, to replace the estimate in
    §16.
11. Confirm `expo-ocr-kit`'s actual behavior against this project's exact Expo 57.0.24 / RN 0.86.3
    pairing (the package's own `devDependencies` pin an older canary combination — §6) — watch
    specifically for New Architecture (Fabric/TurboModules) issues that would not surface in a
    JS-only environment.

## 32. Known limitations

- `expo-ocr-kit` is a small, single-maintainer package (0.1.4, 7 GitHub stars at time of
  selection, last committed ~5 months before this work) — disclosed in §7 rather than hidden. It
  is the only candidate found that satisfies both the bundled-Android-model requirement and the
  native-per-platform-engine preference simultaneously; the alternatives were disqualified on
  those same grounds, not on maturity. Recommend re-evaluating the OCR ecosystem (or vendoring a
  minimal fork) before shipping this feature broadly.
- No Android SDK, emulator, or macOS/Xcode in this environment — every native-runtime claim is
  environmentally blocked, not merely "not yet run" (§30).
- `AGENTS.md` directs reading the exact versioned Expo SDK 57 docs at `docs.expo.dev` before
  writing code; that host is blocked by this environment's network egress policy
  (`EGRESS_BLOCKED`). Compatibility evidence in this report instead comes from direct inspection
  of the installed packages' own shipped source/type definitions and `tsc` against them (§6),
  which is real evidence but not the same as reading Expo's own documentation.
  New-Architecture-default status for SDK 57/RN 0.86 is stated from general knowledge of React
  Native's architecture roadmap (Old Architecture support was removed well before RN 0.86), not
  from a fetched citation — flagged rather than presented as verified.
  Application-size impact (§16) is an estimate, not a measurement, for the same reason.
- Background-interruption handling (§25) is a discard-on-resume, not a true mid-flight
  cancellation — `expo-ocr-kit`'s `recognizeText` exposes no cancellation token. Documented as
  such rather than overclaimed.
  Only title/date/issuer/reference-number candidates are extracted; no candidate is offered for
  the record's "Type" field — a deliberate scope boundary (manual entry remains available for it),
  not an oversight.
- Date-candidate recognition supports ISO (`YYYY-MM-DD`), US-style slash dates
  (`MM/DD/YYYY`/`MM/DD/YY`), and common month-name forms; it does not attempt every locale's date
  convention (e.g. `DD/MM/YYYY` is read as `MM/DD/YYYY`, consistent with the codebase's existing
  US-centric date handling, and is offered only as one more candidate to confirm, edit, or reject
  — never auto-applied).

## 33. Confirmation Staging unchanged

No Supabase migration, Edge Function, bucket, provider secret, or schema change was made or is
required by this feature. `supabase/` shows zero diff against the source SHA (§28). Staging was
never touched from this session (no credentials or network path to it exist in this container).

## 34. Confirmation Production unchanged

Same as §33: no backend change of any kind, no deploy performed or attempted, no access to
Production exists from this session.

## 35. Git/remote status

- Worktree: `/home/user/her-keys-ocr-assist`, branch `refinement/ocr-assist`, based on
  `origin/refinement/weather-calendar-scaffold` @ `6b0efa49501a3ad3f4a5af70f9d88bbab8ea74a1`.
- Three commits on top of that SHA (see `git log --oneline` on this branch): the original OCR
  Assist implementation, its implementation report, and the two-fix closeout below — containing
  exactly the 16 files in §11/§37's diff stat, plus the 3 files in the closeout addendum's diff
  stat.
- `git status --short`: clean, after every mutation-testing run restored its patch and every
  temporary file this session created was removed.
- Not merged. Not force-pushed. No other worktree, branch (`main`,
  `integration/f01-f13-convergence`, `refinement/local-notifications`,
  `refinement/weather-calendar-scaffold` itself), Staging, or Production was modified.
- Pushed as a new branch (`refinement/ocr-assist`), per the user's explicit choice recorded in
  §1, rather than force-pushing the harness-assigned `claude/quirky-cerf-0uz94y` branch (which
  points at unrelated history).

---

## Addendum: two-fix closeout

Applied on top of reviewed HEAD `528a78a2f167a3704171cb7294e105255f43ed64` (verified, before
editing, to be both this branch's actual local/remote HEAD and to have zero uncommitted diff — no
other commits had landed on PR #3 in the meantime).

**Fix 1 — Android permission inventory corrected.** §12 was rewritten: the earlier report implied
`CAMERA` was the only Android permission this feature's stack contributes. Re-inspection of the
installed `expo-image-picker@~57.0.20` package's own `android/src/main/AndroidManifest.xml`
confirmed it also declares `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE`, both capped at
`android:maxSdkVersion="32"`. Both are now recorded honestly (source: the package's own manifest;
status: legacy, not requested by this feature's own code, not suppressed) rather than omitted or
silently blocked — this closeout deliberately did **not** add a blocking rule for either, since
verifying that is safe requires real Android-version/device validation this environment cannot
perform (§31). `RECORD_AUDIO` remains confirmed blocked via `microphonePermission: false`. A new,
permanent, `INSPECTION ONLY`-labeled test (`ocrArchitectureGuard.test.mjs`, 4 new cases) reads the
real installed manifest and this project's real `app.json` on every run, so this claim cannot
silently drift out of date again; it does not fabricate a merged-manifest result — this
environment has no Android SDK to produce one.

**Fix 2 — `expo-ocr-kit` pinned exact.** `package.json`'s `"expo-ocr-kit": "^0.1.4"` became
`"expo-ocr-kit": "0.1.4"`. `npm install` reconciled the lockfile (only the root dependency's
version-spec string changed — the resolved package was already `0.1.4`, so no other lockfile
content changed); `npm ci` afterward confirmed a clean install. Re-inspected post-pin:
`node_modules/expo-ocr-kit/package.json` version `0.1.4`; Android Gradle dependency unchanged —
`implementation("com.google.mlkit:text-recognition:16.0.1")` (still the bundled artifact, not
`com.google.android.gms:play-services-mlkit-text-recognition`); iOS podspec unchanged — depends
only on `ExpoModulesCore` (Apple Vision, no Firebase, no first-use model download). Source
inspection only, not device proof — labeled accordingly, consistent with the rest of this report.

**Unchanged, as instructed:** U.S. `MM/DD/YYYY` date-candidate parsing (`ocrExtract.ts`'s
`matchSlashDates`) — not touched; no dual US/international candidate was added; no existing OCR
date test was modified to address international ambiguity. Date-candidate UX, provenance, the F12
save path, candidate extraction (beyond nothing — no change was needed to make these two fixes
compile), OCR review UX, accessibility behavior, image sanitization, temp cleanup, background
behavior, masking, issuer extraction, reference extraction, Weather, Calendar, Notifications,
authentication, and Supabase are all untouched (verified by `git diff` against both the prior
reviewed HEAD and the source SHA — see §29 and the confirmations below).

**Verification, run for real:**

- `npm install` (lockfile reconciliation) → `up to date, audited 592 packages` (same package count
  as before the pin — no unrelated package added, removed, or re-resolved).
- `npm ci` → clean; `node -e "require('./package.json').dependencies['expo-ocr-kit']"` → `0.1.4`;
  the lockfile's root `dependencies['expo-ocr-kit']` → `0.1.4`; `node_modules/expo-ocr-kit`'s own
  `package.json` version → `0.1.4`.
- `npm run typecheck` → the same 7 pre-existing errors, all in
  `GoogleCalendarPanel.tsx`/`TomorrowReminderCard.tsx`/`WeatherContextCard.tsx` — **0 new errors**.
- `npm test` → `# tests 3417 / # pass 3410 / # fail 7` (was 3413/3406/7 before this closeout; +4
  tests, all newly passing, from the permission-inspection addition to
  `ocrArchitectureGuard.test.mjs`) — **the same 7 pre-existing baseline failures, 0 new** (`tests/hk-f01f13/syncRegistry.test.mjs`, `tests/meals/boundary.test.mjs`, `tests/migrationChain.test.mjs`, `tests/today/guarantees.test.mjs`, `tests/calendarValidation.test.mjs`, `tests/accountRuntime.test.mjs`, `tests/hk-f01f13/handoffOwnership.test.mjs` — classified `PRE-EXISTING — UNCHANGED`, not repaired, not reclassified as OCR failures).
- Targeted OCR tests (`tests/lifeAdmin/ocr*.test.mjs`, all 5 files): 64/64 passing (60 from the
  original implementation + 4 new permission-inspection cases).
- `node scripts-dev/ocr-assist-mutation-check.cjs` → `9 / 9 mutants caught`, identical results to
  the original report; `git status --short` empty afterward (byte-for-byte restore verified by the
  script's own SHA-256 check, which did not fire).
- F12 (`tests/lifeAdmin/{commands,copyAudit,demo,privacy,screen,sync,today,view}.test.mjs`): `git
  diff` against reviewed HEAD `528a78a` — empty. **Zero existing F12 tests changed.**
- `supabase/**`: `git diff` against reviewed HEAD — empty.
- Weather/Calendar/notification files (the same list checked in §28): `git diff` against reviewed
  HEAD — empty.

**Files changed in this closeout:** `package.json`, `package-lock.json`,
`tests/lifeAdmin/ocrArchitectureGuard.test.mjs` (+52 lines), `docs/refinements/HK_OCR_ASSIST_IMPLEMENTATION.md`
(this addendum and the corrected §5/§12). No other file touched.

**Verdict: `OCR TWO-FIX CLOSEOUT: COMPLETE`**

---

## Final report checklist (items 1–39 of the task's required return)

1. Source SHA: `6b0efa49501a3ad3f4a5af70f9d88bbab8ea74a1` (§1)
2. Final SHA: this branch's tip after the commit described in §35
3. Baseline certification classification: `REFINEMENT BASE — NOT YET FULLY CERTIFIED` (§2)
4. Baseline entry TypeScript/test state: §3 (7 pre-existing typecheck errors, 7 pre-existing test
   failures, all in the dormant Weather/Calendar scaffold; F12 100% green at 98 tests)
5. OCR library/version: `expo-ocr-kit@0.1.4` (§4–§5)
6. Compatibility rationale: §6
7. Android on-device recognition evidence: `NOT_EXECUTED — ENVIRONMENTAL LIMITATION` (§30)
8. iOS recognition evidence: `NOT_EXECUTED — ENVIRONMENTAL LIMITATION` (§30, expected per the
   task's own Windows framing — here it is a Linux container, an even stricter limitation)
9. iOS inspection evidence: §8, §13, §31
10. Image/camera dependencies: §10
11. Exact native/config changes: §11
12. Merged Android permission inventory: §12 (inspection-based, not a real merge — no Android SDK)
13. iOS permission/config inventory: §13
14. Android dependency footprint: §14
15. Bundled-model/offline proof: §15 (architectural proof; not device-executed)
16. App-size impact: §16 (estimate)
17. Candidate model: §18
18. Provenance semantics: §21
19. Date assignment semantics: §19
20. Multi-candidate semantics: §20
21. Confirmation semantics: §23, §27 (mutant 1, 5)
22. Image/temp lifecycle: §17
23. Background-interruption behavior: §25
24. F12 integration points: §23
25. Accessibility evidence: §24
26. Tests added: 60 (§29)
27. F12 entry test count: 98 (§3)
28. F12 exit test count: 98 (§29)
29. F12 existing tests modified: **0** (§29)
30. TypeScript result: 7 pre-existing errors, all pre-existing/unrelated, 0 new (§3)
31. Complete app test result: 3413 tests / 3406 pass / 7 fail (all 7 pre-existing) (§3, §29)
32. Backend/check result: `NOT_EXECUTED — ENVIRONMENTAL LIMITATION` (§3)
33. Mutant/test-the-test results: 9/9 real mutants CAUGHT, plus static-guard test-the-test for the
    remaining 7 (§26–§27)
34. Dormant scaffold files touched: none (§28)
35. Known limitations: §32
36. iOS Mac/device follow-up checklist: §31
37. Confirmation Staging unchanged: §33
38. Confirmation Production unchanged: §34
39. Git/remote status: §35
