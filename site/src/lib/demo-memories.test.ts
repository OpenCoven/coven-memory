import {
  DEMO_MEMORIES,
  DEMO_OVERVIEW,
  filterDemoMemories
} from "./demo-memories";

describe("synthetic demo memories", () => {
  it("keeps every fixture visibly synthetic and derives honest totals", () => {
    expect(DEMO_MEMORIES).toHaveLength(4);
    expect(DEMO_MEMORIES.every((memory) => memory.synthetic)).toBe(true);
    expect(DEMO_MEMORIES.every((memory) => memory.id.startsWith("demo-"))).toBe(
      true
    );
    expect(DEMO_OVERVIEW).toEqual({
      entries: 4,
      familiars: 3,
      verified: 2,
      needsReview: 1,
      unknown: 1
    });
  });

  it("filters case-insensitively across visitor-visible fields", () => {
    expect(filterDemoMemories(DEMO_MEMORIES, "ARCHITECTURE").map(({ id }) => id))
      .toEqual(["demo-architecture-boundary"]);
    expect(filterDemoMemories(DEMO_MEMORIES, "promoted")).toHaveLength(1);
    expect(filterDemoMemories(DEMO_MEMORIES, "lumen")).toHaveLength(2);
    expect(filterDemoMemories(DEMO_MEMORIES, "missing")).toEqual([]);
    expect(filterDemoMemories(DEMO_MEMORIES, "  ")).toBe(DEMO_MEMORIES);
  });
});
