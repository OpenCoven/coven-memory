import { GET as detail } from "./[id]/route";
import { GET as overview } from "./overview/route";
import {
  GET as list,
  OPTIONS as listOptions,
  POST as listPost
} from "./route";
import { runtime } from "@/server/runtime";
import { MemoryGatewayError } from "@/server/memory-gateway";

vi.mock("@/server/runtime", () => ({
  runtime: vi.fn()
}));

const mockedRuntime = vi.mocked(runtime);
const id = "d251bc66-3e45-5d03-8d78-1e76919642f9";
const RUNTIME_AUTH_MODE_ENV = "COVEN_MEMORY_RUNTIME_AUTH_MODE";

function request(
  path: string,
  options: { session?: string; origin?: string; host?: string } = {}
) {
  const origin = options.origin ?? "http://127.0.0.1:3737";
  return new Request(`http://127.0.0.1:3737${path}`, {
    headers: {
      host: options.host ?? "127.0.0.1:3737",
      origin,
      ...(options.session === undefined
        ? {}
        : { cookie: `coven_memory_session=${options.session}` })
    }
  });
}

function useRuntime(options: {
  authenticated?: boolean;
  list?: ReturnType<typeof vi.fn>;
  overview?: ReturnType<typeof vi.fn>;
  detail?: ReturnType<typeof vi.fn>;
}) {
  const memory = {
    list: options.list ?? vi.fn(),
    overview: options.overview ?? vi.fn(),
    detail: options.detail ?? vi.fn()
  };
  mockedRuntime.mockReturnValue({
    sessions: {
      hasSession: vi.fn().mockReturnValue(options.authenticated ?? true)
    },
    memory
  } as never);
  return memory;
}

describe("memory API routes", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects missing sessions before reading daemon data", async () => {
    const memory = useRuntime({ authenticated: false });

    const response = await list(request("/api/memory"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      code: "session_required"
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(memory.list).not.toHaveBeenCalled();
  });

  it("allows sessionless loopback memory reads in development", async () => {
    vi.stubEnv(RUNTIME_AUTH_MODE_ENV, "development");
    const memory = useRuntime({
      authenticated: false,
      list: vi.fn().mockResolvedValue([])
    });

    const response = await list(request("/api/memory"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: [] });
    expect(memory.list).toHaveBeenCalledOnce();
  });

  it("rejects foreign Origin and Host values before reading daemon data", async () => {
    const memory = useRuntime({});
    const foreignOrigin = await list(
      request("/api/memory", {
        session: "valid",
        origin: "https://example.invalid"
      })
    );
    const foreignHost = await list(
      request("/api/memory", {
        session: "valid",
        host: "192.168.1.12:3737"
      })
    );

    expect(foreignOrigin.status).toBe(403);
    expect(foreignHost.status).toBe(403);
    expect(memory.list).not.toHaveBeenCalled();
  });

  it("guards unsupported methods and returns no-store 405 responses", async () => {
    const unauthenticatedMemory = useRuntime({ authenticated: false });
    const unauthenticated = await listOptions(request("/api/memory"));

    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("cache-control")).toContain("no-store");
    expect(unauthenticated.headers.get("pragma")).toBe("no-cache");
    expect(unauthenticatedMemory.list).not.toHaveBeenCalled();

    const authenticatedMemory = useRuntime({ authenticated: true });
    for (const handler of [listOptions, listPost]) {
      const response = await handler(
        request("/api/memory", { session: "valid" })
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("pragma")).toBe("no-cache");
    }
    expect(authenticatedMemory.list).not.toHaveBeenCalled();
  });

  it("returns normalized list, overview, and detail data with no-store", async () => {
    const memory = useRuntime({
      list: vi.fn().mockResolvedValue([{ id }]),
      overview: vi.fn().mockResolvedValue({ totals: { entries: 1 } }),
      detail: vi.fn().mockResolvedValue({ id, content: "Synthetic" })
    });

    const responses = [
      await list(request("/api/memory", { session: "valid" })),
      await overview(request("/api/memory/overview", { session: "valid" })),
      await detail(request(`/api/memory/${id}`, { session: "valid" }), {
        params: Promise.resolve({ id })
      })
    ];

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect((await response.json()).ok).toBe(true);
    }
    expect(memory.detail).toHaveBeenCalledWith(id);
  });

  it("distinguishes missing detail from daemon unavailability", async () => {
    useRuntime({ detail: vi.fn().mockResolvedValue(null) });
    const missing = await detail(
      request(`/api/memory/${id}`, { session: "valid" }),
      { params: Promise.resolve({ id }) }
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      ok: false,
      code: "memory_not_found"
    });

    useRuntime({
      detail: vi
        .fn()
        .mockRejectedValue(new MemoryGatewayError("daemon_status", 503))
    });
    const unavailable = await detail(
      request(`/api/memory/${id}`, { session: "valid" }),
      { params: Promise.resolve({ id }) }
    );
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({
      ok: false,
      code: "memory_unavailable"
    });
  });

  it("returns safe diagnostic codes for invalid IDs and invalid daemon data", async () => {
    useRuntime({
      detail: vi.fn().mockRejectedValue(new MemoryGatewayError("invalid_id"))
    });
    const invalidId = await detail(
      request("/api/memory/not-an-id", { session: "valid" }),
      { params: Promise.resolve({ id: "not-an-id" }) }
    );
    expect(invalidId.status).toBe(400);
    expect(await invalidId.json()).toEqual({
      ok: false,
      code: "invalid_memory_id"
    });

    useRuntime({
      list: vi
        .fn()
        .mockRejectedValue(new MemoryGatewayError("invalid_payload"))
    });
    const invalidPayload = await list(
      request("/api/memory", { session: "valid" })
    );
    expect(invalidPayload.status).toBe(502);
    expect(await invalidPayload.json()).toEqual({
      ok: false,
      code: "invalid_daemon_payload"
    });
  });
});
