# coven-memory

Local-first dashboard for browsing and reading familiar memory.

The authoritative memory crate, storage, indexing, and path resolution remain
in `OpenCoven/coven`. This app talks to the Coven daemon through validated,
read-only APIs; it never opens memory files or databases itself.

## Phase 1

The current dashboard provides:

- overview and daemon health;
- search and filters for familiar, source, verification, and freshness;
- keyboard-operable browse/read navigation;
- rendered and raw Markdown views;
- fail-closed privacy reveal for sensitive, unknown, or unclassified content;
- honest unavailable states for verification, attestation, and supersession.

Promotion, editing, deletion, approval, and supersession mutations are
intentionally absent until their authority contracts are available.

## Requirements

- Node.js 24 or newer
- pnpm 10
- a Coven daemon that exposes the Phase 1 memory reads

## Development

```bash
pnpm install
pnpm dev
```

The custom server binds to `127.0.0.1:3737` by default and prints one launch URL.
Open that URL as printed. Its fragment contains a short-lived, one-time token;
the browser removes the fragment before exchanging it for an HttpOnly local
session.

For deterministic synthetic data:

```bash
# Terminal 1
pnpm fake-daemon

# Terminal 2
COVEN_DAEMON_URL=http://127.0.0.1:43117 pnpm dev
```

The fake daemon is loopback-only and contains no real memory.

## Production run

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Runtime configuration:

| Variable | Default | Constraint |
|---|---|---|
| `HOST` | `127.0.0.1` | exactly `127.0.0.1` or `::1` |
| `PORT` | `3737` | integer from 1 to 65535 |
| `COVEN_HOME` | the platform Coven home | used server-side to resolve `coven.sock` |
| `COVEN_DAEMON_SOCKET` | `$COVEN_HOME/coven.sock` | absolute Unix-socket path |
| `COVEN_DAEMON_URL` | unset | optional `http://127.0.0.1:<port>` or IPv6 loopback fallback |

The Unix socket is always attempted first. Named hosts, wildcard addresses,
remote addresses, credentials, HTTPS fallback, and fallback base paths are
rejected.

## Verification

```bash
pnpm check
pnpm audit:prod
```

`pnpm check` runs lint, TypeScript, unit/component/integration tests, the
production build, a local fake-daemon session/API smoke, and the repository
privacy guard. `pnpm audit:prod` checks the production dependency graph for
high-severity advisories. Browser smoke artifacts belong under ignored
`output/playwright/`; only deterministic synthetic fixtures may be used.

Task state is tracked in Beads:

```bash
bd ready
bd show cmem-8qg
```

See
[`docs/superpowers/specs/2026-07-26-standalone-memory-dashboard-design.md`](docs/superpowers/specs/2026-07-26-standalone-memory-dashboard-design.md)
for the approved architecture and [`SECURITY.md`](SECURITY.md) for the privacy
boundary.
