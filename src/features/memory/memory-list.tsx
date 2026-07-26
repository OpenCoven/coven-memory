import type { MemorySummary } from "@/lib/memory-types";
import type { LoadState } from "./use-memory-dashboard";
import { memoryRequiresReveal } from "./privacy";

type MemoryListProps = {
  state: LoadState<MemorySummary[]>;
  entries: readonly MemorySummary[];
  selectedId: string | null;
  hasActiveFilters: boolean;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onRetry: () => void;
  onClearFilters: () => void;
};

export function MemoryList({
  state,
  entries,
  selectedId,
  hasActiveFilters,
  onSelect,
  onOpen,
  onRetry,
  onClearFilters
}: MemoryListProps) {
  if (state.status === "loading" || state.status === "idle") {
    return (
      <section className="cv-pane memory-list-pane" aria-busy="true">
        <div className="cv-pane-header">Memory index</div>
        <div className="memory-list-state" role="status">
          <span className="memory-skeleton memory-skeleton-row" />
          <span className="memory-skeleton memory-skeleton-row" />
          <span>Loading memories...</span>
        </div>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="cv-pane memory-list-pane">
        <div className="cv-pane-header">Memory index</div>
        <div className="memory-list-state">
          <strong>Couldn&apos;t load memory</strong>
          <p>The Coven daemon did not return the memory list.</p>
          <button
            type="button"
            className="cv-action cv-action-secondary"
            onClick={onRetry}
          >
            Retry memory list
          </button>
        </div>
      </section>
    );
  }

  if (state.data.length === 0) {
    return (
      <section className="cv-pane memory-list-pane">
        <div className="cv-pane-header">Memory index</div>
        <div className="memory-list-state">
          <strong>No memories yet</strong>
          <p>Durable familiar memory will appear here when it is available.</p>
        </div>
      </section>
    );
  }

  if (entries.length === 0) {
    return (
      <section className="cv-pane memory-list-pane">
        <div className="cv-pane-header">Memory index</div>
        <div className="memory-list-state">
          <strong>No memories match these filters</strong>
          <p>Clear the filters to return to the full memory index.</p>
          <button
            type="button"
            className="cv-action cv-action-secondary"
            onClick={onClearFilters}
          >
            Clear filters
          </button>
        </div>
      </section>
    );
  }

  const activeIndex = entries.findIndex((entry) => entry.id === selectedId);

  return (
    <section className="cv-pane memory-list-pane">
      <div className="cv-pane-header memory-pane-title">
        <span>Memory index</span>
        <span>
          {entries.length}
          {hasActiveFilters ? ` of ${state.data.length}` : ""}
        </span>
      </div>
      <div
        className="memory-list"
        role="listbox"
        aria-label="Memories"
        aria-activedescendant={
          selectedId ? `memory-option-${selectedId}` : undefined
        }
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const direction = event.key === "ArrowDown" ? 1 : -1;
            const nextIndex =
              activeIndex < 0
                ? direction > 0
                  ? 0
                  : entries.length - 1
                : Math.min(
                    entries.length - 1,
                    Math.max(0, activeIndex + direction)
                  );
            onSelect(entries[nextIndex].id);
          }
          if (event.key === "Enter" && selectedId) {
            event.preventDefault();
            onOpen(selectedId);
          }
        }}
      >
        {entries.map((entry) => {
          const hidden = memoryRequiresReveal(entry.privacy);
          const verification = verificationLabel(entry.verification.state);
          return (
            <button
              type="button"
              role="option"
              id={`memory-option-${entry.id}`}
              key={entry.id}
              className="memory-list-row"
              aria-selected={entry.id === selectedId}
              aria-label={[
                entry.title,
                entry.familiarId,
                entry.source.label,
                verification,
                hidden ? "Preview hidden" : entry.excerpt
              ].join(", ")}
              onClick={() => {
                onSelect(entry.id);
                onOpen(entry.id);
              }}
            >
              <span className="memory-row-topline">
                <strong>{entry.title}</strong>
                <span>{entry.relativeUpdatedAt}</span>
              </span>
              <span className="memory-row-meta">
                <span>{entry.familiarId}</span>
                <span aria-hidden="true">·</span>
                <span>{entry.source.label}</span>
              </span>
              <span className="memory-row-excerpt">
                {hidden ? "Preview hidden" : entry.excerpt}
              </span>
              <span className="memory-row-status">
                <span
                  className={`memory-status-mark memory-status-${entry.verification.state}`}
                  aria-hidden="true"
                />
                {verification}
                {hidden ? <span className="memory-hidden-chip">Hidden</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function verificationLabel(
  state: MemorySummary["verification"]["state"]
) {
  switch (state) {
    case "verified":
      return "Verified";
    case "needs-review":
      return "Needs review";
    case "degraded":
      return "Degraded";
    case "unavailable":
      return "Unavailable";
    default:
      return "Unknown";
  }
}
