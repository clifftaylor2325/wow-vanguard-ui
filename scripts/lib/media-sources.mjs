// Vanguard's artwork, as code: every file under Media/Textures and
// Media/Icons is made here (the line icons drawn in plain math; the options
// nav's and the minimap's filled icons, SILHOUETTES, rasterized from
// game-icons.net SVGs), and the faction crests under Media/Art come from their
// SVGs too (scripts/lib/media-crests.mjs); scripts/build-media.mjs writes them.
// Textures are white or grayscale so the addon tints them with theme colors;
// Icon is the one pre-colored image (the addons list can't tint): Vanguard's
// crest, drawn in scripts/lib/media-brand.mjs.

import { image, fill, draw, drawSdf, line, poly, box, ring, path, arc } from "./media-art.mjs";
import { CRESTS, crest, glyph } from "./media-crests.mjs";
import { crestIcon } from "./media-brand.mjs";
import { SURFACES } from "./media-surfaces.mjs";

// Textures --------------------------------------------------------------------------------

// Status bar fill, grayscale (the bar color tints it): a bright top line,
// then a gentle darkening toward the bottom.
function bar() {
  return fill(image(256, 32), (x, y) => {
    const l = y === 0 ? 1 : 0.94 - 0.16 * Math.pow(y / 31, 1.2);
    return [l, l, l, 1];
  });
}

// The "Soft" status bar fill: no bright top line, and only a slight darkening
// toward the bottom, for a calmer, flatter bar.
function barSoft() {
  return fill(image(256, 32), (x, y) => {
    const l = 0.97 - 0.09 * Math.pow(y / 31, 1.5);
    return [l, l, l, 1];
  });
}

// A spark riding a bar's fill edge: a white streak, soft at the sides and
// fading a little toward its ends (drawn with additive blending).
function spark() {
  return fill(image(16, 64), (x, y) => {
    const across = Math.exp(-Math.pow(x + 0.5 - 8, 2) / (2 * 2.2 * 2.2));
    const along = 1 - 0.4 * Math.pow(Math.abs(y + 0.5 - 32) / 32, 2);
    return [1, 1, 1, across * along];
  });
}

// A soft falloff around a centered square (margin m) for nine-slice use.
// hollow leaves the middle clear (a glow); otherwise it's filled (a shadow).
function softBox(size, m, sigma, rgb, alpha, hollow) {
  return fill(image(size, size), (x, y) => {
    const dx = Math.max(m - (x + 0.5), 0, x + 0.5 - (size - m));
    const dy = Math.max(m - (y + 0.5), 0, y + 0.5 - (size - m));
    const d = Math.hypot(dx, dy);
    const a = d === 0 ? (hollow ? 0 : alpha) : alpha * Math.exp(-(d * d) / (2 * sigma * sigma));
    return [...rgb, a];
  });
}

// A rounded corner's quarter circle, drawn for a panel's top-left corner: the circle's centre sits
// at the canvas's bottom-right, so the arc curves round the top left. `line` is the border's arc,
// a stroke `w` wide along the outer edge; otherwise the filled quarter disc under the fill.
function corner(size, w, line) {
  return fill(image(size, size), (x, y) => {
    const d = Math.hypot(size - (x + 0.5), size - (y + 0.5));
    const outer = Math.max(0, Math.min(1, size - d + 0.5));
    const inner = line ? Math.max(0, Math.min(1, size - w - d + 0.5)) : 0;
    return [1, 1, 1, outer - inner];
  });
}

// A rounded corner's mask, for a bar inside a rounded panel: the quarter disc inside the border's arc (`w` texels on
// a `size` canvas, as `corner` draws it), for the top-left corner or flipped to another (the client ignores a mask
// texture's tex coords, so each corner is its own image).
function roundMask(size, w, flipX, flipY) {
  return fill(image(size, size), (x, y) => {
    const d = Math.hypot(size - ((flipX ? size - 1 - x : x) + 0.5), size - ((flipY ? size - 1 - y : y) + 0.5));
    return [1, 1, 1, clamp01(size - w - d + 0.5)];
  });
}

// A cut corner, drawn for a panel's top-left corner: the cut runs from the canvas's bottom-left to its top-right.
// `s` counts the pixel diagonals inside the cut; drawn one texel to a screen pixel, so every texel is fully on or off
// (a hard 45-degree staircase, no blur): "line" is the `w` diagonals along the cut, "fill" everything inside it,
// "mask" everything inside the line.
// `flipX` and `flipY` draw it for another corner (the client ignores a mask texture's tex coords, so each mask
// corner is its own image).
function cut(size, w, kind, flipX, flipY) {
  return fill(image(size, size), (x, y) => {
    const s = (flipX ? size - 1 - x : x) + (flipY ? size - 1 - y : y) + 1 - size;
    const inside = clamp01(s + 1);
    const past = clamp01(s - w + 1);
    return [1, 1, 1, kind === "line" ? inside - past : kind === "fill" ? inside : past];
  });
}

// A window control's tile (Core/Theme.lua T.WindowControl, 20 units shown), drawn at 4 texels a unit: a square
// with T.CORNER_RADIUS (4 units) arcs, by signed distance so the arcs are smooth and the sides stay hard. `w`
// texels wide along the edge for its line (one unit), or the whole square for the fill under it.
function controlTile(w) {
  const size = 80, half = 40, r = 16;
  return fill(image(size, size), (x, y) => {
    const qx = Math.abs(x + 0.5 - half) - (half - r), qy = Math.abs(y + 0.5 - half) - (half - r);
    const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
    return [1, 1, 1, clamp01(0.5 - sd) - (w ? clamp01(0.5 - sd - w) : 0)];
  });
}

// The low-health vignette (Modules/GameAlerts.lua), stretched over the screen: clear in the middle, rising to full
// white toward the edges and corners, so the theme's vignette color tints it and the curve sets its strength.
function vignette() {
  return fill(image(128, 128), (x, y) => {
    const r = Math.hypot((x + 0.5) / 64 - 1, (y + 0.5) / 64 - 1);
    const t = clamp01((r - 0.55) / 0.6);
    return [1, 1, 1, t * t * (3 - 2 * t)];
  });
}

// A white wash fading in from the top to the bottom: the dispel highlight
// rises from a raid tile's bottom edge, clear of the name.
function fade() {
  return fill(image(8, 64), (x, y) => [1, 1, 1, Math.pow(y / 63, 1.4)]);
}

// Diagonal stripes for shields, one 8 px tile repeated both ways (#257): the period divides the
// tile, so the seams are exact and the stripes don't shimmer.
function stripes() {
  return fill(image(8, 8), (x, y) => [1, 1, 1, (x + y) % 8 < 3 ? 0.55 : 0.12]);
}

// A clamp to 0..1, for coverage.
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// A capsule (a pill) on a 64 x 32 canvas: its round ends have radius 16, its middle runs flat between them. With
// `ring` set (texels) it is only the outline, that wide: 2 is about one pixel on a switch's 18-unit track, 4 one
// pixel on a slider's 8-unit track.
function capsule(ring) {
  return fill(image(64, 32), (x, y) => {
    const px = x + 0.5;
    const py = y + 0.5;
    const d = Math.hypot(px - Math.max(16, Math.min(48, px)), py - 16);
    const outer = clamp01(16 - d + 0.5);
    const inner = ring ? clamp01(16 - ring - d + 0.5) : 0;
    return [1, 1, 1, outer - inner];
  });
}

// A switch's knob: a white round disc on a 32 px canvas (radius 15, so a clear pixel stays inside the edge, as the
// other stand-alone shapes keep), for the theme to tint. With `ring` set (texels) it is only the disc's outline,
// that wide: 3 is about one pixel on a slider's 12-unit thumb.
function knob(ring) {
  return fill(image(32, 32), (x, y) => {
    const d = Math.hypot(x + 0.5 - 16, y + 0.5 - 16);
    const inner = ring ? clamp01(15 - ring - d + 0.5) : 0;
    return [1, 1, 1, clamp01(15 - d + 0.5) - inner];
  });
}

// A round minimap's disc on a 256 px canvas (radius 127, so a clear pixel stays inside the edge): the map's mask, its
// backing and the mask on the bands that cross it. With `ring` set (texels) it is only the outline, that wide.
function disc(ring) {
  return fill(image(256, 256), (x, y) => {
    const d = Math.hypot(x + 0.5 - 128, y + 0.5 - 128);
    const inner = ring ? clamp01(127 - ring - d + 0.5) : 0;
    return [1, 1, 1, clamp01(127 - d + 0.5) - inner];
  });
}

// The knob's shade: the crescent under its lit top-left edge, a white disc less one shifted up and left, so the
// theme's shade color darkens the lower right of the knob.
function knobShade() {
  return fill(image(32, 32), (x, y) => {
    const disc = clamp01(15 - Math.hypot(x + 0.5 - 16, y + 0.5 - 16) + 0.5);
    const lit = clamp01(15 - Math.hypot(x + 0.5 - 13, y + 0.5 - 13) + 0.5);
    return [1, 1, 1, disc * (1 - lit)];
  });
}

// The unit frames' classification diamond (Modules/UnitFrames.lua, tinted by rank), on a 64-unit grid:
// a diamond outline with a filled middle. It was the left half of the first logo; T.Logo now draws Icon.
const LOGO_LEFT = [path([[22, 17], [37, 32], [22, 47], [7, 32]], 5, true), poly([[32, 27], [37, 32], [32, 37], [27, 32]])];

// Name (under Media/Textures) -> the image it holds.
export const TEXTURES = {
  Bar: bar,
  BarSoft: barSoft,
  Spark: spark,
  // A switch's or slider's track (the pill, tinted the inset color), the switch's outline, the slider's (thicker, for its
  // lower track), the round knob with its shade, and the slider thumb's outline (Core/Controls.lua).
  Pill: () => capsule(0),
  PillLine: () => capsule(2),
  SliderLine: () => capsule(4),
  Knob: () => knob(0),
  KnobLine: () => knob(3),
  KnobShade: knobShade,
  // A round minimap (the Minimap shape setting): the disc, which masks and backs the map, and its outline (3 texels is
  // about two pixels on a 180-unit map).
  RoundDisc: () => disc(0),
  RoundRing: () => disc(3),
  // A small filled diamond (minimap corners, the assist mark), on a 16-unit grid.
  Diamond: () => draw(image(16, 16), 16, [poly([[8, 1], [15, 8], [8, 15], [1, 8]])]),
  // Shadow (filled) and glow (hollow) share the soft falloff.
  Shadow: () => softBox(64, 16, 6, [0, 0, 0], 0.8, false),
  Glow: () => softBox(64, 16, 5, [1, 1, 1], 0.9, true),
  Stripes: stripes,
  // A window-corner bracket (#238), top left, on a 16-unit grid: two one-unit lines meeting in a 45-degree chamfer.
  OrnamentCorner: () => draw(image(16, 16), 16, [box(0, 5, 1, 16), box(5, 0, 16, 1), line(0.5, 5, 5, 0.5, 1)]),
  // Rounded corners (the corners setting): the border's arc, 8 of 32 wide (one pixel at T.CORNER_RADIUS 4 px), and the fill under it.
  CornerLine: () => corner(32, 8, true),
  // A window control's tile under the mouse (its fill and its one-pixel line, both tinted by the theme).
  ControlTile: () => controlTile(0),
  ControlTileLine: () => controlTile(4),
  CornerFill: () => corner(32, 8, false),
  // Its masks, which round a bar inside a rounded frame (the Versus deck's unit frames) inside the arc.
  CornerRoundMask: () => roundMask(32, 8),
  CornerRoundMaskTR: () => roundMask(32, 8, true, false),
  CornerRoundMaskBL: () => roundMask(32, 8, false, true),
  CornerRoundMaskBR: () => roundMask(32, 8, true, true),
  Fade: fade,
  Vignette: vignette,
  // The panel textures (scripts/lib/media-surfaces.mjs): faint white surfaces over a floating window's fill.
  ...SURFACES,
  // The classification diamond, white, for the addon to tint.
  LogoLeft: () => draw(image(64, 64), 64, LOGO_LEFT),
  // The pre-colored addons-list icon: Vanguard's crest (scripts/lib/media-brand.mjs).
  Icon: () => crestIcon(64),
  // Shield corners (the cut corner of the crest, on the unit frames): a 45-degree cut across the top-left corner, 8 x 8,
  // drawn at T.CORNER_CUT (8) screen pixels so each texel is one pixel. The border's cut line is one pixel diagonal, the
  // fill sits under it, and the mask is the fill less the line, so a bar under it stops inside the line.
  CornerCutLine: () => cut(8, 1, "line"),
  CornerCutFill: () => cut(8, 1, "fill"),
  CornerCutMask: () => cut(8, 1, "mask"),
  CornerCutMaskTR: () => cut(8, 1, "mask", true, false),
  CornerCutMaskBL: () => cut(8, 1, "mask", false, true),
  CornerCutMaskBR: () => cut(8, 1, "mask", true, true),
};

// Icons -------------------------------------------------------------------------------------

// An icon's stroke, in grid units: two pixels where icons are shown (16 px).
const STROKE = 2;
// The dispel badge letters' stroke, bolder than STROKE since they're shown at about 12 px, with the
// top-right corner left to the type's mark.
const LETTER_SMALL = 2;
// A dispel letter's points shrunk to 0.7 and moved to the lower left of the 16-unit cell.
const dispelLetter = (points) => points.map(([x, y]) => [0.5 + x * 0.7, 4.6 + y * 0.7]);

// Straight strokes through points, STROKE wide (or w). A level or upright
// segment is a box with square ends, so with its points on whole grid units
// it covers whole pixels at 16 px instead of smearing across two; a slanted
// one is a round-capped line.
function crisp(points, closed = false, w = STROKE) {
  const pts = closed ? [...points, points[0]] : points;
  return pts.slice(1).map(([x1, y1], i) => {
    const [x0, y0] = pts[i];
    if (x0 !== x1 && y0 !== y1) return line(x0, y0, x1, y1, w);
    return box(Math.min(x0, x1) - w / 2, Math.min(y0, y1) - w / 2, Math.max(x0, x1) + w / 2, Math.max(y0, y1) + w / 2);
  });
}

// A rectangle's outline through its corners, square-cornered (see crisp).
function rect(x0, y0, x1, y1, w = STROKE) {
  return crisp([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true, w);
}

// Menu and control icons as shapes on a 16-unit grid (drawn at 32 px, shown
// at 16, where one unit is one pixel). Straight strokes are two units wide on
// whole units, so they cover whole pixels; slanted ones run half a unit off the
// grid, which lands each step of a 45-degree stroke on whole pixels too.
const ICON_SHAPES = {
  Map: [path([[8, 2.5], [13.5, 8], [8, 13.5], [2.5, 8]], STROKE, true), poly([[8, 5], [11, 8], [8, 11], [7, 8]])],
  Close: [line(3.5, 4, 11.5, 12, STROKE), line(12.5, 4, 4.5, 12, STROKE)],
  Check: [path([[3, 8.5], [6.5, 12], [13, 5.5]], STROKE)],
  Down: [path([[4, 6.5], [8, 10.5], [12, 6.5]], STROKE)],
  Up: [path([[4, 9.5], [8, 5.5], [12, 9.5]], STROKE)],
  Right: [path([[6.5, 4], [10.5, 8], [6.5, 12]], STROKE)],
  Search: [ring(7, 7, 4, STROKE), line(10.5, 10.5, 14, 14, STROKE)],
  // Copy (the chat bar's Copy tile): two sheets, the front one whole over the back one's corner, all on whole units.
  Copy: [rect(2, 5, 11, 14), crisp([[5, 5], [5, 2], [14, 2], [14, 11], [11, 11]])],
  // Raid marks, filled so they read at 10 px: a tank's shield, a healer's cross,
  // the leader's crown and three dots for a ready check still waiting.
  RoleTank: [poly([[2.5, 2], [13.5, 2], [13.5, 7.5], [12.3, 10.6], [8, 14.5], [3.7, 10.6], [2.5, 7.5]])],
  RoleHealer: [box(6, 1.5, 10, 14.5, 0.5), box(1.5, 6, 14.5, 10, 0.5)],
  Crown: [poly([[2, 4.5], [5.5, 8], [8, 2.5], [10.5, 8], [14, 4.5], [13, 11.5], [3, 11.5]]), box(3, 12.5, 13, 14.5, 0.5)],
  Waiting: [box(1.5, 6.5, 4.5, 9.5, 1.5), box(6.5, 6.5, 9.5, 9.5, 1.5), box(11.5, 6.5, 14.5, 9.5, 1.5)],
  // The warn state's glyph (#235), filled so it reads at 10 px beside the check and the cross.
  Warn: [poly([[8, 1.5], [15, 14], [1, 14]])],
  // Dispel type badges (#235): a bold letter each (Magic, Curse, Disease, Poison) shrunk to the lower left, and a
  // corner mark in the top right that differs per type (diamond, circle, square, triangle), so the type reads
  // without the letter or its hue (shown at about 12 px).
  DispelMagic: [...path(dispelLetter([[3, 13.5], [3, 2.5], [8, 9], [13, 2.5], [13, 13.5]]), LETTER_SMALL), poly([[13, 0.5], [15.5, 3], [13, 5.5], [10.5, 3]])],
  DispelCurse: [...path(dispelLetter(arc(8.5, 8, 5.5, 5.5, 45, 315, 14)), LETTER_SMALL), poly(arc(13, 3, 2.5, 2.5, 0, 360, 14))],
  DispelDisease: [...path(dispelLetter([[3.5, 2.5], [3.5, 13.5]]), LETTER_SMALL), ...path(dispelLetter([[3.5, 2.5], ...arc(7.5, 8, 5.5, 5.5, 90, -90, 12), [3.5, 13.5]]), LETTER_SMALL), box(10.5, 0.5, 15.5, 5.5)],
  DispelPoison: [...path(dispelLetter([[4, 13.5], [4, 2.5]]), LETTER_SMALL), ...path(dispelLetter([[4, 2.5], ...arc(8.5, 5.5, 4, 3, 90, -90, 10), [4, 8.5]]), LETTER_SMALL), poly([[13, 0.5], [15.5, 5.5], [10.5, 5.5]])],
  // The quest marks for the quest dialog and quest log lines (F17), in place of the game's gossip
  // icons: an exclamation mark (a stem from the top, two units of air, a 2 x 2 dot) and a question
  // mark (a round hook that curls under on the left, a short stem, the same dot), tops and dots level.
  QuestBang: [crisp([[8, 2], [8, 9]]), box(7, 12, 9, 14)],
  QuestQuery: [path(arc(8, 5, 3.5, 3, 200, -90, 14), STROKE), crisp([[8, 8], [8, 9]]), box(7, 12, 9, 14)],
  // The floating waypoint pin (Modules/Waypoints.lua, on the game's SuperTrackedFrame): a teardrop outline, its
  // round head on (8, 6) meeting the tip at (8, 14), with a filled dot in the head; shown at the game's pin size.
  Pin: [path([[8, 14], ...arc(8, 6, 4, 4, -30, 210, 24)], STROKE, true), box(6.75, 4.75, 9.25, 7.25, 1.25)],
  // The quest arrow (Modules/QuestArrow.lua): a filled arrowhead pointing up, a notch in its base; the module turns it.
  QuestArrow: [poly([[8, 1], [14.5, 14.5], [8, 10.5], [1.5, 14.5]])],
};

// A filled five-point star centered at (cx, cy) with outer radius r.
function star(cx, cy, r) {
  return poly(Array.from({ length: 10 }, (_, i) => {
    const a = ((-90 + i * 36) * Math.PI) / 180;
    const d = i % 2 ? r * 0.42 : r;
    return [cx + d * Math.cos(a), cy + d * Math.sin(a)];
  }));
}

// A filled circle (a fully rounded box) centered at (cx, cy).
function dot(cx, cy, r) {
  return box(cx - r, cy - r, cx + r, cy + r, r);
}

// A cog: a ring with eight teeth around it (their tips clear of the canvas edge).
function cog() {
  const teeth = Array.from({ length: 8 }, (_, i) => {
    const a = (i * 45 * Math.PI) / 180;
    return line(8 + 4.5 * Math.cos(a), 8 + 4.5 * Math.sin(a), 8 + 6.4 * Math.cos(a), 8 + 6.4 * Math.sin(a), STROKE);
  });
  return [ring(8, 8, 4, STROKE), ...teeth];
}

// The micro menu glyphs (Modules/MenuStrip.lua), on the same 16-unit grid.
const MENU_SHAPES = {
  Character: [dot(8, 4.4, 2.8), poly(arc(8, 15, 5.5, 6.5, 0, 180))],
  Spellbook: [rect(3, 2, 13, 14), crisp([[6, 2], [6, 14]]), box(8, 5, 11, 7)],
  Talents: [crisp([[8, 7], [8, 12]]), line(8, 7.5, 4, 3.5, STROKE), line(8, 7.5, 12, 3.5, STROKE), dot(4, 3, 2), dot(12, 3, 2), dot(8, 13, 2)],
  Professions: [box(2, 2, 14, 6), crisp([[8, 6], [8, 14]])],
  Achievements: [star(8, 8.6, 6.8)],
  Quests: [crisp([[8, 2], [8, 10]]), box(7, 12, 9, 14)],
  Social: [dot(5.2, 5, 2.2), dot(11, 5.6, 1.9), poly(arc(5.2, 14.5, 4, 5.5, 0, 180)), poly(arc(11.2, 14.5, 3.4, 4.6, 0, 180))],
  Group: [path(arc(8, 8, 6, 4.5, 0, 180), STROKE), path(arc(8, 8, 6, 4.5, 180, 360), STROKE), dot(8, 8, 2)],
  Collections: [box(1, 2, 15, 6), rect(3, 6, 13, 14), crisp([[8, 6], [8, 14]])],
  // A calendar: a page with a filled header, two binding pegs and a few dates.
  Calendar: [rect(2.5, 3.5, 13.5, 14), box(2, 3, 14, 6.5), crisp([[5, 1.5], [5, 4.5]]), crisp([[11, 1.5], [11, 4.5]]), box(4.5, 8.5, 6.5, 10.5), box(7.5, 8.5, 9.5, 10.5), box(10.5, 8.5, 12.5, 10.5), box(4.5, 11.5, 6.5, 12.5)],
  Journal: [crisp([[2, 3], [8, 5], [14, 3], [14, 12], [8, 14], [2, 12]], true), crisp([[8, 5], [8, 14]])],
  Shop: [ring(8, 8, 6, STROKE), dot(8, 8, 2)],
  MenuCog: cog(),
  // Housing: a house outline with a door.
  House: [line(2, 8, 8, 2, STROKE), line(8, 2, 14, 8, STROKE), crisp([[4, 7], [4, 14], [12, 14], [12, 7]]), box(7, 10, 9, 14)],
  Help: [path([...arc(8, 6, 3.5, 3.5, 180, -60, 10), [8, 10]], STROKE), box(7, 12, 9, 14)],
  // Legacy: an hourglass (a frame top and bottom, the two glass halves, sand at the bottom).
  Legacy: [crisp([[3, 2], [13, 2]]), crisp([[3, 14], [13, 14]]), line(4.5, 3, 8, 8, STROKE), line(11.5, 3, 8, 8, STROKE), line(8, 8, 4.5, 13, STROKE), line(8, 8, 11.5, 13, STROKE), poly([[5, 13], [11, 13], [8, 10]])],
};

// Filled silhouettes from game-icons.net (art/game-icons; scripts/lib/media-crests.mjs glyph):
// the options nav's page icons (Nav*, shown at 16 px) and the minimap's two slot buttons
// (Minimap*, 12 px), each a 32 px image with a unit of air around it. Icon name -> SVG name.
export const SILHOUETTES = {
  NavGeneral: "lorc-cog", NavModules: "lorc-cubes", NavUnitFrames: "delapouite-orc-head",
  NavRaidFrames: "delapouite-three-friends", NavActionBars: "lorc-broadsword", NavQuests: "lorc-scroll-unfurled",
  NavMap: "lorc-compass", NavProfiles: "delapouite-id-card", NavFeedback: "delapouite-chat-bubble",
  NavClickCasting: "delapouite-mouse", NavHealing: "sbed-health-increase", NavTalents: "delapouite-upgrade",
  NavSituations: "delapouite-crossroad", NavNameplates: "delapouite-price-tag",
  NavBars: "lorc-laurel-crown", NavChat: "lorc-raven", NavTools: "lorc-battle-axe", NavWindows: "lorc-checked-shield", NavTown: "delapouite-castle",
  MinimapTracking: "delapouite-binoculars", MinimapAddons: "lorc-jigsaw-piece",
};

// The sizes (px) the line and menu icons are also baked at (#232), each as Icons/<Name><size> drawn
// by signed distance at exactly that size; Core/Theme.lua T.SIZED_ICONS lists the same names and sizes.
export const ICON_SIZES = [16, 20, 24, 32];
// Only the menu strip asks for a size (Modules/MenuStrip.lua MS.GLYPHS), so only its icons are baked.
export const SIZED_ICONS = ["Character", "Spellbook", "Talents", "Professions", "Achievements", "Quests", "Social", "Group", "Collections", "Journal", "Shop", "MenuCog", "Help", "Map", "House", "Legacy"];

// The window controls (close, maximize, minimize; Core/Theme.lua T.CONTROL), on a 20-unit grid
// drawn at 64 px and shown at 20, one unit a pixel, one tone (tinted by the theme). Each mark fills
// the same middle box, about 4.5 to 15.5, so the three read as one set wherever they stand.
// How thick their strokes are (units).
const CONTROL_STROKE = 1.6;
// An arrow along a diagonal: its shaft from `from` to its tip, and the head's two strokes back from the tip.
const arrow = (from, tip, head) => [...path([from, tip], CONTROL_STROKE), ...path([head[0], tip, head[1]], CONTROL_STROKE)];
const CONTROL_SHAPES = {
  // Two diagonal arrows pointing out to the corners (maximize: grow) or in from them (minimize: shrink).
  Maximize: [...arrow([9, 11], [4.5, 15.5], [[4.5, 12], [8, 15.5]]), ...arrow([11, 9], [15.5, 4.5], [[12, 4.5], [15.5, 8]])],
  Minimize: [...arrow([4.5, 15.5], [9, 11], [[6, 11], [9, 14]]), ...arrow([15.5, 4.5], [11, 9], [[14, 9], [11, 6]])],
  // The close cross, corner to corner of the box.
  CloseMark: [line(5.5, 5.5, 14.5, 14.5, 1.8), line(14.5, 5.5, 5.5, 14.5, 1.8)],
};

// Name (under Media/Icons) -> the image it holds.
export const ICONS = {
  ...Object.fromEntries(Object.entries({ ...ICON_SHAPES, ...MENU_SHAPES }).map(([name, shapes]) => [name, () => draw(image(32, 32), 16, shapes)])),
  ...Object.fromEntries(SIZED_ICONS.flatMap((name) => ICON_SIZES.map((size) => [`${name}${size}`, () => drawSdf(image(size, size), 16, { ...ICON_SHAPES, ...MENU_SHAPES }[name])]))),
  ...Object.fromEntries(Object.entries(CONTROL_SHAPES).map(([name, shapes]) => [name, () => draw(image(64, 64), 20, shapes)])),
  ...Object.fromEntries(Object.entries(SILHOUETTES).map(([name, svg]) => [name, () => glyph(svg)])),
};

// Every generated file: path under Media -> image maker.
export const MEDIA = {
  ...Object.fromEntries(Object.entries(TEXTURES).map(([n, make]) => [`Textures/${n}.tga`, make])),
  ...Object.fromEntries(Object.entries(ICONS).map(([n, make]) => [`Icons/${n}.tga`, make])),
  ...Object.fromEntries(CRESTS.map((n) => [`Art/${n}.tga`, () => crest(n)])),
};
