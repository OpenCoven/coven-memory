import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  output: "export",
  poweredByHeader: false,
  images: {
    unoptimized: true
  },
  turbopack: {
    root: resolve(process.cwd(), "..")
  }
};

export default nextConfig;
