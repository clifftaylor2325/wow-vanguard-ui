#!/usr/bin/env node
// Tests for scripts/lib/link-wow.mjs and the link:wow command, against a
// temp "game folder" (TEST-ONLY paths). Every exported function and branch
// is exercised; the CLI runs as a child process with HOME pointed at the temp dir.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as L from "./lib/link-wow.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const addon = fs.readdirSync(repo).find((f) => f.endsWith(".toc")).replace(/\.toc$/, "");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "link-wow-test-"));
const home = path.join(tmp, "home");
const wow = path.join(tmp, "TEST-ONLY Forever");
// A fixed clock so backup names are predictable.
const io = { fs, platform: process.platform, home, now: () => new Date("2026-10-27T15:30:00Z") };
const results = [];

// Runs one named check and records pass or fail.
function check(name, fn) {
  try {
    fn();
    results.push(["OK  ", name]);
  } catch (err) {
    results.push(["FAIL", `${name}: ${err.message}`]);
  }
}

// Runs the CLI with HOME in the temp dir; returns { code, out }.
function cli(...args) {
  const env = { ...process.env, HOME: home, USERPROFILE: home, WOW_FOREVER_DIR: "" };
  try {
    return { code: 0, out: execFileSync("node", [path.join(repo, "scripts/link-wow.mjs"), ...args], { env, encoding: "utf8", stdio: "pipe" }) };
  } catch (err) {
    return { code: err.status, out: `${err.stdout}${err.stderr}` };
  }
}

const slot = path.join(L.addonsDir(wow), addon);

check("config: missing or broken file reads as {}", () => {
  assert.deepEqual(L.readConfig(io), {});
  fs.mkdirSync(path.dirname(L.configPath(io)), { recursive: true });
  fs.writeFileSync(L.configPath(io), "not json");
  assert.deepEqual(L.readConfig(io), {});
});

check("config: saving the game folder keeps other keys", () => {
  fs.writeFileSync(L.configPath(io), JSON.stringify({ other: 1 }));
  L.saveWowDir(io, wow);
  assert.deepEqual(L.readConfig(io), { other: 1, wowDir: wow });
});

check("game folder: flag, then env, then saved", () => {
  assert.equal(L.resolveWowDir(io, "a", { WOW_FOREVER_DIR: "b" }), "a");
  assert.equal(L.resolveWowDir(io, null, { WOW_FOREVER_DIR: "b" }), "b");
  assert.equal(L.resolveWowDir(io, null, {}), wow);
  assert.equal(L.resolveWowDir({ ...io, home: path.join(tmp, "nobody") }, null, {}), null);
});

check("game folder problems: none given, no AddOns, fine", () => {
  assert.match(L.wowDirProblem(io, null), /--wow/);
  assert.match(L.wowDirProblem(io, wow), /No Interface\/AddOns/);
  fs.mkdirSync(L.addonsDir(wow), { recursive: true });
  assert.equal(L.wowDirProblem(io, wow), null);
});

check("paths: case-insensitive on Windows only, trailing separators ignored", () => {
  assert.equal(L.samePath({ platform: "win32" }, "/A/b/", "/a/B"), true);
  assert.equal(L.samePath({ platform: "linux" }, "/A/b/", "/a/B"), false);
  assert.equal(L.samePath({ platform: "linux" }, "/a/b/", "/a/b"), true);
});

check("backup name is dated", () => {
  assert.equal(L.backupName("/x/ForeverUI", io.now()), "/x/ForeverUI.backup-20261027-1530");
});

check("empty slot: status, link, relink is a no-op", () => {
  assert.equal(L.describe(L.status(io, wow, addon, repo), addon), `${addon}: not installed`);
  assert.equal(L.link(io, { wowDir: wow, addon, repo }).ok, true);
  assert.equal(L.kindAt(io, slot), "link");
  assert.equal(L.describe(L.status(io, wow, addon, repo), addon), `${addon}: linked to this clone`);
  assert.match(L.link(io, { wowDir: wow, addon, repo }).message, /already linked/);
});

check("link elsewhere is replaced; broken readlink reads as no target", () => {
  fs.unlinkSync(slot);
  fs.symlinkSync(tmp, slot, "dir");
  assert.match(L.describe(L.status(io, wow, addon, repo), addon), /another folder/);
  assert.equal(L.link(io, { wowDir: wow, addon, repo }).ok, true);
  assert.equal(L.linkTarget(io, path.join(tmp, "nothing")), null);
});

check("installed copy: refused without --replace, moved aside with it", () => {
  fs.unlinkSync(slot);
  fs.mkdirSync(slot);
  assert.equal(L.describe(L.status(io, wow, addon, repo), addon), `${addon}: installed copy (not linked)`);
  assert.equal(L.link(io, { wowDir: wow, addon, repo }).ok, false);
  const r = L.link(io, { wowDir: wow, addon, repo, replace: true });
  assert.match(r.message, /moved to .*backup-20261027-1530/);
  assert.equal(L.kindAt(io, `${slot}.backup-20261027-1530`), "folder");
});

check("a file in the slot is refused", () => {
  fs.unlinkSync(slot);
  fs.writeFileSync(slot, "");
  assert.equal(L.kindAt(io, slot), "file");
  assert.equal(L.link(io, { wowDir: wow, addon, repo, replace: true }).ok, false);
  fs.unlinkSync(slot);
});

check("unlink: missing, real folder kept, link removed", () => {
  assert.match(L.unlink(io, { wowDir: wow, addon, repo }).message, /isn't installed/);
  fs.mkdirSync(slot);
  assert.equal(L.unlink(io, { wowDir: wow, addon, repo }).ok, false);
  fs.rmdirSync(slot);
  L.link(io, { wowDir: wow, addon, repo });
  assert.equal(L.unlink(io, { wowDir: wow, addon, repo }).ok, true);
  assert.equal(L.kindAt(io, slot), "missing");
});

check("CLI: needs a folder, remembers it, links, reports, unlinks", () => {
  fs.rmSync(path.join(home, ".wow-forever"), { recursive: true, force: true });
  assert.equal(cli().code, 1);
  assert.equal(cli("--wow", wow).code, 0);
  assert.match(cli("--status").out, /linked to this clone/);
  assert.equal(cli("--unlink").code, 0);
  assert.match(cli("--status").out, /not installed/);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log("link:wow");
for (const [mark, text] of results) console.log(`${mark}${text}`);
if (results.some(([mark]) => mark === "FAIL")) process.exit(1);
