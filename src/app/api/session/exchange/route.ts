import {
  jsonNoStore,
  loopbackMethodNotAllowed
} from "@/server/api-response";
import { readJsonBody } from "@/server/request-body";
import { guardLoopbackRequest, SESSION_COOKIE } from "@/server/request-guard";
import { runtime } from "@/server/runtime";
import { DEFAULT_SESSION_TTL_MS } from "@/server/session-store";

const MAX_EXCHANGE_BODY_BYTES = 1_024;
const MAX_TOKEN_LENGTH = 256;

export async function POST(request: Request) {
  const guard = guardLoopbackRequest(request);
  if (!guard.ok) {
    return jsonNoStore(
      { ok: false, code: guard.code },
      { status: guard.status }
    );
  }

  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    return jsonNoStore(
      { ok: false, code: "invalid_content_type" },
      { status: 415 }
    );
  }

  const body = await readJsonBody(request, MAX_EXCHANGE_BODY_BYTES);
  if (!body.ok) {
    return jsonNoStore({ ok: false, code: body.code }, { status: 400 });
  }

  const keys = Object.keys(body.value);
  const token = body.value.token;
  if (
    keys.length !== 1 ||
    keys[0] !== "token" ||
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > MAX_TOKEN_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(token)
  ) {
    return jsonNoStore({ ok: false, code: "invalid_token" }, { status: 400 });
  }

  const session = runtime().sessions.exchangeLaunchToken(token);
  if (!session) {
    return jsonNoStore({ ok: false, code: "invalid_token" }, { status: 401 });
  }

  const response = jsonNoStore({ ok: true });
  response.cookies.set(SESSION_COOKIE, session, {
    httpOnly: true,
    sameSite: "strict",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: Math.floor(DEFAULT_SESSION_TTL_MS / 1_000)
  });
  return response;
}

const unsupported = (request: Request) =>
  loopbackMethodNotAllowed(request, ["POST"]);

export {
  unsupported as DELETE,
  unsupported as GET,
  unsupported as HEAD,
  unsupported as OPTIONS,
  unsupported as PATCH,
  unsupported as PUT
};
