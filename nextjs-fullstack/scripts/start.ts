import { spawn } from "node:child_process";
import path from "node:path";
import { validateRuntimeEnvFrom } from "@/lib/env-core";
import { runMigrations } from "./migrate";

async function main() {
  try {
    validateRuntimeEnvFrom(process.env);
    if (!process.argv.includes("--skip-migrations")) await runMigrations();
  } catch {
    console.error("Application startup stopped because runtime configuration or migration failed.");
    process.exitCode = 1;
    return;
  }

  const nextBin = path.resolve("node_modules/next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "start"], {
    env: process.env,
    stdio: "inherit",
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => child.kill(signal));
  }
  child.once("error", () => {
    console.error("Next.js failed to start.");
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
}

void main();
