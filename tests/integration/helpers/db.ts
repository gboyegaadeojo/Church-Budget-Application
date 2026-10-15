import { randomUUID } from "node:crypto";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import * as schema from "@/db/schema";
import type { Db } from "@/db/types";

const migrationsFolder = path.resolve(__dirname, "../../../drizzle");

export type TestDb = { db: Db; close: () => Promise<void> };

/**
 * A fresh, fully migrated database for one test file. With TEST_DATABASE_URL (CI) it
 * creates and later drops a throwaway database on that server; otherwise it runs
 * Postgres in-process with PGlite, so tests need no local install.
 */
export async function createTestDb(): Promise<TestDb> {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) {
    const client = new PGlite();
    const db = drizzlePglite(client, { schema });
    await migratePglite(db, { migrationsFolder });
    return { db, close: () => client.close() };
  }

  const name = `test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString(), max: 4 });
  const db = drizzlePg(pool, { schema });
  await migratePg(db, { migrationsFolder });

  return {
    db,
    close: async () => {
      await pool.end();
      const cleanup = new Client({ connectionString: adminUrl });
      await cleanup.connect();
      await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await cleanup.end();
    },
  };
}

/** Walks an error and its causes (drizzle wraps driver errors) into one searchable text. */
function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const e = current as { message?: string; constraint?: string; code?: string; cause?: unknown };
    parts.push(e.message ?? "", e.constraint ?? "", e.code ?? "");
    current = e.cause;
  }
  return parts.join(" | ");
}

/** Expects the database to reject the operation, mentioning `match` (constraint name or text). */
export async function expectRejected(operation: Promise<unknown>, match: string): Promise<void> {
  let error: unknown;
  try {
    await operation;
  } catch (e) {
    error = e;
  }
  if (!error) throw new Error(`Expected the database to reject the operation (${match})`);
  const text = describeError(error);
  if (!text.includes(match))
    throw new Error(`Expected an error mentioning "${match}", got: ${text}`);
}
