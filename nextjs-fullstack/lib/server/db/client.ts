import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { databaseUrl } from "@/lib/server/env";
import * as schema from "./schema";

let connection: ReturnType<typeof postgres> | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function db() {
  if (!connection) {
    connection = postgres(databaseUrl(), {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    database = drizzle(connection, { schema });
  }
  return database!;
}
