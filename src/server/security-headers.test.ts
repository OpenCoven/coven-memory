import { securityHeadersFor } from "../../next.config";
import { buildContentSecurityPolicy } from "./security-headers";

function headerMap() {
  return new Map(
    securityHeadersFor().map(({ key, value }) => [
      key.toLowerCase(),
      value
    ])
  );
}

describe("security headers", () => {
  it("keeps baseline response headers separate from request CSP", () => {
    const headers = headerMap();
    expect(headers.has("content-security-policy")).toBe(false);
    expect(headers.get("referrer-policy")).toBe("no-referrer");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("cross-origin-resource-policy")).toBe("same-origin");
  });

  it("uses a strict nonce policy in production", () => {
    const csp = buildContentSecurityPolicy("synthetic-nonce", "production");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain(
      "script-src 'self' 'nonce-synthetic-nonce' 'strict-dynamic'"
    );
    expect(csp).toContain("style-src 'self' 'nonce-synthetic-nonce'");
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).not.toContain("https:");
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("uses the script and style allowances Next development requires", () => {
    const csp = buildContentSecurityPolicy("synthetic-nonce", "development");
    const styleDirective = csp
      .split("; ")
      .find((directive) => directive.startsWith("style-src "));

    expect(csp).toContain("'unsafe-eval'");
    expect(styleDirective).toBe("style-src 'self' 'unsafe-inline'");
  });
});
