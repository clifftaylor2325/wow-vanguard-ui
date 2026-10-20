-- Mail tools (off until you switch them on): a panel beside the mailbox that searches and
-- filters the inbox, and presets for sending items to your alts.
--   * Search: words typed in the panel (every word must appear in the sender, subject or first
--     item) and a filter (All, Money, Items, Sales) list up to 8 matching mails; Take takes the
--     mail's money and its first item, one click each. /vg mail <words> prints the same in chat.
--   * Presets: a name, the character it goes to and the words an item's name must contain,
--     made with the panel's + Add button (a right-click on a preset's button removes it), or
--     /vg mail preset add <name> <character> [words], remove <name>, list. With the Send Mail tab
--     open, a preset's button (or /vg mail send <name>) types the character in and attaches the
--     matching items from your bags, up to 12; you press Send.
--   * Take all and Return all: the money and items of every mail the panel shows (its filter and words
--     applied), one step at a time, or those mails sent back to their senders after a question;
--     /vg mail takeall and returnall do the same. Pay-on-delivery mail is never taken, and a sale,
--     system or game master mail is never returned.
-- Nothing is taken, attached or sent without your click, and nothing here runs in combat.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

local MT = ns.Module("MailTools", { defaults = { on = false, presets = {} } })

-- The panel's width and padding (a HUD card's, T.SPACE.gap), a row's height (T.ROW.height), rows, preset buttons,
-- bags read, the game's attachment limit, mails scanned and the gap to the window (T.SPACE.gap).
MT.WIDTH, MT.PAD, MT.ROW, MT.ROWS, MT.BUTTONS, MT.BAGS, MT.ATTACH, MT.SCAN, MT.GAP = 270, T.SPACE.gap, T.ROW.height, 8, 4, 4, 12, 60, T.SPACE.gap
-- The attachment slots a received mail has (ATTACHMENTS_MAX_RECEIVE in Blizzard_MailFrame/MailFrame.lua).
MT.RECEIVE = 16
-- Where the search line (the box, with the filter button on its middle) and the first row start, down from the top:
-- under the heading; the room along the bottom for the preset buttons; and a preset button's width.
local SEARCH_TOP, ROWS_TOP, PRESET_W = 30, 64, 60
-- The room along the bottom: the preset buttons, and above them the Take all and Return all buttons.
local FOOT = 2 * (T.SPACE.gap + T.BUTTON_H) + T.SPACE.gap
-- The filters in the order the button cycles them; the one in use and the words typed.
MT.FILTERS, MT.filter, MT.query = { "All", "Money", "Items", "Sales" }, "All", ""

-- Reading the inbox --------------------------------------------------------------------------

-- Plain text, else "" (a name or subject the client hides).
local function plain(value)
  return type(value) == "string" and not ns.IsSecret(value) and value or ""
end

-- Mail i as { index, sender, subject, money, items, link, cod, returnable, sale }; nil when there is none.
function MT.Read(i)
  local _, _, sender, subject, money, cod, _, count, _, _, _, reply, gm, _, link = GetInboxHeaderInfo(i)
  if sender == nil and subject == nil then return nil end
  return { index = i, sender = plain(sender), subject = plain(subject), money = ns.PlainNumber(money) or 0,
    items = ns.PlainNumber(count) or 0, link = plain(link), cod = ns.PlainNumber(cod) or 0,
    returnable = not ns.IsSecret(reply) and reply == true and not ns.IsSecret(gm) and gm ~= true, sale = type(GetInboxInvoiceInfo) == "function" and GetInboxInvoiceInfo(i) ~= nil }
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
  if m.cod > 0 then what[#what + 1] = "pay " .. ns.AuctionPrices.Money(m.cod) .. " on delivery" end
  return string.format("%s: %s%s", m.sender ~= "" and m.sender or "?", m.subject, #what > 0 and (" (" .. table.concat(what, ", ") .. ")") or "")
end

-- Whether the mail at its place is the one that was read: its place, sender, subject, money, item count,
-- pay-on-delivery amount and first item all match (a shifted inbox puts another mail there).
local function unchanged(m)
  local now = MT.Read(m.index)
  if not now then return false end
  for _, key in ipairs({ "sender", "subject", "money", "items", "cod", "link" }) do
    if now[key] ~= m[key] then return false end
  end
  return true
end

-- The first attachment slot of mail i that still holds an item, or nil. Slots keep their numbers as items
-- leave, so after the first take slot 1 is empty while later ones still hold theirs.
local function firstItem(i)
  if type(HasInboxItem) ~= "function" then return nil end
  for n = 1, MT.RECEIVE do
    if HasInboxItem(i, n) then return n end
  end
end

-- Takes a mail's money and its first item (one click each; the game needs a moment between items). A mail that
-- asks for payment on delivery is never taken here, and neither is one that is no longer what the row showed.
function MT.Take(m)
  if m.cod > 0 then return ns.Chat("Mail: that one asks for payment on delivery. Open it in the mail window, where the game asks you first.") end
  if not unchanged(m) then return ns.Chat("Mail: that mail has moved. Look at the list again.") end
  if m.money > 0 and type(TakeInboxMoney) == "function" then TakeInboxMoney(m.index) end
  local slot = m.items > 0 and firstItem(m.index)
  if slot and type(TakeInboxItem) == "function" then TakeInboxItem(m.index, slot) end
end

-- Take all and Return all ---------------------------------------------------------------------

MT.STEP = 0.3

-- How many steps empty the mails: each one's money and its items (a mail that asks for payment on delivery
-- is left alone). Only the count: Take all reads each mail again before every step it takes.
function MT.TakeCount(mails)
  local n = 0
  for _, m in ipairs(mails) do
    if m.cod == 0 then n = n + (m.money > 0 and 1 or 0) + math.min(m.items, MT.RECEIVE) end
  end
  return n
end

-- Whether mail now (read again) can still be the listed mail m as Take all empties it: the same sender and
-- subject, nothing to pay on delivery, and no more money or items than were listed.
local function sameMail(now, m)
  return now.sender == m.sender and now.subject == m.subject and now.cod == 0 and now.money <= m.money and now.items <= m.items
end

-- One take from mail m (read again): its money, else its first item left; false when it holds neither (or
-- the game lacks the call).
local function takeFrom(m)
  if m.money > 0 and type(TakeInboxMoney) == "function" then TakeInboxMoney(m.index) return true end
  local slot = m.items > 0 and firstItem(m.index)
  if slot and type(TakeInboxItem) == "function" then TakeInboxItem(m.index, slot) return true end
  return false
end

-- Whether the last take from mail now (read again, the game done answering) changed nothing: the game refused
-- it (bags full, a unique item you already carry). It no longer counts, and chat says so once, as the run passes the mail.
local function refused(run, now)
  local last = run.last
  if not (last and last.index == now.index and last.money == now.money and last.items == now.items) then return false end
  run.last, run.done = nil, run.done - 1
  ns.Chat(string.format("Mail: could not take from %s (bags full?).", now.subject ~= "" and now.subject or now.sender))
  return true
end

-- A take went out from mail now: noted (so the next read tells a refused one) and counted, never past the steps planned.
local function took(run, now)
  run.last = { index = now.index, money = now.money, items = now.items }
  run.done = math.min(run.done + 1, run.total)
  return true
end

-- Take all's next step: while the game is still busy with the last take, nothing (and the run waits);
-- else one take from the first mail left on the run's list that is still itself, passing those that are
-- empty, gone, changed or refused. False once none is left.
local function takeNext(run)
  if C_Mail and C_Mail.IsCommandPending and C_Mail.IsCommandPending() then return true end
  local m = run.mails[1]
  while m do
    local now = MT.Read(m.index)
    if now and sameMail(now, m) and not refused(run, now) and takeFrom(now) then return took(run, now) end
    table.remove(run.mails, 1)
    m = run.mails[1]
  end
  return false
end

-- Return all's next step: the first mail left on the run's list that is still as listed goes back to its
-- sender, passing those that changed. False once none is left.
local function returnNext(run)
  local m = table.remove(run.mails, 1)
  while m and not unchanged(m) do m = table.remove(run.mails, 1) end
  if not m then return false end
  ReturnInboxItem(m.index)
  run.done = run.done + 1
  return true
end

-- The mails Return all sends back, the last in the inbox first so the others keep their places. Only
-- mail from a player that holds something and is not a sale.
function MT.ReturnMails(mails)
  local out = {}
  for _, m in ipairs(mails) do
    if m.returnable and not m.sale and (m.money > 0 or m.items > 0) then table.insert(out, 1, m) end
  end
  return out
end

-- Runs a run's steps one at a time (the game needs a moment between them), stopping when the mailbox
-- closes, combat starts or no step is left; says how many steps went through of those planned.
function MT.Run(run)
  if not MT.mailOpen or ns.InCombat() or not run.step(run) then
    MT.running = nil
    return ns.Chat(string.format("%s: %d of %d done.", run.label, run.done, run.total))
  end
  if C_Timer and C_Timer.After then return C_Timer.After(MT.STEP, ns.Guard("mail run", function() MT.Run(run) end)) end
  MT.Run(run)
end

-- Starts a run (its label, the mails, the step that works through them and the steps planned) unless one
-- is going or there is nothing to do.
local function start(label, mails, step, total)
  if MT.running then return ns.Chat("Mail: a run is already going.") end
  if total == 0 then return ns.Chat(label .. ": nothing to do.") end
  MT.running = true
  MT.Run({ label = label, mails = mails, step = step, total = total, done = 0 })
end

-- The mails Take all empties, the last in the inbox first: an emptied mail leaves the inbox and moves up
-- the mails after it, never those still to go.
local function takeMails(mails)
  local out = {}
  for _, m in ipairs(mails) do table.insert(out, 1, m) end
  return out
end

-- Take all: the money and items of every mail the panel shows (its filter and words), COD mail excepted.
function MT.TakeAll()
  local mails = MT.Find(MT.query)
  start("Take all", takeMails(mails), takeNext, MT.TakeCount(mails))
end

-- Return all: after a question, sends the shown mails that can go back to their senders.
function MT.ReturnAll()
  local mails = MT.ReturnMails(MT.Find(MT.query))
  if #mails == 0 then return ns.Chat("Return all: nothing to return.") end
  ns.Ask(string.format("Return %d mail(s) to their senders?", #mails), "Return", function() start("Return all", mails, returnNext, #mails) end, nil, "danger")
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

-- The name of the item in a bag slot that can go in the mail ("" for an empty slot, a soulbound item the
-- game refuses, or a locked one, such as an item already attached).
local function slotName(bag, slot)
  local info = C_Container.GetContainerItemInfo(bag, slot)
  local mailable = info and not info.isBound and not info.isLocked
  return mailable and (C_Item.GetItemInfo(info.itemID)) or ""
end

-- Attaches the bag items that fit a preset and can be mailed (a bag slot at a time, up to the game's limit); how many.
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
  row.take:SetShown(m.cod == 0 and (m.money > 0 or m.items > 0))
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

-- The matching mails in the rows, "+N more" for those past the rows, the filter's name, and the line shown
-- when no row is.
function MT.PaintRows(f)
  local found = MT.Find(MT.query)
  for i, row in ipairs(f.rows) do paintRow(row, found[i]) end
  f.more:SetShown(#found > MT.ROWS)
  f.more:SetText(string.format("+%d more", #found - MT.ROWS))
  f.filterButton.text:SetText(MT.filter)
  MT.PaintEmpty(#found)
end

-- Sits the panel right of the mail window's own panel (which reaches past the window), on its layer, as
-- its child: however the mailbox closes (X, Escape, walking away), the panel goes with it.
function MT.Place(f)
  f:SetParent(MailFrame)
  f:ClearAllPoints()
  f:SetPoint("TOPLEFT", MailFrame, "TOPRIGHT", MT.GAP + (T.Padding(MailFrame) or 0), 0)
  f:SetFrameStrata(MailFrame:GetFrameStrata())
  f:SetFrameLevel(MailFrame:GetFrameLevel())
end

-- The line shown instead of rows: an empty inbox, no matches, or nothing (rows shown).
function MT.PaintEmpty(found)
  local total = type(GetInboxNumItems) == "function" and ns.PlainNumber((GetInboxNumItems())) or 0
  MT.frame.empty:SetShown(found == 0)
  MT.frame.empty:SetText(total == 0 and "Your inbox is empty." or "No mail matches.")
end

-- A row's line of text, left of its Take button.
local function rowText(r)
  r.text = T.Text(r:CreateFontString(nil, "OVERLAY"), "label", "text")
  r.text:SetPoint("LEFT", 0, 0)
  r.text:SetPoint("RIGHT", r.take, "LEFT", -T.SPACE.tight, 0)
  r.text:SetWordWrap(false)
end

-- Row i (W.Row: the line under the mouse is washed): its line and the Take button.
local function buildRow(f, i)
  local r = W.Row(f, MT.ROW)
  r:SetPoint("TOPLEFT", MT.PAD, -ROWS_TOP - (i - 1) * MT.ROW)
  r:SetPoint("TOPRIGHT", -MT.PAD, -ROWS_TOP - (i - 1) * MT.ROW)
  r.take = W.Button(r, "Take", function() if r.mail then MT.Take(r.mail) end end, 48)
  r.take:SetPoint("RIGHT", 0, 0)
  rowText(r)
  return r
end

-- The search box and the filter button under the heading.
local function buildSearch(f)
  f.search = W.Input(f, 150)
  f.search:SetPoint("TOPLEFT", MT.PAD, -SEARCH_TOP)
  f.search:SetScript("OnTextChanged", ns.Guard("mail search", function(self) MT.query = self:GetText() or "" MT.Paint() end))
  f.filterButton = W.Button(f, MT.filter, function() MT.CycleFilter() end, 90)
  f.filterButton:SetPoint("LEFT", f.search, "RIGHT", T.SPACE.gap, 0)
end

-- Take all and Return all above the preset buttons, and beside them how many more mails match than the
-- rows show (both buttons act on those too; small muted).
local function buildBulk(f)
  f.takeAll = W.Button(f, "Take all", function() MT.TakeAll() end, 100)
  f.takeAll:SetPoint("BOTTOMLEFT", MT.PAD, MT.PAD + T.BUTTON_H + T.SPACE.gap)
  f.returnAll = W.Button(f, "Return all", function() MT.ReturnAll() end, 100)
  f.returnAll:SetPoint("LEFT", f.takeAll, "RIGHT", T.SPACE.gap, 0)
  f.more = T.Text(f:CreateFontString(nil, "OVERLAY"), "small", "muted")
  f.more:SetPoint("LEFT", f.returnAll, "RIGHT", T.SPACE.gap, 0)
end

-- How far in from the left the i-th place along the bottom (a preset button, or + Add) sits.
local function slot(i)
  return MT.PAD + (i - 1) * (PRESET_W + T.SPACE.tight)
end

-- Preset button i: a click sends its preset, a right-click asks to remove it; pointing at it says what it sends.
local function presetButton(f, i)
  local b
  b = W.Button(f, "Preset", function(_, button) MT.PresetClick(b.preset, button) end, PRESET_W)
  b:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  b:SetPoint("BOTTOMLEFT", slot(i), MT.PAD)
  b:HookScript("OnEnter", ns.Guard("mail preset tip", function(self) MT.PresetTip(self) end))
  b:HookScript("OnLeave", ns.Guard("mail preset tip", function() GameTooltip:Hide() end))
  return b
end

-- The preset buttons along the bottom (the first few presets), + Add in the first free place, and the hint
-- beside it while there are no presets.
local function buildPresets(f)
  f.presets = {}
  for i = 1, MT.BUTTONS do f.presets[i] = presetButton(f, i) end
  f.addPreset = W.Button(f, "+ Add", function() MT.AskPreset() end, PRESET_W)
  f.hint:SetPoint("LEFT", f.addPreset, "RIGHT", T.SPACE.gap, 0)
end

-- The panel's heading (ns.WindowTitle: a card's; the panel follows the mail window, so it has no close button),
-- the empty-state line (label muted) and the hint shown while there are no presets (a note: small muted).
local function heading(f)
  ns.WindowTitle(f, "Find mail", { kind = "card" })
  f.empty = T.Text(f:CreateFontString(nil, "OVERLAY"), "label", "muted")
  f.empty:SetPoint("TOP", 0, -ROWS_TOP - MT.ROW)
  f.hint = T.Text(f:CreateFontString(nil, "OVERLAY"), "small", "muted")
  f.hint:SetWidth(MT.WIDTH - 2 * MT.PAD - PRESET_W - T.SPACE.gap)
  f.hint:SetJustifyH("LEFT")
  f.hint:SetText("No presets yet.")
end

-- The panel, built when the mailbox first opens with the tools on: right of the mail window.
function MT.Build()
  local f = T.Panel(CreateFrame("Frame", "Vanguard_MailTools", UIParent), { shadow = true, alpha = T.ALPHA.opaque })
  f:SetSize(MT.WIDTH, ROWS_TOP + MT.ROWS * MT.ROW + FOOT)
  heading(f)
  f.rows = {}
  for i = 1, MT.ROWS do f.rows[i] = buildRow(f, i) end
  buildSearch(f)
  buildBulk(f)
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

-- Labels the preset buttons with the presets (the rest hide), and puts + Add after them.
function MT.PaintPresets()
  if not MT.frame then return end
  for i, b in ipairs(MT.frame.presets) do
    local p = MT.settings.presets[i]
    b.preset = p and p.name
    b:SetShown(p ~= nil)
    if p then b.text:SetText(p.name) end
  end
  MT.PaintAdd()
end

-- + Add in the first free place along the bottom (hidden once every place holds a preset), and the hint
-- beside it while there are none.
function MT.PaintAdd()
  local add, n = MT.frame.addPreset, #MT.settings.presets
  MT.frame.hint:SetShown(n == 0)
  add:SetShown(n < MT.BUTTONS)
  add:ClearAllPoints()
  add:SetPoint("BOTTOMLEFT", slot(math.min(n, MT.BUTTONS - 1) + 1), MT.PAD)
end

-- The command ---------------------------------------------------------------------------------

-- Drops the preset with a name, and says so.
local function removePreset(name)
  local _, at = preset(name)
  if at then table.remove(MT.settings.presets, at) end
  ns.Chat(at and ("Preset " .. name .. " removed.") or ("No preset called " .. name .. "."))
end

-- A preset button's click: the left button sends its preset, the right one asks to remove it.
function MT.PresetClick(name, button)
  if not name then return end
  if button == "RightButton" then return MT.AskRemove(name) end
  MT.Send(name)
end

-- Asks, then removes a preset and its button.
function MT.AskRemove(name)
  ns.Ask(string.format("Remove the preset %s?", name), "Remove", function() removePreset(name) MT.PaintPresets() end, nil, "danger")
end

-- The tooltip on a preset button: what it sends to whom, and how to remove it.
function MT.PresetTip(b)
  local p = preset(b.preset)
  if not p then return end
  GameTooltip:SetOwner(b, "ANCHOR_TOP")
  GameTooltip:SetText(p.name, T.RGB("text"))
  GameTooltip:AddLine(string.format("Sends %s to %s.", p.words ~= "" and ("items named " .. p.words) or "every item", p.to), T.RGB("muted"))
  GameTooltip:AddLine("Right-click to remove.", T.RGB("muted"))
  GameTooltip:Show()
end

-- A preset typed as "<name> <character> [words]": its name, character and words; nil without the first two.
local function parsePreset(text)
  return (text or ""):match("^%s*(%S+)%s+(%S+)%s*(.-)%s*$")
end

-- + Add: asks for the preset's name, character and words in the text box.
function MT.AskPreset()
  ns.AskText("New preset: a name, the character, then words in the items' names (none: every item)", MT.AddTyped, "Add")
end

-- Adds the preset typed in the text box and closes it; without a name and a character, says what it needs.
function MT.AddTyped(text)
  local name, to, words = parsePreset(text)
  if not name then return ns.Chat("A preset needs a name and a character, such as: Smith Bobalt iron") end
  MT.AddPreset(name, to, words)
  MT.PaintPresets()
  ns.HideText()
end

-- Lists the presets.
local function listPresets()
  for _, p in ipairs(MT.settings.presets) do ns.Chat(string.format("%s: to %s, %s", p.name, p.to, p.words ~= "" and p.words or "every item")) end
  if #MT.settings.presets == 0 then ns.Chat("No presets yet. /vg mail preset add <name> <character> [words]") end
end

-- /vg mail preset [add <name> <character> [words]|remove <name>]: lists, adds or removes.
function MT.PresetCommand(arg)
  local verb, rest = arg:match("^(%S*)%s*(.-)$")
  local name, to, words = parsePreset(rest)
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

-- /vg mail [words]|preset ...|send <name>|takeall|returnall.
function MT.Command(rest)
  rest = rest or ""
  if not MT.settings or not MT.settings.on then return ns.Chat("The mail tools are off (/vg > Town and gear > Mail tools).") end
  local word, arg = rest:match("^(%S*)%s*(.-)$")
  if word == "preset" then return MT.PresetCommand(arg) end
  if word == "send" then return MT.Send(arg) end
  if word == "takeall" then return MT.TakeAll() end
  if word == "returnall" then return MT.ReturnAll() end
  MT.Search(rest)
end

-- Module entry point (Core/Modules.lua): the panel follows the mailbox.
function MT.Enable(settings)
  MT.settings = settings
  ns.On("MAIL_SHOW", ns.Guard("mail tools", function() MT.mailOpen = true MT.Paint() MT.PaintPresets() end))
  ns.On("MAIL_INBOX_UPDATE", ns.Guard("mail tools", MT.Paint))
  ns.On("MAIL_CLOSED", ns.Guard("mail tools", function() MT.mailOpen = false if MT.frame then MT.frame:Hide() end end))
end
