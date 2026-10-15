import { defineConfig } from "drizzle-kit";

/** Migrations are generated from src/db/schema.ts into drizzle/ and applied with `npm run db:migrate`. */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
});
