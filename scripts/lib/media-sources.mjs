// ForeverUI's artwork, as code: every file under Media/Textures and
// Media/Icons is made here (scripts/build-media.mjs writes them).
// Textures are white or grayscale so the addon tints them with theme colors;
// Icon is the one pre-colored image (the addons list can't tint).

import { image, fill, draw, line, poly, box, frame, ring, path, arc } from "./media-art.mjs";

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

// Menu and control icons as shapes on a 16-unit grid (drawn at 32 px, shown at 16).
const ICON_SHAPES = {
  General: [line(2, 4, 14, 4), line(2, 8, 14, 8), line(2, 12, 14, 12), box(9.5, 2.5, 11.5, 5.5), box(4.5, 6.5, 6.5, 9.5), box(11.5, 10.5, 13.5, 13.5)],
  Modules: [frame(2.5, 2.5, 7, 7), frame(9, 2.5, 13.5, 7), frame(2.5, 9, 7, 13.5), frame(9, 9, 13.5, 13.5)],
  UnitFrames: [frame(1.5, 4.5, 14.5, 9.5), box(3, 6, 10, 8), line(1.5, 12, 10.5, 12)],
  RaidFrames: [[2.5, 6], [7, 10.5], [11.5, 14.5]].flatMap(([y0, y1]) => [frame(1.5, y0, 6.5, y1, 1.2), frame(9.5, y0, 14.5, y1, 1.2)]),
  Healing: [path([[6, 1.5], [10, 1.5], [10, 6], [14.5, 6], [14.5, 10], [10, 10], [10, 14.5], [6, 14.5], [6, 10], [1.5, 10], [1.5, 6], [6, 6]], 1.5, true)],
  ClickCasting: [frame(4, 1.5, 12, 14.5, 1.5, 4), line(8, 1.5, 8, 6.5), line(4, 6.5, 12, 6.5)],
  ActionBars: [frame(1.5, 5.5, 5.5, 9.5, 1.3), frame(6, 5.5, 10, 9.5, 1.3), frame(10.5, 5.5, 14.5, 9.5, 1.3), line(1.5, 12.5, 14.5, 12.5)],
  Nameplates: [line(4, 3.5, 12, 3.5), frame(1.5, 6.5, 14.5, 10.5), box(3, 8, 9, 9), line(1.5, 13, 10.5, 13)],
  Tooltips: [path([[1.5, 2.5], [14.5, 2.5], [14.5, 11.5], [8, 11.5], [5, 14.5], [5, 11.5], [1.5, 11.5]], 1.5, true), line(4, 5.5, 12, 5.5, 1.3), line(4, 8, 9, 8, 1.3)],
  Map: [path([[8, 1.5], [14.5, 8], [8, 14.5], [1.5, 8]], 1.5, true), poly([[8, 5], [11, 8], [8, 11], [7, 8]])],
  Profiles: [ring(8, 5, 3), path(arc(8, 15, 6, 5.5, 0, 180))],
  Move: [line(8, 1.5, 8, 14.5), line(1.5, 8, 14.5, 8), ...[[8, 1.5, 0, 1], [8, 14.5, 0, -1], [1.5, 8, 1, 0], [14.5, 8, -1, 0]].flatMap(arrowHead)],
  Close: [line(3.5, 3.5, 12.5, 12.5, 1.8), line(12.5, 3.5, 3.5, 12.5, 1.8)],
  Check: [path([[3, 8.5], [6.5, 12], [13, 4.5]], 2)],
  Down: [path([[4, 6], [8, 10], [12, 6]], 1.8)],
  Right: [path([[6, 4], [10, 8], [6, 12]], 1.8)],
  Search: [ring(7, 7, 4.5), line(10.3, 10.3, 14, 14, 1.8)],
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
    return line(8 + 4.5 * Math.cos(a), 8 + 4.5 * Math.sin(a), 8 + 6.8 * Math.cos(a), 8 + 6.8 * Math.sin(a), 2.2);
  });
  return [ring(8, 8, 3.8, 2), ...teeth];
}

// The micro menu glyphs (Modules/MenuStrip.lua), on the same 16-unit grid.
const MENU_SHAPES = {
  Character: [dot(8, 4.4, 2.8), poly(arc(8, 15, 5.5, 6.5, 0, 180))],
  Spellbook: [frame(3, 2, 13, 14.5, 1.4, 1), line(5.6, 2, 5.6, 14.5, 1.2), line(7.6, 6, 11, 6, 1.2)],
  Talents: [line(8, 13, 8, 8.5, 1.5), line(8, 8.5, 4, 3.5, 1.5), line(8, 8.5, 12, 3.5, 1.5), dot(4, 3.5, 1.8), dot(12, 3.5, 1.8), dot(8, 13, 1.8)],
  Professions: [box(2.5, 2.5, 13.5, 6.5, 0.6), line(8, 6.5, 8, 14.5, 2.2)],
  Achievements: [star(8, 8.6, 6.8)],
  Quests: [line(8, 2.5, 8, 10, 2.6), dot(8, 13.2, 1.4)],
  Social: [dot(5.2, 5, 2.2), dot(11, 5.6, 1.9), poly(arc(5.2, 14.5, 4, 5.5, 0, 180)), poly(arc(11.2, 14.5, 3.4, 4.6, 0, 180))],
  Group: [path(arc(8, 8, 6.5, 4.8, 0, 180), 1.5), path(arc(8, 8, 6.5, 4.8, 180, 360), 1.5), dot(8, 8, 2.3)],
  Collections: [box(1.5, 3, 14.5, 6.5, 0.5), frame(2.5, 6.5, 13.5, 14, 1.4), line(8, 6.5, 8, 14, 1.4)],
  Journal: [path([[1.5, 4], [8, 5.5], [14.5, 4], [14.5, 13], [8, 14.5], [1.5, 13]], 1.4, true), line(8, 5.5, 8, 14.5, 1.4)],
  Shop: [ring(8, 8, 5.6, 1.5), dot(8, 8, 2.2)],
  MenuCog: cog(),
  Help: [path([...arc(8, 6, 3.5, 3.5, 180, -60, 10), [8, 10.5]], 1.8), dot(8, 13.4, 1.2)],
};

// The two strokes of an arrow head at (x, y) pointing against (dx, dy).
function arrowHead([x, y, dx, dy]) {
  return [line(x, y, x + 2 * dx + 2 * dy, y + 2 * dy + 2 * dx, 1.4), line(x, y, x + 2 * dx - 2 * dy, y + 2 * dy - 2 * dx, 1.4)];
}

// Name (under Media/Icons) -> the image it holds.
export const ICONS = Object.fromEntries(Object.entries({ ...ICON_SHAPES, ...MENU_SHAPES }).map(([name, shapes]) => [name, () => draw(image(32, 32), 16, shapes)]));

// Every generated file: path under Media -> image maker.
export const MEDIA = {
  ...Object.fromEntries(Object.entries(TEXTURES).map(([n, make]) => [`Textures/${n}.tga`, make])),
  ...Object.fromEntries(Object.entries(ICONS).map(([n, make]) => [`Icons/${n}.tga`, make])),
};
