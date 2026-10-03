// options: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, DATA_ENV, RETAIL, UI_ENV, UNITS_ENV, bars, button, calls, chatHas, key, loggedIn, marks, tooltip } from "./helpers.mjs";

it("options window", () => {
  const addon = loggedIn(RETAIL + CLICK_LUA + DATA_ENV + "GetSpecialization = function() return 1 end");
  addon.slash("");
  expect(addon.eval("return ForeverUI_Options:IsShown()") === true, "/fui opens the options window").toBeTruthy();
  expect(addon.eval("return ForeverUI_Options.reload:IsShown()") === false, "no reload button until something needs one").toBeTruthy();
  addon.eval("for _, w in ipairs(__wfgStub.frames) do if w.fill and w.__parent and w.__parent.hex and w.__scripts.OnClick then __swatches = (__swatches or 0) + 1 if __swatches == 2 then w.__scripts.OnClick(w) end end end");
  expect(addon.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.arcane[1]") === true, "the second swatch (arcane) sets the accent at once").toBeTruthy();
  expect(addon.eval('return __click("Snap to other frames")') && addon.eval("return ns.MoverOptions().snap") === false, "the snap check box turns snapping off").toBeTruthy();
  expect(addon.eval('return __click("Action bars")'), "the nav switches pages").toBeTruthy();
  expect(addon.eval('return __click("Show bar 6")') && addon.eval("return ForeverUIDB.profiles.Default.ActionBars.bars[6].enabled") === true, "check boxes change settings").toBeTruthy();
  expect(addon.eval("return ForeverUI_Options.reload:IsShown()") === true, "a change that needs a reload shows the Reload button").toBeTruthy();
  expect(addon.eval('return __click("Visibility")') && addon.eval("return ForeverUIDB.profiles.Default.ActionBars.bars[1].visibility") === "mouseover", "cycle buttons step through choices").toBeTruthy();
  expect(addon.eval('return __click("Button size")') && addon.eval("return ForeverUIDB.profiles.Default.ActionBars.bars[1].size") === 38, "a bar's size slider starts at the shared size and steps by 2").toBeTruthy();
  addon.eval('__click("Modules")');
  // The Modules page's row for unit frames: its description, and clicking it.
  const moduleRow = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.desc and w.label.__text == "Unit frames" and w:IsVisible() then
    local desc = w.desc.__text w.__scripts.OnClick(w, "LeftButton") return desc end end`);
  expect(moduleRow, "each module has a name and a line on what it does").toMatch(/^Player, target/);
  expect(addon.eval("return ns.ModuleEnabled('UnitFrames')"), "modules can be turned off").toBe(false);
  addon.eval('__click("Profiles")');
  expect(addon.eval('return __click("Export profile")') && addon.eval("return ForeverUI_TextEdit:GetText():sub(1, 5)") === "FUI1:", "Export profile shows the string").toBeTruthy();
  expect(addon.eval('return __click("Use this profile for this spec")') && addon.eval("return ForeverUICharDB.specProfiles[1]") === "Default", "the spec button maps this spec").toBeTruthy();
  addon.eval('ReloadUI = function() __reloaded = true end; ForeverUI_Options.reload:GetScript("OnClick")(ForeverUI_Options.reload)');
  expect(addon.eval("return __reloaded") === true, "Reload UI reloads").toBeTruthy();
  addon.slash("options");
  expect(addon.eval("return ForeverUI_Options:IsShown()") === false, "/fui options toggles it closed").toBeTruthy();
  addon.eval('ForeverUI_OnAddonCompartmentClick("ForeverUI", "RightButton")');
  expect(addon.eval("return ns.Unlocked()") === true, "right-clicking the addons button toggles moving frames").toBeTruthy();
  addon.eval('ForeverUI_OnAddonCompartmentClick("ForeverUI", "LeftButton")');
  expect(addon.eval("return ForeverUI_Options:IsShown()") === true, "left-clicking it opens the options").toBeTruthy();
});

it("options window: nav, search, controls, footer", () => {
  const addon = loggedIn(CLICK_LUA + "GetAddOnMetadata = function(_, key) return key == 'Version' and 'TEST-ONLY-9.9' or nil end");
  addon.eval('ns.Options.Show("general")');
  const nav = addon.eval(`local out = {}
    for k, b in pairs(ForeverUI_Options.nav) do out[k] = { icon = b.icon.__texture, rail = b.rail:IsShown(), text = b.text:GetText() } end
    return out`);
  expect(/Icons\\General$/.test(nav.general.icon) && /Icons\\Healing$/.test(nav.healing.icon), "every nav entry has its icon").toBeTruthy();
  expect(nav.general.rail === true && nav.raid.rail === false, "the current page gets the accent rail").toBeTruthy();
  expect(addon.eval("return ForeverUI_Options.notice:IsShown() or ForeverUI_Options.reload:IsShown()") === false, "no reload notice until something needs one").toBeTruthy();
  expect(/TEST-ONLY-9\.9/.test(addon.eval("return ForeverUI_Options.version:GetText()")), "the footer shows the version").toBeTruthy();
  addon.eval('ns.Options.Search("dispel")');
  expect(addon.eval("return ForeverUI_Options.nav.raid:GetAlpha()") === 1 && addon.eval("return ForeverUI_Options.nav.general:GetAlpha()") === 0.35, "search dims pages without a match").toBeTruthy();
  addon.eval('ForeverUI_Options.search:GetScript("OnEnterPressed")(ForeverUI_Options.search)');
  expect(addon.eval("return ns.Options.current") === "raid", "Enter in the search opens the first match").toBeTruthy();
  addon.eval('ns.Options.Search("")');
  expect(addon.eval("return ForeverUI_Options.nav.general:GetAlpha()") === 1, "clearing the search brings every page back").toBeTruthy();
  addon.eval('ns.Options.Show("more")');
  const seg = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.segments and w.label:GetText() == "Numbers" then
      w.segments[2]:GetScript("OnClick")(w.segments[2]) return { value = ForeverUIDB.profiles.Default.DataBars.text, on = w.segments[2].fill:IsShown(), off = w.segments[1].fill:IsShown() } end end`);
  expect(seg.value === "always" && seg.on === true && seg.off === false, "clicking a segment picks it and lights it").toBeTruthy();
  const dd = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.dropdown and w.label:GetText() == "Tooltip position" then
      w.dropdown:GetScript("OnClick")(w.dropdown)
      local m = ForeverUI_Menu
      local shown = m:IsShown()
      m.items[2]:GetScript("OnClick")(m.items[2])
      return { shown = shown, count = #m.items, value = ForeverUIDB.profiles.Default.Tooltips.anchor, closed = not m:IsShown(), text = w.dropdown.text:GetText() } end end`);
  expect(dd.shown && dd.count === 3 && dd.value === "cursor" && dd.closed && dd.text === "at the cursor", "a dropdown opens a menu of its choices; picking one sets it and closes the menu").toBeTruthy();
  addon.eval('ns.Options.Show("general")');
  const slider = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.track and w.value and w.label:GetText() == "Text size" then
      w:GetScript("OnMouseWheel")(w, -1)
      return { v = ns.Theme.Settings().textScale, text = w.value:GetText() } end end`);
  expect(Math.abs(slider.v - 0.95) < 1e-9 && slider.text === "95%", "the Text size slider steps by 5% with the wheel and shows the value").toBeTruthy();
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.hex then w.hex:SetText("#5aa2f0") w.hex:GetScript("OnEnterPressed")(w.hex) end end`);
  expect(addon.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.arcane[1]") === true, "typing a hex color in the accent box sets it").toBeTruthy();
  expect(addon.eval("return ForeverUI_Options.notice:IsShown() and ForeverUI_Options.reload:IsShown()") === true, "a reload-only change shows the notice and the Reload now button").toBeTruthy();
  const profiles = addon.eval(`ns.CreateProfile = ns.CreateProfile ForeverUIDB.profiles["TEST-ONLY Healer"] = {}
    local d = ForeverUI_Options.profile d:GetScript("OnClick")(d)
    local texts = {} for i, b in ipairs(ForeverUI_Menu.items) do if b:IsShown() then texts[#texts + 1] = b.text:GetText() end end
    ForeverUI_Menu.items[2]:GetScript("OnClick")(ForeverUI_Menu.items[2])
    return { texts = texts, now = ns.SelectedProfileName(), running = ns.ProfileName() }`);
  expect(profiles.texts.length === 2 && profiles.now === "TEST-ONLY Healer" && profiles.running === "Default", "the header's profile dropdown lists profiles and stages the switch (on reload)").toBeTruthy();
});

it("options slider, search, scroll, special bars and profile switch", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  const scale = addon.eval(`
    local row
    for _, w in ipairs(__wfgStub.frames) do
      if w.track and w.min and w.label and w.label.__text == "Text size" then row = w end
    end
    row.set(row.max)
    row:GetScript("OnClick")(row)
    local wrapped = row.get()
    -- TEST-ONLY track geometry, and a cursor halfway along it.
    row.track.__left, row.track.__width = 0, 100
    GetCursorPosition = function() return 50 end
    row.track:GetScript("OnMouseDown")()
    __wfgStub.update(0.05)
    row.track:GetScript("OnMouseUp")()
    local dragged = row.get()
    ForeverUI_Options.search:SetText("")
    ForeverUI_Options.search:GetScript("OnTextChanged")(ForeverUI_Options.search)
    local hint = ForeverUI_Options.search.hint:IsShown()
    for _, w in ipairs(__wfgStub.frames) do
      if w.__scrollChild and w.__scripts.OnMouseWheel then
        -- TEST-ONLY page taller than its view, so the wheel can scroll.
        w.__height, w.__scrollChild.__height = 100, 800
        w:GetScript("OnMouseWheel")(w, -1)
      end
    end
    return { wrapped = wrapped, dragged = dragged, hint = hint }
  `);
  expect(scale.wrapped === 0.7 && Math.abs(scale.dragged - 1) < 1e-9 && scale.hint === true, "a slider wraps at the max, drags with the cursor, and the search hint shows while empty").toBeTruthy();
  expect(addon.eval('ns.Options.Show("actionbars") return __click("Restyle the pet, stance and extra action buttons (reload)")') === true, "the special-bars switch is on the action bar page").toBeTruthy();
  expect(addon.eval("return ForeverUIDB.profiles.Default.SpecialBars.skinPet") === false, "it turns pet, stance and extra bars off together").toBeTruthy();
});

// The visible profile row for a name: its caption and which buttons it has.
const profileRow = (addon, name) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do
  if w.label and type(w.label.__text) == "string" and w.label.__text:sub(1, #"${name}") == "${name}" and w.card and w:IsVisible() then
    return { w.label.__text, w.use ~= nil, w.copy ~= nil, w.delete ~= nil } end end`);

// Clicks one of a profile row's buttons.
const profileButton = (addon, name, button) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do
  if w.label and w.label.__text == "${name}" and w.card and w:IsVisible() then local b = w.${button} b:GetScript("OnClick")(b) return b.text.__text end end`);

it("options: profiles in the window", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.NewProfile("TEST-ONLY Healer") ns.NewProfile("TEST-ONLY Tank") ns.Options.Show("profiles")');
  expect(profileRow(addon, "Default"), "the profile in use is marked and has no buttons").toEqual(["Default  (in use)", false, false, false]);
  expect(profileRow(addon, "TEST-ONLY Healer"), "every other profile can be used, copied here or deleted").toEqual(["TEST-ONLY Healer", true, true, true]);
  expect(profileButton(addon, "TEST-ONLY Tank", "delete"), "Delete asks first").toBe("Sure?");
  expect(addon.eval('return ForeverUIDB.profiles["TEST-ONLY Tank"] ~= nil'), "and deletes nothing yet").toBe(true);
  profileButton(addon, "TEST-ONLY Tank", "delete");
  expect([addon.eval('return ForeverUIDB.profiles["TEST-ONLY Tank"] == nil'), profileRow(addon, "TEST-ONLY Tank")], "the second click deletes it, and the page rebuilds without it").toEqual([true, null]);
  addon.eval('ForeverUIDB.profiles["TEST-ONLY Healer"].Chat = { background = false }');
  profileButton(addon, "TEST-ONLY Healer", "copy");
  profileButton(addon, "TEST-ONLY Healer", "copy");
  expect(addon.eval("return ForeverUIDB.profiles.Default.Chat.background"), "Copy here (asked twice) copies that profile's settings over this one").toBe(false);
  profileButton(addon, "TEST-ONLY Healer", "use");
  expect([addon.eval("return ns.ProfileName()"), addon.eval("return ns.SelectedProfileName()"), profileRow(addon, "TEST-ONLY Healer"), addon.eval("return ForeverUI_Options.reload:IsShown()")], "Use stages the switch (it applies on reload): the profile on screen stays, the chosen one is marked and has no buttons")
    .toEqual(["Default", "TEST-ONLY Healer", ["TEST-ONLY Healer  (after reload)", false, false, false], true]);
  expect(profileRow(addon, "Default"), "the profile running until then can only be taken back with Use").toEqual(["Default  (in use until reload)", true, false, false]);
  expect(addon.eval('return ns.DeleteProfile("TEST-ONLY Healer")'), "the staged profile can't be deleted").toBe(false);
  addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.use and w.label.__text == "Default  (in use until reload)" and w:IsVisible() then w.use:GetScript("OnClick")(w.use) end end');
  expect([addon.eval("return ns.PendingProfileName()"), profileRow(addon, "Default")[0]], "Use on the running profile takes the switch back").toEqual([null, "Default  (in use)"]);
  profileButton(addon, "TEST-ONLY Healer", "use");
  // The new-profile row: types a name and presses Create (or Enter); returns the row's caption.
  const create = (name, enter) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.input and w.create and w:IsVisible() then
    w.input:SetText("${name}") local b = ${enter ? "w.input" : "w.create"} b:GetScript(${enter ? '"OnEnterPressed"' : '"OnClick"'})(b) return w.label.__text end end`);
  expect(create("TEST-ONLY Bad/Name"), "a bad name says why").toBe("Name taken or not allowed");
  create("TEST-ONLY Leveling", true);
  expect([addon.eval("return ns.SelectedProfileName()"), profileRow(addon, "TEST-ONLY Leveling")[0], profileRow(addon, "TEST-ONLY Healer")[0]], "a good name makes the profile and stages the switch to it").toEqual(["TEST-ONLY Leveling", "TEST-ONLY Leveling  (after reload)", "TEST-ONLY Healer"]);
  expect(addon.texts("This character uses Default until you reload, then TEST-ONLY Leveling.").length, "and the page says what is used until then").toBe(1);
  addon.eval('ns.Options.Hide() ns.Options.RebuildPage("profiles")');
  expect(addon.eval("return ForeverUI_Options:IsShown()"), "rebuilding a page while the window is closed doesn't open it").toBe(false);
});

it("options: search jumps to the row, and the page edges fade", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.slash("");
  // Types into the search box and presses Enter.
  const search = (text) => addon.eval(`local s = ForeverUI_Options.search s:SetText("${text}") s:GetScript("OnTextChanged")(s) s:GetScript("OnEnterPressed")(s)`);
  search("swing timer");
  // The current page and the found row: page key, its caption, the page's scroll, the wash shown.
  const found = () => addon.eval(`local f = ForeverUI_Options.found local w for _, x in ipairs(__wfgStub.frames) do if x.found == f and f then w = x end end
    return { ns.Options.current, w and w.caption, f ~= nil and f:IsShown() }`);
  expect(found(), "Enter opens the first page that matches and marks the row").toEqual(["modules", "Swing timer", true]);
  search("bars, map");
  expect(found()[2], "a new search clears the old mark (a page title match marks no row)").toBe(false);
  search("TEST-ONLY nothing matches");
  expect(addon.eval("return ns.Options.current"), "no match: Enter stays put").toBe("more");
  addon.eval('ns.Options.current = "nowhere" ns.Options.JumpTo("swing")');
  addon.eval('ns.Options.Show("unitframes")');
  // The page's view: its edges, after scrolling to a place.
  const edges = (y) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.fadeTop and w:IsVisible() then
    w.__height, w.__scrollChild.__height = 100, 800 w:SetVerticalScroll(${y}) w:GetScript("OnMouseWheel")(w, 0) return { w.fadeTop:IsShown(), w.fadeBottom:IsShown() } end end`);
  expect(edges(0), "at the top: only the bottom edge fades").toEqual([false, true]);
  expect(edges(300), "midway: both").toEqual([true, true]);
  expect(edges(700), "at the bottom: only the top").toEqual([true, false]);
});

it("options: search reads each page's rows once per opening; a rebuilt page leaves no orphan rows", () => {
  const addon = loggedIn(CLICK_LUA);
  // Counts each page's rows() calls (a TEST-ONLY spy around every page's own builder).
  addon.eval("__rows = {} for _, p in ipairs(ns.Options.PAGES) do local real = p.rows p.rows = function() __rows[p.key] = (__rows[p.key] or 0) + 1 return real() end end");
  // The rows() calls so far for the general and profiles pages, then reset.
  const reads = () => addon.eval("local r = { __rows.general or 0, __rows.profiles or 0 } __rows = {} return r");
  addon.eval('ns.NewProfile("TEST-ONLY Healer") ns.Options.Show("profiles")');
  reads();
  const rows = addon.eval("return ns.Options.RowCount()");
  for (const text of ["h", "he", "hea", "heal"]) addon.eval(`ns.Options.Search("${text}")`);
  expect([reads(), addon.eval("return ns.Options.matched.profiles")], "four keystrokes read each page's rows once, and still find a profile's name").toEqual([[1, 1], true]);
  addon.eval('ns.Options.RebuildPage("profiles")');
  expect([addon.eval("return ns.Options.RowCount()"), reads()], "a rebuilt page replaces its rows: the row list is the same length, the profiles page read again to build it").toEqual([rows, [0, 1]]);
  addon.eval('ns.NewProfile("TEST-ONLY Tank") ns.Options.RebuildPage("profiles") ns.Options.Search("tank")');
  expect([addon.eval("return ns.Options.RowCount()"), addon.eval("return ns.Options.matched.profiles"), reads()], "a new profile: one more row, found by the search; only the rebuilt page is read again (to build it, then to search it)").toEqual([rows + 1, true, [0, 2]]);
  addon.eval('ns.Options.Search("tan")');
  expect(reads(), "the next keystroke reads nothing").toEqual([0, 0]);
  addon.eval('ns.Options.Hide() ForeverUI_Options:Hide() ns.Options.Show() ns.Options.Search("tan")');
  expect(reads(), "opening the window again reads the rows afresh").toEqual([1, 1]);
});

it("choice fallback, key capture and the mouse wheel", () => {
  const addon = loggedIn(CLICK_LUA + `
    -- TEST-ONLY spec index so the click-cast page builds for spec 1.
    GetSpecialization = function() return 1 end`);
  // TEST-ONLY choice value that is not in the list.
  const fallback = addon.eval('return ns.Widgets.NextChoice({ { "a", "A" }, { "b", "B" } }, "missing")[1]');
  expect(fallback === "a", "a choice that is not in the list wraps to the first").toBeTruthy();
  addon.eval('ns.Options.Show("clickcast")');
  const captured = addon.eval(`
    __click("Set key")
    local cap, cycle
    for _, w in ipairs(__wfgStub.frames) do
      if w.capturing then cap = w end
      if w.caption == "Action" then cycle = w end
    end
    cap:GetScript("OnKeyDown")(cap, "F")
    local key = "F"
    for _, w in ipairs(__wfgStub.frames) do if w.keyText and w.keyText:GetText() ~= "" then key = w.keyText:GetText() end end
    __click("Set key")
    for _, w in ipairs(__wfgStub.frames) do if w.capturing then cap = w end end
    cap:GetScript("OnKeyDown")(cap, "ESCAPE")
    local cancelled = cap.capturing == false
    __click("Set key")
    for _, w in ipairs(__wfgStub.frames) do if w.capturing then cap = w end end
    cap:GetScript("OnMouseWheel")(cap, -1)
    local wheel = ""
    for _, w in ipairs(__wfgStub.frames) do if w.keyText then wheel = w.keyText:GetText() end end
    cycle:GetScript("OnClick")(cycle)
    local stepped = cycle.text:GetText()
    local calls = 0
    -- TEST-ONLY getter: the first read is an unknown action, then "spell".
    cycle.get = function() calls = calls + 1; return calls == 1 and "missing" or "spell" end
    cycle:GetScript("OnClick")(cycle)
    return { key = key, cancelled = cancelled, wheel = wheel, stepped = stepped, back = cycle.text:GetText() }
  `);
  expect(captured.key === "F (hover)" && captured.cancelled === true, "a key is captured, and Escape cancels").toBeTruthy();
  expect(captured.wheel === "Wheel down (hover)", "the wheel is captured as a hover binding").toBeTruthy();
  expect(captured.stepped === "Action: Macro" && captured.back === "Action: Spell", "the action cycle steps, and an unknown value wraps to the first").toBeTruthy();
  expect(addon.eval('return __click("Also on your player, target and focus frames (reload)")') === true, "unit-frame click casting is a switch on the page").toBeTruthy();
  expect(addon.eval("return ns.Settings('ClickCast').unitFrames") === true, "the switch turns it on").toBeTruthy();
});

// The reset dot on the visible row whose caption starts with this text: { shown, has a dot }.
const resetDot = (addon, text) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do
  if w.label and type(w.label.__text) == "string" and w.label.__text:sub(1, #"${text}") == "${text}" and w:IsVisible() then
    return { w.reset ~= nil and w.reset:IsShown(), w.reset ~= nil } end end`);

it("options: a changed setting gets a dot that puts the default back", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA);
  addon.slash("");
  addon.eval('__click("Unit frames")');
  expect(resetDot(addon, "Show health numbers"), "a setting at its default: no dot showing").toEqual([false, true]);
  addon.eval('__click("Show health numbers")');
  expect(resetDot(addon, "Show health numbers"), "changed: the dot shows").toEqual([true, true]);
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.reset and w.reset:IsShown() then __dot = w.reset end end
    __dot:GetScript("OnEnter")(__dot) __dot:GetScript("OnLeave")(__dot) __dot:GetScript("OnClick")(__dot)`);
  expect([addon.eval("return ForeverUIDB.profiles.Default.UnitFrames.healthText"), ...resetDot(addon, "Show health numbers")], "clicking it puts the default back and hides it").toEqual([true, false, true]);
  expect(resetDot(addon, "Health as"), "a default that depends on the client has no dot").toEqual([false, false]);
  addon.eval('__click("General")');
  expect(resetDot(addon, "Snap to other frames"), "a setting with no default has no dot").toEqual([false, false]);
  addon.eval(`GameTooltip = CreateFrame("Frame", "GameTooltip", UIParent) function GameTooltip:SetOwner(o) self.__owner = o end
    function GameTooltip:SetText(t) self.__tip = t end`);
  addon.eval('__click("Nameplates")');
  addon.eval('__click("Width")');
  expect(resetDot(addon, "Width"), "choices get one too").toEqual([true, true]);
  addon.eval('__click("Width") __click("Width")');
  expect(resetDot(addon, "Width")[0], "and lose it back at the default").toBe(false);
  addon.eval('__click("Cast bar")');
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.reset and w.reset:IsShown() then __dot = w.reset end end __dot:GetScript("OnEnter")(__dot)`);
  expect(addon.eval("return { GameTooltip.__owner == __dot, GameTooltip:IsShown(), GameTooltip.__tip }"), "hovering the dot says what it does").toEqual([true, true, "Changed from the default. Click to put it back."]);
  addon.eval("__dot:GetScript('OnLeave')(__dot)");
  expect(addon.eval("return GameTooltip:IsShown()"), "and the tooltip goes when the mouse leaves").toBe(false);
});

// TEST-ONLY client hooks and fonts: hooks run after the client function, as hooksecurefunc does.
const TEXT_ENV = `
  hooksecurefunc = function(name, fn) local orig = _G[name] _G[name] = function(...) orig(...) fn(...) end end
  FCF_OpenTemporaryWindow = function() end
  FCF_Tab_OnClick = function() end
  FCF_SetChatWindowFontSize = function(self, frame, size) frame:SetFont("TEST-ONLY-FONT", size, "") end
  local function font() return { SetFont = function(self, path, size, flags) self.font = { path, size, flags } end } end
  GameTooltipHeaderText, GameTooltipText = font(), font()
`;

it("text that fits: chat size, tooltip fonts, the status line, name width", () => {
  const addon = loggedIn(UI_ENV + TEXT_ENV + CLICK_LUA);
  // Chat window 1's font size, and the tooltip fonts' sizes.
  const sizes = () => addon.eval("return { select(2, ChatFrame1:GetFont()), GameTooltipText.font[2], GameTooltipHeaderText.font[2] }");
  expect(sizes(), "chat at Medium (12), tooltips in the theme font at their sizes").toEqual([12, 12, 14]);
  addon.eval("ns.Theme.Settings().textScale = 0.7 ns.Theme.Refresh()");
  expect(sizes(), "Text size shrinks chat and tooltips at once (70%)").toEqual([8, 8, 10]);
  addon.eval("FCF_SetChatWindowFontSize(nil, ChatFrame1, 18)");
  expect(sizes()[0], "the game's own chat size menu can't undo ForeverUI's size").toBe(8);
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  expect(addon.eval('return __click("Chat text size") and ForeverUIDB.profiles.Default.Chat.textSize'), "the chat size is on the options page").toBe(14);
  expect(sizes()[0], "and Large applies at once (14 at 70%)").toBe(10);
  addon.eval('ForeverUIDB.profiles.Default.Chat.textSize = "game" FCF_SetChatWindowFontSize(nil, ChatFrame1, 18)');
  expect(sizes()[0], "set to the game's chat setting, chat keeps the size the game's menu picked").toBe(18);
  addon.slash("status");
  expect(chatHas(addon, /UI scale 1\.00 {2}· {2}text 70% {2}· {2}chat 18 \(about \d+ px on this screen\)/), "/fui status shows the UI scale, Text size and chat size").toBe(true);
  const noChat = loggedIn(UI_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { modules = { Chat = false } } }" });
  noChat.slash("status");
  expect(chatHas(noChat, /chat 12 \(about/), "with the chat module off, the status line shows the default size").toBe(true);
  const units = loggedIn(UNITS_ENV);
  expect(units.eval("local p = ForeverUI_player.name.__points.RIGHT return p.rel == ForeverUI_player.healthText and p.relPoint"), "a unit's name stops short of its health text").toBe("LEFT");
});
