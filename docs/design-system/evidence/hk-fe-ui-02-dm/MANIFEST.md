# HK-FE-UI-02-DM — visual evidence manifest

**No screenshots exist for this build.** Nothing here is invented or mocked.

| Field | Value |
|---|---|
| Capture method planned | Android emulator `HerKeys_UI02` + Expo Go 57.0.9, real components via `scripts-dev/ui02-evidence/core/core-entry.js` (now seeded with `&scheme=light|dark`; new `mode=appearance` renders the real `AppearanceSection`) |
| Status | **NOT RUN** |
| Why | The emulator was withheld for the first part of this pass and, when released, the AVD would not start: the host disk had ~575 MB free and the emulator refused (`Your device does not have enough disk space to run avd: HerKeys_UI02`). Existing AVDs, caches and other files on that disk are the owner's and were not deleted to make room. |
| Harness readiness | `npx tsc --noEmit` clean with the harness changes; Metro starts. The harness itself has not been exercised on a device in this pass. |

## What was captured instead (non-visual, deterministic, reproducible)

| Evidence | Where | Result |
|---|---|---|
| 74 resolved render trees, Light, pre-migration `ca9e792` vs migrated | `tests/design-system/fixtures/light-baseline.json`, `lightRegression.test.mjs` | identical (no provider / Light provider / manual Light under a Dark device) |
| Same 74 renders under Dark: structure, copy, a11y, border styles identical except colour | `darkSemantics.test.mjs` | pass |
| No Light-only colour in any Dark tree; Dark differs in ≥ 60 renders | `lightRegression.test.mjs` | pass |
| WCAG matrix, both schemes (4.5:1 text, 3:1 boundaries) | `contrast-matrix.md`, `contrast*.test.mjs` | 152 pass / 0 fail |
| Rendered contrast, every real render in the suite | `node scripts-dev/ui02-contrast-audit.mjs --scheme light|dark` | Light 1,725 renders / 15,829 samples / 0; Dark 1,680 renders / 19,306 samples / 0 |
| Metro production bundles | `npx expo export --platform android|ios` | both export |

## Requested Light/Dark pairs — status

Welcome · consent · Today · Settings/Appearance · Premium Home · Daily Load · Smart Inbox · Momentum · compact layouts · final Premium
decision · sign-in · audit · profile · Calendar · Life · Talk It Out · error/success: **all NOT RUN** (no pixels). The final Premium
decision and the Premium review sheets were never reachable by the evidence harness (they need a live purchase path) and remain so.

## To run when space is available

1. Free several GB on the system drive.
2. `cp scripts-dev/ui02-evidence/core/{core-entry.js,metro.config.js} .` ; set `"main": "core-entry.js"` in `package.json` (temporary).
3. `emulator -avd HerKeys_UI02 -no-audio -no-boot-anim -no-snapshot-save -gpu swiftshader_indirect -no-window`; `npx expo start --go --clear --port 8083`.
4. For each screen open `exp://127.0.0.1:8083/--/x?screen=...&scheme=light` and `...&scheme=dark`; reject any capture showing the launcher or an ANR
   dialog (pixel (30,1500) must be the scheme's ground: `#FDF8F5` Light, `#211B25` Dark).
5. Revert `package.json`; delete the copied root files. Never commit them.
