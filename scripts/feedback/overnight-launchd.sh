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

if [ -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  log "ERROR: no CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY in $STATE/env — headless agent cannot start"
  exit 1
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
