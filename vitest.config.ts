import { defineConfig } from "vitest/config";

// Node pool: runs tests that use node:child_process, @aws-sdk, or plain node APIs.
// Add new test files here as they are created (Tasks 3–8).
export default defineConfig({
  test: {
    name: "node",
    include: [
      "tests/object-key.test.ts",
      "tests/notifier.test.ts",
      "tests/dump.test.ts",
      "tests/upload.test.ts",
    ],
    environment: "node",
  },
});
