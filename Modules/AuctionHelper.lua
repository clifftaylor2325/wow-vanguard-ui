-- Auction helper: a ForeverUI panel docked to the left of the game's auction
-- house window. "Scan the auction house" (once every 15 minutes, the game's
-- own limit for a whole-house query) reads every listing and records each
-- item's cheapest unit price (Modules/AuctionPrices.lua), which item tooltips
-- then show everywhere.
--
-- The game's auction house is the modern one (C_AuctionHouse) on WoW Forever.
-- Nothing here touches the game's auction frames: the panel only anchors to
-- the window. Every price and quantity goes through ns.PlainNumber before any
-- arithmetic, and events are ignored in combat (the house closes then).

local ADDON, ns = ...

local T, W, AP = ns.Theme, ns.Widgets, ns.AuctionPrices

local AH = ns.Module("AuctionHelper", { defaults = { panel = true, tooltip = true, undercut = "silver", scanButton = true } })

-- Seconds between scans, listings read per frame of a scan; the panel's width, padding and gap
-- to the window; where the scan card starts (down from the panel's top) and its height.
AH.SCAN_GAP, AH.SCAN_ROWS = 900, 400
AH.WIDTH, AH.PAD, AH.GAP, AH.SCAN_Y, AH.SCAN_H = 280, 8, 4, -354, 168

-- Helpers ------------------------------------------------------------------------------------

-- Runs fn on an event, unless in combat (the auction house closes in combat).
local function on(event, fn)
  ns.On(event, function(...) if not ns.InCombat() then fn(...) end end)
end

-- A one-pixel divider line just above a card.
local function divider(c)
  c.rule = W.Flat(c, "ARTWORK", "divider")
  c.rule:SetPoint("BOTTOMLEFT", c, "TOPLEFT", 0, AH.PAD / 2)
  c.rule:SetPoint("BOTTOMRIGHT", c, "TOPRIGHT", 0, AH.PAD / 2)
  c.rule:SetHeight(T.Pixel(c))
end

-- A card on the panel: a heading, from y (down from the panel's top), h units tall, with a
-- divider line above it.
local function card(f, title, y, h)
  local c = CreateFrame("Frame", nil, f)
  c:SetPoint("TOPLEFT", f, "TOPLEFT", AH.PAD, y)
  c:SetPoint("TOPRIGHT", f, "TOPRIGHT", -AH.PAD, y)
  c:SetHeight(h)
  c.title = T.Text(c:CreateFontString(nil, "OVERLAY"), "heading")
  c.title:SetPoint("TOPLEFT")
  c.title:SetText(title)
  divider(c)
  return c
end

-- The panel ----------------------------------------------------------------------------------

-- The scan card: the scan button and when the last scan was.
local function buildScan(f)
  local c = card(f, "Scan", AH.SCAN_Y, AH.SCAN_H)
  c.scan = W.Button(c, "Scan the auction house", function() AH.StartScan() end, 150)
  c.scan:SetPoint("TOPLEFT", 0, -20)
  c.last = T.Text(c:CreateFontString(nil, "OVERLAY"), "small", "text2")
  c.last:SetPoint("TOPLEFT", 0, -50)
  AH.scanCard = c
end

-- The panel beside the auction house window (as tall as it), built the first time the window shows.
function AH.Build()
  local f = T.Panel(CreateFrame("Frame", "ForeverUI_AuctionPanel", UIParent), { shadow = true })
  f:SetWidth(AH.WIDTH)
  f:SetPoint("TOPRIGHT", AuctionHouseFrame, "TOPLEFT", -AH.GAP, 0)
  f:SetPoint("BOTTOMRIGHT", AuctionHouseFrame, "BOTTOMLEFT", -AH.GAP, 0)
  f:EnableMouse(true)
  AH.frame = f
  buildScan(f)
  return f
end

-- The auction house opened: the panel shows (built the first time), unless switched off.
function AH.OnShow()
  AH.open = true
  if not AH.settings.panel or type(AuctionHouseFrame) ~= "table" then return end
  local f = AH.frame or AH.Build()
  f:Show()
  AH.PaintScan()
end

-- The auction house closed: the panel hides and a scan in progress stops.
function AH.OnClosed()
  AH.open, AH.scan = false, nil
  AH.walker:Hide()
  if AH.frame then AH.frame:Hide() end
end

-- Scan ---------------------------------------------------------------------------------------

-- "last scan 12 min ago", "scanning 400 of 12000", or "no scan yet"; the button with its switch.
function AH.PaintScan()
  local c, s, last = AH.scanCard, AH.scan, AP.Store().lastScan
  if not c then return end
  c.scan:SetShown(AH.settings.scanButton)
  if s then return c.last:SetText(string.format("scanning %d of %d", s.next, s.total or 0)) end
  c.last:SetText(last > 0 and string.format("last scan %d min ago", math.floor((AP.Now() - last) / 60)) or "no scan yet")
end

-- Asks the house for every listing (ReplicateItems), at most once every AH.SCAN_GAP seconds; the
-- rows are read once REPLICATE_ITEM_LIST_UPDATE says they're in.
function AH.StartScan()
  local wait = AP.Store().lastScan + AH.SCAN_GAP - AP.Now()
  AH.PaintScan()
  if not AH.open then return ns.Chat("Open the auction house to scan it.") end
  if AH.scan or wait > 0 then return ns.Chat(string.format("One auction house scan every 15 minutes: the next in %d min.", math.ceil(wait / 60))) end
  AH.scan = { next = 0, best = {} }
  AP.Store().lastScan = AP.Now()
  C_AuctionHouse.ReplicateItems()
  AH.PaintScan()
end

-- The listings are in: walk them, AH.SCAN_ROWS per frame.
local function onReplicate()
  if not AH.scan or AH.scan.total then return end
  AH.scan.total = ns.PlainNumber(C_AuctionHouse.GetNumReplicateItems()) or 0
  AH.walker:Show()
end

-- Listing i (0-based): its unit price (buyout over count) against its item's cheapest so far;
-- skipped without a buyout or when the client hides a number.
function AH.ScanRow(s, i)
  local _, _, count, _, _, _, _, _, _, buyout, _, _, _, _, _, _, id = C_AuctionHouse.GetReplicateItemInfo(i)
  count, buyout, id = ns.PlainNumber(count), ns.PlainNumber(buyout), ns.PlainNumber(id)
  if not (count and buyout and id) or count < 1 or buyout < 1 then return end
  local unit = math.floor(buyout / count)
  s.best[id] = math.min(s.best[id] or unit, unit)
end

-- One frame of the scan: the next AH.SCAN_ROWS listings; after the last, the prices are recorded.
function AH.ScanStep()
  local s = AH.scan
  local last = math.min(s.next + AH.SCAN_ROWS, s.total) - 1
  for i = s.next, last do AH.ScanRow(s, i) end
  s.next = last + 1
  AH.PaintScan()
  if s.next >= s.total then AH.FinishScan() end
end

-- The whole list is read: each item's cheapest unit price goes in the price store.
function AH.FinishScan()
  local s, now, n = AH.scan, AP.Now(), 0
  for id, unit in pairs(s.best) do AP.Record(id, unit, now) n = n + 1 end
  AH.scan = nil
  AH.walker:Hide()
  ns.Chat(string.format("Auction house scanned: %d listings, prices for %d items.", s.total, n))
  AH.PaintScan()
end

-- Slash command ------------------------------------------------------------------------------

-- /fui ah's words: scan, and prices clear.
AH.COMMANDS = {
  -- Scans the auction house.
  scan = function() AH.StartScan() end,
  -- Forgets every price.
  prices = function(arg)
    if arg ~= "clear" then return AH.Status() end
    local store = AP.Store()
    store.prices, store.count = {}, 0
    ns.Chat("Forgot every auction price.")
  end,
}

-- What the helper knows: how many prices, and the last scan.
function AH.Status()
  local store = AP.Store()
  local last = store.lastScan > 0 and AP.Ago(store.lastScan) or "never"
  ns.Chat(string.format("Auction prices for %d item(s); last scan: %s. /fui ah scan (at the auction house), /fui ah prices clear.", store.count, last))
end

-- /fui ah [scan|prices clear].
function AH.Command(rest)
  if not AH.settings then return ns.Chat("The auction helper is off (/fui > Modules).") end
  local word, arg = (rest or ""):match("^(%S*)%s*(.-)%s*$")
  local fn = AH.COMMANDS[word:lower()]
  if fn then return fn(arg) end
  AH.Status()
end

-- Module entry point (Core/Modules.lua): prices in tooltips, and the panel at the auction house.
function AH.Enable(settings)
  AH.settings = settings
  AP.Enable(settings)
  if type(C_AuctionHouse) ~= "table" then return end
  AH.walker = CreateFrame("Frame")
  AH.walker:Hide()
  AH.walker:SetScript("OnUpdate", AH.ScanStep)
  on("AUCTION_HOUSE_SHOW", function() ns.Soon("auctionhelper", AH.OnShow) end)
  on("AUCTION_HOUSE_CLOSED", AH.OnClosed)
  on("REPLICATE_ITEM_LIST_UPDATE", onReplicate)
end
