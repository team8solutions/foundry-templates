type RuntimeEnv = Record<string, string | undefined>;

function required(env: RuntimeEnv, name: "DATABASE_URL" | "SESSION_SIGNING_KEY") {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required at runtime`);
  return value;
}

export function databaseUrlFrom(env: RuntimeEnv) {
  const value = required(env, "DATABASE_URL");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol))
    throw new Error("DATABASE_URL must use the PostgreSQL protocol");
  return value;
}

export function sessionSigningKeyFrom(env: RuntimeEnv) {
  const value = required(env, "SESSION_SIGNING_KEY");
  if (new TextEncoder().encode(value).length < 32)
    throw new Error("SESSION_SIGNING_KEY must contain at least 32 bytes");
  return new TextEncoder().encode(value);
}

export function sessionCookieSecureFrom(env: RuntimeEnv) {
  return env.SESSION_COOKIE_SECURE !== "false";
}

export function validateRuntimeEnvFrom(env: RuntimeEnv) {
  databaseUrlFrom(env);
  sessionSigningKeyFrom(env);
}
