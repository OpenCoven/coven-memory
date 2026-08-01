import {
  guardedMethodNotAllowed,
  jsonNoStore
} from "@/server/api-response";
import { guardLocalRequest, SESSION_COOKIE } from "@/server/request-guard";
import { runtime } from "@/server/runtime";

export function POST(request: Request) {
  const guard = guardLocalRequest(request, runtime().sessions.hasSession);
  if (!guard.ok) {
    return jsonNoStore(
      { ok: false, code: guard.code },
      { status: guard.status }
    );
  }

  if (guard.session !== null) {
    runtime().sessions.revokeSession(guard.session);
  }
  const response = jsonNoStore({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 0
  });
  return response;
}

const unsupported = (request: Request) =>
  guardedMethodNotAllowed(request, ["POST"]);

export {
  unsupported as DELETE,
  unsupported as GET,
  unsupported as HEAD,
  unsupported as OPTIONS,
  unsupported as PATCH,
  unsupported as PUT
};
