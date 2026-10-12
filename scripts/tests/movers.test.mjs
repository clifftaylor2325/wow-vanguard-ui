// movers: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { chatHas, loggedIn, setCombat } from "./helpers.mjs";

it("movers", () => {
  const addon = loggedIn(`
    __f = CreateFrame("Frame", nil, UIParent)
    __f:SetSize(200, 40)
    ns.Mover(__f, "player", "Player frame", { "CENTER", "CENTER", -250, -150 })
  `);
  // The frame's first anchor as [point, relPoint, x, y].
  const point = () => addon.eval("local p, _, rp, x, y = __f:GetPoint(1); return { p, rp, x, y }");
  expect(JSON.stringify(point()) === JSON.stringify(["CENTER", "CENTER", -250, -150]), "a frame starts at its default point").toBeTruthy();
  addon.slash("unlock");
  addon.slash("snap off");
  const handle = "ns.MoverHandleForTest()";
  addon.eval(`function ns.MoverHandleForTest() for _, w in ipairs(__wfgStub.frames) do if w.mover then return w end end end`);
  expect(addon.eval(`return ${handle}:IsShown()`) === true, "/vg unlock shows a handle").toBeTruthy();
  addon.eval(`local h = ${handle}; h:GetScript("OnDragStart")(h); h:ClearAllPoints(); h:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -20); h:GetScript("OnDragStop")(h)`);
  expect(JSON.stringify(point()) === JSON.stringify(["TOPLEFT", "TOPLEFT", 10, -20]), "dropping a handle moves its frame").toBeTruthy();
  expect(addon.eval("return VanguardDB.profiles.Default.positions.player.x") === 10, "the position is saved in the profile").toBeTruthy();
  addon.slash("reset player");
  expect(point()[0] === "CENTER", "/vg reset puts the frame back").toBeTruthy();
  addon.fire("PLAYER_REGEN_DISABLED");
  expect(addon.eval(`return ${handle}:IsShown()`) === false, "entering combat locks").toBeTruthy();
  addon.eval("__wfgStub.inCombat = true");
  addon.clearChat();
  addon.slash("unlock");
  expect(chatHas(addon, /In combat\. Try again once combat ends\./), "unlock is refused in combat, and says so").toBeTruthy();
});

it("layout", () => {
  const addon = loggedIn();
  // ns.Layout.Anchor on a 1920x1080 screen.
  const anchor = (l, b, w, h) => addon.eval(`return { ns.Layout.Anchor(${l}, ${b}, ${w}, ${h}, 1920, 1080) }`);
  expect(JSON.stringify(anchor(20, 900, 200, 40)) === JSON.stringify(["TOPLEFT", 20, -140]), "top-left third anchors TOPLEFT with edge offsets").toBeTruthy();
  expect(JSON.stringify(anchor(1700, 20, 200, 40)) === JSON.stringify(["BOTTOMRIGHT", -20, 20]), "bottom-right third anchors BOTTOMRIGHT").toBeTruthy();
  expect(JSON.stringify(anchor(860, 520, 200, 40)) === JSON.stringify(["CENTER", 0, 0]), "the middle anchors CENTER").toBeTruthy();
  expect(JSON.stringify(anchor(860, 20, 200, 40)) === JSON.stringify(["BOTTOM", 0, 20]), "bottom middle anchors BOTTOM").toBeTruthy();
  // ns.Layout.Snap of a 100x20 rect next to one at (500, 300).
  const snap = (l, b) => addon.eval(`return { ns.Layout.Snap(${l}, ${b}, 100, 20, { { left = 500, bottom = 300, w = 100, h = 20 } }, 1920, 1080) }`);
  expect(JSON.stringify(snap(605, 250)) === JSON.stringify([600, 250]), "a left edge within 8 px snaps to another frame's right edge").toBeTruthy();
  expect(JSON.stringify(snap(700, 250)) === JSON.stringify([700, 250]), "nothing close, no snap").toBeTruthy();
  expect(JSON.stringify(snap(1000, 527)) === JSON.stringify([1000, 530]), "a center within 8 px snaps to the screen center").toBeTruthy();
});

it("mover coordinates with no handle", () => {
  const addon = loggedIn();
  expect(addon.eval('return ns.ShowCoords({ label = "TEST-ONLY" })') === null, "a mover that has no handle yet shows nothing").toBeTruthy();
});

// TEST-ONLY movable box: 200 x 40, anchored at its bottom center 100 up from the screen's;
// its module fades it with SetAlpha, as a mouseover bar does.
const BOX = `
  __box = CreateFrame("Frame", "TESTONLY_Box", UIParent)
  __box:SetSize(200, 40)
  ns.Mover(__box, "box", "TEST-ONLY box", { "BOTTOM", "BOTTOM", 0, 100 })
`;

it("a mover's watcher hears when that mover is moved or reset, and only then", () => {
  const addon = loggedIn(BOX + `ns.Mover(CreateFrame("Frame", nil, UIParent), "TESTONLY-other", "TEST-ONLY other", { "BOTTOM", "BOTTOM", 0, 0 })
    __heard = {} ns.WatchMover('box', function(key) __heard[#__heard + 1] = key end)`);
  addon.eval("ns.SetMoverPoint('box', 'BOTTOM', 'BOTTOM', 40, 100) ns.ResetMovers('box')");
  expect(addon.eval("return __heard"), "moved, then reset: told twice, with its key").toEqual(["box", "box"]);
  addon.eval("ns.SetMoverPoint('TESTONLY-other', 'BOTTOM', 'BOTTOM', 0, 0)");
  expect(addon.eval("return #__heard"), "another mover's change is not its business").toBe(2);
});

// The box on screen: its scale, alpha, rect (screen pixels: center x, bottom, width) and saved entry.
const box = (addon) => {
  const r = addon.frame("TESTONLY_Box").rect;
  return { scale: addon.eval("return __box:GetScale()"), alpha: addon.eval("return __box:GetAlpha()"), x: r.left + r.width / 2, bottom: r.bottom, width: r.width,
    saved: addon.eval("return VanguardDB.profiles.Default.positions.box") };
};

it("per-frame scale and opacity: saved with the position, anchored where it was, reset to 1", () => {
  const addon = loggedIn(BOX);
  expect(box(addon), "a frame starts at scale 1, fully opaque, with nothing saved").toEqual({ scale: 1, alpha: 1, x: 960, bottom: 100, width: 200, saved: null });
  addon.eval('ns.SetMoverScale("box", 1.5)');
  expect(box(addon), "scaled, it grows around its anchor point, which stays put").toEqual({ scale: 1.5, alpha: 1, x: 960, bottom: 100, width: 300, saved: { scale: 1.5 } });
  addon.eval('ns.Nudge("box", 5, 0)');
  expect(box(addon), "a move keeps the scale, and the offsets stay in screen units").toEqual({ scale: 1.5, alpha: 1, x: 965, bottom: 100, width: 300, saved: { point: "BOTTOM", relPoint: "BOTTOM", x: 5, y: 100, scale: 1.5 } });
  addon.eval('ns.SetMoverAlpha("box", 0.5)');
  expect([box(addon).alpha, box(addon).saved.alpha], "opacity is saved beside it").toEqual([0.5, 0.5]);
  addon.eval("__box:SetAlpha(0)");
  expect(box(addon).alpha, "the module fading the frame out still hides it").toBe(0);
  addon.eval("__box:SetAlpha(1)");
  expect(box(addon).alpha, "and fading it back in shows it at its opacity").toBe(0.5);
  addon.eval('ns.SetMoverScale("box", 5) ns.SetMoverAlpha("box", 0)');
  expect(addon.eval("return { ns.MoverLook('box') }"), "scale and opacity keep to 50-200% and 10-100%").toEqual([2, 0.1]);
  addon.eval('ns.SetMoverScale("box", 0.3333) ns.SetMoverScale("box", "big") ns.SetMoverScale("TEST-ONLY none", 2)');
  expect(addon.eval("return { ns.MoverLook('box') }"), "to the hundredth; a bad value or an unknown frame changes nothing").toEqual([0.5, 0.1]);
  addon.eval('ns.SetMoverScale("box", 1) ns.SetMoverAlpha("box", 1)');
  expect(box(addon).saved, "1 is saved as unset").toEqual({ point: "BOTTOM", relPoint: "BOTTOM", x: 5, y: 100 });
  addon.eval('ns.SetMoverScale("box", 1.2) ns.SetMoverAlpha("box", 0.6)');
  addon.slash("reset box");
  expect(box(addon), "/vg reset puts the place, scale and opacity back").toEqual({ scale: 1, alpha: 1, x: 960, bottom: 100, width: 200, saved: null });
  addon.eval("__box:SetAlpha(0.25)");
  expect(box(addon).alpha, "at opacity 1 the module's own alpha shows as it is").toBe(0.25);
});

it("per-frame scale: dragging a scaled handle, and combat", () => {
  const addon = loggedIn(BOX);
  addon.eval('ns.SetMoverScale("box", 2)');
  addon.slash("unlock");
  addon.slash("snap off");
  addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == "box" then __h = w end end');
  expect(addon.eval("return { __h:GetScale(), __h:GetWidth() }"), "the handle takes the frame's scale and size").toEqual([2, 200]);
  addon.eval('__h:GetScript("OnDragStart")(__h) __h:ClearAllPoints() __h:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -20) __h:GetScript("OnDragStop")(__h)');
  expect(addon.eval("return { ns.MoverPoint('box') }"), "a drop is saved in screen units (twice the handle's own)").toEqual(["TOPLEFT", "TOPLEFT", 20, -40]);
  expect([addon.frame("TESTONLY_Box").rect.left, addon.frame("TESTONLY_Box").rect.top], "and the frame lands where the handle was dropped").toEqual([20, 1040]);
  addon.eval("__h.GetLeft = function() return nil end");
  addon.eval('__h:GetScript("OnDragStart")(__h) __h:ClearAllPoints() __h:SetPoint("TOP", UIParent, "TOP", 5, -10) __h:GetScript("OnDragStop")(__h)');
  expect(addon.eval("return { ns.MoverPoint('box') }"), "without geometry, the client's point is scaled to screen units too").toEqual(["TOP", "TOP", 10, -20]);
  addon.eval('ns.SetMoverScale("box", 1.5)');
  expect(addon.eval("return __h:GetScale()"), "a new scale rescales the handle").toBe(1.5);
  addon.slash("lock");
  setCombat(addon, true);
  addon.eval('ns.SetMoverScale("box", 0.5)');
  expect([addon.eval("return __box:GetScale()"), addon.eval("return (ns.MoverLook('box'))")], "in combat the scale is saved and waits").toEqual([1.5, 0.5]);
  setCombat(addon, false);
  expect(addon.eval("return __box:GetScale()"), "and applies when combat ends").toBe(0.5);
});

it("a damaged saved position (a hand-edited profile string) falls back to the default spot instead of failing the module", () => {
  const clean = loggedIn().eval("return { ns.MoverPoint('uf_player') }");
  const addon = loggedIn(BOX, { savedVariables: `VanguardDB.profiles = { Default = { positions = {
    uf_player = { point = 5, x = "TEST-ONLY" }, uf_target = { point = "TEST-ONLY", relPoint = 7, scale = 0, alpha = "TEST-ONLY" } } } }` });
  expect(addon.eval("return { ns.GetModule('UnitFrames').enabled, #ns.errors }"), "the unit frames still load, with nothing to report").toEqual([true, 0]);
  expect(addon.eval("return { ns.MoverPoint('uf_player') }"), "a point that isn't one leaves the default").toEqual(clean);
  expect(addon.eval("return { ns.MoverLook('uf_target') }"), "a scale out of range is kept to it, an opacity that isn't a number is 1").toEqual([0.5, 1]);
  addon.eval('ns.Profile().positions.box = { point = "TOPLEFT", relPoint = "TEST-ONLY", x = "12", y = {} } ns.SetMoverDefault("box", { "BOTTOM", "BOTTOM", 0, 100 })');
  expect(addon.eval("return { ns.MoverPoint('box') }"), "a good point keeps; a bad relative point is the point; offsets that aren't numbers read as numbers or 0").toEqual(["TOPLEFT", "TOPLEFT", 12, 0]);
});

// Links between frames (Core/MoverLinks.lua) ------------------------------------------------

// TEST-ONLY second box: 100 x 20, at the screen's center until it's anchored.
const DEP = `
  __dep = CreateFrame("Frame", "TESTONLY_Dep", UIParent)
  __dep:SetSize(100, 20)
  ns.Mover(__dep, "dep", "TEST-ONLY dep", { "CENTER", "CENTER", 0, 0 })
`;
// A frame's rect on screen as [left, bottom, width, height].
const rectOf = (addon, name) => { const r = addon.frame(name).rect; return [r.left, r.bottom, r.width, r.height]; };
// A Lua call's results as a list.
const results = (addon, lua) => addon.eval(`return { ${lua} }`);
// No frame by that name, as a setter says it.
const NO_FRAME = "There's no frame called TEST-ONLY-none here (is its module on?).";

it("layout: rects, clamping to the screen, and the nearest side", () => {
  const addon = loggedIn();
  // A rect from ns.Layout as [left, bottom, w, h].
  const rect = (lua) => addon.eval(`local r = ${lua} return { r.left, r.bottom, r.w, r.h }`);
  expect(rect("ns.Layout.Rect('TOPRIGHT', 'TOPRIGHT', -12, -12, 100, 50, 1920, 1080)"), "a frame's rect from its point").toEqual([1808, 1018, 100, 50]);
  expect(rect("ns.Layout.RectAt('LEFT', 500, 300, 100, 20)"), "the rect whose left point is at 500, 300").toEqual([500, 290, 100, 20]);
  expect(rect("ns.Layout.Clamp({ left = -20, bottom = 1070, w = 100, h = 20 }, 1920, 1080)"), "a rect past the edges is moved onto the screen").toEqual([0, 1060, 100, 20]);
  // The side of a 200 x 40 frame at 500, 500 that a 100 x 20 one at left, bottom is nearest.
  const side = (l, b) => addon.eval(`return ns.Layout.NearestSide({ left = ${l}, bottom = ${b}, w = 100, h = 20 }, { left = 500, bottom = 500, w = 200, h = 40 })`);
  expect([side(720, 505), side(300, 505), side(550, 560), side(550, 400)], "right, left, above and below another frame").toEqual(["RIGHT", "LEFT", "TOP", "BOTTOM"]);
});

it("anchoring a frame to another frame's side: placed there, grows away from it, follows it, refused with a reason", () => {
  const addon = loggedIn(BOX + DEP);
  expect(results(addon, 'ns.SetMoverAnchor("dep", "box", "RIGHT", 4, 0)'), "anchoring is accepted").toEqual([true]);
  expect(rectOf(addon, "TESTONLY_Dep"), "its left edge 4 px right of the box, centered on it").toEqual([1064, 110, 100, 20]);
  addon.eval("__dep:SetWidth(150)");
  expect(rectOf(addon, "TESTONLY_Dep"), "anchored to the right, it grows to the right").toEqual([1064, 110, 150, 20]);
  addon.eval('ns.SetMoverAnchor("dep", "box", "TOP", 0, 0) __dep:SetHeight(40)');
  expect(rectOf(addon, "TESTONLY_Dep"), "anchored above, it sits on the box and grows upward").toEqual([885, 140, 150, 40]);
  addon.eval("ns.SetMoverPoint('box', 'BOTTOM', 'BOTTOM', 100, 300)");
  expect(rectOf(addon, "TESTONLY_Dep"), "the box moved: it follows").toEqual([985, 340, 150, 40]);
  addon.eval("ns.SetMoverScale('box', 1.5)");
  expect(rectOf(addon, "TESTONLY_Dep")[1], "the box rescaled: it stays on top of it").toBe(360);
  addon.eval("ns.SetMoverScale('box', 1) ns.SetMoverAnchor('dep', 'box', 'RIGHT', 0, 0) __box:SetWidth(300) __box:GetScript('OnSizeChanged')(__box, 300, 40)");
  expect(rectOf(addon, "TESTONLY_Dep")[0], "the box's module made it wider: it follows its right edge").toBe(1210);
  expect(addon.eval("return ns.Settings('positions').dep"), "the link is saved, with the spot it's at (against the nearest screen edge) to fall back on")
    .toEqual({ rel: { to: "box", side: "RIGHT", x: 0, y: 0 }, point: "BOTTOMRIGHT", relPoint: "BOTTOMRIGHT", x: -560, y: 300 });
  addon.eval("ns.Nudge('dep', 5, -2)");
  expect(results(addon, "ns.MoverAnchor('dep')"), "a nudge moves it from the side it's anchored to; the link holds").toEqual(["box", "RIGHT", 5, -2]);
  const there = rectOf(addon, "TESTONLY_Dep");
  expect([results(addon, "ns.SetMoverAnchor('dep')"), rectOf(addon, "TESTONLY_Dep"), addon.eval("return ns.MoverAnchor('dep') == nil")], "anchored to the screen again, it stays where it is").toEqual([[true], there, true]);
  addon.eval("ns.SetMoverAnchor('dep', 'box')");
  expect([rectOf(addon, "TESTONLY_Dep"), results(addon, "ns.MoverAnchor('dep')")], "no side or offsets: the nearest side, and it stays where it is").toEqual([there, ["box", "RIGHT", 5, -2]]);
  addon.slash("reset box");
  expect(rectOf(addon, "TESTONLY_Dep")[0], "the box reset to its default spot: it follows").toBe(1115);
  expect(results(addon, "ns.SetMoverAnchor('dep', 'dep', 'TOP')"), "not to itself").toEqual([false, "A frame can't be anchored to itself."]);
  expect(results(addon, "ns.SetMoverAnchor('dep', 'TEST-ONLY-none', 'TOP')"), "not to a frame that isn't there").toEqual([false, NO_FRAME]);
  expect(results(addon, "ns.SetMoverAnchor('TEST-ONLY-none', 'box')"), "nor for one").toEqual([false, NO_FRAME]);
  expect(results(addon, "ns.SetMoverAnchor('dep', 'box', 'TEST-ONLY')"), "a side is one of four").toEqual([false, "Pick a side: left, right, top or bottom."]);
  expect(results(addon, "ns.SetMoverAnchor('box', 'dep', 'LEFT')"), "and never round in a circle")
    .toEqual([false, "TEST-ONLY dep is anchored to TEST-ONLY box already (or to a frame anchored to it), so that would go round in a circle."]);
});

// A JS value (numbers, strings, plain objects) as a Lua table constructor.
const lua = (v) => (typeof v === "object" ? `{ ${Object.entries(v).map(([k, x]) => `[${JSON.stringify(k)}] = ${lua(x)}`).join(", ")} }` : JSON.stringify(v));

it("an anchored frame whose frame isn't there lands at its last screen spot, never off screen", () => {
  const addon = loggedIn(BOX + DEP);
  addon.eval("ns.SetMoverAnchor('dep', 'box', 'RIGHT', 5000, 0)");
  expect(rectOf(addon, "TESTONLY_Dep"), "offsets past the screen's edge: it stops at the edge").toEqual([1820, 110, 100, 20]);
  addon.eval(`local p = ns.Settings("positions") p.box = { rel = { to = "dep", side = "TOP" } } p.dep.rel.side = "LEFT"
    ns.PlaceMover("box") ns.PlaceMover("dep")`);
  expect(addon.eval("return #ns.errors"), "a loop in a hand-edited profile places both frames, without an error").toBe(0);
  addon.eval("ns.SetMoverAnchor('cast_player', 'uf_player', 'BOTTOM', 0, -4)");
  const cast = rectOf(addon, "Vanguard_CastBar_player");
  const player = rectOf(addon, "Vanguard_player");
  expect([cast[0] + cast[2] / 2, cast[1] + cast[3]], "the player cast bar hangs 4 px under the player frame").toEqual([player[0] + player[2] / 2, player[1] - 4]);
  const positions = addon.eval("return { cast_player = ns.Settings('positions').cast_player }");
  const off = loggedIn("", { savedVariables: `VanguardDB.profiles.Default = { modules = { UnitFrames = false }, positions = ${lua(positions)} }` });
  expect(rectOf(off, "Vanguard_CastBar_player"), "with the unit frames off, it is where it was").toEqual(cast);
  expect(results(off, "ns.MoverLinks.Where('cast_player')"), "its handle still names the frame it's anchored to, by its key").toEqual(["Below uf_player", 0, -4]);
  positions.uf_player = { point: "CENTER", relPoint: "CENTER", x: 0, y: 0 };
  const on = loggedIn("", { savedVariables: `VanguardDB.profiles.Default = { positions = ${lua(positions)} }` });
  const moved = rectOf(on, "Vanguard_player");
  expect(rectOf(on, "Vanguard_CastBar_player")[1] + cast[3], "with them on again, it follows the player frame to its new spot").toBe(moved[1] - 4);
});

// TEST-ONLY tall frame: 50 x 300, too tall for a bar to match.
const TALL = `
  __tall = CreateFrame("Frame", "TESTONLY_Tall", UIParent)
  __tall:SetSize(50, 300)
  ns.Mover(__tall, "tall", "TEST-ONLY tall", { "LEFT", "LEFT", 20, 0 })
`;
// The player cast bar's and the XP bar's widths and heights: [cast w, cast h, xp w, xp h].
const sizes = (addon) => addon.eval("return { Vanguard_CastBar_player:GetWidth(), Vanguard_CastBar_player:GetHeight(), Vanguard_xpbar:GetWidth(), Vanguard_xpbar:GetHeight() }");

it("matching another frame's width or height: kept as it changes, refused with a reason when it can't be", () => {
  const addon = loggedIn(BOX + TALL);
  expect(sizes(addon), "the bars start at their own sizes").toEqual([220, 18, 478, 6]);
  expect(results(addon, "ns.SetMoverMatch('cast_player', 'width', 'box')"), "matching is accepted").toEqual([true]);
  expect(sizes(addon)[0], "the cast bar takes the box's width").toBe(200);
  addon.eval("__box:SetWidth(320) __box:GetScript('OnSizeChanged')(__box, 320, 40)");
  expect(sizes(addon)[0], "and keeps it as the box changes").toBe(320);
  addon.eval("ns.SetMoverScale('box', 1.5) ns.SetMoverScale('cast_player', 2)");
  expect(sizes(addon)[0], "on screen: the box at 150% is 480 wide, so the cast bar at 200% is 240").toBe(240);
  addon.eval("ns.SetMoverScale('box', 1) ns.SetMoverScale('cast_player', 1) ns.SetMoverMatch('xpbar', 'width', 'cast_player')");
  expect(sizes(addon)[2], "a match of a match follows along").toBe(320);
  expect(results(addon, "ns.SetMoverMatch('cast_player', 'width', 'xpbar')"), "never round in a circle").toEqual([false, "Experience already matches the width of Player cast bar."]);
  expect(results(addon, "ns.SetMoverMatch('cast_player', 'height', 'box')"), "a cast bar's height is its own").toEqual([false, "Player cast bar sets its own height, so it can't match another frame's."]);
  expect(results(addon, "ns.SetMoverMatch('box', 'width', 'cast_player')"), "a frame Vanguard doesn't size can't match").toEqual([false, "TEST-ONLY box sets its own width, so it can't match another frame's."]);
  expect(results(addon, "ns.SetMoverMatch('xpbar', 'height', 'xpbar')"), "not itself").toEqual([false, "A frame can't match its own height."]);
  expect(results(addon, "ns.SetMoverMatch('xpbar', 'height', 'TEST-ONLY-none')"), "not a frame that isn't there").toEqual([false, NO_FRAME]);
  expect(results(addon, "ns.SetMoverMatch('TEST-ONLY-none', 'height', 'box')"), "nor for one").toEqual([false, NO_FRAME]);
  expect(results(addon, "ns.SetMoverMatch('xpbar', 'height', 'tall')"), "not a size it can't be").toEqual([false, "TEST-ONLY tall is 300 tall; Experience can be 2 to 40."]);
  expect(results(addon, "ns.SetMoverMatch('xpbar', 'height', 'box')"), "a size it can be").toEqual([true]);
  expect(addon.eval("return ns.Settings('positions').xpbar.match"), "saved with the frame").toEqual({ width: "cast_player", height: "box" });
  addon.eval("ns.SetMoverMatch('cast_player', 'width') ns.SetMoverMatch('xpbar', 'width', '') ns.SetMoverMatch('xpbar', 'height')");
  expect([sizes(addon), addon.eval("return ns.Settings('positions').xpbar.match == nil")], "unmatched, each is its own size again").toEqual([[220, 18, 478, 6], true]);
  addon.eval(`local p = ns.Settings("positions") p.xpbar.match = { width = "repbar" } p.repbar = { match = { width = "xpbar" } } ns.PlaceMover("xpbar")`);
  expect([sizes(addon)[2], addon.eval("return #ns.errors")], "a loop in a hand-edited profile gives up on the match, without an error").toEqual([478, 0]);
});

// The visible options slider row whose caption is this text, as Lua.
const sliderRow = (text) => `(function() for _, w in ipairs(__wfgStub.frames) do
  if w.track and w.label and w.label.__text == "${text}" and w:IsVisible() then return w end end end)()`;
// The default tooltip's lines' text.
const tipLines = (addon) => addon.eval("local out = {} for i, l in ipairs(GameTooltip.__lines or {}) do out[i] = l.text end return out");

it("a frame's own size under General → Layout: set for a frame Vanguard sizes, locked with why while matched or for one that sizes itself", () => {
  const addon = loggedIn(BOX);
  addon.eval('ns.Options.Show("general")');
  addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.dropdown and w.caption == "Frame to size" then w.dropdown.set("xpbar") end end');
  addon.eval(`local r = ${sliderRow("Its width")} r.set(300) r:Refresh()`);
  expect([sizes(addon)[2], addon.eval("return ns.Settings('positions').xpbar.w")], "the width slider sizes the XP bar, and it is saved").toEqual([300, 300]);
  addon.eval(`local r = ${sliderRow("Its height")} r.set(99) r:Refresh()`);
  expect(sizes(addon)[3], "each frame keeps to its own range").toBe(40);
  addon.eval("ns.SetMoverSize('xpbar', 'width', 478) ns.SetMoverSize('xpbar', 'height', 'TEST-ONLY')");
  expect(addon.eval("return ns.Settings('positions').xpbar.w"), "its own size back is saved as unset; a bad value changes nothing").toBe(null);
  addon.eval(`ns.SetMoverMatch("xpbar", "width", "box") local r = ${sliderRow("Its width")} r:Refresh() r:GetScript("OnEnter")(r)`);
  const why = "Matched to the width of TEST-ONLY box. To unmatch, right-click its handle in unlock mode (/vg unlock) and set Match width to None.";
  expect([tipLines(addon), addon.eval("return GameTooltip:IsShown()")], "matched, the slider locks; hovering it says to what, and how to unmatch").toEqual([[why], true]);
  addon.eval(`local r = ${sliderRow("Its width")} r:GetScript("OnClick")(r) r.track:GetScript("OnLeave")(r.track)`);
  expect([sizes(addon)[2], addon.eval("return GameTooltip:IsShown()")], "a click doesn't change it; leaving hides the tooltip").toEqual([200, false]);
  expect(addon.eval("return { ns.SetMoverSize('xpbar', 'width', 300) }"), "nor does setting it").toEqual([false, why]);
  addon.eval(`ns.SetMoverMatch("xpbar", "width") local r = ${sliderRow("Its width")} r:Refresh() GameTooltip:Hide() r:GetScript("OnEnter")(r)`);
  expect(addon.eval("return GameTooltip:IsShown()"), "unmatched, hovering shows nothing").toBe(false);
  addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.dropdown and w.caption == "Frame to size" then w.dropdown.set("box") end end');
  addon.eval(`local r = ${sliderRow("Its height")} r:Refresh() r:GetScript("OnEnter")(r)`);
  expect(tipLines(addon), "a frame that sizes itself: locked, and it says so").toEqual(["TEST-ONLY box sets its own height."]);
});
