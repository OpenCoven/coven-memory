import { fireEvent, render, screen } from "@testing-library/react";
import type { MemorySummary } from "@/lib/memory-types";
import {
  DEFAULT_MEMORY_FILTERS,
  type MemoryFilters
} from "./filter-memories";
import {
  MemoryFiltersBar,
  MemoryLibrary,
  MemorySearch
} from "./memory-filters";

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
    verification: { state: "needs-review" }
  },
  {
    id: "27acb99a-4de2-5ac5-a1e2-55bc61cfbd4a",
    familiarId: "echo",
    title: "Handoff",
    updatedAt: "2026-07-20T10:00:00Z",
    relativeUpdatedAt: "6d ago",
    excerpt: "Handoff",
    source: { kind: "promotion", label: "Promoted memory" },
    privacy: { classification: "public", revealRequired: false },
    verification: { state: "verified" }
  }
];

describe("Memory filters", () => {
  it("keeps the header search accessible and clears it with Escape", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MemorySearch value="" onChange={onChange} />
    );

    expect(
      screen.getByRole("searchbox", { name: "Search memories" })
    ).toBeVisible();

    rerender(<MemorySearch value="architecture" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(onChange).toHaveBeenCalledWith("");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("renders a counted desktop library rail and changes its scopes", () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    const view = render(
      <MemoryLibrary
        entries={entries}
        filters={DEFAULT_MEMORY_FILTERS}
        onChange={onChange}
        onClear={onClear}
      />
    );

    expect(screen.getByRole("navigation", { name: "Memory library" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All memories, 2" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Needs review, 1" }))
      .toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "sage, 1" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Coven origin, 1" }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Needs review, 1" }));
    expect(onChange).toHaveBeenCalledWith("verification", "needs-review");
    fireEvent.change(screen.getByRole("combobox", { name: "Freshness" }), {
      target: { value: "recent" }
    });
    expect(onChange).toHaveBeenCalledWith("freshness", "recent");
    view.rerender(
      <MemoryLibrary
        entries={entries}
        filters={{ ...DEFAULT_MEMORY_FILTERS, query: "architecture" }}
        onChange={onChange}
        onClear={onClear}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("marks Library counts unavailable until the list is authoritative", () => {
    render(
      <MemoryLibrary
        entries={null}
        filters={DEFAULT_MEMORY_FILTERS}
        onChange={vi.fn()}
        onClear={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", {
        name: "All memories, count unavailable"
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Needs review, count unavailable"
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "All memories, 0" })
    ).not.toBeInTheDocument();
  });

  it("keeps all four facets in an accessible narrow disclosure", () => {
    const onChange = vi.fn();
    const filters: MemoryFilters = {
      ...DEFAULT_MEMORY_FILTERS,
      familiar: "sage"
    };
    render(
      <MemoryFiltersBar
        entries={entries}
        filters={filters}
        onChange={onChange}
        onClear={vi.fn()}
      />
    );

    const toggle = screen.getByRole("button", { name: "Filters (1)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "memory-filter-facets");
    expect(document.getElementById("memory-filter-facets")).toHaveAttribute(
      "data-open",
      "false"
    );

    for (const name of [
      "Familiar",
      "Source",
      "Verification",
      "Freshness"
    ]) {
      expect(screen.getByRole("combobox", { name })).toBeInTheDocument();
    }

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("memory-filter-facets")).toHaveAttribute(
      "data-open",
      "true"
    );
  });
});
