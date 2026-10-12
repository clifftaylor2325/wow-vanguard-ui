// Drawing for Vanguard's artwork, in plain math: the same source gives the
// same bytes on any machine, so CI can check the committed files are current.
// Images are straight-alpha RGBA floats; shapes are drawn with 4x4
// supersampling. Writers: 32-bit TGA for the game, PNG for the preview.
// No dependencies.

import zlib from "node:zlib";

const SS = 4;

// An RGBA image of w x h, all transparent white: a clear pixel keeps white RGB, so a
// tinted, filtered edge never blends toward black (no dark fringe).
export function image(w, h) {
  const px = new Float64Array(w * h * 4);
  for (let i = 0; i < px.length; i += 4) px.fill(1, i, i + 3);
  return { w, h, px };
}

// Sets every pixel from fn(x, y) -> [r, g, b, a] (0-1).
export function fill(img, fn) {
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) img.px.set(fn(x, y), (y * img.w + x) * 4);
  }
  return img;
}

// Paints color rgb at coverage a over pixel (x, y) (straight alpha "over"); a pixel
// that stays clear keeps its color, so clear pixels stay white.
function over(img, x, y, rgb, a) {
  const i = (y * img.w + x) * 4;
  const p = img.px;
  const out = a + p[i + 3] * (1 - a);
  if (!out) return;
  for (let c = 0; c < 3; c++) p[i + c] = (rgb[c] * a + p[i + c] * p[i + 3] * (1 - a)) / out;
  p[i + 3] = out;
}

// Shapes ------------------------------------------------------------------------------

// Distance from (x, y) to the segment [ax, ay, bx, by].
function segDist(x, y, [ax, ay, bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

// Whether (x, y) is inside a polygon (even-odd rule).
function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Signed distance to the rounded rectangle [x0, y0, x1, y1, r] (negative inside).
function boxDist(x, y, [x0, y0, x1, y1, r]) {
  const qx = Math.abs(x - (x0 + x1) / 2) - ((x1 - x0) / 2 - r);
  const qy = Math.abs(y - (y0 + y1) / 2) - ((y1 - y0) / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// Shape kind -> whether a point (in grid units) is inside it.
const INSIDE = {
  // One test per kind: segments by distance, polygons by crossings, boxes by signed distance.
  line: (x, y, s) => segDist(x, y, s.p) <= s.w / 2,
  poly: (x, y, s) => inPolygon(x, y, s.p),
  box: (x, y, s) => boxDist(x, y, s.p) <= 0,
  frame: (x, y, s) => Math.abs(boxDist(x, y, s.p)) <= s.w / 2,
  ring: (x, y, s) => Math.abs(Math.hypot(x - s.p[0], y - s.p[1]) - s.p[2]) <= s.w / 2,
};

// Shape builders, in grid units. line/path/frame/ring take a stroke width.
export const line = (x0, y0, x1, y1, w = 1.5) => ({ kind: "line", p: [x0, y0, x1, y1], w });
export const poly = (points) => ({ kind: "poly", p: points });
export const box = (x0, y0, x1, y1, r = 0) => ({ kind: "box", p: [x0, y0, x1, y1, r] });
export const frame = (x0, y0, x1, y1, w = 1.5, r = 0) => ({ kind: "frame", p: [x0, y0, x1, y1, r], w });
export const ring = (cx, cy, r, w = 1.5) => ({ kind: "ring", p: [cx, cy, r], w });

// A stroked polyline through points (closed back to the start if asked).
export function path(points, w = 1.5, closed = false) {
  const pts = closed ? [...points, points[0]] : points;
  return pts.slice(1).map((p, i) => line(pts[i][0], pts[i][1], p[0], p[1], w));
}

// Points along an elliptical arc (angles in degrees, y down).
export function arc(cx, cy, rx, ry, from, to, steps = 12) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    return [cx + rx * Math.cos(t), cy - ry * Math.sin(t)];
  });
}

// Share of a pixel's subsamples inside any shape.
function coverage(shapes, px, py, unit) {
  let hits = 0;
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      const x = (px + (sx + 0.5) / SS) / unit;
      const y = (py + (sy + 0.5) / SS) / unit;
      if (shapes.some((s) => INSIDE[s.kind](x, y, s))) hits++;
    }
  }
  return hits / (SS * SS);
}

// Draws shapes (laid out on a `grid`-unit square) over img in one color.
export function draw(img, grid, shapes, rgb = [1, 1, 1]) {
  const unit = img.w / grid;
  const flat = shapes.flat();
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const a = coverage(flat, x, y, unit);
      if (a > 0) over(img, x, y, rgb, a);
    }
  }
  return img;
}

// Writers -------------------------------------------------------------------------------

// A 0-1 channel as a byte.
const byte = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));

// A 32-bit uncompressed TGA (bottom-left origin, BGRA), the form WoW loads.
export function tga(img) {
  const head = Buffer.alloc(18);
  head[2] = 2;
  head.writeUInt16LE(img.w, 12);
  head.writeUInt16LE(img.h, 14);
  head[16] = 32;
  head[17] = 8;
  const body = Buffer.alloc(img.w * img.h * 4);
  for (let i = 0; i < img.w * img.h; i++) writeTgaPixel(body, img, i);
  return Buffer.concat([head, body]);
}

// Writes pixel i (top-down) into a bottom-up BGRA buffer.
function writeTgaPixel(body, img, i) {
  const x = i % img.w;
  const y = Math.floor(i / img.w);
  const o = ((img.h - 1 - y) * img.w + x) * 4;
  const p = img.px;
  [body[o], body[o + 1], body[o + 2], body[o + 3]] = [p[i * 4 + 2], p[i * 4 + 1], p[i * 4], p[i * 4 + 3]].map(byte);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

// CRC-32 of a buffer (PNG chunks).
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// One PNG chunk: length, type, data, CRC.
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

// PNG scanlines: each row as a 0 (no filter) byte then RGBA bytes.
function scanlines(img) {
  const raw = Buffer.alloc((img.w * 4 + 1) * img.h);
  for (let i = 0; i < img.w * img.h; i++) {
    const o = Math.floor(i / img.w) * (img.w * 4 + 1) + 1 + (i % img.w) * 4;
    for (let c = 0; c < 4; c++) raw[o + c] = byte(img.px[i * 4 + c]);
  }
  return raw;
}

// An RGBA PNG (for the preview renderer).
export function png(img) {
  const raw = scanlines(img);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0);
  ihdr.writeUInt32BE(img.h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
