# HK-FE-UI-02 source-rendered evidence recipe (Android emulator + Expo Go)

Reproduces `docs/design-system/evidence/hk-fe-ui-02/android-emulator-expo-go/`.

1. `cp scripts-dev/ui02-evidence/evidence-entry.js .` and set `"main": "evidence-entry.js"` in `package.json` **temporarily**.
2. `npx expo start --go --clear --port 8083`, start an AVD with Expo Go (the evidence used `HerKeys_Runtime`, software GPU),
   `adb reverse tcp:8083 tcp:8083`.
3. `capture.sh <name> "mode=welcome&scene=signup" [wait]` opens `exp://127.0.0.1:8083/--/x?<query>` and saves a PNG.
   The query modes are documented in `src/dev/Ui02Evidence.tsx`. `capture-all.sh` is the exact list used.
4. Revert `package.json` and delete the copied entry. Neither is ever committed.

The capture scripts contain this machine's absolute paths and ANR-dialog tap coordinates; adjust before reuse. Software-GPU
emulators raise "Pixel Launcher isn't responding" dialogs; a capture with a dialog in it is a failed capture and must be retaken.

## Core-app harness (`core/`) — real screens on the real demo household

`core/core-entry.js` mounts the REAL stores/providers (AppState, Account, RevenueCat, Premium — signed out, Onboarding, Schedule,
OneMove, TalkItOut) and renders the REAL screens and the REAL `app/(app)/_layout.tsx` tab bar. Only two modules are stubbed, through
a TEMPORARY `metro.config.js`: `expo-router` (inert navigation; its `Tabs` draws the real layout options as a bottom bar) and
`expo-notifications` (Expo Go 57.0.9 lacks its native module). To use: copy `core/core-entry.js` and `core/metro.config.js` to the repo
root, set `"main": "core-entry.js"`, `npx expo start --go --clear --port 8083`, then open
`exp://127.0.0.1:8083/--/x?screen=tab:today` (also `tab:life|calendar|systems`, `talk`, `profile`, `kids`, `money`, `meals`,
`home`, `work`, `people`, `rebuild`, `needsme`, and `screen=ui&mode=<Ui02Evidence mode>`). Use a FRESH AVD (the demo store reports
"household from a different mode" on an emulator that already holds another build's data) with ≥3 GB RAM — a 2 GB emulator is
killed by the low-memory killer while the app loads. Revert `package.json` and delete the copies afterwards; they are never committed.
