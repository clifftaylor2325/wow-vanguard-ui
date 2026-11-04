-- Game windows, Retail's housing: the housing dashboard (house info, the decor catalog and the collection), the house
-- finder, the house editor's decor storage and the decor preview, in the Vanguard look, and the dashboard and finder
-- dragged by their title bar like the other game windows. Retail only (the TOC loads this file on Retail alone):
-- WoW Forever has no housing. Every housing window loads on demand, so each is registered with GW.AddOnDemand
-- (Modules/Windows.lua) under the "windows" group, and follows its switch under Game windows. The House micro button
-- keeps the place MenuStrip already gives it.
--
-- Frame names and parentKeys are read from Blizzard's live source (wow-ui-source, live branch, 12.1.5):
-- Blizzard_HousingDashboard, Blizzard_HousingHouseFinder, Blizzard_HouseEditor's StorageFrame,
-- Blizzard_HousingTemplates' catalog templates and Blizzard_HousingModelPreview. Every part is optional: a client
-- without one skips it. Decor tooltips are the game tooltip, which Tooltips already dresses; the house finder's plot
-- tooltip is its own frame and is dressed here.

local ADDON, ns = ...

local T = ns.Theme
local GW = ns.GetModule("Windows")

local RHo = {}
ns.RetailHousing = RHo

-- The decor catalog (the dashboard's Catalog tab and the editor's storage share its template): its parchment, the
-- category column's backdrop and brackets faded, the search box, filter button and scroll bar in the theme.
RHo.CATALOG_ART = { "Background" }
RHo.CATEGORY_ART = { "Background", "TopBorder" }

-- A decor catalog in the theme; a part this client lacks is skipped.
function RHo.SkinCatalog(catalog)
  if type(catalog) ~= "table" then return end
  GW.FadeParts(catalog, RHo.CATALOG_ART)
  GW.SkinSearch(catalog.SearchBox)
  GW.SkinDropdown(GW.Part(catalog, "Filters.FilterDropdown"))
  if type(catalog.Categories) == "table" then GW.FadeParts(catalog.Categories, RHo.CATEGORY_ART) end
  local bar = GW.Part(catalog, "OptionsContainer.ScrollBar")
  if bar then T.ScrollBar(bar) end
end

-- The housing dashboard: the window skin, the house picker, the catalog, and the collection's parchment faded (the
-- house info page's painted scene is content and stays).
function RHo.SkinDashboard(frame)
  GW.Skin(frame)
  GW.SkinDropdown(GW.Part(frame, "HouseDropdown.Dropdown"))
  RHo.SkinCatalog(frame.CatalogContent)
  if type(frame.CollectionContent) == "table" then GW.FadeParts(frame.CollectionContent, RHo.CATALOG_ART) end
end

-- The house finder: the window skin, and its plot tooltips (the selected plot's, and the one under the mouse on the map).
function RHo.SkinFinder(frame)
  GW.Skin(frame)
  for _, tip in ipairs({ frame.SelectedPlotTooltip, _G.HouseFinderHighlightedPlotTooltip }) do
    if type(tip) == "table" and tip.CreateTexture then T.Tooltip(tip) end
  end
end

-- The house editor covers the screen and draws the world through it, so only its decor storage panel is dressed: a
-- theme panel under the catalog in place of the chest art.
function RHo.SkinEditor(frame)
  local storage = frame.StoragePanel
  if type(storage) ~= "table" or not storage.CreateTexture then return end
  RHo.SkinCatalog(storage)
  T.Panel(storage)
end

GW.AddOnDemand("windows", "Blizzard_HousingDashboard", { "HousingDashboardFrame" }, RHo.SkinDashboard)
GW.AddOnDemand("windows", "Blizzard_HousingHouseFinder", { "HouseFinderFrame" }, RHo.SkinFinder)
GW.AddOnDemand("windows", "Blizzard_HouseEditor", { "HouseEditorFrame" }, RHo.SkinEditor)
GW.AddOnDemand("windows", "Blizzard_HousingModelPreview", { "HousingModelPreviewFrame" })

-- The dashboard and the finder are dragged by their title bar like the other game windows (WindowsMove.lua sets each
-- up when its part of the game loads).
for _, name in ipairs({ "HousingDashboardFrame", "HouseFinderFrame" }) do table.insert(GW.MOVABLE, name) end
