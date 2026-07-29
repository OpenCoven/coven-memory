import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const host = "127.0.0.1";
const timeoutMs = 60_000;
const childStopTimeoutMs = 2_000;
const diagnosticLimit = 8 * 1_024;
const screenshotDirectory = "output/playwright";
const children = [];
let browser;
let socketDirectory;

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runWithCleanup(action, cleanupSteps, description) {
  let primaryFailed = false;
  let primaryError;
  let result;
  try {
    result = await action();
  } catch (error) {
    primaryFailed = true;
    primaryError = error;
  }

  const cleanupErrors = [];
  for (const cleanup of cleanupSteps) {
    try {
      await cleanup();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (primaryFailed) {
    if (cleanupErrors.length === 0) {
      throw primaryError;
    }
    throw new AggregateError(
      [primaryError, ...cleanupErrors],
      `${description} and cleanup failed`,
      { cause: primaryError }
    );
  }
  if (cleanupErrors.length === 1) {
    throw cleanupErrors[0];
  }
  if (cleanupErrors.length > 1) {
    throw new AggregateError(
      cleanupErrors,
      `${description} cleanup failed`
    );
  }
  return result;
}

async function freePorts(count) {
  const servers = [];
  const ports = [];
  try {
    for (let index = 0; index < count; index += 1) {
      const server = createServer();
      servers.push(server);
      server.listen(0, host);
      await once(server, "listening");
      const address = server.address();
      invariant(
        address && typeof address !== "string",
        "port allocation failed"
      );
      invariant(!ports.includes(address.port), "port allocation was not unique");
      ports.push(address.port);
    }
    return ports;
  } finally {
    await Promise.all(
      servers.map(async (server) => {
        if (!server.listening) {
          return;
        }
        const closed = once(server, "close");
        server.close();
        await closed;
      })
    );
  }
}

function redactDiagnostics(value) {
  return [
    [process.cwd(), "<cwd>"],
    [tmpdir(), "<tmp>"]
  ]
    .sort(([left], [right]) => right.length - left.length)
    .reduce(
      (redacted, [path, replacement]) =>
        path ? redacted.replaceAll(path, replacement) : redacted,
      value
    );
}

function appendDiagnostics(current, chunk) {
  const combined = current + redactDiagnostics(chunk.toString("utf8"));
  if (combined.length <= diagnosticLimit) {
    return combined;
  }
  const marker = "[earlier stderr truncated]\n";
  return marker + combined.slice(-(diagnosticLimit - marker.length));
}

function diagnosticSuffix(managed) {
  const diagnostics = managed.diagnostics.trim();
  return diagnostics ? `\nstderr:\n${diagnostics}` : "\nstderr: <empty>";
}

function managedFailure(managed, summary) {
  return new Error(`${summary}${diagnosticSuffix(managed)}`);
}

function startManaged(name, command, args, env) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let resolveSpawnError;
  let resolveClosed;
  const spawnError = new Promise((resolve) => {
    resolveSpawnError = resolve;
  });
  const closed = new Promise((resolve) => {
    resolveClosed = resolve;
  });
  const managed = {
    name,
    child,
    diagnostics: "",
    spawnError: null,
    closeResult: null,
    closed,
    failure: null
  };

  child.stderr.on("data", (chunk) => {
    managed.diagnostics = appendDiagnostics(managed.diagnostics, chunk);
  });
  child.once("error", (error) => {
    managed.spawnError = error;
    resolveSpawnError(error);
  });
  child.once("close", (code, signal) => {
    const result = { code, signal };
    managed.closeResult = result;
    resolveClosed(result);
  });
  managed.failure = Promise.race([
    spawnError.then((error) => ({ kind: "spawn-error", error })),
    closed.then((result) => ({ kind: "close", ...result }))
  ]);
  children.push(managed);
  return managed;
}

async function waitFor(url, managed) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const outcome = await Promise.race([
      fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(1_000)
      }).then(
        (response) => ({ kind: "response", response }),
        () => ({ kind: "request-error" })
      ),
      managed.failure.then((failure) => ({ kind: "child-failure", failure }))
    ]);
    if (outcome.kind === "child-failure") {
      const failure = outcome.failure;
      const reason =
        failure.kind === "spawn-error"
          ? `failed to spawn: ${redactDiagnostics(failure.error.message)}`
          : `closed with code ${String(failure.code)} and signal ${String(
              failure.signal
            )}`;
      throw managedFailure(
        managed,
        `${managed.name} ${reason} before becoming ready`
      );
    }
    if (
      outcome.kind === "response" &&
      outcome.response.ok &&
      managed.closeResult === null
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw managedFailure(
    managed,
    `${managed.name} did not become ready within ${timeoutMs}ms`
  );
}

function launchUrl(managed) {
  return new Promise((resolve, reject) => {
    let buffered = "";
    let settled = false;
    let timer;
    const { child } = managed;
    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
      }
      child.stdout.off("data", onData);
      child.off("error", onError);
      child.off("exit", onExit);
    };
    const settle = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback(value);
    };
    const fail = (summary) => {
      settle(reject, managedFailure(managed, summary));
    };
    const onData = (chunk) => {
      try {
        buffered += chunk.toString("utf8");
        if (buffered.length > 64 * 1_024) {
          fail("dashboard output exceeded limit before becoming ready");
          return;
        }
        const match = /(?:^|\n)Coven Memory: ([^\r\n]+)/.exec(buffered);
        if (!match) {
          return;
        }
        settle(resolve, new URL(match[1]));
      } catch (error) {
        fail(
          error instanceof Error
            ? `dashboard emitted an invalid launch URL: ${redactDiagnostics(
                error.message
              )}`
            : "dashboard emitted an invalid launch URL"
        );
      }
    };
    const onError = (error) => {
      fail(
        `dashboard failed to spawn: ${redactDiagnostics(error.message)}`
      );
    };
    const onExit = (code, signal) => {
      fail(
        `dashboard exited before becoming ready with code ${String(
          code
        )} and signal ${String(signal)}`
      );
    };

    timer = setTimeout(
      () =>
        fail(`dashboard did not become ready within ${timeoutMs}ms`),
      timeoutMs
    );
    child.stdout.on("data", onData);
    child.once("error", onError);
    child.once("exit", onExit);

    if (managed.spawnError) {
      onError(managed.spawnError);
    } else if (
      child.exitCode !== null ||
      child.signalCode !== null ||
      managed.closeResult
    ) {
      onExit(child.exitCode, child.signalCode);
    }
  });
}

async function waitForClose(managed, durationMs) {
  let timer;
  const outcome = await Promise.race([
    managed.closed.then((result) => ({ closed: true, result })),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ closed: false }), durationMs);
    })
  ]);
  if (timer) {
    clearTimeout(timer);
  }
  return outcome;
}

async function stop(managed) {
  const { child } = managed;
  if (!managed.closeResult) {
    if (
      child.exitCode === null &&
      child.signalCode === null &&
      !managed.spawnError
    ) {
      child.kill("SIGTERM");
    }
    let outcome = await waitForClose(managed, childStopTimeoutMs);
    if (!outcome.closed) {
      child.kill("SIGKILL");
      outcome = await waitForClose(managed, childStopTimeoutMs);
    }
    if (!outcome.closed) {
      throw managedFailure(
        managed,
        `${managed.name} did not terminate after SIGTERM and SIGKILL`
      );
    }
  }
  if (
    !managed.spawnError &&
    child.exitCode === null &&
    child.signalCode === null
  ) {
    throw managedFailure(
      managed,
      `${managed.name} closed without an exit code or signal`
    );
  }
}

async function stopChildren() {
  const results = await Promise.allSettled(
    [...children].reverse().map(stop)
  );
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : []
  );
  if (failures.length > 0) {
    throw new AggregateError(failures, "child cleanup failed");
  }
  const incomplete = children.filter(
    (managed) =>
      !managed.closeResult ||
      (!managed.spawnError &&
        managed.child.exitCode === null &&
        managed.child.signalCode === null)
  );
  if (incomplete.length > 0) {
    throw new Error(
      `child cleanup incomplete: ${incomplete
        .map((managed) => managed.name)
        .join(", ")}`
    );
  }
}

async function expectNoText(page, text) {
  invariant(
    (await page.getByText(text, { exact: true }).count()) === 0,
    `unexpected visible text: ${text}`
  );
}

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  invariant(overflow <= 1, `${label} overflowed horizontally by ${overflow}px`);
}

async function assertRovingTabStop(page, label) {
  const count = await page.locator(".memory-list-row").evaluateAll((nodes) =>
    nodes.filter((node) => node.tabIndex === 0).length
  );
  invariant(count === 1, `${label} exposed ${count} memory-list tab stops`);
}

async function assertSplitGeometry(page, label) {
  const geometry = await page.evaluate(() => {
    const library = document.querySelector(".memory-library-slot");
    const list = document.querySelector(".memory-list-slot");
    const reader = document.querySelector(".memory-reader-slot");
    const content = document.querySelector(".memory-reader-content");
    const inspector = document.querySelector(".memory-inspector");
    if (!library || !list || !reader || !content || !inspector) {
      return null;
    }
    const libraryRect = library.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const readerRect = reader.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const inspectorRect = inspector.getBoundingClientRect();
    return {
      libraryLeft: libraryRect.left,
      libraryRight: libraryRect.right,
      listLeft: listRect.left,
      listRight: listRect.right,
      listTop: listRect.top,
      readerLeft: readerRect.left,
      readerTop: readerRect.top,
      contentRight: contentRect.right,
      inspectorLeft: inspectorRect.left,
      inspectorVisible:
        inspector.getClientRects().length > 0 &&
        getComputedStyle(inspector).display !== "none"
    };
  });
  invariant(geometry, `${label} workspace panes were missing`);
  invariant(
    geometry.libraryLeft < geometry.listLeft &&
      geometry.libraryRight <= geometry.listLeft + 1 &&
      geometry.listLeft < geometry.readerLeft &&
      geometry.listRight <= geometry.readerLeft + 1,
    `${label} workspace was not ordered library-index-reader`
  );
  invariant(
    Math.abs(geometry.listTop - geometry.readerTop) <= 1,
    `${label} workspace panes did not align`
  );
  invariant(
    geometry.inspectorVisible &&
      geometry.contentRight <= geometry.inspectorLeft + 1,
    `${label} provenance sidecar was not reachable beside the reader`
  );
}

async function assertStackedReaderGeometry(page, label) {
  const geometry = await page.evaluate(() => {
    const content = document.querySelector(".memory-reader-content");
    const inspector = document.querySelector(".memory-inspector");
    const separator = document.querySelector(".memory-inspector-separator");
    if (!content || !inspector) {
      return null;
    }
    const contentRect = content.getBoundingClientRect();
    const inspectorRect = inspector.getBoundingClientRect();
    return {
      contentBottom: contentRect.bottom,
      inspectorTop: inspectorRect.top,
      inspectorVisible:
        inspector.getClientRects().length > 0 &&
        getComputedStyle(inspector).display !== "none",
      separatorVisible: Boolean(separator && separator.getClientRects().length > 0)
    };
  });
  invariant(geometry, `${label} reader panes were missing`);
  invariant(
    geometry.inspectorVisible && geometry.inspectorTop >= geometry.contentBottom - 1,
    `${label} provenance sidecar was not stacked after reader content`
  );
  invariant(!geometry.separatorVisible, `${label} exposed a desktop provenance separator`);
}

async function assertComposedFocusShadow(
  locator,
  label,
  { expectInset = false } = {}
) {
  await locator.focus();
  await locator.press("ArrowLeft");
  const result = await locator.evaluate((node) => {
    const shadow = getComputedStyle(node).boxShadow;
    let depth = 0;
    let layers = shadow === "none" ? 0 : 1;
    for (const character of shadow) {
      if (character === "(") depth += 1;
      if (character === ")") depth -= 1;
      if (character === "," && depth === 0) layers += 1;
    }
    return {
      focused: node === document.activeElement,
      focusVisible: node.matches(":focus-visible"),
      shadow,
      layers,
      hasInset: shadow.includes("inset")
    };
  });
  invariant(result.focused, `${label} did not receive focus`);
  invariant(result.focusVisible, `${label} was not visibly focused`);
  invariant(
    result.layers >= 2,
    `${label} did not compose its active and focus shadows: ${result.shadow}`
  );
  invariant(
    !expectInset || result.hasInset,
    `${label} lost its selected inset marker: ${result.shadow}`
  );
}

async function contrastFailures(page, selectors) {
  return page.evaluate((targets) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    function rgba(value) {
      if (!context || !CSS.supports("color", value)) {
        return null;
      }
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(
        0,
        0,
        1,
        1
      ).data;
      return [red, green, blue, alpha / 255];
    }

    function composite(foreground, background) {
      const alpha = foreground[3];
      return [
        foreground[0] * alpha + background[0] * (1 - alpha),
        foreground[1] * alpha + background[1] * (1 - alpha),
        foreground[2] * alpha + background[2] * (1 - alpha)
      ];
    }

    function background(element) {
      const chain = [];
      let current = element;
      while (current) {
        chain.push(current);
        current = current.parentElement;
      }
      let color = [255, 255, 255];
      for (const node of chain.reverse()) {
        const parsed = rgba(getComputedStyle(node).backgroundColor);
        if (parsed && parsed[3] > 0) {
          color = composite(parsed, color);
        }
      }
      return color;
    }

    function luminance(rgb) {
      const linear = rgb.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
      return (
        0.2126 * linear[0] +
        0.7152 * linear[1] +
        0.0722 * linear[2]
      );
    }

    function ratio(foreground, backdrop) {
      const light = Math.max(luminance(foreground), luminance(backdrop));
      const dark = Math.min(luminance(foreground), luminance(backdrop));
      return (light + 0.05) / (dark + 0.05);
    }

    return targets.flatMap((selector) => {
      const nodes = [...document.querySelectorAll(selector)]
        .filter((node) => node.getClientRects().length > 0)
        .slice(0, 2);
      if (nodes.length === 0) {
        return [`${selector}: no visible target`];
      }
      return nodes.flatMap((node) => {
        const foreground = rgba(getComputedStyle(node).color);
        if (!foreground) {
          return [`${selector}: unreadable computed color`];
        }
        const backdrop = background(node);
        const composited = composite(foreground, backdrop);
        const value = ratio(composited, backdrop);
        return value >= 4.5
          ? []
          : [
              `${selector}: ${value.toFixed(2)} ` +
                `(fg ${getComputedStyle(node).color} ` +
                `${foreground.join("/")} local-bg ` +
                `${getComputedStyle(node).backgroundColor} ` +
                `row-bg ${getComputedStyle(
                  node.closest(".memory-list-row") ?? node
                ).backgroundColor} ` +
                `bg ${backdrop.join("/")})`
            ];
      });
    });
  }, selectors);
}

async function setTheme(page, theme) {
  await page.locator("html").evaluate((node, value) => {
    node.setAttribute("data-cv-theme", value);
  }, theme);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
  );
  await page
    .locator(".memory-list-row[aria-current]")
    .evaluate((node) =>
      Promise.all(
        node.getAnimations().map((animation) =>
          animation.finished.catch(() => undefined)
        )
      )
    );
}

async function captureThemedScreenshot(page, path, theme) {
  invariant(
    path.includes(`-${theme}-`),
    `screenshot artifact name did not declare ${theme}: ${path}`
  );
  const state = await page.locator("html").evaluate((node) => ({
    attribute: node.getAttribute("data-cv-theme"),
    colorScheme: getComputedStyle(node).colorScheme
  }));
  invariant(
    state.attribute === theme && state.colorScheme.includes(theme),
    `${path} theme drifted: attribute=${state.attribute} ` +
      `color-scheme=${state.colorScheme}`
  );
  await page.screenshot({ path, fullPage: true });
}

function maximumDurationMs(value) {
  return Math.max(
    ...value.split(",").map((entry) => {
      const duration = Number.parseFloat(entry);
      return entry.trim().endsWith("ms") ? duration : duration * 1_000;
    })
  );
}

async function verifyDashboard() {
  const [fakePort, dashboardPort] = await freePorts(2);
  invariant(fakePort !== dashboardPort, "allocated ports were not distinct");
  const fakeOrigin = `http://${host}:${fakePort}`;
  const dashboardOrigin = `http://${host}:${dashboardPort}`;
  socketDirectory = await mkdtemp(
    join(tmpdir(), "coven-memory-browser-")
  );
  const absentSocketPath = join(socketDirectory, "daemon.sock");

  const fakeDaemon = startManaged(
    "fake daemon",
    process.execPath,
    ["scripts/fake-memory-daemon.mjs"],
    { FAKE_DAEMON_PORT: String(fakePort) }
  );
  await waitFor(`${fakeOrigin}/api/v1/memory`, fakeDaemon);

  const dashboard = startManaged(
    "dashboard",
    process.execPath,
    ["--import", "tsx", "server.ts"],
    {
      NODE_ENV: "production",
      HOST: host,
      PORT: String(dashboardPort),
      COVEN_DAEMON_URL: fakeOrigin,
      COVEN_DAEMON_SOCKET: absentSocketPath
    }
  );
  const launched = await launchUrl(dashboard);
  invariant(launched.origin === dashboardOrigin, "unexpected dashboard origin");
  invariant(launched.hash === "", "dashboard URL contained a launch fragment");
  invariant(
    launched.search === "",
    "dashboard URL contained launch credentials"
  );

  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
    reducedMotion: "no-preference",
    locale: "en-US",
    timezoneId: "UTC"
  });
  const errors = [];
  const expectedTransportErrors = [];
  const foreignRequests = [];
  const detailRequests = [];
  const sessionRequests = [];

  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    let origin;
    try {
      origin = new URL(requestUrl).origin;
    } catch {
      foreignRequests.push(requestUrl);
      await route.abort("blockedbyclient");
      return;
    }
    if (origin !== dashboardOrigin) {
      foreignRequests.push(requestUrl);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });

  function trackPage(page) {
    page.on("console", (message) => {
      if (message.type() === "error") {
        const text = message.text();
        if (
          text ===
          "Failed to load resource: the server responded with a status of 403 (Forbidden)"
        ) {
          expectedTransportErrors.push(text);
        } else {
          errors.push(text);
        }
      }
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/session/")) {
        sessionRequests.push(url.pathname);
      }
      if (/^\/api\/memory\/[0-9a-f-]{36}$/i.test(url.pathname)) {
        detailRequests.push(url.pathname);
      }
    });
  }

  const page = await context.newPage();
  trackPage(page);
  const documentResponse = await page.goto(launched.href, {
    waitUntil: "domcontentloaded"
  });
  invariant(documentResponse?.status() === 200, "dashboard document failed");
  const documentHeaders = await documentResponse.allHeaders();
  const csp = documentHeaders["content-security-policy"] ?? "";
  invariant(csp.includes("'strict-dynamic'"), "strict document CSP missing");
  invariant(!csp.includes("'unsafe-inline'"), "unsafe inline CSP remained");
  invariant(!csp.includes("'unsafe-eval'"), "production eval CSP remained");
  invariant(
    documentHeaders["cache-control"]?.includes("no-store"),
    "protected dashboard document was cacheable"
  );

  await page
    .getByRole("heading", { name: "Memory", exact: true })
    .waitFor();
  await page
    .getByRole("heading", { name: "Architecture decisions" })
    .waitFor();
  await expectNoText(page, "Loading memory…");

  await page
    .getByRole("button", { name: "Coven origin, 2" })
    .waitFor();
  await page
    .getByRole("button", { name: "Promoted memory, 1" })
    .waitFor();
  await assertRovingTabStop(page, "desktop");
  await assertNoOverflow(page, "desktop");
  await assertSplitGeometry(page, "desktop");

  await page.getByRole("button", { name: "Collapse Library" }).click();
  invariant(
    (await page.getByRole("button", { name: "Show Library" }).count()) === 1,
    "Library did not collapse"
  );
  invariant(
    (await page.getByRole("region", { name: "Memory index" }).count()) === 1,
    "Memory Index disappeared when Library collapsed"
  );
  await assertNoOverflow(page, "collapsed Library");

  await page.getByRole("button", { name: "Collapse provenance" }).click();
  invariant(
    (await page.getByRole("button", { name: "Show provenance" }).count()) === 1,
    "Provenance did not collapse"
  );
  invariant(
    (await page.locator(".memory-inspector").getAttribute("data-collapsed")) ===
      "true",
    "Provenance collapse state was not exposed"
  );
  invariant(
    (await page.getByRole("button", { name: "Show Library" }).count()) === 1,
    "Library collapse state changed while Provenance collapsed"
  );
  await assertNoOverflow(page, "collapsed Library and Provenance");

  await page.getByRole("button", { name: "Show Library" }).click();
  await page.getByRole("button", { name: "Show provenance" }).click();
  invariant(
    (await page.getByRole("button", { name: "Collapse Library" }).count()) === 1 &&
      (await page.getByRole("button", { name: "Collapse provenance" }).count()) === 1,
    "Library and Provenance did not restore independently"
  );

  const librarySeparator = page.getByRole("separator", {
    name: "Resize Library"
  });
  await librarySeparator.focus();
  await librarySeparator.press("ArrowLeft");
  invariant(
    (await librarySeparator.getAttribute("aria-valuenow")) === "200",
    "Library separator ArrowLeft did not resize by one keyboard step"
  );
  await librarySeparator.press("Home");
  invariant(
    (await librarySeparator.getAttribute("aria-valuenow")) === "144",
    "Library separator Home did not reach its minimum"
  );
  await librarySeparator.press("End");
  invariant(
    (await librarySeparator.getAttribute("aria-valuenow")) === "360",
    "Library separator End did not reach its maximum"
  );
  await librarySeparator.press("Home");
  for (let index = 0; index < 6; index += 1) {
    await librarySeparator.press("ArrowRight");
  }
  invariant(
    (await librarySeparator.getAttribute("aria-valuenow")) === "240",
    "Library separator did not retain its committed keyboard width"
  );

  const provenanceSeparator = page.getByRole("separator", {
    name: "Resize provenance"
  });
  await provenanceSeparator.focus();
  await provenanceSeparator.press("ArrowLeft");
  invariant(
    (await provenanceSeparator.getAttribute("aria-valuenow")) === "304",
    "Provenance separator ArrowLeft did not resize by one keyboard step"
  );
  await provenanceSeparator.press("Home");
  invariant(
    (await provenanceSeparator.getAttribute("aria-valuenow")) === "224",
    "Provenance separator Home did not reach its minimum"
  );
  await provenanceSeparator.press("End");
  invariant(
    (await provenanceSeparator.getAttribute("aria-valuenow")) === "384",
    "Provenance separator End did not reach its maximum"
  );
  await provenanceSeparator.press("Home");
  await provenanceSeparator.press("ArrowLeft");
  await provenanceSeparator.press("ArrowLeft");
  invariant(
    (await provenanceSeparator.getAttribute("aria-valuenow")) === "256",
    "Provenance separator did not retain its committed keyboard width"
  );
  await assertNoOverflow(page, "keyboard-resized desktop");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Architecture decisions" }).waitFor();
  await page.getByRole("separator", { name: "Resize Library" }).waitFor();
  invariant(
    (await page.getByRole("separator", { name: "Resize Library" }).getAttribute("aria-valuenow")) ===
      "240",
    "Library width did not persist across reload"
  );
  invariant(
    (await page.getByRole("separator", { name: "Resize provenance" }).getAttribute("aria-valuenow")) ===
      "256",
    "Provenance width did not persist across reload"
  );
  await assertNoOverflow(page, "reloaded desktop");

  const rows = page.locator(".memory-list-row");
  const firstRow = rows.nth(0);
  const secondRow = rows.nth(1);
  const firstDetailPath =
    "/api/memory/d251bc66-3e45-5d03-8d78-1e76919642f9";
  const secondDetailPath =
    "/api/memory/27acb99a-4de2-5ac5-a1e2-55bc61cfbd4a";

  await mkdir(screenshotDirectory, { recursive: true });
  await captureThemedScreenshot(
    page,
    `${screenshotDirectory}/dashboard-dark-redaction.png`,
    "dark"
  );
  await page.getByRole("button", { name: "Reveal memory content" }).click();
  invariant(
    (await page.locator(".memory-markdown ul").count()) === 1,
    "Markdown list was not structural"
  );
  invariant(
    (await page.locator(".memory-markdown script").count()) === 0,
    "raw script reached rendered memory"
  );
  invariant(
    (await page.locator(".memory-markdown img").count()) === 0,
    "Markdown image initiated a render"
  );
  invariant(
    (await page.locator(".memory-markdown").getByText("unsafe()", {
      exact: true
    }).count()) === 0,
    "raw HTML content remained visible"
  );
  const reactivationRequestsBefore = detailRequests.filter(
    (path) => path === firstDetailPath
  ).length;
  await firstRow.click();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
  );
  await page
    .getByRole("heading", { name: "Architecture decisions" })
    .waitFor();
  await expectNoText(page, "Loading memory…");
  invariant(
    (await page
      .getByRole("heading", { name: "Couldn't open this memory" })
      .count()) === 0,
    "reactivating the selected row left the reader unavailable"
  );
  invariant(
    detailRequests.filter((path) => path === firstDetailPath).length ===
      reactivationRequestsBefore,
    "reactivating the selected row refetched its detail"
  );
  invariant(
    (await page.locator(".memory-markdown").count()) === 1,
    "reactivating the selected row unmounted revealed Markdown"
  );

  const viewGroup = page.getByRole("group", { name: "Content view" });
  const rawButton = viewGroup.getByRole("button", { name: "Raw" });
  const renderedButton = viewGroup.getByRole("button", { name: "Rendered" });
  invariant(
    (await renderedButton.getAttribute("aria-pressed")) === "true",
    "rendered view was not selected"
  );
  await rawButton.click();
  invariant(
    (await rawButton.getAttribute("aria-pressed")) === "true",
    "raw view did not become selected"
  );
  await assertComposedFocusShadow(rawButton, "active raw view");
  invariant(
    (await page.locator(".memory-raw").textContent())?.includes(
      "<script>unsafe()</script>"
    ),
    "raw view did not preserve exact escaped Markdown"
  );
  await renderedButton.click();

  await assertComposedFocusShadow(firstRow, "selected memory row", {
    expectInset: true
  });
  await firstRow.press("ArrowDown");
  invariant(
    await secondRow.evaluate((node) => node === document.activeElement),
    "ArrowDown did not move roving focus"
  );
  invariant(
    (await firstRow.getAttribute("aria-current")) === "true",
    "moving focus changed selection"
  );

  const secondRequestsBefore = detailRequests.filter(
    (path) => path === secondDetailPath
  ).length;
  await secondRow.press("Enter");
  await page
    .getByRole("heading", { name: "Maintainer handoff style" })
    .waitFor();
  await page
    .locator(".memory-reader-pane .memory-inspector")
    .getByText("Promoted memory", { exact: true })
    .waitFor();
  invariant(
    detailRequests.filter((path) => path === secondDetailPath).length ===
      secondRequestsBefore + 1,
    "Enter activated the second memory more than once"
  );

  await secondRow.press("Home");
  invariant(
    await firstRow.evaluate((node) => node === document.activeElement),
    "Home did not move focus to the first row"
  );
  invariant(
    (await secondRow.getAttribute("aria-current")) === "true",
    "Home changed selection instead of focus"
  );

  const firstRequestsBefore = detailRequests.filter(
    (path) => path === firstDetailPath
  ).length;
  await firstRow.press("Enter");
  await page
    .getByRole("heading", { name: "Architecture decisions" })
    .waitFor();
  invariant(
    detailRequests.filter((path) => path === firstDetailPath).length ===
      firstRequestsBefore + 1,
    "Enter activated the first memory more than once"
  );
  await page.getByRole("button", { name: "Reveal memory content" }).waitFor();
  invariant(
    (await page.locator(".memory-markdown").count()) === 0,
    "revealed content leaked between memory selections"
  );
  await page.getByRole("button", { name: "Reveal memory content" }).click();

  const contrastSelectors = [
    ".memory-list-row:not([aria-current]) .memory-row-meta",
    ".memory-list-row:not([aria-current]) .memory-row-excerpt",
    ".memory-list-row[aria-current] .memory-row-topline > span",
    ".memory-list-row[aria-current] .memory-row-meta",
    ".memory-list-row[aria-current] .memory-row-excerpt",
    ".memory-list-row[aria-current] .memory-row-status",
    ".memory-reader-time",
    ".memory-overview-summary span",
    ".memory-library-field > span",
    ".memory-markdown",
    ".memory-inspector-section p"
  ];
  for (const theme of ["dark", "light"]) {
    await setTheme(page, theme);
    const failures = await contrastFailures(page, contrastSelectors);
    invariant(
      failures.length === 0,
      `${theme} contrast failed: ${failures.join(", ")}`
    );
    await assertNoOverflow(page, `${theme} desktop`);
    await captureThemedScreenshot(
      page,
      `${screenshotDirectory}/dashboard-${theme}-desktop.png`,
      theme
    );
  }

  await page.setViewportSize({ width: 1024, height: 900 });
  await assertNoOverflow(page, "intermediate layout");
  await assertStackedReaderGeometry(page, "intermediate layout");
  await assertRovingTabStop(page, "intermediate layout");
  const intermediateFilters = page.getByRole("button", {
    name: /^Filters/
  });
  await intermediateFilters.waitFor();
  await intermediateFilters.click();
  invariant(
    (await intermediateFilters.getAttribute("aria-expanded")) === "true",
    "intermediate filter disclosure did not expand"
  );
  const intermediateFilterRegion = page.getByRole("region", {
    name: "Memory filters"
  });
  for (const name of ["Familiar", "Source", "Verification", "Freshness"]) {
    await intermediateFilterRegion.getByRole("combobox", { name }).waitFor();
  }
  await captureThemedScreenshot(
    page,
    `${screenshotDirectory}/dashboard-light-intermediate.png`,
    "light"
  );
  await intermediateFilters.click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await setTheme(page, "light");
  await page
    .getByRole("heading", { name: "Memory", exact: true })
    .waitFor();
  await page.locator(".memory-list-row").first().waitFor();
  const narrowLayout = await page.evaluate(() => {
    const list = document.querySelector(".memory-list-pane");
    const readerSlot = document.querySelector(".memory-reader-slot");
    return {
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      listTop: list?.getBoundingClientRect().top,
      listVisible: Boolean(list && list.getClientRects().length > 0),
      readerHidden: readerSlot
        ? getComputedStyle(readerSlot).display === "none"
        : false
    };
  });
  invariant(narrowLayout.overflow <= 1, "narrow layout overflowed horizontally");
  invariant(narrowLayout.listVisible, "narrow memory index was not visible");
  invariant(narrowLayout.readerHidden, "narrow reader preceded the memory index");
  invariant(
    (await page.getByRole("separator", { name: "Resize Library" }).count()) ===
      0 &&
      (await page
        .getByRole("separator", { name: "Resize provenance" })
        .count()) === 0,
    "desktop resize separators leaked into the mobile layout"
  );
  invariant(
    typeof narrowLayout.listTop === "number" &&
      narrowLayout.listTop < 844 * 1.35,
    "memory index was pushed below the browse-first threshold"
  );
  await assertRovingTabStop(page, "narrow layout");
  await captureThemedScreenshot(
    page,
    `${screenshotDirectory}/dashboard-light-narrow-list.png`,
    "light"
  );

  const filters = page.getByRole("button", { name: /^Filters/ });
  invariant(
    (await filters.getAttribute("aria-controls")) === "memory-filter-facets",
    "filter disclosure did not identify its controlled region"
  );
  invariant(
    (await filters.getAttribute("aria-expanded")) === "false",
    "filters were unexpectedly expanded"
  );
  await filters.click();
  invariant(
    (await filters.getAttribute("aria-expanded")) === "true",
    "filters did not expand"
  );
  for (const name of ["Familiar", "Source", "Verification", "Freshness"]) {
    await page.getByRole("combobox", { name }).waitFor();
  }
  await page.getByRole("searchbox", { name: "Search memories" }).waitFor();

  for (const theme of ["dark", "light"]) {
    await setTheme(page, theme);
    await assertNoOverflow(page, `${theme} narrow`);
    await captureThemedScreenshot(
      page,
      `${screenshotDirectory}/dashboard-${theme}-narrow.png`,
      theme
    );
  }

  await page.locator(".memory-list-row").nth(1).click();
  await page.waitForFunction(
    () => document.activeElement?.id === "reader-title"
  );
  invariant(
    await page
      .locator("#reader-title")
      .evaluate((node) => node === document.activeElement),
    "ready reader heading did not receive focus"
  );
  const readerLayout = await page.evaluate(() => {
    const listSlot = document.querySelector(".memory-list-slot");
    const readerSlot = document.querySelector(".memory-reader-slot");
    return {
      listHidden: listSlot
        ? getComputedStyle(listSlot).display === "none"
        : false,
      readerVisible: Boolean(
        readerSlot && readerSlot.getClientRects().length > 0
      )
    };
  });
  invariant(
    readerLayout.listHidden && readerLayout.readerVisible,
    "narrow reader did not replace the list pane"
  );
  const provenanceStack = await page.evaluate(() => {
    const content = document.querySelector(".memory-reader-content");
    const inspector = document.querySelector(".memory-inspector");
    if (!content || !inspector) {
      return null;
    }
    const contentRect = content.getBoundingClientRect();
    const inspectorRect = inspector.getBoundingClientRect();
    return {
      inspectorVisible:
        inspector.getClientRects().length > 0 &&
        getComputedStyle(inspector).display !== "none",
      contentBottom: contentRect.bottom,
      inspectorTop: inspectorRect.top
    };
  });
  invariant(provenanceStack, "narrow provenance sidecar was missing");
  invariant(
    provenanceStack.inspectorVisible &&
      provenanceStack.inspectorTop >= provenanceStack.contentBottom - 1,
    "narrow provenance did not stack after reader content"
  );
  await assertNoOverflow(page, "narrow reader");
  await captureThemedScreenshot(
    page,
    `${screenshotDirectory}/dashboard-light-narrow-reader.png`,
    "light"
  );
  await page
    .locator(".memory-inspector")
    .scrollIntoViewIfNeeded();
  await captureThemedScreenshot(
    page,
    `${screenshotDirectory}/dashboard-light-narrow-provenance.png`,
    "light"
  );
  await page.getByRole("button", { name: "Back to memories" }).click();
  await page.waitForFunction(
    () =>
      document.activeElement?.matches(
        ".memory-list-row[aria-current='true']"
      )
  );
  invariant(
    await page
      .locator(".memory-list-row[aria-current='true']")
      .evaluate((node) => node === document.activeElement),
    "selected row did not regain focus"
  );
  await assertComposedFocusShadow(
    page.locator(".memory-list-row[aria-current='true']"),
    "narrow selected memory row",
    { expectInset: true }
  );

  const thirdDetailPath =
    "/api/memory/97557380-df25-566e-a6a7-5d5e2e2bb670";
  const detailErrorHandler = async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {}
      })
    });
  };
  await page.route(`**${thirdDetailPath}`, detailErrorHandler, {
    times: 1
  });
  await runWithCleanup(
    async () => {
      await page.locator(".memory-list-row").nth(2).press("Enter");
      await page
        .getByRole("heading", { name: "Couldn't open this memory" })
        .waitFor();
      const errorFocus = await page
        .locator(".memory-reader-pane")
        .evaluate((node) => ({
          focused: node === document.activeElement,
          focusVisible: node.matches(":focus-visible"),
          shadow: getComputedStyle(node).boxShadow
        }));
      invariant(
        errorFocus.focused,
        "detail error did not retain focus on the stable reader target"
      );
      invariant(
        errorFocus.focusVisible && errorFocus.shadow !== "none",
        "detail error reader target did not expose a visible focus ring"
      );
      await page
        .getByRole("button", { name: "Retry memory detail" })
        .waitFor();
      await page.getByRole("button", { name: "Back to memories" }).click();
      await page.waitForFunction(
        () =>
          document.activeElement?.matches(
            ".memory-list-row[aria-current='true']"
          )
      );
    },
    [
      async () => {
        await page.unroute(`**${thirdDetailPath}`, detailErrorHandler);
      }
    ],
    "narrow detail error verification"
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  invariant(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches
    ),
    "browser did not emulate reduced motion"
  );
  const reducedDurations = await page
    .locator(".memory-list-row")
    .first()
    .evaluate((node) => {
      const row = getComputedStyle(node);
      const expander = document.querySelector(".cv-expander-summary");
      const expanderStyle = expander
        ? getComputedStyle(expander, "::before")
        : null;
      const skeleton = document.createElement("span");
      skeleton.className = "memory-skeleton";
      document.body.append(skeleton);
      const skeletonStyle = getComputedStyle(skeleton);
      const result = {
        rowTransition: row.transitionDuration,
        expanderTransition: expanderStyle?.transitionDuration ?? "0s",
        skeletonAnimation: skeletonStyle.animationDuration,
        skeletonIterations: skeletonStyle.animationIterationCount
      };
      skeleton.remove();
      return result;
    });
  invariant(
    maximumDurationMs(reducedDurations.rowTransition) <= 0.011,
    `reduced-motion row transition remained ${reducedDurations.rowTransition}`
  );
  invariant(
    maximumDurationMs(reducedDurations.expanderTransition) <= 0.011,
    `reduced-motion expander transition remained ${reducedDurations.expanderTransition}`
  );
  invariant(
    maximumDurationMs(reducedDurations.skeletonAnimation) <= 0.011 &&
      reducedDurations.skeletonIterations === "1",
    "reduced-motion loading animation remained active"
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });

  const rejectedListPattern = "**/api/memory";
  const rejectedListHandler = async (route) => {
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        code: "invalid_transport"
      })
    });
  };
  await page.route(rejectedListPattern, rejectedListHandler, {
    times: 1
  });
  await runWithCleanup(
    async () => {
      await page.getByRole("button", { name: "Refresh" }).click();
      await page.getByText("Couldn't load memory").waitFor();
      invariant(
        (await page.locator(".memory-list-row").count()) === 0,
        "access rejection retained private memory rows"
      );
      invariant(
        (await page.locator(".memory-markdown, .memory-raw").count()) === 0,
        "access rejection retained private memory content"
      );
      await expectNoText(page, "Memory is locked");
      await page
        .getByRole("button", { name: "Retry memory list" })
        .click();
      await page.locator(".memory-list-row").first().waitFor();
    },
    [
      async () => {
        await page.unroute(rejectedListPattern, rejectedListHandler);
      }
    ],
    "transport rejection verification"
  );

  invariant(errors.length === 0, `browser errors: ${errors.join(" | ")}`);
  invariant(
    expectedTransportErrors.length === 1,
    `expected one transport rejection error, received ${expectedTransportErrors.length}`
  );
  invariant(
    sessionRequests.length === 0,
    `obsolete session requests were sent: ${sessionRequests.join(" | ")}`
  );
  invariant(
    foreignRequests.length === 0,
    `remote requests escaped loopback: ${foreignRequests.join(" | ")}`
  );
}

await runWithCleanup(
  verifyDashboard,
  [
    async () => {
      if (browser) {
        await browser.close();
      }
    },
    async () => {
      await stopChildren();
    },
    async () => {
      if (socketDirectory) {
        await rm(socketDirectory, { recursive: true, force: true });
      }
    }
  ],
  "dashboard browser verification"
);
process.stdout.write(
  "Dashboard browser verification passed: CSP, local transport rejection, sources, Markdown safety, keyboard focus, redaction reset, themes, contrast, reduced motion, and responsive layout.\n"
);
