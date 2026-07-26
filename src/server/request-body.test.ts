import { readJsonBody } from "./request-body";

function chunkedRequest(chunks: string[], contentLength?: string) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  });

  return new Request("http://127.0.0.1:3737/api/session/exchange", {
    method: "POST",
    headers: contentLength ? { "content-length": contentLength } : undefined,
    body: stream,
    duplex: "half"
  } as RequestInit);
}

describe("readJsonBody", () => {
  it("reads a small JSON object without requiring Content-Length", async () => {
    await expect(
      readJsonBody(chunkedRequest(['{"token":', '"launch"}']))
    ).resolves.toEqual({ ok: true, value: { token: "launch" } });
  });

  it("rejects an oversized stream even when Content-Length understates it", async () => {
    await expect(
      readJsonBody(chunkedRequest([`{"token":"${"x".repeat(80)}"}`], "4"), 32)
    ).resolves.toEqual({ ok: false, code: "body_too_large" });
  });

  it("rejects an oversized declared Content-Length before reading", async () => {
    await expect(
      readJsonBody(chunkedRequest(["{}"], "2048"), 1_024)
    ).resolves.toEqual({ ok: false, code: "body_too_large" });
  });

  it.each([
    ["invalid JSON", ["{"]],
    ["JSON array", ["[]"]],
    ["JSON null", ["null"]]
  ])("rejects %s", async (_label, chunks) => {
    await expect(readJsonBody(chunkedRequest(chunks))).resolves.toEqual({
      ok: false,
      code: "invalid_json"
    });
  });
});
