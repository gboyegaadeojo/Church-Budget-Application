import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Use the same DATABASE_URL as `next dev` when running migrations on this computer.
if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");

/** Migrations are generated from src/db/schema.ts into drizzle/ and applied with `npm run db:migrate`. */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
});
