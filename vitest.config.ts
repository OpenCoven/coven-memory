import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    restoreMocks: true,
    exclude: [
      ...configDefaults.exclude,
      "**/.worktrees/**",
      "scripts/dashboard-bin.test.mjs",
      "scripts/sanitize-build-artifact.test.mjs",
      "scripts/guard-policy.test.mjs"
    ]
  }
});
