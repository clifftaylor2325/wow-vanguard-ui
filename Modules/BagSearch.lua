-- Bag search operators (part of the Bags module): the bag's search box also understands words such as
-- `ilvl>20`, `q:epic`, `type:armor`, `bind:boe` and `cat:potions`, any number of them with plain words, all
-- of which must match. A search with none of these is the game's own. Items that match stay lit and the
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

-- What the client says about an item: name, quality, item level, type words and bind type.
local function factsOf(info)
  local name, _, quality, ilvl, _, kind, sub, _, _, _, _, _, _, bind = C_Item.GetItemInfo(info.itemID)
  return {
    name = (name or ""):lower(), quality = ns.PlainNumber(quality), ilvl = ns.PlainNumber(ilvl),
    type = ((kind or "") .. " " .. (sub or "")):lower(), bind = ns.PlainNumber(bind), item = info.itemID,
  }
end

-- Whether the facts of one item pass one test.
local function passes(test, facts)
  if test.key == "name" then return facts.name:find(test.value, 1, true) ~= nil end
  if test.key == "type" then return facts.type:find(test.value, 1, true) ~= nil end
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

-- After the game has set which items match its search: with operators in the box, ours decide.
function BG.ApplySearch(frame)
  local box = _G.BagItemSearchBox
  local tests = type(box) == "table" and BG.ParseSearch(box:GetText())
  if not tests then return end
  for _, button in frame:EnumerateValidItems() do
    if type(button.SetMatchesSearch) == "function" then button:SetMatchesSearch(BG.ItemMatches(tests, button:GetBagID(), button:GetID())) end
  end
end

-- Search operators in the combined bag, when the client has the calls they use (Bags.Enable).
function BG.WatchSearch(frame)
  if type(frame.UpdateSearchResults) ~= "function" or type(frame.EnumerateValidItems) ~= "function" then return end
  if type(hooksecurefunc) ~= "function" or type(C_Item) ~= "table" or type(C_Container) ~= "table" then return end
  hooksecurefunc(frame, "UpdateSearchResults", ns.Guard("hook UpdateSearchResults", BG.ApplySearch))
end
