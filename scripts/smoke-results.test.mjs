// Tests for the in-game results ledger (docs/smoke-results.json, scripts/lib/smoke-results.mjs): the
// committed file is well formed and names real SMOKE-TEST.md steps, and a release's own steps are found.

import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { ledgerProblems, namedSteps, readLedger, smokeSteps, unrecordedSteps } from "./lib/smoke-results.mjs";
import { root } from "./check-zip.mjs";

const STEPS = smokeSteps(fs.readFileSync(path.join(root, "docs/SMOKE-TEST.md"), "utf8"));
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
