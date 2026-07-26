import type {
  MemorySummary,
  MemoryVerificationState
} from "@/lib/memory-types";
import { memoryRequiresReveal } from "./privacy";

export type MemoryFilters = {
  query: string;
  familiar: string;
  source: string;
  verification: "" | MemoryVerificationState;
  freshness: "all" | "recent" | "older";
};

export const DEFAULT_MEMORY_FILTERS: MemoryFilters = {
  query: "",
  familiar: "",
  source: "",
  verification: "",
  freshness: "all"
};

const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;

export function filterMemories(
  entries: readonly MemorySummary[],
  filters: MemoryFilters,
  now = Date.now()
): MemorySummary[] {
  const query = filters.query.trim().toLowerCase();

  return entries.filter((entry) => {
    if (filters.familiar && entry.familiarId !== filters.familiar) {
      return false;
    }
    if (filters.source && entry.source.kind !== filters.source) {
      return false;
    }
    if (
      filters.verification &&
      entry.verification.state !== filters.verification
    ) {
      return false;
    }

    if (filters.freshness !== "all") {
      const updatedAt = Date.parse(entry.updatedAt);
      if (!Number.isFinite(updatedAt)) {
        return false;
      }
      const age = Math.max(0, now - updatedAt);
      if (filters.freshness === "recent" && age > RECENT_WINDOW_MS) {
        return false;
      }
      if (filters.freshness === "older" && age <= RECENT_WINDOW_MS) {
        return false;
      }
    }

    if (!query) {
      return true;
    }

    const searchable = [
      entry.title,
      entry.familiarId,
      entry.source.label
    ];
    if (!memoryRequiresReveal(entry.privacy)) {
      searchable.push(entry.excerpt);
    }

    return searchable
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}
