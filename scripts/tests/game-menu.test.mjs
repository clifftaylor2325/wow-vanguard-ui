// game-menu: Vanguard's button on the game menu, boss frames, raid tools and raid frame rows, in the
// TEST-ONLY headless client.

import { expect, it } from "vitest";
import { RAID_ENV, UNITS_ENV, borderOf, isTok, loggedIn, raidButton, setCombat } from "./helpers.mjs";

// TEST-ONLY model of the Forever game menu: pooled buttons numbered from 1 by InitButtons on every
// show, then a layout that orders the shown children by layoutIndex (LayoutFrame.lua).
const FOREVER_MENU_ENV = `
  HideUIPanel = function(f) f:Hide() end
  local hookAll = hooksecurefunc
  hooksecurefunc = function(t, ...) if t == GameMenuFrame then __hooked = true end return hookAll(t, ...) end
  __calls = { AddButton = 0, AddSection = 0, MarkDirty = 0 }
  GameMenuFrame = CreateFrame("Frame", "GameMenuFrame", UIParent) GameMenuFrame:Hide()
  GameMenuFrame.buttonTemplate = "GameMenuFrameButtonTemplate"
  function GameMenuFrame:Reset()
    self.nextLayoutIndex = 1
    for _, c in ipairs({ self:GetChildren() }) do
      if c.layoutIndex and c.layoutIndex >= 1 then c:Hide() c.layoutIndex = nil end
    end
  end
  function GameMenuFrame:AddButton(text, fn)
    __calls.AddButton = __calls.AddButton + 1
    local b = CreateFrame("Button", nil, self, self.buttonTemplate)
    b:SetText(text) b:SetScript("OnClick", fn)
    b.layoutIndex = self.nextLayoutIndex self.nextLayoutIndex = self.nextLayoutIndex + 1
    return b
  end
  function GameMenuFrame:AddSection() __calls.AddSection = __calls.AddSection + 1 end
  function GameMenuFrame:InitButtons()
    self:Reset() self:AddButton("Options", function() end) self:AddSection() self:AddButton("Return to Game", function() end)
  end
  function GameMenuFrame:MarkDirty() __calls.MarkDirty = __calls.MarkDirty + 1 end
  function GameMenuFrame:Layout()
    local kids = {}
    for _, c in ipairs({ self:GetChildren() }) do if c:IsShown() and c.layoutIndex then kids[#kids + 1] = c end end
    table.sort(kids, function(a, b) return a.layoutIndex < b.layoutIndex end)
    self.order = {}
    for i, c in ipairs(kids) do self.order[i] = c:GetText() or c.text:GetText() end
  end
  GameMenuFrame:SetScript("OnShow", function(self) self:InitButtons() self:Layout() end)
`;

it("a Vanguard button on the game menu opens the options", () => {
  const addon = loggedIn(FOREVER_MENU_ENV);
  expect(addon.eval("return { __calls.AddButton, __calls.AddSection, __calls.MarkDirty, __hooked == true }"), "no AddButton or AddSection, one MarkDirty; the one InitButtons hook is the Windows skin's").toEqual([0, 0, 1, true]);
  expect(addon.eval("local b = ns.gameMenuButton return { b.layoutIndex, b.bottomPadding, b:GetParent() == GameMenuFrame, b.__template, b:GetText(), b:IsShown() }"), "the menu's own template, first index, section gap under it").toEqual([0, 20, true, "GameMenuFrameButtonTemplate", "Vanguard", true]);
  addon.eval("GameMenuFrame:Show()");
  expect(addon.eval("return GameMenuFrame.order"), "first in the menu, above Options").toEqual(["Vanguard", "Options", "Return to Game"]);
  expect(addon.eval("local m = math.huge for _, c in ipairs({ GameMenuFrame:GetChildren() }) do if c ~= ns.gameMenuButton and c.layoutIndex then m = math.min(m, c.layoutIndex) end end return ns.gameMenuButton.layoutIndex < m"), "lower than every pooled button's layoutIndex").toBe(true);
  addon.eval("GameMenuFrame:Hide() GameMenuFrame:Show()");
  expect(addon.eval("local n = 0 for _, c in ipairs({ GameMenuFrame:GetChildren() }) do if c:GetText() == 'Vanguard' then n = n + 1 end end return { GameMenuFrame.order[1], n, __calls.AddButton }"), "still first on the next open, one button, AddButton only from the game").toEqual(["Vanguard", 1, 4]);
  addon.eval("ns.gameMenuButton:GetScript('OnClick')(ns.gameMenuButton)");
  expect(addon.eval("return { GameMenuFrame:IsShown(), Vanguard_Options and Vanguard_Options:IsShown() or ns.Options.current ~= nil }"), "clicking it closes the menu and opens the options").toEqual([false, true]);
  const old = loggedIn("GameMenuFrame = CreateFrame('Frame', 'GameMenuFrame', UIParent)");
  expect(old.eval("local b = ns.gameMenuButton return { b.text:GetText(), b.__points.TOP.rel == GameMenuFrame, b.layoutIndex == nil }"), "an older menu gets a themed button just under it, not laid out").toEqual(["Vanguard", true, true]);
  old.eval("HideUIPanel = function(f) f:Hide() end ns.gameMenuButton.__scripts.OnClick()");
  expect(old.eval("return GameMenuFrame:IsShown()"), "which closes the menu too").toBe(false);
  expect(loggedIn("").eval("return ns.gameMenuButton == nil"), "no game menu, nothing added").toBe(true);
});

// TEST-ONLY the game menu's button pool (AddButton takes from it, Reset empties it; each button has template art)
// and its header plate, as MainMenuFrameTemplates.lua and DialogHeaderTemplate make them.
const MENU_POOL_ENV = `
  GameMenuFrame.buttonPool = { __active = {} }
  function GameMenuFrame.buttonPool:EnumerateActive() return next, self.__active end
  local add, reset = GameMenuFrame.AddButton, GameMenuFrame.Reset
  function GameMenuFrame:AddButton(...) local b = add(self, ...) b.Left = b:CreateTexture(nil, "BACKGROUND") self.buttonPool.__active[b] = true return b end
  function GameMenuFrame:Reset() reset(self) self.buttonPool.__active = {} end
  local header = CreateFrame("Frame", nil, GameMenuFrame)
  header.LeftBG, header.RightBG, header.CenterBG = header:CreateTexture(), header:CreateTexture(), header:CreateTexture()
  header.Text = header:CreateFontString()
  GameMenuFrame.Header = header
`;

it("game menu: buttons made after the skin ran are skinned once, Vanguard's matches, the header plate is gone", () => {
  const addon = loggedIn(FOREVER_MENU_ENV + MENU_POOL_ENV);
  addon.eval("__spy = 0 local real = ns.Theme.Button ns.Theme.Button = function(...) __spy = __spy + 1 return real(...) end");
  addon.eval("GameMenuFrame:Show()");
  // The alpha of a menu button's template art.
  const look = (path) => addon.eval(`local b = ${path} return { b.Left and b.Left.__alpha }`);
  expect(addon.eval("return __spy"), "Vanguard's button and the two pooled ones are skinned when the menu opens").toBe(3);
  expect(borderOf(addon, "ns.gameMenuButton"), "Vanguard's button is painted like a pooled one").toEqual(borderOf(addon, "next(GameMenuFrame.buttonPool.__active)"));
  expect(look("next(GameMenuFrame.buttonPool.__active)"), "a pooled button's template art is faded").toEqual([0]);
  addon.eval("GameMenuFrame:Hide() GameMenuFrame:Show()");
  expect(addon.eval("return __spy"), "the next open makes two new buttons: only those are skinned").toBe(5);
  addon.eval("GameMenuFrame:Hide() GameMenuFrame.buttonPool.__active = {} GameMenuFrame:Show()");
  expect(addon.eval("local n = 0 for b in GameMenuFrame.buttonPool:EnumerateActive() do if b.vgMenuSkinned then n = n + 1 end end return n"), "every active button carries the skin").toBe(2);
  const head = addon.eval("local h = GameMenuFrame.Header local p = h.__points.TOP return { h.LeftBG:IsShown(), h.RightBG:IsShown(), h.CenterBG:IsShown(), h.Text.__font ~= nil, p.rel == GameMenuFrame, p.y }");
  expect(head, "the header plate is hidden, its title in the theme font, inside the panel").toEqual([false, false, false, true, true, -8]);
  const off = loggedIn(FOREVER_MENU_ENV + MENU_POOL_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { windows = false } } }" });
  off.eval("GameMenuFrame:Show()");
  expect([borderOf(off, "ns.gameMenuButton") == null, off.eval("return GameMenuFrame.Header.LeftBG:IsShown()")], "with the windows switched off the menu stays the game's").toEqual([true, true]);
});

it("game menu button: falls back, or goes without what the menu lacks", () => {
  const broken = loggedIn(FOREVER_MENU_ENV + 'GameMenuFrame.buttonTemplate = "NoSuchTemplate"');
  expect(broken.eval("local b = ns.gameMenuButton return { b.text:GetText(), b.__points.TOP.rel == GameMenuFrame, ns.errors[#ns.errors].text:match('^GameMenu:') ~= nil }"), "a template that can't be built: themed button under the menu, one logged error").toEqual(["Vanguard", true, true]);
  const plain = loggedIn(FOREVER_MENU_ENV + "GameMenuFrame.buttonTemplate = nil");
  expect(plain.eval("GameMenuFrame:Show() local b = ns.gameMenuButton return { b.text:GetText(), b.layoutIndex, b:GetWidth(), GameMenuFrame.order[1] }"), "a layout menu without a template gets a themed button, still first").toEqual(["Vanguard", 0, 200, "Vanguard"]);
  const clean = loggedIn(FOREVER_MENU_ENV + "GameMenuFrame.MarkDirty = nil");
  expect(clean.eval("GameMenuFrame:Show() local n = 0 for _, e in ipairs(ns.errors) do if e.text:match('^GameMenu:') then n = n + 1 end end return { GameMenuFrame.order[1], n }"), "a layout menu without MarkDirty still gets the button first, no GameMenu error").toEqual(["Vanguard", 0]);
});

// What the game's boss holder and its first and last boss button look like: shown, parked, listening, hooked.
const bossHolder = (addon) => addon.eval(`local c, b1, b5 = BossTargetFrameContainer, Boss1TargetFrame, Boss5TargetFrame
  return { c:IsShown(), c:GetParent() == UIParent, c:IsEventRegistered("PLAYER_ENTERING_WORLD"), rawget(c, "Show") == nil and rawget(c, "SetShown") == nil,
    b1:IsEventRegistered("INSTANCE_ENCOUNTER_ENGAGE_UNIT"), b5:IsEventRegistered("INSTANCE_ENCOUNTER_ENGAGE_UNIT"), b1:GetParent() == c, b5:GetParent() == c }`);

it("boss frames: five in a column at the top left, the game's put away", () => {
  const addon = loggedIn(UNITS_ENV + BOSS_ENV);
  expect(addon.eval(`return { Vanguard_boss5 ~= nil, Vanguard_boss1.__watched, Vanguard_boss2.__points.TOPLEFT.rel == Vanguard_boss1, Vanguard_boss2:GetWidth() }`), "five boss frames, each shown while its boss exists, stacked").toEqual([true, true, true, 150]);
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
  hooksecurefunc = function(t, name, fn) local orig = t[name] t[name] = function(...) local r = orig(...) fn(...) return r end end
  BossTargetFrameContainer = CreateFrame("Frame", "BossTargetFrameContainer", UIParent)
  BossTargetFrameContainer:RegisterEvent("PLAYER_ENTERING_WORLD")
  BossTargetFrameContainer.IsProtected = function() return true, false end
  for i = 1, 5 do
    CreateFrame("Button", "Boss" .. i .. "TargetFrame", BossTargetFrameContainer, "SecureUnitButtonTemplate"):RegisterEvent("INSTANCE_ENCOUNTER_ENGAGE_UNIT")
  end
`;

// TEST-ONLY group: you lead a party; every raid tool call is recorded.
const TOOLS_GROUP_ENV = `
  __leader, __assist, __inGroup, __inRaid, __markable, __calls = true, false, true, false, true, {}
  local function log(text) __calls[#__calls + 1] = text end
  IsInGroup = function() return __inGroup end
  IsInRaid = function() return __inRaid end
  UnitIsGroupLeader = function() return __leader end
  UnitIsGroupAssistant = function() return __assist end
  IsEveryoneAssistant = function() return false end
  C_PartyInfo = { DoReadyCheck = function() log("ready") end, DoCountdown = function(n) log("pull " .. n) end, ConvertToRaid = function() log("raid") end }
  InitiateRolePoll = function() log("roles") end
  SetRaidTarget = function(unit, i) log("mark " .. unit .. " " .. i) end
  CanBeRaidTarget = function() return __markable end
  function __tool(i, button) local b = Vanguard_RaidTools.list[i] b.__scripts.OnClick(b, button or "LeftButton") end
`;

it("raid tools: calls, target icons and world markers for the leader and assistants", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_GROUP_ENV);
  // Whether the bar shows, and whether its Raid button does.
  const state = () => addon.eval("local a = Vanguard_RaidTools.actions return { Vanguard_RaidTools:IsShown(), a.Raid:IsShown() }");
  expect(state(), "a party's leader sees the bar, with Raid").toEqual([true, true]);
  addon.eval("for i = 1, 4 do __tool(i) end __tool(2, 'RightButton') __tool(5) __tool(13)");
  expect(addon.eval("return __calls"), "ready check, pull 10 (right-click cancels), roles, convert; skull on the target, then clear").toEqual(["ready", "pull 10", "roles", "raid", "pull 0", "mark target 1", "mark target 0"]);
  addon.eval("__markable = false __calls = {} __tool(5)");
  expect(addon.eval("return #__calls"), "a target that can't be marked is left alone").toBe(0);
  expect(addon.eval(`local m, c = Vanguard_RaidTools.list[14], Vanguard_RaidTools.list[22]
    return { m:GetAttribute("type"), m:GetAttribute("marker"), m:GetAttribute("action1"), m:GetAttribute("action2"), c:GetAttribute("action") }`), "world markers are the game's secure marker buttons").toEqual(["worldmarker", 1, "toggle", "clear", "clear"]);
  addon.eval("__inRaid, __leader, __assist = true, false, true");
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(state(), "a raid assistant sees it too, without Raid").toEqual([true, false]);
  addon.eval("__assist = false");
  setCombat(addon, true);
  addon.fire("PARTY_LEADER_CHANGED");
  expect(state()[0], "in combat it waits").toBe(true);
  setCombat(addon, false);
  expect(state()[0], "then hides for a plain raid member").toBe(false);
  const bare = loggedIn(UNITS_ENV + TOOLS_GROUP_ENV + "C_PartyInfo = { DoReadyCheck = C_PartyInfo.DoReadyCheck } InitiateRolePoll = nil");
  expect(bare.eval("local out = {} for k in pairs(Vanguard_RaidTools.actions) do out[#out + 1] = k end return out"), "only the calls this client has").toEqual(["Ready"]);
  const solo = loggedIn(UNITS_ENV + TOOLS_GROUP_ENV + "__inGroup = false");
  expect(solo.eval("return Vanguard_RaidTools:IsShown()"), "hidden out of a group").toBe(false);
});

it("raid frames: groups as rows, and the main tank's shield", () => {
  const rows = loggedIn(UNITS_ENV + RAID_ENV, { savedVariables: "VanguardDB.profiles = { Default = { RaidFrames = { layout = 'rows' } } }" });
  expect(rows.eval(`local h = Vanguard_Raid return { h:GetAttribute("point"), h:GetAttribute("columnAnchorPoint"), h:GetAttribute("xOffset"), h:GetAttribute("yOffset"), Vanguard_RaidHolder:GetWidth(), Vanguard_RaidHolder:GetHeight() }`), "each group a row of five, groups stacked up; the holder is one row").toEqual(["LEFT", "BOTTOM", 4, 0, 516, 48]);
  const addon = loggedIn(UNITS_ENV + RAID_ENV + 'GetPartyAssignment = function(kind, unit) return (unit == "raid1" and kind == "MAINTANK") or (unit == "raid2" and kind == "MAINASSIST") end');
  addon.eval('__spawn(1, "raid1") __spawn(2, "raid2") __spawn(3, "raid3")');
  // Whether tile i's role mark shows, and its color.
  const tint = (i) => addon.eval(`local b = Vanguard_RaidUnitButton${i} return { b.role:IsShown(), b.role.__vertexColor }`);
  expect(raidButton(addon, 1).role === addon.eval("return ns.Theme.Icon('RoleTank')") && isTok(addon, tint(1)[1], "accent"), "the main tank's shield in the accent").toBe(true);
  expect(raidButton(addon, 2).role === addon.eval("return ns.Theme.Icon('RoleTank')") && isTok(addon, tint(2)[1], "text2"), "the main assist's in text2").toBe(true);
  expect(tint(3)[0], "no assignment, no role: no mark").toBe(false);
});
