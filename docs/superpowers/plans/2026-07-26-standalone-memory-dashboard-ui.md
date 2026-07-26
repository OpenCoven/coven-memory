# Standalone Memory Dashboard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the secure, local-first, browse-first memory dashboard in `OpenCoven/coven-memory`.

**Architecture:** A custom loopback-only Node launcher boots the Next.js app, owns the one-time launch token and in-memory sessions, and injects a server-only `MemoryGateway`. Route handlers enforce session, Host, and Origin before proxying the Coven daemon. React components consume normalized DTOs and never receive local paths.

**Tech Stack:** Node.js 24, pnpm 10, Next.js 16, React 19, TypeScript 6, Zod 4, Vitest 4, Testing Library, `@opencoven/coven-design-system` pinned to commit `6032f9f407982379e39ed1a40eec7a2e8b24e5c6`.

---

## Worktree and dependency setup

Use the prepared worktree:

```bash
cd path/to/coven-memory/.worktrees/memory-dashboard
git status --short
```

Expected: clean status on `feature/memory-dashboard`.

### Task 1: Scaffold the tested Next.js application

**Files:**
- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `next-env.d.ts`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `src/app/page.test.tsx`
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `docs/CATCHUP-PLAN-2026-07-24.md:87-101`

- [ ] **Step 1: Create the package manifest**

Create:

```json
{
  "name": "@opencoven/coven-memory-dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=24.0.0"
  },
  "packageManager": "pnpm@10.34.0",
  "scripts": {
    "dev": "tsx server.ts",
    "build": "next build",
    "start": "NODE_ENV=production tsx server.ts",
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@opencoven/coven-design-system": "git+https://github.com/OpenCoven/coven-design-system.git#6032f9f407982379e39ed1a40eec7a2e8b24e5c6",
    "next": "16.2.11",
    "react": "19.2.7",
    "react-dom": "19.2.7",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.2",
    "@types/node": "24.13.2",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "eslint": "9.39.4",
    "eslint-config-next": "16.2.11",
    "jsdom": "^27.4.0",
    "tsx": "^4.20.6",
    "typescript": "6.0.3",
    "vitest": "4.1.9"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` is created and installation exits 0.

- [ ] **Step 3: Write the first failing page test**

Create `src/app/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders the memory dashboard shell", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { name: "Memory" })).toBeInTheDocument();
    expect(screen.getByText("Secure local memory dashboard")).toBeInTheDocument();
  });
});
```

Create `vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    restoreMocks: true
  }
});
```

- [ ] **Step 4: Run the test and verify it fails**

Run:

```bash
pnpm test -- src/app/page.test.tsx
```

Expected: FAIL because `src/app/page.tsx` does not exist.

- [ ] **Step 5: Create the minimal app shell**

Create `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false
};

export default nextConfig;
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `next-env.d.ts`:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

Create `src/app/layout.tsx`:

```tsx
import "@opencoven/coven-design-system";
import "@opencoven/coven-design-system/candidate/application.css";
import "@opencoven/coven-design-system/candidate/feedback.css";
import "./globals.css";

export const metadata = {
  title: "Coven Memory",
  description: "Secure local memory dashboard"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="coven" data-mode="dark">
      <body>{children}</body>
    </html>
  );
}
```

Create `src/app/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main className="cv-app-surface memory-bootstrap">
      <p className="cv-eyebrow">Secure local memory dashboard</p>
      <h1>Memory</h1>
    </main>
  );
}
```

Create `src/app/globals.css`:

```css
html,
body {
  min-height: 100%;
}

body {
  margin: 0;
  background: var(--cv-bg-page);
  color: var(--cv-text-primary);
}

button,
input,
select {
  font: inherit;
}

.memory-bootstrap {
  display: grid;
  min-height: 100vh;
  place-content: center;
  gap: var(--cv-space-2);
  padding: var(--cv-space-6);
}
```

- [ ] **Step 6: Run the test and typecheck**

Run:

```bash
pnpm test -- src/app/page.test.tsx
pnpm typecheck
```

Expected: one passing test and typecheck exit 0.

- [ ] **Step 7: Update repository-role documentation**

Append to `docs/CATCHUP-PLAN-2026-07-24.md` section 9:

```markdown
**Superseding UI decision (2026-07-26):** Option B still governs the substrate:
the Rust crate remains authoritative in the `coven` monorepo. This repository
now also owns the standalone user-facing memory dashboard, which consumes daemon
APIs and does not duplicate storage/index logic.
```

Update `README.md` with:

```markdown
# coven-memory

Local-first user dashboard, specifications, and project tracking for OpenCoven
memory. The authoritative Rust substrate remains in `OpenCoven/coven`.

## Development

```bash
pnpm install
pnpm dev
```
```

Add these generated paths to `.gitignore`:

```gitignore
node_modules/
.next/
coverage/
*.tsbuildinfo
.env.local
```

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml next.config.ts tsconfig.json next-env.d.ts \
  vitest.config.ts vitest.setup.ts src/app .gitignore README.md \
  docs/CATCHUP-PLAN-2026-07-24.md
git commit -m "feat(ui): scaffold standalone memory dashboard"
```

### Task 2: Implement one-time launch tokens and local sessions

**Files:**
- Create: `server.ts`
- Create: `src/server/listen-options.ts`
- Create: `src/server/listen-options.test.ts`
- Create: `src/server/runtime.ts`
- Create: `src/server/session-store.ts`
- Create: `src/server/session-store.test.ts`
- Create: `src/server/request-guard.ts`
- Create: `src/server/request-guard.test.ts`
- Create: `src/app/api/session/exchange/route.ts`
- Create: `src/app/api/session/status/route.ts`
- Create: `src/app/api/session/logout/route.ts`
- Create: `src/app/api/session/session-routes.test.ts`
- Create: `src/components/launch-gate.tsx`
- Create: `src/components/launch-gate.test.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write failing session-store tests**

Create `src/server/session-store.test.ts`:

```ts
import { createSessionStore } from "./session-store";

describe("session store", () => {
  it("exchanges a launch token once and rejects replay", () => {
    const store = createSessionStore({ now: () => 1_000, random: () => "random-value" });
    const launch = store.issueLaunchToken();
    const session = store.exchangeLaunchToken(launch);

    expect(session).toEqual("random-value");
    expect(store.exchangeLaunchToken(launch)).toBeNull();
    expect(store.hasSession(session!)).toBe(true);
  });

  it("expires launch tokens and sessions", () => {
    let now = 1_000;
    const store = createSessionStore({
      now: () => now,
      random: () => `token-${now}`,
      launchTtlMs: 100,
      sessionTtlMs: 200
    });
    const launch = store.issueLaunchToken();
    now = 1_101;
    expect(store.exchangeLaunchToken(launch)).toBeNull();

    const nextLaunch = store.issueLaunchToken();
    const session = store.exchangeLaunchToken(nextLaunch)!;
    now = 1_302;
    expect(store.hasSession(session)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
pnpm test -- src/server/session-store.test.ts
```

Expected: FAIL because `session-store.ts` does not exist.

- [ ] **Step 3: Implement the in-memory store**

Create `src/server/session-store.ts`:

```ts
import { randomBytes } from "node:crypto";

type Options = {
  now?: () => number;
  random?: () => string;
  launchTtlMs?: number;
  sessionTtlMs?: number;
};

export function createSessionStore(options: Options = {}) {
  const now = options.now ?? Date.now;
  const random = options.random ?? (() => randomBytes(32).toString("base64url"));
  const launchTtlMs = options.launchTtlMs ?? 60_000;
  const sessionTtlMs = options.sessionTtlMs ?? 30 * 60_000;
  const launchTokens = new Map<string, number>();
  const sessions = new Map<string, number>();

  return {
    issueLaunchToken() {
      const token = random();
      launchTokens.set(token, now() + launchTtlMs);
      return token;
    },
    exchangeLaunchToken(token: string) {
      const expiresAt = launchTokens.get(token);
      launchTokens.delete(token);
      if (!expiresAt || expiresAt <= now()) return null;
      const session = random();
      sessions.set(session, now() + sessionTtlMs);
      return session;
    },
    hasSession(session: string) {
      const expiresAt = sessions.get(session);
      if (!expiresAt || expiresAt <= now()) {
        sessions.delete(session);
        return false;
      }
      return true;
    },
    revokeSession(session: string) {
      sessions.delete(session);
    }
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
```

- [ ] **Step 4: Write failing loopback and session guard tests**

Create `src/server/request-guard.test.ts`:

```ts
import { guardLocalRequest, guardLoopbackRequest } from "./request-guard";

describe("guardLocalRequest", () => {
  const hasSession = (value: string) => value === "valid";

  it("accepts same-origin requests with a valid cookie", () => {
    const request = new Request("http://127.0.0.1:3737/api/memory", {
      headers: {
        host: "127.0.0.1:3737",
        origin: "http://127.0.0.1:3737",
        cookie: "coven_memory_session=valid"
      }
    });
    expect(guardLocalRequest(request, hasSession)).toEqual({ ok: true, session: "valid" });
  });

  it("rejects foreign origins", () => {
    const foreign = new Request("http://127.0.0.1:3737/api/memory", {
      headers: {
        host: "127.0.0.1:3737",
        origin: "https://example.invalid",
        cookie: "coven_memory_session=valid"
      }
    });
    expect(guardLocalRequest(foreign, hasSession)).toEqual({
      ok: false,
      status: 403,
      code: "foreign_origin"
    });
  });

  it("rejects a non-loopback Host even when Origin matches it", () => {
    const request = new Request("http://example.invalid/api/memory", {
      headers: {
        host: "example.invalid",
        origin: "http://example.invalid",
        cookie: "coven_memory_session=valid"
      }
    });
    expect(guardLoopbackRequest(request)).toEqual({
      ok: false,
      status: 403,
      code: "invalid_host"
    });
  });

  it("rejects missing sessions after origin validation", () => {
    const request = new Request("http://127.0.0.1:3737/api/memory", {
      headers: {
        host: "127.0.0.1:3737",
        origin: "http://127.0.0.1:3737"
      }
    });
    expect(guardLocalRequest(request, hasSession)).toEqual({
      ok: false,
      status: 401,
      code: "session_required"
    });
  });
});
```

- [ ] **Step 5: Run the guard tests and verify failure**

Run:

```bash
pnpm test -- src/server/request-guard.test.ts
```

Expected: FAIL because `request-guard.ts` does not exist.

- [ ] **Step 6: Implement loopback, Origin, Host, and cookie guards**

Create `src/server/request-guard.ts`:

```ts
export const SESSION_COOKIE = "coven_memory_session";

type GuardFailure = {
  ok: false;
  status: 401 | 403;
  code: "invalid_host" | "foreign_origin" | "session_required";
};

function cookieValue(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function hostnameFromHost(host: string): string | null {
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
}

function isLoopback(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export function guardLoopbackRequest(
  request: Request
): { ok: true } | GuardFailure {
  const url = new URL(request.url);
  const host = request.headers.get("host");
  const hostName = host ? hostnameFromHost(host) : null;
  if (!host || !hostName || !isLoopback(hostName) || url.host !== host) {
    return { ok: false, status: 403, code: "invalid_host" };
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) {
    return { ok: false, status: 403, code: "foreign_origin" };
  }
  return { ok: true };
}

export function guardLocalRequest(
  request: Request,
  hasSession: (session: string) => boolean
): { ok: true; session: string } | GuardFailure {
  const local = guardLoopbackRequest(request);
  if (!local.ok) return local;
  const session = cookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (!session || !hasSession(session)) {
    return { ok: false, status: 401, code: "session_required" };
  }
  return { ok: true, session };
}
```

- [ ] **Step 7: Run the guard tests**

Run:

```bash
pnpm test -- src/server/request-guard.test.ts
```

Expected: all four tests pass.

- [ ] **Step 8: Add the runtime singleton**

Create `src/server/runtime.ts`:

```ts
import { createSessionStore, type SessionStore } from "./session-store";

type Runtime = { sessions: SessionStore };
const globalRuntime = globalThis as typeof globalThis & { __covenMemoryRuntime?: Runtime };

export function runtime(): Runtime {
  globalRuntime.__covenMemoryRuntime ??= { sessions: createSessionStore() };
  return globalRuntime.__covenMemoryRuntime;
}
```

- [ ] **Step 9: Write failing session-route tests**

Create `src/app/api/session/session-routes.test.ts`:

```ts
import { POST as exchange } from "./exchange/route";
import { POST as logout } from "./logout/route";
import { GET as status } from "./status/route";
import { runtime } from "@/server/runtime";

vi.mock("@/server/runtime", () => ({ runtime: vi.fn() }));

const mockedRuntime = vi.mocked(runtime);

function localRequest(
  path: string,
  init: RequestInit = {}
): Request {
  return new Request(`http://127.0.0.1:3737${path}`, {
    ...init,
    headers: {
      host: "127.0.0.1:3737",
      origin: "http://127.0.0.1:3737",
      ...(init.headers ?? {})
    }
  });
}

describe("session routes", () => {
  it("exchanges a valid launch token for a strict HttpOnly cookie", async () => {
    mockedRuntime.mockReturnValue({
      sessions: {
        exchangeLaunchToken: vi.fn().mockReturnValue("session-value")
      }
    } as never);
    const request = localRequest("/api/session/exchange", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "20" },
      body: JSON.stringify({ token: "launch" })
    });
    const response = await exchange(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(response.headers.get("set-cookie")).toMatch(/SameSite=Strict/i);
  });

  it("rejects token replay or invalid tokens without a cookie", async () => {
    mockedRuntime.mockReturnValue({
      sessions: { exchangeLaunchToken: vi.fn().mockReturnValue(null) }
    } as never);
    const response = await exchange(localRequest("/api/session/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "replayed" })
    }));
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("reports authenticated status and revokes logout sessions", async () => {
    const revokeSession = vi.fn();
    mockedRuntime.mockReturnValue({
      sessions: {
        hasSession: (value: string) => value === "valid",
        revokeSession
      }
    } as never);
    const headers = { cookie: "coven_memory_session=valid" };
    expect((await status(localRequest("/api/session/status", { headers }))).status).toBe(200);
    const logoutResponse = await logout(localRequest("/api/session/logout", {
      method: "POST",
      headers
    }));
    expect(logoutResponse.status).toBe(200);
    expect(revokeSession).toHaveBeenCalledWith("valid");
  });
});
```

- [ ] **Step 10: Run the route tests and verify failure**

Run:

```bash
pnpm test -- src/app/api/session/session-routes.test.ts
```

Expected: FAIL because the session routes do not exist.

- [ ] **Step 11: Implement the exchange, status, and logout routes**

Create `src/app/api/session/exchange/route.ts`:

```ts
import { NextResponse } from "next/server";
import { runtime } from "@/server/runtime";
import { guardLoopbackRequest, SESSION_COOKIE } from "@/server/request-guard";

export async function POST(request: Request) {
  const local = guardLoopbackRequest(request);
  if (!local.ok) {
    return NextResponse.json({ ok: false, code: local.code }, { status: local.status });
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > 1_024) {
    return NextResponse.json({ ok: false, code: "invalid_request" }, { status: 400 });
  }
  let body: { token?: unknown };
  try {
    body = (await request.json()) as { token?: unknown };
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_json" }, { status: 400 });
  }
  if (typeof body.token !== "string" || body.token.length > 256) {
    return NextResponse.json({ ok: false, code: "invalid_token" }, { status: 400 });
  }
  const session = runtime().sessions.exchangeLaunchToken(body.token);
  if (!session) {
    return NextResponse.json({ ok: false, code: "invalid_token" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, session, {
    httpOnly: true,
    sameSite: "strict",
    secure: request.url.startsWith("https://"),
    path: "/",
    maxAge: 30 * 60
  });
  return response;
}
```

Create `src/app/api/session/status/route.ts`:

```ts
import { NextResponse } from "next/server";
import { runtime } from "@/server/runtime";
import { guardLocalRequest } from "@/server/request-guard";

export function GET(request: Request) {
  const guard = guardLocalRequest(request, runtime().sessions.hasSession);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, code: guard.code }, { status: guard.status });
  }
  return NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "private, no-store, max-age=0" } }
  );
}
```

Create `src/app/api/session/logout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { runtime } from "@/server/runtime";
import { guardLocalRequest, SESSION_COOKIE } from "@/server/request-guard";

export async function POST(request: Request) {
  const guard = guardLocalRequest(request, runtime().sessions.hasSession);
  if (!guard.ok) return NextResponse.json({ ok: false, code: guard.code }, { status: guard.status });
  runtime().sessions.revokeSession(guard.session);
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
```

- [ ] **Step 12: Run the route tests**

Run:

```bash
pnpm test -- src/app/api/session/session-routes.test.ts
```

Expected: all session route tests pass.

- [ ] **Step 13: Write failing launch-gate tests**

Create `src/components/launch-gate.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { LaunchGate } from "./launch-gate";

describe("LaunchGate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("exchanges a fragment token, removes it, and renders private UI", async () => {
    window.history.replaceState(null, "", "/#launch=one-time");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<LaunchGate><div>Private memory UI</div></LaunchGate>);

    await screen.findByText("Private memory UI");
    expect(fetchMock).toHaveBeenCalledWith("/api/session/exchange", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ token: "one-time" })
    }));
    expect(window.location.hash).toBe("");
  });

  it("checks the existing session when there is no launch fragment", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<LaunchGate><div>Private memory UI</div></LaunchGate>);

    await screen.findByText("Private memory UI");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session/status",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("shows the locked state when session establishment fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<LaunchGate><div>Private memory UI</div></LaunchGate>);
    await waitFor(() => {
      expect(screen.getByText(/Launch link expired/)).toBeInTheDocument();
    });
    expect(screen.queryByText("Private memory UI")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 14: Run the launch-gate tests and verify failure**

Run:

```bash
pnpm test -- src/components/launch-gate.test.tsx
```

Expected: FAIL because `launch-gate.tsx` does not exist.

- [ ] **Step 15: Implement the fragment exchange gate**

Create `src/components/launch-gate.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

export function LaunchGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "ready" | "locked">("checking");

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const token = hash.get("launch");
    const establish = async () => {
      if (token) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        const response = await fetch("/api/session/exchange", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token })
        });
        setState(response.ok ? "ready" : "locked");
        return;
      }
      const response = await fetch("/api/session/status", { cache: "no-store" });
      setState(response.ok ? "ready" : "locked");
    };
    void establish().catch(() => setState("locked"));
  }, []);

  if (state === "checking") return <p>Opening secure memory session...</p>;
  if (state === "locked") return <p>Launch link expired. Restart the dashboard for a new link.</p>;
  return children;
}
```

Wrap the page contents in `<LaunchGate>`.

- [ ] **Step 16: Run the launch-gate tests**

Run:

```bash
pnpm test -- src/components/launch-gate.test.tsx
```

Expected: all three launch-gate tests pass.

- [ ] **Step 17: Write failing listen-option tests**

Create `src/server/listen-options.test.ts`:

```ts
import { resolveListenOptions } from "./listen-options";

describe("resolveListenOptions", () => {
  it("defaults to IPv4 loopback", () => {
    expect(resolveListenOptions({})).toEqual({
      hostname: "127.0.0.1",
      originHost: "127.0.0.1",
      port: 3737
    });
  });

  it("formats IPv6 loopback for URLs", () => {
    expect(resolveListenOptions({ HOST: "::1", PORT: "4000" }).originHost).toBe("[::1]");
  });

  it("rejects wildcard, named, and invalid ports", () => {
    expect(() => resolveListenOptions({ HOST: "0.0.0.0" })).toThrow(/loopback/);
    expect(() => resolveListenOptions({ HOST: "localhost" })).toThrow(/loopback/);
    expect(() => resolveListenOptions({ PORT: "70000" })).toThrow(/port/);
  });
});
```

- [ ] **Step 18: Implement listen validation**

Create `src/server/listen-options.ts`:

```ts
export function resolveListenOptions(env: NodeJS.ProcessEnv) {
  const hostname = env.HOST ?? "127.0.0.1";
  if (hostname !== "127.0.0.1" && hostname !== "::1") {
    throw new Error("coven-memory accepts only explicit loopback HOST values");
  }
  const port = Number(env.PORT ?? 3737);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("coven-memory port must be an integer from 1 to 65535");
  }
  return {
    hostname,
    originHost: hostname === "::1" ? "[::1]" : hostname,
    port
  };
}
```

- [ ] **Step 19: Create the loopback-only custom server**

Create `server.ts`:

```ts
import { createServer } from "node:http";
import next from "next";
import { runtime } from "./src/server/runtime.ts";
import { resolveListenOptions } from "./src/server/listen-options.ts";

const { hostname, originHost, port } = resolveListenOptions(process.env);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();
const launchToken = runtime().sessions.issueLaunchToken();
createServer((request, response) => handle(request, response)).listen(port, hostname, () => {
  console.log(`Coven Memory: http://${originHost}:${port}/#launch=${launchToken}`);
});
```

- [ ] **Step 20: Run all session and launcher tests**

Run:

```bash
pnpm test -- src/server/session-store.test.ts src/server/request-guard.test.ts \
  src/server/listen-options.test.ts src/app/api/session/session-routes.test.ts \
  src/components/launch-gate.test.tsx
pnpm typecheck
```

Expected: all session, request guard, and launch-gate tests pass.

- [ ] **Step 21: Commit**

```bash
git add server.ts src/server src/app/api/session src/components/launch-gate*
git commit -m "feat(security): add local launch sessions"
```

### Task 3: Implement and validate the server-only daemon gateway

**Files:**
- Create: `src/server/memory-contract.ts`
- Create: `src/server/memory-contract.test.ts`
- Create: `src/server/daemon-transport.ts`
- Create: `src/server/daemon-transport.test.ts`
- Create: `src/server/memory-gateway.ts`
- Create: `src/server/memory-gateway.test.ts`
- Modify: `src/server/runtime.ts`

- [ ] **Step 1: Write failing schema tests**

Create `src/server/memory-contract.test.ts`:

```ts
import { memoryDetailSchema, memoryListSchema, memoryOverviewSchema } from "./memory-contract";

describe("memory daemon schemas", () => {
  it("accepts the Phase 1 list, overview, and detail fixtures", () => {
    expect(memoryListSchema.parse([{
      id: "d251bc66-3e45-5d03-8d78-1e76919642f9",
      familiar_id: "sage",
      title: "notes",
      path: "sage/notes.md",
      updated_at: "4m ago",
      updated_at_iso: "2026-07-26T09:56:00Z",
      excerpt: "Durable fact."
    }])).toHaveLength(1);
    expect(memoryOverviewSchema.parse({
      generated_at: "2026-07-26T10:00:00Z",
      totals: { entries: 1, familiars: 1, verified: 0, needs_review: 0, unknown: 1 },
      last_updated_at: "2026-07-26T09:56:00Z",
      capabilities: {
        detail: true,
        verification: false,
        attestation_metadata: false,
        supersession_history: false,
        mutations: false
      },
      verification: {
        state: "unavailable",
        checked_at: "2026-07-26T10:00:00Z",
        manifest: null,
        index: null,
        issues: []
      }
    }).verification.state).toBe("unavailable");
    expect(memoryDetailSchema.parse({
      id: "d251bc66-3e45-5d03-8d78-1e76919642f9",
      familiar_id: "sage",
      title: "notes",
      updated_at: "2026-07-26T09:56:00Z",
      source: { kind: "coven-origin", label: "Coven origin" },
      content: "Durable fact.",
      content_format: "markdown",
      privacy: {
        classification: null,
        reveal_required: null,
        reason: "privacy taxonomy unavailable"
      },
      verification: { state: "unknown", reason: "verification metadata unavailable" },
      attestation: null,
      supersession: { supersedes: null, superseded_by: null }
    }).content).toBe("Durable fact.");
  });

  it("rejects daemon detail payloads containing paths", () => {
    expect(() => memoryDetailSchema.parse({
      id: "id",
      familiar_id: "sage",
      title: "notes",
      updated_at: "2026-07-26T09:56:00Z",
      path: "/private/path",
      source: { kind: "coven-origin", label: "Coven origin" },
      content: "secret",
      content_format: "markdown",
      privacy: { classification: null, reveal_required: null, reason: "unknown" },
      verification: { state: "unknown", reason: "unknown" },
      attestation: null,
      supersession: { supersedes: null, superseded_by: null }
    })).toThrow();
  });
});
```

- [ ] **Step 2: Implement strict Zod schemas and browser DTOs**

Create `src/server/memory-contract.ts`:

```ts
import { z } from "zod";

export const memoryListSchema = z.array(z.object({
  id: z.string().uuid(),
  familiar_id: z.string().min(1),
  title: z.string(),
  path: z.string(),
  updated_at: z.string(),
  updated_at_iso: z.iso.datetime(),
  excerpt: z.string()
}).strict());

export const memoryOverviewSchema = z.object({
  generated_at: z.iso.datetime(),
  totals: z.object({
    entries: z.number().int().nonnegative(),
    familiars: z.number().int().nonnegative(),
    verified: z.number().int().nonnegative(),
    needs_review: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative()
  }).strict(),
  last_updated_at: z.iso.datetime().nullable(),
  capabilities: z.object({
    detail: z.boolean(),
    verification: z.boolean(),
    attestation_metadata: z.boolean(),
    supersession_history: z.boolean(),
    mutations: z.boolean()
  }).strict(),
  verification: z.object({
    state: z.enum(["verified", "degraded", "unavailable", "unknown"]),
    checked_at: z.iso.datetime(),
    manifest: z.string().nullable(),
    index: z.string().nullable(),
    issues: z.array(z.string())
  }).strict()
}).strict();

export const memoryDetailSchema = z.object({
  id: z.string().uuid(),
  familiar_id: z.string().min(1),
  title: z.string(),
  updated_at: z.iso.datetime(),
  source: z.object({ kind: z.string(), label: z.string() }).strict(),
  content: z.string(),
  content_format: z.literal("markdown"),
  privacy: z.object({
    classification: z.string().nullable(),
    reveal_required: z.boolean().nullable(),
    reason: z.string()
  }).strict(),
  verification: z.object({
    state: z.enum(["verified", "degraded", "unknown", "unavailable"]),
    reason: z.string()
  }).strict(),
  attestation: z.record(
    z.string().min(1).max(128),
    z.union([
      z.string().max(2_048),
      z.number().finite(),
      z.boolean(),
      z.null()
    ])
  ).refine((value) => Object.keys(value).length <= 64).nullable(),
  supersession: z.object({
    supersedes: z.string().nullable(),
    superseded_by: z.string().nullable()
  }).strict()
}).strict();

export type MemoryListWire = z.infer<typeof memoryListSchema>;
export type MemoryOverviewWire = z.infer<typeof memoryOverviewSchema>;
export type MemoryDetailWire = z.infer<typeof memoryDetailSchema>;
```

- [ ] **Step 3: Write transport fallback tests**

Create `src/server/daemon-transport.test.ts`:

```ts
import { createDaemonTransport } from "./daemon-transport";

describe("daemon transport", () => {
  it("uses the Unix socket first and loopback HTTP only when configured", async () => {
    const calls: string[] = [];
    const transport = createDaemonTransport({
      socketPath: "/tmp/coven.sock",
      loopbackUrl: "http://127.0.0.1:3738",
      socketRequest: async () => {
        calls.push("socket");
        throw new Error("socket unavailable");
      },
      httpRequest: async () => {
        calls.push("http");
        return { status: 200, body: "[]" };
      }
    });

    await expect(transport.get("/api/v1/memory")).resolves.toEqual({ status: 200, body: "[]" });
    expect(calls).toEqual(["socket", "http"]);
  });
});
```

- [ ] **Step 4: Implement the transport**

Create `src/server/daemon-transport.ts` with:

```ts
import { request as httpRequestNode } from "node:http";
import { request as socketRequestNode } from "node:http";

type Response = { status: number; body: string };
type Options = {
  socketPath: string;
  loopbackUrl?: string;
  socketRequest?: (path: string) => Promise<Response>;
  httpRequest?: (path: string) => Promise<Response>;
};

function collect(request: ReturnType<typeof httpRequestNode>): Promise<Response> {
  return new Promise((resolve, reject) => {
    request.on("response", (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolve({
        status: response.statusCode ?? 500,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    request.on("error", reject);
    request.end();
  });
}

export function createDaemonTransport(options: Options) {
  const socketRequest = options.socketRequest ?? ((path: string) =>
    collect(socketRequestNode({ socketPath: options.socketPath, path, method: "GET" })));
  const httpRequest = options.httpRequest ?? ((path: string) => {
    if (!options.loopbackUrl) throw new Error("loopback daemon URL is not configured");
    const url = new URL(path, options.loopbackUrl);
    if (!["127.0.0.1", "::1", "localhost"].includes(url.hostname)) {
      throw new Error("daemon HTTP fallback must be loopback");
    }
    return collect(httpRequestNode(url, { method: "GET" }));
  });

  return {
    async get(path: string) {
      try {
        return await socketRequest(path);
      } catch (socketError) {
        if (!options.loopbackUrl) throw socketError;
        return httpRequest(path);
      }
    }
  };
}
```

- [ ] **Step 5: Implement the gateway and normalized DTOs**

Create `src/server/memory-gateway.ts`:

```ts
import {
  memoryDetailSchema,
  memoryListSchema,
  memoryOverviewSchema
} from "./memory-contract";

type Transport = { get(path: string): Promise<{ status: number; body: string }> };

export function createMemoryGateway(transport: Transport) {
  return {
    async overview() {
      const response = await transport.get("/api/v1/memory/overview");
      if (response.status !== 200) throw new Error(`daemon_overview_${response.status}`);
      return memoryOverviewSchema.parse(JSON.parse(response.body));
    },
    async list() {
      const response = await transport.get("/api/v1/memory");
      if (response.status !== 200) throw new Error(`daemon_list_${response.status}`);
      return memoryListSchema.parse(JSON.parse(response.body)).map((entry) => ({
        id: entry.id,
        familiarId: entry.familiar_id,
        title: entry.title,
        updatedAt: entry.updated_at_iso,
        relativeUpdatedAt: entry.updated_at,
        excerpt: entry.excerpt,
        source: "Coven origin"
      }));
    },
    async detail(id: string) {
      const response = await transport.get(`/api/v1/memory/${encodeURIComponent(id)}`);
      if (response.status === 404) return null;
      if (response.status !== 200) throw new Error(`daemon_detail_${response.status}`);
      const entry = memoryDetailSchema.parse(JSON.parse(response.body));
      return {
        id: entry.id,
        familiarId: entry.familiar_id,
        title: entry.title,
        updatedAt: entry.updated_at,
        source: entry.source,
        content: entry.content,
        privacy: entry.privacy,
        verification: entry.verification,
        attestationMetadata: entry.attestation
          ? { fieldCount: Object.keys(entry.attestation).length }
          : null,
        supersession: entry.supersession
      };
    }
  };
}
```

Update `src/server/runtime.ts` so runtime construction creates the transport
from `COVEN_HOME` (defaulting through `os.homedir()` to `.coven/coven.sock`) and
optional `COVEN_DAEMON_URL`, then creates `memory: createMemoryGateway(transport)`.
Do not export the resolved socket path.

- [ ] **Step 6: Run contract, transport, and gateway tests**

Run:

```bash
pnpm test -- src/server/memory-contract.test.ts \
  src/server/daemon-transport.test.ts src/server/memory-gateway.test.ts
pnpm typecheck
```

Expected: all gateway tests pass and typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/server
git commit -m "feat(data): add validated Coven memory gateway"
```

### Task 4: Add session-gated memory route handlers

**Files:**
- Create: `src/server/api-response.ts`
- Create: `src/server/api-response.test.ts`
- Create: `src/app/api/memory/route.ts`
- Create: `src/app/api/memory/overview/route.ts`
- Create: `src/app/api/memory/[id]/route.ts`
- Create: `src/app/api/memory/routes.test.ts`

- [ ] **Step 1: Write failing route tests**

Create `src/app/api/memory/routes.test.ts`:

```ts
import { GET as list } from "./route";
import { GET as overview } from "./overview/route";
import { GET as detail } from "./[id]/route";
import { runtime } from "@/server/runtime";

vi.mock("@/server/runtime", () => ({
  runtime: vi.fn()
}));

const mockedRuntime = vi.mocked(runtime);

function request(path: string, session = "valid") {
  return new Request(`http://127.0.0.1:3737${path}`, {
    headers: {
      host: "127.0.0.1:3737",
      origin: "http://127.0.0.1:3737",
      cookie: `coven_memory_session=${session}`
    }
  });
}

describe("memory routes", () => {
  it("rejects unauthenticated list requests", async () => {
    mockedRuntime.mockReturnValue({
      sessions: { hasSession: () => false },
      memory: { list: vi.fn(), overview: vi.fn(), detail: vi.fn() }
    } as never);
    expect((await list(request("/api/memory", "missing"))).status).toBe(401);
  });

  it("returns no-store list, overview, and detail responses", async () => {
    mockedRuntime.mockReturnValue({
      sessions: { hasSession: () => true },
      memory: {
        list: vi.fn().mockResolvedValue([]),
        overview: vi.fn().mockResolvedValue({ totals: { entries: 0 } }),
        detail: vi.fn().mockResolvedValue({ id: "entry" })
      }
    } as never);
    const listResponse = await list(request("/api/memory"));
    const overviewResponse = await overview(request("/api/memory/overview"));
    const detailResponse = await detail(request("/api/memory/entry"), {
      params: Promise.resolve({ id: "entry" })
    });
    expect(listResponse.headers.get("cache-control")).toContain("no-store");
    expect(overviewResponse.status).toBe(200);
    expect(detailResponse.status).toBe(200);
  });
});
```

- [ ] **Step 2: Implement a shared guarded response helper**

Create `src/server/api-response.ts`:

```ts
import { NextResponse } from "next/server";
import { guardLocalRequest } from "./request-guard";
import { runtime } from "./runtime";

export async function guardedJson<T>(request: Request, load: () => Promise<T>) {
  const guard = guardLocalRequest(request, runtime().sessions.hasSession);
  if (!guard.ok) {
    return NextResponse.json({ ok: false, code: guard.code }, { status: guard.status });
  }
  try {
    const data = await load();
    return NextResponse.json(
      { ok: true, data },
      { headers: { "cache-control": "private, no-store, max-age=0" } }
    );
  } catch {
    return NextResponse.json(
      { ok: false, code: "memory_unavailable" },
      { status: 503, headers: { "cache-control": "private, no-store, max-age=0" } }
    );
  }
}
```

- [ ] **Step 3: Implement the three routes**

`src/app/api/memory/route.ts`:

```ts
import { guardedJson } from "@/server/api-response";
import { runtime } from "@/server/runtime";

export function GET(request: Request) {
  return guardedJson(request, () => runtime().memory.list());
}
```

`src/app/api/memory/overview/route.ts`:

```ts
import { guardedJson } from "@/server/api-response";
import { runtime } from "@/server/runtime";

export function GET(request: Request) {
  return guardedJson(request, () => runtime().memory.overview());
}
```

`src/app/api/memory/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { guardLocalRequest } from "@/server/request-guard";
import { runtime } from "@/server/runtime";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const guard = guardLocalRequest(request, runtime().sessions.hasSession);
  if (!guard.ok) return NextResponse.json({ ok: false, code: guard.code }, { status: guard.status });
  const { id } = await context.params;
  const detail = await runtime().memory.detail(id);
  if (!detail) return NextResponse.json({ ok: false, code: "memory_not_found" }, { status: 404 });
  return NextResponse.json(
    { ok: true, data: detail },
    { headers: { "cache-control": "private, no-store, max-age=0" } }
  );
}
```

- [ ] **Step 4: Run route tests**

Run:

```bash
pnpm test -- src/app/api/memory/routes.test.ts src/server/api-response.test.ts
pnpm typecheck
```

Expected: all route tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/memory src/server/api-response*
git commit -m "feat(api): expose session-gated memory reads"
```

### Task 5: Build the browse-first state model and filters

**Files:**
- Create: `src/features/memory/types.ts`
- Create: `src/features/memory/filter-memories.ts`
- Create: `src/features/memory/filter-memories.test.ts`
- Create: `src/features/memory/use-memory-dashboard.ts`
- Create: `src/features/memory/use-memory-dashboard.test.tsx`

- [ ] **Step 1: Write failing filter tests**

Create `src/features/memory/filter-memories.test.ts`:

```ts
import { filterMemories } from "./filter-memories";
import type { MemorySummary } from "./types";

const entries: MemorySummary[] = [
  {
    id: "1",
    familiarId: "sage",
    title: "Architecture decisions",
    updatedAt: "2026-07-26T10:00:00Z",
    relativeUpdatedAt: "4m ago",
    excerpt: "Use the Coven daemon",
    source: "Coven origin",
    verificationState: "unknown"
  },
  {
    id: "2",
    familiarId: "echo",
    title: "User preferences",
    updatedAt: "2026-06-01T10:00:00Z",
    relativeUpdatedAt: "8w ago",
    excerpt: "Concise handoffs",
    source: "Promotion",
    verificationState: "verified"
  }
];

describe("filterMemories", () => {
  it("combines search, familiar, source, verification, and freshness", () => {
    expect(filterMemories(entries, {
      query: "architecture",
      familiar: "sage",
      source: "Coven origin",
      verification: "unknown",
      freshness: "recent"
    }, Date.parse("2026-07-26T11:00:00Z"))).toEqual([entries[0]]);
  });
});
```

- [ ] **Step 2: Implement types and pure filtering**

Create `src/features/memory/types.ts`:

```ts
export type VerificationState = "verified" | "degraded" | "unknown" | "unavailable";

export type MemorySummary = {
  id: string;
  familiarId: string;
  title: string;
  updatedAt: string;
  relativeUpdatedAt: string;
  excerpt: string;
  source: string;
  verificationState: VerificationState;
};

export type MemoryFilters = {
  query: string;
  familiar: string;
  source: string;
  verification: string;
  freshness: "all" | "recent" | "older";
};
```

Create `src/features/memory/filter-memories.ts`:

```ts
import type { MemoryFilters, MemorySummary } from "./types";

export function filterMemories(
  entries: MemorySummary[],
  filters: MemoryFilters,
  now = Date.now()
) {
  const query = filters.query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filters.familiar && entry.familiarId !== filters.familiar) return false;
    if (filters.source && entry.source !== filters.source) return false;
    if (filters.verification && entry.verificationState !== filters.verification) return false;
    const age = now - Date.parse(entry.updatedAt);
    if (filters.freshness === "recent" && age > 30 * 86_400_000) return false;
    if (filters.freshness === "older" && age <= 30 * 86_400_000) return false;
    if (!query) return true;
    return [entry.title, entry.excerpt, entry.familiarId, entry.source]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}
```

- [ ] **Step 3: Implement the dashboard hook**

The hook owns:

```ts
type LoadState<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: T; error: null }
  | { status: "error"; data: null; error: string };
```

It must:

- fetch `/api/memory/overview` and `/api/memory` in parallel;
- never turn a failed response into an empty list;
- select the first visible entry only after successful loading;
- fetch detail only for the selected ID;
- abort stale detail requests when selection changes;
- expose `reload`, `setSelectedId`, filters, and filtered entries.

Write `use-memory-dashboard.test.tsx` with mocked fetches proving:

- list failure yields `status: "error"`;
- empty success yields `status: "ready"` with zero entries;
- changing selection aborts the first detail request;
- filtered-out selection clears cleanly.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm test -- src/features/memory
```

Expected: filter and hook tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/memory
git commit -m "feat(memory): add dashboard state and filters"
```

### Task 6: Build the overview and filter toolbar

**Files:**
- Create: `src/features/memory/memory-overview.tsx`
- Create: `src/features/memory/memory-overview.test.tsx`
- Create: `src/features/memory/memory-filters.tsx`
- Create: `src/features/memory/memory-filters.test.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write component tests**

Test requirements:

```tsx
expect(screen.getByText("Verification unavailable")).toBeInTheDocument();
expect(screen.queryByText("0% verified")).not.toBeInTheDocument();
expect(screen.getByRole("searchbox", { name: "Search memories" })).toHaveAttribute(
  "placeholder",
  "Search memories..."
);
expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
```

- [ ] **Step 2: Implement `MemoryOverview`**

Render:

- total entries;
- familiars;
- verified when capability exists;
- items needing review;
- explicit **Verification unavailable** when it does not;
- a collapsible details row for manifest/index issues.

Use only `--cv-*` tokens and `.cv-*` primitives. Do not introduce hardcoded
colors.

- [ ] **Step 3: Implement `MemoryFilters`**

The toolbar has persistent labels (visible or `aria-label`) for:

- search;
- familiar;
- source;
- verification;
- freshness;
- Clear filters.

Search Escape clears only the query. Clear filters resets all facets.

- [ ] **Step 4: Add layout CSS**

Add product classes:

```css
.memory-overview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--cv-space-3);
}

.memory-filter-bar {
  display: grid;
  grid-template-columns: minmax(16rem, 1fr) repeat(4, minmax(8rem, auto));
  gap: var(--cv-space-2);
}

@media (max-width: 56rem) {
  .memory-overview-grid,
  .memory-filter-bar {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 36rem) {
  .memory-overview-grid,
  .memory-filter-bar {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm test -- src/features/memory/memory-overview.test.tsx \
  src/features/memory/memory-filters.test.tsx
pnpm typecheck
```

Expected: component tests pass and typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/memory/memory-overview* \
  src/features/memory/memory-filters* src/app/globals.css
git commit -m "feat(ui): add memory overview and filters"
```

### Task 7: Build the master list and privacy-first reader

**Files:**
- Create: `src/features/memory/memory-list.tsx`
- Create: `src/features/memory/memory-list.test.tsx`
- Create: `src/features/memory/memory-reader.tsx`
- Create: `src/features/memory/memory-reader.test.tsx`
- Create: `src/features/memory/simple-markdown.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write list behavior tests**

Cover:

```tsx
expect(screen.getByRole("option", { name: /Architecture decisions/ })).toHaveAttribute(
  "aria-selected",
  "true"
);
expect(screen.getByText("No memories match these filters")).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
```

The list uses `role="listbox"` and rows use `role="option"`. Arrow Up/Down moves
selection; Enter opens the narrow reader.

- [ ] **Step 2: Write reader privacy tests**

Cover:

```tsx
expect(screen.getByText("Content hidden until you reveal it")).toBeInTheDocument();
expect(screen.queryByText("Durable fact.")).not.toBeInTheDocument();
await user.click(screen.getByRole("button", { name: "Reveal memory content" }));
expect(screen.getByText("Durable fact.")).toBeInTheDocument();
rerender(<MemoryReader detail={otherDetail} />);
expect(screen.getByText("Content hidden until you reveal it")).toBeInTheDocument();
```

Also verify:

- unknown privacy requires reveal;
- `reveal_required: true` requires reveal;
- verified content does not bypass privacy;
- verification unknown is labeled **Unknown**, not **Verified**;
- Back to memories is visible in narrow mode.

- [ ] **Step 3: Implement `MemoryList`**

Each row displays:

- title;
- familiar;
- source;
- relative time;
- verification text plus icon/dot;
- **Hidden** when detail privacy is not yet known.

Do not render excerpts for entries marked sensitive by detail state.

- [ ] **Step 4: Implement safe markdown rendering**

Create `simple-markdown.tsx` as a deliberately small renderer:

- split paragraphs and headings;
- render text through React escaping;
- do not use `dangerouslySetInnerHTML`;
- do not render arbitrary HTML;
- do not auto-link URLs in Phase 1.

- [ ] **Step 5: Implement `MemoryReader`**

Reader states:

- no selection;
- loading;
- request error with Retry;
- hidden content;
- rendered content;
- raw content;
- unavailable verification;
- attestation metadata;
- supersession IDs.

Use a Rendered/Raw segmented control. Reveal state is local to the selected
memory ID and resets in:

```tsx
useEffect(() => setRevealed(false), [detail?.id]);
```

- [ ] **Step 6: Add responsive master-detail CSS**

Add:

```css
.memory-workspace {
  display: grid;
  grid-template-columns: minmax(18rem, 0.85fr) minmax(28rem, 1.4fr);
  min-height: 34rem;
  gap: var(--cv-space-3);
}

@media (max-width: 52rem) {
  .memory-workspace {
    grid-template-columns: 1fr;
  }

  .memory-pane-hidden-narrow {
    display: none;
  }
}
```

- [ ] **Step 7: Run tests**

Run:

```bash
pnpm test -- src/features/memory/memory-list.test.tsx \
  src/features/memory/memory-reader.test.tsx
pnpm typecheck
```

Expected: list, keyboard, privacy, reveal reset, and reader tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/features/memory/memory-list* src/features/memory/memory-reader* \
  src/features/memory/simple-markdown.tsx src/app/globals.css
git commit -m "feat(ui): add memory list and privacy-first reader"
```

### Task 8: Assemble the dashboard and all user-visible states

**Files:**
- Create: `src/features/memory/memory-dashboard.tsx`
- Create: `src/features/memory/memory-dashboard.test.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write failing integration component tests**

Cover:

- loading skeleton labels **Loading memories...**;
- true empty state **No memories yet**;
- filtered empty state **No memories match these filters**;
- daemon failure **Couldn't load memory** plus Retry;
- overview failure does not hide a successful list;
- selecting a row loads the detail;
- narrow Back returns to the list;
- logout clears the selected detail.

- [ ] **Step 2: Implement `MemoryDashboard`**

Compose:

```tsx
<header className="memory-header">...</header>
<MemoryOverview ... />
<MemoryFilters ... />
<div className="memory-workspace">
  <MemoryList ... />
  <MemoryReader ... />
</div>
```

The header contains exactly:

- title;
- daemon connection state;
- updated time;
- Refresh;
- Logout in an overflow/details menu.

No promotion, edit, supersede, delete, or approval control appears in Phase 1.

- [ ] **Step 3: Update the page**

```tsx
import { LaunchGate } from "@/components/launch-gate";
import { MemoryDashboard } from "@/features/memory/memory-dashboard";

export default function HomePage() {
  return (
    <LaunchGate>
      <MemoryDashboard />
    </LaunchGate>
  );
}
```

- [ ] **Step 4: Run component integration tests**

Run:

```bash
pnpm test -- src/features/memory/memory-dashboard.test.tsx src/app/page.test.tsx
pnpm typecheck
```

Expected: all dashboard states pass and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/features/memory/memory-dashboard* src/app/page.tsx src/app/globals.css
git commit -m "feat(ui): assemble standalone memory workspace"
```

### Task 9: Add security headers and browser-level smoke coverage

**Files:**
- Modify: `next.config.ts`
- Create: `scripts/fake-daemon.mjs`
- Create: `scripts/smoke-dashboard.mjs`
- Create: `src/server/security-headers.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write header tests**

Assert:

```ts
expect(csp).toContain("default-src 'self'");
expect(csp).toContain("connect-src 'self'");
expect(csp).toContain("object-src 'none'");
expect(csp).not.toContain("unsafe-eval");
```

- [ ] **Step 2: Add Next security headers**

Configure:

```ts
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'"
].join("; ");
```

Return headers for all routes:

- `Content-Security-Policy`;
- `Referrer-Policy: no-referrer`;
- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY`;
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

- [ ] **Step 3: Create a deterministic fake daemon**

`scripts/fake-daemon.mjs` must serve:

- `/api/v1/memory`;
- `/api/v1/memory/overview`;
- `/api/v1/memory/<fixture-id>`;

with synthetic content only. It binds `127.0.0.1` on a supplied port.

- [ ] **Step 4: Create the smoke script**

`scripts/smoke-dashboard.mjs` must:

1. start the fake daemon;
2. start `server.ts` with `COVEN_DAEMON_URL`;
3. capture the printed launch URL;
4. extract the fragment token without logging it;
5. POST the token to `/api/session/exchange`;
6. retain the returned cookie;
7. call overview, list, and detail APIs;
8. assert content is hidden only in the browser component contract, not lost
   from the authenticated detail API;
9. assert unauthenticated `/api/memory` returns 401;
10. terminate both child processes by PID.

Add scripts:

```json
"test:smoke": "node scripts/smoke-dashboard.mjs",
"check": "pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:smoke"
```

- [ ] **Step 5: Run security and smoke tests**

Run:

```bash
pnpm test -- src/server/security-headers.test.ts
pnpm build
pnpm test:smoke
```

Expected: header tests pass, build exits 0, and smoke prints a success summary
without printing a launch token, cookie, memory content, or local path.

- [ ] **Step 6: Commit**

```bash
git add next.config.ts scripts package.json pnpm-lock.yaml src/server/security-headers.test.ts
git commit -m "test(security): cover headers and local dashboard flow"
```

### Task 10: Final verification, docs, and Beads handoff

**Files:**
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `docs/superpowers/specs/2026-07-26-standalone-memory-dashboard-design.md`

- [ ] **Step 1: Document run and troubleshooting commands**

README must include:

```markdown
## Run locally

1. Start the Coven daemon.
2. Run `pnpm dev`.
3. Open the one-time loopback URL printed by the launcher.

The app refuses non-loopback binds. It reads memory only through the Coven
daemon; it does not open the archival database, vector index, or memory files.
```

Document `COVEN_HOME`, optional `COVEN_DAEMON_URL`, and the fact that the
HTTP fallback must be loopback.

- [ ] **Step 2: Extend SECURITY.md**

Add dashboard-specific rules:

- launch token is fragment-only and single-use;
- cookies and content are never logged;
- browser APIs return opaque IDs, not paths;
- all memory routes require the local session;
- test fixtures must be synthetic.

- [ ] **Step 3: Mark spec implementation references**

Add an **Implementation** section linking:

- daemon branch/PR;
- UI branch/PR;
- validation commands;
- bead `cmem-8qg`.

- [ ] **Step 4: Run the complete UI quality gate**

Run:

```bash
pnpm check
./scripts/guard-scan.sh --beads
git status --short
```

Expected:

- lint passes;
- typecheck passes;
- all Vitest tests pass;
- production build succeeds;
- local fake-daemon smoke succeeds;
- privacy guard is clean;
- only intended files are modified.

- [ ] **Step 5: Update Beads**

Do not close `cmem-8qg` until both daemon and UI branches are integrated and the
full acceptance criteria are met.

Update it with:

```bash
bd update cmem-8qg --notes="Phase 1 implementation complete on <daemon-commit> and <ui-commit>. Validation: cargo clippy --workspace --all-targets -- -D warnings; cargo test --workspace --locked; pnpm check; scripts/guard-scan.sh --beads."
```

Supersede the old dashboard implementation bead after its useful findings have
been copied:

```bash
bd supersede cmem-8ta --with=cmem-8qg
```

Keep `cmem-uiu` open until the unrelated vulnerable `coven-dashboard` route is
fixed or removed.

- [ ] **Step 6: Commit documentation**

```bash
git add README.md SECURITY.md docs/superpowers/specs/2026-07-26-standalone-memory-dashboard-design.md
git commit -m "docs: add standalone memory dashboard operations"
```
