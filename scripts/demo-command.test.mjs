import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("root package delegates demo commands to the static site", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(pkg.scripts.demo, "pnpm --dir site dev");
  assert.equal(pkg.scripts["demo:build"], "pnpm --dir site build");
  assert.equal(
    pkg.scripts["demo:check"],
    "pnpm demo:build && node scripts/check-demo-boundary.mjs"
  );
});

test("browser verification builds the exact source before testing", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  assert.match(pkg.scripts["test:browser"], /^pnpm build && /);
  assert.match(pkg.scripts["test:browser:all"], /^pnpm build && /);
  for (const browser of ["chromium", "firefox", "webkit"]) {
    assert.match(
      pkg.scripts["test:browser:all"],
      new RegExp(`PLAYWRIGHT_BROWSER=${browser} node `)
    );
  }
});

test("Vercel serves the demo as a static export", async () => {
  const config = JSON.parse(await readFile("site/vercel.json", "utf8"));

  assert.equal(config.framework, undefined);
  assert.equal(config.buildCommand, "pnpm build");
  assert.equal(config.outputDirectory, "out");
});
