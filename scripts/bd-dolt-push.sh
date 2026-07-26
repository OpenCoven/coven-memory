#!/usr/bin/env bash
# Guarded dolt push: bead notes sync via `bd dolt push` to refs/dolt/data,
# which fires NO git hooks and NO branch CI. This wrapper is the enforcement
# point for bead-note hygiene — always use it instead of a bare `bd dolt push`.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
scripts/guard-scan.sh --beads
exec bd dolt push "$@"
