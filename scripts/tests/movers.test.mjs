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
