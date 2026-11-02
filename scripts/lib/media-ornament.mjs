// The window-corner bracket (#238, docs/handoff/leonardo-art-plan.md A1), drawn in the toned kind: three grey tones
// and a dark outline (TONES), tinted accentDim by the theme. Two straight bars meet at a 45-degree cut corner;
// light comes from the top left at every corner, so a bar's top edge or left edge is the lit facet and its
// opposite edge the recess line, wherever the corner sits. The 1 x bake (16 texels) has an outline and a base;
// the 2 x bake (32 texels) adds the lit and recess strips.

import { TONES, bleed, draw, image, poly } from "./media-art.mjs";

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
