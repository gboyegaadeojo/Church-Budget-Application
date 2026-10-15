import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type { Db, Tx } from "./types";

let pool: Pool | undefined;

/**
 * The app's database (Neon Postgres in production). One small pool per server
 * instance; Neon's pooled connection string handles the rest. Created on first use so
 * builds and pages that never touch the database need no DATABASE_URL.
 */
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  pool ??= new Pool({ connectionString: url, max: 5 });
  return drizzle(pool, { schema });
}
