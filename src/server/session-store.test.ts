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
    expect(store.exchangeLaunchToken(launch)).toBe("session-one");
    expect(store.exchangeLaunchToken(launch)).toBeNull();
    expect(store.hasSession("session-one")).toBe(true);
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
    const session = store.exchangeLaunchToken(liveLaunch);
    expect(session).toBe("session");
    now = 1_300;
    expect(store.hasSession("session")).toBe(true);
    now = 1_302;
    expect(store.hasSession("session")).toBe(false);
  });

  it("revokes an established session", () => {
    const store = createSessionStore({
      randomToken: tokenSequence("launch", "session")
    });
    const session = store.exchangeLaunchToken(store.issueLaunchToken());

    store.revokeSession(session!);

    expect(store.hasSession(session!)).toBe(false);
  });
});
