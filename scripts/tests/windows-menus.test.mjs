// windows-menus: the menus group of game windows (Modules/WindowsMenus.lua), in the
// TEST-ONLY headless client. Cases follow docs/handoff/RESKIN-PLAN.md section 0 ("Writing a task's test").

import { expect, it } from "vitest";
import { expectErrors, loggedIn } from "./helpers.mjs";

it("the menus group loads cleanly on a client without its windows", () => {
  const addon = loggedIn("");
  expect(addon.eval("return ns.GetModule('Windows').settings.menus"), "its switch is on by default").toBe(true);
  expect(addon.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') then return e.text end end return 'none'")).toBe("none");
});

// The menus group switched off in the saved profile.
const MENUS_OFF = { savedVariables: "VanguardDB.profiles = { Default = { Windows = { menus = false } } }" };

// TEST-ONLY 12.x menu: a frame shaped like Blizzard_Menu's MenuTemplateBase while it is open. Each
// __openMenu() attaches a fresh background texture to it (as MenuStyle1Mixin:Generate does, at alpha
// 0.925) and fires EventRegistry "MenuProxy.OnShow" (as MenuProxyMixin:OnShow does). It has Camelot's
// FrameGlow and one row, and refuses CreateTexture as the compositor does on an open menu (the stub's
// GetFrameStrata answers nil, so the menu has its own).
// __menuKeys() lists the keys on the menu table, to prove nothing is written to it.
const MENU_ENV = `
  __menu = CreateFrame("Frame", nil, UIParent)
  __menu:SetFrameStrata("FULLSCREEN_DIALOG") __menu:SetFrameLevel(510)
  __menu.GetFrameStrata = function(self) return self.__strata end
  __menu.FrameGlow = CreateFrame("Frame", nil, __menu)
  __menu.TestOnlyRow = CreateFrame("Button", nil, __menu)
  __menu.TestOnlyRow:SetFrameLevel(530)
  local create = __menu.CreateTexture
  __menu.CreateTexture = function() error("TEST-ONLY: the compositor refuses CreateTexture on an open menu") end
  function __openMenu(menu)
    menu = menu or __menu
    local bg = create(menu, nil, "ARTWORK") bg:SetTexture("TEST-ONLY-MENU-BG") bg:SetAlpha(0.925)
    menu:Show()
    EventRegistry:TriggerEvent("MenuProxy.OnShow", menu)
    return bg
  end
  function __menuKeys()
    local out = {} for k in pairs(__menu) do out[#out + 1] = tostring(k) end table.sort(out) return table.concat(out, " ")
  end
`;

// The menu's state after an open: its background's alpha, the glow's, Vanguard's panel behind it
// (a child of the menu that isn't the game's) and how many frames are painted.
const menuState = (addon) => addon.eval(`local bg = __openMenu()
  local panel for _, c in ipairs({ __menu:GetChildren() }) do if c ~= __menu.FrameGlow and c ~= __menu.TestOnlyRow then panel = c end end
  return { bg = bg.__alpha, glow = __menu.FrameGlow.__alpha, panel = panel ~= nil and select("#", panel:GetRegions()) > 0,
    level = panel and panel:GetFrameLevel(), strata = panel and panel.__strata, painted = ns.Theme.PaintedCount() }`);

it("12.x menus: each open fades the game's background and glow, the panel behind it is painted once, the rows and keys untouched", () => {
  const addon = loggedIn(MENU_ENV);
  const keys = addon.eval("return __menuKeys()");
  const first = menuState(addon);
  expect(first, "the background and glow faded, a panel level with the menu").toMatchObject({ bg: 0, glow: 0, panel: true, level: 510, strata: "FULLSCREEN_DIALOG" });
  expect(addon.eval("return { select('#', __menu.TestOnlyRow:GetRegions()), __menu.TestOnlyRow.__alpha == nil, __menu.TestOnlyRow:GetFrameLevel() }"), "its row is the game's").toEqual([0, true, 530]);
  expect(addon.eval("return __menuKeys()"), "nothing written on the menu (the compositor would discard it)").toBe(keys);
  addon.eval('__menu:SetFrameStrata("TOOLTIP") __menu:SetFrameLevel(700)');
  const second = menuState(addon);
  expect(second, "the next open's new background faded too, the panel follows the menu's level").toMatchObject({ bg: 0, panel: true, level: 700, strata: "TOOLTIP" });
  expect(second.painted, "and nothing more is painted").toBe(first.painted);
  const plain = addon.eval(`local m = CreateFrame("Frame", nil, UIParent) local bg = __openMenu(m)
    ns.GetModule("Windows").SkinContextMenu(nil, nil) ns.GetModule("Windows").SkinContextMenu(nil, {}) return bg.__alpha`);
  expect(plain, "a menu without the glow (the mainline template) is skinned; other arguments are ignored").toBe(0);
  expect(addon.eval("return #ns.errors"), "nothing errors").toBe(0);
});

it("12.x menus: a skin that fails is reported and does not reach the game's menu code", () => {
  const addon = loggedIn(MENU_ENV);
  addon.eval("ns.Theme.FadeRegions = function() error('TEST-ONLY skin', 0) end");
  expect(() => addon.eval("EventRegistry:TriggerEvent('MenuProxy.OnShow', __menu)"), "the menu opens").not.toThrow();
  expectErrors("skin context menu: TEST-ONLY skin");
});

it("12.x menus: with the menus group off they stay the game's; a client without the hook loads cleanly", () => {
  const off = loggedIn(MENU_ENV, MENUS_OFF);
  const before = off.eval("return ns.Theme.PaintedCount()");
  expect(menuState(off), "the background stays, no panel").toMatchObject({ bg: 0.925, panel: false, painted: before });
  for (const env of ["EventRegistry = nil", "EventRegistry = {}"]) {
    const bare = loggedIn(`${env} ns.GetModule("Windows").WatchMenus()`);
    expect(bare.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') then return e.text end end return 'none'"), `${env}: nothing errors`).toBe("none");
  }
});

// TEST-ONLY old dropdown lists as UIDropDownListTemplate builds them on Forever
// (Blizzard_SharedXML/Mainline/UIDropDownMenuTemplates.xml): <list>Backdrop (parentKey Border, a dark
// dialog border), <list>MenuBackdrop (a tooltip backdrop with a NineSlice) and <list>Button1 with its
// highlight. DropDownList2 has none of the backdrops.
const DROPDOWN_ENV = `
  for i = 1, 2 do
    local list = CreateFrame("Button", "DropDownList" .. i, UIParent)
    local button = CreateFrame("Button", "DropDownList" .. i .. "Button1", list)
    button.TestOnlyHighlight = button:CreateTexture(nil, "HIGHLIGHT")
    list:Hide()
  end
  DropDownList1.Border = CreateFrame("Frame", "DropDownList1Backdrop", DropDownList1)
  local menu = CreateFrame("Frame", "DropDownList1MenuBackdrop", DropDownList1)
  menu.NineSlice = CreateFrame("Frame", nil, menu)
`;

// A dropdown list's state after it shows: its backdrops' alpha (1 when never set), whether Vanguard painted a panel on
// it, its first button's highlight and own regions, and how many frames are painted.
const dropdownState = (addon, name) => addon.eval(`local list = ${name} list:Show()
  local panel = 0 for _, r in ipairs({ list:GetRegions() }) do if r.__alpha ~= 0 then panel = panel + 1 end end
  local backdrop, menu, button = _G["${name}Backdrop"], _G["${name}MenuBackdrop"], _G["${name}Button1"]
  return { backdrop = backdrop and (backdrop.__alpha or 1), menu = menu and (menu.__alpha or 1), panel = panel > 0,
    button = select("#", button:GetRegions()), highlight = button.TestOnlyHighlight.__alpha == nil, painted = ns.Theme.PaintedCount() }`);

it("old dropdown lists: both backdrops faded, a tooltip panel behind, the buttons and their highlight the game's", () => {
  const addon = loggedIn(DROPDOWN_ENV);
  const first = dropdownState(addon, "DropDownList1");
  expect(first, "the backdrops faded, a panel, the button untouched").toMatchObject({ backdrop: 0, menu: 0, panel: true, button: 1, highlight: true });
  addon.eval("DropDownList1:Hide()");
  expect(dropdownState(addon, "DropDownList1").painted, "showing again paints nothing more").toBe(first.painted);
  expect(dropdownState(addon, "DropDownList2"), "a list without backdrops is still panelled").toMatchObject({ panel: true, button: 1, highlight: true });
  expect(addon.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') then return e.text end end return 'none'"), "nothing errors").toBe("none");
  const off = loggedIn(DROPDOWN_ENV, MENUS_OFF);
  expect(dropdownState(off, "DropDownList1"), "with the menus group off: the game's").toMatchObject({ backdrop: 1, menu: 1, panel: false });
});

it("R2.35 12.x menus: a long menu's scroll bar is in the theme on each open, nothing written on the menu by Vanguard", () => {
  const addon = loggedIn(MENU_ENV);
  addon.eval(`local bar = CreateFrame("Frame", nil, __menu) bar.Track = CreateFrame("Frame", nil, bar) bar.Thumb = CreateFrame("Button", nil, bar.Track)
    bar.Track:CreateTexture():SetTexture("TEST-ONLY-ART") __menu.ScrollBar = bar __keys = __menuKeys()`);
  addon.eval("__openMenu()");
  expect(addon.eval("return { __menu.ScrollBar.Track:GetRegions():GetAlpha(), __menuKeys() == __keys }"), "the track's art faded; the menu's keys as the game left them").toEqual([0, true]);
  addon.eval("__menu.ScrollBar = {} __openMenu()");
  expect(addon.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') then return e.text end end return 'none'"), "a scroll bar that is no frame is left alone").toBe("none");
  const off = loggedIn(MENU_ENV, MENUS_OFF);
  off.eval(`local bar = CreateFrame("Frame", nil, __menu) bar.Track = CreateFrame("Frame", nil, bar) bar.Thumb = CreateFrame("Button", nil, bar.Track)
    bar.Track:CreateTexture():SetTexture("TEST-ONLY-ART") __menu.ScrollBar = bar __openMenu()`);
  expect(off.eval("return __menu.ScrollBar.Track:GetRegions():GetAlpha()"), "with the menus group off the bar stays the game's").toBe(1);
});

// TEST-ONLY UIDropDownMenu_AddButton as the game's does for what Vanguard reads: it counts the list's buttons, makes the
// button on first use (its NormalText, and the Check and UnCheck textures, desaturated or not as the game sets them) and
// leaves the row's highlight alone.
const ROWS_ENV = `${DROPDOWN_ENV}
  function UIDropDownMenu_AddButton(info, level)
    level = level or 1
    local list = _G["DropDownList" .. level]
    if not list then return end
    list.numButtons = (list.numButtons or 0) + 1
    local name = "DropDownList" .. level .. "Button" .. list.numButtons
    local button = _G[name] or CreateFrame("Button", name, list)
    if not _G[name .. "NormalText"] then
      button:CreateFontString(name .. "NormalText"):SetTextColor(1, 0.82, 0)
      button:CreateTexture(name .. "Check") button:CreateTexture(name .. "UnCheck") button:CreateTexture(name .. "Highlight")
    end
    _G[name .. "Check"]:SetDesaturated(false) _G[name .. "UnCheck"]:SetDesaturated(false)
  end
`;

// A glyph's colour as the token it was tinted with, or "none" when it was never tinted: the RGB of accentText, text2, white.
const glyphColor = (addon, name) => addon.eval(`local v, out = _G["${name}"].__vertexColor, "none"
  if v then for _, token in ipairs({ "accentText", "text2", "white" }) do
    local t = { ns.Theme.RGB(token) } if v[1] == t[1] and v[2] == t[2] and v[3] == t[3] then out = token end
  end end
  return out`);

it("R2.35 old dropdown rows: a heading in the text colour, the tick in the accent, the empty box quiet; highlights left to the game", () => {
  const addon = loggedIn(ROWS_ENV);
  addon.eval("UIDropDownMenu_AddButton({ isTitle = true, notCheckable = true, text = 'Heading' })");
  const text = addon.eval("local c, t = DropDownList1Button1NormalText.__textColor, { ns.Theme.RGB('text') } return c[1] == t[1] and c[2] == t[2] and c[3] == t[3]");
  expect([text, glyphColor(addon, "DropDownList1Button1Check")], "a heading row: text colour, no glyphs touched").toEqual([true, "none"]);
  addon.eval("UIDropDownMenu_AddButton({ checked = true }) UIDropDownMenu_AddButton({ checked = false }, 2)");
  expect([glyphColor(addon, "DropDownList1Button2Check"), glyphColor(addon, "DropDownList1Button2UnCheck"), addon.eval("return DropDownList1Button2Check.__desaturated")], "a checkable row: the tick accent, the box quiet, both greyed so the colour reads").toEqual(["accentText", "text2", true]);
  expect([glyphColor(addon, "DropDownList2Button1Check"), addon.eval("return DropDownList2Button1NormalText.__textColor[1]")], "a row on the second level; its text is the game's").toEqual(["accentText", 1]);
  addon.eval("UIDropDownMenu_AddButton({ customCheckIconAtlas = 'icon' })");
  expect([glyphColor(addon, "DropDownList1Button3Check"), addon.eval("return DropDownList1Button3Check.__desaturated")], "a row with an icon of its own shows it in its own colours").toEqual(["white", false]);
  expect(addon.eval("return { DropDownList1Button2Highlight.__vertexColor == nil, DropDownList1Button2Highlight.__alpha == nil }"), "the row highlight is the game's").toEqual([true, true]);
  expect(addon.eval("UIDropDownMenu_AddButton({ notCheckable = true }, 'x') UIDropDownMenu_AddButton(nil) return #ns.errors"), "a level with no list and no info: nothing errors").toBe(0);
});

it("R2.35 old dropdown rows: the menus group off, or a client without the call, leaves them the game's", () => {
  const off = loggedIn(ROWS_ENV, MENUS_OFF);
  off.eval("UIDropDownMenu_AddButton({ isTitle = true }) UIDropDownMenu_AddButton({ checked = true })");
  expect([glyphColor(off, "DropDownList1Button2Check"), off.eval("return DropDownList1Button1NormalText.__textColor[1]")], "group off: untouched").toEqual(["none", 1]);
  for (const env of ["UIDropDownMenu_AddButton = nil", "hooksecurefunc = nil"]) {
    const bare = loggedIn(`${ROWS_ENV} ${env}`);
    expect(bare.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') then return e.text end end return 'none'"), `${env}: nothing errors`).toBe("none");
  }
});
