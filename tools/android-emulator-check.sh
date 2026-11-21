#!/usr/bin/env bash
set -euo pipefail
mkdir -p verification/android-emulator
app_apk=$(find verification/apks -name app-release.apk -print -quit)
test_apk=$(find verification/apks -name app-release-androidTest.apk -print -quit)
test -n "$app_apk" && test -n "$test_apk"
adb install -r "$app_apk"
adb install -r "$test_apk"
adb logcat -c
trap 'adb logcat -d > verification/android-emulator/logcat.txt || true' EXIT
run_checks() {
  local name=$1
  adb shell am instrument -w studios.fonyx.launcher.test/androidx.test.runner.AndroidJUnitRunner | tee "verification/android-emulator/$name-results.txt"
  if ! grep -q 'OK (4 tests)' "verification/android-emulator/$name-results.txt"; then
    echo "Instrumentation did not pass all four native/UI tests."
    return 1
  fi
  mkdir -p "verification/android-emulator/$name"
  adb pull /sdcard/Android/data/studios.fonyx.launcher/files/verification/. "verification/android-emulator/$name/"
}
run_checks phone
adb shell wm size 1600x2560
adb shell wm density 240
adb shell am force-stop studios.fonyx.launcher
run_checks tablet-viewport
