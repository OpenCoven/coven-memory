import { act, renderHook, waitFor } from "@testing-library/react";
import { useMemoryDashboard } from "./use-memory-dashboard";

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
    title: "Architecture",
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
    title: "Preferences",
    updatedAt: "2026-07-20T09:56:00Z",
    relativeUpdatedAt: "6d ago",
    excerpt: "Synthetic preferences.",
    source: { kind: "promotion", label: "Promoted memory" },
    privacy: { classification: "personal", revealRequired: true },
    verification: { state: "verified" }
  }
] as const;

function detailFor(id: string) {
  return {
    id,
    familiarId: id === firstId ? "sage" : "echo",
    title: "Synthetic detail",
    updatedAt: "2026-07-26T09:56:00Z",
    source: { kind: "coven-origin", label: "Coven origin" },
    content: "# Synthetic detail",
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
    attestation: null,
    supersession: { supersedes: null, supersededBy: null }
  };
}

function json(data: unknown, status = 200) {
  return Promise.resolve(
    Response.json(
      status < 400 ? { ok: true, data } : { ok: false, code: data },
      { status }
    )
  );
}

describe("useMemoryDashboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps list failure distinct from a successful empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = String(input);
        return url.endsWith("/overview")
          ? json(overview)
          : json("memory_unavailable", 503);
      })
    );
    const failed = renderHook(() =>
      useMemoryDashboard({ onUnauthorized: vi.fn() })
    );
    await waitFor(() =>
      expect(failed.result.current.list.status).toBe("error")
    );
    expect(failed.result.current.list.data).toBeNull();
    failed.unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) =>
        String(input).endsWith("/overview") ? json(overview) : json([])
      )
    );
    const empty = renderHook(() =>
      useMemoryDashboard({ onUnauthorized: vi.fn() })
    );
    await waitFor(() =>
      expect(empty.result.current.list.status).toBe("ready")
    );
    expect(empty.result.current.list.data).toEqual([]);
    expect(empty.result.current.selectedId).toBeNull();
  });

  it("aborts stale detail reads when selection changes", async () => {
    let firstDetailSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(
      (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/overview")) return json(overview);
        if (url === "/api/memory") return json(entries);
        if (url.endsWith(firstId)) {
          firstDetailSignal = init?.signal ?? undefined;
          return new Promise<Response>(() => {});
        }
        return json(detailFor(secondId));
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() =>
      useMemoryDashboard({ onUnauthorized: vi.fn() })
    );
    await waitFor(() => expect(result.current.selectedId).toBe(firstId));
    await waitFor(() => expect(firstDetailSignal).toBeDefined());

    act(() => result.current.setSelectedId(secondId));

    await waitFor(() => expect(firstDetailSignal?.aborted).toBe(true));
    await waitFor(() => expect(result.current.detail.status).toBe("ready"));
    expect(result.current.detail.data).toEqual(detailFor(secondId));
  });

  it("clears a selection that a filter removes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/overview")) return json(overview);
        if (url === "/api/memory") return json(entries);
        return json(detailFor(firstId));
      })
    );
    const { result } = renderHook(() =>
      useMemoryDashboard({ onUnauthorized: vi.fn() })
    );
    await waitFor(() => expect(result.current.selectedId).toBe(firstId));

    act(() => result.current.setFilter("familiar", "echo"));

    await waitFor(() => expect(result.current.selectedId).toBeNull());
    expect(result.current.filteredEntries).toEqual([entries[1]]);
    expect(result.current.detail.status).toBe("idle");
  });

  it("locks the session after an unauthorized API response", async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal("fetch", vi.fn(() => json("session_required", 401)));

    renderHook(() => useMemoryDashboard({ onUnauthorized }));

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalled());
  });
});
