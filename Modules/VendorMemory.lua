-- Vendor memory: what each merchant you visit sells, remembered for the whole
-- account, so item tooltips can say "Sold by Thomas Miller (Elwynn Forest,
-- Goldshire)" (with " · limited stock" when the merchant carries only a few),
-- and the Keep stocked list (/vg stock) can say where to buy. Up to three
-- merchants per item, the one seen last first; /vg vendors says how many are
-- remembered (clear forgets them). Nothing is read in combat, and a name or
-- zone the client hides is skipped.

local ADDON, ns = ...

local T = ns.Theme

local VM = ns.Module("VendorMemory", { defaults = { tooltip = true, remember = true } })

-- Merchants kept per item; items kept, and the share of them a prune keeps (2000 -> 1800).
VM.PER_ITEM, VM.MAX_ITEMS, VM.KEEP = 3, 2000, 0.9

-- Helpers ------------------------------------------------------------------------------------

-- Calls a client function by name; nil when this client doesn't have it.
local function ask(name, ...)
  local fn = _G[name]
  if type(fn) ~= "function" then return nil end
  return fn(...)
end

-- The text if it's a plain, non-empty string; nil otherwise (hidden, missing, empty).
local function plainText(text)
  if ns.IsSecret(text) or type(text) ~= "string" or text == "" then return nil end
  return text
end

-- The account-wide store: VanguardDB.vendors = { items = { [itemID] = { entry, ... } }, count = items }.
function VM.Store()
  VanguardDB.vendors = ns.Fill(type(VanguardDB.vendors) == "table" and VanguardDB.vendors or {}, { items = {}, count = 0 })
  return VanguardDB.vendors
end

-- Reading the merchant -----------------------------------------------------------------------

-- The merchant you're talking to, or nil when the client hides the name.
local function merchantName()
  return plainText(ask("UnitName", "npc"))
end

-- Where you are: the zone and the subzone (nil when hidden, empty, or the zone's own name).
local function zoneNow()
  local zone, sub = plainText(ask("GetZoneText")), plainText(ask("GetSubZoneText"))
  return zone, sub ~= zone and sub or nil
end

-- Whether merchant item i is in limited stock: a count left (-1 is unlimited), from the
-- modern table, else the old call's fifth return (as Errands reads it).
local function limited(i)
  local api = C_MerchantFrame and C_MerchantFrame.GetItemInfo
  local info = type(api) == "function" and api(i) or nil
  local left = type(info) == "table" and info.numAvailable or select(5, ask("GetMerchantItemInfo", i))
  left = ns.PlainNumber(left)
  return left ~= nil and left >= 0
end

-- Merchant item i's item ID (the client's call, else the ID in its link), or nil.
local function itemAt(i)
  local id = ns.PlainNumber(ask("GetMerchantItemID", i))
  if id then return id end
  local link = plainText(ask("GetMerchantItemLink", i))
  return link and tonumber(link:match("item:(%d+)"))
end

-- Remembering --------------------------------------------------------------------------------

-- Notes that entry's merchant sells itemID: it goes first (replacing that merchant's older
-- entry, same name and zone), and past VM.PER_ITEM the oldest goes. A new item past VM.MAX_ITEMS prunes.
function VM.Remember(itemID, entry)
  local store = VM.Store()
  local list = store.items[itemID]
  if not list then list = {} store.items[itemID] = list store.count = store.count + 1 end
  for i, e in ipairs(list) do if e.n == entry.n and e.z == entry.z then table.remove(list, i) break end end
  table.insert(list, 1, entry)
  list[VM.PER_ITEM + 1] = nil
  if store.count > VM.MAX_ITEMS then VM.Prune() end
end

-- The open merchant's wares, remembered (not in combat, and only when the merchant's name can be read).
function VM.Record()
  if not VM.settings.remember or ns.InCombat() then return end
  local name, now = merchantName(), ns.PlainNumber(ask("time")) or 0
  if not name then return end
  local zone, sub = zoneNow()
  for i = 1, ns.PlainNumber(ask("GetMerchantNumItems")) or 0 do
    local id = itemAt(i)
    if id then VM.Remember(id, { n = name, z = zone, s = sub, l = limited(i) or nil, t = now }) end
  end
end

-- Forgets the items seen longest ago, down to VM.KEEP of VM.MAX_ITEMS.
function VM.Prune()
  local store, ids = VM.Store(), {}
  for id, list in pairs(store.items) do ids[#ids + 1] = { id, list[1] and list[1].t or 0 } end
  table.sort(ids, function(a, b) return a[2] > b[2] end)
  local keep = math.floor(VM.MAX_ITEMS * VM.KEEP)
  for k = keep + 1, #ids do store.items[ids[k][1]] = nil end
  store.count = math.min(#ids, keep)
end

-- Showing ------------------------------------------------------------------------------------

-- The merchants seen selling itemID, the last seen first; nil for none.
function VM.Where(itemID)
  local list = itemID and VM.Store().items[itemID]
  if type(list) == "table" and list[1] then return list end
end

-- "Thomas Miller (Elwynn Forest, Goldshire)": a merchant and as much of where as is known.
function VM.Text(entry)
  local where = entry.z and entry.s and (entry.z .. ", " .. entry.s) or entry.z or entry.s
  return where and string.format("%s (%s)", entry.n, where) or entry.n
end

-- An item tooltip's lines: "Sold by ..." per merchant, " · limited stock" in the warning colour.
function VM.Lines(tt, link)
  if not VM.settings.tooltip then return end
  for _, entry in ipairs(VM.Where(tonumber(link:match("item:(%d+)"))) or {}) do
    local stock = entry.l and T.Paint(" · limited stock", "warn") or ""
    tt:AddLine("Sold by " .. VM.Text(entry) .. stock, T.RGB("text2"))
  end
end

-- How many merchants are remembered (by name and zone).
local function merchantCount(store)
  local seen, n = {}, 0
  for _, list in pairs(store.items) do
    for _, e in ipairs(list) do
      local key = e.n .. "\1" .. (e.z or "")
      if not seen[key] then seen[key], n = true, n + 1 end
    end
  end
  return n
end

-- /vg vendors [clear]: how many merchants are remembered, or forget them all.
function VM.Command(rest)
  if rest == "clear" then VanguardDB.vendors = nil return ns.Chat("Forgot every merchant.") end
  local store = VM.Store()
  ns.Chat(string.format("%d merchant(s) remembered, selling %d item(s). /vg vendors clear forgets them.", merchantCount(store), store.count))
end

-- A merchant opened or its list changed: remember it once the burst of events is over.
local function onMerchant()
  ns.Soon("vendormemory", VM.Record)
end

-- Module entry point (Core/Modules.lua).
function VM.Enable(settings)
  VM.settings = settings
  VM.Store()
  ns.On("MERCHANT_SHOW", onMerchant)
  ns.On("MERCHANT_UPDATE", onMerchant)
  ns.GetModule("Tooltips").AddItemLines(VM.Lines)
end
