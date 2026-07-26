import { jsonNoStore } from "@/server/api-response";
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

  runtime().sessions.revokeSession(guard.session);
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
