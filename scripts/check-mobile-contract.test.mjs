import test from "node:test";
import assert from "node:assert/strict";
import { createECDH, createPublicKey, verify } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareFixtureDirectories } from "./check-mobile-contract.mjs";

const fixturesRoot = fileURLToPath(
  new URL(
    "../apps/ios/CovenMemory/Tests/Fixtures/mobile-memory-v1/",
    import.meta.url
  )
);
const caveFixturesRoot = fileURLToPath(
  new URL(
    "../apps/ios/CovenMemory/Tests/Fixtures/cave-mobile-memory-v1/",
    import.meta.url
  )
);

async function withFixtureDirectories(t) {
  const root = await mkdtemp(join(tmpdir(), "coven-mobile-contract-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const host = join(root, "host");
  const ios = join(root, "ios");
  await Promise.all([mkdir(host), mkdir(ios)]);
  return { host, ios };
}

test("accepts byte-identical fixture directories", async (t) => {
  const { host, ios } = await withFixtureDirectories(t);
  await Promise.all([
    writeFile(join(host, "detail.json"), "{\"ok\":true}\n"),
    writeFile(join(ios, "detail.json"), "{\"ok\":true}\n")
  ]);

  await assert.doesNotReject(compareFixtureDirectories(host, ios));
});

test("rejects fixture file-set drift", async (t) => {
  const { host, ios } = await withFixtureDirectories(t);
  await writeFile(join(host, "detail.json"), "{\"ok\":true}\n");

  await assert.rejects(
    compareFixtureDirectories(host, ios),
    /mobile contract fixture file sets differ/
  );
});

test("names the fixture whose bytes drift", async (t) => {
  const { host, ios } = await withFixtureDirectories(t);
  await Promise.all([
    writeFile(join(host, "detail.json"), "{\"ok\":true}\n"),
    writeFile(join(ios, "detail.json"), "{\"ok\":false}\n")
  ]);

  await assert.rejects(
    compareFixtureDirectories(host, ios),
    /mobile contract fixture differs: detail\.json/
  );
});

test("locks the complete synthetic v1 contract and signature vector", async () => {
  const expectedNames = [
    "capabilities-success.json",
    "detail-protected.json",
    "detail-public.json",
    "error-cases.json",
    "list-success.json",
    "overview-success.json",
    "signature-vector.json"
  ];
  assert.deepEqual((await readdir(fixturesRoot)).sort(), expectedNames);

  const parse = async (name) =>
    JSON.parse(await readFile(join(fixturesRoot, name), "utf8"));
  const successNames = expectedNames.filter(
    (name) => name.endsWith("-success.json") || name.startsWith("detail-")
  );
  const ulid = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
  for (const name of successNames) {
    const envelope = await parse(name);
    assert.equal(envelope.ok, true, name);
    assert.equal(envelope.protocolVersion, 1, name);
    assert.match(envelope.requestId, ulid, name);
    assert.ok(envelope.data !== undefined, name);
    assert.equal(envelope.error, undefined, name);
  }

  const list = await parse("list-success.json");
  const overview = await parse("overview-success.json");
  assert.equal(overview.data.totals.entries, list.data.length);
  assert.equal(
    overview.data.totals.familiars,
    new Set(list.data.map((item) => item.familiarId)).size
  );
  assert.equal(
    overview.data.totals.verified,
    list.data.filter((item) => item.verification.state === "verified").length
  );
  assert.equal(
    overview.data.totals.needsReview,
    list.data.filter(
      (item) => item.verification.state === "needs-review"
    ).length
  );
  for (const item of list.data) {
    assert.match(
      item.id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    assert.equal(Number.isNaN(Date.parse(item.updatedAt)), false);
    assert.equal("path" in item, false);
  }

  const errors = await parse("error-cases.json");
  const expectedCodes = [
    "invalid_request",
    "pairing_expired",
    "pairing_consumed",
    "pairing_confirmation_required",
    "pairing_phrase_mismatch",
    "device_unknown",
    "device_revoked",
    "signature_invalid",
    "request_expired",
    "request_replayed",
    "rate_limited",
    "protocol_unsupported",
    "capability_unavailable",
    "memory_not_found",
    "memory_content_too_large",
    "memory_content_invalid",
    "memory_content_unavailable",
    "daemon_unavailable",
    "response_invalid",
    "gateway_disabled"
  ];
  assert.deepEqual(
    errors.map((entry) => entry.error.code),
    expectedCodes
  );
  for (const envelope of errors) {
    assert.equal(envelope.ok, false);
    assert.equal(envelope.protocolVersion, 1);
    assert.match(envelope.requestId, ulid);
    assert.equal(typeof envelope.error.retryable, "boolean");
    assert.equal(envelope.data, undefined);
    assert.equal(envelope.error.message, undefined);
  }

  const vector = await parse("signature-vector.json");
  const decode = (value) => Buffer.from(value, "base64url");
  const scalar = decode(vector.privateScalar);
  const publicX963 = decode(vector.publicKeyX963);
  assert.equal(scalar.length, 32);
  assert.equal(publicX963.length, 65);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(scalar);
  assert.deepEqual(ecdh.getPublicKey(undefined, "uncompressed"), publicX963);
  const publicKey = createPublicKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: publicX963.subarray(1, 33).toString("base64url"),
      y: publicX963.subarray(33).toString("base64url")
    },
    format: "jwk"
  });
  assert.equal(
    verify(
      "sha256",
      Buffer.from(vector.canonical, "utf8"),
      publicKey,
      decode(vector.signatureDER)
    ),
    true
  );
});

test("locks the Cave mobile canonical-memory response contract", async () => {
  const expectedNames = [
    "cave-detail-success.json",
    "cave-error-cases.json",
    "cave-list-success.json",
    "cave-overview-success.json"
  ];
  assert.deepEqual((await readdir(caveFixturesRoot)).sort(), expectedNames);

  const parse = async (name) =>
    JSON.parse(await readFile(join(caveFixturesRoot, name), "utf8"));
  const list = await parse("cave-list-success.json");
  const overview = await parse("cave-overview-success.json");
  const detail = await parse("cave-detail-success.json");
  const errors = await parse("cave-error-cases.json");

  assert.equal(list.ok, true);
  assert.equal(overview.ok, true);
  assert.equal(detail.ok, true);
  assert.equal(list.entries.length, overview.overview.totals.entries);
  assert.equal(detail.entry.id, list.entries[0].id);
  assert.equal("path" in list.entries[0], false);
  assert.equal("path" in detail.entry, false);
  assert.deepEqual(
    errors.map((entry) => entry.code),
    [
      "mobile_access_required",
      "local_daemon_required",
      "canonical_memory_unavailable",
      "capability_unavailable",
      "daemon_update_required",
      "invalid_daemon_payload",
      "memory_not_found"
    ]
  );
  assert.ok(errors.every((entry) => entry.ok === false));
});
