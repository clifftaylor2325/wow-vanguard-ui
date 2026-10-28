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
  const anchor = (l, b, w, h) => addon.eval(`return { ns.Layout.Anchor({ left = ${l}, bottom = ${b}, w = ${w}, h = ${h} }, { w = 1920, h = 1080 }) }`);
  expect(JSON.stringify(anchor(20, 900, 200, 40)) === JSON.stringify(["TOPLEFT", 20, -140]), "top-left third anchors TOPLEFT with edge offsets").toBeTruthy();
  expect(JSON.stringify(anchor(1700, 20, 200, 40)) === JSON.stringify(["BOTTOMRIGHT", -20, 20]), "bottom-right third anchors BOTTOMRIGHT").toBeTruthy();
  expect(JSON.stringify(anchor(860, 520, 200, 40)) === JSON.stringify(["CENTER", 0, 0]), "the middle anchors CENTER").toBeTruthy();
  expect(JSON.stringify(anchor(860, 20, 200, 40)) === JSON.stringify(["BOTTOM", 0, 20]), "bottom middle anchors BOTTOM").toBeTruthy();
  // ns.Layout.Snap of a 100x20 rect next to one at (500, 300).
  const snap = (l, b) => addon.eval(`local r = ns.Layout.Snap({ left = ${l}, bottom = ${b}, w = 100, h = 20 }, { { left = 500, bottom = 300, w = 100, h = 20 } }, { w = 1920, h = 1080 }) return { r.left, r.bottom }`);
  expect(JSON.stringify(snap(605, 250)) === JSON.stringify([600, 250]), "a left edge within 8 px snaps to another frame's right edge").toBeTruthy();
  expect(JSON.stringify(snap(700, 250)) === JSON.stringify([700, 250]), "nothing close, no snap").toBeTruthy();
  expect(JSON.stringify(snap(1000, 527)) === JSON.stringify([1000, 530]), "a center within 8 px snaps to the screen center").toBeTruthy();
  // The left edge lines up exactly with one frame, and the right edge is 3 px from another: the exact line-up stays.
  const exact = addon.eval("local r = ns.Layout.Snap({ left = 500, bottom = 250, w = 100, h = 20 }, { { left = 500, bottom = 300, w = 100, h = 20 }, { left = 603, bottom = 600, w = 50, h = 20 } }, { w = 1920, h = 1080 }) return { r.left, r.bottom }");
  expect(exact, "an exact line-up is not replaced by a near one").toEqual([500, 250]);
});

it("the popover says why a typed offset's link is refused", () => {
  const addon = loggedIn(BOX);
  // A hand-edited profile anchors the box to itself: the popover's offset can't hold that link.
  addon.eval('ns.Settings("positions").box = { rel = { to = "box", side = "LEFT", x = 0, y = 0 } }');
  addon.eval('ns.MoverPopover({ key = "box", label = "TEST-ONLY box" })');
  addon.eval('Vanguard_MoverPopover.x:SetText("5") Vanguard_MoverPopover.x:GetScript("OnEnterPressed")(Vanguard_MoverPopover.x)');
  expect(addon.eval("return Vanguard_MoverPopover.why:GetText()"), "a refused offset says why").toBe("A frame can't be anchored to itself.");
});

it("a mover's size the client can't give reads 0, not its height", () => {
  const addon = loggedIn(`
    __nw = CreateFrame("Frame", nil, UIParent)
    __nw:SetSize(200, 40)
    ns.Mover(__nw, "nw", "No width", { "CENTER", "CENTER", 0, 0 })
    __nw.GetWidth = function() return nil end
  `);
  expect(addon.eval('return ns.MoverSize("nw", "width")'), "a width the client can't give is 0").toBe(0);
  expect(addon.eval('return ns.MoverSize("nw", "height")'), "the height is still the frame's").toBe(40);
});

it("a frame anchored to the chat window while the client hides the window's size: placed and unlocked with every handle shown, with no error", () => {
  const addon = loggedIn();
  expect(addon.eval('return ns.SetMoverAnchor("uf_player", "chat", "TOP")'), "anchored while the size is plain").toBe(true);
  addon.world.secretGeometry("strict");
  expect(addon.eval("return ns.IsSecret(ChatFrame1:GetWidth())"), "the chat window's width is now hidden").toBe(true);
  expect(addon.eval('return { pcall(ns.PlaceMover, "uf_player") }'), "placed again, the hidden size read as none").toEqual([true]);
  expect(addon.eval('return { ns.MoverSize("chat", "width"), ns.MoverSize("chat", "height") }'), "the window's size reads 0 (the Layout card's sliders sit at their start)").toEqual([0, 0]);
  expect(addon.eval('return ns.SetMoverAnchor("uf_target", "chat", "RIGHT")'), "another frame can still be anchored to it").toBe(true);
  expect(addon.eval("return ns.Unlock()"), "unlock mode opens").toBe(true);
  addon.advance(0.5);
  const handles = addon.eval(`local all, shown, chat = 0, 0, nil
    for _, w in ipairs(__wfgStub.frames) do
      if w.mover then
        all = all + 1
        if w:IsShown() then shown = shown + 1 end
        if w.mover.key == "chat" then chat = { w:GetWidth(), w:GetHeight() } end
      end
    end
    return { all == #ns.MoverList(), shown == all, chat, #ns.errors }`);
  expect(handles, "every mover's handle shows, the chat handle at its grab minimum, nothing caught").toEqual([true, true, [40, 14], 0]);
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
  expect(addon.eval("return { __h:GetScale(), __h:GetWidth(), __h:GetHeight() }"), "the handle stays at UIParent's scale, as big as the frame is on screen").toEqual([1, 400, 80]);
  addon.eval('__h:GetScript("OnDragStart")(__h) __h:ClearAllPoints() __h:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -20) __h:GetScript("OnDragStop")(__h)');
  expect(addon.eval("return { ns.MoverPoint('box') }"), "a drop is saved as dropped").toEqual(["TOPLEFT", "TOPLEFT", 10, -20]);
  expect([addon.frame("TESTONLY_Box").rect.left, addon.frame("TESTONLY_Box").rect.top], "and the frame lands where the handle was dropped").toEqual([10, 1060]);
  addon.eval("__h.GetLeft = function() return nil end");
  addon.eval('__h:GetScript("OnDragStart")(__h) __h:ClearAllPoints() __h:SetPoint("TOP", UIParent, "TOP", 5, -10) __h:GetScript("OnDragStop")(__h)');
  expect(addon.eval("return { ns.MoverPoint('box') }"), "without geometry, the client's point is saved as it is").toEqual(["TOP", "TOP", 5, -10]);
  addon.eval('ns.SetMoverScale("box", 1.5)');
  expect(addon.eval("return { __h:GetScale(), __h:GetWidth() }"), "a new scale resizes the handle, not rescales it").toEqual([1, 300]);
  addon.slash("lock");
  setCombat(addon, true);
  addon.eval('ns.SetMoverScale("box", 0.5)');
  expect([addon.eval("return __box:GetScale()"), addon.eval("return (ns.MoverLook('box'))")], "in combat the scale is saved and waits").toEqual([1.5, 0.5]);
  setCombat(addon, false);
  expect(addon.eval("return __box:GetScale()"), "and applies when combat ends").toBe(0.5);
});

it("scale and opacity steps in combat queue one placement per mover, and the last values apply when the fight ends", () => {
  const addon = loggedIn(BOX);
  setCombat(addon, true);
  const before = addon.eval("return ns.QueuedCount()");
  addon.eval('for i = 1, 50 do ns.SetMoverScale("box", 0.5 + i * 0.005) ns.SetMoverAlpha("box", 0.4 + i * 0.01) end');
  expect(addon.eval("return ns.QueuedCount()") - before, "fifty steps of each wait as one entry").toBe(1);
  setCombat(addon, false);
  expect(addon.eval("return { __box:GetScale(), __box:GetAlpha() }"), "the latest scale and opacity are what the frame gets").toEqual([0.75, 0.9]);
});

it("handles stay readable and grabbable at any Scale %: their label keeps its size and a thin frame's handle its 40 x 14 minimum", () => {
  const addon = loggedIn(BOX + "__thin = CreateFrame('Frame', 'TESTONLY_Thin', UIParent) __thin:SetSize(240, 10) ns.Mover(__thin, 'thin', 'TEST-ONLY thin', { 'BOTTOM', 'BOTTOM', 0, 300 })");
  addon.eval('ns.SetMoverScale("box", 0.5) ns.SetMoverScale("thin", 0.5)');
  addon.slash("unlock");
  // A handle's scale against UIParent's, its width and height, and its label's scale against UIParent's.
  const handle = (key) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == "${key}" then return { w:GetEffectiveScale() / UIParent:GetEffectiveScale(), w:GetWidth(), w:GetHeight(), w.label:GetEffectiveScale() / UIParent:GetEffectiveScale() } end end`);
  expect(handle("box"), "50%: drawn at UIParent's scale, as big as the frame is on screen (100 x 20), the label at full size").toEqual([1, 100, 20, 1]);
  expect(handle("thin"), "a 120 x 5 frame's handle is still 120 wide and at least 14 tall").toEqual([1, 120, 14, 1]);
  addon.eval('ns.SetMoverScale("box", 2)');
  expect(handle("box"), "200%: the label is not doubled").toEqual([1, 400, 80, 1]);
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

it("a saved position that is a number or a boolean leaves the unit frames loaded at their default spot", () => {
  const clean = loggedIn().eval("return { ns.MoverPoint('uf_player') }");
  const addon = loggedIn(BOX, { savedVariables: `VanguardDB.profiles = { Default = { positions = { uf_player = 5, uf_target = true } } }` });
  expect(addon.eval("return { ns.GetModule('UnitFrames').enabled, #ns.errors }"), "the unit frames still load, with nothing to report").toEqual([true, 0]);
  expect(addon.eval("return { ns.MoverPoint('uf_player') }"), "a number entry leaves the default").toEqual(clean);
  expect(addon.eval("return { ns.MoverPoint('uf_target') }")[0], "a boolean entry leaves a default point").toBeTypeOf("string");
});

it("a saved offset that is infinite, NaN or absurd is kept to ns.MAX_OFFSET before it reaches SetPoint", () => {
  const addon = loggedIn(BOX);
  addon.eval('ns.Profile().positions.box = { point = "TOPLEFT", relPoint = "TOPLEFT", x = math.huge, y = -math.huge }');
  expect(addon.eval("return { ns.MoverPoint('box') }"), "infinity is the far edge of the range").toEqual(["TOPLEFT", "TOPLEFT", 5000, -5000]);
  addon.eval('ns.Profile().positions.box.x, ns.Profile().positions.box.y = 0/0, 1e300');
  expect(addon.eval("return { ns.MoverPoint('box') }"), "NaN reads as 0, a huge number as the edge").toEqual(["TOPLEFT", "TOPLEFT", 0, 5000]);
  expect(addon.eval("return { ns.SaneOffset(nil), ns.SaneOffset('12'), ns.SaneOffset(-7.5), ns.SaneOffset({}) }"), "plain offsets and strings of numbers are kept").toEqual([0, 12, -7.5, 0]);
});

it("an anchored frame whose link offset is infinite stays within ns.MAX_OFFSET of the screen", () => {
  const addon = loggedIn(BOX + DEP);
  addon.eval("ns.SetMoverAnchor('dep', 'box', 'RIGHT', 4, 0) ns.Profile().positions.dep.rel.x = 1e300 ns.MoverChanged('dep')");
  expect(addon.eval("local _, _, x, y = ns.MoverPoint('dep') return { math.abs(x) <= ns.MAX_OFFSET, math.abs(y) <= ns.MAX_OFFSET }"), "the computed offsets are kept in range").toEqual([true, true]);
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
  expect(rect("ns.Layout.Rect({ point = 'TOPRIGHT', relPoint = 'TOPRIGHT', x = -12, y = -12 }, { w = 100, h = 50 }, { w = 1920, h = 1080 })"), "a frame's rect from its point").toEqual([1808, 1018, 100, 50]);
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

it("an anchored frame lands where its link last put it, once the frame it's anchored to is off", () => {
  const addon = loggedIn(BOX + DEP);
  addon.eval("ns.SetMoverAnchor('dep', 'box', 'RIGHT', 4, 0)");
  addon.eval('ns.Nudge("box", 50, 0)');
  const placed = rectOf(addon, "TESTONLY_Dep");
  const positions = addon.eval("return { dep = ns.Settings('positions').dep }");
  const off = loggedIn(DEP, { savedVariables: `VanguardDB.profiles.Default = { positions = ${lua(positions)} }` });
  expect(rectOf(off, "TESTONLY_Dep"), "with the box's module off, it stays where the box last put it").toEqual(placed);
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

// The options slider row whose caption is this text, its tab shown, as Lua.
const sliderRow = (text) => `(function() for _, w in ipairs(__wfgStub.frames) do
  if w.track and w.label and w.label.__text == "${text}" and ns.Options.RevealRow(w) then return w end end end)()`;
// The default tooltip's lines' text.
const tipLines = (addon) => addon.eval("local out = {} for i, l in ipairs(GameTooltip.__lines or {}) do out[i] = l.text end return out");

it("a frame's size slider: a caption click at the frame's own maximum wraps to its minimum", () => {
  const addon = loggedIn(BOX);
  addon.eval('ns.Options.Show("general")');
  addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.dropdown and w.caption == "Frame to size" then w.dropdown.set("xpbar") end end');
  addon.eval(`local r = ${sliderRow("Its height")} r.set(40) r:Refresh()`);
  addon.eval(`local r = ${sliderRow("Its height")} r:GetScript("OnClick")(r)`);
  expect(sizes(addon)[3], "the XP bar's height is 2 to 40 (the slider goes to 80): from 40 the click wraps").toBe(2);
  addon.eval(`local r = ${sliderRow("Its height")} r:GetScript("OnClick")(r)`);
  expect(sizes(addon)[3], "and the next click steps up again").toBe(3);
});
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
  // The slider's look: whether its thumb, fill and caption are in the given tokens' colours.
  const look = (thumb, caption) => addon.eval(`local r = ${sliderRow("Its width")}
    local function same(c, k) local x = { ns.Theme.RGB(k) } return c[1] == x[1] and c[2] == x[2] and c[3] == x[3] end
    return { same(r.thumb.__vertexColor, "${thumb}"), same(r.fillParts[2].__vertexColor, "borderHi"), same(r.label.__textColor, "${caption}") }`);
  expect(look("disabled", "muted"), "locked, its thumb dims to the disabled grey, the fill stays the quiet grey and the caption is muted").toEqual([true, true, true]);
  addon.eval(`local r = ${sliderRow("Its width")} r:GetScript("OnClick")(r) r.track:GetScript("OnLeave")(r.track)`);
  expect([sizes(addon)[2], addon.eval("return GameTooltip:IsShown()")], "a click doesn't change it; leaving hides the tooltip").toEqual([200, false]);
  expect(addon.eval("return { ns.SetMoverSize('xpbar', 'width', 300) }"), "nor does setting it").toEqual([false, why]);
  addon.eval(`ns.SetMoverMatch("xpbar", "width") local r = ${sliderRow("Its width")} r:Refresh() GameTooltip:Hide() r:GetScript("OnEnter")(r)`);
  expect(addon.eval("return GameTooltip:IsShown()"), "unmatched, hovering shows nothing").toBe(false);
  expect(look("white", "text"), "unlocked again, the thumb is white and the caption plain text").toEqual([true, true, true]);
  addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.dropdown and w.caption == "Frame to size" then w.dropdown.set("box") end end');
  addon.eval(`local r = ${sliderRow("Its height")} r:Refresh() r:GetScript("OnEnter")(r)`);
  expect(tipLines(addon), "a frame that sizes itself: locked, and it says so").toEqual(["TEST-ONLY box sets its own height."]);
});

it("a frame anchored to another follows it when the screen size or UI scale changes", () => {
  const addon = loggedIn(`
    __wfgStub.setScreen(1920, 1080)
    __a = CreateFrame("Frame", "TESTONLY_A", UIParent) __a:SetSize(200, 40)
    __b = CreateFrame("Frame", "TESTONLY_B", UIParent) __b:SetSize(100, 20)
    ns.Mover(__a, "a", "TEST-ONLY a", { "CENTER", "CENTER", 0, 0 })
    ns.Mover(__b, "b", "TEST-ONLY b", { "BOTTOM", "BOTTOM", 0, 100 })
    ns.SetMoverAnchor("b", "a", "BOTTOM", 10, -5)
  `);
  addon.slash("unlock");
  // The left edges of a, b and b's handle.
  const lefts = () => addon.eval("return { __a:GetLeft(), __b:GetLeft(), ns.MoverHandleForTest():GetLeft() }");
  addon.eval(`function ns.MoverHandleForTest() for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == "b" then return w end end end`);
  expect(lefts(), "b and its handle hang 10 right of a's bottom center, at 1920 wide").toEqual([860, 920, 920]);
  addon.eval("__wfgStub.setScreen(2560, 1080)");
  addon.fire("DISPLAY_SIZE_CHANGED");
  addon.advance(2);
  expect(lefts(), "a's centre moved 320 right, and b and its handle followed it").toEqual([1180, 1240, 1240]);
});

it("layout: the shift that fits a rect onto the screen less the room kept at its edges", () => {
  const addon = loggedIn();
  // ns.Layout.FitShift of a w x h rect at left, bottom on a 1000 x 600 screen, with room as Lua.
  const shift = (l, b, w, h, room = "nil") => addon.eval(`return { ns.Layout.FitShift({ left = ${l}, bottom = ${b}, w = ${w}, h = ${h} }, { w = 1000, h = 600 }, ${room}) }`);
  expect(shift(100, 100, 200, 50), "a rect on the screen stays where it is").toEqual([0, 0]);
  expect(shift(900, -20, 200, 50), "one past the right and bottom edges moves back on").toEqual([-100, 20]);
  expect(shift(500, 100, 300, 50, "{ right = 250 }"), "one in the room kept at the right moves out of it").toEqual([-50, 0]);
  expect(shift(-50, 500, 1200, 900), "one bigger than the screen is left where its anchor puts it").toEqual([0, 0]);
});

// Every mover's point (ns.MoverPoint) on a w x h canvas.
const spotsAt = (addon, w, h) => addon.eval(`__wfgStub.setScreen(${w}, ${h}) local out = {}
  for _, m in ipairs(ns.MoverList()) do out[m.key] = { ns.MoverPoint(m.key) } end
  return out`);

it("at 1365 x 768 and wider every default spot is where it always was: only narrower or shorter canvases adapt", () => {
  const addon = loggedIn("", { savedVariables: "VanguardDB = { profiles = { Default = { PartyExtras = { show = true } } } }" });
  // On a canvas far bigger than any screen nothing is narrow or off the edge: each default as given.
  const given = spotsAt(addon, 8000, 4000);
  expect(given.uf_targettarget, "the target of target's default as given").toEqual(["BOTTOM", "BOTTOM", 426, 196]);
  for (const [w, h] of [[1365, 768], [1366, 768], [1600, 900], [1920, 1080], [2743, 1543], [4914, 2057]]) {
    expect(spotsAt(addon, w, h), `${w} x ${h}`).toEqual(given);
  }
});

it("narrow canvases: the target of target sits over the target's cast bar, on screen and clear of the target and the tooltip", () => {
  for (const [w, h] of [[1280, 800], [1229, 768], [1024, 768], [835, 668]]) {
    const addon = loggedIn(`__wfgStub.setScreen(${w}, ${h})`);
    const [tot, target, cast, tip] = ["Vanguard_targettarget", "Vanguard_target", "Vanguard_CastBar_target", "Vanguard_TooltipAnchor"].map((n) => addon.frame(n).rect);
    expect(addon.eval("return { ns.MoverPoint('uf_targettarget') }"), `${w} x ${h}: over the target's inner end`).toEqual(["BOTTOM", "BOTTOM", 180, 280]);
    expect(tot.left >= 0 && tot.left + tot.width <= w, `${w} x ${h}: on screen`).toBe(true);
    expect(tot.bottom >= target.bottom + target.height && tot.bottom >= cast.bottom + cast.height, `${w} x ${h}: above the target and its cast bar`).toBe(true);
    expect(tot.left + tot.width <= tip.left || tot.bottom >= tip.bottom + tip.height, `${w} x ${h}: clear of the tooltip's corner`).toBe(true);
  }
});

it("narrow canvases: your buffs wrap in fewer columns, clear of the main tanks and raid tools; a moved block keeps its row", () => {
  // Your buffs' block on a w x h canvas: its left edge, width and buffs to a row, and the main tanks' right edge.
  const block = (w, h, saved = "") => {
    const addon = loggedIn(`__wfgStub.setScreen(${w}, ${h})`, { savedVariables: saved });
    const r = addon.frame("Vanguard_PlayerAuras").rect, tanks = addon.frame("Vanguard_MainTanksHolder").rect;
    return { left: r.left, perRow: Math.round(r.width / 34), tanksRight: tanks.left + tanks.width };
  };
  expect(block(1365, 768).perRow, "1365 wide: a full row of 12").toBe(12);
  for (const [w, h, n] of [[1229, 768, 11], [1024, 768, 5]]) {
    const b = block(w, h);
    expect([b.perRow, b.left >= b.tanksRight], `${w} x ${h}: ${n} to a row, left of it the main tanks' spot is clear`).toEqual([n, true]);
  }
  expect(block(835, 668).perRow, "835 wide: never fewer than five to a row (clear of the raid tools; the main tanks meet it)").toBe(5);
  const moved = block(1229, 768, "VanguardDB = { profiles = { Default = { positions = { playerauras = { point = 'TOPLEFT', relPoint = 'TOPLEFT', x = 20, y = -300 } } } } }");
  expect([moved.perRow, moved.left], "dragged elsewhere, the block keeps its 12 to a row").toEqual([12, 20]);
});

it("a mover's frame is kept on the screen, so a spot saved on a wider screen can't leave it off the edge", () => {
  const addon = loggedIn(`
    __f = CreateFrame("Frame", nil, UIParent)
    __f:SetSize(200, 40)
    function __f:SetClampedToScreen(on) self.__testClamped = on end
    ns.Mover(__f, "box", "TEST-ONLY box", { "CENTER", "CENTER", 0, 0 })
  `);
  expect(addon.eval("return __f.__testClamped"), "clamped when it is placed").toBe(true);
  addon.eval("__f.__testClamped = nil ns.SetMoverPoint('box', 'LEFT', 'LEFT', 1150, 0)");
  expect(addon.eval("return __f.__testClamped"), "and again when it moves").toBe(true);
});

it("a canvas change while playing works the unsaved default spots out again, as a fresh login on that canvas would", () => {
  const meterOn = { savedVariables: "VanguardDB.profiles = { Default = { Meter = { on = true } } }" };
  const env = "Enum.DamageMeterSessionType = { Current = 1 } Enum.DamageMeterType = { Dps = 1, Hps = 3 }\n";
  // The target of target's and the meter's rectangles.
  const rects = (addon) => ["Vanguard_targettarget", "Vanguard_Meter"].map((name) => rectOf(addon, name));
  const resize = (addon, w, h) => { addon.eval(`__wfgStub.setScreen(${w}, ${h})`); addon.fire("UI_SCALE_CHANGED"); addon.fire("DISPLAY_SIZE_CHANGED"); addon.advance(1); };
  const addon = loggedIn(env, meterOn);
  resize(addon, 1229, 768);
  expect(rects(addon), "1920 down to 1229 wide: where a login at 1229 puts them").toEqual(rects(loggedIn(env + "__wfgStub.setScreen(1229, 768)", meterOn)));
  expect(addon.eval("return { ns.MoverPoint('uf_targettarget') }"), "the narrow spot over the target's cast bar").toEqual(["BOTTOM", "BOTTOM", 180, 280]);
  resize(addon, 1920, 1080);
  expect(rects(addon), "and back up: the wide spots again").toEqual(rects(loggedIn(env, meterOn)));
  addon.eval("ns.SetMoverPoint('uf_targettarget', 'TOPLEFT', 'TOPLEFT', 50, -50)");
  resize(addon, 1229, 768);
  const [left, bottom, , height] = rectOf(addon, "Vanguard_targettarget");
  expect([left, bottom + height], "a spot you saved stays 50 in from the top left corner, not moved to a default").toEqual([50, 718]);
});

it("the position popover opens on the side of a handle that has room, so it never covers the handle it belongs to", () => {
  const addon = loggedIn("__wfgStub.setScreen(1365, 768)");
  addon.slash("unlock");
  // Right-clicks a mover's handle, as the player does, and gives the handle's and the popover's rects.
  const open = (key) => {
    addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == "${key}" then w:GetScript("OnMouseDown")(w, "RightButton") end end`);
    const handle = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == "${key}" then return { w:GetLeft(), w:GetRight() } end end`);
    const popover = addon.frame("Vanguard_MoverPopover").rect;
    return { handleLeft: handle[0], handleRight: handle[1], left: popover.left, right: popover.left + popover.width };
  };
  const minimap = open("minimap");
  expect(minimap.right, "a right-edge frame: the popover ends at its handle's left edge").toBeLessThanOrEqual(minimap.handleLeft);
  expect(minimap.left, "and starts on the screen").toBeGreaterThanOrEqual(0);
  const chat = open("chat");
  expect(chat.left, "a frame with room on its right: the popover starts right of its handle, as before").toBeGreaterThanOrEqual(chat.handleRight);
  expect(chat.right, "and stays on the screen").toBeLessThanOrEqual(1365);
});

it("a handle hidden in the middle of a drag by a fight lets go of the cursor", () => {
  const addon = loggedIn(BOX);
  addon.slash("unlock");
  addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == "box" then __h = w end end __h:GetScript("OnDragStart")(__h)');
  expect(addon.eval("return __h.__moving"), "the drag is live").toBe(true);
  addon.fire("PLAYER_REGEN_DISABLED");
  expect(addon.eval("return { __h:IsShown(), __h.__moving, #ns.errors }"), "the fight hides the handle and ends the drag").toEqual([false, false, 0]);
});

it("a handle hidden in the middle of a drag by locking out of combat lets go of the cursor", () => {
  const addon = loggedIn(BOX);
  addon.slash("unlock");
  addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == "box" then __h = w end end __h:GetScript("OnDragStart")(__h) ns.Lock()');
  expect(addon.eval("return { __h:IsShown(), __h.__moving }"), "Lock hides the handle and ends the drag").toEqual([false, false]);
});

it("the options window's header lets go of the cursor when the window closes in the middle of a drag", () => {
  const addon = loggedIn();
  addon.eval('ns.Options.Show("general")');
  addon.eval("local o = Vanguard_Options o.header:GetScript('OnDragStart')(o.header) o:Hide()");
  expect(addon.eval("return { Vanguard_Options:IsShown(), Vanguard_Options.__moving, #ns.errors }"), "the closed window is no longer moving").toEqual([false, false, 0]);
});
