#!/usr/bin/env node
// node scripts/check-baselines.mjs [--base <ref>]: fails when a baseline number rose, or a baseline list gained a line
// under an existing key, against the base (default origin/main; verify.yml passes HEAD^1, the pull request's base).
// A baseline only goes down (CLAUDE.md); lib/baselines.mjs has the rules. It fails when the base cannot be read.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { checkBaselines } from "./lib/baselines.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Runs the check and exits 1, with the reason, on a rise or an unreadable base.
function main() {
  const { values } = parseArgs({ args: process.argv.slice(2), options: { base: { type: "string", default: "origin/main" } } });
  try {
    const rises = checkBaselines(root, values.base);
    if (rises.length) (console.error(`A baseline went up against ${values.base}:\n  ${rises.join("\n  ")}\nFix the finding instead of raising the baseline.`), process.exit(1));
    console.log(`OK  no baseline rose against ${values.base}`);
  } catch (e) {
    (console.error(e.message), process.exit(1));
  }
}

main();
