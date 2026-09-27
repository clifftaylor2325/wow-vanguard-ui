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
  // Shadow (filled) and glow (hollow) share the soft falloff.
  Shadow: () => softBox(64, 16, 6, [0, 0, 0], 0.8, false),
  Glow: () => softBox(64, 16, 5, [1, 1, 1], 0.9, true),
  Stripes: stripes,
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
};

// The two strokes of an arrow head at (x, y) pointing against (dx, dy).
function arrowHead([x, y, dx, dy]) {
  return [line(x, y, x + 2 * dx + 2 * dy, y + 2 * dy + 2 * dx, 1.4), line(x, y, x + 2 * dx - 2 * dy, y + 2 * dy - 2 * dx, 1.4)];
}

// Name (under Media/Icons) -> the image it holds.
export const ICONS = Object.fromEntries(Object.entries(ICON_SHAPES).map(([name, shapes]) => [name, () => draw(image(32, 32), 16, shapes)]));

// Every generated file: path under Media -> image maker.
export const MEDIA = {
  ...Object.fromEntries(Object.entries(TEXTURES).map(([n, make]) => [`Textures/${n}.tga`, make])),
  ...Object.fromEntries(Object.entries(ICONS).map(([n, make]) => [`Icons/${n}.tga`, make])),
};
