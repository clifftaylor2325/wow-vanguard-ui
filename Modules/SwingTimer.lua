-- A swing timer centered above your cast bar, one row per hand that swings: main
-- hand, off hand, and ranged (a hunter's Auto Shot). 12.x took the combat log
-- away from addons, so the old swing-timer recipe is gone; the WoW Forever
-- client sends its own PLAYER_SWING (length, which hand) instead, and this
-- module exists only where it does (C_SwingTimer). A row fills as the next
-- swing comes round, shows the seconds left, and hides once it lands.
-- Anything the client hides is treated as no information, never guessed.
-- The game's own swing timer (Blizzard_SwingTimer, shown with its "showSwingTimer"
-- setting) is hidden while this one is on, and drawn in the theme while it is off.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgSkinned = ns.FrameState("vgSkinned")

local T = ns.Theme
local CB = ns.GetModule("CastBars")
local UF = ns.GetModule("UnitFrames")

-- show: "auto" (the classes that live by auto-attack), "always" or "never".
local SW = ns.Module("SwingTimer", { defaults = { show = "auto" } })

-- The classes "auto" shows it for: every class that fights with its weapon (hunters for Auto Shot too).
-- Rows show only while a swing runs, so a healer who rarely swings sees nothing at rest.
SW.CLASSES = { WARRIOR = true, ROGUE = true, HUNTER = true, PALADIN = true, SHAMAN = true, DRUID = true }

SW.WIDTH, SW.ROW, SW.GAP = 220, 10, 2
-- A row's opacity while your target is out of that hand's reach (the game's own timer uses the same).
SW.OUT_OF_RANGE = 0.4
-- What makes the rows ask the client about range again: a new target, a new zone, other weapons.
SW.RANGE_EVENTS = { "PLAYER_TARGET_CHANGED", "PLAYER_ENTERING_WORLD", "WEAPON_SLOT_CHANGED" }
-- Swing type name (Enum.PlayerSwingType) -> row order and color token. The order is
-- also that of UnitAttackSpeed's returns (main hand, off hand, ranged).
SW.KINDS = { { "MainHand", "accent" }, { "OffHand", "text2" }, { "Ranged", "focus" } }
-- The game's own swing bars, in SW.KINDS order (Blizzard_SwingTimer.xml), and the art on each
-- that the theme fades (the game sets its alpha again for its out-of-range look).
SW.BLIZZARD = { "SwingTimerMainHandFrame", "SwingTimerOffHandFrame", "SwingTimerRangedFrame" }
SW.GAME_ART = { "Background", "Border" }
SW.GAME_LABELS = { "TypeLabel", "TimeLabel" }

-- Rows ----------------------------------------------------------------------------------------

-- One row: a thin themed bar with the seconds left at its right end.
local function row(holder, i, color)
  local r = T.HudPanel(CreateFrame("StatusBar", nil, holder), { inset = true })
  T.BarColor(T.StyleBar(r), color)
  r:SetSize(SW.WIDTH, SW.ROW)
  r:SetPoint("BOTTOM", holder, "BOTTOM", 0, (i - 1) * (SW.ROW + SW.GAP))
  r.time = T.Text(r:CreateFontString(nil, "OVERLAY"), "small", "white")
  r.time:SetPoint("RIGHT", -3, 0)
  r:Hide()
  return r
end

-- Moves a live row on: its fill and the seconds left; hides it once the swing lands.
local function step(r, now)
  local left = r.start + r.length - now
  if left <= 0 then r.live = false return r:Hide() end
  r:SetValue(now - r.start)
  CB.ShowSeconds(r.time, left)
end

-- Moves every live row on; the timer stops when none is left.
function SW.Tick()
  local any, now = false, GetTime()
  for _, r in pairs(SW.rows) do
    if r.live then step(r, now) any = any or r.live end
  end
  if not any then SW.holder:SetScript("OnUpdate", nil) end
end

-- A swing started: its row restarts from empty, for the length the client gives.
function SW.OnSwing(_, length, kind)
  if ns.IsSecret(length) or ns.IsSecret(kind) or type(length) ~= "number" or length <= 0 then return end
  local r = SW.rows[kind]
  if not r then return end
  r.start, r.length, r.live = GetTime(), length, true
  r:SetMinMaxValues(0, length)
  r:Show()
  step(r, r.start)
  SW.holder:SetScript("OnUpdate", SW.Tick)
end

-- You died: every row stops.
function SW.Stop()
  for _, r in pairs(SW.rows) do r.live = false r:Hide() end
end

-- Your weapons changed: a swing under way starts over at the new weapon's speed,
-- as the game's own swing timer does (Blizzard_SwingTimer.lua, WEAPON_SLOT_CHANGED);
-- a hand left without a weapon, or whose speed the client hides, stops.
function SW.OnWeapons()
  local speeds = { UnitAttackSpeed("player") }
  for kind, r in pairs(SW.rows) do
    local length = r.live and ns.PlainNumber(speeds[r.hand])
    if length and length > 0 then SW.OnSwing(nil, length, kind) elseif r.live then r.live = false r:Hide() end
  end
end

-- Range --------------------------------------------------------------------------------------

-- Dims a row while your target is out of its hand's reach, as the game's own timer does (an
-- opacity, not a fade).
local function paintRange(r, outOfRange)
  r:SetAlpha(outOfRange and SW.OUT_OF_RANGE or 1)
end

-- The client says a hand's reach changed: dim its row only when a check was made and the target
-- is out of reach. A hidden answer counts as in reach.
function SW.OnRange(_, kind, inRange, checksRange)
  local r = not ns.IsSecret(kind) and SW.rows[kind]
  if not r then return end
  paintRange(r, not ns.IsSecret(checksRange) and checksRange == true and not ns.IsSecret(inRange) and inRange == false)
end

-- Asks the client to send range changes for every row's hand (again: a new target or weapon can
-- reset it), and reads the reach now; only a plain "out of reach" dims, nil never does.
function SW.CheckRange()
  local enable, within = C_SwingTimer.EnableRangeCheck, C_SwingTimer.IsTargetWithinSwingRange
  if type(enable) ~= "function" or type(within) ~= "function" then return end
  for kind, r in pairs(SW.rows) do
    enable(kind, true)
    local inRange = within(kind)
    paintRange(r, not ns.IsSecret(inRange) and inRange == false)
  end
end

-- Follows your target's reach: the client's range event, and a fresh look on each range event.
local function listenRange()
  ns.On("PLAYER_SWING_RANGE_UPDATE", SW.OnRange)
  for _, event in ipairs(SW.RANGE_EVENTS) do ns.On(event, SW.CheckRange) end
  SW.CheckRange()
end

-- The game's swing timer ---------------------------------------------------------------------

-- Fades a game swing bar's background and frame art (alpha only).
local function fadeGameArt(frame)
  for _, key in ipairs(SW.GAME_ART) do
    if type(frame[key]) == "table" and frame[key].SetAlpha then frame[key]:SetAlpha(0) end
  end
end

-- A game swing bar's fill in the theme: the theme's bar texture in its row's color on a
-- flat inset panel, its labels in the theme font (the game keeps their color), the label's shadow hidden.
local function dressGameBar(bar, color)
  T.BarColor(T.StyleBar(bar), color)
  T.HudPanel(bar, { inset = true })
  for _, key in ipairs(SW.GAME_LABELS) do
    if type(bar[key]) == "table" and bar[key].SetFont then T.Text(bar[key], "small", false) end
  end
  if type(bar.TypeLabelShadow) == "table" and bar.TypeLabelShadow.Hide then bar.TypeLabelShadow:Hide() end
end

-- Dresses one of the game's swing bars, once; its art is faded again each time it shows
-- and after the game redraws its range look. A bar without its fill is left alone.
local function skinGameBar(frame, color)
  if vgSkinned[frame] or type(frame.StatusBar) ~= "table" or not frame.StatusBar.SetStatusBarTexture then return end
  vgSkinned[frame] = true
  dressGameBar(frame.StatusBar, color)
  fadeGameArt(frame)
  frame:HookScript("OnShow", fadeGameArt)
  if type(hooksecurefunc) == "function" and type(frame.ApplyRangePresentation) == "function" then hooksecurefunc(frame, "ApplyRangePresentation", ns.Guard("hook ApplyRangePresentation", fadeGameArt)) end
end

-- The game's swing bars in the theme (Vanguard's timer is off): each this client has.
function SW.SkinGameBars()
  for i, name in ipairs(SW.BLIZZARD) do
    local frame = _G[name]
    if type(frame) == "table" and frame.HookScript then skinGameBar(frame, SW.KINDS[i][2]) end
  end
end

-- Hides the game's swing bars for good, as the unit frames hide the game's (UF.HideBlizzard).
function SW.HideGameBars()
  for _, name in ipairs(SW.BLIZZARD) do UF.HideBlizzard(name) end
end

-- Building ----------------------------------------------------------------------------------

-- The movable holder, centered above your cast bar, and a row per swing type.
local function build()
  SW.holder = CreateFrame("Frame", "Vanguard_SwingTimer", UIParent)
  SW.holder:SetSize(SW.WIDTH, 3 * SW.ROW + 2 * SW.GAP)
  ns.Mover(SW.holder, "swing", "Swing timer", { "BOTTOM", "BOTTOM", 0, 170 })
  SW.rows = {}
  for i, kind in ipairs(SW.KINDS) do
    local id = Enum.PlayerSwingType[kind[1]]
    if id ~= nil then SW.rows[id] = row(SW.holder, i, kind[2]) SW.rows[id].hand = i end
  end
end

-- True when this client sends swings and the timer is on for you.
function SW.Wanted(settings)
  if type(C_SwingTimer) ~= "table" or not (Enum and Enum.PlayerSwingType) then return false end
  if settings.show ~= "auto" then return settings.show == "always" end
  local _, class = UnitClass("player")
  return not ns.IsSecret(class) and SW.CLASSES[class] == true
end

-- Module entry point (Core/Modules.lua): Vanguard's timer and the game's hidden (out of
-- combat), or the game's in the theme when Vanguard's isn't wanted.
function SW.Enable(settings)
  if not SW.Wanted(settings) then return SW.SkinGameBars() end
  ns.OutOfCombat(SW.HideGameBars)
  build()
  ns.On("PLAYER_SWING", SW.OnSwing)
  ns.On("PLAYER_DEAD", SW.Stop)
  ns.On("WEAPON_SLOT_CHANGED", SW.OnWeapons)
  listenRange()
end
