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
SENTRY_DISABLE_AUTO_UPLOAD=true xcodebuild \
  -workspace BroadwayScorecard.xcworkspace -scheme BroadwayScorecard \
  -sdk iphonesimulator -configuration Release \
  -destination "platform=iOS Simulator,id=$DEVICE_ID" \
  -derivedDataPath build build SENTRY_AUTH_TOKEN="" 2>&1 | tail -5
APP=$(find build/Build/Products/Release-iphonesimulator -name "*.app" -maxdepth 1 | head -1)
xcrun simctl install "$DEVICE_ID" "$APP"
echo "Installed $APP on $DEVICE_ID"
