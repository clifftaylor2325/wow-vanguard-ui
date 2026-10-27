// options: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { BUFF_NAMES, CLICK_LUA, DATA_ENV, RETAIL, UI_ENV, UNITS_ENV, bars, borderOf, button, calls, chatHas, expectErrors, isTok, key, loggedIn, marks, px, setCombat, spellNames, tok, tooltip, SETUP_DONE } from "./helpers.mjs";

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
  expect(addon.eval('return __click("Visibility")') && addon.eval("return VanguardDB.profiles.Default.ActionBars.bars[6].visibility") === "mouseover", "cycle buttons step through choices (on the Bar 6 tab, still showing)").toBeTruthy();
  expect(addon.eval('return __click("Bar backing") and VanguardDB.profiles.Default.ActionBars.backing'), "the Bar backing cycle steps from Follow the theme to Always").toBe("on");
  expect(addon.eval('return __click("Button size")') && addon.eval("return VanguardDB.profiles.Default.ActionBars.bars[1].size") === 40, "a bar's size slider starts at the shared size and steps by 2").toBeTruthy();
  addon.eval('__click("Modules")');
  // The Modules page's row for unit frames: its description, and clicking it.
  const moduleRow = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.desc and w.label.__text == "Unit frames" and ns.Options.RevealRow(w) then
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

it("options: pointing at the addons button says the version, what each click does and the errors caught", () => {
  const addon = loggedIn();
  // Hovers the addons button: the tooltip's lines and whether it shows; then leaves it.
  const hover = () => addon.eval(`local b = CreateFrame("Button") __b = b Vanguard_OnAddonCompartmentEnter("Vanguard", b)
    local out = {} for _, l in ipairs(GameTooltip.__lines) do out[#out + 1] = l.text end return { out, GameTooltip:IsShown() }`);
  const version = addon.eval("return ns.AddonVersion()");
  expect(hover(), "no errors: the version and the clicks").toEqual([[`Vanguard ${version}`, "Left-click: options · Right-click: move frames (out of combat)"], true]);
  addon.eval('Vanguard_OnAddonCompartmentLeave("Vanguard", __b)');
  expect(addon.eval("return GameTooltip:IsShown()"), "leaving hides it").toBe(false);
  addon.eval('ns.errors[1] = { text = "TEST-ONLY" }');
  expect(hover()[0][2], "an error caught: a line says so").toBe("1 error caught this session (/vg errors)");
  addon.eval('ns.errors[2] = { text = "TEST-ONLY 2" }');
  expect(hover()[0][2], "and counts them").toBe("2 errors caught this session (/vg errors)");
  addon.eval('GameTooltip:SetOwner(UIParent) GameTooltip:Show() Vanguard_OnAddonCompartmentLeave("Vanguard", __b)');
  expect(addon.eval("return GameTooltip:IsShown()"), "a tooltip another frame owns by now stays").toBe(true);
  addon.eval("GameTooltip = nil");
  expect(addon.eval('Vanguard_OnAddonCompartmentEnter("Vanguard", __b) Vanguard_OnAddonCompartmentLeave("Vanguard", __b) local n = #ns.errors ns.errors[1], ns.errors[2] = nil, nil return n'), "a client without the tooltip: nothing breaks (no third error)").toBe(2);
});

it("options: the window opens three quarters of the screen tall (the screen less 50 at most, 600 at least) and fits again after a screen change", () => {
  const addon = loggedIn();
  addon.slash("");
  // The window's height, and whether it is the height given rounded to whole pixels.
  const tall = (h) => addon.eval(`return Vanguard_Options:GetHeight() == ns.Theme.PixelRound(Vanguard_Options, ${h}, true)`);
  expect(tall(810), "on the 1080 screen: 810").toBe(true);
  // Gives UIParent a new height and lets the game say the screen changed.
  const screen = (h) => { addon.eval(`UIParent:SetSize(1920, ${h})`); addon.fire("DISPLAY_SIZE_CHANGED"); addon.update(0.1); };
  screen(700);
  expect(tall(600), "a 700 screen: never under 600").toBe(true);
  screen(1000);
  expect(tall(750), "a 1000 screen: three quarters again").toBe(true);
  screen(620);
  expect(tall(600), "a 620 screen: still 600, as before (the nav is sized for it)").toBe(true);
  addon.eval('Vanguard_Options:Hide() Vanguard_Options:ClearAllPoints()');
  screen(1080);
  expect([tall(810), addon.eval("return Vanguard_Options:GetPoint() ~= nil")], "a closed window is placed again too").toEqual([true, true]);
  addon.eval("UIParent:SetSize(1920, 1080)");
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
  expect(addon.eval('ns.Options.Show("actionbars") return __click("Restyle the pet, stance, possess and extra action buttons")') === true, "the special-bars switch is on the action bar page").toBeTruthy();
  expect(addon.eval("return VanguardDB.profiles.Default.SpecialBars.skinPet") === false, "it turns pet, stance and extra bars off together").toBeTruthy();
});

// The visible profile row for a name: its caption and which buttons it has.
const profileRow = (addon, name) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do
  if w.label and type(w.label.__text) == "string" and w.label.__text:sub(1, #"${name}") == "${name}" and w.card and ns.Options.RevealRow(w) then
    return { w.label.__text, w.use ~= nil, w.copy ~= nil, w.delete ~= nil } end end`);

// Clicks one of a profile row's buttons.
const profileButton = (addon, name, button) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do
  if w.label and w.label.__text == "${name}" and w.card and ns.Options.RevealRow(w) then local b = w.${button} b:GetScript("OnClick")(b) return b.text.__text end end`);

// Runs one of a profile row's button scripts (OnEnter, OnLeave) and returns the tooltip: shown, first line.
const profileHover = (addon, name, button, script) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do
  if w.label and w.label.__text == "${name}" and w.card and ns.Options.RevealRow(w) then local b = w.${button} b:GetScript("${script}")(b)
    return { GameTooltip:IsShown(), (GameTooltip.__lines[1] or {}).text or false } end end`);

it("options: Delete, Copy here, Reset profile and Start over say what they lose; a reset asks and keeps a copy", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.NewProfile("TEST-ONLY Tank") ns.Profile().Chat = { background = false } ns.Options.Show("profiles")');
  expect(profileHover(addon, "TEST-ONLY Tank", "delete", "OnEnter"), "Delete's tooltip").toEqual([true, "Deletes profile TEST-ONLY Tank for every character on this account. It can't be undone."]);
  expect(profileHover(addon, "TEST-ONLY Tank", "copy", "OnEnter"), "Copy here's tooltip").toEqual([true, "Replaces every setting in profile Default with profile TEST-ONLY Tank's. It can't be undone."]);
  expect(profileHover(addon, "TEST-ONLY Tank", "copy", "OnLeave")[0], "leaving hides it").toBe(false);
  addon.eval("GameTooltip = nil");
  expect(addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.delete and ns.Options.RevealRow(w) then w.delete:GetScript("OnEnter")(w.delete) w.delete:GetScript("OnLeave")(w.delete) return true end end'), "a client without the tooltip shows none, without an error").toBe(true);
  addon.eval('__click("Reset profile")');
  expect(addon.eval("return Vanguard_Question.title:GetText()"), "Reset profile asks, saying what is lost and where the copy goes")
    .toBe("Reset this profile? Every setting in profile Default goes back to Vanguard's defaults, for every character that uses it. A copy is kept as profile Default backup.");
  addon.eval('Vanguard_Question.no:GetScript("OnClick")(Vanguard_Question.no)');
  expect(addon.eval("return { VanguardDB.profiles.Default.Chat.background, VanguardDB.profiles['Default backup'] == nil }"), "No changes nothing").toEqual([false, true]);
  addon.eval('__click("Reset profile") Vanguard_Question.confirm:GetScript("OnClick")(Vanguard_Question.confirm)');
  expect(addon.eval("return { VanguardDB.profiles.Default.Chat == nil, VanguardDB.profiles['Default backup'].Chat.background, Vanguard_Options.reload:IsShown() }"), "Reset backs the profile up, then resets it for the reload").toEqual([true, false, true]);
  expect(chatHas(addon, /Profile Default as it was is saved as profile Default backup\./), "and says where the copy went").toBe(true);
});

it("options: after Copy here or Reset profile on the profile in use, the footer says to reload before changing more", () => {
  // The footer's reload notice: shown, and its text.
  const notice = (addon) => addon.eval("return { Vanguard_Options.notice:IsShown(), Vanguard_Options.notice:GetText() }");
  const staged = loggedIn(CLICK_LUA);
  staged.eval('ns.NewProfile("TEST-ONLY Healer") ns.NewProfile("TEST-ONLY Tank") ns.Options.Show("profiles")');
  profileButton(staged, "TEST-ONLY Tank", "use");
  profileButton(staged, "TEST-ONLY Healer", "copy");
  profileButton(staged, "TEST-ONLY Healer", "copy");
  expect(notice(staged), "Copy here into the staged profile leaves the profile on screen alone: the usual notice").toEqual([true, "Some changes need a reload"]);
  const copied = loggedIn(CLICK_LUA);
  copied.eval('ns.NewProfile("TEST-ONLY Healer") ns.Options.Show("profiles")');
  profileButton(copied, "TEST-ONLY Healer", "copy");
  profileButton(copied, "TEST-ONLY Healer", "copy");
  expect(notice(copied), "Copy here into the profile in use: the modules keep its old settings until the reload").toEqual([true, "Profile replaced: reload before you change more"]);
  const reset = loggedIn(CLICK_LUA);
  reset.eval('ns.Options.Show("profiles") __click("Reset profile") Vanguard_Question.confirm:GetScript("OnClick")(Vanguard_Question.confirm)');
  expect(notice(reset), "Reset profile says the same").toEqual([true, "Profile replaced: reload before you change more"]);
  const startOver = loggedIn(CLICK_LUA);
  startOver.eval('ns.Options.Show("profiles") __click("Start over: reset and run setup") Vanguard_Question.confirm:GetScript("OnClick")(Vanguard_Question.confirm)');
  expect(notice(startOver), "so does Start over").toEqual([true, "Profile replaced: reload before you change more"]);
  const typed = loggedIn(CLICK_LUA);
  typed.eval('ns.NewProfile("TEST-ONLY Healer")');
  typed.slash("profile copy TEST-ONLY Healer");
  typed.eval('ns.Options.Show("profiles")');
  expect(notice(typed), "and /vg profile copy, the window opened after it").toEqual([true, "Profile replaced: reload before you change more"]);
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
  addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.use and w.label.__text == "Default  (in use until reload)" and ns.Options.RevealRow(w) then w.use:GetScript("OnClick")(w.use) end end');
  expect([addon.eval("return ns.PendingProfileName()"), profileRow(addon, "Default")[0]], "Use on the running profile takes the switch back").toEqual([null, "Default  (in use)"]);
  profileButton(addon, "TEST-ONLY Healer", "use");
  // The new-profile row: types a name and presses Create (or Enter); returns the row's caption.
  const create = (name, enter) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.input and w.create and ns.Options.RevealRow(w) then
    w.input:SetText("${name}") local b = ${enter ? "w.input" : "w.create"} b:GetScript(${enter ? '"OnEnterPressed"' : '"OnClick"'})(b) return w.label.__text end end`);
  expect(create("TEST-ONLY Bad/Name"), "a bad name says why").toBe("Name taken or not allowed");
  create("TEST-ONLY Leveling", true);
  expect([addon.eval("return ns.SelectedProfileName()"), profileRow(addon, "TEST-ONLY Leveling")[0], profileRow(addon, "TEST-ONLY Healer")[0]], "a good name makes the profile and stages the switch to it").toEqual(["TEST-ONLY Leveling", "TEST-ONLY Leveling  (after reload)", "TEST-ONLY Healer"]);
  addon.eval('ns.Options.ShowTab("Profile")');
  expect(addon.texts("This character uses Default until you reload, then TEST-ONLY Leveling.").length, "and the Profile tab says what is used until then").toBe(1);
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
  const edges = (y) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.fadeTop and ns.Options.RevealRow(w) then
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
  const shown = () => addon.frames("w.card ~= nil and w.pageY ~= nil and ns.Options.RevealRow(w)").length;
  const rows = shown();
  addon.eval("__old = {} for _, w in ipairs(__wfgStub.frames) do if w.card and w.pageY and ns.Options.RevealRow(w) and w.Refresh then __old[#__old + 1] = w end end");
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
  expect(reads(), "opening the window again reads afresh the pages not built yet; a built page keeps the rows it shows").toEqual([1, 0]);
});

it("options: a search hit scrolls to its row and marks it after the window was closed and opened again", () => {
  const addon = loggedIn(CLICK_LUA);
  // Searches, opens the first hit and says which row is marked: its caption, or false.
  const openHit = (text) => addon.eval(`ns.Options.Search(${JSON.stringify(text)})
    local hit = ns.Options.hits[1]
    ns.Options.OpenHit(hit)
    for _, w in ipairs(__wfgStub.frames) do if w.found and w.found == Vanguard_Options.found and w.found:IsShown() and w.source == hit.row then return w.caption end end
    return false`);
  addon.eval('ns.Options.Show("general")');
  expect(openHit("interface sounds"), "the first opening marks the row").toBe("Interface sounds");
  addon.eval("ns.Options.Hide() Vanguard_Options:Hide() ns.Options.Show()");
  expect(openHit("reduce motion"), "after a reopen a row on a page built before is marked too").toMatch(/^Reduce motion/);
});

it("options: search finds buttons, choice names, the note under a setting and reload rows, and says how many more there are", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  // The captions a search lists, and the list's last line.
  const found = (text) => addon.eval(`ns.Options.Search(${JSON.stringify(text)})
    local out = {} for _, hit in ipairs(ns.Options.hits) do out[#out + 1] = hit.caption end
    return { out, Vanguard_Options.results.more.__text }`);
  expect(found("move frames")[0][0], "a button is listed").toBe("Move frames");
  addon.eval("ns.Options.OpenHit(ns.Options.hits[1])");
  expect(addon.eval("return ns.Unlocked()"), "opening a button hit marks it and never presses it").toBe(false);
  expect(found("square")[0], "a choice's names: Corners has Square").toContain("Corners");
  expect(addon.eval("return { Vanguard_Options.nav.general:GetAlpha(), Vanguard_Options.nav.raid:GetAlpha() }"), "the nav keeps the hit's page lit and dims the rest").toEqual([1, 0.35]);
  expect(found("brass rule")[0], "the note under a setting").toEqual(["Window ornaments"]);
  expect(found("reload minimap")[0], "a setting that applies on reload").toContain("Minimap shape");
  const many = found("a");
  expect([many[0].length, many[1]], "past eight hits the list says how many more").toEqual([8, expect.stringMatching(/^\d+ more: type more words$/)]);
  expect(found("backup")[1], "eight or fewer: no last line").toBe("");
});

it("options: a live row of a module that is off saves its value without an error", () => {
  const addon = loggedIn(RETAIL + CLICK_LUA + DATA_ENV, { savedVariables: "VanguardDB.profiles.Default = { modules = { CooldownGlow = false, GameAlerts = false, ActionBars = false } }\n" });
  addon.eval('ns.Options.Show("cooldowns")');
  addon.eval('__click("Glow a buff near its end")');
  addon.eval('ns.Options.Show("tools")');
  addon.eval('__click("Low health: a soft tint")');
  addon.eval('ns.Options.Show("actionbars")');
  addon.eval('__click("Bar backing")');
  expect(addon.eval("return { #ns.errors, ns.Settings('CooldownGlow').glow }"), "no error, and the switch is saved").toEqual([0, true]);
});
it("controls: clicking a choice row's caption with an empty list does nothing and raises no error", () => {
  const addon = loggedIn();
  const r = addon.eval(`__set = "unset"
    local row = ns.Widgets.Choice(UIParent, "TEST-ONLY Frame to size", {}, function() return nil end, function(v) __set = v end)
    row:GetScript("OnClick")(row)
    return { __set, #ns.errors }`);
  expect(r, "nothing is set").toEqual(["unset", 0]);
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
  expect(addon.eval('return __click("Also on your player, target and focus frames")') === true, "unit-frame click casting is a switch on the page").toBeTruthy();
  expect(addon.eval("return ns.Settings('ClickCast').unitFrames") === true, "the switch turns it on").toBeTruthy();
});

it("options: a slider drag and a key capture end when their window hides, and a failing drag step is caught under its name", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  const out = addon.eval(`
    local row
    for _, w in ipairs(__wfgStub.frames) do
      if w.track and w.min and w.label and w.label.__text == "Text size" then row = w end
    end
    row.set(row.min) row:Refresh()
    row.track.__left, row.track.__width = 0, 100
    GetCursorPosition = function() return 50 end
    row.track:GetScript("OnMouseDown")()
    local during = { row.dragging, row.track:GetScript("OnUpdate") ~= nil }
    Vanguard_Options:Hide()
    local hidden = { row.dragging, row.track:GetScript("OnUpdate") == nil }
    local before = row.get()
    GetCursorPosition = function() return 100 end
    __wfgStub.update(0.05)
    -- TEST-ONLY widget: a key capture, as a page would build it.
    local cap = ns.Widgets.KeyCapture(UIParent, "Set key", function() end)
    cap:GetScript("OnClick")(cap)
    cap:Hide()
    return { during = during, hidden = hidden, unchanged = row.get() == before, capturing = cap.capturing, caption = cap.text:GetText() }
  `);
  expect(out.during, "mouse down on the track follows the cursor").toEqual([true, true]);
  expect([out.hidden, out.unchanged], "the window closing mid-drag stops the drag: no cursor following, the setting stays").toEqual([[false, true], true]);
  expect([out.capturing, out.caption], "hiding a key capture cancels it and puts its caption back").toEqual([false, "Set key"]);
  expectErrors("slider drag: eval:7: TEST-ONLY drag");
  addon.eval(`local row
    for _, w in ipairs(__wfgStub.frames) do
      if w.track and w.min and w.label and w.label.__text == "Text size" then row = w end
    end
    row.track.__left, row.track.__width = 0, 100
    GetCursorPosition = function() error("TEST-ONLY drag") end
    ns.Options.Show("general")
    row.track:GetScript("OnMouseDown")()
    __wfgStub.update(0.05)`);
  expect(addon.eval("return ns.errors[1].text"), "a drag step that fails is caught under its name").toMatch(/^slider drag: .*TEST-ONLY drag$/);
});

// TEST-ONLY key captures, as a page would build them, with their keyboard calls logged ("calm:true", "fight:false").
const CAPTURES_LUA = `
  __caps = {}
  for i = 1, 2 do
    local cap = ns.Widgets.KeyCapture(UIParent, "Set key", function() end)
    cap.__kb = {}
    local enable = cap.EnableKeyboard
    cap.EnableKeyboard = function(self, on) self.__kb[#self.__kb + 1] = (InCombatLockdown() and "fight:" or "calm:") .. tostring(on) return enable(self, on) end
    __caps[i] = cap
  end`;
// Each capture's state: [capturing, caption, its keyboard calls].
const captures = (addon) => addon.eval("local out = {} for i, c in ipairs(__caps) do out[i] = { c.capturing == true, c.text:GetText(), table.concat(c.__kb, ',') } end return out");

it("a fight starting cancels every armed key capture, so the fight's first key is not swallowed (V6-1)", () => {
  const addon = loggedIn(CLICK_LUA + CAPTURES_LUA);
  addon.eval("for _, c in ipairs(__caps) do c:GetScript('OnClick')(c) end");
  expect(captures(addon).map((c) => c[0]), "both armed").toEqual([true, true]);
  addon.world.combat(true);
  expect(captures(addon), "the fight: both off, captions back, the keyboard turned off as the fight starts (before lockdown)").toEqual([[false, "Set key", "calm:true,calm:false"], [false, "Set key", "calm:true,calm:false"]]);
  addon.eval("__caps[1]:GetScript('OnKeyDown')(__caps[1], '1')");
  expect(addon.eval("return Vanguard_SpellPicker and Vanguard_SpellPicker:IsShown() or false"), "a key in the fight is not captured").toBe(false);
});

it("clicking a key capture in a fight arms nothing", () => {
  const addon = loggedIn(CLICK_LUA + CAPTURES_LUA);
  addon.world.combat(true);
  addon.eval("__caps[1]:GetScript('OnClick')(__caps[1])");
  expect(captures(addon)[0], "not capturing, the caption unchanged, the keyboard never turned on").toEqual([false, "Set key", ""]);
  addon.world.combat(false);
  addon.eval("__caps[1]:GetScript('OnClick')(__caps[1])");
  expect(captures(addon)[0].slice(0, 2), "after the fight it arms as before").toEqual([true, "Press a key, click or scroll..."]);
});

// The visible slider row whose caption starts with this text, as Lua.
const sliderRow = (text) => `(function() for _, w in ipairs(__wfgStub.frames) do
  if w.track and w.label and w.label.__text:sub(1, #"${text}") == "${text}" and ns.Options.RevealRow(w) then return w end end end)()`;

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

it("options: Frame to size picked as Chat while the client hides the chat window's size: the size sliders sit at their start, with no error", () => {
  const addon = loggedIn(UI_ENV + CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  addon.world.secretGeometry("strict");
  addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.dropdown and w.caption == "Frame to size" then __d = w.dropdown end end __d:GetScript("OnClick")(__d)');
  addon.eval('for _ = 1, 60 do for _, b in ipairs(Vanguard_Menu.items) do if b:IsShown() and b.text:GetText() == "Chat" then b:GetScript("OnClick")(b) return end end Vanguard_Menu:GetScript("OnMouseWheel")(Vanguard_Menu, -1) end');
  expect(addon.eval("return ns.Options.sizedMover"), "Chat is the frame to size").toBe("chat");
  const sliders = addon.eval(`local w, h = ${sliderRow("Its width")}, ${sliderRow("Its height")} w:Refresh() h:Refresh() return { w.get(), h.get(), #ns.errors }`);
  expect(sliders, "its hidden width and height read 0 and the sliders refresh with nothing caught").toEqual([0, 0, 0]);
});

// The reset dot on the visible row whose caption starts with this text: { shown, has a dot }.
const resetDot = (addon, text) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do
  if w.label and type(w.label.__text) == "string" and w.label.__text:sub(1, #"${text}") == "${text}" and ns.Options.RevealRow(w) then
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
    function GameTooltip:SetText(t) self.__tip = t end function GameTooltip:AddLine(t) self.__line = t end`);
  addon.eval('__click("Nameplates")');
  addon.eval('__click("Width")');
  expect(resetDot(addon, "Width"), "choices get one too").toEqual([true, true]);
  addon.eval('__click("Width") __click("Width")');
  expect(resetDot(addon, "Width")[0], "and lose it back at the default").toBe(false);
  addon.eval('__click("Cast bar")');
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.reset and w.reset:IsShown() then __dot = w.reset end end __dot:GetScript("OnEnter")(__dot)`);
  expect(addon.eval("return { GameTooltip.__owner == __dot, GameTooltip:IsShown(), GameTooltip.__tip }"), "hovering the dot says what it does").toEqual([true, true, "Changed from the default. Click to put it back."]);
  expect(addon.eval("return GameTooltip.__line"), "then what the default is, in the row's words").toMatch(/^Default: (On|Off)$/);
  addon.eval("__dot:GetScript('OnLeave')(__dot)");
  expect(addon.eval("return GameTooltip:IsShown()"), "and the tooltip goes when the mouse leaves").toBe(false);
});

// Each visible row's caption and the default its reset dot names, as Lua.
const DEFAULTS_LUA = `local out = {} for _, w in ipairs(__wfgStub.frames) do
  if w.reset and w.label and ns.Options.RevealRow(w) then out[w.label.__text] = w.reset.defaultText end end return out`;

it("options: the changed dot names the default as the row shows it, for switches, choices and sliders", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("actionbars")');
  const bars = addon.eval(DEFAULTS_LUA);
  expect([bars["Red when out of range"], bars["Bar backing"]], "a switch's On, a choice's label").toEqual(["On", "Follow the theme"]);
  addon.eval('ns.Options.Show("general")');
  expect(addon.eval(DEFAULTS_LUA)["Its scale"], "a slider's text").toBe("100%");
});

// The own-switch note beside a visible module row's name, as Lua (nil for a row with no link).
const ownSwitch = (name) => `(function() for _, w in ipairs(__wfgStub.frames) do
  if w.ownSwitch ~= nil and w.label.__text == "${name}" and ns.Options.RevealRow(w) then return w.ownSwitch.__text end end end)()`;

it("options: a module that is on while its own switch inside is off says so beside its name, and the note goes with the switch", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("modules")');
  expect(addon.eval(`return ${ownSwitch("Vanguard meter")}`), "the meter's own switch starts off").toBe("On, but its own switch is off (Combat tools)");
  addon.eval('ns.Settings("Meter").on = true ns.Options.Show("tools") ns.Options.Show("modules")');
  expect(addon.eval(`return ${ownSwitch("Vanguard meter")}`), "on: the note goes").toBe("");
  addon.eval('ns.Settings("SpellRanks").trainerMemory = true ns.SetModuleEnabled("MailTools", false) ns.Options.Show("general") ns.Options.Show("modules")');
  expect([addon.eval(`return ${ownSwitch("Spell ranks")}`), addon.eval(`return ${ownSwitch("Mail tools")}`)], "one of two own switches on is enough; a module that is off needs no note").toEqual(["", ""]);
  expect(addon.eval(`return ${ownSwitch("Unit frames")}`), "a module with no own switch has no note").toBe(null);
});

// The visible options page's scroll view, as Lua.
const PAGE_VIEW = "(function() for _, w in ipairs(__wfgStub.frames) do if w.fadeTop and ns.Options.RevealRow(w) then return w end end end)()";

// The visible row whose caption is this text, as Lua.
const rowNamed = (text) => `(function() for _, w in ipairs(__wfgStub.frames) do
  if w.label and w.label.__text == "${text}" and ns.Options.RevealRow(w) then return w end end end)()`;

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
  addon.eval('ns.Options.Show("actionbars") ns.Options.ShowTab("Bar 1")');
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
  expect(wheelOver("Show bar 1", -1)[3], "over a switch: the page scrolls").toBe(160);
  expect(wheelOver("Buttons", 1), "up scrolls back").toEqual([12, 12, "always", 120]);
  expect(addon.eval(`return { ${rowNamed("Buttons")}:IsMouseWheelEnabled(), ${rowNamed("Visibility")}:IsMouseWheelEnabled(), ${PAGE_VIEW}:IsMouseWheelEnabled() }`), "no value row takes the wheel; the page does").toEqual([false, false, true]);
  addon.eval(`local r = ${rowNamed("Buttons")} r:GetScript("OnClick")(r)`);
  expect(addon.eval("return ns.Settings('ActionBars').bars[1].buttons"), "a click on the caption still changes it (12 wraps to 1)").toBe(1);
});

it("options: Bar 1's Show when chips sit inside the card, inset like every other row's control", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("actionbars")');
  const fit = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.chips and ns.Options.RevealRow(w) then
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
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.reset and w.reset:IsShown() and ns.Options.RevealRow(w) then __dot = w.reset end end __dot:GetScript("OnClick")(__dot)`);
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
  expect(keyRow(addon), "Tab marks the first row that does something (the sample and the swatches are skipped)").toEqual(["Safer colours", true, true]);
  press(addon, "TAB");
  expect(keyRow(addon)[0], "Tab again: the next").toBe("Follow the game's colour-blind mode");
  press(addon, "TAB");
  expect(keyRow(addon)[0], "and the next after it").toBe("Font");
  addon.keys({ shift: true });
  press(addon, "TAB");
  press(addon, "TAB");
  press(addon, "TAB");
  addon.keys({ shift: false });
  const last = keyRow(addon);
  expect([last[0], last[2], addon.eval("return Vanguard_Options.found:IsShown()")], "Shift-Tab goes back, and past the first wraps to the last row that works: the page's Reset this page is greyed out until something changed, so it is skipped").toEqual(["Reset theme", true, true]);
  press(addon, "TAB");
  expect(keyRow(addon), "and Tab from the last wraps to the first, scrolled back up").toEqual(["Safer colours", true, true]);
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

it("options: Tab skips a greyed-out button row, so Enter can never press the Meter's report with the meter off", () => {
  const addon = loggedIn(CLICK_LUA, { savedVariables: "VanguardDB.profiles.Default = { modules = { Meter = false } }" });
  addon.eval('ns.Options.Show("tools")');
  const reached = addon.eval(`local f, seen = Vanguard_Options, {}
    for tab = 1, 10 do
      if not ns.Options.ShowTab(tab) then break end
      for n = 1, 40 do
        f.__scripts.OnKeyDown(f, "TAB")
        if f.focusRow then seen[f.focusRow.caption or "?"] = true end
      end
    end
    return seen`);
  expect(reached[addon.eval("return ns.L[\"Report the meter's top lines\"]")], "the greyed-out row never gets the keyboard").toBeUndefined();
  expect(addon.eval("return #ns.errors"), "and nothing ran").toBe(0);
});

it("options: Enter on a row that was disabled after it took the keyboard does not press it", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  // TEST-ONLY spy on the window's keyboard call.
  addon.eval("Vanguard_Options.SetPropagateKeyboardInput = function(self, v) self.__passed = v end");
  press(addon, "TAB");
  addon.eval("local w = Vanguard_Options.focusRow __pressed = 0 w:SetScript('OnClick', function() __pressed = __pressed + 1 end) w:Disable()");
  expect([press(addon, "ENTER")[1], addon.eval("return __pressed")], "the key is used and the greyed-out row does nothing").toEqual([false, 0]);
  addon.eval("Vanguard_Options.focusRow:Enable()");
  press(addon, "ENTER");
  expect(addon.eval("return __pressed"), "once it is enabled again, Enter presses it").toBe(1);
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
  const sample = () => addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.unit and w.button and ns.Options.RevealRow(w) then
    local u, b = w.unit, w.button local font, size = u.name:GetFont()
    return { u.health:GetStatusBarTexture():GetTexture(), u.power:GetStatusBarTexture():GetTexture(), font, size, b.glow[1].__vertexColor, b.glow[1]:IsShown(),
      u.name:GetText(), u.value:GetText(), b.hotkey:GetText(), b.count:GetText() } end end`);
  const first = sample();
  expect([first[0], first[1], first[3], first.slice(5)], "a unit frame with the Vanguard bars, the player's own name at 12, and a button with its key, count and glow")
    .toEqual(["Interface\\AddOns\\Vanguard\\Media\\Textures\\Bar", "Interface\\AddOns\\Vanguard\\Media\\Textures\\Bar", 12, [true, "Tester", "72%", "1", "5"]]);
  expect(isTok(addon, first[4], "accent"), "the glow is in the accent").toBe(true);
  addon.eval("ns.Theme.SetAccent(ns.Theme.PRESETS.jade[1], ns.Theme.PRESETS.jade[2], ns.Theme.PRESETS.jade[3])");
  expect(sample()[4].slice(0, 3), "a new accent shows at once").toEqual(addon.eval("return ns.Theme.PRESETS.jade").slice(0, 3));
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.track and w.label and w.label.__text == "Text size" and ns.Options.RevealRow(w) then w.set(1.3) w:Refresh() end end`);
  expect(sample()[3], "so does the text size (12 at 130%)").toBe(16);
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.dropdown and w.caption == "Font" and ns.Options.RevealRow(w) then w.dropdown.set("client") end end`);
  expect(sample()[2], "and the font").toBe(addon.eval("return STANDARD_TEXT_FONT or 'Fonts\\\\FRIZQT__.TTF'"));
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.dropdown and w.caption == "Bar texture" and ns.Options.RevealRow(w) then w.dropdown.set("TEST-ONLY Bar") end end`);
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
  addon.eval('VanguardDB.profiles.Default.Chat.textSize = 0 FCF_SetChatWindowFontSize(nil, ChatFrame1, 18)');
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
const BUFF_EDITOR = "for _, w in ipairs(__wfgStub.frames) do if w.input and w.save and ns.Options.RevealRow(w) then __editor = w end end";

it("options: the Healing page opens and saves its buff list with the raid heals module switched off", () => {
  const addon = loggedIn(spellNames(BUFF_NAMES), { savedVariables: "VanguardDB.profiles.Default = { modules = { RaidHealing = false } }" });
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
  const groups = { social: "Mail, guild, channels, friends and guild-creation windows", town: "Stable, trainer, merchant, bags, loot and item dialogs",
    system: "Game options, Edit Mode, keybinding and help windows", map: "World map, group finder, calendar and Legacy windows",
    menus: "Right-click menus, dropdowns and more tooltips", tabs: "Tab buttons and the inside of the character pane", pvp: "Battleground windows" };
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
    for _, w in ipairs(__wfgStub.frames) do if w.__scrollChild and w.__scripts.OnMouseWheel and ns.Options.RevealRow(w) then view = w end end
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
    "general|General|10|40", "modules|Modules|20|87", "unitframes|Unit frames|30|34", "raid|Raid frames|40|26",
    "actionbars|Action bars|60|74", "quests|Quests|70|29", "bars|Bars and bags|80|17", "map|Map|81|36", "chat|Chat|82|82", "windows|Game windows|83|47", "cooldowns|Cooldowns|83.5|13", "tools|Combat tools|84|39", "town|Town and gear|85|57", "profiles|Profiles|90|22",
    "feedback|Feedback|100|11", "healing|Healing|45|44", "talents|Talents|47|7", "nameplates|Nameplates|65|18",
    "situations|Situations|86|16", "clickcast|Click casting|46|11",
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
      if w.knob and w.get and ns.Options.RevealRow(w) then __swRow = w end
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

it("profiles: an armed Delete asks again after the window was closed, so one later click deletes nothing", () => {
  const addon = loggedIn(CLICK_LUA + 'VanguardDB.profiles["TEST-ONLY Spare"] = {}');
  addon.eval('ns.Options.Show("profiles")');
  expect(addon.eval('return __click("Delete")'), "the first click arms Delete").toBe(true);
  addon.eval("ns.Options.Hide() Vanguard_Options:Hide()");
  addon.eval('ns.Options.Show("general") ns.Options.Hide() Vanguard_Options:Hide() ns.Options.Show("profiles")');
  expect(addon.eval('return { __click("Sure?"), VanguardDB.profiles["TEST-ONLY Spare"] ~= nil }'), "no button still says Sure?, and the profile is still there").toEqual([false, true]);
  expect([addon.eval('return __click("Delete")'), addon.eval('return __click("Sure?")'), addon.eval('return VanguardDB.profiles["TEST-ONLY Spare"] == nil')], "two clicks still delete it").toEqual([true, true, true]);
});
it("profiles: Use is a plain button, so Create is the page's one accent button", () => {
  const addon = loggedIn(CLICK_LUA + 'VanguardDB.profiles["TEST-ONLY Healer"] = {}');
  addon.eval('ns.Options.Show("profiles")');
  const buttons = addon.eval(`local out = {} for _, w in ipairs(__wfgStub.frames) do
    if w.use and ns.Options.RevealRow(w) then out.use = { w.use.fill ~= nil, w.use.text:GetText(), w.use.text.__textColor, w.use:GetHeight(), w.use:GetWidth() } end
    if w.create and ns.Options.RevealRow(w) then out.create = { w.create.text.__textColor, w.create.text:GetText(), w.create:GetHeight(), w.create:GetWidth() } end end return out`);
  expect(buttons.use, "Use: no accent fill, the text colour, a standalone button at the row's small width").toEqual([false, "Use", tok(addon, "text"), 26, 84]);
  expect(buttons.create, "Create: the primary kind (a dark label on the accent fill), the same size").toEqual([tok(addon, "void"), "Create", 26, 84]);
});

it("options: the sample unit frame shows the player's own name, or You when the client hides it, and the sample button Vanguard's crest", () => {
  const addon = loggedIn();
  addon.eval('ns.Options.Show("general")');
  // The sample row refreshed: the name shown and the button's icon.
  const sample = () => addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.unit and w.button and ns.Options.RevealRow(w) then
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

it("options: a card's title (on a page of one card; tabs name the cards of the others) is a section header: capitals in small muted text, an 18 high band 12 in from the card's edge and as wide as the card's inside", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("nameplates")');
  const head = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.text and w.text.__text == "NAMEPLATES" and ns.Options.RevealRow(w) then
    return { w.__kind, w:GetHeight(), w:GetWidth(), w.__points.TOPLEFT.x, w.__points.TOPLEFT.y, w.__parent:GetWidth() } end end`);
  expect(head, "a Button 18 tall, the card less its 12 of padding on both sides wide, at 12 across and 12 down in the card").toEqual(["Button", 18, 568 - 24, 12, -12, 568]);
  const title = '(function() for _, w in ipairs(__wfgStub.frames) do if w.text and w.text.__text == "NAMEPLATES" and ns.Options.RevealRow(w) then return w.text end end end)()';
  expect(lookOf(addon, title, "muted"), "the title is small muted text, in capitals").toEqual([addon.eval("return ns.Theme.RoleSize('small')"), true]);
});

it("options: a long page scrolls in the shared view: the thumb is T.SCROLL.thumb wide at the rest alpha, 12 right of the view, the wheel moves it 40 and the thumb and top edge follow; a short page has no thumb", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("modules")');
  // The visible page view: scroll, child height, view height, thumb shown, width, alpha, offset right of the view, top edge shown.
  const view = () => addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.fadeTop and ns.Options.RevealRow(w) then
    return { math.floor(w:GetVerticalScroll()), w.child:GetHeight() > w:GetHeight(), w.thumb:IsShown(), w.thumb:GetWidth(), w.thumb:GetAlpha(), (w.thumb.__points.TOPRIGHT or {}).x, w.fadeTop:IsShown() } end end`);
  const [scroll, overflows, shown, width, alpha, out, top] = view();
  expect([scroll, overflows, shown, alpha, out, top], "Modules' Unit frames tab is taller than its view: the thumb shows at the rest alpha, 12 right of the view; at the top").toEqual([0, true, true, addon.eval("return ns.Theme.SCROLL.rest"), 12, false]);
  expect(width, "T.SCROLL.thumb wide").toBe(addon.eval("return ns.Theme.SCROLL.thumb"));
  // How far down the view its thumb sits.
  const thumbTop = () => addon.eval("for _, w in ipairs(__wfgStub.frames) do if w.fadeTop and ns.Options.RevealRow(w) then return -w.thumb.__points.TOPRIGHT.y end end");
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.fadeTop and ns.Options.RevealRow(w) then __page = w end end`);
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
  for (const caption of ["Safer colours", "Faction look", "Theme variant", "Corners", "Window ornaments", "Pixel-perfect scale"]) expect(at(caption), caption + " is a caption on the page").not.toBeNull();
  for (const old of ["Color assist: friendly blue, neutral yellow, hostile vermilion", "Theme variant: surfaces and text", "Corners: square or rounded panels", "Window ornaments: a brass rule or corners on large windows", "Pixel perfect scale"]) expect(at(old), old + " is gone").toBeNull();
  const notes = [["Safer colours", "Friendly blue, neutral yellow, hostile vermilion, and colours for Magic, Curse, Disease and Poison that stay apart."], ["Window ornaments", "A brass rule or corners on large windows."]];
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
  // The three buttons of the General page's Layout tab: caption, height and how far down their rows start.
  const buttons = addon.eval(`local out = {} for _, w in ipairs(__wfgStub.frames) do if w.caption and w.__kind == "Button" and ns.Options.RevealRow(w) and w.card.tabName == "Layout"
    and (w.caption == "Run setup" or w.caption == "What's new" or w.caption == "Move frames") then out[#out + 1] = { w.caption, w:GetHeight(), -w.__points.TOPLEFT.y } end end
    table.sort(out, function(a, b) return a[3] < b[3] end) return out`);
  const buttonH = addon.eval("return ns.Theme.BUTTON_H");
  expect(buttons.map((b) => b[1]), "each is T.BUTTON_H tall, not 28").toEqual([buttonH, buttonH, buttonH]);
  expect([buttons[1][2] - buttons[0][2], buttons[2][2] - buttons[1][2]], "and the rows stay 32 apart").toEqual([32, 32]);
  addon.eval('ns.Options.Show("modules")');
  const desc = addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.desc and w.label.__text == "Unit frames" and ns.Options.RevealRow(w) then return { select(2, w.desc:GetFont()), w.desc.__textColor } end end');
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
  expect(out[9], "a caption stops a gap short of the column").toBe(400 - 200 - 16 - 8);
});

it("a wrapped caption keeps a gap from the dropdown and the slider track it sits beside (P3-5)", () => {
  const addon = loggedIn();
  // How far a row's caption ends from its control's left edge (the dropdown, or else the slider track), in screen units.
  const gap = (make) => addon.eval(`local W = ns.Widgets
    local r = ${make}
    r:SetPoint("CENTER")
    local control = r.dropdown or r.track
    return control:GetLeft() - (r.label:GetLeft() + r.label:GetWidth())`);
  const many = Array.from({ length: 12 }, (_, i) => `{ ${i}, "Choice number ${i}" }`).join(", ");
  expect(gap('W.Slider(UIParent, "Size", { min = 0, max = 10, step = 1 }, function() return 5 end, print, 400)'), "slider").toBe(8);
  expect(gap(`W.Choice(UIParent, "A caption", { ${many} }, function() return 1 end, print, 400)`), "dropdown").toBe(8);
  expect(addon.eval(`return ns.Widgets.Slider(UIParent, "Q", { min = 0, max = 10, step = 1 }, function() return 5 end, print, 248).label:GetWidth()`), "a row too narrow to spare the gap keeps its caption's room").toBe(32);
});

it("a choice row too narrow for a 200 wide dropdown gives the dropdown half the row and the caption the rest (B10-5)", () => {
  const addon = loggedIn();
  const many = Array.from({ length: 12 }, (_, i) => `{ ${i}, "Choice number ${i}" }`).join(", ");
  const [dropdown, caption, clear] = addon.eval(`local r = ns.Widgets.Choice(UIParent, "Undercut by", { ${many} }, function() return 1 end, print, 268)
    r:SetPoint("CENTER")
    return { r.dropdown:GetWidth(), r.label:GetWidth(), r.label:GetLeft() + r.label:GetWidth() <= r.dropdown:GetLeft() }`);
  expect([dropdown, caption > 100, clear], "half of 268, a caption wider than 100, and the caption ends before the dropdown").toEqual([134, true, true]);
  expect(addon.eval(`return ns.Widgets.Choice(UIParent, "Wide", { ${many} }, function() return 1 end, print, 400).dropdown:GetWidth()`), "a 400 wide row keeps the 200 wide dropdown").toBe(200);
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

it("a search box's hint stays inside the box, on one line, when a translation at a large text size is longer than the box (P2-7)", () => {
  const addon = loggedIn("", { client: 'GetLocale = function() return "frFR" end' });
  addon.eval(`ns.Theme.Settings().textScale = 1.3
    __box = ns.Widgets.Search(UIParent, 190, "Rechercher dans les réglages", function() end) __box:SetPoint("CENTER")`);
  const out = addon.eval(`local T, h = ns.Theme, __box.hint
    return { h:GetRight() <= __box:GetRight() - T.CONTROL_H, h:GetUnboundedStringWidth() > __box:GetWidth() - T.SEARCH_INSET - T.CONTROL_H, h:CanWordWrap(), h.__justifyH }`);
  expect(out[1], "the hint is longer than the room it has, so the test means something").toBe(true);
  expect([out[0], out[2], out[3]], "it ends where the clear glyph's room begins, on one line, left-aligned").toEqual([true, false, "LEFT"]);
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

it("a dropdown menu opens above its dropdown when the screen's bottom is nearer than the menu is tall, and below it otherwise (P1-3)", () => {
  const addon = loggedIn("__wfgStub.setScreen(835, 668)");
  openDropdown(addon, 17);
  // Where the open menu hangs: its point, the point it hangs from and the y offset.
  const hang = (bottom) => {
    addon.eval(`ns.Widgets.CloseMenu() __dd:ClearAllPoints() __dd:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", 100, ${bottom}) __dd.__scripts.OnClick(__dd)`);
    return addon.eval("local p, rel, rp, x, y = Vanguard_Menu:GetPoint() return { p, rel == __dd, rp, y }");
  };
  expect(hang(188), "17 choices (322 tall) with 188 units below: over the dropdown").toEqual(["BOTTOMLEFT", true, "TOPLEFT", 2]);
  expect(hang(400), "room for the menu: under it as before").toEqual(["TOPLEFT", true, "BOTTOMLEFT", -2]);
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
  addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.track and w.min and w.label and w.label.__text == "Text size" and ns.Options.RevealRow(w) then __sl = w end end`);
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
// Whether the options window shows its reload notice.
const reloadNotice = (addon) => addon.eval("return Vanguard_Options.notice:IsShown()");
it("Reset theme: a reset that only changes the accent needs no reload", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.slash("accent arcane");
  addon.eval('ns.Options.Show("general") __click("Reset theme")');
  expect(reloadNotice(addon), "no notice").toBe(false);
  addon.slash("theme reset");
  expect(chatHas(addon, /Theme back to defaults\.$/), "chat says it plainly").toBe(true);
});
it("Reset theme with Safer colours on shows the reload notice, and /vg theme reset says to reload", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Theme.Settings().colorAssist = true ns.Options.Show("general") __click("Reset theme")');
  expect([addon.eval("return ns.Theme.Settings().colorAssist"), reloadNotice(addon)], "Safer colours is off, after a reload").toEqual([false, true]);
  addon.eval("ns.Theme.Settings().hudShadow = true");
  addon.slash("theme reset");
  expect(chatHas(addon, /Theme back to defaults \(reload to apply\)\.$/), "the command says so").toBe(true);
});
it("Reset theme with Pixel-perfect scale on shows the reload notice, since its scale stays until then", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Theme.SetPixelScale(true) ns.Options.Show("general") __click("Reset theme")');
  expect([addon.eval("return ns.Theme.Settings().pixelScale"), reloadNotice(addon)]).toEqual([false, true]);
});
it("a page rebuilt while it shows (a module filter picked on the Modules page) keeps its tab and its scroll", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("modules") ns.Options.ShowTab("Town and gear")');
  const out = addon.eval(`
    local function view() for _, c in ipairs({ Vanguard_Options:GetChildren() }) do if c.child and c.child.pageKey == "modules" and c:IsShown() then return c end end end
    local v = view() v:ScrollTo(200) local before = v:GetVerticalScroll()
    ns.Options.RebuildPage("modules")
    return { before, view() ~= v, view():GetVerticalScroll(), view().cards[view().tab].tabName }`);
  expect(out, "a new view, on the same tab at the old offset").toEqual([200, true, 200, "Town and gear"]);
});
it("Window ornaments applies at once and asks for no reload", () => {
  const addon = loggedIn(CLICK_LUA);
  // The diamond rule's textures showing on the options window.
  const diamonds = () => addon.eval(`local n = 0 for _, w in ipairs(__wfgStub.frames) do
    if w.__kind == "Texture" and w.__parent == Vanguard_Options and w:IsShown() and tostring(w.__texture):find("Diamond") then n = n + 1 end end return n`);
  addon.eval('ns.Options.Show("general")');
  expect(diamonds(), "off by default").toBe(0);
  expect(addon.eval('return __click("Window ornaments")')).toBe(true);
  expect([diamonds(), reloadNotice(addon)], "the rule shows at once; no reload notice").toEqual([1, false]);
});
it("Modules page: every module it groups has a name and a line saying what it does", () => {
  const addon = loggedIn();
  const missing = addon.eval(`local out = {}
    for _, group in ipairs(ns.Options.MODULE_GROUPS) do
      for _, name in ipairs(group[2]) do
        local info = ns.Options.MODULE_INFO[name]
        if not (info and type(info[1]) == "string" and type(info[2]) == "string" and info[2] ~= "") then out[#out + 1] = name end
      end
    end
    return out`);
  expect(missing, "modules shown by their code name with no description").toEqual({});
});

// One test per client language Vanguard translates into (each runs its Locales/ file), so each stays inside the time limit under coverage.
for (const locale of ["deDE", "frFR", "esES", "esMX", "itIT", "ptBR", "ruRU", "koKR", "zhCN", "zhTW"]) {
  it(`options: on a ${locale} client Vanguard loads and the options window opens and every page builds its rows with no error, in that language`, () => {
    const addon = loggedIn(CLICK_LUA, { client: `GetLocale = function() return "${locale}" end` });
    // Opens the window, then builds every page's rows and counts the errors caught along the way.
    const opened = addon.eval('ns.Options.Show("general") local n = 0 for _, p in ipairs(ns.Options.PAGES) do if #p.rows() > 0 then n = n + 1 end end return { n, #ns.errors, Vanguard_Options:IsShown() }');
    expect(opened, `${locale}: all 20 pages build rows, no error caught, the window is up`).toEqual([20, 0, true]);
    expect(addon.eval('return ns.L["Run setup"] ~= "Run setup" and ns.English(ns.L["Run setup"]) == "Run setup"'), `${locale}: its Locales file is loaded`).toBe(true);
  });
}

// Every shown text on the options page now that runs past the left or right edge of the frame it sits on, as
// "page | text". A module row's own-switch note is left out: it sits after its caption as measured, and the harness
// measures a held caption at its full held width, which the client doesn't.
const SPILLS_LUA = `function __spills(page)
  local out = {}
  local function shown(f) while f do if not f.__shown then return false end f = f.__parent end return true end
  for _, w in ipairs(__wfgStub.frames) do
    local p = w.__parent
    if w.__kind == "FontString" and (w.__text or "") ~= "" and p and p.ownSwitch ~= w and shown(w) then
      local l, r, pl, pr = w:GetLeft(), w:GetRight(), p:GetLeft(), p:GetRight()
      if l < pl - 0.5 or r > pr + 0.5 or w:GetUnboundedStringWidth() > (w.__width or math.huge) + 0.5 and w.__noWrap then out[#out + 1] = page .. " | " .. w.__text end
    end
  end
  return out
end`;

it("options: no text runs past the button, row or card it sits on, on any page", () => {
  const addon = loggedIn(CLICK_LUA + DATA_ENV + SPILLS_LUA);
  addon.slash("");
  const spills = addon.eval(`local out = {}
    for _, page in ipairs(ns.Options.NavOrder()) do
      ns.Options.Show(page.key)
      for _, line in ipairs(__spills(page.key)) do out[#out + 1] = line end
    end
    return out`);
  expect(spills, "every label fits inside its control").toEqual({});
});

it("options: a card's buttons share one width, wide enough for its longest label (the officer loot tools), else 220", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("tools")');
  // The width of the shown button whose label starts so, and its label's width as drawn.
  const width = (label) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do
    if w.text and w.card and ns.Options.RevealRow(w) and (w.text.__text or ""):sub(1, ${label.length}) == "${label}" then return { w:GetWidth(), w.text:GetUnboundedStringWidth() } end end`);
  const [party, partyText] = width("Put the list in the chat box for the party");
  expect(party, "the longest loot label sets its card's width, with 12 of air each side").toBe(partyText + 24);
  expect(width("Clear every reserve")[0], "the card's short labels take the same width").toBe(party);
  expect(width("Report the meter's top lines")[0], "the meter's buttons fit in the usual 220").toBe(220);
});

it("options: a button label too long for its card is held to the card's inside width and cut short there", () => {
  const long = "A ".repeat(200);
  const addon = loggedIn(CLICK_LUA + `ns.Options.AddRows("tools", function() return { { "header", "TEST-ONLY" }, { "button", "${long}", function() end } } end)`);
  addon.eval('ns.Options.Show("tools")');
  const sized = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.card and w.text and w.text.__text == "${long}" then
    return { w:GetWidth(), w.text:GetWidth(), w.text.__noWrap, w.card:GetWidth(), w.text:GetTextScale() } end end`);
  expect(sized, "the button spans the card less its inset each side; the label, 12 less each side, on one line, shrunk to the floor, then cut")
    .toEqual([sized[3] - 2 * addon.eval("return ns.Theme.SPACE.col"), sized[0] - 24, true, sized[3], addon.eval("return ns.Theme.FIT_FLOOR")]);
});

it("options: a dropdown's menu widens to its longest choice and keeps the dropdown's width when every choice fits", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("general")');
  // Opens the shown dropdown holding a choice with this label; the menu's width, the dropdown's, and the longest label's.
  const open = (label) => addon.eval(`for _, d in ipairs(__wfgStub.frames) do
    if d.arrow and d.choices and d:IsVisible() then
      local list, has, longest = type(d.choices) == "function" and d.choices() or d.choices, false, 0
      for _, c in ipairs(list) do has = has or c[2] == "${label}" longest = math.max(longest, #c[2] * 6) end
      if has then d.__scripts.OnClick(d) return { Vanguard_Menu:GetWidth(), d:GetWidth(), longest } end
    end end`);
  const [wide, , longest] = open("Blizzard Dialog Background Dark");
  expect(wide, "the texture list: the longest name, its inset, the gap and the check mark").toBe(longest + 30);
  addon.eval("ns.Widgets.CloseMenu()");
  const [menu, dropdown] = open("Midnight");
  expect(menu, "a short list keeps the dropdown's width").toBe(dropdown);
});

// The options window in the text-fit client (every string a third longer, as a translation might run), at this Text size.
function fitOptions(textScale) {
  const addon = createAddon({ savedVariables: SETUP_DONE, textFit: true });
  addon.login();
  if (textScale) addon.eval(`ns.Theme.Settings().textScale = ${textScale} ns.Theme.Refresh()`);
  return addon;
}

it("options: a module row grows to hold a description that wraps past two lines, so it never runs into the next row", () => {
  const addon = fitOptions(1.3);
  addon.eval('ns.Options.Show("modules")');
  const short = addon.eval(`local out = {} for _, w in ipairs(__wfgStub.frames) do
    if w.desc and w.label and ns.Options.RevealRow(w) and w:GetHeight() < 12 + w.label:GetStringHeight() + ns.Theme.SPACE.tight + w.desc:GetStringHeight() then out[#out + 1] = w.label.__text end end return out`);
  expect(Object.values(short), "every module row is tall enough for its name and its whole description").toEqual([]);
  const tall = addon.eval(`local n = 0 for _, w in ipairs(__wfgStub.frames) do if w.desc and ns.Options.RevealRow(w) and w:GetHeight() > 54 then n = n + 1 end end return n`);
  expect(tall, "at least one description wraps past the 54 units a row used to have").toBeGreaterThan(0);
});

it("options: a switch whose caption wraps takes the whole row, so the caption and its switch centre in it", () => {
  const addon = fitOptions(1.3);
  addon.eval('ns.Options.Show("unitframes")');
  const poking = addon.eval(`local out = {} for _, w in ipairs(__wfgStub.frames) do
    if w.card and w.label and w.source and w.source[1] == "check" and ns.Options.RevealRow(w) and w.label:GetTop() > w:GetTop() + 0.01 then out[#out + 1] = w.caption end end return out`);
  expect(Object.values(poking), "no caption starts above its row").toEqual([]);
  const tall = addon.eval(`local n = 0 for _, w in ipairs(__wfgStub.frames) do if w.source and w.source[1] == "check" and ns.Options.RevealRow(w) and w:GetHeight() > ns.Theme.ROW.height then n = n + 1 end end return n`);
  expect(tall, "a wrapped caption's row is taller than a one-line row").toBeGreaterThan(0);
});

it("options: pages built at another Text size are built again the next time they open, so reload tags clear their captions", () => {
  const addon = fitOptions();
  for (const page of ["unitframes", "tools", "town"]) addon.eval(`ns.Options.Show("${page}")`);
  addon.eval('ns.Theme.Settings().textScale = 1.3 ns.Theme.Refresh()');
  // Opens the page and lists the captions whose reload tag starts before the caption ends.
  const crowded = (page) => addon.eval(`ns.Options.Show("${page}") local out = {}
    for _, w in ipairs(__wfgStub.frames) do
      if w.tag and w.label and ns.Options.RevealRow(w) and w.tag:GetLeft() < w.label:GetLeft() + math.min(w.label:GetStringWidth(), w.label:GetWidth()) then out[#out + 1] = w.caption end
    end return out`);
  for (const page of ["unitframes", "tools", "town"]) expect(Object.values(crowded(page)), `${page}: no reload tag sits over its caption`).toEqual([]);
  expect(addon.eval("return ns.Options.current"), "the page opened is the one asked for").toBe("town");
});

it("options: a nav entry's title stops short of the changed-setting dot and never wraps", () => {
  const addon = fitOptions();
  addon.eval('ns.Options.Show("general")');
  const bad = addon.eval(`local out = {} for key, b in pairs(Vanguard_Options.nav) do
    local p = b.text.__points.RIGHT
    if not (p and p.rel == b.changed and p.relPoint == "LEFT" and b.text.__noWrap and b.text:GetRight() <= b.changed:GetLeft()) then out[#out + 1] = key end
  end return out`);
  expect(Object.values(bad), "every title is bound on the right by the dot").toEqual([]);
});

it("options: in Russian a module's own-switch note ends before its switch, in one line, and the tooltip says it in full (P2-4)", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE, textFit: true, client: '__wfgWorld.locale = "ruRU" __wfgStub.setScreen(835, 668)' });
  addon.login();
  addon.eval('ns.Options.Show("modules")');
  // Every shown own-switch note that is not empty: its right edge against the switch's left edge, and whether it wraps.
  const notes = addon.eval(`local out = {} for _, w in ipairs(__wfgStub.frames) do
    if w.ownSwitch and ns.Options.RevealRow(w) and (w.ownSwitch.__text or "") ~= "" then
      out[#out + 1] = { w.ownSwitch:GetRight() <= w.track:GetLeft() - ns.Theme.SPACE.gap + 0.5, w.ownSwitch.__noWrap == true } end end return out`);
  expect(notes.length, "some linked module is on with its own switch off").toBeGreaterThan(0);
  expect(notes.filter((n) => !n[0] || !n[1]), "no note reaches its switch, and none wraps").toEqual([]);
  const tip = addon.eval(`for _, w in ipairs(__wfgStub.frames) do
    if w.ownSwitch and ns.Options.RevealRow(w) and (w.ownSwitch.__text or "") ~= "" then
      w.__scripts.OnEnter(w) local l = GameTooltip.__lines[2] and GameTooltip.__lines[2].text w.__scripts.OnLeave(w) return l == w.ownSwitch.__text end end`);
  expect(tip, "the tooltip's second line is the whole note").toBe(true);
});

it("options: a choice row's dropdown widens into its caption's spare room to hold its longest choice (P2-8)", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE, textFit: true, client: '__wfgWorld.locale = "frFR"' });
  addon.login();
  addon.eval('ns.Options.Show("chat")');
  // The dropdown's width, the caption's right edge and the dropdown's left edge, for the shown choice row with this caption.
  const row = (caption) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do
    if w.dropdown and w.caption == ns.L["${caption}"] and ns.Options.RevealRow(w) then return { w.dropdown:GetWidth(), w.label:GetRight(), w.dropdown:GetLeft() } end end`);
  const [wide, captionEnd, dropdownStart] = row("Class-colored names in chat (the game's setting)") || [];
  expect(wide, "the French choice needs more than the 200 column").toBeGreaterThan(200);
  expect(captionEnd, "the caption still ends before the dropdown").toBeLessThanOrEqual(dropdownStart);
  const cut = addon.textFit("Vanguard_Options").filter((f) => f.text.startsWith("Selon le réglage"));
  expect(cut, "the long choice is no longer cut").toEqual([]);
});

// A client in this language, in the text-fit client with real font widths, logged in with the Text size set (1 = 100%).
function localeOptions(locale, textScale) {
  const addon = createAddon({ savedVariables: SETUP_DONE, textFit: true, client: `__wfgWorld.locale = "${locale}"` });
  addon.login();
  addon.eval(`ns.Theme.Settings().textScale = ${textScale} ns.Theme.Refresh()`);
  return addon;
}

it("options: in Russian at 115% a module row whose name wraps beside its reload tag holds its description too (B2-1)", () => {
  const addon = localeOptions("ruRU", 1.15);
  addon.eval('ns.Options.Show("modules")');
  // Each shown module row whose description ends under the row's bottom (the row's air kept below it).
  const cut = addon.eval(`local out = {} for _, w in ipairs(__wfgStub.frames) do
    if w.desc and w.label and w.source and ns.Options.RevealRow(w) and w.desc:GetBottom() < w:GetBottom() + 6 - 0.01 then out[#out + 1] = w.caption end end return out`);
  expect(Object.values(cut), "every description ends a little above its row's bottom, clear of the next name").toEqual([]);
});

it("options: in German at 130% a choice or slider row whose caption wraps grows to hold it (B2-3)", () => {
  const addon = localeOptions("deDE", 1.3);
  // On this page: how many choice and slider rows are taller than one line, then the captions that run past their row.
  const spill = (page) => addon.eval(`ns.Options.Show("${page}") local out = { tall = 0 }
    for _, w in ipairs(__wfgStub.frames) do
      local kind = w.source and w.source[1]
      if w.card and w.label and (kind == "cycle" or kind == "slider") and ns.Options.RevealRow(w) then
        if w:GetHeight() > ns.Theme.ROW.height then out.tall = out.tall + 1 end
        if w.label:GetTop() > w:GetTop() + 0.01 or w.label:GetBottom() < w:GetBottom() - 0.01 then out[#out + 1] = w.caption end
      end
    end return out`);
  for (const page of ["chat", "town"]) {
    const found = spill(page);
    expect(found.tall, `${page}: a wrapped caption's row is taller than a one-line row`).toBeGreaterThan(0);
    expect(Object.values(found).filter((v) => typeof v === "string"), `${page}: no caption runs past its row`).toEqual([]);
  }
});
it("options: a module's own-switch note shares the name's line at both ends and still ends before the switch (B2-6)", () => {
  const addon = fitOptions();
  addon.eval('ns.Options.Show("modules")');
  // For each shown note's box: its two anchors' targets and offsets, and its right edge against the switch.
  const boxes = addon.eval(`local out = {} for _, w in ipairs(__wfgStub.frames) do
    if w.ownSwitchBox and ns.Options.RevealRow(w) then
      local p = w.ownSwitchBox.__points
      out[#out + 1] = { p.RIGHT.rel == w.label, p.RIGHT.y, p.LEFT.y, w.ownSwitchBox:GetRight(), w.track:GetLeft() - ns.Theme.SPACE.gap } end end return out`);
  expect(boxes.length, "some linked modules show").toBeGreaterThan(0);
  expect(boxes.filter((b) => !b[0] || b[1] !== 0 || b[2] !== 0), "the right end is on the name's line, as the left end is").toEqual([]);
  expect(boxes.filter((b) => Math.abs(b[3] - b[4]) > 0.5), "the box ends a gap short of the switch").toEqual([]);
});

it("options: profile rows and the click casting rows sit inside their card by a gap, as a switch does (B2-5)", () => {
  const addon = loggedIn(CLICK_LUA);
  // The kinds of shown rows that run past their card's edge less than the inset a switch keeps (T.SPACE.tight).
  const tight = (page) => addon.eval(`ns.Options.Show("${page}") local out = {}
    for _, w in ipairs(__wfgStub.frames) do
      if w.card and w.source and ns.Options.RevealRow(w) and w:GetRight() > w.card:GetRight() - ns.Theme.SPACE.tight + 0.01 then out[#out + 1] = w.source[1] end
    end return out`);
  expect(Object.values(tight("profiles")), "the profile list and the New profile row").toEqual([]);
  expect(Object.values(tight("clickcast")), "the toolbar, the grid, the keys and the sharing rows").toEqual([]);
});

// The open page's tabs: { name, raised (checked), name colour is text } each, and the shown card's tab name.
const tabsOf = (addon) => addon.eval(`local v for _, c in ipairs({ Vanguard_Options:GetChildren() }) do if c.cards and c:IsShown() then v = c end end
  local out = {} for _, card in ipairs(v.cards) do if card.tab then out[#out + 1] = { card.tabName, ns.Theme.IsChecked(card.tab) == true, card:IsShown() } end end
  return { out, v.cards[v.tab].tabName }`);
// Clicks the open page's tab with this name, as a player would (CLICK_LUA's __click never picks a tab).
const clickTab = (addon, name) => addon.eval(`local v for _, c in ipairs({ Vanguard_Options:GetChildren() }) do if c.cards and c:IsShown() then v = c end end
  for _, card in ipairs(v.cards) do if card.tabName == "${name}" then card.tab:GetScript("OnClick")(card.tab, "LeftButton") return true end end return false`);

it("options tabs: a page of several cards shows one at a time under a tab per card; a click shows its card raised and the page opens on it again", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("chat")');
  const [tabs, shown] = tabsOf(addon);
  expect(tabs.map((t) => t[0]), "a tab per card, in the page's order").toEqual(["Chat", "Chat tabs", "Chat extras", "Chat watch", "Chat filter", "Chat history", "Chat windows", "Group board"]);
  expect([shown, tabs.filter((t) => t[1]).length, tabs.filter((t) => t[2]).length], "the first tab is the raised one, its card the only one shown").toEqual(["Chat", 1, 1]);
  expect([clickTab(addon, "Chat history"), addon.eval("return ns.Options.current")], "clicking a tab keeps the page").toEqual([true, "chat"]);
  expect(tabsOf(addon)[1], "and shows that card").toBe("Chat history");
  expect(addon.eval(`local v for _, c in ipairs({ Vanguard_Options:GetChildren() }) do if c.cards and c:IsShown() then v = c end end
    local tab = v.cards[v.tab].tab return tab.text.__textColor`), "the shown tab's name is in the text colour").toEqual(addon.eval("return { ns.Theme.RGB('text') }"));
  addon.eval('ns.Options.Show("general") ns.Options.Show("chat")');
  expect(tabsOf(addon)[1], "back on the page, the tab shown last").toBe("Chat history");
  addon.eval('ns.Options.Hide() Vanguard_Options:Hide() ns.Options.Show("chat")');
  expect(tabsOf(addon)[1], "and after the window closes and opens again").toBe("Chat history");
  expect(addon.eval('return { ns.Options.ShowTab(1), ns.Options.ShowTab("Group board"), ns.Options.ShowTab(99), ns.Options.ShowTab("TEST-ONLY none") }'), "ShowTab takes a place or a name; false for a tab the page lacks").toEqual([true, true, false, false]);
});

it("options tabs: a page of one card has no tabs and keeps its card's title; a heading with no rows under it makes no tab", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("nameplates")');
  expect([Object.keys(tabsOf(addon)[0]).length, addon.texts("NAMEPLATES").length], "Nameplates: one card, its title in it, no tabs").toEqual([0, 1]);
  expect(addon.eval("return ns.Options.ShowTab(1)"), "so no tab to show").toBe(false);
  addon.eval('ns.Options.Show("healing")');
  const names = tabsOf(addon)[0].map((t) => t[0]);
  expect([names.includes("Buffs to watch"), names[0], names[1]], "Healing: the Buffs to watch heading over the class cards is no tab of its own").toEqual([false, "On the raid frames", "Mage"]);
});

it("options tabs: the tabs wrap onto a new line where the next would run past the page, and the page's view starts under them", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("actionbars")');
  // Each tab's top-left offset in the strip and its width; the strip's height; the view's top below the strip's bottom.
  const layout = addon.eval(`local v for _, c in ipairs({ Vanguard_Options:GetChildren() }) do if c.cards and c:IsShown() then v = c end end
    local out = {} for _, card in ipairs(v.cards) do local p = card.tab.__points.TOPLEFT out[#out + 1] = { p.x, -p.y, card.tab:GetWidth() } end
    return { out, v.strip:GetHeight(), v:GetTop() == v.strip:GetBottom() }`);
  const [tabs, height, under] = layout;
  const lines = new Set(tabs.map((t) => t[1]));
  expect([lines.size, height, under], "Action bars' ten tabs take two lines: the strip is two tabs and a gap tall, the view right under it").toEqual([2, 2 * addon.eval("return ns.Theme.CONTROL_H + 4") + 2, true]);
  expect(tabs.every((t) => t[0] + t[2] <= 568), "no tab runs past the page's width").toBe(true);
  const firstOnTwo = tabs.findIndex((t) => t[1] > 0);
  expect([tabs[firstOnTwo][0], tabs[firstOnTwo - 1][0] + tabs[firstOnTwo - 1][2] + 2 + tabs[firstOnTwo][2] > 568], "a new line starts at the left, where the tab and its gap would not fit on the line above").toEqual([0, true]);
});

it("options tabs: the Modules page keeps what off means and its Show choice above the tabs, whichever tab shows", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("modules")');
  // Whether the Show choice and the note show, and the shown tab.
  const lead = () => [addon.texts("A module that's off builds nothing and costs nothing.").length, addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.caption == "Show" and w.card and w.card.child.pageKey == "modules" then return w:IsVisible() end end'), tabsOf(addon)[1]];
  expect(lead(), "on the first tab, Unit frames").toEqual([1, true, "Unit frames"]);
  addon.eval('ns.Options.ShowTab("Combat tools")');
  expect(lead(), "and on Combat tools").toEqual([1, true, "Combat tools"]);
  addon.eval('ns.Options.Show("general")');
  expect(lead().slice(0, 2), "another page hides it with the Modules page").toEqual([0, false]);
});

it("options tabs: a tab wears the changed dot while a setting on its card differs from its default", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("actionbars")');
  // Each tab's changed dot shown, by tab name.
  const dots = () => Object.fromEntries(tabsOf(addon)[0].map((t) => [t[0], addon.eval(`local v for _, c in ipairs({ Vanguard_Options:GetChildren() }) do if c.cards and c:IsShown() then v = c end end
    for _, card in ipairs(v.cards) do if card.tabName == "${t[0]}" then return card.tab.changed:IsShown() end end`)]));
  expect([dots()["Bar 2"], dots()["Action bars"]], "nothing changed: no dots").toEqual([false, false]);
  addon.eval('ns.Options.ShowTab("Bar 2") __click("Red when out of range")');
  expect([dots()["Action bars"], dots()["Bar 2"], tabsOf(addon)[1]], "Red when out of range off: the Action bars tab has the dot").toEqual([true, false, "Action bars"]);
  addon.eval('__click("Red when out of range")');
  expect(dots()["Action bars"], "back to the default: the dot goes").toBe(false);
});

it("options tabs: search, What's new and Vanguard.OpenOptions show the tab that holds the row", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("chat")');
  addon.eval('local s = Vanguard_Options.search s:SetText("keep chat history") s:GetScript("OnTextChanged")(s) s:GetScript("OnEnterPressed")(s)');
  expect([addon.eval("return ns.Options.current"), tabsOf(addon)[1]], "Enter on a search: its page, on the tab holding the row").toEqual(["chat", "Chat history"]);
  addon.eval('Vanguard.OpenOptions("actionbars", "Restyle the pet")');
  expect([addon.eval("return ns.Options.current"), tabsOf(addon)[1]], "OpenOptions: the page and the row's tab").toEqual(["actionbars", "Action bars"]);
  addon.eval('ns.Options.ShowTab("Bar 8") ns.Options.JumpTo("Hide the default bars")');
  expect(tabsOf(addon)[1], "JumpTo from another tab").toBe("Action bars");
});

it("options tabs: Left and Right step the tabs, wrapping, unless the keyboard's row steps; a page without tabs lets them go on to the game", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval("local f = Vanguard_Options or {} ns.Options.Show('chat') Vanguard_Options.SetPropagateKeyboardInput = function(self, v) self.__passed = v end");
  press(addon, "RIGHT");
  expect([tabsOf(addon)[1], addon.eval("return Vanguard_Options.__passed")], "Right: the next tab, and the key stops there").toEqual(["Chat tabs", false]);
  press(addon, "LEFT");
  press(addon, "LEFT");
  expect(tabsOf(addon)[1], "Left back, and from the first round to the last").toBe("Group board");
  addon.eval('ns.Options.Show("general") ns.Options.ShowTab("Look")');
  for (let i = 0; i < 4; i++) press(addon, "TAB");
  const size = addon.eval("return ns.Theme.Settings().textScale");
  press(addon, "RIGHT");
  expect([tabsOf(addon)[1], addon.eval("return ns.Theme.Settings().textScale") !== size], "with the Text size slider under the keyboard, Right steps it and the tab stays").toEqual(["Look", true]);
  addon.eval('ns.Options.Show("nameplates")');
  expect(press(addon, "RIGHT"), "Nameplates has no tabs: Right goes on to the game").toEqual(["nameplates", true]);
});

it("options tabs: Reset this page sits at the right of the page's bar, the page's title at its left; a page with nothing to reset has the title alone", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("chat")');
  // The open page's bar: its title, the title's right anchor, and the reset button's anchor (or false).
  const bar = () => addon.eval(`local v for _, c in ipairs({ Vanguard_Options:GetChildren() }) do if c.cards and c:IsShown() then v = c end end
    local b = v.bar.buttons and v.bar.buttons[1]
    return { v.bar.title:GetText(), v.bar.title.__points.RIGHT.rel == (b or v.bar), b and b.__points.RIGHT.point or false, b and b.text.__text or false }`);
  expect(bar(), "Chat: the title, cut short before the button at the bar's right").toEqual(["Chat", true, "RIGHT", "Reset this page"]);
  expect(addon.eval('return __click("Reset this page") and Vanguard_Question:IsShown()'), "and the button still asks first").toBe(true);
  addon.eval('Vanguard_Question.no:GetScript("OnClick")(Vanguard_Question.no) ns.Options.Show("feedback")');
  expect(bar(), "Feedback: no settings with defaults, so the title alone").toEqual(["Feedback", true, false, false]);
});

it("options tabs: a Text size change sizes the open page's tabs to their names again, and they wrap to fit the strip", () => {
  // Font metrics, so a name's width follows its font size (the rough metrics count characters).
  const addon = createAddon({ savedVariables: SETUP_DONE, textFit: true });
  addon.login();
  addon.eval('ns.Options.Show("modules")');
  // The open page's tabs as { tab width, name width at full size, tab's right edge past the strip's left } each.
  const tabs = () => addon.eval(`local v for _, c in ipairs({ Vanguard_Options:GetChildren() }) do if c.cards and c:IsShown() then v = c end end
    local out = {} for _, card in ipairs(v.cards) do local t = card.tab
      out[#out + 1] = { t:GetWidth(), math.ceil(ns.Theme.FullWidth(t.text)), t:GetRight() - v.strip:GetLeft() } end
    return { out, v.strip:GetWidth(), v.strip:GetHeight() }`);
  const [before, , rowsBefore] = tabs();
  addon.eval("ns.Theme.Settings().textScale = 1.3 ns.Theme.Refresh()");
  const [after, strip, rowsAfter] = tabs();
  expect(after.map(([width, name]) => width - name), "each tab is its name and 12 of air each side again").toEqual(after.map(() => 24));
  expect([after[0][0] > before[0][0], after.every((t) => t[2] <= strip), rowsAfter > rowsBefore], "wider names, none past the strip, more lines").toEqual([true, true, true]);
});
