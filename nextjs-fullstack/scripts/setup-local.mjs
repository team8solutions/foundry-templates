import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

// Local development outside AIT Foundry: the settings the platform gives the app, pointing
// #sandbox/db at a local PostgreSQL. Inside AIT Foundry the platform sets these itself.
const destination = new URL("../.env.local", import.meta.url);
if (existsSync(destination)) {
  console.error(".env.local already exists; refusing to replace it.");
  process.exit(1);
}

const signingKey = randomBytes(48).toString("base64url");
writeFileSync(
  destination,
  [
    "SYMPOSIA_APP=nextjs-starter",
    "SYMPOSIA_ENV=dev",
    "SYMPOSIA_DATA_BACKEND=postgres",
    "SYMPOSIA_DATABASE_URL=postgresql://postgres:local-development-only@127.0.0.1:5432/postgres",
    `SESSION_SIGNING_KEY=${signingKey}`,
    "",
  ].join("\n"),
  { mode: 0o600 },
);
console.log("Created .env.local with disposable local development settings.");
