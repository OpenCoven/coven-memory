import { isDevelopmentAuthMode } from "./auth-mode";

export const SESSION_COOKIE = "coven_memory_session";

type GuardFailure = {
  ok: false;
  status: 401 | 403;
  code: "invalid_host" | "foreign_origin" | "session_required";
};

type LoopbackGuard = { ok: true } | GuardFailure;
type SessionGuard =
  | { ok: true; session: string | null }
  | GuardFailure;

function sessionCookie(header: string | null): string | null {
  let session: string | null = null;

  for (const part of (header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== SESSION_COOKIE) {
      continue;
    }
    if (session !== null) {
      return null;
    }
    try {
      session = decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return session;
}

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

export function guardLoopbackRequest(request: Request): LoopbackGuard {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  const parsedHost = host ? parseHost(host) : null;

  if (
    !host ||
    !parsedHost ||
    !isExplicitLoopback(parsedHost.hostname) ||
    (requestUrl.protocol !== "http:" && requestUrl.protocol !== "https:")
  ) {
    return { ok: false, status: 403, code: "invalid_host" };
  }

  const origin = request.headers.get("origin");
  const expectedOrigin = `${requestUrl.protocol}//${host}`;
  if (origin && origin !== expectedOrigin) {
    if (origin === requestUrl.origin) {
      return { ok: false, status: 403, code: "invalid_host" };
    }
    return { ok: false, status: 403, code: "foreign_origin" };
  }

  return { ok: true };
}

export function guardLocalRequest(
  request: Request,
  hasSession: (session: string) => boolean
): SessionGuard {
  const local = guardLoopbackRequest(request);
  if (!local.ok) {
    return local;
  }

  const session = sessionCookie(request.headers.get("cookie"));

  if (isDevelopmentAuthMode()) {
    if (session === null) {
      return { ok: true, session: null };
    }
    return hasSession(session)
      ? { ok: true, session }
      : { ok: true, session: null };
  }

  if (!session || !hasSession(session)) {
    return { ok: false, status: 401, code: "session_required" };
  }

  return { ok: true, session };
}
