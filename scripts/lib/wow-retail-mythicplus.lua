-- TEST-ONLY Retail stubs, Mythic+ area (see wow-retail-core.lua for when these run): the key you run and carry,
-- its affixes and its timer, as Blizzard's live docs give them (wow-ui-source, live branch,
-- Blizzard_APIDocumentationGenerated: ChallengeModeInfoDocumentation.lua, MythicPlusInfoDocumentation.lua) and as the
-- game's own key block reads the world timer (Blizzard_ObjectiveTracker). A test sets the world's fields below and
-- fires the event it needs.

local world = __wfgWorld
local stub = __wfgStub

-- world.challengeMaps[mapID] = { name, timeLimit, instance }: the season's dungeons (instance: the dungeon's
-- instance id, GetInstanceInfo's eighth value). world.affixNames[affixID] = the affix's name.
world.challengeMaps, world.affixNames = {}, {}
-- world.key: the key running in your dungeon, { mapID, level, affixes = { ids }, deaths, lost, started } (started:
-- the clock when its timer began), or nil outside one. world.ownedKey: the keystone in your bags, { mapID, level }.
-- world.weekAffixes: this week's affix ids.
world.key, world.ownedKey, world.weekAffixes = nil, nil, {}

-- The world timer kinds (WorldElapsedTimerConstantsDocumentation.lua).
Enum.WorldElapsedTimerTypes = { None = 0, ChallengeMode = 1, ProvingGround = 2 }

-- The world timers running: the key's (id 1) while one runs.
function GetWorldElapsedTimers()
  if world.key then return 1 end
end

-- A world timer's (unused), its seconds run and its kind.
function GetWorldElapsedTime(id)
  if id ~= 1 or not world.key then return 0, 0, 0 end
  if issecretvalue(world.key.started) then return 0, world.key.started, 1 end
  return 0, stub.now - world.key.started, 1
end

-- A challenge map's MapUIInfo: name, id, timeLimit, texture, backgroundTexture, mapID (the instance).
local function mapInfo(mapID)
  local m = world.challengeMaps[mapID]
  if m then return m.name, mapID, m.timeLimit, 0, 0, m.instance end
end

C_ChallengeMode = {
  -- Whether a key runs in your dungeon.
  IsChallengeModeActive = function() return world.key ~= nil end,
  -- The running key's level, affixes and whether it was charged.
  GetActiveKeystoneInfo = function() if world.key then return world.key.level, world.key.affixes or {}, true end return 0, {}, false end,
  -- The running key's challenge map, nil outside one.
  GetActiveChallengeMapID = function() return world.key and world.key.mapID end,
  -- Deaths in the running key and the seconds they cost.
  GetDeathCount = function() local k = world.key or {} return k.deaths or 0, k.lost or 0 end,
  GetMapUIInfo = mapInfo,
  -- The season's challenge maps.
  GetMapTable = function()
    local out = {}
    for id in pairs(world.challengeMaps) do out[#out + 1] = id end
    table.sort(out)
    return out
  end,
  -- An affix's name, description and icon.
  GetAffixInfo = function(id) local name = world.affixNames[id] if name then return name, "", 0 end end,
}

C_MythicPlus = {
  -- The keystone you carry: its level (nil without one) and its challenge map.
  GetOwnedKeystoneLevel = function() return world.ownedKey and world.ownedKey.level end,
  GetOwnedKeystoneChallengeMapID = function() return world.ownedKey and world.ownedKey.mapID end,
  -- This week's affixes, each MythicPlusAffix { id, seasonID }.
  GetCurrentAffixes = function()
    local out = {}
    for _, id in ipairs(world.weekAffixes) do out[#out + 1] = { id = id, seasonID = 15 } end
    return out
  end,
}

-- Starts a key (CHALLENGE_MODE_START fires) or ends it (nil: CHALLENGE_MODE_RESET).
function world.startKey(key)
  world.key = key
  if key then key.started = key.started or stub.now end
  stub.fire(key and "CHALLENGE_MODE_START" or "CHALLENGE_MODE_RESET")
end

-- A piece of game art on a frame, marked so a test can tell it from Vanguard's.
local function art(parent, key, layer)
  local t = parent:CreateTexture(nil, layer or "ARTWORK")
  t:SetTexture("TEST-ONLY-ART")
  if key then parent[key] = t end
  return t
end

-- Builds what Blizzard_ChallengesUI makes (Mainline/Blizzard_ChallengesUI.xml, live branch), with the parts the skin
-- reaches: the Mythic+ tab inside the group finder (its inset and the dungeon's painting) and the keystone window (its
-- backdrop, the art that fades and the art that stays, the close and Start buttons). A test then fires ADDON_LOADED.
function world.loadChallenges()
  local tab = CreateFrame("Frame", "ChallengesFrame", UIParent)
  art(tab, "Background", "BACKGROUND")
  local inset = CreateFrame("Frame", "ChallengesFrameInset", tab)
  inset.NineSlice = CreateFrame("Frame", nil, inset)
  local keystone = CreateFrame("Frame", "ChallengesKeystoneFrame", UIParent)
  art(keystone, nil, "BACKGROUND")
  for _, key in ipairs({ "RuneBG", "InstructionBackground", "Divider", "RunesLarge", "RunesSmall", "SlotBG", "KeystoneFrame" }) do art(keystone, key) end
  keystone.CloseButton, keystone.StartButton = CreateFrame("Button", nil, keystone), CreateFrame("Button", nil, keystone)
  tab:Hide()
  keystone:Hide()
end
