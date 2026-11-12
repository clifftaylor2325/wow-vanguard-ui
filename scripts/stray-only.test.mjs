// A stray .only, .skip or .todo leaves a local run green with cases not run, and no pull request runs the tests
// anywhere else (H44-25-R1). vitest.config.mjs refuses .only; this test fails on any of the three in a test file.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import config from "../vitest.config.mjs";

const scripts = path.dirname(fileURLToPath(import.meta.url));
// A test-runner call left switched off: it.only(, describe.skip(, test.todo( and the rest.
const STRAY = /\b(?:it|test|describe|suite)\s*\.\s*(?:only|skip|todo)\b|^\s*(?:xit|xdescribe|fit|fdescribe)\s*\(/;

// Every test file under scripts/ but this one (its own cases spell the patterns out), repo-relative.
function testFiles(dir = scripts) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : testFiles(full);
    return e.name.endsWith(".test.mjs") && e.name !== "stray-only.test.mjs" ? [path.relative(path.dirname(scripts), full)] : [];
  });
}

// The lines of a source text that switch a test off.
function strayLines(src) {
  return src.split("\n").flatMap((text, i) => (STRAY.test(text) && !/^\s*\/\//.test(text) ? [i + 1] : []));
}

it("Vitest refuses a .only, in and out of CI", () => {
  expect(config.test.allowOnly).toBe(false);
});

it("the pattern reads each way of switching a case off, and not skipIf or runIf", () => {
  for (const text of ["it.only('a', f)", "describe.skip('a', f)", "test.todo('a')", "xit('a', f)", "fit('a', f)", "it .skip('a', f)"]) expect(strayLines(text), text).toEqual([1]);
  for (const text of ["it.skipIf(win)('a', f)", "it.runIf(posix)('a', f)", "// it.only(", "const skipped = 1"]) expect(strayLines(text), text).toEqual([]);
});

it("no test file under scripts/ leaves a case switched off", () => {
  const strays = testFiles().flatMap((f) => strayLines(fs.readFileSync(path.join(path.dirname(scripts), f), "utf8")).map((n) => `${f}:${n}`));
  expect(strays).toEqual([]);
});
