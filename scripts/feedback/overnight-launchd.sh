#!/bin/bash
# launchd entry point for the overnight beta-feedback autopilot.
# Scheduled by ~/Library/LaunchAgents/com.broadwayscorecard.feedback-overnight.plist
#
# Everything the plist would otherwise need to know lives here instead, so the
# schedule can be changed without touching credentials and the credential can be
# rotated without touching the schedule.
#
# Secrets: sourced from $STATE/env (mode 600), never from the plist. A LaunchAgent
# plist is world-readable by default, so a token in one is a token every process
# on this Mac can read.
#
# Manual run:  bash scripts/feedback/overnight-launchd.sh
# Manual tick: launchctl kickstart -k gui/$(id -u)/com.broadwayscorecard.feedback-overnight
# Disable:     touch ~/.claude/broadwayscore-feedback/DISABLED
# Unload:      launchctl bootout gui/$(id -u)/com.broadwayscorecard.feedback-overnight

set -u

REPO="$HOME/BroadwayScorecard-app"
STATE="$HOME/.claude/broadwayscore-feedback"
LOG="$STATE/launchd.log"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Applications/cmux.app/Contents/Resources/bin:$HOME/.local/bin"

# Same reason as PATH above: launchd hands this script a minimal environment,
# not a login shell's. PATH was set for that and LANG was missed, which broke
# the visual gate for a month in a way that looked like a different bug.
#
# CocoaPods calls String#unicode_normalize on the installation root, and with
# no LANG that string is ASCII-8BIT, so Ruby raises
#   Encoding::CompatibilityError: Unicode Normalization not appropriate for ASCII-8BIT
# and `pod install` dies. scripts/build-sim.sh runs `pod install` whenever
# ios/build/generated is missing (always true in a fresh overnight worktree),
# so build-sim fails, captureScreens gets no screenshots, and decideVisualGate
# fails CLOSED — correctly, but on a cause nothing in the log points at.
# Observed verbatim in runs/2026-09-07T06-15-07.log, alongside CocoaPods' own
# advice: "CocoaPods requires your terminal to be using UTF-8 encoding."
#
# This is the SECOND of the two refusals that stranded the beta-feedback
# branches. BRO-2986 fixed the first (app/show/[slug].tsx had no deep-linkable
# example). With that one pinned the gate now ATTEMPTS a Show Detail capture,
# which makes this locale bug the new binding constraint rather than a
# secondary annoyance: no capture is still a refusal
# (visual-gate.test.mjs: "still fails closed without one").
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

mkdir -p "$STATE"
ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*" >> "$LOG"; }

log "=== tick ==="

if [ -f "$STATE/DISABLED" ]; then
  log "DISABLED file present — skipping"
  exit 0
fi

# The headless agent needs credentials that launchd does not inherit from a
# login shell. Keep them in a 600 file, not in the plist.
if [ -f "$STATE/env" ]; then
  # shellcheck disable=SC1091
  . "$STATE/env"
fi

# An EMPTY token is not the dangerous case — a STALE one is. A session OAuth
# token copied into this file is a snapshot: the interactive CLI rotates its
# token, the old value is revoked, and this file keeps exporting the dead one,
# which then SHADOWS the perfectly good stored login (2026-08-06 — a manual run
# succeeded on the stored login at the same moment the launchd path would have
# failed on the exported token, which is precisely why "I verified auth" was
# wrong). So: export nothing rather than something revoked, and let
# overnight.js's auth preflight do the real check — it probes the API instead
# of testing a string for non-emptiness.
if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  log "no token in $STATE/env — falling back to the stored login; overnight.js will verify it"
fi

cd "$REPO" || { log "ERROR: $REPO missing"; exit 1; }

# Start from a clean, current main. A stale checkout would rebase the night's
# work onto yesterday's tree and re-fix things that already shipped.
if ! git diff --quiet || ! git diff --cached --quiet; then
  log "ERROR: working tree dirty — refusing to run (a human is mid-edit)"
  exit 1
fi
git checkout main --quiet 2>>"$LOG"
git fetch origin main --quiet 2>>"$LOG" && git merge --ff-only origin/main --quiet 2>>"$LOG" \
  || log "WARNING: could not fast-forward to origin/main — continuing on local main"

log "running overnight.js"
node scripts/feedback/overnight.js >> "$LOG" 2>&1
code=$?
log "overnight.js exited $code"
log "=== tick done ==="
exit $code
