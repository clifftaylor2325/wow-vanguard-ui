// hudlayout: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs). The HUD layouts
// (Core/HudLayout.lua): the keep's wall and gatehouse and the Standards banners (Modules/UnitFrameLayouts.lua).

import { expect, it } from "vitest";
import { ACTIONS_ENV, CLICK_LUA, MICRO_ENV, RISE, STRIPS_ENV, TIDY_ENV, UI_ENV, UNITS_ENV, loggedIn, setCombat } from "./helpers.mjs";

// A 1920 x 1080 canvas with the client's percent curve, so a banner can show its percent.
const WIDE = "__wfgStub.setScreen(1920, 1080) CurveConstants = { ScaleTo100 = { Evaluate = function(_, x) return x * 100 end } }";

// A profile saved on a HUD layout, the raid frames off (so the unit frames alone stand around your character).
const onLayout = (layout) => ({ savedVariables: `VanguardDB = { profiles = { Default = { modules = { RaidFrames = false }, hudLayout = "${layout}" } } }` });

// Where a frame's point is pinned (TEST-ONLY reads): the frame it follows, that frame's point and the offsets.
const PIN_LUA = `local q = (%FRAME%).__points["%POINT%"]
  if not q then return "none" end
  local rel = q.rel and q.rel.GetName and q.rel:GetName() or tostring(q.rel)
  return rel .. " " .. q.relPoint .. " " .. math.floor(q.x * 100 + 0.5) / 100 .. " " .. math.floor(q.y * 100 + 0.5) / 100`;

// The pin of `frame`'s `point`.
const pin = (addon, frame, point) => addon.eval(PIN_LUA.replace("%FRAME%", frame).replace("%POINT%", point));

// A frame's width and height in whole units (a pixel-perfect size rounds).
const size = (addon, name) => addon.eval(`return { math.floor(${name}:GetWidth() + 0.5), math.floor(${name}:GetHeight() + 0.5) }`);

// Puts the canvas at w x h and lets the addon refit to it.
const canvas = (addon, w, h) => {
  addon.eval(`__wfgStub.setScreen(${w}, ${h})`);
  addon.fire("UI_SCALE_CHANGED"); addon.fire("DISPLAY_SIZE_CHANGED"); addon.advance(1);
};

// The game's bag and menu bar laid out with its 14 menu buttons (TEST-ONLY), as setuplayouts' whole HUD has it: 412
// units wide, 16 in from the bottom right corner.
const MENU_LUA = "__menuButtons(14) MicroMenuContainer:Layout() BagsBar:Layout()";

it("HUD layouts: a layout's spots win over the modules' defaults, a saved spot over both, a change forgets the saved spots of the layouts it leaves and enters, and the keep holds on wide canvases only", () => {
  const addon = loggedIn(WIDE + UNITS_ENV + UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV);
  const got = [];
  addon.eval("ns.OnLayoutChanged(function(layout) __layouts = (__layouts or '') .. layout .. ' ' end)");
  expect([addon.eval("return ns.HudLayout()"), addon.eval("return ns.HudLayoutChoices()"), addon.eval("return { ns.MoverPoint('uf_player') }")], "Centered by default: the modules' own spots, risen with the block").toEqual(["centered", [["centered", "Centered"], ["fort", "The keep"], ["standards", "Standards"]], ["BOTTOM", "BOTTOM", -240, 196 + RISE.frames]]);
  addon.eval("ns.SetHudLayout('fort')");
  got.push(addon.eval("return { VanguardDB.profiles.Default.hudLayout, ns.MoverPoint('uf_player') }"), addon.eval("return { ns.MoverPoint('chat') }"), addon.eval("return { ns.LayoutSize('uf_player') }"), addon.eval("return ns.LayoutSize('cast_target') == nil"));
  expect(got, "the keep: saved on the profile, your frame at the wall's left end (risen with the bars) and the chat over it (risen), a 200 x 40 frame, the cast bar its own size").toEqual([["fort", "BOTTOM", "BOTTOM", -378, 86 + RISE.under], ["BOTTOM", "BOTTOM", -392, 150 + RISE.frames], [200, 40], true]);
  addon.eval("ns.SetMoverPoint('uf_player', 'BOTTOM', 'BOTTOM', -300, 300)");
  expect(addon.eval("return { ns.MoverSaved('uf_player'), ns.MoverPoint('uf_player') }"), "a frame you moved stays put").toEqual([true, "BOTTOM", "BOTTOM", -300, 300]);
  addon.eval("ns.SetHudLayout('standards')");
  expect(addon.eval("return { ns.HudLayout(), ns.MoverSaved('uf_player'), ns.MoverPoint('uf_player') }"), "Standards: the saved spot is forgotten with the layout it was moved under; the banner's spot applies").toEqual(["standards", false, "BOTTOM", "BOTTOM", -140, 196 + RISE.frames]);
  addon.eval("ns.SetHudLayout('TEST-ONLY nowhere')");
  expect([addon.eval("return { ns.HudLayout(), tostring(VanguardDB.profiles.Default.hudLayout), ns.MoverPoint('uf_player') }"), addon.eval("return __layouts")], "a layout no release knows is Centered (nothing saved); every change told the listeners").toEqual([["centered", "nil", "BOTTOM", "BOTTOM", -240, 196 + RISE.frames], "fort standards centered "]);
  addon.eval("ns.SetHudLayout('fort')");
  canvas(addon, 1024, 768);
  expect([addon.eval("return ns.LayoutHolds()"), addon.eval("return { ns.MoverPoint('uf_player') }"), addon.eval("return ns.LayoutSize('uf_player') == nil")], "on a canvas too narrow for the keep it doesn't hold: the modules' spots and sizes").toEqual([false, ["BOTTOM", "BOTTOM", -240, 196], true]);
  addon.eval(MENU_LUA);
  canvas(addon, 1835, 768);
  expect([addon.eval("return ns.KeepNeed(1835)"), addon.eval("return ns.LayoutHolds()")], "the wall's right end (490 out) must clear the bag and menu bar's 428 in the corner: 1836 wide, so 1835 doesn't hold").toEqual([1836, false]);
  expect(addon.eval("local s = ns.MoverFrame('menustrip') s.GetLeft = function() return __wfgWorld.secret(1427) end local need = ns.KeepNeed(1835) s.GetLeft = nil return need"), "a bag and menu bar whose edge the client hides takes no room").toBe(1100);
  canvas(addon, 1836, 768);
  expect([addon.eval("return ns.LayoutHolds()"), addon.eval("return { ns.MoverPoint('uf_player') }")], "1836 wide holds it").toEqual([true, ["BOTTOM", "BOTTOM", -378, 86]]);
  addon.eval("ns.SetMoverPoint('menustrip', 'TOPRIGHT', 'TOPRIGHT', -16, -200)");
  canvas(addon, 1365, 768);
  expect([addon.eval("return ns.KeepNeed(1365)"), addon.eval("return ns.LayoutHolds()")], "the bag and menu bar dragged out of the corner: the keep holds on a 16:9 screen at the game's UI scale again").toEqual([1100, true]);
  canvas(addon, 1099, 768);
  expect(addon.eval("return ns.LayoutHolds()"), "but never under 1100 wide").toBe(false);
  addon.eval("__wfgStub.setScreen(1920, 1080) ns.SetHudLayout('standards')");
  expect(addon.eval("UIParent.GetWidth = function() return __wfgWorld.secret(1920) end local holds, w = ns.LayoutHolds(), ns.LayoutSize('uf_player') UIParent.GetWidth = nil return { holds, w }"), "Standards holds on any canvas, a hidden one too").toEqual([true, 40]);
});

it("HUD layouts: picking one forgets where a placed frame stood and what it was anchored to, and keeps its scale, opacity and matched size", () => {
  const addon = loggedIn(WIDE + UNITS_ENV);
  const set = addon.eval(`ns.SetMoverScale("cast_target", 1.2) ns.SetMoverAlpha("cast_target", 0.6)
    return { ns.SetMoverMatch("cast_target", "width", "uf_target"), ns.SetMoverAnchor("cast_target", "uf_target", "BOTTOM") }`);
  addon.eval("ns.SetMoverPoint('uf_player', 'BOTTOM', 'BOTTOM', -300, 300)");
  expect([set, addon.eval("return ns.MoverSaved('cast_target')")], "the target's cast bar matched to the target's width and anchored under it").toEqual([[true, true], true]);
  addon.eval("ns.SetHudLayout('fort')");
  expect(addon.eval(`local p = VanguardDB.profiles.Default.positions.cast_target
    return { ns.MoverSaved('cast_target'), p.rel == nil, p.match.width, p.scale, p.alpha, { ns.MoverPoint('cast_target') } }`),
  "the keep: its spot and its anchor link forgotten (the keep's spot applies), its scale, opacity and matched width kept").toEqual([false, true, "uf_target", 1.2, 0.6, ["BOTTOM", "BOTTOM", 368, 36 + RISE.under]]);
  expect(addon.eval("return { ns.MoverLook('cast_target') }"), "still drawn at its scale and opacity").toEqual([1.2, 0.6]);
  expect(addon.eval("return VanguardDB.profiles.Default.positions.uf_player == nil"), "a frame that had only a spot keeps no entry").toBe(true);
});

// How many shown one-pixel lines a frame draws (TEST-ONLY reads): its edges and its hairline's.
const thin = (addon, name) => addon.eval(`local f, T, n = ${name}, ns.Theme, 0
  for _, t in ipairs({ f:GetRegions() }) do if t:IsShown() and (t:GetWidth() == T.Pixel(f) or t:GetHeight() == T.Pixel(f)) then n = n + 1 end end
  return n`);

// The shown one-pixel lines pinned to a frame's bottom corners (TEST-ONLY reads): its bottom edge and hairline.
const bottoms = (addon, name) => addon.eval(`local f, T, n = ${name}, ns.Theme, 0
  for _, t in ipairs({ f:GetRegions() }) do if t:IsShown() and t:GetHeight() == T.Pixel(f) and t.__points.BOTTOMLEFT and t.__points.BOTTOMRIGHT then n = n + 1 end end
  return n`);

it("the keep: one wall on the background strata from your frame to your target's, the bars' top to the focus's foot, the brass parapet along its top, the gatehouse round your cast bar open where it meets the wall; the deck and keystone step aside; it goes on a narrow canvas and under Centered", () => {
  const addon = loggedIn(WIDE + UNITS_ENV + CLICK_LUA, onLayout("fort"));
  expect(addon.eval("return { Vanguard_Keep:IsShown(), Vanguard_Keep.__strata, Vanguard_Keep.gate:IsShown() }"), "the wall and gatehouse show").toEqual([true, "BACKGROUND", true]);
  expect([pin(addon, "Vanguard_Keep", "LEFT"), pin(addon, "Vanguard_Keep", "RIGHT"), pin(addon, "Vanguard_Keep", "TOP"), pin(addon, "Vanguard_Keep", "BOTTOM")], "the wall reaches 12 past your frame's left, your target's right, the first bar's top and the focus's bottom").toEqual(["Vanguard_player LEFT -12 0", "Vanguard_target RIGHT 12 0", "Vanguard_Bar1 TOP 0 12", "Vanguard_focus BOTTOM 0 -12"]);
  const px = addon.eval("return math.floor(ns.Theme.Pixel(Vanguard_Keep) * 100 + 0.5) / 100");
  expect([pin(addon, "Vanguard_Keep.gate", "LEFT"), pin(addon, "Vanguard_Keep.gate", "RIGHT"), pin(addon, "Vanguard_Keep.gate", "TOP"), pin(addon, "Vanguard_Keep.gate", "BOTTOM")], "the gatehouse reaches 12 past your cast bar's sides and top, its foot a pixel down over the wall's top border").toEqual(["Vanguard_CastBar_player LEFT -12 0", "Vanguard_CastBar_player RIGHT 12 0", "Vanguard_CastBar_player TOP 0 12", `Vanguard_Keep TOP 0 ${-px}`]);
  expect([thin(addon, "Vanguard_Keep"), bottoms(addon, "Vanguard_Keep"), thin(addon, "Vanguard_Keep.gate"), bottoms(addon, "Vanguard_Keep.gate")], "the wall draws four edges and one hairline (the parapet along the top); the gatehouse three edges and its parapet, nothing along its open foot").toEqual([5, 1, 4, 0]);
  expect(addon.eval("local g = Vanguard_Keep.gate return { g.crest ~= nil and g.crest:IsShown(), g.crest.__points.CENTER.relPoint }"), "the crest on the gatehouse's peak").toEqual([true, "TOP"]);
  expect([size(addon, "Vanguard_player"), size(addon, "Vanguard_target"), size(addon, "Vanguard_focus"), size(addon, "Vanguard_pet"), size(addon, "Vanguard_targettarget")], "the wall holds 200 x 40 frames for you and your target over 96 x 24 ones").toEqual([[200, 40], [200, 40], [96, 24], [96, 24], [96, 24]]);
  expect(addon.eval("return Vanguard_Keystone == nil or not Vanguard_Keystone:IsShown()"), "the keystone steps aside for the wall").toBe(true);
  addon.eval("local UF = ns.GetModule('UnitFrames') UF.settings.deck = true UF.ApplyDeck()");
  expect(addon.eval("return { ns.GetModule('UnitFrames').deck == nil, Vanguard_player:GetHeight() > 39 }"), "the deck stays off under the keep (no panel made, the frames at the wall's sizes)").toEqual([true, true]);
  canvas(addon, 1024, 768);
  expect([addon.eval("return Vanguard_Keep:IsShown()"), size(addon, "Vanguard_player"), addon.eval("return { ns.MoverPoint('uf_player') }")], "on a canvas too narrow for the keep the wall goes and the frames take their own sizes and spots").toEqual([false, [240, 36], ["BOTTOM", "BOTTOM", -240, 196]]);
  canvas(addon, 1920, 1080);
  expect([addon.eval("return Vanguard_Keep:IsShown()"), size(addon, "Vanguard_player")], "back on a wide one the wall returns").toEqual([true, [200, 40]]);
  addon.eval("ns.GetModule('UnitFrames').settings.deck = false ns.SetHudLayout(nil)");
  expect([addon.eval("return Vanguard_Keep:IsShown()"), size(addon, "Vanguard_player"), size(addon, "Vanguard_target"), addon.eval("return Vanguard_Keystone ~= nil and Vanguard_Keystone:IsShown()")], "Centered: the wall goes, the frames their own sizes, the keystone back").toEqual([false, [240, 36], [240, 36], true]);
  addon.eval("ns.SetHudLayout('fort')");
  expect(addon.eval("return Vanguard_Keep:IsShown() and Vanguard_player:GetHeight() > 39"), "and back again").toBe(true);
});

// Under the keep, the frames the wall holds rise with the bars (underFrames, Core/Layout.lua L.HudLift), so on a
// tall canvas the wall still stands behind them, as it does at the game's own UI scale.
it("the keep rises with the bars as one block: on every canvas your frame and your target's stand inside the wall with the first two bars", () => {
  for (const [w, h] of [[1840, 768], [1920, 1080], [2560, 1440]]) {
    const addon = loggedIn(`__wfgStub.setScreen(${w}, ${h}) ` + UNITS_ENV, onLayout("fort"));
    const inside = addon.eval(`local wall = Vanguard_Keep
      local function within(f) return f:GetLeft() >= wall:GetLeft() and f:GetRight() <= wall:GetRight() and f:GetBottom() >= wall:GetBottom() and f:GetTop() <= wall:GetTop() end
      return { wall:IsShown(), within(Vanguard_player), within(Vanguard_target), within(ns.MoverFrame("bar1")), within(ns.MoverFrame("bar2")) }`);
    expect(inside, `${w}x${h}: the wall holds your frame, your target's and the bars`).toEqual([true, true, true, true, true]);
  }
});

// The keep measures itself (H46-13-101): the bar stack's first bar is 12 x size + 11 x 2 wide; the spots were drawn
// round 38-unit buttons (half the bar 239), so a wider bar moves the keep's frames out on each side by the difference.
const SIZE_LUA = (size) => `local AB = ns.GetModule("ActionBars") AB.settings.size = ${size} for n in pairs(AB.bars) do AB.SettingChanged(n, "size") end`;
// Where the keep's frames stand now (their left edges) and the wall's ends, in whole units.
const KEEP_EDGES_LUA = `local out = {}
  for _, k in ipairs({ "uf_focus", "uf_player", "uf_pet", "uf_targettarget", "uf_target", "cast_target" }) do out[#out + 1] = math.floor(ns.MoverFrame(k):GetLeft() + 0.5) end
  out[#out + 1] = math.floor(Vanguard_Keep:GetLeft() + 0.5) out[#out + 1] = math.floor(Vanguard_Keep:GetRight() + 0.5)
  return out`;

it("H46-13-101 the keep's frames move out with the bars' width, after the fight when the size changes in one, and the canvas it needs grows with them", () => {
  const addon = loggedIn(WIDE + UNITS_ENV + ACTIONS_ENV + UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV, onLayout("fort"));
  addon.eval(MENU_LUA);
  canvas(addon, 1920, 1080);
  const drawn = addon.eval(KEEP_EDGES_LUA), need = addon.eval("return ns.KeepNeed(1920)");
  expect([addon.eval("return ns.KeepSpread()"), drawn], "38-unit buttons: the spots as drawn (focus 960 - 478, your frame 960 - 478, the pet 960 - 374, the target of target 960 + 278, your target's 960 + 278, its cast bar 960 + 248), the wall 12 past your frame and your target's").toEqual([0, [482, 482, 586, 1238, 1238, 1208, 470, 1450]]);
  setCombat(addon, true);
  addon.eval(SIZE_LUA(43));
  addon.advance(1);
  expect(addon.eval(KEEP_EDGES_LUA), "43 in a fight: nothing moves (secure frames)").toEqual(drawn);
  setCombat(addon, false);
  addon.advance(1);
  const spread = addon.eval("return ns.KeepSpread()");
  expect([spread, addon.eval("return ns.GetModule('ActionBars').Bar1HalfWidth()") - 239], "43 after the fight: the spread is half the bar less the drawn 239").toEqual([spread, spread]);
  expect(addon.eval(KEEP_EDGES_LUA), "every frame out by the spread on its side, the wall with them").toEqual(drawn.map((x, i) => Math.round(x + ([0, 1, 2, 6].includes(i) ? -spread : spread))));
  expect([need, addon.eval("return ns.KeepNeed(1920)") - need], "and the canvas the keep needs (1836 at 38: 490 out, clear of the bag and menu bar's 428) grows by twice the spread").toEqual([1836, 2 * spread]);
});

it("the keep answers a frame you dragged per edge: bar 1 moved puts the wall's top on your frame, your cast bar moved hides the gatehouse, your frame, your target's or the focus moved hides the wall; a reset brings each back", () => {
  const addon = loggedIn(WIDE + UNITS_ENV, onLayout("fort"));
  // The wall's shown state, what its top is pinned to, and the gatehouse's shown state.
  const keep = () => [addon.eval("return Vanguard_Keep:IsShown()"), pin(addon, "Vanguard_Keep", "TOP"), addon.eval("return Vanguard_Keep.gate:IsShown()")];
  expect(keep(), "in the layout's spots: the wall on the first bar's top, the gatehouse round your cast bar").toEqual([true, "Vanguard_Bar1 TOP 0 12", true]);
  addon.eval('ns.SetMoverPoint("bar1", "TOP", "TOP", 0, -40)');
  expect(keep(), "bar 1 dragged to the top: the wall's top stays on your frame, the gatehouse (which stands on the bar) hides").toEqual([true, "Vanguard_player TOP 0 12", false]);
  addon.eval('ns.ResetMovers("bar1")');
  expect(keep(), "bar 1 reset: back on the bar").toEqual([true, "Vanguard_Bar1 TOP 0 12", true]);
  addon.eval('ns.SetMoverPoint("cast_player", "TOP", "TOP", 0, -100)');
  expect(keep(), "your cast bar dragged up the middle: the gatehouse hides, the wall stays").toEqual([true, "Vanguard_Bar1 TOP 0 12", false]);
  addon.eval('ns.ResetMovers("cast_player")');
  expect(keep()[2], "your cast bar reset: the gatehouse is back").toBe(true);
  for (const [key, point] of [["uf_focus", '"TOPLEFT", "TOPLEFT", 300, -200'], ["uf_target", '"TOPRIGHT", "TOPRIGHT", -40, -300'], ["uf_player", '"BOTTOMLEFT", "BOTTOMLEFT", 300, 20']]) {
    addon.eval(`ns.SetMoverPoint("${key}", ${point})`);
    expect(addon.eval("return { Vanguard_Keep:IsShown(), Vanguard_Keep.gate:IsVisible() }"), `${key} dragged: the wall and gatehouse hide`).toEqual([false, false]);
    addon.eval(`ns.ResetMovers("${key}")`);
    expect(keep(), `${key} reset: the keep is back`).toEqual([true, "Vanguard_Bar1 TOP 0 12", true]);
  }
});

// A banner as drawn (TEST-ONLY reads): the bars' orientation, the power line's width and pins, the health bar's pins,
// the corners in pixels and look, the health bar's masks, the shown edges' sizes, and the texts.
const BANNER_LUA = `local f, T, UF = Vanguard_%KEY%, ns.Theme, ns.GetModule("UnitFrames")
  local px, corners, masks, edges = T.Pixel(f), {}, {}, {}
  for _, p in ipairs({ "TOPLEFT", "TOPRIGHT", "BOTTOMLEFT", "BOTTOMRIGHT" }) do corners[#corners + 1] = math.floor(T.CornerAt(f, p) / px + 0.5) .. " " .. tostring(T.CornerLook(f, p)) end
  for i, m in ipairs(f.health:GetStatusBarTexture().__masks or {}) do masks[i] = next(m.__points) .. " " .. tostring(m.__texture):match("[^\\\\]+$") end
  table.sort(masks)
  for _, t in ipairs({ f:GetRegions() }) do
    if t:IsShown() and tostring(t.__texture):find("WHITE8X8") and (t:GetWidth() == px or t:GetHeight() == px) then
      edges[#edges + 1] = (t.__points.TOPLEFT and "L" or "") .. (t.__points.TOPRIGHT and "R" or "") .. (t.__points.BOTTOMLEFT and "B" or "") .. math.floor(math.max(t:GetWidth(), t:GetHeight()) / px + 0.5)
    end
  end
  table.sort(edges)
  local function pinOf(w, p) local q = w.__points[p] if not q then return "none" end return (q.rel == f and "frame" or (q.rel == f.power and "power" or (q.rel == f.health and "health" or (q.rel == f.name and "name" or "?")))) .. " " .. q.relPoint .. " " .. math.floor(q.x / px + 0.5) .. " " .. math.floor(q.y / px + 0.5) end
  local function pinAny(w) local p = next(w.__points) return p and (p .. " " .. pinOf(w, p)) or "none" end
  return { orient = f.health:GetOrientation() .. " " .. f.power:GetOrientation(), reverse = f.health:GetReverseFill() or f.power:GetReverseFill(), powerWidth = f.power:GetWidth(),
    power = { pinOf(f.power, "TOPLEFT"), pinOf(f.power, "BOTTOMLEFT"), pinOf(f.power, "TOPRIGHT") }, health = { pinOf(f.health, "TOPRIGHT"), pinOf(f.health, "TOPLEFT"), pinOf(f.health, "BOTTOMLEFT"), pinOf(f.health, "BOTTOMRIGHT") },
    corners = corners, masks = masks, edges = edges, name = f.name:IsShown() and (pinAny(f.name) .. " " .. f.name.__justifyH) or "hidden", level = f.level and f.level:IsShown() and pinAny(f.level) or "hidden",
    number = f.healthText:IsShown() and pinAny(f.healthText) or "hidden", text = f.healthText:GetText(), outlined = f.name.__font[3] == "OUTLINE" and f.healthText.__font[3] == "OUTLINE",
    crown = UF.Crown(f):GetTop() == f.name:GetTop() and "name" or (UF.Crown(f):GetTop() == f:GetTop() and "frame" or "?"), hair = tostring(T.HairlineOf(f)), tab = f.tab:IsShown(),
    icon = f.raidIcon.__points.BOTTOM and pinOf(f.raidIcon, "BOTTOM") or pinOf(f.raidIcon, "CENTER"), line = f.debuffs and (f.debuffs.frame.__flowLine or f.debuffs.frame.line) }`;

// The banner of the unit frame `key`.
const banner = (addon, key) => addon.eval(BANNER_LUA.replace("%KEY%", key));

it("Standards: your frame and your target's stand as 40 x 160 banners, health rising from the foot to a pointed hem, power a line down the outer side, the name over the top and the percent at the top inside; the small banners carry bars alone", () => {
  const addon = loggedIn(WIDE + UNITS_ENV + CLICK_LUA, onLayout("standards"));
  expect([size(addon, "Vanguard_player"), size(addon, "Vanguard_target"), size(addon, "Vanguard_focus"), size(addon, "Vanguard_pet"), size(addon, "Vanguard_targettarget")], "40 x 160 banners for you and your target, 24 x 100 for the rest").toEqual([[40, 160], [40, 160], [24, 100], [24, 100], [24, 100]]);
  const player = banner(addon, "player");
  expect([player.orient, player.reverse, player.powerWidth, player.power, player.health], "your bars stand on end rising from the foot: the power line 4 wide down the left (outer) side a pixel in, the health bar filling the rest").toEqual(["VERTICAL VERTICAL", false, 4, ["frame TOPLEFT 1 -1", "frame BOTTOMLEFT 1 1", "none"], ["frame TOPRIGHT -1 -1", "none", "power BOTTOMRIGHT 1 0", "none"]]);
  // In pixels, 0.711 of a unit on this canvas: the hem is half the 40-unit width (28 pixels), the frame 225 tall.
  expect([player.corners, player.masks, player.edges], "the hem: both bottom corners cut half the width deep to a point, the health bar masked on them, the edges and hairline (a pixel in) stopping short of the cuts with none along the bottom").toEqual([["0 nil", "0 nil", "28 point", "28 point"], ["BOTTOMLEFT PointMaskBL", "BOTTOMRIGHT PointMaskBR"], ["LB195", "LB197", "LR54", "LR56", "R195", "R197"]]);
  expect([player.name, player.level, player.number, player.outlined, player.crown, player.hair, player.tab, player.icon], "the name centred 2 units (3 pixels) over the banner, the level 4 units before it, the number 14 units under the top, outlined, the crown risen to the name line, brass hairline, no tab, the raid icon over the name").toEqual(["BOTTOM frame TOP 0 3 CENTER", "RIGHT name LEFT -6 0", "TOP health TOP 0 -20", true, "name", "accentDim", false, "name TOP 0 0"]);
  expect(player.text, "the percent at the top (900 of 1000 health)").toMatch(/^(89|90)%$/);
  const target = banner(addon, "target");
  expect([target.power[2], target.health[1], target.health[3], target.line, banner(addon, "focus").line], "your target's power line runs down its right (outer) side, the health bar from the left; its aura rows wrap at 160, the focus's at its own width").toEqual(["frame TOPRIGHT -1 -1", "frame TOPLEFT 1 -1", "power BOTTOMLEFT -1 0", 160, 24.177777777777777]);
  const focus = banner(addon, "focus");
  expect([focus.name, focus.level, focus.number, focus.corners, focus.crown, focus.hair, focus.icon], "a small banner: no name, level or number, a hem half its 24 units deep, the crown on the frame, no hairline, the raid icon on its top edge (8 units up)").toEqual(["hidden", "hidden", "hidden", ["0 nil", "0 nil", "16 point", "16 point"], "frame", "nil", "frame TOP 0 11"]);
  addon.eval("__units.player.hp = 0 __units.player.dead = true ns.GetModule('UnitFrames').UpdateHealth(Vanguard_player)");
  expect(addon.eval("return Vanguard_player.healthText:GetText()"), "a down word still").toBe("Dead");
  addon.eval("__units.player.hp = 900 __units.player.dead = nil ns.GetModule('UnitFrames').UpdateHealth(Vanguard_player)");
  addon.eval('ns.Theme.Settings().hudLook = "tabs" ns.Theme.Refresh()');
  expect([banner(addon, "player").tab, banner(addon, "player").name, banner(addon, "focus").tab], "the Tabs look gives a standing frame no tab").toEqual([false, "BOTTOM frame TOP 0 3 CENTER", false]);
  addon.eval('ns.Theme.Settings().hudLook = "shield" ns.Theme.Refresh()');
  addon.eval("ns.SetHudLayout(nil)");
  const across = banner(addon, "player");
  expect([size(addon, "Vanguard_player"), across.orient, across.corners, across.masks, across.name !== "hidden", banner(addon, "focus").name !== "hidden", banner(addon, "focus").number, across.crown], "Centered: the frames lie across again, 240 x 36, the shield point back, every name and number shown (the number at the right end), the crown on the frame").toEqual([[240, 36], "HORIZONTAL HORIZONTAL", ["25 point", "0 nil", "25 point", "0 nil"], ["BOTTOMLEFT PointMaskBL", "TOPLEFT PointMask"], true, true, "RIGHT health RIGHT -14 0", "frame"]);
});

it("Standards: switching to it hides the power number on the banners (as a login under it does), and lying across again shows it", () => {
  const power = { savedVariables: "VanguardDB = { profiles = { Default = { modules = { RaidFrames = false }, UnitFrames = { powerFormat = 'value' } } } }" };
  const addon = loggedIn(WIDE + UNITS_ENV, power);
  // Whether your frame and your target's show their power text.
  const shown = () => addon.eval("return { Vanguard_player.powerText:IsShown(), Vanguard_target.powerText:IsShown() }");
  expect(shown(), "Centered with power text on: the number shows").toEqual([true, true]);
  addon.eval("ns.SetHudLayout('standards')");
  expect(shown(), "switched to Standards: no power number on a banner").toEqual([false, false]);
  addon.eval("ns.SetHudLayout('centered')");
  expect(shown(), "back across: the number shows again").toEqual([true, true]);
});

// Each frame's rectangle (left, bottom, right, top), by unit frame key.
const rects = (addon, keys) => addon.eval(`local out = {}
  for _, k in ipairs({ "${keys.join('", "')}" }) do local f = _G["Vanguard_" .. k] out[k] = { f:GetLeft(), f:GetBottom(), f:GetRight(), f:GetTop() } end
  return out`);
// Whether two rectangles overlap.
const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

it("Standards: the focus target stands as a small banner beside the focus, clear of your banner, the focus and the pet; Centered gives it its own size back", () => {
  const addon = loggedIn(WIDE + UNITS_ENV, onLayout("standards"));
  expect([size(addon, "Vanguard_focustarget"), banner(addon, "focustarget").name], "24 x 100, bars alone").toEqual([[24, 100], "hidden"]);
  const r = rects(addon, ["focustarget", "player", "focus", "pet"]);
  expect([overlap(r.focustarget, r.player), overlap(r.focustarget, r.focus), overlap(r.focustarget, r.pet), r.focustarget[2] <= r.focus[0]], "beside the focus, on its outer side, clear of every banner").toEqual([false, false, false, true]);
  addon.eval("ns.SetHudLayout('centered')");
  expect(size(addon, "Vanguard_focustarget"), "Centered: its own 80 x 24").toEqual([80, 24]);
});

it("the keep under Tabs: the focus, pet and target of target wear no tab (their name on the bar), your frame and your target's keep theirs; a canvas too narrow for the keep gives the small frames their tabs back", () => {
  const addon = loggedIn(WIDE + UNITS_ENV, { savedVariables: 'VanguardDB = { profiles = { Default = { modules = { RaidFrames = false }, hudLayout = "fort", theme = { hudLook = "tabs" } } } }' });
  // Whether each frame wears its tab: player, target, focus, pet, target of target.
  const tabs = () => addon.eval("local out = {} for _, k in ipairs({ 'player', 'target', 'focus', 'pet', 'targettarget' }) do out[#out + 1] = _G['Vanguard_' .. k].tab:IsShown() end return out");
  expect(tabs(), "tabs on the big frames only").toEqual([true, true, false, false, false]);
  expect(addon.eval("local f = Vanguard_focus local rel = select(2, f.name:GetPoint(1)) return rel ~= f.tab"), "the focus's name is not on a tab").toBe(true);
  canvas(addon, 1000, 768);
  expect(tabs(), "the keep gone: every frame wears its tab").toBeDefined();
});

// The shown textures among a frame's own regions, counted by image name.
const shownArt = (addon, name) => addon.eval(`local out = {}
  for _, t in ipairs({ ${name}:GetRegions() }) do
    if t:IsShown() and t.__texture then local n = tostring(t.__texture):match("[^\\\\]+$") out[n] = (out[n] or 0) + 1 end
  end
  return out`);

it("Standards under Hairline: a bare banner shows only the hairline's V at its hem, no plate wedges or border pieces; Rimmed brings the plate back", () => {
  const addon = loggedIn(WIDE + UNITS_ENV, { savedVariables: 'VanguardDB = { profiles = { Default = { modules = { RaidFrames = false }, hudLayout = "standards", theme = { hudLook = "hairline" } } } }' });
  const bare = shownArt(addon, "Vanguard_player");
  expect([bare.PointFill ?? 0, bare.PointLine30 ?? 0, bare.WHITE8X8 ?? 0], "Hairline: no fill wedges or side strips, the two hair pieces of the V alone").toEqual([0, 2, 0]);
  addon.eval('ns.Theme.Settings().hudLook = "rimmed" ns.Theme.Refresh()');
  expect(shownArt(addon, "Vanguard_player").PointFill, "Rimmed: the plate's hem wedges show again").toBe(2);
});

// Clicks one of the setup wizard's buttons (next, back or close) as the player would.
const setupClick = (addon, which) => addon.eval(`local b = Vanguard_Setup.${which} b:GetScript("OnClick")(b, "LeftButton")`);

it("Standards: on a client without the percent curve a banner shows the health text setting's form instead", () => {
  const addon = loggedIn("__wfgStub.setScreen(1920, 1080)" + UNITS_ENV + CLICK_LUA, onLayout("standards"));
  addon.eval("ns.GetModule('UnitFrames').UpdateHealth(Vanguard_player)");
  const text = addon.eval("return { Vanguard_player.healthText:GetText(), ns.GetModule('UnitFrames').HealthText('player') }");
  expect(text[0], "no percent to show").not.toMatch(/%$/);
  expect(text, "the setting's own text (900 of 1000 health)").toEqual([text[1], text[1]]);
});

// The parts that ride a frame (TEST-ONLY): heals on their way, you lead, a class portrait on your frame.
const RIDERS_ENV = UNITS_ENV + `
  __units.player.incoming, __units.player.absorb, __units.player.leader = 200, 150, true
  UnitGetIncomingHeals = function(unit) return __units[unit].incoming end
  UnitGetTotalAbsorbs = function(unit) return __units[unit].absorb end
  UnitIsGroupLeader = function(unit) return __units[unit].leader == true end
`;
// Whether your frame's heal bar, shield bar, leader mark and portrait show, and its health bar's width for the riders (units, two places).
const riders = (addon) => addon.eval(`local f = Vanguard_player
  return { f.heal:IsShown(), f.shield:IsShown(), f.status.leader:IsShown(), f.portrait:IsShown(), math.floor(ns.GetModule("UnitFrames").BarWidth(f) * 100 + 0.5) / 100 }`);

it("Standards: the heal and shield bars, the status marks and the portrait stay off while a frame stands, and come back under Centered", () => {
  const addon = loggedIn("__wfgStub.setScreen(1920, 1080)" + RIDERS_ENV + CLICK_LUA, {
    savedVariables: `VanguardDB.profiles.Default = { modules = { RaidFrames = false }, hudLayout = "standards", theme = { hudLook = "hairline" }, UnitFrames = { playerPortrait = "class", statusMarks = true } }` });
  expect(riders(addon), "nothing rides a banner; its bar is the banner less its edges and the power line").toEqual([false, false, false, false, 34.58]);
  addon.eval("ns.SetHudLayout('centered')");
  expect(riders(addon).slice(0, 4), "across the frame again, the riders return").toEqual([true, true, true, true]);
});

it("setup and options: The keep and Standards are layout choices in setup (your role's spots first, then the layout), another Centered layout clears them, and the General page cycles them", () => {
  const addon = loggedIn(WIDE + UNITS_ENV + CLICK_LUA, { firstRun: true });
  addon.eval('__click("The keep")');
  expect(addon.eval("return Vanguard_Setup.pages.layout.hint:GetText()"), "picking The keep says what it does").toMatch(/^Centered for your role, then one wall at the foot of the screen/);
  setupClick(addon, "next");
  expect([addon.eval("return ns.HudLayout()"), addon.eval("return Vanguard_Keep:IsShown()"), addon.eval("return ns.Settings('UnitFrames').targetHeight")], "The keep is saved, the wall up, your role's target height set").toEqual(["fort", true, 40]);
  setupClick(addon, "back");
  addon.eval('__click("Standards")');
  setupClick(addon, "next");
  expect([addon.eval("return ns.HudLayout()"), addon.eval("return Vanguard_Keep:IsShown()"), size(addon, "Vanguard_player")], "Standards: the wall goes, the banners stand").toEqual(["standards", false, [40, 160]]);
  setupClick(addon, "back");
  addon.eval('__click("Centered: tanking")');
  setupClick(addon, "next");
  expect([addon.eval("return ns.HudLayout()"), size(addon, "Vanguard_player")], "a Centered layout puts the frames back").toEqual(["centered", [240, 36]]);
  for (let i = 0; i < 8; i += 1) setupClick(addon, "next");
  addon.eval('Vanguard_Question.no:GetScript("OnClick")(Vanguard_Question.no)');
  addon.slash("");
  expect(addon.eval('__click("Where the frames stand") return ns.HudLayout()'), "the General page's cycle row steps to The keep").toBe("fort");
  expect(addon.eval('__click("Where the frames stand") return ns.HudLayout()'), "then Standards").toBe("standards");
  expect(addon.eval('__click("Where the frames stand") return { ns.HudLayout(), tostring(VanguardDB.profiles.Default.hudLayout) }'), "then round to Centered (nothing saved)").toEqual(["centered", "nil"]);
});
