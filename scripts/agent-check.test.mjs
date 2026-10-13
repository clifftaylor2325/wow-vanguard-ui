// scripts/agent-check.mjs is the edit-time hook (.claude/settings.json): it
// must cover exactly the files the code-quality rules cover, find the same
// problems the scan finds, and stay silent (exit 0) for anything else.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { coveredPath, findings } from "./agent-check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "agent-check.mjs");

// Runs the hook as Claude Code does: the tool call's JSON on stdin.
function hook(input) {
  return spawnSync(process.execPath, [script], { cwd: root, input: JSON.stringify(input), encoding: "utf8" });
}

it("covers addon Lua and scripts, and nothing else", () => {
  expect(coveredPath("Core/Combat.lua")).toBe("Core/Combat.lua");
  expect(coveredPath(path.join(root, "Modules", "Bags.lua"))).toBe("Modules/Bags.lua");
  expect(coveredPath("scripts/lib/code-quality.mjs")).toBe("scripts/lib/code-quality.mjs");
  for (const other of ["README.md", "Libs/LibStub/LibStub.lua", "scripts/lib/wow-stub.lua", "/etc/passwd", null]) expect(coveredPath(other), other).toBeNull();
});

it("a clean file has no findings, and the hook says nothing", () => {
  expect(findings("Core/Combat.lua")).toEqual([]);
  const run = hook({ tool_name: "Edit", tool_input: { file_path: path.join(root, "Core/Combat.lua") } });
  expect([run.status, run.stderr]).toEqual([0, ""]);
});

it("a file that breaks the rules is reported on stderr with exit 2", () => {
  const file = path.join(root, "Modules", `ZZAgentCheck-${process.pid}.lua`);
  fs.writeFileSync(file, "local ADDON, ns = ...\nfunction ns.Undocumented() return 1 end\n");
  try {
    const run = hook({ tool_name: "Write", tool_input: { file_path: file } });
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/1 problem\(s\) in Modules\/ZZAgentCheck-\d+\.lua/);
    expect(run.stderr).toMatch(/has no comment above it/);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

it("a file outside the rules, bad stdin, or a missing file exits 0 quietly", () => {
  expect(hook({ tool_input: { file_path: "README.md" } }).status).toBe(0);
  expect(hook({ tool_input: { file_path: "Modules/DoesNotExist.lua" } }).status).toBe(0);
  const bad = spawnSync(process.execPath, [script], { cwd: root, input: "not json", encoding: "utf8" });
  expect([bad.status, bad.stderr]).toEqual([0, ""]);
});
