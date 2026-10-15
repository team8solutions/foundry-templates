import { SignJWT, jwtVerify } from "jose";

export type SessionClaims = {
  userId: number;
  sessionVersion: number;
};

const ISSUER = "ait-foundry-app";
const AUDIENCE = "ait-foundry-browser";
const ALGORITHM = "HS256";

export async function createSessionToken(
  claims: SessionClaims,
  key: Uint8Array,
  expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000),
) {
  return new SignJWT({ sv: claims.sessionVersion })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(String(claims.userId))
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(key);
}

export async function verifySessionToken(
  token: string,
  key: Uint8Array,
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const userId = Number(payload.sub);
    const sessionVersion = payload.sv;
    if (!Number.isSafeInteger(userId) || userId <= 0)
      return null;
    if (!Number.isSafeInteger(sessionVersion) || Number(sessionVersion) <= 0)
      return null;
    return { userId, sessionVersion: Number(sessionVersion) };
  } catch {
    return null;
  }
}
