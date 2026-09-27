import { defineConfig } from "vitest/config";

// JS tests. Lua stays on scripts/verify-lua.mjs (still the attempt() runner).
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/**/*.test.mjs"],
  },
});
