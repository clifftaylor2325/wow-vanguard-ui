-- The client's own pet, stance, possess (mind control) and extra action
-- buttons in the Vanguard look, and a vehicle exit button.
--
-- The pet bar, stance bar and extra action button stay the client's;
-- rebuilding them is where UI addons most often cause "action blocked"
-- errors. This module restyles them (template art faded, the icon cropped, a
-- thin themed border; the active stance, the attack flash and the auto-cast
-- mark kept) and gives the pet and stance buttons a spot of their own to move
-- in unlock mode, clear of Vanguard's stacked bars (the game's own spot for
-- their bars is under Edit Mode's control and lies over those bars).
--
-- With the skinning library loaded, the pet, stance and extra buttons are handed to it
-- (one group) instead of restyled (Core/Masque.lua).
--
-- The vehicle exit button is Vanguard's own: a secure button running
-- /leavevehicle, shown by the client only while you can leave, and movable
-- in unlock mode.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgSkinned = ns.FrameState("vgSkinned")

local T = ns.Theme
local L = ns.L

local SB = ns.Module("SpecialBars", {
  defaults = { skinPet = true, skinStance = true, skinPossess = true, skinExtra = true, vehicleExit = true, place = true },
})

-- Button name prefixes and how many of each, per bar.
local BUTTONS = {
  skinPet = { "PetActionButton", 10 },
  skinStance = { "StanceButton", 10 },
  -- The possess bar's two buttons while you mind-control (PossessActionBar, NUM_POSSESS_SLOTS).
  skinPossess = { "PossessButton", 2 },
  skinExtra = { "ExtraActionButton", 1 },
}

-- A button's icon texture, by the names the client's templates use.
local function iconOf(b)
  return b.icon or b.Icon or _G[(b:GetName() or "") .. "Icon"]
end

-- The textures the client shows by state, which fading the template art must
-- leave: the icon, the checked texture (the active stance or pet stance), the
-- attack flash and the auto-cast mark (where the template has one).
function SB.KeepSet(b)
  local keep = {}
  local parts = { iconOf(b), b.GetCheckedTexture and b:GetCheckedTexture(), b.Flash, b.AutoCastable }
  for i = 1, 4 do
    if parts[i] then keep[parts[i]] = true end
  end
  return keep
end

-- The skinning group of the pet, stance and extra buttons, when the library is loaded.
SB.MASQUE = "Pet, stance and extra buttons"

-- The game's hotkey and count texts on a button in the theme's small font and the action bars' colours
-- (the hotkey light grey, the count white), where the template has them.
local function themeTexts(b)
  if type(b.HotKey) == "table" and b.HotKey.SetFont then T.Text(b.HotKey, "small", "text2") end
  if type(b.Count) == "table" and b.Count.SetFont then T.Text(b.Count, "small", "white") end
end

-- Restyles one client button: art faded (state textures kept), icon cropped,
-- themed border and texts; or hands it to the skinning library (which finds the game button's regions).
function SB.Skin(b)
  if type(b) ~= "table" or vgSkinned[b] then return end
  vgSkinned[b] = true
  if ns.Masque.Add(SB.MASQUE, b) then return end
  local icon = iconOf(b)
  T.FadeRegions(b, SB.KeepSet(b))
  if icon and icon.SetTexCoord then T.Crop(icon) end
  T.Panel(b, { noBg = true })
  themeTexts(b)
end

-- Restyles every button of the bars switched on.
local function skinAll(settings)
  for key, def in pairs(BUTTONS) do
    if settings[key] then
      for i = 1, def[2] do SB.Skin(_G[def[1] .. i]) end
    end
  end
end

-- The pet and stance bars: the game's frame, then its mover's key, label,
-- default spot (bottom left, above the chat and below the raid frames, where
-- the Centered layout has room) and the spot's size: a row of ten 30-unit
-- buttons for the pet, about six forms for the stance bar (it grows to the right).
-- Then the name of the bar's buttons and when the row hides, as the game hides
-- the bar: in a vehicle, on an override bar, and for stances while you mind-control
-- (the pet bar then holds the possessed creature's actions) or the pet bar with no pet.
SB.STANCE_SPOT = { "StanceBar", "stancebar", L["Stance bar"], { "BOTTOMLEFT", "BOTTOMLEFT", 8, 288 }, 200, 32,
  buttons = "StanceButton", hides = "[vehicleui][possessbar][overridebar] hide; show" }
SB.SPOTS = {
  { "PetActionBar", "petbar", L["Pet bar"], { "BOTTOMLEFT", "BOTTOMLEFT", 8, 250 }, 320, 32,
    buttons = "PetActionButton", hides = "[vehicleui][overridebar][nopet] hide; show" },
  SB.STANCE_SPOT,
}

-- How many buttons each bar has, and the room between two of them (the game's own least padding).
SB.ROW = { count = 10, gap = 2 }

-- Each placed bar's spot, by the game bar's name.
SB.holders = {}

-- How many forms the character has, plainly (0 for a class with none).
local function formsCount()
  return ns.PlainNumber(ns.CallIf(_G, "GetNumShapeshiftForms")) or 0
end

-- The row's secure visibility driver: the spot's, after the pet battle clause on a client that has pet battles.
-- The stance row hides outright for a character with no forms: the game leaves its ten stance buttons shown
-- inside its hidden bar then (StanceBar:Update skips UpdateState at 0 forms, and Edit Mode shows all ten),
-- and no secure conditional says "no forms".
function SB.RowDriver(spot)
  if spot == SB.STANCE_SPOT and formsCount() == 0 then return "hide" end
  return (ns.IsForever() and "" or ns.GetModule("ActionBars").PET_BATTLE_CLAUSE) .. spot.hides
end

-- Puts button i of a bar on its spot, the spot its parent, so it goes where the spot goes.
local function seatButton(b, holder, i)
  b:SetParent(holder)
  b:ClearAllPoints()
  b:SetPoint("BOTTOMLEFT", holder, "BOTTOMLEFT", (i - 1) * (b:GetWidth() + SB.ROW.gap), 0)
end

-- Moves a bar's buttons onto its spot. Edit Mode lays its bottom bars out again in a fight too (a data bar
-- showing or hiding), over Vanguard's bars, and a bar holding secure buttons can't be moved back until the
-- fight ends; the buttons no longer ride on it. The bar stays the game's (its code still updates, shows and
-- hides the buttons) but stops taking the mouse where it lies, and Edit Mode shows no handle for it.
local function seatButtons(spot, bar, holder)
  for i = 1, SB.ROW.count do
    local b = _G[spot.buttons .. i]
    if type(b) == "table" and b.SetParent then seatButton(b, holder, i) end
  end
  bar:EnableMouse(false)
  ns.EditModeReplaced(bar)
end

-- A movable spot for one of the game's bars, holding the bar's buttons, drawn at the bar's frame level
-- and hidden by a secure driver when the game hides the bar. A client without the bar skips it.
local function placeBar(spot)
  local bar = _G[spot[1]]
  if type(bar) ~= "table" or not bar.SetPoint then return end
  local holder = CreateFrame("Frame", "Vanguard_" .. spot[1] .. "Spot", UIParent)
  holder:SetSize(spot[5], spot[6])
  holder:SetFrameLevel(bar:GetFrameLevel())
  ns.Mover(holder, spot[2], spot[3], spot[4])
  seatButtons(spot, bar, holder)
  holder.vgDriver = SB.RowDriver(spot)
  RegisterStateDriver(holder, "visibility", holder.vgDriver)
  SB.holders[spot[1]] = holder
end

-- Sets the stance spot's driver again on UPDATE_SHAPESHIFT_FORMS (a form learnt, a talent swap) and on
-- PLAYER_ENTERING_WORLD (the forms may still read 0 at login), out of combat:
-- RegisterStateDriver writes a secure attribute. The latest change wins.
local function redriveStance()
  local holder = SB.holders[SB.STANCE_SPOT[1]]
  if not holder then return end
  ns.OutOfCombat(function()
    local driver = SB.RowDriver(SB.STANCE_SPOT)
    if holder.vgDriver == driver then return end
    holder.vgDriver = driver
    RegisterStateDriver(holder, "visibility", driver)
  end, "stancespot")
end

-- A label in the theme font, centered and fitted to the button (shrunk a little when a translation runs wider).
local function addLabel(b, text)
  b.label = T.Text(b:CreateFontString(nil, "OVERLAY"), "small")
  T.FitText(b.label, b, 1)
  b.label:SetText(text)
  T.Color(b.label, "text")
end

-- The vehicle exit's side, and the room its label keeps each side inside it.
SB.EXIT_SIZE = 36
SB.EXIT_INSET = 1

-- Widens the exit button to its label at the current Text size (never under its square), so a long
-- translation shows whole. Out of combat only: the button is a secure frame, so its size is protected.
function SB.WidenExit(b)
  b:SetWidth(math.max(SB.EXIT_SIZE, math.ceil(T.FullWidth(b.label)) + 2 * SB.EXIT_INSET))
  T.Refit(b.label)
end

-- Sizes the exit button to its label now and after every Text size change.
local function keepExitFitted(b)
  SB.WidenExit(b)
  T.OnChanged(function() ns.OutOfCombat(function() SB.WidenExit(b) end, b) end)
end

-- The exit button's room beside bar 1 (it sits one half width of bar 1, plus this, from the centre) and its
-- least distance from the centre: 260 is half of bar 1 at the default button size of 38, plus the 21.
SB.EXIT_OFFSET = 21
SB.EXIT_MIN_X = 260

-- The exit's default point for a bar 1 of this half width: today's spot, or clear of bar 1's right end; it rises
-- with the bars, under your frames (Core/Layout.lua, HudLift).
function SB.ExitPoint(halfWidth)
  return { "BOTTOM", "BOTTOM", math.max(SB.EXIT_MIN_X, halfWidth + SB.EXIT_OFFSET), 114, underFrames = true }
end

-- Moves the exit's default spot to bar 1's current width (ActionBars calls it as the bars restack), only when
-- that moved it: placing a frame rounds the pixel-sized frames again, which restacks the bars again.
function SB.FitExit(halfWidth)
  local point = SB.ExitPoint(halfWidth)
  if not SB.exit or point[3] == SB.exitX then return end
  SB.exitX = point[3]
  ns.SetMoverDefault("vehicleexit", point)
end

-- The exit's first default spot, remembered so SB.FitExit moves it only when bar 1's width changes it.
local function exitSpot()
  local point = SB.ExitPoint(ns.GetModule("ActionBars").Bar1HalfWidth())
  SB.exitX = point[3]
  return point
end

-- Makes the button run /leavevehicle on a click.
local function addLeaveMacro(b)
  b:SetAttribute("type", "macro")
  b:SetAttribute("macrotext", "/leavevehicle")
  b:RegisterForClicks("AnyUp", "AnyDown")
end

-- On a flight the exit also asks the game to land at the next stop, as the game's own leave button does
-- (/leavevehicle only leaves vehicles). It acts on the release alone: the button reports both presses.
local function landEarlyOnTaxi(b)
  b:HookScript("PostClick", function(_, _, down)
    if down or not ns.IsTrue(ns.CallIf(_G, "UnitOnTaxi", "player")) then return end
    ns.CallIf(_G, "TaxiRequestEarlyLanding")
  end)
end

-- The vehicle exit: a secure /leavevehicle button the client shows only while you can leave.
local function vehicleExit()
  local b = T.Button(CreateFrame("Button", "Vanguard_VehicleExit", UIParent, "SecureActionButtonTemplate"))
  b:SetSize(SB.EXIT_SIZE, SB.EXIT_SIZE)
  addLeaveMacro(b)
  landEarlyOnTaxi(b)
  addLabel(b, L["Exit"])
  keepExitFitted(b)
  RegisterStateDriver(b, "visibility", "[canexitvehicle] show; hide")
  ns.Mover(b, "vehicleexit", L["Vehicle exit"], exitSpot())
  return b
end

-- Module entry point (Core/Modules.lua): restyle and build out of combat.
function SB.Enable(settings)
  ns.OutOfCombat(function()
    skinAll(settings)
    if settings.place then for _, spot in ipairs(SB.SPOTS) do placeBar(spot) end end
    if settings.vehicleExit then SB.exit = vehicleExit() end
  end)
  if settings.place then
    ns.On("UPDATE_SHAPESHIFT_FORMS", redriveStance)
    ns.On("PLAYER_ENTERING_WORLD", redriveStance)
  end
end
