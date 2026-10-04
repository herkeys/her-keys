# Android release identity

## Canonical identities

| Platform | Identifier | Source |
|---|---|---|
| Android application id | `com.heykeys.app` | `app.json` `expo.android.package` |
| iOS bundle identifier | `com.herkeys.app` | `app.json` `expo.ios.bundleIdentifier` |
| EAS project | `her-keys`, owner `ams2dad`, projectId `7b25f8fe-d7de-49c1-ba69-1fd3a065826a` | `app.json` |

The Android and iOS identifiers are **intentionally different**. Do not make them match. `com.heykeys.app` is the
package the Google Play listing was created with, and a Play package name cannot be changed.

`app.json` is the single source of the identity (there is no `app.config.*` and no committed `android/` project). The
expected values are pinned in `scripts/verify-release-identity.mjs`.

## Why it matters: EAS signs per application id

EAS stores one Android keystore **per application id**, and creates one the first time an id is built.

| Android application id | EAS keystore SHA-1 | Google Play |
|---|---|---|
| `com.heykeys.app` | `27:EF:71:89:70:C6:72:0C:17:40:C8:E8:CA:EF:BD:70:61:C0:C1:E5` | expected upload key |
| `com.herkeys.app` (obsolete) | `DF:17:9E:E2:05:93:38:99:4C:87:36:C3:80:97:A4:18:A4:4D:A2:DA` | rejected |

Both rows were verified with `keytool -printcert -jarfile` on the downloaded AABs (2026-10-04): build `ea226dc0`
(`f87aaee`, `com.heykeys.app`) carries `27:EF…`, build `ee360b08` (`6f45d41`, `com.herkeys.app`) carries `DF:17…`.
Neither keystore is wrong. A build with the wrong application id simply selects the other keystore. Do not generate,
import, or delete keystores and do not request an upload-key reset to "fix" a rejected signature: fix the package.

## What produced the rejected AAB

1. Build 4 Phase 0 (B4-P0-044) recorded `com.herkeys.app` as the permanent identifier for both platforms, and
   `app.json` was set to it on 2026-09-20. The Google Play listing exists as `com.heykeys.app`. Nothing in the
   repository compared its Android identity with the Play listing.
2. `tests/weather/architecture.test.mjs` asserted `android.package === 'com.herkeys.app'`: the test pinned the wrong
   value, so the suite was green.
3. On 2026-09-29 01:21 UTC production build `ee360b08` was cut from `6f45d41`, the direct parent line of
   today's release branch (two commits before `f87aaee`), not a stale branch or worktree. EAS resolved `com.herkeys.app` and signed with that id's keystore
   (`DF:17…`). No step checked the application id or the signer before or after the build.
4. Google Play rejected the upload.
5. `f87aaee` corrected `android.package` to `com.heykeys.app`; build `ea226dc0` from it is signed with `27:EF…`.
6. What stayed broken: the build documents still declared Android `com.herkeys.app`, no check ran before an EAS build,
   and every branch cut before `f87aaee` still resolves the obsolete id (see below). A build from any of them repeats
   the failure.

## Guards

- `npm run verify:release-identity` resolves the Expo config (`expo config --type public --json`) and fails unless the
  Android package, iOS bundle identifier, slug, owner and EAS project id are the canonical ones.
- It runs in the Build 2 validation workflow, in `npm test` (`tests/releaseIdentity.test.mjs`), and **on the EAS
  builder** through the `eas-build-post-install` npm hook, so an EAS build of a wrong identity fails before compiling.
- `npm run release:preflight` adds provenance: authorized release branch (`RELEASE_BRANCHES` in the script), no
  tracked changes, and HEAD equal to its upstream. It prints the provenance record.

## Before every production Android build

```
git fetch origin
npm ci
npm run release:preflight        # must end RELEASE_IDENTITY=PASS; keep the printed record
npm run typecheck
npm test
npx expo install --check
npx expo-doctor
npx eas-cli build -p android --profile production
```

After the build, on the downloaded AAB, before any Play upload:

```
keytool -printcert -jarfile <app.aab>      # SHA1 must be 27:EF:71:89:70:C6:72:0C:17:40:C8:E8:CA:EF:BD:70:61:C0:C1:E5
```

and confirm the EAS build page shows application id `com.heykeys.app` and a `versionCode` Play has not seen
(versionCode 1 was used by `ea226dc0`).

## Branches that must not be used for a store build

Only branches containing `f87aaee` resolve the correct Android id: `build/02-gemini-integration` and
`audit/ios-android-platform-parity`. Every other branch (all `feature/*`, `integration/*`, `refinement/*`, `repair/*`,
`design/*`, `docs/*`, `build/04-cloud-identity-sync`) still resolves `com.herkeys.app`, has no guard, and is
**non-release**. `main` and the early `build/0x` branches have no Android package at all, so EAS would prompt for one.
These branches pick up the correct id and the guard when they are rebased onto or merged with the release line.
