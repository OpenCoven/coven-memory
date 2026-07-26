import type { MemorySummary } from "@/lib/memory-types";
import {
  DEFAULT_MEMORY_FILTERS,
  type MemoryFilters
} from "./filter-memories";

type MemoryFiltersBarProps = {
  entries: readonly MemorySummary[];
  filters: MemoryFilters;
  onChange: <Key extends keyof MemoryFilters>(
    key: Key,
    value: MemoryFilters[Key]
  ) => void;
  onClear: () => void;
};

export function MemoryFiltersBar({
  entries,
  filters,
  onChange,
  onClear
}: MemoryFiltersBarProps) {
  const familiars = [...new Set(entries.map((entry) => entry.familiarId))].sort(
    (left, right) => left.localeCompare(right)
  );
  const sources = [
    ...new Map(
      entries.map((entry) => [entry.source.kind, entry.source.label])
    ).entries()
  ].sort((left, right) => left[1].localeCompare(right[1]));
  const hasFilters =
    filters.query !== DEFAULT_MEMORY_FILTERS.query ||
    filters.familiar !== DEFAULT_MEMORY_FILTERS.familiar ||
    filters.source !== DEFAULT_MEMORY_FILTERS.source ||
    filters.verification !== DEFAULT_MEMORY_FILTERS.verification ||
    filters.freshness !== DEFAULT_MEMORY_FILTERS.freshness;

  return (
    <section className="memory-filter-shell" aria-labelledby="memory-filter-title">
      <div className="memory-filter-intro">
        <div>
          <p className="cv-eyebrow">Browse</p>
          <h2 id="memory-filter-title">Find a memory</h2>
        </div>
        <button
          type="button"
          className="cv-action cv-action-ghost"
          onClick={onClear}
          disabled={!hasFilters}
        >
          Clear filters
        </button>
      </div>
      <div className="memory-filter-bar">
        <label className="cv-field memory-search-field">
          <span className="cv-field-label">Search memories</span>
          <input
            className="cv-input"
            type="search"
            value={filters.query}
            placeholder="Search memories..."
            onChange={(event) => onChange("query", event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && filters.query) {
                event.preventDefault();
                onChange("query", "");
              }
            }}
          />
        </label>
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
          <option value="">All states</option>
          <option value="verified">Verified</option>
          <option value="needs-review">Needs review</option>
          <option value="degraded">Degraded</option>
          <option value="unknown">Unknown</option>
          <option value="unavailable">Unavailable</option>
        </FilterSelect>
        <FilterSelect
          label="Freshness"
          value={filters.freshness}
          onChange={(value) =>
            onChange("freshness", value as MemoryFilters["freshness"])
          }
        >
          <option value="all">Any time</option>
          <option value="recent">Last 30 days</option>
          <option value="older">Older than 30 days</option>
        </FilterSelect>
      </div>
    </section>
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
    <label className="cv-field">
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
