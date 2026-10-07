// Art from game-icons.net SVGs (art/game-icons, CC BY 3.0; credits in
// art/CREDITS.md) rasterized to white glyphs on transparency, so the addon can
// tint them with the theme's colors: the faction look's crests (Media/Art) and
// the filled icons of the options nav and the minimap's slot buttons (Media/Icons).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { image, fill } from "./media-art.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// The crests the faction look ships (Media/Art/<name>.tga): the Alliance's, then the Horde's.
export const CRESTS = ["lorc-crossed-swords", "lorc-crossed-axes"];

// Every crest source on disk, by name ("lorc-lion").
export function crestNames() {
  return fs.readdirSync(path.join(root, "art/game-icons")).filter((f) => f.endsWith(".svg")).map((f) => f.slice(0, -4)).sort();
}

// A crest's SVG with its black backing square dropped and the glyph white.
export function crestSvg(name) {
  const svg = fs.readFileSync(path.join(root, "art/game-icons", `${name}.svg`), "utf8");
  return svg.replace('<path d="M0 0h512v512H0z"/>', "").replace(/fill="#[0-9a-fA-F]{3,6}"/g, 'fill="#fff"');
}

// A crest as a size x size image: white, its alpha the glyph's coverage.
export function crest(name, size = 64) {
  const png = new Resvg(crestSvg(name), { fitTo: { mode: "width", value: size } }).render();
  const img = image(png.width, png.height);
  const rgba = png.pixels;
  for (let i = 0; i < png.width * png.height; i++) img.px.set([1, 1, 1, rgba[i * 4 + 3] / 255], i * 4);
  return img;
}

// A glyph as a size x size icon with `inset` clear pixels on every side (one grid unit at 2x, the
// air the line icons leave): the glyph rendered to fit, laid on a white, clear canvas (white under
// the clear pixels too, so the edge doesn't darken when the game scales it).
export function glyph(name, inset = 2, size = 32) {
  const small = crest(name, size - 2 * inset);
  const img = fill(image(size, size), () => [1, 1, 1, 0]);
  for (let y = 0; y < small.h; y++) img.px.set(small.px.subarray(y * small.w * 4, (y + 1) * small.w * 4), ((y + inset) * size + inset) * 4);
  return img;
}
