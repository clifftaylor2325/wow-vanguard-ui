// UI preview: lays out the frames the addon's real Lua built (recorded by
// wow-stub.lua) in a browser page. Layout (points, sizes, text, colors,
// bar values, show/hide) comes from the addon. Blizzard art, spell icons,
// the map and the game font are not available here, so they are approximations.
// ForeverUI's own art and fonts (Media/) are real: drawn from their sources.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { png } from "./media-art.mjs";
import { MEDIA } from "./media-sources.mjs";

export const SCREEN = { width: 1920, height: 1080 };

// Serialize every recorded widget. Widget references become ids.
const DUMP_LUA = `
local out = {}
local function ref(w) return type(w) == "table" and w.__id or nil end
for i, w in ipairs(__wfgStub.frames) do
  local points = {}
  for _, p in pairs(w.__points or {}) do
    points[#points + 1] = { point = p.point, rel = ref(p.rel), relPoint = p.relPoint, x = p.x, y = p.y }
  end
  out[i] = {
    id = w.__id, kind = w.__kind, name = w.__name, parent = ref(w.__parent),
    template = w.__template, layer = w.__layer, sublevel = w.__sublevel, shown = w.__shown,
    level = w.__kind ~= "Texture" and w.__kind ~= "FontString" and w:GetFrameLevel() or nil,
    width = w.__width, height = w.__height, points = points,
    text = w.__text, textColor = w.__textColor, justifyH = w.__justifyH,
    backdrop = w.__backdrop and true or false, backdropColor = w.__backdropColor,
    borderColor = w.__borderColor, texture = w.__texture, color = w.__color,
    vertexColor = w.__vertexColor, alpha = w.__alpha, rotation = w.__rotation, texCoord = w.__texCoord,
    strata = w.__strata, scrollChild = ref(w.__scrollChild), clips = w.__clips,
    fontSize = w.__font and w.__font[2], fontPath = w.__font and w.__font[1], fontFlags = w.__font and w.__font[3], value = w.__value, min = w.__min, max = w.__max,
    barColor = w.__barColor, barTexture = w.__barTexture and w.__barTexture.__texture, messages = w.__messages, checked = w.__checked,
    checkedTexture = w.__parent ~= nil and w.__parent.__checkedTexture == w or nil,
    barFill = w.__parent ~= nil and w.__parent.__barTexture == w or nil,
    noWrap = w.__noWrap,
  }
end
return out`;

// Every widget the addon built, as plain JS (see DUMP_LUA).
export function dumpFrames(addon) {
  return addon.eval(DUMP_LUA) || [];
}

// ForeverUI's fonts as @font-face rules, so previews use the real typeface.
function fontFaces() {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "Media", "Fonts");
  const files = { Medium: "FiraSansCondensed-Medium", SemiBold: "FiraSansCondensed-SemiBold", Cinzel: "Cinzel-SemiBold", Metamorphous: "Metamorphous-Regular" };
  return Object.entries(files).map(([name, file]) => {
    const data = fs.readFileSync(path.join(dir, `${file}.ttf`)).toString("base64");
    return `@font-face{font-family:"FUI-${name}";src:url(data:font/ttf;base64,${data})}`;
  }).join("");
}

// The color of an image's most opaque pixel (our art is one color plus alpha).
function baseColor(img) {
  let best = 0;
  for (let i = 0; i < img.w * img.h; i++) if (img.px[i * 4 + 3] > img.px[best * 4 + 3]) best = i;
  return [img.px[best * 4], img.px[best * 4 + 1], img.px[best * 4 + 2]];
}

// ForeverUI's art as { url (PNG data URI), rgb }, keyed like the game path ("Textures\\Bar").
function mediaUris() {
  return Object.fromEntries(Object.entries(MEDIA).map(([rel, make]) => {
    const img = make();
    return [rel.replace(/\.tga$/, "").replace("/", "\\"), { url: `data:image/png;base64,${png(img).toString("base64")}`, rgb: baseColor(img) }];
  }));
}

let media = null;

// Layout and drawing run in the page: ui-preview-page.js.
const PAGE_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "ui-preview-page.js");

const PAGE_CSS = `
  ${fontFaces()}
  html,body{margin:0;background:#0b0d12}
  #stage{position:relative;width:${SCREEN.width}px;height:${SCREEN.height}px;overflow:hidden;
    font-family:"DejaVu Sans",sans-serif;
    background:
      radial-gradient(ellipse at 30% 110%, #2c3b24 0%, transparent 60%),
      radial-gradient(ellipse at 80% 100%, #23301f 0%, transparent 55%),
      linear-gradient(#34465e 0%, #5d6f7c 45%, #3d4a35 62%, #232c1d 100%)}
  .fs{white-space:pre-wrap;text-shadow:1px 1px 0 #000;overflow-wrap:break-word}
  .fs.outline{text-shadow:-1px -1px 0 #000,0 -1px 0 #000,1px -1px 0 #000,-1px 0 0 #000,1px 0 0 #000,-1px 1px 0 #000,0 1px 0 #000,1px 1px 0 #000}
  .backdrop{box-sizing:border-box;border:3px solid #6c6c6c;border-radius:5px;
    box-shadow:inset 0 0 0 1px rgba(0,0,0,.6),0 2px 10px rgba(0,0,0,.5)}
  .close{box-sizing:border-box;margin:6px;width:20px!important;height:20px!important;border-radius:3px;
    background:linear-gradient(#b3261e,#6d140f);border:1px solid #d9b25a}
  .close::after{content:"\\00d7";color:#f3d27a;font:bold 16px/18px sans-serif;display:block;text-align:center}
  .scrollbar{position:absolute;top:0;width:10px;border-radius:5px;background:rgba(255,255,255,.08)}
  .scrollbar::after{content:"";position:absolute;left:1px;top:2px;width:8px;height:40%;border-radius:4px;background:rgba(210,180,90,.55)}
  .arrow{--arrow:#3cd65a;background:var(--arrow);clip-path:polygon(50% 4%,88% 88%,50% 70%,12% 88%);
    filter:drop-shadow(0 0 2px #000)}
  .tex{outline:1px dashed rgba(255,255,255,.35)}
  .glyph{display:flex;align-items:center;justify-content:center;font-weight:bold;text-shadow:0 0 2px #000,0 0 2px #000}
  .map{background:radial-gradient(circle at 45% 40%,#4d6b3c 0%,#35502c 35%,#2a3f28 60%,#223322 100%)}
  .map::after{content:"";position:absolute;left:50%;top:50%;width:0;height:0;margin:-7px 0 0 -5px;
    border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:12px solid #f5f5f5}
  .chat{box-sizing:border-box;padding:4px 6px;display:flex;flex-direction:column;justify-content:flex-end;
    font:13px/17px "DejaVu Sans",sans-serif;color:#fff;text-shadow:1px 1px 0 #000;overflow:hidden}
  #caption{position:absolute;left:10px;top:8px;z-index:99999;font:11px "DejaVu Sans",sans-serif;
    color:rgba(255,255,255,.75);background:rgba(0,0,0,.55);padding:4px 8px;border-radius:4px}
  `;

// The stage's size and zoom for a canvas: a UI scale 1.0 canvas (1365 x 768
// units) is zoomed to fill the same 1920 x 1080 image, as it does on a 1080p screen.
function stageStyle(screen) {
  const zoom = SCREEN.width / screen.width;
  return `width:${screen.width}px;height:${screen.height}px;transform:scale(${zoom});transform-origin:0 0`;
}

// The preview page: a screen-sized stage with the caption in the corner.
export function pageHtml(caption, screen = SCREEN) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${PAGE_CSS}</style></head><body><div id="stage" style="${stageStyle(screen)}"><div id="caption">${caption}</div></div></body></html>`;
}

// Loads a fresh page, draws the addon's frames, and returns the measured text heights.
async function drawPage(page, addon, caption, screen = SCREEN) {
  await page.setContent(pageHtml(caption, screen));
  await page.addScriptTag({ path: PAGE_SCRIPT });
  media = media || mediaUris();
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate((args) => window.wfgLayoutAndDraw(args), { frames: dumpFrames(addon), screen, media });
}

// Two passes: the first measures text, the second lets the addon size its
// frames from those measurements, the same way GetStringHeight does in game.
export async function renderScene(page, addon, { caption, relayout, file, screen = SCREEN }) {
  const measured = await drawPage(page, addon, caption, screen);
  const entries = Object.entries(measured).map(([id, h]) => `[${Number(id)}]=${Number(h)}`).join(",");
  addon.eval(`__wfgStub.stringHeights = {${entries}}`);
  relayout();
  await drawPage(page, addon, caption, screen);
  await page.locator("#stage").screenshot({ path: file });
}
