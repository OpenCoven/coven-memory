import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeRequiredServerFiles } from "./sanitize-build-artifact.mjs";

test("removes build-only absolute roots from the runtime manifest", () => {
  const sanitized = sanitizeRequiredServerFiles({
    version: 1,
    appDir: "/Users/example/private-checkout", // gitleaks:allow — synthetic sanitizer fixture
    config: {
      outputFileTracingRoot: "/Users/example/private-checkout", // gitleaks:allow — synthetic sanitizer fixture
      turbopack: {
        root: "/Users/example/private-checkout" // gitleaks:allow — synthetic sanitizer fixture
      },
      distDir: ".next"
    },
    files: [".next/BUILD_ID"]
  });

  assert.equal(sanitized.appDir, undefined);
  assert.equal(sanitized.config.outputFileTracingRoot, undefined);
  assert.equal(sanitized.config.turbopack, undefined);
  assert.equal(sanitized.config.distDir, ".next");
  assert.doesNotMatch(JSON.stringify(sanitized), /\/Users\/|\/home\//);
});
