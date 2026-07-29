import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanDemoTree } from "./check-demo-boundary.mjs";

async function fixtureTree(contents) {
  const root = await mkdtemp(join(tmpdir(), "coven-demo-boundary-"));
  await mkdir(join(root, "nested"));
  await writeFile(join(root, "nested", "fixture.js"), contents);
  return root;
}

test("accepts a static synthetic tree", async () => {
  const root = await fixtureTree(
    'export const label = "Synthetic demo data";'
  );
  try {
    await assert.doesNotReject(() => scanDemoTree(root, { source: true }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("accepts framework URL-parser vocabulary but rejects a loopback URL", async () => {
  const parser = await fixtureTree(
    'const segment = "route"; if (host === "localhost") host = "";'
  );
  const target = await fixtureTree(
    'const target = "http://127.0.0.1:43117";'
  );
  try {
    await assert.doesNotReject(() => scanDemoTree(parser));
    await assert.rejects(
      () => scanDemoTree(target),
      /forbidden demo boundary pattern/
    );
  } finally {
    await rm(parser, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

for (const [name, contents] of [
  ["memory endpoint", 'const endpoint = "/api/memory";'],
  ["private-network URL", 'const target = "http://192.168.1.8";'],
  ["network request", 'fetch("/fixture.json");'],
  ["browser persistence", 'localStorage.setItem("mode", "demo");'],
  ["telemetry", 'analytics.track("opened");'],
  ["dynamic server action", '"use server";']
]) {
  test(`rejects a source tree containing ${name}`, async () => {
    const root = await fixtureTree(contents);
    try {
      await assert.rejects(
        () => scanDemoTree(root, { source: true }),
        /forbidden demo boundary pattern/
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
