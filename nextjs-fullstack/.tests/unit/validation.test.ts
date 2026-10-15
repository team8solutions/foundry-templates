import assert from "node:assert/strict";
import test from "node:test";
import {
  passwordChangeSchema,
  profileSchema,
  signUpSchema,
} from "../../lib/validation";

const email = "user@example.com";

function acceptsPassword(password: string) {
  return signUpSchema.safeParse({ email, password }).success;
}

test("normalizes accepted account input", () => {
  assert.deepEqual(
    signUpSchema.parse({
      email: "  USER@Example.COM ",
      password: "password123",
    }),
    { email, password: "password123" },
  );
  assert.deepEqual(
    profileSchema.parse({ name: "  Ada Lovelace ", email: "ADA@EXAMPLE.COM" }),
    { name: "Ada Lovelace", email: "ada@example.com" },
  );
});

test("rejects invalid and mismatched credentials", () => {
  assert.equal(
    signUpSchema.safeParse({ email: "bad", password: "short" }).success,
    false,
  );
  assert.equal(
    passwordChangeSchema.safeParse({
      currentPassword: "old-password",
      newPassword: "new-password",
      confirmPassword: "different-password",
    }).success,
    false,
  );
  assert.equal(
    passwordChangeSchema.safeParse({
      currentPassword: "same-password",
      newPassword: "same-password",
      confirmPassword: "same-password",
    }).success,
    false,
  );
});

test("enforces bcrypt's 72-byte password limit", () => {
  assert.equal(acceptsPassword("a".repeat(72)), true);
  assert.equal(acceptsPassword("€".repeat(24)), true);
  assert.equal(acceptsPassword("€".repeat(25)), false);

  const sharedPrefix = "a".repeat(72);
  assert.equal(acceptsPassword(`${sharedPrefix}first`), false);
  assert.equal(acceptsPassword(`${sharedPrefix}second`), false);
});
