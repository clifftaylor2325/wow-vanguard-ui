-- Vanguard's own damage and healing meter (off until you turn it on): a small movable flat
-- panel with the top lines of the game's damage meter for the current fight, each a theme bar
-- with a rank, a name and a per-second figure, in class colors. The numbers come from the
-- game's meter (C_DamageMeter) and are never counted, compared or sorted here: in a fight they
-- may be hidden, so each one goes straight into a bar or a text, and a line the client refuses
-- is left empty. Click the title (or /vg meter dps|hps) to switch between damage and healing.
-- The game's own meter stays as it is: turn it off in the game's settings to see only this one.

local ADDON, ns = ...

local T, V, W = ns.Theme, ns.Visibility, ns.Widgets

local MT = ns.Module("Meter", { defaults = { on = false, kind = "Dps", session = "Current", reportTo = "chat", percent = true, rows = 8, visibility = "always", showWhen = {} } })

-- The panel's width, a row's height (a bar, not a list row) and the title's (a card's heading line: T.SPACE.gap
-- down and a control's height), the gap between rows (UI units) and the seconds between reads.
MT.WIDTH, MT.ROW, MT.HEAD, MT.GAP, MT.EVERY = 300, 18, T.SPACE.gap + T.CONTROL_H, 1, 0.5
-- The kinds of meter shown: the Enum.DamageMeterType key and the title, in the order a click on the title steps through them.
MT.KINDS = {
  Dps = "Damage per second", Hps = "Healing per second", DamageDone = "Damage done", HealingDone = "Healing done",
  DamageTaken = "Damage taken", Interrupts = "Interrupts", Dispels = "Dispels", Deaths = "Deaths",
}
MT.KIND_ORDER = { "Dps", "Hps", "DamageDone", "HealingDone", "DamageTaken", "Interrupts", "Dispels", "Deaths" }
-- The kinds whose lines show a per-second figure (the rest show the total).
MT.RATE = { Dps = true, Hps = true }
-- The segments (Enum.DamageMeterSessionType keys) in the order a right click steps through them, with their words.
MT.SESSION_ORDER = { "Current", "Overall", "Expired" }
MT.SESSIONS = { Current = "This fight", Overall = "Overall", Expired = "Previous fight" }
-- The empty-state line by kind: what would fill the panel.
MT.EMPTY = { Dps = "No damage yet this fight", Hps = "No healing yet this fight" }
-- The most rows the setting allows.
MT.MAXROWS = 10
-- A header button's width.
MT.BUTTON_W = 52

-- Reading ------------------------------------------------------------------------------------

-- An Enum value from the client, or nil when it has none.
local function enum(kind, key)
  local t = Enum and Enum[kind]
  return t and t[key] or nil
end

-- The current fight's lines for the chosen kind, top first; nil where the client has no meter,
-- no such kind, or keeps the list hidden.
function MT.Sources()
  local get = C_DamageMeter and C_DamageMeter.GetCombatSessionFromType
  local session, which = enum("DamageMeterSessionType", MT.settings.session or "Current"), enum("DamageMeterType", MT.settings.kind)
  if type(get) ~= "function" or session == nil or which == nil then return nil end
  local ok, result = pcall(get, session, which)
  if not ok or ns.IsSecret(result) or type(result) ~= "table" then return nil end
  if ns.IsSecret(result.combatSources) or type(result.combatSources) ~= "table" then return nil end
  MT.total = ns.PlainNumber(result.totalAmount)
  return result.combatSources
end

MT.Enum = enum

-- Drawing ------------------------------------------------------------------------------------

-- A figure for a bar or a text: a hidden one as it is (the widget takes it), else the plain number or 0.
local function figure(v)
  if ns.IsSecret(v) then return v end
  return ns.PlainNumber(v) or 0
end

-- The field a line's figure is read from: the per-second one for damage and healing per second, else the total.
function MT.Field()
  return MT.RATE[MT.settings.kind] and "amountPerSecond" or "totalAmount"
end

-- The bars' full scale: the top line's figure (hidden or plain), so the top bar is full; 1 when it is not above 0.
local function scale(top)
  local v = figure(top and top[MT.Field()])
  if ns.IsSecret(v) then return v end
  return v > 0 and v or 1
end

-- Calls a widget method that may be handed a hidden value; a refusal leaves the widget as it was.
local function give(widget, method, ...)
  return (pcall(widget[method], widget, ...))
end

-- A line's color: its class color when the class is plain and known, else the accent.
local function lineColor(src)
  local class = src.classFilename
  local c = not ns.IsSecret(class) and type(RAID_CLASS_COLORS) == "table" and RAID_CLASS_COLORS[class]
  if c then return c.r, c.g, c.b end
  return T.RGB("accent")
end

-- A number rounded to two decimals with the trailing zeros dropped ("2.53", "12.3", "400").
local function trim(n)
  return (string.format("%.2f", n):gsub("%.?0+$", ""))
end

-- A plain number as short text: "12.3K", "1.5M", or the number itself below a thousand.
local function plainShort(n)
  if n >= 1e6 then return trim(n / 1e6) .. "M" end
  if n >= 1e3 then return trim(n / 1e3) .. "K" end
  return trim(n)
end

-- A figure as short text ("12.3K"): a plain one formatted here, a hidden one by the game; "" where the client refuses.
local function short(v)
  local n = figure(v)
  if not ns.IsSecret(n) then return plainShort(n) end
  local ok, text = pcall(AbbreviateNumbers, n)
  return ok and text or ""
end

-- A part's share of a total as "45%": only for plain figures, with the Share switch on and a total above 0.
function MT.Percent(part, total)
  local n, t = ns.PlainNumber(part), ns.PlainNumber(total)
  if not (MT.settings.percent and n and t and t > 0) then return nil end
  return string.format("%d%%", math.floor(n / t * 100 + 0.5))
end

-- A figure as short text, with its part's share of the total after it ("12.3K  45%") when the share is known.
function MT.WithShare(amount, part, total)
  local pct = MT.Percent(part, total)
  if not pct then return short(amount) end
  return short(amount) .. "  " .. pct
end

-- True when a line is yours (a hidden answer counts as no).
local function mine(src)
  return not ns.IsSecret(src.isLocalPlayer) and src.isLocalPlayer == true
end

-- Fills one row's bar and texts from one line, scaled to the top line's figure.
local function fill(row, src, top)
  row:SetStatusBarColor(lineColor(src))
  give(row, "SetMinMaxValues", 0, scale(top))
  give(row, "SetValue", figure(src[MT.Field()]))
  give(row.name, "SetText", src.name)
  T.Color(row.name, mine(src) and "accent" or "text")
  give(row.value, "SetText", MT.WithShare(src[MT.Field()], src.totalAmount, MT.total))
  row.src = src
end

-- A list's line i, or nil when it is missing, hidden or not a table.
local function lineAt(list, i)
  local src = list and list[i]
  if ns.IsSecret(src) or type(src) ~= "table" then return nil end
  return src
end

MT.LineAt, MT.Short, MT.Give, MT.Figure = lineAt, short, give, figure

-- Paints one row from the list's line i, hidden when it has none or the row is past the setting.
local function paintRow(i, list)
  local row = MT.frame.rows[i]
  local src = i <= MT.settings.rows and lineAt(list, i) or nil
  row:SetShown(src ~= nil)
  row.src = nil
  if src then fill(row, src, lineAt(list, 1)) end
end

-- The title: the kind's words, with the segment's after a dot when it is not this fight's.
function MT.TitleText()
  local text = MT.KINDS[MT.settings.kind] or MT.KINDS.Dps
  local session = MT.settings.session or "Current"
  if session == "Current" or not MT.SESSIONS[session] then return text end
  return text .. " · " .. MT.SESSIONS[session]
end

-- The empty-state line: what would fill the panel (kinds without their own say "Nothing yet").
function MT.EmptyText()
  return MT.EMPTY[MT.settings.kind] or "Nothing yet"
end

-- Shows the panel while it's on and its visibility shows it, sized to its rows, and paints each row.
function MT.Paint()
  local f = MT.frame
  if not f then return end
  f:SetShown(MT.settings.on == true and V.Shows(f))
  f:SetHeight(MT.HEAD + MT.settings.rows * (MT.ROW + MT.GAP) + MT.GAP)
  if not f:IsShown() then return end
  local list = MT.Sources()
  f.title:SetText(MT.TitleText())
  f.empty:SetText(MT.EmptyText())
  f.empty:SetShown(list == nil or list[1] == nil)
  for i = 1, #f.rows do paintRow(i, list) end
end

-- Built the first time the panel is wanted (defined under "Building").
local build

-- Switching and commands -------------------------------------------------------------------------

-- Shows one kind of meter (an MT.KINDS key).
function MT.SetKind(kind)
  MT.settings.kind = kind
  MT.Paint()
end

-- Shows one segment (an MT.SESSIONS key).
function MT.SetSession(session)
  MT.settings.session = session
  MT.Paint()
end

-- The entry after current in a list, wrapping round (the first when current is not in it).
local function after(list, current)
  for i, v in ipairs(list) do
    if v == current then return list[i % #list + 1] end
  end
  return list[1]
end

-- The next kind of meter in MT.KIND_ORDER.
function MT.ToggleKind()
  MT.SetKind(after(MT.KIND_ORDER, MT.settings.kind))
end

-- The next segment in MT.SESSION_ORDER.
function MT.ToggleSession()
  MT.SetSession(after(MT.SESSION_ORDER, MT.settings.session))
end

-- Builds the panel the first time it is wanted.
local function ensure()
  if not MT.frame then build() end
end

-- Builds the panel when it is switched on and not yet built, then draws it.
function MT.Refresh()
  if MT.settings.on then ensure() end
  MT.Paint()
end

-- Turns the panel on or off (kept in the profile).
function MT.SetOn(on)
  MT.settings.on = on
  MT.Refresh()
end

-- Says how the meter stands and what to type.
local function status()
  local words = MT.settings.on and ("on, showing " .. MT.TitleText():lower()) or "off"
  ns.Chat("Vanguard's meter is " .. words .. ". /vg meter on|off|dps|hps|damage|healing|taken|interrupts|dispels|deaths|this|overall|previous|reset|report. Click the title for the next kind, right-click it for the next segment. The game's own meter stays until you turn it off in the game's settings.")
end

-- The words that pick a kind and a segment.
MT.WORDS = { dps = "Dps", hps = "Hps", damage = "DamageDone", healing = "HealingDone", taken = "DamageTaken", interrupts = "Interrupts", dispels = "Dispels", deaths = "Deaths" }
MT.SEGMENT_WORDS = { this = "Current", current = "Current", overall = "Overall", previous = "Expired" }

-- Applies a word that switches the meter on or off or picks a kind or segment; false for any other word.
local function change(word)
  if word == "on" or word == "off" then MT.SetOn(word == "on")
  elseif MT.WORDS[word] then MT.SetKind(MT.WORDS[word])
  elseif MT.SEGMENT_WORDS[word] then MT.SetSession(MT.SEGMENT_WORDS[word])
  else return false end
  return true
end

-- Clears the game's segments (what its own meter shows too); not in combat.
function MT.Reset()
  local reset = C_DamageMeter and C_DamageMeter.ResetAllCombatSessions
  if ns.InCombat() or type(reset) ~= "function" then return ns.Chat("The game's damage meter can't be reset now.") end
  ns.Chat(pcall(reset) and "The game's damage meter was reset." or "The game's damage meter can't be reset now.")
end

-- /vg meter [on|off|<kind>|<segment>|reset|report ...]: switch it, or say how it stands.
function MT.Command(rest)
  if not MT.settings then return ns.Chat("Vanguard's meter is switched off under Modules (/vg > Modules).") end
  local word, arg = (rest or ""):lower():match("^%s*(%S*)%s*(.-)%s*$")
  if word == "reset" then return MT.Reset() end
  if word == "report" then return MT.Report(arg) end
  change(word)
  status()
end

-- Building -----------------------------------------------------------------------------------

-- One text on a row: a small theme font string, placed by `place`.
local function rowText(row, place)
  local fs = T.Text(row:CreateFontString(nil, "OVERLAY"), "small")
  place(fs)
  return fs
end

-- Row i: a theme bar in a thin border with its rank, name and per-second figure on it.
local function addRow(f, i)
  local row = T.StyleBar(CreateFrame("StatusBar", nil, f))
  row:SetSize(MT.WIDTH - 2 * MT.GAP, MT.ROW)
  row:SetPoint("TOPLEFT", f, "TOPLEFT", MT.GAP, -(MT.HEAD + (i - 1) * (MT.ROW + MT.GAP)))
  T.HudPanel(row, { inset = true })
  rowText(row, function(fs) fs:SetPoint("LEFT", row, "LEFT", 3, 0) fs:SetText(tostring(i)) end)
  row.name = rowText(row, function(fs) fs:SetPoint("LEFT", row, "LEFT", 18, 0) fs:SetPoint("RIGHT", row, "RIGHT", -52, 0) fs:SetJustifyH("LEFT") end)
  row.value = rowText(row, function(fs) fs:SetPoint("RIGHT", row, "RIGHT", -3, 0) end)
  row:Hide()
  return row
end

-- A click on a row opens the spell breakdown of its line (MeterDetail.lua).
local function clickRow(row)
  if MT.OpenDetail and row.src then MT.OpenDetail(row.src) end
end

-- Makes a meter row answer a click.
local function clickable(row)
  row:EnableMouse(true)
  row:SetScript("OnMouseUp", ns.Guard("click meter row", clickRow))
  return row
end
MT.AddRow = addRow

-- A click on the title: left steps through the kinds, right through the segments.
function MT.TitleClick(_, button)
  if button == "RightButton" then MT.ToggleSession() else MT.ToggleKind() end
end

-- The title: a button across the panel's top that switches damage and healing. Its text is a card's heading
-- (ns.WindowTitle on the button), so a click anywhere along the top switches.
local function addTitle(f)
  local title = CreateFrame("Button", nil, f)
  title:SetPoint("TOPLEFT", f, "TOPLEFT", 0, 0)
  title:SetPoint("TOPRIGHT", f, "TOPRIGHT", 0, 0)
  title:SetHeight(MT.HEAD)
  title:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  title:SetScript("OnClick", ns.Guard("click meter title", MT.TitleClick))
  f.title = ns.WindowTitle(title, MT.KINDS[MT.settings.kind] or MT.KINDS.Dps, { kind = "card" }).title
end

-- The note shown while the meter has nothing to list: an empty-state line (label muted) that says what fills it.
local function addEmpty(f)
  f.empty = T.Text(f:CreateFontString(nil, "OVERLAY"), "label", "muted")
  f.empty:SetPoint("CENTER", f, "CENTER", 0, -MT.HEAD / 2)
  f.empty:SetText(MT.EMPTY.Dps)
end

-- A small button at the right of the panel's title row, `slot` buttons in from the edge.
local function headerButton(f, text, slot, onClick)
  local b = W.Button(f, text, onClick, MT.BUTTON_W)
  b:SetPoint("TOPRIGHT", f, "TOPRIGHT", -MT.GAP - (slot - 1) * (MT.BUTTON_W + MT.GAP), -MT.GAP)
  return b
end

-- The title row's buttons: Report (to chat, or the channel picked in the options) and Reset (the game's meter).
local function addHeaderButtons(f)
  f.report = headerButton(f, "Report", 2, MT.ReportClick)
  f.reset = headerButton(f, "Reset", 1, MT.Reset)
end

-- Applies the panel's visibility setting: now, or when combat ends.
function MT.ApplyVisibility()
  ns.OutOfCombat(function() V.ApplyNow(MT.frame, MT.settings.visibility, MT.settings.showWhen) end, MT.frame)
end

-- Follows the panel's visibility from the start: its state's changes repaint it.
local function watchVisibility(f)
  f.vgOnState = MT.Paint
  V.WatchHover(f)
  V.Track(f, MT.ApplyVisibility)
  MT.ApplyVisibility()
end

-- The panel's title, header buttons and empty-state note.
local function addChrome(f)
  addTitle(f)
  addHeaderButtons(f)
  addEmpty(f)
end

-- The movable panel, left of the bags and menu bar (about 345 wide, 16 in from the edge) so the tooltip corner above them stays clear. Built when
-- first needed, so an unused meter has no mover.
function build()
  local f = T.HudPanel(CreateFrame("Frame", "Vanguard_Meter", UIParent))
  MT.frame = f
  f:SetSize(MT.WIDTH, MT.HEAD)
  ns.Mover(f, "meter", "Vanguard meter", { "BOTTOMRIGHT", "BOTTOMRIGHT", -372, 20 })
  addChrome(f)
  f.rows = {}
  for i = 1, MT.MAXROWS do f.rows[i] = clickable(addRow(f, i)) end
  watchVisibility(f)
  ns.Every("meter", MT.EVERY, MT.Paint, f, true)
end

-- Module entry point (Core/Modules.lua): the panel is built when it is switched on (at login if it
-- already is), and read twice a second while it shows.
function MT.Enable(settings)
  MT.settings = settings
  T.OnChanged(MT.Paint)
  MT.Refresh()
end
