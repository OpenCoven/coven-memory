import { fireEvent, render, screen } from "@testing-library/react";
import type { MemoryDetail } from "@/lib/memory-types";
import { MemoryReader } from "./memory-reader";

const hidden: MemoryDetail = {
  id: "d251bc66-3e45-5d03-8d78-1e76919642f9",
  familiarId: "sage",
  title: "Architecture decisions",
  updatedAt: "2026-07-26T10:00:00Z",
  source: { kind: "coven-origin", label: "Coven origin" },
  content: "# Decisions\n\nDurable fact.\n\n<script>unsafe()</script>",
  contentFormat: "markdown",
  privacy: {
    classification: null,
    revealRequired: null,
    reason: "privacy taxonomy unavailable"
  },
  verification: {
    state: "unknown",
    reason: "verification metadata unavailable"
  },
  attestationMetadata: null,
  supersession: { supersedes: null, supersededBy: null }
};

describe("MemoryReader", () => {
  it("hides unknown privacy until explicit reveal and omits raw HTML", () => {
    render(
      <MemoryReader
        state={{ status: "ready", data: hidden, error: null }}
        selectedId={hidden.id}
        onBack={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(
      screen.getByText("Content hidden until you reveal it")
    ).toBeInTheDocument();
    expect(screen.queryByText("Durable fact.")).not.toBeInTheDocument();
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("complementary", { name: "Memory provenance" })
    ).toHaveTextContent("Coven origin");

    fireEvent.click(
      screen.getByRole("button", { name: "Reveal memory content" })
    );

    expect(screen.getByText("Durable fact.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Decisions" })).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.queryByText("<script>unsafe()</script>")).not.toBeInTheDocument();

    const view = screen.getByRole("group", { name: "Content view" });
    const rendered = screen.getByRole("button", { name: "Rendered" });
    const raw = screen.getByRole("button", { name: "Raw" });
    expect(view).toContainElement(rendered);
    expect(view).toContainElement(raw);
    expect(rendered).toHaveClass("cv-segmented-item");
    expect(rendered).toHaveAttribute("aria-pressed", "true");
    expect(raw).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(raw);
    expect(document.querySelector(".memory-raw code")?.textContent).toBe(
      hidden.content
    );
    expect(document.querySelector("script")).toBeNull();
    expect(raw).toHaveAttribute("aria-pressed", "true");
    expect(rendered).toHaveAttribute("aria-pressed", "false");
  });

  it("does not let verified state bypass privacy and resets reveal for another entry", () => {
    const { rerender } = render(
      <MemoryReader
        state={{
          status: "ready",
          data: {
            ...hidden,
            verification: { state: "verified", reason: "Manifest matched" }
          },
          error: null
        }}
        selectedId={hidden.id}
        onBack={vi.fn()}
        onRetry={vi.fn()}
      />
    );
    expect(screen.queryByText("Durable fact.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reveal memory content" }));
    expect(screen.getByText("Durable fact.")).toBeInTheDocument();

    const next = { ...hidden, id: "27acb99a-4de2-5ac5-a1e2-55bc61cfbd4a" };
    rerender(
      <MemoryReader
        state={{ status: "ready", data: next, error: null }}
        selectedId={next.id}
        onBack={vi.fn()}
        onRetry={vi.fn()}
      />
    );
    expect(
      screen.getByText("Content hidden until you reveal it")
    ).toBeInTheDocument();
    expect(screen.queryByText("Durable fact.")).not.toBeInTheDocument();

    rerender(
      <MemoryReader
        state={{
          status: "ready",
          data: hidden,
          error: null
        }}
        selectedId={hidden.id}
        onBack={vi.fn()}
        onRetry={vi.fn()}
      />
    );
    expect(
      screen.getByText("Content hidden until you reveal it")
    ).toBeInTheDocument();
    expect(screen.queryByText("Durable fact.")).not.toBeInTheDocument();
  });

  it("shows explicitly public content, raw mode, and the narrow back action", () => {
    const publicDetail: MemoryDetail = {
      ...hidden,
      attestationMetadata: { fieldCount: 1 },
      privacy: {
        classification: "public",
        revealRequired: false,
        reason: "classified public"
      }
    };
    render(
      <MemoryReader
        state={{ status: "ready", data: publicDetail, error: null }}
        selectedId={publicDetail.id}
        capabilities={{
          detail: true,
          verification: true,
          attestationMetadata: true,
          supersessionHistory: false,
          mutations: false
        }}
        onBack={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByText("Durable fact.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to memories" })
    ).toBeInTheDocument();
    expect(screen.getByText("1 metadata field available")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Raw" }));
    expect(document.querySelector(".memory-raw code")?.textContent).toBe(
      publicDetail.content
    );
  });

  it("uses plural attestation metadata grammar for zero and multiple fields", () => {
    const publicDetail: MemoryDetail = {
      ...hidden,
      attestationMetadata: { fieldCount: 0 },
      privacy: {
        classification: "public",
        revealRequired: false,
        reason: "classified public"
      }
    };
    const capabilities = {
      detail: true,
      verification: true,
      attestationMetadata: true,
      supersessionHistory: false,
      mutations: false
    };
    const { rerender } = render(
      <MemoryReader
        state={{ status: "ready", data: publicDetail, error: null }}
        selectedId={publicDetail.id}
        capabilities={capabilities}
        onBack={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByText("0 metadata fields available")).toBeInTheDocument();

    const multiple = {
      ...publicDetail,
      attestationMetadata: { fieldCount: 2 }
    };
    rerender(
      <MemoryReader
        state={{ status: "ready", data: multiple, error: null }}
        selectedId={multiple.id}
        capabilities={capabilities}
        onBack={vi.fn()}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByText("2 metadata fields available")).toBeInTheDocument();
  });

  it("renders loading, no-selection, and retryable detail errors honestly", () => {
    const { container, rerender } = render(
      <MemoryReader
        state={{ status: "idle", data: null, error: null }}
        selectedId={null}
        onBack={vi.fn()}
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByText("Select a memory to read")).toBeInTheDocument();
    expect(container.querySelector(".memory-reader-pane")).toHaveAttribute(
      "tabindex",
      "-1"
    );

    rerender(
      <MemoryReader
        state={{ status: "loading", data: null, error: null }}
        selectedId={hidden.id}
        onBack={vi.fn()}
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByText("Loading memory…")).toBeInTheDocument();
    const stableReader = container.querySelector(".memory-reader-pane");

    const onRetry = vi.fn();
    rerender(
      <MemoryReader
        state={{ status: "error", data: null, error: "memory_unavailable" }}
        selectedId={hidden.id}
        onBack={vi.fn()}
        onRetry={onRetry}
      />
    );
    expect(screen.getByText("Couldn't open this memory")).toBeInTheDocument();
    expect(container.querySelector(".memory-reader-pane")).toBe(stableReader);
    fireEvent.click(screen.getByRole("button", { name: "Retry memory detail" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
