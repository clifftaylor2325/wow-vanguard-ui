-- Bag search operators (part of the Bags module): the bag's and the bank's search boxes also understand words
-- such as `ilvl>20`, `q:epic`, `type:armor`, `bind:boe` and `cat:potions`, any number of them with plain words,
-- all of which must match. A search with none of these is the game's own. Items that match stay lit and the
-- rest dim, as the game does it, by setting each item button's matches-search state after the game has set it.

local ADDON, ns = ...

local BG = ns.GetModule("Bags")

-- Quality names to the item quality number (a search may give the start of a name).
local QUALITY = { poor = 0, common = 1, uncommon = 2, rare = 3, epic = 4, legendary = 5 }
-- Binding words to GetItemInfo's bind type.
local BIND = { bop = 1, boe = 2, bou = 3, quest = 4 }
-- The operators a number can be compared with.
local COMPARE = {
  [">"] = function(a, b) return a > b end, ["<"] = function(a, b) return a < b end,
  [">="] = function(a, b) return a >= b end, ["<="] = function(a, b) return a <= b end,
  ["="] = function(a, b) return a == b end, [":"] = function(a, b) return a == b end,
}
-- The English words of `type:` to the item class (Enum.ItemClass) they name. The client's own type names are in
-- its language, so these words are matched on the class id; the client's own words still match its type text.
BG.TYPE_CLASSES = {
  consumable = 0, container = 1, weapon = 2, gem = 3, armor = 4, reagent = 5, projectile = 6, tradegoods = 7,
  recipe = 9, quest = 12, key = 13, miscellaneous = 15,
}
-- Words for the keys: the long and the short form of each.
local KEYS = { ilvl = "ilvl", level = "ilvl", q = "quality", quality = "quality", type = "type", bind = "bind", cat = "cat" }

-- A quality word (the start of a name) or number as the quality number, or nil.
local function qualityOf(word)
  if tonumber(word) then return tonumber(word) end
  for name, number in pairs(QUALITY) do
    if name:sub(1, #word) == word then return number end
  end
end

-- A key's value turned into what it is compared with: a number for ilvl, quality and bind, else the text.
local function valueOf(key, text)
  if key == "ilvl" then return tonumber(text) end
  if key == "quality" then return qualityOf(text) end
  if key == "bind" then return BIND[text] end
  return text
end

-- One word of a search as a test { key, compare, value }: `ilvl>20` and the like, or a plain word
-- (matched against the item's name). A key with a value that makes no sense is a plain word too.
local function testOf(word)
  local key, op, text = word:match("^(%a+)([:=<>]+)(.+)$")
  key = key and KEYS[key]
  local value = key and COMPARE[op] and valueOf(key, text)
  if value then return { key = key, compare = COMPARE[op], value = value } end
  return { key = "name", value = word }
end

-- The tests of a search text, or nil when it holds no operator (the game's own search handles it).
function BG.ParseSearch(text)
  local tests, operators = {}, false
  for word in tostring(text or ""):lower():gmatch("%S+") do
    local test = testOf(word)
    tests[#tests + 1], operators = test, operators or test.key ~= "name"
  end
  return operators and tests or nil
end

-- What the client says about an item: name, quality, item level, type words, class id and bind type.
local function factsOf(info)
  local name, _, quality, ilvl, _, kind, sub, _, _, _, _, _, _, bind = C_Item.GetItemInfo(info.itemID)
  return {
    name = (name or ""):lower(), quality = ns.PlainNumber(quality), ilvl = ns.PlainNumber(ilvl),
    type = ((kind or "") .. " " .. (sub or "")):lower(), bind = ns.PlainNumber(bind), item = info.itemID,
    class = BG.ClassOf(info.itemID),
  }
end

-- Whether an item's type text holds the word of a `type:` test, or the word names the item's class.
local function typeMatches(test, facts)
  if facts.type:find(test.value, 1, true) ~= nil then return true end
  return facts.class ~= nil and BG.TYPE_CLASSES[test.value] == facts.class
end

-- Whether the facts of one item pass one test.
local function passes(test, facts)
  if test.key == "name" then return facts.name:find(test.value, 1, true) ~= nil end
  if test.key == "type" then return typeMatches(test, facts) end
  if test.key == "cat" then return BG.CategoryOf ~= nil and BG.CategoryOf(facts.item) == "cat:" .. test.value end
  local have = facts[test.key]
  return have ~= nil and test.compare(have, test.value)
end

-- Whether the item in a slot passes every test.
function BG.ItemMatches(tests, bag, slot)
  local info = C_Container.GetContainerItemInfo(bag, slot)
  if not info then return false end
  local facts = factsOf(info)
  for _, test in ipairs(tests) do
    if not passes(test, facts) then return false end
  end
  return true
end

-- The search last parsed, so a refresh of each slot doesn't parse it again: { text, tests }.
local parsed = {}

-- The tests of what the named search box holds, or nil when it holds no operator (or there is no such box).
local function testsIn(boxName)
  local box = _G[boxName]
  if type(box) ~= "table" then return nil end
  local text = box:GetText()
  if parsed.text ~= text then parsed.text, parsed.tests = text, BG.ParseSearch(text) end
  return parsed.tests
end

-- Sets whether one button matches the tests (bag and slot: what it holds); a button without the call is left alone.
local function mark(button, tests, bag, slot)
  if type(button.SetMatchesSearch) == "function" then button:SetMatchesSearch(BG.ItemMatches(tests, bag, slot)) end
end

-- After the game has set which items match its search: with operators in the box, ours decide.
function BG.ApplySearch(frame)
  local tests = testsIn("BagItemSearchBox")
  if not tests then return end
  for _, button in frame:EnumerateValidItems() do mark(button, tests, button:GetBagID(), button:GetID()) end
end

-- Search operators in the combined bag, when the client has the calls they use (Bags.Enable): after the
-- game's search refresh, and after it fills the slots (it sets each slot's match from its own search then).
function BG.WatchSearch(frame)
  if type(frame.UpdateSearchResults) ~= "function" or type(frame.EnumerateValidItems) ~= "function" then return end
  if type(hooksecurefunc) ~= "function" or type(C_Item) ~= "table" or type(C_Container) ~= "table" then return end
  hooksecurefunc(frame, "UpdateSearchResults", ns.Guard("hook UpdateSearchResults", BG.ApplySearch))
  if type(frame.UpdateItems) == "function" then hooksecurefunc(frame, "UpdateItems", ns.Guard("hook search UpdateItems", BG.ApplySearch)) end
end

-- The bank -------------------------------------------------------------------------------------

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState): bank slots whose refresh is hooked.
local vgSearchHooked = ns.FrameState("vgSearchHooked")

-- One bank slot after the game set its match: with operators in the bank's box, ours decide.
local function markBankSlot(button)
  local tests = testsIn("BankItemSearchBox")
  if tests then mark(button, tests, button:GetBankTabID(), button:GetContainerSlotID()) end
end

-- Hooks a bank slot's own refresh once (the game refreshes one slot when an item in it is picked up or put down).
local function watchBankSlot(button)
  if vgSearchHooked[button] or type(button.Refresh) ~= "function" then return end
  vgSearchHooked[button] = true
  hooksecurefunc(button, "Refresh", ns.Guard("hook bank slot Refresh", markBankSlot))
end

-- The bank tab's slots after the game set their matches (a search, a refresh, a page or tab change).
function BG.ApplyBankSearch(panel)
  for button in panel:EnumerateValidItems() do
    watchBankSlot(button)
    markBankSlot(button)
  end
end

-- The BankPanelMixin calls the search words need, and those hooked when the client has them: a search, and a
-- page or tab change (new slots get their own hook; a refresh of every slot runs through those).
local BANK_CALLS = {
  needed = { "UpdateSearchResults", "EnumerateValidItems" },
  hooked = { "UpdateSearchResults", "GenerateItemSlotsForSelectedTab" },
}

-- Search operators in the bank too (Bags.Enable), when the client has the calls.
function BG.WatchBankSearch(panel)
  if type(hooksecurefunc) ~= "function" or type(C_Item) ~= "table" or type(C_Container) ~= "table" then return end
  for _, name in ipairs(BANK_CALLS.needed) do
    if type(panel[name]) ~= "function" then return end
  end
  for _, name in ipairs(BANK_CALLS.hooked) do
    if type(panel[name]) == "function" then hooksecurefunc(panel, name, ns.Guard("hook bank " .. name, BG.ApplyBankSearch)) end
  end
end
