#!/usr/bin/env node
// Checks ForeverUI's media: the generated art matches its sources, the
// fonts have tabular digits and the scripts the addon promises, the font
// license ships next to them, and every Media file the Lua names exists.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { staleMedia } from "./build-media.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

// Records msg as a failure unless cond holds.
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

// TrueType ------------------------------------------------------------------------------

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

// Glyph id for the k-th code of segment i (idDelta, or the idRangeOffset array).
function segmentGlyph(buf, sub, seg, i, k) {
  const delta = buf.readUInt16BE(sub + 16 + 2 * seg + 2 * i);
  const rangeAt = sub + 16 + 3 * seg + 2 * i;
  const range = buf.readUInt16BE(rangeAt);
  if (range === 0) return (buf.readUInt16BE(sub + 16 + seg + 2 * i) + k + delta) & 0xffff;
  const g = buf.readUInt16BE(rangeAt + range + 2 * k);
  return g === 0 ? 0 : (g + delta) & 0xffff;
}

// Advance width of a glyph (hmtx, long metrics then the last one repeated).
function advance(buf, t, gid) {
  const long = buf.readUInt16BE(t.hhea + 34);
  return buf.readUInt16BE(t.hmtx + 4 * Math.min(gid, long - 1));
}

// { advances of 0-9, glyph ids of sample letters } for a font file.
function fontFacts(file) {
  const buf = fs.readFileSync(file);
  const t = tables(buf);
  const sub = unicodeCmap(buf, t.cmap);
  // The glyph id of one character.
  const gid = (ch) => glyphId(buf, sub, ch.codePointAt(0));
  return { digits: [..."0123456789"].map((d) => advance(buf, t, gid(d))), letters: [..."AéŁЖΩ€"].map(gid) };
}

// Checks ---------------------------------------------------------------------------------

// Every generated file is committed and current.
function checkArt() {
  const stale = staleMedia();
  assert(stale.length === 0, `generated art out of date: ${stale.map((s) => s.file).join(", ")} (run node scripts/build-media.mjs)`);
}

// Both fonts: tabular digits, Latin/Greek/Cyrillic letters, and the OFL beside them.
function checkFonts() {
  for (const weight of ["Medium", "SemiBold"]) {
    const facts = fontFacts(path.join(root, `Media/Fonts/FiraSansCondensed-${weight}.ttf`));
    assert(new Set(facts.digits).size === 1, `${weight}: digits 0-9 must share one width (got ${facts.digits})`);
    assert(facts.letters.every((g) => g > 0), `${weight}: missing Latin, Greek, Cyrillic or euro glyphs (${facts.letters})`);
  }
  assert(/SIL Open Font License/.test(fs.readFileSync(path.join(root, "Media/Fonts/OFL.txt"), "utf8")), "Media/Fonts/OFL.txt must hold the font license");
}

// Media files named in the addon's Lua and TOC, as repo paths.
function namedMedia() {
  const files = [];
  const lua = ["ForeverUI.toc", ...fs.readdirSync(path.join(root, "Core")).map((f) => `Core/${f}`), ...fs.readdirSync(path.join(root, "Modules")).map((f) => `Modules/${f}`)];
  for (const f of lua) {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    for (const m of src.matchAll(/T\.(Texture|Icon)\("(\w+)"\)/g)) files.push(`Media/${m[1] === "Icon" ? "Icons" : "Textures"}/${m[2]}.tga`);
    for (const m of src.matchAll(/Media\\+(Textures|Icons)\\+(\w+)/g)) files.push(`Media/${m[1]}/${m[2]}.tga`);
    for (const m of src.matchAll(/Fonts\\+([\w-]+\.ttf)/g)) files.push(`Media/Fonts/${m[1]}`);
  }
  return [...new Set(files)];
}

// Every Media file the addon names exists.
function checkNamed() {
  const named = namedMedia();
  assert(named.length > 0, "found no Media paths in the addon (the scan is broken)");
  for (const f of named) assert(fs.existsSync(path.join(root, f)), `${f} is used by the addon but missing`);
}

console.log("ForeverUI — media");
checkArt();
checkFonts();
checkNamed();
if (failures.length) {
  console.error(`FAILED (${failures.length})`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log("OK  art matches its sources; fonts have tabular digits, Latin/Greek/Cyrillic and their license; every named file exists");
