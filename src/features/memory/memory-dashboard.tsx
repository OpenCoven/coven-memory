"use client";

import { useState } from "react";
import { useLocalSession } from "@/components/launch-gate";
import {
  DEFAULT_MEMORY_FILTERS,
  type MemoryFilters
} from "./filter-memories";
import { MemoryFiltersBar } from "./memory-filters";
import { MemoryList } from "./memory-list";
import { MemoryOverview } from "./memory-overview";
import { MemoryReader } from "./memory-reader";
import { useMemoryDashboard } from "./use-memory-dashboard";

export function MemoryDashboard() {
  const session = useLocalSession();
  const dashboard = useMemoryDashboard({ onUnauthorized: session.lock });
  const [narrowPane, setNarrowPane] = useState<"list" | "reader">("list");

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
    dashboard.setFilter(key, value);
    setNarrowPane("list");
  };

  const clearFilters = () => {
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
          <div>
            <p className="cv-eyebrow">Secure local memory dashboard</p>
            <h1>Memory</h1>
          </div>
        </div>
        <div className="memory-header-actions">
          <div className="cv-status-strip" role="status">
            <span
              className={`cv-status-dot ${connectionDotClass(
                dashboard.list.status
              )}`}
              aria-hidden="true"
            />
            <span>{connectionLabel(dashboard.list.status)}</span>
            <span className="memory-header-updated">
              {lastUpdatedLabel(dashboard)}
            </span>
          </div>
          <button
            type="button"
            className="cv-action cv-action-secondary"
            onClick={dashboard.reload}
            disabled={dashboard.isRefreshing}
          >
            {dashboard.isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
          <details className="memory-session-menu">
            <summary
              className="cv-action cv-action-ghost"
              aria-label="Session actions"
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

      <MemoryOverview
        state={dashboard.overview}
        sourceCount={sourceCount}
      />

      <MemoryFiltersBar
        entries={allEntries}
        filters={dashboard.filters}
        onChange={setFilter}
        onClear={clearFilters}
      />

      <div className="memory-workspace">
        <div className="memory-list-slot">
          <MemoryList
            state={dashboard.list}
            entries={dashboard.filteredEntries}
            selectedId={dashboard.selectedId}
            hasActiveFilters={hasActiveFilters}
            onSelect={dashboard.setSelectedId}
            onOpen={(id) => {
              dashboard.setSelectedId(id);
              setNarrowPane("reader");
            }}
            onRetry={dashboard.reload}
            onClearFilters={clearFilters}
          />
        </div>
        <div className="memory-reader-slot">
          <MemoryReader
            state={dashboard.detail}
            selectedId={dashboard.selectedId}
            capabilities={capabilities}
            onBack={() => setNarrowPane("list")}
            onRetry={dashboard.retryDetail}
          />
        </div>
      </div>
    </main>
  );
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
