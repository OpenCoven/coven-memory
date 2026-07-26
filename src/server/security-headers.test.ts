import { securityHeadersFor } from "../../next.config";

function headerMap(mode: "development" | "production") {
  return new Map(
    securityHeadersFor(mode).map(({ key, value }) => [
      key.toLowerCase(),
      value
    ])
  );
}

describe("security headers", () => {
  it("restricts production resources to the local application", () => {
    const headers = headerMap("production");
    const csp = headers.get("content-security-policy")!;

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).not.toContain("https:");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(headers.get("referrer-policy")).toBe("no-referrer");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("cross-origin-resource-policy")).toBe("same-origin");
  });

  it("adds only the eval allowance Next development mode requires", () => {
    const development = headerMap("development").get(
      "content-security-policy"
    )!;
    const production = headerMap("production").get("content-security-policy")!;

    expect(development).toContain("'unsafe-eval'");
    expect(production).not.toContain("'unsafe-eval'");
  });
});
