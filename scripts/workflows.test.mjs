// The weekly shuffled run (D-05) is wired through three workflow files:
// lua-suite.yml takes a shuffle input and picks and prints the seed,
// full-suite.yml turns it on for the schedule event only, and release.yml
// never shuffles. The files are read as text with small readers (no YAML
// parser is installed), the way scripts/pkgmeta.test.mjs reads .pkgmeta.
// The hosted run itself cannot be checked here.

import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { root } from "./check-zip.mjs";

// The text of one workflow file.
function workflow(name) {
  return fs.readFileSync(path.join(root, ".github", "workflows", name), "utf8");
}

// The lines after `start` that are indented deeper than `indent` (blank lines included).
function deeperLines(lines, start, indent) {
  const out = [];
  for (let i = start; i < lines.length; i += 1) {
    if (lines[i].trim() && lines[i].search(/\S/) <= indent) break;
    out.push(lines[i]);
  }
  return out;
}

// The text of every `run:` in a workflow: a block script or an inline command.
function runBlocks(text) {
  const lines = text.split("\n");
  const blocks = [];
  lines.forEach((line, i) => {
    const m = line.match(/^(\s*(?:-\s+)?)run:\s*(.*)$/);
    if (!m) return;
    blocks.push(/^[|>][+-]?$/.test(m[2]) ? deeperLines(lines, i + 1, m[1].length).join("\n") : m[2]);
  });
  return blocks;
}

// The text of the step with this name (from its `- name:` line to the next step).
function stepNamed(text, name) {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.trim() === `- name: ${name}`);
  if (at < 0) return "";
  return [lines[at], ...deeperLines(lines, at + 1, lines[at].indexOf("-"))].join("\n");
}

it("lua-suite takes a boolean shuffle input that defaults to off", () => {
  const input = workflow("lua-suite.yml").match(/^ {6}shuffle:\n((?: {8}.*\n)+)/m)?.[1] ?? "";
  expect(input).toMatch(/^ {8}type: boolean$/m);
  expect(input).toMatch(/^ {8}default: false$/m);
});

it("the seed step is conditional, exports the seed and prints both replay forms", () => {
  const step = stepNamed(workflow("lua-suite.yml"), "Pick and print the shuffle seed");
  expect(step).toMatch(/^\s+if: inputs\.shuffle$/m);
  expect(step).toMatch(/VG_SHUFFLE_SEED=.*>> "\$GITHUB_ENV"/);
  expect(step).toContain("Replay: VG_SHUFFLE_SEED=");
  expect(step).toContain("$env:VG_SHUFFLE_SEED=");
  expect(step).toContain('tee -a "$GITHUB_STEP_SUMMARY"');
});

it("the seed step comes before the coverage run", () => {
  const text = workflow("lua-suite.yml");
  const seed = text.indexOf("- name: Pick and print the shuffle seed");
  expect(seed).toBeGreaterThan(-1);
  expect(text.indexOf("- run: npm run coverage")).toBeGreaterThan(seed);
});

it("full-suite shuffles only for the schedule event", () => {
  expect(workflow("full-suite.yml")).toContain("shuffle: ${{ github.event_name == 'schedule' }}");
});

it("release never shuffles", () => {
  expect(workflow("release.yml")).not.toMatch(/shuffle/i);
});

it("no run script holds an input expression", () => {
  const all = ["lua-suite.yml", "full-suite.yml", "release.yml"].map((f) => runBlocks(workflow(f)));
  expect(all[0].some((b) => b.includes("GITHUB_ENV")), "the reader finds the seed script").toBe(true);
  for (const blocks of all) for (const b of blocks) expect(b).not.toContain("${{ inputs.");
});

it("lua-suite keeps read-only permissions", () => {
  expect(workflow("lua-suite.yml")).toMatch(/^permissions:\n {2}contents: read\n/m);
});
