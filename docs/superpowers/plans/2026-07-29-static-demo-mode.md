# Static Demo Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-command, static, synthetic Coven Memory demo with an Open demo path and no access to genuine local memory.

**Architecture:** A separate Next static-export application lives under `site/`. Its deterministic fixture is compiled into the page, its interactions remain client-local and non-persistent, and repository checks scan both source and exported assets for forbidden runtime/data seams. The genuine root dashboard and its loopback transport remain unchanged.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript, Vitest, Testing Library, Node test runner, pnpm workspaces, Vercel static configuration.

---

## File map

- `pnpm-workspace.yaml` — declares the independent `site` package.
- `package.json` — exposes `pnpm demo`, demo build, and demo boundary checks.
- `site/package.json` — owns static-demo commands and runtime dependencies.
- `site/next.config.ts` — enables `output: "export"` and disables server-only output.
- `site/tsconfig.json`, `site/next-env.d.ts` — site TypeScript boundary.
- `site/src/lib/demo-memories.ts` — typed deterministic fixtures and pure filtering.
- `site/src/lib/demo-memories.test.ts` — fixture and filtering contract.
- `site/src/components/copy-command.tsx` — resilient local-command copy control.
- `site/src/components/copy-command.test.tsx` — clipboard success/fallback coverage.
- `site/src/components/demo-dashboard.tsx` — interactive synthetic dashboard.
- `site/src/components/demo-dashboard.test.tsx` — labeling, filtering, selection, reveal.
- `site/src/app/layout.tsx` — static metadata and document shell.
- `site/src/app/page.tsx` — launcher, Open demo anchor, local command, demo section.
- `site/src/app/page.test.tsx` — essential server-rendered launcher/demo content.
- `site/src/app/globals.css` — responsive launcher and three-pane dashboard styling.
- `site/vercel.json` — static-site headers for a Vercel project rooted at `site/`.
- `vercel.json` — refuses accidental deployment of the genuine root application.
- `scripts/refuse-root-vercel-build.mjs` — actionable fail-closed root build.
- `scripts/refuse-root-vercel-build.test.mjs` — verifies the refusal.
- `scripts/check-demo-boundary.mjs` — scans site source and `site/out`.
- `scripts/check-demo-boundary.test.mjs` — proves prohibited content is rejected.
- `README.md` — documents `pnpm demo` and the synthetic/genuine split.

### Task 1: Workspace and one-command demo

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `site/package.json`
- Create: `site/next.config.ts`
- Create: `site/tsconfig.json`
- Create: `site/next-env.d.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write a failing command contract test**

Add `scripts/demo-command.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `node --test scripts/demo-command.test.mjs`

Expected: FAIL because `scripts.demo` is absent.

- [ ] **Step 3: Add the package boundary and commands**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - site
```

Create `site/package.json` with `dev: next dev`, `build: next build`,
`typecheck: tsc --noEmit`, and the same pinned Next/React versions as the root
package. Configure `site/next.config.ts` with `output: "export"`,
`poweredByHeader: false`, and `images.unoptimized: true`. Extend the root
TypeScript defaults from `site/tsconfig.json` while limiting `include` to the
site sources and generated Next types.

Add the three exact root commands asserted above and run
`pnpm install --lockfile-only` to record the workspace.

- [ ] **Step 4: Verify GREEN**

Run: `node --test scripts/demo-command.test.mjs && pnpm --dir site typecheck`

Expected: command test PASS; typecheck may report only missing app sources,
which are introduced in Task 3.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml site/package.json site/next.config.ts site/tsconfig.json site/next-env.d.ts scripts/demo-command.test.mjs
git commit -s -m "build: add static demo workspace"
```

### Task 2: Synthetic fixture and filtering

**Files:**
- Create: `site/src/lib/demo-memories.ts`
- Create: `site/src/lib/demo-memories.test.ts`

- [ ] **Step 1: Write failing fixture tests**

The test imports `DEMO_MEMORIES`, `filterDemoMemories`, and
`DEMO_OVERVIEW`; asserts that every record has `synthetic: true`, that all
identifiers use a `demo-` prefix, that the overview counts match the records,
and that filtering is case-insensitive across title, familiar, source, and
excerpt.

```ts
expect(filterDemoMemories(DEMO_MEMORIES, "ARCHITECTURE")).toHaveLength(1);
expect(DEMO_MEMORIES.every((memory) => memory.synthetic)).toBe(true);
expect(DEMO_OVERVIEW.entries).toBe(DEMO_MEMORIES.length);
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test site/src/lib/demo-memories.test.ts`

Expected: FAIL because the fixture module does not exist.

- [ ] **Step 3: Implement the typed fixture**

Define `DemoMemory` with identifier, familiar, title, source, relative update,
excerpt, Markdown-like body paragraphs, verification state, privacy label,
and `synthetic: true`. Add four fictional entries that exercise verified,
needs-review, unknown, and protected/reveal-required states. Export a pure
`filterDemoMemories` function and derived overview counts.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test site/src/lib/demo-memories.test.ts`

Expected: 1 test file PASS with no warnings.

- [ ] **Step 5: Commit**

```bash
git add site/src/lib/demo-memories.ts site/src/lib/demo-memories.test.ts
git commit -s -m "feat: add synthetic demo memory fixture"
```

### Task 3: Launcher and interactive demo

**Files:**
- Create: `site/src/components/copy-command.tsx`
- Create: `site/src/components/copy-command.test.tsx`
- Create: `site/src/components/demo-dashboard.tsx`
- Create: `site/src/components/demo-dashboard.test.tsx`
- Create: `site/src/app/layout.tsx`
- Create: `site/src/app/page.tsx`
- Create: `site/src/app/page.test.tsx`

- [ ] **Step 1: Write failing component tests**

Cover these public behaviors:

```tsx
expect(screen.getByRole("link", { name: "Open demo" })).toHaveAttribute(
  "href",
  "#demo"
);
expect(screen.getByText("Synthetic demo data")).toBeVisible();
fireEvent.change(screen.getByRole("searchbox"), {
  target: { value: "architecture" }
});
expect(screen.getAllByRole("button", { name: /architecture/i })).toHaveLength(1);
fireEvent.click(screen.getByRole("button", { name: /protected example/i }));
expect(screen.getByText("Content hidden in the demo")).toBeVisible();
fireEvent.click(screen.getByRole("button", { name: "Reveal synthetic content" }));
expect(screen.getByText(/fictional protected memory/i)).toBeVisible();
```

For clipboard coverage, stub `navigator.clipboard.writeText`, assert the exact
`coven memory open` command, then reject it and assert the manual-copy status.

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm test site/src/components/copy-command.test.tsx site/src/components/demo-dashboard.test.tsx site/src/app/page.test.tsx
```

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement launcher and interactions**

`page.tsx` renders a semantic launcher with:

```tsx
<a className="primary-action" href="#demo">Open demo</a>
<CopyCommand command="coven memory open" />
<section id="demo" aria-labelledby="demo-title">
  <DemoDashboard />
</section>
```

`DemoDashboard` keeps query, selected ID, narrow pane, and per-entry reveal
state in React state. It initializes from the static fixture, resets reveal
when selection changes, uses real buttons for memory rows, exposes a Back to
index action on narrow layouts, and includes the persistent
`Synthetic demo data` label.

`CopyCommand` always renders the selectable command text. It reports copied
only after `navigator.clipboard.writeText` resolves and reports a manual-copy
fallback on absence or rejection.

- [ ] **Step 4: Verify GREEN**

Run the focused test command from Step 2.

Expected: all three test files PASS with no React accessibility warnings.

- [ ] **Step 5: Commit**

```bash
git add site/src/app site/src/components
git commit -s -m "feat: add static Coven Memory demo"
```

### Task 4: Responsive visual system

**Files:**
- Create: `site/src/app/globals.css`
- Modify: `site/src/app/layout.tsx`
- Test: `site/src/components/demo-dashboard.test.tsx`

- [ ] **Step 1: Add failing structural assertions**

Assert the demo exposes `Library`, `Memory index`, and `Memory reader`
landmarks, that the selected row has `aria-current="true"`, and that the
synthetic label is inside the demo header.

- [ ] **Step 2: Verify RED**

Run: `pnpm test site/src/components/demo-dashboard.test.tsx`

Expected: FAIL on the missing landmark names or selected state.

- [ ] **Step 3: Implement the responsive styling**

Use a restrained near-black Coven palette, graphite borders, lavender accent,
serif reader title, and compact sans-serif controls. Desktop uses a
library/index/reader grid. Below 56rem, hide the library and switch between
index and reader. Respect `prefers-reduced-motion`, retain visible focus
outlines, and avoid remote fonts or images.

- [ ] **Step 4: Verify GREEN and inspect static rendering**

Run:

```bash
pnpm test site/src/components/demo-dashboard.test.tsx
pnpm --dir site build
```

Expected: focused tests PASS and `site/out/index.html` exists.

- [ ] **Step 5: Commit**

```bash
git add site/src/app/globals.css site/src/app/layout.tsx site/src/components/demo-dashboard.test.tsx
git commit -s -m "style: polish the static memory demo"
```

### Task 5: Fail-closed deployment and boundary scanner

**Files:**
- Create: `vercel.json`
- Create: `site/vercel.json`
- Create: `scripts/refuse-root-vercel-build.mjs`
- Create: `scripts/refuse-root-vercel-build.test.mjs`
- Create: `scripts/check-demo-boundary.mjs`
- Create: `scripts/check-demo-boundary.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing Node tests**

The boundary test creates temporary good and bad trees and calls an exported
`scanDemoTree`:

```js
await assert.doesNotReject(() => scanDemoTree(goodDirectory));
await assert.rejects(
  () => scanDemoTree(badDirectory),
  /forbidden demo boundary pattern/
);
```

The bad tree contains one prohibited server endpoint, one private-network URL,
one persistence API, and one telemetry call. The root-refusal test executes
the script and asserts a non-zero exit plus an instruction to set the Vercel
Root Directory to `site`.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test scripts/check-demo-boundary.test.mjs scripts/refuse-root-vercel-build.test.mjs
```

Expected: FAIL because the scripts do not exist.

- [ ] **Step 3: Implement scanners and Vercel configuration**

`scanDemoTree` recursively inspects regular files, rejects symlinks, and checks
site source more strictly than build output. Both scans reject memory API
paths, loopback/private-network targets, MagicDNS targets, analytics vendors,
and genuine-data patterns. Source additionally rejects `fetch`,
`XMLHttpRequest`, WebSocket/EventSource, beacon, browser storage, IndexedDB,
server actions, and dynamic route handlers.

`site/vercel.json` defines restrictive CSP, no-store, frame denial, MIME
sniffing protection, strict referrer policy, and disabled browser features.
Root `vercel.json` runs only the refusal script.

- [ ] **Step 4: Verify GREEN and scan a real export**

Run:

```bash
node --test scripts/check-demo-boundary.test.mjs scripts/refuse-root-vercel-build.test.mjs
pnpm demo:check
```

Expected: Node tests PASS, static export succeeds, and source/output scans are
clean.

- [ ] **Step 5: Commit**

```bash
git add package.json site/vercel.json vercel.json scripts/check-demo-boundary.mjs scripts/check-demo-boundary.test.mjs scripts/refuse-root-vercel-build.mjs scripts/refuse-root-vercel-build.test.mjs
git commit -s -m "test: enforce the static demo boundary"
```

### Task 6: Documentation and delivery verification

**Files:**
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml` or the existing primary CI workflow
- Modify: `docs/superpowers/specs/2026-07-29-static-demo-mode-design.md`

- [ ] **Step 1: Add demo verification to CI**

Add `pnpm demo:check` and the Node contract/boundary tests to the existing CI
job after the root test suite. Do not add deployment credentials or an
automatic production deployment.

- [ ] **Step 2: Document both paths**

Add a Demo section:

```markdown
pnpm demo
```

State that it uses repository-owned synthetic records and never contacts the
daemon. Keep `coven memory open` as the genuine local path.

- [ ] **Step 3: Run focused and full gates**

```bash
node --test scripts/demo-command.test.mjs scripts/check-demo-boundary.test.mjs scripts/refuse-root-vercel-build.test.mjs
pnpm demo:check
pnpm check
pnpm test:package
pnpm audit:prod
git diff --check
```

Expected: every command exits 0; the demo scan reports a clean static export;
the privacy guard reports no findings.

- [ ] **Step 4: Commit verified documentation and workflow**

```bash
git add README.md .github/workflows docs/superpowers/specs/2026-07-29-static-demo-mode-design.md docs/superpowers/plans/2026-07-29-static-demo-mode.md
git commit -s -m "docs: document synthetic demo mode"
```

- [ ] **Step 5: Deliver**

Push `feat/demo-mode`, open a PR with exact verification evidence, wait for
required checks, inspect unresolved review threads, and squash-merge with an
explicit subject/body. Verify `origin/main` contains the merge commit before
closing `cmem-8qg.4.2`.
