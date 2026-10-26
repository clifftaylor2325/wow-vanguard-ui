-- What's new: the first login after an update shows "What's new in Vanguard x.y", the notes
-- for the running version (Core/WhatsNewNotes.lua) grouped by module; clicking a line opens
-- its setting in the options window. Once per version per account (VanguardDB.whatsNewSeen).
-- A new account skips it (setup comes first), and while setup is open it waits for setup to
-- end. It never opens by itself in combat. /vg whatsnew and the General page open it again.

local ADDON, ns = ...
local L = ns.L

local T, W = ns.Theme, ns.Widgets

local WN = {}
ns.WhatsNew = WN

-- The window's size and its inner margin (a dialog's: T.SPACE.pad).
local WIDTH, HEIGHT, PAD = 440, 392, T.SPACE.pad
-- Where the list starts: the title line (T.CONTROL.inset), the title and its hint under it (about 36 units),
-- and a column gap.
local TOP = T.CONTROL.inset + 36 + T.SPACE.col
-- The list's width: the window less its margins and the room right of it for its scroll thumb.
local LIST_W = WIDTH - 2 * PAD - T.SPACE.col
-- The gap after a line, and after a group.
local LINE_GAP, GROUP_GAP = T.SPACE.gap, T.SPACE.col

local frame
-- The strings drawn in the accent (the links), repainted each time the window opens.
local accented = {}

-- Versions ----------------------------------------------------------------------------------

-- The addon version from the TOC ("?" when the client can't say).
function ns.AddonVersion()
  local get = (C_AddOns and C_AddOns.GetAddOnMetadata) or GetAddOnMetadata
  local ok, v = pcall(get, ADDON, "Version")
  return ok and v or "?"
end

-- A version's numbers in order: "0.6.1" gives { 0, 6, 1 }.
local function numbers(v)
  local out = {}
  for n in tostring(v):gmatch("%d+") do out[#out + 1] = tonumber(n) end
  return out
end

-- True when version a comes after version b.
local function after(a, b)
  local x, y = numbers(a), numbers(b)
  for i = 1, math.max(#x, #y) do
    if (x[i] or 0) ~= (y[i] or 0) then return (x[i] or 0) > (y[i] or 0) end
  end
  return false
end

-- The notes written for exactly this version, or nil.
function WN.Notes(v)
  for _, entry in ipairs(ns.WHATS_NEW) do
    if entry.version == v then return entry end
  end
end

-- The newest notes for this version or an older one (what /vg whatsnew shows), or nil.
function WN.Latest(v)
  local best
  for _, entry in ipairs(ns.WHATS_NEW) do
    if not after(entry.version, v) and (not best or after(entry.version, best.version)) then best = entry end
  end
  return best
end

-- The window ----------------------------------------------------------------------------------

-- The title, centred across the window, with the hint under it, the close button and Escape (ns.WindowTitle);
-- fill() puts the version in the title.
local function addTitle(f)
  local parts = ns.WindowTitle(f, L["What's new"], { align = "center", count = L["Click a line to open its setting."],
    onClose = function(window) window:Hide() end, escape = true })
  f.hint = parts.count
end

-- The list: the shared scroll view (ns.ScrollView: the T.SCROLL thumb, soft edges, the wheel) under the hint,
-- with room right of it for its thumb.
local function addView(f)
  f.view = ns.ScrollView(f, { width = LIST_W })
  f.view:SetPoint("TOPLEFT", PAD, -TOP)
  f.view:SetPoint("BOTTOMRIGHT", -(PAD + T.SPACE.col), PAD)
end

-- The window, built on first use: a floating panel above other windows, at the dialog alpha.
local function build()
  frame = T.Panel(CreateFrame("Frame", "Vanguard_WhatsNew", UIParent), { alpha = T.ALPHA.dialog, shadow = true })
  frame:SetSize(WIDTH, HEIGHT)
  frame:SetPoint("CENTER")
  frame:SetFrameStrata("DIALOG")
  frame:EnableMouse(true)
  addTitle(frame)
  addView(frame)
end

-- The list's lines ---------------------------------------------------------------------------

-- Opens an item's setting: the options window on its page, scrolled to its row and marked.
local function openSetting(item)
  frame:Hide()
  ns.Options.Show(item.page)
  if item.row then ns.Options.JumpTo(item.row) end
end

-- An item's words, with "(off by default)" after a thing that starts off.
local function itemText(item)
  return item.off and (item.text .. "  " .. T.Paint(L["(off by default)"], "warn")) or item.text
end

-- Makes a line a link: a click opens its setting (the row already has its wash under the mouse).
local function linkify(line, item)
  accented[#accented + 1] = line.text
  line:SetScript("OnClick", ns.Guard("click what's new line", function() openSetting(item) end))
end

-- One item as a line at y, wrapped to the list's width: a list row (W.Row) in the accent when it has a page to
-- open, plain text otherwise.
local function addItem(child, item, y)
  local line = item.page and W.Row(child) or CreateFrame("Frame", nil, child)
  line.text = W.Label(line, itemText(item), "label", item.page and "accent" or "text")
  line.text:SetPoint("TOPLEFT", T.SPACE.gap, 0)
  line.text:SetWidth(LIST_W - 2 * T.SPACE.gap)
  line:SetSize(LIST_W, line.text:GetStringHeight())
  line:SetPoint("TOPLEFT", 0, -y)
  if item.page then linkify(line, item) end
  return line
end

-- One group at y: its label as a section header, then its items. Returns the y below it.
local function addGroup(child, group, y)
  local heading = W.SectionHeader(child, group.label, { width = LIST_W })
  heading:SetPoint("TOPLEFT", 0, -y)
  y = y + heading:GetHeight() + LINE_GAP
  for _, item in ipairs(group.items) do
    child.lines[#child.lines + 1] = addItem(child, item, y)
    y = y + child.lines[#child.lines]:GetHeight() + LINE_GAP
  end
  return y + GROUP_GAP
end

-- A new, empty list in the scroll view (the old one hidden).
local function newChild(view)
  if view.child then view.child:Hide() end
  view.child = CreateFrame("Frame", nil, view)
  view.child:SetWidth(LIST_W)
  view.child.lines, accented = {}, {}
  view:SetScrollChild(view.child)
  return view.child
end

-- True when one of a version's lines opens a setting, so the hint to click a line holds.
local function hasLink(entry)
  for _, group in ipairs(entry.groups) do
    for _, item in ipairs(group.items) do
      if item.page then return true end
    end
  end
  return false
end

-- Fills the window with one version's notes, scrolled to the top; the click hint shows only when a line has a setting.
local function fill(entry)
  local child, y = newChild(frame.view), 0
  for _, group in ipairs(entry.groups) do y = addGroup(child, group, y) end
  frame.hint:SetShown(hasLink(entry))
  frame.view:Fit(y - GROUP_GAP - LINE_GAP)
  frame.lines, frame.version, frame.textScale = child.lines, entry.version, T.Settings().textScale
  frame.title:SetText(ns.Format(L["What's new in Vanguard {version}"], { version = entry.version }))
  frame.view:ScrollTo(0)
end

-- Showing ------------------------------------------------------------------------------------

-- Shows the window with these notes (in the current accent), fading it in; notes for the
-- running version count as seen.
function WN.Show(entry)
  if not frame then build() end
  if frame.version ~= entry.version or frame.textScale ~= T.Settings().textScale then fill(entry) end
  for _, fs in ipairs(accented) do T.Color(fs, "accent") end
  if entry.version == ns.AddonVersion() then VanguardDB.whatsNewSeen = entry.version end
  T.FadeIn(frame)
  frame.view:ScrollTo(frame.view:GetVerticalScroll() or 0)
end

-- /vg whatsnew and the General page: the newest notes up to this version, or a line saying there are none.
function WN.Open()
  local entry = WN.Latest(ns.AddonVersion())
  if not entry then return ns.Chat(L["This version of Vanguard has no release notes."]) end
  WN.Show(entry)
end

-- True when the running version's notes are owed: setup has run on this account, they
-- haven't been seen here, and there are notes for this version.
local function owed()
  local v = ns.AddonVersion()
  return VanguardDB.setupDone and VanguardDB.whatsNewSeen ~= v and WN.Notes(v) ~= nil
end

-- Shows the owed notes out of combat, unless setup is open (its end calls this again).
local function showIfOwed()
  ns.OutOfCombat(function()
    if owed() and not ns.Setup.Step() then WN.Show(WN.Notes(ns.AddonVersion())) end
  end, "whatsnew")
end

table.insert(ns.Setup.onEnd, showIfOwed)

-- Login (after setup's handler): on a new account, setup still owed, this version counts as
-- seen, since setup comes first; otherwise the notes show when owed.
ns.On("PLAYER_LOGIN", function()
  if not VanguardDB.setupDone then VanguardDB.whatsNewSeen = ns.AddonVersion() return end
  showIfOwed()
end)
