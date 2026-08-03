#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCANNER="$ROOT/scripts/check-ios-privacy.sh"
FIXTURE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/coven-ios-privacy.XXXXXX")"
trap 'rm -rf "$FIXTURE_ROOT"' EXIT

expect_pass() {
  local name="$1"
  local content="$2"
  local path="$FIXTURE_ROOT/$name"
  mkdir -p "$(dirname "$path")"
  printf '%s\n' "$content" > "$path"
  "$SCANNER" "$path" >/dev/null
}

expect_fail() {
  local name="$1"
  local content="$2"
  local expected="$3"
  local path="$FIXTURE_ROOT/$name"
  mkdir -p "$(dirname "$path")"
  printf '%s\n' "$content" > "$path"
  if output="$($SCANNER "$path" 2>&1)"; then
    printf 'expected privacy rejection for %s\n' "$name" >&2
    exit 1
  fi
  grep -F "$expected" <<<"$output" >/dev/null
}

expect_test_bundle_ignored() {
  local app="$FIXTURE_ROOT/CovenMemory.app"
  local fixture="$app/PlugIns/CovenMemoryTests.xctest/detail.json"
  mkdir -p "$(dirname "$fixture")"
  printf '%s\n' '<plist><dict></dict></plist>' > "$app/Info.plist"
  printf '%s\n' '{"content":"Synthetic protected content only."}' > "$fixture"
  "$SCANNER" "$app" >/dev/null
}

expect_pass "safe.txt" "Synthetic fixture metadata only."
expect_pass "Info.plist" '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
expect_pass "Tests/Fixtures/detail.json" '{"content":"Synthetic protected content only."}'
expect_test_bundle_ignored

expect_fail "home-path.txt" "/Users/private-user/.coven/workspaces/familiar" "absolute home path" # gitleaks:allow — synthetic scanner fixture
expect_fail "runtime-path.txt" "~/.coven/credentials/mobile.json" "runtime-internal path" # gitleaks:allow — synthetic scanner fixture
expect_fail "pairing-url.txt" "coven-memory://pair?nonce=not-a-real-value" "pairing URL"
expect_fail "mobile-invite.txt" "https://private.example/?coven_access_token=not-a-real-value" "credential-bearing URL"
expect_fail "framework.txt" "FirebaseCrashlytics" "prohibited telemetry or persistence"
expect_fail "background.plist" "<key>UIBackgroundModes</key>" "prohibited entitlement or transport override"
expect_fail "database.txt" "private-memory.sqlite" "persistent database artifact"
expect_fail "Screenshots/reader.txt" "Synthetic protected content only." "memory body outside synthetic fixtures"

printf 'check-ios-privacy tests passed\n'
