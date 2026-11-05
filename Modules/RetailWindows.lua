-- Game windows, Retail only: the windows WoW Forever lacks or draws another way, in the Vanguard look
-- (Modules/Windows.lua has the window skin, Modules/WindowsTabs.lua the tabs, scroll bars and the
-- character pane's inside). The group finder (its dungeon, raid and premade group pages, and its PvP tab once
-- that part of the game loads), the premade groups' two dialogs and the Adventure Guide get the Vanguard look
-- under a switch of their own; the mainline character pane's own parts join the pane's inside (the tabs
-- switch), and the friends window's Who tab joins the friends window (the windows switch).
--
-- Each window's parts are data (GW.RETAIL_PARTS) dressed one by one under ns.Try: a part this client draws
-- another way is reported by its path, and the rest of the window, and the game's own look of that part, stay.
-- Pages that print the game's dark quest text (the dungeon and raid finders' reward pages, the Adventure
-- Guide's journal) keep the game's parchment. The file loads on Retail only (its TOC line's game-type tags);
-- WoW Forever never reads it.

local ADDON, ns = ...
local L = ns.L

local T = ns.Theme
local O = ns.Options

local GW = ns.GetModule("Windows")

-- The Retail windows' switch, a group of its own beside the other game window groups, on by default.
GW.defaults.finder = true
table.insert(GW.GROUPS, "finder")

-- The order a window's parts are dressed in: the art first, then the controls, then the texts.
GW.RETAIL_STEPS = {
  "fade", "inset", "scene", "card", "header", "button", "plate", "dropdown", "search", "edit", "check", "money", "heading", "label",
  "note",
}

-- Each Retail window's parts by step, as dotted paths from the globals (Blizzard's Mainline XML; a path the
-- client lacks is skipped). The group finder's own blue art is the window's and fades with it.
GW.RETAIL_PARTS = {
  PVEFrame = {
    fade = { "LFDParentFrameRoleBackground", "LFDParentFrame.TopTileStreaks", "RaidFinderFrameRoleBackground", "PVEFrame.shadows" },
    inset = {
      "LFDParentFrameInset", "RaidFinderFrameRoleInset", "RaidFinderFrameBottomInset",
      "LFGListFrame.SearchPanel.ResultsInset", "LFGListFrame.ApplicationViewer.Inset",
    },
    card = { "GroupFinderFrame.groupButton1", "GroupFinderFrame.groupButton2", "GroupFinderFrame.groupButton3", "GroupFinderFrame.groupButton4" },
    button = {
      "LFDQueueFrameFindGroupButton", "RaidFinderFrameFindRaidButton", "RaidFinderQueueFrameIneligibleFrameLeaveQueueButton",
      "LFGListFrame.CategorySelection.FindGroupButton", "LFGListFrame.CategorySelection.StartGroupButton",
      "LFGListFrame.SearchPanel.BackButton", "LFGListFrame.SearchPanel.BackToGroupButton", "LFGListFrame.SearchPanel.SignUpButton",
      "LFGListFrame.ApplicationViewer.RemoveEntryButton", "LFGListFrame.ApplicationViewer.EditButton",
      "LFGListFrame.ApplicationViewer.BrowseGroupsButton", "LFGListFrame.EntryCreation.ListGroupButton", "LFGListFrame.EntryCreation.CancelButton",
    },
    plate = { "LFGListFrame.SearchPanel.RefreshButton", "LFGListFrame.ApplicationViewer.RefreshButton" },
    dropdown = {
      "LFDQueueFrameTypeDropdown", "RaidFinderQueueFrameSelectionDropdown", "LFGListFrame.SearchPanel.FilterButton",
      "LFGListFrame.EntryCreation.GroupDropdown", "LFGListFrame.EntryCreation.ActivityDropdown", "LFGListFrame.EntryCreation.PlayStyleDropdown",
    },
    search = { "LFGListFrame.SearchPanel.SearchBox" },
    edit = { "LFGListFrame.EntryCreation.Name" },
    label = {
      "LFDQueueFrameTypeDropdownName", "RaidFinderQueueFrameSelectionDropdownName",
      "LFGListFrame.EntryCreation.NameLabel", "LFGListFrame.EntryCreation.DescriptionLabel",
    },
  },
  -- The PvP tab (Blizzard_PVPUI), shown inside the group finder: its category cards, queue pages and buttons.
  PVPUIFrame = {
    inset = { "PVPQueueFrame.HonorInset", "HonorFrame.Inset", "ConquestFrame.Inset", "TrainingGroundsFrame.Inset" },
    card = {
      "PVPQueueFrame.CategoryButton1", "PVPQueueFrame.CategoryButton2", "PVPQueueFrame.CategoryButton3",
      "PVPQueueFrame.CategoryButton4", "PVPQueueFrame.CategoryButton5",
    },
    button = { "HonorFrame.QueueButton", "ConquestFrame.JoinButton", "TrainingGroundsFrame.QueueButton" },
    dropdown = { "HonorFrame.TypeDropdown", "TrainingGroundsFrame.TypeDropdown" },
  },
  -- The premade groups' sign-up and invite dialogs.
  LFGListApplicationDialog = { button = { "LFGListApplicationDialog.SignUpButton", "LFGListApplicationDialog.CancelButton" } },
  LFGListInviteDialog = {
    button = { "LFGListInviteDialog.AcceptButton", "LFGListInviteDialog.DeclineButton", "LFGListInviteDialog.AcknowledgeButton" },
  },
  -- The Adventure Guide (Blizzard_EncounterJournal): its inset, the breadcrumb bar, search box and dropdowns. The
  -- journal's pages and pictures are content and stay the game's.
  EncounterJournal = {
    inset = { "EncounterJournal.inset", "EncounterJournal.navBar" },
    dropdown = {
      "EncounterJournal.LootJournalViewDropdown", "EncounterJournal.instanceSelect.ExpansionDropdown",
      "EncounterJournal.encounter.info.difficulty", "EncounterJournal.encounter.info.LootContainer.filter",
      "EncounterJournal.encounter.info.LootContainer.slotFilter",
    },
    search = { "EncounterJournal.searchBox" },
  },
  -- The friends window's Who tab (Retail's; WoW Forever lists players in its group finder).
  WhoFrame = {
    inset = { "WhoFrameListInset" },
    header = { "WhoFrameColumnHeader1", "WhoFrameColumnHeader2", "WhoFrameColumnHeader3", "WhoFrameColumnHeader4" },
    button = { "WhoFrameGroupInviteButton", "WhoFrameAddFriendButton", "WhoFrameWhoButton" },
    dropdown = { "WhoFrameDropdown" },
    search = { "WhoFrameEditBox" },
    note = { "WhoFrameTotals" },
  },
  -- The mainline character pane's parts WoW Forever's pane lacks: the stats side's well and class picture, and the
  -- model's backdrop (its race picture, dark overlay and bronze inner border are regions of the model scene).
  CharacterFrame = {
    fade = { "CharacterStatsPane.ClassBackground" },
    inset = { "CharacterFrameInsetRight" },
    scene = { "CharacterModelScene" },
  },
}

-- The art of a category card (the group finder's and the PvP tab's: a blue plate and a gold ring round its icon).
GW.FINDER_CARD_ART = { "bg", "ring", "Background", "Ring" }
-- The art of a list's column header (WhoFrameColumnHeaderTemplate: three tab pieces).
GW.COLUMN_HEADER_ART = { "Left", "Middle", "Right" }

-- The character model's backdrop: its art faded for a flat inset panel, and its dark overlay kept faded when the
-- game sets its alpha for the race (SetPaperDollBackground). The model and its controls stay the game's.
local function dressScene(scene)
  GW.InsetPanel(scene)
  GW.KeepFaded(scene.BackgroundOverlay)
end

-- A category card: its plate and ring faded, its blue hover plate (the unkeyed highlight texture) too, a flat inset
-- panel behind it, its name (the game's gold) in the light text colour. The round icon stays the game's.
local function dressCard(card)
  GW.FadeParts(card, GW.FINDER_CARD_ART)
  if type(card.GetHighlightTexture) == "function" then GW.FadeFrame(card:GetHighlightTexture()) end
  T.Panel(card, { inset = true, noSheen = true })
  GW.SkinText(card.name or card.Name, "name", "text")
end

-- Marks the open category card of a Retail window (a key of GW.RETAIL_PARTS) with an accent border and gives the others
-- the theme's: the game shows the open one only by the texture coordinates of the plate this skin fades.
local function markOpenCard(key, index)
  for i, path in ipairs(GW.RETAIL_PARTS[key].card) do
    local card = GW.Part(_G, path)
    if card then T.SetBorder(card, i == index and { T.Accent() } or nil) end
  end
end

-- Follows the game's choice of the open card on the group finder's first page (marked now, as the game chose it
-- before this skin) and on the PvP tab.
local function watchOpenCards()
  local finder = _G.GroupFinderFrame
  GW.HookGlobalOnce("GroupFinderFrame_SelectGroupButton", "open group card", function(index) markOpenCard("PVEFrame", index) end)
  GW.HookGlobalOnce("PVPQueueFrame_SelectButton", "open PvP card", function(index) markOpenCard("PVPUIFrame", index) end)
  if type(finder) == "table" and finder.selectionIndex then markOpenCard("PVEFrame", finder.selectionIndex) end
end

-- A column header: its tab pieces faded and its caption in the small role and the quiet text colour.
local function dressHeader(header)
  GW.FadeParts(header, GW.COLUMN_HEADER_ART)
  GW.SkinText(header.Text, "small", "text2")
end

-- A label the game draws in its gold, in the label role and the light text colour.
local function lightLabel(fs)
  GW.SkinText(fs, "label", "text")
end

-- A quiet line the game draws in its gold (the Who list's "N players total"), in the small role and the quiet text
-- colour, as WoW Forever's Who list has it.
local function quietNote(fs)
  GW.SkinText(fs, "small", "text2")
end

-- A page's or a section's heading the game draws in its gold display font, in the heading role and the light text
-- colour.
local function lightHeading(fs)
  GW.SkinText(fs, "heading", "text")
end

-- What each step does to a part (the shared dressers are Modules/Windows.lua's; each skips what is not its kind).
local DRESSERS = {
  fade = GW.FadeFrame, inset = GW.InsetPanel, scene = dressScene, card = dressCard, header = dressHeader,
  button = GW.SkinButton, plate = GW.SkinPlate, dropdown = GW.SkinDropdown, search = GW.SkinSearch,
  edit = GW.SkinEditBox, check = GW.SkinCheck, money = GW.SkinMoney, heading = lightHeading, label = lightLabel,
  note = quietNote,
}

-- Dresses the parts listed for one window, step by step, each part under ns.Try named for its path: a part the
-- client lacks is skipped, one it draws another way is reported and leaves the others dressed.
---@param key string  a key of GW.RETAIL_PARTS
function GW.DressRetailParts(key)
  local parts = GW.RETAIL_PARTS[key]
  for _, step in ipairs(GW.RETAIL_STEPS) do
    for _, path in ipairs(parts[step] or {}) do
      local part = GW.Part(_G, path)
      if part then ns.Try("retail window " .. path, DRESSERS[step], part) end
    end
  end
end

-- A Retail window: the window skin (panel, close button, title, art faded), then its own parts (Modules/RetailVault.lua
-- and RetailLanding.lua register theirs with it too).
---@param frame table  a window named by a key of GW.RETAIL_PARTS
function GW.SkinRetailWindow(frame)
  GW.Skin(frame)
  GW.DressRetailParts(frame:GetName())
  watchOpenCards()
end

-- A page the game shows inside another window (the PvP tab, inside the group finder), or a screen of its own with no
-- window round it (the Trading Post): its own parts only.
---@param frame table  a frame named by a key of GW.RETAIL_PARTS
function GW.SkinRetailPage(frame)
  GW.DressRetailParts(frame:GetName())
  watchOpenCards()
end

-- The Adventure Guide anchors its first bottom tab again on every show (EncounterJournal_OnShow), so its tabs are moved
-- out past the panel again after each.
GW.TABS_REANCHORED.EncounterJournal = true
-- The premade group invite's role picture (tank, healer or damage, beside "Your role") is the dialog's content, kept
-- as the window skin fades the dialog's own textures.
GW.CONTENT_ART.LFGListInviteDialog = { "RoleIcon" }
GW.Add("finder", { "PVEFrame", "LFGListApplicationDialog", "LFGListInviteDialog" }, GW.SkinRetailWindow)
GW.AddOnDemand("finder", "Blizzard_PVPUI", { "PVPUIFrame" }, GW.SkinRetailPage)
GW.AddOnDemand("finder", "Blizzard_EncounterJournal", { "EncounterJournal" }, GW.SkinRetailWindow)

-- The friends window's inside on Retail: its Who tab (the window itself is a framed window, Modules/Windows.lua).
GW.INSIDES.FriendsFrame = function()
  GW.DressRetailParts("WhoFrame")
end

-- One stat line of the mainline stats side (made from the pane's pool on every update): its zebra stripe faded, so
-- the inset shows through, and its name (the game's gold) in the light text colour.
local function dressStatLine(line)
  GW.FadeParts(line, { "Background" })
  if type(line.Label) == "table" and line.Label.SetTextColor then T.Color(line.Label, "text") end
end

-- Every stat line the stats side shows now.
local function dressStatLines()
  local pane = _G.CharacterStatsPane
  if type(pane) == "table" then GW.EachActive(pane.statsFramePool, dressStatLine) end
end

-- What the character pane's inside is on both clients (Modules/WindowsTabs.lua).
local sharedPane = GW.INSIDE.CharacterFrame

-- The character pane's shared inside, then the mainline pane's own parts and its stat lines, now and after each
-- of the game's stat updates (hooked once).
GW.INSIDE.CharacterFrame = function()
  sharedPane()
  GW.DressRetailParts("CharacterFrame")
  dressStatLines()
  GW.HookGlobalOnce("PaperDollFrame_UpdateStats", "retail stat lines", dressStatLines)
end

-- The switch on the Game windows page, under the other game window groups.
ns.RetailRows(function()
  return { O.Check(L["Group finder, PvP and Adventure Guide windows (reload)"], O.ReloadSetting("Windows", "finder")) }
end)
