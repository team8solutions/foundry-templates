// #sandbox/auth — signed sign-in sessions for your app's own users. Server code only.
//
//     import { setSession, currentUser, clearSession } from "#sandbox/auth";
//
//     await setSession(response, user.id);           // after checking the password
//     const user = await currentUser(request);       // the user document, or null
//     clearSession(response);                        // sign out
//
// The Node twin of sandbox_auth.py. The session is a signed, HTTP-only cookie holding the user
// document's id, signed with the app's stable key (SESSION_SIGNING_KEY, which the platform generates;
// older apps fall back to a key created once in their own database). `response` is a Response or
// NextResponse, a Node/Express response, or a cookie store such as Next.js cookies(); `request` is a
// Request or NextRequest, a Node/Express request, or a cookie store.
import { node } from "./_server.mjs";
import { collection, env, FieldValue } from "./db.mjs";

const COOKIE = "symposia_session", SALT = "app.session", MAX_AGE = 60 * 60 * 24 * 30;

let secret;
export function sessionSecret() {
  secret ??= loadSecret().catch((error) => {
    secret = undefined;
    throw error;
  });
  return secret;
}

async function loadSecret() {
  const configured = process.env.SESSION_SIGNING_KEY;
  if (configured) {
    if (configured.length < 32) throw new Error("app session signing key is too short");
    return configured;
  }
  const ref = collection("_config").doc("session-signing-key");
  let doc = await ref.get();
  if (!doc.exists) {
    // A second instance may create the key at the same time; read it back below either way.
    await ref.create({ key: node("crypto").randomBytes(32).toString("hex"), created_at: FieldValue.serverTimestamp() })
      .catch(() => {});
    doc = await ref.get();
  }
  const key = doc.exists ? doc.data()?.key : undefined;
  if (typeof key !== "string" || key.length < 32) throw new Error("stable session signing key is unavailable");
  return key;
}

async function signature(payload, salt) {
  const crypto = node("crypto");
  const key = crypto.createHmac("sha256", await sessionSecret()).update("symposia-signer:" + salt).digest();
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

// A signed, timestamped token for `value`; unsign() gives the value back while it is younger than maxAge.
export async function sign(value, salt = SALT) {
  const payload = Buffer.from(String(value)).toString("base64url") + "." + Math.floor(Date.now() / 1000);
  return payload + "." + (await signature(payload, salt));
}

export async function unsign(token, salt = SALT, maxAge = MAX_AGE) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3) return null;
  const payload = parts[0] + "." + parts[1];
  const expected = Buffer.from(await signature(payload, salt)), given = Buffer.from(parts[2]);
  if (expected.length !== given.length || !node("crypto").timingSafeEqual(expected, given)) return null;
  const age = Math.floor(Date.now() / 1000) - Number(parts[1]);
  if (!(age >= 0 && age <= maxAge)) return null;
  return Buffer.from(parts[0], "base64url").toString();
}

function setCookie(target, name, value, maxAge) {
  const secure = env() === "prod";
  const header = `${name}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
  if (typeof target?.headers?.append === "function") target.headers.append("Set-Cookie", header);
  else if (typeof target?.appendHeader === "function") target.appendHeader("Set-Cookie", header);
  else if (typeof target?.set === "function") target.set(name, value, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
  else throw new TypeError("pass a Response, a Node/Express response, or a cookie store such as Next.js cookies()");
}

function readCookie(source, name) {
  const header = typeof source?.headers?.get === "function" ? source.headers.get("cookie") : source?.headers?.cookie;
  if (typeof header === "string") {
    for (const part of header.split(";")) {
      const at = part.indexOf("=");
      if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
    }
    return null;
  }
  return typeof source?.get === "function" ? (source.get(name)?.value ?? null) : null;
}

// Writes a signed, HTTP-only session cookie for a user document's id.
export async function setSession(response, userId, { cookieName = COOKIE, salt = SALT, maxAge = MAX_AGE } = {}) {
  setCookie(response, cookieName, await sign(userId, salt), maxAge);
}

// The user document, or null: also when an old cookie names a deleted user. Sign-in pages should
// redirect only when this returns a document, which avoids a sign-in/dashboard redirect loop.
export async function currentUser(request, { users = "users", cookieName = COOKIE, salt = SALT, maxAge = MAX_AGE } = {}) {
  const userId = await unsign(readCookie(request, cookieName), salt, maxAge);
  if (!userId || userId.includes("/")) return null;
  const doc = await collection(users).doc(userId).get();
  return doc.exists ? doc : null;
}

export function clearSession(response, { cookieName = COOKIE } = {}) {
  setCookie(response, cookieName, "", 0);
}
