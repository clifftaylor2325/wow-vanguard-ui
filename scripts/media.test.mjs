// Checks ForeverUI's media: generated art matches its sources, the fonts
// have tabular digits and the scripts the addon promises, the font license
// ships next to them, and every Media file the Lua names exists.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { staleMedia } from "./build-media.mjs";
import { fontFacts } from "./lib/truetype.mjs";
import { crest, crestNames } from "./lib/media-crests.mjs";
import { ICONS } from "./lib/media-sources.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Path of one bundled Fira Sans Condensed file.
function fontPath(weight) {
  return path.join(root, `Media/Fonts/FiraSansCondensed-${weight}.ttf`);
}

// Digits 0-9 of one weight share a single advance width.
function expectDigits(weight) {
  const facts = fontFacts(fontPath(weight));
  const msg = `${weight}: digits 0-9 must share one width (got ${facts.digits})`;
  expect(new Set(facts.digits).size, msg).toBe(1);
}

// Sample letters of one weight (Latin, Greek, Cyrillic, euro) have glyphs.
function expectGlyphs(weight) {
  const facts = fontFacts(fontPath(weight));
  const msg = `${weight}: missing Latin, Greek, Cyrillic or euro glyphs (${facts.letters})`;
  expect(facts.letters.every((g) => g > 0), msg).toBe(true);
}

// Every generated file is committed and current.
function artIsCurrent() {
  const stale = staleMedia();
  const msg = `generated art out of date: ${stale.map((s) => s.file).join(", ")} (run node scripts/build-media.mjs)`;
  expect(stale.length, msg).toBe(0);
}

// Medium digits 0-9 share one width.
function mediumDigits() {
  expectDigits("Medium");
}

// Medium has Latin, Greek, Cyrillic and euro glyphs.
function mediumGlyphs() {
  expectGlyphs("Medium");
}

// SemiBold digits 0-9 share one width.
function semiBoldDigits() {
  expectDigits("SemiBold");
}

// SemiBold has Latin, Greek, Cyrillic and euro glyphs.
function semiBoldGlyphs() {
  expectGlyphs("SemiBold");
}

// The SIL Open Font License ships beside the fonts.
function oflLicense() {
  const text = fs.readFileSync(path.join(root, "Media/Fonts/OFL.txt"), "utf8");
  expect(text, "Media/Fonts/OFL.txt must hold the font license").toMatch(/SIL Open Font License/);
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
    for (const m of src.matchAll(/"((?:lorc|delapouite|sbed)-[\w-]+)"/g)) files.push(`Media/Art/${m[1]}.tga`);
  }
  return [...new Set(files)];
}

// The scan finds at least one Media path.
function scanFindsMedia() {
  expect(namedMedia().length, "found no Media paths in the addon (the scan is broken)").toBeGreaterThan(0);
}

// One named Media file is on disk.
function fileExists(file) {
  expect(fs.existsSync(path.join(root, file)), `${file} is used by the addon but missing`).toBe(true);
}

// Every crest source rasterizes to a white glyph on transparency (its black square dropped).
function crestsRasterize() {
  for (const name of crestNames()) {
    const img = crest(name);
    let covered = 0;
    for (let i = 3; i < img.px.length; i += 4) covered += img.px[i] > 0.5 ? 1 : 0;
    const share = covered / (img.w * img.h);
    expect([img.w, img.h, img.px[3], img.px[0], share > 0.1 && share < 0.7], `${name}: 64x64, clear corner, white, a glyph not a square`).toEqual([64, 64, 0, 1, true]);
  }
}

// Every crest source is credited, with its author, in art/CREDITS.md.
function crestsCredited() {
  const credits = fs.readFileSync(path.join(root, "art/CREDITS.md"), "utf8");
  for (const name of crestNames()) expect(credits, `${name}.svg needs a credit line`).toContain(`\`${name}.svg\``);
}

// Line icons made only of level and upright strokes: at 16 px every pixel
// they touch must be fully covered, none half (P4.2).
const SQUARE_ICONS = ["General", "Modules", "UnitFrames", "RaidFrames", "Healing", "ActionBars", "Nameplates", "Spellbook", "Professions", "Quests", "Collections"];

// An icon's alpha at 16 px: the 32 px image averaged over 2 x 2 blocks, as the GPU draws it at half size.
function at16(name) {
  const img = ICONS[name]();
  return Array.from({ length: 256 }, (_, i) => {
    const x = (i % 16) * 2;
    const y = Math.floor(i / 16) * 2;
    return [0, 1, 32, 33].reduce((sum, d) => sum + img.px[(y * 32 + x + d) * 4 + 3], 0) / 4;
  });
}

// Icons that are all straight strokes have no half-covered pixels at 16 px.
function squareIconsCrisp() {
  const soft = SQUARE_ICONS.map((name) => [name, at16(name).filter((a) => a > 0.02 && a < 0.98).length]);
  expect(soft.filter(([, n]) => n > 0)).toEqual([]);
}

// A straight stroke is two pixels wide at 16 px: the General icon's top slider is rows 2 and 3.
function strokeIsTwoPixels() {
  const a = at16("General");
  expect([1, 2, 3, 4].map((row) => Math.round(a[row * 16 + 2] * 100) / 100)).toEqual([0, 1, 1, 0]);
}

describe(
  "media",
  // Generated art, then digits, glyphs and the license for each weight.
  () => {
    it("committed art is current", artIsCurrent);
    it("Medium: digits 0-9 must share one width", mediumDigits);
    it("Medium: Latin, Greek, Cyrillic and euro glyphs", mediumGlyphs);
    it("SemiBold: digits 0-9 must share one width", semiBoldDigits);
    it("SemiBold: Latin, Greek, Cyrillic and euro glyphs", semiBoldGlyphs);
    it("Media/Fonts/OFL.txt must hold the font license", oflLicense);
    it("faction crests rasterize from their SVGs", crestsRasterize);
    it("faction crest sources are credited", crestsCredited);
    it("icons of straight strokes are crisp at 16 px", squareIconsCrisp);
    it("icon strokes are two pixels wide at 16 px", strokeIsTwoPixels);
  },
);

describe(
  "named media",
  // Every Media path the addon names must exist.
  () => {
    it("the addon names at least one Media file", scanFindsMedia);
    for (const file of namedMedia()) it(`${file} exists`, () => fileExists(file));
  },
);
