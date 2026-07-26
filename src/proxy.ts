import { NextRequest, NextResponse } from "next/server";
import { prepareNonceHeaders } from "./server/security-headers";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const mode =
    process.env.NODE_ENV === "development" ? "development" : "production";
  const prepared = prepareNonceHeaders(request.headers, nonce, mode);
  const response = NextResponse.next({
    request: { headers: prepared.requestHeaders }
  });
  response.headers.set(
    "Content-Security-Policy",
    prepared.contentSecurityPolicy
  );
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|icon.svg).*)"
    }
  ]
};
