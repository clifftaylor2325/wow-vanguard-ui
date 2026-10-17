// options: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, DATA_ENV, RETAIL, UI_ENV, UNITS_ENV, bars, button, calls, chatHas, isTok, key, loggedIn, marks, px, setCombat, tooltip } from "./helpers.mjs";

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
      w.segments[2]:GetScript("OnClick")(w.segments[2]) return { value = VanguardDB.profiles.Default.DataBars.text, on = w.segments[2].fill:IsShown(), off = w.segments[1].fill:IsShown() } end end`);
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
  addon.eval('__click("Reset profile") Vanguard_Question.yes:GetScript("OnClick")(Vanguard_Question.yes)');
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
  expect(menu.slice(0, 3), "a long list shows 16 rows at a time, one column wide").toEqual([16, 180, 16 * 22 + 2]);
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
  expect(keyRow(addon), "Tab marks the first row that does something (the sample and the swatches are skipped)").toEqual(["Color assist: friendly blue, neutral yellow, hostile vermilion (reload)", true, true]);
  press(addon, "TAB");
  expect(keyRow(addon)[0], "Tab again: the next").toBe("Font");
  addon.keys({ shift: true });
  press(addon, "TAB");
  press(addon, "TAB");
  addon.keys({ shift: false });
  const last = keyRow(addon);
  expect([last[0], last[2], addon.eval("return Vanguard_Options.found:IsShown()")], "Shift-Tab goes back, and past the first wraps to the last row, scrolled into view").toEqual([addon.eval("local rows = {} for _, w in ipairs(__wfgStub.frames) do if w.card and w:IsVisible() and w:GetObjectType() == 'Button' then rows[#rows + 1] = w end end table.sort(rows, function(a, b) return a.pageY < b.pageY end) return rows[#rows].caption"), true, true]);
  press(addon, "TAB");
  expect(keyRow(addon), "and Tab from the last wraps to the first, scrolled back up").toEqual(["Color assist: friendly blue, neutral yellow, hostile vermilion (reload)", true, true]);
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
  expect([first[0], first[1], first[3], first.slice(5)], "a unit frame with the Vanguard bars, the name at 12, and a button with its key, count and glow")
    .toEqual(["Interface\\AddOns\\Vanguard\\Media\\Textures\\Bar", "Interface\\AddOns\\Vanguard\\Media\\Textures\\Bar", 12, [true, "<name>", "72%", "1", "5"]]);
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
    return { fs.__width, fs:GetStringHeight(), fs.__points.TOPLEFT.y, __fontString("Report a bug").__parent.__points.TOPLEFT.y }`);
  expect(note[0], "the note is as wide as the card's inside (the card is 564 wide, 8 off for the rows and 14 of padding)").toBe(564 - 8 - 14);
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
    local grip, y = Vanguard_Options.grip, 500
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
    "general|General|10|34", "modules|Modules|20|68", "unitframes|Unit frames|30|24", "raid|Raid frames|40|22",
    "actionbars|Action bars|60|73", "quests|Quests|70|19", "bars|Bars and bags|80|17", "map|Map|81|30", "chat|Chat|82|31", "windows|Game windows|83|30", "tools|Combat tools|84|38", "town|Town and gear|85|49", "profiles|Profiles|90|22",
    "feedback|Feedback|100|7", "healing|Healing|45|44", "talents|Talents|47|7", "nameplates|Nameplates|65|15",
    "situations|Situations|86|16", "clickcast|Click casting|46|11",
  ]);
  addon.eval('ns.Options.Show("general")');
  // The nav entries top to bottom, by each one's offset from the top of the nav.
  const nav = addon.eval("local list = {} for k, b in pairs(Vanguard_Options.nav) do local _, _, _, _, y = b:GetPoint() list[#list + 1] = { k, y } end table.sort(list, function(a, b) return a[2] > b[2] end) local out = {} for i, e in ipairs(list) do out[i] = e[1] end return out");
  expect(nav, "the nav lists the pages in the same order").toEqual([
    "general", "modules", "unitframes", "raid", "healing", "clickcast", "talents", "actionbars",
    "nameplates", "quests", "bars", "map", "chat", "windows", "tools", "town", "situations", "profiles", "feedback",
  ]);
});

it("options: every nav entry fits inside the nav, however many pages there are", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  // The foot of the lowest nav entry and the shortest entry, in px (the nav is 520 px tall: the window's 600 less its header and footer).
  const fit = addon.eval(`local foot, least = 0, 99 for _, b in pairs(Vanguard_Options.nav) do local _, _, _, _, y = b:GetPoint()
    foot, least = math.max(foot, -y + b:GetHeight()), math.min(least, b:GetHeight()) end return { foot, least }`);
  expect(fit[0] <= 520 && fit[1] >= 24, "the last entry ends above the nav's foot and no entry is squeezed under 24 px").toBe(true);
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
  expect(place(), "on: both at the right, the fill shown").toEqual(["RIGHT", -2, "RIGHT", -2, true]);
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
  const fill = (v) => addon.eval(`__sl.set(${v}) __sl:Refresh() local p = __sl.fillParts
    return { p[1]:IsShown(), __r3(p[1]:GetWidth()), __r3(p[3]:GetWidth()), __r3(p[3].__points.TOPLEFT.x), __r3(__sl.thumb.__points.CENTER.x), __r3(__sl.thumbLine.__points.CENTER.x) }`);
  expect(fill("__sl.max"), "at the top: the fill spans the track, its right end 4 in from the end, the thumb and its outline centred on the end").toEqual([true, 4, 4, 136, 140, 140]);
  expect(fill("__sl.min + (4 / 140) * (__sl.max - __sl.min)"), "a fill 4 wide: both ends narrow to 2, so neither crosses the other").toEqual([true, 2, 2, 2, 4, 4]);
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
  expect(cycle("Theme variant: surfaces and text", "variant", order.length), "one click per variant goes round every one, back to the default").toEqual([...order.slice(1), order[0]]);
  expect(cycle("Corners: square or rounded panels", "corners", 2), "corners cycle rounded then square").toEqual(["rounded", "square"]);
});

it("options: choice segments are as wide as their labels and follow the text size, and the selected one draws no shadow under its dark text", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  // Each segment of the Corners row: its width, its label's width, its left edge and its text's shadow alpha.
  const segments = () => addon.eval(`local r = ${rowNamed("Corners: square or rounded panels")} local out = {}
    for i, s in ipairs(r.segments) do out[i] = { width = s:GetWidth(), label = s.text:GetStringWidth(), left = s:GetLeft(), shadow = s.text.__shadowColor[4] } end return out`);
  const before = segments();
  expect(before.map((s) => s.width >= s.label + 16), "8 px of air each side of every label").toEqual([true, true]);
  expect(before[0].left + before[0].width <= before[1].left + 1, "the segments sit side by side, overlapping only the shared 1 px edge").toBe(true);
  expect(before.map((s) => s.shadow), "Square (selected, dark text on the accent) has no shadow; Rounded keeps the theme's").toEqual([0, 0.9]);
  // The harness measures text at one size, so a longer label stands in for a larger text size.
  addon.eval(`local r = ${rowNamed("Corners: square or rounded panels")} r.segments[2].text:SetText("Rounded corners") ns.Theme.Refresh()`);
  const after = segments();
  expect(after.map((s, i) => s.width >= before[i].width && s.width >= s.label + 16), "a theme refresh re-measures: the segments grow with their labels").toEqual([true, true]);
  expect(after[1].width > before[1].width && after[0].left + after[0].width <= after[1].left + 1, "and still don't overlap").toBe(true);
  addon.eval('__click("Corners: square or rounded panels")');
  expect(segments().map((s) => s.shadow), "Rounded selected: the shadow moves with the selection").toEqual([0.9, 0]);
});
