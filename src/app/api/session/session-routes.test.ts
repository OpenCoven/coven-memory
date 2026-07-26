import { POST as exchange } from "./exchange/route";
import { POST as logout } from "./logout/route";
import { GET as status } from "./status/route";
import { runtime } from "@/server/runtime";
import { SESSION_COOKIE } from "@/server/request-guard";

function localRequest(
  path: string,
  init: RequestInit = {},
  origin = "http://127.0.0.1:3737"
) {
  return new Request(`${origin}${path}`, {
    ...init,
    headers: {
      host: new URL(origin).host,
      origin,
      ...init.headers
    }
  });
}

function cookiePair(setCookie: string | null) {
  if (!setCookie) {
    throw new Error("expected Set-Cookie");
  }
  return setCookie.split(";", 1)[0];
}

describe("session routes", () => {
  it("exchanges the active launch token for a strict HttpOnly cookie", async () => {
    const token = runtime().sessions.issueLaunchToken();
    const response = await exchange(
      localRequest("/api/session/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token })
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("set-cookie")).toMatch(
      new RegExp(`^${SESSION_COOKIE}=`)
    );
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(response.headers.get("set-cookie")).toMatch(/SameSite=Strict/i);
    expect(response.headers.get("set-cookie")).toMatch(/Path=\//i);
    expect(response.headers.get("set-cookie")).not.toMatch(/Secure/i);
  });

  it("sets Secure for an HTTPS local origin", async () => {
    const token = runtime().sessions.issueLaunchToken();
    const response = await exchange(
      localRequest(
        "/api/session/exchange",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token })
        },
        "https://127.0.0.1:3737"
      )
    );

    expect(response.headers.get("set-cookie")).toMatch(/Secure/i);
  });

  it("rejects replay, malformed, oversized, and foreign requests without cookies", async () => {
    const token = runtime().sessions.issueLaunchToken();
    const validInit = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token })
    };
    expect((await exchange(localRequest("/api/session/exchange", validInit))).status).toBe(
      200
    );

    const requests = [
      localRequest("/api/session/exchange", validInit),
      localRequest("/api/session/exchange", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ token: "wrong" })
      }),
      localRequest("/api/session/exchange", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "2048"
        },
        body: "{}"
      }),
      localRequest("/api/session/exchange", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://example.invalid"
        },
        body: JSON.stringify({ token: "wrong" })
      })
    ];

    for (const request of requests) {
      const response = await exchange(request);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
  });

  it("reports status, revokes logout, and clears the session cookie", async () => {
    const token = runtime().sessions.issueLaunchToken();
    const exchanged = await exchange(
      localRequest("/api/session/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token })
      })
    );
    const cookie = cookiePair(exchanged.headers.get("set-cookie"));

    const statusResponse = await status(
      localRequest("/api/session/status", { headers: { cookie } })
    );
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.headers.get("cache-control")).toContain("no-store");

    const logoutResponse = await logout(
      localRequest("/api/session/logout", {
        method: "POST",
        headers: { cookie }
      })
    );
    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.headers.get("set-cookie")).toMatch(
      new RegExp(`^${SESSION_COOKIE}=;`)
    );
    expect(logoutResponse.headers.get("cache-control")).toContain("no-store");

    const afterLogout = await status(
      localRequest("/api/session/status", { headers: { cookie } })
    );
    expect(afterLogout.status).toBe(401);
    expect(afterLogout.headers.get("cache-control")).toContain("no-store");
  });
});
