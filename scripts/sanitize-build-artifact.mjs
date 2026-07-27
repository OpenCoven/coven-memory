import {
  lstat,
  readFile,
  readdir,
  realpath,
  writeFile
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep
} from "node:path";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(import.meta.url);
const packageRoot = resolve(dirname(modulePath), "..");
const requiredRuntimePaths = [
  ".next/BUILD_ID",
  ".next/app-path-routes-manifest.json",
  ".next/build-manifest.json",
  ".next/package.json",
  ".next/prerender-manifest.json",
  ".next/required-server-files.json",
  ".next/routes-manifest.json",
  ".next/server",
  ".next/static",
  "bin/coven-memory-dashboard.mjs",
  "server.ts",
  "next.config.ts",
  "src/lib/memory-types.ts",
  "src/server/api-response.ts",
  "src/server/daemon-transport.ts",
  "src/server/listen-options.ts",
  "src/server/local-transport.ts",
  "src/server/memory-contract.ts",
  "src/server/memory-gateway.ts",
  "src/server/request-guard.ts",
  "src/server/runtime.ts",
  "src/server/security-headers.ts"
];
const policies = [
  {
    name: "absolute-home-path",
    pattern:
      /(?:\/Users\/|\/home\/)(?!(?:example|placeholder|you|USERNAME|\$USER)(?:\/|$))[A-Za-z0-9._-]+/
  },
  {
    name: "windows-user-profile-path",
    pattern:
      /\b[A-Za-z]:[\\/]+Users[\\/]+(?!(?:example|placeholder|you|USERNAME)(?:[\\/]|$))[^\\/\s"']+/
  },
  {
    name: "private-channel-identifier",
    pattern:
      /(?:agent:[a-z0-9_-]+:(?:telegram|imessage|discord|whatsapp|signal|webchat):[a-z]+:[^\s"']+|(?:telegram|imessage|discord|whatsapp|signal):(?:direct:)?\d{6,})/i
  },
  {
    name: "private-key-material",
    pattern:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/
  },
  {
    name: "genuine-fixture-sentinel",
    pattern:
      /\b(?:(?:COVEN|OPENCLAW)[-_])?(?:GENUINE|REAL)[-_](?:MEMORY[-_])?(?:FIXTURE|SENTINEL)\b/i
  }
];

function objectValue(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function sanitizeRequiredServerFiles(value) {
  const sanitized = structuredClone(value);
  if (!objectValue(sanitized) || !objectValue(sanitized.config)) {
    throw new Error("required server files manifest has no config");
  }

  delete sanitized.appDir;
  delete sanitized.config.outputFileTracingRoot;
  if (objectValue(sanitized.config.turbopack)) {
    delete sanitized.config.turbopack.root;
    if (Object.keys(sanitized.config.turbopack).length === 0) {
      delete sanitized.config.turbopack;
    }
  }
  return sanitized;
}

function displayPath(path) {
  return relative(packageRoot, path).split(sep).join("/");
}

function policyFailure(path, policy) {
  throw new Error(
    `build artifact policy ${policy} failed: ${displayPath(path)}`
  );
}

function isContained(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (!isAbsolute(pathFromRoot) &&
      pathFromRoot !== ".." &&
      !pathFromRoot.startsWith(`..${sep}`))
  );
}

async function scanFile(path) {
  const contents = (await readFile(path)).toString("utf8");
  for (const policy of policies) {
    if (policy.pattern.test(contents)) {
      policyFailure(path, policy.name);
    }
  }
}

async function scanEntry(path, realRoot) {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    policyFailure(path, "required-runtime-path");
  }
  if (metadata.isSymbolicLink()) {
    policyFailure(path, "runtime-symlink");
  }

  let resolved;
  try {
    resolved = await realpath(path);
  } catch {
    policyFailure(path, "runtime-realpath");
  }
  if (!isContained(realRoot, resolved)) {
    policyFailure(path, "runtime-path-escape");
  }

  if (metadata.isDirectory()) {
    const children = await readdir(path);
    children.sort();
    for (const child of children) {
      await scanEntry(resolve(path, child), realRoot);
    }
    return;
  }
  if (!metadata.isFile()) {
    policyFailure(path, "runtime-file-type");
  }
  await scanFile(path);
}

async function sanitizeBuildArtifact() {
  const manifestPath = resolve(
    packageRoot,
    ".next/required-server-files.json"
  );
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const sanitized = sanitizeRequiredServerFiles(manifest);
  await writeFile(
    manifestPath,
    `${JSON.stringify(sanitized, null, 2)}\n`,
    "utf8"
  );

  const realRoot = await realpath(packageRoot);
  for (const runtimePath of requiredRuntimePaths) {
    await scanEntry(resolve(packageRoot, runtimePath), realRoot);
  }
  process.stdout.write("Dashboard build artifact sanitized.\n");
}

if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  await sanitizeBuildArtifact();
}
