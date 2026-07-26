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

type MemorySearchProps = {
  value: string;
  onChange: (value: string) => void;
};

export function MemorySearch({ value, onChange }: MemorySearchProps) {
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

export function MemoryFiltersBar({
  entries,
  filters,
  onChange,
  onClear
}: MemoryFiltersBarProps) {
  const familiars = countBy(entries, (entry) => entry.familiarId);
  const sources = countBy(entries, (entry) => entry.source.kind);
  const sourceLabels = new Map(
    entries.map((entry) => [entry.source.kind, entry.source.label])
  );
  const needsReview = entries.filter(
    (entry) => entry.verification.state === "needs-review"
  ).length;
  const hasFilters =
    filters.query !== DEFAULT_MEMORY_FILTERS.query ||
    filters.familiar !== DEFAULT_MEMORY_FILTERS.familiar ||
    filters.source !== DEFAULT_MEMORY_FILTERS.source ||
    filters.verification !== DEFAULT_MEMORY_FILTERS.verification ||
    filters.freshness !== DEFAULT_MEMORY_FILTERS.freshness;
  const allSelected = !hasFilters;

  return (
    <nav className="memory-library" aria-label="Memory library">
      <div className="memory-library-heading">
        <span>Library</span>
        <span>{entries.length}</span>
      </div>

      <div className="memory-library-scroll">
        <div className="memory-scope-group">
          <ScopeButton
            label="All memories"
            count={entries.length}
            icon="◇"
            selected={allSelected}
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
        </LibrarySection>
      </div>

      <button
        type="button"
        className="memory-library-clear"
        onClick={onClear}
        disabled={!hasFilters}
      >
        Clear filters
      </button>
    </nav>
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
  count: number;
  icon: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="memory-scope-button"
      aria-label={`${label}, ${count}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className="memory-scope-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
      <span className="memory-scope-count">{count}</span>
    </button>
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
