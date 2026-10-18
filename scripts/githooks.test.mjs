// Tests for the local pre-push hook (#264): npm's prepare script points git at
// .githooks (scripts/install-hooks.mjs), and .githooks/pre-push runs the quick
// checks, naming each tool it skipped. The hook is run with stand-in tools on
// PATH (a scratch folder of tiny shell scripts), so no real check runs here;
// those cases need a POSIX shell and are skipped on Windows.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { afterAll, expect, it } from "vitest";
import { HOOKS_PATH, installHooks } from "./install-hooks.mjs";
import { root } from "./check-zip.mjs";

const HOOK = path.join(root, ".githooks", "pre-push");
const posix = process.platform !== "win32";
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "vg-githooks-"));
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

// A folder of stand-in tools: each name maps to the shell body it runs (it echoes its call to stderr first).
function fakeBin(name, tools) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(dir);
  for (const [tool, body] of Object.entries(tools)) {
    fs.writeFileSync(path.join(dir, tool), `#!/bin/sh\necho "ran ${tool} $*" >&2\n${body}\n`, { mode: 0o755 });
  }
  return dir;
}

// Runs the hook from the repo root with only `bin` on PATH: { status, out }.
function runHook(bin) {
  const r = spawnSync("/bin/sh", [HOOK], { cwd: root, encoding: "utf8", env: { PATH: bin } });
  return { status: r.status, out: r.stdout + r.stderr };
}

const PASS = "exit 0";
const LINUX = { npm: PASS, node: PASS, uname: "echo Linux" };

it("package.json's prepare script installs the hooks", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  expect(pkg.scripts.prepare).toBe("node scripts/install-hooks.mjs");
  expect(HOOKS_PATH).toBe(".githooks");
});

it("the hook is an executable sh script with LF endings that runs the quick checks", () => {
  const text = fs.readFileSync(HOOK, "utf8");
  expect(text.startsWith("#!/bin/sh\n")).toBe(true);
  expect(text).not.toContain("\r");
  for (const step of ["check npm run --silent test:quick", "check npm run --silent quality", "check node scripts/check-toc.mjs"]) expect(text).toContain(step);
  if (posix) expect(fs.statSync(HOOK).mode & 0o111, "executable").not.toBe(0);
  const staged = execFileSync("git", ["ls-files", "-s", ".githooks/pre-push"], { cwd: root, encoding: "utf8" });
  if (staged) expect(staged.startsWith("100755 "), "git keeps the executable bit").toBe(true);
});

it("the hook names each tool it skips, and the Windows skip of luac", () => {
  const text = fs.readFileSync(HOOK, "utf8");
  expect(text).toContain('skipped="$skipped luacheck (not installed)"');
  expect(text).toContain('skipped="$skipped luac5.1 (not installed)"');
  expect(text).toMatch(/MINGW\*\|MSYS\*\|CYGWIN\*\) skipped="\$skipped luac5\.1 \(Windows\)"/);
});

it.skipIf(!posix)("with every tool installed, the hook runs them all and passes", () => {
  const bin = fakeBin("all", { ...LINUX, luacheck: PASS, "luac5.1": PASS });
  const { status, out } = runHook(bin);
  expect(status).toBe(0);
  for (const call of ["ran npm run --silent test:quick", "ran npm run --silent quality", "ran node scripts/check-toc.mjs", "ran luacheck --no-color --quiet ."]) expect(out).toContain(call);
  expect(out).toContain("ran luac5.1 -p Core/Events.lua");
  expect(out).not.toContain("skipped");
});

it.skipIf(!posix)("without luacheck and luac, the hook skips them, says so and still passes", () => {
  const { status, out } = runHook(fakeBin("bare", LINUX));
  expect(status).toBe(0);
  expect(out).toContain("pre-push: skipped: luacheck (not installed) luac5.1 (not installed); CI runs them");
});

it.skipIf(!posix)("git's GIT_DIR and friends are cleared before any check runs (#319: a worktree push re-initialised the real repo)", () => {
  const bin = fakeBin("gitenv", { ...LINUX, npm: 'echo "GIT_DIR=[$GIT_DIR] COMMON=[$GIT_COMMON_DIR] WORK=[$GIT_WORK_TREE]" >&2' });
  const env = { PATH: bin, GIT_DIR: "/elsewhere/.git", GIT_COMMON_DIR: "/elsewhere/common", GIT_WORK_TREE: "/elsewhere" };
  const r = spawnSync("/bin/sh", [HOOK], { cwd: root, encoding: "utf8", env });
  expect(r.stderr).toContain("GIT_DIR=[] COMMON=[] WORK=[]");
  expect(r.stderr).not.toContain("/elsewhere");
});

it.skipIf(!posix)("on Windows (Git Bash) the syntax pass is skipped even with luac installed", () => {
  const { status, out } = runHook(fakeBin("windows", { ...LINUX, uname: "echo MINGW64_NT-10.0", luacheck: PASS, "luac5.1": PASS }));
  expect(status).toBe(0);
  expect(out).not.toContain("ran luac5.1");
  expect(out).toContain("pre-push: skipped: luac5.1 (Windows); CI runs them");
});

it.skipIf(!posix)("a failing check fails the push, after the other checks have run", () => {
  const { status, out } = runHook(fakeBin("red", { ...LINUX, npm: '[ "$3" = quality ] && exit 1; exit 0' }));
  expect(status).toBe(1);
  expect(out).toContain("ran node scripts/check-toc.mjs");
  expect(out).toContain("pre-push: a check failed; fix it, or push with --no-verify to skip the hook once");
});

it("the install sets core.hooksPath in a git checkout", () => {
  const dir = path.join(scratch, "repo");
  fs.mkdirSync(dir);
  execFileSync("git", ["init", "-q"], { cwd: dir });
  expect(installHooks(dir, {})).toMatch(/core\.hooksPath set to \.githooks/);
  expect(execFileSync("git", ["config", "--get", "core.hooksPath"], { cwd: dir, encoding: "utf8" }).trim()).toBe(".githooks");
});

it("the install leaves CI and a folder outside git alone, without failing", () => {
  const dir = path.join(scratch, "plain");
  fs.mkdirSync(dir);
  expect(installHooks(dir, { CI: "true" })).toBe("hooks: CI, left alone");
  expect(installHooks(dir, {})).toBe("hooks: not a git checkout, left alone");
});
