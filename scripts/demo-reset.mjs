/**
 * Resets the hosted demo's database (docs/demo-site.md): wipes it, migrates it, seeds the
 * made-up people and data, and marks it as the demo's, which demo sign-in requires.
 *
 *   DEMO_DATABASE_URL=postgres://… node scripts/demo-reset.mjs
 *
 * Run nightly by .github/workflows/demo-reset.yml. It refuses any database that holds
 * data but isn't already marked as the demo, so pointing it at the real database by
 * mistake does nothing.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { seedTestData } from "./seed-test-data.mjs";

const MARKER = "demo_instance";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.DEMO_DATABASE_URL;
if (!url) {
  console.error("DEMO_DATABASE_URL is not set.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  // Safe only if the database is empty or already the demo's.
  const { rows: tables } = await client.query("select to_regclass('public.app_settings') as t");
  if (tables[0].t) {
    const { rows: marker } = await client.query("select value from app_settings where key = $1", [
      MARKER,
    ]);
    const { rows: users } = await client.query("select count(*)::int as n from users");
    if (marker[0]?.value !== "true" && users[0].n > 0) {
      console.error("Refusing: this database has data and isn't marked as the demo.");
      process.exit(1);
    }
  }

  await client.query("drop schema if exists public cascade");
  await client.query("drop schema if exists drizzle cascade");
  await client.query("create schema public");
  await migrate(drizzle(client), { migrationsFolder: path.join(root, "drizzle") });
  await seedTestData(client);
  await client.query(
    `insert into app_settings (key, value) values ($1, 'true')
     on conflict (key) do update set value = 'true'`,
    [MARKER],
  );
  console.log("Demo database reset: migrated, seeded and marked.");
} finally {
  await client.end();
}
