-- Bag categories (part of the Bags module): your own sections in the combined bag. A category is a name
-- and a list of items; its items sit under its own header, above the built-in sections. When an item is
-- in more than one category, the one higher in the list wins. /vg bag adds, removes and orders them.

local ADDON, ns = ...
local L = ns.L

local BG = ns.GetModule("Bags")

-- The built-in sections are keyed by name; a category's key starts with this, so the two never meet.
local KEY = "cat:"

-- The categories, in priority order: { name = "Potions", items = { [itemID] = true } }.
local function list()
  return ns.Settings("Bags", BG.defaults).categories
end

-- The position of the category called name (not case sensitive), or nil.
local function find(name)
  for i, cat in ipairs(list()) do
    if cat.name:lower() == name:lower() then return i end
  end
end

-- The sections of your categories, as BG.SECTIONS lists the built-in ones.
function BG.CategorySections()
  local out = {}
  for _, cat in ipairs(list()) do out[#out + 1] = { key = KEY .. cat.name:lower(), label = cat.name } end
  return out
end

-- The section key of the first category holding the item, or nil.
function BG.CategoryOf(itemID)
  local id = ns.PlainNumber(itemID)
  if not id then return nil end
  for _, cat in ipairs(list()) do
    if cat.items[id] then return KEY .. cat.name:lower() end
  end
end

-- The item's name once the client has it, else "item 123".
local itemName = ns.ItemName

-- Prints each category and its items.
local function show()
  if #list() == 0 then return ns.Chat(L["No bag categories. /vg bag add <name> <shift-click an item> makes one."]) end
  for _, cat in ipairs(list()) do
    local names = {}
    for id in pairs(cat.items) do names[#names + 1] = itemName(id) end
    table.sort(names)
    ns.Chat(cat.name .. ": " .. (#names > 0 and table.concat(names, ", ") or L["no items"]))
  end
end

-- Takes the item out of every category.
local function release(id)
  for _, cat in ipairs(list()) do cat.items[id] = nil end
end

-- Puts the item in the category called name, making it last in the list if it is new.
local function add(name, id)
  local at = find(name)
  if not at then table.insert(list(), { name = name, items = {} }) at = #list() end
  release(id)
  list()[at].items[id] = true
  ns.Chat(ns.Format(L["{item} is in {group}."], { item = itemName(id), group = list()[at].name }))
end

-- Deletes a category, or moves it to the top of the list.
local function change(verb, name)
  local at = find(name)
  if not at then return ns.Chat(ns.Format(L["No bag category called {name}."], { name = name })) end
  local cat = table.remove(list(), at)
  if verb == "top" then table.insert(list(), 1, cat) end
  ns.Chat(ns.Format(verb == "top" and L["{group} is first."] or L["{group} is gone."], { group = cat.name }))
end

-- Whether the bank window is open.
local function bankOpen()
  return type(_G.BankFrame) == "table" and _G.BankFrame:IsShown()
end

-- The { bag, slot } of every stack in your bags that is in the category.
local function stacksIn(cat)
  local out = {}
  for bag = 0, 4 do
    for slot = 1, ns.PlainNumber(C_Container.GetContainerNumSlots(bag)) or 0 do
      local info = C_Container.GetContainerItemInfo(bag, slot)
      local id = info and ns.PlainNumber(info.itemID)
      if id and cat.items[id] then out[#out + 1] = { bag, slot } end
    end
  end
  return out
end

-- /vg bag deposit <name>: sends every stack of the category to the open bank, out of combat.
local function deposit(name)
  local at = find(name)
  if not at then return ns.Chat(ns.Format(L["No bag category called {name}."], { name = name })) end
  if ns.InCombat() or not bankOpen() then return ns.Chat(L["Open the bank first (not in a fight)."]) end
  local stacks = stacksIn(list()[at])
  for _, spot in ipairs(stacks) do C_Container.UseContainerItem(spot[1], spot[2]) end
  ns.Chat(ns.Format(L["Sent {count} stack(s) of {group} to the bank."], { count = #stacks, group = list()[at].name }))
end

-- A group name from typed text: one word (spaces become dashes), or nil for none.
local function cleanName(text)
  local name = (text or ""):match("^%s*(.-)%s*$"):gsub("%s+", "-")
  return name ~= "" and name or nil
end

-- Makes an empty group (the bag buttons' "New group").
function BG.NewGroup(text)
  local name = cleanName(text)
  if not name then return end
  if find(name) then return ns.Chat(ns.Format(L["{group} already exists."], { group = name })) end
  table.insert(list(), { name = name, items = {} })
  ns.Chat(ns.Format(L["Group {group} made. Pick an item up, then choose it under Groups."], { group = name }))
end

-- The item on the cursor's ID, or nil (and chat says `ask`, telling the player to pick one up) when it holds no item.
local function heldItem(ask)
  local kind, id = GetCursorInfo()
  if kind == "item" and ns.PlainNumber(id) then return id end
  ns.Chat(ask)
end

-- Puts the item on the cursor in the group (the bag buttons' "Put held item in").
function BG.AddHeld(name)
  local id = heldItem(L["Pick an item up first, then choose the group."])
  if not id then return end
  add(name, id)
  ClearCursor()
  BG.SectionsChanged()
end

-- A bag button's group action: "delete", "top" or "deposit" on a group; the bag lays out again.
function BG.GroupAction(verb, name)
  if verb == "deposit" then deposit(name) else change(verb, name) end
  BG.SectionsChanged()
end

-- The usage line.
local USAGE = L["Usage: /vg bag [add <name> <item> | remove <item> | delete <name> | top <name> | deposit <name>]"]

-- Takes the item out of its category, and says so.
local function drop(id)
  release(id)
  ns.Chat(ns.Format(L["{item} is in no category."], { item = itemName(id) }))
end

-- Takes the item on the cursor out of its group (the bag buttons' "Take held item out of its group").
function BG.RemoveHeld()
  local id = heldItem(L["Pick an item up first, then take it out of its group."])
  if not id then return end
  if not BG.CategoryOf(id) then return ns.Chat(ns.Format(L["{item} is in no group."], { item = itemName(id) })) end
  drop(id)
  ClearCursor()
  BG.SectionsChanged()
end

-- What a command line holds: the verb, the rest after it, the first word of that (a category name), and
-- the item ID of its last part (a link, "item:123" or a number), when it has one.
local function parse(rest)
  local verb, arg = (rest or ""):match("^%s*(%a*)%s*(.-)%s*$")
  local name, item = arg:match("^(%S+)%s+(.+)$")
  local text = item or arg
  return verb, arg, name, tonumber(text:match("item:(%d+)") or text:match("^(%d+)$"))
end

-- Runs the command; false when it is not one.
local function run(verb, arg, name, id)
  if verb == "" then show() return true end
  if verb == "add" and name and id then add(name, id) return true end
  if verb == "remove" and id then drop(id) return true end
  if (verb == "delete" or verb == "top") and arg ~= "" then change(verb, arg) return true end
  if verb == "deposit" and arg ~= "" then deposit(arg) return true end
  return false
end

-- /vg bag [add <name> <item> | remove <item> | delete <name> | top <name> | deposit <name>]: your bag categories.
function BG.Command(rest)
  if not run(parse(rest)) then return ns.Chat(USAGE) end
  BG.SectionsChanged()
end
