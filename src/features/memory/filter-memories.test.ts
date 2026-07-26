import type { MemorySummary } from "@/lib/memory-types";
import {
  DEFAULT_MEMORY_FILTERS,
  filterMemories,
  type MemoryFilters
} from "./filter-memories";

const recent: MemorySummary = {
  id: "d251bc66-3e45-5d03-8d78-1e76919642f9",
  familiarId: "sage",
  title: "Architecture decisions",
  updatedAt: "2026-07-26T10:00:00Z",
  relativeUpdatedAt: "4m ago",
  excerpt: "Use the Coven daemon boundary.",
  source: { kind: "coven-origin", label: "Coven origin" },
  privacy: { classification: null, revealRequired: null },
  verification: { state: "unknown" }
};

const older: MemorySummary = {
  ...recent,
  id: "27acb99a-4de2-5ac5-a1e2-55bc61cfbd4a",
  familiarId: "echo",
  title: "Handoff preferences",
  updatedAt: "2026-05-01T10:00:00Z",
  relativeUpdatedAt: "12w ago",
  excerpt: "Keep maintainer handoffs concise.",
  source: { kind: "promotion", label: "Promoted memory" },
  privacy: { classification: "personal", revealRequired: true },
  verification: { state: "verified" }
};

const entries = [recent, older];
const now = Date.parse("2026-07-26T11:00:00Z");

function filters(value: Partial<MemoryFilters>): MemoryFilters {
  return { ...DEFAULT_MEMORY_FILTERS, ...value };
}

describe("filterMemories", () => {
  it("combines query, familiar, source, verification, and freshness", () => {
    expect(
      filterMemories(
        entries,
        filters({
          query: "ARCHITECTURE",
          familiar: "sage",
          source: "coven-origin",
          verification: "unknown",
          freshness: "recent"
        }),
        now
      )
    ).toEqual([recent]);
  });

  it.each([
    ["title", { query: "handoff" }, older],
    ["familiar", { query: "echo" }, older],
    ["source label", { query: "promoted" }, older],
    ["source facet", { source: "promotion" }, older],
    ["verification facet", { verification: "verified" }, older],
    ["older freshness", { freshness: "older" }, older]
  ] as const)("matches the %s field", (_label, partial, expected) => {
    expect(filterMemories(entries, filters(partial), now)).toEqual([expected]);
  });

  it("does not search excerpts that require an explicit reveal", () => {
    expect(
      filterMemories(entries, filters({ query: "concise" }), now)
    ).toEqual([]);
  });

  it("does not mutate the source list", () => {
    const before = [...entries];
    filterMemories(entries, filters({ query: "architecture" }), now);
    expect(entries).toEqual(before);
  });
});
