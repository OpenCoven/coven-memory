type GuardFailure = {
  ok: false;
  status: 403;
  code:
    | "invalid_host"
    | "invalid_transport"
    | "foreign_origin";
};

type TransportGuard = { ok: true } | GuardFailure;

function parseHost(host: string): URL | null {
  try {
    const parsed = new URL(`http://${host}`);
    return parsed.host === host && !parsed.username && !parsed.password
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function isExplicitLoopback(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "[::1]";
}

function isTailscaleMagicDns(hostname: string): boolean {
  const labels = hostname.split(".");
  if (
    labels.length < 3 ||
    labels.at(-2) !== "ts" ||
    labels.at(-1) !== "net"
  ) {
    return false;
  }
  return labels.every((label) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
  );
}

function isTrustedHost(hostname: string): boolean {
  return isExplicitLoopback(hostname) || isTailscaleMagicDns(hostname);
}

function isMatchingOrigin(origin: string, host: string): boolean {
  try {
    const parsed = new URL(origin);
    return (
      parsed.origin === origin &&
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.host === host &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

export function guardLocalTransportRequest(
  request: Request,
  validateTransport: (headers: Headers) => boolean
): TransportGuard {
  if (!validateTransport(request.headers)) {
    return { ok: false, status: 403, code: "invalid_transport" };
  }

  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  const parsedHost = host ? parseHost(host) : null;
  if (
    !host ||
    !parsedHost ||
    !isTrustedHost(parsedHost.hostname) ||
    (requestUrl.protocol !== "http:" && requestUrl.protocol !== "https:")
  ) {
    return { ok: false, status: 403, code: "invalid_host" };
  }

  const origin = request.headers.get("origin");
  if (origin && !isMatchingOrigin(origin, host)) {
    return { ok: false, status: 403, code: "foreign_origin" };
  }

  return { ok: true };
}
