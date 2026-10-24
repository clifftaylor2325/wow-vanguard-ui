// The panel textures (#647, General -> Look -> Panel texture): Vanguard's own surfaces, drawn over a floating
// window's fill by Core/PanelTexture.lua. Each is white in every pixel with only a little alpha (never above
// SURFACE_MAX_ALPHA), so it lightens any theme variant's panel by a few shades and text stays readable on it;
// the darker marks (stone seams, leather pits) are where it lightens least. Each tiles: its noise lattice wraps.

import { image, fill } from "./media-art.mjs";

// The most a panel texture lightens a panel (its highest alpha); scripts/media.test.mjs checks every surface.
export const SURFACE_MAX_ALPHA = 0.08;

// The tile size of every surface, in texels.
const SIZE = 256;

// A seeded value-noise field on a lattice of `cell`-texel squares that wraps at SIZE, smoothed between lattice
// points: f(x, y) in 0..1. The seed is a Park-Miller generator's start, so every build makes the same art.
function noise(cell, seed) {
  const n = Math.ceil(SIZE / cell);
  const grid = [];
  for (let i = 0, s = seed; i < n * n; i++) grid.push((s = (s * 16807) % 2147483647) / 2147483647);
  // The lattice value at (x, y), wrapped.
  const at = (x, y) => grid[(((y % n) + n) % n) * n + (((x % n) + n) % n)];
  // Smoothstep, so the field has no creases at the lattice lines.
  const ease = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const x0 = Math.floor(x / cell), y0 = Math.floor(y / cell), tx = ease(x / cell - x0), ty = ease(y / cell - y0);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    return top + (at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx - top) * ty;
  };
}

// Octaves of noise, one per cell size (largest first), each half the weight of the one before: f(x, y) in 0..1.
function octaves(cells, seed) {
  const fields = cells.map((cell, i) => noise(cell, seed + i * 97));
  const total = cells.reduce((sum, _, i) => sum + 1 / 2 ** i, 0);
  return (x, y) => fields.reduce((sum, f, i) => sum + f(x, y) / 2 ** i, 0) / total;
}

// A surface: white throughout, its alpha alpha(x, y) kept within 0..SURFACE_MAX_ALPHA.
function surface(alpha) {
  return fill(image(SIZE, SIZE), (x, y) => [1, 1, 1, Math.max(0, Math.min(SURFACE_MAX_ALPHA, alpha(x, y)))]);
}

// Fine grain: a texel-sized speckle over a soft blotch, so a window reads as matte rather than flat.
function grain() {
  const speck = noise(1, 7);
  const blotch = octaves([32, 8], 3);
  return surface((x, y) => 0.02 + 0.03 * speck(x, y) + 0.02 * blotch(x, y));
}

// Carved stone: broad mottling with a little grit, crossed by thin seams that stay dark.
function stone() {
  const mottle = octaves([64, 32, 16, 4], 11);
  const seams = octaves([128, 64], 23);
  const grit = noise(1, 31);
  return surface((x, y) => (Math.abs(seams(x, y) - 0.5) < 0.02 ? 0.004 : 0.012 + 0.055 * mottle(x, y) ** 1.5 + 0.012 * grit(x, y)));
}

// Dark leather: a close pebble grain whose low pits stay dark.
function leather() {
  const pebble = octaves([8, 4, 2], 41);
  return surface((x, y) => {
    const v = pebble(x, y);
    return v < 0.4 ? 0.006 : 0.018 + 0.06 * (v - 0.4);
  });
}

// Name (under Media/Textures) -> the surface it holds.
export const SURFACES = { PanelGrain: grain, PanelStone: stone, PanelLeather: leather };
