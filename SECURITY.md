# Security & Privacy Protocols — coven-memory

This is a **public** repository for the local dashboard, specifications, plans,
and issue tracking of the OpenCoven memory layer. Because the subject matter
*is memory*, its highest risks include both application vulnerabilities and
**accidental disclosure**: private session identifiers, local machine paths,
personal data, or memory content that was never meant to leave a local
machine.

## The rule in one line

**Nothing local, personal, or session-identifying may enter this repository —
in code, docs, bead notes, commit messages, or PR discussion.**

## What is forbidden (enforced programmatically)

| Category | Examples | Why |
|---|---|---|
| Session keys | `agent:<familiar>:telegram:direct:<id>` | Identify private conversations |
| Chat/user IDs | raw Telegram/Discord/iMessage numeric IDs | Personal identifiers |
| Absolute home paths | `/Users/<name>/...`, `/home/<name>/...` | Leak machine layout; violates FAMILIAR_ROOT portability |
| Runtime internals | `~/.openclaw/agents/...`, `~/.coven/workspaces/...`, credentials/sessions paths | Infrastructure disclosure | <!-- guard-scan-allow: doc example -->
| Phone numbers | E.164 | Personal data |
| Secrets | API keys, tokens, invite/handoff URLs | Standard secret hygiene; invite URLs are clipboard-only per Coven policy |
| Real memory content | actual promoted facts, attestation bodies, MEMORY.md excerpts | This repo documents the *shape* of memory, never its *contents* |

Use placeholders in examples: `FAMILIAR_ROOT`, `<familiar-id>`, `~/.coven/memory/`
(the *contract* path is fine; per-user runtime paths are not), `01JEXAMPLE...`.

## Local dashboard boundary

The Phase 1 dashboard is a read-only local client with these enforced
properties:

- the application server binds only to explicit IPv4 or IPv6 loopback;
- the custom server removes any caller-supplied transport header, then injects
  an unguessable process-local proof only for an exact loopback socket peer;
- every data route validates that proof, a loopback or syntactically valid
  `.ts.net` Host, and a matching same-origin Origin when present before
  contacting the daemon;
- Tailscale access is supported only through an operator-configured Tailscale
  Serve proxy whose backend connection reaches the custom server on loopback;
- stock Next.js and Vercel runtimes cannot inject the proof, so memory APIs
  fail closed instead of attempting to reach or relay a viewer's local daemon;
- the app has no launch token, browser session, auth cookie, expiry timer,
  logout route, or lock lifecycle;
- all API success and error responses are `no-store`, and no permissive CORS is
  enabled;
- the Content Security Policy permits only local application resources;
- daemon payloads are parsed with strict runtime schemas before normalization;
- browser DTOs omit daemon paths and transport details;
- TypeScript does not read memory files, indexes, manifests, attestations, or
  databases directly;
- unclassified, unknown, or unrecognized privacy data requires an explicit
  per-entry reveal;
- memory content, excerpts, transport proofs, and local paths are not logged.

The Coven daemon remains responsible for opaque ID validation, containment,
symlink rejection, source reads, and future verification authority. UI
failures must remain failures; they must never be rendered as a healthy empty
memory collection.

Browser and transport fixtures must be deterministic and synthetic. Real
memory must never be copied into tests, screenshots, traces, or issue notes.

## Enforcement layers (defense in depth)

1. **Pre-commit hook** — `scripts/guard-scan.sh --staged`: gitleaks (with
   `.gitleaks.toml` Coven rules and a separate default-rules-only pass) +
   plain-pattern scan on staged content.
   Fail-closed: if gitleaks is missing, the commit is blocked.
2. **Pre-push hook** — full-tree scan **plus a fresh `bd export` scan of the
   beads database**, because bead notes sync via dolt refs to this remote too.
   Fail-closed: if `bd export` fails, the push is blocked.
3. **CI (`privacy-guard.yml`)** — runs on every push and PR: the same
   baseline-aware full-history gitleaks and tracked-tree scan as local hooks,
   plus a changed-files scan on PRs.
   Local hooks can be skipped; **CI cannot**. CI is the authority for
   everything that reaches a branch.
   **Known limit:** bead notes sync via `bd dolt push` (refs/dolt/data), which
   fires no git hooks and no branch CI. For notes, the guard runs locally only —
   always sync via `scripts/bd-dolt-push.sh`, which scans a fresh `bd export`
   (fail-closed) before pushing. Never run a bare `bd dolt push`.
4. **Review discipline** — PR reviewers treat any privacy hit as a blocker,
   never a warn-and-proceed. Same fail-closed principle as the promotion gate.

All gitleaks invocations must use the exact version in `.gitleaks-version`.
The local guard fails on version drift, and CI downloads that same tracked
release. Shell-based local and PR-diff patterns live in
`scripts/privacy-patterns.sh`; its privacy categories are checked against
`.gitleaks.toml` by the guard-policy test.

## Contributor setup (one time, after clone)

```bash
scripts/setup-hooks.sh   # installs hooks (core.hooksPath=.githooks)
brew install gitleaks    # or see github.com/gitleaks/gitleaks
```

Sync bead notes with `scripts/bd-dolt-push.sh` (guarded), not bare `bd dolt push`.

## False positives

For a reviewed false positive from a **custom Coven privacy rule**, add
`gitleaks:allow` on the flagged line. The gitleaks and plain-pattern tiers both
honour that marker; `guard-scan-allow` remains accepted only for existing,
reviewed annotations. Justify every marker in the PR description and have a
reviewer confirm it is legitimate. A separate `.gitleaks-default.toml` pass
uses `--ignore-gitleaks-allow`, so neither marker suppresses gitleaks default
rules: real secrets are never allowed, including in the guard files.

`.gitleaks-baseline.json` is optional and suppresses only recorded historical
findings. When present, every local and CI gitleaks pass uses it; new findings
still fail every pass.

## Bead-notes discipline (contributors and familiars)

Bead notes are part of the public record of this repo. Write them like public
changelog entries: reference plan sections, PR numbers, and file paths inside
the repo — never session keys, chat IDs, or absolute local paths.

## If something private lands anyway

1. Do **not** just delete the file — the content is in git history.
2. Open a private channel to a maintainer (do not describe the content in a
   public issue).
3. Maintainers: rewrite history (`git filter-repo`), force-push, rotate any
   exposed secret, and add a rule to `.gitleaks.toml` covering the miss.
4. Record the incident and the new rule in a bead.

## Scope note

The same standards apply to `OpenCoven/coven` (implementation home for the
promotion layer, M2) and `OpenCoven/coven-threads` (authority layer). This
document is the reference; each repo **must** enforce via its own CI.
Status: `coven` runs a classic secret scan (Coven privacy tier tracked in
`cmem-byc`/`cmem-gxq`); `coven-threads` has **no guard CI yet** — porting
this stack there is tracked in the SEC bead (`cmem-byc`).
