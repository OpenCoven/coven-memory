"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

type SessionControls = {
  lock: () => void;
  logout: () => Promise<void>;
};

const LocalSessionContext = createContext<SessionControls | null>(null);

export function useLocalSession(): SessionControls {
  const session = useContext(LocalSessionContext);
  if (!session) {
    throw new Error("useLocalSession must be used inside LaunchGate");
  }
  return session;
}

export function LaunchGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "ready" | "locked">(
    "checking"
  );
  const establishment = useRef<Promise<Response> | null>(null);
  const lock = useCallback(() => setState("locked"), []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/session/logout", {
        method: "POST",
        cache: "no-store"
      });
    } catch {
      // Local state must still lock when the daemon-facing server is gone.
    } finally {
      lock();
    }
  }, [lock]);

  const controls = useMemo(() => ({ lock, logout }), [lock, logout]);

  useEffect(() => {
    let active = true;
    if (establishment.current === null) {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const token = fragment.get("launch");

      if (token !== null) {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`
        );
      }

      establishment.current =
        token !== null
          ? fetch("/api/session/exchange", {
              method: "POST",
              cache: "no-store",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ token })
            })
          : fetch("/api/session/status", { cache: "no-store" });
    }

    void establishment.current.then(
      (response) => {
        if (active) {
          setState(response.ok ? "ready" : "locked");
        }
      },
      () => {
        if (active) {
          setState("locked");
        }
      }
    );

    return () => {
      active = false;
    };
  }, []);

  if (state === "checking") {
    return (
      <main className="memory-gate" aria-busy="true">
        <p className="cv-eyebrow">Local session</p>
        <h1>Opening memory</h1>
        <p role="status">Establishing a private loopback session…</p>
      </main>
    );
  }

  if (state === "locked") {
    return (
      <main className="memory-gate">
        <p className="cv-eyebrow">Local session</p>
        <h1>Memory is locked</h1>
        <p>
          This launch link is missing, expired, or already used. Restart the
          dashboard to issue a new one.
        </p>
      </main>
    );
  }

  return (
    <LocalSessionContext.Provider value={controls}>
      {children}
    </LocalSessionContext.Provider>
  );
}
