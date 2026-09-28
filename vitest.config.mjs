import { configDefaults, defineConfig } from "vitest/config";
import { luaSummaryReporter } from "./scripts/lib/lua-summary-reporter.mjs";

// JS tests and the Lua harness (scripts/**/*.test.mjs), run with vitest. Vitest's
// own reporters stay; the extra one ends a run with the Lua harness's
// per-category summary (scripts/lib/lua-summary-reporter.mjs).
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/**/*.test.mjs"],
    reporters: [...configDefaults.reporters, luaSummaryReporter()],
  },
});