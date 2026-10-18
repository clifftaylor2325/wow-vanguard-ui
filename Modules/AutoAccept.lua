-- Small conveniences, each off until you switch it on:
--   * accept summons (out of combat), and say who summoned you where;
--   * accept resurrections, and say who brought you back;
--   * decline duel requests, and say whose;
--   * faster auto-loot: when the game auto-loots, take every slot at once;
--   * decline guild invites, group invites from strangers and Battle.net friend requests, and say whose;
--   * release your spirit at once when you die in a battleground.
-- Each uses the game's own answer to its prompt and closes the prompt.

local ADDON, ns = ...

local AA = ns.Module("AutoAccept", { defaults = { summons = false, resurrect = false, duels = false, loot = false, guildInvites = false, strangerGroups = false, friendRequests = false, pvpRelease = false } })

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
  closePrompt("RESURRECT_NO_TIMER")
  ns.Chat("Accepted a resurrection from " .. plain(who, "someone") .. ".")
end

-- Someone asks you to duel: decline, and say who.
function AA.OnDuel(_, who)
  if not AA.settings.duels or type(CancelDuel) ~= "function" then return end
  CancelDuel()
  closePrompt("DUEL_REQUESTED")
  ns.Chat("Declined a duel from " .. plain(who, "someone") .. ".")
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

-- Someone invites you to their guild: decline, and say who.
function AA.OnGuildInvite(_, who)
  if not AA.settings.guildInvites or type(DeclineGuild) ~= "function" then return end
  DeclineGuild()
  closePrompt("GUILD_INVITE")
  ns.Chat("Declined a guild invite from " .. plain(who, "someone") .. ".")
end

-- True when the game can tell the inviter is a friend, a Battle.net friend or in your guild (or hides who).
local function knownPlayer(guid)
  if type(guid) ~= "string" or ns.IsSecret(guid) then return true end
  if C_FriendList and C_FriendList.IsFriend and C_FriendList.IsFriend(guid) then return true end
  if C_BattleNet and C_BattleNet.GetAccountInfoByGUID and C_BattleNet.GetAccountInfoByGUID(guid) then return true end
  return type(IsGuildMember) == "function" and IsGuildMember(guid) and true or false
end

-- Someone invites you to a group: decline unless they are a friend or a guildmate.
function AA.OnGroupInvite(_, who, _, _, _, _, _, _, guid)
  if not AA.settings.strangerGroups or type(DeclineGroup) ~= "function" or knownPlayer(guid) then return end
  DeclineGroup()
  closePrompt("PARTY_INVITE")
  ns.Chat("Declined a group invite from " .. plain(who, "someone") .. ".")
end

-- A Battle.net friend request arrives: decline it.
function AA.OnFriendRequest(_, inviteID)
  if not AA.settings.friendRequests or type(BNDeclineFriendInvite) ~= "function" then return end
  BNDeclineFriendInvite(inviteID)
  ns.Chat("Declined a Battle.net friend request.")
end

-- You die: in a battleground (not an arena, and not with a soulstone to use) release at once.
function AA.OnDeath()
  if not AA.settings.pvpRelease or type(RepopMe) ~= "function" or select(2, IsInInstance()) ~= "pvp" then return end
  if type(HasSoulstone) == "function" and HasSoulstone() then return end
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
