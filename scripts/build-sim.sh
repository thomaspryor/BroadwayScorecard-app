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
# Pods can arrive already-installed via a worktree clone (visual-gate.js
# captureScreens / memory ios-worktree-design-render-recipe.md) that deliberately
# excludes ios/build/ — its derived-data products bake in the source repo's
# absolute path (see the JSI cache comment below). CocoaPods' codegen step,
# which use_react_native! runs INSIDE `pod install`, writes the ReactCodegen
# sources straight into ios/build/generated and wires them into Pods.xcodeproj
# as plain file references — not a build-time script phase — so a cloned Pods
# dir with no matching ios/build/generated points xcodebuild at .mm files that
# were never generated for THIS checkout:
#
#   error: Build input file cannot be found: '.../ios/build/generated/ios/
#   ReactCodegen/rngesturehandler_codegen/rngesturehandler_codegen-generated.mm'.
#   Did you forget to declare this file as an output of a script phase...
#
# ios/Pods existing is therefore not sufficient proof that codegen ran for
# this checkout (BRO-201: observed in the overnight worktree 2026-08-12/13,
# after the arch-pin + JSI-cache fixes below already landed). Require
# ios/build/generated too, and re-run pod install (not a full prebuild) when
# only that half is missing.
if [ ! -d ios/Pods ]; then
  npx expo prebuild --platform ios
  (cd ios && pod install)
elif [ ! -d ios/build/generated ]; then
  echo "build-sim: ios/Pods present but ios/build/generated is missing (likely a cloned worktree) — re-running pod install"
  (cd ios && pod install)
fi

# Drop a module cache that was precompiled for a DIFFERENT checkout path
# (2026-08-09). expo-modules-jsi keeps its own DerivedData INSIDE node_modules,
# and the overnight autopilot copies node_modules wholesale into each worktree —
# so the .pcm files arrive with the main repo's absolute path baked in and Xcode
# refuses them:
#
#   error: precompiled file '.../worktrees/.../SwiftShims-*.pcm' was compiled
#   with module cache path '/Users/tompryor/BroadwayScorecard-app/node_modules/...'
#   but the path is currently '.../worktrees/...'
#   error: missing required module 'SwiftShims'
#
# This is the SECOND half of the visual-gate failure. Pinning arm64 (below) fixes
# the x86_64 ReactCodegen half; measured 2026-08-09, each fix alone still fails
# and only both together reach BUILD SUCCEEDED. Main's copy regenerates on every
# build, so every new worktree inherits it — this is not a one-off.
#
# Only fires when the baked path actually differs from this checkout, so builds
# in the main repo keep their cache (a full rebuild is ~10 min).
# Provenance is tracked with a stamp file rather than by inspecting the .pcm
# binaries: grepping 216MB of cache is slow and binary-grep is unreliable. An
# ABSENT stamp means unknown provenance (e.g. freshly copied by the autopilot),
# which is exactly the broken case — so the safe default is to clear.
REPO_ROOT="$PWD"
JSI_DD="$REPO_ROOT/node_modules/expo-modules-jsi/apple/.DerivedData"
JSI_STAMP="$JSI_DD/.built-for-checkout"
if [ -d "$JSI_DD" ] && [ "$(cat "$JSI_STAMP" 2>/dev/null)" != "$REPO_ROOT" ]; then
  echo "build-sim: dropping module cache from another checkout ($JSI_DD)"
  rm -rf "$JSI_DD"
fi

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
# Claim the cache for this checkout so the next build here is incremental.
# (Skipped silently if the build never recreated the dir.)
[ -d "$JSI_DD" ] && printf '%s' "$REPO_ROOT" > "$JSI_STAMP" 2>/dev/null || true

APP=$(find build/Build/Products/Release-iphonesimulator -name "*.app" -maxdepth 1 | head -1)
xcrun simctl install "$DEVICE_ID" "$APP"
echo "Installed $APP on $DEVICE_ID"
