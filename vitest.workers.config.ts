import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

// Workers pool: runs tests that exercise the Cloudflare Worker runtime (Task 9+).
export default defineWorkersConfig({
  test: {
    name: "workers",
    include: ["tests/worker.test.ts"],
    passWithNoTests: true,
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
  },
});
