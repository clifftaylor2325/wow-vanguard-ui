import { defineConfig } from "vitest/config";

// JS tests and the Lua harness (scripts/**/*.test.mjs), run with vitest.
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/**/*.test.mjs"],
  },
});
