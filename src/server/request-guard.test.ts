import {
  guardLocalRequest,
  guardLoopbackRequest,
  SESSION_COOKIE
} from "./request-guard";

function request(
  url = "http://127.0.0.1:3737/api/memory",
  headers: Record<string, string> = {}
) {
  return new Request(url, {
    headers: {
      host: new URL(url).host,
      origin: new URL(url).origin,
      ...headers
    }
  });
}

describe("request guards", () => {
  const hasSession = (value: string) => value === "valid";

  it("accepts exact IPv4 and IPv6 loopback origins", () => {
    expect(guardLoopbackRequest(request())).toEqual({ ok: true });
    expect(
      guardLoopbackRequest(request("http://[::1]:3737/api/memory"))
    ).toEqual({ ok: true });
  });

  it("uses the validated Host when the framework normalizes Request.url", () => {
    const normalized = new Request(
      "http://localhost:3737/api/session/exchange",
      {
        headers: {
          host: "127.0.0.1:3737",
          origin: "http://127.0.0.1:3737"
        }
      }
    );

    expect(guardLoopbackRequest(normalized)).toEqual({ ok: true });
  });

  it.each([
    ["named localhost", "http://localhost:3737/api/memory"],
    ["wildcard IPv4", "http://0.0.0.0:3737/api/memory"],
    ["private network host", "http://192.168.1.12:3737/api/memory"]
  ])("rejects a %s Host", (_label, url) => {
    expect(guardLoopbackRequest(request(url))).toEqual({
      ok: false,
      status: 403,
      code: "invalid_host"
    });
  });

  it("rejects mismatched and malformed Host headers", () => {
    expect(
      guardLoopbackRequest(request(undefined, { host: "127.0.0.1:9999" }))
    ).toEqual({
      ok: false,
      status: 403,
      code: "invalid_host"
    });
    expect(
      guardLoopbackRequest(request(undefined, { host: "not a host@" }))
    ).toEqual({
      ok: false,
      status: 403,
      code: "invalid_host"
    });
  });

  it("rejects foreign origins before checking the session", () => {
    expect(
      guardLocalRequest(
        request(undefined, { origin: "https://example.invalid" }),
        hasSession
      )
    ).toEqual({
      ok: false,
      status: 403,
      code: "foreign_origin"
    });
  });

  it("accepts a valid session cookie and ignores unrelated cookies", () => {
    expect(
      guardLocalRequest(
        request(undefined, {
          cookie: `theme=dark; ${SESSION_COOKIE}=valid; another=value`
        }),
        hasSession
      )
    ).toEqual({ ok: true, session: "valid" });
  });

  it.each([
    ["missing", ""],
    ["invalid", `${SESSION_COOKIE}=invalid`],
    ["malformed encoding", `${SESSION_COOKIE}=%E0%A4%A`],
    ["ambiguous duplicates", `${SESSION_COOKIE}=valid; ${SESSION_COOKIE}=valid`]
  ])("rejects a %s session cookie", (_label, cookie) => {
    expect(
      guardLocalRequest(request(undefined, cookie ? { cookie } : {}), hasSession)
    ).toEqual({
      ok: false,
      status: 401,
      code: "session_required"
    });
  });
});
