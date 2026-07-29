import { lstat, readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_PATTERNS = [
  ["memory or session API path", /\/api\/(?:memory|session)\b/i],
  [
    "loopback host",
    /(?:\blocalhost\b|\b127(?:\.\d{1,3}){3}\b|\b0\.0\.0\.0\b|\[::1\])/i
  ],
  [
    "private-network URL",
    /https?:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|169\.254\.|\[(?:f[cd][0-9a-f:]*|fe[89ab][0-9a-f:]*)\])/i
  ],
  ["Tailscale MagicDNS host", /\.ts\.net\b/i],
  ["genuine daemon configuration", /\bCOVEN_(?:HOME|DAEMON)[A-Z_]*\b/],
  ["local transport credential", /\bx-coven-local-transport\b/i],
  ["local daemon socket", /\bcoven\.sock\b/i],
  ["network request", /\bfetch\s*\(/],
  ["XML network request", /\bXMLHttpRequest\b/],
  ["socket or event stream", /\b(?:WebSocket|EventSource)\b/],
  ["beacon", /\bsendBeacon\b/],
  ["browser persistence", /\b(?:localStorage|sessionStorage|indexedDB)\b/],
  [
    "telemetry integration",
    /\b(?:analytics\.|telemetry\b|posthog\b|segment\.(?:io|com)|sentry\b)/i
  ],
  ["dynamic server action", /["']use server["']/],
  [
    "server transport import",
    /from\s+["']node:(?:fs|http|https|net|tls|dgram|child_process)["']/
  ],
  ["runtime environment read", /\bprocess\.env\b/]
];

const OUTPUT_PATTERNS = [
  SOURCE_PATTERNS[0],
  [
    "loopback URL",
    /https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])(?::|\/|["'])/i
  ],
  SOURCE_PATTERNS[2],
  SOURCE_PATTERNS[3],
  SOURCE_PATTERNS[4],
  SOURCE_PATTERNS[5],
  SOURCE_PATTERNS[6],
  SOURCE_PATTERNS[9],
  SOURCE_PATTERNS[10],
  SOURCE_PATTERNS[11],
  SOURCE_PATTERNS[12]
];

async function regularFiles(path) {
  const stats = await lstat(path);
  if (stats.isSymbolicLink()) {
    throw new Error(`demo boundary rejects symlink: ${path}`);
  }
  if (stats.isFile()) {
    return [path];
  }
  if (!stats.isDirectory()) {
    throw new Error(`demo boundary rejects non-regular path: ${path}`);
  }

  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".next" ||
      entry.name === "out" ||
      entry.name.endsWith(".tsbuildinfo")
    ) {
      continue;
    }
    const child = resolve(path, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`demo boundary rejects symlink: ${child}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await regularFiles(child)));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files;
}

export async function scanDemoTree(path, { source = false } = {}) {
  const patterns = source ? SOURCE_PATTERNS : OUTPUT_PATTERNS;
  const files = await regularFiles(path);

  for (const file of files) {
    const bytes = await readFile(file);
    if (bytes.includes(0)) {
      throw new Error(`demo boundary rejects binary asset: ${file}`);
    }
    const content = bytes.toString("utf8");
    for (const [label, pattern] of patterns) {
      if (pattern.test(content)) {
        throw new Error(
          `forbidden demo boundary pattern (${label}) in ${file}`
        );
      }
    }
  }

  return files;
}

async function main() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const site = resolve(root, "site");
  await scanDemoTree(site, { source: true });
  const outputFiles = await scanDemoTree(resolve(site, "out"));
  const html = await readFile(resolve(site, "out", "index.html"), "utf8");
  if (!html.includes("Synthetic demo data")) {
    throw new Error("static demo output is missing its synthetic-data label");
  }

  process.stdout.write(
    `Demo boundary clean: ${outputFiles.length} exported files are synthetic-only.\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
