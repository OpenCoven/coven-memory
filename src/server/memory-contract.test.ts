import {
  memoryDetailSchema,
  memoryListSchema,
  memoryOverviewSchema
} from "./memory-contract";

const id = "d251bc66-3e45-5d03-8d78-1e76919642f9";

const listEntry = {
  id,
  familiar_id: "sage",
  title: "Architecture notes",
  path: "sage/architecture-notes.md",
  updated_at: "4m ago",
  updated_at_iso: "2026-07-26T09:56:00Z",
  excerpt: "A synthetic durable fact.",
  privacy_classification: null,
  reveal_required: null,
  verification_state: "unknown",
  source: { kind: "promotion", label: "Promoted memory" }
};

const overview = {
  generated_at: "2026-07-26T10:00:00Z",
  totals: {
    entries: 1,
    familiars: 1,
    verified: 0,
    needs_review: 0,
    unknown: 1
  },
  last_updated_at: "2026-07-26T09:56:00Z",
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
};

const detail = {
  id,
  familiar_id: "sage",
  title: "Architecture notes",
  updated_at: "2026-07-26T09:56:00Z",
  source: { kind: "coven-origin", label: "Coven origin" },
  content: "# Synthetic architecture notes",
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
};

describe("memory daemon schemas", () => {
  it("accepts the exact Phase 1 list, overview, and detail contracts", () => {
    expect(memoryListSchema.parse([listEntry])).toHaveLength(1);
    expect(memoryOverviewSchema.parse(overview).verification.state).toBe(
      "unavailable"
    );
    expect(memoryDetailSchema.parse(detail).content).toContain("Synthetic");
  });

  it("accepts summary source during a backward-compatible rollout", () => {
    expect(memoryListSchema.parse([listEntry])[0].source).toEqual({
      kind: "promotion",
      label: "Promoted memory"
    });

    const { source, ...legacyEntry } = listEntry;
    expect(source).toEqual({ kind: "promotion", label: "Promoted memory" });
    expect(memoryListSchema.parse([legacyEntry])[0].source).toBeUndefined();
  });

  it("requires the privacy and verification metadata added to list rows", () => {
    const incomplete: Record<string, unknown> = { ...listEntry };
    delete incomplete.privacy_classification;
    delete incomplete.reveal_required;
    delete incomplete.verification_state;
    expect(memoryListSchema.safeParse([incomplete]).success).toBe(false);
  });

  it.each([
    ["/var/empty/coven-memory/sage/notes.md"],
    ["C:\\Users\\example\\.coven\\memory\\notes.md"],
    ["../outside.md"],
    ["sage/../../outside.md"]
  ])("rejects unsafe daemon list paths: %s", (path) => {
    expect(memoryListSchema.safeParse([{ ...listEntry, path }]).success).toBe(
      false
    );
  });

  it("rejects unexpected fields, including detail paths", () => {
    expect(
      memoryDetailSchema.safeParse({
        ...detail,
        path: "/private/local/path"
      }).success
    ).toBe(false);
    expect(
      memoryOverviewSchema.safeParse({ ...overview, healthy: true }).success
    ).toBe(false);
  });

  it("accepts only bounded scalar attestation metadata", () => {
    expect(
      memoryDetailSchema.safeParse({
        ...detail,
        attestation: {
          kind: "synthetic",
          sequence: 1,
          active: true,
          issued_at: null
        }
      }).success
    ).toBe(true);

    for (const attestation of [
      { nested: { body: "Synthetic nested body" } },
      { list: ["Synthetic nested value"] },
      Object.fromEntries(
        Array.from({ length: 65 }, (_, index) => [`field_${index}`, index])
      )
    ]) {
      expect(
        memoryDetailSchema.safeParse({ ...detail, attestation }).success
      ).toBe(false);
    }
  });

  it("rejects inconsistent overview counts", () => {
    expect(
      memoryOverviewSchema.safeParse({
        ...overview,
        totals: { ...overview.totals, verified: 2 }
      }).success
    ).toBe(false);
  });
});
