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
local L = ns.L

local T, W, AP = ns.Theme, ns.Widgets, ns.AuctionPrices
local AH = ns.GetModule("AuctionHelper")

local CR = {}
AH.Crafting = CR

-- The panel shows unless switched off (Town and gear: Auction house).
AH.defaults.crafting = true

-- The panel's width (room for a reagent's name beside its count and price), padding (a card's inset,
-- T.SPACE.gap), row height (reagents: the shop's rows, AH.ROW_H) and line height (totals); its gap from the
-- window, wide enough to clear the window's side tabs; where the reagent rows start (under the heading).
CR.WIDTH, CR.PAD, CR.ROW, CR.LINE, CR.GAP, CR.TOP = 280, T.SPACE.gap, AH.ROW_H, 18, 52, -30
-- Reagent rows at most (vanilla recipes have up to six reagents).
CR.ROWS = 8
-- Enum.CraftingReagentType.Basic (ProfessionConstantsDocumentation.lua), for a client without the Enum.
CR.BASIC = 1
-- Crafts one Add reagents or /vg craft add takes at most (a typo or "1e999" stays a sane count).
CR.MAX_CRAFTS = 999
-- The total lines, by key and label.
CR.LINES = { { "cost", L["Reagents"] }, { "worth", L["Sells for"] }, { "profit", L["Profit"] } }

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
  return name or ns.Format(L["item {id}"], { id = id }), icon or AH.UNKNOWN_ICON
end

-- A reagent's row: its icon and name, "x2", and its cost ("no price" in muted).
local function paintReagent(r, reagent)
  r:SetShown(reagent ~= nil)
  if not reagent then return end
  local name, icon = itemLook(reagent.id)
  r.icon:SetTexture(icon)
  r.name:SetText(name)
  r.qty:SetText(ns.Format(L["x {count}"], { count = reagent.qty }))
  r.price:SetText(reagent.cost and AP.Money(reagent.cost) or L["no price"])
  T.Color(r.price, reagent.cost and "gold" or "muted")
end

-- A total line's value and colour: copper in gold (the profit in good or bad), else what's missing in muted.
local function totalText(data, key)
  local someUnpriced = data.unpriced > 0
  if key == "cost" then return someUnpriced and ns.Format(L["at least {money}"], { money = AP.Money(data.cost) }) or AP.Money(data.cost), someUnpriced and "muted" or "gold" end
  if key == "worth" then return data.worth and AP.Money(data.worth) or (data.output and L["no price"] or L["nothing to sell"]), data.worth and "gold" or "muted" end
  if not data.worth or someUnpriced then return L["needs every price"], "muted" end
  local profit = data.worth - data.cost
  return AP.Money(profit), profit < 0 and "bad" or "good"
end

-- The total lines under the reagent rows (n of them shown), and the panel's height to fit.
local function paintTotals(f, data, n)
  local y = CR.TOP - n * CR.ROW - T.SPACE.tight
  for i, l in ipairs(f.lines) do
    local text, color = totalText(data, l.key)
    l.label:SetPoint("TOPLEFT", CR.PAD, y - (i - 1) * CR.LINE)
    l.value:SetText(text)
    T.Color(l.value, color)
  end
  f:SetHeight(-y + #f.lines * CR.LINE + T.SPACE.gap + T.BUTTON_H + CR.PAD)
end

-- Paints the panel for the recipe on display, and shows it while the recipe form shows and the
-- switch is on; hidden for a recipe the client gives no schematic for.
function CR.Paint()
  local form = CR.Form()
  local data = AH.settings.crafting and CR.recipe and form and form:IsVisible() and CR.Read(CR.recipe) or nil
  if CR.frame then CR.frame:SetShown(data ~= nil) end
  if not data then return end
  local f = CR.Place(CR.frame or CR.Build())
  CR.data = data
  f.title:SetText(data.name or L["Crafting cost"])
  for i, r in ipairs(f.rows) do paintReagent(r, data.reagents[i]) end
  paintTotals(f, data, math.min(#data.reagents, #f.rows))
  f:Show()
end

-- Add reagents -------------------------------------------------------------------------------

-- How many crafts a typed count asks for: a whole number from 1 to CR.MAX_CRAFTS (1 for anything else;
-- max before min, so nan is 1).
function CR.Crafts(text)
  return math.min(CR.MAX_CRAFTS, math.max(1, math.floor(tonumber(text or "") or 1)))
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
  if not ER.settings then return ns.Chat(L["Keep stocked is part of Errands, which is off (/vg > Modules)."]) end
  local n = CR.Crafts(CR.frame.crafts:GetText())
  ns.Chat(ns.Format(L["Keep stocked for {count} x {recipe}: {reagents}."], { count = n, recipe = data.name or L["this recipe"], reagents = keepStocked(ER.StockList(), data, n) }))
  ER.StockWindow.Refresh()
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
  f.add = W.Button(f, L["Add reagents"], function() CR.AddReagents() end, 120)
  f.add:SetPoint("BOTTOMRIGHT", -CR.PAD, CR.PAD)
  f.crafts = W.Input(f, 44)
  f.crafts:SetPoint("RIGHT", f.add, "LEFT", -T.SPACE.gap, 0)
  f.crafts:SetText("1")
  f.craftsLabel = T.Text(f:CreateFontString(nil, "OVERLAY"), "label", "text2")
  f.craftsLabel:SetPoint("RIGHT", f.crafts, "LEFT", -T.SPACE.tight, 0)
  f.craftsLabel:SetText(L["Crafts"])
end

-- The panel's heading: a card's title (ns.WindowTitle kind "card") holding the recipe's name, on one line
-- across the panel; the panel stays on the screen.
local function heading(f)
  f:SetClampedToScreen(true)
  ns.WindowTitle(f, L["Crafting cost"], { kind = "card" })
  f.title:SetWidth(CR.WIDTH - 2 * CR.PAD)
  f.title:SetWordWrap(false)
end

-- The profession window's left and right edges in UIParent's units (its own scale taken out).
local function windowEdges()
  local scale = ProfessionsFrame:GetEffectiveScale() / UIParent:GetEffectiveScale()
  return (ProfessionsFrame:GetLeft() or 0) * scale, (ProfessionsFrame:GetRight() or 0) * scale
end

-- Places the panel right of the profession window, past its side tabs; when that runs past the screen's right
-- edge and the room left of the window holds the panel, left of the window instead. Otherwise it stays at the
-- right (the screen's clamp keeps it on the screen). Again each time it is painted: the window may have moved.
-- Returns the panel.
function CR.Place(f)
  local left, right = windowEdges()
  local atRight = right + CR.GAP + CR.WIDTH <= (UIParent:GetRight() or UIParent:GetWidth())
  f:ClearAllPoints()
  if atRight or left - T.SPACE.gap - CR.WIDTH < 0 then
    f:SetPoint("TOPLEFT", ProfessionsFrame, "TOPRIGHT", CR.GAP, 0)
  else
    f:SetPoint("TOPRIGHT", ProfessionsFrame, "TOPLEFT", -T.SPACE.gap, 0)
  end
  return f
end

-- The panel, built the first time a recipe is priced (placed by CR.Place), with the recipe's name,
-- a row per reagent (CR.ROWS at most), the totals and Add reagents.
function CR.Build()
  local f = T.Panel(CreateFrame("Frame", "Vanguard_CraftingPanel", UIParent), { shadow = true })
  f:SetWidth(CR.WIDTH)
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
