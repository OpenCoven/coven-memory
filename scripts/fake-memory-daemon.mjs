import { createServer } from "node:http";

const host = "127.0.0.1";
const port = Number(process.env.FAKE_DAEMON_PORT ?? "43117");

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("FAKE_DAEMON_PORT must be an integer from 1 to 65535");
}

const entries = [
  {
    id: "d251bc66-3e45-5d03-8d78-1e76919642f9",
    familiar_id: "sage",
    title: "Architecture decisions",
    path: "sage/architecture-decisions.md",
    updated_at: "4m ago",
    updated_at_iso: "2026-07-26T09:56:00Z",
    excerpt: "The daemon remains the authority boundary.",
    privacy_classification: null,
    reveal_required: null,
    verification_state: "unknown",
    source: { kind: "coven-origin", label: "Coven origin" }
  },
  {
    id: "27acb99a-4de2-5ac5-a1e2-55bc61cfbd4a",
    familiar_id: "echo",
    title: "Maintainer handoff style",
    path: "echo/maintainer-handoff-style.md",
    updated_at: "6d ago",
    updated_at_iso: "2026-07-20T09:56:00Z",
    excerpt: "Keep handoffs concise and evidence-backed.",
    privacy_classification: "public",
    reveal_required: false,
    verification_state: "verified",
    source: { kind: "promotion", label: "Promoted memory" }
  },
  {
    id: "97557380-df25-566e-a6a7-5d5e2e2bb670",
    familiar_id: "ember",
    title: "Synthetic protected note",
    path: "ember/synthetic-protected-note.md",
    updated_at: "12w ago",
    updated_at_iso: "2026-05-01T09:56:00Z",
    excerpt: "Synthetic protected preview.",
    privacy_classification: "sensitive",
    reveal_required: true,
    verification_state: "needs_review",
    source: { kind: "coven-origin", label: "Coven origin" }
  }
];

const details = new Map(
  entries.map((entry) => [
    entry.id,
    {
      id: entry.id,
      familiar_id: entry.familiar_id,
      title: entry.title,
      updated_at: entry.updated_at_iso,
      source: entry.source,
      content: `# ${entry.title}\n\nThis is deterministic synthetic memory content.\n\n- No local paths\n- No personal data\n\n<script>unsafe()</script>\n\n![Synthetic tracker](https://example.invalid/pixel.png)`,
      content_format: "markdown",
      privacy: {
        classification: entry.privacy_classification,
        reveal_required: entry.reveal_required,
        reason:
          entry.privacy_classification === "public"
            ? "classified public"
            : "synthetic privacy guard"
      },
      verification: {
        state: entry.verification_state,
        reason: "deterministic synthetic verification"
      },
      attestation: entry.id === entries[1].id ? { kind: "synthetic" } : null,
      supersession: { supersedes: null, superseded_by: null }
    }
  ])
);

const overview = {
  generated_at: "2026-07-26T10:00:00Z",
  totals: {
    entries: 3,
    familiars: 3,
    verified: 1,
    needs_review: 1,
    unknown: 1
  },
  last_updated_at: "2026-07-26T09:56:00Z",
  capabilities: {
    detail: true,
    verification: true,
    attestation_metadata: true,
    supersession_history: true,
    mutations: false
  },
  verification: {
    state: "degraded",
    checked_at: "2026-07-26T10:00:00Z",
    manifest: "current",
    index: "stale",
    issues: ["Synthetic index refresh pending"]
  }
};

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    connection: "close"
  });
  response.end(body);
}

const server = createServer((request, response) => {
  if (request.method !== "GET") {
    json(response, 405, { error: "method_not_allowed" });
    return;
  }
  if (request.url === "/api/v1/memory") {
    json(response, 200, entries);
    return;
  }
  if (request.url === "/api/v1/memory/overview") {
    json(response, 200, overview);
    return;
  }
  const match = /^\/api\/v1\/memory\/([0-9a-f-]{36})$/i.exec(
    request.url ?? ""
  );
  if (match) {
    const detail = details.get(match[1]);
    json(
      response,
      detail ? 200 : 404,
      detail ?? { error: "memory_not_found" }
    );
    return;
  }
  json(response, 404, { error: "not_found" });
});

server.listen(port, host, () => {
  process.stdout.write(`Fake Coven memory daemon ready on ${host}:${port}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
