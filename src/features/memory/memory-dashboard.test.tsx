import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LaunchGate } from "@/components/launch-gate";
import { MemoryDashboard } from "./memory-dashboard";

const firstId = "d251bc66-3e45-5d03-8d78-1e76919642f9";
const secondId = "27acb99a-4de2-5ac5-a1e2-55bc61cfbd4a";

const overview = {
  generatedAt: "2026-07-26T10:00:00Z",
  totals: {
    entries: 2,
    familiars: 2,
    verified: 1,
    needsReview: 0,
    unknown: 1
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

const entries = [
  {
    id: firstId,
    familiarId: "sage",
    title: "Architecture decisions",
    updatedAt: "2026-07-26T09:56:00Z",
    relativeUpdatedAt: "4m ago",
    excerpt: "Synthetic architecture.",
    source: { kind: "coven-origin", label: "Coven origin" },
    privacy: { classification: null, revealRequired: null },
    verification: { state: "unknown" }
  },
  {
    id: secondId,
    familiarId: "echo",
    title: "Public handoff",
    updatedAt: "2026-07-20T09:56:00Z",
    relativeUpdatedAt: "6d ago",
    excerpt: "A safe public handoff.",
    source: { kind: "promotion", label: "Promoted memory" },
    privacy: { classification: "public", revealRequired: false },
    verification: { state: "verified" }
  }
];

function detail(id: string) {
  const entry = entries.find((candidate) => candidate.id === id) ?? entries[0];
  return {
    id,
    familiarId: entry.familiarId,
    title: entry.title,
    updatedAt: entry.updatedAt,
    source: entry.source,
    content: `# ${entry.title}\n\nSynthetic durable fact.`,
    contentFormat: "markdown",
    privacy: {
      ...entry.privacy,
      reason:
        entry.privacy.classification === "public"
          ? "classified public"
          : "privacy taxonomy unavailable"
    },
    verification: {
      state: entry.verification.state,
      reason: "synthetic verification state"
    },
    attestation: null,
    supersession: { supersedes: null, supersededBy: null }
  };
}

function api(data: unknown, status = 200) {
  return Promise.resolve(
    Response.json(
      status < 400 ? { ok: true, data } : { ok: false, code: data },
      { status }
    )
  );
}

function installApi(options: {
  list?: unknown;
  listStatus?: number;
  overview?: unknown;
  overviewStatus?: number;
} = {}) {
  const fetchMock = vi.fn((input: string | URL | Request) => {
    const url = String(input);
    if (url === "/api/session/status" || url === "/api/session/logout") {
      return Promise.resolve(new Response(null, { status: 200 }));
    }
    if (url === "/api/memory/overview") {
      return api(
        options.overview ?? overview,
        options.overviewStatus ?? 200
      );
    }
    if (url === "/api/memory") {
      return api(options.list ?? entries, options.listStatus ?? 200);
    }
    const id = url.split("/").at(-1)!;
    return api(detail(id));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("MemoryDashboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("browses, filters, reveals, navigates narrow state, and logs out", async () => {
    installApi();
    const { container } = render(
      <LaunchGate>
        <MemoryDashboard />
      </LaunchGate>
    );

    expect(await screen.findByRole("heading", { name: "Memory" })).toBeVisible();
    expect(
      await screen.findByRole("option", { name: /Architecture decisions/ })
    ).toHaveAttribute("aria-selected", "true");
    expect(
      await screen.findByText("Content hidden until you reveal it")
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Reveal memory content" }));
    expect(await screen.findByText("Synthetic durable fact.")).toBeVisible();

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search memories" }),
      { target: { value: "does not exist" } }
    );
    expect(
      screen.getByText("No memories match these filters")
    ).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);

    fireEvent.click(
      await screen.findByRole("option", { name: /Public handoff/ })
    );
    await waitFor(() =>
      expect(container.querySelector("#reader-title")).toHaveTextContent(
        "Public handoff"
      )
    );
    expect(
      container.querySelector(".memory-dashboard")
    ).toHaveAttribute("data-narrow-pane", "reader");
    fireEvent.click(screen.getByRole("button", { name: "Back to memories" }));
    expect(
      container.querySelector(".memory-dashboard")
    ).toHaveAttribute("data-narrow-pane", "list");

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(
      await screen.findByRole("heading", { name: "Memory is locked" })
    ).toBeVisible();
    expect(screen.queryByText("Synthetic durable fact.")).not.toBeInTheDocument();
  });

  it("shows list failure instead of a convincing empty state", async () => {
    installApi({ list: "memory_unavailable", listStatus: 503 });
    render(
      <LaunchGate>
        <MemoryDashboard />
      </LaunchGate>
    );

    expect(await screen.findByText("Couldn't load memory")).toBeVisible();
    expect(screen.queryByText("No memories yet")).not.toBeInTheDocument();
  });

  it("keeps a successful empty list usable when overview fails", async () => {
    installApi({
      list: [],
      overview: "memory_unavailable",
      overviewStatus: 503
    });
    render(
      <LaunchGate>
        <MemoryDashboard />
      </LaunchGate>
    );

    expect(await screen.findByText("No memories yet")).toBeVisible();
    expect(screen.getByText("Overview unavailable")).toBeVisible();
  });
});
