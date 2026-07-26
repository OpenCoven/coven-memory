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

type GateState =
  | { status: "checking" }
  | { status: "ready"; expiresAt: number }
  | { status: "locked" }
  | { status: "error" };

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

async function readSessionExpiry(response: Response): Promise<number | null> {
  if (response.status >= 400 && response.status < 500) {
    return null;
  }
  if (!response.ok) {
    throw new Error("local session check unavailable");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("ok" in body) ||
    body.ok !== true ||
    !("expiresAt" in body) ||
    typeof body.expiresAt !== "string"
  ) {
    return null;
  }

  const expiresAt = Date.parse(body.expiresAt);
  return Number.isFinite(expiresAt) &&
    new Date(expiresAt).toISOString() === body.expiresAt &&
    expiresAt > Date.now()
    ? expiresAt
    : null;
}

export function LaunchGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>({ status: "checking" });
  const establishment = useRef<Promise<number | null> | null>(null);
  const validationVersion = useRef(0);

  const lock = useCallback(() => {
    validationVersion.current += 1;
    setState({ status: "locked" });
  }, []);

  const checkSession = useCallback(async () => {
    const version = ++validationVersion.current;
    setState({ status: "checking" });
    try {
      const expiresAt = await fetch("/api/session/status", {
        cache: "no-store"
      }).then(readSessionExpiry);
      if (validationVersion.current !== version) {
        return;
      }
      setState(expiresAt === null ? { status: "locked" } : { status: "ready", expiresAt });
    } catch {
      if (validationVersion.current === version) {
        setState({ status: "error" });
      }
    }
  }, []);

  const logout = useCallback(async () => {
    lock();
    try {
      await fetch("/api/session/logout", {
        method: "POST",
        cache: "no-store"
      });
    } catch {
      // The local lock is deliberate even when the daemon-facing server is gone.
    }
  }, [lock]);

  const controls = useMemo(() => ({ lock, logout }), [lock, logout]);

  useEffect(() => {
    let active = true;
    const version = ++validationVersion.current;
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

      establishment.current = (
        token !== null
          ? fetch("/api/session/exchange", {
              method: "POST",
              cache: "no-store",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ token })
            })
          : fetch("/api/session/status", { cache: "no-store" })
      ).then(readSessionExpiry);
    }

    void establishment.current.then(
      (expiresAt) => {
        if (active && validationVersion.current === version) {
          setState(
            expiresAt === null ? { status: "locked" } : { status: "ready", expiresAt }
          );
        }
      },
      () => {
        if (active && validationVersion.current === version) {
          setState({ status: "error" });
        }
      }
    );

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (state.status !== "ready") {
      return;
    }

    const timeout = window.setTimeout(
      lock,
      Math.max(0, state.expiresAt - Date.now())
    );
    const revalidate = () => {
      void checkSession();
    };
    const revalidateWhenVisible = () => {
      if (document.visibilityState === "visible") {
        revalidate();
      }
    };
    window.addEventListener("pageshow", revalidate);
    document.addEventListener("visibilitychange", revalidateWhenVisible);

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("pageshow", revalidate);
      document.removeEventListener("visibilitychange", revalidateWhenVisible);
    };
  }, [checkSession, lock, state]);

  if (state.status === "checking") {
    return (
      <main className="memory-gate" aria-busy="true">
        <p className="cv-eyebrow">Local session</p>
        <h1>Opening memory</h1>
        <p role="status">Establishing a private loopback session…</p>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="memory-gate">
        <p className="cv-eyebrow">Local session</p>
        <h1>Session check unavailable</h1>
        <p>Private memory stays hidden until the local session can be confirmed.</p>
        <button type="button" onClick={() => void checkSession()}>
          Retry session check
        </button>
      </main>
    );
  }

  if (state.status === "locked") {
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
