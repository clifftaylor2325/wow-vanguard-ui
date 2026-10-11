#!/usr/bin/env node
// npm run profile -- login [--runs N]: logs the addon in several times in one
// process (after one unmeasured warm-up login) and prints where the Lua VM
// instructions go: self and inclusive by file, inclusive by function, self by
// line (scripts/lib/lua-profile.mjs). Writes coverage/profile/login.json.

import path from "node:path";
import { createAddon, root } from "./lib/lua-harness.mjs";
import { formatProfile, profileData, resetProfile, writeProfileJson } from "./lib/lua-profile.mjs";

const outDir = path.join(root, "coverage", "profile");

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
  const runs = Number(flagValue(argv, "--runs", "3")) || 3;
  const wallMs = profileLogins(runs);
  const info = { area: `login (${runs} warm logins)`, wallMs };
  console.log(formatProfile(profileData(), info));
  writeProfileJson(path.join(outDir, "login.json"), profileData(), { ...info, area: "login" });
}

// Runs the profiler for the area named on the command line.
function main(argv) {
  process.env.LUA_PROFILE = "1";
  if (areaOf(argv) !== "login") {
    console.error("usage: npm run profile -- login [--runs N]");
    process.exit(1);
  }
  profileLogin(argv);
}

main(process.argv.slice(2));
