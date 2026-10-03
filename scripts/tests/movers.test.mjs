// movers: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { chatHas, loggedIn } from "./helpers.mjs";

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
  expect(addon.eval(`return ${handle}:IsShown()`) === true, "/fui unlock shows a handle").toBeTruthy();
  addon.eval(`local h = ${handle}; h:GetScript("OnDragStart")(h); h:ClearAllPoints(); h:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 10, -20); h:GetScript("OnDragStop")(h)`);
  expect(JSON.stringify(point()) === JSON.stringify(["TOPLEFT", "TOPLEFT", 10, -20]), "dropping a handle moves its frame").toBeTruthy();
  expect(addon.eval("return ForeverUIDB.profiles.Default.positions.player.x") === 10, "the position is saved in the profile").toBeTruthy();
  addon.slash("reset player");
  expect(point()[0] === "CENTER", "/fui reset puts the frame back").toBeTruthy();
  addon.fire("PLAYER_REGEN_DISABLED");
  expect(addon.eval(`return ${handle}:IsShown()`) === false, "entering combat locks").toBeTruthy();
  addon.eval("__wfgStub.inCombat = true");
  addon.clearChat();
  addon.slash("unlock");
  expect(chatHas(addon, /Not in combat/), "unlock is refused in combat").toBeTruthy();
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
