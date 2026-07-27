export type RuntimeMode = "development" | "production";

export const BASE_SECURITY_HEADERS = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Origin-Agent-Cluster", value: "?1" },
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()"
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-DNS-Prefetch-Control", value: "off" }
] as const;

export function buildContentSecurityPolicy(
  nonce: string,
  mode: RuntimeMode
) {
  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(mode === "development" ? ["'unsafe-eval'"] : [])
  ].join(" ");
  const styleSources =
    mode === "development"
      ? "'self' 'unsafe-inline'"
      : `'self' 'nonce-${nonce}'`;

  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSources}`,
    "script-src-attr 'none'",
    `style-src ${styleSources}`,
    "img-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'"
  ].join("; ");
}

export function prepareNonceHeaders(
  incoming: Headers,
  nonce: string,
  mode: RuntimeMode
) {
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce, mode);
  const requestHeaders = new Headers(incoming);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", contentSecurityPolicy);
  return { contentSecurityPolicy, requestHeaders };
}
