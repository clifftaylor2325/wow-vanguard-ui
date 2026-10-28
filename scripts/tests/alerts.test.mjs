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
it("game alerts: on a canvas under 962 wide the talking head moves left, clear of the minimap and info strip", () => {
  // The talking head's spot on a w x h canvas: its left and right edges, and the minimap's left edge.
  const at = (w, h) => {
    const addon = loggedIn(ALERTS_ENV + `__wfgStub.setScreen(${w}, ${h})`);
    const r = addon.frame("Vanguard_TalkingHeadFrameSpot").rect;
    return [r.left, r.left + r.width <= addon.frame("Vanguard_Minimap").rect.left];
  };
  expect(at(1024, 768), "1024 wide: 186 in from the left, as before, clear of the minimap").toEqual([186, true]);
  expect(at(835, 668), "835 wide: moved left until it clears the minimap's column").toEqual([835 - 206 - 570, true]);
});
it("game alerts: at a larger Text size the talking head keeps clear of the wider info strip, also when the size changes while playing", () => {
  // Whether the talking head's spot ends before the info strip's left edge.
  const clear = (addon) => addon.eval("return Vanguard_TalkingHeadFrameSpot:GetRight() <= Vanguard_InfoStrip:GetLeft()");
  const addon = loggedIn(ALERTS_ENV + "__wfgStub.setScreen(835, 668)");
  expect(clear(addon), "100%: clear, as before").toBe(true);
  addon.eval("ns.Theme.Settings().textScale = 1.3 ns.Theme.Refresh()");
  expect(clear(addon), "130% set while playing: the spot moves left with the strip's width").toBe(true);
  const later = loggedIn(ALERTS_ENV + "__wfgStub.setScreen(835, 668) ns.Theme.Settings().textScale = 1.3 ns.Theme.Refresh()");
  expect(clear(later), "130% from the login: clear too").toBe(true);
});
it("game alerts: loss of control and the talking head, styled and placed (or hidden)", () => {
  const addon = loggedIn(ALERTS_ENV);
  const loc = addon.eval(`local f = LossOfControlFrame
    return { f.blackBg:IsShown(), f.Icon.__texCoord ~= nil, f.AbilityName.__font ~= nil, f.TimeLeft.NumberText.__font ~= nil, f.__points.CENTER.rel == Vanguard_LossOfControlFrameSpot }`);
  expect(loc, "loss of control: its black band hidden, icon cropped, theme text, centered on its spot").toEqual([false, true, true, true, true]);
  expect(addon.eval("return { ns.MoverPoint('lossofcontrol') }"), "a little above your character, under the Instance prep card").toEqual(["CENTER", "CENTER", 0, 96]);
  const head = addon.eval("local f = TalkingHeadFrame return { f.BackgroundFrame.__alpha, f.MainFrame.Name.__font ~= nil, f.__points.CENTER.rel == Vanguard_TalkingHeadFrameSpot }");
  expect([head, addon.eval("return (ns.MoverPoint('talkinghead'))")], "the talking head: parchment faded, theme text, at the top left").toEqual([[0, true, true], "TOPLEFT"]);
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
it("game alerts: raid warnings take the theme font at the game's size; Hardcore death notices the title font and red, a reused line back to the warning font", () => {
  const addon = loggedIn(WARNING_ENV);
  // The message line: its font face and size, color, and the death mark.
  const line = () => addon.eval("local l = RaidWarningFrame.line return { font = l.__font and l.__font[1], size = l.__font and l.__font[2], color = l.__textColor, death = ns.FrameState('vgDeath')[l] or false }");
  const face = addon.eval("return (ns.Theme.Font(true))");
  addon.fire("CHAT_MSG_RAID_WARNING", "TEST-ONLY Pull in 5");
  const warn = line();
  expect([warn.font, warn.size, warn.color, warn.death], "a raid warning: the theme font (bold) at the game's 20, the game's color kept").toEqual([face, 20, [1, 0.2, 0.2, 1], false]);
  addon.fire("HARDCORE_DEATHS", "TEST-ONLY Bob has fallen.");
  const death = line();
  expect([death.font, death.size, isTok(addon, death.color, "bad"), death.death], "a death notice: the theme's title font, the theme's red").toEqual([addon.eval('local f = UIParent:CreateFontString() ns.Theme.ApplyRole(f, "title") return f.__font[1]'), addon.eval('return ns.Theme.RoleSize("title")'), true, true]);
  addon.fire("CHAT_MSG_RAID_WARNING", "TEST-ONLY Again");
  expect([line().size, line().death], "the next raid warning on that line: the warning font again, no longer a death notice").toEqual([20, false]);
  addon.eval("ns.Theme.Settings().textScale = 1.3");
  addon.fire("CHAT_MSG_RAID_WARNING", "TEST-ONLY Bigger");
  expect(line().size, "Text size applies to the game's size").toBe(26);
  const off = loggedIn(WARNING_ENV, { savedVariables: "VanguardDB.profiles = { Default = { GameAlerts = { hardcore = false } } }" });
  off.fire("HARDCORE_DEATHS", "TEST-ONLY Bob has fallen.");
  expect(off.eval("local l = RaidWarningFrame.line return { l.__font[2], ns.FrameState('vgDeath')[l] or false }"), "deaths switched off: the warning font, not the death look").toEqual([20, false]);
  expect(loggedIn("RaidWarningFrame = CreateFrame('Frame', 'RaidWarningFrame', UIParent)").eval("return ns.GetModule('GameAlerts').settings.hardcore"), "a frame without the game's message list is left alone").toBe(true);
  const empty = loggedIn(WARNING_ENV + "function RaidWarningFrame:GetSortedMessages() return {} end");
  empty.fire("CHAT_MSG_RAID_WARNING", "TEST-ONLY Nobody");
  expect(empty.eval("return #ns.errors"), "a frame with no lines yet").toBe(0);
});
// TEST-ONLY status texts: the screenshot line and the frame rate readout, as Blizzard_ActionStatus and Blizzard_FramerateFrame build them.
const STATUS_ENV = `
  ActionStatus = CreateFrame("Frame", "ActionStatus", UIParent)
  ActionStatus.Text = ActionStatus:CreateFontString(nil, "ARTWORK", "GameFontNormalLarge") ActionStatus.Text:SetTextColor(1, 0.82, 0)
  FramerateFrame = CreateFrame("Frame", "FramerateFrame", UIParent)
  FramerateFrame.Label = FramerateFrame:CreateFontString(nil, "ARTWORK", "SystemFont_Shadow_Med1")
  FramerateFrame.FramerateText = FramerateFrame:CreateFontString(nil, "ARTWORK", "SystemFont_Shadow_Med1")
`;
it("game alerts: the screenshot status line and the frame rate readout take the theme font at the game's size, kept after a font or Text size change", () => {
  const addon = loggedIn(STATUS_ENV);
  // The three texts' font faces and sizes, and the status line's colour.
  const look = () => addon.eval("return { ActionStatus.Text.__font, FramerateFrame.Label.__font, FramerateFrame.FramerateText.__font, ActionStatus.Text.__textColor }");
  const bold = addon.eval("return (ns.Theme.Font(true))"), regular = addon.eval("return (ns.Theme.Font(false))");
  const first = look();
  expect([first[0][0], first[0][1], first[1][0], first[1][1], first[2][1]], "the status line bold at 16, the readout regular at 12").toEqual([bold, 16, regular, 12, 12]);
  expect(first[3], "the game's gold on the status line is left alone").toEqual([1, 0.82, 0, 1]);
  addon.eval("ns.Theme.Settings().textScale = 1.3 ns.Theme.Refresh()");
  const scaled = look();
  expect([scaled[0][1], scaled[1][1], scaled[2][1]], "a Text size change reaches them").toEqual([21, 16, 16]);
  const partial = loggedIn("ActionStatus = CreateFrame('Frame', 'ActionStatus', UIParent) FramerateFrame = {} ActionStatus.Text = {}");
  expect(partial.eval("return #ns.errors"), "frames without their texts, or texts that are not font strings: left alone, no error").toBe(0);
  expect(loggedIn("").eval("return #ns.errors"), "a client without them loads cleanly").toBe(0);
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
  const win = addon.eval("local w = DamageMeterSessionWindow1 local l = __box(w).lines[1] return { w.Header.__alpha, l.StatusBar.BackgroundRegions[1].__alpha, l.StatusBar.Name.__font ~= nil }");
  expect(win, "the meter's header and bar shading fade, its lines take the theme font").toEqual([0, 0, true]);
  addon.eval("__line(DamageMeterSessionWindow1) __box(DamageMeterSessionWindow1):Update() DamageMeter:SetupSessionWindow() __line(DamageMeterSessionWindow2) __box(DamageMeterSessionWindow2):Update()");
  expect(addon.eval("return { ns.FrameState('vgSkinned')[__box(DamageMeterSessionWindow1).lines[2]], ns.FrameState('vgSkinned')[DamageMeterSessionWindow2], ns.FrameState('vgSkinned')[__box(DamageMeterSessionWindow2).lines[1]] }"), "new lines and new windows are styled as they come").toEqual([true, true, true]);
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
it("the game's tools: an Edit Mode system is fitted through the client's own SetPointBase, never Edit Mode's SetPoint override", () => {
  const addon = loggedIn(TOOLS_ENV);
  // TEST-ONLY: a frame as EditModeSystemMixin:OnSystemLoad leaves one: SetPoint and ClearAllPoints are Lua
  // overrides (which mark Edit Mode's anchors dirty), with the client's methods kept aside as the Base pair.
  addon.eval(`__ran = {}
    local f = CreateFrame("Frame", "TESTONLY_EditModeSystem", UIParent)
    local setPoint, clear = f.SetPoint, f.ClearAllPoints
    f.SetPointBase = function(self, ...) __ran[#__ran + 1] = "SetPointBase " .. (...) return setPoint(self, ...) end
    f.ClearAllPointsBase = function(self) __ran[#__ran + 1] = "ClearAllPointsBase" return clear(self) end
    f.SetPoint = function(self, ...) __ran[#__ran + 1] = "SetPointOverride " .. (...) return setPoint(self, ...) end
    f.ClearAllPoints = function(self) __ran[#__ran + 1] = "ClearAllPointsOverride" return clear(self) end
    local GT = ns.GetModule("GameTools")
    GT.PlaceSpot("TESTONLY_EditModeSystem", { "testonly_system", "TEST-ONLY system", { "CENTER", "CENTER", 0, 0 }, 100, 50 }, GT.FitCenter)`);
  expect(addon.eval("return __ran"), "the pin's fit clears through Edit Mode (which drops a stale snap) and sets through the client's own method").toEqual(["ClearAllPointsOverride", "SetPointBase CENTER"]);
  expect(addon.eval("return TESTONLY_EditModeSystem.__points.CENTER.rel == Vanguard_TESTONLY_EditModeSystemSpot"), "and the frame lands on its spot").toBe(true);
  addon.eval('__ran = {} TESTONLY_EditModeSystem:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 0, 0)');
  expect(addon.eval("return __ran"), "the game's own SetPoint (the override) still re-pins it the same way").toEqual(["SetPointOverride TOPLEFT", "ClearAllPointsOverride", "SetPointBase CENTER"]);
  addon.eval("__ran = {} ns.GetModule('GameTools').FitFill(TESTONLY_EditModeSystem, Vanguard_TESTONLY_EditModeSystemSpot)");
  expect(addon.eval("return __ran"), "filling a spot goes the same way").toEqual(["ClearAllPointsOverride", "SetPointBase TOPLEFT", "SetPointBase BOTTOMRIGHT"]);
});
it("damage meter: a pooled line set up again keeps its background faded, with one hook per line", () => {
  const addon = loggedIn(TOOLS_ENV);
  // The first line's background alpha.
  const alpha = () => addon.eval("return __box(DamageMeterSessionWindow1).lines[1].StatusBar.BackgroundRegions[1].__alpha");
  expect(alpha(), "faded when styled").toBe(0);
  addon.eval("__box(DamageMeterSessionWindow1):Update() __box(DamageMeterSessionWindow1):Update()");
  addon.eval("__sets = 0 local r = __box(DamageMeterSessionWindow1).lines[1].StatusBar.BackgroundRegions[1] local set = r.SetAlpha r.SetAlpha = function(self, a) __sets = __sets + 1 return set(self, a) end");
  addon.eval("__box(DamageMeterSessionWindow1).lines[1]:SetBackgroundAlpha(1)");
  expect(alpha(), "the game's reset as it sets the line up again is faded at once").toBe(0);
  expect(addon.eval("return __sets"), "the game's one SetAlpha, then one fade: redraws added no second hook").toBe(2);
  addon.eval("local l = __line(DamageMeterSessionWindow1) l.StatusBar.BackgroundRegions = nil l.UpdateBackground = nil __box(DamageMeterSessionWindow1):Update()");
  expect(addon.eval("return { ns.FrameState('vgSkinned')[__box(DamageMeterSessionWindow1).lines[2]], #ns.errors }"), "a line without background art or its reset is styled without them").toEqual([true, 0]);
});
// The glyph texture on a meter window control (nil when it has none).
const glyphOf = (addon, path) => addon.eval(`local g = ns.Theme.ControlGlyph(${path}) return g and g:GetTexture()`);
it("damage meter: the header's controls in the theme, the minimise glyph following the window", () => {
  const addon = loggedIn(TOOLS_ENV);
  const w = "DamageMeterSessionWindow1";
  expect(glyphOf(addon, `${w}.MinimizeButton`), "a window control with the minimise glyph").toMatch(/Minimize$/);
  addon.eval(`${w}:SetMinimized(true)`);
  expect(glyphOf(addon, `${w}.MinimizeButton`), "minimised: the expand glyph").toMatch(/Maximize$/);
  addon.eval(`${w}:SetMinimized(false)`);
  expect(glyphOf(addon, `${w}.MinimizeButton`), "and back").toMatch(/Minimize$/);
  const arrows = addon.eval(`local w = ${w} return { w.SessionDropdown.Arrow.__alpha, w.DamageMeterTypeDropdown.Arrow.__alpha }`);
  expect(arrows, "both drop-downs' gold arrows give way to the theme's").toEqual([0, 0]);
  expect(addon.eval(`local b = ${w}.SettingsDropdown return { ns.Theme.ControlGlyph(b) == nil, select("#", b:GetRegions()) > 0 }`), "the cog keeps its own icon, on a plate drawn behind it").toEqual([true, true]);
  addon.eval("__startMinimized = true __line(DamageMeter:SetupSessionWindow()) __startMinimized = nil");
  expect(glyphOf(addon, "DamageMeterSessionWindow2.MinimizeButton"), "a window that starts minimised shows expand").toMatch(/Maximize$/);
  addon.eval("local f = CreateFrame('Frame', nil, UIParent) __list(f) f.MinimizeButton = CreateFrame('Button', nil, f) ns.GetModule('GameTools').SkinWindow(f) local g = CreateFrame('Frame', nil, UIParent) g.MinimizeContainer = {} ns.GetModule('GameTools').SkinWindow(g)");
  expect(addon.eval("return #ns.errors"), "a window without those parts is styled without them").toBe(0);
});
it("damage meter: the breakdown window gets the flat panel, the meter's lines, the thin scroll bar and the theme's close button", () => {
  const addon = loggedIn(TOOLS_ENV);
  const src = "DamageMeterSessionWindow1.MinimizeContainer.SourceWindow";
  addon.eval(`__line(${src}) ${src}.ScrollBox:Update() ${src}:Show()`);
  const out = addon.eval(`local s, done = ${src}, ns.FrameState('vgSkinned') return { s.Background.__alpha, done[s] == true, done[s.ScrollBox.lines[1]] == true, s.ScrollBox.lines[1].StatusBar.BackgroundRegions[1].__alpha }`);
  expect(out, "its art faded, styled once, a line it draws later styled with its background faded").toEqual([0, true, true, 0]);
  expect(glyphOf(addon, `${src}.CloseButton`), "the close button is the theme's cross").toMatch(/CloseMark$/);
});
it("damage meter: the own-player line, which a session window keeps in its MinimizeContainer, takes the theme too", () => {
  const addon = loggedIn(TOOLS_ENV);
  const out = addon.eval("local w = DamageMeterSessionWindow1 return { ns.FrameState('vgSkinned')[w:GetLocalPlayerEntry()] == true, w.ScrollBox == nil }");
  expect(out, "the own-player line is styled although the window itself holds no list").toEqual([true, true]);
});
it("damage meter: a window with a list getter but no own-player getter still has its lines styled", () => {
  const addon = loggedIn(TOOLS_ENV);
  addon.eval("local s = DamageMeterSessionWindow1.MinimizeContainer.SourceWindow local box = s.ScrollBox s.GetScrollBox = function() return box end __line(s) box:Update() s:Show()");
  const out = addon.eval("local s = DamageMeterSessionWindow1.MinimizeContainer.SourceWindow return { ns.FrameState('vgSkinned')[s.ScrollBox.lines[1]] == true, #ns.errors }");
  expect(out, "the breakdown's lines are styled without a getter for the own-player line").toEqual([true, 0]);
});
it("damage meter: styling never reads a line's hidden name or amount", () => {
  const addon = loggedIn(TOOLS_ENV);
  addon.eval(`local w = DamageMeterSessionWindow1 local l = __line(w) local src = w.MinimizeContainer.SourceWindow local s = __line(src)
    for _, line in ipairs({ l, s }) do for _, key in ipairs({ "Name", "Value" }) do line.StatusBar[key].GetText = function() error("read a hidden value") end end end
    __box(w):Update() src.ScrollBox:Update()`);
  expect(addon.eval("local w, done = DamageMeterSessionWindow1, ns.FrameState('vgSkinned') return { #ns.errors, done[__box(w).lines[2]] == true, done[w.MinimizeContainer.SourceWindow.ScrollBox.lines[1]] == true }"), "both lines styled, without a GetText").toEqual([0, true, true]);
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
  addon.eval('ns.Options.Show("cooldowns")');
  addon.eval(`__click("Show the game's manager")`);
  expect(addon.eval('return GetCVar("cooldownViewerEnabled")'), "ticked: the game's Cooldown Manager is on").toBe("1");
  addon.eval(`__click("Show the game's manager")`);
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
// The low-health vignette: whether it is shown, its texture and the color the client gave it (alpha last).
const vignette = (addon) => addon.eval(`local f = Vanguard_LowHealthVignette
  if not f then return nil end
  local r, g, b, a = f.edge:GetVertexColor()
  return { shown = f:IsShown(), texture = f.edge.__texture, a = a, r = r, g = g, b = b }`);
const VIGNETTE_ON = { savedVariables: "VanguardDB.profiles = { Default = { GameAlerts = { vignette = true } } }" };
// The player at hp of 100 health.
const health = (addon, hp) => addon.world.setUnit("player", { hp, maxhp: 100 });
it("low-health vignette: off until switched on, then it tints the screen edge more as health drops", () => {
  const off = loggedIn("");
  health(off, 10);
  expect(vignette(off), "off by default: nothing is made").toBeNull();
  const addon = loggedIn("", VIGNETTE_ON);
  health(addon, 100);
  const full = vignette(addon);
  expect([full.shown, full.a, /Media\\Textures\\Vignette$/.test(full.texture)], "full health: shown but clear, the edge texture").toEqual([true, 0, true]);
  expect([full.r, full.g, full.b], "in the theme's vignette color").toEqual(addon.eval('return { ns.Theme.RGB("vignette") }').slice(0, 3));
  const alphas = [80, 40, 10].map((hp) => { health(addon, hp); return vignette(addon).a; });
  expect(alphas[0], "above half health: none").toBe(0);
  expect(alphas[1] > 0 && alphas[1] < alphas[2], "it strengthens as health drops").toBe(true);
  health(addon, 100);
  expect(vignette(addon).a, "and goes when you are healed").toBe(0);
});
it("low-health vignette: hidden while dead, gone with the switch, and the switch is on the Combat tools page", () => {
  const addon = loggedIn(CLICK_LUA, VIGNETTE_ON);
  health(addon, 10);
  expect(vignette(addon).shown, "shown at low health").toBe(true);
  addon.eval("__wfgWorld.units.player.dead = true");
  addon.fire("PLAYER_DEAD");
  expect(vignette(addon).shown, "not over the release screen").toBe(false);
  addon.eval("__wfgWorld.units.player.dead = false");
  addon.fire("PLAYER_ALIVE");
  expect(vignette(addon).shown, "back when you rise").toBe(true);
  addon.slash("");
  addon.eval('ns.Options.Show("tools")');
  expect(addon.eval('return __click("Low health: a soft tint")'), "the switch is under Combat tools").toBe(true);
  expect(vignette(addon).shown, "switched off at once").toBe(false);
  expect(addon.eval('return __click("Low health: a soft tint")') && vignette(addon).shown, "and on again at once").toBe(true);
});
it("low-health vignette: in a fight with hidden health the client's curve gets it; no error, and no animation", () => {
  const addon = loggedIn("", VIGNETTE_ON);
  setCombat(addon, true);
  addon.eval("__wfgWorld.units.player.hp = __wfgWorld.secret(10)");
  addon.fire("UNIT_HEALTH", "player");
  expect(addon.eval(`local f = Vanguard_LowHealthVignette
    local _, _, _, a = f.edge:GetVertexColor()
    return { f:IsShown(), issecretvalue(a), f.__animations == nil }`), "shown with a hidden strength, handed to the texture as it is, no animation group").toEqual([true, true, true]);
  setCombat(addon, false);
});
it("low-health vignette: a client without curves or the health percent shows nothing, without an error", () => {
  const noCurves = loggedIn("C_CurveUtil = nil", VIGNETTE_ON);
  health(noCurves, 10);
  expect(vignette(noCurves), "no curves: nothing made").toBeNull();
  const noPercent = loggedIn("UnitHealthPercent = nil", VIGNETTE_ON);
  health(noPercent, 10);
  expect(vignette(noPercent), "no health percent: nothing made").toBeNull();
  const failing = loggedIn("", VIGNETTE_ON);
  health(failing, 10);
  failing.eval("UnitHealthPercent = function() error('TEST-ONLY') end");
  failing.fire("UNIT_HEALTH", "player");
  expect(vignette(failing).shown, "a call that errors counts as nothing to show").toBe(false);
});
