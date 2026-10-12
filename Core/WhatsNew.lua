-- What's new: the first login after an update shows "What's new in Vanguard x.y", the notes
-- for the running version (Core/WhatsNewNotes.lua) grouped by module; clicking a line opens
-- its setting in the options window. Once per version per account (VanguardDB.whatsNewSeen).
-- A new account skips it (setup comes first), and while setup is open it waits for setup to
-- end. It never opens by itself in combat. /vg whatsnew and the General page open it again.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

local WN = {}
ns.WhatsNew = WN

-- The window's size, its inner margin, where the list starts, and the gaps after a line and a group.
local WIDTH, HEIGHT, PAD, TOP = 440, 380, 16, 60
local LINE_GAP, GROUP_GAP = 6, 12
-- The most a mouse wheel notch scrolls the list.
local WHEEL_STEP = 40

local frame
-- The strings drawn in the accent (headings and links), repainted each time the window opens.
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

-- A left-aligned line of text in a role and color.
local function text(parent, role, color, value)
  local fs = T.Text(parent:CreateFontString(nil, "OVERLAY"), role, color)
  fs:SetJustifyH("LEFT")
  fs:SetText(value)
  return fs
end

-- The title, centred across the window, and the hint under it.
local function addTitle(f)
  f.title = text(f, "title", "text", "")
  f.title:SetPoint("TOP", f, "TOP", 0, -14)
  f.title:SetJustifyH("CENTER")
  f.hint = text(f, "small", "text2", "Click a line to open its setting.")
  f.hint:SetPoint("TOP", f.title, "BOTTOM", 0, -4)
  f.hint:SetJustifyH("CENTER")
end

-- The close button (top right); Escape closes the window too.
local function addClose(f)
  f.close = T.PlaceClose(T.CloseButton(CreateFrame("Button", nil, f)), f)
  f.close:SetScript("OnClick", ns.Guard("click close what's new", function() f:Hide() end))
  if type(UISpecialFrames) == "table" then table.insert(UISpecialFrames, "Vanguard_WhatsNew") end
end

-- How far the list can scroll.
local function maxScroll(view)
  return math.max(0, view.child:GetHeight() - view:GetHeight())
end

-- Scrolls the list to y (kept within it); the soft bottom edge shows while more is below.
local function scrollTo(view, y)
  view:SetVerticalScroll(math.max(0, math.min(maxScroll(view), y)))
  view.more:SetShown(view:GetVerticalScroll() < maxScroll(view) - 1)
end

-- A soft edge in the window's color along the bottom of the list, on a layer above its lines.
local function fadeEdge(view)
  local holder = CreateFrame("Frame", nil, view)
  holder:SetAllPoints(view)
  holder:SetFrameLevel(view:GetFrameLevel() + 10)
  local t = T.Snap(holder:CreateTexture(nil, "OVERLAY"))
  t:SetTexture(T.Texture("Fade"))
  T.Tint(t, "panel")
  t:SetPoint("BOTTOMLEFT")
  t:SetPoint("BOTTOMRIGHT")
  t:SetHeight(24)
  return t
end

-- The list: a scroll view under the hint; the wheel scrolls it.
local function addView(f)
  f.view = CreateFrame("ScrollFrame", nil, f)
  f.view:SetPoint("TOPLEFT", PAD, -TOP)
  f.view:SetPoint("BOTTOMRIGHT", -PAD, PAD)
  f.view:EnableMouseWheel(true)
  f.view:SetScript("OnMouseWheel", function(view, delta) scrollTo(view, (view:GetVerticalScroll() or 0) - delta * WHEEL_STEP) end)
  f.view.more = fadeEdge(f.view)
end

-- The window, built on first use: a floating panel above other windows.
local function build()
  frame = T.Panel(CreateFrame("Frame", "Vanguard_WhatsNew", UIParent), { alpha = 0.98, shadow = true })
  frame:SetSize(WIDTH, HEIGHT)
  frame:SetPoint("CENTER")
  frame:SetFrameStrata("DIALOG")
  frame:EnableMouse(true)
  addTitle(frame)
  addClose(frame)
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
  return item.off and (item.text .. "  " .. T.Paint("(off by default)", "warn")) or item.text
end

-- Makes a line a link: a wash under the mouse, and a click opens its setting.
local function linkify(line, item)
  line.hover = W.Flat(line, "HIGHLIGHT", "hover")
  line.hover:SetAllPoints()
  accented[#accented + 1] = line.text
  line:SetScript("OnClick", ns.Guard("click what's new line", function() openSetting(item) end))
end

-- One item as a line at y, wrapped to the list's width: in the accent and clickable when it has a page.
local function addItem(child, item, y)
  local line = CreateFrame(item.page and "Button" or "Frame", nil, child)
  line.text = text(line, "label", item.page and "accent" or "text", itemText(item))
  line.text:SetPoint("TOPLEFT", 8, 0)
  line.text:SetWidth(WIDTH - 2 * PAD - 16)
  line:SetSize(WIDTH - 2 * PAD, line.text:GetStringHeight())
  line:SetPoint("TOPLEFT", 0, -y)
  if item.page then linkify(line, item) end
  return line
end

-- One group at y: its label as a heading in the accent, then its items. Returns the y below it.
local function addGroup(child, group, y)
  local heading = text(child, "heading", "accent", group.label)
  heading:SetPoint("TOPLEFT", 0, -y)
  accented[#accented + 1] = heading
  y = y + heading:GetStringHeight() + LINE_GAP
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
  view.child:SetWidth(WIDTH - 2 * PAD)
  view.child.lines, accented = {}, {}
  view:SetScrollChild(view.child)
  return view.child
end

-- Fills the window with one version's notes, scrolled to the top.
local function fill(entry)
  local child, y = newChild(frame.view), 0
  for _, group in ipairs(entry.groups) do y = addGroup(child, group, y) end
  child:SetHeight(math.max(1, y - GROUP_GAP - LINE_GAP))
  frame.lines, frame.version = child.lines, entry.version
  frame.title:SetText("What's new in Vanguard " .. entry.version)
  scrollTo(frame.view, 0)
end

-- Showing ------------------------------------------------------------------------------------

-- Shows the window with these notes (in the current accent), fading it in; notes for the
-- running version count as seen.
function WN.Show(entry)
  if not frame then build() end
  if frame.version ~= entry.version then fill(entry) end
  for _, fs in ipairs(accented) do T.Color(fs, "accent") end
  if entry.version == ns.AddonVersion() then VanguardDB.whatsNewSeen = entry.version end
  T.FadeIn(frame)
end

-- /vg whatsnew and the General page: the newest notes up to this version, or a line saying there are none.
function WN.Open()
  local entry = WN.Latest(ns.AddonVersion())
  if not entry then return ns.Chat("This version of Vanguard has no release notes.") end
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
