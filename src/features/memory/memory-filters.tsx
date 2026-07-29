import { useState } from "react";
import type { MemorySummary } from "@/lib/memory-types";
import {
  DEFAULT_MEMORY_FILTERS,
  type MemoryFilters
} from "./filter-memories";

type MemoryFilterProps = {
  entries: readonly MemorySummary[];
  filters: MemoryFilters;
  onChange: <Key extends keyof MemoryFilters>(
    key: Key,
    value: MemoryFilters[Key]
  ) => void;
  onClear: () => void;
};

type MemoryLibraryProps = Omit<MemoryFilterProps, "entries"> & {
  entries: readonly MemorySummary[] | null;
  collapsed?: boolean;
  onToggle?: () => void;
};

export function MemorySearch({
  value,
  onChange
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="memory-search">
      <span className="cv-sr-only">Search memories</span>
      <span className="memory-search-icon" aria-hidden="true">
        ⌕
      </span>
      <input
        type="search"
        value={value}
        placeholder="Search memories…"
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            onChange("");
          }
        }}
      />
      {value ? (
        <button
          type="button"
          className="memory-search-clear"
          aria-label="Clear search"
          onClick={() => onChange("")}
        >
          ×
        </button>
      ) : (
        <kbd aria-hidden="true">/</kbd>
      )}
    </label>
  );
}

export function MemoryLibrary({
  entries,
  filters,
  onChange,
  onClear,
  collapsed = false,
  onToggle = () => undefined
}: MemoryLibraryProps) {
  const availableEntries = entries ?? [];
  const familiars = countBy(availableEntries, (entry) => entry.familiarId);
  const sources = countBy(availableEntries, (entry) => entry.source.kind);
  const sourceLabels = new Map(
    availableEntries.map((entry) => [entry.source.kind, entry.source.label])
  );
  const needsReview =
    entries === null
      ? null
      : entries.filter(
          (entry) => entry.verification.state === "needs-review"
        ).length;
  const hasFilters = hasActiveFilters(filters);

  return (
    <nav className="memory-library" aria-label="Memory library">
      <div className="memory-library-heading">
        <button
          type="button"
          className="memory-library-toggle"
          aria-label={collapsed ? "Show Library" : "Collapse Library"}
          aria-expanded={!collapsed}
          aria-controls="memory-library-content"
          onClick={onToggle}
        >
          {collapsed ? "Show Library" : "Library"}
        </button>
        {!collapsed ? <span>{entries?.length ?? "—"}</span> : null}
      </div>

      <div id="memory-library-content" className="memory-library-scroll" hidden={collapsed}>
        <div className="memory-scope-group">
          <ScopeButton
            label="All memories"
            count={entries?.length ?? null}
            icon="◇"
            selected={entries !== null && !hasFilters}
            onClick={onClear}
          />
          <ScopeButton
            label="Needs review"
            count={needsReview}
            icon="!"
            selected={filters.verification === "needs-review"}
            onClick={() =>
              onChange(
                "verification",
                filters.verification === "needs-review" ? "" : "needs-review"
              )
            }
          />
        </div>

        <LibrarySection label="Familiars">
          {familiars.map(([familiar, count]) => (
            <ScopeButton
              key={familiar}
              label={familiar}
              count={count}
              icon={familiar.slice(0, 1).toUpperCase()}
              selected={filters.familiar === familiar}
              onClick={() =>
                onChange(
                  "familiar",
                  filters.familiar === familiar ? "" : familiar
                )
              }
            />
          ))}
        </LibrarySection>

        <LibrarySection label="Sources">
          {sources.map(([source, count]) => (
            <ScopeButton
              key={source}
              label={sourceLabels.get(source) ?? source}
              count={count}
              icon="↗"
              selected={filters.source === source}
              onClick={() =>
                onChange("source", filters.source === source ? "" : source)
              }
            />
          ))}
        </LibrarySection>

        <LibrarySection label="Refine">
          <LibrarySelect
            label="Verification"
            value={filters.verification}
            onChange={(value) =>
              onChange(
                "verification",
                value as MemoryFilters["verification"]
              )
            }
          >
            <VerificationOptions />
          </LibrarySelect>
          <LibrarySelect
            label="Freshness"
            value={filters.freshness}
            onChange={(value) =>
              onChange("freshness", value as MemoryFilters["freshness"])
            }
          >
            <FreshnessOptions />
          </LibrarySelect>
        </LibrarySection>
      </div>

      {!collapsed ? (
        <button
          type="button"
          className="memory-library-clear"
          onClick={onClear}
          disabled={!hasFilters}
        >
          Clear filters
        </button>
      ) : null}
    </nav>
  );
}

export function MemoryFiltersBar({
  entries,
  filters,
  onChange,
  onClear
}: MemoryFilterProps) {
  const [facetsOpen, setFacetsOpen] = useState(false);
  const familiars = [...new Set(entries.map((entry) => entry.familiarId))].sort(
    (left, right) => left.localeCompare(right)
  );
  const sources = [
    ...new Map(
      entries.map((entry) => [entry.source.kind, entry.source.label])
    ).entries()
  ].sort((left, right) => left[1].localeCompare(right[1]));
  const activeFacetCount = [
    filters.familiar !== DEFAULT_MEMORY_FILTERS.familiar,
    filters.source !== DEFAULT_MEMORY_FILTERS.source,
    filters.verification !== DEFAULT_MEMORY_FILTERS.verification,
    filters.freshness !== DEFAULT_MEMORY_FILTERS.freshness
  ].filter(Boolean).length;

  return (
    <section className="memory-filter-shell" aria-label="Memory filters">
      <div className="memory-filter-intro">
        <span className="memory-filter-label">Refine index</span>
        <button
          type="button"
          className="cv-action cv-action-secondary memory-filter-toggle"
          aria-expanded={facetsOpen}
          aria-controls="memory-filter-facets"
          onClick={() => setFacetsOpen((open) => !open)}
        >
          Filters{activeFacetCount > 0 ? ` (${activeFacetCount})` : ""}
        </button>
        <button
          type="button"
          className="cv-action cv-action-ghost memory-filter-clear"
          onClick={onClear}
          disabled={!hasActiveFilters(filters)}
        >
          Clear filters
        </button>
      </div>
      <div
        id="memory-filter-facets"
        className="memory-filter-facets"
        data-open={facetsOpen}
      >
        <FilterSelect
          label="Familiar"
          value={filters.familiar}
          onChange={(value) => onChange("familiar", value)}
        >
          <option value="">All familiars</option>
          {familiars.map((familiar) => (
            <option key={familiar} value={familiar}>
              {familiar}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Source"
          value={filters.source}
          onChange={(value) => onChange("source", value)}
        >
          <option value="">All sources</option>
          {sources.map(([kind, label]) => (
            <option key={kind} value={kind}>
              {label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Verification"
          value={filters.verification}
          onChange={(value) =>
            onChange(
              "verification",
              value as MemoryFilters["verification"]
            )
          }
        >
          <VerificationOptions />
        </FilterSelect>
        <FilterSelect
          label="Freshness"
          value={filters.freshness}
          onChange={(value) =>
            onChange("freshness", value as MemoryFilters["freshness"])
          }
        >
          <FreshnessOptions />
        </FilterSelect>
      </div>
    </section>
  );
}

function LibrarySection({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="memory-library-section">
      <h2>{label}</h2>
      {children}
    </section>
  );
}

function ScopeButton({
  label,
  count,
  icon,
  selected,
  onClick
}: {
  label: string;
  count: number | null;
  icon: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="memory-scope-button"
      aria-label={
        count === null
          ? `${label}, count unavailable`
          : `${label}, ${count}`
      }
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className="memory-scope-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
      <span className="memory-scope-count">{count ?? "—"}</span>
    </button>
  );
}

function LibrarySelect({
  label,
  value,
  onChange,
  children
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="memory-library-field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {children}
      </select>
    </label>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="cv-field memory-filter-field">
      <span className="cv-field-label">{label}</span>
      <select
        className="cv-select"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {children}
      </select>
    </label>
  );
}

function VerificationOptions() {
  return (
    <>
      <option value="">All states</option>
      <option value="verified">Verified</option>
      <option value="needs-review">Needs review</option>
      <option value="degraded">Degraded</option>
      <option value="unknown">Unknown</option>
      <option value="unavailable">Unavailable</option>
    </>
  );
}

function FreshnessOptions() {
  return (
    <>
      <option value="all">Any time</option>
      <option value="recent">Last 30 days</option>
      <option value="older">Older than 30 days</option>
    </>
  );
}

function hasActiveFilters(filters: MemoryFilters) {
  return (
    filters.query !== DEFAULT_MEMORY_FILTERS.query ||
    filters.familiar !== DEFAULT_MEMORY_FILTERS.familiar ||
    filters.source !== DEFAULT_MEMORY_FILTERS.source ||
    filters.verification !== DEFAULT_MEMORY_FILTERS.verification ||
    filters.freshness !== DEFAULT_MEMORY_FILTERS.freshness
  );
}

function countBy(
  entries: readonly MemorySummary[],
  keyFor: (entry: MemorySummary) => string
) {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = keyFor(entry);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  );
}
