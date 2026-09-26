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

// TEST-ONLY minimap, one chat window with a few lines, XP, a watched faction, one out-of-range
// action, casts on you and your target, and auras on the target.
const WORLD = `
  UIParent:SetSize(1920, 1080)
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
  chat:AddMessage("|cff3d9effForeverUI:|r TEST-ONLY /fui status line.")
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
    if filter == "HARMFUL|PLAYER" and i <= 2 then return { icon = "TEST-ONLY-DOT", applications = i } end
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
  end
`;

// TEST-ONLY 20-player raid: four groups with a tank and a healer each, one dead, one offline,
// three dispellable debuffs (Magic, Poison, Curse), some of your HoTs, incoming heals,
// shields, aggro on the tanks, and four players missing your buff.
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
  C_UnitAuras = { GetAuraDataByIndex = function(unit, i, filter)
    if filter == "HARMFUL|RAID" then return i == 1 and debuffs[unit] and { dispelName = debuffs[unit] } or nil end
    if i <= (hots[unit] or 0) then return { icon = "TEST-ONLY-HOT", expirationTime = 0, duration = 0 } end
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
  __group(units)
`;

// Scenes: the default layout (party on the raid frames), a 20-player raid, then the options window.
const SCENES = [
  { name: "foreverui-default", caption: "ForeverUI defaults (blue accent)", lua: '__group({ "player", "party1", "party2" })' },
  { name: "foreverui-raid", caption: "Raid frames, 20 players: heals, shields, aggro, missing buffs, dispel borders, HoTs (TEST-ONLY raid)", lua: RAID },
  { name: "foreverui-options", caption: "Options window: General (/fui)", lua: 'ns.Options.Show("general")' },
  { name: "foreverui-options-bars", caption: "Options window: Action bars", lua: 'ns.Options.Show("actionbars")' },
  { name: "foreverui-healing", caption: "Options window: Healing", lua: 'ns.Options.Show("healing")' },
  { name: "foreverui-clickcast", caption: "Options window: Click casting (TEST-ONLY bindings)", lua: `
    local CC = ns.GetModule("ClickCast")
    CC.Add("ctrl-BUTTON2", "spell", "TEST-ONLY Renew") CC.Add("shift-BUTTON1", "spell", "TEST-ONLY Shield")
    CC.Add("SHIFT-1", "spell", "TEST-ONLY Flash Heal") CC.Add("MOUSEWHEELUP", "macro", "/cast [@mouseover] TEST-ONLY Heal")
    ns.Options.Show("clickcast")` },
];

for (const scene of SCENES) {
  const addon = createAddon();
  addon.eval(UNITS + ACTIONS + WORLD + GROUP + "GetSpecialization = function() return 1 end");
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
  });
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
await browser.close();
