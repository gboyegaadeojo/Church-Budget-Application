/**
 * Brings a database up to date with the migrations in drizzle/ (docs/go-live-checklist.md).
 *
 *   DATABASE_URL=postgres://… node scripts/migrate.mjs
 *
 * Netlify (netlify.toml) and Vercel (vercel.json) run it on every production deploy,
 * after the build: a failed build never touches the database, and a failed migration
 * fails the deploy, so the previous version stays live. With --production-only it does
 * nothing on a Vercel preview, so only production changes the database. Migrations already applied are skipped, so running it
 * twice is harmless. DATABASE_URL_UNPOOLED is used when set (Neon's direct connection,
 * which it recommends for schema changes), otherwise DATABASE_URL.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (
  process.argv.includes("--production-only") &&
  process.env.VERCEL &&
  process.env.VERCEL_ENV !== "production"
) {
  console.log(
    `Not a production deploy (${process.env.VERCEL_ENV}); the database is left as it is.`,
  );
  process.exit(0);
}
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set, so the database can't be migrated.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await migrate(drizzle(client), { migrationsFolder: path.join(root, "drizzle") });
  const { rows } = await client.query(
    "select count(*)::int as n from drizzle.__drizzle_migrations",
  );
  console.log(`Database is up to date (${rows[0].n} migrations applied).`);
} catch (error) {
  console.error("Migration failed; the deploy stops and the previous version stays live.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}
