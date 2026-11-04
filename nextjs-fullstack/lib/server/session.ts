import "server-only";

import type { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearSession, setSession, unsign } from "#sandbox/auth";
import {
  parseSessionValue,
  sessionValue,
  type SessionClaims,
} from "@/lib/auth/session-core";

// The cookie #sandbox/auth writes: signed with the platform's SESSION_SIGNING_KEY, HTTP-only,
// SameSite=Lax, and Secure on the published app (plain HTTP works in a preview).
export const SESSION_COOKIE = "symposia_session";
export const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

export async function verifySession(token: string | undefined) {
  if (!token) return null;
  return parseSessionValue(await unsign(token, undefined, SESSION_MAX_AGE_SECONDS));
}

export async function sessionFromRequest(request: NextRequest) {
  return verifySession(request.cookies.get(SESSION_COOKIE)?.value);
}

export async function sessionFromCookies() {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function setSessionCookie(response: NextResponse, claims: SessionClaims) {
  await setSession(response, sessionValue(claims), {
    cookieName: SESSION_COOKIE,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  clearSession(response, { cookieName: SESSION_COOKIE });
}
