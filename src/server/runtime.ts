import { homedir } from "node:os";
import { join } from "node:path";
import { createDaemonTransport } from "./daemon-transport";
import { createMemoryGateway, type MemoryGateway } from "./memory-gateway";
import { createSessionStore, type SessionStore } from "./session-store";

type Runtime = {
  sessions: SessionStore;
  memory: MemoryGateway;
};

const globalRuntime = globalThis as typeof globalThis & {
  __covenMemoryRuntime?: Runtime;
};

export function runtime(): Runtime {
  if (!globalRuntime.__covenMemoryRuntime) {
    const covenHome = process.env.COVEN_HOME ?? join(homedir(), ".coven");
    const socketPath =
      process.env.COVEN_DAEMON_SOCKET ?? join(covenHome, "coven.sock");
    const transport = createDaemonTransport({
      socketPath,
      loopbackUrl: process.env.COVEN_DAEMON_URL
    });
    globalRuntime.__covenMemoryRuntime = {
      sessions: createSessionStore(),
      memory: createMemoryGateway(transport)
    };
  }
  return globalRuntime.__covenMemoryRuntime;
}
