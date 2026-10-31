// The AFK screen's painted scenes (Modules/AfkScreen.lua): Cliff's pictures, made with Leonardo.ai
// (art/CREDITS.md), cropped and sized to 1024 x 512 PNGs under art/scenes/. The build reads each
// PNG and writes it to Media/Art/ as the game's TGA. Unlike the rest of Media/ these are full colour:
// the theme never tints them. Reads 8-bit RGB or RGBA PNGs, not interlaced, with no dependencies.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// The scenes the build writes, by name (art/scenes/<name>.png -> Media/Art/<name>.tga).
export const SCENES = ["afk-camp", "afk-keep", "afk-canyon"];

// Bytes per pixel for the PNG colour types read here: RGB and RGBA.
const CHANNELS = { 2: 3, 6: 4 };

// A PNG's chunks as { type, data }.
function chunks(buf) {
  const out = [];
  for (let o = 8; o < buf.length; o += 12 + buf.readUInt32BE(o)) {
    out.push({ type: buf.toString("latin1", o + 4, o + 8), data: buf.subarray(o + 8, o + 8 + buf.readUInt32BE(o)) });
  }
  return out;
}

// The header's width, height and bytes per pixel; anything this reader can't decode throws.
function header(data) {
  const [depth, colour, interlace] = [data[8], data[9], data[12]];
  if (depth !== 8 || !CHANNELS[colour] || interlace !== 0) throw new Error("media-scenes: only 8-bit RGB or RGBA PNGs, not interlaced");
  return { w: data.readUInt32BE(0), h: data.readUInt32BE(4), bpp: CHANNELS[colour] };
}

// The Paeth predictor (PNG filter 4): whichever of left, up and up-left is nearest left + up - up-left.
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// What each PNG filter type adds back to a byte, from its left (a), up (b) and up-left (c) neighbours.
const UNFILTER = [() => 0, (a) => a, (a, b) => b, (a, b) => Math.floor((a + b) / 2), paeth];

// Undoes one row's filter in place; prev is the row above (zeros for the first).
function unfilterRow(row, prev, type, bpp) {
  for (let i = 0; i < row.length; i++) {
    const a = i >= bpp ? row[i - bpp] : 0, c = i >= bpp ? prev[i - bpp] : 0;
    row[i] = (row[i] + UNFILTER[type](a, prev[i], c)) & 0xff;
  }
}

// The decoded rows of pixel bytes, top first.
function rows(raw, { w, h, bpp }) {
  const stride = w * bpp, out = [];
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const row = Uint8Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    unfilterRow(row, prev, raw[y * (stride + 1)], bpp);
    out.push((prev = row));
  }
  return out;
}

// A PNG file as an image (scripts/lib/media-art.mjs: straight-alpha RGBA floats); opaque when it has no alpha.
export function readPng(file) {
  const parts = chunks(fs.readFileSync(file));
  const head = header(parts.find((c) => c.type === "IHDR").data);
  const raw = zlib.inflateSync(Buffer.concat(parts.filter((c) => c.type === "IDAT").map((c) => c.data)));
  const px = new Float64Array(head.w * head.h * 4).fill(1);
  rows(raw, head).forEach((row, y) => {
    for (let i = 0; i < row.length; i++) px[(y * head.w + Math.floor(i / head.bpp)) * 4 + (i % head.bpp)] = row[i] / 255;
  });
  return { w: head.w, h: head.h, px };
}

// One scene as an image, read from its PNG under art/scenes/.
export function scene(name) {
  return readPng(path.join(root, "art", "scenes", `${name}.png`));
}
