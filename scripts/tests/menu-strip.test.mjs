// menu-strip: the bags and menu bar, the bag's Sort button and the combined-bags CVar, in the
// TEST-ONLY headless client.

import { expect, it } from "vitest";
import { MICRO_ENV, STRIPS_ENV, TIDY_ENV, UI_ENV, isTok, later, loggedIn, pinned, setCombat, strips } from "./helpers.mjs";
import { BAGS, BAR_H, MENU, barSize, barW, r3 } from "./more-env.mjs";

it("a Sort button on the combined bag, where the client can sort", () => {
  const addon = loggedIn(UI_ENV + "C_Container = { SortBags = function() __sorted = true end }");
  expect(addon.eval('local b = ns.GetModule("Bags").sort b:GetScript("OnClick")(b) return __sorted'), "Sort sorts your bags").toBe(true);
  expect(loggedIn(UI_ENV + "C_Container = nil").eval('return ns.GetModule("Bags").sort == nil'), "no sort call, no button").toBe(true);
});

// TEST-ONLY game search row of the combined bag: the search box and the game's own sort button.
const SORT_ROW_ENV = `
  C_Container = { SortBags = function() end }
  BagItemSearchBox = CreateFrame("EditBox", "BagItemSearchBox", ContainerFrameCombinedBags)
  BagItemAutoSortButton = CreateFrame("Button", "BagItemAutoSortButton", ContainerFrameCombinedBags)
`;

it("the bag's Sort button sits beside the search box and the game's own sort button stays hidden", () => {
  const addon = loggedIn(UI_ENV + SORT_ROW_ENV);
  const sort = addon.eval('local p = ns.GetModule("Bags").sort.__points.LEFT return { p.rel == BagItemSearchBox, p.relPoint, p.x }');
  expect(sort, "right of the search box, 6 px off it").toEqual([true, "RIGHT", 6]);
  expect(addon.eval("return BagItemAutoSortButton:IsShown()"), "the game's own button is hidden at login").toBe(false);
  addon.eval("BagItemAutoSortButton:Show()");
  expect(addon.eval("return BagItemAutoSortButton:IsShown()"), "and the game showing it again (each search row update) hides it again").toBe(false);
  const bare = loggedIn(UI_ENV + "C_Container = { SortBags = function() end }");
  expect(bare.eval('local p = ns.GetModule("Bags").sort.__points.TOPRIGHT return { p.x, p.y }'), "without a search box it takes the game's sort spot, the bag's 12 px padding inside the right edge").toEqual([-12, -34]);
});

it("a context overlay is left alone so the game's search dimming shows", () => {
  const addon = loggedIn(UI_ENV);
  addon.eval("__item.ItemContextOverlay = __item:CreateTexture() __item.vgSkinned = nil ContainerFrameCombinedBags:Hide() ContainerFrameCombinedBags:Show()");
  expect(addon.eval("return __item.ItemContextOverlay:GetAlpha()"), "its alpha is the game's, not faded to 0").toBe(1);
});

// TEST-ONLY client CVars with the player's own bag choice ("0": separate bags) in them.
const CVAR_ENV = `
  __cvars = { combinedBags = "0" }
  C_CVar.GetCVar = function(k) return __cvars[k] end
`;

it("bags: the combined CVar is set once per change of the setting, and given back when the module is switched off", () => {
  const addon = loggedIn(UI_ENV + CVAR_ENV);
  expect(addon.eval("return { __cvars.combinedBags, ns.Settings('Bags').applied, ns.Settings('Bags').prior }"), "first login: turned on, the player's own value kept").toEqual(["1", true, "0"]);
  const later = loggedIn(UI_ENV + CVAR_ENV, { savedVariables: "VanguardDB.profiles.Default = { Bags = { applied = true, prior = '0' } }" });
  expect(later.eval("return __cvars.combinedBags"), "a later login leaves the player's choice (separate bags) alone").toBe("0");
  const off = loggedIn(UI_ENV + "__cvars = { combinedBags = '1' } C_CVar.GetCVar = function(k) return __cvars[k] end", { savedVariables: "VanguardDB.profiles.Default = { Bags = { combined = false, applied = true, prior = '0' } }" });
  expect(off.eval("return { __cvars.combinedBags, ns.Settings('Bags').applied }"), "turning the setting off sets it once, to separate bags").toEqual(["0", false]);
  addon.eval("ns.SetModuleEnabled('Bags', false)");
  expect(addon.eval("return { __cvars.combinedBags, ns.Settings('Bags').applied == nil, ns.Settings('Bags').prior == nil }"), "switching the module off puts the player's value back").toEqual(["0", true, true]);
  addon.eval("__cvars.combinedBags = '1' ns.SetModuleEnabled('Bags', false)");
  expect(addon.eval("return __cvars.combinedBags"), "and a second time touches nothing").toBe("1");
  const blind = loggedIn(UI_ENV);
  blind.eval("ns.SetModuleEnabled('Bags', false)");
  expect(blind.eval("return { __cvars.combinedBags, ns.Settings('Bags').applied == nil }"), "a client that can't read the CVar has nothing to give back").toEqual(["1", true]);
});

// The bar's width around a micro menu w units wide: the game lays its buttons 27 units apart, 5 overlapping.
const menuBarW = (w) => barW(Math.round((w - 5) / 27));

it("menu strip: the game's tracker is pinned into the spot only while Vanguard's own tracker is off", () => {
  // Where the game's tracker is anchored: whether on the spot, and its height.
  const pinned = (addon) => addon.eval("local p = ObjectiveTrackerFrame.__points.TOPRIGHT return { p ~= nil and p.rel == Vanguard_QuestTracker, ObjectiveTrackerFrame:GetHeight() }");
  const saved = (profile) => ({ savedVariables: `VanguardDB.profiles.Default = ${profile}` });
  expect(pinned(loggedIn(UI_ENV + TIDY_ENV, saved("{ QuestTracker = { own = false } }"))), "Vanguard's tracker off: the game's sits under the info strip, no taller than its spot").toEqual([true, 234]);
  expect(pinned(loggedIn(UI_ENV + TIDY_ENV, saved("{ QuestTracker = { own = true } }"))), "Vanguard's tracker on: one owner only, the game's is not pinned").toEqual([false, 0]);
  expect(pinned(loggedIn(UI_ENV + TIDY_ENV, saved("{ modules = { QuestTracker = false } }"))), "the tracker module switched off altogether: the game's is pinned again").toEqual([true, 234]);
});

it("menu strip: set to mouseover, shown by the mouse entering and leaving it and its buttons, with nothing polling", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV, { savedVariables: 'VanguardDB.profiles.Default = { MenuStrip = { menu = "mouseover" } }' });
  // The menu strip's alpha.
  const alpha = () => addon.eval("return Vanguard_MenuStrip:GetAlpha()");
  expect(addon.eval("local s = Vanguard_MenuStrip return { s:GetScript('OnUpdate') == nil, s.__mouseMotion, s.__mouseClick }"), "no OnUpdate; the strip feels the mouse but lets clicks through").toEqual([true, true, false]);
  addon.hover("CharacterMicroButton");
  expect(alpha(), "straight onto a button: the strip shows").toBe(1);
  addon.hover("Vanguard_MenuStrip");
  expect(alpha(), "from the button onto the strip between buttons: still shown").toBe(1);
  addon.hover("EJMicroButton");
  addon.hover(null);
  expect(alpha(), "off the strip: hidden").toBe(0);
  addon.hover("MainMenuMicroButton");
  addon.eval("Vanguard_MenuStrip.__mouseOver = true");
  addon.hover(null);
  expect(alpha(), "leaving a button while still over the strip keeps it shown").toBe(1);
});

it("bag and menu bar: the bars' own frame art is hidden, the key ring gets a full slot and no fill", () => {
  const addon = strips();
  expect(addon.eval("return { MicroMenu.BorderArt.__alpha, MicroMenu.BackgroundArt.__alpha, BagsBar.BorderArt.__alpha }"), "the brass box is faded").toEqual([0, 0, 0]);
  const ring = addon.eval("local b = KeyRingButton return { b.icon.__alpha, b.icon.__points.TOPLEFT.rel == b.vgSlot, b.icon.__texCoord[1] > 0, b.vgSlot.__width, b.vgFill == nil, b:GetWidth() }");
  expect([ring[0], ring[1], ring[2], r3(ring[3] * BAGS), ring[4], ring[5]], "the key ring: widened from 33 to a bag's 45 units, its icon cropped in a full 24-pixel slot, no fill").toEqual([1, true, true, 24, true, 45]);
  const off = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV, { savedVariables: "VanguardDB.profiles.Default = { MenuStrip = { glyphs = true } }" });
  expect(off.eval("return { MicroMenu.BorderArt.__alpha, KeyRingButton.vgSlot ~= nil }"), "with or without the line icons, the frame art goes and the key ring is framed").toEqual([0, true]);
});

it("bag and menu bar: every row's anchor has a size, so the bars get a rect to draw in", () => {
  const addon = strips("BagsBar:SetSize(315, 45) MicroMenuContainer:SetSize(226.5, 30)");
  // The client gives a zero-sized frame no rect and draws nothing anchored to one: the bar showed its panel and divider with nothing in it (seen in game).
  const rects = (names) => addon.eval(`local out = {} for _, n in ipairs({ ${names.map((n) => JSON.stringify(n)).join(", ")} }) do out[#out + 1] = _G[n]:IsRectValid() end return out`);
  expect(addon.eval("local MS = ns.GetModule('MenuStrip') local out = {} for i, row in ipairs(MS.ROWS) do out[i] = { row.anchor:GetWidth(), row.anchor:GetHeight(), row.anchor:IsRectValid() } end return out"),
    "each row's anchor is its row's box: as wide as the row, a slot tall, with a rect").toEqual([[7 * 28 - 4, 24, true], [8 * 28 - 4, 24, true]]);
  expect(rects(["Vanguard_MenuStrip", "BagsBar", "MicroMenuContainer"]), "the bar and both of the game's bars have rects").toEqual([true, true, true]);
  addon.eval("local MS = ns.GetModule('MenuStrip') Probe = CreateFrame('Frame', 'Probe', UIParent) Probe:SetSize(10, 10) Probe:SetPoint('RIGHT', MS.ROWS[1].anchor, 'TOPRIGHT') Empty = CreateFrame('Frame', 'Empty', UIParent) Empty:SetPoint('CENTER')");
  expect(rects(["Probe"]), "the harness lays out what hangs on a row's anchor").toEqual([true]);
  addon.eval("Probe:SetPoint('RIGHT', Empty, 'TOPRIGHT')");
  expect(rects(["Empty", "Probe"]), "and, like the client, gives nothing hung on a zero-sized frame a rect").toEqual([false, false]);
  addon.eval("BagsBar:SetSize(0, 45) MicroMenuContainer:SetSize(0, 30) ns.PausePins(false)");
  expect(addon.eval("local MS = ns.GetModule('MenuStrip') return { MS.ROWS[1].anchor:GetWidth(), MS.ROWS[2].anchor:GetWidth(), Vanguard_MenuStrip:GetWidth() }"),
    "rows with no buttons keep a unit-wide anchor (the bar hugs its margins)").toEqual([1, 1, 24]);
});

it("bag and menu bar: the bags and menu the game hides on an input switch come back, after combat", () => {
  const addon = strips();
  // Whether the bag bar and the micro menu are shown themselves.
  const shown = () => addon.eval("return { BagsBar:IsShown(), MicroMenu:IsShown() }");
  addon.eval("MicroMenu:Hide() BagsBar:Hide()");
  expect(shown(), "the game's gamepad switch hides both: shown again at once").toEqual([true, true]);
  addon.eval("Vanguard_MenuStrip:Hide()");
  expect(shown(), "hidden only with the bar, they keep their own shown state").toEqual([true, true]);
  addon.eval("Vanguard_MenuStrip:Show()");
  setCombat(addon, true);
  addon.eval("MicroMenu:Hide()");
  expect(shown(), "in combat it waits").toEqual([true, false]);
  setCombat(addon, false);
  expect(shown(), "and shows it when combat ends").toEqual([true, true]);
});

// Where a seated bar's RIGHT point sits on its row's anchor (row k of the bar): { x, y } in screen units.
const seatOf = (addon, bar, k, scale) => addon.eval(`local p = ${bar}.__points.RIGHT return { p.rel == ns.GetModule("MenuStrip").ROWS[${k}].anchor, p.relPoint, p.x, p.y }`).map((v, i) => (i > 1 ? r3(v * scale) : v));

it("bag and menu bar: the rows re-fit when the game lays the bars out or resizes them", () => {
  const addon = strips();
  expect(barSize(addon), "before the game lays them out, the bar is its margins only, a bags row, a gap and a menu row tall").toEqual([24, BAR_H]);
  addon.eval("MicroMenuContainer:Layout()");
  expect(barSize(addon), "the bar grows around the laid-out micro menu").toEqual([menuBarW(378), BAR_H]);
  // Each row's last slot sits at its anchor (its button reaches past it by half the difference), its middle on the row's.
  expect(seatOf(addon, "MicroMenuContainer", 2, MENU), "the menu: the lower row, its middle 55 pixels below the top (the 12-pixel margin, the bags row, the gap and half a 30-pixel slot)").toEqual([true, "TOPRIGHT", r3((32 * MENU - 24) / 2), -55]);
  expect(seatOf(addon, "BagsBar", 1, BAGS), "the bags: the upper row, its middle 24 pixels below the top").toEqual([true, "TOPRIGHT", r3((45 * BAGS - 24) / 2), -24]);
  addon.eval("BagsBar:SetScale(1) BagsBar:Layout()");
  expect([barSize(addon)[0], r3(addon.eval("return BagsBar:GetScale()"))], "a narrower bag row leaves the bar as wide as the menu, and the game's reset of the bag bar's scale is undone").toEqual([menuBarW(378), r3(BAGS)]);
  addon.eval("MicroMenuContainer:SetSize(500, 40) MicroMenuContainer.__scripts.OnSizeChanged(MicroMenuContainer, 500, 40)");
  expect(barSize(addon)[0], "a size change alone re-fits the bar").toBe(menuBarW(500));
  expect(addon.eval("local d = ns.GetModule('MenuStrip').divider local p = d.__points.LEFT return { p.relPoint, p.x, p.y, d.__points.RIGHT.x, d:GetHeight() }"), "a one-pixel accent line between the rows, across the bar inside its margins").toEqual(["TOPLEFT", 12, -38, -12, addon.eval("return ns.Theme.Pixel(Vanguard_MenuStrip)")]);
  expect(isTok(addon, addon.eval("return ns.GetModule('MenuStrip').divider.__vertexColor"), "accent"), "in the accent").toBe(true);
  addon.eval("ns.Theme.SetAccent(0.1, 0.9, 0.2)");
  expect(addon.eval("return ns.GetModule('MenuStrip').divider.__vertexColor"), "which it follows").toEqual([0.1, 0.9, 0.2, 1]);
});

// TEST-ONLY bars laid out as the game lays them out: nine menu buttons 27 units apart (32 wide,
// overlapping by 5) from the micro menu's left, and the bags right to left from the bag bar's
// right edge, 2 units apart, the key ring last at its 33 units.
const GAME_BARS_ENV = `
  MicroMenuContainer:SetSize(9 * 27 + 5, 40)
  for i, name in ipairs({ "Character", "PlayerSpells", "Talent", "Achievement", "QuestLog", "Guild", "LFD", "Collections", "MainMenu" }) do
    local b = CreateFrame("Button", name .. "MicroButton", MicroMenuContainer) b:SetSize(32, 40) b:SetPoint("LEFT", MicroMenuContainer, "LEFT", (i - 1) * 27, 0)
  end
  BagsBar:SetSize(5 * 47 + 33, 45)
  local prev
  for i, name in ipairs({ "MainMenuBarBackpackButton", "CharacterBag0Slot", "CharacterBag1Slot", "CharacterBag2Slot", "CharacterBag3Slot", "KeyRingButton" }) do
    local b = CreateFrame("Button", name, BagsBar) b:SetSize(i == 6 and 33 or 45, 45) b.icon = b:CreateTexture()
    if prev then b:SetPoint("RIGHT", prev, "LEFT", -2, 0) else b:SetPoint("RIGHT", BagsBar, "RIGHT") end
    prev = b
  end
`;

// Every slot's screen rect (left, bottom, right, top, to three places) in a row (1 bags, 2 menu), left to right.
const slotRects = (addon, k) => addon.eval(`local MS, out = ns.GetModule("MenuStrip"), {}
  for i, b in ipairs(MS.slotted) do if b.vgRow == MS.ROWS[${k}] then out[#out + 1] = i end end return out`)
  .map((i) => addon.frame(`ns.GetModule("MenuStrip").slotted[${i}].vgSlot`).rect)
  .map((r) => [r.left, r.bottom, r.right, r.top].map(r3)).sort((a, b) => a[0] - b[0]);

it("bag and menu bar: the bar hugs its slots, one size, one baseline per row, one pair of edges", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + GAME_BARS_ENV);
  const bar = addon.frame("Vanguard_MenuStrip").rect;
  const bags = slotRects(addon, 1), menu = slotRects(addon, 2);
  expect([bags.length, menu.length], "six bag slots (the key ring with them) over nine menu slots").toEqual([6, 9]);
  expect([bags.every((r) => r3(r[2] - r[0]) === 24 && r3(r[3] - r[1]) === 24), menu.every((r) => r3(r[2] - r[0]) === 24 && r3(r[3] - r[1]) === 30)],
    "every bag slot is 24 pixels square, the key ring's too; every menu slot is 24 wide and 30 tall").toEqual([true, true]);
  // The left edges' steps along a row.
  const steps = (row) => row.slice(1).map((r, i) => r3(r[0] - row[i][0]));
  expect([steps(bags), steps(menu)], "each row steps one slot and a 4-pixel gap at a time").toEqual([Array(5).fill(28), Array(8).fill(28)]);
  expect([new Set(bags.map((r) => r[1])).size, new Set(menu.map((r) => r[1])).size], "each row on one baseline").toEqual([1, 1]);
  const pad = [r3(menu[0][0] - bar.left), r3(bar.right - menu[8][2]), r3(menu[0][1] - bar.bottom), r3(bar.top - bags[0][3])];
  expect(pad, "the same 12-pixel padding on all four sides: the menu row spans the bar, the bags sit on top").toEqual([12, 12, 12, 12]);
  expect([r3(bags[0][0] - menu[0][0]), r3(menu[8][2] - bags[5][2])], "the shorter bag row is centered over the menu row (3 slots' room each side)").toEqual([42, 42]);
  expect(r3(bags[0][1] - menu[0][3]), "a 4-pixel gap between the rows").toBe(4);
  const line = addon.frame("ns.GetModule('MenuStrip').divider").rect;
  expect([r3(line.left), r3(line.right)], "the divider runs under the slots only, edge to edge with the longer row").toEqual([menu[0][0], menu[8][2]]);
  expect(line.bottom >= menu[0][3] && line.top <= bags[0][1], "between the rows").toBe(true);
  expect([r3(bar.right), r3(bar.bottom), r3(bar.right - bar.left)], "the bar keeps its bottom-right corner, 16 and 20 in from the screen's").toEqual([1904, 20, barW(9)]);
  addon.eval("MicroMenuContainer:SetSize(14 * 27 + 5, 40) MicroMenuContainer.__scripts.OnSizeChanged(MicroMenuContainer)");
  const wide = addon.frame("Vanguard_MenuStrip").rect;
  expect([r3(wide.right), r3(wide.right - wide.left)], "fourteen menu buttons: the bar grows to the left only").toEqual([1904, barW(14)]);
});

it("bag and menu bar: one mover keeps the menu strip's saved spot; the bag strip's spot and the line icons are dropped once", () => {
  const spots = 'positions = { menustrip = { point = "BOTTOMLEFT", relPoint = "BOTTOMLEFT", x = 400, y = 20 }, bagstrip = { point = "BOTTOMLEFT", relPoint = "BOTTOMLEFT", x = 10, y = 10 } }';
  const old = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV, { firstRun: true, savedVariables: `VanguardDB = { version = 1, setupDone = true, profiles = { Default = { MenuStrip = { glyphs = true }, ${spots} } } }` });
  const saved = old.eval("local p = VanguardDB.profiles.Default return { VanguardDB.version, p.MenuStrip.glyphs, p.positions.bagstrip == nil, p.positions.menustrip.x }");
  expect(saved, "an older file: the game's icons again and the bag strip's spot gone, the menu strip's kept").toEqual([2, false, true, 400]);
  expect(old.eval("local p = Vanguard_MenuStrip.__points.BOTTOMLEFT return { p.x, p.y, CharacterMicroButton.vgGlyph == nil }"), "the bar stands where the menu strip was, with the game's icons").toEqual([400, 20, true]);
  expect(old.eval("local keys = {} for _, m in ipairs(ns.MoverList()) do keys[m.key] = m.label end return { keys.menustrip, keys.bagstrip == nil }"), "one mover for the bar").toEqual(["Bags and game menu", true]);
  const now = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV, { savedVariables: "VanguardDB.profiles.Default = { MenuStrip = { glyphs = true } }" });
  expect(now.eval("return CharacterMicroButton.vgGlyph ~= nil"), "line icons switched on after the upgrade stay on").toBe(true);
});

it("bag and menu bar: no re-fit while pins are paused or in combat, and one queued entry per bar", () => {
  const addon = strips();
  addon.eval("ns.PausePins(true) __menuW = 600 MicroMenuContainer:Layout()");
  expect(barSize(addon)[0], "Edit Mode open: the bar waits").toBe(barW(0));
  addon.eval("ns.PausePins(false)");
  expect(barSize(addon)[0], "and fits when it closes").toBe(menuBarW(600));
  setCombat(addon, true);
  addon.eval("__menuW = 400 MicroMenuContainer:Layout()");
  const queued = addon.eval("return ns.QueuedCount()");
  addon.eval("for _ = 1, 50 do MicroMenuContainer:Layout() end");
  expect([barSize(addon)[0], addon.eval("return ns.QueuedCount()")], "in combat nothing changes, and 50 more Layout calls queue nothing more").toEqual([menuBarW(600), queued]);
  setCombat(addon, false);
  expect(barSize(addon)[0], "after combat the bar fits").toBe(menuBarW(400));
  const plain = loggedIn(UI_ENV + 'CreateFrame("Frame", "MicroMenuContainer", UIParent) function MicroMenuContainer:Layout() end');
  expect(plain.eval("return { MicroMenuContainer:GetParent() == Vanguard_MenuStrip, MicroMenuContainer.__scripts.OnSizeChanged ~= nil }"), "a client without hooksecurefunc still pins and watches the size").toEqual([true, true]);
});

it("bag and menu bar: slots are 24 screen pixels wide, take the clicks, and light up under the mouse only", () => {
  const addon = strips();
  // A button's slot: its side and the button's hit insets in screen pixels, its frame level against the button's, and its accent edge's color.
  const slot = (name, scale) => addon.eval(`local b = ${name} local s = b.vgSlot local e
    for _, w in ipairs(__wfgStub.frames) do if w.__parent == s and w.__layer == "BORDER" and w.__sublevel == 0 and w.__vertexColor and w.__vertexColor[1] > 0 then e = w.__vertexColor end end
    return { s.__width, b.__hitInsets and b.__hitInsets[3] or 0, s:GetFrameLevel() < b:GetFrameLevel(), e }`).map((v, i) => (i < 2 ? r3(v * scale) : v));
  const char = slot("CharacterMicroButton", MENU);
  expect(char.slice(0, 3), "a menu slot: 24 pixels wide and 30 tall, the 40-unit button taking clicks on the slot only, drawn under the button").toEqual([24, r3((40 * MENU - 30) / 2), true]);
  expect(char[3][3], "its accent edge is hidden while nothing touches it (a quiet slot)").toBe(0);
  expect(slot("MainMenuBarBackpackButton", BAGS).slice(0, 3), "a bag slot: the same 24 pixels").toEqual([24, r3((45 * BAGS - 24) / 2), true]);
  const accent = addon.eval("return { ns.Theme.Accent() }");
  addon.eval("CharacterMicroButton.__scripts.OnEnter(CharacterMicroButton)");
  const lit = slot("CharacterMicroButton", MENU)[3];
  expect([0, 1, 2].every((i) => lit[i] > accent[i]) && lit[3] === 1, "the mouse over it: the edge shows, brighter than the accent").toBe(true);
  addon.eval("CharacterMicroButton.__scripts.OnMouseDown(CharacterMicroButton)");
  const held = slot("CharacterMicroButton", MENU)[3];
  expect([0, 1, 2].every((i) => held[i] < accent[i]), "held down: it darkens").toBe(true);
  addon.eval("CharacterMicroButton.__mouseOver = true CharacterMicroButton.__scripts.OnMouseUp(CharacterMicroButton)");
  expect(slot("CharacterMicroButton", MENU)[3], "let go over it: bright again").toEqual(lit);
  addon.eval("CharacterMicroButton.__mouseOver = false CharacterMicroButton.__scripts.OnMouseUp(CharacterMicroButton)");
  expect(slot("CharacterMicroButton", MENU)[3][3], "let go elsewhere: hidden again").toBe(0);
  addon.eval("CharacterMicroButton.__scripts.OnLeave(CharacterMicroButton)");
  expect(slot("CharacterMicroButton", MENU)[3][3], "and when the mouse leaves").toBe(0);
  addon.eval("ns.Theme.SetAccent(0.2, 0.4, 0.6)");
  expect(slot("CharacterMicroButton", MENU)[3], "the edge follows a new accent (still hidden)").toEqual([0.2, 0.4, 0.6, 0]);
  addon.eval("CharacterMicroButton.__scripts.OnEnter(CharacterMicroButton)");
  expect(slot("CharacterMicroButton", MENU)[3][3], "and shows in it under the mouse").toBe(1);
  addon.eval("CharacterMicroButton.__scripts.OnLeave(CharacterMicroButton)");
  const bevel = addon.eval(`local s, out = CharacterMicroButton.vgSlot, {}
    for _, w in ipairs(__wfgStub.frames) do if w.__parent == s and w.__layer == "BORDER" and w.__sublevel == 1 then out[w.__points.TOPLEFT and "top" or "bottom"] = w.__vertexColor end end
    return out`);
  expect([isTok(addon, bevel.top, "sheen"), isTok(addon, bevel.bottom, "shade")], "a bevel: a light line along the top, a dark one along the bottom").toEqual([true, true]);
  expect(addon.eval("return { CharacterMicroButton.Background.__alpha, CharacterMicroButton.normal.__alpha == nil, CharacterMicroButton.Flash.__alpha == nil }"), "the game's background plate goes; its icon and alert flash stay").toEqual([0, true, true]);
  addon.eval("CharacterMicroButton:Disable()");
  expect(addon.eval("return CharacterMicroButton.normal.__desaturated"), "a disabled button's icon is grey").toBe(true);
  addon.eval("CharacterMicroButton:Enable()");
  expect(addon.eval("return CharacterMicroButton.normal.__desaturated"), "and in color again when enabled").toBe(false);
  addon.eval("CharacterMicroButton:SetScale(0.5) MicroMenuContainer:Layout()");
  expect(r3(addon.eval("return CharacterMicroButton.vgSlot.__width") * MENU * 0.5), "a smaller button: its slot shrinks to its place in the row, re-sized by the re-fit").toBe(r3(27 * MENU * 0.5 - 4));
  expect(r3(addon.eval("return EJMicroButton.vgSlot.__width") * MENU), "a button with no size yet gets a full slot").toBe(24);
});

it("bag and menu bar: line icons are 20 screen pixels on their slot, accent under the mouse", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV, { savedVariables: "VanguardDB.profiles.Default = { MenuStrip = { glyphs = true } }" });
  // The line icon's screen size and whether it is square and centered on the slot.
  const look = () => addon.eval(`local b = CharacterMicroButton local rel = b:GetEffectiveScale() / UIParent:GetEffectiveScale()
    return { b.vgGlyph.__width * rel, b.vgGlyph.__height == b.vgGlyph.__width, b.vgGlyph.__points.CENTER.rel == b.vgSlot }`);
  expect([r3(look()[0]), look()[1], look()[2]], "20 screen pixels, square, centered on the slot").toEqual([20, true, true]);
  addon.eval("CharacterMicroButton:SetScale(0.5) MicroMenuContainer:Layout()");
  expect(r3(look()[0]), "a smaller menu: the icon stays inside its smaller slot").toBe(r3(27 * MENU * 0.5 - 4 - 4));
  // The line icon's current color.
  const color = () => addon.eval("return CharacterMicroButton.vgGlyph.__vertexColor");
  expect(isTok(addon, color(), "text"), "text at rest").toBe(true);
  addon.eval("CharacterMicroButton.__scripts.OnEnter(CharacterMicroButton)");
  expect(isTok(addon, color(), "accent"), "accent under the mouse").toBe(true);
  addon.eval("CharacterMicroButton:Disable()");
  expect(isTok(addon, color(), "muted"), "muted while disabled, even under the mouse").toBe(true);
  addon.eval("CharacterMicroButton:Enable()");
  expect(isTok(addon, color(), "accent"), "enabled again under the mouse: accent").toBe(true);
  addon.eval("CharacterMicroButton.__scripts.OnLeave(CharacterMicroButton)");
  expect(isTok(addon, color(), "text"), "text once the mouse leaves").toBe(true);
  expect(r3(addon.eval("return MainMenuBarBackpackButton:GetWidth() * BagsBar:GetEffectiveScale() / UIParent:GetEffectiveScale()")), "bag buttons sit one slot and a gap apart (28 screen pixels with their padding)").toBe(r3(45 * BAGS));
});

// TEST-ONLY bags: the backpack (16 slots, 4 free), bag 1 empty (no bag in it), bag 2 full,
// bag 3 a soul bag (20 slots, 5 free, family 256); their buttons, with the game's bag IDs.
const BAGS_ENV = `
  __space = { [0] = { 16, 4, 0 }, [1] = { 0, 0 }, [2] = { 10, 0, 0 }, [3] = { 20, 5, 256 }, [4] = { 0, 0 } }
  C_Container.GetContainerNumSlots = function(bag) return (__space[bag] or { 0 })[1] end
  C_Container.GetContainerNumFreeSlots = function(bag) local s = __space[bag] or { 0, 0 } return s[2], s[3] end
  for i = 0, 2 do
    local b = CreateFrame("Button", "CharacterBag" .. i .. "Slot", BagsBar) b:SetSize(45, 45)
    b.icon = b:CreateTexture() b.bag = i + 1
    function b:GetBagID() return self.bag end
  end
`;

it("bag and menu bar: each bag's slot shows how full it is, the backpack how many slots are free", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV + BAGS_ENV);
  // A bag button's fill (shown, width in screen pixels, color), its icon's alpha and greyness, and the backpack's count and its size on screen.
  const bag = (name) => addon.eval(`local b = ${name} local f = b.vgFill
    return { f:IsShown(), (f.__width or 0) * ${BAGS}, f.__vertexColor or false, b.vgIcon.__alpha, b.vgIcon.__desaturated == true }`).map((v, i) => (i === 1 ? r3(v) : v));
  const pack = bag("MainMenuBarBackpackButton");
  expect([pack[0], pack[1], isTok(addon, pack[2], "accent")], "the backpack, 12 of 16 slots used: a fill three quarters of the 18-pixel icon wide, in the accent").toEqual([true, 13.5, true]);
  const empty = bag("CharacterBag0Slot");
  expect([empty[0], empty[3], empty[4]], "no bag in the slot: no fill, the game's empty-slot art faint and grey").toEqual([false, 0.35, true]);
  const full = bag("CharacterBag1Slot");
  expect([full[0], full[1], isTok(addon, full[2], "bad"), full[3], full[4]], "a full bag: a full-width fill in red").toEqual([true, 18, true, 1, false]);
  expect(r3(bag("CharacterBag2Slot")[1]), "a soul bag fills by its own slots (15 of 20)").toBe(13.5);
  // The backpack's free count and its font size on screen.
  const count = () => addon.eval("local fs = ns.GetModule('MenuStrip').free local _, size = fs:GetFont() return { fs:GetText(), size * MainMenuBarBackpackButton:GetEffectiveScale() / UIParent:GetEffectiveScale() }");
  expect([count()[0], r3(count()[1])], "the backpack: 4 free (the soul bag's free slots hold only shards), at the theme's tiny size on screen").toEqual(["4", addon.eval('return ns.Theme.RoleSize("tiny")')]);
  addon.eval("__space[0][2] = 0 __space[1] = { 12, 12, 0 }");
  addon.fire("BAG_UPDATE_DELAYED");
  expect([bag("MainMenuBarBackpackButton")[1], bag("CharacterBag0Slot").slice(0, 1), bag("CharacterBag0Slot")[3], count()[0]], "the bags change: the backpack's fill is full, a new empty bag shows in color with no fill, 12 free").toEqual([18, [false], 1, "12"]);
  const bare = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV + "C_Container = nil");
  expect(bare.eval("return { ns.GetModule('MenuStrip').free:GetText(), MainMenuBarBackpackButton.vgFill:IsShown() }"), "a client that can't count bag slots shows no count and no fill").toEqual(["", false]);
});
