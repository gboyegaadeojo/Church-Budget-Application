/**
 * Runs the app with no outside services, for end-to-end tests and trying things locally:
 * an in-process Postgres (PGlite) served on a local port, migrated and seeded with test
 * data, fake Planning Center and email sign-in, and the fake Planning Center directory.
 *
 *   node scripts/fake-server.mjs          # next start (after `npm run build`), port 3100
 *   node scripts/fake-server.mjs --dev    # next dev, port 3000
 *
 * Data lives in memory and is gone when the server stops.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { seedTestData } from "./seed-test-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dev = process.argv.includes("--dev");
const appPort = Number(process.env.PORT ?? (dev ? 3000 : 3100));
const dbPort = Number(process.env.FAKE_DB_PORT ?? 54329);

const db = await PGlite.create();
const server = new PGLiteSocketServer({ db, port: dbPort, host: "127.0.0.1", maxConnections: 20 });
await server.start();
const databaseUrl = `postgres://postgres:postgres@127.0.0.1:${dbPort}/postgres`;

const migrationsFolder = path.join(root, "drizzle");
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
await migrate(drizzle(client), { migrationsFolder });
await seedTestData(client);
await client.end();
console.log(`Fake database ready on port ${dbPort} (migrated and seeded).`);

// With --dev, a migration added while the server runs (a new step's table) is applied
// as soon as it lands, so pages that use it work without a restart.
if (dev) {
  let timer;
  watch(path.join(migrationsFolder, "meta", "_journal.json"), () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const c = new pg.Client({ connectionString: databaseUrl });
      try {
        await c.connect();
        await migrate(drizzle(c), { migrationsFolder });
        console.log("Fake database: new migrations applied.");
      } catch (error) {
        console.error(`Fake database: migrating failed (restart to start fresh): ${error.message}`);
      } finally {
        await c.end().catch(() => {});
      }
    }, 1000);
  });
}

const next = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/next/dist/bin/next"),
    dev ? "dev" : "start",
    "-p",
    String(appPort),
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      AUTH_URL: `http://localhost:${appPort}`,
      AUTH_SECRET: process.env.AUTH_SECRET ?? randomBytes(32).toString("base64"),
      AUTH_FAKE_PROVIDERS: "1",
      // PGlite is a single-connection database; one pooled connection avoids the
      // socket multiplexer mixing up statements from parallel requests.
      DATABASE_POOL_MAX: "1",
    },
  },
);

async function shutdown(code = 0) {
  next.kill();
  await server.stop().catch(() => {});
  await db.close().catch(() => {});
  process.exit(code);
}

next.on("exit", (code) => void shutdown(code ?? 0));
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
