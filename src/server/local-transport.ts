import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

export const LOCAL_TRANSPORT_HEADER = "x-coven-local-transport";

export type LocalTransportAuthority = {
  authorize: (
    headers: IncomingHttpHeaders,
    remoteAddress: string | undefined
  ) => boolean;
  validate: (headers: Headers) => boolean;
};

function isExplicitLoopbackPeer(remoteAddress: string | undefined) {
  return (
    remoteAddress === "127.0.0.1" ||
    remoteAddress === "::1" ||
    remoteAddress === "::ffff:127.0.0.1"
  );
}

export function createLocalTransportAuthority(
  proofBytes: Uint8Array = randomBytes(32)
): LocalTransportAuthority {
  if (proofBytes.byteLength < 32) {
    throw new Error("local transport proof must contain at least 32 bytes");
  }

  const proof = Buffer.from(proofBytes).toString("base64url");
  const expected = Buffer.from(proof, "utf8");

  const validate = (headers: Headers) => {
    const candidateValue = headers.get(LOCAL_TRANSPORT_HEADER);
    if (candidateValue === null) {
      return false;
    }
    const candidate = Buffer.from(candidateValue, "utf8");
    return (
      candidate.byteLength === expected.byteLength &&
      timingSafeEqual(candidate, expected)
    );
  };

  return {
    authorize(headers, remoteAddress) {
      delete headers[LOCAL_TRANSPORT_HEADER];
      if (!isExplicitLoopbackPeer(remoteAddress)) {
        return false;
      }
      headers[LOCAL_TRANSPORT_HEADER] = proof;
      return true;
    },
    validate
  };
}

const globalTransport = globalThis as typeof globalThis & {
  __covenMemoryLocalTransport?: LocalTransportAuthority;
};

export function localTransportAuthority(): LocalTransportAuthority {
  globalTransport.__covenMemoryLocalTransport ??=
    createLocalTransportAuthority();
  return globalTransport.__covenMemoryLocalTransport;
}
