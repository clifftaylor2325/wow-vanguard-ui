// Vanguard's artwork, as code: every file under Media/Textures and
// Media/Icons is made here, and the faction crests under Media/Art come from
// their SVGs (scripts/lib/media-crests.mjs); scripts/build-media.mjs writes them.
// Textures are white or grayscale so the addon tints them with theme colors;
// Icon is the one pre-colored image (the addons list can't tint).

import { image, fill, draw, line, poly, box, frame, ring, path, arc } from "./media-art.mjs";
import { CRESTS, crest } from "./media-crests.mjs";

const BRASS = [0xd9 / 255, 0xa4 / 255, 0x41 / 255];
const LIGHT = [0xe8 / 255, 0xea / 255, 0xee / 255];

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

// A white wash fading in from the top to the bottom: the dispel highlight
// rises from a raid tile's bottom edge, clear of the name.
function fade() {
  return fill(image(8, 64), (x, y) => [1, 1, 1, Math.pow(y / 63, 1.4)]);
}

// Diagonal stripes for shields, tiled across a bar.
function stripes() {
  return fill(image(16, 16), (x, y) => [1, 1, 1, (x + y) % 16 < 5 ? 0.55 : 0.12]);
}

// The logo, on a 64-unit grid: two linked diamonds, the left one with a filled middle.
const LOGO_LEFT = [path([[22, 17], [37, 32], [22, 47], [7, 32]], 5, true), poly([[32, 27], [37, 32], [32, 37], [27, 32]])];
const LOGO_RIGHT = [path([[42, 17], [57, 32], [42, 47], [27, 32]], 5, true)];

// The pre-colored logo for the addons list: brass left diamond over a light right one.
function coloredIcon() {
  const img = draw(image(64, 64), 64, LOGO_RIGHT, LIGHT);
  return draw(img, 64, LOGO_LEFT, BRASS);
}

// Name (under Media/Textures) -> the image it holds.
export const TEXTURES = {
  Bar: bar,
  BarSoft: barSoft,
  Spark: spark,
  // A small filled diamond (minimap corners, the assist mark), on a 16-unit grid.
  Diamond: () => draw(image(16, 16), 16, [poly([[8, 1], [15, 8], [8, 15], [1, 8]])]),
  // The close seal's fill under the mouse: its outer diamond, filled, on the controls' 20-unit grid.
  Seal: () => draw(image(64, 64), 20, [poly([[10, 1.4], [18.6, 10], [10, 18.6], [1.4, 10]])]),
  // Shadow (filled) and glow (hollow) share the soft falloff.
  Shadow: () => softBox(64, 16, 6, [0, 0, 0], 0.8, false),
  Glow: () => softBox(64, 16, 5, [1, 1, 1], 0.9, true),
  Stripes: stripes,
  Fade: fade,
  // The logo halves, white, for the addon to tint (accent left, text right).
  LogoLeft: () => draw(image(64, 64), 64, LOGO_LEFT),
  LogoRight: () => draw(image(64, 64), 64, LOGO_RIGHT),
  Icon: coloredIcon,
};

// Icons -------------------------------------------------------------------------------------

// An icon's stroke, in grid units: two pixels where icons are shown (16 px).
const STROKE = 2;

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
  // Three sliders and their knobs.
  General: [crisp([[2, 3], [14, 3]]), crisp([[2, 8], [14, 8]]), crisp([[2, 13], [14, 13]]), box(9, 1, 12, 5), box(4, 6, 7, 10), box(10, 11, 13, 15)],
  Modules: [rect(2, 2, 6, 6), rect(10, 2, 14, 6), rect(2, 10, 6, 14), rect(10, 10, 14, 14)],
  UnitFrames: [rect(2, 4, 14, 10), box(4, 6, 10, 8), crisp([[2, 13], [10, 13]])],
  // Six tiles: too many for two-pixel sides in 16 px, so one-pixel ones.
  RaidFrames: [[1, 4], [6, 9], [11, 14]].flatMap(([y0, y1]) => [rect(1.5, y0 + 0.5, 6.5, y1 + 0.5, 1), rect(9.5, y0 + 0.5, 14.5, y1 + 0.5, 1)]),
  Healing: [crisp([[6, 2], [10, 2], [10, 6], [14, 6], [14, 10], [10, 10], [10, 14], [6, 14], [6, 10], [2, 10], [2, 6], [6, 6]], true)],
  ClickCasting: [frame(4, 2, 12, 14, STROKE, 3), crisp([[8, 2], [8, 7]]), crisp([[4, 7], [12, 7]])],
  ActionBars: [box(1, 4, 5, 8), box(6, 4, 10, 8), box(11, 4, 15, 8), crisp([[2, 12], [14, 12]])],
  Nameplates: [crisp([[5, 3], [11, 3]]), rect(2, 6, 14, 11), box(4, 8, 10, 9), crisp([[2, 14], [10, 14]])],
  Tooltips: [crisp([[2, 2], [14, 2], [14, 11], [8, 11], [5, 14], [5, 11], [2, 11]], true), box(4, 4, 12, 6), box(4, 7, 9, 9)],
  Map: [path([[8, 2.5], [13.5, 8], [8, 13.5], [2.5, 8]], STROKE, true), poly([[8, 5], [11, 8], [8, 11], [7, 8]])],
  Profiles: [ring(8, 4, 2, STROKE), path(arc(8, 15, 6, 6, 0, 180), STROKE)],
  Move: [crisp([[8, 2], [8, 14]]), crisp([[2, 8], [14, 8]]), ...[[8, 1.5, 0, 1], [8, 14.5, 0, -1], [1.5, 8, 1, 0], [14.5, 8, -1, 0]].flatMap(arrowHead)],
  Close: [line(3.5, 4, 11.5, 12, STROKE), line(12.5, 4, 4.5, 12, STROKE)],
  Check: [path([[3, 8.5], [6.5, 12], [13, 5.5]], STROKE)],
  Down: [path([[4, 6.5], [8, 10.5], [12, 6.5]], STROKE)],
  Right: [path([[6.5, 4], [10.5, 8], [6.5, 12]], STROKE)],
  Search: [ring(7, 7, 4, STROKE), line(10.5, 10.5, 14, 14, STROKE)],
  // Raid marks, filled so they read at 10 px: a tank's shield, a healer's cross,
  // the leader's crown and three dots for a ready check still waiting.
  RoleTank: [poly([[2.5, 2], [13.5, 2], [13.5, 7.5], [12.3, 10.6], [8, 14.5], [3.7, 10.6], [2.5, 7.5]])],
  RoleHealer: [box(6, 1.5, 10, 14.5, 0.5), box(1.5, 6, 14.5, 10, 0.5)],
  Crown: [poly([[2, 4.5], [5.5, 8], [8, 2.5], [10.5, 8], [14, 4.5], [13, 11.5], [3, 11.5]]), box(3, 12.5, 13, 14.5, 0.5)],
  Waiting: [box(1.5, 6.5, 4.5, 9.5, 1.5), box(6.5, 6.5, 9.5, 9.5, 1.5), box(11.5, 6.5, 14.5, 9.5, 1.5)],
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

// A cog: a ring with eight teeth around it.
function cog() {
  const teeth = Array.from({ length: 8 }, (_, i) => {
    const a = (i * 45 * Math.PI) / 180;
    return line(8 + 4.5 * Math.cos(a), 8 + 4.5 * Math.sin(a), 8 + 6.8 * Math.cos(a), 8 + 6.8 * Math.sin(a), STROKE);
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
  Journal: [crisp([[2, 3], [8, 5], [14, 3], [14, 12], [8, 14], [2, 12]], true), crisp([[8, 5], [8, 14]])],
  Shop: [ring(8, 8, 6, STROKE), dot(8, 8, 2)],
  MenuCog: cog(),
  // Housing: a house outline with a door.
  House: [line(2, 8, 8, 2, STROKE), line(8, 2, 14, 8, STROKE), crisp([[4, 7], [4, 14], [12, 14], [12, 7]]), box(7, 10, 9, 14)],
  Help: [path([...arc(8, 6, 3.5, 3.5, 180, -60, 10), [8, 10]], STROKE), box(7, 12, 9, 14)],
  // Legacy: an hourglass (a frame top and bottom, the two glass halves, sand at the bottom).
  Legacy: [crisp([[3, 2], [13, 2]]), crisp([[3, 14], [13, 14]]), line(4.5, 3, 8, 8, STROKE), line(11.5, 3, 8, 8, STROKE), line(8, 8, 4.5, 13, STROKE), line(8, 8, 11.5, 13, STROKE), poly([[5, 13], [11, 13], [8, 10]])],
};

// The window controls (close, maximize, minimize; Core/Theme.lua T.CONTROL), on a 20-unit grid
// drawn at 64 px and shown at 20, one unit a pixel. Two tones: the bracket or cross in the text
// color, its ornament (the seal, the gem) a separate icon in the accent.
const GEM = poly([[10, 7.5], [12.5, 10], [10, 12.5], [7.5, 10]]);
// One corner bracket of a maximize or minimize control: one-pixel strokes on half units, through points.
const bracket = (points) => crisp(points, false, 1);
const CONTROL_SHAPES = {
  // Four corner brackets pointing out (maximize) or in (minimize), around the gem's place.
  Maximize: [[[3.5, 8.5], [3.5, 3.5], [8.5, 3.5]], [[11.5, 3.5], [16.5, 3.5], [16.5, 8.5]], [[3.5, 11.5], [3.5, 16.5], [8.5, 16.5]], [[11.5, 16.5], [16.5, 16.5], [16.5, 11.5]]].map(bracket),
  Minimize: [[[3.5, 7.5], [7.5, 7.5], [7.5, 3.5]], [[12.5, 3.5], [12.5, 7.5], [16.5, 7.5]], [[3.5, 12.5], [7.5, 12.5], [7.5, 16.5]], [[12.5, 16.5], [12.5, 12.5], [16.5, 12.5]]].map(bracket),
  // The small diamond gem in the middle of maximize and minimize.
  ControlGem: [GEM],
  // The close seal: a diamond outline with a stud on each of its points.
  CloseRing: [path([[10, 2], [18, 10], [10, 18], [2, 10]], 1.2, true), dot(10, 1.6, 1.3), dot(18.4, 10, 1.3), dot(10, 18.4, 1.3), dot(1.6, 10, 1.3)],
  // The cross inside the seal.
  CloseMark: [line(7.4, 7.4, 12.6, 12.6, 1.5), line(12.6, 7.4, 7.4, 12.6, 1.5)],
};

// The two strokes of an arrow head at (x, y) pointing against (dx, dy).
function arrowHead([x, y, dx, dy]) {
  return [line(x, y, x + 2 * dx + 2 * dy, y + 2 * dy + 2 * dx, STROKE), line(x, y, x + 2 * dx - 2 * dy, y + 2 * dy - 2 * dx, STROKE)];
}

// Name (under Media/Icons) -> the image it holds.
export const ICONS = {
  ...Object.fromEntries(Object.entries({ ...ICON_SHAPES, ...MENU_SHAPES }).map(([name, shapes]) => [name, () => draw(image(32, 32), 16, shapes)])),
  ...Object.fromEntries(Object.entries(CONTROL_SHAPES).map(([name, shapes]) => [name, () => draw(image(64, 64), 20, shapes)])),
};

// Every generated file: path under Media -> image maker.
export const MEDIA = {
  ...Object.fromEntries(Object.entries(TEXTURES).map(([n, make]) => [`Textures/${n}.tga`, make])),
  ...Object.fromEntries(Object.entries(ICONS).map(([n, make]) => [`Icons/${n}.tga`, make])),
  ...Object.fromEntries(CRESTS.map((n) => [`Art/${n}.tga`, () => crest(n)])),
};
