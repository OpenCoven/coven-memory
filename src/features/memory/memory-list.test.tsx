import { fireEvent, render, screen } from "@testing-library/react";
import type { MemorySummary } from "@/lib/memory-types";
import { MemoryList } from "./memory-list";

const entries: MemorySummary[] = [
  {
    id: "d251bc66-3e45-5d03-8d78-1e76919642f9",
    familiarId: "sage",
    title: "Architecture decisions",
    updatedAt: "2026-07-26T10:00:00Z",
    relativeUpdatedAt: "4m ago",
    excerpt: "Hidden synthetic excerpt.",
    source: { kind: "coven-origin", label: "Coven origin" },
    privacy: { classification: null, revealRequired: null },
    verification: { state: "unknown" }
  },
  {
    id: "27acb99a-4de2-5ac5-a1e2-55bc61cfbd4a",
    familiarId: "echo",
    title: "Public handoff",
    updatedAt: "2026-07-20T10:00:00Z",
    relativeUpdatedAt: "6d ago",
    excerpt: "Safe public excerpt.",
    source: { kind: "promotion", label: "Promoted memory" },
    privacy: { classification: "public", revealRequired: false },
    verification: { state: "verified" }
  }
];

describe("MemoryList", () => {
  it("renders selection and fail-closed preview states", () => {
    render(
      <MemoryList
        state={{ status: "ready", data: entries, error: null }}
        entries={entries}
        selectedId={entries[0].id}
        hasActiveFilters={false}
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        onRetry={vi.fn()}
        onClearFilters={vi.fn()}
      />
    );

    expect(
      screen.getByRole("option", { name: /Architecture decisions/ })
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Preview hidden")).toBeInTheDocument();
    expect(screen.queryByText("Hidden synthetic excerpt.")).not.toBeInTheDocument();
    expect(screen.getByText("Safe public excerpt.")).toBeInTheDocument();
  });

  it("moves selection with arrows and opens with Enter", () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    render(
      <MemoryList
        state={{ status: "ready", data: entries, error: null }}
        entries={entries}
        selectedId={entries[0].id}
        hasActiveFilters={false}
        onSelect={onSelect}
        onOpen={onOpen}
        onRetry={vi.fn()}
        onClearFilters={vi.fn()}
      />
    );
    const listbox = screen.getByRole("listbox", { name: "Memories" });

    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    expect(onSelect).toHaveBeenCalledWith(entries[1].id);
    fireEvent.keyDown(listbox, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith(entries[0].id);
  });

  it("distinguishes true empty, filtered empty, and request error", () => {
    const { rerender } = render(
      <MemoryList
        state={{ status: "ready", data: [], error: null }}
        entries={[]}
        selectedId={null}
        hasActiveFilters={false}
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        onRetry={vi.fn()}
        onClearFilters={vi.fn()}
      />
    );
    expect(screen.getByText("No memories yet")).toBeInTheDocument();

    const onClearFilters = vi.fn();
    rerender(
      <MemoryList
        state={{ status: "ready", data: entries, error: null }}
        entries={[]}
        selectedId={null}
        hasActiveFilters
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        onRetry={vi.fn()}
        onClearFilters={onClearFilters}
      />
    );
    expect(
      screen.getByText("No memories match these filters")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClearFilters).toHaveBeenCalledOnce();

    const onRetry = vi.fn();
    rerender(
      <MemoryList
        state={{ status: "error", data: null, error: "memory_unavailable" }}
        entries={[]}
        selectedId={null}
        hasActiveFilters={false}
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        onRetry={onRetry}
        onClearFilters={vi.fn()}
      />
    );
    expect(screen.getByText("Couldn't load memory")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry memory list" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
