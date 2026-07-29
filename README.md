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

## Install and launch

Install the local dashboard executable from npm:

```bash
npm install -g @opencoven/coven-memory-dashboard
coven-memory-dashboard
```

The executable starts the packaged production server, validates the emitted
bare loopback URL, opens it with a shell-free platform browser command, and
stays attached to the server process. When the dashboard is installed as the
optional companion to the Coven npm CLI, `coven memory open` launches the same
entrypoint.

The npm artifact contains the application build and runtime code only. It
contains no memory, daemon credential, launch token, or machine-specific build
root. Genuine data is requested at runtime from the local Coven daemon and
never becomes part of the package.

## Development

```bash
pnpm install
pnpm dev
```

The custom server binds to `127.0.0.1:3737` by default and prints a plain local
URL. Open that URL directly. There is no launch token, cookie, expiry timer, or
lock screen: the loopback-only server is the trust boundary.

For deterministic synthetic data:

```bash
# Terminal 1
pnpm fake-daemon

# Terminal 2
COVEN_DAEMON_URL=http://127.0.0.1:43117 pnpm dev
```

The fake daemon is loopback-only and contains no real memory.

## Static demo

Launch the public, synthetic-only experience in one command:

```bash
pnpm demo
```

Choose **Open demo** to browse deterministic fictional memories, or copy
`coven memory open` to launch genuine memory beside your local daemon. The
static demo has no server routes, daemon connection, browser persistence, or
telemetry. It never falls back to genuine memory.

Verify the exported demo boundary with:

```bash
pnpm test:demo
pnpm demo:check
```

The Vercel project must use `site/` as its Root Directory. Root-level Vercel
builds fail closed so the genuine local dashboard cannot be deployed in place
of the static demo.

## Genuine local data and Tailscale

Each dashboard process reads only the Coven daemon on that same machine. The
custom server strips any caller-supplied transport credential and injects its
own process-local proof only for an exact loopback socket peer. Memory routes
also require a matching loopback or Tailscale MagicDNS Host and same-origin
Origin.

To view one machine from its tailnet, configure Tailscale Serve separately to
proxy that machine's MagicDNS HTTPS name to `http://127.0.0.1:3737`. The app
does not create, replace, or remove Tailscale Serve configuration. Every person
runs their own local dashboard and daemon, so one machine cannot select or
cross over into another person's memory store through a shared app account.

## Vercel and other stock Next.js hosts

A Vercel deployment is fail-closed for memory data. Stock Next.js hosting does
not run this repository's custom loopback server, cannot inject its
process-local proof, and cannot reach a viewer's local Coven daemon. Therefore
`/api/memory*` returns `403 invalid_transport`; deploying the UI does not upload,
relay, or expose genuine local memory.

Vercel is suitable for a synthetic UI preview, not for viewing each visitor's
local daemon. Genuine data requires each viewer's own local custom-server
process, optionally reached through that viewer's tailnet.

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
production build, a local fake-daemon transport/API smoke, and the repository
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
for the original dashboard architecture,
[`docs/tailscale-local-transport-design.md`](docs/tailscale-local-transport-design.md)
for the current local/Tailscale transport amendment, and
[`SECURITY.md`](SECURITY.md) for the privacy boundary.
