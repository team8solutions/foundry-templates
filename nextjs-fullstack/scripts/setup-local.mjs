import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const destination = new URL("../.env.local", import.meta.url);
if (existsSync(destination)) {
  console.error(".env.local already exists; refusing to replace it.");
  process.exit(1);
}

const signingKey = randomBytes(48).toString("base64url");
writeFileSync(
  destination,
  [
    "DATABASE_URL=postgresql://app:local-development-only@127.0.0.1:5432/app",
    `SESSION_SIGNING_KEY=${signingKey}`,
    "SESSION_COOKIE_SECURE=false",
    "",
  ].join("\n"),
  { mode: 0o600 },
);
console.log("Created .env.local with disposable local development settings.");
