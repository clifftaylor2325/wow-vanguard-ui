// Tests for the in-game results ledger (docs/smoke-results.json, scripts/lib/smoke-results.mjs): the
// committed file is well formed and names real SMOKE-TEST.md steps, and a release's own steps are found.

import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { coreSteps, isMajor, ledgerProblems, namedSteps, readLedger, smokeSteps, unpassedCore, unrecordedSteps } from "./lib/smoke-results.mjs";
import { root } from "./check-zip.mjs";

const SMOKE = fs.readFileSync(path.join(root, "docs/SMOKE-TEST.md"), "utf8");
const STEPS = smokeSteps(SMOKE);
const OK = { step: "33.390", build: "0.9.3", date: "2026-11-09", result: "pass", note: "TEST-ONLY seen" };

it("the committed ledger is well formed and every entry names a SMOKE-TEST.md step", () => {
  expect(ledgerProblems(readLedger(root), STEPS)).toEqual([]);
});

it("reads step ids from the headings, letters and three-part ids included", () => {
  expect(smokeSteps("### 33.390 A\n### 1.5a B\n### 14.8.7 C\n#### 9.9 not a step\n")).toEqual(new Set(["33.390", "1.5a", "14.8.7"]));
});

it("a malformed entry is named for each thing wrong with it", () => {
  const bad = [{ ...OK, step: "99.1", build: "next", date: "11/09/2026", result: "ok", note: " ", extra: 1 }, "x"];
  const text = ledgerProblems(bad, STEPS).join("\n");
  for (const part of ["unknown field extra", "step 99.1", "build next", "date 11/09/2026", "result ok", "note is empty", "entry 2 is not an object"]) expect(text).toContain(part);
  expect(ledgerProblems({}, STEPS)).toEqual(["the ledger is not a list"]);
  expect(ledgerProblems([OK], STEPS)).toEqual([]);
});

it("a changelog section's steps: ranges within one section and single ids, only real steps", () => {
  const steps = new Set(["33.344", "33.345", "33.346", "33.390", "34.1", "1.5a"]);
  expect(namedSteps("see SMOKE-TEST.md (steps 33.344 to 33.345), and 33.390, 1.5a, 7.7", steps)).toEqual(["1.5a", "33.344", "33.345", "33.390"]);
  expect(namedSteps("steps 33.344 to 34.1", steps)).toEqual(["33.344", "34.1"]);
  expect(namedSteps("a multiple saved in 0.9.0 to 0.9.2, and 33.344.", new Set(["9.0", "0.9", "9.1", "33.344"])), "version numbers are not steps").toEqual(["33.344"]);
});

it("a release's steps without an entry for that build are listed; another build's entry does not count", () => {
  const steps = new Set(["33.344", "33.345"]);
  const entries = [{ ...OK, step: "33.344", build: "0.9.4" }, { ...OK, step: "33.345", build: "0.9.3" }];
  expect(unrecordedSteps(entries, "steps 33.344 to 33.345", "0.9.4", steps)).toEqual(["33.345"]);
  expect(unrecordedSteps(entries, "no steps named", "0.9.4", steps)).toEqual([]);
});

it("the core path names 60 to 90 real steps, each once, each with exactly one heading in SMOKE-TEST.md", () => {
  const core = coreSteps(SMOKE);
  expect(core.length, "a core path the size of three sessions and a dungeon").toBeGreaterThanOrEqual(60);
  expect(core.length).toBeLessThanOrEqual(90);
  expect(core.filter((id) => !STEPS.has(id)), "every core id is a step").toEqual([]);
  expect(new Set(core).size, "no step listed twice").toBe(core.length);
  // How many headings carry the step id.
  const headings = (id) => SMOKE.split("\n").filter((l) => l.startsWith(`### ${id} `)).length;
  expect(core.filter((id) => headings(id) !== 1), "no core step shares its id with another heading").toEqual([]);
});

it("reads the core path from its own section only, in order", () => {
  const md = "## Run order\n- `9.9` not core\n## Core path (the 1.0 gate)\n\n**Session 1**\n\n- `1.3` Status\n- `14.8.3` Pane\n- 6.2 not a core line\n## Report block\n- `1.4` after\n";
  expect(coreSteps(md)).toEqual(["1.3", "14.8.3"]);
  expect(coreSteps("## Report block\n- `1.4` x\n"), "no section, no core path").toEqual([]);
});

it("only a major release is gated by the core path", () => {
  expect(["1.0.0", "2.0.0", "10.0.0"].map(isMajor)).toEqual([true, true, true]);
  expect(["0.9.4", "1.0.1", "1.1.0", "0.0.0", undefined].map(isMajor)).toEqual([false, false, false, false, false]);
});

it("a major release needs a pass for that build on every core step; fail, partial, skip or another build do not count", () => {
  const core = ["1.3", "1.4", "1.5", "2.1", "3.1"];
  const entries = [
    { ...OK, step: "1.3", build: "1.0.0", result: "pass" },
    { ...OK, step: "1.4", build: "1.0.0", result: "partial" },
    { ...OK, step: "1.5", build: "1.0.0", result: "skip" },
    { ...OK, step: "2.1", build: "0.9.9", result: "pass" },
    { ...OK, step: "3.1", build: "1.0.0", result: "fail" },
  ];
  expect(unpassedCore(entries, core, "1.0.0")).toEqual(["1.4", "1.5", "2.1", "3.1"]);
  expect(unpassedCore(entries, core, "1.0.1"), "a patch is not gated by the core path").toEqual([]);
});
