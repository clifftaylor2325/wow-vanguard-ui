-- Chat bubbles (the speech bubbles over heads in the world) in the Vanguard
-- look: each bubble's rounded art is faded and a flat panel (the chat's own
-- material: no sheen, no shadow) is drawn behind its text, which takes the
-- theme font; with Text-only bubbles on, no panel at all, the text floating
-- over the speaker. The engine makes the bubbles; this module only skins
-- them, a moment after each chat message that can raise one, and never
-- inside an instance, where the engine keeps them from addons.

local ADDON, ns = ...

local T = ns.Theme

local CB = ns.Module("ChatBubbles", { defaults = { textOnly = false } })

-- The bubble panel's fill opacity: the flat panel behind the text.
CB.ALPHA = 0.94

-- Bubbles already dressed (Core/Events.lua, ns.FrameState): the engine reuses its bubble frames.
local vgBubble = ns.FrameState("vgBubble")

-- The chat events that can raise a bubble: say and yell, party and raid lines (the game's Party and Raid
-- Chat Bubbles options), and the NPC kinds.
CB.EVENTS = { "CHAT_MSG_SAY", "CHAT_MSG_YELL", "CHAT_MSG_PARTY", "CHAT_MSG_PARTY_LEADER", "CHAT_MSG_RAID", "CHAT_MSG_RAID_LEADER", "CHAT_MSG_MONSTER_SAY", "CHAT_MSG_MONSTER_YELL", "CHAT_MSG_MONSTER_PARTY" }
-- How long after a message the bubbles are looked at: the engine makes the bubble on a later frame.
CB.DELAY = 0.05

-- Whether bubbles can be skinned now: the client lists them, and the player is not in an instance.
local function allowed()
  if type(C_ChatBubbles) ~= "table" or type(C_ChatBubbles.GetAllChatBubbles) ~= "function" then return false end
  if type(IsInInstance) ~= "function" then return true end
  local inside = IsInInstance()
  return not ns.IsSecret(inside) and inside ~= true
end

-- The bubble's text: the panel's String (the key the game's template gives it), else the one font string
-- among its regions.
local function bubbleText(panel)
  local fs = panel.String
  if type(fs) == "table" and type(fs.SetFont) == "function" then return fs end
  for _, region in ipairs({ panel:GetRegions() }) do
    if type(region.GetObjectType) == "function" and region:GetObjectType() == "FontString" then return region end
  end
end

-- The bubble's panel (the one child frame holding its art and text): art faded, a flat panel behind
-- (none with Text-only bubbles on), the text in the chat role.
local function dressBubble(panel)
  T.FadeRegions(panel)
  if not CB.settings.textOnly then T.Panel(panel, { alpha = CB.ALPHA, noSheen = true }) end
  local text = bubbleText(panel)
  if text then T.Text(text, "chat") end
end

-- Whether a frame is one addons may touch (a forbidden frame, an instance's bubble or its panel, raises on most calls).
local function touchable(frame)
  return type(frame) == "table" and not (type(frame.IsForbidden) == "function" and frame:IsForbidden())
end

-- Dresses one bubble, once, when it and its panel are frames addons may touch.
local function skinBubble(bubble)
  if type(bubble) ~= "table" or vgBubble[bubble] or type(bubble.GetChildren) ~= "function" or not touchable(bubble) then return end
  local panel = bubble:GetChildren()
  if not touchable(panel) or type(panel.GetRegions) ~= "function" then return end
  vgBubble[bubble] = true
  dressBubble(panel)
end

-- Every bubble the engine has now, when bubbles may be skinned.
function CB.SkinAll()
  CB.waiting = false
  if not allowed() then return end
  for _, bubble in ipairs(C_ChatBubbles.GetAllChatBubbles()) do skinBubble(bubble) end
end

-- A message that can raise a bubble: look at the bubbles shortly, once per burst of messages.
local function onMessage()
  if CB.waiting or type(C_Timer) ~= "table" or type(C_Timer.After) ~= "function" then return end
  CB.waiting = true
  C_Timer.After(CB.DELAY, ns.Guard("timer chat bubbles", CB.SkinAll))
end

-- Module entry point (Core/Modules.lua): on a client that lists its bubbles, watches the chat events.
function CB.Enable(settings)
  CB.settings = settings
  if type(C_ChatBubbles) ~= "table" then return end
  for _, event in ipairs(CB.EVENTS) do ns.On(event, onMessage) end
end
