-- TEST-ONLY Retail stubs, game windows area (Modules/RetailWindows.lua). Run on a Retail world only, before the
-- addon loads (see wow-retail-core.lua). It builds nothing by itself: __wfgRetailWindows.build(name) builds one of
-- the mainline windows below with the parts the skins reach, each at its place in Blizzard's live XML
-- (Blizzard_GroupFinder/Mainline PVEFrame.xml, LFDFrame.xml and LFGList.xml, Shared/RaidFinder.xml,
-- Blizzard_PVPUI/Mainline, Blizzard_EncounterJournal/Mainline, Blizzard_FriendsFrame/Mainline and
-- Blizzard_UIPanels_Game/Mainline CharacterFrame.xml and PaperDollFrame.xml), so a test shows it and reads it.
-- The art is "TEST-ONLY-ART" and the game's font "TEST-ONLY-GAME", as the windows tests' own models use.

local W = {}
__wfgRetailWindows = W

-- A texture of the game's art on f (a global of that name when given one).
local function art(f, name)
  local t = f:CreateTexture(name, "BACKGROUND")
  t:SetTexture("TEST-ONLY-ART")
  return t
end

-- A font string in the game's font on f (a global of that name when given one).
local function text(f, name)
  local fs = f:CreateFontString(name, "OVERLAY")
  fs:SetFont("TEST-ONLY-GAME", 12, "")
  fs:SetText("TEST-ONLY")
  return fs
end

-- An InsetFrameTemplate well: its background and its nine-slice edge.
local function well(parent, name)
  local f = CreateFrame("Frame", name, parent)
  art(f)
  f.NineSlice = CreateFrame("Frame", nil, f)
  art(f.NineSlice)
  return f
end

-- A PortraitFrameTemplate or ButtonFrameTemplate window: its art, edge, inset, portrait, close button and title.
local function window(name)
  local f = CreateFrame("Frame", name, UIParent)
  art(f)
  f.NineSlice, f.Inset = well(f), well(f)
  f.PortraitContainer = CreateFrame("Frame", nil, f)
  f.CloseButton = CreateFrame("Button", name .. "CloseButton", f)
  f.TitleContainer = CreateFrame("Frame", nil, f)
  f.TitleContainer.TitleText = text(f.TitleContainer)
  f:Hide()
  return f
end

-- A push button, with the art of its template.
local function button(parent, name)
  local b = CreateFrame("Button", name, parent)
  art(b)
  return b
end

-- A category card (GroupFinderGroupButtonTemplate's bg, ring, icon and name; PVPQueueFrameButtonTemplate's are
-- capitalised).
local function card(parent, name, capital)
  local b = CreateFrame("Button", name, parent)
  b[capital and "Background" or "bg"], b[capital and "Ring" or "ring"] = art(b), art(b)
  b[capital and "Icon" or "icon"], b[capital and "Name" or "name"] = art(b), text(b)
  return b
end

-- How each kind of part is made on its parent (name: its global name, or nil).
local MAKERS = {
  texture = art,
  frame = function(parent, name) local f = CreateFrame("Frame", name, parent) art(f) return f end,
  well = well, button = button, text = text,
  card = function(parent, name) return card(parent, name, false) end,
  bigCard = function(parent, name) return card(parent, name, true) end,
  plate = function(parent, name) local b = button(parent, name) b.Icon = art(b) return b end,
  dropdown = function(parent, name) local b = button(parent, name) b.Arrow = art(b) return b end,
  search = function(parent, name) local b = CreateFrame("EditBox", name, parent) art(b) b.searchIcon, b.Instructions = art(b), text(b) return b end,
  edit = function(parent, name) local b = CreateFrame("EditBox", name, parent) art(b) return b end,
  check = function(parent, name) local b = CreateFrame("CheckButton", name, parent) art(b) return b end,
  header = function(parent, name) local b = CreateFrame("Button", name, parent) b.Left, b.Middle, b.Right, b.Text = art(b), art(b), art(b), text(b) return b end,
}

-- The frame at the start of a path: the global of that name, made as a plain frame when missing.
local function root(name)
  if not _G[name] then CreateFrame("Frame", name, UIParent) end
  return _G[name]
end

-- Makes the part at a dotted path ("LFGListFrame.SearchPanel.SearchBox", or a global name) with the maker of
-- that kind; the frames on the way are made as plain frames where missing.
local function place(path, kind)
  local keys = {}
  for key in string.gmatch(path, "[^.]+") do keys[#keys + 1] = key end
  if #keys == 1 then return MAKERS[kind](UIParent, path) end
  local parent = root(keys[1])
  for i = 2, #keys - 1 do parent[keys[i]] = parent[keys[i]] or CreateFrame("Frame", nil, parent) parent = parent[keys[i]] end
  parent[keys[#keys]] = MAKERS[kind](parent)
  return parent[keys[#keys]]
end

-- Makes every part of a model: kind -> its paths.
local function build(model)
  for kind, paths in pairs(model) do
    for _, path in ipairs(paths) do place(path, kind) end
  end
end

-- The windows, by name: the window itself (made first, when it is one) and its parts by kind. The pages that keep
-- the game's parchment (the reward pages, the journal's pages) are made too, so a test sees they stay.
W.MODELS = {
  PVEFrame = { window = true, parts = {
    texture = { "LFDParentFrameRoleBackground", "LFDQueueFrameBackground", "RaidFinderFrameRoleBackground", "RaidFinderQueueFrameBackground" },
    well = { "LFDParentFrameInset", "RaidFinderFrameRoleInset", "RaidFinderFrameBottomInset", "LFGListFrame.SearchPanel.ResultsInset", "LFGListFrame.ApplicationViewer.Inset" },
    card = { "GroupFinderFrame.groupButton1", "GroupFinderFrame.groupButton2", "GroupFinderFrame.groupButton3", "GroupFinderFrame.groupButton4" },
    button = { "LFDQueueFrameFindGroupButton", "RaidFinderFrameFindRaidButton", "LFGListFrame.CategorySelection.FindGroupButton", "LFGListFrame.EntryCreation.ListGroupButton" },
    plate = { "LFGListFrame.SearchPanel.RefreshButton" },
    dropdown = { "LFDQueueFrameTypeDropdown", "RaidFinderQueueFrameSelectionDropdown", "LFGListFrame.SearchPanel.FilterButton", "LFGListFrame.EntryCreation.ActivityDropdown" },
    search = { "LFGListFrame.SearchPanel.SearchBox" },
    edit = { "LFGListFrame.EntryCreation.Name" },
    text = { "LFDQueueFrameTypeDropdownName", "LFGListFrame.EntryCreation.NameLabel" },
  } },
  PVPUIFrame = { parts = {
    well = { "PVPQueueFrame.HonorInset", "HonorFrame.Inset", "ConquestFrame.Inset" },
    bigCard = { "PVPQueueFrame.CategoryButton1", "PVPQueueFrame.CategoryButton2", "PVPQueueFrame.CategoryButton3" },
    button = { "HonorFrame.QueueButton", "ConquestFrame.JoinButton" },
    dropdown = { "HonorFrame.TypeDropdown" },
  } },
  LFGListInviteDialog = { parts = {
    button = { "LFGListInviteDialog.AcceptButton", "LFGListInviteDialog.DeclineButton", "LFGListInviteDialog.AcknowledgeButton" },
  } },
  EncounterJournal = { window = true, parts = {
    well = { "EncounterJournal.inset", "EncounterJournal.navBar" },
    texture = { "EncounterJournal.instanceSelect.bg", "EncounterJournal.encounter.info.BG" },
    dropdown = { "EncounterJournal.instanceSelect.ExpansionDropdown", "EncounterJournal.encounter.info.difficulty" },
    search = { "EncounterJournal.searchBox" },
  } },
  FriendsFrame = { window = true, parts = {
    well = { "WhoFrameListInset" },
    header = { "WhoFrameColumnHeader1", "WhoFrameColumnHeader2" },
    button = { "WhoFrameWhoButton", "WhoFrameAddFriendButton" },
    dropdown = { "WhoFrameDropdown" },
    search = { "WhoFrameEditBox" },
  } },
  CharacterFrame = { window = true, parts = {
    well = { "CharacterFrameInsetRight" },
    texture = { "CharacterStatsPane.ClassBackground" },
  } },
}

-- A frame pool as the game's CreateFramePool keeps it: Acquire makes (or reuses) a frame, EnumerateActive lists them.
local function pool(parent, make)
  local p = { active = {} }
  -- Makes one more active frame.
  function p:Acquire() local f = make(parent) self.active[#self.active + 1] = f return f end
  -- The active frames, one by one.
  function p:EnumerateActive() local i = 0 return function() i = i + 1 return self.active[i] end end
  return p
end

-- A stat line (CharacterStatFrameTemplate): its zebra stripe and its name.
local function statLine(parent)
  local f = CreateFrame("Frame", nil, parent)
  f.Background, f.Label = art(f), text(f)
  return f
end

-- The mainline pane's own parts beyond the model: the stats side's line pool with one line, the update that adds a
-- line (PaperDollFrame_UpdateStats), and the model scene with its race picture, overlay and inner border.
local function characterExtras()
  CharacterStatsPane.statsFramePool = pool(CharacterStatsPane, statLine)
  CharacterStatsPane.statsFramePool:Acquire()
  -- The game's stat update: here it adds one more line.
  PaperDollFrame_UpdateStats = function() CharacterStatsPane.statsFramePool:Acquire() end
  local scene = CreateFrame("Frame", "CharacterModelScene", UIParent)
  scene.BackgroundTopLeft, scene.BackgroundBotRight = art(scene), art(scene)
  scene.BackgroundOverlay = art(scene)
  scene.InnerBorder = art(scene)
end

-- The EncounterJournal's bottom tabs (its Tabs array, as its OnLoad sets it; PanelTabButtonTemplate's three pieces).
local function journalTabs()
  EncounterJournal.Tabs = {}
  for i = 1, 3 do
    local tab = button(EncounterJournal)
    tab.Left, tab.Middle, tab.Right = art(tab), art(tab), art(tab)
    EncounterJournal.Tabs[i] = tab
  end
end

-- The premade groups' invite dialog's own regions (LFGList.xml: a plain dialog, no ButtonFrameTemplate): the role
-- picture on its ARTWORK layer (its content), its text lines, and its Border child (DialogBorderTemplate) with art.
local function inviteDialog()
  local f = LFGListInviteDialog
  f.RoleIcon = f:CreateTexture(nil, "ARTWORK")
  f.RoleIcon:SetTexture("TEST-ONLY-ART")
  f.Label, f.GroupName, f.ActivityName, f.Role = text(f), text(f), text(f), text(f)
  f.Border = CreateFrame("Frame", nil, f)
  art(f.Border)
  f:Hide()
end

-- What a window has beyond its parts, by name.
local EXTRAS = { CharacterFrame = characterExtras, EncounterJournal = journalTabs, LFGListInviteDialog = inviteDialog }

-- Builds one window of W.MODELS: the window (when it is one), its parts and its extras.
function W.build(name)
  local model = W.MODELS[name]
  if model.window then window(name) else root(name) end
  build(model.parts)
  if EXTRAS[name] then EXTRAS[name]() end
  return _G[name]
end
