import type { NextConfig } from "next";
import { BASE_SECURITY_HEADERS } from "./src/server/security-headers";

export function securityHeadersFor() {
  return BASE_SECURITY_HEADERS.map((header) => ({ ...header }));
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: process.cwd()
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeadersFor()
      }
    ];
  }
};

export default nextConfig;
