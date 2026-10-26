-- The game's pop-up alerts in the Vanguard look, and where they fit:
--   * loss of control (stunned, feared, silenced...): a flat panel with its
--     icon and text in the theme, centered a little above your character;
--   * the talking head (an NPC speaking during a quest): a flat panel at the
--     top left under the raid tools, or hidden if you'd rather not see it;
--   * the raid warning frame's lines in the theme font at the game's size, and
--     Hardcore death notices (the game shows them in that frame) in the theme
--     title font and its red; the centre-screen status line (screenshots) and
--     the frame rate readout in the theme font too (font only, at the game's size);
--   * a rare nearby (off until switched on): a sound and one chat line when a
--     rare's mark comes onto the minimap, out of combat, once per rare;
--   * a low-health vignette (off until switched on): a soft tint round the screen
--     edge that strengthens as your health drops. The client works out its strength
--     from your health through a curve, so it is never compared in Lua (health is
--     hidden in some fights); it is static, with no pulse and no fade.
-- Both stay the game's own frames: Vanguard restyles them and gives each a
-- spot you can move with /vg unlock (Edit Mode still wins while it's open).

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgDeath = ns.FrameState("vgDeath")

local T = ns.Theme
local L = ns.L

local GA = ns.Module("GameAlerts", { defaults = { lossOfControl = true, talkingHead = "move", hardcore = true, rares = false, vignette = false } })

-- Each alert's mover: key, label, default point, and the spot's size. Loss of control sits a little above your
-- character, under the Instance prep card; the talking head at the top left under the raid tools and main tanks,
-- clear of the quest arrow, chat alert and boss timers in the top centre.
GA.SPOTS = {
  LossOfControlFrame = { "lossofcontrol", L["Loss of control"], { "CENTER", "CENTER", 0, 96 }, 256, 58 },
  TalkingHeadFrame = { "talkinghead", L["Talking head"], { "TOPLEFT", "TOPLEFT", 186, -126 }, 570, 155 },
}
-- Loss of control's art that's hidden (the black band and its red lines).
GA.LOC_ART = { "blackBg", "RedLineTop", "RedLineBottom" }

-- Placing ----------------------------------------------------------------------------------------

-- A movable spot for one of the game's alerts, with the alert kept centered on it.
local function place(name)
  local tools = ns.GetModule("GameTools")
  tools.PlaceSpot(name, GA.SPOTS[name], tools.FitCenter)
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
  if type(info) ~= "table" or ns.IsSecret(info.atlasName) or ns.IsSecret(info.name) or ns.IsSecret(info.isDead) then
    return nil
  end
  if GA.RARE_ATLAS[info.atlasName] and info.isDead ~= true then return info.name end
end

-- A mark came onto (or left) the minimap: a rare's, out of combat and new, is announced.
function GA.OnVignette(_, guid, onMinimap)
  if not GA.settings.rares or onMinimap ~= true or ns.IsSecret(guid) or GA.seenRares[guid] or ns.InCombat() then return end
  local name = GA.RareName(guid)
  if not name then return end
  GA.seenRares[guid] = true
  PlaySound(SOUNDKIT.RAID_WARNING)
  ns.Chat(ns.Format(L["Rare nearby: {name}"], { name = name }))
end

-- Low-health vignette ----------------------------------------------------------------------------

-- Health (0 = empty, 1 = full) and the vignette's strength there: full at 0, gone from half health up.
GA.VIGNETTE_CURVE = { { 0, 0.6 }, { 0.2, 0.4 }, { 0.5, 0 }, { 1, 0 } }

-- The events other than your health's own that move it: death, release, rising, and a new zone.
GA.VIGNETTE_EVENTS = { "PLAYER_DEAD", "PLAYER_ALIVE", "PLAYER_UNGHOST", "PLAYER_ENTERING_WORLD" }

-- The color curve that turns health into the vignette's color and opacity, or nil where the client has none.
function GA.VignetteCurve()
  local util = C_CurveUtil
  if type(util) ~= "table" or type(util.CreateColorCurve) ~= "function" or type(CreateColor) ~= "function" then return nil end
  local r, g, b = T.RGB("vignette")
  local curve = util.CreateColorCurve()
  for _, p in ipairs(GA.VIGNETTE_CURVE) do curve:AddPoint(p[1], CreateColor(r, g, b, p[2])) end
  return curve
end

-- The color object for your health now (its numbers may be hidden, which a texture takes as they are), or nil where the client can't say.
function GA.VignetteColor()
  local get = _G.UnitHealthPercent
  if type(get) ~= "function" or not GA.curve then return nil end
  local ok, color = pcall(get, "player", false, GA.curve)
  if ok and type(color) == "table" and type(color.GetRGBA) == "function" then return color end
end

-- The vignette's frame and its edge texture over the whole screen, made once and under the interface.
local function vignetteFrame()
  if GA.vignette then return GA.vignette end
  local f = CreateFrame("Frame", "Vanguard_LowHealthVignette", UIParent)
  f:SetAllPoints(UIParent)
  f:SetFrameStrata("BACKGROUND")
  f:EnableMouse(false)
  f.edge = f:CreateTexture(nil, "BACKGROUND")
  f.edge:SetAllPoints()
  f.edge:SetTexture(T.Texture("Vignette"))
  GA.vignette = f
  return f
end

-- Tints the screen edge for your health now; hidden when it is off, you are dead or the client can't say.
function GA.UpdateVignette()
  local dead = type(UnitIsDeadOrGhost) == "function" and UnitIsDeadOrGhost("player")
  local color = GA.VignetteColor()
  if not GA.settings.vignette or not color or (not ns.IsSecret(dead) and dead) then
    if GA.vignette then GA.vignette:Hide() end
    return
  end
  local f = vignetteFrame()
  f.edge:SetVertexColor(color:GetRGBA())
  f:Show()
end

-- Starts or stops the vignette after a change of its switch or of the accent colors; applied at once.
function GA.ApplyVignette()
  if GA.settings.vignette then GA.WatchHealth() end
  GA.curve = GA.settings.vignette and GA.VignetteCurve() or nil
  GA.UpdateVignette()
end

-- Looks at the vignette again whenever your health or your being alive changes; once, the first time it is switched on.
function GA.WatchHealth()
  if GA.watching then return end
  GA.watching = true
  ns.OnUnit({ "UNIT_HEALTH", "UNIT_MAXHEALTH" }, GA.UpdateVignette, "player")
  for _, event in ipairs(GA.VIGNETTE_EVENTS) do ns.On(event, GA.UpdateVignette) end
end

-- Loss of control in the theme and on its spot, when the setting is on and the game has it.
local function lossOfControl(on)
  local loc = _G.LossOfControlFrame
  if not (on and type(loc) == "table") then return end
  GA.SkinLossOfControl(loc)
  ns.OutOfCombat(function() place("LossOfControlFrame") end)
end

-- Module entry point (Core/Modules.lua).
function GA.Enable(settings)
  GA.settings = settings
  GA.ApplyVignette()
  if type(C_VignetteInfo) == "table" then ns.On("VIGNETTE_MINIMAP_UPDATED", GA.OnVignette) end
  watchWarnings(settings.hardcore)
  GA.ThemeStatusText()
  lossOfControl(settings.lossOfControl)
  talkingHead(settings.talkingHead)
end
