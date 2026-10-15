import assert from "node:assert/strict";
import test from "node:test";
import {
  databaseUrlFrom,
  sessionCookieSecureFrom,
  sessionSigningKeyFrom,
  validateRuntimeEnvFrom,
} from "../../lib/env-core";

test("validates runtime database and signing settings", () => {
  assert.equal(
    databaseUrlFrom({ DATABASE_URL: "postgresql://app:pass@localhost/app" }),
    "postgresql://app:pass@localhost/app",
  );
  assert.equal(sessionSigningKeyFrom({ SESSION_SIGNING_KEY: "a".repeat(32) }).byteLength, 32);
  assert.throws(() => databaseUrlFrom({}), /DATABASE_URL is required/);
  assert.throws(() => databaseUrlFrom({ DATABASE_URL: "https://example.test" }), /PostgreSQL protocol/);
  assert.throws(() => sessionSigningKeyFrom({ SESSION_SIGNING_KEY: "too-short" }), /at least 32 bytes/);
  assert.doesNotThrow(() =>
    validateRuntimeEnvFrom({
      DATABASE_URL: "postgresql://app:pass@localhost/app",
      SESSION_SIGNING_KEY: "a".repeat(32),
    }),
  );
  assert.throws(
    () =>
      validateRuntimeEnvFrom({
        DATABASE_URL: "postgresql://app:pass@localhost/app",
      }),
    /SESSION_SIGNING_KEY is required/,
  );
});

test("uses secure cookies unless local HTTP opts out", () => {
  assert.equal(sessionCookieSecureFrom({}), true);
  assert.equal(sessionCookieSecureFrom({ SESSION_COOKIE_SECURE: "true" }), true);
  assert.equal(sessionCookieSecureFrom({ SESSION_COOKIE_SECURE: "false" }), false);
});
