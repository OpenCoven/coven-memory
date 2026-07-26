import { NextResponse } from "next/server";
import { MemoryGatewayError } from "./memory-gateway";
import { localTransportAuthority } from "./local-transport";
import { guardLocalTransportRequest } from "./request-guard";

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

function rejectedGuard(
  guard: ReturnType<typeof guardLocalTransportRequest>
) {
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

export function guardedMethodNotAllowed(
  request: Request,
  allowed: readonly string[]
) {
  const guard = guardLocalTransportRequest(
    request,
    localTransportAuthority().validate
  );
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
  const guard = guardLocalTransportRequest(
    request,
    localTransportAuthority().validate
  );
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
