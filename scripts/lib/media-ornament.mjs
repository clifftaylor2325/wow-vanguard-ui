// The window ornaments (#238, docs/handoff/leonardo-art-plan.md A1 to A3), drawn in the toned kind: three grey
// tones and a dark outline (TONES), tinted accentDim by the theme. Light comes from the top left everywhere.
//
// The corner bracket (A1): two straight bars meet at a 45-degree cut corner, so a bar's top edge or left edge is
// the lit facet and its opposite edge the recess line, wherever the corner sits. The 1 x bake (16 texels) has an
// outline and a base; the 2 x bake (32 texels) adds the lit and recess strips.
// The header rule's motif (A2) and the round minimap's ring (A3) follow below the bracket.

import { TONES, bleed, draw, image, line, poly, ring } from "./media-art.mjs";

// The canvas grid, in units, and the 2 x bake's size: the strips only show from there.
const GRID = 16;
const STRIP_FROM = 32;
// The chamfer's inset at the base: one unit of outline, measured across the 45-degree cut.
const CUT = 1 + Math.SQRT2;

// The shapes for the top-left corner, in grid units inside a clear one-unit border (hard polygon corners).
// The outline's cut sits a fiftieth of a unit off the grid line, so no supersample lands exactly on the diagonal
// and every corner's soft edge texels are the exact mirror of the top left's.
const OUTLINE = [[1, 15], [1, 5.02], [5.02, 1], [15, 1], [15, 5], [5, 5], [5, 15]];
const BASE = [[2, 14], [2, 5 + CUT - 2], [5 + CUT - 2, 2], [14, 2], [14, 4], [4, 4], [4, 14]];

// The strips along the faces, each tagged with the way it faces in the top-left corner (up, left, down, right,
// or the cut, which faces up-left there). A strip that ends up facing the light is lit, away from it is recess.
const STRIPS = [
  { face: "left", pts: [[2, 14], [2, 5 + CUT - 2], [2.5, 5.62], [2.5, 14]] },
  { face: "up", pts: [[5 + CUT - 2, 2], [14, 2], [14, 2.5], [5.62, 2.5]] },
  { face: "cut", pts: [[2, 5 + CUT - 2], [5 + CUT - 2, 2], [5.62, 2.5], [2.5, 5.62]] },
  { face: "right", pts: [[3.5, 3.5], [4, 3.5], [4, 14], [3.5, 14]] },
  { face: "down", pts: [[3.5, 3.5], [14, 3.5], [14, 4], [3.5, 4]] },
];

// The face on the other side of a bar.
const OPPOSITE = { left: "right", right: "left", up: "down", down: "up" };

// Where a face points once the corner is flipped across x and/or y: a left or right face turns with x, an up or
// down face with y, and the cut turns with both ("upleft" in the top left corner).
function facing(face, fx, fy) {
  if (face === "cut") return `${fy ? "down" : "up"}${fx ? "right" : "left"}`;
  const turned = face === "left" || face === "right" ? fx : fy;
  return turned ? OPPOSITE[face] : face;
}

// A strip's tone from the way it faces: toward the light (up or left) is lit, away is recess, the cut is lit
// only facing up-left and recess only facing down-right, and a sideways cut is left at the base tone.
function toneOf(way) {
  if (way === "up" || way === "left" || way === "upleft") return "lit";
  if (way === "down" || way === "right" || way === "downright") return "recess";
  return "base";
}

// Points mirrored across x and/or y on the grid.
function flipPoints(pts, fx, fy) {
  return pts.map(([x, y]) => [fx ? GRID - x : x, fy ? GRID - y : y]);
}

// A grey of one tone as RGB.
function grey(tone) {
  return [TONES[tone], TONES[tone], TONES[tone]];
}

// The bracket for one corner at `size` texels (16 or 32), its clear pixels bled to the outline tone.
export function ornamentCorner(size, fx = false, fy = false) {
  const img = image(size, size);
  draw(img, GRID, [poly(flipPoints(OUTLINE, fx, fy))], grey("outline"));
  draw(img, GRID, [poly(flipPoints(BASE, fx, fy))], grey("base"));
  if (size >= STRIP_FROM) {
    for (const { face, pts } of STRIPS) {
      draw(img, GRID, [poly(flipPoints(pts, fx, fy))], grey(toneOf(facing(face, fx, fy))));
    }
  }
  return bleed(img, grey("outline"));
}

// The corner keys (the pieces a window's corners use) and which way each is flipped from the top-left drawing.
const CORNER_FLIPS = { TL: [false, false], TR: [true, false], BL: [false, true], BR: [true, true] };
// The two bakes, in texels, named for their size.
const BAKES = [16, 32];

// Name (under Media/Textures) -> the image: OrnamentCorner16TL ... OrnamentCorner32BR, eight files.
export const ORNAMENT_CORNERS = Object.fromEntries(
  BAKES.flatMap((size) => Object.entries(CORNER_FLIPS).map(([key, [fx, fy]]) => [`OrnamentCorner${size}${key}`, () => ornamentCorner(size, fx, fy)])),
);

// The rule motif (A2) ----------------------------------------------------------------------

// The motif's canvas in grid units (32 x 8, shown 24 x 6 units, so a texel stays square) and the bake that
// gets the facet strips (64 texels wide).
const RULE_GRID = 32;
const RULE_STRIP_FROM = 64;
// The elongated diamond's centre, and the half width and half height of its outline, its base and the inner edge
// of its strips, in grid units. The outline sits a clear unit inside the canvas; its tips run out to the divider.
const RULE_MID = [16, 4];
const RULE_OUTLINE = [15, 3];
const RULE_BASE = [12, 2];
const RULE_INNER = [9, 1.5];

// A diamond about the motif's centre: left, top, right and bottom corners for a half width and half height.
function diamond([a, b]) {
  return [[-a, 0], [0, -b], [a, 0], [0, b]].map(([x, y]) => [RULE_MID[0] + x, RULE_MID[1] + y]);
}

// The outline: the diamond with its two tips cut square, a unit each side of the middle line, so a tip is never
// thinner than a texel (a taper under one texel is all soft pixels, the toned kind's fault).
function ruleOutline() {
  const [left, top, right, bottom] = diamond(RULE_OUTLINE), [, mid] = RULE_MID;
  return [[left[0], mid - 1], top, [right[0], mid - 1], [right[0], mid + 1], bottom, [left[0], mid + 1]];
}

// A strip along one edge of the base diamond (corner index to corner index), as wide as the base is from the
// inner diamond.
function ruleStrip(from, to) {
  const [base, inner] = [diamond(RULE_BASE), diamond(RULE_INNER)];
  return poly([base[from], base[to], inner[to], inner[from]]);
}

// The rule motif at `size` texels wide (32 or 64): a dark outline, the base, and from 64 texels a lit strip
// along the upper left edge and a recess strip along the lower right one.
export function ornamentRule(size) {
  const img = image(size, size / 4);
  draw(img, RULE_GRID, [poly(ruleOutline())], grey("outline"));
  draw(img, RULE_GRID, [poly(diamond(RULE_BASE))], grey("base"));
  if (size >= RULE_STRIP_FROM) {
    draw(img, RULE_GRID, [ruleStrip(0, 1)], grey("lit"));
    draw(img, RULE_GRID, [ruleStrip(2, 3)], grey("recess"));
  }
  return bleed(img, grey("outline"));
}

// The ring (A3) -----------------------------------------------------------------------------

// The ring's canvas in grid units (the RoundDisc's 256; the disc is radius 127). The band's widths in grid units and
// mid radius by bake: at 256 it is 4 wide, an outline texel each side and two of base between, and the 128 bake needs a
// whole third texel to keep a hard edge (a 2-texel band is all soft pixels on a diagonal) and stops a texel short of the disc (a clear border).
const RING_GRID = 256;
const RING_BAND = { 256: { outline: 4, base: 2, mid: 125 }, 128: { outline: 6, base: 2, mid: 123 } };
// How many marks sit round the band (every 15 degrees; the four cardinal ones are diamonds, the rest studs), a
// stud's diameter (flat dark dots, no smaller than 4 texels) and a cardinal diamond's half diagonal and mid radius.
const RING_MARKS = 24;
const STUD = 4;
const DIAMOND = { half: 4, at: 123 };
// The studs and diamonds only show from the 256 bake: smaller, a stud falls under four texels.
const MARKS_FROM = 256;

// The point at `angle` degrees clockwise from twelve o'clock on a circle of radius `r` about the ring's centre.
function onRing(angle, r) {
  const t = (angle * Math.PI) / 180;
  return [RING_GRID / 2 + r * Math.sin(t), RING_GRID / 2 - r * Math.cos(t)];
}

// A flat dark stud at a mark's angle: a zero-length line is a disc of the line's width.
function stud(angle) {
  const [x, y] = onRing(angle, RING_BAND[256].mid);
  return line(x, y, x, y, STUD);
}

// The diamond at a cardinal angle, `grow` units larger than its base, point-up in the grid's frame (the cardinal
// marks at three and nine o'clock are the same diamond, so it needs no turning).
function cardinal(angle, grow) {
  const [x, y] = onRing(angle, DIAMOND.at), h = DIAMOND.half + grow;
  return poly([[x - h, y], [x, y - h], [x + h, y], [x, y + h]]);
}

// The band at a bake: one shape, `w` wide, at the bake's mid radius.
const band = (size, w) => ring(RING_GRID / 2, RING_GRID / 2, RING_BAND[size].mid, w);

// The studs and the four cardinal diamonds (north, east, south, west) over the band.
function ringMarks(img) {
  const angles = Array.from({ length: RING_MARKS }, (_, k) => (k * 360) / RING_MARKS);
  draw(img, RING_GRID, angles.filter((_, k) => k % 6).map(stud), grey("outline"));
  for (const angle of [0, 90, 180, 270]) {
    draw(img, RING_GRID, [cardinal(angle, 0)], grey("outline"));
    draw(img, RING_GRID, [cardinal(angle, -1.5)], grey("base"));
  }
}

// The round minimap's ring at `size` texels (256 or 128): the band, and from 256 the studs and diamonds.
export function roundRingOrnate(size) {
  const img = image(size, size);
  draw(img, RING_GRID, [band(size, RING_BAND[size].outline)], grey("outline"));
  draw(img, RING_GRID, [band(size, RING_BAND[size].base)], grey("base"));
  if (size >= MARKS_FROM) ringMarks(img);
  return bleed(img, grey("outline"));
}

// Name (under Media/Textures) -> the image: OrnamentRule32 and OrnamentRule64.
export const ORNAMENT_RULES = Object.fromEntries([32, 64].map((size) => [`OrnamentRule${size}`, () => ornamentRule(size)]));
// RoundRingOrnate256 and RoundRingOrnate128.
export const ORNAMENT_ROUND = Object.fromEntries([256, 128].map((size) => [`RoundRingOrnate${size}`, () => roundRingOrnate(size)]));
