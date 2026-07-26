import { guardedMemoryJson } from "@/server/api-response";
import { runtime } from "@/server/runtime";

export function GET(request: Request) {
  return guardedMemoryJson(request, () => runtime().memory.overview());
}
