// Checks the painted panel surfaces (scripts/lib/media-painted.mjs, art/painted/manifest.json): every build is
// reproducible, every surface is faint, varied, seamless and free of banding, and every source has a manifest entry.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tga } from "./lib/media-art.mjs";
import { PAINTED_MAX_ALPHA, alphaOf, boxDown, colourOf, greyOf, iconOf, manifest, paintedArt, paintedSurfaces, percentile, saturations, surfaceOf, withoutDrift, wrap } from "./lib/media-painted.mjs";
import { SURFACES, SURFACE_MAX_ALPHA } from "./lib/media-surfaces.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The surface entries of the manifest.
const surfaces = () => manifest().filter((e) => e.class === "surface");

// The colour entries of the manifest.
const colours = () => manifest().filter((e) => e.class === "colour");

// The icon entries of the manifest.
const icons = () => manifest().filter((e) => e.class === "icon");

// The Media folder each class of entry writes to.
const OUTPUT_FOLDER = { surface: "Textures", colour: "Art", icon: "Textures" };

// An image's alpha channel as whole bytes, with its side.
function alphaBytes(img) {
  const a = new Uint8Array(img.w * img.h);
  for (let i = 0; i < a.length; i++) a[i] = Math.round(img.px[i * 4 + 3] * 255);
  return { n: img.w, a };
}

// Every painted surface, by texture name, as alpha bytes.
const painted = () => Object.entries(paintedSurfaces()).map(([name, make]) => [name, alphaBytes(make())]);

// Every existing code-made surface, as alpha bytes.
const codeMade = () => Object.values(SURFACES).map((make) => alphaBytes(make()));

// The byte at position `c` along line `r` of a tile (a row when `alongRows`, else a column), wrapping.
const cellAt = ({ n, a }, r, c, alongRows) => (alongRows ? a[r * n + (c % n)] : a[(c % n) * n + r]);

// The normalised autocorrelation of one row (or column) of a tile at a lag, wrapping.
function lineCorrelation(tile, r, lag, alongRows) {
  const values = Array.from({ length: tile.n }, (_, c) => cellAt(tile, r, c, alongRows));
  const mean = values.reduce((s, v) => s + v, 0) / tile.n;
  const num = values.reduce((s, v, c) => s + (v - mean) * (cellAt(tile, r, c + lag, alongRows) - mean), 0);
  const den = values.reduce((s, v) => s + (v - mean) ** 2, 0);
  return den ? num / den : 0;
}

// The mean normalised autocorrelation of a tile along one axis at one lag, over its rows (or columns).
function autocorrelation(tile, lag, alongRows) {
  const lines = Array.from({ length: tile.n }, (_, r) => lineCorrelation(tile, r, lag, alongRows));
  return lines.reduce((s, v) => s + v, 0) / tile.n;
}

// The largest mean autocorrelation of a tile at lags 2 to 64 on either axis.
function banding(tile) {
  const lags = Array.from({ length: 63 }, (_, i) => i + 2);
  return Math.max(...lags.flatMap((lag) => [autocorrelation(tile, lag, true), autocorrelation(tile, lag, false)]));
}

// The mean variance of 16 x 16 windows (every 8 texels) whose centre `inZone` accepts.
function windowVariance({ n, a }, inZone) {
  const vars = [];
  for (let y = 0; y + 16 <= n; y += 8) {
    for (let x = 0; x + 16 <= n; x += 8) {
      if (!inZone(x + 8, y + 8, n)) continue;
      const cells = Array.from({ length: 256 }, (_, i) => a[(y + Math.floor(i / 16)) * n + x + (i % 16)]);
      const mean = cells.reduce((s, v) => s + v, 0) / 256;
      vars.push(cells.reduce((s, v) => s + (v - mean) ** 2, 0) / 256);
    }
  }
  return vars.reduce((s, v) => s + v, 0) / vars.length;
}

// The mean absolute difference between two lines of a tile, `line(i)` and `other(i)` for i across it.
function lineGap({ n, a }, line, other) {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[line(i, n)] - a[other(i, n)]);
  return sum / n;
}

// The mean gap between neighbouring rows (and, for columns, neighbouring columns) of a tile.
function neighbourGap(tile, rows) {
  const { n } = tile;
  // The index of position k along line i.
  const at = (i, k) => (rows ? i * n + k : k * n + i);
  const gaps = Array.from({ length: n - 1 }, (_, i) => lineGap(tile, (k) => at(i, k), (k) => at(i + 1, k)));
  return gaps.reduce((s, v) => s + v, 0) / gaps.length;
}

// Builds each painted file twice and compares the written bytes.
function buildsTwiceTheSame() {
  for (const entry of surfaces()) expect(tga(surfaceOf(entry)).equals(tga(surfaceOf(entry))), entry.id).toBe(true);
}

// Every painted surface keeps its written alpha within 0..PAINTED_MAX_ALPHA, is white throughout and uses at least
// 8 of the 13 levels.
function facesAreFaintAndVaried() {
  expect(PAINTED_MAX_ALPHA, "the ceiling is the shared one, 12/255").toBe(SURFACE_MAX_ALPHA);
  for (const [name, make] of Object.entries(paintedSurfaces())) {
    const img = make(), levels = new Set();
    for (let i = 0; i < img.w * img.h; i++) levels.add(Math.round(img.px[i * 4 + 3] * 255));
    expect([name, Math.max(...levels) <= 12, levels.size >= 8], name).toEqual([name, true, true]);
    expect(img.px.filter((v, i) => i % 4 < 3).every((v) => v === 1), `${name} is white throughout`).toBe(true);
  }
}

// Each surface's pattern is as strong inside the wrap's blended zone as outside it (within 15 %).
function varianceHoldsAcrossTheWrap() {
  // Whether a window centre sits in the blended zone (a quarter of the tile in from an edge, and a window's half).
  const edge = (x, y, n) => Math.min(x, y, n - x, n - y) < n / 4 + 8;
  // Whether it sits in the unblended core.
  const core = (x, y, n) => !edge(x, y, n);
  for (const [name, tile] of painted()) {
    const ratio = windowVariance(tile, edge) / windowVariance(tile, core);
    expect([name, ratio > 0.85 && ratio < 1.15], `${name}: edge over core ${ratio.toFixed(3)}`).toEqual([name, true]);
  }
}

// A tile's last row against its first, and last column against its first, differ no more than neighbouring ones do
// (a quarter of leeway: one row against its next is itself a noisy figure).
function wrapsWithoutASeam() {
  for (const [name, tile] of painted()) {
    const { n } = tile;
    const rowSeam = lineGap(tile, (i) => i, (i) => (n - 1) * n + i), colSeam = lineGap(tile, (i) => i * n, (i) => i * n + n - 1);
    expect([name, rowSeam <= neighbourGap(tile, true) * 1.25, colSeam <= neighbourGap(tile, false) * 1.25], name).toEqual([name, true, true]);
  }
}

// No painted surface has more banding than the most banded code-made one plus 0.05 (plan 4.4).
function bandingStaysLow() {
  const limit = Math.max(...codeMade().map(banding)) + 0.05;
  for (const [name, tile] of painted()) expect(banding(tile), name).toBeLessThan(limit);
}

// The pictures under one class's folder of art/painted, as repo paths.
const sourcesOf = (kind) => fs.readdirSync(path.join(root, "art", "painted", kind)).map((f) => `art/painted/${kind}/${f}`);

// The fields every manifest entry carries (plan 6.1).
const FIELDS = ["id", "name", "class", "source", "output", "crop", "box", "convert", "model", "mode", "contrast", "preset", "prompt", "negative", "tiling", "private", "date"];

// Every picture under art/painted has a complete manifest entry, and every entry's source and output exist.
function manifestIsComplete() {
  const entries = manifest(), kinds = Object.keys(OUTPUT_FOLDER);
  expect(entries.map((e) => e.source).sort(), "a source with no entry, or an entry with no source").toEqual(kinds.flatMap(sourcesOf).sort());
  for (const entry of entries) {
    expect(FIELDS.filter((f) => entry[f] === undefined), `${entry.id} lacks fields`).toEqual([]);
    expect(entry.output, entry.id).toBe(`${OUTPUT_FOLDER[entry.class]}/${entry.name}.tga`);
    expect(fs.existsSync(path.join(root, "Media", entry.output)), `${entry.id}'s file is built`).toBe(true);
  }
  for (const entry of surfaces()) expect(entry.crop[2] / entry.box, `${entry.id} is a 256 tile`).toBe(256);
}

// The banner is 1024 x 512 (2:1, whole, no crop), opaque, and builds to the same bytes twice.
function bannerShape() {
  for (const entry of colours()) {
    const img = colourOf(entry);
    expect([img.w, img.h, entry.crop], entry.id).toEqual([1024, 512, [0, 0, 2048, 1024]]);
    expect(tga(img).equals(tga(colourOf(entry))), `${entry.id} builds the same twice`).toBe(true);
    expect(img.px.filter((v, i) => i % 4 === 3).every((v) => v === 1), `${entry.id} is opaque`).toBe(true);
  }
}

// Whether an image's outer ring of pixels is fully clear.
function edgeIsClear(img) {
  const ring = [];
  for (let i = 0; i < img.w; i++) ring.push([i, 0], [i, img.h - 1], [0, i], [img.w - 1, i]);
  return ring.every(([x, y]) => img.px[(y * img.w + x) * 4 + 3] === 0);
}

// The addons-list icon is 64 x 64 from a whole crop, clear along its edge, builds to the same bytes twice, and its
// clear texels are white (the alpha-weighted box keeps the cut-out's surround out of its colour).
function iconShape() {
  for (const entry of icons()) {
    const img = iconOf(entry);
    expect([img.w, img.h, entry.crop[2] / entry.box], entry.id).toEqual([64, 64, 64]);
    expect([edgeIsClear(img), tga(img).equals(tga(iconOf(entry)))], `${entry.id}: clear edge, same bytes`).toEqual([true, true]);
    expect(Array.from(img.px.slice(0, 4)), `${entry.id}: a clear corner is clear white`).toEqual([1, 1, 1, 0]);
  }
}

// The banner is calm (plan 4.5): median saturation at most 0.45 and the 90th percentile at most 0.7.
function bannerIsCalm() {
  for (const make of Object.values(paintedArt())) {
    const sat = saturations(make());
    expect([percentile({ v: sat }, 0.5) <= 0.45, percentile({ v: sat }, 0.9) <= 0.7]).toEqual([true, true]);
  }
}

// The stages on their own: a wrap of a flat grid is flat, the drift pass zeroes a flat grid, the box filter averages and the
// percentile reads the order.
function stagesBehave() {
  const flat = { n: 8, v: new Float64Array(64).fill(0.5) };
  expect([wrap(flat).v.every((v) => Math.abs(v - 0.5) < 1e-12), withoutDrift(flat).v.every((v) => Math.abs(v) < 1e-12)]).toEqual([true, true]);
  const ramp = { n: 4, v: Float64Array.from({ length: 16 }, (_, i) => i) };
  expect([boxDown(ramp, 2).v[0], percentile(ramp, 0.5), percentile(ramp, 1)]).toEqual([2.5, 7, 15]);
  const grey = greyOf({ w: 2, h: 2, px: Float64Array.from({ length: 16 }, (_, i) => (i % 4 === 3 ? 1 : [1, 0, 0][i % 4])) }, [0, 0, 2]);
  expect(grey.v[0], "Rec. 709 weights on the stored values").toBeCloseTo(0.2126, 12);
  expect(alphaOf({ n: 2, v: Float64Array.of(-1, 0, 0.5, 1) }).px[3], "the lowest values clamp to zero").toBe(0);
  expect(Array.from(saturations({ w: 3, h: 1, px: Float64Array.of(1, 0, 0, 1, 0.5, 0.5, 0.5, 1, 0, 0, 0, 1) })), "saturation: red full, grey none, black none").toEqual([1, 0, 0]);
}

describe(
  "painted panel surfaces",
  // The pipeline's output, then the manifest.
  () => {
    it("each file builds to the same bytes twice", buildsTwiceTheSame);
    it("every surface is faint, white and uses at least 8 alpha levels", facesAreFaintAndVaried);
    it("the pattern is as strong in the wrap's blended zone as outside it", varianceHoldsAcrossTheWrap);
    it("every surface wraps without a seam", wrapsWithoutASeam);
    it("no surface has more banding than the code-made ones", bandingStaysLow);
    it("every painted source has a complete manifest entry and a built file", manifestIsComplete);
    it("the banner is 1024 x 512, opaque and reproducible", bannerShape);
    it("the banner's saturation stays calm", bannerIsCalm);
    it("the addons-list icon is 64 x 64, clear at its edge and reproducible", iconShape);
    it("the pipeline's stages behave on small grids", stagesBehave);
  },
);
