-- Professions on WoW Retail (the TOC keeps this file off WoW Forever): the pages of the professions window that
-- WoW Forever's lacks, and the profession windows it doesn't have, in the Vanguard look under the Game windows switch
-- for the character, merchant and other windows. Modules/Windows.lua dresses the window and its crafting page on
-- both clients; this file adds:
--   * the specialisation page: its dividers and footer faded, its push buttons in the theme (the tree, its painted
--     backdrop and the path dial are the page's content and stay the game's);
--   * the crafting orders page: the order type tabs, the recipe list's filter and search box, the order list on an
--     inset with a theme scroll bar, and an order's view (its info and details on insets, the recipe form as the
--     crafting page has it, the money lines and the push buttons);
--   * the profession book (its parchment pages faded, the skill bars flat, the names light) and the crafting orders
--     window you place an order at (the window skin and its money line), each dragged by its title bar.
-- Frame names and parentKeys are read from Blizzard's live source (wow-ui-source, live branch, 12.1.5):
-- Blizzard_Professions, Blizzard_ProfessionsBook and Blizzard_ProfessionsCustomerOrders. Every part is optional: a
-- client without one skips it, and a page that fails is reported by name and leaves the rest dressed.

local ADDON, ns = ...

local T = ns.Theme
local GW = ns.GetModule("Windows")

local RP = {}
ns.RetailProfessions = RP

-- The specialisation page ---------------------------------------------------------------------------

-- The page's art between its parts (the dividers and the footer strip), its push buttons, and the detail view's.
RP.SPEC_ART = { "VerticalDivider", "TopDivider", "PanelFooter" }
RP.SPEC_BUTTONS = { "ApplyButton", "UnlockTabButton", "ViewTreeButton", "BackToPreviewButton", "ViewPreviewButton", "BackToFullTreeButton" }
RP.PATH_BUTTONS = { "SpendPointsButton", "UnlockPathButton" }

-- The specialisation page (ProfessionsSpecPageTemplate): its dividers and footer faded and its push buttons themed.
function RP.SkinSpecPage(page)
  GW.FadeParts(page, RP.SPEC_ART)
  GW.EachKey(page, RP.SPEC_BUTTONS, GW.SkinButton)
  GW.EachKey(page.DetailedView, RP.PATH_BUTTONS, GW.SkinButton)
end

-- The crafting orders page ----------------------------------------------------------------------------

-- The browse side's order type tabs (public, guild, patron and personal orders) and push buttons.
RP.ORDER_TABS = { "PublicOrdersButton", "GuildOrdersButton", "NpcOrdersButton", "PersonalOrdersButton" }
RP.BROWSE_BUTTONS = { "SearchButton", "BackButton" }
-- An order's info side: its push buttons and money lines (the commission, the consortium's cut and your tip).
RP.INFO_BUTTONS = { "BackButton", "StartOrderButton", "DeclineOrderButton", "ReleaseOrderButton" }
RP.INFO_MONEY = { "CommissionTitleMoneyDisplayFrame", "ConsortiumCutMoneyDisplayFrame", "FinalTipMoneyDisplayFrame" }
-- The order view's own push buttons, under the recipe form.
RP.VIEW_BUTTONS = { "CreateButton", "CompleteOrderButton", "StartRecraftButton", "StopRecraftButton" }

-- One order type tab as a theme tab; a part that is no button is skipped.
local function skinOrderTab(tab)
  if type(tab) == "table" and tab.CreateTexture then T.Tab(tab) end
end

-- A list on an inset: its art and nine-slice faded for the inset panel, its scroll bar in the theme.
local function skinInsetList(list)
  GW.InsetPanel(list)
  local bar = type(list) == "table" and list.ScrollBar
  if type(bar) == "table" then T.ScrollBar(bar) end
end

-- The browse side: the tabs, the recipe list (as the crafting page has it: an inset, its filter, search box and rows), the push buttons, the
-- favourites button on the control tile, the order list, and the remaining-orders plate faded.
function RP.SkinBrowse(browse)
  GW.EachKey(browse, RP.ORDER_TABS, skinOrderTab)
  GW.SkinRecipeList(browse.RecipeList)
  GW.EachKey(browse, RP.BROWSE_BUTTONS, GW.SkinButton)
  GW.SkinPlate(browse.FavoritesSearchButton)
  skinInsetList(browse.OrderList)
  GW.FadeArt(browse.OrdersRemainingDisplay)
end

-- An order's view: its info side (an inset, push buttons, money lines), its details (an inset with the recipe form
-- in the crafting page's look; the minimum-quality icon keeps its picture, which the inset fade would hide and the
-- game never shows again) and its own push buttons.
function RP.SkinOrderView(view)
  local info = view.OrderInfo
  GW.InsetPanel(info)
  GW.EachKey(info, RP.INFO_BUTTONS, GW.SkinButton)
  GW.EachKey(info, RP.INFO_MONEY, GW.SkinMoneyDisplay)
  GW.InsetPanel(view.OrderDetails)
  GW.ShowTexture(GW.Part(view, "OrderDetails.MinimumQualityIcon"))
  GW.SkinSchematicForm(GW.Part(view, "OrderDetails.SchematicForm"))
  GW.EachKey(view, RP.VIEW_BUTTONS, GW.SkinButton)
end

-- The crafting orders page (ProfessionsCraftingOrderPageTemplate): its browse side and its order view.
function RP.SkinOrdersPage(page)
  if type(page.BrowseFrame) == "table" then ns.Try("professions orders list", RP.SkinBrowse, page.BrowseFrame) end
  if type(page.OrderView) == "table" then ns.Try("professions order view", RP.SkinOrderView, page.OrderView) end
end

-- What the professions window's inside is on both clients (its crafting page, Modules/Windows.lua).
local sharedInside = GW.INSIDES.ProfessionsFrame

-- The professions window's shared inside, then the Retail pages it has, each under ns.Try named for it.
GW.INSIDES.ProfessionsFrame = function(frame)
  sharedInside(frame)
  if type(frame.SpecPage) == "table" then ns.Try("professions specialisation page", RP.SkinSpecPage, frame.SpecPage) end
  if type(frame.OrdersPage) == "table" then ns.Try("professions orders page", RP.SkinOrdersPage, frame.OrdersPage) end
end

-- The profession book and the crafting orders window --------------------------------------------------

-- The book's two parchment pages (global textures), its profession rows, and each row's texts the game draws in ink
-- for the parchment (the name, and the heading and line a missing profession shows).
RP.BOOK_PAGES = { "ProfessionsBookPage1", "ProfessionsBookPage2" }
RP.BOOK_ROWS = { "PrimaryProfession1", "PrimaryProfession2", "SecondaryProfession1", "SecondaryProfession2", "SecondaryProfession3" }
RP.BOOK_TEXTS = { "professionName", "missingHeader", "missingText" }

-- One profession row of the book: its skill bar flat and its ink texts in the light text colour, at the game's sizes.
local function skinBookRow(row)
  if type(row) ~= "table" then return end
  GW.SkinProgress(row.statusBar)
  for _, key in ipairs(RP.BOOK_TEXTS) do
    local fs = row[key]
    if type(fs) == "table" and fs.SetTextColor then T.Color(fs, "text") end
  end
end

-- The profession book: the window skin, its pages faded and its rows dressed.
function RP.SkinBook(frame)
  GW.Skin(frame)
  GW.FadeNamed(RP.BOOK_PAGES)
  for _, name in ipairs(RP.BOOK_ROWS) do skinBookRow(_G[name]) end
end

-- The crafting orders window you place an order at: the window skin, and its money line on an inset (the gold edge
-- round it faded). Its pages stay the game's.
function RP.SkinCustomerOrders(frame)
  GW.Skin(frame)
  GW.InsetPanel(frame.MoneyFrameInset)
  GW.FadeArt(frame.MoneyFrameBorder)
  GW.SkinMoneyDisplay(GW.Part(frame, "MoneyFrameBorder.MoneyFrame"))
end

GW.AddOnDemand("windows", "Blizzard_ProfessionsBook", { "ProfessionsBookFrame" }, RP.SkinBook)
GW.AddOnDemand("windows", "Blizzard_ProfessionsCustomerOrders", { "ProfessionsCustomerOrdersFrame" }, RP.SkinCustomerOrders)

-- Both are dragged by their title bar like the other game windows (Modules/WindowsMove.lua).
for _, name in ipairs({ "ProfessionsBookFrame", "ProfessionsCustomerOrdersFrame" }) do table.insert(GW.MOVABLE, name) end
