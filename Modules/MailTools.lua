-- Mail tools (off until you switch them on): a panel beside the mailbox that searches and
-- filters the inbox, and presets for sending items to your alts.
--   * Search: words typed in the panel (every word must appear in the sender, subject or first
--     item) and a filter (All, Money, Items, Sales) list up to 8 matching mails; Take takes the
--     mail's money and its first item, one click each. /vg mail <words> prints the same in chat.
--   * Presets: a name, the character it goes to and the words an item's name must contain,
--     /vg mail preset add <name> <character> [words], remove <name>, list. With the Send Mail tab
--     open, a preset's button (or /vg mail send <name>) types the character in and attaches the
--     matching items from your bags, up to 12; you press Send.
-- Nothing is taken, attached or sent without your click, and nothing here runs in combat.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

local MT = ns.Module("MailTools", { defaults = { on = false, presets = {} } })

-- The panel's width and padding, a row's height, rows, preset buttons, bags read, the game's attachment limit, mails scanned and the gap to the window.
MT.WIDTH, MT.PAD, MT.ROW, MT.ROWS, MT.BUTTONS, MT.BAGS, MT.ATTACH, MT.SCAN, MT.GAP = 270, 8, 24, 8, 4, 4, 12, 60, 8
-- The filters in the order the button cycles them; the one in use and the words typed.
MT.FILTERS, MT.filter, MT.query = { "All", "Money", "Items", "Sales" }, "All", ""

-- Reading the inbox --------------------------------------------------------------------------

-- Plain text, else "" (a name or subject the client hides).
local function plain(value)
  return type(value) == "string" and not ns.IsSecret(value) and value or ""
end

-- Mail i as { index, sender, subject, money, items, link, sale }; nil when there is none.
function MT.Read(i)
  local _, _, sender, subject, money, _, _, count, _, _, _, _, _, _, link = GetInboxHeaderInfo(i)
  if sender == nil and subject == nil then return nil end
  return { index = i, sender = plain(sender), subject = plain(subject), money = ns.PlainNumber(money) or 0,
    items = ns.PlainNumber(count) or 0, link = plain(link), sale = type(GetInboxInvoiceInfo) == "function" and GetInboxInvoiceInfo(i) ~= nil }
end

-- Whether a mail passes the named filter (All keeps everything).
local function keeps(filter, m)
  if filter == "Money" then return m.money > 0 end
  if filter == "Items" then return m.items > 0 end
  if filter == "Sales" then return m.sale end
  return true
end

-- Whether a mail passes the filter and holds every word typed (in any case).
function MT.Matches(m, query)
  local hay = (m.sender .. " " .. m.subject .. " " .. m.link):lower()
  for word in (query or ""):lower():gmatch("%S+") do
    if not hay:find(word, 1, true) then return false end
  end
  return keeps(MT.filter, m)
end

-- The mails that match, in inbox order.
function MT.Find(query)
  local out = {}
  for i = 1, math.min(MT.SCAN, type(GetInboxNumItems) == "function" and ns.PlainNumber((GetInboxNumItems())) or 0) do
    local m = MT.Read(i)
    if m and MT.Matches(m, query) then out[#out + 1] = m end
  end
  return out
end

-- A mail as one line: "sender: subject", with its money and item count.
local function describe(m)
  local what = {}
  if m.money > 0 then what[#what + 1] = ns.AuctionPrices.Money(m.money) end
  if m.items > 0 then what[#what + 1] = m.items .. (m.items == 1 and " item" or " items") end
  return string.format("%s: %s%s", m.sender ~= "" and m.sender or "?", m.subject, #what > 0 and (" (" .. table.concat(what, ", ") .. ")") or "")
end

-- Takes a mail's money and its first item (one click each; the game needs a moment between items).
function MT.Take(m)
  if m.money > 0 and type(TakeInboxMoney) == "function" then TakeInboxMoney(m.index) end
  if m.items > 0 and type(TakeInboxItem) == "function" then TakeInboxItem(m.index, 1) end
end

-- Presets ------------------------------------------------------------------------------------

-- The preset with a name (any case), and its place in the list.
local function preset(name)
  for i, p in ipairs(MT.settings.presets) do
    if p.name:lower() == (name or ""):lower() then return p, i end
  end
end

-- Adds or replaces a preset: a name, the character and the words an item's name must hold.
function MT.AddPreset(name, to, words)
  local old, at = preset(name)
  local p = { name = name, to = to, words = words }
  if old then MT.settings.presets[at] = p else table.insert(MT.settings.presets, p) end
  ns.Chat(string.format("Preset %s: send to %s%s.", name, to, words ~= "" and (" what is named " .. words) or " every item"))
end

-- Whether an item's name holds one of the preset's words (any word when there are none).
local function wanted(name, words)
  local any = false
  for word in words:lower():gmatch("[^,%s]+") do
    any = true
    if name:lower():find(word, 1, true) then return true end
  end
  return not any
end

-- The name of the item in a bag slot ("" for an empty slot).
local function slotName(bag, slot)
  local info = C_Container.GetContainerItemInfo(bag, slot)
  return info and (C_Item.GetItemInfo(info.itemID)) or ""
end

-- Attaches the bag items that fit a preset (a bag slot at a time, up to the game's limit); how many.
function MT.Attach(words)
  local n = 0
  for bag = 0, MT.BAGS do
    for slot = 1, C_Container.GetContainerNumSlots(bag) do
      local name = slotName(bag, slot)
      if n < MT.ATTACH and name ~= "" and wanted(name, words) then C_Container.UseContainerItem(bag, slot) n = n + 1 end
    end
  end
  return n
end

-- Sends: the Send Mail tab (open) gets the character's name and the items; you press Send.
function MT.Send(name)
  local p = preset(name)
  if not p then return ns.Chat("No preset called " .. tostring(name) .. ". /vg mail preset lists them.") end
  if ns.InCombat() or not (SendMailFrame and SendMailFrame:IsVisible()) then return ns.Chat("Open the Send Mail tab (out of combat) first.") end
  SendMailNameEditBox:SetText(p.to)
  ns.Chat(string.format("%s: %d items attached for %s. Press Send.", p.name, MT.Attach(p.words), p.to))
end

-- The panel ----------------------------------------------------------------------------------

-- Row i's text and Take button: the mail shown (nil hides the row).
local function paintRow(row, m)
  row:SetShown(m ~= nil)
  row.mail = m
  if not m then return end
  row.text:SetText(describe(m))
  row.take:SetShown(m.money > 0 or m.items > 0)
end

-- Draws the panel: shown while the mailbox is open and the tools are on; the matches in its rows.
function MT.Paint()
  local open = MT.settings and MT.settings.on and type(MailFrame) == "table" and MailFrame:IsVisible()
  local f = MT.frame or (open and MT.Build())
  if not f then return end
  f:SetShown(open and true or false)
  if not open then return end
  MT.Place(f)
  MT.PaintRows(f)
  MT.PaintPresets()
end

-- The matching mails in the rows, the filter's name, and the line shown when no row is.
function MT.PaintRows(f)
  local found = MT.Find(MT.query)
  for i, row in ipairs(f.rows) do paintRow(row, found[i]) end
  f.filterButton.text:SetText(MT.filter)
  MT.PaintEmpty(#found)
end

-- Sits the panel right of the mail window's own panel (which reaches past the window), on its layer.
function MT.Place(f)
  f:ClearAllPoints()
  f:SetPoint("TOPLEFT", MailFrame, "TOPRIGHT", MT.GAP + (T.Padding(MailFrame) or 0), 0)
  f:SetFrameStrata(MailFrame:GetFrameStrata())
  f:SetFrameLevel(MailFrame:GetFrameLevel())
end

-- The line shown instead of rows: an empty inbox, no matches, or nothing (rows shown); and the preset hint.
function MT.PaintEmpty(found)
  local total = type(GetInboxNumItems) == "function" and ns.PlainNumber((GetInboxNumItems())) or 0
  MT.frame.empty:SetShown(found == 0)
  MT.frame.empty:SetText(total == 0 and "Your inbox is empty." or "No mail matches.")
  MT.frame.hint:SetShown(#MT.settings.presets == 0)
end

-- A row's line of text, left of its Take button.
local function rowText(r)
  r.text = T.Text(r:CreateFontString(nil, "OVERLAY"), "label", "text")
  r.text:SetPoint("LEFT", 0, 0)
  r.text:SetPoint("RIGHT", r.take, "LEFT", -4, 0)
  r.text:SetWordWrap(false)
end

-- Row i: its line and the Take button.
local function buildRow(f, i)
  local r = CreateFrame("Frame", nil, f)
  r:SetHeight(MT.ROW)
  r:SetPoint("TOPLEFT", MT.PAD, -64 - (i - 1) * MT.ROW)
  r:SetPoint("TOPRIGHT", -MT.PAD, -64 - (i - 1) * MT.ROW)
  r.take = W.Button(r, "Take", function() if r.mail then MT.Take(r.mail) end end, 48)
  r.take:SetPoint("RIGHT", 0, 0)
  rowText(r)
  return r
end

-- The search box and the filter button under the heading.
local function buildSearch(f)
  f.search = W.Input(f, 150)
  f.search:SetPoint("TOPLEFT", MT.PAD, -30)
  f.search:SetScript("OnTextChanged", ns.Guard("mail search", function(self) MT.query = self:GetText() or "" MT.Paint() end))
  f.filterButton = W.Button(f, MT.filter, function() MT.CycleFilter() end, 90)
  f.filterButton:SetPoint("LEFT", f.search, "RIGHT", 6, 0)
end

-- The preset buttons along the bottom (the first few presets), each sending its preset.
local function buildPresets(f)
  f.presets = {}
  for i = 1, MT.BUTTONS do
    local b
    b = W.Button(f, "Preset", function() if b.preset then MT.Send(b.preset) end end, 60)
    b:SetPoint("BOTTOMLEFT", MT.PAD + (i - 1) * 64, MT.PAD)
    f.presets[i] = b
  end
end

-- The panel's heading, the empty-list line and the hint shown while there are no presets.
local function heading(f)
  f.title = T.Text(f:CreateFontString(nil, "OVERLAY"), "heading")
  f.title:SetPoint("TOPLEFT", MT.PAD, -MT.PAD)
  f.title:SetText("Find mail")
  f.empty = T.Text(f:CreateFontString(nil, "OVERLAY"), "label", "text2")
  f.empty:SetPoint("TOP", 0, -64 - MT.ROW)
  f.hint = T.Text(f:CreateFontString(nil, "OVERLAY"), "label", "text2")
  f.hint:SetPoint("BOTTOM", 0, MT.PAD + 6)
  f.hint:SetText("No presets: /vg mail preset add <name> <character> [words]")
end

-- The panel, built when the mailbox first opens with the tools on: right of the mail window.
function MT.Build()
  local f = T.Panel(CreateFrame("Frame", "Vanguard_MailTools", UIParent), { shadow = true, alpha = 1 })
  f:SetSize(MT.WIDTH, 64 + MT.ROWS * MT.ROW + 40)
  heading(f)
  f.rows = {}
  for i = 1, MT.ROWS do f.rows[i] = buildRow(f, i) end
  buildSearch(f)
  buildPresets(f)
  MT.frame = f
  return f
end

-- The filter button: the next filter.
function MT.CycleFilter()
  for i, name in ipairs(MT.FILTERS) do
    if name == MT.filter then MT.filter = MT.FILTERS[i % #MT.FILTERS + 1] break end
  end
  MT.Paint()
end

-- Labels the preset buttons with the presets (the rest hide).
function MT.PaintPresets()
  if not MT.frame then return end
  for i, b in ipairs(MT.frame.presets) do
    local p = MT.settings.presets[i]
    b.preset = p and p.name
    b:SetShown(p ~= nil)
    if p then b.text:SetText(p.name) end
  end
end

-- The command ---------------------------------------------------------------------------------

-- Drops the preset with a name, and says so.
local function removePreset(name)
  local _, at = preset(name)
  if at then table.remove(MT.settings.presets, at) end
  ns.Chat(at and ("Preset " .. name .. " removed.") or ("No preset called " .. name .. "."))
end

-- Lists the presets.
local function listPresets()
  for _, p in ipairs(MT.settings.presets) do ns.Chat(string.format("%s: to %s, %s", p.name, p.to, p.words ~= "" and p.words or "every item")) end
  if #MT.settings.presets == 0 then ns.Chat("No presets yet. /vg mail preset add <name> <character> [words]") end
end

-- /vg mail preset [add <name> <character> [words]|remove <name>]: lists, adds or removes.
function MT.PresetCommand(arg)
  local verb, rest = arg:match("^(%S*)%s*(.-)$")
  local name, to, words = rest:match("^(%S+)%s+(%S+)%s*(.-)$")
  if verb == "add" and not name then ns.Chat("/vg mail preset add <name> <character> [words the item's name holds]")
  elseif verb == "add" then MT.AddPreset(name, to, words)
  elseif verb == "remove" then removePreset(rest)
  else listPresets() end
  MT.PaintPresets()
end

-- Prints the inbox mails matching the words, up to the panel's rows.
function MT.Search(words)
  local found = MT.Find(words)
  if #found == 0 then return ns.Chat("No mail matches.") end
  for i = 1, math.min(#found, MT.ROWS) do ns.Chat(string.format("%d. %s", found[i].index, describe(found[i]))) end
  if #found > MT.ROWS then ns.Chat(string.format("+%d more.", #found - MT.ROWS)) end
end

-- /vg mail [words]|preset ...|send <name>.
function MT.Command(rest)
  rest = rest or ""
  if not MT.settings or not MT.settings.on then return ns.Chat("The mail tools are off (/vg > Town and gear > Mail tools).") end
  local word, arg = rest:match("^(%S*)%s*(.-)$")
  if word == "preset" then return MT.PresetCommand(arg) end
  if word == "send" then return MT.Send(arg) end
  MT.Search(rest)
end

-- Module entry point (Core/Modules.lua): the panel follows the mailbox.
function MT.Enable(settings)
  MT.settings = settings
  ns.On("MAIL_SHOW", ns.Guard("mail tools", function() MT.Paint() MT.PaintPresets() end))
  ns.On("MAIL_INBOX_UPDATE", ns.Guard("mail tools", MT.Paint))
  ns.On("MAIL_CLOSED", ns.Guard("mail tools", function() if MT.frame then MT.frame:Hide() end end))
end
