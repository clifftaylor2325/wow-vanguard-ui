-- Chat bubbles (the speech bubbles over heads in the world) in the Vanguard
-- look: each bubble's rounded art is faded and a flat tooltip-style panel is
-- drawn behind its text, which takes the theme font. The engine makes the
-- bubbles; this module only skins them, a moment after each chat message
-- that can raise one, and never inside an instance, where the engine keeps
-- them from addons.

local ADDON, ns = ...

local T = ns.Theme

local CB = ns.Module("ChatBubbles", { defaults = {} })

-- Bubbles already dressed (Core/Events.lua, ns.FrameState): the engine reuses its bubble frames.
local vgBubble = ns.FrameState("vgBubble")

-- The chat events that can raise a bubble.
CB.EVENTS = { "CHAT_MSG_SAY", "CHAT_MSG_YELL", "CHAT_MSG_PARTY", "CHAT_MSG_PARTY_LEADER", "CHAT_MSG_MONSTER_SAY", "CHAT_MSG_MONSTER_YELL", "CHAT_MSG_MONSTER_PARTY" }
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

-- The bubble's panel (the one child frame holding its art and text): art faded, a tooltip panel behind, the text in the chat role.
local function dressBubble(panel)
  T.FadeRegions(panel)
  T.Tooltip(panel)
  local text = bubbleText(panel)
  if text then T.Text(text, "chat") end
end

-- Dresses one bubble, once, when it is a frame addons may touch and it has its panel.
local function skinBubble(bubble)
  if type(bubble) ~= "table" or vgBubble[bubble] or type(bubble.GetChildren) ~= "function" then return end
  if type(bubble.IsForbidden) == "function" and bubble:IsForbidden() then return end
  local panel = bubble:GetChildren()
  if type(panel) ~= "table" or type(panel.GetRegions) ~= "function" then return end
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
function CB.Enable()
  if type(C_ChatBubbles) ~= "table" then return end
  for _, event in ipairs(CB.EVENTS) do ns.On(event, onMessage) end
end
