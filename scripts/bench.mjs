#!/usr/bin/env node
// npm run bench: CPU per event under a scripted 40-player raid, in the headless
// harness (issue #255). Every number it prints is a harness measurement until
// /vg perf in a raid confirms it in game.
//
// Method. The addon loads in the harness (scripts/lib/lua-harness.mjs) on a
// finished-setup account with every module on and logs in. A TEST-ONLY raid of
// 40 forms out of combat (you are raid1; raid2-3 tanks, raid4-11 healers), its
// 40 tiles are made as the client's group header would make them, and the pull
// starts (in combat). A seeded script (--seed; the same seed and --events give
// the same steps) then plays a raid's mix of steps (MIX in scripts/lib/bench.mjs):
// health and power changes, auras gained and lost, casts started and stopped,
// members leaving and rejoining, and one OnUpdate frame of 1/60 s for about every
// eight events. It ends with steps that put the raid back as it started, so each
// repetition starts alike. Each step is one call into Lua (no chunk compiled),
// timed with performance.now(): --warmup untimed repetitions, then --reps timed
// ones; per event the median time per step over the repetitions, its range and
// spread ((max - min) / median). Then one more repetition runs with the profiler's
// sampler (scripts/lib/lua-profile.mjs, 1,000 Lua VM instructions per sample),
// each event's samples kept apart: instructions per step for the addon's files
// and the harness's, and per module (addon file) the instructions run in its own
// functions. Instruction counts barely move between runs of one commit; wall time
// moves with the machine (and includes the harness's own world and widget code),
// so compare times from the same machine only.
//
// Results go to coverage/bench/<commit>.json (-dirty when the tree had changes).
//   --events <n>     steps per repetition before the closing steps (default 2000)
//   --reps <n>       timed repetitions (default 5)
//   --warmup <n>     untimed repetitions first (default 1)
//   --seed <n>       the script's seed (default 255)
//   --no-profile     skip the profiled repetition (no instruction columns)
//   --out <file>     write the JSON here instead
//   --compare <file> an earlier result: prints the change per event and module
//   --budget <pct>   with --compare, exit 1 when an event's median time per step
//                    grew by more than this percent (off by default: shared
//                    runners are noisy)
//   --summary <file> also append the tables as markdown (CI passes the job summary)

import fs from "node:fs";
import path from "node:path";
import { formatCompare, formatResult, overBudget, readOptions, resultFile, runBench, writeResult } from "./lib/bench.mjs";
import { root } from "./lib/lua-harness.mjs";

// Prints a message and exits with a status.
function stop(message, status) {
  console.error(message);
  process.exit(status);
}

// The options, or a stop with the reason and status 2.
function options(argv) {
  try {
    return readOptions(argv);
  } catch (err) {
    return stop(`npm run bench: ${err.message}`, 2);
  }
}

// An earlier result read from a file, or a stop when it is missing or not JSON.
function earlier(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return stop(`--compare: cannot read ${file}: ${err.message}`, 2);
  }
}

// Runs the bench, prints and saves the result, compares it and applies the budget.
function main(argv) {
  const opts = options(argv);
  const before = opts.compare ? earlier(opts.compare) : null;
  const result = runBench(opts, (step) => console.error(`bench: ${step}`));
  const file = opts.out ?? resultFile(result);
  writeResult(file, result);
  const text = [formatResult(result), ...(before ? ["", formatCompare(before, result, path.basename(opts.compare))] : [])].join("\n");
  console.log(`${text}\n\nSaved ${path.relative(root, path.resolve(file))}`);
  if (opts.summary) fs.appendFileSync(opts.summary, `${text}\n\n`);
  const over = before && opts.budget !== undefined ? overBudget(before, result, opts.budget) : [];
  if (over.length) stop(`Over the ${opts.budget}% budget: ${over.map((r) => `${r.event} ${r.timeChange}`).join(", ")}`, 1);
}

main(process.argv.slice(2));
