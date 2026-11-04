// Painted art (docs/handoff/leonardo-art-plan.md, 3.7 and 6.1): Cliff's Leonardo.ai pictures. A surface is turned into a
// faint white tile that lightens a floating window's fill like the code-made ones in media-surfaces.mjs; a colour picture
// (the welcome banner) is only boxed down, its saturation measured by the tests, and written to Media/Art/ in full colour.
// art/painted/manifest.json lists each source PNG (8-bit RGB, no colour profile, converted by hand once, the command
// kept in the entry) and where it crops. The steps below use only + - * / and sqrt (exactly rounded in IEEE 754), so
// every machine writes the same bytes: grey, seamless wrap, lighting drift out, whole-number box downscale, alpha.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { image, fill } from "./media-art.mjs";
import { readPng } from "./media-scenes.mjs";
import { SURFACE_MAX_ALPHA } from "./media-surfaces.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// The most a painted surface lightens a panel: the same 12/255 ceiling as the code-made ones (plan 4.4).
export const PAINTED_MAX_ALPHA = SURFACE_MAX_ALPHA;

// The alpha a flat patch of the picture gets before its pattern is added (plan 3.7 step 6): 0.03, a little over 7/255.
const BASE_ALPHA = 0.03;

// The manifest entries (art/painted/manifest.json).
export function manifest() {
  return JSON.parse(fs.readFileSync(path.join(root, "art", "painted", "manifest.json"), "utf8"));
}

// A square grid of values as a Float64Array of n x n (row-major), `n` its side.
const grid = (n) => ({ n, v: new Float64Array(n * n) });

// The picture's box of the PNG as a grey grid: Rec. 709 luma on the sRGB values as stored (gamma-space luma, on
// purpose, so nobody "fixes" it later). `crop` is [x, y, size].
export function greyOf(img, [x0, y0, n]) {
  const out = grid(n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = ((y0 + y) * img.w + x0 + x) * 4;
      out.v[y * n + x] = 0.2126 * img.px[i] + 0.7152 * img.px[i + 1] + 0.0722 * img.px[i + 2];
    }
  }
  return out;
}

// The weight of the shifted copy at distance `d` texels from the nearest tile edge: 1 at the edge, 0 from a quarter of
// the tile in, smooth between (smoothstep), so the blend's own join lines (the shifted copy's mid-lines) get none.
const edgeWeight = (d, n) => {
  const t = Math.max(0, 1 - d / (n / 4));
  return t * t * (3 - 2 * t);
};

// The mean of a grid.
function mean({ v }) {
  return v.reduce((sum, x) => sum + x, 0) / v.length;
}

// One axis of the seamless wrap: blend the tile with itself shifted by half its size along that axis, weighted towards
// the shifted copy at the tile's edges there, then scale the blended zone's deviation from the mean so its variance
// matches the rest (two unrelated pictures mixed at weight w keep (1-w)^2 + w^2 of the variance).
function wrapAxis(g, alongX) {
  const { n } = g, out = grid(n), m = mean(g), half = n / 2;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const w = edgeWeight(Math.min(alongX ? x : y, n - 1 - (alongX ? x : y)), n);
      const shifted = alongX ? g.v[y * n + ((x + half) % n)] : g.v[((y + half) % n) * n + x];
      out.v[y * n + x] = m + ((1 - w) * g.v[y * n + x] + w * shifted - m) / Math.sqrt((1 - w) ** 2 + w ** 2);
    }
  }
  return out;
}

// Seamless wrap (plan 3.7 step 2), one axis after the other: the shifted copy's own join is a line down the middle, so
// each pass shifts along one axis only, where its weight there is zero. A single 2-D weight would let the join show
// along the rows where the other axis's weight is up (a plan correction).
export function wrap(g) {
  return wrapAxis(wrapAxis(g, true), false);
}

// The value at position `b` along line `a` of a grid (a row when `across`, else a column), wrapping at the edges.
function lineAt(g, a, b, across) {
  const k = ((b % g.n) + g.n) % g.n;
  return g.v[across ? a * g.n + k : k * g.n + a];
}

// One toroidal box blur pass along rows (`across` true) or columns, half-width `r`, with a running sum.
function boxPass(g, r, across) {
  const { n } = g, out = grid(n), size = 2 * r + 1;
  for (let a = 0; a < n; a++) {
    let sum = 0;
    for (let b = -r; b <= r; b++) sum += lineAt(g, a, b, across);
    for (let b = 0; b < n; b++) {
      out.v[across ? a * n + b : b * n + a] = sum / size;
      sum += lineAt(g, a, b + r + 1, across) - lineAt(g, a, b - r, across);
    }
  }
  return out;
}

// Removes lighting drift (plan 3.7 step 3): subtract a toroidal blur (three box passes in each direction, half-width
// an eighth of the tile) so big bright and dark patches go and the pattern stays. Run after the wrap, so the blur
// sees a tile with no edge.
export function withoutDrift(g) {
  let blur = g;
  for (let pass = 0; pass < 3; pass++) blur = boxPass(boxPass(blur, g.n / 8, true), g.n / 8, false);
  const out = grid(g.n);
  out.v.forEach((_, i) => (out.v[i] = g.v[i] - blur.v[i]));
  return out;
}

// Whole-number box downscale (plan 3.7 step 5): each output value is the mean of a k x k block.
export function boxDown(g, k) {
  const n = g.n / k, out = grid(n);
  for (let y = 0; y < g.n; y++) {
    for (let x = 0; x < g.n; x++) out.v[Math.floor(y / k) * n + Math.floor(x / k)] += g.v[y * g.n + x] / (k * k);
  }
  return out;
}

// The value below which `share` of the grid's values fall.
export function percentile({ v }, share) {
  return Float64Array.from(v).sort()[Math.floor((v.length - 1) * share)];
}

// Surface alpha (plan 3.7 step 6): BASE_ALPHA plus the pattern times a gain that puts its 99th percentile on the ceiling,
// clamped to 0..ceiling, then whole bytes (what the TGA stores), so every test reads the written values.
export function alphaOf(g) {
  const gain = (PAINTED_MAX_ALPHA - BASE_ALPHA) / percentile(g, 0.99);
  // One pattern value's alpha, clamped and rounded to a whole byte.
  const alpha = (x) => Math.round(Math.max(0, Math.min(PAINTED_MAX_ALPHA, BASE_ALPHA + gain * x)) * 255) / 255;
  return fill(image(g.n, g.n), (x, y) => [1, 1, 1, alpha(g.v[y * g.n + x])]);
}

// One surface entry as an image: crop, grey, drift out, wrap, drift out, box down, alpha. The drift comes out before
// the wrap too (a plan correction), so the two pictures it mixes have the same mean and the blended zone is no
// lighter or darker than the rest.
export function surfaceOf(entry) {
  const grey = greyOf(readPng(path.join(root, entry.source)), entry.crop);
  return alphaOf(boxDown(withoutDrift(wrap(withoutDrift(grey))), entry.box));
}

// Texture name (under Media/Textures) -> maker, for every surface in the manifest.
export function paintedSurfaces() {
  const entries = manifest().filter((e) => e.class === "surface");
  return Object.fromEntries(entries.map((e) => [e.name, () => surfaceOf(e)]));
}

// The colour entries' picture as an opaque image (plan 3.7 step 7): the box [x, y, w, h] of the PNG, averaged k x k
// into whole texels (in the stored sRGB values, like the grey of a surface).
export function colourOf(entry) {
  const src = readPng(path.join(root, entry.source)), [x0, y0, w, h] = entry.crop, k = entry.box;
  return fill(image(w / k, h / k), (x, y) => {
    const sum = [0, 0, 0];
    for (let j = 0; j < k; j++) {
      for (let i = 0; i < k; i++) sum.forEach((_, c, a) => (a[c] += src.px[((y0 + y * k + j) * src.w + x0 + x * k + i) * 4 + c] / (k * k)));
    }
    return [...sum, 1];
  });
}

// Texture name (under Media/Art) -> maker, for every colour picture in the manifest.
export function paintedArt() {
  const entries = manifest().filter((e) => e.class === "colour");
  return Object.fromEntries(entries.map((e) => [e.name, () => colourOf(e)]));
}

// The saturation of an opaque image's pixels, HSV style: (max - min) / max, 0 for black.
export function saturations(img) {
  const out = new Float64Array(img.w * img.h);
  out.forEach((_, i) => {
    const hi = Math.max(img.px[i * 4], img.px[i * 4 + 1], img.px[i * 4 + 2]), lo = Math.min(img.px[i * 4], img.px[i * 4 + 1], img.px[i * 4 + 2]);
    out[i] = hi ? (hi - lo) / hi : 0;
  });
  return out;
}
