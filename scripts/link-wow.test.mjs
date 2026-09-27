// Tests for scripts/lib/link-wow.mjs and the link:wow command, against a
// temp "game folder" (TEST-ONLY paths). Every exported function and branch
// is exercised; the CLI runs as a child process with HOME pointed at the temp dir.
// The cases share that folder and run in this order.

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
const home = path.join(tmp, "home");
const wow = path.join(tmp, "TEST-ONLY Forever");
// A fixed clock so backup names are predictable.
const io = { fs, platform: process.platform, home, now: () => new Date("2026-10-27T15:30:00Z") };
const slot = path.join(L.addonsDir(wow), addon);

// Runs the CLI with HOME in the temp dir; returns { code, out }.
function cli(...args) {
  const env = { ...process.env, HOME: home, USERPROFILE: home, WOW_FOREVER_DIR: "" };
  try {
    return { code: 0, out: execFileSync("node", [path.join(repo, "scripts/link-wow.mjs"), ...args], { env, encoding: "utf8", stdio: "pipe" }) };
  } catch (err) {
    return { code: err.status, out: `${err.stdout}${err.stderr}` };
  }
}

// A missing or broken config file reads as {}.
function configMissing() {
  expect(L.readConfig(io)).toEqual({});
  fs.mkdirSync(path.dirname(L.configPath(io)), { recursive: true });
  fs.writeFileSync(L.configPath(io), "not json");
  expect(L.readConfig(io)).toEqual({});
}

// Saving the game folder keeps other keys.
function configSaving() {
  fs.writeFileSync(L.configPath(io), JSON.stringify({ other: 1 }));
  L.saveWowDir(io, wow);
  expect(L.readConfig(io)).toEqual({ other: 1, wowDir: wow });
}

// Flag, then env, then the saved folder.
function gameFolderResolution() {
  expect(L.resolveWowDir(io, "a", { WOW_FOREVER_DIR: "b" })).toBe("a");
  expect(L.resolveWowDir(io, null, { WOW_FOREVER_DIR: "b" })).toBe("b");
  expect(L.resolveWowDir(io, null, {})).toBe(wow);
  expect(L.resolveWowDir({ ...io, home: path.join(tmp, "nobody") }, null, {})).toBe(null);
}

// No folder, a folder with no AddOns, then a real one.
function gameFolderProblems() {
  expect(L.wowDirProblem(io, null)).toMatch(/--wow/);
  expect(L.wowDirProblem(io, wow)).toMatch(/No Interface\/AddOns/);
  fs.mkdirSync(L.addonsDir(wow), { recursive: true });
  expect(L.wowDirProblem(io, wow)).toBe(null);
}

// Case-insensitive on Windows only; trailing separators are ignored.
function pathComparison() {
  expect(L.samePath({ platform: "win32" }, "/A/b/", "/a/B")).toBe(true);
  expect(L.samePath({ platform: "linux" }, "/A/b/", "/a/B")).toBe(false);
  expect(L.samePath({ platform: "linux" }, "/a/b/", "/a/b")).toBe(true);
}

// Backup names use the fixed clock.
function backupNameDated() {
  expect(L.backupName("/x/ForeverUI", io.now())).toBe("/x/ForeverUI.backup-20261027-1530");
}

// An empty slot links, and linking again is a no-op.
function emptySlot() {
  expect(L.describe(L.status(io, wow, addon, repo), addon)).toBe(`${addon}: not installed`);
  expect(L.link(io, { wowDir: wow, addon, repo }).ok).toBe(true);
  expect(L.kindAt(io, slot)).toBe("link");
  expect(L.describe(L.status(io, wow, addon, repo), addon)).toBe(`${addon}: linked to this clone`);
  expect(L.link(io, { wowDir: wow, addon, repo }).message).toMatch(/already linked/);
}

// A link to another folder is replaced; a broken readlink is no target.
function linkElsewhere() {
  fs.unlinkSync(slot);
  fs.symlinkSync(tmp, slot, "dir");
  expect(L.describe(L.status(io, wow, addon, repo), addon)).toMatch(/another folder/);
  expect(L.link(io, { wowDir: wow, addon, repo }).ok).toBe(true);
  expect(L.linkTarget(io, path.join(tmp, "nothing"))).toBe(null);
}

// An installed copy is refused unless --replace moves it aside.
function installedCopy() {
  fs.unlinkSync(slot);
  fs.mkdirSync(slot);
  expect(L.describe(L.status(io, wow, addon, repo), addon)).toBe(`${addon}: installed copy (not linked)`);
  expect(L.link(io, { wowDir: wow, addon, repo }).ok).toBe(false);
  const r = L.link(io, { wowDir: wow, addon, repo, replace: true });
  expect(r.message).toMatch(/moved to .*backup-20261027-1530/);
  expect(L.kindAt(io, `${slot}.backup-20261027-1530`)).toBe("folder");
}

// A plain file in the slot is refused, even with --replace.
function fileInSlot() {
  fs.unlinkSync(slot);
  fs.writeFileSync(slot, "");
  expect(L.kindAt(io, slot)).toBe("file");
  expect(L.link(io, { wowDir: wow, addon, repo, replace: true }).ok).toBe(false);
  fs.unlinkSync(slot);
}

// Unlink keeps a real folder and removes a link.
function unlinkSlot() {
  expect(L.unlink(io, { wowDir: wow, addon, repo }).message).toMatch(/isn't installed/);
  fs.mkdirSync(slot);
  expect(L.unlink(io, { wowDir: wow, addon, repo }).ok).toBe(false);
  fs.rmdirSync(slot);
  L.link(io, { wowDir: wow, addon, repo });
  expect(L.unlink(io, { wowDir: wow, addon, repo }).ok).toBe(true);
  expect(L.kindAt(io, slot)).toBe("missing");
}

// The CLI needs a folder, then remembers it, links, reports and unlinks.
function cliFlow() {
  fs.rmSync(path.join(home, ".wow-forever"), { recursive: true, force: true });
  expect(cli().code).toBe(1);
  expect(cli("--wow", wow).code).toBe(0);
  expect(cli("--status").out).toMatch(/linked to this clone/);
  expect(cli("--unlink").code).toBe(0);
  expect(cli("--status").out).toMatch(/not installed/);
}

afterAll(
  // Removes the TEST-ONLY temp game folder.
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
