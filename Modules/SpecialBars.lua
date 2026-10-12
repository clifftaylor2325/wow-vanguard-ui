-- The client's own pet, stance, possess (mind control) and extra action
-- buttons in the Vanguard look, and a vehicle exit button.
--
-- The pet bar, stance bar and extra action button stay the client's;
-- rebuilding them is where UI addons most often cause "action blocked"
-- errors. This module restyles them (template art faded, the icon cropped, a
-- thin themed border; the active stance, the attack flash and the auto-cast
-- mark kept) and gives the pet and stance bars a spot of their own to move
-- in unlock mode, clear of Vanguard's stacked bars (the game's own spot for
-- them is under Edit Mode's control and lies over those bars).
--
-- With Masque loaded, the pet, stance and extra buttons are handed to Masque
-- (one group) instead of restyled (Core/Masque.lua).
--
-- The vehicle exit button is Vanguard's own: a secure button running
-- /leavevehicle, shown by the client only while you can leave, and movable
-- in unlock mode.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgSkinned = ns.FrameState("vgSkinned")

local T = ns.Theme

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

-- The Masque group of the pet, stance and extra buttons, when Masque is loaded.
SB.MASQUE = "Pet, stance and extra buttons"

-- Restyles one client button: art faded (state textures kept), icon cropped,
-- themed border; or hands it to Masque (which finds the game button's regions).
function SB.Skin(b)
  if type(b) ~= "table" or vgSkinned[b] then return end
  vgSkinned[b] = true
  if ns.Masque.Add(SB.MASQUE, b) then return end
  local icon = iconOf(b)
  T.FadeRegions(b, SB.KeepSet(b))
  if icon and icon.SetTexCoord then icon:SetTexCoord(0.08, 0.92, 0.08, 0.92) end
  T.Panel(b, { noBg = true })
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
SB.SPOTS = {
  { "PetActionBar", "petbar", "Pet bar", { "BOTTOMLEFT", "BOTTOMLEFT", 8, 250 }, 320, 32 },
  { "StanceBar", "stancebar", "Stance bar", { "BOTTOMLEFT", "BOTTOMLEFT", 8, 288 }, 200, 32 },
}

-- Puts one of the game's bars on its spot, its bottom left corner on the spot's.
local function seat(bar, holder)
  bar:ClearAllPoints()
  bar:SetPoint("BOTTOMLEFT", holder, "BOTTOMLEFT", 0, 0)
end

-- A movable spot for one of the game's bars, with the bar kept on it (the game
-- puts it back where Edit Mode says; the pin undoes that). A client without the bar skips it.
local function placeBar(spot)
  local bar = _G[spot[1]]
  if type(bar) ~= "table" or not bar.SetPoint then return end
  local holder = CreateFrame("Frame", "Vanguard_" .. spot[1] .. "Spot", UIParent)
  holder:SetSize(spot[5], spot[6])
  ns.Mover(holder, spot[2], spot[3], spot[4])
  ns.Pin(bar, function(f) seat(f, holder) end)
end

-- A centered label in the theme font.
local function addLabel(b, text)
  b.label = T.Text(b:CreateFontString(nil, "OVERLAY"), "small")
  b.label:SetPoint("CENTER")
  b.label:SetText(text)
  T.Color(b.label, "text")
end

-- The vehicle exit: a secure /leavevehicle button the client shows only while you can leave.
local function vehicleExit()
  local b = T.Button(CreateFrame("Button", "Vanguard_VehicleExit", UIParent, "SecureActionButtonTemplate"))
  b:SetSize(36, 36)
  b:SetAttribute("type", "macro")
  b:SetAttribute("macrotext", "/leavevehicle")
  b:RegisterForClicks("AnyUp", "AnyDown")
  addLabel(b, "Exit")
  RegisterStateDriver(b, "visibility", "[canexitvehicle] show; hide")
  ns.Mover(b, "vehicleexit", "Vehicle exit", { "BOTTOM", "BOTTOM", 260, 114 })
  return b
end

-- Module entry point (Core/Modules.lua): restyle and build out of combat.
function SB.Enable(settings)
  ns.OutOfCombat(function()
    skinAll(settings)
    if settings.place then for _, spot in ipairs(SB.SPOTS) do placeBar(spot) end end
    if settings.vehicleExit then SB.exit = vehicleExit() end
  end)
end
