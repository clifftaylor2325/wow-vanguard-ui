// windows-system: the system group of game windows (Modules/WindowsSystem.lua), in the
// TEST-ONLY headless client. Cases follow docs/handoff/RESKIN-PLAN.md section 0 ("Writing a task's test").

import { expect, it } from "vitest";
import { loggedIn } from "./helpers.mjs";

// TEST-ONLY builders for the game's system windows: a frame with a piece of template art, parts
// added by parentKey, and readers for what the skin did (art alpha, a painted panel, themed text).
const SYSTEM_ENV = `
  function __art(f) local t = f:CreateTexture(nil, "BACKGROUND") t:SetTexture("TEST-ONLY-ART") return t end
  function __frame(name) local f = CreateFrame("Frame", name, UIParent) __art(f) f:Hide() return f end
  function __sub(parent, key, kind)
    local c = CreateFrame(kind or "Frame", nil, parent) c.__piece = __art(c) parent[key] = c
    return c
  end
  function __text(parent, key) parent[key] = parent:CreateFontString(nil, "OVERLAY") return parent[key] end
  function __faded(f) for _, r in ipairs({ f:GetRegions() }) do if r.__texture == "TEST-ONLY-ART" then return r.__alpha end end end
  function __panelled(f)
    for _, r in ipairs({ f:GetRegions() }) do if r.__texture ~= "TEST-ONLY-ART" and r.__alpha ~= 0 then return true end end
    return false
  end
  function __errors(word) for _, e in ipairs(ns.errors) do if e.text:find(word) then return e.text end end return "none" end
`;

// TEST-ONLY: the game's options window, shaped like SettingsPanel (Blizzard_Settings_Shared).
const SETTINGS_ENV = SYSTEM_ENV + `
  local f = __frame("SettingsPanel")
  __sub(f, "NineSlice") __text(f.NineSlice, "Text") __sub(f, "Bg")
  for _, k in ipairs({ "ClosePanelButton", "CloseButton", "ApplyButton" }) do __sub(f, k, "Button") end
  __sub(f, "SearchBox", "EditBox")
  for _, k in ipairs({ "GameTab", "AddOnsTab" }) do
    local tab = __sub(f, k, "Button") __sub(tab, "Left")
    function tab:OnSelected() end
  end
  __sub(f, "CategoryList") __sub(f, "Container") __sub(f.Container, "SettingsList") __sub(f.Container, "SettingsCanvas")
`;

// The options window's state: its art, its parts dressed, how many frames are painted.
const settings = (addon) => addon.eval(`local f = SettingsPanel
  return { art = __faded(f), nine = __faded(f.NineSlice), bg = f.Bg.__alpha, panel = __panelled(f),
    titleFont = f.NineSlice.Text:GetFont() ~= nil, apply = __panelled(f.ApplyButton), close = __panelled(f.CloseButton),
    x = f.ClosePanelButton.__piece.__alpha, search = __panelled(f.SearchBox), tab = __panelled(f.GameTab),
    list = __panelled(f.CategoryList), settings = __panelled(f.Container.SettingsList), canvas = __panelled(f.Container.SettingsCanvas),
    painted = ns.Theme.PaintedCount() }`);

it("the system group loads cleanly on a client without its windows", () => {
  const addon = loggedIn("");
  expect(addon.eval("return ns.GetModule('Windows').settings.system"), "its switch is on by default").toBe(true);
  expect(addon.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') then return e.text end end return 'none'")).toBe("none");
});

it("game options: the window in the theme, its art faded, buttons, search box, tabs and lists dressed", () => {
  const addon = loggedIn(SETTINGS_ENV);
  addon.eval("SettingsPanel:Show()");
  const first = settings(addon);
  expect(first, "art and Bg faded, a panel, title in the theme font, the push buttons, search box, tab and category list themed").toMatchObject({
    art: 0, nine: 0, bg: 0, panel: true, titleFont: true, apply: true, close: true, x: 0, search: true, tab: true, list: true, settings: true,
  });
  expect(first.canvas, "the settings canvas is left to its pages").toBe(false);
  addon.eval("SettingsPanel:Hide() SettingsPanel:Show()");
  expect(settings(addon).painted, "showing it again paints nothing new").toBe(first.painted);
});

it("game options: the tabs' accent line follows the game's selection, the title text stays visible", () => {
  const addon = loggedIn(SETTINGS_ENV);
  addon.eval("SettingsPanel:Show()");
  const line = (tab) => addon.eval(`for _, r in ipairs({ SettingsPanel.${tab}:GetRegions() }) do if r.__layer == "OVERLAY" then return r:IsShown() end end`);
  addon.eval("SettingsPanel.GameTab:OnSelected(true)");
  expect([line("GameTab"), line("AddOnsTab")], "the selected tab has the line").toEqual([true, false]);
  addon.eval("SettingsPanel.GameTab:OnSelected(false) SettingsPanel.AddOnsTab:OnSelected(true)");
  expect([line("GameTab"), line("AddOnsTab")], "and it moves with the selection").toEqual([false, true]);
  expect(addon.eval("return SettingsPanel.NineSlice.__alpha ~= 0"), "the NineSlice frame itself is not faded: its title text is a child").toBe(true);
});

it("game options: switched off it stays the game's, and a client missing parts loads cleanly", () => {
  const off = loggedIn(SETTINGS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { system = false } } }" });
  off.eval("SettingsPanel:Show()");
  const state = settings(off);
  expect([state.art, state.panel, state.apply], "nothing faded or painted").toEqual([undefined, false, false]);
  const bare = loggedIn(SYSTEM_ENV + '__frame("SettingsPanel")');
  bare.eval("SettingsPanel:Show()");
  expect([bare.eval("return __faded(SettingsPanel)"), bare.eval("return __panelled(SettingsPanel)"), bare.eval("return __errors('Windows')")], "a window with none of the parts").toEqual([0, true, "none"]);
});
