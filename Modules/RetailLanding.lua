-- The expansion page and Retail's smaller windows, Retail only: the expansion landing page (Blizzard_ExpansionLandingPage)
-- and its minimap button, the transmog window (Blizzard_Transmog) and the Trading Post (Blizzard_PerksProgram), in the
-- Vanguard look under one switch of their own.
--
-- Each window's parts are data (GW.RETAIL_PARTS, dressed by Modules/RetailWindows.lua under ns.Try): a part this client
-- draws another way is reported by its path and the rest stays the game's. The expansion page's picture, the transmog
-- window's character scene and the Trading Post's showcase are content and stay as the game draws them. The landing
-- page's minimap button, which WoW Forever puts away, sits on the map's lower left corner. The catalog shop and the
-- skyriding vigor bar are left to the game. The file loads on Retail only (its TOC line's game-type tags); WoW Forever
-- never reads it.

local ADDON, ns = ...
local L = ns.L

local O = ns.Options

local GW = ns.GetModule("Windows")
local MM = ns.GetModule("Minimap")

-- The switch for these windows, a group of its own beside the other game window groups, on by default.
GW.defaults.expansion = true
table.insert(GW.GROUPS, "expansion")

-- The expansion page's button on the map: above the tracking button, smaller, as the group finder eye sits above the
-- addon compartment (on a round map, on the rim just above the tracking button).
table.insert(MM.LEFTOVERS, {
  paths = { { "ExpansionLandingPageMinimapButton" } }, point = "BOTTOMLEFT", x = 2, y = 42, scale = 0.6, angle = 195,
})

-- Where the transmog window's item list keeps its controls (Blizzard_Transmog.xml).
local ITEMS = "TransmogFrame.WardrobeCollection.TabContent.ItemsFrame."
-- Where the transmog window keeps its three model switches.
local TOGGLES = "TransmogFrame.CharacterPreview.ToggleOptions."

-- The expansion page: the newest expansion's overlay (the page makes it as it first refreshes), its painted border
-- faded and its title in the theme. Its picture stays.
GW.RETAIL_PARTS.ExpansionLandingPage = {
  fade = { "ExpansionLandingPage.overlayFrame.Border" },
  heading = { "ExpansionLandingPage.overlayFrame.Header.Title" },
}

-- The transmog window: the outfit list and the appearances on flat insets, the tab box's frame faded, the save button,
-- dropdowns, search box, check boxes and money line in the theme. The character scene and the slots stay the game's.
GW.RETAIL_PARTS.TransmogFrame = {
  fade = {
    "TransmogFrame.WardrobeCollection.TabContent.Background", "TransmogFrame.WardrobeCollection.TabContent.Border",
    "TransmogFrame.OutfitCollection.MoneyFrame.Background",
  },
  inset = { "TransmogFrame.OutfitCollection", "TransmogFrame.WardrobeCollection" },
  button = { "TransmogFrame.OutfitCollection.SaveOutfitButton" },
  dropdown = { ITEMS .. "FilterButton", ITEMS .. "WeaponDropdown", ITEMS .. "WeaponSheatheDropdown" },
  search = { ITEMS .. "SearchBox" },
  check = {
    TOGGLES .. "HideIgnoredToggle.Checkbox", TOGGLES .. "SheatheWeaponToggle.Checkbox", TOGGLES .. "PreviewedWeaponToggle.Checkbox",
    ITEMS .. "SecondaryAppearanceToggle.Checkbox",
  },
  money = { "TransmogFrame.OutfitCollection.MoneyFrame.Money" },
  heading = { ITEMS .. "ActiveSlotTitle" },
  label = {
    TOGGLES .. "HideIgnoredToggle.Text", TOGGLES .. "SheatheWeaponToggle.Text", TOGGLES .. "PreviewedWeaponToggle.Text",
    ITEMS .. "SecondaryAppearanceToggle.Text",
  },
}

-- The Trading Post (a screen of its own, with no window round it): the product list, the details and the cart on
-- flat insets in place of their painted frames, the filter and the footer's plain buttons themed. The buttons that
-- show a price (buy, and buy what is in the cart) stay the game's.
GW.RETAIL_PARTS.PerksProgramFrame = {
  fade = {
    "PerksProgramFrame.ProductsFrame.ProductsScrollBoxContainer.Border",
    "PerksProgramFrame.ProductsFrame.PerksProgramProductDetailsContainerFrame.Border",
    "PerksProgramFrame.ProductsFrame.PerksProgramShoppingCartFrame.Background",
  },
  inset = {
    "PerksProgramFrame.ProductsFrame.ProductsScrollBoxContainer", "PerksProgramFrame.ProductsFrame.PerksProgramProductDetailsContainerFrame",
    "PerksProgramFrame.ProductsFrame.PerksProgramShoppingCartFrame",
  },
  button = {
    "PerksProgramFrame.FooterFrame.LeaveButton", "PerksProgramFrame.FooterFrame.RefundButton",
    "PerksProgramFrame.FooterFrame.AddToCartButton", "PerksProgramFrame.FooterFrame.RemoveFromCartButton",
  },
  dropdown = { "PerksProgramFrame.ProductsFrame.PerksProgramFilter" },
  heading = { "PerksProgramFrame.ProductsFrame.PerksProgramShoppingCartFrame.Title" },
}

-- The expansion page: the window skin and its overlay's parts, and the overlay's close button (the page has none of
-- its own) in the theme, in the page's corner.
local function skinLanding(frame)
  GW.SkinRetailWindow(frame)
  GW.DressClose(frame, GW.Part(frame, "overlayFrame.CloseButton"))
end

GW.Add("expansion", { "ExpansionLandingPage" }, skinLanding)
GW.AddOnDemand("expansion", "Blizzard_Transmog", { "TransmogFrame" }, GW.SkinRetailWindow)
GW.AddOnDemand("expansion", "Blizzard_PerksProgram", { "PerksProgramFrame" }, GW.SkinRetailPage)

-- The switch on the Game windows page, under the other game window groups.
ns.RetailRows(function()
  return { O.Check(L["Expansion page, transmog and Trading Post windows (reload)"], O.ReloadSetting("Windows", "expansion")) }
end)
