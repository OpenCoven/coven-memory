# Standalone Memory Dashboard Design

**Status:** Approved 2026-07-26  
**Bead:** `cmem-8qg`  
**Phase:** 1 - secure read foundation

## 1. Decision

`OpenCoven/coven-memory` will become a local-first, standalone web dashboard for
people to inspect and understand their familiar memory.

This changes the repository role recorded in
`docs/CATCHUP-PLAN-2026-07-24.md` section 9. The earlier "spec/plan/beads only"
statement is superseded for the UI, but its substrate decision remains binding:

- the authoritative Rust memory crate stays in `OpenCoven/coven`;
- the dashboard does not reimplement storage, embedding, indexing, promotion,
  verification, or Ward/weave authority in TypeScript;
- the dashboard consumes daemon APIs through a narrow adapter.

The memory work in `OpenCoven/coven-dashboard` is reference material only. That
repository is an orchestration dashboard, not the user-facing home for this
product.

## 2. Phase 1 scope

Phase 1 delivers the secure read foundation:

- memory overview and health;
- browse and read;
- search and filtering by familiar, source, freshness, and verification;
- redact-by-default handling for sensitive or unclassified content;
- verification, attestation, and supersession visibility when the daemon can
  supply it;
- responsive desktop and narrow-window behavior.

The following are explicitly deferred:

- promotion;
- editing;
- supersession mutations;
- delete and purge;
- approval and veto actions.

Those actions require the M2 promotion contract and the mirrored
promotion-write/weave seam. Phase 1 must not ship controls that imply those
mutations are available.

## 3. Application architecture

The repository hosts a root-level Next.js 16 / React 19 application.

The app imports the tagged `@opencoven/coven-design-system` CSS package for
tokens, foundations, and framework-neutral primitives. It owns only
product-specific layout and React behavior. It does not copy the theme layers
from Coven Cave or coven-dashboard.

The main boundaries are:

1. **Browser UI** - receives normalized dashboard DTOs only.
2. **Next route handlers** - enforce the local session and validate all daemon
   responses.
3. **Server-only `MemoryGateway`** - maps daemon transport DTOs to stable
   dashboard DTOs.
4. **Daemon transport** - Unix socket first, loopback HTTP fallback.
5. **Coven daemon** - resolves paths, reads source content, evaluates
   verification metadata, and remains the sole authority over memory data.

The TypeScript app must never read:

- `archival.sqlite3`;
- the turbovec index;
- the manifest directly;
- memory files by constructing filesystem paths;
- attestation files directly.

## 4. Local runtime and session

The production server binds only to `127.0.0.1`. Wildcard and non-loopback
binds are rejected.

At startup, the launcher creates a cryptographically random, one-time token in
process memory and prints or opens a URL carrying the token in the URL
**fragment** (`/#launch=...`). Fragments are not sent in HTTP requests, so the
token does not enter access logs. The public bootstrap shell reads the fragment,
posts it to the session exchange route, clears the fragment with
`history.replaceState`, and reloads into the authenticated application.

The cookie is:

- `HttpOnly`;
- `SameSite=Strict`;
- `Secure` when the local origin uses HTTPS;
- scoped to the app;
- short-lived and rotated on restart.

The launch token is:

- single-use;
- memory-only;
- never logged after the launch URL is emitted;
- invalidated after exchange or timeout.

Every data route checks the session, `Origin`, and `Host`. Responses use
`Cache-Control: no-store`. The app does not enable permissive CORS.

## 5. Daemon API additions

Phase 1 includes a small companion change in `OpenCoven/coven`. The new reads
are backward-compatible and do not change existing memory write authority.

### 5.1 Existing list

`GET /api/v1/memory`

The existing endpoint remains the summary feed. It may add optional metadata,
but existing fields and consumers remain compatible.

Each entry must include an opaque `id` suitable for the detail endpoint. The
browser must not receive an absolute filesystem path.

### 5.2 Overview

`GET /api/v1/memory/overview`

```json
{
  "generated_at": "2026-07-26T10:00:00Z",
  "totals": {
    "entries": 148,
    "familiars": 4,
    "verified": 126,
    "needs_review": 7,
    "unknown": 15
  },
  "last_updated_at": "2026-07-26T09:56:00Z",
  "capabilities": {
    "detail": true,
    "verification": true,
    "attestation_metadata": true,
    "supersession_history": true,
    "mutations": false
  },
  "verification": {
    "state": "verified",
    "checked_at": "2026-07-26T09:56:00Z",
    "manifest": "current",
    "index": "current",
    "issues": []
  }
}
```

Capability fields prevent the UI from guessing that missing data is empty or
healthy.

### 5.3 Detail

`GET /api/v1/memory/{id}`

```json
{
  "id": "opaque-entry-id",
  "familiar_id": "sage",
  "title": "Architecture decisions",
  "updated_at": "2026-07-26T09:56:00Z",
  "source": {
    "kind": "promotion",
    "label": "Promoted memory"
  },
  "content": "# Architecture decisions\n...",
  "content_format": "markdown",
  "privacy": {
    "classification": null,
    "reveal_required": null,
    "reason": "privacy taxonomy unavailable"
  },
  "verification": {
    "state": "unknown",
    "reason": "verification metadata unavailable"
  },
  "attestation": null,
  "supersession": {
    "supersedes": null,
    "superseded_by": null
  }
}
```

The daemon validates the ID, containment, and source path before reading
content. Unknown privacy is fail-closed in the UI: `null` or unrecognized
classification requires explicit reveal.

Attestation data is metadata only in Phase 1. Raw attestation bodies are not
sent to the browser.

## 6. Dashboard API

The Next server exposes:

- `GET /api/memory/overview`;
- `GET /api/memory`;
- `GET /api/memory/[id]`;
- `POST /api/session/exchange`;
- `POST /api/session/logout`.

All memory routes use the same guard before calling `MemoryGateway`.

Daemon responses are parsed with runtime schemas. Invalid or unexpected
responses fail explicitly; they are never coerced into success-shaped empty
collections.

The browser-facing DTO removes local paths and transport-specific fields. It
uses camelCase and stable enums owned by this application.

## 7. User experience

The approved direction is a browse-first workspace.

### 7.1 Header and overview

A compact header shows:

- Memory;
- daemon connection state;
- last refresh time;
- Refresh.

A collapsible overview strip shows:

- total memories;
- verified count or percentage;
- items needing review;
- source count;
- manifest and index state.

Unavailable capabilities are labeled **Unavailable**, not rendered as zero,
empty, or healthy.

### 7.2 Filters

The persistent toolbar contains:

- `Search memories...`;
- familiar filter;
- source filter;
- verification filter;
- freshness filter.

Search matches title, safe excerpt, familiar label, and source label. It does
not search hidden full content in the browser.

### 7.3 Master list

Each row shows:

- title;
- familiar;
- source;
- relative update time;
- verification state;
- redaction/reveal state.

Selection opens the reader. The list supports loading, true-empty, filtered
empty, partial-error, and retry states.

### 7.4 Reader

The reader shows:

- title and safe metadata;
- rendered/raw modes;
- source and update time;
- verification reason;
- attestation metadata;
- supersession links;
- full content after privacy handling.

Sensitive or unclassified content is hidden by default. Reveal is explicit,
per entry, and reset when the selected entry changes or the session ends.
Color is never the only signal.

### 7.5 Responsive behavior

Wide layouts use a master-detail split. Narrow layouts show the list first,
then the reader with a visible **Back to memories** action.

The overview strip may collapse to preserve reading space. Filters remain
reachable without horizontal scrolling.

## 8. Visual language and accessibility

The app uses `@opencoven/coven-design-system` tokens and primitives directly.

Requirements:

- no hardcoded product colors;
- visible focus states;
- semantic headings and landmarks;
- keyboard-operable list selection and reveal controls;
- state-aware accessible names;
- reduced-motion behavior;
- contrast verified in dark, light, and one non-default product theme;
- loading skeletons shaped like final content;
- actionable error and empty-state copy.

The tier-architecture presentation from coven-dashboard is not the primary
navigation model. Architecture and tier explanations may appear later as
secondary help, not as the first task surface.

## 9. Security and privacy

- Browser DTOs contain opaque IDs, never local paths.
- Memory content, excerpts, launch tokens, cookies, and local paths are never
  written to logs.
- CSP allows only local application resources.
- No remote fonts, scripts, telemetry, analytics, or third-party error
  reporting ship in Phase 1.
- Unknown privacy classifications require reveal.
- Unknown verification is shown as unknown.
- Route handlers reject foreign origins, invalid sessions, unsupported
  methods, oversized inputs, and invalid daemon data.
- The existing repository privacy guard remains mandatory for source, docs,
  fixtures, tests, commit messages, and beads.
- Test fixtures use synthetic memory only.

## 10. Failure behavior

- Daemon unavailable: **Couldn't connect to Coven memory** with **Retry**.
- List unavailable: list error state, never a convincing empty list.
- Detail unavailable: reader error state; list remains usable.
- Verification unsupported: **Verification unavailable**.
- Partial metadata: render known fields and label missing capabilities.
- Session expired: clear private UI state and return to the local launch
  screen.
- Invalid daemon payload: fail the request and expose a safe diagnostic code,
  not raw response content.

## 11. Test strategy

### Daemon

- overview route contract;
- detail route contract;
- opaque ID validation;
- path containment and symlink rejection;
- missing/deleted entry behavior;
- capability reporting;
- no absolute paths in serialized responses;
- unknown privacy and verification behavior.

### Next server

- one-time token exchange;
- token replay rejection;
- session expiry;
- foreign Origin and Host rejection;
- all memory routes reject unauthenticated requests;
- runtime schema validation;
- no-store and security headers;
- daemon Unix-socket and loopback fallback behavior.

### UI

- overview capability states;
- search and each filter;
- master-list selection;
- reader loading/error/content modes;
- redact-by-default and reveal reset;
- narrow-layout list/reader navigation;
- keyboard and accessible-name behavior;
- no-data versus request-failure distinction.

### Integration

A fake daemon provides deterministic synthetic fixtures for an end-to-end
smoke test covering launch-token exchange, overview, filter, selection, reveal,
and logout.

## 12. Migration and issue tracking

- `cmem-8qg` owns the standalone dashboard.
- `cmem-8ta` is superseded as an implementation destination; useful read-seam
  findings move into `cmem-8qg`.
- `cmem-uiu` remains a real coven-dashboard security issue until that
  repository's exposed route is fixed or removed.
- No UI code is copied wholesale from coven-dashboard. Interaction ideas may
  be reimplemented against this design and the shared design system.

## 13. Completion criteria

Phase 1 is complete when:

1. the app starts locally on loopback and establishes the local session;
2. all memory APIs are session-gated;
3. the dashboard renders real daemon data;
4. users can search, filter, select, and read;
5. sensitive or unknown content is hidden until explicitly revealed;
6. verification gaps are represented honestly;
7. the app passes targeted daemon, server, component, accessibility, and
   integration tests;
8. documentation no longer describes this repository as spec/PM-only.

## 14. Implementation

- Daemon API: `OpenCoven/coven` branch `feature/memory-dashboard-api`, tracked
  by `cmem-8qg.1` and landing work `cmem-8qg.3`.
- Dashboard UI: this repository's `feature/memory-dashboard` branch, tracked
  by `cmem-8qg.2`.
- Parent delivery record: `cmem-8qg`.
- Dashboard validation: `pnpm check` and
  `./scripts/guard-scan.sh --beads`.
- Daemon validation: `cargo fmt --all -- --check`,
  `cargo clippy --workspace --all-targets -- -D warnings`, and
  `cargo test --workspace --locked`.
