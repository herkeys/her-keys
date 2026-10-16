#!/bin/bash
# usage: ui02-cap.sh <name> "<query>" [wait-seconds]
export PATH="$PATH:/c/Users/jsmit/AppData/Local/Android/Sdk/platform-tools"
OUT=/c/Users/jsmit/Her-Keys-UI02/docs/design-system/evidence/hk-fe-ui-02/android-emulator-expo-go
adb shell input tap 370 1690 >/dev/null 2>&1
adb shell am force-stop host.exp.exponent
MSYS_NO_PATHCONV=1 adb shell "am start -a android.intent.action.VIEW -d 'exp://127.0.0.1:8083/--/x?$2' host.exp.exponent" >/dev/null
sleep "${3:-35}"
adb shell input tap 370 1690 >/dev/null 2>&1
sleep 3
adb exec-out screencap -p > "$OUT/$1.png"
ls -la "$OUT/$1.png" | awk '{print $5, $9}'
