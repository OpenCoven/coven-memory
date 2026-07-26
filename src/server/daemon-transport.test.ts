// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDaemonTransport } from "./daemon-transport";

function listen(server: Server, options: { path: string } | { port: number; host: string }) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    if ("path" in options) {
      server.listen(options.path, resolve);
    } else {
      server.listen(options.port, options.host, resolve);
    }
  });
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe("daemon transport", () => {
  it("uses the Unix socket first and falls back only after a transport error", async () => {
    const calls: string[] = [];
    const transport = createDaemonTransport({
      socketPath: "/tmp/coven.sock",
      loopbackUrl: "http://127.0.0.1:3000",
      socketRequest: async () => {
        calls.push("socket");
        throw new Error("socket unavailable");
      },
      httpRequest: async () => {
        calls.push("http");
        return { status: 200, body: "[]" };
      }
    });

    await expect(transport.get("/api/v1/memory")).resolves.toEqual({
      status: 200,
      body: "[]"
    });
    expect(calls).toEqual(["socket", "http"]);
  });

  it("does not mask a daemon HTTP status with fallback", async () => {
    const httpRequest = vi.fn();
    const transport = createDaemonTransport({
      socketPath: "/tmp/coven.sock",
      loopbackUrl: "http://127.0.0.1:3000",
      socketRequest: async () => ({ status: 503, body: "{}" }),
      httpRequest
    });

    await expect(transport.get("/api/v1/memory")).resolves.toMatchObject({
      status: 503
    });
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it.each([
    "http://localhost:3000",
    "http://0.0.0.0:3000",
    "http://192.168.1.12:3000",
    "https://127.0.0.1:3000",
    "http://user:pass@127.0.0.1:3000",
    "http://127.0.0.1:3000/base"
  ])("rejects unsafe fallback URL %s", (loopbackUrl) => {
    expect(() =>
      createDaemonTransport({
        socketPath: "/tmp/coven.sock",
        loopbackUrl
      })
    ).toThrow(/loopback daemon URL/);
  });

  it("accepts explicit IPv4 and IPv6 loopback fallback URLs", () => {
    expect(() =>
      createDaemonTransport({
        socketPath: "/tmp/coven.sock",
        loopbackUrl: "http://127.0.0.1:3000"
      })
    ).not.toThrow();
    expect(() =>
      createDaemonTransport({
        socketPath: "/tmp/coven.sock",
        loopbackUrl: "http://[::1]:3000"
      })
    ).not.toThrow();
  });

  it("rejects paths outside the versioned memory API", async () => {
    const socketRequest = vi.fn();
    const transport = createDaemonTransport({
      socketPath: "/tmp/coven.sock",
      socketRequest
    });

    await expect(transport.get("/api/v1/health")).rejects.toThrow(
      /memory API path/
    );
    expect(socketRequest).not.toHaveBeenCalled();
  });

  it("performs a real HTTP read over a Unix socket", async () => {
    const directory = await mkdtemp(join(tmpdir(), "coven-memory-transport-"));
    const socketPath = join(directory, "coven.sock");
    const server = createServer((request, response) => {
      expect(request.url).toBe("/api/v1/memory");
      response.writeHead(200, { "content-type": "application/json" });
      response.end("[]");
    });

    try {
      await listen(server, { path: socketPath });
      await expect(
        createDaemonTransport({ socketPath }).get("/api/v1/memory")
      ).resolves.toEqual({ status: 200, body: "[]" });
    } finally {
      await close(server);
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("performs a real HTTP fallback only to explicit loopback", async () => {
    const directory = await mkdtemp(join(tmpdir(), "coven-memory-transport-"));
    const server = createServer((request, response) => {
      expect(request.url).toBe("/api/v1/memory/overview");
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{}");
    });

    try {
      await listen(server, { port: 0, host: "127.0.0.1" });
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("expected a TCP server address");
      }
      const transport = createDaemonTransport({
        socketPath: join(directory, "missing.sock"),
        loopbackUrl: `http://127.0.0.1:${address.port}`
      });
      await expect(
        transport.get("/api/v1/memory/overview")
      ).resolves.toEqual({ status: 200, body: "{}" });
    } finally {
      await close(server);
      await rm(directory, { recursive: true, force: true });
    }
  });
});
