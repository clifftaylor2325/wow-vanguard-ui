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

// TEST-ONLY: a ButtonFrameTemplate-shaped system window (art, NineSlice, close button, title) with push buttons by parentKey.
const BUTTON_FRAME_ENV = SYSTEM_ENV + `
  function __buttonFrame(name, keys)
    local f = __frame(name)
    __sub(f, "NineSlice") __sub(f, "Bg") __sub(f, "Inset") __sub(f, "Border")
    __sub(f, "CloseButton", "Button") __sub(f, "TitleContainer") __text(f.TitleContainer, "TitleText")
    for _, k in ipairs(keys or {}) do __sub(f, k, "Button") end
    return f
  end
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

// A button frame's state: its art, panel, close button, title font and the named parts' panels.
const frameState = (addon, name, parts = []) => addon.eval(`local f = ${name}
  local out = { art = __faded(f), nine = f.NineSlice.__alpha, panel = __panelled(f), x = f.CloseButton.__piece.__alpha,
    title = f.TitleContainer.TitleText:GetFont() ~= nil, painted = ns.Theme.PaintedCount(), parts = {} }
  for _, k in ipairs({ ${parts.map((k) => `"${k}"`).join(", ")} }) do out.parts[k] = __panelled(f[k]) end
  return out`);

// Shows a window twice and checks the second show paints nothing new, then that its switch off leaves it the game's.
const sameOnReshow = (addon, name) => {
  const first = frameState(addon, name);
  addon.eval(`${name}:Hide() ${name}:Show()`);
  expect(frameState(addon, name).painted, `${name}: showing it again paints nothing new`).toBe(first.painted);
};
const SWITCH_OFF = { savedVariables: "VanguardDB.profiles = { Default = { Windows = { system = false } } }" };

it("addon list: the window skin plus its push buttons and search box, the rows untouched", () => {
  const env = BUTTON_FRAME_ENV + '__buttonFrame("AddonList", { "CancelButton", "OkayButton", "EnableAllButton", "DisableAllButton", "SearchBox" })';
  const addon = loggedIn(env);
  addon.eval("AddonList:Show()");
  expect(frameState(addon, "AddonList", ["CancelButton", "OkayButton", "EnableAllButton", "DisableAllButton", "SearchBox"]),
    "art faded, panel, close button and title themed, buttons and search box themed").toMatchObject({
    art: 0, nine: 0, panel: true, x: 0, title: true, parts: { CancelButton: true, OkayButton: true, EnableAllButton: true, DisableAllButton: true, SearchBox: true },
  });
  sameOnReshow(addon, "AddonList");
  const off = loggedIn(env, SWITCH_OFF);
  off.eval("AddonList:Show()");
  expect(frameState(off, "AddonList").panel, "switched off: the game's window").toBe(false);
  const bare = loggedIn(BUTTON_FRAME_ENV + '__buttonFrame("AddonList")');
  bare.eval("AddonList:Show()");
  expect([frameState(bare, "AddonList").panel, bare.eval("return __errors('Windows')")], "without the buttons: skinned, no error").toEqual([true, "none"]);
});

it("nameplates tutorial: the window skin, the four picture cards kept visible", () => {
  const env = BUTTON_FRAME_ENV + `local f = __buttonFrame("NamePlatesTutorial")
    for _, k in ipairs({ "StyleOptions", "Aggro", "BuffsDebuffs", "EnemyVsFriendly" }) do f[k] = f:CreateTexture(nil, "ARTWORK") end`;
  const addon = loggedIn(env);
  addon.eval("NamePlatesTutorial:Show()");
  expect(frameState(addon, "NamePlatesTutorial"), "background faded, panel painted").toMatchObject({ art: 0, panel: true });
  expect(addon.eval("local f = NamePlatesTutorial return { f.StyleOptions.__alpha, f.Aggro.__alpha, f.BuffsDebuffs.__alpha, f.EnemyVsFriendly.__alpha }"), "the cards are shown").toEqual([1, 1, 1, 1]);
  sameOnReshow(addon, "NamePlatesTutorial");
  const off = loggedIn(env, SWITCH_OFF);
  off.eval("NamePlatesTutorial:Show()");
  expect(frameState(off, "NamePlatesTutorial").art, "switched off: the game's art is not faded").toBeUndefined();
  const bare = loggedIn(BUTTON_FRAME_ENV + '__buttonFrame("NamePlatesTutorial")');
  bare.eval("NamePlatesTutorial:Show()");
  expect(bare.eval("return __errors('Windows')"), "a client without the cards").toBe("none");
});

// TEST-ONLY: the chat settings window: a Border, a Header with a plate and title, two boxes (one with a NineSlice, one named ...Backdrop), a plain child, and the named buttons.
const CHAT_ENV = BUTTON_FRAME_ENV + `
  local f = __buttonFrame("ChatConfigFrame")
  __sub(f, "Header") __text(f.Header, "Text")
  local box = __sub(f, "CategoryBox") __sub(box, "NineSlice")
  local named = CreateFrame("Frame", "TestOnlyChatBackdrop", f) __art(named)
  local plain = CreateFrame("Frame", nil, f) __art(plain) f.Plain = plain
  for _, n in ipairs({ "ChatConfigFrameDefaultButton", "ChatConfigFrameCancelButton", "ChatConfigFrameOkayButton", "CombatLogDefaultButton", "TextToSpeechDefaultButton" }) do
    CreateFrame("Button", n, f):CreateTexture()
  end
`;

it("chat settings: the outer window, its header plate, the boxes under it and the named buttons", () => {
  const addon = loggedIn(CHAT_ENV);
  addon.eval("ChatConfigFrame:Show()");
  expect(frameState(addon, "ChatConfigFrame", ["CategoryBox", "Plain"]), "window skinned; the box with a NineSlice is an inset panel, a plain child is not").toMatchObject({
    art: 0, panel: true, x: 0, title: true, parts: { CategoryBox: true, Plain: false },
  });
  expect(addon.eval(`return { __faded(ChatConfigFrame.Header), ChatConfigFrame.Header.Text:GetFont() ~= nil, __faded(ChatConfigFrame.CategoryBox.NineSlice),
    __faded(TestOnlyChatBackdrop), __panelled(TestOnlyChatBackdrop), __panelled(ChatConfigFrameOkayButton), __panelled(TextToSpeechDefaultButton) }`),
    "header art faded and its title in the theme font; the box art faded; a child named ...Backdrop treated as a box; named buttons themed").toEqual([0, true, 0, 0, true, true, true]);
  sameOnReshow(addon, "ChatConfigFrame");
  const off = loggedIn(CHAT_ENV, SWITCH_OFF);
  off.eval("ChatConfigFrame:Show()");
  expect(frameState(off, "ChatConfigFrame").panel, "switched off").toBe(false);
  const bare = loggedIn(BUTTON_FRAME_ENV + '__buttonFrame("ChatConfigFrame")');
  bare.eval("ChatConfigFrame:Show()");
  expect(bare.eval("return __errors('Windows')"), "a window without a header, boxes or buttons").toBe("none");
});
