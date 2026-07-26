import { render, screen } from "@testing-library/react";
import type { MemoryOverview as Overview } from "@/lib/memory-types";
import { MemoryOverview } from "./memory-overview";

const unavailable: Overview = {
  generatedAt: "2026-07-26T10:00:00Z",
  totals: {
    entries: 12,
    familiars: 3,
    verified: 0,
    needsReview: 0,
    unknown: 12
  },
  lastUpdatedAt: "2026-07-26T09:56:00Z",
  capabilities: {
    detail: true,
    verification: false,
    attestationMetadata: false,
    supersessionHistory: false,
    mutations: false
  },
  verification: {
    state: "unavailable",
    checkedAt: "2026-07-26T10:00:00Z",
    manifest: null,
    index: null,
    issues: []
  }
};

describe("MemoryOverview", () => {
  it("labels unavailable verification instead of presenting zero as healthy", () => {
    render(
      <MemoryOverview
        state={{ status: "ready", data: unavailable, error: null }}
        sourceCount={2}
      />
    );

    expect(screen.getByText("Verification unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/0% verified/i)).not.toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("2 sources")).toBeInTheDocument();
  });

  it("renders known verification counts and system check details", () => {
    render(
      <MemoryOverview
        state={{
          status: "ready",
          data: {
            ...unavailable,
            totals: {
              ...unavailable.totals,
              verified: 9,
              needsReview: 2,
              unknown: 1
            },
            capabilities: {
              ...unavailable.capabilities,
              verification: true
            },
            verification: {
              ...unavailable.verification,
              state: "degraded",
              manifest: "current",
              index: "stale",
              issues: ["Index refresh pending"]
            }
          },
          error: null
        }}
        sourceCount={1}
      />
    );

    expect(screen.getByText("75% verified")).toBeInTheDocument();
    expect(screen.getByText("2 need review")).toBeInTheDocument();
    expect(screen.getByText("Index refresh pending")).toBeInTheDocument();
  });

  it("keeps an overview error explicit", () => {
    render(
      <MemoryOverview
        state={{
          status: "error",
          data: null,
          error: "memory_unavailable"
        }}
        sourceCount={0}
      />
    );
    expect(screen.getByText("Overview unavailable")).toBeInTheDocument();
  });
});
