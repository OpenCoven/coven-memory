"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore
} from "react";
import {
  DEFAULT_MEMORY_FILTERS,
  type MemoryFilters
} from "./filter-memories";
import type { MemorySummary } from "@/lib/memory-types";
import {
  MemoryFiltersBar,
  MemoryLibrary,
  MemorySearch
} from "./memory-filters";
import { MemoryList, type MemoryListHandle } from "./memory-list";
import { MemoryDiagnostics, MemoryOverview } from "./memory-overview";
import { MemoryReader } from "./memory-reader";
import { MemoryUpdateRequired } from "./memory-update-required";
import { useMemoryDashboard } from "./use-memory-dashboard";
import {
  MEMORY_LAYOUT_RAIL_WIDTH,
  useMemoryLayout
} from "./use-memory-layout";

const NARROW_LAYOUT_QUERY = "(max-width: 56rem)";

export function MemoryDashboard() {
  const dashboard = useMemoryDashboard();
  const memoryLayout = useMemoryLayout();
  const [narrowPane, setNarrowPane] = useState<"list" | "reader">("list");
  const isNarrowLayout = useSyncExternalStore(
    subscribeToNarrowLayout,
    getNarrowLayoutSnapshot,
    getNarrowLayoutServerSnapshot
  );
  const listRef = useRef<MemoryListHandle>(null);
  const readerSlotRef = useRef<HTMLDivElement>(null);
  const readerFocusRef = useRef<HTMLElement>(null);
  const readerTitleRef = useRef<HTMLHeadingElement>(null);
  const readerFocusIntentRef = useRef(false);
  const focusReturnFrameRef = useRef<number | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const resizingLibraryRef = useRef<number | null>(null);
  const resizingInspectorRef = useRef<number | null>(null);

  const cancelFocusReturn = useCallback(() => {
    if (focusReturnFrameRef.current !== null) {
      window.cancelAnimationFrame(focusReturnFrameRef.current);
      focusReturnFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    const layout = window.matchMedia(NARROW_LAYOUT_QUERY);
    const synchronizeLayout = () => {
      cancelFocusReturn();
      readerFocusIntentRef.current = false;
      const activeElement = document.activeElement;
      setNarrowPane(
        activeElement && readerSlotRef.current?.contains(activeElement)
          ? "reader"
          : "list"
      );
    };
    layout.addEventListener("change", synchronizeLayout);
    return () => {
      layout.removeEventListener("change", synchronizeLayout);
      cancelFocusReturn();
    };
  }, [cancelFocusReturn]);

  useEffect(() => {
    if (
      readerFocusIntentRef.current &&
      isNarrowLayout &&
      narrowPane === "reader" &&
      dashboard.detail.status !== "idle"
    ) {
      if (dashboard.detail.status === "ready") {
        readerTitleRef.current?.focus();
        readerFocusIntentRef.current = false;
      } else {
        readerFocusRef.current?.focus();
      }
      if (dashboard.detail.status === "error") {
        readerFocusIntentRef.current = false;
      }
    }
  }, [
    dashboard.detail.status,
    dashboard.selectedId,
    isNarrowLayout,
    narrowPane
  ]);

  const allEntries =
    dashboard.list.status === "ready" ? dashboard.list.data : [];
  const libraryEntries =
    dashboard.list.status === "ready" ? dashboard.list.data : null;
  const sourceCount =
    dashboard.list.status === "ready"
      ? new Set(allEntries.map((entry) => entry.source.kind)).size
      : null;
  const capabilities =
    dashboard.overview.status === "ready"
      ? dashboard.overview.data.capabilities
      : undefined;
  const hasActiveFilters =
    dashboard.filters.query !== DEFAULT_MEMORY_FILTERS.query ||
    dashboard.filters.familiar !== DEFAULT_MEMORY_FILTERS.familiar ||
    dashboard.filters.source !== DEFAULT_MEMORY_FILTERS.source ||
    dashboard.filters.verification !==
      DEFAULT_MEMORY_FILTERS.verification ||
    dashboard.filters.freshness !== DEFAULT_MEMORY_FILTERS.freshness;

  const setFilter = <Key extends keyof MemoryFilters>(
    key: Key,
    value: MemoryFilters[Key]
  ) => {
    cancelFocusReturn();
    readerFocusIntentRef.current = false;
    dashboard.setFilter(key, value);
    setNarrowPane("list");
  };

  const clearFilters = () => {
    cancelFocusReturn();
    readerFocusIntentRef.current = false;
    dashboard.clearFilters();
    setNarrowPane("list");
  };

  const libraryWidth = memoryLayout.layout.library.collapsed
    ? MEMORY_LAYOUT_RAIL_WIDTH
    : memoryLayout.layout.library.width;
  const inspectorWidth = memoryLayout.layout.inspector.collapsed
    ? MEMORY_LAYOUT_RAIL_WIDTH
    : memoryLayout.layout.inspector.width;

  const libraryWidthFromPointer = (clientX: number) => {
    const workspaceLeft = workspaceRef.current?.getBoundingClientRect().left ?? 0;
    return clientX - workspaceLeft;
  };

  const handleLibraryPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (memoryLayout.layout.library.collapsed) {
      return;
    }
    event.preventDefault();
    resizingLibraryRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleLibraryPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (resizingLibraryRef.current !== event.pointerId) {
      return;
    }
    memoryLayout.setWidth("library", libraryWidthFromPointer(event.clientX));
  };

  const handleLibraryPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (resizingLibraryRef.current !== event.pointerId) {
      return;
    }
    resizingLibraryRef.current = null;
    const width = libraryWidthFromPointer(event.clientX);
    memoryLayout.commitWidth("library", width);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const handleLibraryKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const { min, max } = memoryLayout.widthLimits.library;
    const current = memoryLayout.layout.library.width;
    let next: number | null = null;
    if (event.key === "ArrowLeft") {
      next = current - 16;
    } else if (event.key === "ArrowRight") {
      next = current + 16;
    } else if (event.key === "Home") {
      next = min;
    } else if (event.key === "End") {
      next = max;
    }
    if (next === null) {
      return;
    }
    event.preventDefault();
    memoryLayout.setWidth("library", next);
    memoryLayout.commitWidth("library", next);
  };

  const inspectorWidthFromPointer = (clientX: number) => {
    const readerRight = readerSlotRef.current?.getBoundingClientRect().right ?? 0;
    // jsdom has no layout box; using the pointer coordinate keeps the handler
    // deterministic there while browsers use the reader's trailing edge.
    return readerRight > 0 ? readerRight - clientX : clientX;
  };

  const handleInspectorPointerDown = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (memoryLayout.layout.inspector.collapsed) {
      return;
    }
    event.preventDefault();
    resizingInspectorRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleInspectorPointerMove = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (resizingInspectorRef.current !== event.pointerId) {
      return;
    }
    memoryLayout.setWidth(
      "inspector",
      inspectorWidthFromPointer(event.clientX)
    );
  };

  const handleInspectorPointerUp = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (resizingInspectorRef.current !== event.pointerId) {
      return;
    }
    resizingInspectorRef.current = null;
    memoryLayout.commitWidth(
      "inspector",
      inspectorWidthFromPointer(event.clientX)
    );
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const handleInspectorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const { min, max } = memoryLayout.widthLimits.inspector;
    const current = memoryLayout.layout.inspector.width;
    let next: number | null = null;
    if (event.key === "ArrowLeft") {
      next = current + 16;
    } else if (event.key === "ArrowRight") {
      next = current - 16;
    } else if (event.key === "Home") {
      next = min;
    } else if (event.key === "End") {
      next = max;
    }
    if (next === null) {
      return;
    }
    event.preventDefault();
    memoryLayout.setWidth("inspector", next);
    memoryLayout.commitWidth("inspector", next);
  };

  return (
    <main
      className="memory-dashboard"
      data-narrow-pane={narrowPane}
      aria-label="Coven Memory"
    >
      <header className="memory-header">
        <div className="memory-brand">
          <span className="memory-brand-mark" aria-hidden="true">
            ◇
          </span>
          <h1>Memory</h1>
        </div>

        <div className="memory-header-search">
          <MemorySearch
            value={dashboard.filters.query}
            onChange={(value) => setFilter("query", value)}
          />
        </div>

        <div className="memory-header-actions">
          <div
            className="memory-daemon-status"
            role="status"
            aria-label={connectionLabel(dashboard.list.status)}
          >
            <span
              className={`cv-status-dot memory-status-dot ${connectionDotClass(
                dashboard.list.status
              )}`}
              aria-hidden="true"
            />
            <span className="memory-status-symbol" aria-hidden="true">
              {connectionSymbol(dashboard.list.status)}
            </span>
            <span className="memory-connection-copy">
              {connectionLabel(dashboard.list.status)}
            </span>
            <span aria-hidden="true" className="memory-status-divider" />
            <span className="memory-header-updated">
              {lastUpdatedLabel(dashboard)}
            </span>
          </div>
          <span className="memory-protection-status">
            <span aria-hidden="true">◇</span>
            Protected by default
          </span>
          <button
            type="button"
            className="cv-action cv-action-secondary memory-refresh-action"
            onClick={dashboard.reload}
            disabled={dashboard.isRefreshing}
          >
            {dashboard.isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {hasActiveFilters ? (
        <div className="memory-filter-chips" aria-label="Active filters">
          <span className="memory-filter-chips-label">Scoped</span>
          {filterLabels(dashboard.filters, allEntries).map((label) => (
            <span className="memory-filter-chip" key={label}>
              {label}
            </span>
          ))}
          <button type="button" onClick={clearFilters}>
            Clear all filters
          </button>
        </div>
      ) : null}

      {dashboard.updateRequired ? (
        <MemoryUpdateRequired onRetry={dashboard.reload} />
      ) : (
        <>
          <div className="memory-mobile-filter-slot">
            <MemoryFiltersBar
              entries={allEntries}
              filters={dashboard.filters}
              onChange={setFilter}
              onClear={clearFilters}
            />
          </div>

          <div
            ref={workspaceRef}
            className="memory-workspace"
            data-library-width={libraryWidth}
            data-inspector-width={inspectorWidth}
          >
            <aside
              className="memory-library-slot"
              data-collapsed={memoryLayout.layout.library.collapsed}
            >
              <MemoryLibrary
                entries={libraryEntries}
                filters={dashboard.filters}
                onChange={setFilter}
                onClear={clearFilters}
                collapsed={memoryLayout.layout.library.collapsed}
                onToggle={() => memoryLayout.toggle("library")}
              />
              <MemoryOverview
                state={dashboard.overview}
                sourceCount={sourceCount}
              />
              {dashboard.overview.status === "ready" ? (
                <MemoryDiagnostics
                  overview={dashboard.overview.data}
                  sourceCount={sourceCount}
                />
              ) : null}
              {!isNarrowLayout && !memoryLayout.layout.library.collapsed ? (
                <div
                  className="memory-library-separator"
                  role="separator"
                  tabIndex={0}
                  aria-label="Resize Library"
                  aria-orientation="vertical"
                  aria-valuemin={memoryLayout.widthLimits.library.min}
                  aria-valuemax={memoryLayout.widthLimits.library.max}
                  aria-valuenow={memoryLayout.layout.library.width}
                  onKeyDown={handleLibraryKeyDown}
                  onPointerDown={handleLibraryPointerDown}
                  onPointerMove={handleLibraryPointerMove}
                  onPointerUp={handleLibraryPointerUp}
                />
              ) : null}
            </aside>

            <div className="memory-list-slot">
              <MemoryList
                ref={listRef}
                state={dashboard.list}
                entries={dashboard.filteredEntries}
                selectedId={dashboard.selectedId}
                hasActiveFilters={hasActiveFilters}
                onSelect={dashboard.setSelectedId}
                onOpen={(id) => {
                  cancelFocusReturn();
                  readerFocusIntentRef.current = isNarrowLayout;
                  dashboard.setSelectedId(id);
                  setNarrowPane("reader");
                }}
                onRetry={dashboard.reload}
                onClearFilters={clearFilters}
              />
            </div>

            <div ref={readerSlotRef} className="memory-reader-slot">
              <MemoryReader
                state={dashboard.detail}
                selectedId={dashboard.selectedId}
                capabilities={capabilities}
                focusRef={readerFocusRef}
                titleRef={readerTitleRef}
                onBack={() => {
                  readerFocusIntentRef.current = false;
                  cancelFocusReturn();
                  setNarrowPane("list");
                  focusReturnFrameRef.current =
                    window.requestAnimationFrame(() => {
                      focusReturnFrameRef.current = null;
                      listRef.current?.focusSelected();
                    });
                }}
                onRetry={dashboard.retryDetail}
                inspectorCollapsed={memoryLayout.layout.inspector.collapsed}
                inspectorWidth={memoryLayout.layout.inspector.width}
                inspectorWidthLimits={memoryLayout.widthLimits.inspector}
                desktopLayout={!isNarrowLayout}
                onToggleInspector={() => memoryLayout.toggle("inspector")}
                onInspectorKeyDown={handleInspectorKeyDown}
                onInspectorPointerDown={handleInspectorPointerDown}
                onInspectorPointerMove={handleInspectorPointerMove}
                onInspectorPointerUp={handleInspectorPointerUp}
              />
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function subscribeToNarrowLayout(onChange: () => void) {
  const layout = window.matchMedia(NARROW_LAYOUT_QUERY);
  layout.addEventListener("change", onChange);
  return () => layout.removeEventListener("change", onChange);
}

function getNarrowLayoutSnapshot() {
  return window.matchMedia(NARROW_LAYOUT_QUERY).matches;
}

function getNarrowLayoutServerSnapshot() {
  return false;
}

function filterLabels(
  filters: MemoryFilters,
  entries: readonly MemorySummary[]
) {
  const sourceLabel = filters.source
    ? entries.find((entry) => entry.source.kind === filters.source)?.source
        .label
    : null;
  return [
    filters.query ? `Search: ${filters.query}` : null,
    filters.familiar ? `Familiar: ${filters.familiar}` : null,
    filters.source
      ? `Source: ${sourceLabel ?? humanizeFilterValue(filters.source)}`
      : null,
    filters.verification
      ? `State: ${verificationFilterLabel(filters.verification)}`
      : null,
    filters.freshness !== "all"
      ? `Updated: ${freshnessFilterLabel(filters.freshness)}`
      : null
  ].filter((label): label is string => Boolean(label));
}

function humanizeFilterValue(value: string) {
  const words = value.replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function verificationFilterLabel(
  verification: Exclude<MemoryFilters["verification"], "">
) {
  return {
    verified: "Verified",
    "needs-review": "Needs review",
    degraded: "Degraded",
    unknown: "Unknown",
    unavailable: "Unavailable"
  }[verification];
}

function freshnessFilterLabel(freshness: MemoryFilters["freshness"]) {
  return freshness === "recent"
    ? "Last 30 days"
    : freshness === "older"
      ? "Older than 30 days"
      : "Any time";
}

function connectionLabel(status: "idle" | "loading" | "ready" | "error") {
  if (status === "ready") {
    return "Daemon connected";
  }
  if (status === "error") {
    return "Daemon unavailable";
  }
  return "Connecting to daemon";
}

function connectionSymbol(status: "idle" | "loading" | "ready" | "error") {
  if (status === "ready") {
    return "✓";
  }
  if (status === "error") {
    return "!";
  }
  return "…";
}

function connectionDotClass(
  status: "idle" | "loading" | "ready" | "error"
) {
  if (status === "ready") {
    return "cv-status-dot-success";
  }
  if (status === "error") {
    return "cv-status-dot-danger";
  }
  return "cv-status-dot-warning";
}

function lastUpdatedLabel(
  dashboard: ReturnType<typeof useMemoryDashboard>
) {
  if (dashboard.overview.status !== "ready") {
    return "Update time unavailable";
  }
  const value =
    dashboard.overview.data.lastUpdatedAt ??
    dashboard.overview.data.generatedAt;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Update time unavailable";
  }
  return `Updated ${new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date)}`;
}
