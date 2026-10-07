// game-tools: the game's Cooldown Manager and damage meter, Edit Mode handles, and the game's extras
// hidden or replaced, in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { CLICK_LUA, HEALING_ENV, MICRO_ENV, PLATE_ENV, RAID_ENV, TIDY_ENV, TOOLS_ENV, UI_ENV, UNITS_ENV, chatHas, isTok, loggedIn, pinned, putAway, setCombat } from "./helpers.mjs";
import { BAGS, BAR_H, MENU, barSize, barW, r3 } from "./more-env.mjs";

it("the game's tools: Cooldown Manager and damage meter styled and placed, standing aside for Edit Mode", () => {
  const addon = loggedIn(TOOLS_ENV + CLICK_LUA);
  const item = addon.eval(`local i = EssentialCooldownViewer.items[1]
    return { crop = i.Icon.__texCoord and i.Icon.__texCoord[1], inset = i.Icon.__points.TOPLEFT.x > 0, font = i.ChargeCount.Current.__font[3] }`);
  expect(item.crop > 0 && item.inset && item.font === "OUTLINE", "cooldown icons are cropped, inset in a thin border, with outlined numbers").toBe(true);
  addon.eval("UtilityCooldownViewer:RefreshLayout()");
  expect(addon.eval("return UtilityCooldownViewer.items[2].vgSkinned"), "items the game adds later are styled too").toBe(true);
  expect(addon.eval("return BuffBarCooldownViewer.items[1].Bar:GetStatusBarTexture() ~= nil and BuffBarCooldownViewer.items[1].Bar.Name.__font ~= nil"), "buff bars get the theme's bar and font").toBe(true);
  const win = addon.eval("local w = DamageMeterSessionWindow1 local l = w.ScrollBox.lines[1] return { w.Header.__alpha, l.StatusBar.BackgroundRegions[1].__alpha, l.StatusBar.Name.__font ~= nil }");
  expect(win, "the meter's header and bar shading fade, its lines take the theme font").toEqual([0, 0, true]);
  addon.eval("__line(DamageMeterSessionWindow1) DamageMeterSessionWindow1.ScrollBox:Update() DamageMeter:SetupSessionWindow() __line(DamageMeterSessionWindow2) DamageMeterSessionWindow2.ScrollBox:Update()");
  expect(addon.eval("return { DamageMeterSessionWindow1.ScrollBox.lines[2].vgSkinned, DamageMeterSessionWindow2.vgSkinned, DamageMeterSessionWindow2.ScrollBox.lines[1].vgSkinned }"), "new lines and new windows are styled as they come").toEqual([true, true, true]);
  // Where a game frame is anchored: { point, the spot it's on }.
  const spot = (name, point) => addon.eval(`local p = ${name}.__points.${point} return p and { p.relPoint, p.rel == Vanguard_${name}Spot } or false`);
  expect([spot("EssentialCooldownViewer", "CENTER"), spot("DamageMeter", "TOPLEFT"), spot("DamageMeter", "BOTTOMRIGHT")], "rows are centered on their spots; the meter fills its own").toEqual([["CENTER", true], ["TOPLEFT", true], ["BOTTOMRIGHT", true]]);
  addon.eval('EditModeManagerFrame:Show() EssentialCooldownViewer:ClearAllPoints() EssentialCooldownViewer:SetPoint("TOP", UIParent, "TOP", 0, -50)');
  expect(spot("EssentialCooldownViewer", "TOP"), "while Edit Mode is open, the game can move it").toEqual(["TOP", false]);
  addon.eval("EditModeManagerFrame:Hide()");
  expect(spot("EssentialCooldownViewer", "CENTER"), "and it's back on its spot when Edit Mode closes").toEqual(["CENTER", true]);
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  expect(addon.eval('return __click("Place them to fit the layout") and VanguardDB.profiles.Default.GameTools.place'), "the placing switch is on the page").toBe(false);
  const left = loggedIn(TOOLS_ENV, { savedVariables: "VanguardDB.profiles.Default = { GameTools = { place = false } }" });
  expect(left.eval("return { Vanguard_DamageMeterSpot == nil, DamageMeter.__points.TOPLEFT.rel == UIParent, DamageMeterSessionWindow1.vgSkinned }"), "with placing off they keep Edit Mode's spots but are still styled").toEqual([true, true, true]);
  const off = loggedIn(TOOLS_ENV, { savedVariables: "VanguardDB.profiles.Default = { GameTools = { cooldowns = false, meter = false } }" });
  expect(off.eval("return { EssentialCooldownViewer.items[1].vgSkinned == nil, DamageMeterSessionWindow1.vgSkinned == nil, Vanguard_DamageMeterSpot == nil }"), "switched off, both stay the game's").toEqual([true, true, true]);
  expect(loggedIn("").eval("return ns.GetModule('GameTools') ~= nil"), "a client without these tools loads cleanly").toBe(true);
});

it("Edit Mode shows Vanguard's handles too, with a note under its window", () => {
  const addon = loggedIn(TOOLS_ENV + CLICK_LUA);
  // Whether the handles are up, how many grid lines show, and whether the note shows (with its text).
  const state = () => addon.eval("local n = Vanguard_EditModeNote return { ns.Unlocked(), ns.GridLineCount(), n ~= nil and n:IsShown(), n ~= nil and n.text:GetText() == ns.EDIT_NOTE }");
  addon.eval("EditModeManagerFrame:Show()");
  expect(state(), "opening Edit Mode shows the handles (the game draws its own grid) and the note").toEqual([true, 0, true, true]);
  expect(addon.eval("return Vanguard_EditModeNote.__points.TOP.rel == EditModeManagerFrame"), "the note sits under Edit Mode's window").toBe(true);
  addon.eval("EditModeManagerFrame:Hide()");
  expect(state().slice(0, 3), "closing it hides them again").toEqual([false, 0, false]);
  addon.slash("unlock");
  addon.eval("EditModeManagerFrame:Show() EditModeManagerFrame:Hide()");
  expect(addon.eval("return ns.Unlocked()"), "handles you put up with /vg unlock stay up").toBe(true);
  addon.slash("lock");
  setCombat(addon, true);
  addon.eval("EditModeManagerFrame:Show()");
  expect(state().slice(0, 3), "not in combat").toEqual([false, 0, false]);
  addon.eval("EditModeManagerFrame:Hide()");
  setCombat(addon, false);
  addon.slash("");
  addon.eval(`__click("Show these handles in the game's Edit Mode too")`);
  addon.eval("EditModeManagerFrame:Show()");
  expect(state().slice(0, 3), "the switch under General turns it off").toEqual([false, 0, false]);
});

// TEST-ONLY Edit Mode systems (P2.18): each named game frame gets a Selection (shown to begin with) and
// the HighlightSystem method Edit Mode calls on every system it shows, which shows that Selection.
const SYSTEMS_ENV = `
  function __system(name, noSelection)
    local f = _G[name] or CreateFrame("Frame", name, UIParent)
    if not noSelection then f.Selection = CreateFrame("Frame", nil, f) end
    function f:HighlightSystem() if self.Selection then self.Selection:Show() end end
    return f
  end
  for _, name in ipairs({ "MainMenuBar", "PlayerFrame", "PlayerCastingBarFrame", "CompactRaidFrameContainer", "StatusTrackingBarManager", "ObjectiveTrackerFrame", "EncounterBar" }) do __system(name) end
  __system("PetFrame", true)
  PetFrame:UnregisterAllEvents()
`;

// Whether each named system's Edit Mode handle is shown after Edit Mode highlights every system.
const handles = (addon) => addon.eval(`local out = {}
  for _, name in ipairs({ "MainMenuBar", "PlayerFrame", "PlayerCastingBarFrame", "CompactRaidFrameContainer", "StatusTrackingBarManager", "ObjectiveTrackerFrame", "EncounterBar" }) do
    _G[name]:HighlightSystem() out[#out + 1] = _G[name].Selection:IsShown() end
  return out`);

it("Edit Mode: a game frame Vanguard hides or replaces gets no handle, every other system keeps its own", () => {
  const addon = loggedIn(UNITS_ENV + TIDY_ENV + RAID_ENV + SYSTEMS_ENV);
  expect(addon.eval("return { MainMenuBar.Selection:IsShown(), PlayerFrame.Selection:IsShown(), EncounterBar.Selection:IsShown() }"), "the handle of a frame is hidden as soon as Vanguard hides it; one it leaves alone is untouched").toEqual([false, false, true]);
  expect(handles(addon), "action bars, unit frames, cast bar, raid frames, XP bar and the game's quest tracker (Vanguard's is on): none shows; the encounter bar does").toEqual([false, false, false, false, false, false, true]);
  expect(addon.eval("local ok = pcall(PetFrame.HighlightSystem, PetFrame) return ok"), "a replaced system with no Selection is fine").toBe(true);
  const own = loggedIn(UNITS_ENV + TIDY_ENV + RAID_ENV + SYSTEMS_ENV, { savedVariables: "VanguardDB.profiles.Default = { QuestTracker = { own = false } }" });
  expect(handles(own)[5], "with Vanguard's tracker off, the game's tracker keeps its handle").toBe(true);
  const kept = loggedIn(UNITS_ENV + TIDY_ENV + RAID_ENV + SYSTEMS_ENV, { savedVariables: "VanguardDB.profiles.Default = { ActionBars = { hideBlizzard = false }, UnitFrames = { hideBlizzard = false } }" });
  expect(handles(kept).slice(0, 2), "with the game's bars and unit frames kept, their handles stay").toEqual([true, true]);
  const plain = loggedIn(UNITS_ENV + TIDY_ENV + RAID_ENV + SYSTEMS_ENV + "hooksecurefunc = nil");
  expect(plain.eval("return PlayerFrame.Selection:IsShown()"), "a client without hooksecurefunc leaves handles alone").toBe(true);
});

// TEST-ONLY: a client with the Cooldown Manager (switched off), and a cooldown on the essential row's item.
const CDM_ENV = `C_CooldownViewer = { IsCooldownViewerAvailable = function() return true end }
  local i = EssentialCooldownViewer.items[1] i.Cooldown = CreateFrame("Cooldown", nil, i)
`;

it("the game's tools: a switch shows the Cooldown Manager's essential row between the frames, timers in the theme font", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_ENV + CDM_ENV + CLICK_LUA);
  const timer = addon.eval("local fs = EssentialCooldownViewer.items[1].Cooldown:GetCountdownFontString() return { fs.__font[2], fs.__font[3] }");
  expect(timer, "the cooldown timer in the theme's timer font").toEqual([addon.eval('return ns.Theme.RoleSize("cooldown")'), "OUTLINE"]);
  expect(addon.eval('return GetCVar("cooldownViewerEnabled") == nil'), "off by default: the game's setting is left alone").toBe(true);
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  addon.eval(`__click("Show the game's Cooldown Manager")`);
  expect(addon.eval('return GetCVar("cooldownViewerEnabled")'), "ticked: the game's Cooldown Manager is on").toBe("1");
  addon.eval(`__click("Show the game's Cooldown Manager")`);
  expect(addon.eval('return GetCVar("cooldownViewerEnabled")'), "unticked: off again").toBe("0");
  const on = loggedIn(UNITS_ENV + TOOLS_ENV + CDM_ENV, { savedVariables: "VanguardDB.profiles = { Default = { GameTools = { essential = true } } }" });
  expect([on.eval('return GetCVar("cooldownViewerEnabled")'), chatHas(on, /Cooldown Manager is off/), on.eval("return EssentialCooldownViewer.__points.CENTER.rel == Vanguard_EssentialCooldownViewerSpot")],
    "switched on at login: on, no hint, the essential row on its spot between the frames").toEqual(["1", false, true]);
  const screen = on.screen();
  expect(screen.map((f) => f.name)).toEqual(expect.arrayContaining(["Vanguard_EssentialCooldownViewerSpot", "Vanguard_player", "Vanguard_target"]));
  const bad = [];
  // A game frame filling its own spot (Vanguard_<name>Spot) is meant to cover it.
  const ownSpot = (a, b) => b.name === `Vanguard_${a.name}Spot` || a.name === `Vanguard_${b.name}Spot`;
  for (const a of screen) for (const b of screen) if (a.name < b.name && !ownSpot(a, b) && a.rect.left < b.rect.right && b.rect.left < a.rect.right && a.rect.bottom < b.rect.top && b.rect.bottom < a.rect.top) bad.push(`${a.name} x ${b.name}`);
  expect(bad, "with it on, nothing in the layout covers anything else").toEqual([]);
  const old = loggedIn(UNITS_ENV + TOOLS_ENV + "C_CooldownViewer = nil\n", { savedVariables: "VanguardDB.profiles = { Default = { GameTools = { essential = true } } }" });
  expect(old.eval('return GetCVar("cooldownViewerEnabled") == nil'), "a client without the Cooldown Manager is left alone").toBe(true);
});

it("the game's tools: one hint when the Cooldown Manager is off", () => {
  // A client whose Cooldown Manager is available (or not) and switched on (or not).
  const env = (enabled, available = "true") => `C_CooldownViewer = { IsCooldownViewerAvailable = function() return ${available} end }
    C_CVar = { GetCVarBool = function(name) if name == "cooldownViewerEnabled" then return ${enabled} end end }`;
  const addon = loggedIn(UNITS_ENV + env("false"));
  addon.fire("PLAYER_ENTERING_WORLD");
  expect(chatHas(addon, /Cooldown Manager is off\. Turn it on in Options > Gameplay Enhancements/), "where to turn it on").toBe(true);
  addon.fire("PLAYER_ENTERING_WORLD");
  expect([addon.chat().filter((line) => /Cooldown Manager is off/.test(line)).length, addon.eval("return VanguardDB.profiles.Default.GameTools.cdmHint")], "said once").toEqual([1, false]);
  // Whether a client says the hint at all.
  const hints = (lua, saved = "") => { const a = loggedIn(UNITS_ENV + lua, { savedVariables: saved }); a.fire("PLAYER_ENTERING_WORLD"); return chatHas(a, /Cooldown Manager is off/); };
  expect([hints(env("true")), hints(env("false", "false")), hints(env("false") + " C_CVar = nil"), hints("C_CooldownViewer = nil"),
    hints(env("false"), "VanguardDB.profiles = { Default = { GameTools = { cooldowns = false } } }")],
  "not when it's on, not available yet, the client can't say, or Vanguard leaves it alone").toEqual([false, false, false, false, false]);
});

it("the game's extras: duplicates hidden, minimap buttons on the map, menu strip, quest tracker", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV);
  expect(["DurabilityFrame", "TimeManagerClockButton", "GameTimeFrame"].map((n) => putAway(addon, n)), "the game's durability figure, clock and calendar button are put away").toEqual([true, true, true]);
  // The game's XP bar: still under its own parent (Edit Mode calls methods on it), and hidden.
  const xpBar = () => addon.eval("local f = StatusTrackingBarManager return { f:GetParent() == UIParent, f:IsShown() }");
  expect(xpBar(), "the game's XP bar is hidden where it is, not moved").toEqual([true, false]);
  addon.eval("StatusTrackingBarManager:Show()");
  expect(xpBar(), "when the game shows it, it's hidden again").toEqual([true, false]);
  addon.eval("StatusTrackingBarManager:SetShown(true)");
  expect(xpBar(), "however it's shown").toEqual([true, false]);
  expect(addon.eval("local M = ns.GetModule('Minimap') M.overlay:Layout() return M.overlay.Layout == M.NoLayout"), "the map's overlay answers a moved button's Layout call (the mail icon makes one when mail arrives)").toBe(true);
  const overlay = "ns.GetModule('Minimap').overlay";
  expect([pinned(addon, "MinimapCluster.Tracking", overlay), pinned(addon, "MinimapCluster.IndicatorFrame.MailFrame", overlay), pinned(addon, "AddonCompartmentFrame", overlay)],
    "tracking, mail and the addon compartment sit on the map's corners").toEqual([[true, "BOTTOMLEFT"], [true, "TOPRIGHT"], [true, "BOTTOMRIGHT"]]);
  addon.eval('MinimapCluster.Tracking:ClearAllPoints() MinimapCluster.Tracking:SetPoint("CENTER", UIParent, "CENTER", 0, 0)');
  expect(pinned(addon, "MinimapCluster.Tracking", overlay), "when the game moves one back, it returns to its corner").toEqual([true, "BOTTOMLEFT"]);
  const slots = addon.eval(`local t, a = MinimapCluster.Tracking, AddonCompartmentFrame
    return { t:GetWidth(), t:GetScale(), t.vgGlyph.__texture:match("(%a+)$"), a.vgGlyph.__texture:match("(%a+)$"), t.vgSlot ~= nil, MinimapCluster.IndicatorFrame.MailFrame.vgSlot == nil }`);
  expect(slots, "tracking and the addon compartment are 18-unit slot buttons with the theme's icons (unscaled); mail stays an indicator").toEqual([18, 1, "Search", "Modules", true, true]);
  expect(addon.eval("local a = AddonCompartmentFrame a.Text = a:CreateFontString() ns.GetModule('Minimap').SlotButton(a, 'Modules') return a.Text:GetAlpha()"), "the compartment's count is faded, not left hanging off the slot").toBe(0);
  addon.eval("local a = AddonCompartmentFrame a.__scripts.OnEnter(a)");
  expect(isTok(addon, addon.eval("return AddonCompartmentFrame.vgGlyph.__vertexColor"), "accent"), "a slot button's icon lights in the accent under the mouse").toBe(true);
  expect([pinned(addon, "BagsBar", "Vanguard_MenuStrip"), pinned(addon, "MicroMenuContainer", "Vanguard_MenuStrip")], "the bag bar and the micro menu ride in one bar, each at its row's right end").toEqual([[true, "RIGHT"], [true, "RIGHT"]]);
  expect(addon.eval("for _, e in ipairs(ns.errors) do if e.text:find('pin ') then return e.text end end return 'none'"), "pinning the first row fits both rows with no error: every row's anchor is made first").toBe("none");
  addon.eval("BagsBar:SetSize(600, 45) ns.PausePins(false)");
  expect(barSize(addon), "a bag bar 600 units wide holds 13 bags: the bar hugs their slots inside a 12-unit margin (two rows tall)").toEqual([barW(13), BAR_H]);
  addon.eval("BagsBar:SetSize(50, 20) ns.PausePins(false)");
  expect([...barSize(addon), addon.eval("return Vanguard_BagStrip == nil")], "one bag: the bar shrinks to hug its one slot, and there is no separate bag strip").toEqual([barW(1), BAR_H, true]);
  expect(addon.eval("local s = Vanguard_MenuStrip return { s:GetAlpha(), s.__mouseMotion == nil }"), "the bar is always shown by default (P2.18), nothing watching the mouse").toEqual([1, true]);
  expect(addon.eval("return { Vanguard_QuestTracker:GetWidth(), Vanguard_QuestTracker:GetHeight(), next(ObjectiveTrackerFrame.__points) == nil }"), "Vanguard's tracker is on: its spot is made (260 by 234) and the game's tracker is not pinned").toEqual([260, 234, true]);
});

it("the game's extras: a protected frame is hidden once, out of combat, with no Show hook", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + "ProtectedBar = CreateFrame('Frame', 'ProtectedBar', UIParent) ProtectedBar.IsProtected = function() return true, false end __wfgStub.inCombat = true");
  // Shown, still under UIParent, and without a raw Show or SetShown hook.
  const state = () => addon.eval("local f = ProtectedBar return { f:IsShown(), f:GetParent() == UIParent, rawget(f, 'Show') == nil and rawget(f, 'SetShown') == nil }");
  addon.eval("ns.GetModule('DataBars').Suppress('ProtectedBar')");
  expect(state(), "in combat it is left alone, with no hook").toEqual([true, true, true]);
  setCombat(addon, false);
  expect(state(), "after combat it is hidden where it is, still with no hook").toEqual([false, true, true]);
  addon.eval("ProtectedBar:Show() ns.GetModule('DataBars').Suppress('ProtectedBar')");
  expect(state(), "hidden once: shown again when the game shows it, and a second Suppress does nothing").toEqual([true, true, true]);
});

it("the game's extras: each switch off leaves the game's frame alone, and missing frames are fine", () => {
  const off = loggedIn(UI_ENV + TIDY_ENV, { savedVariables: `VanguardDB.profiles = { Default = { DataBars = { xp = false, reputation = false },
    InfoStrip = { durability = false, clock = false }, Minimap = { icons = false }, MenuStrip = { menu = "always", tracker = false }, QuestTracker = { own = false } } }` });
  expect(["StatusTrackingBarManager", "DurabilityFrame", "TimeManagerClockButton"].map((n) => putAway(off, n)), "replacements off: the game's own stay").toEqual([false, false, false]);
  expect(off.eval("return MinimapCluster.Tracking:GetParent() == MinimapCluster"), "minimap buttons off: tracking stays where the game put it").toBe(true);
  expect(off.eval("return { Vanguard_MenuStrip:GetAlpha(), Vanguard_MenuStrip.__scripts.OnUpdate == nil }"), "menu strip set to Always: always shown, nothing polling").toEqual([1, true]);
  expect(off.eval("return next(ObjectiveTrackerFrame.__points) == nil and Vanguard_QuestTracker == nil"), "tracker off: the game's tracker is left alone").toBe(true);
  const bare = loggedIn(UI_ENV);
  expect(bare.eval("return Vanguard_MenuStrip ~= nil and Vanguard_QuestTracker ~= nil"), "a client without these frames still gets the strip and the spot, with nothing to pin").toBe(true);
});

it("Round Four leftovers: menu glyphs, a target diamond, raid names above incoming heals", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + CLICK_LUA, { savedVariables: "VanguardDB.profiles.Default = { MenuStrip = { glyphs = true } }" });
  // A menu button's state: its icon, the icon's color, its faded art and kept flash, the icon's width.
  const glyph = (name) => addon.eval(`local b = ${name} local art
    for _, r in ipairs({ b:GetRegions() }) do if r.__texture == "TEST-ONLY-ART" then art = r.__alpha end end
    return { tex = b.vgGlyph and b.vgGlyph.__texture, color = b.vgGlyph and b.vgGlyph.__vertexColor, art = art, normal = b.normal.__alpha, flash = b.Flash.__alpha or 1, w = b.vgGlyph and b.vgGlyph.__width }`);
  const char = glyph("CharacterMicroButton");
  expect(/Icons\\Character$/.test(char.tex) && /Icons\\MenuCog$/.test(glyph("MainMenuMicroButton").tex), "switched on, each menu button gets its Vanguard icon (a client without the rest is fine)").toBeTruthy();
  expect([char.art, char.normal, char.flash, r3(char.w * MENU)], "the game's art is faded but its alert flash stays; the icon is 20 screen pixels").toEqual([0, 0, 1, 20]);
  expect(isTok(addon, char.color, "text"), "the icon is text").toBeTruthy();
  const slot = addon.eval("local s = CharacterMicroButton.vgSlot return { s.__width, s.__height, s.__points.CENTER ~= nil, CharacterMicroButton.vgGlyph:GetParent() == s }");
  expect([r3(slot[0] * MENU), r3(slot[1] * MENU), slot[2], slot[3]], "each button sits on a centered slot 24 pixels wide and 30 tall (a 4-pixel gap to its neighbors), the icon on it").toEqual([24, 30, true, true]);
  const bag = addon.eval(`local b = MainMenuBarBackpackButton local art
    for _, r in ipairs({ b:GetRegions() }) do if r.__texture == "TEST-ONLY-ART" then art = r.__alpha end end
    return { art, b.icon.__alpha, b.icon.__texCoord[1] > 0, b.icon.__points.TOPLEFT.rel == b.vgSlot, b.icon.__points.TOPLEFT.x }`);
  expect([...bag.slice(0, 4), r3(bag[4] * BAGS)], "bag buttons: the game's art faded, the bag icon kept, cropped and inset 3 pixels in its slot").toEqual([0, 1, true, true, 3]);
  addon.eval("CharacterMicroButton:Disable()");
  expect(isTok(addon, glyph("CharacterMicroButton").color, "muted"), "and muted while the button is disabled").toBeTruthy();
  addon.eval("CharacterMicroButton:Enable()");
  expect(isTok(addon, glyph("CharacterMicroButton").color, "text"), "back to text when it's enabled again").toBeTruthy();
  addon.eval('ns.Options.Show("more")');
  expect(addon.eval('return __click("Vanguard icons on the menu buttons") and VanguardDB.profiles.Default.MenuStrip.glyphs'), "the switch is on the page").toBe(false);
  const plain = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV);
  expect(plain.eval("return { CharacterMicroButton.vgGlyph == nil, CharacterMicroButton.normal.__alpha == nil, CharacterMicroButton.vgSlot ~= nil }"), "by default the game's own icon stays, on its slot").toEqual([true, true, true]);

  const plates = loggedIn(UNITS_ENV + CLICK_LUA + PLATE_ENV);
  plates.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  plates.fire("PLAYER_ENTERING_WORLD");
  // A plate's target marker: shown, texture, color and where it's anchored.
  const marker = (unit) => plates.eval(`local m = __plates.${unit}.vg.marker return { m:IsShown(), m.__texture, m.__vertexColor, m.__points.LEFT.relPoint }`);
  const target = marker("nameplate1");
  expect(target[0] === true && /Textures\\Diamond$/.test(target[1]) && isTok(plates, target[2], "accent") && target[3] === "RIGHT", "your target's plate gets an accent diamond at its right").toBeTruthy();
  // Whether a plate's target marker shows.
  const shown = (unit) => plates.eval(`return __plates.${unit}.vg.marker:IsShown()`);
  expect(shown("nameplate2"), "other plates don't").toBe(false);
  plates.eval('VanguardDB.profiles.Default.Nameplates.targetBorder = false ns.GetModule("Nameplates").Update(__plates.nameplate1.vg, "nameplate1")');
  expect(shown("nameplate1"), "and it goes with the target border switch").toBe(false);

  const raid = loggedIn(UNITS_ENV + RAID_ENV + HEALING_ENV);
  raid.eval('__spawn(1, "raid1")');
  const layers = raid.eval(`local b = Vanguard_RaidUnitButton1
    return { b.name:GetParent() == b.texts and b.status:GetParent() == b.texts and b.role:GetParent() == b.texts and b.roleShadow:GetParent() == b.texts,
      b.texts:GetFrameLevel() > b.heal:GetFrameLevel() and b.texts:GetFrameLevel() > b.shield:GetFrameLevel(), b.texts:GetFrameLevel() < b.overlay:GetFrameLevel() }`);
  expect(layers, "a tile's name, role and status sit above the incoming-heal and shield bars, under the status marks").toEqual([true, true, true]);
});
