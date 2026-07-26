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
  return jsonNoStore({ ok: true });
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
