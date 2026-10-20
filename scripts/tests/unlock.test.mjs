// unlock: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, UI_ENV, UP, chatHas, gridLines, isTok, key, loggedIn, px, setCombat } from "./helpers.mjs";
import { alphaOf, buttonOf, closeOf, escapes, insets, pressEscape, titleOf } from "./dialogs.mjs";

it("unlock mode", () => {
  const addon = loggedIn(`
    UIParent:SetSize(1920, 1080)
    __a = CreateFrame("Frame", nil, UIParent); __a:SetSize(100, 20)
    __b = CreateFrame("Frame", nil, UIParent); __b:SetSize(100, 20)
    ns.Mover(__a, "a", "A", { "CENTER", "CENTER", 0, 0 })
    ns.Mover(__b, "b", "B", { "CENTER", "CENTER", 0, -100 })
  `);
  addon.slash("unlock");
  expect(gridLines(addon) === 94, "unlock shows a 32 px grid (61 + 33 lines on 1920x1080)").toBeTruthy();
  addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == "a" then __h = w end end');
  expect(addon.eval("return { __h.__strata, __h:GetFrameLevel() - __a:GetFrameLevel() }"),
    "a handle sits on the HIGH strata, well over its frame (and a window's scroll parts) and under Edit Mode's DIALOG window").toEqual(["HIGH", 50]);
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
  expect(gridLines(addon) === 48, "/vg grid 64 redraws the grid (31 + 17)").toBeTruthy();
  addon.slash("grid off");
  expect(gridLines(addon) === 0, "/vg grid off hides it").toBeTruthy();
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
  expect(addon.eval("local P, n = ns.Theme.PRESETS, 0 for _ in pairs(P) do n = n + 1 end return { P.fel == P.jade, P.ember == P.copper, P.nothing == nil, n }"), "and read from T.PRESETS too, which still lists only the five").toEqual([true, true, true, 5]);
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
  const pop = "Vanguard_MoverPopover";
  expect(titleOf(addon, pop), "a card's title: the heading role in the text colour, T.SPACE.gap in and down from its corner").toEqual({ size: addon.eval("return ns.Theme.RoleSize('heading')"), text: true, left: 8, mid: -15 });
  expect(closeOf(addon, pop, "close"), "with the X T.SPACE.gap in from the top-right corner").toEqual([8, 8, true]);
  expect([escapes(addon, pop), alphaOf(addon, pop), addon.eval(`return ${pop}.title:GetWidth()`)], "Escape closes it; the dialog alpha (it has edit boxes); the title is kept short of the X").toEqual([true, 0.98, 236]);
  const column = ["target", "anchor", "x", "y", "scale", "alpha", "matchWidth", "matchHeight"].map((field) => addon.eval(`local w = ${pop}.${field} return { w:GetWidth(), w:GetHeight(), ${pop}:GetRight() - w:GetRight() }`));
  expect(column, "the right column has one edge: dropdowns and number boxes alike 150 wide, an inline control (20) tall, T.SPACE.col in").toEqual(Array(8).fill([150, 20, 12]));
  // A widget's screen rect, and where its middle is up the screen.
  const rect = (ref) => addon.frame(ref).rect;
  const middle = (r) => r.bottom + r.height / 2;
  expect([middle(rect(`${pop}.x`)) - middle(addon.texts("X offset")[0].rect), middle(rect(`${pop}.matchHeight`)) - middle(addon.texts("Match height")[0].rect)], "each caption is level with its control").toEqual([0, 0]);
  expect([buttonOf(addon, `${pop}.done`), buttonOf(addon, `${pop}.reset`), insets(addon, `${pop}.done`, pop).slice(2)], "Done is the one accent button, Reset plain; standalone, 120 wide, T.SPACE.pad from the corner like the other dialogs")
    .toEqual([[true, "Done", 26, 120], [false, "Reset", 26, 120], [16, 16]]);
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
  addon.eval(`local d = ${pop}.target d:GetScript("OnClick")(d)`);
  expect(addon.eval("return Vanguard_Menu:IsShown()"), "a dropdown is open").toBe(true);
  pressEscape(addon);
  expect([addon.eval(`return ${pop}:IsShown()`), addon.eval("return Vanguard_Menu:IsShown()")], "Escape closes the popover and the menu open from it").toEqual([false, false]);
  // Right-clicks the minimap's handle, which opens its popover.
  const rightClick = () => addon.eval('__h:GetScript("OnMouseDown")(__h, "RightButton")');
  rightClick();
  addon.click(`${pop}.close`);
  addon.advance(1);
  expect(addon.eval(`return ${pop}:IsShown()`), "the X closes it").toBe(false);
  rightClick();
  addon.click(`${pop}.done`);
  addon.advance(1);
  expect(addon.eval(`return ${pop}:IsShown()`), "as Done does").toBe(false);
  rightClick();
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

// Opens a popover dropdown (by its field) and picks the item with this text, scrolling the menu as needed.
const pick = (addon, field, text) => addon.eval(`local d = Vanguard_MoverPopover.${field} d:GetScript("OnClick")(d)
  for _ = 1, 40 do for _, b in ipairs(Vanguard_Menu.items) do if b:IsShown() and b.text:GetText() == "${text}" then b:GetScript("OnClick")(b) return true end end
  Vanguard_Menu:GetScript("OnMouseWheel")(Vanguard_Menu, -1) end`);

it("unlock popover: anchored to another frame's side, offsets from it, matched sizes, and why a link is refused", () => {
  const addon = loggedIn(UI_ENV);
  addon.slash("unlock");
  addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == "cast_player" then __h = w end end __h:GetScript("OnMouseDown")(__h, "RightButton")');
  // The popover's state: [title, point dropdown shown, side dropdown shown, X, Y, why].
  const state = () => addon.eval(`local p = Vanguard_MoverPopover
    return { p.title:GetText(), p.anchor:IsShown(), p.side:IsShown(), p.x:GetText(), p.y:GetText(), p.why:GetText() }`);
  const at = addon.frame("Vanguard_CastBar_player").rect;
  pick(addon, "target", "Minimap");
  expect(addon.eval("return { ns.MoverAnchor('cast_player') }").slice(0, 2), "anchored to the minimap, on its nearest side (below it)").toEqual(["minimap", "BOTTOM"]);
  expect([addon.frame("Vanguard_CastBar_player").rect.left, addon.frame("Vanguard_CastBar_player").rect.bottom], "where it was").toEqual([at.left, at.bottom]);
  pick(addon, "side", "Bottom");
  expect(state(), "a side puts it flush under the minimap; the popover shows the side and its offsets").toEqual(["Player cast bar  ·  Below Minimap", false, true, "0", "0", ""]);
  addon.eval('local p = Vanguard_MoverPopover p.x:SetText("-40") p.x:GetScript("OnEnterPressed")(p.x)');
  expect(addon.eval("return { ns.MoverAnchor('cast_player') }"), "an X offset is from the side it's anchored to").toEqual(["minimap", "BOTTOM", -40, 0]);
  expect(addon.eval("return __h.label:GetText()"), "and the handle says so").toBe("Player cast bar\nBelow Minimap -40, 0");
  addon.slash("snap off");
  addon.eval('local h = __h h.__left, h.__bottom = h:GetLeft() + 3, h:GetBottom() - 8 h:GetScript("OnDragStop")(h)');
  expect(addon.eval("return { ns.MoverAnchor('cast_player') }").slice(2), "a drag keeps the link, with new offsets").toEqual([-37, -8]);
  pick(addon, "matchWidth", "Minimap");
  expect(addon.eval("return Vanguard_CastBar_player:GetWidth() == ns.MoverFrame('minimap'):GetWidth()"), "Match width takes the minimap's width").toBe(true);
  pick(addon, "matchHeight", "Minimap");
  expect(state()[5], "Match height is refused, and the popover says why").toBe("Player cast bar sets its own height, so it can't match another frame's.");
  pick(addon, "target", "Screen");
  expect([addon.eval("return ns.MoverAnchor('cast_player') == nil"), state()[1], state()[5]], "anchored to the screen again; the point dropdown is back").toEqual([true, true, ""]);
  addon.eval("Vanguard_MoverPopover.reset:GetScript('OnClick')(Vanguard_MoverPopover.reset)");
  expect(addon.eval("return { ns.MoverMatch('cast_player', 'width') == nil, Vanguard_CastBar_player:GetWidth() }"), "Reset unmatches it too").toEqual([true, 220]);
});

// TEST-ONLY boxes a and b, 100 x 20 each, on a 1920 x 1080 screen.
const BOXES = `
  UIParent:SetSize(1920, 1080)
  __a = CreateFrame("Frame", "TESTONLY_A", UIParent); __a:SetSize(100, 20)
  __b = CreateFrame("Frame", "TESTONLY_B", UIParent); __b:SetSize(100, 20)
  ns.Mover(__a, "a", "A", { "CENTER", "CENTER", 0, 0 })
  ns.Mover(__b, "b", "B", { "CENTER", "CENTER", 0, -100 })
`;

it("unlock mode's bar: Exit without saving puts every frame back as it was; Save and lock keeps the changes", () => {
  const addon = loggedIn(BOXES);
  addon.eval("ns.SetMoverPoint('a', 'TOP', 'TOP', 0, -300) ns.SetMoverScale('b', 1.5)");
  // Every saved spot, and where the two boxes are.
  const now = () => ({ positions: addon.eval("return ns.Settings('positions')"), a: addon.frame("TESTONLY_A").rect, b: addon.frame("TESTONLY_B").rect });
  const before = now();
  addon.slash("unlock");
  expect([addon.eval("return Vanguard_UnlockBar:IsShown()"), addon.eval("return Vanguard_UnlockBar.text:GetText()")], "unlocking shows the bar, with how to move a frame").toEqual([true, "Drag to move · right-click for anchor, scale, opacity · arrows nudge (Shift ×10)"]);
  addon.eval("ns.Nudge('a', 10, 0) ns.SetMoverAnchor('b', 'a', 'BOTTOM', 0, -4) ns.SetMoverScale('b', 1) ns.SetMoverAlpha('a', 0.5)");
  expect(now(), "the frames moved").not.toEqual(before);
  addon.eval("Vanguard_UnlockBar.exit:GetScript('OnClick')(Vanguard_UnlockBar.exit)");
  expect(now(), "Exit without saving: every spot, link, scale and opacity as it was").toEqual(before);
  expect([addon.eval("return ns.Unlocked()"), addon.eval("return Vanguard_UnlockBar:IsShown()"), chatHas(addon, /Every frame is back where it was when you unlocked\./)], "locked, the bar gone, and chat says so").toEqual([false, false, true]);
  addon.slash("unlock");
  addon.eval("ns.Nudge('a', 0, 7)");
  addon.eval("Vanguard_UnlockBar.save:GetScript('OnClick')(Vanguard_UnlockBar.save)");
  expect([addon.eval("return ns.Settings('positions').a.y"), addon.eval("return ns.Unlocked()")], "Save and lock keeps the change and locks").toEqual([-293, false]);
  addon.eval("__edit = CreateFrame('Frame', nil, UIParent) ns.EditModeMovers(__edit, true)");
  expect([addon.eval("return ns.Unlocked()"), addon.eval("return Vanguard_UnlockBar:IsShown()")], "the game's Edit Mode unlocks without the bar (it has its own buttons)").toEqual([true, false]);
  addon.eval("ns.Nudge('a', 0, 1) ns.EditModeMovers(__edit, false)");
  expect([addon.eval("return ns.Settings('positions').a.y"), addon.eval("return ns.Unlocked()")], "closing it locks and keeps the change").toEqual([-292, false]);
});

it("Exit without saving tells what follows a frame that it moved back: the raid grid grows from its anchor again", () => {
  const addon = loggedIn();
  // The raid header's anchor point, and the raid mover's (BOTTOM until one is saved).
  const points = () => addon.eval('local RF = ns.GetModule("RaidFrames") return { header = (RF.header:GetPoint(1)), mover = (ns.MoverPoint("raid")) or "BOTTOM" }');
  const before = points();
  addon.slash("unlock");
  addon.eval('ns.SetMoverPoint("raid", "BOTTOMRIGHT", "BOTTOMRIGHT", -40, 200)');
  expect(points().header, "a drag to the corner grows the grid from its right").toBe("BOTTOMRIGHT");
  addon.eval("ns.ExitWithoutSaving()");
  expect([before, points()], "back as it was, the grid grows from the anchor it had").toEqual([{ header: "BOTTOM", mover: "BOTTOM" }, { header: "BOTTOM", mover: "BOTTOM" }]);
});
it("a grid size from a hand-edited profile string is kept to 8-256 px, so unlocking can't freeze the game", () => {
  const addon = loggedIn("UIParent:SetSize(1920, 1080)", { savedVariables: "VanguardDB.profiles = { Default = { movers = { gridSize = 1 } } }" });
  addon.slash("unlock");
  expect(gridLines(addon), "1 px draws as 8 px (241 + 135 lines), not 3002 lines").toBe(376);
  addon.slash("lock");
  addon.eval("ns.MoverOptions().gridSize = 0");
  addon.slash("unlock");
  expect(gridLines(addon), "0 px (a loop that never ends) draws as 8 px too").toBe(376);
  addon.eval("ns.ShowGrid(1000)");
  expect(gridLines(addon), "and above 256 px as 256 (7 + 5 lines)").toBe(12);
});

it("accent presets (#231): a profile that picked ember keeps its colour", () => {
  const addon = loggedIn("", { savedVariables: "VanguardDB = { profiles = { Default = { theme = { accent = { 0xe0 / 255, 0x66 / 255, 0x4b / 255 } } } } }" });
  expect(addon.eval('return ns.Theme.Hex("accent")').slice(2), "the old ember stays, as its own hex").toBe("e0664b");
});

it("unlock handles: a frame above HIGH (the quest dialog, on DIALOG) keeps its handle on its own strata, so the frame never covers it", () => {
  const addon = loggedIn(`
    __d = CreateFrame("Frame", nil, UIParent); __d:SetSize(100, 20); __d:SetFrameStrata("DIALOG")
    __e = CreateFrame("Frame", nil, UIParent); __e:SetSize(100, 20); __e:SetFrameStrata("LOW")
    ns.Mover(__d, "d", "D", { "CENTER", "CENTER", 0, 0 })
    ns.Mover(__e, "e", "E", { "CENTER", "CENTER", 0, -100 })
  `);
  addon.slash("unlock");
  // The strata of the handle for mover `key` (TEST-ONLY read).
  const handleStrata = (key) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == "${key}" then return w.__strata end end`);
  expect([handleStrata("d"), handleStrata("e")], "a DIALOG frame's handle rides on DIALOG with it; a LOW frame's handle on HIGH, under Edit Mode's window").toEqual(["DIALOG", "HIGH"]);
  addon.eval("ns.Lock()");
});
it("unlock handles: in the game's Edit Mode every handle is on HIGH, so Edit Mode's window (DIALOG) stays over the quest dialog's", () => {
  const addon = loggedIn(`
    __d = CreateFrame("Frame", nil, UIParent); __d:SetSize(100, 20); __d:SetFrameStrata("DIALOG")
    ns.Mover(__d, "d", "D", { "CENTER", "CENTER", 0, 0 })
  `);
  // The strata of the handle for mover `key` (TEST-ONLY read).
  const handleStrata = (key) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == "${key}" then return w.__strata end end`);
  addon.eval("__edit = CreateFrame('Frame', nil, UIParent) ns.EditModeMovers(__edit, true)");
  expect(handleStrata("d"), "in Edit Mode the DIALOG frame's handle drops to HIGH").toBe("HIGH");
  addon.eval("ns.EditModeMovers(__edit, false)");
  addon.slash("unlock");
  expect(handleStrata("d"), "/vg unlock puts it back on its own strata").toBe("DIALOG");
  addon.eval("ns.Lock()");
});

it("A-10 unlock from the options window: Save and lock and Exit without saving each open it again on the same page; a fight or /vg lock doesn't", () => {
  const addon = loggedIn(BOXES + CLICK_LUA);
  // Unlocks from the General page's Move frames button.
  const fromOptions = () => { addon.slash(""); addon.eval('ns.Options.Show("general") __click("Move frames")'); };
  fromOptions();
  expect([addon.eval("return ns.Unlocked()"), addon.eval("return Vanguard_Options:IsShown()")], "unlocked, the options window out of the way").toEqual([true, false]);
  const bar = addon.frame("Vanguard_UnlockBar").rect;
  const save = addon.frame("Vanguard_UnlockBar.save").rect, exit = addon.frame("Vanguard_UnlockBar.exit").rect;
  const text = addon.eval("return Vanguard_UnlockBar.text:GetStringWidth()");
  expect([exit.left - (bar.left + 12 + text) >= 12 - 0.5, bar.right - save.right], "the bar is wide enough for its note and buttons").toEqual([true, 8]);
  addon.eval("Vanguard_UnlockBar.save:GetScript('OnClick')(Vanguard_UnlockBar.save)");
  expect([addon.eval("return Vanguard_Options:IsShown()"), addon.eval("return ns.Options.current")], "Save and lock: back on General").toEqual([true, "general"]);
  fromOptions();
  addon.eval("Vanguard_UnlockBar.exit:GetScript('OnClick')(Vanguard_UnlockBar.exit)");
  expect(addon.eval("return Vanguard_Options:IsShown()"), "Exit without saving: back too").toBe(true);
  fromOptions();
  addon.slash("lock");
  addon.eval("ns.Unlock()");
  addon.eval("Vanguard_UnlockBar.save:GetScript('OnClick')(Vanguard_UnlockBar.save)");
  expect(addon.eval("return Vanguard_Options:IsShown()"), "locked another way first: the next unlock doesn't remember the page").toBe(false);
  fromOptions();
  addon.fire("PLAYER_REGEN_DISABLED");
  setCombat(addon, true);
  expect([addon.eval("return ns.Unlocked()"), addon.eval("return Vanguard_Options:IsShown()")], "a fight locks, and the options stay closed").toEqual([false, false]);
  addon.slash("");
  addon.eval('ns.Options.Show("general") __click("Move frames")');
  expect([addon.eval("return ns.Unlocked()"), addon.eval("return Vanguard_Options:IsShown()"), chatHas(addon, /In combat\. Try again once combat ends\./)], "in a fight Move frames doesn't unlock, the window stays, and chat says why").toEqual([false, true, true]);
  setCombat(addon, false);
  addon.eval('__click("Move frames") Vanguard_Options:Show() ns.Options.Show("situations")');
  addon.eval("Vanguard_UnlockBar.save:GetScript('OnClick')(Vanguard_UnlockBar.save)");
  expect(addon.eval("return ns.Options.current"), "the window opened again meanwhile: it stays on its page").toBe("situations");
});
