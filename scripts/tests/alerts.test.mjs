// alerts: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, RAID_ENV, TIDY_ENV, TOOLS_ENV, UNITS_ENV, chatHas, gridLines, isTok, loggedIn, px, setCombat } from "./helpers.mjs";

// TEST-ONLY extra windows: friends, a book (its page text records the colors it's given), and
// the game's loss of control and talking head alerts with their parts.
const ALERTS_ENV = `
  hooksecurefunc = function(t, name, fn) if type(t) == "string" then return end local orig = t[name] t[name] = function(...) local r = orig(...) fn(...) return r end end
  FriendsFrame = CreateFrame("Frame", "FriendsFrame", UIParent) FriendsFrame:Hide()
  ItemTextFrame = CreateFrame("Frame", "ItemTextFrame", UIParent) ItemTextFrame:Hide()
  ItemTextFrame:SetScript("OnEvent", function() end)
  ItemTextMaterialTopLeft = ItemTextFrame:CreateTexture("ItemTextMaterialTopLeft")
  ItemTextPageText = { __colors = {}, SetTextColor = function(self, tag, r, g, b) self.__colors[tag] = { r, g, b, 1 } end }
  LossOfControlFrame = CreateFrame("Frame", "LossOfControlFrame", UIParent)
  LossOfControlFrame.blackBg = LossOfControlFrame:CreateTexture()
  LossOfControlFrame.Icon = LossOfControlFrame:CreateTexture()
  LossOfControlFrame.AbilityName = LossOfControlFrame:CreateFontString()
  LossOfControlFrame.TimeLeft = CreateFrame("Frame", nil, LossOfControlFrame)
  LossOfControlFrame.TimeLeft.NumberText = LossOfControlFrame.TimeLeft:CreateFontString()
  TalkingHeadFrame = CreateFrame("Frame", "TalkingHeadFrame", UIParent)
  TalkingHeadFrame.BackgroundFrame = CreateFrame("Frame", nil, TalkingHeadFrame)
  TalkingHeadFrame.MainFrame = CreateFrame("Frame", nil, TalkingHeadFrame)
  TalkingHeadFrame.MainFrame.Name = TalkingHeadFrame.MainFrame:CreateFontString()
  TalkingHeadFrame.MainFrame.Text = TalkingHeadFrame.MainFrame:CreateFontString()
`;
it("game alerts: loss of control and the talking head, styled and placed (or hidden)", () => {
  const addon = loggedIn(ALERTS_ENV);
  const loc = addon.eval(`local f = LossOfControlFrame
    return { f.blackBg:IsShown(), f.Icon.__texCoord ~= nil, f.AbilityName.__font ~= nil, f.TimeLeft.NumberText.__font ~= nil, f.__points.CENTER.rel == Vanguard_LossOfControlFrameSpot }`);
  expect(loc, "loss of control: its black band hidden, icon cropped, theme text, centered on its spot").toEqual([false, true, true, true, true]);
  expect(addon.eval("return { ns.MoverPoint('lossofcontrol') }"), "a little above your character").toEqual(["CENTER", "CENTER", 0, 140]);
  const head = addon.eval("local f = TalkingHeadFrame return { f.BackgroundFrame.__alpha, f.MainFrame.Name.__font ~= nil, f.__points.CENTER.rel == Vanguard_TalkingHeadFrameSpot }");
  expect([head, addon.eval("return (ns.MoverPoint('talkinghead'))")], "the talking head: parchment faded, theme text, at the top center").toEqual([[0, true, true], "TOP"]);
  const hide = loggedIn(ALERTS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { GameAlerts = { talkingHead = 'hide', lossOfControl = false } } }" });
  hide.eval("TalkingHeadFrame:Show()");
  expect(hide.eval("return { TalkingHeadFrame:IsShown(), Vanguard_TalkingHeadFrameSpot == nil, LossOfControlFrame.blackBg.__alpha == nil }"), "hidden, if you'd rather; loss of control off stays the game's").toEqual([false, true, true]);
  const game = loggedIn(ALERTS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { GameAlerts = { talkingHead = 'game' } } }" });
  expect(game.eval("return { TalkingHeadFrame:IsShown(), Vanguard_TalkingHeadFrameSpot == nil }"), "or left to the game").toEqual([true, true]);
  const partial = loggedIn("LossOfControlFrame = CreateFrame('Frame', 'LossOfControlFrame', UIParent) TalkingHeadFrame = CreateFrame('Frame', 'TalkingHeadFrame', UIParent)");
  expect(partial.eval("return Vanguard_LossOfControlFrameSpot ~= nil and Vanguard_TalkingHeadFrameSpot ~= nil"), "frames without their usual parts are still placed").toBe(true);
  expect(loggedIn("").eval("return Vanguard_LossOfControlFrameSpot == nil"), "a client without them loads cleanly").toBe(true);
});
it("game alerts: the loss of control band stays hidden when the game's animation resets its alpha", () => {
  const addon = loggedIn(ALERTS_ENV + "LossOfControlFrame.RedLineTop = LossOfControlFrame:CreateTexture() LossOfControlFrame.RedLineBottom = LossOfControlFrame:CreateTexture()");
  expect(addon.eval("local f = LossOfControlFrame return { f.blackBg:IsShown(), f.RedLineTop:IsShown(), f.RedLineBottom:IsShown() }"), "the band and both red lines are hidden").toEqual([false, false, false]);
  addon.eval("local f = LossOfControlFrame f.blackBg:SetAlpha(0.6) f.RedLineTop:SetAlpha(1) f.RedLineBottom:SetAlpha(1)");
  expect(addon.eval("local f = LossOfControlFrame return { f.blackBg:IsShown(), f.RedLineTop:IsShown(), f.RedLineBottom:IsShown() }"), "restoring their alpha shows nothing").toEqual([false, false, false]);
});
it("game alerts: a talking head that loads later is restyled once when its part of the game loads", () => {
  const addon = loggedIn(ALERTS_ENV.replace(/TalkingHeadFrame/g, "TEST_ONLY_Unloaded"));
  expect(addon.eval("return Vanguard_TalkingHeadFrameSpot == nil"), "nil at login: nothing placed yet").toBe(true);
  addon.fire("ADDON_LOADED", "Blizzard_Something");
  expect(addon.eval("return Vanguard_TalkingHeadFrameSpot == nil"), "another part loading changes nothing").toBe(true);
  addon.eval(`TalkingHeadFrame = CreateFrame("Frame", "TalkingHeadFrame", UIParent) TalkingHeadFrame.BackgroundFrame = CreateFrame("Frame", nil, TalkingHeadFrame)`);
  addon.fire("ADDON_LOADED", "Blizzard_TalkingHeadUI");
  expect(addon.eval("local f = TalkingHeadFrame return { f.BackgroundFrame.__alpha, f.__points.CENTER.rel == Vanguard_TalkingHeadFrameSpot }"), "loaded: parchment faded, on its spot").toEqual([0, true]);
  addon.eval("__spot = Vanguard_TalkingHeadFrameSpot");
  addon.fire("ADDON_LOADED", "Blizzard_TalkingHeadUI");
  expect(addon.eval("return Vanguard_TalkingHeadFrameSpot == __spot"), "a second load event makes no second spot").toBe(true);
});
// TEST-ONLY raid warning frame: one message line the game reuses (as its pool does), numbered as messages come.
const WARNING_ENV = `
  GameFontNormalHuge = "GameFontNormalHuge"
  RaidWarningFrame = CreateFrame("Frame", "RaidWarningFrame", UIParent)
  RaidWarningFrame.line, RaidWarningFrame.counter = RaidWarningFrame:CreateFontString(nil, nil, "GameFontNormalHuge"), 0
  function RaidWarningFrame:AddMessage(text) self.counter = self.counter + 1 self.line:SetText(text) self.line:SetTextColor(1, 0.2, 0.2) self.line.messageOrder = self.counter end
  function RaidWarningFrame:GetSortedMessages() return { self:CreateFontString(nil, nil, "GameFontNormalHuge"), self.line } end
  RaidWarningFrame:RegisterEvent("HARDCORE_DEATHS") RaidWarningFrame:RegisterEvent("CHAT_MSG_RAID_WARNING")
  RaidWarningFrame:SetScript("OnEvent", function(self, event, text) self:AddMessage(text) end)
`;
it("game alerts: Hardcore death notices take the theme font and red; a reused line gets the game's font back", () => {
  const addon = loggedIn(WARNING_ENV);
  // The message line: its font face, color, the game font object it was given, and the death mark.
  const line = () => addon.eval("local l = RaidWarningFrame.line return { font = l.__font and l.__font[1], color = l.__textColor, template = l.__template or false, death = ns.FrameState('vgDeath')[l] or false }");
  addon.fire("HARDCORE_DEATHS", "TEST-ONLY Bob has fallen.");
  const death = line();
  expect([death.font, isTok(addon, death.color, "bad"), death.death], "a death notice: the theme's title font, the theme's red").toEqual([addon.eval('local f = UIParent:CreateFontString() ns.Theme.ApplyRole(f, "title") return f.__font[1]'), true, true]);
  addon.fire("CHAT_MSG_RAID_WARNING", "TEST-ONLY Pull in 5");
  expect([line().template, line().death], "the next raid warning on that line: the game's font again").toEqual(["GameFontNormalHuge", false]);
  addon.fire("CHAT_MSG_RAID_WARNING", "TEST-ONLY Again");
  expect(line().template, "a line that was never a death notice is left as it is").toBe("GameFontNormalHuge");
  const off = loggedIn(WARNING_ENV, { savedVariables: "VanguardDB.profiles = { Default = { GameAlerts = { hardcore = false } } }" });
  off.fire("HARDCORE_DEATHS", "TEST-ONLY Bob has fallen.");
  expect(off.eval("return RaidWarningFrame.line.__font == nil"), "switched off: the game's own look").toBe(true);
  expect(loggedIn("RaidWarningFrame = CreateFrame('Frame', 'RaidWarningFrame', UIParent)").eval("return ns.GetModule('GameAlerts').settings.hardcore"), "a frame without the game's message list is left alone").toBe(true);
});
// TEST-ONLY minimap marks: a rare, a treasure, a dead rare, a rare with a hidden name, a rare elite.
const VIGNETTE_ENV = `
  issecretvalue = function(v) return type(v) == "table" and v.__secret == true end
  __vignettes = {
    rare = { name = "TEST-ONLY Rare", atlasName = "VignetteKill", isDead = false }, chest = { name = "TEST-ONLY Chest", atlasName = "VignetteLoot" },
    dead = { name = "TEST-ONLY Dead", atlasName = "VignetteKill", isDead = true }, hidden = { name = { __secret = true }, atlasName = "VignetteKill" },
    elite = { name = "TEST-ONLY Elite", atlasName = "VignetteKillElite" },
  }
  C_VignetteInfo = { GetVignetteInfo = function(guid) return __vignettes[guid] end }
`;
it("game alerts: a rare nearby is announced with a sound and a chat line, out of combat, once (off until switched on)", () => {
  const addon = loggedIn(VIGNETTE_ENV + CLICK_LUA);
  // Rare lines in chat so far.
  const rares = () => addon.chat().filter((l) => /Rare nearby/.test(l));
  addon.fire("VIGNETTE_MINIMAP_UPDATED", "rare", true);
  expect(rares(), "off until you switch it on").toEqual([]);
  addon.slash("");
  addon.eval('ns.Options.Show("tools")');
  expect(addon.eval('return __click("A rare nearby")'), "the switch is under Combat tools").toBe(true);
  addon.fire("VIGNETTE_MINIMAP_UPDATED", "rare", true);
  addon.fire("VIGNETTE_MINIMAP_UPDATED", "rare", true);
  expect([rares().length, /Rare nearby: TEST-ONLY Rare$/.test(rares()[0]), addon.eval("return __wfgWorld.sounds[#__wfgWorld.sounds]")], "one line and the raid warning sound, once per rare").toEqual([1, true, "RAID_WARNING"]);
  for (const guid of ["chest", "dead", "hidden", "nothing"]) addon.fire("VIGNETTE_MINIMAP_UPDATED", guid, true);
  addon.fire("VIGNETTE_MINIMAP_UPDATED", "elite", false);
  addon.eval('__wfgStub.fire("VIGNETTE_MINIMAP_UPDATED", { __secret = true }, true)');
  expect(rares().length, "a treasure, a dead rare, a hidden name, an unknown mark, one leaving the map, a hidden mark: nothing").toBe(1);
  setCombat(addon, true);
  addon.fire("VIGNETTE_MINIMAP_UPDATED", "elite", true);
  expect(rares().length, "not in a fight").toBe(1);
  setCombat(addon, false);
  addon.fire("VIGNETTE_MINIMAP_UPDATED", "elite", true);
  expect(rares().length, "a rare elite after the fight").toBe(2);
});
// What the game's boss holder and its first and last boss button look like: shown, parked, listening, hooked.
const bossHolder = (addon) => addon.eval(`local c, b1, b5 = BossTargetFrameContainer, Boss1TargetFrame, Boss5TargetFrame
  return { c:IsShown(), c:GetParent() == UIParent, c:IsEventRegistered("PLAYER_ENTERING_WORLD"), rawget(c, "Show") == nil and rawget(c, "SetShown") == nil,
    b1:IsEventRegistered("INSTANCE_ENCOUNTER_ENGAGE_UNIT"), b5:IsEventRegistered("INSTANCE_ENCOUNTER_ENGAGE_UNIT"), b1:GetParent() == c, b5:GetParent() == c }`);
it("boss frames: five in a column at the top left, the game's put away", () => {
  const addon = loggedIn(UNITS_ENV + BOSS_ENV);
  expect(addon.eval(`return { Vanguard_boss5 ~= nil, Vanguard_boss1.__watched, Vanguard_boss2.__points.TOPLEFT.rel == Vanguard_boss1, Vanguard_boss2:GetWidth() }`), "five boss frames, each shown while its boss exists, stacked, 150 wide in whole screen pixels").toEqual([true, true, true, px(addon, 150)]);
  expect(addon.eval("return { ns.MoverPoint('uf_boss1') }"), "movable, from the top-left corner").toEqual(["TOPLEFT", "TOPLEFT", 20, -20]);
  addon.eval("__units.boss1.hp = 4200");
  addon.fire("INSTANCE_ENCOUNTER_ENGAGE_UNIT");
  expect(addon.eval("return { Vanguard_boss1.health.__value, Vanguard_boss1.name:GetText() }"), "a boss joining the fight shows on its frame").toEqual([4200, "TEST-ONLY Boss"]);
  expect(bossHolder(addon), "the game's holder is hidden, parked, silenced and has no Show hook; its boss buttons are silenced and out of it").toEqual([false, false, false, true, false, false, false, false]);
  expect(addon.eval("return { BossTargetFrameContainer:GetParent():IsShown(), Boss5TargetFrame:IsShown() }"), "under a parent that is hidden").toEqual([false, false]);
  const off = loggedIn(UNITS_ENV + BOSS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { UnitFrames = { boss = false } } }" });
  expect(off.eval("return Vanguard_boss1 == nil"), "switched off: no boss frames").toBe(true);
  expect(bossHolder(off), "and the game keeps its own, untouched").toEqual([true, true, true, true, true, true, true, true]);
});
it("boss frames: the game's holder is put away only out of combat", () => {
  const addon = loggedIn(UNITS_ENV + BOSS_ENV + "__wfgStub.inCombat = true");
  expect([addon.eval("return Vanguard_boss1 == nil"), ...bossHolder(addon)], "in combat nothing is touched").toEqual([true, true, true, true, true, true, true, true, true]);
  setCombat(addon, false);
  expect([addon.eval("return Vanguard_boss1 ~= nil"), ...bossHolder(addon)], "when combat ends it is put away, still without a hook").toEqual([true, false, false, false, true, false, false, false, false]);
});
// TEST-ONLY boss: one boss in the fight, and the game's boss frame holder (an Edit Mode frame,
// protected through its five secure boss buttons, which register the engage event).
const BOSS_ENV = `
  __units.boss1 = { name = "TEST-ONLY Boss", hp = 5000, maxhp = 10000, power = 0, maxpower = 0, ptype = "MANA" }
  hooksecurefunc = function(t, name, fn) if type(t) == "string" then t, name, fn = _G, t, name end local orig = t[name] if type(orig) ~= "function" then return end t[name] = function(...) local r = orig(...) fn(...) return r end end
  BossTargetFrameContainer = CreateFrame("Frame", "BossTargetFrameContainer", UIParent)
  BossTargetFrameContainer:RegisterEvent("PLAYER_ENTERING_WORLD")
  BossTargetFrameContainer.IsProtected = function() return true, false end
  for i = 1, 5 do
    CreateFrame("Button", "Boss" .. i .. "TargetFrame", BossTargetFrameContainer, "SecureUnitButtonTemplate"):RegisterEvent("INSTANCE_ENCOUNTER_ENGAGE_UNIT")
  end
`;
it("the game's tools: Cooldown Manager and damage meter styled and placed, standing aside for Edit Mode", () => {
  const addon = loggedIn(TOOLS_ENV + CLICK_LUA);
  const item = addon.eval(`local i = EssentialCooldownViewer.items[1]
    return { crop = i.Icon.__texCoord and i.Icon.__texCoord[1], inset = i.Icon.__points.TOPLEFT.x > 0, font = i.ChargeCount.Current.__font[3] }`);
  expect(item.crop > 0 && item.inset && item.font === "OUTLINE", "cooldown icons are cropped, inset in a thin border, with outlined numbers").toBe(true);
  addon.eval("UtilityCooldownViewer:RefreshLayout()");
  expect(addon.eval("return ns.FrameState('vgSkinned')[UtilityCooldownViewer.items[2]]"), "items the game adds later are styled too").toBe(true);
  expect(addon.eval("return BuffBarCooldownViewer.items[1].Bar:GetStatusBarTexture() ~= nil and BuffBarCooldownViewer.items[1].Bar.Name.__font ~= nil"), "buff bars get the theme's bar and font").toBe(true);
  const win = addon.eval("local w = DamageMeterSessionWindow1 local l = w.ScrollBox.lines[1] return { w.Header.__alpha, l.StatusBar.BackgroundRegions[1].__alpha, l.StatusBar.Name.__font ~= nil }");
  expect(win, "the meter's header and bar shading fade, its lines take the theme font").toEqual([0, 0, true]);
  addon.eval("__line(DamageMeterSessionWindow1) DamageMeterSessionWindow1.ScrollBox:Update() DamageMeter:SetupSessionWindow() __line(DamageMeterSessionWindow2) DamageMeterSessionWindow2.ScrollBox:Update()");
  expect(addon.eval("return { ns.FrameState('vgSkinned')[DamageMeterSessionWindow1.ScrollBox.lines[2]], ns.FrameState('vgSkinned')[DamageMeterSessionWindow2], ns.FrameState('vgSkinned')[DamageMeterSessionWindow2.ScrollBox.lines[1]] }"), "new lines and new windows are styled as they come").toEqual([true, true, true]);
  // Where a game frame is anchored: { point, the spot it's on }.
  const spot = (name, point) => addon.eval(`local p = ${name}.__points.${point} return p and { p.relPoint, p.rel == Vanguard_${name}Spot } or false`);
  expect([spot("EssentialCooldownViewer", "CENTER"), spot("DamageMeter", "TOPLEFT"), spot("DamageMeter", "BOTTOMRIGHT")], "rows are centered on their spots; the meter fills its own").toEqual([["CENTER", true], ["TOPLEFT", true], ["BOTTOMRIGHT", true]]);
  addon.eval('EditModeManagerFrame:Show() EssentialCooldownViewer:ClearAllPoints() EssentialCooldownViewer:SetPoint("TOP", UIParent, "TOP", 0, -50)');
  expect(spot("EssentialCooldownViewer", "TOP"), "while Edit Mode is open, the game can move it").toEqual(["TOP", false]);
  addon.eval("EditModeManagerFrame:Hide()");
  expect(spot("EssentialCooldownViewer", "CENTER"), "and it's back on its spot when Edit Mode closes").toEqual(["CENTER", true]);
  addon.slash("");
  addon.eval('ns.Options.Show("tools")');
  expect(addon.eval('return __click("Place them to fit the layout") and VanguardDB.profiles.Default.GameTools.place'), "the placing switch is on the page").toBe(false);
  const left = loggedIn(TOOLS_ENV, { savedVariables: "VanguardDB.profiles.Default = { GameTools = { place = false } }" });
  expect(left.eval("return { Vanguard_DamageMeterSpot == nil, DamageMeter.__points.TOPLEFT.rel == UIParent, ns.FrameState('vgSkinned')[DamageMeterSessionWindow1] }"), "with placing off they keep Edit Mode's spots but are still styled").toEqual([true, true, true]);
  const off = loggedIn(TOOLS_ENV, { savedVariables: "VanguardDB.profiles.Default = { GameTools = { cooldowns = false, meter = false } }" });
  expect(off.eval("return { ns.FrameState('vgSkinned')[EssentialCooldownViewer.items[1]] == nil, ns.FrameState('vgSkinned')[DamageMeterSessionWindow1] == nil, Vanguard_DamageMeterSpot == nil }"), "switched off, both stay the game's").toEqual([true, true, true]);
  expect(loggedIn("").eval("return ns.GetModule('GameTools') ~= nil"), "a client without these tools loads cleanly").toBe(true);
});
it("Edit Mode shows Vanguard's handles too, with a note under its window", () => {
  const addon = loggedIn(TOOLS_ENV + CLICK_LUA);
  // Whether the handles are up, how many grid lines show, and whether the note shows (with its text).
  const state = () => {
    const s = addon.eval("local n = Vanguard_EditModeNote return { ns.Unlocked(), n ~= nil and n:IsShown(), n ~= nil and n.text:GetText() == ns.EDIT_NOTE }");
    return [s[0], gridLines(addon), s[1], s[2]];
  };
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
  addon.eval('ns.Options.Show("tools")');
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
