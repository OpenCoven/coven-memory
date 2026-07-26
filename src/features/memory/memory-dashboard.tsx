"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore
} from "react";
import { useLocalSession } from "@/components/launch-gate";
import {
  DEFAULT_MEMORY_FILTERS,
  type MemoryFilters
} from "./filter-memories";
import {
  MemoryFiltersBar,
  MemorySearch
} from "./memory-filters";
import { MemoryList, type MemoryListHandle } from "./memory-list";
import { MemoryOverview } from "./memory-overview";
import { MemoryReader } from "./memory-reader";
import { useMemoryDashboard } from "./use-memory-dashboard";

const NARROW_LAYOUT_QUERY = "(max-width: 56rem)";

export function MemoryDashboard() {
  const session = useLocalSession();
  const dashboard = useMemoryDashboard({ onUnauthorized: session.lock });
  const [narrowPane, setNarrowPane] = useState<"list" | "reader">("list");
  const isNarrowLayout = useSyncExternalStore(
    subscribeToNarrowLayout,
    getNarrowLayoutSnapshot,
    getNarrowLayoutServerSnapshot
  );
  const listRef = useRef<MemoryListHandle>(null);
  const listSlotRef = useRef<HTMLDivElement>(null);
  const readerSlotRef = useRef<HTMLDivElement>(null);
  const readerTitleRef = useRef<HTMLHeadingElement>(null);
  const readerFocusIntentRef = useRef(false);
  const focusReturnFrameRef = useRef<number | null>(null);

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
      dashboard.detail.status === "ready"
    ) {
      readerFocusIntentRef.current = false;
      readerTitleRef.current?.focus();
    }
  }, [
    dashboard.detail.status,
    dashboard.selectedId,
    isNarrowLayout,
    narrowPane
  ]);

  const allEntries =
    dashboard.list.status === "ready" ? dashboard.list.data : [];
  const sourceCount = new Set(allEntries.map((entry) => entry.source.kind)).size;
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
          <div className="memory-daemon-status" role="status">
            <span
              className={`cv-status-dot ${connectionDotClass(
                dashboard.list.status
              )}`}
              aria-hidden="true"
            />
            <span>{connectionLabel(dashboard.list.status)}</span>
            <span aria-hidden="true" className="memory-status-divider" />
            <span>{lastUpdatedLabel(dashboard)}</span>
          </div>
          <span className="memory-protection-status">
            <span aria-hidden="true">◇</span>
            Protected by default
          </span>
          <button
            type="button"
            className="memory-icon-action"
            aria-label="Refresh"
            title="Refresh memory"
            onClick={dashboard.reload}
            disabled={dashboard.isRefreshing}
          >
            <span aria-hidden="true">↻</span>
            <span className="memory-action-label">
              {dashboard.isRefreshing ? "Refreshing…" : "Refresh"}
            </span>
          </button>
          <details className="memory-session-menu">
            <summary
              className="memory-icon-action"
              aria-label="Session actions"
              title="Session actions"
            >
              •••
            </summary>
            <div className="cv-menu">
              <p className="memory-session-copy">
                This session exists only in the local dashboard process.
              </p>
              <button
                type="button"
                className="cv-menu-item"
                onClick={() => void session.logout()}
              >
                Log out
              </button>
            </div>
          </details>
        </div>
      </header>

      {hasActiveFilters ? (
        <div className="memory-filter-chips" aria-label="Active filters">
          <span className="memory-filter-chips-label">Scoped</span>
          {filterLabels(dashboard.filters).map((label) => (
            <span className="memory-filter-chip" key={label}>
              {label}
            </span>
          ))}
          <button type="button" onClick={clearFilters}>
            Clear all filters
          </button>
        </div>
      ) : null}

      <div className="memory-workspace">
        <aside className="memory-library-slot">
          <MemoryFiltersBar
            entries={allEntries}
            filters={dashboard.filters}
            onChange={setFilter}
            onClear={clearFilters}
          />
          <MemoryOverview
            state={dashboard.overview}
            sourceCount={sourceCount}
          />
        </aside>

        <div ref={listSlotRef} className="memory-list-slot">
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
          />
        </div>
      </div>
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

function filterLabels(filters: MemoryFilters) {
  return [
    filters.query ? `Search: ${filters.query}` : null,
    filters.familiar ? `Familiar: ${filters.familiar}` : null,
    filters.source ? `Source: ${filters.source}` : null,
    filters.verification ? `State: ${filters.verification}` : null,
    filters.freshness !== "all" ? `Updated: ${filters.freshness}` : null
  ].filter((label): label is string => Boolean(label));
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

function connectionDotClass(status: "idle" | "loading" | "ready" | "error") {
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
    return "Update unavailable";
  }
  const value =
    dashboard.overview.data.lastUpdatedAt ??
    dashboard.overview.data.generatedAt;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Update unavailable";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
