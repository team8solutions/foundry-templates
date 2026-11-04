import assert from "node:assert/strict";
import test from "node:test";
import { sign, unsign } from "#sandbox/auth";
import { parseSessionValue, sessionValue } from "../../lib/auth/session-core";

// Read on first use, so setting it after the import is enough.
process.env.SESSION_SIGNING_KEY = "unit-test-signing-key-with-at-least-32-bytes";
const DAY = 24 * 60 * 60;

test("round-trips a session's user and version", () => {
  assert.equal(sessionValue({ userId: "u42", sessionVersion: 3 }), "u42:3");
  assert.deepEqual(parseSessionValue("u42:3"), { userId: "u42", sessionVersion: 3 });
});

test("rejects malformed session values", () => {
  for (const value of [null, "", "u42", "u42:0", "u42:-1", "u42:1.5", "u/42:1", "../x:1", "u42:1:2", `${"a".repeat(65)}:1`])
    assert.equal(parseSessionValue(value), null, String(value));
  assert.throws(() => sessionValue({ userId: "a/b", sessionVersion: 1 }), /user id/);
  assert.throws(() => sessionValue({ userId: "u1", sessionVersion: 0 }), /session version/);
});

test("a signed session survives only unchanged and within its age", async () => {
  const token = await sign(sessionValue({ userId: "u7", sessionVersion: 1 }));
  assert.deepEqual(parseSessionValue(await unsign(token, undefined, DAY)), { userId: "u7", sessionVersion: 1 });

  const parts = token.split(".");
  const signature = Buffer.from(parts[2], "base64url");
  signature[0] ^= 1;
  assert.equal(await unsign([parts[0], parts[1], signature.toString("base64url")].join("."), undefined, DAY), null);
  const forged = Buffer.from("u8:1").toString("base64url");
  assert.equal(await unsign([forged, parts[1], parts[2]].join("."), undefined, DAY), null);

  const now = Date.now;
  Date.now = () => now() - (DAY + 60) * 1000;
  const expired = await sign(sessionValue({ userId: "u7", sessionVersion: 1 }));
  Date.now = now;
  assert.equal(await unsign(expired, undefined, DAY), null);
});
