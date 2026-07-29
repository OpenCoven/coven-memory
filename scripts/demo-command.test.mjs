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
