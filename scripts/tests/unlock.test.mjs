// unlock: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

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
  const saved = () => addon.eval("local p = VanguardDB.profiles.Default.positions.a; return { p.point, p.x, p.y }");
  expect(JSON.stringify(saved()) === JSON.stringify(["TOP", -310, -160]), `a drop snaps to the other handle and anchors to the nearest edge (got ${JSON.stringify(saved())})`).toBeTruthy();
  addon.eval(`local h = ns.MoverHandleForTest("a"); h:GetScript("OnMouseDown")(h)`);
  addon.eval(`local h = ns.MoverHandleForTest("a"); h:GetScript("OnKeyDown")(h, "LEFT")`);
  expect(JSON.stringify(saved()) === JSON.stringify(["TOP", -311, -160]), "the arrow keys nudge the selected handle 1 px").toBeTruthy();
  addon.eval(`IsShiftKeyDown = function() return true end; local h = ns.MoverHandleForTest("a"); h:GetScript("OnKeyDown")(h, "UP")`);
  expect(JSON.stringify(saved()) === JSON.stringify(["TOP", -311, -150]), "Shift nudges 10 px").toBeTruthy();
  expect(/TOP -311, -150/.test(addon.eval(`return ns.MoverHandleForTest("a").label:GetText()`)), "the selected handle shows its point and offsets").toBeTruthy();
  addon.slash("grid 64");
  expect(addon.eval("return ns.GridLineCount()") === 48, "/vg grid 64 redraws the grid (31 + 17)").toBeTruthy();
  addon.slash("grid off");
  expect(addon.eval("return ns.GridLineCount()") === 0, "/vg grid off hides it").toBeTruthy();
  addon.slash("snap off");
  drop("a", 601, 900);
  expect(saved()[0] === "TOP" && saved()[1] === -309, `with snapping off, the drop stays where it was (got ${JSON.stringify(saved())})`).toBeTruthy();
  addon.slash("lock");
  expect(addon.eval(`return ns.MoverHandleForTest("a"):IsShown()`) === false, "/vg lock hides the handles").toBeTruthy();
});

// The accent's rrggbb after /vg accent <name>.
const accentAfter = (addon, name) => {
  addon.slash(`accent ${name}`);
  return addon.eval('return ns.Theme.Hex("accent")').slice(2);
};

it("accent presets", () => {
  const addon = loggedIn();
  addon.slash("accent orchid");
  expect(addon.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.orchid[1]") === true, "/vg accent orchid sets the orchid preset").toBeTruthy();
  expect(["fel", "void", "ember", "green", "purple", "red"].map((n) => accentAfter(addon, n)), "the names before #231 give jade, orchid and copper (#231)").toEqual(["4fbfa3", "b48ae8", "c8784a", "4fbfa3", "b48ae8", "c8784a"]);
  expect(addon.eval("return ns.Theme.PRESET_ORDER"), "the swatches' order").toEqual(["brass", "arcane", "jade", "orchid", "copper"]);
  addon.slash("accent blue");
  expect(addon.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.arcane[1]") === true, "the old preset names still work (blue is arcane)").toBeTruthy();
  addon.slash("accent #3D9EFF");
  expect(Math.abs(addon.eval("return select(3, ns.Theme.Accent())") - 1) < 1e-9, "hex accents still work").toBeTruthy();
});

it("unlock popover: anchor, offsets, reset", () => {
  const addon = loggedIn(UI_ENV);
  addon.slash("unlock");
  addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == "minimap" then __h = w end end __h:GetScript("OnMouseDown")(__h, "RightButton")');
  expect(addon.eval("return Vanguard_MoverPopover:IsShown()") === true, "right-clicking a handle opens its popover").toBeTruthy();
  addon.eval('local p = Vanguard_MoverPopover p.x:SetText("123") p.x:GetScript("OnEnterPressed")(p.x)');
  expect(addon.eval('return select(3, ns.MoverPoint("minimap"))') === 123, "typing an X offset saves it").toBeTruthy();
  addon.eval('local d = Vanguard_MoverPopover.anchor d:GetScript("OnClick")(d) Vanguard_Menu.items[5]:GetScript("OnClick")(Vanguard_Menu.items[5])');
  const p = addon.eval('return { ns.MoverPoint("minimap") }');
  expect(p[0] === "CENTER" && p[2] === 0 && p[3] === 0, "picking an anchor moves the frame to that screen point with no offset").toBeTruthy();
  expect(addon.eval("return Vanguard_MoverPopover.x:GetText()") === "0", "the boxes follow").toBeTruthy();
  addon.eval("ns.Nudge('minimap', 5, 0)");
  expect(addon.eval("return Vanguard_MoverPopover.x:GetText()") === "5", "arrow-key nudges update the popover").toBeTruthy();
  addon.eval("Vanguard_MoverPopover.reset:GetScript('OnClick')(Vanguard_MoverPopover.reset)");
  expect(addon.eval('return select(1, ns.MoverPoint("minimap"))') !== "CENTER", "Reset puts the frame back where it started").toBeTruthy();
  addon.slash("lock");
  expect(addon.eval("return Vanguard_MoverPopover:IsShown()") === false, "locking closes the popover").toBeTruthy();
});

// Types a value into one of the popover's boxes and presses Enter.
const typeInto = (addon, box, text) => addon.eval(`local b = Vanguard_MoverPopover.${box} b:SetText("${text}") b:GetScript("OnEnterPressed")(b)`);

it("unlock popover: scale and opacity in percent", () => {
  const addon = loggedIn(UI_ENV);
  addon.slash("unlock");
  addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == "minimap" then __h = w end end __h:GetScript("OnMouseDown")(__h, "RightButton")');
  // The popover's Scale and Opacity boxes, and the minimap holder's scale and alpha.
  const look = () => addon.eval("local p, f = Vanguard_MoverPopover, ns.MoverFrame('minimap') return { p.scale:GetText(), p.alpha:GetText(), f:GetScale(), f:GetAlpha() }");
  expect(look(), "they start at 100%").toEqual(["100", "100", 1, 1]);
  typeInto(addon, "scale", "150");
  typeInto(addon, "alpha", "40");
  expect(look(), "typing a percent sets the frame's scale and opacity").toEqual(["150", "40", 1.5, 0.4]);
  expect(addon.eval("return { __h:GetScale(), VanguardDB.profiles.Default.positions.minimap.scale }"), "the handle follows, and it is saved").toEqual([1.5, 1.5]);
  typeInto(addon, "scale", "TEST-ONLY");
  typeInto(addon, "alpha", "500");
  expect(look(), "a bad number is ignored and a big one stops at 100%").toEqual(["150", "100", 1.5, 1]);
  addon.eval("Vanguard_MoverPopover.reset:GetScript('OnClick')(Vanguard_MoverPopover.reset)");
  expect(look(), "Reset puts the scale and opacity back").toEqual(["100", "100", 1, 1]);
});

it("a grid size from a hand-edited profile string is kept to 8-256 px, so unlocking can't freeze the game", () => {
  const addon = loggedIn("UIParent:SetSize(1920, 1080)", { savedVariables: "VanguardDB.profiles = { Default = { movers = { gridSize = 1 } } }" });
  addon.slash("unlock");
  expect(addon.eval("return ns.GridLineCount()"), "1 px draws as 8 px (241 + 135 lines), not 3002 lines").toBe(376);
  addon.slash("lock");
  addon.eval("ns.MoverOptions().gridSize = 0");
  addon.slash("unlock");
  expect(addon.eval("return ns.GridLineCount()"), "0 px (a loop that never ends) draws as 8 px too").toBe(376);
  addon.eval("ns.ShowGrid(1000)");
  expect(addon.eval("return ns.GridLineCount()"), "and above 256 px as 256 (7 + 5 lines)").toBe(12);
});

it("accent presets (#231): a profile that picked ember keeps its colour", () => {
  const addon = loggedIn("", { savedVariables: "VanguardDB = { profiles = { Default = { theme = { accent = { 0xe0 / 255, 0x66 / 255, 0x4b / 255 } } } } }" });
  expect(addon.eval('return ns.Theme.Hex("accent")').slice(2), "the old ember stays, as its own hex").toBe("e0664b");
});
