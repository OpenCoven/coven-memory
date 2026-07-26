import { fireEvent, render, screen, within } from "@testing-library/react";
import type { MemoryOverview as Overview } from "@/lib/memory-types";
import { MemoryDiagnostics, MemoryOverview } from "./memory-overview";

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
  it("keeps a truthful compact summary visible", () => {
    render(
      <MemoryOverview
        state={{ status: "ready", data: unavailable, error: null }}
        sourceCount={2}
      />
    );

    const compactSummary = screen.getByLabelText("Memory summary");
    expect(within(compactSummary).getByText("12 memories")).toBeVisible();
    expect(within(compactSummary).getByText("2 sources")).toBeVisible();
    expect(
      within(compactSummary).getByText("Verification unavailable")
    ).toBeVisible();
    expect(screen.queryByText(/0% verified/i)).not.toBeInTheDocument();
    expect(screen.queryByText("System details")).not.toBeInTheDocument();
  });

  it("uses the design-system expander for closed secondary diagnostics", () => {
    const { container } = render(
      <MemoryDiagnostics overview={unavailable} sourceCount={2} />
    );

    const disclosure = container.querySelector(
      "details.memory-overview-details"
    );
    const disclosureLabel = screen.getByText("System details", {
      selector: "summary"
    });

    expect(disclosure).toHaveClass("cv-expander");
    expect(disclosureLabel).toHaveClass("cv-expander-summary");
    expect(container.querySelector(".cv-expander-body")).toBeInTheDocument();
    expect(disclosure).not.toHaveAttribute("open");
    fireEvent.click(disclosureLabel);
    expect(disclosure).toHaveAttribute("open");
  });

  it("uses singular grammar for authoritative one-item counts", () => {
    render(
      <MemoryOverview
        state={{
          status: "ready",
          data: {
            ...unavailable,
            totals: {
              entries: 1,
              familiars: 1,
              verified: 1,
              needsReview: 1,
              unknown: 0
            },
            capabilities: {
              ...unavailable.capabilities,
              verification: true
            }
          },
          error: null
        }}
        sourceCount={1}
      />
    );

    const compactSummary = screen.getByLabelText("Memory summary");
    for (const count of [
      "1 memory",
      "1 familiar",
      "1 source",
      "1 needs review"
    ]) {
      expect(within(compactSummary).getByText(count)).toBeVisible();
    }
  });

  it("renders known verification counts and system check details", () => {
    const knownOverview: Overview = {
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
    };
    render(
      <>
        <MemoryOverview
          state={{ status: "ready", data: knownOverview, error: null }}
          sourceCount={1}
        />
        <MemoryDiagnostics overview={knownOverview} sourceCount={1} />
      </>
    );

    const compactSummary = screen.getByLabelText("Memory summary");
    expect(within(compactSummary).getByText("75% verified")).toBeVisible();
    expect(within(compactSummary).getByText("2 need review")).toBeVisible();

    const details = screen
      .getByText("System details", { selector: "summary" })
      .closest("details");
    expect(details).not.toBeNull();
    fireEvent.click(within(details as HTMLElement).getByText("System details"));
    expect(
      within(details as HTMLElement).getByText("Index refresh pending")
    ).toBeVisible();
  });

  it("distinguishes unavailable source data from an authoritative zero", () => {
    const { rerender } = render(
      <>
        <MemoryOverview
          state={{ status: "ready", data: unavailable, error: null }}
          sourceCount={null}
        />
        <MemoryDiagnostics overview={unavailable} sourceCount={null} />
      </>
    );

    expect(
      within(screen.getByLabelText("Memory summary")).getByText(
        "Sources unavailable"
      )
    ).toBeVisible();
    const details = screen
      .getByText("System details", { selector: "summary" })
      .closest("details");
    expect(details).not.toBeNull();
    fireEvent.click(within(details as HTMLElement).getByText("System details"));
    expect(
      within(details as HTMLElement).getByText("Sources unavailable")
    ).toBeVisible();

    rerender(
      <>
        <MemoryOverview
          state={{ status: "ready", data: unavailable, error: null }}
          sourceCount={0}
        />
        <MemoryDiagnostics overview={unavailable} sourceCount={0} />
      </>
    );

    expect(
      within(screen.getByLabelText("Memory summary")).getByText("0 sources")
    ).toBeVisible();
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
