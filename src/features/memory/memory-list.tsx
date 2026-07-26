import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react";
import type { MemorySummary } from "@/lib/memory-types";
import type { LoadState } from "./use-memory-dashboard";
import { memoryRequiresReveal } from "./privacy";

export type MemoryListHandle = {
  focusSelected: () => void;
};

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

export const MemoryList = forwardRef<MemoryListHandle, MemoryListProps>(
  function MemoryList(
    {
      state,
      entries,
      selectedId,
      hasActiveFilters,
      onSelect,
      onOpen,
      onRetry,
      onClearFilters
    },
    ref
  ) {
    const rowRefs = useRef(new Map<string, HTMLButtonElement>());
    const headingRef = useRef<HTMLHeadingElement>(null);
    const preferredFocusId =
      entries.find((entry) => entry.id === selectedId)?.id ??
      entries[0]?.id ??
      null;
    const [focusId, setFocusId] = useState<string | null>(preferredFocusId);
    const previousEntryIdsRef = useRef(
      new Set(entries.map((entry) => entry.id))
    );

    useEffect(() => {
      const nextEntryIds = new Set(entries.map((entry) => entry.id));
      if (!sameIds(previousEntryIdsRef.current, nextEntryIds)) {
        setFocusId(preferredFocusId);
      }
      previousEntryIdsRef.current = nextEntryIds;
    }, [entries, preferredFocusId]);

    useImperativeHandle(
      ref,
      () => ({
        focusSelected() {
          const target =
            entries.find((entry) => entry.id === selectedId)?.id ??
            entries[0]?.id;
          if (target) {
            setFocusId(target);
          }
          const row = target ? rowRefs.current.get(target) : undefined;
          (row ?? headingRef.current)?.focus();
        }
      }),
      [entries, selectedId]
    );

    if (state.status === "loading" || state.status === "idle") {
      return (
        <section className="cv-pane memory-list-pane" aria-busy="true">
          <MemoryListHeading ref={headingRef} />
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
          <MemoryListHeading ref={headingRef} />
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
          <MemoryListHeading ref={headingRef} />
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
          <MemoryListHeading ref={headingRef} />
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

    return (
      <section className="cv-pane memory-list-pane">
        <h2
          ref={headingRef}
          className="cv-pane-header memory-pane-title memory-list-heading"
          aria-label="Memory index"
          tabIndex={-1}
        >
          <span>Memory index</span>
          <span>
            {entries.length}
            {hasActiveFilters ? ` of ${state.data.length}` : ""}
          </span>
        </h2>
        <ul className="memory-list" aria-label="Memories">
          {entries.map((entry, index) => {
            const hidden = memoryRequiresReveal(entry.privacy);
            const verification = verificationLabel(entry.verification.state);
            return (
              <li key={entry.id}>
                <button
                  ref={(node) => {
                    if (node) {
                      rowRefs.current.set(entry.id, node);
                    } else {
                      rowRefs.current.delete(entry.id);
                    }
                  }}
                  type="button"
                  className="memory-list-row"
                  tabIndex={entry.id === focusId ? 0 : -1}
                  aria-current={
                    entry.id === selectedId ? "true" : undefined
                  }
                  aria-label={[
                    entry.title,
                    entry.familiarId,
                    entry.source.label,
                    entry.relativeUpdatedAt,
                    verification,
                    hidden ? "Preview hidden" : entry.excerpt
                  ].join(", ")}
                  onFocus={() => setFocusId(entry.id)}
                  onKeyDown={(event) => {
                    const targetIndex =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? entries.length - 1
                          : event.key === "ArrowDown"
                            ? Math.min(entries.length - 1, index + 1)
                            : event.key === "ArrowUp"
                              ? Math.max(0, index - 1)
                              : -1;
                    if (targetIndex >= 0) {
                      event.preventDefault();
                      const target = entries[targetIndex].id;
                      setFocusId(target);
                      rowRefs.current.get(target)?.focus();
                    } else if (
                      event.key === "Enter" ||
                      event.key === " "
                    ) {
                      event.preventDefault();
                      onSelect(entry.id);
                      onOpen(entry.id);
                    }
                  }}
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
                    {hidden ? (
                      <span className="memory-hidden-chip">Hidden</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }
);

const MemoryListHeading = forwardRef<HTMLHeadingElement>(
  function MemoryListHeading(_props, ref) {
    return (
      <h2
        ref={ref}
        className="cv-pane-header memory-list-heading"
        tabIndex={-1}
      >
        Memory index
      </h2>
    );
  }
);

function sameIds(first: ReadonlySet<string>, second: ReadonlySet<string>) {
  return (
    first.size === second.size &&
    [...first].every((id) => second.has(id))
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
