-- The game's pop-up alerts in the Vanguard look, and where they fit:
--   * loss of control (stunned, feared, silenced...): a flat panel with its
--     icon and text in the theme, centered a little above your character;
--   * the talking head (an NPC speaking during a quest): a flat panel at the
--     top center, or hidden if you'd rather not see it;
--   * the raid warning frame's lines in the theme font at the game's size, and
--     Hardcore death notices (the game shows them in that frame) in the theme
--     title font and its red; the centre-screen status line (screenshots) and
--     the frame rate readout in the theme font too (font only, at the game's size);
--   * a rare nearby (off until switched on): a sound and one chat line when a
--     rare's mark comes onto the minimap, out of combat, once per rare.
-- Both stay the game's own frames: Vanguard restyles them and gives each a
-- spot you can move with /vg unlock (Edit Mode still wins while it's open).

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgDeath = ns.FrameState("vgDeath")

local T = ns.Theme

local GA = ns.Module("GameAlerts", { defaults = { lossOfControl = true, talkingHead = "move", hardcore = true, rares = false } })

-- Each alert's mover: key, label, default point, and the spot's size.
GA.SPOTS = {
  LossOfControlFrame = { "lossofcontrol", "Loss of control", { "CENTER", "CENTER", 0, 140 }, 256, 58 },
  TalkingHeadFrame = { "talkinghead", "Talking head", { "TOP", "TOP", 0, -90 }, 570, 155 },
}
-- Loss of control's art that's hidden (the black band and its red lines).
GA.LOC_ART = { "blackBg", "RedLineTop", "RedLineBottom" }

-- Placing ----------------------------------------------------------------------------------------

-- A movable spot for one of the game's alerts, with the alert kept centered on it.
local function place(name)
  local f, spot = _G[name], GA.SPOTS[name]
  if type(f) ~= "table" or not f.SetPoint then return end
  local holder = CreateFrame("Frame", "Vanguard_" .. name .. "Spot", UIParent)
  holder:SetSize(spot[4], spot[5])
  ns.Mover(holder, spot[1], spot[2], spot[3])
  ns.Pin(f, function(frame) ns.GetModule("GameTools").Fit(frame, holder, false) end)
end

-- Hides a frame's named art parts. Hidden, not faded: the frame's own
-- animation and alpha handling would bring a faded texture back.
local function hide(f, keys)
  for _, key in ipairs(keys) do
    if type(f[key]) == "table" and f[key].Hide then f[key]:Hide() end
  end
end

-- Loss of control --------------------------------------------------------------------------------

-- Loss of control in the theme: a flat panel, the icon cropped, the ability and time in the theme font.
function GA.SkinLossOfControl(f)
  hide(f, GA.LOC_ART)
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

-- The talking head, as chosen: moved and restyled, hidden, or left to the game. Done once at login:
-- on the 12.x engine the frame is part of the base UI (Blizzard_FrameXML), there from the start.
local function talkingHead(choice)
  local f = _G.TalkingHeadFrame
  if type(f) ~= "table" or choice == "game" then return end
  if choice == "hide" then return ns.GetModule("DataBars").Suppress("TalkingHeadFrame") end
  GA.SkinTalkingHead(f)
  ns.OutOfCombat(function() place("TalkingHeadFrame") end)
end

-- Fonts and Hardcore death notices ----------------------------------------------------------

-- The game's size for a raid warning line (GameFontNormalHuge); the game scales it from there as the line comes and goes.
GA.WARNING_SIZE = 20
-- The status texts the game draws in a font of its own: frame name -> font string key -> { the game's size, bold }.
-- The screenshot line (ActionStatus, GameFontNormalLarge) and the frame rate readout (FramerateFrame, SystemFont_Shadow_Med1).
GA.STATUS_TEXTS = { ActionStatus = { Text = { 16, true } }, FramerateFrame = { Label = { 12 }, FramerateText = { 12 } } }

-- Puts the theme font on a font string at the game's size (before Text size) and weight; its colour stays as the game has it.
-- Anything that is not a font string is left alone.
function GA.SetFont(fs, size, bold)
  if type(fs) ~= "table" or type(fs.SetFont) ~= "function" then return end
  local path, outline = T.Font(bold)
  fs:SetFont(path, T.ScaledSize(size), outline)
end

-- The screenshot status line and the frame rate readout in the theme font, now and after every theme change (a font or
-- Text size change); a frame the client lacks is skipped.
function GA.ThemeStatusText()
  for name, parts in pairs(GA.STATUS_TEXTS) do
    for key, spec in pairs(parts) do
      GA.SetFont(type(_G[name]) == "table" and _G[name][key], spec[1], spec[2])
    end
  end
  if not GA.watchingTheme then GA.watchingTheme = true T.OnChanged(GA.ThemeStatusText) end
end

-- The raid warning frame's newest message (the game numbers them as they come).
local function newestWarning(frame)
  local newest
  for _, fs in ipairs(frame:GetSortedMessages()) do
    if not newest or (fs.messageOrder or 0) > (newest.messageOrder or 0) then newest = fs end
  end
  return newest
end

-- A message was added: its line (the game reuses them, so also one that showed a death notice before) takes the theme
-- font at the game's size and is no longer a death notice.
function GA.OnWarning(frame)
  local fs = newestWarning(frame)
  if not fs then return end
  vgDeath[fs] = nil
  GA.SetFont(fs, GA.WARNING_SIZE, true)
end

-- The game showed a Hardcore death notice: it takes the theme's title font and its red (the
-- game still grows the line to its own height as it fades in).
function GA.OnWarningEvent(frame, event)
  local fs = event == "HARDCORE_DEATHS" and newestWarning(frame)
  if not fs then return end
  vgDeath[fs] = true
  T.ApplyRole(fs, "title")
  T.Color(fs, "bad")
end

-- Restyles the game's raid warning lines (every message), and with deaths set its Hardcore death notices
-- (HARDCORE_DEATHS, shown by the same frame). Post-hooks only: the game's own AddMessage and OnEvent still run.
local function watchWarnings(deaths)
  local f = _G.RaidWarningFrame
  if type(f) ~= "table" or type(f.GetSortedMessages) ~= "function" or type(hooksecurefunc) ~= "function" then return end
  hooksecurefunc(f, "AddMessage", ns.Guard("hook AddMessage", GA.OnWarning))
  if deaths then f:HookScript("OnEvent", GA.OnWarningEvent) end
end

-- Rares nearby -----------------------------------------------------------------------------------

-- Minimap marks of rares (and rare elites); treasures and the rest have others.
GA.RARE_ATLAS = { VignetteKill = true, VignetteKillElite = true }
-- The rares already announced this session, by their mark's GUID.
GA.seenRares = {}

-- The rare a minimap mark shows (its name), or nil for another mark, a dead one or a hidden one.
function GA.RareName(guid)
  local info = C_VignetteInfo.GetVignetteInfo(guid)
  if type(info) ~= "table" or ns.IsSecret(info.atlasName) or ns.IsSecret(info.name) then return nil end
  if GA.RARE_ATLAS[info.atlasName] and info.isDead ~= true then return info.name end
end

-- A mark came onto (or left) the minimap: a rare's, out of combat and new, is announced.
function GA.OnVignette(_, guid, onMinimap)
  if not GA.settings.rares or onMinimap ~= true or ns.IsSecret(guid) or GA.seenRares[guid] or ns.InCombat() then return end
  local name = GA.RareName(guid)
  if not name then return end
  GA.seenRares[guid] = true
  PlaySound(SOUNDKIT.RAID_WARNING)
  ns.Chat("Rare nearby: " .. name)
end

-- Module entry point (Core/Modules.lua).
function GA.Enable(settings)
  GA.settings = settings
  if type(C_VignetteInfo) == "table" then ns.On("VIGNETTE_MINIMAP_UPDATED", GA.OnVignette) end
  watchWarnings(settings.hardcore)
  GA.ThemeStatusText()
  local loc = _G.LossOfControlFrame
  if settings.lossOfControl and type(loc) == "table" then
    GA.SkinLossOfControl(loc)
    ns.OutOfCombat(function() place("LossOfControlFrame") end)
  end
  talkingHead(settings.talkingHead)
end
