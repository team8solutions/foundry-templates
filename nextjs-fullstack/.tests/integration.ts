import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Cookie, CookieJar } from "tough-cookie";
import { sign } from "#sandbox/auth";
import { collection, document, FieldValue } from "#sandbox/db";
import { hashPassword } from "../lib/auth/password";

// The app keeps its data through #sandbox/db; this suite reads and writes the same database with it.
// It needs SYMPOSIA_DATA_BACKEND=postgres, SYMPOSIA_DATABASE_URL and SESSION_SIGNING_KEY (see
// STARTER.md), the same values the application under test uses.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.SYMPOSIA_DATABASE_URL || "";
const signingKey = process.env.SESSION_SIGNING_KEY || "";
const previewGrant = process.env.TEST_PREVIEW_GRANT;
const suppliedBaseUrl = process.env.TEST_BASE_URL?.replace(/\/$/, "");
const runId = `it-${Date.now()}-${process.pid}`;
const emailPrefix = `${runId}-`;
const password = "initial-password";
const nextPassword = "updated-password";
const SESSION_COOKIE = "symposia_session";

function redact(value: string) {
  let result = databaseUrl ? value.replaceAll(databaseUrl, "[SYMPOSIA_DATABASE_URL]") : value;
  if (signingKey) result = result.replaceAll(signingKey, "[SESSION_SIGNING_KEY]");
  return result;
}

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

type RunningApp = {
  baseUrl: string;
  child: ChildProcessWithoutNullStreams;
  output: () => string;
};

async function waitForHealth(app: RunningApp, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (app.child.exitCode !== null)
      throw new Error(`Application exited before readiness.\n${redact(app.output())}`);
    try {
      const response = await fetch(`${app.baseUrl}/api/healthz`);
      if (response.ok) return;
    } catch {}
    await delay(200);
  }
  throw new Error(`Application did not become ready.\n${redact(app.output())}`);
}

// Runs the built app as the platform does (`next start`), with these settings changed.
async function startApp(options: { env?: Record<string, string>; port?: number } = {}) {
  const port = options.port || await freePort();
  const child = spawn(
    process.execPath,
    [path.resolve(root, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: root,
      env: { ...process.env, NODE_ENV: "production", ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  const append = (chunk: Buffer) => {
    logs = (logs + chunk.toString()).slice(-20_000);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  const app = {
    baseUrl: `http://127.0.0.1:${port}`,
    child,
    output: () => logs,
  };
  await waitForHealth(app);
  return app;
}

async function stopApp(app: RunningApp | undefined) {
  if (!app || app.child.exitCode !== null) return;
  app.child.kill("SIGTERM");
  const stopped = new Promise<boolean>((resolve) =>
    app.child.once("exit", () => resolve(true)),
  );
  if (await Promise.race([stopped, delay(10_000).then(() => false)])) return;
  app.child.kill("SIGKILL");
  await stopped;
}

function setCookieHeaders(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() || [response.headers.get("set-cookie")].filter(Boolean) as string[];
}

class Browser {
  readonly jar = new CookieJar(undefined, { allowSecureOnLocal: false });

  constructor(readonly baseUrl: string) {}

  async request(pathname: string, init: RequestInit = {}) {
    const url = new URL(pathname, this.baseUrl);
    const headers = new Headers(init.headers);
    if (previewGrant) headers.set("x-symposia-preview-grant", previewGrant);
    if (init.method && !["GET", "HEAD"].includes(init.method))
      headers.set("origin", new URL(this.baseUrl).origin);
    const cookie = await this.jar.getCookieString(url);
    if (cookie) headers.set("cookie", cookie);
    const response = await fetch(url, { ...init, headers, redirect: "manual" });
    for (const value of setCookieHeaders(response))
      await this.jar.setCookie(value, url, { ignoreError: true });
    return response;
  }

  form(pathname: string, values: Record<string, string>) {
    return this.request(pathname, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(values),
    });
  }

  async setSession(token: string) {
    await this.jar.setCookie(
      `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax`,
      this.baseUrl,
    );
  }

  async sessionToken() {
    return (await this.jar.getCookies(this.baseUrl)).find(
      (cookie) => cookie.key === SESSION_COOKIE,
    )?.value;
  }
}

function assertFormRedirect(response: Response, pathname: string) {
  assert.equal(response.status, 303);
  const location = response.headers.get("location");
  assert.ok(location?.startsWith(pathname), `Expected redirect to ${pathname}, got ${location}`);
  assert.ok(location.startsWith("/") && !location.startsWith("//"));
  return location;
}

async function assertProtected(browser: Browser, pathname = "/dashboard") {
  const response = await browser.request(pathname);
  assert.ok([303, 307, 308].includes(response.status));
  assert.match(response.headers.get("location") || "", /\/sign-in/);
}

async function verifySecureCookieDefault() {
  // The published app (SYMPOSIA_ENV=prod) keeps its own data and only sends Secure cookies.
  const app = await startApp({ env: { SYMPOSIA_ENV: "prod" } });
  try {
    const browser = new Browser(app.baseUrl);
    const response = await browser.form("/api/auth/sign-up", {
      email: `${emailPrefix}secure@example.test`,
      password,
    });
    assertFormRedirect(response, "/dashboard");
    const parsed = Cookie.parse(setCookieHeaders(response)[0] || "");
    assert.ok(parsed);
    assert.equal(parsed.secure, true);
    assert.equal(parsed.httpOnly, true);
    assert.equal(parsed.sameSite, "lax");
    assert.equal(await browser.jar.getCookieString(app.baseUrl), "");
    assert.equal(await accountFor(`${emailPrefix}secure@example.test`), null, "prod data must not appear in dev");
  } finally {
    await stopApp(app);
  }
  process.stdout.write("ok - the published app sends Secure cookies only, and keeps its own data\n");
}

async function verifyInputBoundary(browser: Browser) {
  const invalid = await browser.form("/api/auth/sign-up", {
    email: "not-an-email",
    password: "short",
  });
  assertFormRedirect(invalid, "/sign-up?error=");

  const oversized = await browser.request("/api/auth/sign-up", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `email=x%40example.test&password=${"x".repeat(20_000)}`,
  });
  assert.equal(oversized.status, 413);

  const multipart = await browser.request("/api/auth/sign-up", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=test" },
    body: "--test--",
  });
  assert.equal(multipart.status, 415);
  process.stdout.write("ok - form boundary rejects invalid, oversized and multipart input\n");
}

async function signUp(browser: Browser, email: string) {
  const response = await browser.form("/api/auth/sign-up", { email, password });
  assertFormRedirect(response, "/dashboard");
  const parsed = Cookie.parse(setCookieHeaders(response)[0] || "");
  assert.ok(parsed);
  assert.equal(parsed.httpOnly, true);
  assert.equal(parsed.sameSite, "lax");
  return parsed;
}

async function verifyAccountFlow(
  browser: Browser,
  email: string,
  appControl: { restart: () => Promise<void> },
) {
  await assertProtected(new Browser(browser.baseUrl));
  await verifyInputBoundary(browser);
  const cookie = await signUp(browser, email);
  if (browser.baseUrl.startsWith("http://")) assert.equal(cookie.secure, false);

  const duplicate = await new Browser(browser.baseUrl).form("/api/auth/sign-up", { email, password });
  assertFormRedirect(duplicate, "/sign-up?error=");

  let page = await browser.request("/dashboard");
  assert.equal(page.status, 200);
  assert.match(await page.text(), new RegExp(email));

  const response = await browser.form("/api/account/profile", {
    name: "Ada Integration",
    email,
  });
  assertFormRedirect(response, "/dashboard/general?success=");
  page = await browser.request("/dashboard/general");
  assert.match(await page.text(), /Ada Integration/);

  await appControl.restart();
  page = await browser.request("/dashboard");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Ada Integration/);
  process.stdout.write("ok - signup, duplicate email, profile and restart persistence\n");
}

const emailKey = (email: string) => createHash("sha256").update(email).digest("hex");

async function accountFor(email: string) {
  const userId = (await document("user_emails", emailKey(email)).get()).get("user_id");
  if (typeof userId !== "string") return null;
  const account = await document("users", userId).get();
  return {
    userId,
    sessionVersion: Number(account.get("session_version")),
    teamId: String(account.get("team_id")),
  };
}

async function contextForEmail(email: string) {
  const context = await accountFor(email);
  assert.ok(context, `no account for ${email}`);
  return context;
}

const membership = (teamId: string, userId: string) =>
  document("teams", teamId).collection("members").doc(userId);

async function verifyLongEmailSignUp(baseUrl: string) {
  const email = `${emailPrefix.padEnd(64, "x")}@long-integration.example.test`;
  assert.equal(email.length, 94);
  const browser = new Browser(baseUrl);
  await signUp(browser, email);
  const context = await contextForEmail(email);
  const team = await document("teams", context.teamId).get();
  assert.equal(team.get("name"), `${email.slice(0, 93)}'s team`);
  assert.equal(team.get("name").length, 100);
  assert.equal((await browser.request("/dashboard")).status, 200);
  process.stdout.write("ok - long valid email creates an account with a bounded team name\n");
}

async function verifyAuthorization(owner: Browser, ownerEmail: string, secondEmail: string) {
  const second = new Browser(owner.baseUrl);
  await signUp(second, secondEmail);
  const ownerContext = await contextForEmail(ownerEmail);
  const secondContext = await contextForEmail(secondEmail);

  // Another team's member is out of reach, and neither user sees the other's team.
  let response = await owner.form(`/api/team/members/${secondContext.userId}`, {});
  assertFormRedirect(response, "/dashboard?error=");
  assert.ok((await membership(secondContext.teamId, secondContext.userId).get()).exists);
  assert.doesNotMatch(await (await owner.request("/dashboard")).text(), new RegExp(secondEmail));
  assert.doesNotMatch(await (await second.request("/dashboard")).text(), new RegExp(ownerEmail));
  const secondUser = await (await second.request("/api/user")).json();
  assert.equal(secondUser.email, secondEmail);

  const memberEmail = `${emailPrefix}member@example.test`;
  const member = collection("users").doc();
  const now = FieldValue.serverTimestamp();
  await member.create({
    email: memberEmail,
    name: null,
    password_hash: await hashPassword(password),
    session_version: 1,
    team_id: ownerContext.teamId,
    created_at: now,
    updated_at: now,
  });
  await document("user_emails", emailKey(memberEmail)).create({ user_id: member.id });
  await membership(ownerContext.teamId, member.id).create({ role: "member", joined_at: now });
  const memberBrowser = new Browser(owner.baseUrl);
  await memberBrowser.setSession(await sign(`${member.id}:1`));
  assert.match(await (await memberBrowser.request("/dashboard")).text(), new RegExp(ownerEmail));
  response = await memberBrowser.form(`/api/team/members/${ownerContext.userId}`, {});
  assertFormRedirect(response, "/dashboard?error=");

  response = await owner.form(`/api/team/members/${member.id}`, {});
  assertFormRedirect(response, "/dashboard?success=");
  assert.equal((await membership(ownerContext.teamId, member.id).get()).exists, false);
  await assertProtected(memberBrowser);
  process.stdout.write("ok - user, team and owner authorization\n");
}

async function verifySessionsAndPassword(browser: Browser, email: string) {
  const context = await contextForEmail(email);
  const previousToken = await browser.sessionToken();
  assert.ok(previousToken);

  let response = await browser.form("/api/account/password", {
    currentPassword: password,
    newPassword: nextPassword,
    confirmPassword: nextPassword,
  });
  assertFormRedirect(response, "/dashboard/security?success=");
  const nextToken = await browser.sessionToken();
  assert.ok(nextToken && nextToken !== previousToken);

  const oldSession = new Browser(browser.baseUrl);
  await oldSession.setSession(previousToken);
  await assertProtected(oldSession);

  const tampered = new Browser(browser.baseUrl);
  const parts = nextToken.split(".");
  const signature = Buffer.from(parts[2], "base64url");
  signature[0] ^= 1;
  parts[2] = signature.toString("base64url");
  await tampered.setSession(parts.join("."));
  await assertProtected(tampered);

  // Signed with the right key and version, but issued more than a day ago.
  const now = Date.now;
  Date.now = () => now() - 25 * 60 * 60 * 1000;
  const old = await sign(`${context.userId}:${context.sessionVersion + 1}`);
  Date.now = now;
  const expired = new Browser(browser.baseUrl);
  await expired.setSession(old);
  await assertProtected(expired);

  const oldPassword = new Browser(browser.baseUrl);
  response = await oldPassword.form("/api/auth/sign-in", {
    email,
    password,
  });
  assertFormRedirect(response, "/sign-in?error=");
  response = await oldPassword.form("/api/auth/sign-in", {
    email,
    password: nextPassword,
  });
  assertFormRedirect(response, "/dashboard");
  process.stdout.write("ok - password change invalidates old, tampered and expired sessions\n");
}

async function verifyActivityAndSignOut(browser: Browser) {
  const page = await browser.request("/dashboard/activity");
  assert.equal(page.status, 200);
  const html = await page.text();
  for (const label of ["Created the account", "Updated the profile", "Changed the password", "Removed a team member"])
    assert.match(html, new RegExp(label));

  const response = await browser.form("/api/auth/sign-out", {});
  assertFormRedirect(response, "/");
  const cleared = Cookie.parse(setCookieHeaders(response)[0] || "");
  assert.ok(cleared);
  assert.equal(cleared.maxAge, 0);
  await assertProtected(browser);
  process.stdout.write("ok - activity persists and signout clears the browser session\n");
}

async function verifyDatabaseOutage(userId: string, sessionVersion: number) {
  const app = await startApp({ env: { SYMPOSIA_DATABASE_URL: "postgresql://app:test@127.0.0.1:1/unavailable" } });
  try {
    const browser = new Browser(app.baseUrl);
    await browser.setSession(await sign(`${userId}:${sessionVersion}`));
    const protectedPage = await browser.request("/dashboard");
    assert.ok(protectedPage.status >= 500);
    const response = await browser.form("/api/auth/sign-out", {});
    assertFormRedirect(response, "/");
    const cleared = Cookie.parse(setCookieHeaders(response)[0] || "");
    assert.equal(cleared?.maxAge, 0);
  } finally {
    await stopApp(app);
  }
  process.stdout.write("ok - liveness stays separate and signout survives a database outage\n");
}

// Removes every account this run created, in both the preview ("dev") and published ("prod") data.
async function cleanup() {
  const environment = process.env.SYMPOSIA_ENV;
  try {
    for (const env of ["dev", "prod"]) {
      process.env.SYMPOSIA_ENV = env;
      const { docs } = await collection("users")
        .where("email", ">=", emailPrefix)
        .where("email", "<", `${emailPrefix}`)
        .get();
      for (const account of docs) {
        const teamId = String(account.get("team_id"));
        for (const ref of await account.ref.collection("activity").listDocuments()) await ref.delete();
        for (const ref of await document("teams", teamId).collection("members").listDocuments()) await ref.delete();
        await document("teams", teamId).delete();
        await document("user_emails", emailKey(String(account.get("email")))).delete();
        await account.ref.delete();
      }
    }
  } finally {
    if (environment === undefined) delete process.env.SYMPOSIA_ENV;
    else process.env.SYMPOSIA_ENV = environment;
  }
}

async function main() {
  assert.ok(path.isAbsolute(root));
  assert.equal(process.env.SYMPOSIA_DATA_BACKEND, "postgres", "Set SYMPOSIA_DATA_BACKEND=postgres");
  assert.ok(databaseUrl, "Set SYMPOSIA_DATABASE_URL");
  assert.ok(signingKey.length >= 32, "Set SESSION_SIGNING_KEY (at least 32 characters)");
  assert.ok(
    suppliedBaseUrl || existsSync(path.join(root, ".next", "BUILD_ID")),
    "Run npm run build before the integration suite",
  );
  let app: RunningApp | undefined;
  try {
    if (!suppliedBaseUrl) await verifySecureCookieDefault();

    const mainUrl = suppliedBaseUrl || (app = await startApp()).baseUrl;
    const browser = new Browser(mainUrl);
    const ownerEmail = `${emailPrefix}owner@example.test`;
    const secondEmail = `${emailPrefix}second@example.test`;
    const restart = async () => {
      if (suppliedBaseUrl) return;
      await stopApp(app);
      app = await startApp({ port: Number(new URL(mainUrl).port) });
    };

    await verifyAccountFlow(browser, ownerEmail, { restart });
    await verifyLongEmailSignUp(mainUrl);
    await verifyAuthorization(browser, ownerEmail, secondEmail);
    await verifySessionsAndPassword(browser, ownerEmail);
    await verifyActivityAndSignOut(browser);
    const context = await contextForEmail(ownerEmail);

    if (!suppliedBaseUrl) {
      await stopApp(app);
      app = undefined;
      await verifyDatabaseOutage(context.userId, context.sessionVersion);
    }
  } finally {
    await stopApp(app);
    await cleanup().catch((error) => console.error("cleanup failed:", redact(String(error))));
  }
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error) => {
    console.error(redact(error instanceof Error ? error.stack || error.message : String(error)));
    process.exit(1);
  },
);
