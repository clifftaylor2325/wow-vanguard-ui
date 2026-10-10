-- The Profiles page's own rows: one per profile, with Use, Copy here and
-- Delete (the last two change settings for good, so they ask "Sure?" on the
-- first click), and a box to name a new profile. Changing the list
-- rebuilds the page. Switching profiles applies on reload.

local ADDON, ns = ...

local T, W, O = ns.Theme, ns.Widgets, ns.Options

local ROW, SMALL = 30, 84

-- A destructive push button: its label in the danger color. The first
-- click asks "Sure?" in its place, the second runs onClick.
function W.Danger(parent, text, onClick, width)
  local b = ns.DialogButton(parent, text, width or 120)
  T.Color(b.text, "bad")
  -- Asks first, then acts.
  b:SetScript("OnClick", ns.Guard("click danger button", function(self)
    if not self.armed then self.armed = true return self.text:SetText("Sure?") end
    onClick()
  end))
  return b
end

-- One profile ------------------------------------------------------------------------------

-- Delete and Copy here, right to left: they change settings for good, so they ask first.
local function addEditButtons(r, name)
  r.delete = W.Danger(r, "Delete", function() ns.DeleteProfile(name) O.RebuildPage("profiles") end, SMALL)
  r.delete:SetPoint("RIGHT", -8, 0)
  r.copy = W.Danger(r, "Copy here", function() ns.CopyProfile(name) O.NeedReload() O.RebuildPage("profiles") end, SMALL)
  r.copy:SetPoint("RIGHT", r.delete, "LEFT", -6, 0)
end

-- Use, Copy here and Delete, right to left. None on the profile that will be in use after the reload;
-- the one running until then (when a switch is staged) only gets Use, to take the switch back.
local function addProfileButtons(r, name)
  if name == ns.SelectedProfileName() then return end
  if name ~= ns.ProfileName() then addEditButtons(r, name) end
  r.use = W.Primary(r, "Use", function() ns.UseProfile(name) O.NeedReload() O.RebuildPage("profiles") end, SMALL)
  if r.copy then r.use:SetPoint("RIGHT", r.copy, "LEFT", -6, 0) else r.use:SetPoint("RIGHT", -8, 0) end
end

-- A row with a caption on the left.
local function captioned(parent, width, text, color)
  local r = CreateFrame("Frame", nil, parent)
  r:SetSize(width, ROW)
  r.label = T.Text(r:CreateFontString(nil, "OVERLAY"), "label", color)
  r.label:SetPoint("LEFT", 8, 0)
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
  r.input:SetPoint("RIGHT", -(SMALL + 14), 0)
  r.input:SetScript("OnEnterPressed", function() create(r) end)
  r.create = W.Primary(r, "Create", function() create(r) end, SMALL)
  r.create:SetPoint("RIGHT", -8, 0)
  return r
end

O.AddRowKind("profile", profileRow, ROW)
O.AddRowKind("newprofile", newProfileRow, ROW + 4)
