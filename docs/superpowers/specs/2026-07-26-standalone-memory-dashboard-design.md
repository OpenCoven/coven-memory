# Standalone Memory Dashboard Design

**Status:** Approved 2026-07-26; security and UX hardening approved 2026-07-26

**Beads:** `cmem-8qg`, `cmem-4k9`

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

The session is non-sliding. Session exchange and status responses include a
non-sensitive ISO 8601 `expiresAt` value from the server-side session record.
The browser uses that value only in memory to schedule a fail-closed transition
at expiry; it does not persist session state in local or session storage.

The protected application must not rely on the next API request to discover
expiry. `LaunchGate` unmounts the dashboard and clears its private React state
before revalidating on:

- the expiry timer;
- `pageshow`, including back-forward cache restoration;
- `visibilitychange` when the document becomes visible;
- any authenticated API response with status 401.

Invalid or missing expiry metadata fails closed. Revalidation shows the neutral
session-checking shell until the current server session is confirmed. Document
responses containing the protected shell also use `Cache-Control: no-store`.

## 5. Daemon API additions

Phase 1 includes a small companion change in `OpenCoven/coven`. The new reads
are backward-compatible and do not change existing memory write authority.

### 5.1 Existing list

`GET /api/v1/memory`

The existing endpoint remains the summary feed. It may add optional metadata,
but existing fields and consumers remain compatible.

Each entry must include an opaque `id` suitable for the detail endpoint. The
browser must not receive an absolute filesystem path.

The daemon summary adds the same source object already returned by detail:

```json
{
  "source": {
    "kind": "coven-origin",
    "label": "Coven origin"
  }
}
```

This is an additive response field. The dashboard's wire schema accepts
`source` as optional during compatibility rollout and uses the current
`coven-origin` value only when talking to an older daemon. New daemon responses
must derive summary and detail source values from the same record so the source
facet, list row, and reader cannot disagree. Unknown source kinds remain
visible as daemon-provided labels rather than being coerced into a known kind.

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
- `GET /api/session/status`;
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

The default overview is compact: core counts remain visible while system
checks and explanatory detail live behind a semantic disclosure. Expanding it
must not move keyboard focus or reset list selection.

### 7.2 Filters

The persistent toolbar contains:

- `Search memories...`;
- familiar filter;
- source filter;
- verification filter;
- freshness filter.

Search matches title, safe excerpt, familiar label, and source label. It does
not search hidden full content in the browser.

On narrow layouts, search stays visible and the four facet controls move behind
a **Filters** disclosure with `aria-expanded` and `aria-controls`. Active facet
count and **Clear filters** remain visible when the disclosure is closed. Wide
layouts keep the full toolbar visible without requiring the disclosure.

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

The master list is a semantic resource list (`ul`/`li`) whose rows are buttons,
not an ARIA listbox containing independently tabbable buttons. Exactly one
visible row participates in the Tab order. Arrow keys move the roving focus;
Home and End move to the first and last row; Enter or click selects and opens a
row. `aria-current="true"` identifies the selected resource. Filtering moves
the roving focus to the selected row when it remains visible, otherwise to the
first result.

Selecting the current ID is idempotent: it may open the narrow reader and move
focus, but it must not discard already loaded detail or enter a loading state
that depends on an unchanged-ID effect.

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

Rendered mode uses a maintained Markdown renderer with raw HTML disabled. It
does not install or enable an HTML passthrough plugin. Remote images are not
fetched; image syntax renders as inert descriptive text. Links allow only
`https:`, `http:`, and same-document fragment destinations, open web
destinations in a new browsing context, and set `rel="noopener noreferrer"`.
All other destinations render as text. A leading document heading equal to the
reader title after trimming and whitespace normalization is removed, and
remaining headings are normalized beneath the reader heading so the page
outline stays valid. Lists, blockquotes, inline code, and fenced code render
structurally. Raw mode remains escaped plain text.

The rendered/raw switch uses the design system's segmented-control primitive.
Metadata copy handles singular and plural field counts.

### 7.5 Responsive behavior

Wide layouts use a master-detail split. Narrow layouts show the list first,
then the reader with a visible **Back to memories** action.

The overview strip may collapse to preserve reading space. Filters remain
reachable without horizontal scrolling.

Opening a row on a narrow layout focuses the reader heading. **Back to
memories** restores focus to the selected row. A layout change must not strand
focus in hidden content. The browse surface appears before secondary system
detail in the document and visual order.

## 8. Visual language and accessibility

The app uses `@opencoven/coven-design-system` tokens and primitives directly.

Requirements:

- no hardcoded product colors;
- visible focus states;
- semantic headings and landmarks;
- keyboard-operable list selection and reveal controls;
- state-aware accessible names;
- reduced-motion behavior;
- contrast verified in every theme exported by the pinned design-system
  package, currently dark and light;
- loading skeletons shaped like final content;
- actionable error and empty-state copy.

The pinned design-system package does not currently export a third product
theme. This app must not invent one or duplicate theme tokens locally. A future
theme becomes in scope when it is exported by the shared package, at which point
the same browser and contrast matrix applies.

The provenance spine, compact header, status strip, and master-detail
composition remain the dashboard's product-specific signature. Corrections use
shared tokens and existing primitives directly; they do not replace the
approved visual language or copy Coven Cave's application chrome.

The tier-architecture presentation from coven-dashboard is not the primary
navigation model. Architecture and tier explanations may appear later as
secondary help, not as the first task surface.

## 9. Security and privacy

- Browser DTOs contain opaque IDs, never local paths.
- Memory content, excerpts, launch tokens, cookies, and local paths are never
  written to logs.
- CSP allows only local application resources. A root Next.js `proxy.ts`
  generates a cryptographically random nonce for every document request,
  overwrites any client-supplied nonce header, forwards the nonce to the
  dynamically rendered application, and sets one CSP response header.
- Production `script-src` contains `self`, the nonce, and `strict-dynamic`; it
  contains neither `unsafe-inline` nor `unsafe-eval`. Development may add
  `unsafe-eval` only where Next.js requires it.
- `style-src` contains `self` and the nonce, without `unsafe-inline`.
  `default-src`, `connect-src`, `img-src`, `font-src`, `form-action`, and
  `manifest-src` remain `self`; `base-uri`, `object-src`, `frame-src`,
  `frame-ancestors`, and `media-src` remain `none`; `script-src-attr` remains
  `none`; and `worker-src` remains `self` plus `blob:` for the existing local
  worker requirement.
- The protected root is forced dynamic so Next.js can attach the request nonce
  to framework scripts and styles. Static optimization, ISR, and partial
  prerendering are intentionally unavailable for this local protected shell.
- CSP construction lives in one server-only helper. `next.config.ts` must not
  emit a second CSP header; existing baseline security headers remain.
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
- Session revalidation unavailable: keep private UI unmounted and show a
  retryable local-session error; never restore stale content optimistically.
- Invalid daemon payload: fail the request and expose a safe diagnostic code,
  not raw response content.
- Invalid or unsafe Markdown constructs: render safe text or omit the unsafe
  construct; never fall back to raw HTML.

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
- additive summary-source serialization shared with detail;
- list/detail source agreement.

### Next server

- one-time token exchange;
- token replay rejection;
- session expiry;
- expiry metadata and non-sliding semantics;
- foreign Origin and Host rejection;
- all memory routes reject unauthenticated requests;
- runtime schema validation;
- compatibility parsing for summary source and rejection of malformed source;
- no-store and security headers;
- one nonce per document request;
- production CSP contains no `unsafe-inline` script/style or `unsafe-eval`;
- client-supplied nonce headers are overwritten;
- protected rendering is dynamic and receives the generated nonce;
- daemon Unix-socket and loopback fallback behavior.

### UI

- overview capability states;
- search and each filter;
- master-list selection;
- repeated selection of the current ID;
- reader loading/error/content modes;
- redact-by-default and reveal reset;
- narrow-layout list/reader navigation;
- expiry timer, `pageshow`, visibility revalidation, and 401 state clearing;
- roving row focus, Home/End, and focus restoration;
- keyboard and accessible-name behavior;
- compact overview and narrow filter disclosure;
- safe Markdown structure, duplicate-title removal, URL/image handling, and
  raw-content escaping;
- singular and plural metadata copy;
- source fallback and multi-source facet behavior;
- no-data versus request-failure distinction.

### Integration

A fake daemon provides deterministic synthetic fixtures for an end-to-end
smoke test covering launch-token exchange, overview, filter, selection, reveal,
and logout. It includes at least two authoritative summary sources and matching
detail responses.

Browser verification covers supported dark and light themes at desktop,
intermediate, and narrow widths. It verifies no horizontal overflow, no console
errors, browse-first content order, keyboard-only selection, focus transfer and
restoration, session expiry, page restoration, and redaction reset. Artifacts
contain deterministic synthetic memory only.

## 12. Migration and issue tracking

- `cmem-8qg` owns the standalone dashboard.
- `cmem-8ta` is superseded as an implementation destination; useful read-seam
  findings move into `cmem-8qg`.
- `cmem-uiu` remains a real coven-dashboard security issue until that
  repository's exposed route is fixed or removed.
- `cmem-4k9` owns the approved comprehensive security and design-system
  hardening amendment. Its children own CSP, session lifecycle, interaction,
  responsive hierarchy, content/source truth, and theme verification.
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
8. documentation no longer describes this repository as spec/PM-only;
9. production document responses use a nonce CSP without unsafe inline script
   or style execution;
10. session expiry and page restoration clear private UI before revalidation;
11. repeated selection, narrow navigation, and keyboard focus remain usable;
12. narrow layouts expose search and the memory index before secondary system
    detail without horizontal overflow;
13. rendered Markdown is structured and safe, and source facets reflect daemon
    summary metadata;
14. all themes currently exported by the pinned Coven design system pass the
    contrast, focus, reduced-motion, and deterministic browser matrix.

## 14. Implementation

- Daemon API: `OpenCoven/coven` branch `feature/memory-dashboard-api`, tracked
  by `cmem-8qg.1` and landing work `cmem-8qg.3`.
- Dashboard UI: this repository's `feature/memory-dashboard` branch, tracked
  by `cmem-8qg.2`.
- Parent delivery record: `cmem-8qg`.
- Hardening delivery record: `cmem-4k9`, including the backward-compatible
  companion source contract in `OpenCoven/coven`.
- Dashboard validation: `pnpm check`, `pnpm audit:prod`, and
  `./scripts/guard-scan.sh --beads`.
- Daemon validation: `cargo fmt --all -- --check`,
  `cargo clippy --workspace --all-targets -- -D warnings`, and
  `cargo test --workspace --locked`.

## 15. Hardening component boundaries and data flow

The hardening work remains a focused correction of existing boundaries:

1. **Security header builder** owns nonce generation inputs and CSP
   serialization. The root proxy owns request/response header placement.
2. **Session store** remains the source of truth for expiry. Session routes
   serialize `expiresAt`; `LaunchGate` owns timers and browser lifecycle
   listeners; the dashboard owns no session persistence.
3. **Daemon memory record** owns source metadata. Summary and detail DTOs
   serialize that value. `MemoryGateway` performs the temporary older-daemon
   fallback and is the only compatibility boundary.
4. **Memory dashboard controller** owns selected ID, detail loading, and
   narrow list/reader mode. Re-selecting an ID does not mutate detail state.
5. **Memory list** owns roving row focus and row refs. The dashboard requests
   reader focus on open and selected-row focus on Back.
6. **Overview and filters** own only their disclosure state. Search, facets,
   and filtered results remain controlled by the dashboard hook.
7. **Markdown content renderer** owns safe syntax rendering and heading
   normalization. It receives content and title but no transport or session
   authority.

The authenticated data flow is:

1. launch-token exchange creates the cookie session and returns `expiresAt`;
2. `LaunchGate` validates the session, installs lifecycle guards, then mounts
   the dashboard;
3. the dashboard loads overview and summaries through guarded Next routes;
4. summary source metadata drives the source facet and list rows;
5. selection loads the matching detail without exposing a local path;
6. privacy policy decides whether content is mounted; the safe Markdown
   renderer runs only after reveal is allowed;
7. expiry or failed revalidation unmounts the entire dashboard before showing
   the launch state.

No new mutation capability, browser persistence, remote service, copied theme,
or alternate memory authority is introduced by this amendment.
