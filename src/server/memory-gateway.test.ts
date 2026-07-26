import { createMemoryGateway, MemoryGatewayError } from "./memory-gateway";

const id = "d251bc66-3e45-5d03-8d78-1e76919642f9";

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
        verification_state: "unknown"
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
        source: { kind: "coven-origin", label: "Coven origin" },
        privacy: { classification: null, revealRequired: null },
        verification: { state: "unknown" }
      }
    ]);
    expect(JSON.stringify(result)).not.toContain("path");
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
      attestation: null,
      supersession: { supersedes: null, superseded_by: null }
    });
    await expect(createMemoryGateway(transport).detail(id)).resolves.toMatchObject({
      id,
      familiarId: "sage",
      contentFormat: "markdown",
      privacy: { revealRequired: null }
    });

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
