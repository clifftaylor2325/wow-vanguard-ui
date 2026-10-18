-- The Profiles page's own rows: one per profile, with Use, Copy here and
-- Delete (the last two change settings for good, so they ask "Sure?" on the
-- first click), and a box to name a new profile. Changing the list
-- rebuilds the page. Switching profiles applies on reload.

local ADDON, ns = ...

local T, W, O = ns.Theme, ns.Widgets, ns.Options

-- A profile's row is a list row (T.ROW.height); its buttons are SMALL wide (units), narrower than the usual 120.
local ROW, SMALL = T.ROW.height, 84

-- Shows a danger button's warning (what it loses for good) in the game's tooltip, where the client has one.
local function warnTip(b)
  if not GameTooltip or not b.warn then return end
  GameTooltip:SetOwner(b, "ANCHOR_RIGHT")
  GameTooltip:SetText(b.warn, nil, nil, nil, nil, true)
  GameTooltip:Show()
end

-- A destructive push button: its label in the danger color, and warn (what it loses) in a tooltip
-- under the mouse. The first click asks "Sure?" in its place, the second runs onClick.
function W.Danger(parent, text, onClick, width, warn)
  local b = ns.DialogButton(parent, text, width or 120, "danger")
  b.warn = warn
  b:HookScript("OnEnter", ns.Guard("hover danger button", warnTip))
  b:HookScript("OnLeave", function() if GameTooltip then GameTooltip:Hide() end end)
  -- Asks first, then acts.
  b:SetScript("OnClick", ns.Guard("click danger button", function(self)
    if not self.armed then self.armed = true return self.text:SetText("Sure?") end
    onClick()
  end))
  return b
end

-- One profile ------------------------------------------------------------------------------

-- Delete and Copy here, right to left: they change settings for good, so they ask first and say what they lose.
local function addEditButtons(r, name)
  local lost = "Deletes profile " .. name .. " for every character on this account. It can't be undone."
  r.delete = W.Danger(r, "Delete", function() ns.DeleteProfile(name) O.RebuildPage("profiles") end, SMALL, lost)
  r.delete:SetPoint("RIGHT", -T.SPACE.gap, 0)
  lost = string.format("Replaces every setting in profile %s with profile %s's. It can't be undone.", ns.SelectedProfileName(), name)
  r.copy = W.Danger(r, "Copy here", function() ns.CopyProfile(name) O.NeedReload() O.RebuildPage("profiles") end, SMALL, lost)
  r.copy:SetPoint("RIGHT", r.delete, "LEFT", -T.SPACE.gap, 0)
end

-- Use, Copy here and Delete, right to left. None on the profile that will be in use after the reload;
-- the one running until then (when a switch is staged) only gets Use, to take the switch back. Use is
-- a plain button: the page's one accent button is Create.
local function addProfileButtons(r, name)
  if name == ns.SelectedProfileName() then return end
  if name ~= ns.ProfileName() then addEditButtons(r, name) end
  r.use = W.Button(r, "Use", function() ns.UseProfile(name) O.NeedReload() O.RebuildPage("profiles") end, SMALL)
  if r.copy then r.use:SetPoint("RIGHT", r.copy, "LEFT", -T.SPACE.gap, 0) else r.use:SetPoint("RIGHT", -T.SPACE.gap, 0) end
end

-- A row with a caption on the left.
local function captioned(parent, width, text, color)
  local r = CreateFrame("Frame", nil, parent)
  r:SetSize(width, ROW)
  r.label = T.Text(r:CreateFontString(nil, "OVERLAY"), "label", color)
  r.label:SetPoint("LEFT", T.SPACE.gap, 0)
  r.label:SetText(text)
  return r
end

-- A profile's name, marked when it is in use, in use until the reload, or the one that takes over then.
local function profileLabel(name)
  if name == ns.PendingProfileName() then return name .. "  (after reload)" end
  if name ~= ns.ProfileName() then return name end
  return name .. (ns.PendingProfileName() and "  (in use until reload)" or "  (in use)")
end

-- One profile: its name (marked when it's the one in use) and its buttons.
local function profileRow(parent, row, width)
  local name = row[2]
  local r = captioned(parent, width, profileLabel(name))
  addProfileButtons(r, name)
  return r
end

-- A new profile ----------------------------------------------------------------------------

-- Makes the named profile and stages the switch to it (it applies on reload), or says why it can't.
local function create(r)
  local name = r.input:GetText()
  if not ns.NewProfile(name) then
    r.label:SetText("Name taken or not allowed")
    return T.Color(r.label, "bad")
  end
  ns.UseProfile(name)
  O.NeedReload()
  O.RebuildPage("profiles")
end

-- The new-profile row: a name box and Create (Enter creates too).
local function newProfileRow(parent, _, width)
  local r = captioned(parent, width, "New profile", "text2")
  r.input = W.Input(r, 160)
  r.input:SetPoint("RIGHT", -(SMALL + 2 * T.SPACE.gap), 0)
  r.input:SetScript("OnEnterPressed", function() create(r) end)
  r.create = W.Primary(r, "Create", function() create(r) end, SMALL)
  r.create:SetPoint("RIGHT", -T.SPACE.gap, 0)
  return r
end

O.AddRowKind("profile", profileRow, ROW)
O.AddRowKind("newprofile", newProfileRow, ROW + T.SPACE.tight)
