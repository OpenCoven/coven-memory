#!/usr/bin/env bash
# One-time contributor setup: install privacy guard hooks.
# Run after clone: scripts/setup-hooks.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
git config core.hooksPath .githooks
chmod +x .githooks/* scripts/guard-scan.sh
command -v gitleaks >/dev/null 2>&1 || {
  echo "NOTE: gitleaks not found. Install it (brew install gitleaks / see github.com/gitleaks/gitleaks)."
  echo "guard-scan fails closed without it — commits will be blocked until installed."
}
echo "Hooks installed (core.hooksPath=.githooks). CI enforces the same checks on every PR regardless."
