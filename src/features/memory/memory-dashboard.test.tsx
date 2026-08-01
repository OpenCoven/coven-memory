import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor
} from "@testing-library/react";
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
  detailResponse?: (id: string) => Promise<Response>;
} = {}) {
  let listRequests = 0;
  const fetchMock = vi.fn((input: string | URL | Request) => {
    const url = String(input);
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
    return options.detailResponse?.(id) ?? api(detail(id));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function installLayoutStorage() {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value)
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage
  });
  return storage;
}

describe("MemoryDashboard", () => {
  const layoutStorage = new Map<string, string>();
  const storageAdapter: Storage = {
    get length() {
      return layoutStorage.size;
    },
    clear: () => layoutStorage.clear(),
    getItem: (key) => layoutStorage.get(key) ?? null,
    key: (index) => [...layoutStorage.keys()][index] ?? null,
    removeItem: (key) => layoutStorage.delete(key),
    setItem: (key, value) => layoutStorage.set(key, value)
  };

  beforeEach(() => {
    layoutStorage.clear();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: storageAdapter
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, "localStorage");
    window.history.replaceState(null, "", "/");
  });

  it("browses, filters, reveals, and navigates narrow state without a lock lifecycle", async () => {
    installMatchMedia(true);
    const fetchMock = installApi();
    const { container } = render(<MemoryDashboard />);

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
    expect(container.querySelector(".memory-reader-pane")).toHaveAttribute(
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

    expect(
      screen.queryByRole("button", { name: "Log out" })
    ).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).startsWith("/api/session/")
      )
    ).toBe(false);
  });

  it("uses the approved Library, Memory Index, and Reader workspace order", async () => {
    installMatchMedia(false);
    installApi();
    const { container } = render(<MemoryDashboard />);

    await screen.findByLabelText("Memory summary");
    const workspace = container.querySelector(".memory-workspace");
    const orderedSurface = [
      container.querySelector(".memory-library-slot"),
      container.querySelector(".memory-list-slot"),
      container.querySelector(".memory-reader-slot")
    ];
    expect(workspace).not.toBeNull();
    expect(orderedSurface).not.toContain(null);
    expect(workspace?.children).toHaveLength(3);
    expect(workspace).toHaveAttribute("data-library-width", "216");
    expect(workspace).not.toHaveAttribute("style");
    orderedSurface.forEach((surface, index) => {
      expect(workspace?.children[index]).toBe(surface);
    });
    expect(
      screen.getByRole("navigation", { name: "Memory library" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Memory filters" })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("complementary", {
        name: "Memory provenance"
      })
    ).toBeInTheDocument();
    expect(
      container.querySelector(".memory-reader-layout")
    ).toHaveAttribute("data-inspector-width", "288");
    expect(
      container.querySelector(".memory-reader-layout")
    ).not.toHaveAttribute("style");
    expect(screen.getByText("Protected by default")).toBeVisible();
  });

  it("collapses the Library rail without collapsing the Memory Index", async () => {
    installMatchMedia(false);
    installLayoutStorage();
    installApi();
    const { container } = render(<MemoryDashboard />);

    await screen.findByRole("navigation", { name: "Memory library" });
    await screen.findByRole("heading", { name: "Architecture decisions" });
    const workspace = container.querySelector<HTMLElement>(".memory-workspace");
    expect(workspace).toHaveAttribute("data-library-width", "216");

    fireEvent.click(screen.getByRole("button", { name: "Collapse Library" }));

    expect(screen.getByRole("button", { name: "Show Library" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Memory index" })).toBeVisible();
    expect(workspace).toHaveAttribute("data-library-width", "44");

    fireEvent.click(screen.getByRole("button", { name: "Show Library" }));
    expect(screen.getByRole("button", { name: "Collapse Library" })).toBeVisible();
    expect(workspace).toHaveAttribute("data-library-width", "216");
  });

  it("collapses and restores Library and Provenance independently", async () => {
    installMatchMedia(false);
    installApi();
    const { container } = render(<MemoryDashboard />);

    await screen.findByRole("heading", { name: "Architecture decisions" });
    const workspace = container.querySelector<HTMLElement>(".memory-workspace");
    const inspector = screen.getByRole("complementary", {
      name: "Memory provenance"
    });

    fireEvent.click(screen.getByRole("button", { name: "Collapse Library" }));
    expect(screen.getByRole("button", { name: "Show Library" })).toBeVisible();
    expect(inspector).toHaveAttribute("data-collapsed", "false");
    expect(screen.getByRole("button", { name: "Collapse provenance" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Collapse provenance" }));
    expect(screen.getByRole("button", { name: "Show provenance" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Show Library" })).toBeVisible();
    expect(inspector).toHaveAttribute("data-collapsed", "true");
    expect(workspace).toHaveAttribute("data-library-width", "44");

    fireEvent.click(screen.getByRole("button", { name: "Show Library" }));
    expect(screen.getByRole("button", { name: "Collapse Library" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Show provenance" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Show provenance" }));
    expect(screen.getByRole("button", { name: "Collapse provenance" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Collapse Library" })).toBeVisible();
    expect(inspector).toHaveAttribute("data-collapsed", "false");
  });

  it("resizes the Library rail with keyboard steps and bounds", async () => {
    installMatchMedia(false);
    installLayoutStorage();
    installApi();
    const { container } = render(<MemoryDashboard />);

    const separator = await screen.findByRole("separator", {
      name: "Resize Library"
    });
    await screen.findByRole("heading", { name: "Architecture decisions" });
    const workspace = container.querySelector<HTMLElement>(".memory-workspace");
    expect(separator).toHaveAttribute("aria-orientation", "vertical");
    expect(separator).toHaveAttribute("aria-valuemin", "144");
    expect(separator).toHaveAttribute("aria-valuemax", "360");
    expect(separator).toHaveAttribute("aria-valuenow", "216");

    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(separator).toHaveAttribute("aria-valuenow", "200");
    expect(workspace).toHaveAttribute("data-library-width", "200");
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(separator).toHaveAttribute("aria-valuenow", "216");
    fireEvent.keyDown(separator, { key: "Home" });
    expect(separator).toHaveAttribute("aria-valuenow", "144");
    fireEvent.keyDown(separator, { key: "End" });
    expect(separator).toHaveAttribute("aria-valuenow", "360");
  });

  it("resizes the Provenance rail with keyboard steps and bounds", async () => {
    installMatchMedia(false);
    installLayoutStorage();
    installApi();
    const { container } = render(<MemoryDashboard />);

    const separator = await screen.findByRole("separator", {
      name: "Resize provenance"
    });
    const readerLayout = container.querySelector<HTMLElement>(
      ".memory-reader-layout"
    );
    expect(separator).toHaveAttribute("aria-orientation", "vertical");
    expect(separator).toHaveAttribute("aria-valuemin", "224");
    expect(separator).toHaveAttribute("aria-valuemax", "384");
    expect(separator).toHaveAttribute("aria-valuenow", "288");

    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(separator).toHaveAttribute("aria-valuenow", "304");
    expect(readerLayout).toHaveAttribute("data-inspector-width", "304");
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(separator).toHaveAttribute("aria-valuenow", "288");
    fireEvent.keyDown(separator, { key: "Home" });
    expect(separator).toHaveAttribute("aria-valuenow", "224");
    fireEvent.keyDown(separator, { key: "End" });
    expect(separator).toHaveAttribute("aria-valuenow", "384");
  });

  it("restores collapsed rails and committed widths from storage", async () => {
    installMatchMedia(false);
    installLayoutStorage();
    installApi();
    const first = render(<MemoryDashboard />);
    await screen.findByRole("heading", { name: "Architecture decisions" });

    fireEvent.keyDown(
      screen.getByRole("separator", { name: "Resize Library" }),
      { key: "ArrowRight" }
    );
    fireEvent.keyDown(
      screen.getByRole("separator", { name: "Resize Library" }),
      { key: "ArrowRight" }
    );
    fireEvent.keyDown(
      screen.getByRole("separator", { name: "Resize provenance" }),
      { key: "ArrowRight" }
    );
    fireEvent.keyDown(
      screen.getByRole("separator", { name: "Resize provenance" }),
      { key: "ArrowRight" }
    );
    fireEvent.click(screen.getByRole("button", { name: "Collapse Library" }));
    fireEvent.click(screen.getByRole("button", { name: "Collapse provenance" }));
    first.unmount();

    const second = render(<MemoryDashboard />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Show Library" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Show provenance" })).toBeVisible();
    });
    expect(window.localStorage.getItem("coven-memory:layout:v1")).toContain(
      '"collapsed":true'
    );
    fireEvent.click(screen.getByRole("button", { name: "Show Library" }));
    fireEvent.click(screen.getByRole("button", { name: "Show provenance" }));
    expect(
      screen.getByRole("separator", { name: "Resize Library" })
    ).toHaveAttribute("aria-valuenow", "248");
    expect(
      screen.getByRole("separator", { name: "Resize provenance" })
    ).toHaveAttribute("aria-valuenow", "256");
    second.unmount();
  });

  it("commits Library pointer resizing only on pointerup", async () => {
    installMatchMedia(false);
    installLayoutStorage();
    installApi();
    const { container } = render(<MemoryDashboard />);

    const separator = await screen.findByRole("separator", {
      name: "Resize Library"
    });
    await screen.findByRole("heading", { name: "Architecture decisions" });
    const workspace = container.querySelector<HTMLElement>(".memory-workspace");
    const persistedBefore = window.localStorage.getItem("coven-memory:layout:v1");

    fireEvent.pointerDown(separator, { pointerId: 7, clientX: 280 });
    fireEvent.pointerMove(separator, { pointerId: 7, clientX: 300 });
    expect(workspace).toHaveAttribute("data-library-width", "304");
    expect(window.localStorage.getItem("coven-memory:layout:v1")).toBe(
      persistedBefore
    );

    fireEvent.pointerUp(separator, { pointerId: 7, clientX: 300 });
    expect(window.localStorage.getItem("coven-memory:layout:v1")).toContain(
      '"width":304'
    );
  });

  it("does not render the desktop Library separator in the narrow single-pane layout", async () => {
    installMatchMedia(true);
    installLayoutStorage();
    installApi();
    render(<MemoryDashboard />);

    await screen.findByRole("heading", { name: "Memory" });
    expect(
      screen.queryByRole("separator", { name: "Resize Library" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("separator", { name: "Resize provenance" })
    ).not.toBeInTheDocument();
  });

  it("does not steal focus when a row opens in the wide master-detail layout", async () => {
    installMatchMedia(false);
    installApi();
    const { container } = render(<MemoryDashboard />);

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

  it("focuses one stable reader target through narrow loading and detail error", async () => {
    installMatchMedia(true);
    let resolveSecondDetail!: (response: Response) => void;
    installApi({
      detailResponse: (id) =>
        id === firstId
          ? api(detail(id))
          : new Promise<Response>((resolve) => {
              resolveSecondDetail = resolve;
            })
    });
    const { container } = render(<MemoryDashboard />);

    fireEvent.click(
      await screen.findByRole("button", { name: /Public handoff/ })
    );
    const readerPane = container.querySelector<HTMLElement>(
      ".memory-reader-pane"
    );
    expect(await screen.findByText("Loading memory…")).toBeVisible();
    await waitFor(() => expect(readerPane).toHaveFocus());

    act(() => {
      resolveSecondDetail(
        Response.json(
          { ok: false, code: "memory_unavailable" },
          { status: 503 }
        )
      );
    });

    expect(
      await screen.findByRole("heading", {
        name: "Couldn't open this memory"
      })
    ).toBeVisible();
    expect(container.querySelector(".memory-reader-pane")).toBe(readerPane);
    expect(readerPane).toHaveFocus();
  });

  it("keeps focus in the visible pane across responsive breakpoint changes", async () => {
    const viewport = installMatchMedia(false);
    installApi();
    const { container } = render(<MemoryDashboard />);

    const secondRow = await screen.findByRole("button", {
      name: /Public handoff/
    });
    fireEvent.click(secondRow);
    await waitFor(() =>
      expect(container.querySelector("#reader-title")).toHaveTextContent(
        "Public handoff"
      )
    );
    const readerTitle =
      container.querySelector<HTMLElement>("#reader-title");

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
    const { container } = render(<MemoryDashboard />);

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
      const { container } = render(<MemoryDashboard />);

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
    const view = render(<MemoryDashboard />);

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
    render(<MemoryDashboard />);

    expect(await screen.findByText("Couldn't load memory")).toBeVisible();
    expect(screen.queryByText("No memories yet")).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Memory summary")).getByText(
        "Sources unavailable"
      )
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "All memories, count unavailable"
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "All memories, 0" })
    ).not.toBeInTheDocument();
  });

  it("replaces memory panes with an update-required gate", async () => {
    installMatchMedia(false);
    installApi({
      list: "daemon_update_required",
      listStatus: 426,
      overview: "daemon_update_required",
      overviewStatus: 426
    });

    render(<MemoryDashboard />);

    expect(
      await screen.findByRole("heading", {
        name: "Update Coven to open this version of Memory"
      })
    ).toBeVisible();
    expect(screen.queryByText("No memories yet")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reveal memory content" })
    ).not.toBeInTheDocument();
  });

  it("exposes a state-aware daemon status when narrow copy is visually compact", async () => {
    installMatchMedia(true);
    installApi({ list: "memory_unavailable", listStatus: 503 });
    render(<MemoryDashboard />);

    const status = await screen.findByRole("status", {
      name: "Daemon unavailable"
    });
    expect(
      within(status).getByText("!", {
        selector: ".memory-status-symbol"
      })
    ).toBeInTheDocument();
  });

  it("uses human-facing labels in active filter chips", async () => {
    installMatchMedia(false);
    installApi();
    render(<MemoryDashboard />);
    await screen.findByRole("button", { name: /Architecture decisions/ });

    fireEvent.change(screen.getByRole("combobox", { name: "Source" }), {
      target: { value: "promotion" }
    });
    fireEvent.change(
      screen.getAllByRole("combobox", { name: "Verification" })[0],
      { target: { value: "needs-review" } }
    );
    fireEvent.change(
      screen.getAllByRole("combobox", { name: "Freshness" })[0],
      { target: { value: "recent" } }
    );

    const active = screen.getByLabelText("Active filters");
    expect(within(active).getByText("Source: Promoted memory")).toBeVisible();
    expect(within(active).getByText("State: Needs review")).toBeVisible();
    expect(within(active).getByText("Updated: Last 30 days")).toBeVisible();
    expect(within(active).queryByText(/needs-review/)).not.toBeInTheDocument();
  });

  it("keeps a successful empty list authoritative", async () => {
    installMatchMedia(false);
    installApi({ list: [] });
    render(<MemoryDashboard />);

    expect(await screen.findByText("No memories yet")).toBeVisible();
    expect(
      within(screen.getByLabelText("Memory summary")).getByText("0 sources")
    ).toBeVisible();
  });

  it("keeps a successful empty list usable when overview fails", async () => {
    installMatchMedia(false);
    installApi({
      list: [],
      overview: "memory_unavailable",
      overviewStatus: 503
    });
    render(<MemoryDashboard />);

    expect(await screen.findByText("No memories yet")).toBeVisible();
    expect(screen.getByText("Overview unavailable")).toBeVisible();
    expect(screen.queryByText("System details")).not.toBeInTheDocument();
  });
});
