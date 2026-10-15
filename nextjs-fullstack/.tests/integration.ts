import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import postgres from "postgres";
import { Cookie, CookieJar } from "tough-cookie";
import { hashPassword } from "../lib/auth/password";
import { createSessionToken } from "../lib/auth/session-core";
import {
  databaseUrlFrom,
  sessionSigningKeyFrom,
} from "../lib/env-core";
import { MIGRATION_LOCK_ID, runMigrations } from "../scripts/migrate";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = databaseUrlFrom(process.env);
const signingKey = sessionSigningKeyFrom(process.env);
const previewGrant = process.env.TEST_PREVIEW_GRANT;
const suppliedBaseUrl = process.env.TEST_BASE_URL?.replace(/\/$/, "");
const runId = `it-${Date.now()}-${process.pid}`;
const emailPrefix = `${runId}-`;
const password = "initial-password";
const nextPassword = "updated-password";

function redact(value: string) {
  let result = value.replaceAll(databaseUrl, "[DATABASE_URL]");
  const key = process.env.SESSION_SIGNING_KEY;
  if (key) result = result.replaceAll(key, "[SESSION_SIGNING_KEY]");
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
      const response = await fetch(`${app.baseUrl}/api/healthz`, {
        headers: previewGrant ? { "x-symposia-preview-grant": previewGrant } : {},
      });
      if (response.ok) return;
    } catch {}
    await delay(200);
  }
  throw new Error(`Application did not become ready.\n${redact(app.output())}`);
}

async function startApp(options: {
  migrate: boolean;
  secureCookie?: boolean;
  url?: string;
  port?: number;
}) {
  const port = options.port || await freePort();
  const env = {
    ...process.env,
    DATABASE_URL: options.url || databaseUrl,
    SESSION_SIGNING_KEY: process.env.SESSION_SIGNING_KEY,
    PORT: String(port),
    NODE_ENV: "production",
  };
  if (options.secureCookie === undefined) delete env.SESSION_COOKIE_SECURE;
  else env.SESSION_COOKIE_SECURE = String(options.secureCookie);
  const child = spawn(
    process.execPath,
    [
      "--env-file-if-exists=.env.local",
      "--import",
      "tsx",
      "scripts/start.ts",
      ...(options.migrate ? [] : ["--skip-migrations"]),
    ],
    {
      cwd: root,
      env,
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

async function runNpm(args: string[], env: NodeJS.ProcessEnv = process.env) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn("npm", args, {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const append = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-20_000);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, output: redact(output) }));
  });
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
      `session=${token}; Path=/; HttpOnly; SameSite=Lax`,
      this.baseUrl,
    );
  }

  async sessionToken() {
    return (await this.jar.getCookies(this.baseUrl)).find(
      (cookie) => cookie.key === "session",
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

async function verifyMigrationLifecycle(sql: postgres.Sql) {
  const concurrent = await Promise.all([
    runNpm(["run", "db:migrate"]),
    runNpm(["run", "db:migrate"]),
  ]);
  assert.deepEqual(concurrent.map((result) => result.code), [0, 0]);
  const repeated = await runNpm(["run", "db:migrate"]);
  assert.equal(repeated.code, 0, repeated.output);

  const connection = await sql.reserve();
  try {
    await connection`select pg_advisory_lock(${MIGRATION_LOCK_ID})`;
    await assert.rejects(runMigrations(300), /Timed out waiting for the migration lock/);
  } finally {
    await connection`select pg_advisory_unlock(${MIGRATION_LOCK_ID})`;
    connection.release();
  }
  await runMigrations();
  process.stdout.write("ok - repeated, concurrent and bounded migrations\n");
}

async function verifyMissingConfiguration() {
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    SESSION_SIGNING_KEY: "",
  };
  const result = await runNpm(["run", "start:app"], env);
  assert.equal(result.code, 1);
  assert.match(result.output, /runtime configuration or migration failed/);
  assert.doesNotMatch(result.output, /server-only/);
  process.stdout.write("ok - startup rejects missing signing configuration\n");
}

async function verifySecureCookieDefault() {
  const app = await startApp({ migrate: false });
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
  } finally {
    await stopApp(app);
  }
  process.stdout.write("ok - secure cookies are the default and blocked on HTTP\n");
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
  process.stdout.write("ok - signup, profile and restart persistence\n");
}

async function contextForEmail(sql: postgres.Sql, email: string) {
  const [row] = await sql<{
    user_id: number;
    session_version: number;
    membership_id: number;
    team_id: number;
  }[]>`
    select u.id as user_id, u.session_version, tm.id as membership_id, tm.team_id
    from users u join team_members tm on tm.user_id = u.id
    where u.email = ${email}
  `;
  assert.ok(row);
  return row;
}

async function verifyLongEmailSignUp(sql: postgres.Sql, baseUrl: string) {
  const email = `${emailPrefix.padEnd(64, "x")}@long-integration.example.test`;
  assert.equal(email.length, 94);
  const browser = new Browser(baseUrl);
  await signUp(browser, email);
  const context = await contextForEmail(sql, email);
  const [team] = await sql<{ name: string }[]>`
    select name from teams where id = ${context.team_id}
  `;
  assert.equal(team.name, `${email.slice(0, 93)}'s team`);
  assert.equal(team.name.length, 100);
  assert.equal((await browser.request("/dashboard")).status, 200);
  process.stdout.write("ok - long valid email creates an account with a bounded team name\n");
}

async function verifyAuthorization(
  sql: postgres.Sql,
  owner: Browser,
  ownerEmail: string,
  secondEmail: string,
) {
  const second = new Browser(owner.baseUrl);
  await signUp(second, secondEmail);
  const ownerContext = await contextForEmail(sql, ownerEmail);
  const secondContext = await contextForEmail(sql, secondEmail);

  let response = await owner.form(
    `/api/team/members/${secondContext.membership_id}`,
    {},
  );
  assertFormRedirect(response, "/dashboard?error=");
  assert.ok(await contextForEmail(sql, secondEmail));

  const memberEmail = `${emailPrefix}member@example.test`;
  const memberHash = await hashPassword(password);
  const [member] = await sql<{ id: number; session_version: number }[]>`
    insert into users (email, password_hash)
    values (${memberEmail}, ${memberHash})
    returning id, session_version
  `;
  const [membership] = await sql<{ id: number }[]>`
    insert into team_members (user_id, team_id, role)
    values (${member.id}, ${ownerContext.team_id}, 'member')
    returning id
  `;
  const memberBrowser = new Browser(owner.baseUrl);
  await memberBrowser.setSession(
    await createSessionToken(
      { userId: member.id, sessionVersion: member.session_version },
      signingKey,
    ),
  );
  response = await memberBrowser.form(
    `/api/team/members/${ownerContext.membership_id}`,
    {},
  );
  assertFormRedirect(response, "/dashboard?error=");

  response = await owner.form(`/api/team/members/${membership.id}`, {});
  assertFormRedirect(response, "/dashboard?success=");
  const [remaining] = await sql<{ count: number }[]>`
    select count(*)::int as count from team_members where id = ${membership.id}
  `;
  assert.equal(remaining.count, 0);
  process.stdout.write("ok - user, team and owner authorization\n");
}

async function verifySessionsAndPassword(
  sql: postgres.Sql,
  browser: Browser,
  email: string,
) {
  const context = await contextForEmail(sql, email);
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

  const expired = new Browser(browser.baseUrl);
  await expired.setSession(
    await createSessionToken(
      { userId: context.user_id, sessionVersion: context.session_version + 1 },
      signingKey,
      new Date(Date.now() - 1_000),
    ),
  );
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

async function verifyDatabaseOutage(userId: number, sessionVersion: number) {
  const unavailable = "postgresql://app:test@127.0.0.1:1/unavailable";
  const app = await startApp({ migrate: false, secureCookie: false, url: unavailable });
  try {
    const browser = new Browser(app.baseUrl);
    await browser.setSession(
      await createSessionToken({ userId, sessionVersion }, signingKey),
    );
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

async function cleanup(sql: postgres.Sql) {
  await sql`
    delete from teams where id in (
      select distinct tm.team_id from team_members tm
      join users u on u.id = tm.user_id
      where u.email like ${`${emailPrefix}%`}
    )
  `;
  await sql`delete from users where email like ${`${emailPrefix}%`}`;
}

async function main() {
  assert.ok(path.isAbsolute(root));
  assert.ok(
    suppliedBaseUrl || await import("node:fs").then((fs) => fs.existsSync(path.join(root, ".next", "BUILD_ID"))),
    "Run npm run build before the integration suite",
  );
  const sql = postgres(databaseUrl, { max: 2, connect_timeout: 10 });
  let app: RunningApp | undefined;
  try {
    await verifyMissingConfiguration();
    await verifyMigrationLifecycle(sql);
    if (!suppliedBaseUrl) await verifySecureCookieDefault();

    const mainUrl = suppliedBaseUrl || (app = await startApp({
      migrate: true,
      secureCookie: false,
    })).baseUrl;
    const browser = new Browser(mainUrl);
    const ownerEmail = `${emailPrefix}owner@example.test`;
    const secondEmail = `${emailPrefix}second@example.test`;
    const restart = async () => {
      if (suppliedBaseUrl) return;
      await stopApp(app);
      app = await startApp({
        migrate: true,
        secureCookie: false,
        port: Number(new URL(mainUrl).port),
      });
    };

    await verifyAccountFlow(browser, ownerEmail, { restart });
    await verifyLongEmailSignUp(sql, mainUrl);
    await verifyAuthorization(sql, browser, ownerEmail, secondEmail);
    await verifySessionsAndPassword(sql, browser, ownerEmail);
    await verifyActivityAndSignOut(browser);
    const context = await contextForEmail(sql, ownerEmail);

    if (!suppliedBaseUrl) {
      await stopApp(app);
      app = undefined;
      await verifyDatabaseOutage(context.user_id, context.session_version);
    }
  } finally {
    await stopApp(app);
    await cleanup(sql).catch(() => undefined);
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.stack || error.message : String(error)));
  process.exitCode = 1;
});
