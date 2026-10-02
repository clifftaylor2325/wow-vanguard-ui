-- Small conveniences, each off until you switch it on:
--   * accept summons (out of combat), and say who summoned you where;
--   * accept resurrections, and say who brought you back;
--   * decline duel requests, and say whose.
-- Each uses the game's own answer to its prompt and closes the prompt.

local ADDON, ns = ...

local AA = ns.Module("AutoAccept", { defaults = { summons = false, resurrect = false, duels = false } })

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

-- A summon is waiting: accept it (not in combat) and say from whom and to where.
function AA.OnSummon()
  if not AA.settings.summons or ns.InCombat() then return end
  local who, where = plain(summon("GetSummonConfirmSummoner"), "someone"), plain(summon("GetSummonConfirmAreaName"), "somewhere")
  summon("ConfirmSummon")
  closePrompt("CONFIRM_SUMMON")
  ns.Chat(string.format("Accepted a summon from %s to %s.", who, where))
end

-- Someone offers to resurrect you: accept, and say who.
function AA.OnResurrect(_, who)
  if not AA.settings.resurrect or type(AcceptResurrect) ~= "function" then return end
  AcceptResurrect()
  closePrompt("RESURRECT")
  closePrompt("RESURRECT_NO_SICKNESS")
  ns.Chat("Accepted a resurrection from " .. plain(who, "someone") .. ".")
end

-- Someone asks you to duel: decline, and say who.
function AA.OnDuel(_, who)
  if not AA.settings.duels or type(CancelDuel) ~= "function" then return end
  CancelDuel()
  closePrompt("DUEL_REQUESTED")
  ns.Chat("Declined a duel from " .. plain(who, "someone") .. ".")
end

-- Module entry point (Core/Modules.lua): each switch is read when its prompt comes.
function AA.Enable(settings)
  AA.settings = settings
  ns.On("CONFIRM_SUMMON", AA.OnSummon)
  ns.On("RESURRECT_REQUEST", AA.OnResurrect)
  ns.On("DUEL_REQUESTED", AA.OnDuel)
end
