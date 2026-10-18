// Tests for scripts/release-local.mjs, the local release route: the pure pieces (arguments,
// version and changelog reading, the preflight, the step lists) and the packager download check.
// Nothing here uploads, tags or reaches a store.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { afterAll, expect, it } from "vitest";
import { PACKAGER, buildSteps, changelogHeading, changelogSection, fetchPackager, githubStep, hasWhatsNew, packagerStep, parseArgs, pkgmetaWithNotes, preflightProblems, root, tocFiles, tocVersion } from "./release-local.mjs";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "vg-release-local-"));
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

const READY = { tocVersion: "0.7.0", listings: true, dirty: false, branch: "main", head: "a".repeat(40), originMain: "a".repeat(40), tagCommit: "a".repeat(40), remoteTag: false, changelog: { version: "0.7.0", rest: "" }, whatsNew: true, tokens: { cf: true, wago: true } };

it("the repo's TOC version and newest changelog heading name the same version", () => {
  const toc = fs.readFileSync(path.join(root, "Vanguard.toc"), "utf8");
  const heading = changelogHeading(fs.readFileSync(path.join(root, "docs/CHANGELOG.md"), "utf8"));
  expect(heading.version).toBe(tocVersion(toc));
});

it("arguments: rehearsal by default, --publish takes the tag, unknown options are listed", () => {
  expect(parseArgs([])).toMatchObject({ publish: null, fast: false, listings: true, github: true, unknown: [] });
  expect(parseArgs(["--publish=v0.7.0", "--fast", "--no-github", "--no-listings"])).toMatchObject({ publish: "v0.7.0", fast: true, github: false, listings: false });
  expect(parseArgs(["--publish", "--bogus"]).unknown).toEqual(["--publish", "--bogus"]);
  expect(parseArgs(["--help"]).help).toBe(true);
});

it("reads the TOC version, the loaded files and the What's new entry", () => {
  expect(tocVersion("## Title: X\r\n## Version: 1.2.3\r\n")).toBe("1.2.3");
  expect(tocVersion("## Title: X\n")).toBeNull();
  expect(tocFiles("## A: b\n\nCore/A.lua\r\n# c\nCore/B.lua\n")).toEqual(["Core/A.lua", "Core/B.lua"]);
  expect(hasWhatsNew('  { version = "0.7.0", groups = {', "0.7.0")).toBe(true);
  expect(hasWhatsNew('  { version = "0.6.0", groups = {', "0.7.0")).toBe(false);
});

it("reads the newest changelog heading and its section", () => {
  const md = "# Changelog\n\nintro\n\n## 0.7.0\n\n- a\n- b\n\n## 0.6.0 (not released yet)\n\n- c\n";
  expect(changelogHeading(md)).toEqual({ version: "0.7.0", rest: "" });
  expect(changelogHeading("## 0.6.0 (not released yet)")).toEqual({ version: "0.6.0", rest: "(not released yet)" });
  expect(changelogHeading("no headings")).toBeNull();
  expect(changelogSection(md, "0.7.0")).toBe("- a\n- b");
  expect(changelogSection(md, "0.6.0")).toBe("- c");
  expect(changelogSection(md, "9.9.9")).toBe("");
});

it("a ready release has no problems", () => {
  expect(preflightProblems(READY)).toEqual([]);
});

it("every way a release can be unready is named", () => {
  const bad = { ...READY, dirty: true, branch: "work/x", head: "b".repeat(40), tagCommit: null, remoteTag: true, changelog: { version: "0.6.0", rest: "" }, whatsNew: false, tokens: { cf: true, wago: false } };
  const text = preflightProblems(bad).join("\n");
  for (const part of ["uncommitted", "not main", "not origin/main", "does not exist here", "already on origin", "CHANGELOG", "WhatsNewNotes", "WAGO_API_TOKEN"]) expect(text).toContain(part);
});

it("a tag on another commit, an unreleased changelog heading and a detached HEAD are caught", () => {
  expect(preflightProblems({ ...READY, tagCommit: "c".repeat(40) }).join()).toContain("not at HEAD");
  expect(preflightProblems({ ...READY, changelog: { version: "0.7.0", rest: "(not released yet)" } }).join()).toContain("CHANGELOG");
  expect(preflightProblems({ ...READY, branch: "" }).join()).toContain("detached HEAD");
  expect(preflightProblems({ ...READY, changelog: null }).join()).toContain("CHANGELOG");
});

it("tokens are only required when the listings are on", () => {
  expect(preflightProblems({ ...READY, listings: false, tokens: { cf: false, wago: false } })).toEqual([]);
});

it("the check and build steps run in order, coverage unless --fast, luac only when installed", () => {
  const ctx = { version: "0.7.0", head: "a", luac: true, tocFiles: ["Core/A.lua"] };
  // The step names for the options.
  const names = (opts, c = ctx) => buildSteps(opts, c).map((s) => s.name);
  expect(names({})).toEqual(["luac5.1 -p (Lua 5.1 syntax)", "npm run quality", "npm run test:quick", "npm run coverage", "build the zip", "check the zip"]);
  expect(names({ fast: true }, { ...ctx, luac: false })).toEqual(["npm run quality", "npm run test:quick", "build the zip", "check the zip"]);
  expect(buildSteps({}, ctx)[0].args).toEqual(["-p", "Core/A.lua"]);
  expect(buildSteps({}, ctx).at(-1).args).toContain(path.join("dist", "Vanguard-0.7.0.zip"));
});

it("the packager step uploads only on a publish, and never carries a token on its command line", () => {
  const ctx = { script: "dist/packager-release.sh" };
  const rehearsal = packagerStep({ publish: null }, ctx);
  const live = packagerStep({ publish: "v0.7.0" }, ctx);
  expect(rehearsal.args).toContain("-d");
  expect(live.args).not.toContain("-d");
  expect(JSON.stringify([rehearsal, live])).not.toMatch(/CF_API_KEY|WAGO_API_TOKEN|-k /);
});

it("the GitHub release names the tag, the zip, the commit and the notes file", () => {
  const step = githubStep({ version: "0.7.0", head: "abc" });
  expect(step.args.slice(0, 3)).toEqual(["release", "create", "v0.7.0"]);
  expect(step.args).toEqual(expect.arrayContaining([path.join("dist", "Vanguard-0.7.0.zip"), "--target", "abc", "--notes-file"]));
});

it("the packager gets the release notes as its changelog without touching .pkgmeta", () => {
  const text = pkgmetaWithNotes("package-as: Vanguard\n");
  expect(text).toContain("package-as: Vanguard");
  expect(text).toContain("manual-changelog:\n  filename: dist/release-notes.md\n  markup-type: markdown\n");
});

it("the packager download is run only when its SHA-256 matches the pin", async () => {
  const body = Buffer.from("echo hi\n");
  const reply = {
    // A fetch reply body.
    arrayBuffer: async () => body,
  };
  await expect(fetchPackager(async () => reply, scratch)).rejects.toThrow(/not running it/);
  const pinned = PACKAGER.sha256;
  PACKAGER.sha256 = crypto.createHash("sha256").update(body).digest("hex");
  try {
    const script = await fetchPackager(async () => reply, scratch);
    expect(fs.readFileSync(script)).toEqual(body);
  } finally {
    PACKAGER.sha256 = pinned;
  }
});

it("--help exits 0 and an unknown option exits 2, before anything is read or run", () => {
  // Runs the script with arguments.
  const run = (...args) => execFileSync(process.execPath, [path.join(root, "scripts/release-local.mjs"), ...args], { encoding: "utf8", stdio: "pipe" });
  expect(run("--help")).toMatch(/usage:/);
  expect(() => run("--bogus")).toThrow(/unknown option: --bogus/);
});
