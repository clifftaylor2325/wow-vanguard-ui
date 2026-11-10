-- Quiet the game, its declines (Modules/Quiet.lua is the module; each off until you switch it on): decline duel
-- requests, guild invites, group invites from strangers and Battle.net friend requests, and say whose (once per
-- sender every few minutes, so repeated asks don't fill chat); release your spirit at once when you die in a
-- battleground. Each uses the game's own answer to its prompt and closes the prompt.

local ADDON, ns = ...

local L = ns.L

local QU = ns.GetModule("Quiet")

-- Seconds a decline stays quiet after its first chat line, per kind and sender.
QU.QUIET_FOR = 300

-- Closes one of the game's prompts, where it can.
local function closePrompt(which)
  if type(StaticPopup_Hide) == "function" then StaticPopup_Hide(which) end
end

-- Hides one of the game's own windows when it is up (the invite windows are shown with
-- StaticPopupSpecial_Show, not as static popups), as its own buttons do; true when it was up.
local function hideFrame(frame)
  if type(frame) ~= "table" or not frame.IsShown or not frame:IsShown() then return false end
  if type(StaticPopupSpecial_Hide) == "function" then StaticPopupSpecial_Hide(frame) else frame:Hide() end
  return true
end

-- Hides one of the game's own invite windows by its global name (Forever's GuildInviteFrame and
-- LFGInvitePopup); true when it was up.
local function hideInvite(name)
  return hideFrame(_G[name])
end

-- A name the client may hide: plain text, else "someone".
local function sender(text)
  if type(text) == "string" and not ns.IsSecret(text) then return text end
  return L["someone"]
end

-- When each decline line was last said, by kind and sender.
local said = {}

-- Forgets lines said longer ago than QU.QUIET_FOR, so the table stays small.
local function forgetOld(now)
  for key, at in pairs(said) do
    if now - at >= QU.QUIET_FOR then said[key] = nil end
  end
end

-- Says a decline's chat line once per kind and sender within QU.QUIET_FOR seconds; repeats stay quiet.
local function sayOnce(kind, who, line)
  local key, now = kind .. " " .. who, GetTime()
  forgetOld(now)
  if said[key] then return end
  said[key] = now
  ns.Chat(line)
end

-- Someone asks you to duel (to the death too, on Hardcore realms): decline, and say who (once in a while per sender).
function QU.OnDuel(event, who)
  if not QU.Switched("duels") or type(CancelDuel) ~= "function" then return end
  CancelDuel()
  closePrompt(event)
  who = sender(who)
  sayOnce("duel", who, ns.Format(L["Declined a duel from {who}."], { who = who }))
end

-- Declines a guild invite. Forever's invite window declines as it hides, so it is only hidden (a
-- second DeclineGuild would answer twice); a client without it gets DeclineGuild and its popup closed.
local function declineGuild()
  if not hideInvite("GuildInviteFrame") then DeclineGuild() end
  closePrompt("GUILD_INVITE")
end

-- Someone invites you to their guild: decline on the next frame, once the game's own handler has
-- shown its window (the order handlers get an event in is the client's), and say who (once in a while).
function QU.OnGuildInvite(_, who)
  if not QU.Switched("guildInvites") or type(DeclineGuild) ~= "function" then return end
  ns.Soon("decline guild invite", declineGuild)
  who = sender(who)
  sayOnce("guild", who, ns.Format(L["Declined a guild invite from {who}."], { who = who }))
end

-- True when the game can tell the inviter is a friend, a Battle.net friend or in your guild (or hides who).
local function knownPlayer(guid)
  if type(guid) ~= "string" or ns.IsSecret(guid) then return true end
  if C_FriendList and C_FriendList.IsFriend and C_FriendList.IsFriend(guid) then return true end
  if C_BattleNet and C_BattleNet.GetAccountInfoByGUID and C_BattleNet.GetAccountInfoByGUID(guid) then return true end
  return type(IsGuildMember) == "function" and IsGuildMember(guid) and true or false
end

-- Seconds a player you whispered counts as known for a group invite (groups here form by whispering strangers).
QU.WHISPERED_FOR = 600

-- When you last whispered each player, by name without its realm, in lower case.
local whispered = {}

-- A player's name as both events' key: without the realm, in lower case; nil for a hidden or empty one.
local function nameKey(name)
  local plain = ns.PlainText(name)
  local short = plain and plain:match("^[^-]+")
  return short and short:lower()
end

-- Forgets the whispers older than QU.WHISPERED_FOR, so the table stays small.
local function forgetWhispers(now)
  for key, at in pairs(whispered) do
    if now - at >= QU.WHISPERED_FOR then whispered[key] = nil end
  end
end

-- You whispered someone (CHAT_MSG_WHISPER_INFORM: the text, then the player you wrote to): noted while the
-- stranger-invite switch is on, so the invite you just asked for is not declined.
function QU.OnWhisperSent(_, _, target)
  local key = QU.Switched("strangerGroups") and nameKey(target)
  if not key then return end
  forgetWhispers(GetTime())
  whispered[key] = GetTime()
end

-- Whether you whispered this player within QU.WHISPERED_FOR seconds.
local function whisperedLately(who)
  local at = whispered[nameKey(who) or false]
  return at ~= nil and GetTime() - at < QU.WHISPERED_FOR
end

-- Declines a group invite and closes its prompt: the game's popup, the role popup Forever shows for an
-- invite with roles, or Retail's Party Sync dialog for an invite that carries a quest session (it would
-- stay up for a minute with its Accept answering an invite already declined).
local function declineGroup()
  DeclineGroup()
  hideInvite("LFGInvitePopup")
  local sessions = _G.QuestSessionManager
  hideFrame(type(sessions) == "table" and sessions.ConfirmInviteToGroupReceivedDialog or nil)
  closePrompt("PARTY_INVITE")
end

-- Someone invites you to a group: decline unless they are a friend, a guildmate or someone you whispered in the
-- last ten minutes, on the next frame
-- (as for a guild invite, once the game has shown its popup). The payload is name, isTank, isHealer,
-- isDamage, isNativeRealm, allowMultipleRoles, inviterGUID, questSessionActive.
function QU.OnGroupInvite(_, who, _, _, _, _, _, guid)
  if not QU.Switched("strangerGroups") or type(DeclineGroup) ~= "function" then return end
  if knownPlayer(guid) or whisperedLately(who) then return end
  ns.Soon("decline group invite", declineGroup)
  who = sender(who)
  sayOnce("group", who, ns.Format(L["Declined a group invite from {who}."], { who = who }))
end

-- A Battle.net friend request arrives: decline it (one line in a while: the request carries no name).
function QU.OnFriendRequest(_, inviteID)
  if not QU.Switched("friendRequests") or type(BNDeclineFriendInvite) ~= "function" then return end
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
function QU.OnDeath()
  if not QU.Switched("pvpRelease") or type(RepopMe) ~= "function" or select(2, IsInInstance()) ~= "pvp" then return end
  if canSelfResurrect() then return end
  RepopMe()
end

-- Listens for the prompts the declines answer (from QU.Enable); each switch is read when its prompt comes, while
-- the module is on.
function QU.ListenForPrompts()
  ns.On("DUEL_REQUESTED", QU.OnDuel)
  if ns.IsForever() then ns.On("DUEL_TO_THE_DEATH_REQUESTED", QU.OnDuel) end
  ns.On("GUILD_INVITE_REQUEST", QU.OnGuildInvite)
  ns.On("PARTY_INVITE_REQUEST", QU.OnGroupInvite)
  ns.On("CHAT_MSG_WHISPER_INFORM", QU.OnWhisperSent)
  ns.On("BN_FRIEND_INVITE_ADDED", QU.OnFriendRequest)
  ns.On("PLAYER_DEAD", QU.OnDeath)
end
