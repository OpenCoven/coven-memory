import { isAbsolute } from "node:path";
import {
  request as nodeHttpRequest,
  type RequestOptions
} from "node:http";

export type DaemonResponse = {
  status: number;
  body: string;
};

type RequestImplementation = (path: string) => Promise<DaemonResponse>;

type DaemonTransportOptions = {
  socketPath: string;
  loopbackUrl?: string;
  socketRequest?: RequestImplementation;
  httpRequest?: RequestImplementation;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_MAX_RESPONSE_BYTES = 4 * 1_024 * 1_024;

function validateMemoryPath(path: string) {
  if (
    path !== "/api/v1/memory" &&
    path !== "/api/v1/memory/overview" &&
    !/^\/api\/v1\/memory\/[0-9a-f-]{36}$/i.test(path)
  ) {
    throw new Error("daemon transport accepts only a versioned memory API path");
  }
}

function parseLoopbackUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("loopback daemon URL is invalid");
  }

  if (
    url.protocol !== "http:" ||
    (url.hostname !== "127.0.0.1" && url.hostname !== "[::1]") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "loopback daemon URL must be an explicit loopback HTTP origin"
    );
  }
  return url;
}

function collect(
  options: RequestOptions | URL,
  timeoutMs: number,
  maxResponseBytes: number
): Promise<DaemonResponse> {
  return new Promise((resolve, reject) => {
    const onResponse = (response: import("node:http").IncomingMessage) => {
      const chunks: Buffer[] = [];
      let size = 0;

      response.on("data", (chunk: Buffer | string) => {
        const bytes = Buffer.from(chunk);
        size += bytes.byteLength;
        if (size > maxResponseBytes) {
          response.destroy(new Error("daemon response exceeded size limit"));
          return;
        }
        chunks.push(bytes);
      });
      response.on("error", reject);
      response.on("end", () => {
        resolve({
          status: response.statusCode ?? 500,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    };

    const sharedOptions: RequestOptions = {
      method: "GET",
      headers: {
        accept: "application/json",
        connection: "close"
      }
    };
    const request =
      options instanceof URL
        ? nodeHttpRequest(options, sharedOptions, onResponse)
        : nodeHttpRequest(
            {
              ...options,
              method: "GET",
              headers: { ...sharedOptions.headers, ...options.headers }
            },
            onResponse
          );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("daemon request timed out"));
    });
    request.on("error", reject);
    request.end();
  });
}

export function createDaemonTransport(options: DaemonTransportOptions) {
  if (!isAbsolute(options.socketPath) || options.socketPath.includes("\0")) {
    throw new Error("daemon socket path must be absolute");
  }

  const loopbackUrl = options.loopbackUrl
    ? parseLoopbackUrl(options.loopbackUrl)
    : null;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes =
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  const socketRequest =
    options.socketRequest ??
    ((path: string) =>
      collect(
        {
          socketPath: options.socketPath,
          path,
          method: "GET",
          headers: {
            host: "127.0.0.1",
            accept: "application/json",
            connection: "close"
          }
        },
        timeoutMs,
        maxResponseBytes
      ));

  const fallbackRequest =
    options.httpRequest ??
    ((path: string) => {
      if (!loopbackUrl) {
        throw new Error("loopback daemon URL is not configured");
      }
      return collect(new URL(path, loopbackUrl), timeoutMs, maxResponseBytes);
    });

  return {
    async get(path: string): Promise<DaemonResponse> {
      validateMemoryPath(path);
      try {
        return await socketRequest(path);
      } catch (socketError) {
        if (!loopbackUrl) {
          throw socketError;
        }
        return fallbackRequest(path);
      }
    }
  };
}

export type DaemonTransport = ReturnType<typeof createDaemonTransport>;
