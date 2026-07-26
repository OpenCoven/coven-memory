import { createServer } from "node:http";
import next from "next";
import { resolveListenOptions } from "./src/server/listen-options";
import { localTransportAuthority } from "./src/server/local-transport";
import { runtime } from "./src/server/runtime";

const { hostname, originHost, port } = resolveListenOptions(process.env);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const launchToken = runtime().sessions.issueLaunchToken();
const localTransport = localTransportAuthority();
const server = createServer((request, response) => {
  if (!localTransport.authorize(request.headers, request.socket.remoteAddress)) {
    response.writeHead(403, {
      "cache-control": "private, no-store, max-age=0",
      "content-type": "application/json",
      pragma: "no-cache"
    });
    response.end(JSON.stringify({ ok: false, code: "invalid_transport" }));
    return;
  }
  void handle(request, response);
});

server.listen(port, hostname, () => {
  process.stdout.write(
    `Coven Memory: http://${originHost}:${port}/#launch=${launchToken}\n`
  );
});
