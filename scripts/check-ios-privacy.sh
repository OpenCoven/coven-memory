#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if (( $# > 0 )); then
  targets=("$@")
else
  targets=(
    "$ROOT/apps/ios/CovenMemory/Sources"
    "$ROOT/apps/ios/CovenMemory/Config"
    "$ROOT/apps/ios/CovenMemory/Resources"
    "$ROOT/apps/ios/CovenMemory/Tests"
    "$ROOT/apps/ios/CovenMemory/UITests"
  )
  [[ ! -e "$ROOT/apps/ios/CovenMemory/build" ]] ||
    targets+=("$ROOT/apps/ios/CovenMemory/build")
fi

files=()
for target in "${targets[@]}"; do
  if [[ -f "$target" ]]; then
    files+=("$target")
  elif [[ -d "$target" ]]; then
    while IFS= read -r -d '' file; do
      files+=("$file")
    done < <(find "$target" -type d -name '*.xctest' -prune -o -type f -print0)
  else
    printf 'iOS privacy scan failed closed: path does not exist: %s\n' "$target" >&2
    exit 2
  fi
done

if (( ${#files[@]} == 0 )); then
  printf 'iOS privacy scan failed closed: no files were scanned\n' >&2
  exit 2
fi

failures=0

check_text() {
  local file="$1"
  local label="$2"
  local pattern="$3"
  if file "$file" | grep -q 'Mach-O'; then
    if ! strings -a "$file" | LC_ALL=C grep -E "$pattern" >/dev/null; then
      return
    fi
  elif ! LC_ALL=C grep -aEv 'gitleaks:allow|guard-scan-allow' "$file" |
    LC_ALL=C grep -E "$pattern" >/dev/null; then
    return
  fi
  printf '%s: %s\n' "$file" "$label" >&2
  failures=1
}

check_linked() {
  local file="$1"
  local label="$2"
  local pattern="$3"
  if file "$file" | grep -q 'Mach-O'; then
    if ! { nm -u "$file" 2>/dev/null; otool -L "$file" 2>/dev/null; } |
      LC_ALL=C grep -E "$pattern" >/dev/null; then
      return
    fi
  elif ! LC_ALL=C grep -aEv 'gitleaks:allow|guard-scan-allow' "$file" |
    LC_ALL=C grep -E "$pattern" >/dev/null; then
    return
  fi
  printf '%s: %s\n' "$file" "$label" >&2
  failures=1
}

for file in "${files[@]}"; do
  check_text "$file" "absolute home path" '(/Users/|/home/)[A-Za-z0-9._-]+'
  check_text "$file" "runtime-internal path" '(^|[^[:alnum:]_])(~|/[^[:space:]]*)?[/]?\.coven/(agents|workspaces|credentials|sessions)([^[:alnum:]_]|$)'
  check_text "$file" "pairing URL" 'coven-memory://pair([?/#]|$)'
  check_text "$file" "credential-bearing URL" 'coven_access_token=[^&"[:space:]]+'
  check_text "$file" "private endpoint" 'https://(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)|https://[A-Za-z0-9.-]+\.ts\.net([/:?]|$)'
  check_linked "$file" "prohibited telemetry or persistence" '(^|[^[:alnum:]_])(CoreData|SwiftData|NSPersistent[A-Za-z]*|Firebase[A-Za-z]*|Sentry|Crashlytics|AppCenter)([^[:alnum:]_]|$)'
  check_text "$file" "prohibited entitlement or transport override" '(^|[^[:alnum:]_])(NSAllowsArbitraryLoads|UIBackgroundModes)([^[:alnum:]_]|$)'
  check_text "$file" "persistent database artifact" '(^|[^[:alnum:]_.-])[A-Za-z0-9._-]+\.(sqlite|sqlite3|db)([^[:alnum:]_]|$)'
  check_text "$file" "personal messaging identifier" 'agent:[a-z0-9_-]+:(telegram|imessage|discord|whatsapp|signal|webchat):|telegram:direct:[0-9]|\+1[0-9]{10}'

  case "$file" in
    */Tests/Fixtures/*) ;;
    *)
      check_text "$file" "memory body outside synthetic fixtures" 'Synthetic (protected )?(content|detail)( only)?\.'
      ;;
  esac
done

if (( failures != 0 )); then
  printf 'iOS privacy scan blocked publishable private data or prohibited capabilities.\n' >&2
  exit 1
fi

printf 'iOS privacy scan passed (%d files).\n' "${#files[@]}"
