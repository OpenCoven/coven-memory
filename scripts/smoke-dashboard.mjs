import { once } from "node:events";
import { spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const host = "127.0.0.1";
const timeoutMs = 60_000;
const children = [];

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function freePort() {
  const server = createServer();
  server.listen(0, host);
  await once(server, "listening");
  const address = server.address();
  invariant(address && typeof address !== "string", "port allocation failed");
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

function start(command, args, env) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
  children.push(child);
  child.stderr.on("data", () => {});
  return child;
}

async function waitFor(url) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(1_000)
      });
      if (response.ok) {
        return;
      }
    } catch {
      // The child is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("fake daemon did not become ready");
}

function launchUrl(child) {
  return new Promise((resolve, reject) => {
    let buffered = "";
    const timer = setTimeout(
      () => reject(new Error("dashboard did not become ready")),
      timeoutMs
    );

    child.stdout.on("data", (chunk) => {
      buffered += chunk.toString("utf8");
      invariant(buffered.length <= 64 * 1_024, "dashboard output exceeded limit");
      const match = /(?:^|\n)Coven Memory: ([^\r\n]+)/.exec(buffered);
      if (!match) {
        return;
      }
      clearTimeout(timer);
      buffered = "";
      try {
        resolve(new URL(match[1]));
      } catch {
        reject(new Error("dashboard emitted an invalid launch URL"));
      }
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("dashboard exited before becoming ready"));
    });
  });
}

async function json(response, expectedStatus) {
  invariant(response.status === expectedStatus, "unexpected API status");
  invariant(
    response.headers.get("cache-control")?.includes("no-store"),
    "API response is cacheable"
  );
  return response.json();
}

function requestWithHost(url, headers) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("end", () => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          for (const entry of Array.isArray(value) ? value : [value]) {
            if (entry !== undefined) {
              responseHeaders.append(name, entry);
            }
          }
        }
        resolve(
          new Response(Buffer.concat(chunks), {
            status: response.statusCode ?? 500,
            headers: responseHeaders
          })
        );
      });
    });
    request.once("error", reject);
    request.end();
  });
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  const exited = once(child, "exit");
  const forced = new Promise((resolve) => {
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
      resolve();
    }, 2_000);
  });
  await Promise.race([exited, forced]);
}

try {
  const fakePort = await freePort();
  const dashboardPort = await freePort();
  const stockNextPort = await freePort();
  const fakeOrigin = `http://${host}:${fakePort}`;
  const dashboardOrigin = `http://${host}:${dashboardPort}`;
  const stockNextOrigin = `http://${host}:${stockNextPort}`;
  const absentSocketPath = join(
    tmpdir(),
    "coven-memory-smoke-missing.sock"
  );

  start(process.execPath, ["scripts/fake-memory-daemon.mjs"], {
    FAKE_DAEMON_PORT: String(fakePort)
  });
  await waitFor(`${fakeOrigin}/api/v1/memory`);

  start(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "-H",
      host,
      "-p",
      String(stockNextPort)
    ],
    {
      NODE_ENV: "production",
      COVEN_DAEMON_URL: fakeOrigin,
      COVEN_DAEMON_SOCKET: absentSocketPath
    }
  );
  await waitFor(`${stockNextOrigin}/`);
  const stockNextApi = await json(
    await fetch(`${stockNextOrigin}/api/memory`, { cache: "no-store" }),
    403
  );
  invariant(
    stockNextApi?.code === "invalid_transport",
    "stock Next.js hosting did not fail closed"
  );

  const installedDashboardEntry =
    process.env.COVEN_MEMORY_SMOKE_DASHBOARD_ENTRY;
  const dashboard = installedDashboardEntry
    ? start(process.execPath, [installedDashboardEntry], {
        NODE_ENV: "production",
        HOST: host,
        PORT: String(dashboardPort),
        COVEN_MEMORY_NO_BROWSER: "1",
        COVEN_DAEMON_URL: fakeOrigin,
        COVEN_DAEMON_SOCKET: absentSocketPath
      })
    : start(process.execPath, ["--import", "tsx", "server.ts"], {
      NODE_ENV: "production",
      HOST: host,
      PORT: String(dashboardPort),
      COVEN_DAEMON_URL: fakeOrigin,
      COVEN_DAEMON_SOCKET: absentSocketPath
    });
  const launched = await launchUrl(dashboard);
  invariant(launched.origin === dashboardOrigin, "unexpected dashboard origin");
  invariant(launched.hash === "", "dashboard URL contained a launch fragment");
  invariant(
    launched.search === "",
    "dashboard URL contained launch credentials"
  );

  const documentResponse = await fetch(`${dashboardOrigin}/`, {
    cache: "no-store"
  });
  const csp =
    documentResponse.headers.get("content-security-policy") ?? "";
  invariant(documentResponse.status === 200, "dashboard document failed");
  invariant(csp.includes("'strict-dynamic'"), "strict CSP missing");
  invariant(!csp.includes("'unsafe-inline'"), "unsafe inline CSP remained");
  invariant(!csp.includes("'unsafe-eval'"), "production eval CSP remained");
  invariant(
    documentResponse.headers.get("cache-control")?.includes("no-store"),
    "protected document was cacheable"
  );
  const html = await documentResponse.text();
  const nonce = /script-src[^;]*'nonce-([^']+)'/.exec(csp)?.[1];
  invariant(
    nonce && html.includes(`nonce="${nonce}"`),
    "Next nonce propagation failed"
  );

  const prefetchedDocument = await fetch(`${dashboardOrigin}/`, {
    cache: "no-store",
    headers: {
      accept: "text/html",
      purpose: "prefetch"
    }
  });
  const prefetchCsp =
    prefetchedDocument.headers.get("content-security-policy") ?? "";
  invariant(
    prefetchedDocument.status === 200 &&
      prefetchedDocument.headers
        .get("content-type")
        ?.includes("text/html"),
    "prefetched dashboard document failed"
  );
  invariant(
    prefetchCsp.includes("'strict-dynamic'"),
    "prefetched HTML bypassed strict CSP"
  );
  invariant(
    prefetchedDocument.headers.get("cache-control")?.includes("no-store"),
    "prefetched dashboard document was cacheable"
  );
  const prefetchedHtml = await prefetchedDocument.text();
  const prefetchNonce =
    /script-src[^;]*'nonce-([^']+)'/.exec(prefetchCsp)?.[1];
  invariant(
    prefetchNonce &&
      prefetchedHtml.includes(`nonce="${prefetchNonce}"`),
    "prefetched HTML nonce propagation failed"
  );

  const direct = {
    cache: "no-store"
  };
  const unsupported = await fetch(`${dashboardOrigin}/api/memory`, {
    method: "POST",
    cache: "no-store",
    headers: {
      origin: dashboardOrigin
    }
  });
  await json(unsupported, 405);
  invariant(
    unsupported.headers.get("allow") === "GET, HEAD",
    "unsupported method omitted Allow"
  );

  const tailscaleHost = "memory.example-tailnet.ts.net";
  const tailscaleOrigin = `https://${tailscaleHost}`;
  const tailscaleList = await json(
    await requestWithHost(`${dashboardOrigin}/api/memory`, {
      host: tailscaleHost,
      origin: tailscaleOrigin
    }),
    200
  );
  invariant(
    tailscaleList?.ok === true && Array.isArray(tailscaleList.data),
    "Tailscale Serve request did not reach local memory"
  );
  await json(
    await requestWithHost(`${dashboardOrigin}/api/memory`, {
      host: tailscaleHost,
      origin: "https://other.example-tailnet.ts.net"
    }),
    403
  );

  const overview = await json(
    await fetch(`${dashboardOrigin}/api/memory/overview`, direct),
    200
  );
  const list = await json(
    await fetch(`${dashboardOrigin}/api/memory`, direct),
    200
  );
  invariant(overview?.ok === true, "overview response was invalid");
  invariant(list?.ok === true && Array.isArray(list.data), "list was invalid");
  invariant(list.data.length > 0, "synthetic list was empty");
  invariant(
    new Set(list.data.map((entry) => entry.source?.kind)).size === 2,
    "summary source facets were not authoritative"
  );
  invariant(
    !("path" in list.data[0]),
    "browser list exposed a daemon path"
  );
  invariant(
    list.data[0].privacy?.revealRequired !== false,
    "smoke fixture does not exercise reveal-by-default"
  );

  for (const entry of list.data) {
    const detail = await json(
      await fetch(
        `${dashboardOrigin}/api/memory/${encodeURIComponent(entry.id)}`,
        direct
      ),
      200
    );
    invariant(
      detail?.ok === true && typeof detail.data?.content === "string",
      "local detail content was unavailable"
    );
    invariant(
      detail.data.source?.kind === entry.source?.kind &&
        detail.data.source?.label === entry.source?.label,
      "summary and detail source metadata disagreed"
    );
    invariant(
      !("path" in detail.data),
      "browser detail exposed a daemon path"
    );
  }

  process.stdout.write(
    "Dashboard smoke passed: stock-host closure, local transport, Tailscale Host, overview, list, and detail.\n"
  );
} finally {
  await Promise.allSettled(children.reverse().map(stop));
}
