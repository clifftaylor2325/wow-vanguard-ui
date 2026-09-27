-- The client's own pet, stance and extra action buttons in the ForeverUI
-- look, and a vehicle exit button.
--
-- The pet bar, stance bar and extra action button stay the client's (you
-- place them in Edit Mode); rebuilding them is where UI addons most often
-- cause "action blocked" errors. This module only restyles them: template
-- art faded, the icon cropped, a thin themed border.
--
-- The vehicle exit button is ForeverUI's own: a secure button running
-- /leavevehicle, shown by the client only while you can leave, and movable
-- in unlock mode.

local ADDON, ns = ...

local T = ns.Theme

local SB = ns.Module("SpecialBars", {
  defaults = { skinPet = true, skinStance = true, skinExtra = true, vehicleExit = true },
})

-- Button name prefixes and how many of each, per bar.
local BUTTONS = {
  skinPet = { "PetActionButton", 10 },
  skinStance = { "StanceButton", 10 },
  skinExtra = { "ExtraActionButton", 1 },
}

-- A button's icon texture, by the names the client's templates use.
local function iconOf(b)
  return b.icon or b.Icon or _G[(b:GetName() or "") .. "Icon"]
end

-- Restyles one client button: art faded (icon kept), icon cropped, themed border.
function SB.Skin(b)
  if type(b) ~= "table" or b.fuiSkinned then return end
  local icon = iconOf(b)
  T.FadeRegions(b, icon and { [icon] = true } or nil)
  if icon and icon.SetTexCoord then icon:SetTexCoord(0.08, 0.92, 0.08, 0.92) end
  T.Panel(b, { noBg = true })
  b.fuiSkinned = true
end

-- Restyles every button of the bars switched on.
local function skinAll(settings)
  for key, def in pairs(BUTTONS) do
    if settings[key] then
      for i = 1, def[2] do SB.Skin(_G[def[1] .. i]) end
    end
  end
end

-- A centered label in the theme font.
local function addLabel(b, text)
  b.label = T.SetFont(b:CreateFontString(nil, "OVERLAY"), 11)
  b.label:SetPoint("CENTER")
  b.label:SetText(text)
  T.Color(b.label, "text")
end

-- The vehicle exit: a secure /leavevehicle button the client shows only while you can leave.
local function vehicleExit()
  local b = T.Button(CreateFrame("Button", "ForeverUI_VehicleExit", UIParent, "SecureActionButtonTemplate"))
  b:SetSize(36, 36)
  b:SetAttribute("type", "macro")
  b:SetAttribute("macrotext", "/leavevehicle")
  b:RegisterForClicks("AnyUp", "AnyDown")
  addLabel(b, "Exit")
  RegisterStateDriver(b, "visibility", "[canexitvehicle] show; hide")
  ns.Mover(b, "vehicleexit", "Vehicle exit", { "BOTTOM", "BOTTOM", 260, 40 })
  return b
end

-- Module entry point (Core/Modules.lua): restyle and build out of combat.
function SB.Enable(settings)
  ns.OutOfCombat(function()
    skinAll(settings)
    if settings.vehicleExit then SB.exit = vehicleExit() end
  end)
end
