import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL("./", import.meta.url));
const excludeNestedWorktrees = projectRoot.includes("/.worktrees/")
  ? []
  : ["**/.worktrees/**"];

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
      ...excludeNestedWorktrees,
      "scripts/dashboard-bin.test.mjs",
      "scripts/sanitize-build-artifact.test.mjs"
    ]
  }
});
