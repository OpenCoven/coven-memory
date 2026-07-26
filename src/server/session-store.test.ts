import { createSessionStore } from "./session-store";

function tokenSequence(...tokens: string[]) {
  return () => {
    const token = tokens.shift();
    if (!token) throw new Error("test token sequence exhausted");
    return token;
  };
}

describe("session store", () => {
  it("exchanges the latest launch token once and rejects replay", () => {
    const store = createSessionStore({
      now: () => 1_000,
      randomToken: tokenSequence("launch-one", "launch-two", "session-one")
    });
    const staleLaunch = store.issueLaunchToken();
    const launch = store.issueLaunchToken();

    expect(store.exchangeLaunchToken(staleLaunch)).toBeNull();
    expect(store.exchangeLaunchToken(launch)).toEqual({
      session: "session-one",
      expiresAt: 1_801_000
    });
    expect(store.exchangeLaunchToken(launch)).toBeNull();
    expect(store.hasSession("session-one")).toBe(true);
    expect(store.sessionExpiresAt("session-one")).toBe(1_801_000);
  });

  it("expires launch tokens and sessions without extending them on reads", () => {
    let now = 1_000;
    const store = createSessionStore({
      now: () => now,
      randomToken: tokenSequence("expired-launch", "live-launch", "session"),
      launchTtlMs: 100,
      sessionTtlMs: 200
    });

    const expiredLaunch = store.issueLaunchToken();
    now = 1_101;
    expect(store.exchangeLaunchToken(expiredLaunch)).toBeNull();

    const liveLaunch = store.issueLaunchToken();
    const established = store.exchangeLaunchToken(liveLaunch);
    expect(established).toEqual({ session: "session", expiresAt: 1_301 });
    now = 1_300;
    expect(store.hasSession("session")).toBe(true);
    expect(store.sessionExpiresAt("session")).toBe(1_301);
    now = 1_302;
    expect(store.sessionExpiresAt("session")).toBeNull();
    expect(store.hasSession("session")).toBe(false);
  });

  it("revokes an established session", () => {
    const store = createSessionStore({
      randomToken: tokenSequence("launch", "session")
    });
    const established = store.exchangeLaunchToken(store.issueLaunchToken());

    store.revokeSession(established!.session);

    expect(store.hasSession(established!.session)).toBe(false);
  });
});
