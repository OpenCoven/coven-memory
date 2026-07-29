#!/usr/bin/env bash
# Coven privacy/secret guard — used by pre-commit hook and CI.
# Fail-closed: any hit blocks. Usage:
#   scripts/guard-scan.sh            # scan working tree (tracked files)
#   scripts/guard-scan.sh --staged   # scan staged content only
#   scripts/guard-scan.sh --beads    # also scan a fresh beads export
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Robust PATH for hook/CI contexts (Homebrew on macOS arm64/intel, Linux)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

MODE="${1:-tree}"
FAIL=0

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "guard-scan: gitleaks not installed (brew install gitleaks). Fail-closed." >&2
  exit 1
fi

if [ ! -f .gitleaks-version ]; then
  echo "guard-scan: .gitleaks-version is missing. Fail-closed." >&2
  exit 1
fi
EXPECTED_GITLEAKS_VERSION="$(tr -d '\r\n' < .gitleaks-version)"
ACTUAL_GITLEAKS_VERSION="$(gitleaks version | tr -d '\r' | awk '{print $NF}')"
if [ "$ACTUAL_GITLEAKS_VERSION" != "$EXPECTED_GITLEAKS_VERSION" ]; then
  echo "guard-scan: expected gitleaks $EXPECTED_GITLEAKS_VERSION, found $ACTUAL_GITLEAKS_VERSION. Fail-closed." >&2
  exit 1
fi

# Optional baseline of pre-existing HISTORICAL findings (see the repo's
# security notes). Only suppresses findings already recorded in the baseline —
# any NEW finding still fails. Absent in repos with clean history.
BASELINE_ARGS=()
if [ -f .gitleaks-baseline.json ]; then
  BASELINE_ARGS=(--baseline-path .gitleaks-baseline.json)
fi

if [ "$MODE" = "--staged" ]; then
  gitleaks protect --staged --config .gitleaks.toml --no-banner --redact ${BASELINE_ARGS[@]+"${BASELINE_ARGS[@]}"} || FAIL=1
  gitleaks protect --staged --config .gitleaks-default.toml --ignore-gitleaks-allow --no-banner --redact ${BASELINE_ARGS[@]+"${BASELINE_ARGS[@]}"} || FAIL=1
else
  gitleaks detect --config .gitleaks.toml --no-banner --redact ${BASELINE_ARGS[@]+"${BASELINE_ARGS[@]}"} || FAIL=1
  gitleaks detect --config .gitleaks-default.toml --ignore-gitleaks-allow --no-banner --redact ${BASELINE_ARGS[@]+"${BASELINE_ARGS[@]}"} || FAIL=1
fi

# Belt-and-suspenders plain-pattern pass over tracked text files
# (catches what regex-tuned tools miss; categories are verified against .gitleaks.toml)
source scripts/privacy-patterns.sh
if [ "$MODE" = "--staged" ]; then
  LIST=(git diff --cached --name-only --diff-filter=ACM -z)
else
  LIST=(git ls-files -z)
fi
# NUL-delimited iteration: filenames containing whitespace must not dodge the scan
while IFS= read -r -d '' f; do
  case "$f" in *.png|*.jpg|*.jpeg|*.gif|*.pdf|*.ico|*.woff*|*.db) continue;; esac
  if [ "$MODE" = "--staged" ]; then
    # Read from the index: what gets committed, even if deleted from the worktree
    CONTENT=$(git show ":$f" 2>/dev/null || true)
  else
    [ -f "$f" ] || continue
    CONTENT=$(cat "$f")
  fi
  HITS=$(printf '%s' "$CONTENT" | grep -EnI "$PATTERNS" | grep -vE "$PLACEHOLDERS" | grep -vE "$ALLOW_MARKERS" || true)
  if [ -n "$HITS" ]; then
    echo "guard-scan: PRIVACY PATTERN in $f:" >&2
    echo "$HITS" | head -5 >&2
    FAIL=1
  fi
done < <("${LIST[@]}")

# Beads DB hygiene: bead notes must be publishable too (dolt refs can be pushed).
# Fail-closed: if a fresh export cannot be produced, the notes cannot be verified.
if [ "${2:-}" = "--beads" ] || [ "$MODE" = "--beads" ]; then
  if ! command -v bd >/dev/null 2>&1; then
    echo "guard-scan: bd not installed but a beads scan was requested. Fail-closed." >&2
    exit 1
  fi
  TMP=$(mktemp)
  if ! bd export -o "$TMP" >/dev/null 2>&1; then
    rm -f "$TMP"
    echo "guard-scan: bd export FAILED — bead notes cannot be verified. Fail-closed." >&2
    exit 1
  fi
  BEAD_HITS=$(grep -EnI "$PATTERNS" "$TMP" | grep -vE "$PLACEHOLDERS" | grep -vE "$ALLOW_MARKERS" || true)
  if [ -n "$BEAD_HITS" ]; then
    echo "guard-scan: PRIVACY PATTERN in beads database (bd export). Clean bead notes before any dolt push." >&2
    echo "$BEAD_HITS" | head -5 >&2
    FAIL=1
  fi
  rm -f "$TMP"
fi

if [ "$FAIL" -ne 0 ]; then
  echo "" >&2
  echo "guard-scan: BLOCKED. This is a public memory-layer repo — nothing local," >&2
  echo "personal, or session-identifying may be committed. See SECURITY.md." >&2
  echo "False positive for a Coven privacy rule? Add inline marker: gitleaks:allow (reviewed in PR). This never suppresses default secret rules." >&2
  exit 1
fi
echo "guard-scan: clean ($MODE)"
