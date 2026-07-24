# coven-memory v0.1.0 — Catch-Up & Alignment Plan

**Date:** 2026-07-24 · **Author:** Echo (memory lane) · **Requested by:** Val
**Source of truth:** Sage's Authoritative Plan v1 + §10 Devil's-Advocate Addendum
(`sage/research/synthesis/coven-memory-authoritative-plan-2026-07-11.md`, Echo §10.10 + Nova §10.11 concurrence folded)

## 1. Why this plan exists

Architecture was fully signed off 2026-07-11 (Echo tiebreaker on §3.1–§3.7, Nova
concurrence 21:05 CDT). Thirteen days later the 2026-07-24 memory-layer triage
confirmed **zero implementation trail**: no repo, no issues, no commits. Meanwhile
coven-threads (the authority layer) advanced through Phase 5 hardening. This plan
closes the gap and aligns the two tracks at their single seam.

## 2. The two tracks and the seam

- **coven-memory (this repo):** substrate — storage (`~/.coven/memory/`, Path A),
  CoALA-typed schema, per-familiar isolation, promotion surface
  (`coven memory promote`), attestation discipline, manifest ledger.
- **coven-threads:** authority — who may write to protected surfaces, gated by the
  weave. Explicitly does NOT own retrieval/promotion/dreaming (its §3.3.1).
- **The seam:** every promotion write to a protected surface must pass the weave.
  M2's promotion tool and threads' Phase-5 approval semantics must agree on one
  integration contract. That contract is tracked as a bead in BOTH repos.

## 3. Milestones (from plan §2.6 + §10.8 revisions)

| ID | Milestone | Owner | Status 2026-07-24 |
|----|-----------|-------|-------------------|
| M0 | Plan signed off (Echo + Nova) | Sage+Echo+Nova | ✅ DONE 2026-07-11 |
| M1 | Schema lock: MEMORY-SCHEMA §11 (+§10.2 abstractions, `attested_via`, snapshot semantics, claims-log framing, §11.5 runtime-portability audit) | **Echo** | ❌ not started — 13 days late |
| B1 | BLOCKER-1: schema relocation → `OpenCoven/familiar-contract/schemas/coven-memory-schema.md` (blocks M2 merge, per Nova §10.11) | **Echo + Nova** | ❌ not started |
| M1.5 | 4-column privacy taxonomy → Val boundary approval | **Sage + Echo** | ⚠️ draft v1 exists (2026-07-12); Val approval not confirmed |
| M2 | `coven memory promote` + crate v0.1.0: ingest, search, `verify`, structural Ward gate, semantic dedup, attestation-file write, snapshot enforcement, manifest.jsonl | **Cody** (via Nova) | ❌ not started |
| M3 | Three pilot promotions (expanded per hole #4) | **Sage** | blocked on M2 |
| M4 | Dolls architecture fact promotion | **Echo** | blocked on M3 |
| M5 | coven-docs memory section PR | **Nova** | blocked on M4 |
| S1 | `coven/skills/memory-recall/SKILL.md` runtime-neutral recall skill | **Sage** | draft during M2, ships with M3 |
| FC | Familiar Contract §2 amendment: runtime-portability joins fail-closed | **Sage** draft → Echo+Nova review | greenlit, not drafted |
| SEAM | Promotion-write ↔ weave integration contract (mirrored bead in coven-threads) | **Echo + Cody** | ❌ not started |

## 4. v1 commitments (plan §10.5, binding)

Promotion layer wraps `coven-memory ingest --familiar coven` with: structural Ward
gate (scope/attester/path checks, ULID dedup, fail-closed unknown edges), semantic
dedup (cosine, refuse or `--supersede`), attestation file at
`~/.coven/memory/attestations/` (fields: attester, attestation_type
self|val-in-band|familiar-witness, timestamp, context, body; no crypto in v1),
snapshot semantics (source edits do not propagate; supersession = new ULID +
manifest `supersede` op, append-only), manifest.jsonl append.
Hard rule: absolute paths in `source_context` are **rejected at promotion time**.

## 5. Non-goals for v1 (plan §2.7 + §10.6)

No `scope: self-model` (v1.1), no taxonomy enforcement (Phase 2), no SQLite sidecar
columns (crate v0.2), no harness pipeline, no cryptographic attestation, no merged-
scope query, no cross-Doll sync, no forgetting execution, no runtime-specific
paths/hooks/CLIs (invalid by construction), no session-bootstrap auto-injection.

## 6. Discipline gates

- **Runtime-portability audit (§10.7):** every schema field / promotion feature /
  path convention answers in writing: "does this work tomorrow under a different
  runtime without modification?" ✅ proceed · ⚠️ specify adapter interface · ❌ reject.
- **Fail-closed:** unknown edges refuse; enforcement lives on the authoritative
  object (source files), never on derived indexes.
- **Metaphor-referent binding:** every metaphor names its concrete referent on
  first use in specs and public docs.

## 7. Sequencing (unblocking order)

1. M1 schema lock (Echo, ~2 days) — everything reads from it
2. B1 relocation PR (Echo+Nova) — Cody implements in parallel but M2 cannot merge before this
3. M2 crate + promote (Cody, 3–5+2 days) ∥ M1.5 Val approval (Sage+Echo) ∥ S1 skill draft (Sage) ∥ FC draft (Sage)
4. SEAM contract (Echo+Cody, during M2) — mirrored in coven-threads beads
5. M3 pilots (Sage) → M4 (Echo) → M5 docs (Nova)

Revised estimate from sign-off was ~2.5 weeks; clock restarts today.

## 8. Management

All work is managed via beads: `cmem-*` in this repo; the seam mirror lives in
`OpenCoven/coven-threads` (`threads-*`). Owners update their beads; Echo reviews
the graph and reports drift to Val. No milestone is "done" without verification
evidence in the bead (command output, PR link, or artifact path).
