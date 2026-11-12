// The text-fit baseline's write rule (scripts/lib/textfit-baseline.mjs): a write run may take lines out and start a
// new key, and refuses a new line under an existing one.

import { expect, it } from "vitest";
import { mergeWritten } from "./lib/textfit-baseline.mjs";

const BASE = { "b case": ["cut | A | one", "cut | A | two"], "a case": [] };

it("a write run takes out a fixed line and keeps every key sorted", () => {
  expect(mergeWritten(BASE, { "b case": ["cut | A | two"] })).toEqual({ "a case": [], "b case": ["cut | A | two"] });
  expect(Object.keys(mergeWritten(BASE, {}))).toEqual(["a case", "b case"]);
});

it("a write run may start a list under a new key, with lines", () => {
  expect(mergeWritten(BASE, { "c case @130": ["spill | B | x"] })["c case @130"]).toEqual(["spill | B | x"]);
});

it("a write run refuses a new line under an existing key, naming it", () => {
  expect(() => mergeWritten(BASE, { "a case": ["cut | C | new"] })).toThrow(/refuses 1 new overflow line\(s\).*a case: cut \| C \| new/s);
  expect(() => mergeWritten(BASE, { "b case": ["cut | A | one", "cut | A | three"] })).toThrow(/b case: cut \| A \| three/);
});
