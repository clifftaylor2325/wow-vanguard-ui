-- Auction helper, the sales ledger (Modules/AuctionHelper.lua holds the panel,
-- the search queue and the event routing): what became of your auctions, each
-- sale (when, the item, how many, for how much), expiry and cancel, kept per
-- realm and faction beside the prices (ForeverUIDB.ah.ledgers["Realm-Faction"],
-- next to Modules/AuctionPrices.lua's houses), at most AL.MAX records each and
-- for AL.MAX_AGE days. It hears of them two ways and counts each once:
--   * the auction events: your auctions list (OWNED_AUCTIONS_UPDATED: a sold
--     row is a sale, and each auction up is remembered for the events that
--     name only its ID), the game's notices that one sold or ran out
--     (AUCTION_HOUSE_SHOW_FORMATTED_NOTIFICATION), AUCTION_HOUSE_AUCTIONS_EXPIRED
--     and AUCTION_CANCELED; one auction is one record of each kind;
--   * the mail: each "seller" invoice in the inbox (an auction sold:
--     GetInboxInvoiceInfo) and each mail whose subject is the game's "Auction
--     expired" line (where the client has AUCTION_EXPIRED_MAIL_SUBJECT), read
--     whenever the inbox changes; nothing is opened, taken or deleted.
-- A mail that tells of an outcome an event already recorded joins that record
-- (the same item, kind and price each, within AL.LINK_AGE) rather than adding
-- one, and the mail's figures stand; a mail read again is known by its expiry
-- time and contents. The sell card's "Your history" shows the item's last
-- records, how many of its auctions sold out of those that sold or ran out,
-- and the average price each; the info strip can show this session's sales.
--
-- Standing rules here: nothing posts, cancels or searches (no restricted
-- call, no search through the queue); nothing writes into the game's frames;
-- every number from the client goes through ns.PlainNumber and every string
-- past ns.IsSecret before it is compared or added up.

local ADDON, ns = ...

local T, W, AP = ns.Theme, ns.Widgets, ns.AuctionPrices
local AH = ns.GetModule("AuctionHelper")

local AL = {}
ns.AuctionLedger = AL

-- Records kept per realm and faction, and days a record is kept; how far apart (seconds) a mail
-- and an event's record of one outcome may be, and how far a mail's expiry time may drift between
-- two reads of the inbox; how long an auction seen up is remembered (the longest lasts 48 hours).
AL.MAX, AL.MAX_AGE = 2000, 90
AL.LINK_AGE, AL.SAME_MAIL, AL.OPEN_AGE = 30 * 86400, 120, 3 * 86400

-- The ledger -----------------------------------------------------------------------------------

-- This realm and faction's ledger: { records = { a record, oldest first }, open = { [auctionID] =
-- an auction up } }. A record is { kind ("sold", "expired" or "cancelled"), id (the item's ID,
-- when known), name, qty, amount (a sale's copper for all its units), t (when noted), auction (its
-- auction's ID, from an event), mail (the expiry time of the mail that told of it) }; an auction
-- up is { id, name, qty, unit (price each), t (when first seen) }.
function AL.Book()
  local books, key = ns.Fill(AP.Store(), { ledgers = {} }).ledgers, AP.HouseKey()
  books[key] = ns.Fill(type(books[key]) == "table" and books[key] or {}, { records = {}, open = {} })
  return books[key]
end

-- A string the client shows plainly, else nil (none, or one it hides).
local function plain(s)
  if not ns.IsSecret(s) and type(s) == "string" then return s end
end

-- An item's name as the client knows it (C_Item.GetItemInfo), else nil.
local function nameOf(id)
  return id and plain((C_Item.GetItemInfo(id))) or nil
end

-- An item's ID from its name, when the client knows the name (C_Item.GetItemInfoInstant), else nil.
local function idOf(name)
  return name and ns.PlainNumber((C_Item.GetItemInfoInstant(name))) or nil
end

-- Whether a record and o are of the same item: the same ID when both have one, else the same name.
local function sameItem(r, o)
  if r.id and o.id then return r.id == o.id end
  return r.name ~= nil and r.name == o.name
end

-- Whether a record and o are the same money: anything but a sale is; a sale for the same amount
-- or the same price each.
local function samePrice(r, o)
  if r.kind ~= "sold" then return true end
  return r.amount == o.amount or math.floor(r.amount / r.qty) == math.floor(o.amount / o.qty)
end

-- Whether record r is the one o tells of again from the same source: the same auction, or the
-- same mail (its expiry time within AL.SAME_MAIL, the same units and amount).
local function sameSource(r, o)
  if o.auction then return r.auction == o.auction end
  return r.mail ~= nil and math.abs(r.mail - o.mail) <= AL.SAME_MAIL and r.qty == o.qty and r.amount == o.amount
end

-- Whether record r came from the other source only (an event's for a mail, a mail's for an
-- event), within AL.LINK_AGE of o, at the same price: the same outcome told twice.
local function otherSource(r, o)
  local only = o.auction and r.auction == nil or o.mail and r.mail == nil
  return only and math.abs(r.t - o.t) <= AL.LINK_AGE and samePrice(r, o)
end

-- The record o tells of again, else nil and the oldest record of the other source it joins (or
-- nil); records already matched in this read of the inbox (used) are passed over.
local function find(book, o, used)
  local other
  for i = #book.records, 1, -1 do
    local r = book.records[i]
    if not used[r] and r.kind == o.kind and sameItem(r, o) then
      if sameSource(r, o) then return r end
      if otherSource(r, o) then other = r end
    end
  end
  return nil, other
end

-- o joins record r from the other source: a mail's units and amount stand (the money it brought),
-- an event's auction is kept, and what either knows of the item fills in.
local function join(r, o)
  if o.mail then r.mail, r.qty, r.amount = o.mail, o.qty, o.amount else r.auction = o.auction end
  r.id, r.name = r.id or o.id, r.name or o.name
end

-- A new record, the oldest going past AL.MAX.
local function add(book, o)
  book.records[#book.records + 1] = o
  while #book.records > AL.MAX do table.remove(book.records, 1) end
end

-- Notes the outcome o tells of (a record's fields; o.auction or o.mail says where from): nothing
-- when a record has it from the same source, joined to the other source's record of it, else a
-- new record. used (a read of the inbox's) keeps one record per mail; the card and strip follow.
function AL.Note(o, used)
  used = used or {}
  local same, other = find(AL.Book(), o, used)
  local r = same or other or o
  used[r] = true
  if same then return end
  if other then join(other, o) else add(AL.Book(), o) end
  AL.Changed()
end

-- The ledger changed: the sell card's history and the info strip's auction sales follow.
function AL.Changed()
  AH.PaintSell()
  ns.GetModule("InfoStrip").Paint("ahgold")
end

-- The auction events -------------------------------------------------------------------------

-- One of your auctions (AH.ReadOwned's row) as the ledger keeps it while it's up: its item, name,
-- units and price each, and when first seen (was: as kept before).
local function openOf(a, was)
  local id = ns.PlainNumber(a.key.itemID)
  return { id = id, name = nameOf(id), qty = a.qty, unit = a.unit, t = was and was.t or AP.Now() }
end

-- A record of auction id's outcome (a kind) from what it was (a), and a sale's amount.
local function eventRecord(kind, id, a, amount)
  return { kind = kind, auction = id, id = a.id, name = a.name, qty = a.qty, amount = amount, t = AP.Now() }
end

-- Your auctions list came in (OWNED_AUCTIONS_UPDATED): a sold row is a sale, and each auction up
-- is remembered, for the events that name only its ID.
function AL.OnOwned()
  local open = AL.Book().open
  for _, a in ipairs(AH.ReadOwned()) do
    if a.status == "sold" then AL.Sold(a.id, a) else open[a.id] = openOf(a, open[a.id]) end
  end
end

-- Auction id sold (row: its sold row from your auctions list, else it is as it was up): a sale of
-- its units at its price, unless the ledger never saw it; it is up no more.
function AL.Sold(id, row)
  local book = AL.Book()
  local a = row and openOf(row) or book.open[id]
  book.open[id] = nil
  local amount = row and row.amount or a and a.unit and a.unit * a.qty
  if amount then AL.Note(eventRecord("sold", id, a, amount)) end
end

-- Auction id ran out ("expired") or was cancelled ("cancelled"): a record of what it was; for a
-- notice about one the ledger never saw up, of one of the item it names. It is up no more.
function AL.Ended(kind, id, name)
  if not id then return end
  local book = AL.Book()
  local a = book.open[id] or name and { id = idOf(name), name = name, qty = 1 }
  book.open[id] = nil
  if a then AL.Note(eventRecord(kind, id, a)) end
end

-- The game's notice about an auction (AUCTION_HOUSE_SHOW_FORMATTED_NOTIFICATION: the notice, its
-- text, which is the item's name, and the auction): one of yours sold, or ran out.
function AL.OnNotice(_, note, text, id)
  id = ns.PlainNumber(id)
  if note == AH.SOLD_NOTE and id then AL.Sold(id) end
  if note == AH.EXPIRED_NOTE then AL.Ended("expired", id, plain(text)) end
end

-- The mail ---------------------------------------------------------------------------------------

-- The game's "Auction expired: %s" subject as a pattern that captures the item's name, or nil
-- where the client has no such line.
local function expiredPattern()
  local fmt = plain(_G.AUCTION_EXPIRED_MAIL_SUBJECT)
  if not fmt then return nil end
  local escaped = fmt:gsub("[%(%)%.%+%-%*%?%[%]%^%$]", "%%%0")
  return "^" .. escaped:gsub("%%s", "(.+)", 1) .. "$"
end

-- Mail i as a sale, or nil: a "seller" invoice (GetInboxInvoiceInfo: the item's name, the amount
-- it went for, how many; Blizzard_MailFrame/MailFrame.lua reads the same).
local function invoiceOf(i)
  local kind, name, _, bid, _, _, _, _, _, _, count = GetInboxInvoiceInfo(i)
  name, bid = plain(name), ns.PlainNumber(bid)
  if plain(kind) ~= "seller" or not (name and bid) then return nil end
  return { kind = "sold", name = name, qty = math.max(1, ns.PlainNumber(count) or 1), amount = bid }
end

-- A mail with the game's "Auction expired" subject as an expiry of the item it names (how many
-- came back: its first item's count), or nil.
local function expiryOf(subject, pattern, qty)
  local name = subject and pattern and subject:match(pattern)
  if name then return { kind = "expired", name = name, qty = qty or 1 } end
end

-- What mail i tells of (a sale or an expiry), or nil; its mail is its expiry time (now plus its
-- days left, GetInboxHeaderInfo's seventh return), which tells it apart on the next read.
local function mailOf(i, pattern, now)
  local _, _, _, subject, _, _, days, _, _, _, _, _, _, firstQty = GetInboxHeaderInfo(i)
  days = ns.PlainNumber(days)
  local o = days and (invoiceOf(i) or expiryOf(plain(subject), pattern, ns.PlainNumber(firstQty)))
  if o then o.mail, o.t, o.id = math.floor(now + days * AP.DAY), now, idOf(o.name) end
  return o
end

-- The inbox changed (MAIL_INBOX_UPDATE): what each mail tells of is noted, once per mail however
-- often the inbox is read.
function AL.ReadInbox()
  local n, pattern, now, used = ns.PlainNumber((GetInboxNumItems())) or 0, expiredPattern(), AP.Now(), {}
  for i = 1, n do
    local o = mailOf(i, pattern, now)
    if o then AL.Note(o, used) end
  end
end

-- Keeping it small ----------------------------------------------------------------------------

-- Whether v is a record or an auction (a table with a time) from cutoff on.
local function fresh(v, cutoff)
  return type(v) == "table" and (tonumber(v.t) or 0) >= cutoff
end

-- Drops a ledger's records older than AL.MAX_AGE days and auctions first seen up more than
-- AL.OPEN_AGE ago (and anything broken); true when nothing is left.
local function pruneBook(book, now)
  local records = {}
  for _, r in ipairs(book.records) do if fresh(r, now - AL.MAX_AGE * AP.DAY) then records[#records + 1] = r end end
  book.records = records
  for id, a in pairs(book.open) do if not fresh(a, now - AL.OPEN_AGE) then book.open[id] = nil end end
  return #records == 0 and next(book.open) == nil
end

-- Prunes every realm and faction's ledger; one left empty (or not a ledger) is forgotten.
function AL.Prune(now)
  local books = ns.Fill(AP.Store(), { ledgers = {} }).ledgers
  for key, book in pairs(books) do
    local broken = type(book) ~= "table" or type(book.records) ~= "table" or type(book.open) ~= "table"
    if broken or pruneBook(book, now) then books[key] = nil end
  end
end

-- Reading ---------------------------------------------------------------------------------------

-- An item's records, newest first (its name finds the records a mail named only by name).
function AL.History(itemID)
  local o, records = { id = itemID, name = nameOf(itemID) }, AL.Book().records
  local out = {}
  for i = #records, 1, -1 do
    if sameItem(records[i], o) then out[#out + 1] = records[i] end
  end
  return out
end

-- Records summed up: how many of each kind, and the average price each over every unit sold
-- (rounded down; nil with no sale).
function AL.Summary(records)
  local n, units, copper = { sold = 0, expired = 0, cancelled = 0 }, 0, 0
  for _, r in ipairs(records) do
    n[r.kind] = (n[r.kind] or 0) + 1
    if r.kind == "sold" then units, copper = units + r.qty, copper + r.amount end
  end
  return n, units > 0 and math.floor(copper / units) or nil
end

-- What your sales noted since login came to, in copper (0 before the ledger starts).
function AL.SessionSales()
  local sum = 0
  for _, r in ipairs(AL.since and AL.Book().records or {}) do
    if r.kind == "sold" and r.t >= AL.since then sum = sum + r.amount end
  end
  return sum
end

-- Your history on the sell card ---------------------------------------------------------------

-- The history's line: how many of the item's auctions sold of those that sold or ran out, and the
-- average price each; or that there is nothing yet, or no item.
local function summaryText(s, records)
  if not s then return "Put an item on the card to see how it sold." end
  local n, avg = AL.Summary(records)
  if n.sold + n.expired == 0 then return "No sales or expiries of this item yet." end
  local text = string.format("sold %d of %d", n.sold, n.sold + n.expired)
  return avg and (text .. " · avg " .. AP.Money(avg)) or text
end

-- A history row: a sale's price each (in gold), else what became of it; how many, and when.
local function paintRecord(r, rec)
  r:SetShown(rec ~= nil)
  if not rec then return end
  local sold = rec.kind == "sold"
  T.Color(r.price, sold and "gold" or "text2"):SetText(sold and AP.Money(math.floor(rec.amount / rec.qty)) or rec.kind)
  r.qty:SetText("x " .. rec.qty)
  r.time:SetText(AP.Ago(rec.t))
end

-- The bottom of the sell card: the item's history (its line and last records) while Your history
-- is on, else the listings up now; the toggle names the other view.
function AH.PaintHistory(c, s)
  local on, h = AH.showHistory == true, c.history
  local records = on and s and AL.History(s.id) or {}
  c.list:SetShown(not on)
  h:SetShown(on)
  c.historyToggle.text:SetText(on and "Up now" or "Your history")
  h.summary:SetText(summaryText(s, records))
  for i, r in ipairs(h.rows) do paintRecord(r, records[i]) end
end

-- Your history / Up now: the bottom of the sell card switches view.
function AH.ToggleHistory()
  AH.showHistory = not AH.showHistory
  AH.PaintSell()
end

-- A history row's parts: the price each (or what became of it), how many and when.
local function historyParts(r)
  r.price = T.Text(r:CreateFontString(nil, "OVERLAY"), "number", "gold")
  r.price:SetPoint("LEFT", 10, 0)
  r.qty = T.Text(r:CreateFontString(nil, "OVERLAY"), "small", "text2")
  r.qty:SetPoint("RIGHT", -70, 0)
  r.time = T.Text(r:CreateFontString(nil, "OVERLAY"), "small", "text2")
  r.time:SetPoint("RIGHT", -2, 0)
end

-- History row i: AH.ROW_H tall under the history's line, the width of the card.
local function historyRow(h, i)
  local r, y = CreateFrame("Frame", nil, h), -14 - (i - 1) * AH.ROW_H
  r:SetHeight(AH.ROW_H)
  r:SetPoint("TOPLEFT", 0, y)
  r:SetPoint("TOPRIGHT", 0, y)
  historyParts(r)
  return r
end

-- The history in the listings' place (hidden until Your history), its line and AH.LIST_ROWS rows,
-- and the toggle on the card's heading line.
function AH.BuildHistory(c)
  local h = CreateFrame("Frame", nil, c)
  h:SetAllPoints(c.list)
  h:Hide()
  h.summary = T.Text(h:CreateFontString(nil, "OVERLAY"), "small", "text2")
  h.summary:SetPoint("TOPLEFT", 0, -1)
  h.rows, c.history = {}, h
  for i = 1, AH.LIST_ROWS do h.rows[i] = historyRow(h, i) end
  c.historyToggle = W.Button(c, "Your history", function() AH.ToggleHistory() end, 90)
  c.historyToggle:SetHeight(18)
  c.historyToggle:SetPoint("TOPRIGHT", 0, 2)
end

-- The ledger's events, through the helper's on (none in combat): your auctions list, the notices,
-- an auction run out or cancelled, and the inbox. The session's sales count from now, and old
-- records go.
function AH.ListenLedger(on)
  AL.since = AP.Now()
  AL.Prune(AL.since)
  on("OWNED_AUCTIONS_UPDATED", AL.OnOwned)
  on("AUCTION_HOUSE_SHOW_FORMATTED_NOTIFICATION", AL.OnNotice)
  on("AUCTION_HOUSE_AUCTIONS_EXPIRED", function(_, id) AL.Ended("expired", ns.PlainNumber(id)) end)
  on("AUCTION_CANCELED", function(_, id) AL.Ended("cancelled", ns.PlainNumber(id)) end)
  if type(GetInboxNumItems) == "function" then on("MAIL_INBOX_UPDATE", AL.ReadInbox) end
end
