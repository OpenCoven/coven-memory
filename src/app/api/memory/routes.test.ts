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
vi.mock("@/server/local-transport", () => ({
  localTransportAuthority: () => ({
    validate: (headers: Headers) =>
      headers.get("x-coven-local-transport") === "test-proof"
  })
}));

const mockedRuntime = vi.mocked(runtime);
const id = "d251bc66-3e45-5d03-8d78-1e76919642f9";

function request(
  path: string,
  options: {
    transport?: boolean;
    origin?: string;
    host?: string;
  } = {}
) {
  const origin = options.origin ?? "http://127.0.0.1:3737";
  return new Request(`http://127.0.0.1:3737${path}`, {
    headers: {
      host: options.host ?? "127.0.0.1:3737",
      origin,
      ...(options.transport === false
        ? {}
        : { "x-coven-local-transport": "test-proof" })
    }
  });
}

function useRuntime(options: {
  list?: ReturnType<typeof vi.fn>;
  overview?: ReturnType<typeof vi.fn>;
  detail?: ReturnType<typeof vi.fn>;
}) {
  const memory = {
    list: options.list ?? vi.fn(),
    overview: options.overview ?? vi.fn(),
    detail: options.detail ?? vi.fn()
  };
  mockedRuntime.mockReturnValue({ memory } as never);
  return memory;
}

describe("memory API routes", () => {
  afterEach(() => vi.clearAllMocks());

  it("rejects requests without local transport proof before reading daemon data", async () => {
    const memory = useRuntime({});

    const response = await list(
      request("/api/memory", { transport: false })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      code: "invalid_transport"
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(memory.list).not.toHaveBeenCalled();
  });

  it("rejects foreign Origin and Host values before reading daemon data", async () => {
    const memory = useRuntime({});
    const foreignOrigin = await list(
      request("/api/memory", {
        origin: "https://example.invalid"
      })
    );
    const foreignHost = await list(
      request("/api/memory", {
        host: "192.168.1.12:3737"
      })
    );

    expect(foreignOrigin.status).toBe(403);
    expect(foreignHost.status).toBe(403);
    expect(memory.list).not.toHaveBeenCalled();
  });

  it("guards unsupported methods and returns no-store 405 responses", async () => {
    const rejectedMemory = useRuntime({});
    const rejected = await listOptions(
      request("/api/memory", { transport: false })
    );

    expect(rejected.status).toBe(403);
    expect(rejected.headers.get("cache-control")).toContain("no-store");
    expect(rejected.headers.get("pragma")).toBe("no-cache");
    expect(rejectedMemory.list).not.toHaveBeenCalled();

    const trustedMemory = useRuntime({});
    for (const handler of [listOptions, listPost]) {
      const response = await handler(request("/api/memory"));
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("pragma")).toBe("no-cache");
    }
    expect(trustedMemory.list).not.toHaveBeenCalled();
  });

  it("returns normalized list, overview, and detail data with no-store", async () => {
    const memory = useRuntime({
      list: vi.fn().mockResolvedValue([{ id }]),
      overview: vi.fn().mockResolvedValue({ totals: { entries: 1 } }),
      detail: vi.fn().mockResolvedValue({ id, content: "Synthetic" })
    });

    const responses = [
      await list(request("/api/memory")),
      await overview(request("/api/memory/overview")),
      await detail(request(`/api/memory/${id}`), {
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
      request(`/api/memory/${id}`),
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
      request(`/api/memory/${id}`),
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
      request("/api/memory/not-an-id"),
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
    const invalidPayload = await list(request("/api/memory"));
    expect(invalidPayload.status).toBe(502);
    expect(await invalidPayload.json()).toEqual({
      ok: false,
      code: "invalid_daemon_payload"
    });
  });
});
