import { createServer } from "node:http";
import next from "next";
import { resolveListenOptions } from "./src/server/listen-options";
import { runtime } from "./src/server/runtime";

const { hostname, originHost, port } = resolveListenOptions(process.env);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const launchToken = runtime().sessions.issueLaunchToken();
const server = createServer((request, response) => {
  void handle(request, response);
});

server.listen(port, hostname, () => {
  process.stdout.write(
    `Coven Memory: http://${originHost}:${port}/#launch=${launchToken}\n`
  );
});
