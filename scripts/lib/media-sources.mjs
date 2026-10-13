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

// Diagonal stripes for shields, one 8 px tile repeated both ways (#257): the period divides the
// tile, so the seams are exact and the stripes don't shimmer.
function stripes() {
  return fill(image(8, 8), (x, y) => [1, 1, 1, (x + y) % 8 < 3 ? 0.55 : 0.12]);
}

// The in-game logo (T.Logo), on a 64-unit grid: two linked diamonds, the left one with a filled middle.
const LOGO_LEFT = [path([[22, 17], [37, 32], [22, 47], [7, 32]], 5, true), poly([[32, 27], [37, 32], [32, 37], [27, 32]])];
const LOGO_RIGHT = [path([[42, 17], [57, 32], [42, 47], [27, 32]], 5, true)];

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
  // A window-corner bracket (#238), top left, on a 16-unit grid: two one-unit lines meeting in a 45-degree chamfer.
  OrnamentCorner: () => draw(image(16, 16), 16, [box(0, 5, 1, 16), box(5, 0, 16, 1), line(0.5, 5, 5, 0.5, 1)]),
  Fade: fade,
  // The logo halves, white, for the addon to tint (accent left, text right).
  LogoLeft: () => draw(image(64, 64), 64, LOGO_LEFT),
  LogoRight: () => draw(image(64, 64), 64, LOGO_RIGHT),
  // The pre-colored addons-list icon: Vanguard's crest (scripts/lib/media-brand.mjs).
  Icon: () => crestIcon(64),
};

// Icons -------------------------------------------------------------------------------------

// An icon's stroke, in grid units: two pixels where icons are shown (16 px).
const STROKE = 2;
// The dispel badge letters' stroke: bolder, since they're shown at about 8 px.
const LETTER = 2.5;

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
  Right: [path([[6.5, 4], [10.5, 8], [6.5, 12]], STROKE)],
  Search: [ring(7, 7, 4, STROKE), line(10.5, 10.5, 14, 14, STROKE)],
  // Raid marks, filled so they read at 10 px: a tank's shield, a healer's cross,
  // the leader's crown and three dots for a ready check still waiting.
  RoleTank: [poly([[2.5, 2], [13.5, 2], [13.5, 7.5], [12.3, 10.6], [8, 14.5], [3.7, 10.6], [2.5, 7.5]])],
  RoleHealer: [box(6, 1.5, 10, 14.5, 0.5), box(1.5, 6, 14.5, 10, 0.5)],
  Crown: [poly([[2, 4.5], [5.5, 8], [8, 2.5], [10.5, 8], [14, 4.5], [13, 11.5], [3, 11.5]]), box(3, 12.5, 13, 14.5, 0.5)],
  Waiting: [box(1.5, 6.5, 4.5, 9.5, 1.5), box(6.5, 6.5, 9.5, 9.5, 1.5), box(11.5, 6.5, 14.5, 9.5, 1.5)],
  // The warn state's glyph (#235), filled so it reads at 10 px beside the check and the cross.
  Warn: [poly([[8, 1.5], [15, 14], [1, 14]])],
  // Dispel type badges (#235): a bold letter each (Magic, Curse, Disease, Poison), read at 8 px.
  DispelMagic: [...path([[3, 13.5], [3, 2.5], [8, 9], [13, 2.5], [13, 13.5]], LETTER)],
  DispelCurse: [...path(arc(8.5, 8, 5.5, 5.5, 45, 315, 14), LETTER)],
  DispelDisease: [...path([[3.5, 2.5], [3.5, 13.5]], LETTER), ...path([[3.5, 2.5], ...arc(7.5, 8, 5.5, 5.5, 90, -90, 12), [3.5, 13.5]], LETTER)],
  DispelPoison: [...path([[4, 13.5], [4, 2.5]], LETTER), ...path([[4, 2.5], ...arc(8.5, 5.5, 4, 3, 90, -90, 10), [4, 8.5]], LETTER)],
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
