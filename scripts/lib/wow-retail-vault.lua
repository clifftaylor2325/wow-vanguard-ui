-- TEST-ONLY Retail stubs, Great Vault and expansion area (Modules/RetailVault.lua and RetailLanding.lua). Run on a
-- Retail world only, before the addon loads (see wow-retail-core.lua). It gives the client the vault's API
-- (C_WeeklyRewards, its row types and WeeklyRewards_ShowUI, the Blizzard_WeeklyRewards bootstrap's opener) over
-- __wfgRetailVault.slots and .reward, and the expansion page's minimap button (Blizzard_Minimap's Mainline XML).
-- __wfgRetailVault.build(name) builds one of the windows below with the parts the skins reach, each at its place in
-- Blizzard's live XML (Blizzard_WeeklyRewards.xml, Blizzard_ExpansionLandingPage and Blizzard_MidnightLandingPage.xml,
-- Blizzard_Transmog.xml, Blizzard_PerksProgram.xml), through the windows area's builder (wow-retail-windows.lua).

local V = { slots = {}, reward = false, opened = 0 }
__wfgRetailVault = V

-- The vault's row types (Enum.WeeklyRewardChestThresholdType; the numbers are the harness's own).
Enum.WeeklyRewardChestThresholdType = { None = 0, Activities = 1, RankedPvP = 2, Raid = 3, Concession = 5, World = 6 }

-- The vault's slots of one row type, in order (each { type, index, progress, threshold }).
local function slotsOf(kind)
  local out = {}
  for _, slot in ipairs(V.slots) do
    if kind == nil or slot.type == kind then out[#out + 1] = slot end
  end
  return out
end

C_WeeklyRewards = {
  GetActivities = slotsOf,
  HasAvailableRewards = function() return V.reward end,
}

-- The bootstrap's opener: counts each time the vault is opened.
function WeeklyRewards_ShowUI()
  V.opened = V.opened + 1
end

-- The expansion page's minimap button, where the game anchors it under the minimap cluster.
CreateFrame("Button", "ExpansionLandingPageMinimapButton", UIParent):SetPoint("TOPLEFT", UIParent, "TOPLEFT", -3, -150)

-- Where the transmog window's item list and model switches sit.
local ITEMS = "TransmogFrame.WardrobeCollection.TabContent.ItemsFrame."
local TOGGLES = "TransmogFrame.CharacterPreview.ToggleOptions."

-- The windows, by name, as the windows area's builder takes them: the window itself (made first, when it is one) and
-- its parts by kind. The parts that stay the game's (a row's picture, the character scene, the price buttons) are
-- made too, so a test sees they stay. A frame that holds other parts is made on the way to them (a plain frame) and
-- gets the game's art after (backed), so no part replaces another.
V.MODELS = {
  WeeklyRewardsFrame = { window = true, parts = {
    frame = { "WeeklyRewardsFrame.BorderContainer" },
    texture = {
      "WeeklyRewardsFrame.HeaderFrame.HeaderDivider", "WeeklyRewardsFrame.RaidFrame.Border", "WeeklyRewardsFrame.RaidFrame.Background",
      "WeeklyRewardsFrame.MythicFrame.Border", "WeeklyRewardsFrame.WorldFrame.Border",
    },
    button = { "WeeklyRewardsFrame.SelectRewardButton" },
    text = { "WeeklyRewardsFrame.HeaderFrame.Text", "WeeklyRewardsFrame.RaidFrame.Name", "WeeklyRewardsFrame.MythicFrame.Name" },
  } },
  ExpansionLandingPage = { parts = {} },
  TransmogFrame = { window = true, backed = { "TransmogFrame.OutfitCollection", "TransmogFrame.WardrobeCollection" }, parts = {
    texture = { "TransmogFrame.WardrobeCollection.TabContent.Border", "TransmogFrame.OutfitCollection.MoneyFrame.Background", "TransmogFrame.CharacterPreview.Background" },
    button = { "TransmogFrame.OutfitCollection.SaveOutfitButton" },
    dropdown = { ITEMS .. "FilterButton", ITEMS .. "WeaponDropdown" },
    search = { ITEMS .. "SearchBox" },
    check = { TOGGLES .. "HideIgnoredToggle.Checkbox", ITEMS .. "SecondaryAppearanceToggle.Checkbox" },
    text = { TOGGLES .. "HideIgnoredToggle.Text", ITEMS .. "ActiveSlotTitle", "TransmogFrame.OutfitCollection.MoneyFrame.Money.GoldButton.Text" },
  } },
  PerksProgramFrame = {
    backed = { "PerksProgramFrame.ProductsFrame.ProductsScrollBoxContainer", "PerksProgramFrame.ProductsFrame.PerksProgramShoppingCartFrame" }, parts = {
    frame = { "PerksProgramFrame.ProductsFrame.ProductsScrollBoxContainer.Border", "PerksProgramFrame.ProductsFrame.PerksProgramShoppingCartFrame.Background" },
    button = { "PerksProgramFrame.FooterFrame.LeaveButton", "PerksProgramFrame.FooterFrame.PurchaseButton" },
    dropdown = { "PerksProgramFrame.ProductsFrame.PerksProgramFilter" },
    text = { "PerksProgramFrame.ProductsFrame.PerksProgramShoppingCartFrame.Title" },
  } },
}

-- The frame at a dotted path from the globals.
local function at(path)
  local obj = _G
  for key in string.gmatch(path, "[^.]+") do obj = obj[key] end
  return obj
end

-- Builds one window of V.MODELS (hidden, as the game keeps it until it opens), then the art of its backed frames.
function V.build(name)
  local model = V.MODELS[name]
  __wfgRetailWindows.MODELS[name] = model
  local f = __wfgRetailWindows.build(name)
  for _, path in ipairs(model.backed or {}) do at(path):CreateTexture(nil, "BACKGROUND"):SetTexture("TEST-ONLY-ART") end
  f:Hide()
  return f
end

-- The expansion page's overlay, as RefreshExpansionOverlay makes it (MidnightLandingOverlayTemplate): its painted
-- picture and border, its header's title and its close button.
function V.overlay()
  local page = ExpansionLandingPage
  local o = CreateFrame("Frame", nil, page.Overlay or page)
  o.Background, o.Border = o:CreateTexture(nil, "BACKGROUND"), o:CreateTexture(nil, "BORDER")
  o.Background:SetTexture("TEST-ONLY-ART") o.Border:SetTexture("TEST-ONLY-ART") o.Header = CreateFrame("Frame", nil, o)
  o.Header.Title = o.Header:CreateFontString(nil, "OVERLAY")
  o.Header.Title:SetFont("TEST-ONLY-GAME", 27, "")
  o.CloseButton = CreateFrame("Button", nil, o)
  o.CloseButton:SetPoint("TOPRIGHT", o, "TOPRIGHT", -4, -4)
  page.overlayFrame = o
  return o
end
