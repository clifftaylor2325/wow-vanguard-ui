// Tests for scripts/lib/link-wow.mjs and the link:wow command, against a
// temp "game folder" (TEST-ONLY paths). Every exported function and branch
// is exercised; the CLI runs as a child process with HOME pointed at the temp dir.
// Each case builds its own TEST-ONLY folder under one temp root, so the cases
// pass in any order (the weekly run shuffles them).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import * as L from "./lib/link-wow.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const addon = fs.readdirSync(repo).find((f) => f.endsWith(".toc")).replace(/\.toc$/, "");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "link-wow-test-"));
let cases = 0;

// A new TEST-ONLY folder for one case: its home, game folder, io (with a fixed
// clock so backup names are predictable) and addon slot.
function fresh() {
  cases += 1;
  const root = path.join(tmp, `case-${cases}`);
  const home = path.join(root, "home");
  const wow = path.join(root, "TEST-ONLY Forever");
  // The fixed clock.
  const io = { fs, platform: process.platform, home, now: () => new Date("2026-10-27T15:30:00Z") };
  return { root, home, wow, io, slot: path.join(L.addonsDir(wow), addon) };
}

// The game folder has its Interface/AddOns folder.
function withAddons(c) {
  fs.mkdirSync(L.addonsDir(c.wow), { recursive: true });
  return c;
}

// The shared config file exists and holds `data`.
function withConfig(c, data) {
  fs.mkdirSync(path.dirname(L.configPath(c.io)), { recursive: true });
  fs.writeFileSync(L.configPath(c.io), data);
  return c;
}

// The slot is a link to this clone.
function withLink(c) {
  expect(L.link(c.io, { wowDir: c.wow, addon, repo }).ok).toBe(true);
  return c;
}

// Runs the CLI with HOME in the case's temp dir; returns { code, out }.
function cli(home, ...args) {
  const env = { ...process.env, HOME: home, USERPROFILE: home, WOW_FOREVER_DIR: "" };
  try {
    return { code: 0, out: execFileSync("node", [path.join(repo, "scripts/link-wow.mjs"), ...args], { env, encoding: "utf8", stdio: "pipe" }) };
  } catch (err) {
    return { code: err.status, out: `${err.stdout}${err.stderr}` };
  }
}

// A missing or broken config file reads as {}.
function configMissing() {
  const c = fresh();
  expect(L.readConfig(c.io)).toEqual({});
  withConfig(c, "not json");
  expect(L.readConfig(c.io)).toEqual({});
}

// Saving the game folder keeps other keys.
function configSaving() {
  const c = withConfig(fresh(), JSON.stringify({ other: 1 }));
  L.saveWowDir(c.io, c.wow);
  expect(L.readConfig(c.io)).toEqual({ other: 1, wowDir: c.wow });
}

// Flag, then env, then the saved folder.
function gameFolderResolution() {
  const c = fresh();
  withConfig(c, JSON.stringify({ wowDir: c.wow }));
  expect(L.resolveWowDir(c.io, "a", { WOW_FOREVER_DIR: "b" })).toBe("a");
  expect(L.resolveWowDir(c.io, null, { WOW_FOREVER_DIR: "b" })).toBe("b");
  expect(L.resolveWowDir(c.io, null, {})).toBe(c.wow);
  expect(L.resolveWowDir({ ...c.io, home: path.join(c.root, "nobody") }, null, {})).toBe(null);
}

// No folder, a folder with no AddOns, then a real one.
function gameFolderProblems() {
  const c = fresh();
  expect(L.wowDirProblem(c.io, null)).toMatch(/--wow/);
  expect(L.wowDirProblem(c.io, c.wow)).toMatch(/No Interface\/AddOns/);
  withAddons(c);
  expect(L.wowDirProblem(c.io, c.wow)).toBe(null);
}

// Case-insensitive on Windows only; trailing separators are ignored.
function pathComparison() {
  expect(L.samePath({ platform: "win32" }, "/A/b/", "/a/B")).toBe(true);
  expect(L.samePath({ platform: "linux" }, "/A/b/", "/a/B")).toBe(false);
  expect(L.samePath({ platform: "linux" }, "/a/b/", "/a/b")).toBe(true);
}

// Backup names use the fixed clock.
function backupNameDated() {
  const c = fresh();
  expect(L.backupName("/x/Vanguard", c.io.now())).toBe("/x/Vanguard.backup-20261027-1530");
}

// An empty slot links, and linking again is a no-op.
function emptySlot() {
  const c = withAddons(fresh());
  const args = { wowDir: c.wow, addon, repo };
  expect(L.describe(L.status(c.io, c.wow, addon, repo), addon)).toBe(`${addon}: not installed`);
  expect(L.link(c.io, args).ok).toBe(true);
  expect(L.kindAt(c.io, c.slot)).toBe("link");
  expect(L.describe(L.status(c.io, c.wow, addon, repo), addon)).toBe(`${addon}: linked to this clone`);
  expect(L.link(c.io, args).message).toMatch(/already linked/);
}

// A link to another folder is replaced; a broken readlink is no target.
// Windows gets a junction, like link:wow makes (no admin or Developer Mode needed).
function linkElsewhere() {
  const c = withAddons(fresh());
  fs.symlinkSync(c.root, c.slot, process.platform === "win32" ? "junction" : "dir");
  expect(L.describe(L.status(c.io, c.wow, addon, repo), addon)).toMatch(/another folder/);
  expect(L.link(c.io, { wowDir: c.wow, addon, repo }).ok).toBe(true);
  expect(L.linkTarget(c.io, path.join(c.root, "nothing"))).toBe(null);
}

// An installed copy is refused unless --replace moves it aside.
function installedCopy() {
  const c = withAddons(fresh());
  fs.mkdirSync(c.slot);
  expect(L.describe(L.status(c.io, c.wow, addon, repo), addon)).toBe(`${addon}: installed copy (not linked)`);
  expect(L.link(c.io, { wowDir: c.wow, addon, repo }).ok).toBe(false);
  const r = L.link(c.io, { wowDir: c.wow, addon, repo, replace: true });
  expect(r.message).toMatch(/moved to .*backup-20261027-1530/);
  expect(L.kindAt(c.io, `${c.slot}.backup-20261027-1530`)).toBe("folder");
}

// A plain file in the slot is refused, even with --replace.
function fileInSlot() {
  const c = withAddons(fresh());
  fs.writeFileSync(c.slot, "");
  expect(L.kindAt(c.io, c.slot)).toBe("file");
  expect(L.link(c.io, { wowDir: c.wow, addon, repo, replace: true }).ok).toBe(false);
  fs.unlinkSync(c.slot);
}

// Unlink keeps a real folder and removes a link.
function unlinkSlot() {
  const c = withAddons(fresh());
  const args = { wowDir: c.wow, addon, repo };
  expect(L.unlink(c.io, args).message).toMatch(/isn't installed/);
  fs.mkdirSync(c.slot);
  expect(L.unlink(c.io, args).ok).toBe(false);
  fs.rmdirSync(c.slot);
  withLink(c);
  expect(L.unlink(c.io, args).ok).toBe(true);
  expect(L.kindAt(c.io, c.slot)).toBe("missing");
}

// The CLI needs a folder, then remembers it, links, reports and unlinks.
function cliFlow() {
  const c = withAddons(fresh());
  expect(cli(c.home).code).toBe(1);
  expect(cli(c.home, "--wow", c.wow).code).toBe(0);
  expect(cli(c.home, "--status").out).toMatch(/linked to this clone/);
  expect(cli(c.home, "--unlink").code).toBe(0);
  expect(cli(c.home, "--status").out).toMatch(/not installed/);
}

afterAll(
  // Removes the TEST-ONLY temp root with every case's folder.
  () => {
    fs.rmSync(tmp, { recursive: true, force: true });
  },
);

describe(
  "link:wow",
  // Config, paths and backup names, then the empty slot.
  () => {
    it("config: missing or broken file reads as {}", configMissing);
    it("config: saving the game folder keeps other keys", configSaving);
    it("game folder: flag, then env, then saved", gameFolderResolution);
    it("game folder problems: none given, no AddOns, fine", gameFolderProblems);
    it("paths: case-insensitive on Windows only, trailing separators ignored", pathComparison);
    it("backup name is dated", backupNameDated);
  },
);

describe(
  "link:wow",
  // Linking, replacing an installed copy, and the CLI.
  () => {
    it("empty slot: status, link, relink is a no-op", emptySlot);
    it("link elsewhere is replaced; broken readlink reads as no target", linkElsewhere);
    it("installed copy: refused without --replace, moved aside with it", installedCopy);
    it("a file in the slot is refused", fileInSlot);
    it("unlink: missing, real folder kept, link removed", unlinkSlot);
    it("CLI: needs a folder, remembers it, links, reports, unlinks", cliFlow);
  },
);
