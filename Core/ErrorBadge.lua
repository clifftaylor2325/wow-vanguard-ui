-- The error badge: how many errors Vanguard caught this session (the
-- entries /vg errors lists), as a small count beside the addons button by the
-- minimap and as a line in the options window's footer, so nobody has to type
-- the command to find out. Both follow every newly caught error and
-- /vg errors clear; with no errors there is no badge.

local ADDON, ns = ...
local L = ns.L

local T = ns.Theme

local BADGE_H, BADGE_PAD = 14, 8
-- The gap between the footer's version line and the errors line.
local FOOTER_GAP = 16
local EB = {}
ns.ErrorBadge = EB

-- The footer line: "1 error caught this session: …" or "3 errors caught this session: …"; with a part
-- paused after repeated errors (Core/Events.lua), how many are paused instead.
local function footerText(n)
  if #ns.paused == 1 then return L["1 part paused after repeated errors: click to list them"] end
  if #ns.paused > 1 then return ns.Format(L["{count} parts paused after repeated errors: click to list them"], { count = #ns.paused }) end
  if n == 1 then return L["1 error caught this session: click to list them"] end
  return ns.Format(L["{count} errors caught this session: click to list them"], { count = n })
end

-- The count just left of the addons button, level with it (a capsule in the accent, the count in void): beside the
-- button's icon, not over it, and inside the minimap's band when the button sits there.
local function buttonBadge(button)
  local b = CreateFrame("Frame", "Vanguard_ErrorBadge", button)
  b:SetSize(BADGE_H, BADGE_H)
  b:SetPoint("RIGHT", button, "LEFT", -3, 0)
  b:SetFrameLevel(button:GetFrameLevel() + 5)
  b.fill = T.Capsule(b, BADGE_H, "accent", { line = false, layer = "ARTWORK" }).fill
  b.text = T.Text(b:CreateFontString(nil, "OVERLAY"), "badge", "void")
  b.text:SetPoint("CENTER")
  return b
end

-- Shows a badge with its text, or hides it while there are no errors.
local function show(badge, n, text)
  if not badge then return end
  badge.text:SetText(text)
  if badge.fill then badge:SetWidth(math.max(BADGE_H, badge.text:GetStringWidth() + BADGE_PAD)) end
  badge:SetShown(n > 0)
end

-- The footer line's short form: the bare count the addons button's badge shows (99+ past 99).
local function shortCount(n)
  return n > 99 and "99+" or tostring(n)
end

-- Keeps the footer line's two forms, the full sentence (also its tooltip when only the count fits) and the count,
-- (counting what the sentence counts: the paused parts when any, else the errors), and both widths: the count's, which the reload notice leaves free (EB.FooterRoom), and the sentence's, which a fit compares.
local function setFooterTexts(b, n)
  local counted = #ns.paused > 0 and #ns.paused or n
  b.fullText, b.shortText = footerText(n), shortCount(counted)
  b.text:SetText(b.shortText)
  b.shortWidth = T.FullWidth(b.text)
  b.text:SetText(b.fullText)
  b.fullWidth = T.FullWidth(b.text)
end

-- Shows the count on both badges (none at zero): the errors kept, but for those ns.Quiet kept for a
-- fallback that works as designed; the footer also shows while a part is paused.
function EB.Update()
  local n = ns.LoudErrorCount()
  show(EB.button, n, shortCount(n))
  if EB.footer then setFooterTexts(EB.footer, n) end
  show(EB.footer, n + #ns.paused, EB.footer and EB.footer.fullText)
  ns.Options.RefitNotice()
end

-- The room the footer line keeps at the notice's left: nothing while it is hidden, else its gap and the count.
---@return number
function EB.FooterRoom()
  local b = EB.footer
  if not (b and b:IsShown()) then return 0 end
  return FOOTER_GAP + b.shortWidth
end

-- Shows the full sentence while the line's room holds it, else the count (the sentence then shows as its tooltip).
-- Waits while an edge is unknown.
function EB.FitFooter()
  local b = EB.footer
  if not (b and b:IsShown() and b:GetLeft() and b:GetRight()) then return end
  b.short = b.fullWidth > b:GetRight() - b:GetLeft()
  b.text:SetText(b.short and b.shortText or b.fullText)
end

-- The footer line's tooltip, only while it shows the count: the sentence the count stands for.
local function footerTip(b)
  if not (GameTooltip and b.short) then return end
  GameTooltip:SetOwner(b, "ANCHOR_TOP")
  GameTooltip:SetText(b.fullText, nil, nil, nil, nil, true)
  GameTooltip:Show()
end

-- A click on the footer line lists the errors in chat (/vg errors); hovering it shows the sentence a count stands for.
local function wireFooter(b)
  b:SetScript("OnClick", ns.Guard("click list errors", function() SlashCmdList.VANGUARD("errors") end))
  b:SetScript("OnEnter", ns.Guard("errors line tooltip", function() footerTip(b) end))
  b:SetScript("OnLeave", ns.Guard("hide errors line tooltip", function() if GameTooltip then GameTooltip:Hide() end end))
end

-- The footer line, right of the version: the count in the bad color; a click lists the errors in chat (/vg errors).
function EB.Footer(window)
  local b = CreateFrame("Button", "Vanguard_OptionsErrors", window.footer)
  b:SetHeight(20)
  b:SetPoint("LEFT", window.version, "RIGHT", FOOTER_GAP, 0)
  b:SetPoint("RIGHT", window.notice, "LEFT", -T.SPACE.col, 0)
  b.text = T.Text(b:CreateFontString(nil, "OVERLAY"), "small", "bad")
  b.text:SetPoint("LEFT")
  ns.EndAt(b.text, b, 0)
  wireFooter(b)
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
