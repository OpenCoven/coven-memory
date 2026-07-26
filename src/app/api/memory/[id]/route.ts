import { guardedMemoryJson } from "@/server/api-response";
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
