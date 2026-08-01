import { createServer } from "node:http";
import next from "next";
import {
  configureRuntimeAuthMode,
  normalizeNodeEnvironment
} from "./src/server/auth-mode";
import { resolveListenOptions } from "./src/server/listen-options";
import { createLaunchUrl } from "./src/server/launch-url";
import { runtime } from "./src/server/runtime";

const environment = normalizeNodeEnvironment(process.env.NODE_ENV);
configureRuntimeAuthMode(environment);
const { hostname, originHost, port } = resolveListenOptions(process.env);
const dev = environment !== "production";
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const launchUrl = createLaunchUrl({
  originHost,
  port,
  environment,
  issueLaunchToken: () => runtime().sessions.issueLaunchToken()
});
const server = createServer((request, response) => {
  void handle(request, response);
});

server.listen(port, hostname, () => {
  process.stdout.write(`Coven Memory: ${launchUrl}\n`);
});
