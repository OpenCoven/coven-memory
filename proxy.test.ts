import { NextRequest } from "next/server";
import { proxy } from "./src/proxy";
import { prepareNonceHeaders } from "./src/server/security-headers";

describe("dashboard proxy headers", () => {
  it("creates a fresh request nonce and one response CSP", () => {
    const prepared = prepareNonceHeaders(
      new Headers({ "x-nonce": "attacker-controlled" }),
      "server-generated",
      "production"
    );

    expect(prepared.requestHeaders.get("x-nonce")).toBe("server-generated");
    expect(prepared.requestHeaders.get("content-security-policy")).toBe(
      prepared.contentSecurityPolicy
    );
    expect(prepared.contentSecurityPolicy).not.toContain("attacker-controlled");
  });

  it("generates distinct nonces and applies matching request and response policy", () => {
    const request = () =>
      new NextRequest("http://127.0.0.1:3000/", {
        headers: {
          "content-security-policy": "attacker-csp",
          "x-nonce": "attacker-nonce"
        }
      });

    const first = proxy(request());
    const second = proxy(request());
    const firstCsp = first.headers.get("content-security-policy");
    const forwardedCsp = first.headers.get(
      "x-middleware-request-content-security-policy"
    );
    const firstNonce = first.headers.get("x-middleware-request-x-nonce");
    const secondNonce = second.headers.get("x-middleware-request-x-nonce");

    expect(firstCsp).toBeTruthy();
    expect(firstCsp).toBe(forwardedCsp);
    expect(firstNonce).toBeTruthy();
    expect(secondNonce).toBeTruthy();
    expect(firstCsp).toContain(`'nonce-${firstNonce}'`);
    expect(firstCsp).not.toContain("attacker");
    expect(firstNonce).not.toBe("attacker-nonce");
    expect(secondNonce).not.toBe(firstNonce);
    expect(first.headers.get("cache-control")).toContain("no-store");
    expect(first.headers.get("pragma")).toBe("no-cache");
  });
});
