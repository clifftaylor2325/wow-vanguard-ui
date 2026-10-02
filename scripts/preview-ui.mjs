#!/usr/bin/env node
// Screenshot ForeverUI without the game client.
//
//   node scripts/preview-ui.mjs [--out dir]
//
// Runs the real addon Lua (same harness as verify-lua) against a TEST-ONLY
// world (units, action slots, chat lines) and lays out the frames it built
// in headless Chromium. Layout, sizes, colors and bar values are the
// addon's own; spell icons, the map and the game font are approximated.
// Needs Playwright (a global install is fine).

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { createAddon, root } from "./lib/lua-harness.mjs";
import { renderScene } from "./lib/ui-preview.mjs";

// The value after --name, or the fallback.
function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

// Playwright from the project, else from the global npm root.
async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    return createRequire(path.join(globalRoot, "noop.js"))("playwright");
  }
}

// TEST-ONLY units: you (a mage), a hostile target, two party members.
const UNITS = `
  __units = {
    player = { name = "<name>", hp = 42800, maxhp = 48000, power = 31000, maxpower = 40000, ptype = "MANA", player = true, class = "MAGE" },
    target = { name = "TEST-ONLY Boar", hp = 23400, maxhp = 36000, power = 60, maxpower = 100, ptype = "RAGE", reaction = 2 },
    party1 = { name = "TEST-ONLY Rogue", hp = 39000, maxhp = 45000, power = 80, maxpower = 100, ptype = "ENERGY", player = true, class = "ROGUE" },
    party2 = { name = "TEST-ONLY Priest", hp = 44000, maxhp = 44000, power = 52000, maxpower = 60000, ptype = "MANA", player = true, class = "PRIEST" },
  }
  __units.targettarget = __units.player
  local function u(unit) return __units[unit] end
  UnitExists = function(unit) return u(unit) ~= nil end
  UnitName = function(unit) return u(unit) and u(unit).name end
  UnitHealth = function(unit) return u(unit).hp end
  UnitHealthMax = function(unit) return u(unit).maxhp end
  UnitPower = function(unit) return u(unit).power end
  UnitPowerMax = function(unit) return u(unit).maxpower end
  UnitPowerType = function(unit) return 0, u(unit).ptype end
  UnitIsPlayer = function(unit) return u(unit) and u(unit).player == true end
  UnitClass = function(unit) return "Class", u(unit).class end
  UnitReaction = function(unit) return u(unit).reaction or 5 end
  UnitIsDeadOrGhost = function() return false end
  UnitIsConnected = function() return true end
  AbbreviateNumbers = function(v) return v >= 1000 and string.format("%.1fK", v / 1000) or tostring(v) end
  RegisterUnitWatch = function(f) if not UnitExists(f.unit) then f:Hide() end end
  RAID_CLASS_COLORS = { MAGE = { r = 0.25, g = 0.78, b = 0.92 }, ROGUE = { r = 1, g = 0.96, b = 0.41 }, PRIEST = { r = 1, g = 1, b = 1 } }
  PowerBarColor = { MANA = { r = 0, g = 0.44, b = 0.87 }, RAGE = { r = 0.78, g = 0.25, b = 0.25 }, ENERGY = { r = 1, g = 0.96, b = 0.41 } }
`;

// TEST-ONLY action slots (icons are placeholders) and bindings.
const ACTIONS = `
  __actions = {}
  for slot = 1, 10 do __actions[slot] = { tex = "TEST-ONLY-ICON" } end
  for slot = 61, 66 do __actions[slot] = { tex = "TEST-ONLY-ICON" } end
  for slot = 49, 52 do __actions[slot] = { tex = "TEST-ONLY-ICON" } end
  __actions[4].noPower = true
  local function a(slot) return __actions[slot] or {} end
  GetActionTexture = function(slot) return a(slot).tex end
  GetActionCount = function() return 0 end
  IsUsableAction = function(slot) return a(slot).noPower ~= true, a(slot).noPower == true end
  IsCurrentAction = function(slot) return slot == 2 end
  IsAutoRepeatAction = function() return false end
  GetActionCooldown = function() return 0, 0 end
  local keys = { "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=" }
  GetBindingKey = function(cmd)
    local n = tonumber(cmd:match("^ACTIONBUTTON(%d+)$") or "")
    if n then return keys[n] end
    n = tonumber(cmd:match("^MULTIACTIONBAR1BUTTON(%d+)$") or "")
    if n and n <= 6 then return "SHIFT-" .. n end
  end
  ClearOverrideBindings = function() end
  SetOverrideBindingClick = function() end
  RegisterStateDriver = function() end
`;

// TEST-ONLY default tooltip: a plain frame with the tooltip calls the addon uses; lines stack down from the top.
const TOOLTIP = `
  __tipHooks = {}
  hooksecurefunc = function(name, fn) __tipHooks[name] = fn end
  GameTooltip_SetDefaultAnchor = function() end
  Enum = Enum or {}
  Enum.TooltipDataType = { Unit = 2 }
  TooltipDataProcessor = { AddTooltipPostCall = function(_, fn) __tipPost = fn end }
  local tt = CreateFrame("Frame", "GameTooltip", UIParent)
  tt:SetFrameStrata("TOOLTIP")
  tt.NineSlice = CreateFrame("Frame", nil, tt)
  tt.GetUnit = function(self) return "TEST-ONLY", self.unit end
  tt.SetOwner = function() end
  tt.lines = 0
  tt.AddLine = function(self, text, r, g, b)
    self.lines = self.lines + 1
    local fs = self:CreateFontString("GameTooltipTextLeft" .. self.lines, "ARTWORK")
    fs:SetFontObject(self.lines == 1 and "GameFontNormalLarge" or "GameFontNormal")
    fs:SetText(text) fs:SetTextColor(r or 1, g or 1, b or 1) fs:SetPoint("TOPLEFT", 10, -10 - (self.lines - 1) * 18)
    self:SetSize(200, 20 + self.lines * 18)
  end
  tt:Hide()
`;

// TEST-ONLY minimap, one chat window with a few lines, XP, a watched faction, one out-of-range
// action, casts on you and your target, and auras on the target.
const WORLD = `
  UIParent:SetSize(1920, 1080)
  Enum = Enum or {}
  Enum.CustomAuraButtonDispelTypeTextureStyle = { PreserveAsset = 3 }
  Minimap = CreateFrame("Minimap", "Minimap", UIParent)
  GetMinimapZoneText = function() return "TEST-ONLY Zone" end
  GetZonePVPInfo = function() return "sanctuary" end
  C_Map = { GetBestMapForUnit = function() return 1 end,
    GetPlayerMapPosition = function() return { GetXY = function() return 0.4231, 0.6178 end } end }
  NUM_CHAT_WINDOWS = 1
  local chat = CreateFrame("ScrollingMessageFrame", "ChatFrame1", UIParent)
  chat:SetSize(440, 190)
  chat:SetPoint("BOTTOMLEFT", UIParent, "BOTTOMLEFT", 20, 40)
  chat:SetFont("Fonts\\\\FRIZQT__.TTF", 14, "")
  local tab = CreateFrame("Button", "ChatFrame1Tab", UIParent)
  tab:SetSize(70, 22)
  tab:SetPoint("BOTTOMLEFT", chat, "TOPLEFT", 0, 6)
  tab.Text = tab:CreateFontString(nil, "OVERLAY")
  tab.Text:SetPoint("CENTER")
  tab.Text:SetText("General")
  SELECTED_CHAT_FRAME = chat
  chat:AddMessage("|cffffff00TEST-ONLY chat line: [General] welcome to the preview.|r")
  chat:AddMessage("|cffff80ffTEST-ONLY whisper: this is not a real message.|r")
  chat:AddMessage(ns.Theme.Paint("ForeverUI:", "accent") .. " TEST-ONLY /fui status line.")
  UnitXP = function() return 12300 end
  UnitXPMax = function() return 40000 end
  GetXPExhaustion = function() return 5000 end
  UnitLevel = function() return 42 end
  C_Reputation = { GetWatchedFactionData = function()
    return { name = "TEST-ONLY Faction", reaction = 6, currentReactionThreshold = 9000, nextReactionThreshold = 21000, currentStanding = 15000 }
  end }
  IsActionInRange = function(slot) return slot ~= 3 end
  UnitCastingInfo = function(unit)
    if unit == "player" then return "TEST-ONLY Flash Heal", "", "TEST-ONLY-ICON", 999000, 1001500, false, 1, false end
    if unit == "target" then return "TEST-ONLY Enrage", "", "TEST-ONLY-ICON", 999500, 1002000, false, 2, true end
  end
  C_UnitAuras = { GetAuraDataByIndex = function(unit, i, filter)
    if unit ~= "target" then return nil end
    if filter == "HARMFUL|CROWD_CONTROL" and i == 1 then return { icon = "TEST-ONLY-CC", dispelName = "Magic" } end
    if filter == "HARMFUL|PLAYER|!CROWD_CONTROL" and i <= 3 then return { icon = "TEST-ONLY-DOT", applications = i, dispelName = ({ "Magic", "Curse" })[i] } end
    if filter == "HELPFUL" and i <= 3 then return { icon = "TEST-ONLY-BUFF" } end
  end }
`;

const out = path.resolve(arg("out", path.join(root, "preview")));
fs.mkdirSync(out, { recursive: true });

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

// TEST-ONLY group layout: the stub has no secure header, so this makes the
// buttons the header would (columns of five, one per group) and gives them units.
const GROUP = `
  UnitGroupRolesAssigned = function(unit) return (__units[unit] or {}).role or "NONE" end
  UnitIsUnit = function(a, b) return __units[a] ~= nil and __units[a] == __units[b] end
  RegisterAttributeDriver = function() end
  function __group(units)
    local s = ns.GetModule("RaidFrames").settings
    for i, unit in ipairs(units) do
      local b = CreateFrame("Button", "ForeverUI_RaidUnitButton" .. i, ForeverUI_Raid, "SecureUnitButtonTemplate")
      b:SetSize(s.width, s.height)
      ForeverUI_Raid.initialConfigFunction(ForeverUI_Raid, b:GetName())
      local col, row = math.floor((i - 1) / 5), (i - 1) % 5
      b:SetPoint("TOPLEFT", ForeverUI_Raid, "TOPLEFT", col * (s.width + s.spacing), -row * (s.height + s.spacing))
      b:SetAttribute("unit", unit)
    end
    -- The client's group header sizes itself to its buttons, so a header anchored by its bottom grows upward.
    local cols, rows = math.ceil(#units / 5), math.min(#units, 5)
    ForeverUI_Raid:SetSize(cols * (s.width + s.spacing) - s.spacing, rows * (s.height + s.spacing) - s.spacing)
  end
`;

// TEST-ONLY 20-player raid: four groups with a tank and a healer each, one dead, one offline,
// three dispellable debuffs (Magic, Poison, Curse), some of your HoTs, incoming heals,
// shields, aggro on the tanks, four players missing your buff, raid icons, a leader and
// assistants, a ready check under way, a resurrection on the dead player and two out of range.
const RAID = `
  local classes = { "WARRIOR", "PRIEST", "MAGE", "ROGUE", "HUNTER", "PALADIN", "DRUID", "SHAMAN", "WARLOCK", "MONK" }
  RAID_CLASS_COLORS.WARRIOR = { r = 0.78, g = 0.61, b = 0.43 } RAID_CLASS_COLORS.HUNTER = { r = 0.67, g = 0.83, b = 0.45 }
  RAID_CLASS_COLORS.PALADIN = { r = 0.96, g = 0.55, b = 0.73 } RAID_CLASS_COLORS.DRUID = { r = 1, g = 0.49, b = 0.04 }
  RAID_CLASS_COLORS.SHAMAN = { r = 0, g = 0.44, b = 0.87 } RAID_CLASS_COLORS.WARLOCK = { r = 0.53, g = 0.53, b = 0.93 }
  RAID_CLASS_COLORS.MONK = { r = 0, g = 1, b = 0.6 }
  local units = {}
  for i = 1, 20 do
    local max = 40000 + (i * 1373) % 9000
    __units["raid" .. i] = { name = "TEST-ONLY " .. i, hp = max * ((i * 37) % 100) / 100, maxhp = max, power = 0, maxpower = 0, ptype = "MANA",
      player = true, class = classes[(i - 1) % #classes + 1], role = (i % 5 == 1) and "TANK" or (i % 5 == 2) and "HEALER" or "DAMAGER",
      dead = i == 7, offline = i == 13 }
    units[i] = "raid" .. i
  end
  UnitIsDeadOrGhost = function(unit) return (__units[unit] or {}).dead == true end
  UnitIsConnected = function(unit) return not (__units[unit] or {}).offline end
  local debuffs = { raid4 = "Magic", raid9 = "Poison", raid16 = "Curse" }
  local hots = { raid1 = 3, raid3 = 1, raid6 = 2, raid11 = 2, raid17 = 1 }
  local boss = { raid2 = true, raid4 = true, raid12 = true }
  C_UnitAuras = { GetAuraDataByIndex = function(unit, i, filter)
    if filter == "HARMFUL|RAID" then return i == 1 and debuffs[unit] and { icon = "TEST-ONLY-DEBUFF", dispelName = debuffs[unit] } or nil end
    if filter == "HARMFUL|!RAID" then return i == 1 and boss[unit] and { icon = "TEST-ONLY-BOSS" } or nil end
    if filter == "HELPFUL|PLAYER|RAID_IN_COMBAT" and i <= (hots[unit] or 0) then return { icon = "TEST-ONLY-HOT", expirationTime = 0, duration = 0 } end
  end }
  local heals, shields = { raid2 = 9000, raid5 = 12000, raid12 = 6000 }, { raid1 = 8000, raid6 = 5000, raid11 = 7000 }
  CreateUnitHealPredictionCalculator = function()
    local c = {}
    function c:SetIncomingHealClampMode() end
    function c:SetIncomingHealOverflowPercent() end
    function c:GetMaximumHealth() return __units[self.unit].maxhp end
    function c:GetIncomingHeals() return heals[self.unit] or 0 end
    function c:GetTotalDamageAbsorbs() return shields[self.unit] or 0 end
    return c
  end
  UnitGetDetailedHealPrediction = function(unit, _, c) c.unit = unit end
  UnitThreatSituation = function(unit) return ({ raid1 = 3, raid6 = 2, raid11 = 1 })[unit] or 0 end
  C_Spell = { GetSpellInfo = function() return {} end, GetSpellTexture = function() return "TEST-ONLY-BUFF" end }
  local missing = { raid3 = true, raid8 = true, raid14 = true, raid19 = true }
  C_UnitAuras.GetAuraDataBySpellName = function(unit) if not missing[unit] then return {} end end
  local icons, answers = { raid1 = 8, raid6 = 7, raid11 = 1 }, { raid4 = "notready", raid9 = "waiting", raid15 = "waiting" }
  GetRaidTargetIndex = function(unit) return icons[unit] end
  GetReadyCheckStatus = function(unit) return answers[unit] or "ready" end
  UnitHasIncomingResurrection = function(unit) return unit == "raid7" end
  UnitIsGroupLeader = function(unit) return unit == "raid2" end
  UnitIsGroupAssistant = function(unit) return unit == "raid6" or unit == "raid12" end
  UnitInRange = function(unit) return unit ~= "raid18" and unit ~= "raid20", true end
  __group(units)
  ns.GetModule("RaidStatus").readyRunning = true
  ns.GetModule("RaidStatus").UpdateAll()
`;

// TEST-ONLY nameplates: your target (a boar with your debuff, casting), a wolf with aggro on you, a
// marked wolf, and a friendly player; plates placed where the client might put them.
const PLATES = `
  __units.nameplate1 = __units.target
  __units.nameplate2 = { name = "TEST-ONLY Wolf", hp = 9000, maxhp = 20000, power = 0, maxpower = 0, ptype = "RAGE", reaction = 2 }
  __units.nameplate3 = { name = "TEST-ONLY Wolf", hp = 20000, maxhp = 20000, power = 0, maxpower = 0, ptype = "RAGE", reaction = 4 }
  __units.nameplate4 = __units.party1
  local spots = { nameplate1 = { 960, 520 }, nameplate2 = { 760, 470 }, nameplate3 = { 1170, 450 }, nameplate4 = { 880, 360 } }
  local plates = {}
  for unit, xy in pairs(spots) do
    local p = CreateFrame("Frame", nil, UIParent)
    p:SetSize(150, 40) p:SetPoint("CENTER", UIParent, "BOTTOMLEFT", xy[1], xy[2])
    p.UnitFrame = CreateFrame("Frame", nil, p)
    plates[unit] = p
  end
  C_NamePlate = { GetNamePlateForUnit = function(unit) return plates[unit] end }
  UnitIsUnit = function(a, b) return __units[a] ~= nil and __units[a] == __units[b] end
  UnitThreatSituation = function(_, unit) return unit == "nameplate2" and 3 or 0 end
  GetRaidTargetIndex = function(unit) return unit == "nameplate3" and 8 or nil end
  local getAura = C_UnitAuras.GetAuraDataByIndex
  C_UnitAuras.GetAuraDataByIndex = function(unit, i, filter)
    if unit == "nameplate1" and filter == "HARMFUL|PLAYER|!CROWD_CONTROL" and i <= 2 then return { icon = "TEST-ONLY-DOT", expirationTime = 0, duration = 0 } end
    return getAura(unit, i, filter)
  end
  UnitCastingInfo = function(unit) if unit == "nameplate1" then return "TEST-ONLY Charge", "", "TEST-ONLY-ICON", GetTime() * 1000 - 600, GetTime() * 1000 + 1400, false, nil, false end end
  C_QuestLog = C_QuestLog or {} C_QuestLog.UnitIsRelatedToActiveQuest = function(unit) return unit == "nameplate2" or unit == "nameplate3" end
  for unit in pairs(spots) do __wfgStub.fire("NAME_PLATE_UNIT_ADDED", unit) end
`;

// TEST-ONLY instanced combat: health comes back as secret values, which the
// addon may hand to bars and the client's formatter but not do math with.
// The preview draws a secret as the number it hides ({ __secret, n }).
const SECRET = `
  issecretvalue = function(v) return type(v) == "table" and v.__secret == true end
  local health = UnitHealth
  UnitHealth = function(unit) return { __secret = true, n = health(unit) } end
  local format = AbbreviateNumbers
  AbbreviateNumbers = function(v) return format(issecretvalue(v) and v.n or v) end
`;

// Scenes: the default layout (party on the raid frames), a 20-player raid, setup, then the options window.
const SCENES = [
  { name: "foreverui-default", caption: "ForeverUI defaults (brass accent)", lua: '__group({ "player", "party1", "party2" })' },
  { name: "foreverui-scale1", caption: "The same defaults at the game's UI scale 1.0 (1365 x 768 units, zoomed to 1080p): the cluster keeps its shape", lua: '__group({ "player", "party1", "party2" })',
    screen: { width: 1365, height: 768 }, before: "UIParent:SetSize(1365, 768)" },
  { name: "foreverui-raid", caption: "Raid frames, 20 players: heals, shields, aggro, missing buffs, dispel borders, HoTs, raid icons, ready check, leader, range fade (TEST-ONLY raid)", lua: RAID },
  { name: "foreverui-raid-secret", caption: "Raid frames in instanced combat: health is secret, so bars still draw but missing-health text hides; first-run setup open on top (TEST-ONLY raid)", lua: SECRET + RAID + "ns.Setup.Open()" },
  { name: "foreverui-setup", caption: "First-run setup, step 2 of 3: accent and raid frame style (/fui setup)", lua: "ns.Setup.Open() ns.Setup.Next()" },
  { name: "foreverui-classic", caption: "The Like the game's layout: player and target along the top left, the target of target and focus beside them, the party down the left side (TEST-ONLY party)", lua: '__group({ "player", "party1", "party2" }) ns.Setup.ApplyLayout("classic")' },
  { name: "foreverui-setup-healing", caption: "The Healing layout: party on the raid frames, centered just above the cast bar (TEST-ONLY party)", lua: '__group({ "player", "party1", "party2" }) ns.Setup.ApplyLayout("healing")' },
  { name: "foreverui-forever", caption: "On the WoW Forever client (interface 16001, no specializations): levels, health as a percent, a boss diamond, your threat on the target (TEST-ONLY units)", lua: '__group({ "player", "party1", "party2" })',
    before: `GetBuildInfo = function() return "1.16.0", "TEST-ONLY", "Sep 1 2026", 16001 end
      GetSpecialization = nil
      CurveConstants = { ScaleTo100 = 1 }
      UnitHealthPercent = function(unit) local x = __units[unit] if x and type(x.hp) == "number" then return math.floor(x.hp / x.maxhp * 100) end return 62 end
      UnitLevel = function(unit) return unit == "target" and -1 or 60 end
      GetCreatureDifficultyColor = function(level) return level == -1 and { r = 1, g = 0.1, b = 0.1 } or { r = 1, g = 0.82, b = 0 } end
      UnitClassification = function(unit) return unit == "target" and "worldboss" or "normal" end
      UnitDetailedThreatSituation = function() return false, 1, 87, 87, 0 end` },
  { name: "foreverui-buffs", caption: "Your buffs left of the minimap, a weapon imbue in front, and two debuffs on a new row (TEST-ONLY auras)", lua: '__group({ "player", "party1", "party2" })',
    before: `local getAura = C_UnitAuras.GetAuraDataByIndex
      C_UnitAuras.GetAuraDataByIndex = function(unit, i, filter)
        if unit == "player" and filter == "HELPFUL" and i <= 9 then return { icon = "TEST-ONLY-BUFF" .. i } end
        if unit == "player" and filter == "HARMFUL" and i <= 2 then return { icon = "TEST-ONLY-DEBUFF", dispelName = ({ "Magic", "Poison" })[i] } end
        return getAura(unit, i, filter)
      end
      Enum.WeaponSlot = { MainHand = 0, OffHand = 1, Ranged = 2 }
      C_Item = { GetWeaponEnchantInfo = function(slot) if slot == 0 then return { { hasEnchant = true, timeLeft = 1500000, enchantIconID = "TEST-ONLY-IMBUE" } } end end }` },
  { name: "foreverui-strip", caption: "The strip under the minimap for a hunter: worn gear in orange, free slots, fps and latency, gold, ammo, the time, and the leveling row: XP per hour, time to level, gold per hour, and your DPS in the last fight (TEST-ONLY numbers)",
    lua: '__group({ "player", "party1", "party2" }) local IS = ns.GetModule("InfoStrip") IS.session.start, IS.session.gained, IS.session.money = GetTime() - 1800, 2100, 113407 IS.settings.dps = true IS.UpdateAll()',
    before: `__units.player.class = "HUNTER"
      GetInventoryItemDurability = function(slot) if slot == 5 then return 22, 100 end if slot == 1 then return 80, 100 end end
      C_Container = C_Container or {} C_Container.GetContainerNumFreeSlots = function(bag) return bag == 0 and 6 or 2 end
      GetFramerate = function() return 58 end GetNetStats = function() return 0, 0, 40, 64 end
      GetMoney = function() return 123407 end
      GetInventoryItemCount = function(unit, slot) return slot == 0 and 412 or 0 end
      date = function() return "21:04" end
      UnitXP = function() return 3400 end UnitXPMax = function() return 9800 end GetXPExhaustion = function() return 4900 end
      UnitLevel = function() return 18 end GetMaxPlayerLevel = function() return 60 end
      C_DamageMeter = { GetCombatSessionFromType = function() return { combatSources = { { isLocalPlayer = true, amountPerSecond = 412.6 } } } end }` },
  { name: "foreverui-afk", caption: "The AFK screen: while you're away the screen dims to a card with your name, level and class, the zone, the time away, the clock and your XP (TEST-ONLY zone)",
    lua: '__group({ "player", "party1", "party2" }) UnitIsAFK = function() return true end __wfgStub.fire("PLAYER_FLAGS_CHANGED", "player") __wfgStub.advance(12, 1)',
    before: `GetRealZoneText = function() return "TEST-ONLY Vale" end GetSubZoneText = function() return "TEST-ONLY Hamlet" end date = function() return "21:04" end
      UnitXP = function() return 3400 end UnitXPMax = function() return 9800 end UnitLevel = function() return 18 end GetMaxPlayerLevel = function() return 60 end` },
  { name: "foreverui-shaman", caption: "A shaman: three totems under the player frame (the game draws their time left), the air slot empty (TEST-ONLY totems)", lua: '__group({ "player", "party1", "party2" })',
    before: `__units.player.class = "SHAMAN"
      local totems = { { "TEST-ONLY Fire", 100 }, { "TEST-ONLY Earth", 45 }, { "TEST-ONLY Water", 190 } }
      GetTotemInfo = function(slot) local t = totems[slot] if not t then return false, "", 0, 0, nil end return true, t[1], GetTime() - 10, t[2] + 10, "TEST-ONLY-ICON-" .. t[1] end` },
  { name: "foreverui-rogue", caption: "A rogue on WoW Forever: the swing timer (main hand and off hand, from the client's own swings) and the energy tick spark on the power bar (TEST-ONLY swings)",
    lua: `__group({ "player", "party1", "party2" })
      __wfgStub.fire("UNIT_POWER_FREQUENT", "player", "ENERGY") __units.player.power = 60 __wfgStub.fire("UNIT_POWER_FREQUENT", "player", "ENERGY")
      ns.GetModule("PowerTicks").bar:SetWidth(218) -- the stub has no layout; the game measures the bar
      __wfgStub.fire("PLAYER_SWING", 2.6, 0) __wfgStub.fire("PLAYER_SWING", 1.4, 1) __wfgStub.advance(0.75)`,
    before: `__units.player.class = "ROGUE" __units.player.power = 40 __units.player.maxpower = 100 __units.player.ptype = "ENERGY"
      UnitPowerType = function(unit) local x = __units[unit] if x and x.ptype == "ENERGY" then return 3, "ENERGY" end return 0, "MANA" end
      C_SwingTimer = {} Enum.PlayerSwingType = { MainHand = 0, OffHand = 1, Ranged = 2 }` },
  { name: "foreverui-menu", caption: "Bottom-right with the mouse over the menu: the game's menu buttons as ForeverUI line icons, the bag buttons in their own strip, the game's damage meter above them, and the Cooldown Manager row between the unit frames, and the quest tracker's flat headers (TEST-ONLY buttons, meter, cooldowns and quests)",
    lua: "function ForeverUI_MenuStrip:IsMouseOver() return true end ForeverUI_MenuStrip:SetAlpha(1)",
    before: `MicroMenuContainer = CreateFrame("Frame", "MicroMenuContainer", UIParent) MicroMenuContainer:SetSize(198, 28)
      for i, name in ipairs({ "Character", "PlayerSpells", "Talent", "Achievement", "QuestLog", "Guild", "LFD", "Collections", "MainMenu" }) do
        local b = CreateFrame("Button", name .. "MicroButton", MicroMenuContainer) b:SetSize(22, 28) b:SetPoint("LEFT", (i - 1) * 22, 0)
        local art = b:CreateTexture(nil, "ARTWORK") art:SetAllPoints() art:SetColorTexture(0.55, 0.12, 0.1, 1) end
      BagsBar = CreateFrame("Frame", "BagsBar", UIParent) BagsBar:SetSize(176, 40)
      for i, name in ipairs({ "MainMenuBarBackpackButton", "CharacterBag0Slot", "CharacterBag1Slot", "CharacterBag2Slot", "CharacterBag3Slot" }) do
        local b = CreateFrame("Button", name, BagsBar) b:SetSize(i == 1 and 40 or 32, i == 1 and 40 or 32) b:SetPoint("RIGHT", BagsBar, "RIGHT", i == 1 and 0 or -42 - (i - 2) * 34, 0)
        b.icon = b:CreateTexture(nil, "ARTWORK") b.icon:SetAllPoints() b.icon:SetColorTexture(0.42, 0.3, 0.16, 1)
        local art = b:CreateTexture(nil, "OVERLAY") art:SetAllPoints() art:SetColorTexture(0.55, 0.12, 0.1, 0.6) end
      DamageMeter = CreateFrame("Frame", "DamageMeter", UIParent) DamageMeter:SetSize(400, 200) DamageMeter:SetPoint("TOPLEFT")
      local w = CreateFrame("Frame", "DamageMeterSessionWindow1", DamageMeter) w:SetPoint("TOPLEFT") w:SetPoint("BOTTOMRIGHT")
      w.Header = w:CreateTexture() w.Header:SetColorTexture(0.5, 0.35, 0.1, 1) w.Header:SetPoint("TOPLEFT") w.Header:SetPoint("TOPRIGHT") w.Header:SetHeight(22)
      local title = w:CreateFontString(nil, "OVERLAY") title:SetPoint("TOPLEFT", 8, -5) title:SetText("TEST-ONLY Damage Done") title:SetTextColor(1, 0.82, 0)
      w.ScrollBox = CreateFrame("Frame", nil, w) w.ScrollBox.lines = {}
      function w.ScrollBox:ForEachFrame(fn) for _, l in ipairs(self.lines) do fn(l) end end
      for i, row in ipairs({ { "<name>", 0.41, 0.8, 0.94, 1 }, { "TEST-ONLY Rogue", 1, 0.96, 0.41, 0.6 }, { "TEST-ONLY Priest", 1, 1, 1, 0.45 } }) do
        local l = CreateFrame("Button", nil, w.ScrollBox) l:SetPoint("TOPLEFT", w, "TOPLEFT", 4, -26 - (i - 1) * 20) l:SetPoint("RIGHT", w, "RIGHT", -4, 0) l:SetHeight(18)
        l.StatusBar = CreateFrame("StatusBar", nil, l) l.StatusBar:SetAllPoints() l.StatusBar:SetMinMaxValues(0, 1) l.StatusBar:SetValue(row[5]) l.StatusBar:SetStatusBarColor(row[2], row[3], row[4])
        l.StatusBar.Name = l.StatusBar:CreateFontString(nil, "OVERLAY") l.StatusBar.Name:SetPoint("LEFT", 4, 0) l.StatusBar.Name:SetText(i .. ". " .. row[1])
        w.ScrollBox.lines[i] = l end
      DamageMeter.windows = { w }
      function DamageMeter:ForEachSessionWindow(fn) for _, x in ipairs(self.windows) do fn(x) end end
      local v = CreateFrame("Frame", "EssentialCooldownViewer", UIParent) v:SetSize(236, 32) v.items = {}
      for i = 1, 7 do local it = CreateFrame("Frame", nil, v) it:SetSize(32, 32) it:SetPoint("LEFT", v, "LEFT", (i - 1) * 34, 0)
        it.Icon = it:CreateTexture() it.Icon:SetAllPoints() it.Icon:SetColorTexture(0.2 + i * 0.08, 0.25, 0.5 - i * 0.04, 1) v.items[i] = it end
      function v:GetItemFrames() return self.items end
      ObjectiveTrackerFrame = CreateFrame("Frame", "ObjectiveTrackerFrame", UIParent) ObjectiveTrackerFrame:SetSize(260, 280)
      local function header(y, text)
        local h = CreateFrame("Frame", nil, ObjectiveTrackerFrame) h:SetSize(260, 24) h:SetPoint("TOPLEFT", 0, y)
        h.Background = h:CreateTexture() h.Background:SetAllPoints() h.Background:SetColorTexture(0.45, 0.32, 0.12, 1)
        h.Text = h:CreateFontString(nil, "OVERLAY") h.Text:SetPoint("LEFT", 8, 0) h.Text:SetText(text) h.Text:SetTextColor(1, 0.82, 0)
        h.MinimizeButton = CreateFrame("Button", nil, h) h.MinimizeButton:SetSize(16, 16) h.MinimizeButton:SetPoint("RIGHT", -6, 0)
        return h
      end
      ObjectiveTrackerFrame.Header = header(0, "All Objectives")
      ObjectiveTrackerFrame.modules = { { Header = header(-30, "Quests") } }
      for i, line in ipairs({ { "[14] TEST-ONLY Patrolling", 1, 0.82, 0 }, { "  - Ready for turn-in", 0.8, 0.8, 0.8 }, { "[12] TEST-ONLY Militia", 0.25, 0.75, 0.25 }, { "  - 3/15 TEST-ONLY slain", 0.8, 0.8, 0.8 } }) do
        local fs = ObjectiveTrackerFrame:CreateFontString(nil, "OVERLAY") fs:SetPoint("TOPLEFT", 10, -60 - (i - 1) * 16) fs:SetText(line[1]) fs:SetTextColor(line[2], line[3], line[4]) end` },
  { name: "foreverui-window", caption: "A game window in the ForeverUI look: the game's art faded, a flat panel with a soft shadow, the theme's close button, title and buttons (TEST-ONLY merchant window)",
    lua: "MerchantFrame:Show()",
    before: `local f = CreateFrame("Frame", "MerchantFrame", UIParent) f:SetSize(340, 420) f:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 40, -120)
      local art = f:CreateTexture(nil, "BACKGROUND") art:SetAllPoints() art:SetColorTexture(0.45, 0.32, 0.18, 1)
      f.CloseButton = CreateFrame("Button", "MerchantFrameCloseButton", f) f.CloseButton:SetSize(20, 20) f.CloseButton:SetPoint("TOPRIGHT", -4, -4)
      f.TitleContainer = CreateFrame("Frame", nil, f) f.TitleContainer:SetAllPoints()
      f.TitleContainer.TitleText = f.TitleContainer:CreateFontString(nil, "OVERLAY") f.TitleContainer.TitleText:SetPoint("TOP", 0, -8) f.TitleContainer.TitleText:SetText("TEST-ONLY Merchant")
      for i = 1, 2 do local b = CreateFrame("Button", "MerchantFrameButton" .. i, f) b:SetSize(120, 22) b:SetPoint("BOTTOMLEFT", 16 + (i - 1) * 140, 14)
        b.text = b:CreateFontString(nil, "OVERLAY") b.text:SetPoint("CENTER") b.text:SetText(i == 1 and "TEST-ONLY Repair" or "TEST-ONLY Buyback") end
      f:Hide()` },
  { name: "foreverui-errands", caption: "Errands: Train all on the trainer's window, with the count and what it costs, and the flight timer counting down to a route flown before (TEST-ONLY trainer and route)",
    lua: `__wfgStub.fire("ADDON_LOADED", "Blizzard_TrainerUI") __wfgStub.fire("TRAINER_SHOW")
      ns.GetModule("Errands").PaintFlight({ to = "TEST-ONLY Outpost", start = GetTime() - 30, known = 91 })`,
    before: `local f = CreateFrame("Frame", "ClassTrainerFrame", UIParent) f:SetSize(340, 420) f:SetPoint("TOPLEFT", UIParent, "TOPLEFT", 40, -120)
      local art = f:CreateTexture(nil, "BACKGROUND") art:SetAllPoints() art:SetColorTexture(0.45, 0.32, 0.18, 1)
      local t = CreateFrame("Button", "ClassTrainerTrainButton", f) t:SetSize(80, 22) t:SetPoint("BOTTOMRIGHT", -12, 8)
      local services = { { "available", 500 }, { "available", 2000 }, { "unavailable", 100 } }
      GetNumTrainerServices = function() return #services end
      GetTrainerServiceInfo = function(i) return "TEST-ONLY Skill", "", services[i][1] end
      GetTrainerServiceCost = function(i) return services[i][2] end
      GetMoney = function() return 123407 end
      TakeTaxiNode = function() end hooksecurefunc = hooksecurefunc or function() end` },
  { name: "foreverui-bosses", caption: "A boss fight as the group's leader: two boss frames at the top left, the raid tools bar beside them (calls, target icons, world markers), and two main tanks with the boss each is targeting (TEST-ONLY bosses)",
    lua: `__group({ "player", "party1", "party2" }) __wfgStub.fire("INSTANCE_ENCOUNTER_ENGAGE_UNIT")
      for i, unit in ipairs({ "party1", "party2" }) do
        local b = CreateFrame("Button", "ForeverUI_MainTanksUnitButton" .. i, ForeverUI_MainTanks, "SecureUnitButtonTemplate")
        b:SetSize(140, 22) ForeverUI_MainTanks.initialConfigFunction(ForeverUI_MainTanks, b:GetName())
        b:SetPoint("TOPLEFT", ForeverUI_MainTanks, "TOPLEFT", 0, -(i - 1) * 26) b:SetAttribute("unit", unit) ns.GetModule("MainTanks").Paint(b)
      end`,
    before: `__units.boss1 = { name = "TEST-ONLY Warlord", hp = 72000, maxhp = 100000, power = 0, maxpower = 0, ptype = "RAGE", reaction = 2, classification = "worldboss" }
      __units.boss2 = { name = "TEST-ONLY Guard", hp = 30000, maxhp = 40000, power = 0, maxpower = 0, ptype = "RAGE", reaction = 2, classification = "elite" }
      IsInGroup = function() return true end UnitIsGroupLeader = function(u) return u == "player" end IsInRaid = function() return false end
      C_PartyInfo = C_PartyInfo or {} C_PartyInfo.DoReadyCheck = function() end C_PartyInfo.DoCountdown = function() end C_PartyInfo.ConvertToRaid = function() end
      InitiateRolePoll = function() end
      __units.party1target = __units.boss1 __units.party2target = __units.boss2` },
  { name: "foreverui-quest-gossip", caption: "The quest dialog at a quest giver: portrait, name, greeting, numbered lines (a quest to take in its difficulty color, one ready to turn in in gold, a gossip option) (TEST-ONLY NPC and quests)",
    lua: '__wfgStub.fire("GOSSIP_SHOW")', before: `UnitName = (function(old) return function(u) if u == "npc" then return "TEST-ONLY Farmer Maple" end return old(u) end end)(UnitName)
      GetQuestDifficultyColor = function(level) if level >= 12 then return { r = 1, g = 0.5, b = 0.25 } end return { r = 0.25, g = 0.75, b = 0.25 } end
      C_Item = C_Item or {} C_Item.GetItemQualityColor = function(q) if q == 3 then return 0, 0.44, 0.87 end return 0.12, 1, 0 end
      C_GossipInfo = { GetText = function() return "TEST-ONLY Times are hard, <name>. Wolves take a sheep a night, and the road to town isn't safe anymore." end,
        GetAvailableQuests = function() return { { title = "TEST-ONLY The Wolves of the Fold", questLevel = 9, questID = 90031 } } end,
        GetActiveQuests = function() return { { title = "TEST-ONLY A Letter for the Farm", questLevel = 12, questID = 90032, isComplete = true } } end,
        GetOptions = function() return { { name = "TEST-ONLY What news from town?", gossipOptionID = 90041, orderIndex = 0 } } end }
      GetTitleText = function() return "TEST-ONLY The Wolves of the Fold" end
      GetQuestText = function() return "TEST-ONLY The wolves come down from the hills each night. Thin their numbers before the flock is gone, and I'll see you're paid for it." end
      GetObjectiveText = function() return "Slay 8 TEST-ONLY Hill Wolves." end
      local choices = { { "TEST-ONLY Shepherd's Boots", "TEST-ONLY-ICON", 1, 3 }, { "TEST-ONLY Wolfhide Gloves", "TEST-ONLY-ICON", 1, 2 } }
      GetNumQuestChoices = function() return 2 end GetNumQuestRewards = function() return 1 end
      GetQuestItemInfo = function(kind, i) local x = kind == "choice" and choices[i] or { "TEST-ONLY Farm Bread", "TEST-ONLY-ICON", 5, 1 } return x[1], x[2], x[3], x[4] end
      GetRewardMoney = function() return 1500 end GetRewardXP = function() return 650 end` },
  { name: "foreverui-quest-detail", caption: "The quest dialog showing a quest: text, objectives, reward cards with quality borders, money and XP, Accept and Decline (TEST-ONLY quest and rewards)",
    lua: '__wfgStub.fire("QUEST_DETAIL")', before: `UnitName = (function(old) return function(u) if u == "npc" then return "TEST-ONLY Farmer Maple" end return old(u) end end)(UnitName)
      GetQuestDifficultyColor = function(level) if level >= 12 then return { r = 1, g = 0.5, b = 0.25 } end return { r = 0.25, g = 0.75, b = 0.25 } end
      C_Item = C_Item or {} C_Item.GetItemQualityColor = function(q) if q == 3 then return 0, 0.44, 0.87 end return 0.12, 1, 0 end
      C_GossipInfo = { GetText = function() return "TEST-ONLY Times are hard, <name>. Wolves take a sheep a night, and the road to town isn't safe anymore." end,
        GetAvailableQuests = function() return { { title = "TEST-ONLY The Wolves of the Fold", questLevel = 9, questID = 90031 } } end,
        GetActiveQuests = function() return { { title = "TEST-ONLY A Letter for the Farm", questLevel = 12, questID = 90032, isComplete = true } } end,
        GetOptions = function() return { { name = "TEST-ONLY What news from town?", gossipOptionID = 90041, orderIndex = 0 } } end }
      GetTitleText = function() return "TEST-ONLY The Wolves of the Fold" end
      GetQuestText = function() return "TEST-ONLY The wolves come down from the hills each night. Thin their numbers before the flock is gone, and I'll see you're paid for it." end
      GetObjectiveText = function() return "Slay 8 TEST-ONLY Hill Wolves." end
      local choices = { { "TEST-ONLY Shepherd's Boots", "TEST-ONLY-ICON", 1, 3 }, { "TEST-ONLY Wolfhide Gloves", "TEST-ONLY-ICON", 1, 2 } }
      GetNumQuestChoices = function() return 2 end GetNumQuestRewards = function() return 1 end
      GetQuestItemInfo = function(kind, i) local x = kind == "choice" and choices[i] or { "TEST-ONLY Farm Bread", "TEST-ONLY-ICON", 5, 1 } return x[1], x[2], x[3], x[4] end
      GetRewardMoney = function() return 1500 end GetRewardXP = function() return 650 end` },
  { name: "foreverui-quest-tracker", caption: "ForeverUI's quest tracker under the info strip: levels in difficulty colors, objectives gray until done, a quest ready to turn in, a quest item beside its quest (TEST-ONLY quests)",
    lua: '__wfgStub.fire("QUEST_WATCH_LIST_CHANGED")',
    before: `local quests = {
        { 90051, "TEST-ONLY The Wolves of the Fold", 9, { { "3/8 TEST-ONLY Hill Wolves slain", false }, { "1/1 TEST-ONLY Wolf Pelt", true } }, "item:90061" },
        { 90052, "TEST-ONLY A Letter for the Farm", 12, {}, nil, true },
        { 90053, "TEST-ONLY Stones of the Old Road", 7, { { "2/5 TEST-ONLY Road Stones", false } } } }
      local byId = {} for i, q in ipairs(quests) do byId[q[1]] = i end
      GetQuestDifficultyColor = function(level) if level >= 12 then return { r = 1, g = 0.5, b = 0.25 } elseif level >= 9 then return { r = 1, g = 0.82, b = 0 } end return { r = 0.25, g = 0.75, b = 0.25 } end
      C_QuestLog = C_QuestLog or {}
      C_QuestLog.GetNumQuestWatches = function() return #quests end
      C_QuestLog.GetQuestIDForQuestWatchIndex = function(i) return quests[i][1] end
      C_QuestLog.GetLogIndexForQuestID = function(id) return byId[id] end
      C_QuestLog.GetInfo = function(i) return { title = quests[i][2], level = quests[i][3] } end
      C_QuestLog.ReadyForTurnIn = function(id) return quests[byId[id]][6] == true end
      C_QuestLog.GetQuestObjectives = function(id) local out = {} for _, o in ipairs(quests[byId[id]][4]) do out[#out + 1] = { text = o[1], finished = o[2] } end return out end
      GetQuestLogSpecialItemInfo = function(i) if quests[i][5] then return quests[i][5], "TEST-ONLY-ICON" end end` },
  { name: "foreverui-quest-log", caption: "ForeverUI's quest log: quests under their zones (a check when ready), the chosen quest's text, objectives and reward cards, and its buttons (TEST-ONLY quests)",
    lua: 'ns.GetModule("QuestLog").Open(90051)',
    before: `UISpecialFrames = {}
      local quests = { [90051] = { "TEST-ONLY The Wolves of the Fold", 9, 2, { { "3/8 TEST-ONLY Hill Wolves slain", false }, { "1/1 TEST-ONLY Wolf Pelt", true } } },
        [90052] = { "TEST-ONLY A Letter for the Farm", 12, 3, {}, true }, [90053] = { "TEST-ONLY Stones of the Old Road", 7, 5, { { "2/5 TEST-ONLY Road Stones", false } } } }
      local log = { { isHeader = true, title = "TEST-ONLY Maple Vale" }, { questID = 90051 }, { questID = 90052 }, { isHeader = true, title = "TEST-ONLY Old Road" }, { questID = 90053 } }
      GetQuestDifficultyColor = function(level) if level >= 12 then return { r = 1, g = 0.5, b = 0.25 } elseif level >= 9 then return { r = 1, g = 0.82, b = 0 } end return { r = 0.25, g = 0.75, b = 0.25 } end
      C_QuestLog = C_QuestLog or {}
      C_QuestLog.GetNumQuestLogEntries = function() return #log end
      C_QuestLog.GetInfo = function(i) local e = log[i] local q = e and e.questID and quests[e.questID] if q then return { questID = e.questID, title = q[1], level = q[2] } end return e end
      C_QuestLog.GetLogIndexForQuestID = function(id) return quests[id] and quests[id][3] end
      C_QuestLog.ReadyForTurnIn = function(id) return quests[id][5] == true end
      C_QuestLog.GetQuestObjectives = function(id) local out = {} for _, o in ipairs(quests[id][4]) do out[#out + 1] = { text = o[1], finished = o[2] } end return out end
      C_QuestLog.GetQuestWatchType = function(id) if id == 90051 then return 0 end end
      GetQuestLogQuestText = function() return "TEST-ONLY The wolves come down from the hills each night. Thin their numbers before the flock is gone, and I'll see you're paid for it." end
      C_Item = C_Item or {} C_Item.GetItemQualityColor = function(q) if q == 3 then return 0, 0.44, 0.87 end return 0.12, 1, 0 end
      GetNumQuestLogChoices = function() return 2 end GetNumQuestLogRewards = function() return 1 end
      GetQuestLogChoiceInfo = function(i) if i == 1 then return "TEST-ONLY Shepherd's Boots", "TEST-ONLY-ICON", 1, 3 end return "TEST-ONLY Wolfhide Gloves", "TEST-ONLY-ICON", 1, 2 end
      GetQuestLogRewardInfo = function() return "TEST-ONLY Farm Bread", "TEST-ONLY-ICON", 5, 1 end
      GetQuestLogRewardMoney = function() return 1500 end GetQuestLogRewardXP = function() return 650 end` },
  { name: "foreverui-nameplates", caption: "Nameplates: your target (accent border, your debuffs, a cast), aggro in red, a raid icon, a gold ! on the wolves a quest needs, a friendly player (TEST-ONLY units)", lua: PLATES },
  { name: "foreverui-tooltip", caption: "Tooltip over a hostile target in the movable corner: reaction-colored name and border, Target line (TEST-ONLY lines)", lua: `
    GameTooltip:AddLine("TEST-ONLY Boar") GameTooltip:AddLine("Level 12 Beast") GameTooltip:AddLine("TEST-ONLY Zone", 0.6, 0.6, 0.6)
    GameTooltip.unit = "target" __tipHooks.GameTooltip_SetDefaultAnchor(GameTooltip, UIParent) GameTooltip:Show() __tipPost(GameTooltip)` },
  { name: "foreverui-options", caption: "Options window: General (/fui)", lua: 'ns.Options.Show("general")' },
  { name: "foreverui-faction-alliance", caption: "The faction look on an Alliance character: Cinzel headings and the crossed swords beside the title (TEST-ONLY character)", lua: 'ns.Options.Show("general")', before: 'UnitFactionGroup = function() return "Alliance" end' },
  { name: "foreverui-faction-horde", caption: "The faction look on a Horde character while away: Metamorphous for the name and the crossed axes on the AFK card (TEST-ONLY character)",
    lua: '__group({ "player", "party1", "party2" }) UnitIsAFK = function() return true end __wfgStub.fire("PLAYER_FLAGS_CHANGED", "player")',
    before: 'UnitFactionGroup = function() return "Horde" end GetRealZoneText = function() return "TEST-ONLY Barrens" end date = function() return "21:04" end UnitXP = function() return 3400 end UnitXPMax = function() return 9800 end UnitLevel = function() return 18 end GetMaxPlayerLevel = function() return 60 end' },
  { name: "foreverui-bars-drag", caption: "Action bars while you drag a spell or item: the empty slots show so there is somewhere to drop it; otherwise they stay hidden (TEST-ONLY icons)", lua: '__wfgStub.fire("ACTIONBAR_SHOWGRID")' },
  { name: "foreverui-options-modules", caption: "Options window: Modules, each with what it does and what it needs", lua: 'ns.Options.Show("modules")' },
  { name: "foreverui-options-changed", caption: "Options window: Unit frames with two settings changed; the dot left of each puts its default back", lua: 'ns.Settings("UnitFrames").healthText = false ns.Settings("PowerTicks").energy = false ns.Options.Show("unitframes")' },
  { name: "foreverui-options-profiles", caption: "Options window: Profiles, each with Use, Copy here and Delete (which ask first), and a box for a new one (TEST-ONLY profiles)",
    lua: 'ns.NewProfile("TEST-ONLY Healer") ns.NewProfile("TEST-ONLY Leveling") ns.Options.Show("profiles")' },
  { name: "foreverui-options-bars", caption: "Options window: Action bars", lua: 'ns.Options.Show("actionbars")' },
  { name: "foreverui-healing", caption: "Options window: Healing", lua: 'ns.Options.Show("healing")' },
  { name: "foreverui-clickcast", caption: "Options window: Click casting (TEST-ONLY bindings)", lua: `
    local CC = ns.GetModule("ClickCast")
    CC.Add("ctrl-BUTTON2", "spell", "TEST-ONLY Renew") CC.Add("shift-BUTTON1", "spell", "TEST-ONLY Shield")
    CC.Add("SHIFT-1", "spell", "TEST-ONLY Flash Heal") CC.Add("MOUSEWHEELUP", "macro", "/cast [@mouseover] TEST-ONLY Heal")
    ns.Options.Show("clickcast")` },
];

// Setup has run on this TEST-ONLY account, so it only shows in the scenes that open it.
const SAVED = "ForeverUIDB = { version = 1, profiles = {}, setupDone = true }";

for (const scene of SCENES) {
  const addon = createAddon({ savedVariables: SAVED });
  addon.eval(UNITS + ACTIONS + WORLD + TOOLTIP + GROUP + "GetSpecialization = function() return 1 end");
  if (scene.before) addon.eval(scene.before);
  addon.login();
  addon.fire("PLAYER_ENTERING_WORLD");
  // In game the client hides the vehicle exit until you can leave; the stub has no state drivers.
  addon.eval("if ForeverUI_VehicleExit then ForeverUI_VehicleExit:Hide() end");
  if (scene.lua) addon.eval(scene.lua);
  addon.update(0.25);
  const file = path.join(out, `${scene.name}.png`);
  await renderScene(page, addon, {
    file,
    caption: `Preview · ${scene.caption} · layout from the addon's Lua; TEST-ONLY units, icons and chat; map, icons and font approximated, not a game screenshot`,
    // Nothing depends on measured text height, so there is nothing to redo.
    relayout: () => {},
    screen: scene.screen,
  });
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
await browser.close();
