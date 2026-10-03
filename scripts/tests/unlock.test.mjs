// unlock: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { UI_ENV, UP, key, loggedIn } from "./helpers.mjs";

it("unlock mode", () => {
  const addon = loggedIn(`
    UIParent:SetSize(1920, 1080)
    __a = CreateFrame("Frame", nil, UIParent); __a:SetSize(100, 20)
    __b = CreateFrame("Frame", nil, UIParent); __b:SetSize(100, 20)
    ns.Mover(__a, "a", "A", { "CENTER", "CENTER", 0, 0 })
    ns.Mover(__b, "b", "B", { "CENTER", "CENTER", 0, -100 })
  `);
  addon.slash("unlock");
  expect(addon.eval("return ns.GridLineCount()") === 94, "unlock shows a 32 px grid (61 + 33 lines on 1920x1080)").toBeTruthy();
  // Drops handle `key` with its bottom-left at (left, bottom).
  const drop = (key, left, bottom) =>
    addon.eval(`local h = ns.MoverHandleForTest("${key}"); h.__left, h.__bottom = ${left}, ${bottom}; h:GetScript("OnDragStop")(h)`);
  addon.eval(`function ns.MoverHandleForTest(k) for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == k then return w end end end`);
  // Handle b sits at the top left, away from the default frames, so it is the nearest snap for a.
  addon.eval(`local h = ns.MoverHandleForTest("b"); h.__left, h.__bottom = 500, 900`);
  drop("a", 601, 900);
  // Mover a's saved [point, x, y].
  const saved = () => addon.eval("local p = ForeverUIDB.profiles.Default.positions.a; return { p.point, p.x, p.y }");
  expect(JSON.stringify(saved()) === JSON.stringify(["TOP", -310, -160]), `a drop snaps to the other handle and anchors to the nearest edge (got ${JSON.stringify(saved())})`).toBeTruthy();
  addon.eval(`local h = ns.MoverHandleForTest("a"); h:GetScript("OnMouseDown")(h)`);
  addon.eval(`local h = ns.MoverHandleForTest("a"); h:GetScript("OnKeyDown")(h, "LEFT")`);
  expect(JSON.stringify(saved()) === JSON.stringify(["TOP", -311, -160]), "the arrow keys nudge the selected handle 1 px").toBeTruthy();
  addon.eval(`IsShiftKeyDown = function() return true end; local h = ns.MoverHandleForTest("a"); h:GetScript("OnKeyDown")(h, "UP")`);
  expect(JSON.stringify(saved()) === JSON.stringify(["TOP", -311, -150]), "Shift nudges 10 px").toBeTruthy();
  expect(/TOP -311, -150/.test(addon.eval(`return ns.MoverHandleForTest("a").label:GetText()`)), "the selected handle shows its point and offsets").toBeTruthy();
  addon.slash("grid 64");
  expect(addon.eval("return ns.GridLineCount()") === 48, "/fui grid 64 redraws the grid (31 + 17)").toBeTruthy();
  addon.slash("grid off");
  expect(addon.eval("return ns.GridLineCount()") === 0, "/fui grid off hides it").toBeTruthy();
  addon.slash("snap off");
  drop("a", 601, 900);
  expect(saved()[0] === "TOP" && saved()[1] === -309, `with snapping off, the drop stays where it was (got ${JSON.stringify(saved())})`).toBeTruthy();
  addon.slash("lock");
  expect(addon.eval(`return ns.MoverHandleForTest("a"):IsShown()`) === false, "/fui lock hides the handles").toBeTruthy();
});

it("accent presets", () => {
  const addon = loggedIn();
  addon.slash("accent void");
  expect(addon.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.void[1]") === true, "/fui accent void sets the void preset").toBeTruthy();
  addon.slash("accent blue");
  expect(addon.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.arcane[1]") === true, "the old preset names still work (blue is arcane)").toBeTruthy();
  addon.slash("accent #3D9EFF");
  expect(Math.abs(addon.eval("return select(3, ns.Theme.Accent())") - 1) < 1e-9, "hex accents still work").toBeTruthy();
});

it("unlock popover: anchor, offsets, reset", () => {
  const addon = loggedIn(UI_ENV);
  addon.slash("unlock");
  addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == "minimap" then __h = w end end __h:GetScript("OnMouseDown")(__h, "RightButton")');
  expect(addon.eval("return ForeverUI_MoverPopover:IsShown()") === true, "right-clicking a handle opens its popover").toBeTruthy();
  addon.eval('local p = ForeverUI_MoverPopover p.x:SetText("123") p.x:GetScript("OnEnterPressed")(p.x)');
  expect(addon.eval('return select(3, ns.MoverPoint("minimap"))') === 123, "typing an X offset saves it").toBeTruthy();
  addon.eval('local d = ForeverUI_MoverPopover.anchor d:GetScript("OnClick")(d) ForeverUI_Menu.items[5]:GetScript("OnClick")(ForeverUI_Menu.items[5])');
  const p = addon.eval('return { ns.MoverPoint("minimap") }');
  expect(p[0] === "CENTER" && p[2] === 0 && p[3] === 0, "picking an anchor moves the frame to that screen point with no offset").toBeTruthy();
  expect(addon.eval("return ForeverUI_MoverPopover.x:GetText()") === "0", "the boxes follow").toBeTruthy();
  addon.eval("ns.Nudge('minimap', 5, 0)");
  expect(addon.eval("return ForeverUI_MoverPopover.x:GetText()") === "5", "arrow-key nudges update the popover").toBeTruthy();
  addon.eval("ForeverUI_MoverPopover.reset:GetScript('OnClick')(ForeverUI_MoverPopover.reset)");
  expect(addon.eval('return select(1, ns.MoverPoint("minimap"))') !== "CENTER", "Reset puts the frame back where it started").toBeTruthy();
  addon.slash("lock");
  expect(addon.eval("return ForeverUI_MoverPopover:IsShown()") === false, "locking closes the popover").toBeTruthy();
});
