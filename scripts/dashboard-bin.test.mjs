import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import {
  browserCommand,
  isMainModule,
  parseLaunchUrl,
  signalExitCode
} from "../bin/coven-memory-dashboard.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const dashboardEntry = fileURLToPath(
  new URL("../bin/coven-memory-dashboard.mjs", import.meta.url)
);

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

function waitForLaunch(child, stderr, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `dashboard did not emit a launch URL\nstdout:\n${stdout}\nstderr:\n${stderr()}`
        )
      );
    }, timeoutMs);
    const onData = (chunk) => {
      stdout += chunk.toString("utf8");
      if (/Coven Memory: http:\/\/127\.0\.0\.1:\d+\//.test(stdout)) {
        cleanup();
        resolve();
      }
    };
    const onExit = (code, signal) => {
      cleanup();
      reject(
        new Error(
          `dashboard exited before launch: code=${String(code)} signal=${String(
            signal
          )}\nstdout:\n${stdout}\nstderr:\n${stderr()}`
        )
      );
    };
    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off("data", onData);
      child.off("exit", onExit);
    };
    child.stdout.on("data", onData);
    child.once("exit", onExit);
  });
}

test("accepts only an emitted loopback launch URL", () => {
  const parsed = parseLaunchUrl(
    "ready\nCoven Memory: http://127.0.0.1:3737/\n"
  );
  assert.equal(parsed?.href, "http://127.0.0.1:3737/");
  assert.equal(
    parseLaunchUrl("Coven Memory: http://[::1]:3737/\n")?.href,
    "http://[::1]:3737/"
  );
  assert.equal(
    parseLaunchUrl("Coven Memory: http://127.0.0.1:80/\n")?.href,
    "http://127.0.0.1/"
  );
  assert.equal(
    parseLaunchUrl("Coven Memory: http://127.0.0.1:65535/\n")?.href,
    "http://127.0.0.1:65535/"
  );
  for (const rejected of [
    "https://memory.example/",
    "http://127.0.0.1/",
    "http://127.0.0.1:3737/path",
    "http://127.0.0.1:3737/?next=remote",
    "http://127.0.0.1:3737/#fragment",
    "http://user@127.0.0.1:3737/",
    "not-a-url"
  ]) {
    assert.throws(
      () => parseLaunchUrl(`Coven Memory: ${rejected}\n`),
      /refusing invalid launch URL/
    );
  }
});

test("uses shell-free platform browser commands", () => {
  const url = "http://127.0.0.1:3737/";
  assert.deepEqual(browserCommand("darwin", url), {
    program: "open",
    args: [url]
  });
  assert.deepEqual(browserCommand("linux", url), {
    program: "xdg-open",
    args: [url]
  });
  assert.deepEqual(browserCommand("win32", url), {
    program: "rundll32.exe",
    args: ["url.dll,FileProtocolHandler", url]
  });
});

test("uses conventional signal exit codes on Windows", () => {
  assert.equal(signalExitCode("SIGINT", { SIGINT: 2 }), 130);
  assert.equal(signalExitCode("SIGTERM", { SIGTERM: 15 }), 143);
  assert.equal(signalExitCode("UNKNOWN", {}), 1);
});

test("recognizes the executable through a symlinked parent directory", () => {
  const canonicalize = (path) =>
    path.replace(/^\/var\//, "/private/var/");

  assert.equal(
    isMainModule(
      "/private/var/package/bin/coven-memory-dashboard.mjs",
      "/var/package/bin/coven-memory-dashboard.mjs",
      canonicalize
    ),
    true
  );
});

test(
  "preserves SIGINT and SIGTERM termination during startup",
  { skip: process.platform === "win32", timeout: 30_000 },
  async () => {
    for (const signal of ["SIGINT", "SIGTERM"]) {
      const port = await freePort();
      let stderr = "";
      const child = spawn(process.execPath, [dashboardEntry], {
        cwd: packageRoot,
        env: {
          ...process.env,
          COVEN_MEMORY_NO_BROWSER: "1",
          HOST: "127.0.0.1",
          NODE_ENV: "production",
          PORT: String(port)
        },
        stdio: ["ignore", "pipe", "pipe"]
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });

      try {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const exited = once(child, "exit");
        assert.equal(child.kill(signal), true);
        const [code, exitSignal] = await exited;
        assert.equal(code, null, `${signal} became exit ${String(code)}: ${stderr}`);
        assert.equal(exitSignal, signal, stderr);
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
          await once(child, "exit");
        }
      }
    }
  }
);

test(
  "preserves SIGINT and SIGTERM termination after forwarding to the server",
  { skip: process.platform === "win32", timeout: 90_000 },
  async () => {
    for (const signal of ["SIGINT", "SIGTERM"]) {
      const port = await freePort();
      let stderr = "";
      const child = spawn(process.execPath, [dashboardEntry], {
        cwd: packageRoot,
        env: {
          ...process.env,
          COVEN_MEMORY_NO_BROWSER: "1",
          HOST: "127.0.0.1",
          NODE_ENV: "production",
          PORT: String(port)
        },
        stdio: ["ignore", "pipe", "pipe"]
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });

      try {
        await waitForLaunch(child, () => stderr);
        const exited = once(child, "exit");
        assert.equal(child.kill(signal), true);
        const [code, exitSignal] = await exited;
        assert.equal(code, null, `${signal} became exit ${String(code)}: ${stderr}`);
        assert.equal(exitSignal, signal, stderr);
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
          await once(child, "exit");
        }
      }
    }
  }
);
