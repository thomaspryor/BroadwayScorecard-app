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
case "$TOKEN" in
  sk-ant-*) : ;;
  *) echo "That does not look like a Claude token (expected it to start with sk-ant-). Nothing changed."; exit 1 ;;
esac

[ -f "$ENV_FILE" ] && cp "$ENV_FILE" "$ENV_FILE.bak-$(date +%Y%m%d-%H%M%S)"

umask 077
cat > "$ENV_FILE" <<EOF
# Long-lived automation token, minted with 'claude setup-token'.
# Unlike a session OAuth token, this does not get revoked when you log in again.
# Re-mint with: claude setup-token, then: bash scripts/feedback/set-agent-token.sh
export CLAUDE_CODE_OAUTH_TOKEN=$TOKEN
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
echo "The autopilot's preflight will abort loudly rather than run blind."
exit 1
