import { createMemoryGateway, MemoryGatewayError } from "./memory-gateway";

const id = "d251bc66-3e45-5d03-8d78-1e76919642f9";
const futureDaemonSource = {
  kind: "future-daemon-source",
  label: "Future daemon label"
};

function transportResponse(status: number, value: unknown) {
  return {
    get: vi.fn().mockResolvedValue({
      status,
      body: typeof value === "string" ? value : JSON.stringify(value)
    })
  };
}

describe("memory gateway", () => {
  it("normalizes list rows without exposing daemon paths", async () => {
    const transport = transportResponse(200, [
      {
        id,
        familiar_id: "sage",
        title: "Synthetic note",
        path: "sage/synthetic-note.md",
        updated_at: "4m ago",
        updated_at_iso: "2026-07-26T09:56:00Z",
        excerpt: "Safe synthetic excerpt.",
        privacy_classification: null,
        reveal_required: null,
        verification_state: "unknown",
        source: { kind: "promotion", label: "Promoted memory" }
      }
    ]);

    const result = await createMemoryGateway(transport).list();

    expect(result).toEqual([
      {
        id,
        familiarId: "sage",
        title: "Synthetic note",
        updatedAt: "2026-07-26T09:56:00Z",
        relativeUpdatedAt: "4m ago",
        excerpt: "Safe synthetic excerpt.",
        source: { kind: "promotion", label: "Promoted memory" },
        privacy: { classification: null, revealRequired: null },
        verification: { state: "unknown" }
      }
    ]);
    expect(JSON.stringify(result)).not.toContain("path");
  });

  it("falls back to Coven origin only for older daemon summaries", async () => {
    const transport = transportResponse(200, [
      {
        id,
        familiar_id: "sage",
        title: "Legacy synthetic note",
        path: "sage/legacy-synthetic-note.md",
        updated_at: "4m ago",
        updated_at_iso: "2026-07-26T09:56:00Z",
        excerpt: "Legacy safe excerpt.",
        privacy_classification: null,
        reveal_required: null,
        verification_state: "unknown"
      }
    ]);

    await expect(createMemoryGateway(transport).list()).resolves.toMatchObject([
      { source: { kind: "coven-origin", label: "Coven origin" } }
    ]);
  });

  it("preserves opaque future daemon sources in list and detail mappings", async () => {
    const listTransport = transportResponse(200, [
      {
        id,
        familiar_id: "sage",
        title: "Future source note",
        path: "sage/future-source-note.md",
        updated_at: "4m ago",
        updated_at_iso: "2026-07-26T09:56:00Z",
        excerpt: "Safe synthetic excerpt.",
        privacy_classification: null,
        reveal_required: null,
        verification_state: "unknown",
        source: futureDaemonSource
      }
    ]);
    const detailTransport = transportResponse(200, {
      id,
      familiar_id: "sage",
      title: "Future source note",
      updated_at: "2026-07-26T09:56:00Z",
      source: futureDaemonSource,
      content: "# Synthetic content",
      content_format: "markdown",
      privacy: {
        classification: null,
        reveal_required: null,
        reason: "privacy taxonomy unavailable"
      },
      verification: {
        state: "unknown",
        reason: "verification metadata unavailable"
      },
      attestation: null,
      supersession: { supersedes: null, superseded_by: null }
    });

    await expect(createMemoryGateway(listTransport).list()).resolves.toMatchObject([
      { source: futureDaemonSource }
    ]);
    await expect(createMemoryGateway(detailTransport).detail(id)).resolves.toMatchObject({
      source: futureDaemonSource
    });
  });

  it("normalizes overview capability names and preserves unavailable state", async () => {
    const transport = transportResponse(200, {
      generated_at: "2026-07-26T10:00:00Z",
      totals: {
        entries: 0,
        familiars: 0,
        verified: 0,
        needs_review: 0,
        unknown: 0
      },
      last_updated_at: null,
      capabilities: {
        detail: true,
        verification: false,
        attestation_metadata: false,
        supersession_history: false,
        mutations: false
      },
      verification: {
        state: "unavailable",
        checked_at: "2026-07-26T10:00:00Z",
        manifest: null,
        index: null,
        issues: []
      }
    });

    await expect(createMemoryGateway(transport).overview()).resolves.toMatchObject({
      generatedAt: "2026-07-26T10:00:00Z",
      totals: { entries: 0, needsReview: 0 },
      capabilities: {
        attestationMetadata: false,
        supersessionHistory: false
      },
      verification: { state: "unavailable" }
    });
  });

  it("normalizes detail and returns null only for daemon 404", async () => {
    const transport = transportResponse(200, {
      id,
      familiar_id: "sage",
      title: "Synthetic note",
      updated_at: "2026-07-26T09:56:00Z",
      source: { kind: "coven-origin", label: "Coven origin" },
      content: "# Synthetic content",
      content_format: "markdown",
      privacy: {
        classification: null,
        reveal_required: null,
        reason: "privacy taxonomy unavailable"
      },
      verification: {
        state: "unknown",
        reason: "verification metadata unavailable"
      },
      attestation: {
        kind: "synthetic",
        body: "Synthetic attestation body",
        path: "synthetic/attestation.json"
      },
      supersession: { supersedes: null, superseded_by: null }
    });

    const result = await createMemoryGateway(transport).detail(id);

    expect(result).toMatchObject({
      id,
      familiarId: "sage",
      contentFormat: "markdown",
      privacy: { revealRequired: null },
      attestationMetadata: { fieldCount: 3 }
    });
    expect(JSON.stringify(result)).not.toContain("attestation body");
    expect(JSON.stringify(result)).not.toContain("attestation.json");

    await expect(
      createMemoryGateway(transportResponse(404, {})).detail(id)
    ).resolves.toBeNull();
  });

  it("rejects invalid IDs before transport", async () => {
    const transport = transportResponse(200, {});
    await expect(
      createMemoryGateway(transport).detail("../local-file")
    ).rejects.toMatchObject({ code: "invalid_id" });
    expect(transport.get).not.toHaveBeenCalled();
  });

  it("classifies the legacy list contract as an update requirement", async () => {
    const legacy = transportResponse(200, [
      {
        id: "sage-notes",
        familiar_id: "sage",
        title: "notes",
        path: "sage/notes.md",
        updated_at: "4m ago",
        excerpt: "Synthetic legacy excerpt."
      }
    ]);

    await expect(createMemoryGateway(legacy).list()).rejects.toMatchObject({
      code: "daemon_incompatible"
    });
  });

  it("classifies a missing overview route as an update requirement", async () => {
    await expect(
      createMemoryGateway(transportResponse(404, { error: "not_found" }))
        .overview()
    ).rejects.toMatchObject({ code: "daemon_incompatible" });
  });

  it("collapses invalid JSON and schema failures into a safe error code", async () => {
    for (const value of ["local path and private body", { unexpected: true }]) {
      const error = await createMemoryGateway(
        transportResponse(200, value)
      )
        .list()
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(MemoryGatewayError);
      expect(error).toMatchObject({ code: "invalid_payload" });
      expect(String(error)).not.toContain("local path");
    }
  });
});
