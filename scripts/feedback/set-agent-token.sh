#!/bin/bash
# Store a long-lived Claude token for the overnight autopilot, safely.
#
# Why this exists rather than "just edit the file": the token that lived here
# before was a snapshot of a SESSION OAuth token copied from another
# LaunchAgent. The interactive CLI rotated its token, the snapshot was revoked,
# and this file went on exporting the dead value — which shadowed the working
# stored login. Manual runs passed while every 02:15 run would have failed
# (2026-08-06). `claude setup-token` mints a long-lived token that does not
# rotate out from under automation; this script puts it in place and then
# PROVES it works from a launchd-like environment, which is the check that was
# missing last time.
#
# Usage:  bash scripts/feedback/set-agent-token.sh
# The token is read silently — it is never echoed, never written to shell
# history, and never printed back.

set -u

ENV_FILE="$HOME/.claude/broadwayscore-feedback/env"
mkdir -p "$(dirname "$ENV_FILE")"
chmod 700 "$(dirname "$ENV_FILE")" 2>/dev/null

echo "Paste the token from 'claude setup-token' (input is hidden), then press Enter:"
read -r -s TOKEN
echo

if [ -z "${TOKEN:-}" ]; then
  echo "No token entered — nothing changed."
  exit 1
fi
# The prefix alone is NOT enough. This file is `source`d by the launchd wrapper,
# so anything written here executes as you. A pasted value containing a newline
# would end the assignment and turn the rest into shell commands that run
# unattended at 02:15 (adversarial review, 2026-08-06). Require the whole value
# to be one line of the exact character set a token uses — then nothing that
# reaches the file can be anything but a token.
case "$TOKEN" in
  sk-ant-*) : ;;
  *) echo "That does not look like a Claude token (expected it to start with sk-ant-). Nothing changed."; exit 1 ;;
esac
if ! printf '%s' "$TOKEN" | LC_ALL=C grep -Eq '^sk-ant-[A-Za-z0-9_-]+$'; then
  echo "That token contains characters a token never has (whitespace, a newline, or a shell metacharacter)."
  echo "Refusing to write it: this file is sourced by launchd, so those characters would run as commands."
  echo "Nothing changed."
  exit 1
fi
if [ "${#TOKEN}" -lt 40 ] || [ "${#TOKEN}" -gt 500 ]; then
  echo "That token is ${#TOKEN} characters, outside the plausible range (40-500). Nothing changed."
  exit 1
fi

PREV=""
if [ -f "$ENV_FILE" ]; then
  PREV="$ENV_FILE.bak-$(date +%Y%m%d-%H%M%S)"
  cp "$ENV_FILE" "$PREV"
fi

umask 077
cat > "$ENV_FILE" <<EOF
# Long-lived automation token, minted with 'claude setup-token'.
# Unlike a session OAuth token, this does not get revoked when you log in again.
# Re-mint with: claude setup-token, then: bash scripts/feedback/set-agent-token.sh
export CLAUDE_CODE_OAUTH_TOKEN='$TOKEN'
EOF
chmod 600 "$ENV_FILE"
unset TOKEN
echo "Wrote $ENV_FILE (mode $(stat -f %Lp "$ENV_FILE"))"

# Verify the way that actually matters: a clean environment, the wrapper's PATH,
# sourcing this file — i.e. what launchd will do at 02:15. Verifying a manual
# run instead is what produced a false "auth verified" last time.
echo "Verifying from a launchd-like environment..."
OUT=$(cd /tmp && env -i HOME="$HOME" \
  PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Applications/cmux.app/Contents/Resources/bin:$HOME/.local/bin" \
  sh -c '. "$HOME/.claude/broadwayscore-feedback/env"; claude -p "Reply with exactly: TOKEN_OK" --dangerously-skip-permissions 2>&1 | tail -2')

if echo "$OUT" | grep -q "TOKEN_OK"; then
  echo "PASS — the scheduled 02:15 run can authenticate."
  exit 0
fi
echo "FAIL — the token did not authenticate from the launchd path:"
echo "  $OUT"

# Roll back. Overwriting a WORKING credential with a broken one and leaving it
# there turns "I tried to update the token" into an outage — which is exactly
# what happened while testing this script on 2026-08-06: a bogus token replaced
# a good one and stayed. The previous file is known-good far more often than an
# unverified new one, so the failure path must restore it.
if [ -n "$PREV" ] && [ -f "$PREV" ]; then
  cp "$PREV" "$ENV_FILE" && chmod 600 "$ENV_FILE"
  echo "Rolled back to the previous $ENV_FILE — the new token was NOT kept."
else
  rm -f "$ENV_FILE"
  echo "Removed $ENV_FILE (there was no previous version to restore)."
fi
echo "The autopilot's preflight will abort loudly rather than run blind."
exit 1
