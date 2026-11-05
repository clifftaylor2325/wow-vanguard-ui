-- TEST-ONLY Retail stubs, delves area (scripts/lib/wow-retail-core.lua says how these files run): the delve calls the
-- tracker reads, checked against Blizzard's live docs (wow-ui-source, live branch, DelvesUIDocumentation.lua), and the
-- delve windows. world.loadDelves(addon) builds the windows that part of the game makes, shaped after Blizzard's live
-- source (Blizzard_DelvesCompanionConfiguration, Blizzard_DelvesDifficultyPicker), with only the parts the skins
-- reach: global names and parentKeys as the game has them. A test then fires ADDON_LOADED.

local world = __wfgWorld

-- world.delveTier: the tier of the delve you are in (a number, or a secret one), nil outside a delve.
world.delveTier = nil

C_DelvesUI = {
  -- Whether the party has an active delve.
  HasActiveDelve = function() return world.delveTier ~= nil end,
  -- The active delve's TieredEntranceTierInfo (its tier 0 outside one, as the client answers).
  GetActiveDelveTier = function() return { tier = world.delveTier or 0, suggestedILvl = 0, unlocked = true, tierDescription = "", rewards = {} } end,
}

-- world.delveWidgets: the widgets of the scenario step's widget set (UIWidgetInfo: widgetID, widgetType), and
-- world.delveHeader: the ScenarioHeaderDelvesWidgetVisualizationInfo they answer (shownState, currencies, spells,
-- rewardInfo), both nil outside a delve (UIWidgetManagerDocumentation.lua).
world.delveWidgets, world.delveHeader = nil, nil

C_UIWidgetManager = {
  -- The widgets of a widget set, by its id.
  GetAllWidgetsBySetID = function(setID) return setID == ((world.scenario or {}).step or {}).widgetSetID and world.delveWidgets or {} end,
  -- The delve header widget's info, nil for any other widget id.
  GetScenarioHeaderDelvesWidgetVisualizationInfo = function(widgetID) return widgetID == 77 and world.delveHeader or nil end,
}

-- A piece of game art on a frame, marked so a test can tell it from Vanguard's.
local function art(parent, layer)
  local t = parent:CreateTexture(nil, layer or "BACKGROUND")
  t:SetTexture("TEST-ONLY-ART")
  return t
end

-- A window from PortraitFrameTemplate or ButtonFrameTemplate: its art, NineSlice, portrait, close button and title
-- (wow-retail-professions.lua, which runs after this file, builds its windows with it too).
function world.portraitWindow(name)
  local f = CreateFrame("Frame", name, UIParent)
  art(f)
  f.NineSlice = CreateFrame("Frame", nil, f)
  art(f.NineSlice, "BORDER")
  f.PortraitContainer = CreateFrame("Frame", nil, f)
  f.CloseButton = CreateFrame("Button", name .. "CloseButton", f)
  f.TitleContainer = CreateFrame("Frame", nil, f)
  f.TitleContainer.TitleText = f.TitleContainer:CreateFontString(nil, "OVERLAY")
  f:Hide()
  return f
end

-- A MinimalScrollBar: a track with a thumb (wow-retail-professions.lua uses it too).
function world.scrollBar(parent)
  local bar = CreateFrame("Frame", nil, parent)
  bar.Track = CreateFrame("Frame", nil, bar)
  bar.Thumb = CreateFrame("Button", nil, bar.Track)
  art(bar.Track)
  return bar
end

-- A window round a painted scene (InsetFrameTemplate with a DialogBorderTemplate border): its scene, its dark fill,
-- the border's art and the close button.
local function sceneWindow(name)
  local f = CreateFrame("Frame", name, UIParent)
  f.Bg, f.Background = art(f), art(f, "ARTWORK")
  f.Border = CreateFrame("Frame", nil, f)
  art(f.Border, "BORDER")
  f.CloseButton = CreateFrame("Button", nil, f)
  f:Hide()
  return f
end

-- A companion slot (CompanionConfigSlotTemplate): its label over its value.
local function slot(parent)
  local s = CreateFrame("Button", nil, parent)
  s.Label, s.Value = s:CreateFontString(nil, "ARTWORK"), s:CreateFontString(nil, "ARTWORK")
  return s
end

-- The companion's ability list (PortraitFrameTemplate) with its role dropdown and its pager (PagingControlsHorizontalTemplate).
local function abilityList()
  local list = world.portraitWindow("DelvesCompanionAbilityListFrame")
  list.DelvesCompanionRoleDropdown = CreateFrame("Button", nil, list)
  local pager = CreateFrame("Frame", nil, list)
  pager.PrevPageButton, pager.NextPageButton = CreateFrame("Button", nil, pager), CreateFrame("Button", nil, pager)
  pager.PageText = pager:CreateFontString(nil, "OVERLAY")
  list.DelvesCompanionAbilityListPagingControls = pager
end

-- The windows each part of the game makes, by its name.
local BUILDERS = {
  -- The companion window with its four slots and abilities button, and its ability list.
  Blizzard_DelvesCompanionConfiguration = function()
    local f = sceneWindow("DelvesCompanionConfigurationFrame")
    f.CompanionSlots = CreateFrame("Frame", nil, f)
    for _, key in ipairs({ "CompanionCombatRoleSlot", "CompanionFlavorSlot", "CompanionCombatTrinketSlot", "CompanionUtilityTrinketSlot" }) do
      f.CompanionSlots[key] = slot(f.CompanionSlots)
    end
    f.CompanionConfigShowAbilitiesButton = CreateFrame("Button", nil, f)
    abilityList()
  end,
  -- The picker at a delve's door: its tier dropdown, Enter button and the rewards' scroll bar.
  Blizzard_DelvesDifficultyPicker = function()
    local f = sceneWindow("DelvesDifficultyPickerFrame")
    f.Dropdown, f.EnterDelveButton = CreateFrame("Button", nil, f), CreateFrame("Button", nil, f)
    f.DelveRewardsContainerFrame = CreateFrame("Frame", nil, f)
    f.DelveRewardsContainerFrame.ScrollBar = world.scrollBar(f.DelveRewardsContainerFrame)
  end,
}

-- Builds the windows one part of the game makes (the test fires its ADDON_LOADED after).
function world.loadDelves(addon)
  BUILDERS[addon]()
end
