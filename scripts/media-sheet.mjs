#!/usr/bin/env node
// A contact sheet of Vanguard's artwork, for looking at new or changed media without the game, and
// a short report on each image. Nothing here ships; the sheet lands in preview/ (git-ignored).
//
//   node scripts/media-sheet.mjs CornerCutLine CornerCutFill   the named images (Textures/, Icons/ or Art/)
//   node scripts/media-sheet.mjs                                every texture under Textures/
//
// Each image is drawn twice, scaled up with no smoothing so every texel shows: over a checkerboard
// (where the alpha shows) and tinted brass over the slate panel colour (as the HUD draws it). The
// report gives each image's size, whether both sides are powers of two, its alpha range, and how
// many texels are partly covered (soft edges: none on a 1-pixel line drawn at its own size).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { image, png } from "./lib/media-art.mjs";
import { MEDIA } from "./lib/media-sources.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The preview's colours: the panel slate and the brass accent (Core/Theme.lua's defaults), and the checks.
const SLATE = [0x13 / 255, 0x16 / 255, 0x1c / 255];
const BRASS = [0xd9 / 255, 0xa4 / 255, 0x41 / 255];
const CHECKS = [[0.25, 0.25, 0.25], [0.4, 0.4, 0.4]];
// How much each image is scaled up, the gap between cells, and the tallest a cell may be.
const SCALE = 4;
const GAP = 8;

// The MEDIA keys named on the command line (by bare name), or every texture.
function pick(names) {
  const keys = Object.keys(MEDIA);
  if (!names.length) return keys.filter((k) => k.startsWith("Textures/"));
  return names.map((n) => keys.find((k) => k.endsWith(`/${n}.tga`)) || (console.error(`no media named ${n}`), process.exit(1)));
}

// One pixel of the sheet at (x, y) over its background, in straight colour.
function put(sheet, x, y, rgb) {
  sheet.px.set([...rgb, 1], (y * sheet.w + x) * 4);
}

// The colour of texel (u, v) of img drawn over a background colour, tinted by tint.
function over(img, u, v, bg, tint) {
  const i = (v * img.w + u) * 4;
  const a = img.px[i + 3];
  return [0, 1, 2].map((c) => bg[c] * (1 - a) + img.px[i + c] * tint[c] * a);
}

// Draws img scaled at (x0, y0): over checks, or (tinted) over the slate.
function blit(sheet, img, x0, y0, tinted) {
  for (let y = 0; y < img.h * SCALE; y++) {
    for (let x = 0; x < img.w * SCALE; x++) {
      const bg = tinted ? SLATE : CHECKS[(Math.floor(x / 4) + Math.floor(y / 4)) % 2];
      put(sheet, x0 + x, y0 + y, over(img, Math.floor(x / SCALE), Math.floor(y / SCALE), bg, tinted ? BRASS : [1, 1, 1]));
    }
  }
}

// Whether n is a power of two.
const pow2 = (n) => (n & (n - 1)) === 0;

// What the report says about one image.
function report(key, img) {
  let min = 1, max = 0, soft = 0;
  for (let i = 3; i < img.px.length; i += 4) {
    const a = img.px[i];
    min = Math.min(min, a); max = Math.max(max, a);
    if (a > 0.02 && a < 0.98) soft++;
  }
  const size = `${img.w}x${img.h}${pow2(img.w) && pow2(img.h) ? "" : " (not a power of two)"}`;
  return `${key.padEnd(34)} ${size.padEnd(28)} alpha ${min.toFixed(2)}-${max.toFixed(2)}  soft texels ${soft}`;
}

// A blank sheet in the slate, big enough for the images in one row, each cell two copies tall.
function blank(imgs) {
  const w = imgs.reduce((s, i) => s + i.w * SCALE + GAP, GAP);
  const sheet = image(w, Math.max(...imgs.map((i) => i.h * SCALE * 2 + GAP)) + GAP * 2);
  for (let i = 0; i < sheet.px.length; i += 4) sheet.px.set([...SLATE, 1], i);
  return sheet;
}

// Lays the images out in one row, each cell its checked copy over its tinted copy.
function sheetOf(keys) {
  const imgs = keys.map((k) => MEDIA[k]());
  const sheet = blank(imgs);
  let x = GAP;
  for (const img of imgs) {
    blit(sheet, img, x, GAP, false);
    blit(sheet, img, x, GAP * 2 + img.h * SCALE, true);
    x += img.w * SCALE + GAP;
  }
  return { sheet, imgs };
}

const keys = pick(process.argv.slice(2));
const { sheet, imgs } = sheetOf(keys);
const out = path.join(root, "preview", "media-sheet.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png(sheet));
keys.forEach((k, i) => console.log(report(k, imgs[i])));
console.log(`wrote ${path.relative(root, out)} (${sheet.w}x${sheet.h}): checked copies on top, brass on slate below`);
