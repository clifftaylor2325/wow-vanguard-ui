// Self-test for the error guard (scripts/lib/error-guard.mjs): judge, check,
// expectErrors and takeExpected, on hand-built entries (no Lua). The guard
// against real addons is covered in scripts/tests/errorrail.test.mjs.

import { describe, expect, it } from "vitest";
import { check, expectErrors, judge, takeExpected } from "./lib/error-guard.mjs";

// An addon whose caught list is `found` (what addon.eval hands back).
function addonOf(found) {
  // What addon.eval hands back, whatever the Lua asked.
  const answer = () => found;
  return { eval: answer };
}

// A TEST-ONLY caught entry.
const entry = (text, count = 1, stack = "") => ({ text, count, stack });

// Matchers expectErrors must refuse: each could cover more than one error.
const REFUSED = [
  /TEST-ONLY/, /^TEST-ONLY/, /TEST-ONLY$/, new RegExp(""), /^$/, /^.*$/, /^.+ boom$/, /^\d+$/,
  /^\w+ boom$/, /^[a-z]+ boom$/, /^(a|b) boom$/, /^a boom|b boom$/, /^a boom$/m, /^a boom$/g, /^a boom$/y,
  /^a boom\$/, "", undefined, 42,
];

// Matchers expectErrors must accept; the last is the aura-container notice (AURA_FALLBACK in tests/helpers.mjs).
const ACCEPTED = [
  "hook X: boom", /^TEST-ONLY: \d+$/, /^a\.b \(c\): eval:\d+: boom$/, /^a\\$/,
  /^aura containers \(using Vanguard's own icons\): wow-world\.lua:\d+: CreateFrame: unknown frame type AuraContainer$/,
];

// Nothing found and nothing expected agree.
function emptyAgrees() {
  expect(judge([], [])).toBe("");
}

// A stray entry is listed with its text, its count and the expectErrors hint.
function strayEntryListed() {
  const message = judge([entry("hook X: boom", 3)], []);
  expect(message).toContain("1 error(s) in ns.errors that this test did not expect");
  expect(message).toContain("hook X: boom   (x3)");
  expect(message).toMatch(/expectErrors\("hook X: boom"\)[^\n]*$/);
}

// A stack prints under the entry; an empty one prints nothing.
function stackPrintedWhenKept() {
  const withStack = judge([entry("a: b", 1, "Core/Events.lua:10: in function 'f'\nCore/Combat.lua:5: in main chunk")], []);
  expect(withStack).toContain("stack:");
  expect(withStack).toContain("Core/Combat.lua:5: in main chunk");
  expect(judge([entry("a: b", 1, "")], [])).not.toContain("stack:");
}

// A string matcher is the whole text; a RegExp has to match.
function matchersMatchWhole() {
  expect(judge([entry("hook X: boom")], ["hook X: boom"])).toBe("");
  expect(judge([entry("hook X: boom")], ["boom"])).toContain("expected but never seen");
  expect(judge([entry("hook X: boom")], ["hook X: boom!"])).toContain("did not expect");
  expect(judge([entry("hook X: boom 12")], [/^hook X: boom \d+$/])).toBe("");
}

// A matcher nothing matches is reported, and a second stray entry is named.
function unusedAndStray() {
  expect(judge([], ["hook X: boom"])).toContain('expected but never seen: "hook X: boom"');
  const message = judge([entry("a: one"), entry("b: two")], ["a: one"]);
  expect(message).toContain("b: two");
  expect(message).not.toContain("a: one   (x1)");
}

// expectErrors keeps its matchers until takeExpected empties the list.
function takeEmptiesList() {
  expectErrors("a: one", /^b: \d+$/);
  expect(takeExpected()).toEqual(["a: one", /^b: \d+$/]);
  expect(takeExpected()).toEqual([]);
}

// check throws judge's message, and nothing when the message is "".
function checkThrowsMessage() {
  const addon = addonOf([entry("hook X: boom", 2)]);
  expect(() => check([addon], [])).toThrow(/hook X: boom {3}\(x2\)/);
  expect(() => check([addon], ["hook X: boom"])).not.toThrow();
  expect(() => check([], [])).not.toThrow();
}

// check reads a caught list Lua handed back as an empty table.
function checkEmptyTable() {
  expect(() => check([addonOf({})], [])).not.toThrow();
}

// Every broad matcher is refused with a TypeError naming D-01.
function broadMatchersRefused() {
  for (const matcher of REFUSED) expect(() => expectErrors(matcher), String(matcher)).toThrow(/D-01/);
  expect(takeExpected()).toEqual([]);
}

// Every matcher that names one error is accepted.
function narrowMatchersAccepted() {
  for (const matcher of ACCEPTED) expect(() => expectErrors(matcher), String(matcher)).not.toThrow();
  expect(takeExpected()).toEqual(ACCEPTED);
}

// A call that mixes a good and a bad matcher keeps neither.
function mixedCallKeepsNone() {
  expect(() => expectErrors("hook X: boom", /TEST-ONLY/)).toThrow(TypeError);
  expect(takeExpected()).toEqual([]);
}

// Each case: its name and the function that runs it.
const CASES = [
  ["judge: nothing found, nothing expected", emptyAgrees],
  ["judge: a stray entry is listed with text, count and hint", strayEntryListed],
  ["judge: a stack prints only when the addon kept one", stackPrintedWhenKept],
  ["judge: a string is the whole text, a RegExp has to match", matchersMatchWhole],
  ["judge: an unused matcher and a second stray entry", unusedAndStray],
  ["expectErrors and takeExpected: the list empties when taken", takeEmptiesList],
  ["check: throws judge's message, else nothing", checkThrowsMessage],
  ["check: an empty Lua table is an empty list", checkEmptyTable],
  ["expectErrors: broad matchers are refused (D-01)", broadMatchersRefused],
  ["expectErrors: matchers that name one error are accepted", narrowMatchersAccepted],
  ["expectErrors: a mixed call keeps none", mixedCallKeepsNone],
];

describe("error guard", () => {
  for (const [name, run] of CASES) it(name, run);
});
