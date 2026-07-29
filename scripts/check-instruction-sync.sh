#!/usr/bin/env bash
# Guard Beads sync guidance: Dolt note pushes bypass git hooks and branch CI.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

FAIL=0
while IFS= read -r -d '' file; do
  if grep -nE '^[[:space:]]*bd[[:space:]]+dolt[[:space:]]+push([[:space:]]|$)' "$file"; then
    echo "instruction-sync: unguarded Beads sync command in $file." >&2
    echo "Use scripts/bd-dolt-push.sh so bead notes are scanned before sync." >&2
    FAIL=1
  fi
# These are instruction surfaces read directly by the supported agent tools;
# keep the list explicit so prose documentation is not treated as an executable
# command surface.
done < <(git ls-files -z -- '*AGENTS.md' '*CLAUDE.md' '*GEMINI.md' '*COPILOT.md' '.github/copilot-instructions.md' '.cursorrules')

exit "$FAIL"
