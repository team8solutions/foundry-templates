// What the signed session cookie holds: the user's id and the session version it was issued for.
// A password change raises the version, which ends every older session.
export type SessionClaims = {
  userId: string;
  sessionVersion: number;
};

const USER_ID = /^[A-Za-z0-9]{1,64}$/;

export function sessionValue(claims: SessionClaims) {
  if (!USER_ID.test(claims.userId)) throw new Error("Invalid user id");
  if (!Number.isSafeInteger(claims.sessionVersion) || claims.sessionVersion <= 0)
    throw new Error("Invalid session version");
  return `${claims.userId}:${claims.sessionVersion}`;
}

export function parseSessionValue(value: string | null | undefined): SessionClaims | null {
  const match = /^([A-Za-z0-9]{1,64}):([1-9][0-9]{0,14})$/.exec(value || "");
  if (!match) return null;
  return { userId: match[1], sessionVersion: Number(match[2]) };
}

export function isUserId(value: string) {
  return USER_ID.test(value);
}
