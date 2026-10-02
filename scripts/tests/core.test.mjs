// core: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { luaValue } from "../lib/lua-emit.mjs";
import { CLICK_LUA, FOREVER_ENV, HEALING_ENV, MICRO_ENV, RAID_ENV, TIDY_ENV, UI_ENV, UNITS_ENV, bars, button, calls, chatHas, healing, isTok, key, later, loggedIn, putAway, setCombat } from "./helpers.mjs";

it("saved variables", () => {
  expect(createAddon().eval("return next(ns.Profile()) == nil"), "before ADDON_LOADED the profile is empty").toBe(true);
  const addon = loggedIn("", { firstRun: true });
  const sv = addon.savedVariables();
  expect(sv.account.version === 1 && typeof sv.account.profiles === "object", "fresh install creates ForeverUIDB").toBeTruthy();
  expect(sv.char.profile === "Default", "a new character uses the Default profile").toBeTruthy();
  const kept = loggedIn("", { savedVariables: 'ForeverUIDB = { profiles = { Main = { theme = { accent = { 1, 0, 0 } } } } }\nForeverUICharDB = { profile = "Main" }' });
  expect(kept.eval("return select(1, ns.Theme.Accent())") === 1, "the character's saved profile is used").toBeTruthy();
  expect(kept.eval("return ns.Theme.Settings().panel[4]") === 0.94, "missing theme settings get defaults").toBeTruthy();
});

it("modules", () => {
  const addon = loggedIn(`
    ns.Module("Good", { defaults = { size = 3 }, Enable = function(s) __size = s.size end })
    ns.Module("Bad", { Enable = function() error("boom") end })
    ns.Module("Off", { Enable = function() __off = true end })
  `, { savedVariables: 'ForeverUIDB = { profiles = { Default = { modules = { Off = false } } } }' });
  expect(addon.eval("return __size") === 3, "a module is enabled with its defaults").toBeTruthy();
  expect(chatHas(addon, /module Bad failed to load: .*boom/), "a failing module is reported").toBeTruthy();
  expect(addon.eval("return ns.GetModule('Bad').enabled") === false, "a failing module is marked not enabled").toBeTruthy();
  expect(addon.eval("return __off") === null, "a module turned off in the profile is not enabled").toBeTruthy();
  addon.slash("disable Good");
  expect(addon.eval("return ns.ModuleEnabled('Good')") === false, "/fui disable turns a module off").toBeTruthy();
});

it("combat queue", () => {
  const addon = loggedIn();
  addon.eval("__wfgStub.inCombat = true; ns.OutOfCombat(function() __ran = (__ran or 0) + 1 end)");
  expect(addon.eval("return __ran") === null, "work waits during combat").toBeTruthy();
  expect(addon.eval("return ns.QueuedCount()") === 1, "queued work is counted").toBeTruthy();
  addon.eval("__wfgStub.inCombat = false");
  addon.fire("PLAYER_REGEN_ENABLED");
  expect(addon.eval("return __ran") === 1, "queued work runs once after combat").toBeTruthy();
  addon.eval("ns.OutOfCombat(function() __ran = __ran + 1 end)");
  expect(addon.eval("return __ran") === 2, "out of combat, work runs at once").toBeTruthy();
});

it("slash", () => {
  const addon = loggedIn();
  addon.slash("help");
  expect(chatHas(addon, /unlock \| lock/), "/fui help lists commands").toBeTruthy();
  addon.slash("status");
  expect(chatHas(addon, /profile Default/), "/fui status shows the profile").toBeTruthy();
  addon.slash("profile Raid");
  expect(addon.eval("return ForeverUICharDB.profile") === "Raid", "/fui profile switches this character's profile").toBeTruthy();
  addon.clearChat();
  addon.slash("bogus");
  expect(chatHas(addon, /Unknown command/), "unknown commands say so").toBeTruthy();
});

// Whether any shown font string reads exactly `text`.
const shownText = (addon, text) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do
  local shown, f = true, w
  while f do if not f.__shown then shown = false end f = f.__parent end
  if shown and w.__kind == "FontString" and w.__text == "${text}" then return true end
end return false`);

it("WoW Forever client: interface, hidden auras, no specializations", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + HEALING_ENV + FOREVER_ENV);
  expect(addon.eval("return ns.IsForever()") === true, "a 1.x interface number (16001) is WoW Forever").toBeTruthy();
  addon.eval('__spawn(1, "raid1")');
  expect(healing(addon, 1).missing === "TEST-ONLY-ICON-Arcane Intellect", "readable auras: a missing buff is marked").toBeTruthy();
  addon.eval("__secretAuras = true");
  addon.fire("UNIT_AURA", "raid1");
  expect(healing(addon, 1).missing === false, "while auras are hidden, an unseen buff is unknown, not missing").toBeTruthy();
  addon.eval("__secretAuras = { __secret = true }");
  addon.fire("UNIT_AURA", "raid1");
  expect(healing(addon, 1).missing === false, "a hidden answer to 'are auras hidden?' counts as hidden").toBeTruthy();
  addon.eval("C_Secrets.ShouldAurasBeSecret = function() error('TEST-ONLY') end");
  expect(addon.eval("return ns.AurasSecret()") === true, "an error counts as hidden").toBeTruthy();
  addon.eval("C_Secrets.ShouldAurasBeSecret = function() return __secretAuras end __secretAuras = false");
  setCombat(addon, false);
  expect(healing(addon, 1).missing === "TEST-ONLY-ICON-Arcane Intellect", "leaving combat looks at every buff again").toBeTruthy();
  addon.slash("status");
  expect(chatHas(addon, /Client WoW Forever {2}· {2}build 1\.16\.0 \(TEST-ONLY\) {2}· {2}auras on the engine {2}· {2}aura values readable/), "/fui status names the client, its build and the aura state").toBeTruthy();
  addon.slash("spec Default");
  expect(chatHas(addon, /no specializations/), "/fui spec explains there are no specializations").toBeTruthy();
  addon.eval('ns.Options.Show("profiles")');
  expect(shownText(addon, "YOUR PROFILES") && !shownText(addon, "SPECIALIZATION"), "the Profiles page has no spec section").toBeTruthy();
  addon.eval('UnitClass = function() return "Paladin", "PALADIN" end');
  expect(addon.eval('for _, n in ipairs(ns.GetModule("RaidHealing").BuffNames()) do if n == "Greater Blessing of Kings" then return true end end'), "any blessing counts for a paladin").toBeTruthy();
});

it("a retail client is not WoW Forever and keeps its aura state readable", () => {
  const addon = loggedIn('GetBuildInfo = function() return "12.0.7", "TEST-ONLY", "Sep 1 2026", 120007 end');
  expect(addon.eval("return ns.IsForever()") === false && addon.eval("return ns.AurasSecret()") === false, "120007 is retail; no C_Secrets means readable").toBeTruthy();
  addon.slash("status");
  expect(chatHas(addon, /Client Retail/), "/fui status says Retail").toBeTruthy();
});

// The reload overlay on a button as [type, macro, key-down, sits above the button], or false.
const reloadOverlay = (addon, path) => addon.eval(`local b = ${path} local o = b.reloadOverlay
  return o and { o:GetAttribute("type"), o:GetAttribute("macrotext"), o:GetAttribute("useOnKeyDown"), o:GetFrameLevel() > b:GetFrameLevel() } or false`);

// The next session of an addon: the client writes SavedVariables at logout and
// loads them back before ADDON_LOADED; extra Lua runs before login.
function nextSession(addon, extra = "") {
  addon.fire("PLAYER_LOGOUT");
  const sv = addon.savedVariables();
  const next = createAddon({ savedVariables: `ForeverUIDB = ${luaValue(sv.account)}\nForeverUICharDB = ${luaValue(sv.char)}\n` });
  if (extra) next.eval(extra);
  next.login();
  return next;
}

it("a session: what you set in one login comes back in the next", () => {
  const first = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA);
  first.slash("profile TEST-ONLY Alt");
  first.slash("accent arcane");
  first.slash("disable Minimap");
  first.eval('ns.Settings("UnitFrames").healthFormat = "percent" ns.Settings("RaidFrames").look = "dark"');
  first.eval('ns.SetMoverPoint("uf_player", "TOPLEFT", "TOPLEFT", 40, -60)');
  const next = nextSession(first, UNITS_ENV + RAID_ENV + CLICK_LUA);
  expect(next.eval("return ns.ProfileName()"), "the character is still on its profile").toBe("TEST-ONLY Alt");
  expect(next.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.arcane[1]"), "the accent is kept").toBe(true);
  expect(next.eval("return ns.ModuleEnabled('Minimap')"), "a module turned off stays off").toBe(false);
  expect(next.eval('return { ns.Settings("UnitFrames").healthFormat, ns.Settings("RaidFrames").look }'), "module settings are kept").toEqual(["percent", "dark"]);
  expect(next.eval('return { ns.MoverPoint("uf_player") }'), "a moved frame stays where you put it").toEqual(["TOPLEFT", "TOPLEFT", 40, -60]);
  expect(next.eval("return ForeverUI_Setup == nil or not ForeverUI_Setup:IsShown()"), "setup doesn't come back").toBe(true);
  const third = nextSession(next, UNITS_ENV + RAID_ENV + CLICK_LUA);
  expect(third.eval("return ns.ProfileName()"), "and it holds for a third session").toBe("TEST-ONLY Alt");
});

it("/fui errors: what ForeverUI caught this session", () => {
  const addon = loggedIn();
  addon.eval("for i = #ns.errors, 1, -1 do ns.errors[i] = nil end");
  addon.slash("errors");
  expect(chatHas(addon, /No errors caught this session/), "with nothing caught, it says so").toBe(true);
  const broken = loggedIn(`__wfgStub.noAuraContainer = true
    local M = ns.Module("TEST-ONLY Broken", {}) function M.Enable() error("TEST-ONLY boom") end`);
  broken.slash("errors");
  expect(chatHas(broken, /\d+ error\(s\) caught this session, newest last/) && chatHas(broken, /aura containers \(using ForeverUI's own icons\)/) && chatHas(broken, /module TEST-ONLY Broken: .*TEST-ONLY boom/), "a module that failed and a missing aura container are both listed").toBe(true);
  broken.eval('for i = 1, 25 do ns.CaughtError("TEST-ONLY", i) end');
  expect(broken.eval("return { #ns.errors, ns.errors[1] }"), "only the last 20 are kept").toEqual([20, "TEST-ONLY: 6"]);
});

it("reload buttons: a /reload macro overlay, since the Forever client blocks ReloadUI()", () => {
  const addon = loggedIn(FOREVER_ENV + "ReloadUI = function() __reloaded = true end");
  addon.eval('ns.OfferReload("TEST-ONLY change.")');
  expect(addon.eval("return ForeverUI_Reload:IsShown() and ForeverUI_Reload.title:GetText()"), "a reload is offered with its reason").toBe("TEST-ONLY change. Reload the UI now to apply it?");
  expect(reloadOverlay(addon, "ForeverUI_Reload.accept"), "Reload carries a /reload macro overlay, on mouse-up, above the button").toEqual(["macro", "/reload", false, true]);
  addon.eval('local a = ForeverUI_Reload.accept a:SetScript("OnEnter", function() __hover = "in" end) a:SetScript("OnLeave", function() __hover = "out" end)');
  addon.eval("local o = ForeverUI_Reload.accept.reloadOverlay o:GetScript('OnEnter')(o)");
  expect(addon.eval("return __hover"), "hovering the overlay lights the button under it").toBe("in");
  addon.eval("local o = ForeverUI_Reload.accept.reloadOverlay o:GetScript('OnLeave')(o)");
  expect(addon.eval("return __hover"), "and leaving it lets go").toBe("out");
  addon.eval("local a = ForeverUI_Reload.accept a:SetScript('OnEnter', nil) a.reloadOverlay:GetScript('OnEnter')(a.reloadOverlay)");
  addon.eval("ForeverUI_Reload.cancel:GetScript('OnClick')(ForeverUI_Reload.cancel)");
  expect(addon.eval("return ForeverUI_Reload:IsShown()"), "Later closes it").toBe(false);
  setCombat(addon, true);
  addon.slash("");
  expect(reloadOverlay(addon, "ForeverUI_Options.reload"), "a reload button built in combat has no overlay yet").toBe(false);
  addon.eval("ForeverUI_Options.reload:GetScript('OnClick')(ForeverUI_Options.reload)");
  expect(addon.eval("return __reloaded") === null && chatHas(addon, /Type \/reload in chat/), "clicked then, it says to type /reload (ReloadUI would be blocked)").toBe(true);
  setCombat(addon, false);
  expect(reloadOverlay(addon, "ForeverUI_Options.reload"), "the overlay arrives when combat ends").toEqual(["macro", "/reload", false, true]);
});

it("events unsubscribe and a delivered event with no listeners", () => {
  const addon = loggedIn();
  const out = addon.eval(`
    local n = 0
    local function fn() n = n + 1 end
    -- TEST-ONLY event, not one the addon registers itself.
    ns.On("TEST_ONLY_EVENT", fn)
    ns.On("TEST_ONLY_EVENT", fn)
    local frame
    for _, w in ipairs(__wfgStub.frames) do
      if w.__events.TEST_ONLY_EVENT and w.__scripts.OnEvent then frame = w end
    end
    __wfgStub.fire("TEST_ONLY_EVENT")
    local once = n
    ns.Off("TEST_ONLY_EVENT", fn)
    __wfgStub.fire("TEST_ONLY_EVENT")
    frame:RegisterEvent("TEST_ONLY_EVENT")
    frame:GetScript("OnEvent")(frame, "TEST_ONLY_EVENT")
    -- TEST-ONLY event nobody subscribed to.
    return { once = once, after = n, offMissing = ns.Off("NO_SUCH_EVENT", fn) == nil }
  `);
  expect(out.once === 1 && out.after === 1 && out.offMissing === true, "a listener is registered once, Off removes it, and Off of nothing is a no-op").toBeTruthy();
});

it("slash commands for frames, accent, grid, theme, modules, skins, profile and spec", () => {
  const addon = loggedIn(`
    -- TEST-ONLY spec index the slash command prints.
    GetSpecialization = function() return 2 end
    -- TEST-ONLY version from C_AddOns.GetAddOnMetadata.
    C_AddOns = { GetAddOnMetadata = function() return "0.3.0" end }
  `);
  // TEST-ONLY skin name. The slash assertion matches this exact string.
  addon.eval('ForeverUI.RegisterSkin("TESTONLY", function() end)');
  addon.slash("frames");
  expect(chatHas(addon, /Movable frames:/), "/fui frames lists movers").toBeTruthy();
  addon.slash("accent reset");
  expect(chatHas(addon, /Accent back to default/), "/fui accent reset clears a custom accent").toBeTruthy();
  addon.slash("grid 1");
  expect(chatHas(addon, /Usage: \/fui grid/), "a grid size outside 8-256 is refused").toBeTruthy();
  addon.slash("theme");
  expect(chatHas(addon, /Usage: \/fui theme reset/), "/fui theme without reset is refused").toBeTruthy();
  addon.slash("modules");
  expect(chatHas(addon, /UnitFrames/), "/fui modules lists modules").toBeTruthy();
  // TEST-ONLY module name that does not exist.
  addon.slash("enable NoSuch");
  expect(chatHas(addon, /No module called NoSuch/), "an unknown module is refused").toBeTruthy();
  addon.slash("skins TESTONLY on");
  expect(chatHas(addon, /Skin for TESTONLY on/), "/fui skins on stores the choice").toBeTruthy();
  addon.slash("profile");
  expect(chatHas(addon, /Profile: Default/), "/fui profile with no name shows the current profile").toBeTruthy();
  addon.slash("spec");
  expect(chatHas(addon, /Spec 2 uses the character's profile/), "/fui spec with no name shows that no spec profile is set").toBeTruthy();
});

// TEST-ONLY WoW Forever calls: only the newer C_ functions and frames, none of the older globals.
const NEWER_ENV = `
  GetZonePVPInfo = nil
  __pvp = "sanctuary"
  C_PvP = { GetZonePVPInfo = function() return __pvp end }
  CreateFrame("Button", "QueueStatusButton", UIParent)
  CreateFrame("Button", "ExpansionLandingPageMinimapButton", UIParent)
  __micro("HousingMicroButton")
  MirrorTimerContainer = CreateFrame("Frame", "MirrorTimerContainer", UIParent)
  __timers = {}
  function MirrorTimerContainer:GetChildren() return unpack(__timers) end
  function MirrorTimerContainer:SetupTimer()
    local t = CreateFrame("Frame", nil, self) t.StatusBar = CreateFrame("StatusBar", nil, t) __timers[#__timers + 1] = t
  end
  MirrorTimerContainer:SetupTimer()
`;

it("Forever fixes: the newer calls for zone color, pet moods, breath bars, the minimap eye, the house icon and the build line", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + NEWER_ENV);
  expect(isTok(addon, addon.eval("return ns.GetModule('Minimap').zone.__textColor"), "zoneSanctuary"), "the zone name takes its PvP color from C_PvP").toBe(true);
  addon.eval("__pvp = { __secret = true } ns.GetModule('Minimap').UpdateZone()");
  expect(isTok(addon, addon.eval("return ns.GetModule('Minimap').zone.__textColor"), "gold"), "a hidden answer is plain gold").toBe(true);
  expect(addon.eval("local f = QueueStatusButton local p = f.__points.BOTTOMRIGHT return { f:GetParent() == ns.GetModule('Minimap').overlay, p.y, f:GetScale() }"), "the group finder eye sits small on the map's bottom-right, above the compartment").toEqual([true, 26, 0.6]);
  expect(putAway(addon, "ExpansionLandingPageMinimapButton"), "the expansion button is put away").toBe(true);
  expect(/Icons\\House$/.test(addon.eval("return HousingMicroButton.fuiGlyph.__texture")), "the housing button gets the house icon").toBe(true);
  // Whether the breath bar container's i-th timer has the theme's bar texture.
  const barStyled = (i) => addon.eval(`return __timers[${i}].StatusBar:GetStatusBarTexture() ~= nil`);
  expect(barStyled(1), "a breath bar the container already holds is styled").toBe(true);
  addon.eval("MirrorTimerContainer:SetupTimer()");
  expect(barStyled(2), "and so is one it sets up later").toBe(true);
  const pets = loggedIn(UNITS_ENV + "C_PetInfo = { GetPetHappiness = function() return 3 end }");
  expect(pets.eval("local d = ns.GetModule('UnitExtras').happy return d and d:IsShown()"), "the pet's mood comes from C_PetInfo").toBe(true);
  // The /fui status client line for a WoW Forever client reporting this build (or no build call at all).
  const status = (build) => { const a = loggedIn(FOREVER_ENV + (build ? `GetBuildInfo = function() return "1.60.1", "${build}", "Sep 1 2026", 16001 end` : "")); a.slash("status"); return a; };
  expect(chatHas(status("69893"), /build 1\.60\.1 \(69893\) {2}· {2}update the game: this build loses settings at every launch/), "a build before the fix says to update").toBe(true);
  expect(chatHas(status("70009"), /update the game/), "a fixed build doesn't").toBe(false);
  const noBuild = loggedIn(FOREVER_ENV);
  noBuild.eval("ns.IsForever = function() return true end GetBuildInfo = nil");
  noBuild.slash("status");
  expect(chatHas(noBuild, /Client WoW Forever {2}· {2}auras/), "a client that can't say its build just leaves it out").toBe(true);
});
