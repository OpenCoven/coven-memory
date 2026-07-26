import { StrictMode, useEffect } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LaunchGate, useLocalSession } from "./launch-gate";

let latestSession: ReturnType<typeof useLocalSession> | null = null;

function sessionResponse(
  expiresAt = new Date(Date.now() + 60_000).toISOString()
) {
  return Response.json({ ok: true, expiresAt });
}

function PrivateControls() {
  const session = useLocalSession();
  useEffect(() => {
    latestSession = session;
  }, [session]);
  return (
    <div>
      <span>Private memory UI</span>
      <button type="button" onClick={session.lock}>
        Expire session
      </button>
      <button type="button" onClick={() => void session.logout()}>
        Log out
      </button>
    </div>
  );
}

describe("LaunchGate", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
    latestSession = null;
  });

  it("removes a fragment token before exchanging it and then renders private UI", async () => {
    window.history.replaceState(null, "", "/#launch=one-time");
    let resolveFetch!: (value: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <StrictMode>
        <LaunchGate>
          <PrivateControls />
        </LaunchGate>
      </StrictMode>
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(window.location.hash).toBe("");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session/exchange",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        body: JSON.stringify({ token: "one-time" })
      })
    );

    resolveFetch(sessionResponse());
    expect(await screen.findByText("Private memory UI")).toBeInTheDocument();
  });

  it("checks an existing session when there is no launch fragment", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sessionResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(
      <LaunchGate>
        <PrivateControls />
      </LaunchGate>
    );

    expect(await screen.findByText("Private memory UI")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session/status",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("unmounts private state when the session is locked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(sessionResponse())
    );
    render(
      <LaunchGate>
        <PrivateControls />
      </LaunchGate>
    );
    await screen.findByText("Private memory UI");

    fireEvent.click(screen.getByRole("button", { name: "Expire session" }));

    expect(screen.queryByText("Private memory UI")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Memory is locked" })).toBeVisible();
  });

  it("posts logout and locks even when the logout request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockRejectedValueOnce(new Error("network unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <LaunchGate>
        <PrivateControls />
      </LaunchGate>
    );
    await screen.findByText("Private memory UI");

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(
      await screen.findByRole("heading", { name: "Memory is locked" })
    ).toBeVisible();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/session/logout",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows a locked state when session establishment fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    );
    render(
      <LaunchGate>
        <PrivateControls />
      </LaunchGate>
    );

    expect(
      await screen.findByRole("heading", { name: "Memory is locked" })
    ).toBeVisible();
    expect(screen.queryByText("Private memory UI")).not.toBeInTheDocument();
  });

  it("fails closed when a malformed launch fragment is rejected", async () => {
    window.history.replaceState(null, "", "/#launch=invalid%20token");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        { ok: false, code: "invalid_token" },
        { status: 400 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <LaunchGate>
        <PrivateControls />
      </LaunchGate>
    );

    expect(
      await screen.findByRole("heading", { name: "Memory is locked" })
    ).toBeVisible();
    expect(window.location.hash).toBe("");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session/exchange",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "invalid token" })
      })
    );
    expect(screen.queryByText("Private memory UI")).not.toBeInTheDocument();
  });

  it("unmounts private UI exactly when the local session expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T10:00:00Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sessionResponse(new Date(Date.now() + 1_000).toISOString())
      )
    );

    render(
      <LaunchGate>
        <PrivateControls />
      </LaunchGate>
    );
    await act(async () => {});
    expect(screen.getByText("Private memory UI")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(999);
    });

    expect(screen.getByText("Private memory UI")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.queryByText("Private memory UI")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Memory is locked" })).toBeVisible();
  });

  it.each(["pageshow", "visibilitychange"] as const)(
    "unmounts private UI while revalidating on %s",
    async (eventName) => {
      let resolveStatus!: (response: Response) => void;
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(sessionResponse())
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              resolveStatus = resolve;
            })
        );
      vi.stubGlobal("fetch", fetchMock);

      render(
        <LaunchGate>
          <PrivateControls />
        </LaunchGate>
      );
      expect(await screen.findByText("Private memory UI")).toBeInTheDocument();

      await act(async () => {
        if (eventName === "pageshow") {
          window.dispatchEvent(new Event("pageshow"));
        } else {
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            value: "visible"
          });
          document.dispatchEvent(new Event("visibilitychange"));
        }
      });

      expect(screen.queryByText("Private memory UI")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Opening memory" })).toBeVisible();

      resolveStatus(sessionResponse());
      expect(await screen.findByText("Private memory UI")).toBeInTheDocument();
    }
  );

  it("keeps private UI hidden behind a retryable network error", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(sessionResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(
      <LaunchGate>
        <PrivateControls />
      </LaunchGate>
    );

    expect(
      await screen.findByRole("heading", { name: "Session check unavailable" })
    ).toBeVisible();
    expect(screen.queryByText("Private memory UI")).not.toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Retry session check" });
    expect(retry).toHaveClass("cv-action", "cv-action-secondary");
    fireEvent.click(retry);
    expect(await screen.findByText("Private memory UI")).toBeInTheDocument();
  });

  it("treats unavailable server responses as retryable instead of locking", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    );
    render(
      <LaunchGate>
        <PrivateControls />
      </LaunchGate>
    );

    expect(
      await screen.findByRole("heading", { name: "Session check unavailable" })
    ).toBeVisible();
    expect(screen.queryByText("Private memory UI")).not.toBeInTheDocument();
  });

  it.each([
    {},
    { ok: true, expiresAt: "not-a-date" },
    { ok: true, expiresAt: "2026-07-26T09:59:59.999Z" },
    {
      ok: true,
      expiresAt: new Date(Date.now() + 60_000).toUTCString()
    }
  ])("fails closed for invalid session expiry metadata: %j", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    render(
      <LaunchGate>
        <PrivateControls />
      </LaunchGate>
    );

    expect(
      await screen.findByRole("heading", { name: "Memory is locked" })
    ).toBeVisible();
    expect(screen.queryByText("Private memory UI")).not.toBeInTheDocument();
  });

  it("fails closed for a future calendar date normalized by Date.parse", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-28T00:00:00Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ ok: true, expiresAt: "2026-02-30T00:00:00.000Z" })
      )
    );
    render(
      <LaunchGate>
        <PrivateControls />
      </LaunchGate>
    );
    await act(async () => {});

    expect(screen.getByRole("heading", { name: "Memory is locked" })).toBeVisible();
    expect(screen.queryByText("Private memory UI")).not.toBeInTheDocument();
  });

  it.each(["lock", "logout"] as const)(
    "does not remount a pending validation after %s",
    async (action) => {
      let resolveStatus!: (response: Response) => void;
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(sessionResponse())
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              resolveStatus = resolve;
            })
        )
        .mockResolvedValueOnce(new Response(null, { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      render(
        <LaunchGate>
          <PrivateControls />
        </LaunchGate>
      );
      expect(await screen.findByText("Private memory UI")).toBeInTheDocument();

      await act(async () => {
        window.dispatchEvent(new Event("pageshow"));
      });
      expect(screen.getByRole("heading", { name: "Opening memory" })).toBeVisible();

      await act(async () => {
        if (action === "logout") {
          await latestSession!.logout();
        } else {
          latestSession!.lock();
        }
      });
      resolveStatus(sessionResponse());
      await act(async () => {});

      expect(screen.getByRole("heading", { name: "Memory is locked" })).toBeVisible();
      expect(screen.queryByText("Private memory UI")).not.toBeInTheDocument();
    }
  );

  it("only lets the newest overlapping validation response win", async () => {
    let resolveOlder!: (response: Response) => void;
    let resolveNewer!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveOlder = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveNewer = resolve;
          })
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <LaunchGate>
        <PrivateControls />
      </LaunchGate>
    );
    expect(await screen.findByText("Private memory UI")).toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new Event("pageshow"));
      window.dispatchEvent(new Event("pageshow"));
    });
    expect(screen.getByRole("heading", { name: "Opening memory" })).toBeVisible();

    resolveNewer(new Response(null, { status: 401 }));
    await act(async () => {});
    expect(screen.getByRole("heading", { name: "Memory is locked" })).toBeVisible();

    resolveOlder(sessionResponse());
    await act(async () => {});
    expect(screen.getByRole("heading", { name: "Memory is locked" })).toBeVisible();
    expect(screen.queryByText("Private memory UI")).not.toBeInTheDocument();
  });
});
