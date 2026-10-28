-- Auction helper, the sales ledger (Modules/AuctionHelper.lua holds the panel,
-- the search queue and the event routing): what became of your auctions, each
-- sale (when, the item, how many, for how much), expiry and cancel, kept per
-- realm and faction beside the prices (VanguardDB.ah.ledgers["Realm-Faction"],
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
-- time and contents. The Up now card's "Your history" shows the item's last
-- records, how many of its auctions sold out of those that sold or ran out,
-- and the average price each; the info strip can show this session's sales.
--
-- Standing rules here: nothing posts, cancels or searches (no restricted
-- call, no search through the queue); nothing writes into the game's frames;
-- every number from the client goes through ns.PlainNumber and every string
-- past ns.IsSecret before it is compared or added up.

local ADDON, ns = ...
local L = ns.L

local T, W, AP = ns.Theme, ns.Widgets, ns.AuctionPrices
local AH = ns.GetModule("AuctionHelper")

local AL = {}
ns.AuctionLedger = AL

-- Records kept per realm and faction, and days a record is kept; how far apart (seconds) a mail
-- and an event's record of one outcome may be, and how far a mail's expiry time may drift between
-- two reads of the inbox (past any change in the computer's clock, a mail's skew); how long an
-- auction seen up is remembered (the longest lasts 48 hours).
AL.MAX, AL.MAX_AGE = 2000, 90
AL.LINK_AGE, AL.SAME_MAIL, AL.OPEN_AGE = 30 * 86400, 120, 3 * 86400

-- The ledger -----------------------------------------------------------------------------------

-- This realm and faction's ledger (ns.Home.Key, the ruleset in it when the client names one): { records = { a record, oldest first }, open = { [auctionID] =
-- an auction up } }. A record is { kind ("sold", "expired" or "cancelled"), id (the item's ID,
-- when known), name, qty, amount (a sale's copper for all its units), t (when noted), auction (its
-- auction's ID, from an event), mail (the expiry time of the mail that told of it) }; an auction
-- up is { id, name, qty, unit (price each), t (when first seen) }.
function AL.Book()
  local books = ns.Fill(AP.Store(), { ledgers = {} }).ledgers
  local key = ns.Home.Adopt(books)
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

-- How far apart two reads put a mail's expiry time: as read, or once the change in the computer's clock
-- between them is taken off (its days left may count by the realm's clock, so a clock put right moves the
-- time read by as much), whichever is less. A record from before skews were kept has none.
local function expiryGap(r, o)
  local gap = math.abs(r.mail - o.mail)
  if type(r.skew) ~= "number" or type(o.skew) ~= "number" then return gap end
  return math.min(gap, math.abs(o.mail - r.mail - (o.skew - r.skew)))
end

-- How near record r is to being the one o tells of again from the same source (0 for the same auction;
-- for a mail, its expiry gap within AL.SAME_MAIL with the same units and amount), or nil when it is not.
local function sourceGap(r, o)
  if o.auction then return r.auction == o.auction and 0 or nil end
  if r.mail == nil or r.qty ~= o.qty or r.amount ~= o.amount then return nil end
  local gap = expiryGap(r, o)
  return gap <= AL.SAME_MAIL and gap or nil
end

-- Whether record r came from the other source only (an event's for a mail, a mail's for an
-- event), within AL.LINK_AGE of o, at the same price: the same outcome told twice.
local function otherSource(r, o)
  local only = o.auction and r.auction == nil or o.mail and r.mail == nil
  return only and math.abs(r.t - o.t) <= AL.LINK_AGE and samePrice(r, o)
end

-- The record o tells of again (the nearest, so alike mails a minute apart each keep their own), else nil
-- and the oldest record of the other source it joins (or nil); records already matched in this read of
-- the inbox (used) are passed over.
local function find(book, o, used)
  local same, best, other = nil, math.huge, nil
  for i = #book.records, 1, -1 do
    local r = book.records[i]
    if not used[r] and r.kind == o.kind and sameItem(r, o) then
      local gap = sourceGap(r, o)
      if gap and gap < best then same, best = r, gap end
      if not gap and otherSource(r, o) then other = r end
    end
  end
  return same, other
end

-- o joins record r from the other source: a mail's units and amount stand (the money it brought),
-- an event's auction is kept, and what either knows of the item fills in.
local function join(r, o)
  if o.mail then r.mail, r.skew, r.qty, r.amount = o.mail, o.skew, o.qty, o.amount else r.auction = o.auction end
  r.id, r.name = r.id or o.id, r.name or o.name
end

-- A new record, the oldest going past AL.MAX.
local function add(book, o)
  book.records[#book.records + 1] = o
  while #book.records > AL.MAX do table.remove(book.records, 1) end
end

-- Notes the outcome o tells of (a record's fields; o.auction or o.mail says where from): nothing
-- when a record has it from the same source but its mail's latest read (so the next read is matched
-- against it, clock and all), joined to the other source's record of it, else a new record. used (a
-- read of the inbox's) keeps one record per mail; the card and strip follow.
function AL.Note(o, used)
  used = used or {}
  local same, other = find(AL.Book(), o, used)
  local r = same or other or o
  used[r] = true
  if same and o.mail then same.mail, same.skew = o.mail, o.skew end
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

-- A record of auction auctionID's outcome (a kind) from what it was (a), and a sale's amount.
local function eventRecord(kind, auctionID, a, amount)
  return { kind = kind, auction = auctionID, id = a.id, name = a.name, qty = a.qty, amount = amount, t = AP.Now() }
end

-- Your auctions list came in (OWNED_AUCTIONS_UPDATED): a sold row is a sale, and each auction up
-- is remembered, for the events that name only its ID.
function AL.OnOwned()
  local open = AL.Book().open
  for _, a in ipairs(AH.ReadOwned()) do
    local auctionID = a.id
    if a.status == "sold" then AL.Sold(auctionID, a) else open[auctionID] = openOf(a, open[auctionID]) end
  end
end

-- Auction id sold (row: its sold row from your auctions list, else it is as it was up): a sale of
-- its units at its price, unless the ledger never saw it; it is up no more.
function AL.Sold(auctionID, row)
  local book = AL.Book()
  local a = row and openOf(row) or book.open[auctionID]
  book.open[auctionID] = nil
  local amount = row and row.amount or a and a.unit and a.unit * a.qty
  if amount then AL.Note(eventRecord("sold", auctionID, a, amount)) end
end

-- Auction id ran out ("expired") or was cancelled ("cancelled"): a record of what it was; for a
-- notice about one the ledger never saw up, of one of the item it names. It is up no more.
function AL.Ended(kind, auctionID, name)
  if not auctionID then return end
  local book = AL.Book()
  local a = book.open[auctionID] or name and { id = idOf(name), name = name, qty = 1 }
  book.open[auctionID] = nil
  if a then AL.Note(eventRecord(kind, auctionID, a)) end
end

-- The game's notice about an auction (AUCTION_HOUSE_SHOW_FORMATTED_NOTIFICATION: the notice, its
-- text, which is the item's name, and the auction): one of yours sold, or ran out.
function AL.OnNotice(_, note, text, auctionID)
  auctionID = ns.PlainNumber(auctionID)
  if note == AH.SOLD_NOTE and auctionID then AL.Sold(auctionID) end
  if note == AH.EXPIRED_NOTE then AL.Ended("expired", auctionID, plain(text)) end
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
local function mailOf(i, pattern, now, skew)
  local _, _, _, subject, _, _, days, _, _, _, _, _, _, firstQty = GetInboxHeaderInfo(i)
  days = ns.PlainNumber(days)
  local o = days and (invoiceOf(i) or expiryOf(plain(subject), pattern, ns.PlainNumber(firstQty)))
  if o then o.mail, o.t, o.id, o.skew = math.floor(now + days * AP.DAY), now, idOf(o.name), skew end
  return o
end

-- How far the computer's clock (now) runs ahead of the realm's, in seconds, or nil when the client
-- doesn't say (GetServerTime).
local function clockSkew(now)
  local server = type(GetServerTime) == "function" and ns.PlainNumber(GetServerTime()) or nil
  return server and now - server
end

-- The inbox changed (MAIL_INBOX_UPDATE): what each mail tells of is noted, once per mail however
-- often the inbox is read.
function AL.ReadInbox()
  local n, pattern, now, used = ns.PlainNumber((GetInboxNumItems())) or 0, expiredPattern(), AP.Now(), {}
  local skew = clockSkew(now)
  for i = 1, n do
    local o = mailOf(i, pattern, now, skew)
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

-- What your sales seen since a moment (the login without one) came to, in copper (0 before the ledger
-- starts). Only a sale the auction house told of counts: one first read from the mail is stamped when
-- the inbox was read, which may be days after it sold.
function AL.SessionSales(since)
  local sum, from = 0, since or AL.since
  for _, r in ipairs(AL.since and AL.Book().records or {}) do
    if r.kind == "sold" and r.auction and r.t >= from then sum = sum + r.amount end
  end
  return sum
end

-- Your history on the Up now card ------------------------------------------------------------

-- What a record that didn't sell says in the price column, by its kind.
AL.ENDINGS = { expired = L["expired"], cancelled = L["cancelled"] }

-- The history's columns: a sale's price each (else what became of it), how many, and when.
AH.HISTORY_COLUMNS = { { key = "price", title = L["Price each"], width = 100, side = "RIGHT", role = "number", color = "gold" },
  { key = "qty", title = L["Qty"], width = 60, side = "RIGHT", role = "small", color = "text2" },
  { key = "time", title = L["When"], width = 90, side = "LEFT", role = "small", color = "text2" } }

-- The history's line: how many of the item's auctions sold of those that sold or ran out, and the
-- average price each; or that there is nothing yet, or no item.
local function summaryText(s, records)
  if not s then return L["Put an item on the Sell card to see how it sold."] end
  local n, avg = AL.Summary(records)
  if n.sold + n.expired == 0 then return L["No sales or expiries of this item yet."] end
  local text = ns.Format(L["sold {sold} of {total}"], { sold = n.sold, total = n.sold + n.expired })
  return avg and ns.Format(L["{sold} · avg {money}"], { sold = text, money = AP.Money(avg) }) or text
end

-- A history row: a sale's price each (in gold), else what became of it; how many, and when (the
-- item is the sell card's, so the row names none).
local function paintRecord(r, rec)
  local sold = rec.kind == "sold"
  r.icon:SetTexture(nil)
  r.name:SetText("")
  T.Color(r.cells.price, sold and "gold" or "text2"):SetText(sold and AP.Money(math.floor(rec.amount / rec.qty)) or AL.ENDINGS[rec.kind])
  r.cells.qty:SetText(ns.Format(L["x {count}"], { count = rec.qty }))
  r.cells.time:SetText(AP.Ago(rec.t))
end

-- The Up now card's other view: the item's history (its line beside the heading, its last
-- records in the listings' place) while Your history is on, else the listings; the toggle names
-- the other view.
function AH.PaintHistory(c, s)
  local on = AH.showHistory == true
  local records = on and s and AL.History(s.id) or {}
  c.table:SetShown(not on)
  c.history:SetShown(on)
  c.historyToggle.text:SetText(on and L["Up now"] or L["Your history"])
  c.summary:SetText(on and summaryText(s, records) or "")
  c.history:SetItems(records)
end

-- The sell card's history line: how its item sold ("sold 5 of 8 · avg 1s 12c"), nothing without an item.
function AH.PaintHistoryLine(c, s)
  c.historyLine:SetText(s and summaryText(s, AL.History(s.id)) or "")
end

-- Your history / Up now: the Up now card switches view.
function AH.ToggleHistory()
  AH.showHistory = not AH.showHistory
  AH.PaintSell()
end

-- The history's table in the listings' place (hidden until Your history), its line beside the
-- heading, and the toggle on the card's heading line.
function AH.BuildHistory(c)
  c.history = AH.Table(c, AH.HISTORY_COLUMNS, AH.LIST_ROWS, { paintRow = paintRecord })
  AH.TableUnder(c.history, c)
  c.history:Hide()
  c.summary = T.Text(c:CreateFontString(nil, "OVERLAY"), "small", "text2")
  c.summary:SetPoint("LEFT", c.title, "RIGHT", 8, 0)
  c.historyToggle = W.Button(c, L["Your history"], function() AH.ToggleHistory() end, 90)
  c.historyToggle:SetHeight(18)
  c.historyToggle:SetPoint("TOPRIGHT", 0, 2)
end

-- The ledger's events, through the helper's on: your auctions list, the notices,
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
