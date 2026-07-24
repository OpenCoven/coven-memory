# Security & Privacy Protocols — coven-memory

This is a **public** repository for the spec, plan, and issue tracking of the
OpenCoven memory layer. Because the subject matter *is memory*, the highest
risk here is not code vulnerability — it is **accidental disclosure**: private
session identifiers, local machine paths, personal data, or memory content
that was never meant to leave a local machine.

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

## Enforcement layers (defense in depth)

1. **Pre-commit hook** — `scripts/guard-scan.sh --staged`: gitleaks (with
   `.gitleaks.toml` Coven rules) + plain-pattern scan on staged content.
   Fail-closed: if gitleaks is missing, the commit is blocked.
2. **Pre-push hook** — full-tree scan **plus a fresh `bd export` scan of the
   beads database**, because bead notes sync via dolt refs to this remote too.
3. **CI (`privacy-guard.yml`)** — runs on every push and PR: full-history
   gitleaks scan, tracked-tree scan, and a changed-files scan on PRs.
   Local hooks can be skipped; **CI cannot**. CI is the authority.
4. **Review discipline** — PR reviewers treat any privacy hit as a blocker,
   never a warn-and-proceed. Same fail-closed principle as the promotion gate.

## Contributor setup (one time, after clone)

```bash
scripts/setup-hooks.sh   # installs hooks (core.hooksPath=.githooks)
brew install gitleaks    # or see github.com/gitleaks/gitleaks
```

## False positives

Add the inline marker `guard-scan-allow` on the flagged line **and** justify it
in the PR description. Reviewers must confirm the marker is legitimate. The
marker does not bypass gitleaks default rules (real secrets are never allowed).

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
document is the reference; those repos enforce via their own CI.
