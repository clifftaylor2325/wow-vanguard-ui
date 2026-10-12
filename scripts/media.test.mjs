// Checks Vanguard's media: generated art matches its sources, the fonts
// have tabular digits and the scripts the addon promises, the font license
// ships next to them, and every Media file the Lua names exists.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { staleMedia } from "./build-media.mjs";
import { fontFacts } from "./lib/truetype.mjs";
import { crest, crestNames } from "./lib/media-crests.mjs";
import { ICONS, MEDIA, SILHOUETTES } from "./lib/media-sources.mjs";

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

// Media files one Lua or TOC source names, as repo paths: T.Texture/T.Icon calls, an options page's
// icon or a minimap slot's, Media paths, fonts and crests.
function mediaIn(src) {
  const files = [];
  for (const m of src.matchAll(/T\.(Texture|Icon)\("(\w+)"\)/g)) files.push(`Media/${m[1] === "Icon" ? "Icons" : "Textures"}/${m[2]}.tga`);
  for (const m of src.matchAll(/\b(?:icon|slot) = "(\w+)"/g)) files.push(`Media/Icons/${m[1]}.tga`);
  for (const m of src.matchAll(/Media\\+(Textures|Icons)\\+(\w+)/g)) files.push(`Media/${m[1]}/${m[2]}.tga`);
  for (const m of src.matchAll(/Fonts\\+([\w-]+\.ttf)/g)) files.push(`Media/Fonts/${m[1]}`);
  for (const m of src.matchAll(/"((?:lorc|delapouite|sbed)-[\w-]+)"/g)) files.push(`Media/Art/${m[1]}.tga`);
  return files;
}

// Media files named in the addon's Lua and TOC, as repo paths.
function namedMedia() {
  const lua = ["Vanguard.toc", ...fs.readdirSync(path.join(root, "Core")).map((f) => `Core/${f}`), ...fs.readdirSync(path.join(root, "Modules")).map((f) => `Modules/${f}`)];
  return [...new Set(lua.flatMap((f) => mediaIn(fs.readFileSync(path.join(root, f), "utf8"))))];
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

// Every silhouette names an SVG that is on disk under art/game-icons.
function silhouetteSourcesExist() {
  const names = crestNames();
  for (const [icon, svg] of Object.entries(SILHOUETTES)) expect(names, `${icon}: art/game-icons/${svg}.svg is missing`).toContain(svg);
}

// A silhouette's alpha at 16 px: the share of its pixels over half covered, and the most alpha on its outer ring.
function silhouetteFacts(name) {
  const a = at16(name);
  const ring = a.filter((_, i) => i < 16 || i >= 240 || i % 16 === 0 || i % 16 === 15);
  return { share: a.filter((v) => v > 0.5).length / 256, ring: Math.max(...ring) };
}

// Every silhouette is a 32 px white image, clear at the corner, with a clear unit of air at 16 px
// around a glyph that covers between a tenth and half of it (an empty or mis-sized SVG fails).
function silhouettesReadable() {
  for (const name of Object.keys(SILHOUETTES)) {
    const img = ICONS[name]();
    const { share, ring } = silhouetteFacts(name);
    expect([img.w, img.h, img.px[0], img.px[3], ring, share > 0.1 && share < 0.5], `${name}: 32x32, white, clear corner, clear ring, a glyph (${share})`).toEqual([32, 32, 1, 0, 0, true]);
  }
}

// Every silhouette's SVG is credited in the CREDITS.txt that ships beside the icons, under its license.
function iconsCredited() {
  const credits = fs.readFileSync(path.join(root, "Media/Icons/CREDITS.txt"), "utf8");
  expect(credits, "Media/Icons/CREDITS.txt must name the license").toMatch(/Creative Commons Attribution 3\.0/);
  for (const [icon, svg] of Object.entries(SILHOUETTES)) expect(credits, `${icon}.tga (${svg}) needs a credit line`).toMatch(new RegExp(`^${icon}\\.tga .*\\(${svg}\\)`, "m"));
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

// Generated files that are not tinted white shapes: the pre-colored addons-list icon, the black
// shadow (one color throughout) and the two opaque grayscale bars.
const NOT_TINTED = { "Textures/Icon.tga": "colored", "Textures/Shadow.tga": "one color", "Textures/Bar.tga": "opaque", "Textures/BarSoft.tga": "opaque" };

// How many pixels of an image fail a test on (r, g, b, a).
function countPixels(img, bad) {
  let n = 0;
  for (let i = 0; i < img.px.length; i += 4) if (bad(img.px[i], img.px[i + 1], img.px[i + 2], img.px[i + 3])) n++;
  return n;
}

// Every tinted image is white in every pixel, clear ones included, so filtering never pulls a dark
// fringe into a tinted edge (#228); the shadow is one color throughout and the bars are opaque.
function clearPixelsWhite() {
  const out = Object.entries(MEDIA).map(([file, make]) => {
    const img = make();
    const kind = NOT_TINTED[file];
    if (kind === "colored") return [file, 0];
    if (kind === "opaque") return [file, countPixels(img, (r, g, b, a) => a < 1)];
    if (kind === "one color") return [file, countPixels(img, (r, g, b) => r !== img.px[0] || g !== img.px[1] || b !== img.px[2])];
    return [file, countPixels(img, (r, g, b) => r < 1 || g < 1 || b < 1)];
  });
  expect(out.filter(([, n]) => n > 0)).toEqual([]);
}

// Pixels with any alpha along an image's outer ring.
function edgePixels(img) {
  let n = 0;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if ((x === 0 || y === 0 || x === img.w - 1 || y === img.h - 1) && img.px[(y * img.w + x) * 4 + 3] > 0) n++;
  return n;
}

// Icons and the stand-alone shapes (diamond, logo halves) keep a clear pixel inside their canvas
// edge, so clamped sampling never smears an edge (#228). Tiled and stretched textures are exempt.
function shapesPadded() {
  const shapes = Object.keys(MEDIA).filter((f) => f.startsWith("Icons/") || /^Textures\/(Diamond|LogoLeft|LogoRight|Icon)\.tga$/.test(f));
  expect(shapes.map((f) => [f, edgePixels(MEDIA[f]())]).filter(([, n]) => n > 0)).toEqual([]);
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
    it("game-icons sources rasterize from their SVGs", crestsRasterize);
    it("game-icons sources are credited", crestsCredited);
  },
);

describe(
  "media icons",
  // How icons and tinted shapes sit on the pixel grid and under their clear pixels.
  () => {
    it("icons of straight strokes are crisp at 16 px", squareIconsCrisp);
    it("icon strokes are two pixels wide at 16 px", strokeIsTwoPixels);
    it("tinted art is white under its clear pixels", clearPixelsWhite);
    it("icons and shapes keep a clear pixel inside their edge", shapesPadded);
  },
);

describe(
  "silhouettes",
  // The options nav's and minimap's game-icons silhouettes: sourced, legible, credited.
  () => {
    it("every silhouette has its SVG", silhouetteSourcesExist);
    it("options nav and minimap silhouettes are 32 px, inset and legible", silhouettesReadable);
    it("the silhouettes are credited beside the icons", iconsCredited);
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
