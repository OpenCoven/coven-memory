const DEFAULT_PORT = 3737;

export function resolveListenOptions(
  env: Readonly<Record<string, string | undefined>>
) {
  const hostname = env.HOST ?? "127.0.0.1";
  if (hostname !== "127.0.0.1" && hostname !== "::1") {
    throw new Error(
      "coven-memory accepts only explicit loopback HOST values (127.0.0.1 or ::1)"
    );
  }

  const rawPort = env.PORT ?? String(DEFAULT_PORT);
  if (!/^[1-9]\d*$/.test(rawPort)) {
    throw new Error("coven-memory port must be an integer from 1 to 65535");
  }
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port > 65_535) {
    throw new Error("coven-memory port must be an integer from 1 to 65535");
  }

  return {
    hostname,
    originHost: hostname === "::1" ? "[::1]" : hostname,
    port
  };
}
