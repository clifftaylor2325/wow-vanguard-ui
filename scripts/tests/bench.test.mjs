// bench: npm run bench (scripts/bench.mjs) end to end with tiny counts: the
// addon under a scripted 40-player raid with every module on, no errors caught,
// the result saved, compared with an earlier one and appended to a summary, and
// --budget failing the run on a slowdown. The pure logic is tested in
// scripts/bench.test.mjs.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { root } from "../lib/lua-harness.mjs";

// An earlier result so fast that any run is a slowdown past a 1% budget.
const EARLIER = { label: "harness measurement", commit: "TEST-ONLY-earlier", seed: 11, scriptEvents: 40, raid: 40,
  events: { UNIT_HEALTH: { count: 1, median: 0.001, addonInstr: 1 } }, modules: { "Modules/RaidFrames.lua": { self: 1, byEvent: {} } } };

// Runs the bench command with arguments, without the coverage, profiler or engine switches of the run around it (the
// bench runs on the default engine), plus `extra` in its environment.
function bench(args, extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.LUA_COVERAGE;
  delete env.LUA_PROFILE;
  if (!extra.VG_LUA_ENGINE) delete env.VG_LUA_ENGINE;
  return spawnSync(process.execPath, [path.join(root, "scripts", "bench.mjs"), ...args], { cwd: root, env, encoding: "utf8" });
}

it("npm run bench plays the raid without errors, saves, compares, appends the summary, and --budget fails a slowdown", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vg-bench-"));
  const [out, earlier, summary] = ["result.json", "earlier.json", "summary.md"].map((f) => path.join(dir, f));
  fs.writeFileSync(earlier, JSON.stringify(EARLIER));
  const run = bench(["--events", "40", "--reps", "2", "--warmup", "1", "--seed", "11", "--out", out, "--compare", earlier, "--budget", "1", "--summary", summary]);
  expect(run.status, run.stderr).toBe(1);
  expect(run.stderr).toMatch(/Over the 1% budget: UNIT_HEALTH \+\d/);
  const result = JSON.parse(fs.readFileSync(out, "utf8"));
  expect(result).toMatchObject({ label: "harness measurement", seed: 11, scriptEvents: 40, reps: 2, warmup: 1, raid: 40, inCombat: true });
  expect(result.commit).toMatch(/^([0-9a-f]{40}|unknown)$/);
  expect(Object.values(result.events).every((e) => e.reps.length === 2 && e.median > 0 && e.addonInstr >= 0)).toBe(true);
  expect(Object.keys(result.modules), "the raid's own module ran Lua").toContain("Modules/RaidFrames.lua");
  const text = fs.readFileSync(summary, "utf8");
  expect(text).toContain("### Vanguard raid bench (harness measurement)");
  expect(text).toContain("### Against earlier.json (commit TEST-ONLY-ea, no date)");
  expect(run.stdout).toContain(`Saved ${path.relative(root, out)}`);
});

it("npm run bench --instr-budget fails a step whose addon instructions pass their cap", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vg-bench-"));
  const [out, caps] = ["result.json", "caps.json"].map((f) => path.join(dir, f));
  fs.writeFileSync(caps, JSON.stringify({ OnUpdate: 0 }));
  const run = bench(["--events", "40", "--reps", "1", "--warmup", "0", "--seed", "11", "--out", out, "--instr-budget", caps]);
  expect(run.status, run.stderr).toBe(1);
  expect(run.stderr).toMatch(/Over the instruction budget: OnUpdate \d+ per step \(cap 0\)/);
  fs.writeFileSync(caps, "not json");
  expect(bench(["--events", "1", "--reps", "1", "--warmup", "0", "--out", out, "--instr-budget", caps]).status, "a caps file that isn't JSON stops the run").toBe(2);
});

it("npm run bench refuses the Lua 5.1 engine, whose instruction counts its caps were not set in", () => {
  const run = bench(["--events", "1", "--reps", "1", "--warmup", "0"], { VG_LUA_ENGINE: "wasm" });
  expect([run.status, run.stderr.trim()]).toEqual([2, "npm run bench: runs on the default engine only (its instruction counts, and the caps in scripts/bench-budget.json, are fengari's); unset VG_LUA_ENGINE"]);
});
