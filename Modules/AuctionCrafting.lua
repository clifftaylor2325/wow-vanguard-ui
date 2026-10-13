-- Auction helper, crafting costs: beside the game's profession window, a
-- Vanguard panel prices the recipe on display from the auction prices
-- (Modules/AuctionPrices.lua): each reagent's cost (its count x its worth:
-- the market value on the day it was last seen, else its cheapest price,
-- AP.Worth), what they come to, what the crafted item fetches (its worth x
-- the average number made) and the profit, before the house's cut. Add
-- reagents raises Keep stocked (Errands' stockList, /vg stock) to what the
-- crafts typed beside it need, so a merchant who sells one tops you up, and
-- makes the Restock shopping list of what's short (Modules/AuctionRestock.lua).
--
-- On Forever the profession window is Blizzard_Professions (the modern one:
-- TRADE_SKILL_SHOW opens ProfessionsFrame), whose crafting page's recipe form
-- (ProfessionsFrame.CraftingPage.SchematicForm) is given each recipe it shows
-- through its Init(recipeInfo); the recipe's reagents and output come from
-- C_TradeSkillUI.GetRecipeSchematic. Nothing here writes into the game's
-- frames: the panel only anchors beside the window, and the only hooks are
-- post-hooks (the form's Init, OnShow and OnHide). Every count goes through
-- ns.PlainNumber before arithmetic.

local ADDON, ns = ...

local T, W, AP = ns.Theme, ns.Widgets, ns.AuctionPrices
local AH = ns.GetModule("AuctionHelper")

local CR = {}
AH.Crafting = CR

-- The panel shows unless switched off (Town and gear: Auction house).
AH.defaults.crafting = true

-- The panel's width, padding, row height (reagents) and line height (totals); its gap from the
-- window, wide enough to clear the window's side tabs; where the reagent rows start.
CR.WIDTH, CR.PAD, CR.ROW, CR.LINE, CR.GAP, CR.TOP = 240, 8, 20, 18, 52, -30
-- Reagent rows at most (vanilla recipes have up to six reagents).
CR.ROWS = 8
-- Enum.CraftingReagentType.Basic (ProfessionConstantsDocumentation.lua), for a client without the Enum.
CR.BASIC = 1
-- The total lines, by key and label.
CR.LINES = { { "cost", "Reagents" }, { "worth", "Sells for" }, { "profit", "Profit" } }

-- Reading the recipe -------------------------------------------------------------------------

-- A recipe's basic reagents, as { id, qty } per slot (optional and finishing reagents, a
-- currency and a hidden count are left out).
local function reagents(schematic)
  local out, basic = {}, (Enum.CraftingReagentType or {}).Basic or CR.BASIC
  for _, slot in ipairs(schematic.reagentSlotSchematics or {}) do
    local r, qty = slot.reagents and slot.reagents[1], ns.PlainNumber(slot.quantityRequired)
    local id = r and ns.PlainNumber(r.itemID)
    if ns.PlainNumber(slot.reagentType) == basic and id and qty and qty > 0 then out[#out + 1] = { id = id, qty = qty } end
  end
  return out
end

-- Prices a reagent (r.cost: its count x its worth, nil when it has no price) into the recipe's
-- total, or counts it unpriced.
local function price(data, r)
  local worth = AP.Worth(r.id)
  r.cost = worth and worth * r.qty
  if r.cost then data.cost = data.cost + r.cost else data.unpriced = data.unpriced + 1 end
end

-- The average number a recipe makes (quantityMin to quantityMax; 1 for a count the client hides).
local function made(schematic)
  return ((ns.PlainNumber(schematic.quantityMin) or 1) + (ns.PlainNumber(schematic.quantityMax) or 1)) / 2
end

-- A recipe priced: { name, output (its item ID; nil for an enchant), reagents = { { id, qty, cost } },
-- cost (the priced reagents' total), unpriced (how many have no price), worth (what the items made
-- fetch; nil without a price) }; nil when the client has no schematic for it.
function CR.Read(recipeID)
  local get = type(C_TradeSkillUI) == "table" and C_TradeSkillUI.GetRecipeSchematic
  local s = type(get) == "function" and get(recipeID, false)
  if type(s) ~= "table" then return nil end
  local data = { name = s.name, output = ns.PlainNumber(s.outputItemID), reagents = reagents(s), cost = 0, unpriced = 0 }
  for _, r in ipairs(data.reagents) do price(data, r) end
  local worth = data.output and AP.Worth(data.output)
  data.worth = worth and math.floor(worth * made(s))
  return data
end

-- The panel ----------------------------------------------------------------------------------

-- An item's name and icon, as the client has them (else "item 123" and the unknown icon).
local function itemLook(id)
  local name, _, _, _, _, _, _, _, _, icon = C_Item.GetItemInfo(id)
  return name or ("item " .. id), icon or AH.UNKNOWN_ICON
end

-- A reagent's row: its icon and name, "x2", and its cost ("no price" in muted).
local function paintReagent(r, reagent)
  r:SetShown(reagent ~= nil)
  if not reagent then return end
  local name, icon = itemLook(reagent.id)
  r.icon:SetTexture(icon)
  r.name:SetText(name)
  r.qty:SetText("x " .. reagent.qty)
  r.price:SetText(reagent.cost and AP.Money(reagent.cost) or "no price")
  T.Color(r.price, reagent.cost and "gold" or "muted")
end

-- A total line's value and colour: copper in gold (the profit in good or bad), else what's missing in muted.
local function totalText(data, key)
  local unpriced = data.unpriced > 0 and string.format("%d without a price", data.unpriced)
  if key == "cost" then return unpriced and ("at least " .. AP.Money(data.cost)) or AP.Money(data.cost), unpriced and "muted" or "gold" end
  if key == "worth" then return data.worth and AP.Money(data.worth) or (data.output and "no price" or "nothing to sell"), data.worth and "gold" or "muted" end
  if not data.worth or unpriced then return "needs every price", "muted" end
  local profit = data.worth - data.cost
  return (profit < 0 and "-" or "") .. AP.Money(math.abs(profit)), profit < 0 and "bad" or "good"
end

-- The total lines under the reagent rows (n of them shown), and the panel's height to fit.
local function paintTotals(f, data, n)
  local y = CR.TOP - n * CR.ROW - 4
  for i, l in ipairs(f.lines) do
    local text, color = totalText(data, l.key)
    l.label:SetPoint("TOPLEFT", CR.PAD, y - (i - 1) * CR.LINE)
    l.value:SetText(text)
    T.Color(l.value, color)
  end
  f:SetHeight(-y + #f.lines * CR.LINE + 8 + 24 + CR.PAD)
end

-- Paints the panel for the recipe on display, and shows it while the recipe form shows and the
-- switch is on; hidden for a recipe the client gives no schematic for.
function CR.Paint()
  local form = CR.Form()
  local data = AH.settings.crafting and CR.recipe and form and form:IsVisible() and CR.Read(CR.recipe) or nil
  if CR.frame then CR.frame:SetShown(data ~= nil) end
  if not data then return end
  local f = CR.frame or CR.Build()
  CR.data = data
  f.title:SetText(data.name or "Crafting cost")
  for i, r in ipairs(f.rows) do paintReagent(r, data.reagents[i]) end
  paintTotals(f, data, math.min(#data.reagents, #f.rows))
  f:Show()
end

-- Add reagents -------------------------------------------------------------------------------

-- How many crafts the box asks for: a whole number from 1 (1 for anything else).
local function crafts(box)
  return math.max(1, math.floor(tonumber(box:GetText() or "") or 1))
end

-- Raises each reagent's Keep-stocked count to what n crafts need (a larger count stays); the
-- reagents as chat text, "Linen Cloth x10, Coarse Thread x5".
local function keepStocked(list, data, n)
  local out = {}
  for i, r in ipairs(data.reagents) do
    list[r.id] = math.max(list[r.id] or 0, r.qty * n)
    out[i] = string.format("%s x%d", (itemLook(r.id)), list[r.id])
  end
  return table.concat(out, ", ")
end

-- Add reagents: the reagents for the crafts typed join Keep stocked, then the Restock list is made
-- of what's short (and searched at the auction house).
function CR.AddReagents()
  local data, ER = CR.data, ns.GetModule("Errands")
  if not ER.settings then return ns.Chat("Keep stocked is part of Errands, which is off (/vg > Modules).") end
  local n = crafts(CR.frame.crafts)
  ns.Chat(string.format("Keep stocked for %d x %s: %s.", n, data.name or "this recipe", keepStocked(ER.settings.stockList, data, n)))
  AH.Restock()
end

-- Building -----------------------------------------------------------------------------------

-- Reagent row i: the shop's row parts (icon, name, count, price), CR.ROW tall from CR.TOP.
local function reagentRow(f, i)
  local r = CreateFrame("Frame", nil, f)
  r:SetHeight(CR.ROW)
  r:SetPoint("TOPLEFT", CR.PAD, CR.TOP - (i - 1) * CR.ROW)
  r:SetPoint("TOPRIGHT", -CR.PAD, CR.TOP - (i - 1) * CR.ROW)
  AH.RowParts(r)
  return r
end

-- A total line: its label in text2 (placed by paintTotals) and its value at the panel's right.
local function totalLine(f, line)
  local l = { key = line[1], label = T.Text(f:CreateFontString(nil, "OVERLAY"), "label", "text2") }
  l.label:SetText(line[2])
  l.value = T.Text(f:CreateFontString(nil, "OVERLAY"), "number", "gold")
  l.value:SetPoint("RIGHT", f, "RIGHT", -CR.PAD, 0)
  l.value:SetPoint("TOP", l.label, "TOP", 0, 0)
  return l
end

-- The bottom line: "Crafts" and its box (1 to start), and Add reagents.
local function addControls(f)
  f.add = W.Button(f, "Add reagents", function() CR.AddReagents() end, 120)
  f.add:SetPoint("BOTTOMRIGHT", -CR.PAD, CR.PAD)
  f.crafts = W.Input(f, 44)
  f.crafts:SetPoint("RIGHT", f.add, "LEFT", -8, 0)
  f.crafts:SetText("1")
  f.craftsLabel = T.Text(f:CreateFontString(nil, "OVERLAY"), "label", "text2")
  f.craftsLabel:SetPoint("RIGHT", f.crafts, "LEFT", -6, 0)
  f.craftsLabel:SetText("Crafts")
end

-- The panel's heading (the recipe's name, on one line); the panel stays on the screen.
local function heading(f)
  f:SetClampedToScreen(true)
  f.title = T.Text(f:CreateFontString(nil, "OVERLAY"), "heading")
  f.title:SetPoint("TOPLEFT", CR.PAD, -CR.PAD)
  f.title:SetPoint("RIGHT", -CR.PAD, 0)
  f.title:SetWordWrap(false)
end

-- The panel, built the first time a recipe is priced: right of the profession window, past its side
-- tabs, with the recipe's name, a row per reagent (CR.ROWS at most), the totals and Add reagents.
function CR.Build()
  local f = T.Panel(CreateFrame("Frame", "Vanguard_CraftingPanel", UIParent), { shadow = true })
  f:SetWidth(CR.WIDTH)
  f:SetPoint("TOPLEFT", ProfessionsFrame, "TOPRIGHT", CR.GAP, 0)
  heading(f)
  f.rows, f.lines = {}, {}
  for i = 1, CR.ROWS do f.rows[i] = reagentRow(f, i) end
  for i, line in ipairs(CR.LINES) do f.lines[i] = totalLine(f, line) end
  addControls(f)
  CR.frame = f
  return f
end

-- Hooking the window -------------------------------------------------------------------------

-- The profession window's recipe form, once the game has loaded the window (nil before).
function CR.Form()
  local page = type(_G.ProfessionsFrame) == "table" and ProfessionsFrame.CraftingPage
  local form = type(page) == "table" and page.SchematicForm
  if type(form) == "table" then return form end
end

-- Post-hooks the recipe form, once: a recipe shown (Init) is priced, the form showing paints the
-- panel again, and the form hiding (another tab, or the window closed) hides it.
function CR.Hook()
  local form = CR.Form()
  if CR.hooked or not form or type(form.Init) ~= "function" then return end
  CR.hooked = true
  hooksecurefunc(form, "Init", ns.Guard("hook Init", function(_, info) CR.recipe = type(info) == "table" and ns.PlainNumber(info.recipeID) or nil CR.Paint() end))
  form:HookScript("OnShow", function() CR.Paint() end)
  form:HookScript("OnHide", function() if CR.frame then CR.frame:Hide() end end)
end

-- The window's part of the game loads: the form is hooked while the Auction helper is on.
ns.On("ADDON_LOADED", function(_, name) if name == "Blizzard_Professions" and AH.settings then CR.Hook() end end)
-- A profession opens: the same, should the window have loaded before the helper started.
ns.On("TRADE_SKILL_SHOW", function() if AH.settings then CR.Hook() end end)
-- The profession window closed: the panel goes with it.
ns.On("TRADE_SKILL_CLOSE", function() if CR.frame then CR.frame:Hide() end end)
-- New prices repaint the panel while it shows.
AP.OnChange(function() if CR.frame and CR.frame:IsShown() then CR.Paint() end end)
