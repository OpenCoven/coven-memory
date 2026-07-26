import {
  guardLocalTransportRequest
} from "./request-guard";
import {
  createLocalTransportAuthority,
  LOCAL_TRANSPORT_HEADER
} from "./local-transport";

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
  const transport = createLocalTransportAuthority(Buffer.alloc(32, 5));

  function trustedRequest(
    url = "http://127.0.0.1:3737/api/memory",
    headers: Record<string, string> = {}
  ) {
    const authorized: Record<string, string | string[] | undefined> = {};
    transport.authorize(authorized, "127.0.0.1");
    return request(url, {
      [LOCAL_TRANSPORT_HEADER]: String(authorized[LOCAL_TRANSPORT_HEADER]),
      ...headers
    });
  }

  it("accepts proof-backed loopback and Tailscale Serve origins", () => {
    expect(
      guardLocalTransportRequest(trustedRequest(), transport.validate)
    ).toEqual({ ok: true });
    expect(
      guardLocalTransportRequest(
        trustedRequest("http://localhost:3737/api/memory", {
          host: "mb-black.taile46e90.ts.net",
          origin: "https://mb-black.taile46e90.ts.net"
        }),
        transport.validate
      )
    ).toEqual({ ok: true });
  });

  it.each([
    ["missing proof", trustedRequest(), true],
    [
      "guessed proof",
      trustedRequest(undefined, { [LOCAL_TRANSPORT_HEADER]: "guessed" }),
      false
    ]
  ])("rejects %s before Host or Origin trust", (_label, source, removeProof) => {
    const headers = new Headers(source.headers);
    if (removeProof) {
      headers.delete(LOCAL_TRANSPORT_HEADER);
    }
    const untrusted = new Request(source, { headers });

    expect(
      guardLocalTransportRequest(untrusted, transport.validate)
    ).toEqual({
      ok: false,
      status: 403,
      code: "invalid_transport"
    });
  });

  it.each([
    ["bare ts.net", "ts.net"],
    ["suffix trick", "node.ts.net.example.com"],
    ["empty label", "node..tailnet.ts.net"],
    ["leading hyphen", "-node.tailnet.ts.net"],
    ["LAN address", "192.168.1.12"],
    ["named localhost", "localhost"],
    ["malformed value", "not a host@"]
  ])("rejects the invalid trusted Host %s", (_label, host) => {
    expect(
      guardLocalTransportRequest(
        trustedRequest("http://localhost:3737/api/memory", {
          host,
          origin: `https://${host}`
        }),
        transport.validate
      )
    ).toEqual({
      ok: false,
      status: 403,
      code: "invalid_host"
    });
  });

  it("requires an exact same-origin Tailscale request", () => {
    expect(
      guardLocalTransportRequest(
        trustedRequest("http://localhost:3737/api/memory", {
          host: "mb-black.taile46e90.ts.net",
          origin: "https://other.taile46e90.ts.net"
        }),
        transport.validate
      )
    ).toEqual({
      ok: false,
      status: 403,
      code: "foreign_origin"
    });
  });

  it("accepts exact IPv4 and IPv6 loopback origins", () => {
    expect(
      guardLocalTransportRequest(trustedRequest(), transport.validate)
    ).toEqual({ ok: true });
    expect(
      guardLocalTransportRequest(
        trustedRequest("http://[::1]:3737/api/memory"),
        transport.validate
      )
    ).toEqual({ ok: true });
  });
});
