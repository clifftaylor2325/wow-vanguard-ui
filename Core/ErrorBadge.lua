-- The error badge: how many errors Vanguard caught this session (the
-- entries /vg errors lists), as a small count beside the addons button by the
-- minimap and as a line in the options window's footer, so nobody has to type
-- the command to find out. Both follow every newly caught error and
-- /vg errors clear; with no errors there is no badge.

local ADDON, ns = ...

local T = ns.Theme

local EB = {}
ns.ErrorBadge = EB

-- "1 error" or "3 errors".
local function errorsText(n)
  return n == 1 and "1 error" or (n .. " errors")
end

-- The count just left of the addons button, level with it (a small square in the bad color): beside the
-- button's icon, not over it, and inside the minimap's band when the button sits there.
local function buttonBadge(button)
  local b = CreateFrame("Frame", "Vanguard_ErrorBadge", button)
  b:SetSize(14, 14)
  b:SetPoint("RIGHT", button, "LEFT", -3, 0)
  b:SetFrameLevel(button:GetFrameLevel() + 5)
  b.fill = ns.Widgets.Flat(b, "ARTWORK", "bad")
  b.fill:SetAllPoints()
  b.text = T.Text(b:CreateFontString(nil, "OVERLAY"), "badge", "white")
  b.text:SetPoint("CENTER")
  return b
end

-- Shows a badge with its text, or hides it while there are no errors.
local function show(badge, n, text)
  if not badge then return end
  badge.text:SetText(text)
  badge:SetShown(n > 0)
end

-- Shows the count on both badges (none at zero).
function EB.Update()
  local n = #ns.errors
  show(EB.button, n, tostring(n))
  show(EB.footer, n, errorsText(n) .. " caught this session: click to list them")
end

-- The footer line, right of the version: the count in the bad color; a click lists the errors in chat (/vg errors).
function EB.Footer(window)
  local b = CreateFrame("Button", "Vanguard_OptionsErrors", window.footer)
  b:SetSize(260, 20)
  b:SetPoint("LEFT", window.version, "RIGHT", 16, 0)
  b.text = T.Text(b:CreateFontString(nil, "OVERLAY"), "small", "bad")
  b.text:SetPoint("LEFT")
  b:SetScript("OnClick", ns.Guard("click list errors", function() SlashCmdList.VANGUARD("errors") end))
  EB.footer = b
  EB.Update()
end

-- The addons button's badge, once the game has made the button (at login).
local function attach()
  local button = _G.AddonCompartmentFrame
  if type(button) ~= "table" or EB.button then return end
  EB.button = buttonBadge(button)
  EB.Update()
end

ns.On("PLAYER_LOGIN", attach)
ns.OnErrorsChanged(EB.Update)
