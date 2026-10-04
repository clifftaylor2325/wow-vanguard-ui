-- A swing timer centered above your cast bar, one row per hand that swings: main
-- hand, off hand, and ranged (a hunter's Auto Shot). 12.x took the combat log
-- away from addons, so the old swing-timer recipe is gone; the WoW Forever
-- client sends its own PLAYER_SWING (length, which hand) instead, and this
-- module exists only where it does (C_SwingTimer). A row fills as the next
-- swing comes round, shows the seconds left, and hides once it lands.
-- Anything the client hides is treated as no information, never guessed.

local ADDON, ns = ...

local T = ns.Theme
local CB = ns.GetModule("CastBars")

-- show: "auto" (the classes that live by auto-attack), "always" or "never".
local SW = ns.Module("SwingTimer", { defaults = { show = "auto" } })

-- The classes "auto" shows it for: warriors and rogues, and hunters for Auto Shot.
SW.CLASSES = { WARRIOR = true, ROGUE = true, HUNTER = true }

SW.WIDTH, SW.ROW, SW.GAP = 220, 10, 2
-- Swing type name (Enum.PlayerSwingType) -> row order and color token. The order is
-- also that of UnitAttackSpeed's returns (main hand, off hand, ranged).
SW.KINDS = { { "MainHand", "accent" }, { "OffHand", "text2" }, { "Ranged", "focus" } }

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

-- Building ----------------------------------------------------------------------------------

-- The movable holder, centered above your cast bar, and a row per swing type.
local function build()
  SW.holder = CreateFrame("Frame", "ForeverUI_SwingTimer", UIParent)
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

-- Module entry point (Core/Modules.lua).
function SW.Enable(settings)
  if not SW.Wanted(settings) then return end
  build()
  ns.On("PLAYER_SWING", SW.OnSwing)
  ns.On("PLAYER_DEAD", SW.Stop)
  ns.On("WEAPON_SLOT_CHANGED", SW.OnWeapons)
end
