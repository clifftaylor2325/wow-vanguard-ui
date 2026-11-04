-- TEST-ONLY Retail stubs, housing area: Retail's housing windows, which load on demand (scripts/lib/wow-retail-core.lua
-- says how these files run). world.loadHousing(addon) builds the windows that part of the game makes, shaped after
-- Blizzard's live source (wow-ui-source, live branch, 12.1.5: Blizzard_HousingDashboard, Blizzard_HousingHouseFinder,
-- Blizzard_HouseEditor's StorageFrame, Blizzard_HousingTemplates' catalog, Blizzard_HousingModelPreview), with only
-- the parts the skin reaches: global names and parentKeys as the game has them. A test then fires ADDON_LOADED.

local world = __wfgWorld

-- A piece of game art on a frame, marked so a test can tell it from Vanguard's.
local function art(parent, layer)
  local t = parent:CreateTexture(nil, layer or "BACKGROUND")
  t:SetTexture("TEST-ONLY-ART")
  return t
end

-- A window from PortraitFrameTemplate or ButtonFrameTemplate: its art, NineSlice, portrait, close button and title.
local function window(name)
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

-- A MinimalScrollBar: a track with a thumb.
local function scrollBar(parent)
  local bar = CreateFrame("Frame", nil, parent)
  bar.Track = CreateFrame("Frame", nil, bar)
  bar.Thumb = CreateFrame("Button", nil, bar.Track)
  art(bar.Track)
  return bar
end

-- The decor catalog's parts (HousingCatalogFrameTemplate and the editor's storage share them) on frame.
local function catalog(frame)
  frame.Background = art(frame)
  frame.SearchBox = CreateFrame("EditBox", nil, frame)
  frame.Filters = CreateFrame("Frame", nil, frame)
  frame.Filters.FilterDropdown = CreateFrame("Button", nil, frame.Filters)
  frame.Categories = CreateFrame("Frame", nil, frame)
  frame.Categories.Background, frame.Categories.TopBorder = art(frame.Categories), art(frame.Categories, "ARTWORK")
  frame.OptionsContainer = CreateFrame("Frame", nil, frame)
  frame.OptionsContainer.ScrollBar = scrollBar(frame.OptionsContainer)
  return frame
end

-- The windows each part of the game makes, by its name.
local BUILDERS = {
  -- The dashboard: its house picker, the house info page, the catalog and the collection.
  Blizzard_HousingDashboard = function()
    local f = window("HousingDashboardFrame")
    f.HouseDropdown = CreateFrame("Frame", nil, f)
    f.HouseDropdown.Dropdown = CreateFrame("Button", nil, f.HouseDropdown)
    f.HouseInfoContent = CreateFrame("Frame", nil, f)
    f.CatalogContent = catalog(CreateFrame("Frame", nil, f))
    f.CollectionContent = CreateFrame("Frame", nil, f)
    f.CollectionContent.Background = art(f.CollectionContent)
  end,
  -- The house finder and its two plot tooltips.
  Blizzard_HousingHouseFinder = function()
    local f = window("HouseFinderFrame")
    f.SelectedPlotTooltip = CreateFrame("Frame", nil, f)
    f.SelectedPlotTooltip.NineSlice = CreateFrame("Frame", nil, f.SelectedPlotTooltip)
    CreateFrame("Frame", "HouseFinderHighlightedPlotTooltip", UIParent)
  end,
  -- The house editor, over the whole screen, with its decor storage.
  Blizzard_HouseEditor = function()
    local f = CreateFrame("Frame", "HouseEditorFrame", UIParent)
    f:SetAllPoints()
    f.StoragePanel = catalog(CreateFrame("Frame", nil, f))
    f:Hide()
  end,
  -- The decor preview window.
  Blizzard_HousingModelPreview = function() window("HousingModelPreviewFrame") end,
}

-- Builds the windows one part of the game makes (the test fires its ADDON_LOADED after).
function world.loadHousing(addon)
  BUILDERS[addon]()
end
