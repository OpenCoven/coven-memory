import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
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
    attestationMetadata: null,
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

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<EventListener>();
  const media = "(max-width: 56rem)";
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media,
    onchange: null,
    addEventListener: vi.fn(
      (type: string, listener: EventListener) => {
        if (type === "change") {
          listeners.add(listener);
        }
      }
    ),
    removeEventListener: vi.fn(
      (type: string, listener: EventListener) => {
        if (type === "change") {
          listeners.delete(listener);
        }
      }
    )
  } as unknown as MediaQueryList;
  vi.stubGlobal("matchMedia", vi.fn(() => mediaQuery));

  return {
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches, media } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    }
  };
}

function installApi(options: {
  list?: unknown;
  listStatus?: number;
  overview?: unknown;
  overviewStatus?: number;
  reloadList?: () => Promise<Response>;
} = {}) {
  let listRequests = 0;
  const fetchMock = vi.fn((input: string | URL | Request) => {
    const url = String(input);
    if (url === "/api/session/status") {
      return Promise.resolve(
        Response.json({
          ok: true,
          expiresAt: new Date(Date.now() + 60_000).toISOString()
        })
      );
    }
    if (url === "/api/session/logout") {
      return Promise.resolve(new Response(null, { status: 200 }));
    }
    if (url === "/api/memory/overview") {
      return api(
        options.overview ?? overview,
        options.overviewStatus ?? 200
      );
    }
    if (url === "/api/memory") {
      listRequests += 1;
      if (listRequests > 1 && options.reloadList) {
        return options.reloadList();
      }
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
    installMatchMedia(true);
    installApi();
    const { container } = render(
      <LaunchGate>
        <MemoryDashboard />
      </LaunchGate>
    );

    expect(await screen.findByRole("heading", { name: "Memory" })).toBeVisible();
    const firstRow = await screen.findByRole("button", {
      name: /Architecture decisions/
    });
    expect(firstRow).toHaveAttribute("aria-current", "true");
    expect(
      await screen.findByText("Content hidden until you reveal it")
    ).toBeVisible();
    fireEvent.click(firstRow);
    expect(screen.queryByText("Loading memory…")).not.toBeInTheDocument();
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

    const secondRow = await screen.findByRole("button", {
      name: /Public handoff/
    });
    fireEvent.click(secondRow);
    await waitFor(() =>
      expect(container.querySelector("#reader-title")).toHaveTextContent(
        "Public handoff"
      )
    );
    expect(container.querySelector("#reader-title")).toHaveAttribute(
      "tabindex",
      "-1"
    );
    await waitFor(() =>
      expect(container.querySelector("#reader-title")).toHaveFocus()
    );
    expect(
      container.querySelector(".memory-dashboard")
    ).toHaveAttribute("data-narrow-pane", "reader");
    fireEvent.click(screen.getByRole("button", { name: "Back to memories" }));
    await waitFor(() => {
      expect(
        container.querySelector(".memory-dashboard")
      ).toHaveAttribute("data-narrow-pane", "list");
      expect(secondRow).toHaveFocus();
    });

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(
      await screen.findByRole("heading", { name: "Memory is locked" })
    ).toBeVisible();
    expect(screen.queryByText("Synthetic durable fact.")).not.toBeInTheDocument();
  });

  it("renders the approved read-only library, index, reader, and provenance shell", async () => {
    installMatchMedia(false);
    installApi();
    render(
      <LaunchGate>
        <MemoryDashboard />
      </LaunchGate>
    );

    expect(
      await screen.findByRole("navigation", { name: "Memory library" })
    ).toBeVisible();
    expect(
      screen.getByRole("searchbox", { name: "Search memories" })
    ).toHaveAttribute("placeholder", "Search memories…");
    expect(
      screen.getByRole("region", { name: "Memory index" })
    ).toBeVisible();
    expect(
      await screen.findByRole("complementary", {
        name: "Memory provenance"
      })
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Memory reader" })
    ).toBeVisible();
    expect(screen.getByText("Protected by default")).toBeVisible();

    expect(
      screen.queryByRole("button", { name: "New memory" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Preview state")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit content" })
    ).not.toBeInTheDocument();
  });

  it("does not steal focus when a row opens in the wide master-detail layout", async () => {
    installMatchMedia(false);
    installApi();
    const { container } = render(
      <LaunchGate>
        <MemoryDashboard />
      </LaunchGate>
    );

    const secondRow = await screen.findByRole("button", {
      name: /Public handoff/
    });
    act(() => secondRow.focus());
    fireEvent.click(secondRow);
    await waitFor(() =>
      expect(container.querySelector("#reader-title")).toHaveTextContent(
        "Public handoff"
      )
    );
    const readerTitle = container.querySelector("#reader-title");

    expect(secondRow).toHaveFocus();
    expect(readerTitle).not.toHaveFocus();
  });

  it("keeps focus in the visible pane across responsive breakpoint changes", async () => {
    const viewport = installMatchMedia(false);
    installApi();
    const { container } = render(
      <LaunchGate>
        <MemoryDashboard />
      </LaunchGate>
    );

    const secondRow = await screen.findByRole("button", {
      name: /Public handoff/
    });
    fireEvent.click(secondRow);
    await waitFor(() =>
      expect(container.querySelector("#reader-title")).toHaveTextContent(
        "Public handoff"
      )
    );
    const readerTitle = container.querySelector<HTMLElement>("#reader-title");

    act(() => secondRow.focus());
    act(() => viewport.setMatches(true));
    expect(
      container.querySelector(".memory-dashboard")
    ).toHaveAttribute("data-narrow-pane", "list");
    expect(secondRow).toHaveFocus();

    act(() => viewport.setMatches(false));
    act(() => readerTitle?.focus());
    act(() => viewport.setMatches(true));
    expect(
      container.querySelector(".memory-dashboard")
    ).toHaveAttribute("data-narrow-pane", "reader");
    expect(readerTitle).toHaveFocus();

    act(() => viewport.setMatches(false));
    const refresh = screen.getByRole("button", { name: "Refresh" });
    act(() => refresh.focus());
    act(() => viewport.setMatches(true));
    expect(
      container.querySelector(".memory-dashboard")
    ).toHaveAttribute("data-narrow-pane", "list");
    expect(refresh).toHaveFocus();
  });

  it("returns focus to the list heading while a refresh is still loading", async () => {
    installMatchMedia(true);
    installApi({
      reloadList: () => new Promise<Response>(() => {})
    });
    const { container } = render(
      <LaunchGate>
        <MemoryDashboard />
      </LaunchGate>
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /Public handoff/ })
    );
    await waitFor(() =>
      expect(container.querySelector("#reader-title")).toHaveFocus()
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Loading memories...")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Back to memories" })
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Memory index" })
      ).toHaveFocus()
    );
  });

  it.each([
    {
      state: "failed",
      response: () => api("memory_unavailable", 503),
      message: "Couldn't load memory"
    },
    {
      state: "empty",
      response: () => api([]),
      message: "No memories yet"
    }
  ])(
    "returns focus to the list heading when a refreshed list is $state",
    async ({ response, message }) => {
      installMatchMedia(true);
      installApi({ reloadList: response });
      const { container } = render(
        <LaunchGate>
          <MemoryDashboard />
        </LaunchGate>
      );

      fireEvent.click(
        await screen.findByRole("button", { name: /Public handoff/ })
      );
      await waitFor(() =>
        expect(container.querySelector("#reader-title")).toHaveFocus()
      );
      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
      expect(await screen.findByText(message)).toBeVisible();
      fireEvent.click(
        screen.getByRole("button", { name: "Back to memories" })
      );

      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: "Memory index" })
        ).toHaveFocus()
      );
    }
  );

  it("cancels superseded focus-return frames and pending frames on cleanup", async () => {
    installMatchMedia(true);
    let nextFrame = 0;
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => {
        nextFrame += 1;
        return nextFrame;
      })
    );
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
    installApi();
    const view = render(
      <LaunchGate>
        <MemoryDashboard />
      </LaunchGate>
    );

    const secondRow = await screen.findByRole("button", {
      name: /Public handoff/
    });
    fireEvent.click(secondRow);
    const back = await screen.findByRole("button", {
      name: "Back to memories"
    });
    fireEvent.click(back);
    fireEvent.click(secondRow);
    expect(cancelAnimationFrame).toHaveBeenNthCalledWith(1, 1);

    fireEvent.click(back);
    view.unmount();
    expect(cancelAnimationFrame).toHaveBeenNthCalledWith(2, 2);
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(2);
  });

  it("shows list failure instead of a convincing empty state", async () => {
    installMatchMedia(false);
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
    installMatchMedia(false);
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
