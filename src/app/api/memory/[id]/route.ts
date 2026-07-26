import {
  guardedMemoryJson,
  guardedMethodNotAllowed
} from "@/server/api-response";
import { runtime } from "@/server/runtime";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return guardedMemoryJson(
    request,
    () => runtime().memory.detail(id),
    { notFoundCode: "memory_not_found" }
  );
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
