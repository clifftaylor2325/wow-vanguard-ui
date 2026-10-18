// No tracked file may hold the leftovers of an unresolved merge (a line starting with seven
// < or > characters), which a conflicted merge commit can slip in.

import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { root } from "./check-zip.mjs";

it("no tracked file starts a line with a merge-conflict marker", () => {
  const found = spawnSync("git", ["grep", "-nIE", "^(<{7}|>{7})( |$)", "--", ".", ":!scripts/conflict-markers.test.mjs"], { cwd: root, encoding: "utf8" });
  expect(found.stdout, "conflict markers found (git grep prints file:line)").toBe("");
});
