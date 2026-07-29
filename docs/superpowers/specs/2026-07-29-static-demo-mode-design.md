# Coven Memory static demo mode

**Status:** Approved

**Date:** 2026-07-29

**Bead:** `cmem-8qg.4.2`

## Goal

Give visitors a safe way to understand Coven Memory without installing a
daemon or exposing genuine local memory:

- `pnpm demo` launches the synthetic experience in one command;
- the public launcher offers an **Open demo** action;
- the demo resembles the real dashboard while remaining unmistakably
  synthetic; and
- the genuine local path remains `coven memory open`.

## Security boundary

The demo is an independent static-export application under `site/`. It has no
server routes, daemon transport, local transport proof, cookies, storage,
telemetry, or runtime access to the genuine dashboard APIs.

The demo must not:

- contact loopback, private-network, MagicDNS, or memory API endpoints;
- import the root application's server or API modules;
- render data loaded from environment variables, files, browser storage, or a
  network request;
- contain genuine memory, local paths, session identifiers, or user data; or
- weaken the genuine dashboard's loopback and process-local transport checks.

All demo records are deterministic, repository-owned fixtures that clearly
describe themselves as fictional examples. A visible **Synthetic demo data**
label remains present throughout the demo.

The root Next application stays the genuine local dashboard. It keeps its
current no-session architecture and continues to obtain memory only through
the custom loopback server and validated daemon gateway.

## User experience

The static launcher has two clear paths:

1. **Open demo** transitions into the synthetic dashboard in the same static
   application.
2. **Open local memory** presents `coven memory open` with a copy action and
   explains that genuine memory opens only on the user's machine.

The demo uses the existing dashboard's information hierarchy—library,
memory index, and reader—without importing private runtime code. Visitors can
search, filter, select entries, move between list and reader on narrow
viewports, and reveal the synthetic protected example.

The launcher and dashboard must both work without JavaScript for essential
content. JavaScript may enhance the transition, filtering, selection, reveal,
and clipboard feedback, but the exported document still explains both paths
and shows synthetic sample content.

## Repository and command shape

`site/` is a separately configured Next static-export application with its own
package boundary. The root package exposes:

```text
pnpm demo
```

That command delegates to the site development command. The site build exports
only static HTML, CSS, JavaScript, fonts, and images.

Vercel is configured with `site/` as the project root. A root-level Vercel
build fails with an actionable message so the genuine dashboard cannot be
accidentally deployed as the public demo.

## Data flow

The static demo data flow is:

```text
repository fixture -> static build -> browser rendering
```

There is no request-time data flow. Interactions operate only on the fixture
already included in the exported assets.

The genuine dashboard data flow remains:

```text
loopback browser -> custom server proof -> validated API route
                 -> local daemon gateway
```

The two flows do not share runtime state or transport code.

## Failure behavior

- If the clipboard API is unavailable, the command remains selectable and the
  UI reports that it should be copied manually.
- If JavaScript is unavailable, both launcher actions and synthetic content
  remain understandable in the exported HTML.
- If the site is built from the repository root instead of `site/`, the build
  fails before deployment.
- If a prohibited endpoint, network target, persistence API, telemetry call,
  dynamic server function, or genuine-data pattern enters site source or
  output, verification fails.

The demo never falls back to the genuine daemon.

## Verification

Implementation follows test-first development. Automated coverage includes:

- the root `pnpm demo` delegation;
- launcher copy behavior and the **Open demo** transition;
- synthetic-data labeling and representative dashboard interactions;
- keyboard and narrow-viewport behavior;
- a successful static export with no dynamic routes;
- source and built-artifact scans for daemon APIs, loopback/private-network
  targets, storage, telemetry, and server-function markers;
- a fail-closed root Vercel configuration check;
- the repository unit, lint, typecheck, build, smoke, and privacy gates.

Final delivery requires a clean feature diff, passing GitHub checks, no
unresolved review threads, and a squash merge to `main`.

## Non-goals

- Reading genuine memory from a hosted page.
- Browser-to-loopback requests.
- A cloud relay or account system.
- Session or launch-token endpoints.
- Editing, promotion, deletion, approval, or supersession mutations.
- Replacing the genuine local dashboard or `coven memory open`.
