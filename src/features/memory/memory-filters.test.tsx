import { fireEvent, render, screen } from "@testing-library/react";
import type { MemorySummary } from "@/lib/memory-types";
import {
  DEFAULT_MEMORY_FILTERS,
  type MemoryFilters
} from "./filter-memories";
import { MemoryFiltersBar } from "./memory-filters";

const entries: MemorySummary[] = [
  {
    id: "d251bc66-3e45-5d03-8d78-1e76919642f9",
    familiarId: "sage",
    title: "Synthetic",
    updatedAt: "2026-07-26T10:00:00Z",
    relativeUpdatedAt: "now",
    excerpt: "Synthetic",
    source: { kind: "coven-origin", label: "Coven origin" },
    privacy: { classification: null, revealRequired: null },
    verification: { state: "unknown" }
  }
];

describe("MemoryFiltersBar", () => {
  it("exposes all filters with persistent accessible names", () => {
    render(
      <MemoryFiltersBar
        entries={entries}
        filters={DEFAULT_MEMORY_FILTERS}
        onChange={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(
      screen.getByRole("searchbox", { name: "Search memories" })
    ).toHaveAttribute("placeholder", "Search memories...");
    for (const name of [
      "Familiar",
      "Source",
      "Verification",
      "Freshness"
    ]) {
      expect(screen.getByRole("combobox", { name })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: "Clear filters" })
    ).toBeInTheDocument();
  });

  it("changes facets, clears Escape query only, and clears all filters", () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    const filters: MemoryFilters = {
      ...DEFAULT_MEMORY_FILTERS,
      query: "architecture",
      familiar: "sage"
    };
    render(
      <MemoryFiltersBar
        entries={entries}
        filters={filters}
        onChange={onChange}
        onClear={onClear}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Freshness" }), {
      target: { value: "recent" }
    });
    expect(onChange).toHaveBeenCalledWith("freshness", "recent");

    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(onChange).toHaveBeenCalledWith("query", "");

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
