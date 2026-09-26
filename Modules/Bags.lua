-- Bags: turns on the client's combined bag (one window for every bag) and
-- restyles it: flat themed panel, template art faded, square item slots
-- with thin borders. The bag window and its item buttons stay the
-- client's own, so using, dragging and sorting items work exactly as
-- before; this module only changes how they look.

local ADDON, ns = ...

local T = ns.Theme

local BG = ns.Module("Bags", {
  defaults = { combined = true },
})

-- Item button regions whose art is faded (the icon and texts stay).
local ITEM_ART = { "NormalTexture", "IconBorder", "ItemContextOverlay" }

-- The client's combined bag window, or nil if it doesn't have one.
local function combinedFrame()
  return _G.ContainerFrameCombinedBags
end

-- Turns on the combined bag setting, if this client has it.
local function useCombined()
  local set = C_CVar and C_CVar.SetCVar or SetCVar
  if type(set) == "function" then
    pcall(set, "combinedBags", "1")
  end
end

-- Fades an item button's slot art and gives it a thin themed border.
local function skinItem(button)
  for _, key in ipairs(ITEM_ART) do
    local region = button[key] or (button["Get" .. key] and button["Get" .. key](button))
    if type(region) == "table" and region.SetAlpha then region:SetAlpha(0) end
  end
  local icon = button.icon or button.Icon
  if icon and icon.SetTexCoord then icon:SetTexCoord(0.08, 0.92, 0.08, 0.92) end
  T.Panel(button, { inset = true, noBg = true })
end

-- Every item button the window shows right now.
local function items(frame)
  local out = {}
  if type(frame.EnumerateValidItems) == "function" then
    for _, button in frame:EnumerateValidItems() do out[#out + 1] = button end
  end
  return out
end

-- Skins the window and its current item buttons. Safe to repeat: slots
-- change as bags are swapped, and painting is idempotent.
function BG.SkinWindow(frame)
  T.FadeRegions(frame)
  if frame.NineSlice then T.FadeRegions(frame.NineSlice) end
  T.Panel(frame)
  for _, button in ipairs(items(frame)) do
    skinItem(button)
  end
end

-- Module entry point (Core/Modules.lua): combined bags on, skin on every show.
function BG.Enable(settings)
  if settings.combined then useCombined() end
  local frame = combinedFrame()
  if not frame then
    return
  end
  frame:HookScript("OnShow", BG.SkinWindow)
  ns.On("BAG_UPDATE_DELAYED", function() if frame:IsShown() then BG.SkinWindow(frame) end end)
end
