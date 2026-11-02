#!/usr/bin/env node
// The tint sheet (docs/handoff/leonardo-art-plan.md M0.2): the shipped ornaments (media-ornament.mjs: the corner bracket, the rule motif and the ring, see SHEETS below), tinted
// `accentDim` by all five accent presets on `panel`, `raised` and `inset` of all eight variants, with
// the colours read from the addon's own Core/Theme.lua in the headless client. Nothing here ships.
//
//   node scripts/tint-sheet.mjs [out-dir]     writes tint-sheet.png, tint-sheet-rule.png, tint-sheet-ring.png and tint-sheet.md (default preview/tint-sheet/)
//
// Layout: one row per variant (Core/Theme.lua's VARIANT_ORDER, top to bottom); one group of three
// cells per accent preset (PRESET_ORDER, left to right), each group panel, raised, inset. A theme
// colour with alpha is drawn over black. Each cell shows the sheet's pieces side by side at 3 x (the bracket: the top-left 2 x and 1 x bakes, then the bottom-right 2 x bake).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAddon, root } from "./lib/lua-harness.mjs";
import { image, png } from "./lib/media-art.mjs";
import { loudnessTable, tintSheet } from "./lib/tint-sheet.mjs";
import { ornamentCorner, ornamentRule, roundRingOrnate } from "./lib/media-ornament.mjs";

// The theme colours the sheet needs, for every variant and preset, as the addon works them out.
const THEME_LUA = `local T, out = ns.Theme, {}
  for _, v in ipairs(T.VARIANT_ORDER) do for _, p in ipairs(T.PRESET_ORDER) do
    T.Settings().variant, T.Settings().accent = v, T.PRESETS[p]
    local row = { variant = v, preset = p }
    for _, name in ipairs({ "panel", "raised", "inset", "muted", "accentDim", "edge", "divider" }) do row[name] = { T.RGB(name) } end
    out[#out + 1] = row
  end end
  return out`;

// Every variant and preset's colours, read from a logged-in headless client.
export function themeRows() {
  const addon = createAddon({ savedVariables: "VanguardDB = { version = 2, profiles = {}, setupDone = true }\nVanguardCharDB = {}\n" });
  addon.login();
  return addon.eval(THEME_LUA);
}

// The w x h block of an image from (x, y): the part of a big bake worth showing at the sheet's scale.
export function crop(img, x, y, w, h) {
  const out = image(w, h);
  for (let row = 0; row < h; row++) out.px.set(img.px.subarray(((y + row) * img.w + x) * 4, ((y + row) * img.w + x + w) * 4), row * w * 4);
  return out;
}

// The corner bracket's bakes: the top-left 2 x and 1 x, then the bottom-right 2 x.
function bracketBakes() {
  return [ornamentCorner(32), ornamentCorner(16), ornamentCorner(32, true, true)];
}

// The rule motif's two bakes.
function ruleBakes() {
  return [ornamentRule(64), ornamentRule(32)];
}

// The ring's bakes, cropped to what shows at the sheet's scale: the 256 bake's top strip (studs and the north diamond)
// and left strip, and the 128 bake's top strip.
function ringBakes() {
  const big = roundRingOrnate(256);
  return [crop(big, 96, 0, 64, 16), crop(big, 0, 80, 16, 64), crop(roundRingOrnate(128), 48, 0, 32, 8)];
}

// The sheets by file name, and what each shows.
const SHEETS = { "tint-sheet.png": bracketBakes, "tint-sheet-rule.png": ruleBakes, "tint-sheet-ring.png": ringBakes };

// Writes the sheets and their loudness table to dir and returns their paths.
export function writeTintSheet(dir) {
  const rows = themeRows();
  fs.mkdirSync(dir, { recursive: true });
  const sheets = Object.entries(SHEETS).map(([name, bakes]) => {
    fs.writeFileSync(path.join(dir, name), png(tintSheet(rows, bakes())));
    return path.join(dir, name);
  });
  const table = path.join(dir, "tint-sheet.md");
  fs.writeFileSync(table, `# Tint sheet: lit facet loudness\n\n${loudnessTable(rows)}\n`);
  return [...sheets, table];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of writeTintSheet(path.resolve(process.argv[2] || path.join(root, "preview", "tint-sheet")))) console.log(`wrote ${file}`);
}
