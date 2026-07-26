import {
  guardedMethodNotAllowed,
  jsonNoStore
} from "@/server/api-response";
import { guardLocalRequest } from "@/server/request-guard";
import { runtime } from "@/server/runtime";

export function GET(request: Request) {
  const guard = guardLocalRequest(request, runtime().sessions.hasSession);
  if (!guard.ok) {
    return jsonNoStore(
      { ok: false, code: guard.code },
      { status: guard.status }
    );
  }
  const expiresAt = runtime().sessions.sessionExpiresAt(guard.session);
  if (expiresAt === null) {
    return jsonNoStore(
      { ok: false, code: "session_required" },
      { status: 401 }
    );
  }
  return jsonNoStore({ ok: true, expiresAt: new Date(expiresAt).toISOString() });
}

const unsupported = (request: Request) =>
  guardedMethodNotAllowed(request, ["GET", "HEAD"]);

export {
  unsupported as DELETE,
  unsupported as OPTIONS,
  unsupported as PATCH,
  unsupported as POST,
  unsupported as PUT
};
