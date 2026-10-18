// options: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { CLICK_LUA, DATA_ENV, RETAIL, UI_ENV, UNITS_ENV, bars, borderOf, button, calls, chatHas, isTok, key, loggedIn, marks, px, setCombat, tok, tooltip } from "./helpers.mjs";

it("options window", () => {
  const addon = loggedIn(RETAIL + CLICK_LUA + DATA_ENV + "GetSpecialization = function() return 1 end");
  addon.slash("");
  expect(addon.eval("return Vanguard_Options:IsShown()") === true, "/vg opens the options window").toBeTruthy();
  expect(addon.eval("return Vanguard_Options.reload:IsShown()") === false, "no reload button until something needs one").toBeTruthy();
  addon.eval("for _, w in ipairs(__wfgStub.frames) do if w.fill and w.__parent and w.__parent.hex and w.__scripts.OnClick then __swatches = (__swatches or 0) + 1 if __swatches == 2 then w.__scripts.OnClick(w) end end end");
  expect(addon.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.arcane[1]") === true, "the second swatch (arcane) sets the accent at once").toBeTruthy();
  expect(addon.eval('return __click("Snap to other frames")') && addon.eval("return ns.MoverOptions().snap") === false, "the snap check box turns snapping off").toBeTruthy();
  expect(addon.eval('return __click("Action bars")'), "the nav switches pages").toBeTruthy();
  expect(addon.eval('return __click("Show bar 6")') && addon.eval("return VanguardDB.profiles.Default.ActionBars.bars[6].enabled") === true, "check boxes change settings").toBeTruthy();
  expect(addon.eval("return Vanguard_Options.reload:IsShown()") === true, "a change that needs a reload shows the Reload button").toBeTruthy();
  expect(addon.eval('return __click("Visibility")') && addon.eval("return VanguardDB.profiles.Default.ActionBars.bars[1].visibility") === "mouseover", "cycle buttons step through choices").toBeTruthy();
  expect(addon.eval('return __click("Button size")') && addon.eval("return VanguardDB.profiles.Default.ActionBars.bars[1].size") === 40, "a bar's size slider starts at the shared size and steps by 2").toBeTruthy();
  addon.eval('__click("Modules")');
  // The Modules page's row for unit frames: its description, and clicking it.
  const moduleRow = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.desc and w.label.__text == "Unit frames" and w:IsVisible() then
    local desc = w.desc.__text w.__scripts.OnClick(w, "LeftButton") return desc end end`);
  expect(moduleRow, "each module has a name and a line on what it does").toMatch(/^Player, target/);
  expect(addon.eval("return ns.ModuleEnabled('UnitFrames')"), "modules can be turned off").toBe(false);
  addon.eval('__click("Profiles")');
  expect(addon.eval('return __click("Export profile")') && addon.eval("return Vanguard_TextEdit:GetText():sub(1, 4)") === "VG1:", "Export profile shows the string").toBeTruthy();
  expect(addon.eval('return __click("Use this profile for this spec")') && addon.eval("return VanguardCharDB.specProfiles[1]") === "Default", "the spec button maps this spec").toBeTruthy();
  addon.eval('ReloadUI = function() __reloaded = true end; Vanguard_Options.reload:GetScript("OnClick")(Vanguard_Options.reload)');
  expect(addon.eval("return __reloaded") === true, "Reload UI reloads").toBeTruthy();
  addon.slash("options");
  expect(addon.eval("return Vanguard_Options:IsShown()") === false, "/vg options toggles it closed").toBeTruthy();
  addon.eval('Vanguard_OnAddonCompartmentClick("Vanguard", "RightButton")');
  expect(addon.eval("return ns.Unlocked()") === true, "right-clicking the addons button toggles moving frames").toBeTruthy();
  addon.eval('Vanguard_OnAddonCompartmentClick("Vanguard", "LeftButton")');
  expect(addon.eval("return Vanguard_Options:IsShown()") === true, "left-clicking it opens the options").toBeTruthy();
});

it("options window: nav, search, controls, footer", () => {
  const addon = loggedIn(CLICK_LUA + "GetAddOnMetadata = function(_, key) return key == 'Version' and 'TEST-ONLY-9.9' or nil end");
  addon.eval('ns.Options.Show("general")');
  const nav = addon.eval(`local out = {}
    for k, b in pairs(Vanguard_Options.nav) do out[k] = { icon = b.icon.__texture, rail = b.rail:IsShown(), text = b.text:GetText() } end
    return out`);
  expect(/Icons\\NavGeneral$/.test(nav.general.icon) && /Icons\\NavHealing$/.test(nav.healing.icon), "every nav entry has its icon").toBeTruthy();
  expect(nav.general.rail === true && nav.raid.rail === false, "the current page gets the accent rail").toBeTruthy();
  expect(addon.eval("return Vanguard_Options.notice:IsShown() or Vanguard_Options.reload:IsShown()") === false, "no reload notice until something needs one").toBeTruthy();
  expect(/TEST-ONLY-9\.9/.test(addon.eval("return Vanguard_Options.version:GetText()")), "the footer shows the version").toBeTruthy();
  addon.eval('ns.Options.Search("dispel")');
  expect(addon.eval("return Vanguard_Options.nav.raid:GetAlpha()") === 1 && addon.eval("return Vanguard_Options.nav.general:GetAlpha()") === 0.35, "search dims pages without a match").toBeTruthy();
  addon.eval('Vanguard_Options.search:GetScript("OnEnterPressed")(Vanguard_Options.search)');
  expect(addon.eval("return ns.Options.current") === "raid", "Enter in the search opens the first match").toBeTruthy();
  addon.eval('ns.Options.Search("")');
  expect(addon.eval("return Vanguard_Options.nav.general:GetAlpha()") === 1, "clearing the search brings every page back").toBeTruthy();
  addon.eval('ns.Options.Show("bars")');
  const seg = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.segments and w.label:GetText() == "Numbers" then
      w.segments[2]:GetScript("OnClick")(w.segments[2]) return { value = VanguardDB.profiles.Default.DataBars.text, on = w.segments[2].fill.shown, off = w.segments[1].fill.shown } end end`);
  expect(seg.value === "always" && seg.on === true && seg.off === false, "clicking a segment picks it and lights it").toBeTruthy();
  addon.eval('ns.Options.Show("windows")');
  const dd = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.dropdown and w.label:GetText() == "Tooltip position" then
      w.dropdown:GetScript("OnClick")(w.dropdown)
      local m = Vanguard_Menu
      local shown = m:IsShown()
      m.items[2]:GetScript("OnClick")(m.items[2])
      return { shown = shown, count = #m.items, value = VanguardDB.profiles.Default.Tooltips.anchor, closed = not m:IsShown(), text = w.dropdown.text:GetText() } end end`);
  expect(dd.shown && dd.count === 3 && dd.value === "cursor" && dd.closed && dd.text === "at the cursor", "a dropdown opens a menu of its choices; picking one sets it and closes the menu").toBeTruthy();
  addon.eval('ns.Options.Show("general")');
  const slider = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.track and w.value and w.label:GetText() == "Text size" then
      w.set(0.95) w:Refresh()
      return { v = ns.Theme.Settings().textScale, text = w.value:GetText() } end end`);
  expect(Math.abs(slider.v - 0.95) < 1e-9 && slider.text === "95%", "the Text size slider sets 95% and shows the value").toBeTruthy();
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.hex then w.hex:SetText("#5aa2f0") w.hex:GetScript("OnEnterPressed")(w.hex) end end`);
  expect(addon.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.arcane[1]") === true, "typing a hex color in the accent box sets it").toBeTruthy();
  expect(addon.eval("return Vanguard_Options.notice:IsShown() and Vanguard_Options.reload:IsShown()") === true, "a reload-only change shows the notice and the Reload now button").toBeTruthy();
  const profiles = addon.eval(`ns.CreateProfile = ns.CreateProfile VanguardDB.profiles["TEST-ONLY Healer"] = {}
    local d = Vanguard_Options.profile d:GetScript("OnClick")(d)
    local texts = {} for i, b in ipairs(Vanguard_Menu.items) do if b:IsShown() then texts[#texts + 1] = b.text:GetText() end end
    Vanguard_Menu.items[2]:GetScript("OnClick")(Vanguard_Menu.items[2])
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
    Vanguard_Options.search:SetText("")
    Vanguard_Options.search:GetScript("OnTextChanged")(Vanguard_Options.search)
    local hint = Vanguard_Options.search.hint:IsShown()
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
  expect(addon.eval('ns.Options.Show("actionbars") return __click("Restyle the pet, stance, possess and extra action buttons (reload)")') === true, "the special-bars switch is on the action bar page").toBeTruthy();
  expect(addon.eval("return VanguardDB.profiles.Default.SpecialBars.skinPet") === false, "it turns pet, stance and extra bars off together").toBeTruthy();
});

// The visible profile row for a name: its caption and which buttons it has.
const profileRow = (addon, name) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do
  if w.label and type(w.label.__text) == "string" and w.label.__text:sub(1, #"${name}") == "${name}" and w.card and w:IsVisible() then
    return { w.label.__text, w.use ~= nil, w.copy ~= nil, w.delete ~= nil } end end`);

// Clicks one of a profile row's buttons.
const profileButton = (addon, name, button) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do
  if w.label and w.label.__text == "${name}" and w.card and w:IsVisible() then local b = w.${button} b:GetScript("OnClick")(b) return b.text.__text end end`);

// Runs one of a profile row's button scripts (OnEnter, OnLeave) and returns the tooltip: shown, first line.
const profileHover = (addon, name, button, script) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do
  if w.label and w.label.__text == "${name}" and w.card and w:IsVisible() then local b = w.${button} b:GetScript("${script}")(b)
    return { GameTooltip:IsShown(), (GameTooltip.__lines[1] or {}).text or false } end end`);

it("options: Delete, Copy here, Reset profile and Start over say what they lose; a reset asks and keeps a copy", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.NewProfile("TEST-ONLY Tank") ns.Profile().Chat = { background = false } ns.Options.Show("profiles")');
  expect(profileHover(addon, "TEST-ONLY Tank", "delete", "OnEnter"), "Delete's tooltip").toEqual([true, "Deletes profile TEST-ONLY Tank for every character on this account. It can't be undone."]);
  expect(profileHover(addon, "TEST-ONLY Tank", "copy", "OnEnter"), "Copy here's tooltip").toEqual([true, "Replaces every setting in profile Default with profile TEST-ONLY Tank's. It can't be undone."]);
  expect(profileHover(addon, "TEST-ONLY Tank", "copy", "OnLeave")[0], "leaving hides it").toBe(false);
  addon.eval("GameTooltip = nil");
  expect(addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.delete and w:IsVisible() then w.delete:GetScript("OnEnter")(w.delete) w.delete:GetScript("OnLeave")(w.delete) return true end end'), "a client without the tooltip shows none, without an error").toBe(true);
  addon.eval('__click("Reset profile")');
  expect(addon.eval("return Vanguard_Question.title:GetText()"), "Reset profile asks, saying what is lost and where the copy goes")
    .toBe("Reset this profile? Every setting in profile Default goes back to Vanguard's defaults, for every character that uses it. A copy is kept as profile Default backup.");
  addon.eval('Vanguard_Question.no:GetScript("OnClick")(Vanguard_Question.no)');
  expect(addon.eval("return { VanguardDB.profiles.Default.Chat.background, VanguardDB.profiles['Default backup'] == nil }"), "No changes nothing").toEqual([false, true]);
  addon.eval('__click("Reset profile") Vanguard_Question.confirm:GetScript("OnClick")(Vanguard_Question.confirm)');
  expect(addon.eval("return { VanguardDB.profiles.Default.Chat == nil, VanguardDB.profiles['Default backup'].Chat.background, Vanguard_Options.reload:IsShown() }"), "Reset backs the profile up, then resets it for the reload").toEqual([true, false, true]);
  expect(chatHas(addon, /Profile Default as it was is saved as profile Default backup\./), "and says where the copy went").toBe(true);
});

it("options: profiles in the window", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.NewProfile("TEST-ONLY Healer") ns.NewProfile("TEST-ONLY Tank") ns.Options.Show("profiles")');
  expect(profileRow(addon, "Default"), "the profile in use is marked and has no buttons").toEqual(["Default  (in use)", false, false, false]);
  expect(profileRow(addon, "TEST-ONLY Healer"), "every other profile can be used, copied here or deleted").toEqual(["TEST-ONLY Healer", true, true, true]);
  expect(profileButton(addon, "TEST-ONLY Tank", "delete"), "Delete asks first").toBe("Sure?");
  expect(addon.eval('return VanguardDB.profiles["TEST-ONLY Tank"] ~= nil'), "and deletes nothing yet").toBe(true);
  profileButton(addon, "TEST-ONLY Tank", "delete");
  expect([addon.eval('return VanguardDB.profiles["TEST-ONLY Tank"] == nil'), profileRow(addon, "TEST-ONLY Tank")], "the second click deletes it, and the page rebuilds without it").toEqual([true, null]);
  addon.eval('VanguardDB.profiles["TEST-ONLY Healer"].Chat = { background = false }');
  profileButton(addon, "TEST-ONLY Healer", "copy");
  profileButton(addon, "TEST-ONLY Healer", "copy");
  expect(addon.eval("return VanguardDB.profiles.Default.Chat.background"), "Copy here (asked twice) copies that profile's settings over this one").toBe(false);
  profileButton(addon, "TEST-ONLY Healer", "use");
  expect([addon.eval("return ns.ProfileName()"), addon.eval("return ns.SelectedProfileName()"), profileRow(addon, "TEST-ONLY Healer"), addon.eval("return Vanguard_Options.reload:IsShown()")], "Use stages the switch (it applies on reload): the profile on screen stays, the chosen one is marked and has no buttons")
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
  expect(addon.eval("return Vanguard_Options:IsShown()"), "rebuilding a page while the window is closed doesn't open it").toBe(false);
});

it("options: search jumps to the row, and the page edges fade", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.slash("");
  // Types into the search box and presses Enter.
  const search = (text) => addon.eval(`local s = Vanguard_Options.search s:SetText("${text}") s:GetScript("OnTextChanged")(s) s:GetScript("OnEnterPressed")(s)`);
  search("swing timer");
  // The current page and the found row: page key, its caption, the page's scroll, the wash shown.
  const found = () => addon.eval(`local f = Vanguard_Options.found local w for _, x in ipairs(__wfgStub.frames) do if x.found == f and f then w = x end end
    return { ns.Options.current, w and w.caption, f ~= nil and f:IsShown() }`);
  expect(found(), "Enter opens the first page that matches and marks the row").toEqual(["modules", "Swing timer", true]);
  search("town and gear");
  expect(found()[2], "a new search clears the old mark (a page title match marks no row)").toBe(false);
  search("TEST-ONLY nothing matches");
  expect(addon.eval("return ns.Options.current"), "no match: Enter stays put").toBe("town");
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
  // How many rows the open page shows (each row keeps its card and its place on the page).
  const shown = () => addon.frames("w.card ~= nil and w.pageY ~= nil and w:IsVisible()").length;
  const rows = shown();
  addon.eval("__old = {} for _, w in ipairs(__wfgStub.frames) do if w.card and w.pageY and w:IsVisible() and w.Refresh then __old[#__old + 1] = w end end");
  for (const text of ["h", "he", "hea", "heal"]) addon.eval(`ns.Options.Search("${text}")`);
  expect([reads(), addon.eval("return ns.Options.matched.profiles")], "opening the window read every page's rows once (for the nav's Changed dots), so four keystrokes read none, and still find a profile's name").toEqual([[0, 0], true]);
  addon.eval('ns.Options.RebuildPage("profiles")');
  expect([shown(), reads()], "a rebuilt page replaces its rows: the page shows as many, the profiles page read again to build it").toEqual([rows, [0, 1]]);
  const stale = addon.eval("local n = 0 for _, w in ipairs(__old) do w.Refresh = function() n = n + 1 end end ns.Options.Refresh() return { #__old > 0, n }");
  expect(stale, "the thrown-away rows are no longer refreshed").toEqual([true, 0]);
  addon.eval('ns.NewProfile("TEST-ONLY Tank") ns.Options.RebuildPage("profiles") ns.Options.Search("tank")');
  expect([shown(), addon.eval("return ns.Options.matched.profiles"), reads()], "a new profile: one more row, found by the search; only the rebuilt page is read again, once (to build it, mark its dot and search it)").toEqual([rows + 1, true, [0, 1]]);
  addon.eval('ns.Options.Search("tan")');
  expect(reads(), "the next keystroke reads nothing").toEqual([0, 0]);
  addon.eval('ns.Options.Hide() Vanguard_Options:Hide() ns.Options.Show() ns.Options.Search("tan")');
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
    local W, CC, got = ns.Widgets, ns.GetModule("ClickCast"), nil
    -- TEST-ONLY widget: a key capture, as a page would build it.
    local cap = W.KeyCapture(UIParent, "Set key", function(k) got = CC.KeyText(k) end)
    cap:GetScript("OnClick")(cap)
    cap:GetScript("OnKeyDown")(cap, "F")
    local key = got
    cap:GetScript("OnClick")(cap)
    cap:GetScript("OnKeyDown")(cap, "ESCAPE")
    local cancelled = cap.capturing == false
    cap:GetScript("OnClick")(cap)
    cap:GetScript("OnMouseWheel")(cap, -1)
    local wheel = got
    return { key = key, cancelled = cancelled, wheel = wheel }
  `);
  expect(captured.key === "F (hover)" && captured.cancelled === true, "a key is captured, and Escape cancels").toBeTruthy();
  expect(captured.wheel === "Wheel down (hover)", "the wheel is captured as a hover binding").toBeTruthy();
  expect(addon.eval('return __click("Also on your player, target and focus frames (reload)")') === true, "unit-frame click casting is a switch on the page").toBeTruthy();
  expect(addon.eval("return ns.Settings('ClickCast').unitFrames") === true, "the switch turns it on").toBeTruthy();
});

// The visible slider row whose caption starts with this text, as Lua.
const sliderRow = (text) => `(function() for _, w in ipairs(__wfgStub.frames) do
  if w.track and w.label and w.label.__text:sub(1, #"${text}") == "${text}" and w:IsVisible() then return w end end end)()`;

it("options: a frame's scale and opacity from the Layout card; a long menu scrolls", () => {
  const addon = loggedIn(UI_ENV + CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  const first = addon.eval("return ns.MoverList()[1].key");
  expect(addon.eval(`return ${sliderRow("Its scale")}.get()`), "the sliders show the first frame's scale until one is picked").toBe(1);
  addon.eval(`local r = ${sliderRow("Its scale")} r.set(1.5) r:Refresh()`);
  expect(addon.eval(`return { ns.MoverLook("${first}") }`), "the scale slider sets that frame's scale").toEqual([1.5, 1]);
  addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.dropdown and w.caption == "Frame to size" then __d = w.dropdown end end __d:GetScript("OnClick")(__d)');
  const menu = addon.eval("local n = 0 for _, b in ipairs(Vanguard_Menu.items) do if b:IsShown() then n = n + 1 end end return { n, Vanguard_Menu:GetWidth(), Vanguard_Menu:GetHeight(), ns.Widgets ~= nil }");
  const count = addon.eval('local c = __d.choices if type(c) == "function" then c = c() end return #c');
  expect(count, "every frame is a choice").toBeGreaterThan(16);
  expect(menu.slice(0, 3), "a long list shows 16 rows at a time, one column wide, each row an inline control tall").toEqual([16, 200, 16 * addon.eval("return ns.Theme.CONTROL_H") + 2]);
  addon.eval('for _ = 1, 60 do for _, b in ipairs(Vanguard_Menu.items) do if b:IsShown() and b.text:GetText() == "Minimap" then b:GetScript("OnClick")(b) return end end Vanguard_Menu:GetScript("OnMouseWheel")(Vanguard_Menu, -1) end');
  expect(addon.eval(`return ${sliderRow("Its scale")}.get()`), "picking another frame re-reads the sliders").toBe(1);
  addon.eval(`local r = ${sliderRow("Its opacity")} r.set(0.5) r:Refresh()`);
  expect(addon.eval("return { ns.MoverLook('minimap') }"), "the opacity slider sets the picked frame's opacity").toEqual([1, 0.5]);
  expect(addon.eval(`return { ${sliderRow("Its opacity")}.reset:IsShown(), ${sliderRow("Its opacity")}.value:GetText() }`), "a changed one shows the reset dot, as a percent").toEqual([true, "50%"]);
  addon.eval('__click("Reset all positions")');
  expect(addon.eval(`return { ns.MoverLook("${first}") }`).concat(addon.eval(`return ${sliderRow("Its opacity")}.get()`)), "Reset all positions puts every scale and opacity back").toEqual([1, 1, 1]);
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
  expect([addon.eval("return VanguardDB.profiles.Default.UnitFrames.healthText"), ...resetDot(addon, "Show health numbers")], "clicking it puts the default back and hides it").toEqual([true, false, true]);
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

// The visible options page's scroll view, as Lua.
const PAGE_VIEW = "(function() for _, w in ipairs(__wfgStub.frames) do if w.fadeTop and w:IsVisible() then return w end end end)()";

// The visible row whose caption is this text, as Lua.
const rowNamed = (text) => `(function() for _, w in ipairs(__wfgStub.frames) do
  if w.label and w.label.__text == "${text}" and w:IsVisible() then return w end end end)()`;

it("options: a Width the presets don't list shows its value as a dropdown; a preset stays as segments", () => {
  const preset = loggedIn(CLICK_LUA, { savedVariables: 'VanguardDB = { profiles = { Default = { RaidFrames = { width = 90 } } } }' });
  preset.eval('ns.Options.Show("raid")');
  expect(preset.eval(`local r = ${rowNamed("Width")} return { r.segments ~= nil, r.dropdown == nil }`), "90 is a preset: the four segments").toEqual([true, true]);
  const other = loggedIn(CLICK_LUA, { savedVariables: 'VanguardDB = { profiles = { Default = { RaidFrames = { width = 84 } } } }' });
  other.eval('ns.Options.Show("raid")');
  expect([other.eval(`local r = ${rowNamed("Width")} return { r.segments == nil, r.dropdown ~= nil }`), other.texts("84").length > 0], "84 isn't a preset: a dropdown, showing 84").toEqual([[true, true], true]);
});

it("options: the mouse wheel over a slider, a choice or a switch scrolls the page and never changes the value", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("actionbars")');
  // TEST-ONLY page taller than its view, so the wheel has somewhere to go.
  addon.eval(`local v = ${PAGE_VIEW} v.__height, v.__scrollChild.__height = 200, 1200`);
  // Turns the wheel over a row; returns bar 1's buttons, buttons per row and visibility, and the page's scroll.
  const wheelOver = (caption, delta) => {
    addon.wheel(addon.eval(`return ${rowNamed(caption)}.__id`), delta);
    return addon.eval(`local one = ns.Settings("ActionBars").bars[1] return { one.buttons, one.perRow, one.visibility, ${PAGE_VIEW}:GetVerticalScroll() }`);
  };
  expect(wheelOver("Buttons", -1), "down over the Buttons slider: the count stays, the page scrolls a notch (40)").toEqual([12, 12, "always", 40]);
  expect(wheelOver("Buttons per row", -1), "over Buttons per row: the same").toEqual([12, 12, "always", 80]);
  expect(wheelOver("Visibility", -1), "over a choice: the page scrolls, the choice stays").toEqual([12, 12, "always", 120]);
  expect(wheelOver("Show bar 6", -1)[3], "over a switch: the page scrolls").toBe(160);
  expect(wheelOver("Buttons", 1), "up scrolls back").toEqual([12, 12, "always", 120]);
  expect(addon.eval(`return { ${rowNamed("Buttons")}:IsMouseWheelEnabled(), ${rowNamed("Visibility")}:IsMouseWheelEnabled(), ${PAGE_VIEW}:IsMouseWheelEnabled() }`), "no value row takes the wheel; the page does").toEqual([false, false, true]);
  addon.eval(`local r = ${rowNamed("Buttons")} r:GetScript("OnClick")(r)`);
  expect(addon.eval("return ns.Settings('ActionBars').bars[1].buttons"), "a click on the caption still changes it (12 wraps to 1)").toBe(1);
});

it("options: Bar 1's Show when chips sit inside the card, inset like every other row's control", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("actionbars")');
  const fit = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.chips and w:IsVisible() then
    local first, last, card = w.chips[1], w.chips[#w.chips], w.card
    return { last.text:GetText(), card:GetRight() - last:GetRight(), first:GetLeft() - w.label:GetRight() > 8 } end end`);
  expect(fit, "Resting, the last chip, ends 12 inside the card's edge (as the other rows' controls), and the first chip clears the caption").toEqual(["Resting", 12, true]);
});

// The nav entries whose "Changed" dot shows, sorted.
const dotted = (addon) => {
  const out = addon.eval("local out = {} for k, b in pairs(Vanguard_Options.nav) do if b.changed:IsShown() then out[#out + 1] = k end end table.sort(out) return out");
  return Array.isArray(out) ? out : [];
};

it("options: a dot on the nav marks each page with changed settings, as rows change and are put back", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA, { savedVariables: "VanguardDB.profiles = { Default = { Nameplates = { width = 160 } } }" });
  addon.slash("");
  expect(dotted(addon), "on opening, only the page with a saved change (a nameplate width) is marked, though it isn't built yet").toEqual(["nameplates"]);
  expect(isTok(addon, addon.eval("return Vanguard_Options.nav.nameplates.changed.__vertexColor"), "accent"), "the dot is in the accent").toBe(true);
  addon.eval('__click("Unit frames") __click("Show health numbers")');
  expect(dotted(addon), "changing a row marks its page at once").toEqual(["nameplates", "unitframes"]);
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.reset and w.reset:IsShown() and w:IsVisible() then __dot = w.reset end end __dot:GetScript("OnClick")(__dot)`);
  expect(dotted(addon), "putting the row back with its own dot clears the page's").toEqual(["nameplates"]);
  addon.eval('__click("Nameplates") __click("Width") __click("Width")');
  expect([addon.eval("return ns.Settings('Nameplates').width"), dotted(addon)], "stepping the width back to its default clears it too").toEqual([addon.eval("return ns.GetModule('Nameplates').defaults.width"), []]);
});

// Presses a key on the options window: { the page shown, whether the key went on to the game }.
const press = (addon, k) => {
  addon.key("Vanguard_Options", k);
  return addon.eval("return { ns.Options.current, Vanguard_Options.__passed }");
};

// The keyboard's row on the options window: its caption, whether its wash shows, and whether it is inside the page's view.
const keyRow = (addon) => addon.eval(`local w, view = Vanguard_Options.focusRow
  for _, x in ipairs(__wfgStub.frames) do if x.fadeTop and x:IsVisible() then view = x end end
  if not w then return false end
  local top = view:GetVerticalScroll() or 0
  return { w.caption, w.found:IsShown(), w.pageY >= top and w.pageY + w:GetHeight() <= top + view:GetHeight() }`);

it("options: Up and Down walk the pages, Tab the rows, Enter presses one; other keys and typing go on to the game", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  // TEST-ONLY spies on the window's keyboard calls.
  addon.eval("local f = Vanguard_Options f.SetPropagateKeyboardInput = function(self, v) self.__passed = v end f.EnableKeyboard = function(self, on) self.__kb = on end f:Hide() ns.Options.Show('general')");
  const order = addon.eval("local list = {} for _, p in ipairs(ns.Options.PAGES) do list[#list + 1] = p end table.sort(list, function(a, b) return (a.order or 70) < (b.order or 70) end) local out = {} for i, p in ipairs(list) do out[i] = p.key end return out");
  expect([order[0], addon.eval("return Vanguard_Options.__kb")], "General is first, and the open window takes the keyboard").toEqual(["general", true]);
  expect(press(addon, "DOWN"), "Down opens the next page, and the key stops there").toEqual([order[1], false]);
  expect(press(addon, "UP")[0], "Up goes back").toBe("general");
  expect(press(addon, "UP")[0], "and from the first page wraps to the last").toBe(order[order.length - 1]);
  press(addon, "DOWN");
  expect(press(addon, "W"), "a key it doesn't use goes on to the game: you can still walk").toEqual(["general", true]);
  expect(press(addon, "SPACE")[1], "so do Space and Enter until a row has the keyboard").toBe(true);
  press(addon, "TAB");
  expect(keyRow(addon), "Tab marks the first row that does something (the sample and the swatches are skipped)").toEqual(["Safer colours (reload)", true, true]);
  press(addon, "TAB");
  expect(keyRow(addon)[0], "Tab again: the next").toBe("Follow the game's colour-blind mode (reload)");
  press(addon, "TAB");
  expect(keyRow(addon)[0], "and the next after it").toBe("Font");
  addon.keys({ shift: true });
  press(addon, "TAB");
  press(addon, "TAB");
  press(addon, "TAB");
  addon.keys({ shift: false });
  const last = keyRow(addon);
  expect([last[0], last[2], addon.eval("return Vanguard_Options.found:IsShown()")], "Shift-Tab goes back, and past the first wraps to the last row, scrolled into view").toEqual([addon.eval("local rows = {} for _, w in ipairs(__wfgStub.frames) do if w.card and w:IsVisible() and w:GetObjectType() == 'Button' then rows[#rows + 1] = w end end table.sort(rows, function(a, b) return a.pageY < b.pageY end) return rows[#rows].caption"), true, true]);
  press(addon, "TAB");
  expect(keyRow(addon), "and Tab from the last wraps to the first, scrolled back up").toEqual(["Safer colours (reload)", true, true]);
  press(addon, "TAB");
  press(addon, "TAB");
  const font = addon.eval("return ns.Theme.Settings().font");
  expect([press(addon, "ENTER")[1], addon.eval("return ns.Theme.Settings().font") !== font], "Enter presses the row (it steps the font), and stops there").toEqual([false, true]);
  addon.eval("GetCurrentKeyBoardFocus = function() return Vanguard_Options.search end");
  expect(press(addon, "DOWN"), "while you type in the search (or any box), every key is yours").toEqual(["general", true]);
  addon.eval("GetCurrentKeyBoardFocus = nil");
  press(addon, "DOWN");
  expect(keyRow(addon), "a new page starts without a keyboard row").toBe(false);
  addon.eval("GetCurrentKeyBoardFocus = function() return Vanguard_Options.search end");
  press(addon, "ESCAPE");
  expect(addon.eval("return Vanguard_Options:IsShown()"), "Escape in a box leaves the window open (the box clears first)").toBe(true);
  addon.eval("GetCurrentKeyBoardFocus = nil");
  press(addon, "ESCAPE");
  expect(addon.eval("return Vanguard_Options:IsShown()"), "Escape with no box typing closes the window").toBe(false);
  addon.eval("ns.Options.Show('general')");
  addon.eval('ns.Options.current = "nowhere"');
  expect(press(addon, "TAB"), "a page with no rows (none built): Tab has nothing to mark").toEqual(["nowhere", false]);
  addon.eval("ns.Options.Show('general')");
  addon.world.combat(true);
  addon.eval("Vanguard_Options.__passed = 'TEST-ONLY unset'");
  expect([addon.eval("return Vanguard_Options.__kb"), press(addon, "W")[1]], "a fight takes the keyboard back (keys can't be passed on in combat)").toEqual([false, "TEST-ONLY unset"]);
  addon.eval("ns.Options.Show('bars')");
  expect(addon.eval("return Vanguard_Options.__kb"), "and opening a page in combat doesn't take it").toBe(false);
  setCombat(addon, false);
  expect(addon.eval("return Vanguard_Options.__kb"), "after the fight the open window has it again").toBe(true);
  addon.eval("Vanguard_Options:Hide()");
  expect(addon.eval("return Vanguard_Options.__kb"), "closed, it takes no keys at all").toBe(false);
  setCombat(addon, true);
  setCombat(addon, false);
  expect(addon.eval("return Vanguard_Options.__kb"), "and a fight ending while it is closed doesn't change that").toBe(false);
});

// The focus ring on a row: { shown, the ring's colour, its and the gap's top-left x } (false if it never had one).
const ringOf = (addon, row) => addon.eval(`local f = ns.Theme.FocusParts(${row})
  if not f then return false end
  return { f.ring.top:IsShown(), f.ring.top.__vertexColor, f.ring.top.__points.TOPLEFT.x, f.gap.top.__points.TOPLEFT.x, f.gap.top.__vertexColor }`);

it("options: the keyboard's row wears a focus ring (accentText, outside a black gap) that moves with Tab (#257)", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general") TEST_Rows = {}');
  addon.key("Vanguard_Options", "TAB");
  addon.eval("TEST_Rows[1] = Vanguard_Options.focusRow");
  const [shown, colour, x, gapX, gap] = ringOf(addon, "TEST_Rows[1]");
  expect([shown, isTok(addon, colour, "accentText"), x, isTok(addon, gap, "edge"), gapX], "shown on the row: the ring 2 px out, the black gap 1 px out").toEqual([true, true, -2 * px(addon, 1), true, -px(addon, 1)]);
  addon.key("Vanguard_Options", "TAB");
  addon.eval("TEST_Rows[2] = Vanguard_Options.focusRow");
  expect([ringOf(addon, "TEST_Rows[1]")[0], ringOf(addon, "TEST_Rows[2]")[0]], "Tab moves it to the next row").toEqual([false, true]);
  addon.key("Vanguard_Options", "DOWN");
  expect(ringOf(addon, "TEST_Rows[2]")[0], "a new page drops it").toBe(false);
  addon.eval('ns.Options.Show("general")');
  addon.key("Vanguard_Options", "TAB");
  addon.eval("TEST_Rows[3] = Vanguard_Options.focusRow Vanguard_Options:Hide()");
  expect(ringOf(addon, "TEST_Rows[3]")[0], "and so does closing the window").toBe(false);
  addon.eval("ns.Theme.FocusRing(UIParent, false)");
  expect(ringOf(addon, "UIParent"), "hiding a ring a frame never had makes none").toBe(false);
});

it("options: the General page's sample unit frame and button follow the accent, font, text size and bar texture as they change", () => {
  const addon = loggedIn(CLICK_LUA + `LibStub("LibSharedMedia-3.0"):Register("statusbar", "TEST-ONLY Bar", [[Interface\\AddOns\\TestOnly\\Bar]])`);
  addon.eval('ns.Options.Show("general")');
  // The sample: bar textures, the name's font and size, the glow's color, and its texts.
  const sample = () => addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.unit and w.button and w:IsVisible() then
    local u, b = w.unit, w.button local font, size = u.name:GetFont()
    return { u.health:GetStatusBarTexture():GetTexture(), u.power:GetStatusBarTexture():GetTexture(), font, size, b.glow[1].__vertexColor, b.glow[1]:IsShown(),
      u.name:GetText(), u.value:GetText(), b.hotkey:GetText(), b.count:GetText() } end end`);
  const first = sample();
  expect([first[0], first[1], first[3], first.slice(5)], "a unit frame with the Vanguard bars, the player's own name at 12, and a button with its key, count and glow")
    .toEqual(["Interface\\AddOns\\Vanguard\\Media\\Textures\\Bar", "Interface\\AddOns\\Vanguard\\Media\\Textures\\Bar", 12, [true, "Tester", "72%", "1", "5"]]);
  expect(isTok(addon, first[4], "accent"), "the glow is in the accent").toBe(true);
  addon.eval("ns.Theme.SetAccent(ns.Theme.PRESETS.jade[1], ns.Theme.PRESETS.jade[2], ns.Theme.PRESETS.jade[3])");
  expect(sample()[4].slice(0, 3), "a new accent shows at once").toEqual(addon.eval("return ns.Theme.PRESETS.jade").slice(0, 3));
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.track and w.label and w.label.__text == "Text size" and w:IsVisible() then w.set(1.3) w:Refresh() end end`);
  expect(sample()[3], "so does the text size (12 at 130%)").toBe(16);
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.dropdown and w.caption == "Font" and w:IsVisible() then w.dropdown.set("client") end end`);
  expect(sample()[2], "and the font").toBe(addon.eval("return STANDARD_TEXT_FONT or 'Fonts\\\\FRIZQT__.TTF'"));
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.dropdown and w.caption == "Bar texture" and w:IsVisible() then w.dropdown.set("TEST-ONLY Bar") end end`);
  expect([sample().slice(0, 2), addon.eval("return Vanguard_Options.reload:IsShown()")], "a bar texture shared through LibSharedMedia shows on the sample at once (the HUD takes it on reload)")
    .toEqual([["Interface\\AddOns\\TestOnly\\Bar", "Interface\\AddOns\\TestOnly\\Bar"], true]);
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
  expect(sizes()[0], "the game's own chat size menu can't undo Vanguard's size").toBe(8);
  addon.slash("");
  addon.eval('ns.Options.Show("chat")');
  expect(addon.eval('return __click("Chat text size") and VanguardDB.profiles.Default.Chat.textSize'), "the chat size is on the options page").toBe(14);
  expect(sizes()[0], "and Large applies at once (14 at 70%)").toBe(10);
  addon.eval('VanguardDB.profiles.Default.Chat.textSize = "game" FCF_SetChatWindowFontSize(nil, ChatFrame1, 18)');
  expect(sizes()[0], "set to the game's chat setting, chat keeps the size the game's menu picked").toBe(18);
  addon.slash("status");
  expect(chatHas(addon, /UI scale 1\.00 {2}· {2}text 70% {2}· {2}chat 18 \(about \d+ px on this screen\)/), "/vg status shows the UI scale, Text size and chat size").toBe(true);
  const noChat = loggedIn(UI_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Chat = false } } }" });
  noChat.slash("status");
  expect(chatHas(noChat, /chat 12 \(about/), "with the chat module off, the status line shows the default size").toBe(true);
  const units = loggedIn(UNITS_ENV);
  expect(units.eval("local p = Vanguard_player.name.__points.RIGHT return p.rel == Vanguard_player.healthText and p.relPoint"), "a unit's name stops short of its health text").toBe("LEFT");
});

// TEST-ONLY: the Healing page's buff list editor (its box and Save), or nil.
const BUFF_EDITOR = "for _, w in ipairs(__wfgStub.frames) do if w.input and w.save and w:IsVisible() then __editor = w end end";

it("options: the Healing page opens and saves its buff list with the raid heals module switched off", () => {
  const addon = loggedIn("", { savedVariables: "VanguardDB.profiles.Default = { modules = { RaidHealing = false } }" });
  addon.eval('ns.Options.Show("healing")');
  addon.eval(BUFF_EDITOR);
  expect(addon.eval("return __editor.input:GetText()"), "the buff list shows the mage's usual buffs").toBe("Arcane Intellect, Arcane Brilliance");
  addon.eval('__editor.input:SetText("TEST-ONLY Aura") __editor.save:GetScript("OnClick")(__editor.save)');
  expect([addon.eval("return VanguardDB.profiles.Default.RaidHealing.buffs"), addon.eval("__editor:Refresh() return __editor.input:GetText()")], "Save keeps the typed list").toEqual(["TEST-ONLY Aura", "TEST-ONLY Aura"]);
});

it("options: a switch for each group of game windows, under Game windows", () => {
  const addon = loggedIn(UI_ENV + CLICK_LUA);
  addon.slash("");
  addon.eval('ns.Options.Show("windows")');
  const groups = { social: "Mail, guild, channels, friends and guild-creation windows (reload)", town: "Stable, trainer, merchant, bags, loot and item dialogs (reload)",
    system: "Game options, Edit Mode, keybinding and help windows (reload)", map: "World map, group finder, calendar and Legacy windows (reload)",
    menus: "Right-click menus, dropdowns and more tooltips (reload)", tabs: "Tab buttons and the inside of the character pane (reload)", pvp: "Battleground windows (reload)" };
  for (const [key, label] of Object.entries(groups)) {
    addon.eval(`__click(${JSON.stringify(label)})`);
    expect(addon.eval(`return VanguardDB.profiles.Default.Windows.${key}`), `${key} switches off from its row`).toBe(false);
  }
});

it("bags: the item skin is shared with other windows, once per button", () => {
  const addon = loggedIn();
  const out = addon.eval(`
    local b = CreateFrame("Button", nil, UIParent) b.icon = b:CreateTexture()
    local skin = ns.GetModule("Bags").SkinItem
    skin(b) local n = ns.Theme.PaintedCount() skin(b)
    return { ns.FrameState('vgSkinned')[b], ns.Theme.PaintedCount() == n, b.icon.__texCoord ~= nil }`);
  expect(out).toEqual([true, true, true]);
});

// The font string with the given text (the first one), as the stub keeps it.
const FIND_LUA = `function __fontString(text)
  for _, w in ipairs(__wfgStub.frames) do
    if w.__kind == "FontString" and type(w.__text) == "string" and w.__text:sub(1, #text) == text then return w end
  end
end`;

it("a note row wraps to its card and the row grows to fit; a dropdown's choice stays on one line, cut at the arrow", () => {
  const addon = loggedIn(FIND_LUA);
  addon.slash("");
  addon.eval('ns.Options.Show("feedback")');
  const note = addon.eval(`local fs = __fontString("A bug or an idea?")
    return { fs.__width, fs:GetStringHeight(), fs.__points.TOPLEFT.y, __fontString("Report a bug").__parent.__points.TOPLEFT.y, fs:GetParent():GetWidth(), fs.__points.TOPLEFT.x }`);
  expect(note.slice(4), "the card is 568 wide (the page is 12 in from the nav, its thumb 12 out and 12 in from the edge), the note starts 12 in").toEqual([568, 12]);
  expect(note[0], "the note is as wide as the card's inside: the card's 12 of padding kept on both sides").toBe(note[4] - 2 * 12);
  expect(note[1] > 20 && note[3] <= note[2] - note[1] - 6, "its text wraps to more than one line, and the next row starts under all of it").toBe(true);
  addon.eval('ns.Options.Show("town")');
  const choice = addon.eval(`local fs = __fontString("group role, else damage")
    return { fs.__noWrap, fs.__points.LEFT ~= nil, fs.__points.RIGHT and fs.__points.RIGHT.rel == fs.__parent.arrow }`);
  expect(choice, "the chosen role is one line between the box's edge and its arrow").toEqual([true, true, true]);
});

it("options: the scroll thumb drags its page, and the copy box opens above the window", () => {
  const addon = loggedIn();
  addon.eval('ns.Options.Show("general")');
  const out = addon.eval(`
    local view
    for _, w in ipairs(__wfgStub.frames) do if w.__scrollChild and w.__scripts.OnMouseWheel and w:IsVisible() then view = w end end
    -- TEST-ONLY page taller than its view: the thumb is 24 tall and travels 76.
    view.__height, view.__scrollChild.__height = 100, 800
    view:GetScript("OnMouseWheel")(view, 0)
    local grip, y = view.grip, 500
    GetCursorPosition = function() return 0, y end
    grip:GetScript("OnMouseDown")(grip, "LeftButton")
    y = 500 - 38 * Vanguard_Options:GetEffectiveScale()
    __wfgStub.update(0.05)
    local dragged = view:GetVerticalScroll()
    grip:GetScript("OnMouseUp")(grip, "LeftButton")
    y = 0 __wfgStub.update(0.05)
    ns.ShowText("TEST-ONLY", "TEST-ONLY")
    return { grip:IsShown(), dragged, view:GetVerticalScroll(), Vanguard_TextDialog.__strata, Vanguard_Options.__strata }`);
  expect(out, "dragging the thumb half its travel scrolls half the page and stops when let go; the copy box is a layer above the window").toEqual([true, 350, 350, "FULLSCREEN_DIALOG", "DIALOG"]);
});

it("options: the pages, their nav order and each page's row count stay as they were when Options.lua was split into area files", () => {
  const addon = loggedIn(CLICK_LUA);
  // Every page in ns.Options.PAGES order: key, title, nav order and how many rows it builds.
  const pages = addon.eval("local out = {} for i, p in ipairs(ns.Options.PAGES) do out[i] = p.key .. '|' .. p.title .. '|' .. p.order .. '|' .. #p.rows() end return out");
  // Adding or removing a row (or a module, which adds a row under Modules) changes these counts on purpose.
  expect(pages, "the page list and each page's row count (a new row is one more on its page)").toEqual([
    "general|General|10|39", "modules|Modules|20|78", "unitframes|Unit frames|30|29", "raid|Raid frames|40|25",
    "actionbars|Action bars|60|73", "quests|Quests|70|30", "bars|Bars and bags|80|17", "map|Map|81|36", "chat|Chat|82|69", "windows|Game windows|83|46", "cooldowns|Cooldowns|83.5|13", "tools|Combat tools|84|34", "town|Town and gear|85|54", "profiles|Profiles|90|22",
    "feedback|Feedback|100|7", "healing|Healing|45|44", "talents|Talents|47|7", "nameplates|Nameplates|65|15",
    "situations|Situations|86|17", "clickcast|Click casting|46|11",
  ]);
  addon.eval('ns.Options.Show("general")');
  // The nav entries top to bottom, by each one's offset from the top of the nav.
  const nav = addon.eval("local list = {} for k, b in pairs(Vanguard_Options.nav) do local _, _, _, _, y = b:GetPoint() list[#list + 1] = { k, y } end table.sort(list, function(a, b) return a[2] > b[2] end) local out = {} for i, e in ipairs(list) do out[i] = e[1] end return out");
  expect(nav, "the nav lists the pages in the same order").toEqual([
    "general", "modules", "unitframes", "raid", "healing", "clickcast", "talents", "actionbars",
    "nameplates", "quests", "bars", "map", "chat", "windows", "cooldowns", "tools", "town", "situations", "profiles", "feedback",
  ]);
});

it("options: every nav entry fits inside the nav, however many pages there are", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  // The foot of the lowest nav entry and the shortest entry, in px (the nav is 512 px tall: the window's 600 less its 48 header and 40 footer).
  const fit = addon.eval(`local foot, least = 0, 99 for _, b in pairs(Vanguard_Options.nav) do local _, _, _, _, y = b:GetPoint()
    foot, least = math.max(foot, -y + b:GetHeight()), math.min(least, b:GetHeight()) end return { foot, least }`);
  expect(fit[0] <= 512 && fit[1] >= 24, "the last entry ends above the nav's foot and no entry is squeezed under 24 px").toBe(true);
});

it("slider values show rounded, never as float noise", () => {
  const addon = loggedIn();
  // The text a slider shows for v at the given step.
  const text = (step, v) => addon.eval(`local s = ns.Widgets.Slider(UIParent, "t", { min = 0, max = 1200, step = ${step} }, function() return ${v} end, function() end) return s.value:GetText()`);
  expect(text(2, 210.00007629395)).toBe("210");
  expect(text(1, 35.999524536133)).toBe("36");
  expect(text(0.05, 0.55)).toBe("0.55");
});

it("switches wrap a long caption left of the track and react to the mouse", () => {
  const addon = loggedIn();
  addon.eval(`local on = false
    __sw = ns.Widgets.Check(UIParent, "A caption", function() return on end, function(v) on = v end, 300)`);
  expect(addon.eval("return __sw.label:GetWidth()"), "the caption stops short of the 36 px track").toBe(300 - 36 - 24);
  // Runs one of the row's mouse scripts and returns whether it is hot and pressed.
  const knob = (event) => addon.eval(`__sw.__scripts.${event}(__sw) return { __sw.hot == true, __sw.pressed == true }`);
  expect(knob("OnEnter"), "the mouse over the row marks it hot").toEqual([true, false]);
  expect(knob("OnMouseDown"), "pressing marks it pressed").toEqual([true, true]);
  expect(knob("OnMouseUp"), "letting go clears the press").toEqual([true, false]);
  expect(knob("OnLeave"), "leaving clears the hot mark").toEqual([false, false]);
  const parts = addon.eval(`local s = __sw
    local function p(t) local layer, sub = t:GetDrawLayer() return { layer, sub, (t.__texture or ""):match("[^\\\\]+$"), t:GetParent() == s.track } end
    return { p(s.trackArt[1]), p(s.fill), p(s.outline[1]), p(s.knob), p(s.shade) }`);
  expect(parts, "the pill, its fill and its outline on the track in layer order; the knob and its shade above the outline, in that order")
    .toEqual([["BORDER", 0, "Pill", true], ["ARTWORK", 0, "Pill", true], ["OVERLAY", 0, "PillLine", true], ["OVERLAY", 1, "Knob", true], ["OVERLAY", 2, "KnobShade", true]]);
  // Where the knob and its shade sit (the one anchor each has), and whether the fill shows.
  const place = () => addon.eval("local k, s = __sw.knob.__points, __sw.shade.__points local kp, sp = next(k), next(s) return { kp, k[kp].x, sp, s[sp].x, __sw.fill:IsShown() }");
  expect(place(), "off: the knob and its shade at the track's left, no fill").toEqual(["LEFT", 2, "LEFT", 2, false]);
  addon.eval("__sw.__scripts.OnClick(__sw)");
  expect(place(), "on: the glide has only begun, both still at the left, the fill shown").toEqual(["LEFT", 2, "LEFT", 2, true]);
  addon.advance(0.2, 0.05);
  expect(place(), "on, once the glide is done: both at the right end (36 - 14 - 2 in)").toEqual(["LEFT", 20, "LEFT", 20, true]);
});

it("the switch knob and the slider thumb glide for 0.1 s, and move at once with Reduce motion, in combat and while dragging", () => {
  const addon = loggedIn();
  addon.eval(`local on, v = false, 0
    __sw = ns.Widgets.Check(UIParent, "A", function() return on end, function(x) on = x end, 300)
    __sl = ns.Widgets.Slider(UIParent, "S", { min = 0, max = 10, step = 1 }, function() return v end, function(x) v = x end)
    __sl.track:SetWidth(100)
    __sl:Refresh()`);
  // Where the switch knob and the slider thumb are now.
  const knobX = () => addon.eval("return __sw.knob.__points.LEFT.x");
  // The thumb's centre along the track.
  const thumbX = () => addon.eval("return __sl.thumb.__points.CENTER.x");
  addon.eval("__sw.__scripts.OnClick(__sw)");
  addon.advance(0.05, 0.05);
  const mid = knobX();
  expect(mid > 2 && mid < 20, "half way through the glide the knob is between its spots").toBe(true);
  addon.advance(0.2, 0.05);
  expect(knobX(), "and it lands on the on spot").toBe(20);
  addon.eval("ns.Theme.Settings().reduceMotion = true __sw.__scripts.OnClick(__sw)");
  expect(knobX(), "Reduce motion: the knob is back at once").toBe(2);
  addon.eval("ns.Theme.Settings().reduceMotion = false ns.InCombat = function() return true end __sw.__scripts.OnClick(__sw)");
  expect(knobX(), "in combat: at once").toBe(20);
  addon.eval("ns.InCombat = function() return false end __sl.set(10) __sl:Refresh()");
  addon.advance(0.05, 0.05);
  expect(thumbX() > 0 && thumbX() < 100, "a stepped slider thumb glides").toBe(true);
  addon.advance(0.2, 0.05);
  expect(thumbX(), "and lands on its value").toBe(100);
  addon.eval("__sl.dragging = true __sl.set(0) __sl:Refresh()");
  expect(thumbX(), "while dragging the thumb follows the cursor at once").toBe(0);
});

it("sliders: the pill track, the fill on the same frame under the thumb, the thumb's shade and outline, and tracks that follow a theme change", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval(`ns.Options.Show("general")
    for _, w in ipairs(__wfgStub.frames) do
      if w.track and w.min and w.label and w.label.__text == "Text size" then __sl = w end
      if w.knob and w.get and w:IsVisible() then __swRow = w end
    end
    function __part(t) local layer, sub = t:GetDrawLayer() return { layer, sub, (t.__texture or ""):match("[^\\\\]+$"), t:GetParent() == __sl.track } end
    function __r3(x) return math.floor(x * 1000 + 0.5) / 1000 end`);
  const parts = addon.eval("return { __part(__sl.trackArt[2]), __part(__sl.fillParts[2]), __part(__sl.outline[2]), __part(__sl.thumb), __part(__sl.thumbShade), __part(__sl.thumbLine) }");
  expect(parts, "pill, fill and outline on the track frame in layer order; the thumb, its shade and its outline above the track's outline in that order, so the fill never covers the thumb")
    .toEqual([["BORDER", 0, "Pill", true], ["ARTWORK", 0, "Pill", true], ["OVERLAY", 0, "SliderLine", true], ["OVERLAY", 1, "Knob", true], ["OVERLAY", 2, "KnobShade", true], ["OVERLAY", 3, "KnobLine", true]]);
  expect(addon.eval("local p = __sl.fillParts return { p[1].__texCoord, p[2].__texCoord, p[3].__texCoord }"), "a pill's three parts cut the capsule at its round ends").toEqual([[0, 0.25, 0, 1], [0.25, 0.75, 0, 1], [0.75, 1, 0, 1]]);
  // The fill at a value: shown, the width of its two round ends, its right end's left edge, and the thumb's and its outline's centre.
  // The thumb glides for 0.1 s (8.10), so the clock runs past the glide before the read.
  const fill = (v) => {
    addon.eval(`__sl.set(${v}) __sl:Refresh()`);
    addon.advance(0.2, 0.05);
    return addon.eval(`local p = __sl.fillParts
    return { p[1]:IsShown(), __r3(p[1]:GetWidth()), __r3(p[3]:GetWidth()), __r3(p[3].__points.TOPLEFT.x), __r3(__sl.thumb.__points.CENTER.x), __r3(__sl.thumbLine.__points.CENTER.x) }`);
  };
  expect(fill("__sl.max"), "at the top: the fill spans the track, its right end 4 in from the end, the thumb and its outline centred on the end").toEqual([true, 4, 4, 128, 132, 132]);
  expect(fill("__sl.min + (4 / 132) * (__sl.max - __sl.min)"), "a fill 4 wide: both ends narrow to 2, so neither crosses the other").toEqual([true, 2, 2, 2, 4, 4]);
  expect(fill("__sl.min"), "at the bottom: the fill hides under the thumb at the left end").toEqual([false, 0.5, 0.5, -0.5, 0, 0]);
  // Whether a texture is tinted the token's colour as the theme has it now.
  const tinted = (t, token) => addon.eval(`local c = ${t}.__vertexColor local r, g, b = ns.Theme.RGB("${token}") return c[1] == r and c[2] == g and c[3] == b`);
  expect([tinted("__sl.fillParts[1]", "borderHi"), tinted("__sl.fillParts[2]", "borderHi"), tinted("__sl.fillParts[3]", "borderHi"), tinted("__sl.thumb", "white")],
    "the fill is the quiet grey under a white thumb, not the accent (Cliff's pick 5a)").toEqual([true, true, true, true]);
  addon.eval('ns.Theme.Settings().variant = "midnight" ns.Theme.Refresh()');
  expect([tinted("__sl.trackArt[1]", "inset"), tinted("__sl.outline[1]", "borderHi"), tinted("__swRow.trackArt[1]", "inset"), tinted("__swRow.outline[1]", "borderHi")], "a theme variant change retints the slider's and the switch's track and outline with the page").toEqual([true, true, true, true]);
});

it("options: the Theme variant and Corners choices list every variant in T.VARIANT_ORDER and both corner styles, so a new look can't be left off the page", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  // Clicks a cycle row n times and returns the setting it set after each click.
  const cycle = (caption, key, n) => Array.from({ length: n }, () => (addon.eval(`__click("${caption}") return ns.Theme.Settings().${key}`)));
  const order = addon.eval("return ns.Theme.VARIANT_ORDER");
  expect(cycle("Theme variant", "variant", order.length), "one click per variant goes round every one, back to the default").toEqual([...order.slice(1), order[0]]);
  expect(cycle("Corners", "corners", 2), "corners cycle rounded then square").toEqual(["rounded", "square"]);
});

it("options: choice segments are as wide as their labels and follow the text size, and the selected one draws no shadow under its dark text", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  // Each segment of the Corners row: its width, its label's width, its left edge and its text's shadow alpha.
  const segments = () => addon.eval(`local r = ${rowNamed("Corners")} local out = {}
    for i, s in ipairs(r.segments) do out[i] = { width = s:GetWidth(), label = s.text:GetStringWidth(), left = s:GetLeft(), shadow = s.text.__shadowColor[4] } end return out`);
  const before = segments();
  expect(before.map((s) => s.width >= s.label + 16), "8 px of air each side of every label").toEqual([true, true]);
  expect(before[0].left + before[0].width <= before[1].left + 1, "the segments sit side by side, overlapping only the shared 1 px edge").toBe(true);
  expect(before.map((s) => s.shadow), "Square (selected, dark text on the accent) has no shadow; Rounded keeps the theme's").toEqual([0, 0.9]);
  // The harness measures text at one size, so a longer label stands in for a larger text size.
  addon.eval(`local r = ${rowNamed("Corners")} r.segments[2].text:SetText("Rounded corners") ns.Theme.Refresh()`);
  const after = segments();
  expect(after.map((s, i) => s.width >= before[i].width && s.width >= s.label + 16), "a theme refresh re-measures: the segments grow with their labels").toEqual([true, true]);
  expect(after[1].width > before[1].width && after[0].left + after[0].width <= after[1].left + 1, "and still don't overlap").toBe(true);
  addon.eval('__click("Corners")');
  expect(segments().map((s) => s.shadow), "Rounded selected: the shadow moves with the selection").toEqual([0.9, 0]);
});

// A control's height and width, and (when it has a label or text) its font size and text colour.
const CONTROL_LUA = `function __size(w, fs) local size = false if fs then size = select(2, fs:GetFont()) end return { w:GetHeight(), w:GetWidth(), size, fs and fs.__textColor or false } end`;

it("controls: inline controls are T.CONTROL_H tall and buttons T.BUTTON_H, 120 wide by default; segment labels use the label role", () => {
  const addon = loggedIn(CONTROL_LUA);
  const [controlH, buttonH] = addon.eval("return { ns.Theme.CONTROL_H, ns.Theme.BUTTON_H }");
  expect([controlH, buttonH], "the two heights of the scale").toEqual([20, 26]);
  const sizes = addon.eval(`local W = ns.Widgets local get = function() return "a" end
    local out = { input = __size(W.Input(UIParent)), search = __size(W.Search(UIParent, 200, "Find", function() end)), dropdown = __size(W.Dropdown(UIParent, { { "a", "A" } }, get, print)) }
    out.button, out.primary, out.dialog = __size(W.Button(UIParent, "Go", print)), __size(W.Primary(UIParent, "Go", print)), __size(ns.DialogButton(UIParent, "Go"))
    out.wide = __size(W.Button(UIParent, "Go", print, 60))
    local r = W.Choice(UIParent, "Pick", { { "a", "A" }, { "b", "B" } }, get, print)
    out.segment = __size(r.segments[1], r.segments[1].text)
    r.dropdown = W.Dropdown(r, { { "a", "A" } }, get, print) r.dropdown:GetScript("OnClick")(r.dropdown)
    out.menuItem = __size(Vanguard_Menu.items[1])
    return out`);
  expect([sizes.input[0], sizes.search[0], sizes.dropdown[0], sizes.segment[0], sizes.menuItem[0]], "an input, a search box, a dropdown, a segment and a menu item are inline controls").toEqual([controlH, controlH, controlH, controlH, controlH]);
  expect([sizes.button, sizes.primary, sizes.dialog].map((s) => s.slice(0, 2)), "W.Button, W.Primary and ns.DialogButton are standalone buttons, 120 wide unless told otherwise").toEqual([[buttonH, 120], [buttonH, 120], [buttonH, 120]]);
  expect(sizes.wide.slice(0, 2), "a width given wins").toEqual([buttonH, 60]);
  expect([sizes.input[1], sizes.search[1], sizes.dropdown[1]], "the inline controls keep their own default widths").toEqual([220, 200, 200]);
  expect(sizes.segment[2], "a segment's label is the label role (12), like every other button's").toBe(12);
});

it("controls: a segment row too narrow for its caption packs its segments tighter and keeps them clear of the caption; a wide row keeps the usual widths", () => {
  const addon = loggedIn();
  // The widest segment, and the room the segments take plus the caption, for a row of that width (units).
  const measure = (width) => addon.eval(`local r = ns.Widgets.Choice(UIParent, "Undercut by", { { "c", "1c" }, { "s", "1s" }, { "p", "1%" }, { "m", "Match" } }, function() return "c" end, print, ${width})
    local used = 8 for _, s in ipairs(r.segments) do used = used + s:GetWidth() + ns.Theme.SPACE.tight end
    return { r.segments[1]:GetWidth(), used + r.label:GetStringWidth() + 8 }`);
  const [wideSegment] = measure(400);
  const [narrowSegment, narrowTotal] = measure(240);
  expect(wideSegment, "room to spare: the usual 44 minimum").toBeGreaterThanOrEqual(44);
  expect(narrowSegment, "cramped: below the minimum").toBeLessThan(44);
  expect(narrowTotal, "and the caption and the segments fit the row").toBeLessThanOrEqual(240);
});

it("controls: a primary's accent fill and a selected segment's follow rounded corners, in seven parts; only the chosen segment shows one", () => {
  const addon = loggedIn();
  // How many of a fill's textures there are and how many show.
  const parts = (lua) => addon.eval(`local fill = ${lua} local shown = 0 for _, t in ipairs(fill.textures) do if t:IsShown() then shown = shown + 1 end end return { #fill.textures, shown }`);
  addon.eval(`__p = ns.Widgets.Primary(UIParent, "Go", print) __p:SetSize(120, ns.Theme.BUTTON_H)
    __value = "a" __r = ns.Widgets.Choice(UIParent, "Pick", { { "a", "A" }, { "b", "B" } }, function() return __value end, function(v) __value = v end)`);
  expect([parts("__p.fill"), parts("__r.segments[1].fill"), parts("__r.segments[2].fill")], "square: one texture each, shown on the primary and the chosen segment only").toEqual([[1, 1], [1, 1], [1, 0]]);
  expect(isTok(addon, addon.eval("return __p.fill.bg.__vertexColor"), "accent") && isTok(addon, addon.eval("return __p.text.__textColor"), "void"), "the primary's fill is the accent, its label dark").toBe(true);
  addon.eval('ns.Theme.Settings().corners = "rounded" ns.Theme.Refresh()');
  const r = addon.eval("return ns.Theme.CORNER_RADIUS * ns.Theme.Pixel(__p)");
  expect([parts("__p.fill"), parts("__r.segments[1].fill"), parts("__r.segments[2].fill")], "rounded: a centre, two strips and four discs, all shown on the primary and the chosen segment, none on the other").toEqual([[7, 7], [7, 7], [7, 0]]);
  expect(addon.eval("local p = __p.fill.bg.__points return { p.TOPLEFT.x + 0, p.BOTTOMRIGHT.x + 0, __p.fill.roundFill.TOPLEFT:GetWidth() }"), "the primary's centre is pulled in r on each side, with an r disc in each corner").toEqual([r, -r, r]);
  expect(addon.eval("local out = {} for i, t in ipairs(__r.segments[1].fill.textures) do out[i] = t.__vertexColor end return out").every((c) => isTok(addon, c, "accent")), "every part of the chosen segment's fill is the accent").toBe(true);
  addon.eval('__r.segments[2]:GetScript("OnClick")(__r.segments[2])');
  expect([parts("__r.segments[1].fill"), parts("__r.segments[2].fill"), addon.eval("return __value")], "picking the other segment moves the whole fill").toEqual([[7, 0], [7, 7], "b"]);
  addon.slash("accent arcane");
  expect(addon.eval("return { __p.fill.bg.__vertexColor, __r.segments[2].fill.roundFill.TOPLEFT.__vertexColor }").every((c) => isTok(addon, c, "accent")), "a new accent reaches the primary and the segment").toBe(true);
  addon.eval('ns.Theme.TintFill(__p.fill, "bad") __p:Refresh()');
  expect(addon.eval("local out = {} for i, t in ipairs(__p.fill.textures) do out[i] = t.__vertexColor end return out").every((c) => isTok(addon, c, "accent")), "a primary's Refresh puts every part back in the accent").toBe(true);
});

it("dialogs: Import and Reload are the primary buttons, Yes and No stay plain; the text box's dismiss reads Cancel beside Import and Close on its own", () => {
  const addon = loggedIn(CLICK_LUA);
  // A dialog button: whether it has a primary fill, its label and its label's colour.
  const button = (lua) => addon.eval(`local b = ${lua} return { b.fill ~= nil, b.text:GetText(), b.text.__textColor }`);
  addon.eval('ns.AskText("Paste it", function() end)');
  const [importBtn, cancel] = [button("Vanguard_TextDialog.primary"), button("Vanguard_TextDialog.close")];
  expect([importBtn[0], importBtn[1], isTok(addon, importBtn[2], "void"), cancel], "Import is the accent button with a dark label; the other reads Cancel and stays plain").toEqual([true, "Import", true, [false, "Cancel", tok(addon, "text")]]);
  expect(addon.eval("return { Vanguard_TextDialog.primary:GetHeight(), Vanguard_TextDialog.close:GetHeight(), Vanguard_TextDialog.close:GetWidth() }"), "both standalone buttons, 120 wide").toEqual([26, 26, 120]);
  addon.eval('ns.ShowText("A string", "VG1:...")');
  expect([addon.eval("return Vanguard_TextDialog.primary:IsShown()"), button("Vanguard_TextDialog.close")[1]], "showing text alone: no primary, and the one button reads Close").toEqual([false, "Close"]);
  addon.eval('ns.AskText("Paste it again", function() end)');
  expect(button("Vanguard_TextDialog.close")[1], "asking again puts Cancel back").toBe("Cancel");
  addon.eval('ns.Ask("Sure?", "Yes", function() end, function() end)');
  const yes = button("Vanguard_Question.yes");
  expect([yes[0], yes[1], isTok(addon, yes[2], "void"), button("Vanguard_Question.no")], "Yes is the question's one primary (the accent); No stays plain").toEqual([true, "Yes", true, [false, "No", tok(addon, "text")]]);
  addon.eval('ns.Ask("Delete it?", "Delete", function() end, function() end, "danger")');
  expect([addon.eval("return { Vanguard_Question.yes:IsShown(), Vanguard_Question.sure:IsShown() }"), button("Vanguard_Question.sure")], "a destructive question swaps in a danger button, never brass").toEqual([[false, true], [false, "Delete", tok(addon, "bad")]]);
  addon.eval('ns.OfferReload("Changed.")');
  const reload = button("Vanguard_Reload.accept");
  expect([reload[0], reload[1], isTok(addon, reload[2], "void"), button("Vanguard_Reload.cancel")], "Reload is the accent button; Later stays plain").toEqual([true, "Reload", true, [false, "Later", tok(addon, "text")]]);
  expect(addon.eval("local b = Vanguard_Reload.accept local o = b.reloadOverlay return { o ~= nil, o:GetAttribute('macrotext'), o:IsShown(), o.__points.TOPLEFT and o.__points.TOPLEFT.rel == b }"), "the reload overlay still covers the primary Reload button").toEqual([true, "/reload", true, true]);
  addon.eval("Vanguard_Reload.cancel:GetScript('OnClick')(Vanguard_Reload.cancel)");
  expect(addon.eval("return { Vanguard_Reload:IsShown(), Vanguard_Reload.accept.reloadOverlay:IsShown() }"), "Later hides the dialog and the overlay with it").toEqual([false, false]);
});

it("profiles: Use is a plain button, so Create is the page's one accent button", () => {
  const addon = loggedIn(CLICK_LUA + 'VanguardDB.profiles["TEST-ONLY Healer"] = {}');
  addon.eval('ns.Options.Show("profiles")');
  const buttons = addon.eval(`local out = {} for _, w in ipairs(__wfgStub.frames) do
    if w.use and w:IsVisible() then out.use = { w.use.fill ~= nil, w.use.text:GetText(), w.use.text.__textColor, w.use:GetHeight(), w.use:GetWidth() } end
    if w.create and w:IsVisible() then out.create = { w.create.text.__textColor, w.create.text:GetText(), w.create:GetHeight(), w.create:GetWidth() } end end return out`);
  expect(buttons.use, "Use: no accent fill, the text colour, a standalone button at the row's small width").toEqual([false, "Use", tok(addon, "text"), 26, 84]);
  expect(buttons.create, "Create: the primary kind (a dark label on the accent fill), the same size").toEqual([tok(addon, "void"), "Create", 26, 84]);
});

it("options: the sample unit frame shows the player's own name, or You when the client hides it, and the sample button Vanguard's crest", () => {
  const addon = loggedIn();
  addon.eval('ns.Options.Show("general")');
  // The sample row refreshed: the name shown and the button's icon.
  const sample = () => addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.unit and w.button and w:IsVisible() then
    w:Refresh() return { w.unit.name:GetText(), w.button.icon:GetTexture(), w.button.icon.__texCoord == nil } end end`);
  expect(sample(), "the player's name, and the crest uncropped").toEqual(["Tester", "Interface\\AddOns\\Vanguard\\Media\\Textures\\Icon", true]);
  addon.eval("__wfgWorld.units.player.name = __wfgWorld.secret(1)");
  expect(sample()[0], "a hidden name falls back to You").toBe("You");
  addon.eval("__wfgWorld.units.player.name = nil");
  expect(sample()[0], "so does no name").toBe("You");
});

// A font string's size and whether its colour is this token, as { size, color match }.
const lookOf = (addon, expr, token) => [addon.eval(`return select(2, (${expr}):GetFont())`), isTok(addon, addon.eval(`return (${expr}).__textColor`), token)];

it("options: the nav is a list of rows (T.ROW): the current page's row shows the rail (accent) and the lighter fill (raisedHover), which move with the page, and no row is taller than T.ROW.height", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  // A nav row's kind, rail shown, wash shown, the wash's alpha, the rail's width, its colour and its height.
  const row = (key) => addon.eval(`local b = Vanguard_Options.nav.${key} return { b.__kind, b.rail:IsShown(), b.wash:IsShown(), b.wash.__vertexColor[4], b.rail:GetWidth() / ns.Theme.Pixel(b), b.rail.__vertexColor, b:GetHeight() }`);
  const [wash, rail, height] = addon.eval("return { 1, ns.Theme.SELECT.rail, ns.Theme.ROW.height }");
  const here = row("general");
  expect([here[0], here[1], here[2], here[3], here[4]], "a nav entry is a Button; the current page's shows the rail (T.SELECT.rail screen pixels wide) and the fill (opaque)").toEqual(["Button", true, true, wash, rail]);
  expect(isTok(addon, here[5], "accent"), "the rail is in the accent").toBe(true);
  expect(row("raid").slice(1, 3), "another page's row shows neither").toEqual([false, false]);
  addon.eval('ns.Options.Show("raid")');
  expect([row("general").slice(1, 3), row("raid").slice(1, 3)], "the selection moves with the page").toEqual([[false, false], [true, true]]);
  const tallest = addon.eval("local h = 0 for _, b in pairs(Vanguard_Options.nav) do h = math.max(h, b:GetHeight()) end return h");
  expect(tallest <= height, "no nav row is taller than a list row").toBe(true);
});

it("options: a card's title is a section header: capitals in small muted text, an 18 high band 12 in from the card's edge and as wide as the card's inside", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  const head = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.text and w.text.__text == "LOOK" and w:IsVisible() then
    return { w.__kind, w:GetHeight(), w:GetWidth(), w.__points.TOPLEFT.x, w.__points.TOPLEFT.y, w.__parent:GetWidth() } end end`);
  expect(head, "a Button 18 tall, the card less its 12 of padding on both sides wide, at 12 across and 12 down in the card").toEqual(["Button", 18, 568 - 24, 12, -12, 568]);
  const title = '(function() for _, w in ipairs(__wfgStub.frames) do if w.text and w.text.__text == "LOOK" and w:IsVisible() then return w.text end end end)()';
  expect(lookOf(addon, title, "muted"), "the title is small muted text, in capitals").toEqual([addon.eval("return ns.Theme.RoleSize('small')"), true]);
});

it("options: a long page scrolls in the shared view: the thumb is T.SCROLL.thumb wide at the rest alpha, 12 right of the view, the wheel moves it 40 and the thumb and top edge follow; a short page has no thumb", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  // The visible page view: scroll, child height, view height, thumb shown, width, alpha, offset right of the view, top edge shown.
  const view = () => addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.fadeTop and w:IsVisible() then
    return { math.floor(w:GetVerticalScroll()), w.child:GetHeight() > w:GetHeight(), w.thumb:IsShown(), w.thumb:GetWidth(), w.thumb:GetAlpha(), (w.thumb.__points.TOPRIGHT or {}).x, w.fadeTop:IsShown() } end end`);
  const [scroll, overflows, shown, width, alpha, out, top] = view();
  expect([scroll, overflows, shown, alpha, out, top], "General is taller than its view: the thumb shows at the rest alpha, 12 right of the view; at the top").toEqual([0, true, true, addon.eval("return ns.Theme.SCROLL.rest"), 12, false]);
  expect(width, "T.SCROLL.thumb wide").toBe(addon.eval("return ns.Theme.SCROLL.thumb"));
  // How far down the view its thumb sits.
  const thumbTop = () => addon.eval("for _, w in ipairs(__wfgStub.frames) do if w.fadeTop and w:IsVisible() then return -w.thumb.__points.TOPRIGHT.y end end");
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.fadeTop and w:IsVisible() then __page = w end end`);
  addon.wheel("__page", -1);
  expect([view()[0], view()[6], thumbTop() > 0], "a notch down scrolls 40; the top edge shows and the thumb moves down").toEqual([40, true, true]);
  addon.eval('ns.Options.Show("feedback")');
  expect(view()[2], "a page that fits has no thumb").toBe(false);
});

it("options: the General page's captions are nouns, with a note under the two that lost words; search finds a row by its new caption or its note, and the old captions are gone", () => {
  const addon = loggedIn(CLICK_LUA + FIND_LUA);
  addon.eval('ns.Options.Show("general")');
  // A caption's top and bottom edges on screen, or null when it isn't shown.
  const at = (text) => (addon.texts(text)[0] || {}).rect || null;
  for (const caption of ["Safer colours (reload)", "Faction look", "Theme variant", "Corners", "Window ornaments", "Pixel-perfect scale"]) expect(at(caption), caption + " is a caption on the page").not.toBeNull();
  for (const old of ["Color assist: friendly blue, neutral yellow, hostile vermilion (reload)", "Theme variant: surfaces and text", "Corners: square or rounded panels", "Window ornaments: a brass rule or corners on large windows", "Pixel perfect scale"]) expect(at(old), old + " is gone").toBeNull();
  const notes = [["Safer colours (reload)", "Friendly blue, neutral yellow, hostile vermilion, and colours for Magic, Curse, Disease and Poison that stay apart."], ["Window ornaments", "A brass rule or corners on large windows."]];
  for (const [caption, note] of notes) {
    const row = at(caption), under = at(note);
    expect(under.top < row.bottom && row.bottom - under.top <= 8, "the note sits right under " + caption).toBe(true);
    expect(lookOf(addon, `__fontString(${JSON.stringify(note)})`, "muted"), "a note is small muted text").toEqual([addon.eval("return ns.Theme.RoleSize('small')"), true]);
  }
  addon.eval('ns.Options.Search("faction look")');
  expect(addon.eval("return Vanguard_Options.nav.general:GetAlpha()"), "search finds General by the row's caption").toBe(1);
  addon.eval('ns.Options.Search("hostile vermilion")');
  expect(addon.eval("return Vanguard_Options.nav.general:GetAlpha() == 1 and Vanguard_Options.nav.raid:GetAlpha() < 1"), "and by the words in its note").toBe(true);
  addon.eval('ns.Options.JumpTo("Window ornaments")');
  expect(addon.eval("return Vanguard_Options.found ~= nil and Vanguard_Options.found:IsShown()"), "a jump to the new caption marks its row").toBe(true);
  addon.eval('ns.Options.JumpTo("hostile vermilion")');
  expect(addon.eval(`local f, n = Vanguard_Options.found, __fontString("Friendly blue, neutral yellow, hostile vermilion, and colours for Magic, Curse, Disease and Poison that stay apart.")
    return { f:IsShown(), f:GetParent() == n:GetParent(), f:GetTop() == n:GetTop(), f:GetBottom() == n:GetBottom() }`), "a jump to a note marks it through its card (a font string holds no texture), over the note's text").toEqual([true, true, true, true]);
});

it("options: the header keeps its bar but wears the window tier: 48 tall, the title role in the text colour centred on the 24 line with the crest beside it, the logo and close at the window offsets, the opaque alpha", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  const head = addon.eval(`local o = Vanguard_Options
    return { o.header:GetHeight(), o.title:GetText(), select(2, o.title:GetFont()), o.title.__textColor, o.crest:GetWidth(), o.crest.__points.LEFT.rel == o.title, o.logo.__points.LEFT.x, o.title.__points.LEFT.y }`);
  expect(head.slice(0, 3).concat(head.slice(4)), "48 tall; the title role; the crest T.CREST.title right of the title; the logo T.SPACE.pad in; the title on the header's middle line").toEqual([48, "Vanguard", addon.eval("return ns.Theme.RoleSize('title')"), addon.eval("return ns.Theme.CREST.title"), true, addon.eval("return ns.Theme.SPACE.pad"), 0]);
  expect(isTok(addon, head[3], "text"), "the title is in the text colour").toBe(true);
  const close = addon.eval(`local b = CreateFrame("Button", nil, UIParent) ns.Theme.PlaceClose(b, Vanguard_Options) local p, c = b.__points.CENTER, Vanguard_Options.close.__points.CENTER return { p.x == c.x and p.y == c.y, c.relPoint }`);
  expect(close, "the close button is where T.PlaceClose puts every window's: on the top right corner").toEqual([true, "TOPRIGHT"]);
  const alpha = addon.eval(`for _, t in ipairs(__wfgStub.frames) do if t.__kind == "Texture" and t.__parent == Vanguard_Options and t.__layer == "BACKGROUND" then return t.__vertexColor[4] end end`);
  expect(alpha, "the window is T.ALPHA.opaque").toBe(addon.eval("return ns.Theme.ALPHA.opaque"));
});

it("options: the General page's buttons are T.BUTTON_H tall in a 32 high row, and a module's description is small muted text", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  // The three buttons of the General page's top card: caption, height and how far down their rows start.
  const buttons = addon.eval(`local out = {} for _, w in ipairs(__wfgStub.frames) do if w.caption and w.__kind == "Button" and w:IsVisible() and w.__parent:GetHeight() == 472
    and (w.caption == "Run setup" or w.caption == "What's new" or w.caption == "Move frames") then out[#out + 1] = { w.caption, w:GetHeight(), -w.__points.TOPLEFT.y } end end
    table.sort(out, function(a, b) return a[3] < b[3] end) return out`);
  const buttonH = addon.eval("return ns.Theme.BUTTON_H");
  expect(buttons.map((b) => b[1]), "each is T.BUTTON_H tall, not 28").toEqual([buttonH, buttonH, buttonH]);
  expect([buttons[1][2] - buttons[0][2], buttons[2][2] - buttons[1][2]], "and the rows stay 32 apart").toEqual([32, 32]);
  addon.eval('ns.Options.Show("modules")');
  const desc = addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.desc and w.label.__text == "Unit frames" and w:IsVisible() then return { select(2, w.desc:GetFont()), w.desc.__textColor } end end');
  expect([desc[0], isTok(addon, desc[1], "muted")], "a module's line on what it does is small and muted").toEqual([addon.eval("return ns.Theme.RoleSize('small')"), true]);
});

it("buttons: kinds share one shape (primary accent fill without bevel or sheen, hovering to accentText; danger a secondary with a bad label), and the control column is 200 wide", () => {
  const addon = loggedIn();
  const out = addon.eval(`local W = ns.Widgets
    local plain, primary, danger = W.Button(UIParent, "Go", print), W.Primary(UIParent, "Go", print), W.Danger(UIParent, "Go", print)
    local e = ns.Theme.HoverParts(primary)
    local r = W.Slider(UIParent, "Size", { min = 0, max = 10, step = 1 }, function() return 5 end, print, 400)
    return { plain.text.__textColor, primary.text.__textColor, danger.text.__textColor, e.fill.token, ns.Theme.HoverParts(plain).fill.token,
      W.COLUMN, W.VALUE_SLOT, r.track:GetWidth(), r.value:GetWidth(), r.label:GetWidth(), primary.Refresh ~= nil }`);
  expect(out.slice(0, 3), "the labels: text, void, bad").toEqual([tok(addon, "text"), tok(addon, "void"), tok(addon, "bad")]);
  expect(out.slice(3, 5), "a primary hovers to accentText, a secondary to raisedHover").toEqual(["accentText", "raisedHover"]);
  expect(out.slice(5, 9), "the column, the value slot, the track (column less slot and gap) and the value text").toEqual([200, 60, 132, 60]);
  expect(out[9], "a caption stops short of the column").toBe(400 - 200 - 16);
});

// 8.7 states, keyboard and menus -------------------------------------------------------------------

it("a pressed switch drops its knob one pixel and never recolours its track; no control fades its whole alpha to look disabled", () => {
  const addon = loggedIn();
  addon.eval(`__on = false
    __sw = ns.Widgets.Check(UIParent, "A caption", function() return __on end, function(v) __on = v end, 300)`);
  // The knob's and its shade's y offset, and the fill's colour.
  const look = () => addon.eval("local s = __sw local p = s.knob.__points local k = next(p) return { p[k].y, s.shade.__points[next(s.shade.__points)].y, s.fill.__vertexColor }");
  const rest = look();
  expect([rest[0], rest[1]], "at rest the knob and its shade sit on the track's middle").toEqual([0, 0]);
  addon.eval("__sw.__scripts.OnMouseDown(__sw)");
  const held = look();
  expect([held[0], held[1]], "pressed, both drop one screen pixel").toEqual([-px(addon, 1), -px(addon, 1)]);
  expect(held[2], "and the fill's colour is the same as at rest").toEqual(rest[2]);
  addon.eval("__sw.__scripts.OnMouseUp(__sw)");
  expect(look()[0], "letting go puts the knob back").toBe(0);
  const src = ["Controls", "Widgets", "Dialog", "Chrome"].map((f) => readFileSync(`Core/${f}.lua`, "utf8")).join("\n");
  expect(src.match(/SetAlpha\([^)]*(disabled|enabled)/gi), "no constructor fades its alpha for a disabled look").toBeNull();
});

it("an edit box turns its border accentText while it has the typing and back to edge after", () => {
  const addon = loggedIn();
  addon.eval(`__box = ns.Widgets.Input(UIParent, 200)`);
  // The edit box's border colour.
  const border = () => borderOf(addon, "__box");
  expect(isTok(addon, border(), "edge"), "resting: the edge border").toBe(true);
  addon.eval(`__box.__scripts.OnEditFocusGained(__box)`);
  expect(isTok(addon, border(), "accentText"), "focused: accentText").toBe(true);
  addon.eval(`__box.__scripts.OnEditFocusLost(__box)`);
  expect(isTok(addon, border(), "edge"), "let go: edge again").toBe(true);
});

it("the search box shows a clear glyph only while it has text; clicking it empties the box and runs onChange", () => {
  const addon = loggedIn();
  addon.eval(`__seen = {} __s = ns.Widgets.Search(UIParent, 200, "Find", function(t) __seen[#__seen + 1] = t end)`);
  expect(addon.eval("return __s.clear:IsShown()"), "empty: no glyph").toBe(false);
  addon.eval(`__s:SetText("abc") __s.__scripts.OnTextChanged(__s)`);
  expect(addon.eval("return { __s.clear:IsShown(), __s.hint:IsShown() }"), "with text: the glyph shows and the hint is gone").toEqual([true, false]);
  addon.eval("__s.clear.__scripts.OnEnter(__s.clear)");
  expect(isTok(addon, addon.eval("return __s.clear.glyph.__vertexColor"), "text"), "the glyph lights under the mouse").toBe(true);
  addon.eval("__s.clear.__scripts.OnLeave(__s.clear)");
  expect(isTok(addon, addon.eval("return __s.clear.glyph.__vertexColor"), "text2"), "and rests in text2").toBe(true);
  addon.eval(`__s.clear.__scripts.OnClick(__s.clear) __s.__scripts.OnTextChanged(__s)`);
  expect(addon.eval("return { __s:GetText(), __s.clear:IsShown(), __seen[#__seen] }"), "a click empties it and tells onChange").toEqual(["", false, ""]);
});

// Opens a dropdown of n choices (value 1 current) and returns nothing; the menu is Vanguard_Menu.
const openDropdown = (addon, n) => addon.eval(`local list = {} for i = 1, ${n} do list[i] = { i, "Choice " .. i } end
  __dd = ns.Widgets.Dropdown(UIParent, list, function() return 1 end, function(v) __picked = v end, 160)
  __dd:SetPoint("CENTER")
  __dd.__scripts.OnClick(__dd)`);

it("a dropdown keeps its hover fill while its menu is open, and lets go when the menu closes", () => {
  const addon = loggedIn();
  openDropdown(addon, 4);
  // How lit the first dropdown's hover line is.
  const lit = () => addon.eval("return ns.Theme.HoverParts(__dd)[2]:GetAlpha()");
  addon.eval("__dd.__scripts.OnLeave(__dd)");
  expect(lit(), "the mouse is gone but the menu is open: the line stays lit").toBe(1);
  addon.eval("ns.Widgets.CloseMenu()");
  expect(lit(), "the menu closed: the hover look eases out").toBe(0);
  openDropdown(addon, 4);
  addon.eval(`__two = ns.Widgets.Dropdown(UIParent, { { 1, "A" } }, function() return 1 end, function() end, 160) __two.__scripts.OnClick(__two)`);
  expect([lit(), addon.eval("return ns.Theme.HoverParts(__two)[2]:GetAlpha()")], "opening another dropdown passes the hold on").toEqual([0, 1]);
});

it("a menu of more than 16 rows shows the 4 px thumb at the rest alpha and moves it as the list scrolls; a short one has none", () => {
  const addon = loggedIn();
  openDropdown(addon, 4);
  expect(addon.eval("return Vanguard_Menu.thumb:IsShown()"), "four rows: no thumb").toBe(false);
  addon.eval("ns.Widgets.CloseMenu()");
  openDropdown(addon, 40);
  // The menu thumb: shown, width, alpha, height and its y offset.
  const thumb = () => addon.eval("local t = Vanguard_Menu.thumb return { t:IsShown(), t:GetWidth(), t:GetAlpha(), t:GetHeight(), select(5, t:GetPoint()) }");
  const top = thumb();
  expect(top.slice(0, 3), "forty rows: the thumb shows, 4 wide, at the rest alpha").toEqual([true, addon.eval("return ns.Theme.SCROLL.thumb"), addon.eval("return ns.Theme.SCROLL.rest")]);
  addon.eval("Vanguard_Menu.__scripts.OnMouseWheel(Vanguard_Menu, -1)");
  expect(thumb()[4], "scrolled a row, the thumb sits lower").toBeLessThan(top[4]);
});

it("Escape and a click outside close a dropdown menu", () => {
  const addon = loggedIn("UISpecialFrames = {}");
  openDropdown(addon, 4);
  expect(addon.eval("local n = 0 for _, name in ipairs(UISpecialFrames) do if name == 'Vanguard_Menu' then n = n + 1 end end return n"), "Escape is wired through the special frames, once").toBe(1);
  expect(addon.eval("return Vanguard_Menu.catcher:IsShown()"), "an open menu has its catcher under it").toBe(true);
  expect(addon.eval("return Vanguard_Menu.catcher:GetFrameLevel() < Vanguard_Menu:GetFrameLevel()"), "just under the menu").toBe(true);
  addon.eval("Vanguard_Menu.catcher.__scripts.OnMouseDown(Vanguard_Menu.catcher, 'LeftButton')");
  expect(addon.eval("return { Vanguard_Menu:IsShown(), Vanguard_Menu.catcher:IsShown() }"), "a click anywhere else closes the menu and puts the catcher away").toEqual([false, false]);
  openDropdown(addon, 4);
  addon.eval('ns.Options.Show("general")');
  addon.key("Vanguard_Options", "ESCAPE");
  expect(addon.eval("return { Vanguard_Menu:IsShown(), Vanguard_Options:IsShown() }"), "Escape in the options window closes the menu first and leaves the window").toEqual([false, true]);
  addon.key("Vanguard_Options", "ESCAPE");
  expect(addon.eval("return Vanguard_Options:IsShown()"), "a second Escape closes the window").toBe(false);
});

it("Left and Right step a focused slider by its step", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.track and w.min and w.label and w.label.__text == "Text size" and w:IsVisible() then __sl = w end end`);
  const before = addon.eval("return __sl.get()");
  addon.eval("Vanguard_Options.focusRow = __sl");
  addon.key("Vanguard_Options", "RIGHT");
  const up = addon.eval("return __sl.get()");
  addon.key("Vanguard_Options", "LEFT");
  expect([up > before, addon.eval("return __sl.get()")], "Right steps up, Left steps back").toEqual([true, before]);
  addon.eval("Vanguard_Options.focusRow = nil");
  addon.key("Vanguard_Options", "RIGHT");
  expect(addon.eval("return __sl.get()"), "with no row focused the keys do nothing").toBe(before);
});

// Tab focus over a dialog's buttons: the ring moves, Enter and Space press the focused one, the keyboard follows
// the window and lets go in a fight.
// Builds a dialog by opening it once, hides it and makes it report its keyboard (__kb) and key passing (__passed), as the options test does.
const spyOn = (addon, open, name) => addon.eval(`${open} local f = ${name} f:Hide() f.SetPropagateKeyboardInput = function(self, v) self.__passed = v end f.EnableKeyboard = function(self, on) self.__kb = on end`);
const ring = (addon, ref) => addon.eval(`local f = ns.Theme.FocusParts(${ref}) return f ~= nil and f.ring.top:IsShown()`);

it("the question's buttons take Tab focus: Tab and Shift-Tab move a ring, Space presses the focused one, Enter with no focus still presses the primary Yes", () => {
  const addon = loggedIn("UISpecialFrames = {}");
  addon.eval(`__yes = 0 __no = 0 __passed = {} ns.Ask("Sure?", "Yes", function() __yes = __yes + 1 end, function() __no = __no + 1 end)
    Vanguard_Question.SetPropagateKeyboardInput = function(self, v) __passed[#__passed + 1] = v end`);
  addon.key("Vanguard_Question", "W");
  expect(addon.eval("return __passed[#__passed]"), "a key nobody uses goes on to the game").toBe(true);
  addon.key("Vanguard_Question", "TAB");
  expect([ring(addon, "Vanguard_Question.no"), ring(addon, "Vanguard_Question.yes"), addon.eval("return __passed[#__passed]")], "Tab lands on the first button and stops there").toEqual([true, false, false]);
  addon.key("Vanguard_Question", "TAB");
  expect([ring(addon, "Vanguard_Question.no"), ring(addon, "Vanguard_Question.yes")], "and steps to the next").toEqual([false, true]);
  addon.keys({ shift: true });
  addon.key("Vanguard_Question", "TAB");
  addon.keys({ shift: false });
  expect(ring(addon, "Vanguard_Question.no"), "Shift-Tab steps back").toBe(true);
  addon.key("Vanguard_Question", "SPACE");
  expect([addon.eval("return __no"), addon.eval("return Vanguard_Question:IsShown()")], "Space presses the focused No").toEqual([1, false]);
  addon.eval(`ns.Ask("Again?", "Yes", function() __yes = __yes + 1 end)`);
  expect(ring(addon, "Vanguard_Question.no"), "reopened, no ring is left over").toBe(false);
  addon.key("Vanguard_Question", "ENTER");
  expect(addon.eval("return __yes"), "Enter with no focus presses the primary Yes").toBe(1);
  addon.eval(`ns.Ask("Third?", "Yes", function() __yes = __yes + 1 end, function() __no = __no + 1 end)`);
  addon.key("Vanguard_Question", "TAB");
  addon.key("Vanguard_Question", "ENTER");
  expect([addon.eval("return __yes"), addon.eval("return __no")], "Enter on a focused button presses that one, here No").toEqual([1, 2]);
});

it("a Tab-focus window gives up the keyboard in a fight, takes it back after, and waits for the end of one it opens in", () => {
  const addon = loggedIn("UISpecialFrames = {}");
  spyOn(addon, 'ns.OfferReload("x")', "Vanguard_Reload");
  addon.eval(`ns.OfferReload("A change.")`);
  expect(addon.eval("return Vanguard_Reload.__kb"), "the open dialog holds the keyboard").toBe(true);
  addon.world.combat(true);
  expect(addon.eval("return Vanguard_Reload.__kb"), "in combat it holds no keyboard").toBe(false);
  setCombat(addon, false);
  expect(addon.eval("return Vanguard_Reload.__kb"), "after the fight it has it again").toBe(true);
  addon.eval("Vanguard_Reload:Hide()");
  addon.world.combat(true);
  setCombat(addon, false);
  expect(addon.eval("return Vanguard_Reload.__kb"), "a fight that ends while it is closed leaves it off").toBe(false);
  addon.world.combat(true);
  addon.eval(`ns.OfferReload("In a fight.")`);
  expect(addon.eval("return Vanguard_Reload.__kb"), "shown in combat it holds nothing yet").toBe(false);
  setCombat(addon, false);
  expect(addon.eval("return Vanguard_Reload.__kb"), "and takes the keyboard when the fight ends").toBe(true);
});

it("Tab focus skips keys in combat and a button that was disabled after it took the ring", () => {
  const addon = loggedIn("UISpecialFrames = {}");
  addon.eval(`ns.OfferReload("A change.")`);
  addon.key("Vanguard_Reload", "TAB");
  addon.eval("__n = 0 Vanguard_Reload.cancel:SetScript('OnClick', function() __n = __n + 1 end) Vanguard_Reload.cancel:Disable()");
  addon.key("Vanguard_Reload", "SPACE");
  expect(addon.eval("return __n"), "a disabled button is not pressed").toBe(0);
  addon.eval("Vanguard_Reload.cancel:Enable()");
  addon.world.combat(true);
  addon.key("Vanguard_Reload", "SPACE");
  expect(addon.eval("return __n"), "and in combat no key is used").toBe(0);
  addon.world.combat(false);
  addon.key("Vanguard_Reload", "SPACE");
  expect(addon.eval("return __n"), "enabled and out of combat it is pressed").toBe(1);
  addon.eval("Vanguard_Reload.cancel:SetScript('OnClick', nil)");
  addon.key("Vanguard_Reload", "SPACE");
  expect(addon.eval("return Vanguard_Reload:IsShown()"), "a button with no click is simply not used").toBe(true);
});

it("the text and reload dialogs take Tab focus too, and a hidden button is skipped", () => {
  const addon = loggedIn("UISpecialFrames = {}");
  addon.eval(`ns.ShowText("Copy", "text")`);
  addon.key("Vanguard_TextDialog", "TAB");
  expect([ring(addon, "Vanguard_TextDialog.primary"), ring(addon, "Vanguard_TextDialog.close")], "the hidden primary is skipped: Close takes the first Tab").toEqual([false, true]);
  addon.eval(`ns.OfferReload("A change.")`);
  addon.key("Vanguard_Reload", "TAB");
  expect(ring(addon, "Vanguard_Reload.cancel"), "the reload dialog starts at Later").toBe(true);
});
