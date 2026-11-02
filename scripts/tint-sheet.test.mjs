// The tint sheet (leonardo-art-plan M0.2): its layout, its loudness numbers, and the theme colours it reads.

import { describe, expect, it } from "vitest";
import { TONES } from "./lib/media-art.mjs";
import { contrast, loudness, loudnessTable, overBlack, tintSheet } from "./lib/tint-sheet.mjs";
import { tonedBracket } from "./fixtures/toned-bracket.mjs";
import { themeRows } from "./tint-sheet.mjs";

// A theme row with one grey surface colour and a tint.
const row = (variant, preset, dim) => ({ variant, preset, panel: [0.1, 0.1, 0.1, 1], raised: [0.2, 0.2, 0.2, 1], inset: [0, 0, 0, 1], muted: [0.65, 0.65, 0.65, 1], accentDim: dim });

// Two variants by two presets give a sheet two cells high and six wide, each cell the surface with the tinted bracket on it.
function sheetLaidOut() {
  const rows = [row("a", "p", [1, 0, 0, 1]), row("a", "q", [0, 1, 0, 1]), row("b", "p", [1, 0, 0, 1]), row("b", "q", [0, 1, 0, 1])];
  const sheet = tintSheet(rows, [tonedBracket(16)]);
  expect([sheet.w, sheet.h]).toEqual([6 * 60, 2 * 60]);
  expect(Array.from(sheet.px.slice(0, 3)), "a cell's corner is its panel").toEqual([0.1, 0.1, 0.1]);
  // The sheet's RGB at (x, y).
  const at = (x, y) => Array.from(sheet.px.slice((y * sheet.w + x) * 4, (y * sheet.w + x) * 4 + 3));
  expect(at(6 + 3 * 3, 6 + 3 * 3), "the base tone tinted red over it").toEqual([TONES.base, 0, 0]);
}

// The lit facet's contrast on the panel and the gate (at most 4:1, darker than muted).
function loudnessGate() {
  const quiet = loudness(row("a", "p", [0.54, 0.42, 0.18, 1])), loud = loudness(row("a", "p", [1, 1, 1, 1]));
  expect([quiet.ratio < 4, quiet.belowMuted, quiet.pass, loud.pass]).toEqual([true, true, true, false]);
  expect(contrast(overBlack([1, 1, 1, 1]), [0, 0, 0]), "white on black").toBeCloseTo(21, 5);
  expect(loudnessTable([row("a", "p", [1, 1, 1, 1])])).toMatch(/\| a \| p \| `ffffff` \| .*\| no \| FAIL \|/);
}

// Every variant and preset is read from the addon, brass's dim on the default look being 8a6a2f.
function themeRead() {
  const rows = themeRows();
  expect(rows.length).toBe(40);
  const brass = loudness(rows.find((r) => r.variant === "default" && r.preset === "brass"));
  expect([brass.lit, rows.every((r) => loudness(r).pass)]).toEqual(["8a6a2f", true]);
}

describe(
  "tint sheet (leonardo-art-plan M0.2)",
  // The sheet's layout, the loudness gate, and the colours read from Core/Theme.lua.
  () => {
    it("the sheet is one row per variant and three surfaces per preset", sheetLaidOut);
    it("the lit facet's loudness is measured against the panel and muted", loudnessGate);
    it("every variant and preset reads from the addon, and the toned lit facet passes the gate in all of them", themeRead);
  },
);
