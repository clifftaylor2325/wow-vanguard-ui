-- Small conveniences, each off until you switch it on:
--   * accept summons (one offered in a fight is taken when it ends, if still waiting), and say who
--     summoned you where;
--   * accept resurrections, and say who brought you back;
--   * faster auto-loot: when the game auto-loots, take every slot at once.
-- Each uses the game's own answer to its prompt and closes the prompt. The declines (duels, invites, friend
-- requests) and the battleground release are Quiet the game's (Modules/QuietDeclines.lua).

local ADDON, ns = ...

local L = ns.L

local AA = ns.Module("AutoAccept", { defaults = { summons = false, resurrect = false, loot = false } })

-- Calls a function from C_SummonInfo, else the global of that name; nil when neither exists.
local function summon(name, ...)
  local fn = C_SummonInfo and C_SummonInfo[name]
  if type(fn) ~= "function" then fn = _G[name] end
  if type(fn) == "function" then return fn(...) end
end

-- Closes one of the game's prompts, where it can.
local function closePrompt(which)
  if type(StaticPopup_Hide) == "function" then StaticPopup_Hide(which) end
end

-- A name or place the client may hide: plain text, else a stand-in.
local function plain(text, fallback)
  if type(text) == "string" and not ns.IsSecret(text) then return text end
  return fallback
end

-- Whether the game lets you take a summon now (PlayerCanTeleport, which its own Accept button waits on);
-- true on a client without it.
local function canTeleport()
  return type(PlayerCanTeleport) ~= "function" or PlayerCanTeleport() == true
end

-- Whether the summon is still waiting: its time left (a plain number; a hidden one counts as gone), or, on a
-- client without that call, a summoner still named.
local function summonWaiting()
  local left = summon("GetSummonConfirmTimeLeft")
  if left == nil then return summon("GetSummonConfirmSummoner") ~= nil end
  return (ns.PlainNumber(left) or 0) > 0
end

-- Whether you are alive, so a summon can take you (a hidden answer counts as not).
local function alive()
  local dead = UnitIsDeadOrGhost("player")
  return not ns.IsSecret(dead) and not dead
end

-- Whether the summon takes you out of a starting area, which the game asks you about with a prompt of its
-- own (read when deciding, so a summon held until the fight ends is checked too); a client without the call
-- or a hidden answer counts as no.
local function leavesStart()
  return ns.IsTrue(summon("IsSummonSkippingStartExperience"))
end

-- Closes every kind of summon prompt the game shows (the plain, scenario and starting-area ones).
local function closeSummonPrompts()
  if type(HideSummonConfirmationDialogs) == "function" then return HideSummonConfirmationDialogs() end
  closePrompt("CONFIRM_SUMMON")
  closePrompt("CONFIRM_SUMMON_SCENARIO")
  closePrompt("CONFIRM_SUMMON_STARTING_AREA")
end

-- Takes the waiting summon, when the switch is still on, it is still waiting, you are alive and the game
-- would let you (otherwise its prompt stays up, as it does for a summon out of a starting area, which is
-- yours to decide), and says from whom and to where.
function AA.AcceptSummon()
  if not AA.settings.summons or not summonWaiting() or not alive() or not canTeleport() or leavesStart() then return end
  local who, where = plain(summon("GetSummonConfirmSummoner"), L["someone"]), plain(summon("GetSummonConfirmAreaName"), L["somewhere"])
  summon("ConfirmSummon")
  closeSummonPrompts()
  ns.Chat(ns.Format(L["Accepted a summon from {who} to {place}."], { who = who, place = where }))
end

-- A summon is offered: take it now, or, in a fight, once the fight ends (the game doesn't ask again).
function AA.OnSummon()
  if AA.settings.summons then ns.OutOfCombat(AA.AcceptSummon, "accept summon") end
end

-- Whether the game still makes you wait before you may come back (its prompt keeps Accept off until the
-- corpse-recovery delay is over); a hidden answer or a client without the call counts as no wait.
local function mustWait()
  return (ns.PlainNumber(ns.CallIf(_G, "GetCorpseRecoveryDelay")) or 0) > 0
end

-- Someone offers to resurrect you: accept, and say who. During the corpse-recovery delay the game's own
-- prompt stays up with its countdown, for you to accept when it unlocks.
function AA.OnResurrect(_, who)
  if not AA.settings.resurrect or type(AcceptResurrect) ~= "function" or mustWait() then return end
  AcceptResurrect()
  closePrompt("RESURRECT")
  closePrompt("RESURRECT_NO_SICKNESS")
  closePrompt("RESURRECT_NO_TIMER")
  ns.Chat(ns.Format(L["Accepted a resurrection from {who}."], { who = plain(who, L["someone"]) }))
end

-- Takes one loot slot, unless the game has locked it (an item still being rolled
-- for, or one you may not take); the game's loot window keeps those.
local function takeSlot(slot)
  local locked = select(6, GetLootSlotInfo(slot))
  if not locked then LootSlot(slot) end
end

-- Whether the group's loot goes through a master looter: the game's own loot window must pick those items,
-- as its assign menu reads what was clicked (a slot taken from here would open it on no item, or a stale one).
local function masterLoot()
  local method = ns.CallIf(C_PartyInfo, "GetLootMethod")
  local methods = type(Enum) == "table" and Enum.LootMethod
  return methods and not ns.IsSecret(method) and method == methods.Masterlooter
end

-- Loot is ready: when the game is auto-looting (its setting, or its key held),
-- take every slot at once, last first, instead of one at a time. A slot that
-- needs a bind-on-pickup answer still brings up the game's prompt. Under master loot the game's window is left
-- alone (its own auto-loot still takes what is under the threshold).
function AA.OnLootReady(_, autoloot)
  if not AA.settings.loot or not autoloot or type(GetNumLootItems) ~= "function" or masterLoot() then return end
  for slot = GetNumLootItems(), 1, -1 do takeSlot(slot) end
end

-- Module entry point (Core/Modules.lua): each switch is read when its prompt comes.
function AA.Enable(settings)
  AA.settings = settings
  ns.On("CONFIRM_SUMMON", AA.OnSummon)
  ns.On("RESURRECT_REQUEST", AA.OnResurrect)
  ns.On("LOOT_READY", AA.OnLootReady)
end
