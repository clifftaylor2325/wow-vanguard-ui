#!/usr/bin/env node
// The tint sheet (docs/handoff/leonardo-art-plan.md M0.2): the shipped corner bracket (media-ornament.mjs: the top-left 2 x and 1 x bakes and the bottom-right 2 x bake), tinted
// `accentDim` by all five accent presets on `panel`, `raised` and `inset` of all eight variants, with
// the colours read from the addon's own Core/Theme.lua in the headless client. Nothing here ships.
//
//   node scripts/tint-sheet.mjs [out-dir]     writes tint-sheet.png and tint-sheet.md (default preview/tint-sheet/)
//
// Layout: one row per variant (Core/Theme.lua's VARIANT_ORDER, top to bottom); one group of three
// cells per accent preset (PRESET_ORDER, left to right), each group panel, raised, inset. A theme
// colour with alpha is drawn over black. Each cell shows the top-left 2 x bake, the 1 x bake, then the bottom-right 2 x bake, at 3 x.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAddon, root } from "./lib/lua-harness.mjs";
import { png } from "./lib/media-art.mjs";
import { loudnessTable, tintSheet } from "./lib/tint-sheet.mjs";
import { ornamentCorner } from "./lib/media-ornament.mjs";

// The theme colours the sheet needs, for every variant and preset, as the addon works them out.
const THEME_LUA = `local T, out = ns.Theme, {}
  for _, v in ipairs(T.VARIANT_ORDER) do for _, p in ipairs(T.PRESET_ORDER) do
    T.Settings().variant, T.Settings().accent = v, T.PRESETS[p]
    local row = { variant = v, preset = p }
    for _, name in ipairs({ "panel", "raised", "inset", "muted", "accentDim" }) do row[name] = { T.RGB(name) } end
    out[#out + 1] = row
  end end
  return out`;

// Every variant and preset's colours, read from a logged-in headless client.
export function themeRows() {
  const addon = createAddon({ savedVariables: "VanguardDB = { version = 2, profiles = {}, setupDone = true }\nVanguardCharDB = {}\n" });
  addon.login();
  return addon.eval(THEME_LUA);
}

// Writes the sheet and its loudness table to dir and returns their paths.
export function writeTintSheet(dir) {
  const rows = themeRows();
  fs.mkdirSync(dir, { recursive: true });
  const sheet = path.join(dir, "tint-sheet.png"), table = path.join(dir, "tint-sheet.md");
  fs.writeFileSync(sheet, png(tintSheet(rows, [ornamentCorner(32), ornamentCorner(16), ornamentCorner(32, true, true)])));
  fs.writeFileSync(table, `# Tint sheet: lit facet loudness\n\n${loudnessTable(rows)}\n`);
  return [sheet, table];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of writeTintSheet(path.resolve(process.argv[2] || path.join(root, "preview", "tint-sheet")))) console.log(`wrote ${file}`);
}
