import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const output = execFileSync(
  "npm",
  ["pack", "--dry-run", "--json", "--ignore-scripts"],
  { encoding: "utf8" }
);
const [manifest] = JSON.parse(output);
const paths = manifest.files.map((file) => file.path);

for (const required of [
  "bin/coven-memory-dashboard.mjs",
  "server.ts",
  ".next/BUILD_ID",
  ".next/server",
  ".next/static",
  "src/lib/memory-types.ts",
  "src/server/local-transport.ts",
  "src/server/runtime.ts"
]) {
  assert(
    paths.some((path) => path === required || path.startsWith(`${required}/`)),
    `missing packaged path: ${required}`
  );
}

const allowed = [
  /^package\.json$/,
  /^README\.md$/,
  /^bin\/coven-memory-dashboard\.mjs$/,
  /^server\.ts$/,
  /^next-env\.d\.ts$/,
  /^next\.config\.ts$/,
  /^tsconfig\.json$/,
  /^\.next\/(?:BUILD_ID|app-path-routes-manifest\.json|build-manifest\.json|package\.json|prerender-manifest\.json|required-server-files\.json|routes-manifest\.json)$/,
  /^\.next\/(?:server|static)\//,
  /^src\/lib\/memory-types\.ts$/,
  /^src\/server\/(?:api-response|daemon-transport|listen-options|local-transport|memory-contract|memory-gateway|request-guard|runtime|security-headers)\.ts$/
];

for (const path of paths) {
  assert(
    allowed.some((pattern) => pattern.test(path)),
    `unexpected packaged path: ${path}`
  );
}

process.stdout.write("Dashboard package contents are restricted.\n");
