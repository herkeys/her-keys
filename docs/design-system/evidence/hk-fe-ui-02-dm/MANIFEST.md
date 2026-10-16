# HK-FE-UI-02-DM — visual evidence manifest

Real components rendered in **Expo Go** on an **Android emulator**, Light and Dark pairs. Not a native build, not iOS, not a physical device.

| Field | Value |
|---|---|
| Source SHA captured | `feedca2e2b62ae675b15313f1835f215318f04b4` + the dev-only harness edit in this commit (`src/dev/Ui02Evidence.tsx`: Appearance mode padded like the Your Account panel) |
| Platform | Android AVD `HerKeys_UI02` (Pixel launcher image), software GPU (`swiftshader_indirect`), Expo Go 57.0.9 |
| Viewport | **1344×2992 @ 480 dpi** (default) and **720×1280 @ 320 dpi** (`compact/`) |
| Method | `scripts-dev/ui02-evidence/core/core-entry.js` mounts the REAL stores/providers/screens/`app/(app)/_layout.tsx` tab bar over the demo household (signed out, no Premium entitlement; `expo-router` and `expo-notifications` stubbed — see `scripts-dev/ui02-evidence/README.md`). `&scheme=light|dark` seeds `AppearanceProvider` (no storage: a capture never writes the device preference). `screen=ui&mode=…` renders the real evidence screens with fixed props. |
| Capture QA | every PNG passed an automatic ground-colour probe (≥2 of 3 left-edge points equal the scheme ground: Light `#FDF8F5`, Dark `#211B25`), so no capture shows the launcher, an ANR dialog or the dev-menu sheet. Captures that failed were retaken (up to once automatically). Every PNG was produced after `force-stop`+relaunch. |
| Files | `<name>-light.png`, `<name>-dark.png`, `<name>-side-by-side.png` (Light left, Dark right, half size; `scripts-dev/ui02dm-side-by-side.mjs`) |

## Captured pairs (default viewport)

| # | Screen | State in the harness |
|---|---|---|
| 01 | Welcome | `welcome` scene |
| 02 | Premium intro (pre-account) | `premium` scene |
| 03 | Sign-in | `signin` scene |
| 04 | Consent (legal + AI choice) | `legal` |
| 05 | Consent error/issue state | `legal-issue` |
| 06 | Consent permissions | `permissions` |
| 07 | Profile audit — goals | step 1 |
| 08 | **Today** | demo household |
| 09 | Life hub | |
| 10 | Calendar | |
| 11 | Systems | |
| 12 | Talk It Out | |
| 13 | Profile result | |
| 14 | **Settings / Appearance** (the real `AppearanceSection`) | Dark selected in the Dark capture, Light selected in the Light capture |
| 15 | **Premium Home** — active | `home-active` |
| 16 | Premium Home — free | `home-free` |
| 17 | **Daily Load** panel | entitled |
| 18 | **Momentum** panel | entitled |
| 19 | Components and system states (error / success / offline / empty / loading) | |
| 20 | AI language (dashed unconfirmed reading, solid-rail recommendation, amber hand "needs your yes", moss check) | |

Compact (`compact/`, 720×1280): `c01-welcome`, `c02-today`, `c03-appearance`, `c04-premium-home-active`.

## What the captures show / do not show

* Light is the unchanged approved look; Dark is Midnight Plum with the luminous Berry primary (dark ink label), amber/moss/rose siblings and the AI shapes intact.
* The round gear at the top right is the harness's account-entry overlay, not part of the screens under test. The "needsApproval" caption in capture 20 is the harness's raw mark key.
* The consent checkboxes render as outlined rows in **both** schemes (pre-existing; not a Dark regression).
* The status-bar clock/glyphs come from the emulator system UI: `SystemChrome` (status-bar style, navigation theme, system background) is mounted only by the real root layout, which this harness replaces, so **status-bar and navigation-bar behaviour is NOT verified**.

## NOT RUN / not reachable

| Item | Status |
|---|---|
| **Smart Inbox** | NOT RUN — no harness state exists for it (it renders inside Talk It Out after a live Premium capture) |
| Final Premium decision, Premium review sheets | NOT RUN — need a live purchase path the harness does not provide |
| Life Operating Profile with insights | NOT RUN |
| Settings/Appearance **inside the real Your Account panel**, and live switching on a running app | NOT RUN (the section is captured in isolation under a fixed scheme; switching is covered by `appearance*.test.mjs`) |
| Persisted choice across a real restart; System following the phone's setting; sign-out/in | NOT RUN on device (unit-tested) |
| iOS (any), physical Android device, VoiceOver/TalkBack | NOT RUN |
| Native splash (light/dark), status bar and navigation bar glyph contrast, keyboard/alert theming | NOT RUN — need a new native binary |
| Android/iOS native certification | **NOT_RUN** |

## To reproduce
1. `cp scripts-dev/ui02-evidence/core/{core-entry.js,metro.config.js} .`; set `"main": "core-entry.js"` in `package.json` (temporary; never commit).
2. `emulator -avd HerKeys_UI02 -no-audio -no-boot-anim -no-snapshot-save -gpu swiftshader_indirect -no-window`; `npx expo start --go --clear --port 8083`; `adb reverse tcp:8083 tcp:8083`.
3. Open `exp://127.0.0.1:8083/--/x?screen=tab:today&scheme=dark` (and `screen=ui&mode=appearance`, `…&mode=premium&state=home-active`, …). If more than one device is attached set `ANDROID_SERIAL`.
4. Revert `package.json`, delete the copied root files, `node scripts-dev/ui02dm-side-by-side.mjs`.
