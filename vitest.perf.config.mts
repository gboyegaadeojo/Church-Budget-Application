import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The performance check (tests/perf, docs/performance.md): the integration setup with
 * longer time limits, on TEST_DATABASE_URL or in-process PGlite. Not part of CI; run it
 * before a release with `npm run test:perf`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/perf/**/*.perf.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 900_000,
  },
});
