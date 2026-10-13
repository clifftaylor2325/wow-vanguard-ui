// Vanguard's crest, the pre-colored addons-list icon (Media/Textures/Icon): two swords crossed
// behind a rimmed heater shield that bears a serif V. It is drawn with media-art's shapes from the
// same 1024-unit drawing as the website's logo (art/brand/vanguard-crest.svg, the reference), so the
// icon and the site match and the bytes are the same on every machine. The rivets, the blades'
// fullers, the grips' wrap and the V's engraved line are left out: under a pixel at 64 px.

import { image, draw, line, poly, path } from "./media-art.mjs";

// The palette (0-1 RGB): the theme's slate and brass, a darker brass for the rim and the grips,
// and two steels for a blade's lit and shaded halves.
const GROUND = [0x0b / 255, 0x0d / 255, 0x11 / 255];
const BRASS = [0xd9 / 255, 0xa4 / 255, 0x41 / 255];
const BRASS_DARK = [0xb5 / 255, 0x84 / 255, 0x2d / 255];
const STEEL_LIGHT = [0xe4 / 255, 0xe8 / 255, 0xee / 255];
const STEEL_DARK = [0xa9 / 255, 0xb1 / 255, 0xbc / 255];

// Affine transforms as [a, b, c, d, e, f] (x' = a·x + c·y + e, y' = b·x + d·y + f), the way SVG
// writes them: a translation, a uniform scale, a rotation (degrees, clockwise with y down), m then
// n applied n first (SVG's "m n"), a point through one, and a point list through one.
const translate = (x, y) => [1, 0, 0, 1, x, y];
const scale = (s) => [s, 0, 0, s, 0, 0];
const rotate = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180), -Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180), 0, 0];
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const map = (m, pts) => pts.map((p) => apply(m, p));

// A chain of transforms, the last applied first (as SVG reads "a b c").
const chain = (...ms) => ms.reduce(mul);

// Points along a Bézier curve (two control points make a cubic, one a quadratic) in n steps, both
// ends included, by de Casteljau's construction.
function bezier(ctrl, n) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    let p = ctrl;
    while (p.length > 1) p = p.slice(1).map((q, k) => [p[k][0] + (q[0] - p[k][0]) * t, p[k][1] + (q[1] - p[k][1]) * t]);
    return p[0];
  });
}

// Runs one SVG path command once its arguments are complete (M, L, H, V or Q, absolute): adds the
// point to the contours and returns it, or returns null while arguments are still missing.
function step(out, cmd, cur, args) {
  const need = { M: 2, L: 2, H: 1, V: 1, Q: 4 }[cmd];
  if (!need || args.length < need) return null;
  const a = args.splice(0, need);
  const next = cmd === "H" ? [a[0], cur[1]] : cmd === "V" ? [cur[0], a[0]] : [a[need - 2], a[need - 1]];
  if (cmd === "M") out.push([next]);
  else if (cmd === "Q") out.at(-1).push(...bezier([cur, [a[0], a[1]], next], 6).slice(1));
  else out.at(-1).push(next);
  return next;
}

// The contours of an SVG glyph path (absolute M, L, H, V, Q and Z, as fontTools writes one), each
// a closed point list with its curves flattened; the pairs after an M are lines, as in SVG.
function contours(d) {
  const out = [], args = [];
  let cmd = "M", cur = [0, 0];
  for (const tok of d.match(/[MLHVQZ]|-?\d*\.?\d+/g)) {
    if (/[A-Z]/.test(tok)) [cmd, args.length] = [tok, 0];
    else args.push(Number(tok));
    const next = /[A-Z]/.test(tok) ? null : step(out, cmd, cur, args);
    if (next) [cur, cmd] = [next, cmd === "M" ? "L" : cmd];
  }
  return out;
}

// A filled disc: a zero-length line as wide as the disc.
const disc = (cx, cy, r) => line(cx, cy, cx, cy, 2 * r);

// The heater shield: a point at the top, two straight sides and a curved bottom, on the drawing's
// 1024-unit canvas (centred on 512, 518).
const SHIELD = [[512, 118], [842, 212], [842, 530], ...bezier([[842, 530], [842, 712], [690, 850], [512, 918]], 16).slice(1), ...bezier([[512, 918], [334, 850], [182, 712], [182, 530]], 16).slice(1), [182, 212]];

// The V on the shield: Cinzel's capital (art/fonts, SIL OFL) at weight 900, 400 units tall,
// centred on (512, 500), as fontTools wrote its outline.
const LETTER = "M517.0 700.0 326.4 303.3H459.0L565.6 558.6ZM517.0 700.0V613.8L652.9 301.7H697.6L553.4 617.7Q551.2 622.7 546.3 633.4Q541.3 644.2 536.0 656.9Q530.8 669.6 526.9 681.2Q523.0 692.8 521.9 700.0ZM635.8 340.3Q643.5 323.8 634.7 314.6Q625.8 305.5 614.8 305.5H609.8V300.0H733.0V305.5Q733.0 305.5 730.5 305.5Q728.0 305.5 728.0 305.5Q715.9 305.5 702.3 313.5Q688.8 321.5 680.0 340.3ZM474.4 340.3H344.0Q335.2 321.5 321.7 313.5Q308.1 305.5 295.4 305.5Q295.4 305.5 293.2 305.5Q291.0 305.5 291.0 305.5V300.0H500.4V305.5H495.4Q484.9 305.5 476.9 314.6Q468.9 323.8 474.4 340.3Z";

// Where the parts sit on the canvas (the SVG's transforms): the whole crest scaled up 10% about
// its middle to fill the icon (a clear pixel stays on every side at 64 px), the shield at 74%
// with its middle at (512, 488), and each sword crossing the other at (512, 560), 270 units up its
// blade, leaning 33 degrees.
const FIT = chain(translate(512, 512), scale(1.1), translate(-512, -550));
const SHIELD_AT = chain(FIT, translate(512, 488), scale(0.74), translate(-512, -518));
// Where a sword leaning `lean` degrees sits.
const swordAt = (lean) => chain(FIT, translate(512, 560), rotate(lean), translate(0, 270));

// A sword's layers as [shapes, color] in drawing order, placed by m from its own units (point up,
// crossguard centre at the origin): the blade's edge, its shaded and lit halves, the ricasso, the
// swept crossguard with its ball ends, the grip with a collar at each end, then the wheel pommel.
function sword(m) {
  const blade = map(m, [[-22, -8], [-13, -740], [0, -800], [13, -740], [22, -8]]);
  const lit = map(m, [[-22, -8], [-13, -740], [0, -800], [0, -8]]);
  const guard = map(m, [...bezier([[-104, -24], [-52, -4], [0, 0]], 8), ...bezier([[0, 0], [52, -4], [104, -24]], 8).slice(1)]);
  const [k1, k2, pommel] = map(m, [[-104, -24], [104, -24], [0, 198]]);
  const grip = map(m, [[-13, 12], [13, 12], [13, 164], [-13, 164]]);
  const collars = [map(m, [[-19, 10], [19, 10], [19, 26], [-19, 26]]), map(m, [[-19, 152], [19, 152], [19, 168], [-19, 168]])];
  return [[path(blade, 10, true), GROUND], [[poly(blade)], STEEL_DARK], [[poly(lit)], STEEL_LIGHT], [[poly(map(m, [[0, -62], [13, -36], [0, -10], [-13, -36]]))], BRASS],
    [[...path(guard, 34), disc(...k1, 18), disc(...k2, 18)], GROUND], [[...path(guard, 22), disc(...k1, 15), disc(...k2, 15)], BRASS],
    [[...path(grip, 10, true), ...collars.flatMap((c) => path(c, 8, true))], GROUND], [[poly(grip)], BRASS_DARK], [collars.map(poly), BRASS],
    [[disc(...pommel, 37)], GROUND], [[disc(...pommel, 33)], BRASS], [[disc(...pommel, 12)], GROUND]];
}

// The shield's layers: the outline, the darker rim, the field inside it, the boss at the apex, then
// the V with a bevel shadow a few units down and right.
function shield() {
  const rim = map(SHIELD_AT, SHIELD);
  const field = map(chain(SHIELD_AT, translate(512, 518), scale(0.925), translate(-512, -518)), SHIELD);
  const boss = map(SHIELD_AT, [[512, 92], [534, 122], [512, 152], [490, 122]]);
  const glyph = contours(LETTER);
  return [[path(rim, 10, true), GROUND], [[poly(rim)], BRASS_DARK], [path(field, 8, true), GROUND], [[poly(field)], BRASS],
    [path(boss, 10, true), GROUND], [[poly(boss)], BRASS], [[poly(map(SHIELD_AT, [[512, 108], [522, 122], [512, 136], [502, 122]]))], GROUND],
    [glyph.map((c) => poly(map(chain(SHIELD_AT, translate(6, 6)), c))), BRASS_DARK], [glyph.map((c) => poly(map(SHIELD_AT, c))), GROUND]];
}

// The crest as a size x size pre-colored image on a clear canvas: the swords behind the shield.
export function crestIcon(size = 64) {
  const layers = [...sword(swordAt(-33)), ...sword(swordAt(33)), ...shield()];
  return layers.reduce((img, [shapes, rgb]) => draw(img, 1024, shapes, rgb), image(size, size));
}
