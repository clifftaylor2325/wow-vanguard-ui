#!/usr/bin/env node
// npm run profile -- login [--runs N]: logs the addon in several times in one
// process (after one unmeasured warm-up login) and prints where the Lua VM
// instructions go: self and inclusive by file, inclusive by function, self by
// line (scripts/lib/lua-profile.mjs). Writes coverage/profile/login.json.
//
// npm run profile -- <area>: runs scripts/tests/<area>.test.mjs under Vitest
// (one worker) with sampling on, merges what each test file wrote to
// coverage/profile/parts/, prints the same report and writes
// coverage/profile/<area>.json. The result of the tests is not changed: the
// exit status is Vitest's.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createAddon, root } from "./lib/lua-harness.mjs";
import { formatProfile, mergeProfiles, profileData, resetProfile, writeProfileJson } from "./lib/lua-profile.mjs";

const outDir = path.join(root, "coverage", "profile");
const partsDir = path.join(outDir, "parts");
const testsDir = path.join(root, "scripts", "tests");
const SUFFIX = ".test.mjs";

// The saved variables a set-up account has, so no first-run window opens. This
// is SETUP_DONE in scripts/tests/helpers.mjs (not imported: helpers pulls in
// the test framework).
const SETUP_DONE = "VanguardDB = { version = 2, profiles = {}, setupDone = true }\nVanguardCharDB = {}\n";

// The value after a flag such as --runs, or the fallback.
function flagValue(argv, flag, fallback) {
  const at = argv.indexOf(flag);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
}

// The first argument that is neither a flag nor a flag's value.
function areaOf(argv) {
  return argv.find((arg, i) => !arg.startsWith("--") && !argv[i - 1]?.startsWith("--"));
}

// Builds an addon with the set-up saved variables and logs it in.
function loginOnce() {
  createAddon({ savedVariables: SETUP_DONE }).login();
}

// Profiles `runs` warm logins and returns the wall time they took.
function profileLogins(runs) {
  loginOnce();
  resetProfile();
  const start = performance.now();
  for (let i = 0; i < runs; i++) loginOnce();
  return performance.now() - start;
}

// The login area: prints the report and writes coverage/profile/login.json.
function profileLogin(argv) {
  process.env.LUA_PROFILE = "1";
  const runs = Number(flagValue(argv, "--runs", "3")) || 3;
  const wallMs = profileLogins(runs);
  const info = { area: `login (${runs} warm logins)`, wallMs };
  console.log(formatProfile(profileData(), info));
  writeProfileJson(path.join(outDir, "login.json"), profileData(), { ...info, area: "login" });
}

// The test areas: scripts/tests/<area>.test.mjs without the suffix, sorted.
function testAreas() {
  return fs.readdirSync(testsDir).filter((f) => f.endsWith(SUFFIX)).map((f) => f.slice(0, -SUFFIX.length)).sort();
}

// Stops with the valid areas when the name is not a lowercase test area that exists.
function requireArea(area) {
  const valid = ["login", ...testAreas()];
  if (area && /^[a-z0-9-]+$/.test(area) && valid.includes(area)) return;
  console.error(`unknown area ${JSON.stringify(area ?? "")}. usage: npm run profile -- <area>
valid areas: ${valid.join(", ")}`);
  process.exit(1);
}

// Runs one test file under Vitest with sampling on; returns its exit status and wall time.
function runVitest(area) {
  fs.rmSync(partsDir, { recursive: true, force: true });
  fs.mkdirSync(partsDir, { recursive: true });
  const bin = path.join(root, "node_modules", "vitest", "vitest.mjs");
  const start = performance.now();
  const run = spawnSync(process.execPath, [bin, "run", `scripts/tests/${area}${SUFFIX}`, "--maxWorkers=1"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, LUA_PROFILE: partsDir },
  });
  return { status: run.status ?? 1, wallMs: performance.now() - start };
}

// The area mode: profiles a test file, prints the report when any sample was taken, exits with Vitest's status.
function profileArea(area) {
  const { status, wallMs } = runVitest(area);
  const parts = fs.readdirSync(partsDir).filter((f) => f.endsWith(".json")).map((f) => path.join(partsDir, f));
  if (parts.length === 0) console.error(`no samples were written for ${area}`);
  else reportArea(area, mergeProfiles(parts), wallMs);
  process.exit(status || (parts.length ? 0 : 1));
}

// Prints the merged report for an area and writes coverage/profile/<area>.json.
function reportArea(area, data, wallMs) {
  console.log(formatProfile(data, { area, wallMs }));
  writeProfileJson(path.join(outDir, `${area}.json`), data, { area, wallMs });
}

// Runs the profiler for the area named on the command line.
function main(argv) {
  const area = areaOf(argv);
  requireArea(area);
  if (area === "login") profileLogin(argv);
  else profileArea(area);
}

main(process.argv.slice(2));
