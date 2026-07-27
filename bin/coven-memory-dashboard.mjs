#!/usr/bin/env node
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { constants as osConstants } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const modulePath = fileURLToPath(import.meta.url);
const packageRoot = resolve(dirname(modulePath), "..");
const serverPath = resolve(packageRoot, "server.ts");
const launchPattern = /(?:^|\n)Coven Memory: ([^\r\n]+)/;

export function parseLaunchUrl(output) {
  const match = launchPattern.exec(output);
  if (!match) {
    return null;
  }

  const emitted = match[1];
  const emittedLoopback =
    /^http:\/\/(?:127\.0\.0\.1|\[::1\]):([1-9]\d{0,4})\/$/.exec(
      emitted
    );
  if (!emittedLoopback || Number(emittedLoopback[1]) > 65_535) {
    throw new Error("refusing invalid launch URL");
  }

  let url;
  try {
    url = new URL(emitted);
  } catch {
    throw new Error("refusing invalid launch URL");
  }
  const loopback =
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "[::1]") &&
    !url.username &&
    !url.password &&
    url.pathname === "/" &&
    !url.search &&
    !url.hash;
  if (!loopback) {
    throw new Error("refusing invalid launch URL");
  }
  return url;
}

export function browserCommand(platform, url) {
  if (platform === "darwin") {
    return { program: "open", args: [url] };
  }
  if (platform === "win32") {
    return {
      program: "rundll32.exe",
      args: ["url.dll,FileProtocolHandler", url]
    };
  }
  return { program: "xdg-open", args: [url] };
}

export function isMainModule(
  moduleFile,
  argvFile,
  canonicalize = realpathSync
) {
  try {
    return canonicalize(moduleFile) === canonicalize(argvFile);
  } catch {
    return false;
  }
}

export function signalExitCode(signal, signals = osConstants.signals) {
  const signalNumber = signals[signal];
  return signalNumber === undefined ? 1 : 128 + signalNumber;
}

function openBrowser(url) {
  if (process.env.COVEN_MEMORY_NO_BROWSER === "1") {
    return;
  }
  const spec = browserCommand(process.platform, url.href);
  const opener = spawn(spec.program, spec.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  opener.on("error", (error) => {
    process.stderr.write(
      `Could not open the browser automatically: ${error.message}\n`
    );
  });
  opener.unref();
}

export function run() {
  const child = spawn(process.execPath, ["--import", "tsx", serverPath], {
    cwd: packageRoot,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["inherit", "pipe", "inherit"],
    windowsHide: false
  });
  let buffered = "";
  let opened = false;
  let startupFailed = false;

  function failStartup(message) {
    if (startupFailed) {
      return;
    }
    startupFailed = true;
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
    child.kill("SIGTERM");
  }

  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    if (opened || startupFailed) {
      return;
    }
    buffered += chunk.toString("utf8");
    if (buffered.length > 64 * 1024) {
      failStartup("Dashboard startup output exceeded limit.");
      return;
    }
    let launchUrl;
    try {
      launchUrl = parseLaunchUrl(buffered);
    } catch (error) {
      failStartup(
        `Refused dashboard launch URL: ${
          error instanceof Error ? error.message : "invalid output"
        }`
      );
      return;
    }
    if (launchUrl) {
      opened = true;
      buffered = "";
      openBrowser(launchUrl);
    }
  });

  const signalHandlers = new Map();
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const handler = () => {
      if (!child.killed) {
        child.kill(signal);
      }
    };
    signalHandlers.set(signal, handler);
    process.on(signal, handler);
  }

  child.on("error", (error) => {
    process.stderr.write(`Failed to start Coven Memory: ${error.message}\n`);
    process.exitCode = 1;
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      if (!startupFailed) {
        const handler = signalHandlers.get(signal);
        if (handler) {
          process.off(signal, handler);
        }
        if (process.platform === "win32") {
          process.exit(signalExitCode(signal));
        } else {
          process.kill(process.pid, signal);
        }
      }
      return;
    }
    if (!opened && !startupFailed) {
      process.stderr.write(
        "Coven Memory exited before emitting a launch URL.\n"
      );
      process.exitCode = 1;
      return;
    }
    if (!startupFailed) {
      process.exitCode = code ?? 1;
    }
  });
}

if (process.argv[1] && isMainModule(modulePath, process.argv[1])) {
  run();
}
