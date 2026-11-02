// The tint sheet (docs/handoff/leonardo-art-plan.md M0.2): toned art tinted `accentDim` by every accent
// preset on `panel`, `raised` and `inset` of every theme variant, as one image, with a table of how loud
// the lit facet is. Nothing here ships; scripts/tint-sheet.mjs writes the files.

import { image } from "./media-art.mjs";

// The surfaces each variant is shown on, left to right inside a preset's group.
export const SURFACES = ["panel", "raised", "inset"];
// How much each bake is scaled up (nearest neighbour), and the space round a cell.
const SCALE = 3;
const PAD = 6;

// A colour { r, g, b, a } from the theme drawn over black (the game world behind a window at night).
export const overBlack = ([r, g, b, a = 1]) => [r * a, g * a, b * a];

// Relative luminance of an sRGB colour (WCAG 2).
export function luminance(rgb) {
  const lin = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

// WCAG contrast ratio between two sRGB colours.
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The colour of texel (u, v) of art tinted by tint over the background bg.
function tinted(art, u, v, tint, bg) {
  const i = (v * art.w + u) * 4, a = art.px[i + 3];
  return [0, 1, 2].map((c) => bg[c] * (1 - a) + art.px[i + c] * tint[c] * a);
}

// Fills a w x h block of the sheet at (x0, y0) from fn(x, y) -> rgb.
function block(sheet, x0, y0, w, h, fn) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) sheet.px.set([...fn(x, y), 1], ((y0 + y) * sheet.w + x0 + x) * 4);
}

// One cell: the surface, with each bake drawn scaled on it, the bigger first.
function cell(sheet, x0, y0, { bakes, dim, bg, size }) {
  block(sheet, x0, y0, size.w, size.h, () => bg);
  let x = x0 + PAD;
  for (const art of bakes) {
    block(sheet, x, y0 + PAD, art.w * SCALE, art.h * SCALE, (px, py) => tinted(art, Math.floor(px / SCALE), Math.floor(py / SCALE), dim, bg));
    x += art.w * SCALE + PAD;
  }
}

// A cell's size for these bakes: side by side, with padding round each.
function cellSize(bakes) {
  const w = bakes.reduce((sum, art) => sum + art.w * SCALE + PAD, PAD);
  return { w, h: Math.max(...bakes.map((art) => art.h * SCALE)) + 2 * PAD };
}

// The sheet: one row per variant, one group of three cells (panel, raised, inset) per preset, in the
// order the rows give them. rows: [{ variant, preset, panel, raised, inset, accentDim, ... }] (theme colours).
export function tintSheet(rows, bakes) {
  const variants = [...new Set(rows.map((r) => r.variant))], presets = [...new Set(rows.map((r) => r.preset))];
  const size = cellSize(bakes), sheet = image(presets.length * SURFACES.length * size.w, variants.length * size.h);
  for (const row of rows) {
    SURFACES.forEach((surface, s) => {
      const x = (presets.indexOf(row.preset) * SURFACES.length + s) * size.w;
      cell(sheet, x, variants.indexOf(row.variant) * size.h, { bakes, dim: overBlack(row.accentDim), bg: overBlack(row[surface]), size });
    });
  }
  return sheet;
}

// Hex of an sRGB colour.
const hex = (rgb) => rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");

// How loud the lit facet (tone 1.0, so the tint itself) is on one row: its colour, its contrast on
// the panel, and whether it stays darker than `muted` (the §4.2 gate: at most 4:1 and below muted).
export function loudness(row) {
  const panel = overBlack(row.panel), litRgb = overBlack(row.accentDim);
  const ratio = contrast(litRgb, panel), belowMuted = luminance(litRgb) < luminance(overBlack(row.muted));
  return { variant: row.variant, preset: row.preset, lit: hex(litRgb), ratio, belowMuted, pass: ratio <= 4 && belowMuted };
}

// The loudness table as Markdown, one line per variant and preset.
export function loudnessTable(rows) {
  const lines = rows.map((row) => loudness(row)).map((l) => `| ${l.variant} | ${l.preset} | \`${l.lit}\` | ${l.ratio.toFixed(2)}:1 | ${l.belowMuted ? "yes" : "no"} | ${l.pass ? "pass" : "FAIL"} |`);
  return ["| Variant | Accent | Lit facet | On panel | Darker than muted | Gate |", "|---|---|---|---|---|---|", ...lines].join("\n");
}
