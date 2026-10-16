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
