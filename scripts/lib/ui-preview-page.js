// Runs in the preview page (injected by ui-preview.mjs). Resolves the anchors
// the addon's Lua recorded, then draws flat absolutely-positioned divs in
// strata / layer order. Returns measured font string heights.
/* global document, window */

const FONTS = {
  GameFontNormal: [12, [1, 0.82, 0]],
  GameFontNormalSmall: [10, [1, 0.82, 0]],
  GameFontNormalLarge: [16, [1, 0.82, 0]],
  GameFontNormalHuge: [20, [1, 0.82, 0]],
  GameFontHighlight: [12, [1, 1, 1]],
  GameFontHighlightSmall: [10, [1, 1, 1]],
  GameFontHighlightLarge: [16, [1, 1, 1]],
  GameFontDisable: [12, [0.5, 0.5, 0.5]],
  GameFontDisableSmall: [10, [0.5, 0.5, 0.5]],
  ChatFontNormal: [14, [1, 1, 1]],
};
const STRATA = { BACKGROUND: 0, LOW: 1, MEDIUM: 2, HIGH: 3, DIALOG: 4, FULLSCREEN: 5, FULLSCREEN_DIALOG: 6, TOOLTIP: 7 };
const LAYER = { BACKGROUND: 0, BORDER: 1, ARTWORK: 2, OVERLAY: 3, HIGHLIGHT: 4 };
// Regions draw in their frame's layers; everything else is a frame.
const REGIONS = new Set(["Texture", "FontString", "Line"]);

// A WoW color { r, g, b, a } as CSS rgba, alpha scaled by a.
const rgba = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${(c[3] ?? 1) * a})`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// WoW text escapes as HTML: |cffRRGGBB ... |r colors, |n newline, || literal bar.
function wowText(s) {
  return esc(String(s ?? ""))
    .replace(/\|\|/g, "\u0000")
    .replace(/\|n/g, "\n")
    .replace(/\|c[0-9a-fA-F]{2}([0-9a-fA-F]{6})/g, '<span style="color:#$1">')
    .replace(/\|r/g, "</span>")
    .replace(/\u0000/g, "|");
}

// The frame's ancestors, parent first.
function ancestors(ctx, f) {
  const out = [];
  for (let w = ctx.byId.get(f.parent); w; w = ctx.byId.get(w.parent)) out.push(w);
  return out;
}

// Shown only if it and every ancestor are shown.
const shown = (ctx, f) => [f, ...ancestors(ctx, f)].every((w) => w.shown);
// The nearest strata set on it or an ancestor (MEDIUM by default).
const strataOf = (ctx, f) => STRATA[[f, ...ancestors(ctx, f)].find((w) => w.strata)?.strata] ?? 2;
// The nearest ancestor that clips it: a scroll frame, or a frame with SetClipsChildren(true).
const scrollParent = (ctx, f) => ancestors(ctx, f).find((w) => w.kind === "ScrollFrame" || w.clips) || null;

// The page font for a font file: ForeverUI's bundled weights, else the default.
const fontFamily = (file) => {
  const f = file || "";
  return /Cinzel/.test(f) ? '"FUI-Cinzel"' : /Metamorphous/.test(f) ? '"FUI-Metamorphous"' : /SemiBold/.test(f) ? '"FUI-SemiBold"' : /FiraSans/.test(f) ? '"FUI-Medium"' : "";
};

// A font string's size, line height, color and family.
function fontStyle(f) {
  const [templateSize, color] = FONTS[f.template] || FONTS.GameFontNormal;
  const size = f.fontSize || templateSize;
  return { fontSize: `${size}px`, lineHeight: `${Math.round(size * 1.2)}px`, color: rgba(f.textColor || color), fontFamily: fontFamily(f.fontPath) };
}

// A DOM node for a font string: font size, color, alignment, width and text.
function fontNode(f) {
  const el = document.createElement("div");
  // An OUTLINE font flag draws a 1 px black ring around the glyphs, as the client does.
  el.className = /OUTLINE/.test(f.fontFlags || "") ? "fs outline" : "fs";
  Object.assign(el.style, fontStyle(f));
  el.style.textAlign = { CENTER: "center", RIGHT: "right" }[f.justifyH] || "left";
  if (f.width) el.style.width = `${f.width}px`;
  if (f.noWrap) Object.assign(el.style, { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
  el.innerHTML = wowText(f.text);
  return el;
}

// Renders a font string off-screen and records its natural size (and height if it has text).
function measure(ctx, f, measured) {
  const el = fontNode(f);
  Object.assign(el.style, { position: "absolute", visibility: "hidden" });
  ctx.stage.appendChild(el);
  const box = el.getBoundingClientRect();
  ctx.natural.set(f.id, { width: f.width || box.width, height: f.text ? box.height : 0 });
  if (f.text) measured[f.id] = box.height;
  el.remove();
}

// The width and height a frame asks for (font strings: their measured size).
function size(ctx, f) {
  if (f.kind === "FontString") return ctx.natural.get(f.id);
  if (f.template === "UIPanelCloseButton") return { width: f.width || 32, height: f.height || 32 };
  return { width: f.width || 0, height: f.height || 0 };
}

// The frame's anchor points; a scroll child with none sits at its scroll frame's top left.
function pointsOf(ctx, f) {
  if (f.points.length) return f.points;
  const owner = ctx.frames.find((o) => o.scrollChild === f.id);
  return [{ point: "TOPLEFT", rel: owner ? owner.id : f.parent, relPoint: "TOPLEFT", x: 0, y: 0 }];
}

// Screen position of a named point (TOPLEFT, CENTER...) on a rect.
function pointOn(rr, rp) {
  const x = rp.includes("LEFT") ? rr.left : rp.includes("RIGHT") ? rr.left + rr.width : rr.left + rr.width / 2;
  const y = rp.startsWith("TOP") ? rr.top : rp.startsWith("BOTTOM") ? rr.top + rr.height : rr.top + rr.height / 2;
  return { x, y };
}

// Horizontal and vertical edges one anchor pins: [["L"|"R"|"C", x]], [["T"|"B"|"C", y]].
function anchorEdges(ctx, p) {
  const at = pointOn(rectOf(ctx, ctx.byId.get(p.rel)), p.relPoint || p.point);
  const h = p.point.includes("LEFT") ? "L" : p.point.includes("RIGHT") ? "R" : "C";
  const v = p.point.startsWith("TOP") ? "T" : p.point.startsWith("BOTTOM") ? "B" : "C";
  return { h: [h, at.x + (p.x || 0)], v: [v, at.y - (p.y || 0)] };
}

// Start and extent along one axis from the pinned edges; unpinned sides use the asked extent.
function solve(list, extent, lo, hi) {
  const a = list.find(([k]) => k === lo);
  const b = list.find(([k]) => k === hi);
  if (a && b) return [a[1], b[1] - a[1]];
  if (a) return [a[1], extent];
  if (b) return [b[1] - extent, extent];
  const c = list.find(([k]) => k === "C");
  return [(c ? c[1] : 0) - extent / 2, extent];
}

// Resolves a frame's anchors into a rect.
function anchoredRect(ctx, f) {
  const edges = pointsOf(ctx, f).map((p) => anchorEdges(ctx, p));
  const { width, height } = size(ctx, f);
  const [left, w] = solve(edges.map((e) => e.h), width, "L", "R");
  const [top, h] = solve(edges.map((e) => e.v), height, "T", "B");
  return { left, top, width: w, height: h };
}

// A recorded number. A preview "secret" ({ __secret, n }) draws as the number it hides,
// as the client's own bars do; anything else unknown counts as the fallback.
const num = (v, fallback) => (v && typeof v === "object" ? v.n ?? fallback : v ?? fallback);

// How full a status bar is (0-1), from its recorded value and range.
function shareOf(bar) {
  const min = num(bar.min, 0), range = num(bar.max, 1) - min;
  return range > 0 ? Math.max(0, Math.min(1, (num(bar.value, 0) - min) / range)) : 0;
}

// A status bar's fill texture: the bar's rect cut to the value's share (from the left).
function fillRect(ctx, f) {
  const bar = ctx.byId.get(f.parent);
  const r = rectOf(ctx, bar);
  return { left: r.left, top: r.top, width: r.width * shareOf(bar), height: r.height };
}

// A frame's screen rect, cached. nil and UIParent are the whole screen.
function rectOf(ctx, f) {
  if (!f || f.name === "UIParent") return { left: 0, top: 0, width: ctx.screen.width, height: ctx.screen.height };
  if (ctx.rects.has(f.id)) return ctx.rects.get(f.id);
  ctx.rects.set(f.id, { left: 0, top: 0, width: 0, height: 0 }); // breaks anchor cycles
  const r = f.barFill ? fillRect(ctx, f) : anchoredRect(ctx, f);
  ctx.rects.set(f.id, r);
  return r;
}

// Styles a node as the arrow: rotated to the texture's rotation, tinted by its vertex color.
function styleArrow(el, f) {
  el.className = "arrow";
  el.style.transform = `rotate(${-(f.rotation || 0)}rad)`;
  if (f.vertexColor) el.style.setProperty("--arrow", rgba(f.vertexColor));
}

// Game art the preview doesn't have (icons, Blizzard textures): a dashed tile, tinted.
function stylePlaceholder(el, f) {
  Object.assign(el, { className: "tex", title: f.texture });
  if (f.vertexColor) el.style.background = rgba(f.vertexColor, 0.35);
}

// Stand-ins for the client's raid marks (the preview has no game art): [text, color].
const RAID_ICONS = [["★", "#ffe23a"], ["●", "#ff9a1f"], ["◆", "#d45cff"], ["▲", "#3ee03e"], ["☾", "#c8d8e8"], ["■", "#3a8cff"], ["✖", "#ff3a3a"], ["☠", "#f5f5f5"]];
const GLYPHS = [
  [/ReadyCheck-Ready/, ["✔", "#3ee03e"]], [/ReadyCheck-NotReady/, ["✖", "#ff3a3a"]], [/ReadyCheck-Waiting/, ["?", "#ffd23a"]],
  [/Raid-Icon-Rez/, ["✚", "#8cf08c"]], [/LeaderIcon/, ["♛", "#ffd23a"]], [/AssistantIcon/, ["♦", "#e0e0e0"]],
];

// The stand-in glyph for a raid mark texture (raid icons by their sheet cell), or undefined.
function glyphFor(f) {
  if (/UI-RaidTargetingIcons/.test(f.texture) && f.texCoord) return RAID_ICONS[Math.round(f.texCoord[0] * 4) + Math.round(f.texCoord[2] * 4) * 4];
  return GLYPHS.find(([re]) => re.test(f.texture))?.[1];
}

// Draws a raid mark as its glyph, sized to the texture.
function styleGlyph(el, f, [text, color]) {
  el.className = "glyph";
  el.textContent = text;
  Object.assign(el.style, { color, fontSize: `${Math.max(8, (f.height || 12) - 1)}px` });
}

// Game art: a raid mark's glyph, or a dashed placeholder.
function styleArt(el, f) {
  const glyph = glyphFor(f);
  if (glyph) return styleGlyph(el, f, glyph);
  stylePlaceholder(el, f);
}

// ForeverUI's art by game path ("Textures\\Bar"), set for each draw.
let MEDIA = {};

// CSS mask size and position that show only texcoords [left, right, top, bottom] of an image.
function maskCrop(tc) {
  const [l, r, t, b] = tc || [0, 1, 0, 1];
  // One axis: the offset as CSS wants it for a mask larger than the box.
  const pos = (start, span) => (span >= 1 ? 0 : (start / (1 - span)) * 100);
  return { size: `${100 / (r - l)}% ${100 / (b - t)}%`, position: `${pos(l, r - l)}% ${pos(t, b - t)}%` };
}

// Our own art: the image's alpha (cropped to its texcoords) as a mask over
// its own color times the vertex color, as the game tints it.
function styleMedia(el, f, art) {
  const { size, position } = maskCrop(f.texCoord);
  const v = f.vertexColor || [1, 1, 1, 1];
  const color = [art.rgb[0] * v[0], art.rgb[1] * v[1], art.rgb[2] * v[2], v[3] ?? 1];
  const mask = { maskImage: `url(${art.url})`, maskSize: size, maskPosition: position, maskRepeat: "no-repeat" };
  Object.assign(el.style, { backgroundColor: rgba(color), ...mask, webkitMaskImage: mask.maskImage, webkitMaskSize: size, webkitMaskPosition: position });
}

// The preview art ({ url, rgb }) for one of ForeverUI's textures, if the path is one.
const mediaUrl = (texture) => MEDIA[(/ForeverUI\\Media\\(.+)$/.exec(texture || "") || [])[1]];

// A texture node: flat color (a color texture, or tinted WHITE8X8), the arrow shape, or a dashed placeholder for game art.
function textureNode(f) {
  const el = document.createElement("div");
  const flat = f.color || (/WHITE8X8/.test(f.texture || "") && (f.vertexColor || [1, 1, 1, 1]));
  if (flat) {
    el.style.background = rgba(flat);
  } else if (/MinimapArrow/.test(f.texture || "")) {
    styleArrow(el, f);
  } else if (f.texture) {
    styleImage(el, f);
  }
  return el;
}

// A file texture: ForeverUI's own art (tinted), or a stand-in for game art.
function styleImage(el, f) {
  const url = mediaUrl(f.texture);
  if (url) styleMedia(el, f, url);
  else styleArt(el, f);
}

// Our grayscale bar texture (Bar or BarSoft) multiplied into a fill's color, as the game tints it.
function shadeFill(fill, f) {
  const art = /Textures\\Bar(Soft)?$/.test(f.barTexture || "") && mediaUrl(f.barTexture);
  if (art) Object.assign(fill.style, { backgroundImage: `url(${art.url})`, backgroundSize: "100% 100%", backgroundBlendMode: "multiply" });
}

// A status bar's fill: the recorded value as a share of its range, in its bar color.
function addFill(el, f) {
  const share = shareOf(f);
  const fill = document.createElement("div");
  Object.assign(fill.style, { position: "absolute", left: 0, top: 0, bottom: 0, width: `${share * 100}%`, background: rgba(f.barColor || [0.5, 0.5, 0.5, 1]) });
  shadeFill(fill, f);
  el.appendChild(fill);
}

// The last chat lines a message frame holds, newest at the bottom.
function addMessages(el, f) {
  el.className = "chat";
  for (const line of (f.messages || []).slice(-12)) {
    const row = document.createElement("div");
    row.innerHTML = wowText(line);
    el.appendChild(row);
  }
}

// Frame kinds drawn specially: status bars, the minimap and chat windows.
const SPECIAL = {
  StatusBar: addFill,
  // The minimap: a painted stand-in for the map with a player arrow.
  Minimap: (el) => { el.className = "map"; },
  ScrollingMessageFrame: addMessages,
};

// Styles a frame that has a backdrop: fill and border colors.
function styleBackdrop(el, f) {
  el.className = "backdrop";
  if (f.backdropColor) el.style.background = rgba(f.backdropColor);
  if (f.borderColor) el.style.borderColor = rgba(f.borderColor);
}

// A frame node: close button, backdrop, special kinds, or a plain box.
function frameNode(f) {
  const el = document.createElement("div");
  if (SPECIAL[f.kind]) {
    SPECIAL[f.kind](el, f);
  } else if (f.template === "UIPanelCloseButton") {
    el.className = "close";
  } else if (f.backdrop) {
    styleBackdrop(el, f);
  }
  return el;
}

// Adds a stand-in scroll bar beside a scroll frame.
function addScrollBar(el, r) {
  const bar = document.createElement("div");
  bar.className = "scrollbar";
  Object.assign(bar.style, { left: `${r.width + 6}px`, height: `${r.height}px` });
  el.appendChild(bar);
}

// The DOM node for any widget kind.
function nodeFor(f, r) {
  if (f.kind === "FontString") return fontNode(f);
  const el = f.kind === "Texture" ? textureNode(f) : frameNode(f);
  if (f.template === "UIPanelScrollFrameTemplate") addScrollBar(el, r);
  return el;
}

// Stacking order: strata, then frame level (a region uses its frame's), then
// draw layer, as the client does. A frame sits below its own regions; a child
// frame (one level up by default) sits above its parent's regions.
function zIndexOf(ctx, f) {
  const region = REGIONS.has(f.kind);
  // A status bar's node is its fill, which the client draws in the ARTWORK layer.
  const layer = f.kind === "StatusBar" ? LAYER.ARTWORK + 1 : region ? (LAYER[f.layer] ?? 2) + 1 : 0;
  const owner = region ? ctx.byId.get(f.parent) : f;
  const level = owner?.level ?? ancestors(ctx, f).length - (region ? 1 : 0);
  return strataOf(ctx, f) * 10000 + level * 10 + layer;
}

// Clips a node to the rect of the frame that clips it.
function clipTo(ctx, el, r, clip) {
  const c = rectOf(ctx, clip);
  const inset = [c.top - r.top, r.left + r.width - (c.left + c.width), r.top + r.height - (c.top + c.height), c.left - r.left];
  el.style.clipPath = `inset(${inset.map((v) => `${Math.max(0, v)}px`).join(" ")})`;
}

// Its alpha times every ancestor's, as the client fades a frame's children with it.
const alphaOf = (ctx, f) => [f, ...ancestors(ctx, f)].reduce((a, w) => a * (w.alpha ?? 1), 1);

// Draws one widget at its rect.
function draw(ctx, f) {
  const r = rectOf(ctx, f);
  const el = nodeFor(f, r);
  Object.assign(el.style, { position: "absolute", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  el.style.opacity = alphaOf(ctx, f);
  el.style.zIndex = zIndexOf(ctx, f);
  const clip = scrollParent(ctx, f);
  if (clip) clipTo(ctx, el, r, clip);
  ctx.stage.appendChild(el);
}

// Whether a widget is drawn: shown, not UIParent, and font strings only with text.
// Hover highlights and unchecked "checked" textures only show in game on interaction.
const drawable = (ctx, f) =>
  f.name !== "UIParent" && shown(ctx, f) && !(f.kind === "FontString" && !f.text) &&
  f.layer !== "HIGHLIGHT" && !(f.checkedTexture && !ctx.byId.get(f.parent)?.checked) && !f.barFill;

// Measures every font string, then draws every drawable widget. Returns the measured heights.
// Lower sublevels go in first, so within a layer they sit under higher ones (as in game).
window.wfgLayoutAndDraw = function layoutAndDraw({ frames, screen, media }) {
  MEDIA = media || {};
  const ctx = { frames, screen, byId: new Map(frames.map((f) => [f.id, f])), stage: document.getElementById("stage"), rects: new Map(), natural: new Map() };
  const measured = {};
  frames.filter((f) => f.kind === "FontString").forEach((f) => measure(ctx, f, measured));
  // Orders two widgets by draw sublevel (the sort is stable, so ties keep creation order).
  const bySublevel = (a, b) => (a.sublevel ?? 0) - (b.sublevel ?? 0);
  frames.filter((f) => drawable(ctx, f)).sort(bySublevel).forEach((f) => draw(ctx, f));
  return measured;
};
