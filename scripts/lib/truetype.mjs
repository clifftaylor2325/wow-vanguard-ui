// Read a few TrueType tables. Used by the media checks to confirm the
// bundled fonts have tabular digits and the scripts the addon promises.

import fs from "node:fs";

// Table offsets of a TrueType font: tag -> offset.
function tables(buf) {
  const out = {};
  for (let i = 0; i < buf.readUInt16BE(4); i++) out[buf.toString("latin1", 12 + 16 * i, 16 + 16 * i)] = buf.readUInt32BE(20 + 16 * i);
  return out;
}

// Offset of the Windows Unicode (3, 1) format-4 cmap subtable.
function unicodeCmap(buf, cmap) {
  for (let i = 0; i < buf.readUInt16BE(cmap + 2); i++) {
    const rec = cmap + 4 + 8 * i;
    const sub = cmap + buf.readUInt32BE(rec + 4);
    if (buf.readUInt16BE(rec) === 3 && buf.readUInt16BE(rec + 2) === 1 && buf.readUInt16BE(sub) === 4) return sub;
  }
  throw new Error("no format-4 Unicode cmap");
}

// Glyph id for the k-th code of segment i (idDelta, or the idRangeOffset array).
function segmentGlyph(buf, sub, seg, i, k) {
  const delta = buf.readUInt16BE(sub + 16 + 2 * seg + 2 * i);
  const rangeAt = sub + 16 + 3 * seg + 2 * i;
  const range = buf.readUInt16BE(rangeAt);
  if (range === 0) return (buf.readUInt16BE(sub + 16 + seg + 2 * i) + k + delta) & 0xffff;
  const g = buf.readUInt16BE(rangeAt + range + 2 * k);
  return g === 0 ? 0 : (g + delta) & 0xffff;
}

// Glyph id for a code point in a format-4 subtable (0 when missing).
function glyphId(buf, sub, code) {
  const seg = buf.readUInt16BE(sub + 6);
  for (let i = 0; i < seg / 2; i++) {
    const end = buf.readUInt16BE(sub + 14 + 2 * i);
    const start = buf.readUInt16BE(sub + 16 + seg + 2 * i);
    if (code < start || code > end) continue;
    return segmentGlyph(buf, sub, seg, i, code - start);
  }
  return 0;
}

// Advance width of a glyph (hmtx, long metrics then the last one repeated).
function advance(buf, t, gid) {
  const long = buf.readUInt16BE(t.hhea + 34);
  return buf.readUInt16BE(t.hmtx + 4 * Math.min(gid, long - 1));
}

// { advances of 0-9, glyph ids of sample letters } for a font file.
export function fontFacts(file) {
  const buf = fs.readFileSync(file);
  const t = tables(buf);
  const sub = unicodeCmap(buf, t.cmap);
  // The glyph id of one character.
  const gid = (ch) => glyphId(buf, sub, ch.codePointAt(0));
  return { digits: [..."0123456789"].map((d) => advance(buf, t, gid(d))), letters: [..."AéŁЖΩ€"].map(gid) };
}
