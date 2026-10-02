-- The game's pop-up alerts in the ForeverUI look, and where they fit:
--   * loss of control (stunned, feared, silenced...): a flat panel with its
--     icon and text in the theme, centered a little above your character;
--   * the talking head (an NPC speaking during a quest): a flat panel at the
--     top center, or hidden if you'd rather not see it.
-- Both stay the game's own frames: ForeverUI restyles them and gives each a
-- spot you can move with /fui unlock (Edit Mode still wins while it's open).

local ADDON, ns = ...

local T = ns.Theme

local GA = ns.Module("GameAlerts", { defaults = { lossOfControl = true, talkingHead = "move" } })

-- Each alert's mover: key, label, default point, and the spot's size.
GA.SPOTS = {
  LossOfControlFrame = { "lossofcontrol", "Loss of control", { "CENTER", "CENTER", 0, 140 }, 256, 58 },
  TalkingHeadFrame = { "talkinghead", "Talking head", { "TOP", "TOP", 0, -90 }, 570, 155 },
}
-- Loss of control's art that's faded (the black band and its red lines).
GA.LOC_ART = { "blackBg", "RedLineTop", "RedLineBottom" }

-- Placing ----------------------------------------------------------------------------------------

-- A movable spot for one of the game's alerts, with the alert kept centered on it.
local function place(name)
  local f, spot = _G[name], GA.SPOTS[name]
  if type(f) ~= "table" or not f.SetPoint then return end
  local holder = CreateFrame("Frame", "ForeverUI_" .. name .. "Spot", UIParent)
  holder:SetSize(spot[4], spot[5])
  ns.Mover(holder, spot[1], spot[2], spot[3])
  ns.Pin(f, function(frame) ns.GetModule("GameTools").Fit(frame, holder, false) end)
end

-- Fades a frame's named art parts.
local function fade(f, keys)
  for _, key in ipairs(keys) do
    if type(f[key]) == "table" and f[key].SetAlpha then f[key]:SetAlpha(0) end
  end
end

-- Loss of control --------------------------------------------------------------------------------

-- Loss of control in the theme: a flat panel, the icon cropped, the ability and time in the theme font.
function GA.SkinLossOfControl(f)
  fade(f, GA.LOC_ART)
  T.HudPanel(f, { alpha = 0.9 })
  if type(f.Icon) == "table" and f.Icon.SetTexCoord then T.Crop(f.Icon) end
  if type(f.AbilityName) == "table" then T.Text(f.AbilityName, "heading", false) end
  local time = f.TimeLeft
  if type(time) ~= "table" then return end
  for _, key in ipairs({ "NumberText", "SecondsText" }) do
    if type(time[key]) == "table" then T.Text(time[key], "label", false) end
  end
end

-- Talking head -----------------------------------------------------------------------------------

-- The talking head in the theme: its parchment faded, a flat panel, the name and text in the theme font.
function GA.SkinTalkingHead(f)
  if type(f.BackgroundFrame) == "table" then f.BackgroundFrame:SetAlpha(0) end
  T.Panel(f, { alpha = 0.92, shadow = true })
  local main = f.MainFrame
  if type(main) ~= "table" then return end
  if type(main.Name) == "table" then T.Text(main.Name, "heading", false) end
  if type(main.Text) == "table" then T.Text(main.Text, "label", false) end
end

-- The talking head, as chosen: moved and restyled, hidden, or left to the game.
local function talkingHead(choice)
  local f = _G.TalkingHeadFrame
  if type(f) ~= "table" or choice == "game" then return end
  if choice == "hide" then return ns.GetModule("DataBars").Suppress("TalkingHeadFrame") end
  GA.SkinTalkingHead(f)
  ns.OutOfCombat(function() place("TalkingHeadFrame") end)
end

-- Module entry point (Core/Modules.lua).
function GA.Enable(settings)
  local loc = _G.LossOfControlFrame
  if settings.lossOfControl and type(loc) == "table" then
    GA.SkinLossOfControl(loc)
    ns.OutOfCombat(function() place("LossOfControlFrame") end)
  end
  talkingHead(settings.talkingHead)
end
