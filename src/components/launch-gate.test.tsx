import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LaunchGate, useLocalSession } from "./launch-gate";

function PrivateControls() {
  const session = useLocalSession();
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
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
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

    resolveFetch(new Response(null, { status: 200 }));
    expect(await screen.findByText("Private memory UI")).toBeInTheDocument();
  });

  it("checks an existing session when there is no launch fragment", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
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
      vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
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
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
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
});
