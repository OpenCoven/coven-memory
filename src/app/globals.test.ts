import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const stylesheet = await readFile(
  resolve(process.cwd(), "src/app/globals.css"),
  "utf8"
);

describe("standalone dashboard theme", () => {
  it("uses the crisp dark token contract and plain dashboard surfaces", () => {
    const darkThemeTokens =
      stylesheet.match(/html\[data-cv-theme="dark"\]\s*\{([^}]*)\}/)?.[1] ??
      "";

    expect(darkThemeTokens).toContain("--cv-bg-page: #111113;");
    expect(darkThemeTokens).toContain("--cv-bg-surface: #0d0d0f;");
    expect(darkThemeTokens).toContain("--cv-bg-recessed: #17171a;");
    expect(darkThemeTokens).toContain("--cv-bg-elevated: #17171a;");
    expect(darkThemeTokens).toContain("--cv-surface-interactive: #17171a;");
    expect(darkThemeTokens).toContain("--cv-border-subtle: #29282e;");
    expect(stylesheet).toMatch(
      /\.memory-gate\s*\{[^}]*background:\s*var\(--cv-bg-page\);/
    );
    expect(stylesheet).toMatch(
      /\.memory-reader-content\s*\{[^}]*background:\s*var\(--cv-bg-page\);/
    );
  });
});
