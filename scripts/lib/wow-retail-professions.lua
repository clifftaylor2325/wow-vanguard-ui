-- TEST-ONLY Retail stubs, professions area (scripts/lib/wow-retail-core.lua says how these files run; this one runs after
-- wow-retail-delves.lua, whose world.portraitWindow and world.scrollBar it uses). world.loadProfessions(addon) builds
-- the windows that part of the game makes on Retail, shaped after Blizzard's live source (wow-ui-source, live branch,
-- 12.1.5: Blizzard_Professions' specialisation and crafting orders pages, Blizzard_ProfessionsBook,
-- Blizzard_ProfessionsCustomerOrders), with only the parts the skins reach. A test then fires ADDON_LOADED.

local world = __wfgWorld

-- A piece of game art on a frame, marked so a test can tell it from Vanguard's; named when name is given.
local function art(parent, name)
  local t = parent:CreateTexture(name, "BACKGROUND")
  t:SetTexture("TEST-ONLY-ART")
  return t
end

-- A frame under parent[key] with a piece of art of its own (a divider, a footer strip, a plate).
local function artFrame(parent, key)
  parent[key] = CreateFrame("Frame", nil, parent)
  art(parent[key])
  return parent[key]
end

-- A push button under each key on parent.
local function buttons(parent, keys)
  for _, key in ipairs(keys) do parent[key] = CreateFrame("Button", nil, parent) end
end

-- A well (an inset list or panel): its art and its NineSlice frame.
local function well(parent, key)
  local f = artFrame(parent, key)
  f.NineSlice = CreateFrame("Frame", nil, f)
  art(f.NineSlice)
  return f
end

-- A money display (MoneyDisplayFrameTemplate): a figure for each coin.
local function moneyDisplay(parent, key)
  local f = CreateFrame("Frame", nil, parent)
  for _, coin in ipairs({ "GoldDisplay", "SilverDisplay", "CopperDisplay" }) do
    f[coin] = CreateFrame("Frame", nil, f)
    f[coin].Text = f[coin]:CreateFontString(nil, "OVERLAY")
  end
  parent[key] = f
  return f
end

-- The specialisation page (ProfessionsSpecPageTemplate): its dividers, footer, push buttons and detail view.
local function specPage(window)
  local page = CreateFrame("Frame", nil, window)
  for _, key in ipairs({ "VerticalDivider", "TopDivider", "PanelFooter" }) do artFrame(page, key) end
  buttons(page, { "ApplyButton", "UnlockTabButton", "ViewTreeButton", "BackToPreviewButton", "ViewPreviewButton", "BackToFullTreeButton" })
  page.DetailedView = CreateFrame("Frame", nil, page)
  buttons(page.DetailedView, { "SpendPointsButton", "UnlockPathButton" })
  window.SpecPage = page
end

-- The orders page's browse side: the order type tabs, the recipe list, the push buttons and the order list.
local function browseFrame(page)
  local browse = CreateFrame("Frame", nil, page)
  buttons(browse, { "PublicOrdersButton", "GuildOrdersButton", "NpcOrdersButton", "PersonalOrdersButton", "SearchButton", "BackButton", "FavoritesSearchButton" })
  local recipes = well(browse, "RecipeList")
  recipes.FilterDropdown, recipes.SearchBox = CreateFrame("Button", nil, recipes), CreateFrame("EditBox", nil, recipes)
  well(browse, "OrderList").ScrollBar = world.scrollBar(browse.OrderList)
  artFrame(browse, "OrdersRemainingDisplay")
  page.BrowseFrame = browse
end

-- The orders page's order view: its info side (buttons, money lines), its details with the recipe form, its buttons.
local function orderView(page)
  local view = CreateFrame("Frame", nil, page)
  local info = well(view, "OrderInfo")
  buttons(info, { "BackButton", "StartOrderButton", "DeclineOrderButton", "ReleaseOrderButton" })
  for _, key in ipairs({ "CommissionTitleMoneyDisplayFrame", "ConsortiumCutMoneyDisplayFrame", "FinalTipMoneyDisplayFrame" }) do moneyDisplay(info, key) end
  well(view, "OrderDetails").SchematicForm = CreateFrame("Frame", nil, view.OrderDetails)
  view.OrderDetails.MinimumQualityIcon = view.OrderDetails:CreateTexture(nil, "OVERLAY")
  buttons(view, { "CreateButton", "CompleteOrderButton", "StartRecraftButton", "StopRecraftButton" })
  page.OrderView = view
end

-- A profession row of the book (PrimaryProfessionTemplate, SecondaryProfessionTemplate): its skill bar and texts.
local function bookRow(book, name)
  local row = CreateFrame("Frame", name, book)
  row.statusBar = CreateFrame("StatusBar", nil, row)
  art(row.statusBar)
  for _, key in ipairs({ "professionName", "missingHeader", "missingText", "rank" }) do row[key] = row:CreateFontString(nil, "ARTWORK") end
end

-- The windows each part of the game makes, by its name.
local BUILDERS = {
  -- The professions window with the Retail pages (its crafting page is the shared window's, wow-world.lua).
  Blizzard_Professions = function()
    local window = world.portraitWindow("ProfessionsFrame")
    specPage(window)
    window.OrdersPage = CreateFrame("Frame", nil, window)
    browseFrame(window.OrdersPage)
    orderView(window.OrdersPage)
  end,
  -- The profession book: its two parchment pages and its five profession rows.
  Blizzard_ProfessionsBook = function()
    local book = world.portraitWindow("ProfessionsBookFrame")
    art(book, "ProfessionsBookPage1") art(book, "ProfessionsBookPage2")
    for _, name in ipairs({ "PrimaryProfession1", "PrimaryProfession2", "SecondaryProfession1", "SecondaryProfession2", "SecondaryProfession3" }) do bookRow(book, name) end
  end,
  -- The crafting orders window: its money line's inset, gold edge and money display.
  Blizzard_ProfessionsCustomerOrders = function()
    local f = world.portraitWindow("ProfessionsCustomerOrdersFrame")
    well(f, "MoneyFrameInset")
    moneyDisplay(artFrame(f, "MoneyFrameBorder"), "MoneyFrame")
  end,
}

-- Builds the windows one part of the game makes (the test fires its ADDON_LOADED after).
function world.loadProfessions(addon)
  BUILDERS[addon]()
end
