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
coven daemon status
lsof -nU 2>/dev/null | grep "$HOME/.coven/coven.sock"
```

Expected: the command reports a running daemon and exactly one process owns
`~/.coven/coven.sock`.

- [ ] **Step 2: Record the orphan by exact executable path**

Run:

```bash
ps -axo pid=,ppid=,command= |
  grep '/private/var/folders/.*/coven-prepublish-.*/@opencoven/cli-macos/bin/coven daemon serve' |
  grep -v grep
```

Expected: one detached process whose executable path contains
`coven-prepublish-`. Save its numeric PID as `ORPHAN_PID`.

- [ ] **Step 3: Prove the current API boundary before changing it**

Run:

```bash
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

Run:

```bash
npm install --global @opencoven/cli@0.2.3
```

Expected: npm exits 0 and installs the CLI plus its optional dashboard
companion.

- [ ] **Step 2: Verify the installed package and companion**

Run:

```bash
coven --version
node -e "
  const { createRequire } = require('node:module');
  const requireFromCli = createRequire('$HOME/.local/lib/node_modules/@opencoven/cli/bin/coven.js');
  console.log(requireFromCli.resolve('@opencoven/coven-memory-dashboard/bin/coven-memory-dashboard.mjs'));
"
```

Expected: Coven reports 0.2.3 and Node prints the installed dashboard entry
path.

- [ ] **Step 3: Restart through the supported lifecycle command**

Run:

```bash
coven daemon restart
coven daemon status
```

Expected: restart succeeds, status is running, and the reported PID differs
from the baseline PID.

- [ ] **Step 4: Recover explicitly if restart fails**

Run this step only if Step 3 fails:

```bash
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
DASHBOARD_LOG="$(mktemp -t coven-memory-dashboard.XXXXXX)"
COVEN_MEMORY_NO_BROWSER=1 NO_COLOR=1 coven memory open >"$DASHBOARD_LOG" 2>&1 &
DASHBOARD_PID=$!
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

Run against the printed loopback origin:

```bash
curl --fail --silent --show-error --max-time 10 "$DASHBOARD_URL/" >/dev/null
curl --fail --silent --show-error --max-time 10 \
  -H "Origin: $DASHBOARD_ORIGIN" \
  "$DASHBOARD_URL/api/memory/overview" |
  node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      const value = JSON.parse(input);
      if (!value.capabilities || typeof value.totals?.entries !== "number") process.exit(1);
      console.log("dashboard overview: ok");
    });
  '
```

Expected: root returns HTTP 200 and the route prints
`dashboard overview: ok`. If the process-local transport proof prevents a raw
curl route call, verify the same request through the launched browser journey
instead; do not weaken the proof requirement.

- [ ] **Step 3: Stop only the disposable dashboard process**

Use the PID printed or recorded by the launcher:

```bash
kill "$DASHBOARD_PID"
wait "$DASHBOARD_PID" 2>/dev/null || true
rm -f "$DASHBOARD_LOG"
```

Expected: the dashboard exits while `coven daemon status` remains healthy.

### Task 5: Remove the orphan and close the migration

**Files:**
- Modify: Bead `cmem-pem`

- [ ] **Step 1: Reconfirm the orphan identity immediately before termination**

Run:

```bash
ps -ww -p "$ORPHAN_PID" -o pid=,ppid=,command=
```

Expected: PPID is 1 and the executable path still contains
`coven-prepublish-`. If either condition differs, stop without terminating it.

- [ ] **Step 2: Terminate the exact orphan PID**

Run:

```bash
kill "$ORPHAN_PID"
for attempt in 1 2 3 4 5; do
  kill -0 "$ORPHAN_PID" 2>/dev/null || break
  sleep 1
done
! kill -0 "$ORPHAN_PID" 2>/dev/null
```

Expected: the exact PID no longer exists. Do not use `pkill` or `killall`.

- [ ] **Step 3: Re-run post-cleanup health checks**

Run:

```bash
coven --version
coven daemon status
curl --fail --silent --show-error --max-time 5 \
  --unix-socket "$HOME/.coven/coven.sock" \
  http://localhost/api/v1/memory/overview >/dev/null
```

Expected: Coven reports 0.2.3, the shared daemon is running, and overview
returns HTTP 200.

- [ ] **Step 4: Update and close the Bead**

Run:

```bash
bd update cmem-pem --notes "Upgraded the installed Coven CLI to 0.2.3, restarted the shared daemon through the supported lifecycle command, verified Phase 1 overview/list/detail contracts through the default socket, verified the packaged dashboard against the shared daemon, and removed the confirmed orphaned prepublish daemon without exposing memory content."
bd close cmem-pem --reason "Shared daemon and packaged dashboard verified on the default socket; temporary orphan removed safely."
```

Expected: `cmem-pem` is closed.

- [ ] **Step 5: Commit the operational record**

Run:

```bash
git add docs/superpowers/specs/2026-08-03-shared-daemon-replacement-design.md \
  docs/superpowers/plans/2026-08-03-shared-daemon-replacement.md
git commit -m "docs: plan shared daemon replacement" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

Expected: the design and implementation plan are committed without runtime
data or memory content.
