import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { drizzle } from "drizzle-orm/pg-proxy";
import { migrate } from "drizzle-orm/pg-proxy/migrator";
import postgres from "postgres";
import { databaseUrlFrom } from "@/lib/env-core";

export const MIGRATION_LOCK_ID = 742103421;
const DEFAULT_TIMEOUT_MS = 30_000;

export async function runMigrations(timeoutMs = DEFAULT_TIMEOUT_MS) {
  const client = postgres(databaseUrlFrom(process.env), {
    max: 1,
    connect_timeout: 10,
    idle_timeout: 5,
  });
  const deadline = Date.now() + timeoutMs;
  let connection: postgres.ReservedSql | undefined;
  let locked = false;

  try {
    connection = await client.reserve();
    while (!locked && Date.now() < deadline) {
      const [row] = await connection<{ acquired: boolean }[]>`
        select pg_try_advisory_lock(${MIGRATION_LOCK_ID}) as acquired
      `;
      locked = row?.acquired === true;
      if (!locked) await delay(200);
    }
    if (!locked) throw new Error("Timed out waiting for the migration lock");

    const reserved = connection;
    const db = drizzle(async (query, params) => ({
      rows: await reserved.unsafe(query, params),
    }));
    await migrate(
      db,
      async (queries) => {
        await reserved`begin`;
        try {
          for (const query of queries) await reserved.unsafe(query);
          await reserved`commit`;
        } catch (error) {
          await reserved`rollback`;
          throw error;
        }
      },
      {
        migrationsFolder: path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          "../drizzle",
        ),
      },
    );
  } finally {
    if (locked && connection) {
      await connection`select pg_advisory_unlock(${MIGRATION_LOCK_ID})`.catch(() => undefined);
    }
    connection?.release();
    await client.end({ timeout: 5 }).catch(() => undefined);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations().catch(() => {
    console.error("Database migration failed.");
    process.exitCode = 1;
  });
}
