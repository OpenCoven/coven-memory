import {
  act,
  fireEvent,
  render,
  screen
} from "@testing-library/react";
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

const addedEntry: MemorySummary = {
  ...entries[1],
  id: "8fd3e8d8-761c-5fb2-b117-1fb6331a5cd7",
  title: "Operations notes",
  relativeUpdatedAt: "8d ago"
};

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

    const list = screen.getByRole("list", { name: "Memories" });
    const rows = [
      screen.getByRole("button", { name: /Architecture decisions/ }),
      screen.getByRole("button", { name: /Public handoff/ })
    ];
    expect(list).toContainElement(rows[0]);
    expect(list).toContainElement(rows[1]);
    expect(list).not.toHaveAttribute("tabindex");
    expect(rows.filter((row) => row.tabIndex === 0)).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("aria-current", "true");
    expect(rows[1]).not.toHaveAttribute("aria-current");
    expect(rows[0]).toHaveAccessibleName(
      "Architecture decisions, sage, Coven origin, 4m ago, Unknown, Preview hidden"
    );
    expect(screen.getByText("Preview hidden")).toBeInTheDocument();
    expect(screen.queryByText("Hidden synthetic excerpt.")).not.toBeInTheDocument();
    expect(screen.getByText("Safe public excerpt.")).toBeInTheDocument();
  });

  it("moves roving focus without selection and activates with Enter or Space", () => {
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
    const rows = [
      screen.getByRole("button", { name: /Architecture decisions/ }),
      screen.getByRole("button", { name: /Public handoff/ })
    ];

    act(() => rows[0].focus());
    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    expect(rows[1]).toHaveFocus();
    expect(rows[1]).toHaveAttribute("tabindex", "0");
    expect(rows[0]).toHaveAttribute("tabindex", "-1");
    expect(onSelect).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.keyDown(rows[1], { key: "ArrowUp" });
    expect(rows[0]).toHaveFocus();
    fireEvent.keyDown(rows[0], { key: "End" });
    expect(rows[1]).toHaveFocus();
    fireEvent.keyDown(rows[1], { key: "Home" });
    expect(rows[0]).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.keyDown(rows[0], { key: "End" });
    fireEvent.keyDown(rows[1], { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith(entries[1].id);
    expect(onOpen).toHaveBeenLastCalledWith(entries[1].id);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);

    act(() => rows[0].focus());
    fireEvent.keyDown(rows[0], { key: " " });
    expect(onSelect).toHaveBeenLastCalledWith(entries[0].id);
    expect(onOpen).toHaveBeenLastCalledWith(entries[0].id);
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("resets roving focus only when the entry ID set changes", () => {
    const renderList = (
      visibleEntries: readonly MemorySummary[],
      selectedId: string | null
    ) => (
      <MemoryList
        state={{ status: "ready", data: [...visibleEntries], error: null }}
        entries={visibleEntries}
        selectedId={selectedId}
        hasActiveFilters={false}
        onSelect={vi.fn()}
        onOpen={vi.fn()}
        onRetry={vi.fn()}
        onClearFilters={vi.fn()}
      />
    );
    const view = render(renderList(entries, entries[0].id));
    act(() =>
      screen.getByRole("button", { name: /Public handoff/ }).focus()
    );

    view.rerender(
      renderList(
        entries.map((entry) => ({ ...entry })),
        entries[0].id
      )
    );
    expect(
      screen.getByRole("button", { name: /Public handoff/ })
    ).toHaveAttribute("tabindex", "0");

    view.rerender(
      renderList([...entries, addedEntry], entries[0].id)
    );
    expect(
      screen.getByRole("button", { name: /Architecture decisions/ })
    ).toHaveAttribute("tabindex", "0");
    expect(
      screen.getByRole("button", { name: /Public handoff/ })
    ).toHaveAttribute("tabindex", "-1");

    view.rerender(
      renderList([entries[1], addedEntry], entries[0].id)
    );
    expect(
      screen.getByRole("button", { name: /Public handoff/ })
    ).toHaveAttribute("tabindex", "0");
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
