import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";

test("root Vercel builds fail with the safe project-root instruction", async () => {
  const result = await new Promise((resolve) => {
    execFile(
      process.execPath,
      ["scripts/refuse-root-vercel-build.mjs"],
      { encoding: "utf8" },
      (error, stdout, stderr) => resolve({ error, stdout, stderr })
    );
  });

  assert(result.error);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Vercel Root Directory to site/);
});
