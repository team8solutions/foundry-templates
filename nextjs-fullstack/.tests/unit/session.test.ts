import assert from "node:assert/strict";
import test from "node:test";
import { SignJWT } from "jose";
import { createSessionToken, verifySessionToken } from "../../lib/auth/session-core";

const key = new TextEncoder().encode("unit-test-signing-key-with-at-least-32-bytes");

test("creates and verifies a valid session", async () => {
  const token = await createSessionToken({ userId: 42, sessionVersion: 3 }, key);
  assert.deepEqual(await verifySessionToken(token, key), {
    userId: 42,
    sessionVersion: 3,
  });
});

test("rejects tampered and expired sessions", async () => {
  const token = await createSessionToken({ userId: 7, sessionVersion: 1 }, key);
  const parts = token.split(".");
  parts[1] = `${parts[1][0] === "a" ? "b" : "a"}${parts[1].slice(1)}`;
  assert.equal(await verifySessionToken(parts.join("."), key), null);

  const expired = await createSessionToken(
    { userId: 7, sessionVersion: 1 },
    key,
    new Date(Date.now() - 1_000),
  );
  assert.equal(await verifySessionToken(expired, key), null);
});

test("rejects modified signature bytes", async () => {
  const token = await createSessionToken({ userId: 7, sessionVersion: 1 }, key);
  const parts = token.split(".");
  const signature = Buffer.from(parts[2], "base64url");
  signature[0] ^= 1;
  parts[2] = signature.toString("base64url");
  assert.equal(await verifySessionToken(parts.join("."), key), null);
});

test("rejects a token with a different algorithm", async () => {
  const token = await new SignJWT({ sv: 1 })
    .setProtectedHeader({ alg: "HS384" })
    .setSubject("7")
    .setIssuer("ait-foundry-app")
    .setAudience("ait-foundry-browser")
    .setExpirationTime("1h")
    .sign(key);
  assert.equal(await verifySessionToken(token, key), null);
});
