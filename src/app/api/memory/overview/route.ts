import {
  guardedMemoryJson,
  guardedMethodNotAllowed
} from "@/server/api-response";
import { runtime } from "@/server/runtime";

export function GET(request: Request) {
  return guardedMemoryJson(request, () => runtime().memory.overview());
}

const unsupported = (request: Request) =>
  guardedMethodNotAllowed(request, ["GET", "HEAD"]);

export {
  unsupported as DELETE,
  unsupported as OPTIONS,
  unsupported as PATCH,
  unsupported as POST,
  unsupported as PUT
};
