# Tailscale Local-Transport Access

**Date:** 2026-07-26  
**Status:** Approved design; implementation pending

## 1. Goal

Keep Coven Memory continuously available when it is reached through the local
machine or Tailscale Serve. Remove the expiring launch-token session and its
lock screen because the dashboard and authoritative daemon already run only on
the same machine.

This change must not turn the dashboard into a general network service. The
custom server remains loopback-only, and memory APIs remain unavailable when
the request did not pass through that server.

## 2. Decisions

1. The custom Coven Memory server is the trust boundary.
2. The server continues to bind only to explicit IPv4 or IPv6 loopback.
3. Requests accepted by that loopback listener receive an unguessable,
   process-local transport proof after any client-supplied proof header is
   removed.
4. Memory routes require the transport proof plus a valid same-origin
   `Host`/`Origin` pair.
5. Valid hosts are explicit loopback hosts and syntactically valid Tailscale
   MagicDNS hosts ending in `.ts.net`.
6. Launch tokens, session cookies, session expiry, logout, and the lock screen
   are removed.
7. Tailscale Serve configuration remains operator-owned. This feature does not
   overwrite an existing Serve mapping.
8. The daemon transport stays Unix-socket-first with explicit loopback HTTP as
   its test and development fallback.
9. Memory APIs remain read-only, non-cacheable, and schema-validated. The
   per-memory reveal control remains fail-closed.

## 3. Rejected approaches

### Permanent or renewable browser session

This retains cookies, expiry handling, restoration races, and a lock state
without adding a meaningful boundary once the server is loopback-only. Cookie
loss would also reintroduce the behavior this change is intended to remove.

### Tailscale identity-header authorization

Tailscale Serve identity headers are useful for multi-user authorization, but
the requested model trusts the local running daemon rather than individual
tailnet identities. Tailnet access policy remains the operator's remote access
control.

### Direct bind to a Tailscale IP or wildcard interface

This expands the listener beyond loopback and makes correct proxy and peer
classification part of the application. Tailscale Serve already provides the
tailnet-to-loopback bridge, so the added exposure is unnecessary.

## 4. Architecture

### 4.1 Local transport authority

A focused server module owns a randomly generated transport proof for the
current process. It provides two operations:

- prepare an accepted Node request by deleting every inbound
  `x-coven-local-transport` value and replacing it with the current proof;
- validate the proof presented to a Next route handler using a
  length-checked constant-time comparison.

The proof is never printed, serialized, returned to the browser, persisted, or
accepted from an environment variable.

The custom HTTP server injects the proof only after confirming that
`request.socket.remoteAddress` is an explicit loopback address. A non-loopback
peer is rejected before Next handles the request. This check is defense in
depth; the listener itself still refuses non-loopback bind addresses.

On Vercel or any deployment that runs Next without `server.ts`, no component
injects the proof. Client-supplied copies fail validation, so memory routes
remain closed even if a caller spoofs Tailscale or forwarding headers.

### 4.2 Host and origin validation

After transport validation, route guards accept:

- `127.0.0.1` with an optional port;
- `[::1]` with an optional port;
- a valid DNS name ending in `.ts.net`, with an optional port.

Host parsing remains strict: credentials, malformed ports, wildcard hosts,
plain `localhost`, private-LAN addresses, and suffix tricks such as
`node.ts.net.example.com` are rejected.

If `Origin` is present, it must exactly match the validated request host and
scheme. Tailscale Serve's HTTPS origin is accepted only for a trusted local
transport request. A forwarded scheme or Tailscale identity header never
creates trust by itself.

### 4.3 UI and API lifecycle

`HomePage` renders `MemoryDashboard` directly. The dashboard performs its
normal overview and list requests immediately and never mounts a launch,
checking, expired, or locked shell.

The following session-only surfaces are removed:

- `LaunchGate` and its React context;
- `/api/session/exchange`;
- `/api/session/status`;
- `/api/session/logout`;
- launch-token and session stores;
- the dashboard logout menu;
- URL fragments containing launch tokens.

Memory route handlers replace session validation with local-transport
validation. A rejected transport or host returns a non-cacheable `403`.
Daemon, contract, and not-found errors keep their existing response semantics.

An API rejection becomes a dashboard availability error rather than a lock
transition. Already-rendered private data is still cleared before the error is
shown.

### 4.4 Tailscale Serve

The app prints a plain loopback URL at startup. Operators can point a
Tailscale Serve HTTPS endpoint at that port. Serve remains responsible for
tailnet authentication, ACLs, TLS, and forwarding to loopback.

The repository does not mutate machine-level Serve configuration because an
existing endpoint may serve another application. Development and smoke tests
simulate the proxy boundary with a `.ts.net` Host and matching HTTPS Origin
while connecting to the loopback listener.

## 5. Security invariants

- No wildcard, LAN, or direct Tailscale listener is introduced.
- No forwarded or Tailscale identity header is independently trusted.
- A caller cannot opt into local transport by supplying the internal header.
- Vercel and stock Next servers cannot access the daemon-backed routes.
- Foreign and malformed origins fail before daemon access.
- API and document responses remain `private, no-store`.
- CSP nonce generation and strict production policy remain unchanged.
- The daemon remains authoritative; no memory records are copied into the app.
- Markdown remains inert: no raw HTML execution, remote images, or scripts.
- Protected memory content still requires an explicit per-entry reveal.

## 6. Error handling

- Non-loopback socket peer: terminate with `403` before Next routing.
- Missing or invalid transport proof: `403 invalid_transport`.
- Invalid host: `403 invalid_host`.
- Foreign origin: `403 foreign_origin`.
- Daemon unavailable: `503 memory_unavailable`.
- Invalid daemon payload: `502 invalid_daemon_payload`.

The UI uses the existing retryable error presentation for transport or daemon
failures. It must never describe these failures as an expired session or show
the removed lock screen.

## 7. Test strategy

Implementation follows red-green-refactor.

### Unit tests

- the listener remains loopback-only;
- spoofed proof headers are replaced by the server authority;
- non-loopback peers cannot receive a proof;
- proof comparison rejects missing, malformed, stale, or guessed values;
- exact loopback and valid `.ts.net` hosts pass with a valid proof;
- suffix tricks, LAN hosts, foreign origins, and forwarded-header-only requests
  fail;
- memory routes no longer require cookies;
- the page and dashboard contain no launch, logout, expiry, or lock behavior;
- unauthorized API responses clear private state and surface an availability
  error.

### Integration and browser verification

- smoke starts the fake daemon and custom server, then loads the plain startup
  URL without a fragment or cookie exchange;
- list, overview, detail, reveal, and method guards pass through the injected
  local transport;
- a simulated Tailscale Serve Host/Origin reaches the same read-only data;
- requests sent without the custom server's proof fail closed;
- browser verification keeps CSP, Markdown safety, keyboard, redaction, theme,
  contrast, reduced-motion, and responsive checks while removing session
  lifecycle assertions.

### Completion gates

- `pnpm lint`
- `pnpm typecheck`
- constrained full Vitest suite
- `pnpm build`
- dashboard smoke
- browser verification
- production dependency audit
- privacy guard scan
- `git diff --check`

## 8. Acceptance criteria

1. Opening the loopback startup URL mounts the dashboard without a launch
   fragment, cookie exchange, expiry, or lock screen.
2. Access through a Tailscale Serve `.ts.net` origin stays unlocked.
3. Direct public, Vercel, LAN, malformed-host, and foreign-origin requests
   cannot read memory APIs.
4. Genuine memory remains local to the daemon and never enters tests,
   screenshots, build artifacts, or deployment state.
5. Existing read-only, privacy, CSP, no-store, accessibility, and responsive
   behavior remains verified.
