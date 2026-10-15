import "server-only";

import {
  databaseUrlFrom,
  sessionCookieSecureFrom,
  sessionSigningKeyFrom,
  validateRuntimeEnvFrom,
} from "@/lib/env-core";

export function databaseUrl() {
  return databaseUrlFrom(process.env);
}

export function sessionSigningKey() {
  return sessionSigningKeyFrom(process.env);
}

export function sessionCookieSecure() {
  return sessionCookieSecureFrom(process.env);
}

export function validateRuntimeEnv() {
  validateRuntimeEnvFrom(process.env);
}
