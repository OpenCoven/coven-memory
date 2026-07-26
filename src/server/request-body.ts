type JsonBodyResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; code: "body_too_large" | "invalid_json" };

export async function readJsonBody(
  request: Request,
  maxBytes = 1_024
): Promise<JsonBodyResult> {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    (!/^(0|[1-9]\d*)$/.test(declaredLength) ||
      Number(declaredLength) > maxBytes)
  ) {
    return { ok: false, code: "body_too_large" };
  }

  if (!request.body) {
    return { ok: false, code: "invalid_json" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { ok: false, code: "body_too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, code: "invalid_json" };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const parsed: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, code: "invalid_json" };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, code: "invalid_json" };
  }
}
