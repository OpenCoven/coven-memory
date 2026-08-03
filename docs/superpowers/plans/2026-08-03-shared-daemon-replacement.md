# Shared Daemon Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade and restart the installed Coven daemon, prove the dashboard reads the Phase 1 memory contract through the default socket, and remove the orphaned prepublish daemon safely.

**Architecture:** Treat the supported `coven daemon` lifecycle commands as the only authority for the shared service. Verify the daemon at its Unix-socket boundary before launching the packaged dashboard, and remove the unrelated orphan only after the replacement path is healthy.

**Tech Stack:** Coven CLI 0.2.3, npm global packages, Unix-domain HTTP socket, curl, Node.js 24, Playwright-compatible dashboard HTTP routes.

---

### Task 1: Capture the migration baseline

**Files:**
- Reference: `docs/superpowers/specs/2026-08-03-shared-daemon-replacement-design.md`

- [ ] **Step 1: Record the shared daemon PID and socket**

Run:

```bash
set -euo pipefail
coven daemon status
lsof -nU 2>/dev/null | grep "$HOME/.coven/coven.sock"
```

Expected: the command reports a running daemon and exactly one process owns
`~/.coven/coven.sock`.

- [ ] **Step 2: Record the orphan by exact executable path**

Run:

```bash
set -euo pipefail
ps -axo pid=,ppid=,command= |
  grep '/private/var/folders/.*/coven-prepublish-.*/@opencoven/cli-macos/bin/coven daemon serve' |
  grep -v grep
```

Expected: one detached process whose executable path contains
`coven-prepublish-`. Save its numeric PID as `ORPHAN_PID`.

- [ ] **Step 3: Prove the current API boundary before changing it**

Run:

```bash
set -euo pipefail
curl --fail --silent --show-error --max-time 5 \
  --unix-socket "$HOME/.coven/coven.sock" \
  http://localhost/api/v1/memory/overview |
  node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      const value = JSON.parse(input);
      if (!value.capabilities || typeof value.totals?.entries !== "number") {
        process.exit(1);
      }
      console.log(JSON.stringify({
        entries: value.totals.entries,
        capabilities: value.capabilities
      }));
    });
  '
```

Expected: exit 0 with entry count and the Phase 1 capability object. The
command must not print memory content.

### Task 2: Upgrade and restart the shared daemon

**Files:**
- Modify outside repository: global npm installation under the active npm prefix

- [ ] **Step 1: Upgrade the coordinated CLI package**

Run against the prefix that owns `command -v coven`:

```bash
set -euo pipefail
test "$(command -v coven)" = "$HOME/.local/bin/coven"
npm install --global --prefix "$HOME/.local" @opencoven/cli@0.2.3
```

Expected: npm exits 0 and installs the CLI plus its optional dashboard
companion.

- [ ] **Step 2: Verify the installed package and companion**

Run:

```bash
set -euo pipefail
coven --version
node -e '
  const { createRequire } = require("node:module");
  const cliRoot = process.env.HOME + "/.local/lib/node_modules/@opencoven/cli";
  const cli = require(cliRoot + "/package.json");
  if (cli.version !== "0.2.3") process.exit(1);
  const requireFromCli = createRequire(cliRoot + "/bin/coven.js");
  console.log(requireFromCli.resolve("@opencoven/coven-memory-dashboard/bin/coven-memory-dashboard.mjs"));
'
```

Expected: the package metadata reports 0.2.3, the native command reports the
coordinated `0.2.3-recovery.2` build, and Node prints the installed dashboard
entry path.

- [ ] **Step 3: Restart through the supported lifecycle command**

Run:

```bash
set -euo pipefail
BASELINE_PID="$(
  coven daemon status |
    sed -n 's/.*pid \([0-9][0-9]*\).*/\1/p'
)"
test -n "$BASELINE_PID"
coven daemon restart
NEW_PID="$(
  coven daemon status |
    sed -n 's/.*pid \([0-9][0-9]*\).*/\1/p'
)"
test -n "$NEW_PID"
test "$NEW_PID" != "$BASELINE_PID"
printf 'daemon pid changed: %s -> %s\n' "$BASELINE_PID" "$NEW_PID"
```

Expected: restart succeeds, status is running, and the reported PID differs
from the baseline PID.

- [ ] **Step 4: Recover explicitly if restart fails**

Run this step only if Step 3 fails:

```bash
set -euo pipefail
coven daemon start
coven daemon status
```

Expected: the default socket is restored before any orphan cleanup occurs.

### Task 3: Verify the complete daemon contract

**Files:**
- Reference: `src/server/memory-contract.ts`
- Reference: `src/server/memory-gateway.ts`

- [ ] **Step 1: Verify overview**

Run:

```bash
set -euo pipefail
curl --fail --silent --show-error --max-time 5 \
  --unix-socket "$HOME/.coven/coven.sock" \
  http://localhost/api/v1/memory/overview |
  node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      const value = JSON.parse(input);
      const required = ["detail", "verification", "attestation_metadata", "supersession_history", "mutations"];
      if (!required.every(key => typeof value.capabilities?.[key] === "boolean")) process.exit(1);
      console.log("overview contract: ok");
    });
  '
```

Expected: `overview contract: ok`.

- [ ] **Step 2: Verify list metadata and capture one opaque ID**

Run:

```bash
set -euo pipefail
MEMORY_ID="$(
  curl --fail --silent --show-error --max-time 5 \
    --unix-socket "$HOME/.coven/coven.sock" \
    http://localhost/api/v1/memory |
    node -e '
      let input = "";
      process.stdin.on("data", chunk => input += chunk);
      process.stdin.on("end", () => {
        const rows = JSON.parse(input);
        const row = rows[0];
        if (!row || !row.id || !row.source ||
            !Object.hasOwn(row, "privacy_classification") ||
            !Object.hasOwn(row, "reveal_required") ||
            !Object.hasOwn(row, "verification_state")) process.exit(1);
        process.stdout.write(row.id);
      });
    '
)"
test -n "$MEMORY_ID"
printf 'opaque memory id captured\n'
```

Expected: `opaque memory id captured`. Do not print the ID into durable notes.

- [ ] **Step 3: Verify detail without printing private content**

Run in the same shell as Step 2:

```bash
set -euo pipefail
curl --fail --silent --show-error --max-time 5 \
  --unix-socket "$HOME/.coven/coven.sock" \
  "http://localhost/api/v1/memory/$MEMORY_ID" |
  node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      const value = JSON.parse(input);
      if (typeof value.content !== "string" ||
          value.content_format !== "markdown" ||
          !value.source || !value.privacy ||
          !value.verification || !value.supersession) process.exit(1);
      console.log(JSON.stringify({
        detail: "ok",
        content_bytes: Buffer.byteLength(value.content)
      }));
    });
  '
```

Expected: exit 0 with only the content byte count, never the content.

### Task 4: Verify the packaged dashboard against the default socket

**Files:**
- Reference: `src/app/api/memory/route.ts`
- Reference: `src/app/api/memory/overview/route.ts`
- Reference: `bin/coven-memory-dashboard.mjs`

- [ ] **Step 1: Launch the packaged dashboard**

Run:

```bash
set -euo pipefail
DASHBOARD_LOG="$(mktemp -t coven-memory-dashboard.XXXXXX)"
COVEN_MEMORY_NO_BROWSER=1 NO_COLOR=1 coven memory open >"$DASHBOARD_LOG" 2>&1 &
DASHBOARD_PID=$!
cleanup_dashboard() {
  if kill -0 "$DASHBOARD_PID" 2>/dev/null; then
    kill "$DASHBOARD_PID"
    wait "$DASHBOARD_PID" 2>/dev/null || true
  fi
  rm -f "$DASHBOARD_LOG"
}
trap cleanup_dashboard EXIT
for attempt in $(seq 1 30); do
  DASHBOARD_URL="$(
    sed -n 's/^Coven Memory: \(http:\/\/[^[:space:]]*\)$/\1/p' "$DASHBOARD_LOG" |
      tail -1
  )"
  test -n "$DASHBOARD_URL" && break
  kill -0 "$DASHBOARD_PID" 2>/dev/null || {
    cat "$DASHBOARD_LOG"
    exit 1
  }
  sleep 1
done
test -n "$DASHBOARD_URL"
DASHBOARD_ORIGIN="${DASHBOARD_URL%/}"
```

Expected: the command prints a loopback dashboard URL and starts the packaged
dashboard. `DASHBOARD_PID`, `DASHBOARD_URL`, and `DASHBOARD_ORIGIN` remain
available in the current shell.

- [ ] **Step 2: Verify the dashboard page and browser-facing memory routes**

Run in the same shell as Step 1 against the printed loopback origin:

```bash
set -euo pipefail
fetch_json_200() {
  local url="$1"
  local output
  local status
  output="$(
    curl --silent --show-error --max-time 10 \
      -H "Origin: $DASHBOARD_ORIGIN" \
      --write-out $'\n%{http_code}' \
      "$url"
  )"
  status="${output##*$'\n'}"
  test "$status" = "200"
  printf '%s' "${output%$'\n'*}"
}

test "$(
  curl --silent --show-error --max-time 10 \
    --output /dev/null \
    --write-out '%{http_code}' \
    "$DASHBOARD_ORIGIN/"
)" = "200"
fetch_json_200 "$DASHBOARD_ORIGIN/api/memory/overview" |
  node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      const value = JSON.parse(input);
      if (value.ok !== true || !value.data?.capabilities ||
          typeof value.data?.totals?.entries !== "number") process.exit(1);
      console.log("dashboard overview: ok");
    });
  '
DASHBOARD_MEMORY_ID="$(
  fetch_json_200 "$DASHBOARD_ORIGIN/api/memory" |
    node -e '
      let input = "";
      process.stdin.on("data", chunk => input += chunk);
      process.stdin.on("end", () => {
        const value = JSON.parse(input);
        const row = value.data?.[0];
        if (value.ok !== true || !row?.id || !row?.source ||
            !row?.privacy || !row?.verification) process.exit(1);
        process.stdout.write(row.id);
      });
    '
)"
test -n "$DASHBOARD_MEMORY_ID"
fetch_json_200 "$DASHBOARD_ORIGIN/api/memory/$DASHBOARD_MEMORY_ID" |
  node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      const value = JSON.parse(input);
      if (value.ok !== true || typeof value.data?.content !== "string" ||
          !value.data?.source || !value.data?.privacy ||
          !value.data?.verification) process.exit(1);
      console.log(JSON.stringify({
        dashboard_detail: "ok",
        content_bytes: Buffer.byteLength(value.data.content)
      }));
    });
  '
```

Expected: root returns HTTP 200, overview prints `dashboard overview: ok`, and
detail prints only its byte count. If the process-local transport proof
prevents a raw curl route call, verify the same requests through the launched
browser journey instead; do not weaken the proof requirement.

- [ ] **Step 3: Stop only the disposable dashboard process**

Run in the same shell as Steps 1 and 2:

```bash
set -euo pipefail
kill "$DASHBOARD_PID"
wait "$DASHBOARD_PID" 2>/dev/null || true
rm -f "$DASHBOARD_LOG"
trap - EXIT
```

Expected: the dashboard exits while `coven daemon status` remains healthy.

### Task 5: Remove the orphan and close the migration

**Files:**
- Modify: Bead `cmem-pem`

- [ ] **Step 1: Reconfirm the orphan identity immediately before termination**

Run:

```bash
set -euo pipefail
CANDIDATES="$(
  ps -axo pid=,ppid=,command= |
    grep '/private/var/folders/.*/coven-prepublish-.*/@opencoven/cli-macos/bin/coven daemon serve' |
    grep -v grep
)"
test "$(printf '%s\n' "$CANDIDATES" | sed '/^$/d' | wc -l | tr -d ' ')" = "1"
ORPHAN_PID="$(printf '%s\n' "$CANDIDATES" | awk '{print $1}')"
ps -ww -p "$ORPHAN_PID" -o pid=,ppid=,command=
```

Expected: PPID is 1 and the executable path still contains
`coven-prepublish-`. This is a preview only; the termination step repeats and
enforces every identity check immediately before sending a signal.

- [ ] **Step 2: Terminate the exact orphan PID**

Run:

```bash
set -euo pipefail
CANDIDATES="$(
  ps -axo pid=,ppid=,command= |
    grep '/private/var/folders/.*/coven-prepublish-.*/@opencoven/cli-macos/bin/coven daemon serve' |
    grep -v grep
)"
test "$(printf '%s\n' "$CANDIDATES" | sed '/^$/d' | wc -l | tr -d ' ')" = "1"
ORPHAN_PID="$(printf '%s\n' "$CANDIDATES" | awk '{print $1}')"
IDENTITY="$(ps -ww -p "$ORPHAN_PID" -o pid=,ppid=,command=)"
PID="$(printf '%s\n' "$IDENTITY" | awk '{print $1}')"
PPID_VALUE="$(printf '%s\n' "$IDENTITY" | awk '{print $2}')"
ORPHAN_EXE="$(
  printf '%s\n' "$IDENTITY" |
    sed -E 's/^ *[0-9]+ +[0-9]+ +([^ ]+) daemon serve$/\1/'
)"
ORPHAN_ROOT="${ORPHAN_EXE%%/node_modules/*}"

test "$PID" = "$ORPHAN_PID"
test "$PPID_VALUE" = "1"
case "$ORPHAN_EXE" in
  /private/var/folders/*/T/coven-prepublish-*/node_modules/@opencoven/cli-macos/bin/coven)
    ;;
  *)
    echo "refusing to terminate an unexpected executable: $ORPHAN_EXE" >&2
    exit 1
    ;;
esac
test "$ORPHAN_ROOT" != "$ORPHAN_EXE"
test ! -e "$ORPHAN_ROOT"
SOCKET_OWNERS="$(lsof -nU)"
if printf '%s\n' "$SOCKET_OWNERS" |
  awk -v pid="$ORPHAN_PID" -v socket="$HOME/.coven/coven.sock" \
    '$2 == pid && index($0, socket) { found=1 }
     END { exit found ? 0 : 1 }'
then
  echo "refusing: candidate owns the default Coven socket" >&2
  exit 1
fi

IDENTITY_AFTER_SOCKET_CHECK="$(
  ps -ww -p "$ORPHAN_PID" -o pid=,ppid=,command=
)"
test "$IDENTITY_AFTER_SOCKET_CHECK" = "$IDENTITY"
kill "$ORPHAN_PID"
for attempt in 1 2 3 4 5; do
  kill -0 "$ORPHAN_PID" 2>/dev/null || break
  sleep 1
done
! kill -0 "$ORPHAN_PID" 2>/dev/null
```

Expected: the command aborts unless the candidate is a PPID-1 process from a
deleted `coven-prepublish-*` root that does not own the default socket. After
those checks, the exact PID no longer exists. Do not use `pkill` or `killall`.

- [ ] **Step 3: Re-run post-cleanup health checks**

Run:

```bash
set -euo pipefail
coven --version
coven daemon status
curl --fail --silent --show-error --max-time 5 \
  --unix-socket "$HOME/.coven/coven.sock" \
  http://localhost/api/v1/memory/overview >/dev/null
```

Expected: the installed CLI package reports 0.2.3, the native command reports
its coordinated recovery build, the shared daemon is running, and overview
returns HTTP 200.

- [ ] **Step 4: Update and close the Bead**

Run:

```bash
set -euo pipefail
bd update cmem-pem --notes "Upgraded the installed Coven CLI to 0.2.3, restarted the shared daemon through the supported lifecycle command, verified Phase 1 overview/list/detail contracts through the default socket, verified the packaged dashboard against the shared daemon, and removed the confirmed orphaned prepublish daemon without exposing memory content."
bd close cmem-pem --reason "Shared daemon and packaged dashboard verified on the default socket; temporary orphan removed safely."
```

Expected: `cmem-pem` is closed.

- [ ] **Step 5: Commit the operational record**

Run:

```bash
set -euo pipefail
git add docs/superpowers/specs/2026-08-03-shared-daemon-replacement-design.md \
  docs/superpowers/plans/2026-08-03-shared-daemon-replacement.md
git commit -m "docs: plan shared daemon replacement" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

Expected: the design and implementation plan are committed without runtime
data or memory content.
