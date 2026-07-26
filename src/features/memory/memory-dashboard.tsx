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
import { useMemoryDashboard } from "./use-memory-dashboard";

const NARROW_LAYOUT_QUERY = "(max-width: 56rem)";

export function MemoryDashboard() {
  const dashboard = useMemoryDashboard();
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

      <div className="memory-mobile-filter-slot">
        <MemoryFiltersBar
          entries={allEntries}
          filters={dashboard.filters}
          onChange={setFilter}
          onClear={clearFilters}
        />
      </div>

      <div className="memory-workspace">
        <aside className="memory-library-slot">
          <MemoryLibrary
            entries={libraryEntries}
            filters={dashboard.filters}
            onChange={setFilter}
            onClear={clearFilters}
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
