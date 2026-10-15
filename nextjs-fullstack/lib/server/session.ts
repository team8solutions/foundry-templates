import "server-only";

import type { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createSessionToken,
  verifySessionToken,
  type SessionClaims,
} from "@/lib/auth/session-core";
import { sessionCookieSecure, sessionSigningKey } from "@/lib/server/env";

export const SESSION_COOKIE = "session";
const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

export async function signSession(claims: SessionClaims) {
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  return {
    token: await createSessionToken(claims, sessionSigningKey(), expiresAt),
    expiresAt,
  };
}

export async function verifyConfiguredSession(token: string) {
  return verifySessionToken(token, sessionSigningKey());
}

export async function sessionFromRequest(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return token ? verifyConfiguredSession(token) : null;
}

export async function sessionFromCookies() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifyConfiguredSession(token) : null;
}

export async function setSessionCookie(
  response: NextResponse,
  claims: SessionClaims,
) {
  const { token, expiresAt } = await signSession(claims);
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: sessionCookieSecure(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: sessionCookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
