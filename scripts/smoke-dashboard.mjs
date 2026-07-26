import { once } from "node:events";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
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

function cookiePair(response) {
  const header = response.headers.get("set-cookie");
  invariant(header, "session cookie was not issued");
  const cookie = header.split(";", 1)[0];
  invariant(
    cookie.startsWith("coven_memory_session="),
    "unexpected session cookie"
  );
  return cookie;
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
  const fakeOrigin = `http://${host}:${fakePort}`;
  const dashboardOrigin = `http://${host}:${dashboardPort}`;

  start(process.execPath, ["scripts/fake-memory-daemon.mjs"], {
    FAKE_DAEMON_PORT: String(fakePort)
  });
  await waitFor(`${fakeOrigin}/api/v1/memory`);

  const dashboard = start(
    process.execPath,
    ["--import", "tsx", "server.ts"],
    {
      NODE_ENV: "production",
      HOST: host,
      PORT: String(dashboardPort),
      COVEN_DAEMON_URL: fakeOrigin,
      COVEN_DAEMON_SOCKET: join(
        tmpdir(),
        "coven-memory-smoke-missing.sock"
      )
    }
  );
  const launched = await launchUrl(dashboard);
  invariant(launched.origin === dashboardOrigin, "unexpected dashboard origin");

  const fragment = new URLSearchParams(launched.hash.slice(1));
  const token = fragment.get("launch");
  invariant(token, "launch token was not issued");

  const unauthenticated = await fetch(`${dashboardOrigin}/api/memory`, {
    cache: "no-store"
  });
  await json(unauthenticated, 401);

  const exchanged = await fetch(
    `${dashboardOrigin}/api/session/exchange`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        origin: dashboardOrigin
      },
      body: JSON.stringify({ token })
    }
  );
  await json(exchanged.clone(), 200);
  const cookie = cookiePair(exchanged);

  const replay = await fetch(`${dashboardOrigin}/api/session/exchange`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      origin: dashboardOrigin
    },
    body: JSON.stringify({ token })
  });
  await json(replay, 401);

  const authenticated = {
    cache: "no-store",
    headers: { cookie }
  };
  const overview = await json(
    await fetch(`${dashboardOrigin}/api/memory/overview`, authenticated),
    200
  );
  const list = await json(
    await fetch(`${dashboardOrigin}/api/memory`, authenticated),
    200
  );
  invariant(overview?.ok === true, "overview response was invalid");
  invariant(list?.ok === true && Array.isArray(list.data), "list was invalid");
  invariant(list.data.length > 0, "synthetic list was empty");
  invariant(
    !("path" in list.data[0]),
    "browser list exposed a daemon path"
  );
  invariant(
    list.data[0].privacy?.revealRequired !== false,
    "smoke fixture does not exercise reveal-by-default"
  );

  const detail = await json(
    await fetch(
      `${dashboardOrigin}/api/memory/${encodeURIComponent(list.data[0].id)}`,
      authenticated
    ),
    200
  );
  invariant(
    detail?.ok === true && typeof detail.data?.content === "string",
    "authenticated detail content was unavailable"
  );
  invariant(
    !("path" in detail.data),
    "browser detail exposed a daemon path"
  );

  await json(
    await fetch(`${dashboardOrigin}/api/session/logout`, {
      method: "POST",
      cache: "no-store",
      headers: {
        cookie,
        origin: dashboardOrigin
      }
    }),
    200
  );
  await json(
    await fetch(`${dashboardOrigin}/api/session/status`, authenticated),
    401
  );

  process.stdout.write(
    "Dashboard smoke passed: session, overview, list, detail, and logout.\n"
  );
} finally {
  await Promise.allSettled(children.reverse().map(stop));
}
