import { NextResponse } from "next/server";
import { MemoryGatewayError } from "./memory-gateway";
import {
  guardLocalRequest,
  guardLoopbackRequest
} from "./request-guard";
import { runtime } from "./runtime";

export const NO_STORE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache"
} as const;

export function jsonNoStore(
  body: unknown,
  init: ResponseInit = {}
): NextResponse {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(NO_STORE_HEADERS)) {
    headers.set(name, value);
  }
  return NextResponse.json(body, { ...init, headers });
}

function rejectedGuard(guard: ReturnType<typeof guardLoopbackRequest>) {
  if (guard.ok) {
    return null;
  }
  return jsonNoStore(
    { ok: false, code: guard.code },
    { status: guard.status }
  );
}

export function methodNotAllowed(allowed: readonly string[]) {
  return jsonNoStore(
    { ok: false, code: "method_not_allowed" },
    {
      status: 405,
      headers: { allow: allowed.join(", ") }
    }
  );
}

export function loopbackMethodNotAllowed(
  request: Request,
  allowed: readonly string[]
) {
  return (
    rejectedGuard(guardLoopbackRequest(request)) ??
    methodNotAllowed(allowed)
  );
}

export function guardedMethodNotAllowed(
  request: Request,
  allowed: readonly string[]
) {
  const guard = guardLocalRequest(request, runtime().sessions.hasSession);
  return rejectedGuard(guard) ?? methodNotAllowed(allowed);
}

type GuardedJsonOptions = {
  notFoundCode?: string;
};

export async function guardedMemoryJson<T>(
  request: Request,
  load: () => Promise<T>,
  options: GuardedJsonOptions = {}
) {
  const guard = guardLocalRequest(request, runtime().sessions.hasSession);
  if (!guard.ok) {
    return jsonNoStore(
      { ok: false, code: guard.code },
      { status: guard.status }
    );
  }

  try {
    const data = await load();
    if (data === null && options.notFoundCode) {
      return jsonNoStore(
        { ok: false, code: options.notFoundCode },
        { status: 404 }
      );
    }
    return jsonNoStore({ ok: true, data });
  } catch (error) {
    if (error instanceof MemoryGatewayError) {
      if (error.code === "invalid_id") {
        return jsonNoStore(
          { ok: false, code: "invalid_memory_id" },
          { status: 400 }
        );
      }
      if (error.code === "invalid_payload") {
        return jsonNoStore(
          { ok: false, code: "invalid_daemon_payload" },
          { status: 502 }
        );
      }
    }
    return jsonNoStore(
      { ok: false, code: "memory_unavailable" },
      { status: 503 }
    );
  }
}
