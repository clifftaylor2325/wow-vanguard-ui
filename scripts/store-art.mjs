// Store, Discord and X art (npm run store-art): the painted crest (art/painted/icon/C2.png) beside the "VANGUARD"
// wordmark in Cinzel (art/fonts) on the welcome banner's dusk landscape (art/painted/colour/B1.png), written as PNGs to
// dist/store-art/. Nothing here ships in the addon; the sizes are common slots (a 3:1 header, a 16:9 banner, square
// logos and an avatar), so check each site's own size before uploading.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "dist", "store-art");

// The pictures, as data URLs, and the shield's box inside the crest's 960 x 960 canvas (it is centred, 679 x 876).
const dataUrl = (file) => `data:image/png;base64,${fs.readFileSync(path.join(root, file)).toString("base64")}`;
const LANDSCAPE = dataUrl("art/painted/colour/B1.png");
const CREST = dataUrl("art/painted/icon/C2.png");
const SHIELD = { canvas: 960, w: 679, h: 876 };

// The wordmark, the line under it and their colours (the theme's brass, lightened, and a cool white).
const WORDMARK = { name: "VANGUARD", tag: "A UI SUITE FOR WOW FOREVER", gold: "#e9c874", white: "#dfe3ea" };

// The crest placed with the shield's top-left at (x, y) and its height h.
function crest(x, y, h) {
  const side = (h * SHIELD.canvas) / SHIELD.h, inset = (side - (h * SHIELD.w) / SHIELD.h) / 2;
  return `<image x="${x - inset}" y="${y - (side - h) / 2}" width="${side}" height="${side}" href="${CREST}"/>`;
}

// The wordmark and its line, left-aligned at x, centred on y, sized by k (1 at 1500 wide). The renderer draws the
// variable Cinzel at its default weight only, so a stroke in the fill colour thickens it to about Bold and Medium (and a little more letter spacing makes up the bold width).
function wordmark(x, y, k) {
  const name = `<text x="${x}" y="${y + 6 * k}" font-family="Cinzel" font-weight="700" font-size="${84 * k}" letter-spacing="${8 * k}" fill="${WORDMARK.gold}" stroke="${WORDMARK.gold}" stroke-width="${3.6 * k}">${WORDMARK.name}</text>`;
  return `${name}<text x="${x + 4 * k}" y="${y + 56 * k}" font-family="Cinzel" font-weight="500" font-size="${24 * k}" letter-spacing="${4 * k}" fill="${WORDMARK.white}" stroke="${WORDMARK.white}" stroke-width="${0.9 * k}">${WORDMARK.tag}</text>`;
}

// The landscape cropped to [x, y, w, h] of its 2048 x 1024 picture, filling W x H, darkened towards the left for the text.
function landscape(W, H, [cx, cy, cw, ch]) {
  const shade = `<linearGradient id="shade" x1="0" x2="1"><stop offset="0" stop-color="#0b0d11" stop-opacity="0.72"/><stop offset="0.5" stop-color="#0b0d11" stop-opacity="0.25"/><stop offset="0.75" stop-color="#0b0d11" stop-opacity="0"/></linearGradient>`;
  const picture = `<svg width="${W}" height="${H}" viewBox="${cx} ${cy} ${cw} ${ch}" preserveAspectRatio="xMidYMid slice"><image width="2048" height="1024" href="${LANDSCAPE}"/></svg>`;
  return `<defs>${shade}</defs>${picture}<rect width="${W}" height="${H}" fill="url(#shade)"/>`;
}

// A wide banner, W x H, from the landscape crop `box`: the crest on the left, the wordmark beside it.
function banner(W, H, box) {
  const k = W / 1500, h = 330 * k, x = W * 0.05;
  const body = landscape(W, H, box) + crest(x, (H - h) / 2, h) + wordmark(x + (h * SHIELD.w) / SHIELD.h + 50 * k, H / 2, k);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
}

// A square logo on 1024 units: the crest centred at 86% of the height, on the theme's slate or on nothing.
function logo(ground) {
  const h = 1024 * 0.86, fillRect = ground ? `<rect width="1024" height="1024" fill="${ground}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${fillRect}${crest((1024 - (h * SHIELD.w) / SHIELD.h) / 2, (1024 - h) / 2, h)}</svg>`;
}

// Every file this writes: name -> [svg, width in pixels].
const FILES = {
  "banner-3x1-1500x500.png": [banner(1500, 500, [0, 60, 2048, 683]), 1500],
  "banner-3x1-1920x640.png": [banner(1920, 640, [0, 60, 2048, 683]), 1920],
  "banner-16x9-1920x1080.png": [banner(1920, 1080, [228, 0, 1820, 1024]), 1920],
  "logo-1024.png": [logo("#0b0d11"), 1024],
  "logo-512.png": [logo("#0b0d11"), 512],
  "avatar-400.png": [logo("#0b0d11"), 400],
  "logo-1024-transparent.png": [logo(null), 1024],
};

// Renders one SVG to a PNG at `width` pixels wide, with Cinzel as the only font.
function render(svg, width) {
  const font = { fontFiles: [path.join(root, "art", "fonts", "Cinzel[wght].ttf")], loadSystemFonts: false, defaultFontFamily: "Cinzel" };
  return new Resvg(svg, { font, fitTo: { mode: "width", value: width } }).render().asPng();
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, [svg, width]] of Object.entries(FILES)) fs.writeFileSync(path.join(OUT, name), render(svg, width));
console.log(`wrote ${Object.keys(FILES).length} files to ${path.relative(root, OUT)}/`);
