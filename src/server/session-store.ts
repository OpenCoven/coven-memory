import { randomBytes } from "node:crypto";

const DEFAULT_LAUNCH_TTL_MS = 60_000;
export const DEFAULT_SESSION_TTL_MS = 30 * 60_000;

type SessionStoreOptions = {
  now?: () => number;
  randomToken?: () => string;
  launchTtlMs?: number;
  sessionTtlMs?: number;
};

export function createSessionStore(options: SessionStoreOptions = {}) {
  const now = options.now ?? Date.now;
  const randomToken =
    options.randomToken ?? (() => randomBytes(32).toString("base64url"));
  const launchTtlMs = options.launchTtlMs ?? DEFAULT_LAUNCH_TTL_MS;
  const sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  let launchToken: { value: string; expiresAt: number } | null = null;
  const sessions = new Map<string, number>();
  const sessionExpiresAt = (session: string) => {
    const expiresAt = sessions.get(session);
    if (!expiresAt || expiresAt <= now()) {
      sessions.delete(session);
      return null;
    }
    return expiresAt;
  };

  return {
    issueLaunchToken() {
      const value = randomToken();
      launchToken = { value, expiresAt: now() + launchTtlMs };
      return value;
    },

    exchangeLaunchToken(value: string) {
      const issued = launchToken;
      if (!issued || issued.value !== value) {
        return null;
      }

      launchToken = null;
      if (issued.expiresAt <= now()) {
        return null;
      }

      const session = randomToken();
      const expiresAt = now() + sessionTtlMs;
      sessions.set(session, expiresAt);
      return { session, expiresAt };
    },

    sessionExpiresAt(session: string) {
      return sessionExpiresAt(session);
    },

    hasSession(session: string) {
      return sessionExpiresAt(session) !== null;
    },

    revokeSession(session: string) {
      sessions.delete(session);
    }
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
