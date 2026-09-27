#!/usr/bin/env node
// Link this clone into the game so edits show after /reload.
//
//   npm run link:wow -- --wow "<folder that has Interface/AddOns>"   first time
//   npm run link:wow                        later (the folder is remembered)
//   npm run link:wow -- --replace           move an installed copy aside first
//   npm run link:wow -- --status | --unlink
//
// The game folder comes from --wow, then WOW_FOREVER_DIR, then
// ~/.wow-forever/config.json. See scripts/lib/link-wow.mjs.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, link, resolveWowDir, saveWowDir, status, unlink, wowDirProblem } from "./lib/link-wow.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const addon = fs.readdirSync(repo).find((f) => f.endsWith(".toc")).replace(/\.toc$/, "");
// The real file system, platform, home folder and clock.
const io = { fs, platform: process.platform, home: os.homedir(), now: () => new Date() };

// The value after --name, or null.
function flag(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null;
}

// Prints the outcome and sets the exit code.
function report({ ok, message }) {
  console[ok ? "log" : "error"](message);
  process.exitCode = ok ? 0 : 1;
}

// Whether --name was passed.
function has(name) {
  return process.argv.includes(`--${name}`);
}

// Runs the requested action against a checked game folder.
function run(wowDir) {
  if (has("status")) return report({ ok: true, message: describe(status(io, wowDir, addon, repo), addon) });
  if (has("unlink")) return report(unlink(io, { wowDir, addon, repo }));
  return report(link(io, { wowDir, addon, repo, replace: has("replace") }));
}

const wowDir = resolveWowDir(io, flag("wow"), process.env);
const problem = wowDirProblem(io, wowDir);
if (problem) {
  report({ ok: false, message: problem });
} else {
  if (flag("wow")) saveWowDir(io, path.resolve(wowDir));
  run(path.resolve(wowDir));
}
