#!/bin/bash
# Setup git hooks for this repo by pointing core.hooksPath at scripts/hooks/.
# This makes the hooks version-controlled (vs the default .git/hooks/ which
# isn't tracked) so every clone gets the same secret-scan pre-commit check.
# core.hooksPath is clone-local git config — `git clone` does NOT carry it
# over, so this runs on every `npm install` via the postinstall script.
#
# Run manually if needed: ./scripts/setup-git-hooks.sh
# Idempotent. Safe to re-run.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "ERROR: not inside a git repo." >&2
  exit 1
fi

CURRENT="$(git config --local --get core.hooksPath 2>/dev/null || true)"
DESIRED="scripts/hooks"

if [ "$CURRENT" = "$DESIRED" ]; then
  echo "Already configured: core.hooksPath = $DESIRED"
else
  git config --local core.hooksPath "$DESIRED"
  echo "Set core.hooksPath = $DESIRED"
  if [ -n "$CURRENT" ]; then
    echo "(was: $CURRENT)"
  fi
fi

if [ -f "$REPO_ROOT/$DESIRED/pre-commit" ] && [ ! -x "$REPO_ROOT/$DESIRED/pre-commit" ]; then
  chmod +x "$REPO_ROOT/$DESIRED/pre-commit"
  echo "Made $DESIRED/pre-commit executable."
fi

echo ""
echo "Pre-commit hook active: gitleaks secret scan on staged changes."
echo "Bypass for emergencies: git commit --no-verify"
