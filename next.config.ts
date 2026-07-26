import type { NextConfig } from "next";

type RuntimeMode = "development" | "production";

export function securityHeadersFor(mode: RuntimeMode) {
  const scriptSources = ["'self'", "'unsafe-inline'"];
  if (mode === "development") {
    scriptSources.push("'unsafe-eval'");
  }

  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'"
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy },
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
  ];
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: process.cwd()
  },
  async headers() {
    const mode =
      process.env.NODE_ENV === "development" ? "development" : "production";
    return [
      {
        source: "/:path*",
        headers: securityHeadersFor(mode)
      }
    ];
  }
};

export default nextConfig;
