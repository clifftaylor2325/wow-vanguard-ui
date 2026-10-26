-- Small conveniences, each off until you switch it on:
--   * accept summons (one offered in a fight is taken when it ends, if still waiting), and say who
--     summoned you where;
--   * accept resurrections, and say who brought you back;
--   * decline duel requests, and say whose;
--   * faster auto-loot: when the game auto-loots, take every slot at once;
--   * decline guild invites, group invites from strangers and Battle.net friend requests, and say whose
--     (once per sender every few minutes, so repeated asks don't fill chat);
--   * release your spirit at once when you die in a battleground.
-- Each uses the game's own answer to its prompt and closes the prompt.

local ADDON, ns = ...

local L = ns.L

local AA = ns.Module("AutoAccept", { defaults = { summons = false, resurrect = false, duels = false, loot = false, guildInvites = false, strangerGroups = false, friendRequests = false, pvpRelease = false } })

-- Seconds a decline stays quiet after its first chat line, per kind and sender.
AA.QUIET_FOR = 300

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

-- Hides one of the game's own invite windows when it is up (Forever's GuildInviteFrame and
-- LFGInvitePopup, shown with StaticPopupSpecial_Show, not static popups), as its own buttons do;
-- true when it was up.
local function hideInvite(name)
  local frame = _G[name]
  if type(frame) ~= "table" or not frame:IsShown() then return false end
  if type(StaticPopupSpecial_Hide) == "function" then StaticPopupSpecial_Hide(frame) else frame:Hide() end
  return true
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

-- Takes the waiting summon, when the switch is still on, it is still waiting, you are alive and the game
-- would let you (otherwise its prompt stays up), and says from whom and to where.
function AA.AcceptSummon()
  if not AA.settings.summons or not summonWaiting() or not alive() or not canTeleport() then return end
  local who, where = plain(summon("GetSummonConfirmSummoner"), L["someone"]), plain(summon("GetSummonConfirmAreaName"), L["somewhere"])
  summon("ConfirmSummon")
  closePrompt("CONFIRM_SUMMON")
  ns.Chat(ns.Format(L["Accepted a summon from {who} to {place}."], { who = who, place = where }))
end

-- A summon is offered: take it now, or, in a fight, once the fight ends (the game doesn't ask again).
function AA.OnSummon()
  if AA.settings.summons then ns.OutOfCombat(AA.AcceptSummon, "accept summon") end
end

-- Someone offers to resurrect you: accept, and say who.
function AA.OnResurrect(_, who)
  if not AA.settings.resurrect or type(AcceptResurrect) ~= "function" then return end
  AcceptResurrect()
  closePrompt("RESURRECT")
  closePrompt("RESURRECT_NO_SICKNESS")
  closePrompt("RESURRECT_NO_TIMER")
  ns.Chat(ns.Format(L["Accepted a resurrection from {who}."], { who = plain(who, L["someone"]) }))
end

-- When each decline line was last said, by kind and sender.
local said = {}

-- Forgets lines said longer ago than AA.QUIET_FOR, so the table stays small.
local function forgetOld(now)
  for key, at in pairs(said) do
    if now - at >= AA.QUIET_FOR then said[key] = nil end
  end
end

-- Says a decline's chat line once per kind and sender within AA.QUIET_FOR seconds; repeats stay quiet.
local function sayOnce(kind, who, line)
  local key, now = kind .. " " .. who, GetTime()
  forgetOld(now)
  if said[key] then return end
  said[key] = now
  ns.Chat(line)
end

-- Someone asks you to duel: decline, and say who (once in a while per sender).
function AA.OnDuel(_, who)
  if not AA.settings.duels or type(CancelDuel) ~= "function" then return end
  CancelDuel()
  closePrompt("DUEL_REQUESTED")
  who = plain(who, L["someone"])
  sayOnce("duel", who, ns.Format(L["Declined a duel from {who}."], { who = who }))
end

-- Takes one loot slot, unless the game has locked it (an item still being rolled
-- for, or one you may not take); the game's loot window keeps those.
local function takeSlot(slot)
  local locked = select(6, GetLootSlotInfo(slot))
  if not locked then LootSlot(slot) end
end

-- Loot is ready: when the game is auto-looting (its setting, or its key held),
-- take every slot at once, last first, instead of one at a time. A slot that
-- needs a bind-on-pickup answer still brings up the game's prompt.
function AA.OnLootReady(_, autoloot)
  if not AA.settings.loot or not autoloot or type(GetNumLootItems) ~= "function" then return end
  for slot = GetNumLootItems(), 1, -1 do takeSlot(slot) end
end

-- Declines a guild invite. Forever's invite window declines as it hides, so it is only hidden (a
-- second DeclineGuild would answer twice); a client without it gets DeclineGuild and its popup closed.
local function declineGuild()
  if not hideInvite("GuildInviteFrame") then DeclineGuild() end
  closePrompt("GUILD_INVITE")
end

-- Someone invites you to their guild: decline on the next frame, once the game's own handler has
-- shown its window (the order handlers get an event in is the client's), and say who (once in a while).
function AA.OnGuildInvite(_, who)
  if not AA.settings.guildInvites or type(DeclineGuild) ~= "function" then return end
  ns.Soon("decline guild invite", declineGuild)
  who = plain(who, L["someone"])
  sayOnce("guild", who, ns.Format(L["Declined a guild invite from {who}."], { who = who }))
end

-- True when the game can tell the inviter is a friend, a Battle.net friend or in your guild (or hides who).
local function knownPlayer(guid)
  if type(guid) ~= "string" or ns.IsSecret(guid) then return true end
  if C_FriendList and C_FriendList.IsFriend and C_FriendList.IsFriend(guid) then return true end
  if C_BattleNet and C_BattleNet.GetAccountInfoByGUID and C_BattleNet.GetAccountInfoByGUID(guid) then return true end
  return type(IsGuildMember) == "function" and IsGuildMember(guid) and true or false
end

-- Declines a group invite and closes its prompt: the game's popup, or the role popup Forever shows
-- for an invite with roles.
local function declineGroup()
  DeclineGroup()
  hideInvite("LFGInvitePopup")
  closePrompt("PARTY_INVITE")
end

-- Someone invites you to a group: decline unless they are a friend or a guildmate, on the next frame
-- (as for a guild invite, once the game has shown its popup). The payload is name, isTank, isHealer,
-- isDamage, isNativeRealm, allowMultipleRoles, inviterGUID, questSessionActive.
function AA.OnGroupInvite(_, who, _, _, _, _, _, guid)
  if not AA.settings.strangerGroups or type(DeclineGroup) ~= "function" or knownPlayer(guid) then return end
  ns.Soon("decline group invite", declineGroup)
  who = plain(who, L["someone"])
  sayOnce("group", who, ns.Format(L["Declined a group invite from {who}."], { who = who }))
end

-- A Battle.net friend request arrives: decline it (one line in a while: the request carries no name).
function AA.OnFriendRequest(_, inviteID)
  if not AA.settings.friendRequests or type(BNDeclineFriendInvite) ~= "function" then return end
  BNDeclineFriendInvite(inviteID)
  sayOnce("friend", "", L["Declined a Battle.net friend request."])
end

-- Whether you can bring yourself back (a soulstone, Reincarnation): any option the game's death dialog
-- offers (C_DeathInfo.GetSelfResurrectOptions) usable now; an older client without it asks HasSoulstone.
local function canSelfResurrect()
  local options = type(C_DeathInfo) == "table" and C_DeathInfo.GetSelfResurrectOptions
  if type(options) ~= "function" then return type(HasSoulstone) == "function" and HasSoulstone() and true or false end
  for _, option in ipairs(options() or {}) do
    if option.canUse then return true end
  end
  return false
end

-- You die: in a battleground (not an arena, and not when you can bring yourself back) release at once.
function AA.OnDeath()
  if not AA.settings.pvpRelease or type(RepopMe) ~= "function" or select(2, IsInInstance()) ~= "pvp" then return end
  if canSelfResurrect() then return end
  RepopMe()
end

-- Module entry point (Core/Modules.lua): each switch is read when its prompt comes.
function AA.Enable(settings)
  AA.settings = settings
  ns.On("CONFIRM_SUMMON", AA.OnSummon)
  ns.On("RESURRECT_REQUEST", AA.OnResurrect)
  ns.On("DUEL_REQUESTED", AA.OnDuel)
  ns.On("LOOT_READY", AA.OnLootReady)
  ns.On("GUILD_INVITE_REQUEST", AA.OnGuildInvite)
  ns.On("PARTY_INVITE_REQUEST", AA.OnGroupInvite)
  ns.On("BN_FRIEND_INVITE_ADDED", AA.OnFriendRequest)
  ns.On("PLAYER_DEAD", AA.OnDeath)
end
