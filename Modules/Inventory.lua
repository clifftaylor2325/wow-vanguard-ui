-- Inventory: remembers what each of your characters on this realm and side
-- carries in their bags and keeps in the bank, so an item's tooltip says who
-- else has it, under "You have": one line per character (their name in their
-- class color, "5 (bank 3)"), at most MAX_NAMES of them, then the total.
--
-- Bags are read half a second after they change (once for a burst of
-- changes). The bank can only be read while it's open, so the last reading
-- is kept until the next visit. /vg inventory lists the characters and when
-- each was last read; forget <name> and clear drop them.
--
-- Written for WoW Forever: C_Container for bags (the key ring and reagent bag
-- included), and C_Bank's bought tabs for the bank (Forever's bank holds bags).

local ADDON, ns = ...

local T = ns.Theme

local IV = ns.Module("Inventory", { defaults = { alts = true } })

-- The bags read: key ring, backpack, the four bags, the reagent bag (an empty id reads as no slots).
IV.BAGS = { -1, 0, 1, 2, 3, 4, 5 }
-- Seconds to wait after a bag changes before reading the bags.
IV.SCAN_DELAY = 0.5
-- Other characters listed on a tooltip before "+N more".
IV.MAX_NAMES = 6

-- The store -------------------------------------------------------------------------------

-- This realm and side's characters: VanguardDB.inventory["<realm> - <faction>"] = { [name] = record },
-- where a record is { class, bags = { [itemID] = count }, bank = { ... }, updated = time read }.
function IV.Characters()
  local realm = type(GetRealmName) == "function" and GetRealmName() or "?"
  local key = realm .. " - " .. (type(UnitFactionGroup) == "function" and UnitFactionGroup("player") or "?")
  VanguardDB.inventory = type(VanguardDB.inventory) == "table" and VanguardDB.inventory or {}
  VanguardDB.inventory[key] = type(VanguardDB.inventory[key]) == "table" and VanguardDB.inventory[key] or {}
  return VanguardDB.inventory[key]
end

-- This character's record, made if new (a record kept nowhere when the client won't say your name).
function IV.Mine()
  local chars, name = IV.Characters(), UnitName("player")
  if type(name) ~= "string" or ns.IsSecret(name) then return { bags = {}, bank = {} } end
  local _, class = UnitClass("player")
  chars[name] = type(chars[name]) == "table" and chars[name] or { bags = {}, bank = {} }
  chars[name].class = class
  return chars[name]
end

-- Reading ---------------------------------------------------------------------------------

-- The client's slot count and slot reader, or nil when it lacks either.
local function containerApi()
  local api = type(C_Container) == "table" and C_Container or {}
  if type(api.GetContainerNumSlots) ~= "function" or type(api.GetContainerItemInfo) ~= "function" then return nil end
  return api.GetContainerNumSlots, api.GetContainerItemInfo
end

-- itemID -> count over a list of containers (none when the client can't say).
local function countIn(bags)
  local counts, slots, info = {}, containerApi()
  if not slots then return counts end
  for _, bag in ipairs(bags) do
    for slot = 1, ns.PlainNumber(slots(bag)) or 0 do
      local it = info(bag, slot)
      local id = it and ns.PlainNumber(it.itemID)
      if id then counts[id] = (counts[id] or 0) + (ns.PlainNumber(it.stackCount) or 1) end
    end
  end
  return counts
end

-- The bank's containers: the tabs this character has bought (none when the client can't say).
function IV.BankBags()
  local fetch = C_Bank and C_Bank.FetchPurchasedBankTabData
  if type(fetch) ~= "function" or not (Enum and Enum.BankType) then return {} end
  local out = {}
  for _, tab in ipairs(fetch(Enum.BankType.Character) or {}) do out[#out + 1] = tab.ID end
  return out
end

-- Reads the bags now, and the bank too while it's open.
function IV.Scan()
  IV.pending = false
  local mine = IV.Mine()
  mine.bags, mine.updated = countIn(IV.BAGS), ns.AuctionPrices.Now()
  if IV.bankOpen then mine.bank = countIn(IV.BankBags()) end
end

-- Something in the bags or bank changed: read them SCAN_DELAY later, once for a burst of changes.
function IV.OnChanged()
  if IV.pending then return end
  IV.pending = true
  C_Timer.After(IV.SCAN_DELAY, ns.Guard("timer bag scan", IV.Scan))
end

-- The bank opened: read it (and the bags) now.
function IV.OnBankOpened()
  IV.bankOpen = true
  IV.Scan()
end

-- The bank closed: its last reading is kept.
function IV.OnBankClosed()
  IV.bankOpen = false
end

-- Tooltips --------------------------------------------------------------------------------

-- Another character's line for an item: { name, class, total, text }, or nil when they have none.
local function holding(name, record, id)
  local bags, bank = (record.bags or {})[id] or 0, (record.bank or {})[id] or 0
  if bags + bank == 0 then return nil end
  local text = bank > 0 and string.format("%d (bank %d)", bags + bank, bank) or tostring(bags)
  return { name = name, class = record.class, total = bags + bank, text = text }
end

-- The other characters here who have item id, by name.
function IV.Others(id)
  local rows, me = {}, UnitName("player")
  for name, record in pairs(IV.Characters()) do
    local row = name ~= me and type(record) == "table" and holding(name, record, id)
    if row then rows[#rows + 1] = row end
  end
  table.sort(rows, function(a, b) return a.name < b.name end)
  return rows
end

-- r, g, b of a class's color, else the text color.
local function classRGB(class)
  local c = class and RAID_CLASS_COLORS and RAID_CLASS_COLORS[class]
  if c then return c.r, c.g, c.b end
  return T.RGB("text")
end

-- One character's line: the name in their class color, the count on the right.
local function addRow(tt, row)
  local r, g, b = classRGB(row.class)
  tt:AddDoubleLine(row.name, row.text, r, g, b, T.RGB("text2"))
end

-- Item tooltip lines (Tooltips' AddItemLines): who else has it, then the total with yours.
function IV.AddLines(tt, link)
  if not IV.settings.alts then return end
  local id = tonumber(link:match("item:(%d+)") or "")
  local rows = id and IV.Others(id) or {}
  if #rows == 0 then return end
  local _, owned = ns.GetModule("Tooltips").Owned(link)
  local total = owned or 0
  for i, row in ipairs(rows) do total = total + row.total if i <= IV.MAX_NAMES then addRow(tt, row) end end
  if #rows > IV.MAX_NAMES then tt:AddLine(string.format("+%d more", #rows - IV.MAX_NAMES), T.RGB("text2")) end
  local r, g, b = T.RGB("text2")
  tt:AddDoubleLine("Total", tostring(total), r, g, b, T.RGB("text"))
end

-- /vg inventory -----------------------------------------------------------------------------

-- The names remembered here, sorted.
local function names()
  local out = {}
  for name in pairs(IV.Characters()) do out[#out + 1] = name end
  table.sort(out)
  return out
end

-- Drops one character (any case).
local function forget(name)
  local chars = IV.Characters()
  for known in pairs(chars) do
    if known:lower() == name:lower() then chars[known] = nil return ns.Chat("Forgot " .. known .. "'s bags and bank.") end
  end
  ns.Chat("No character called " .. name .. " is remembered here.")
end

-- "<name>: bags read today" (or how many days ago).
local function readLine(name)
  local record = IV.Characters()[name]
  local updated = type(record) == "table" and record.updated or 0
  return name .. ": bags read " .. ns.AuctionPrices.Ago(updated)
end

-- /vg inventory: each character remembered here and when their bags were last read;
-- forget <name> drops one; clear forgets every character on every realm.
function IV.Command(rest)
  local word, name = (rest or ""):match("^%s*(%S*)%s*(.-)%s*$")
  word = word:lower()
  if word == "clear" then VanguardDB.inventory = nil return ns.Chat("Forgot every character's bags and bank.") end
  if word == "forget" and name ~= "" then return forget(name) end
  local list = names()
  ns.Chat(#list == 0 and "No characters remembered here yet." or ("Characters remembered here: " .. #list .. "."))
  for _, n in ipairs(list) do ns.Chat(readLine(n)) end
end

-- Module entry point (Core/Modules.lua): reads the bags at login, then as they change.
function IV.Enable(settings)
  IV.settings = settings
  ns.GetModule("Tooltips").AddItemLines(IV.AddLines)
  ns.On("BAG_UPDATE_DELAYED", IV.OnChanged)
  ns.On("PLAYERBANKSLOTS_CHANGED", IV.OnChanged)
  ns.On("BANKFRAME_OPENED", IV.OnBankOpened)
  ns.On("BANKFRAME_CLOSED", IV.OnBankClosed)
  IV.Scan()
end
