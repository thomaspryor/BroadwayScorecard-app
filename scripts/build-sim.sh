#!/bin/bash
# Build the Release simulator app the same way CI does (maestro-e2e.yml).
# Gotchas this encodes (learned 2026-07-24, task #323):
#   - NO CODE_SIGNING_ALLOWED=NO: ad-hoc signing must run or the keychain
#     entitlement is stripped and ExpoSecureStore/auth breaks in the sim.
#   - SENTRY_DISABLE_AUTO_UPLOAD=true or the Sentry bundle phase fails
#     without an auth token.
# EXPO_PUBLIC_* vars inline from .env.local at bundle time (auto sign-in etc).
set -euo pipefail
cd "$(dirname "$0")/.."
DEVICE_ID="${1:-$(xcrun simctl list devices booted -j | python3 -c 'import json,sys; d=json.load(sys.stdin); print(next(dev["udid"] for devs in d["devices"].values() for dev in devs))')}"
[ -d ios/Pods ] || (npx expo prebuild --platform ios && cd ios && pod install)
cd ios
BUILD_LOG="${BUILD_LOG:-${TMPDIR:-/tmp}/build-sim-$(date +%Y%m%d-%H%M%S).log}"
# ARCHS/ONLY_ACTIVE_ARCH are load-bearing (2026-08-09). Under -configuration
# Release, Xcode defaults ONLY_ACTIVE_ARCH=NO and builds EVERY arch valid for
# the simulator SDK — including x86_64 on an Apple Silicon Mac. The x86_64 slice
# of ReactCodegen (rnworklets, safeareacontext) fails to compile, so the whole
# build fails even though the arm64 slice is fine. That failure is what blocked
# the overnight autopilot's visual gate for three consecutive nights: no
# simulator build meant no screenshots, and the gate correctly refused to merge
# UI changes nobody had looked at. Pinning arm64 also halves the compile.
SENTRY_DISABLE_AUTO_UPLOAD=true xcodebuild \
  -workspace BroadwayScorecard.xcworkspace -scheme BroadwayScorecard \
  -sdk iphonesimulator -configuration Release \
  -destination "platform=iOS Simulator,id=$DEVICE_ID" \
  ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
  -derivedDataPath build build SENTRY_AUTH_TOKEN="" > "$BUILD_LOG" 2>&1 || {
  # `| tail -5` used to be the only output, which threw away every compiler
  # diagnostic — the overnight autopilot's failure report said "build-sim.sh
  # failed" followed by the last five lines, none of which named an actual
  # error. Keep the full log and print the lines that identify the failure.
  echo "xcodebuild FAILED — full log: $BUILD_LOG"
  grep -E "error:|The following build commands failed" -A 2 "$BUILD_LOG" | head -30
  exit 1
}
tail -3 "$BUILD_LOG"
APP=$(find build/Build/Products/Release-iphonesimulator -name "*.app" -maxdepth 1 | head -1)
xcrun simctl install "$DEVICE_ID" "$APP"
echo "Installed $APP on $DEVICE_ID"
