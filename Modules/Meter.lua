-- Vanguard's own damage and healing meter (off until you turn it on): a small movable flat
-- panel with the top lines of the game's damage meter for the current fight, each a theme bar
-- with a rank, a name and a per-second figure, in class colors. The numbers come from the
-- game's meter (C_DamageMeter) and are never counted, compared or sorted here: in a fight they
-- may be hidden, so each one goes straight into a bar or a text, and a line the client refuses
-- is left empty. Click the title (or /vg meter dps|hps) to switch between damage and healing.
-- The game's own meter stays as it is: turn it off in the game's settings to see only this one.

local ADDON, ns = ...

local T, V = ns.Theme, ns.Visibility

local MT = ns.Module("Meter", { defaults = { on = false, kind = "Dps", rows = 8, visibility = "always", showWhen = {} } })

-- The panel's width, a row's height and the title's, the gap between rows (UI units) and the
-- seconds between reads.
MT.WIDTH, MT.ROW, MT.HEAD, MT.GAP, MT.EVERY = 300, 18, 18, 1, 0.5
-- The kinds of meter shown: the Enum.DamageMeterType key and the title.
MT.KINDS = { Dps = "Damage per second", Hps = "Healing per second" }
-- The most rows the setting allows.
MT.MAXROWS = 10

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
  local session, which = enum("DamageMeterSessionType", "Current"), enum("DamageMeterType", MT.settings.kind)
  if type(get) ~= "function" or session == nil or which == nil then return nil end
  local ok, result = pcall(get, session, which)
  if not ok or ns.IsSecret(result) or type(result) ~= "table" then return nil end
  if ns.IsSecret(result.combatSources) or type(result.combatSources) ~= "table" then return nil end
  return result.combatSources
end

-- Drawing ------------------------------------------------------------------------------------

-- A figure for a bar or a text: a hidden one as it is (the widget takes it), else the plain number or 0.
local function figure(v)
  if ns.IsSecret(v) then return v end
  return ns.PlainNumber(v) or 0
end

-- The bars' full scale: the top line's figure (hidden or plain), at least 1.
local function scale(top)
  local v = figure(top and top.amountPerSecond)
  if ns.IsSecret(v) then return v end
  return math.max(v, 1)
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

-- True when a line is yours (a hidden answer counts as no).
local function mine(src)
  return not ns.IsSecret(src.isLocalPlayer) and src.isLocalPlayer == true
end

-- Fills one row's bar and texts from one line, scaled to the top line's figure.
local function fill(row, src, top)
  row:SetStatusBarColor(lineColor(src))
  give(row, "SetMinMaxValues", 0, scale(top))
  give(row, "SetValue", figure(src.amountPerSecond))
  give(row.name, "SetText", src.name)
  T.Color(row.name, mine(src) and "accent" or "text")
  give(row.value, "SetText", short(src.amountPerSecond))
end

-- A list's line i, or nil when it is missing, hidden or not a table.
local function lineAt(list, i)
  local src = list and list[i]
  if ns.IsSecret(src) or type(src) ~= "table" then return nil end
  return src
end

-- Paints one row from the list's line i, hidden when it has none or the row is past the setting.
local function paintRow(i, list)
  local row = MT.frame.rows[i]
  local src = i <= MT.settings.rows and lineAt(list, i) or nil
  row:SetShown(src ~= nil)
  if src then fill(row, src, lineAt(list, 1)) end
end

-- Shows the panel while it's on and its visibility shows it, sized to its rows, and paints each row.
function MT.Paint()
  local f = MT.frame
  if not f then return end
  f:SetShown(MT.settings.on == true and V.Shows(f))
  f:SetHeight(MT.HEAD + MT.settings.rows * (MT.ROW + MT.GAP) + MT.GAP)
  if not f:IsShown() then return end
  local list = MT.Sources()
  f.title:SetText(MT.KINDS[MT.settings.kind] or MT.KINDS.Dps)
  f.empty:SetShown(list == nil or list[1] == nil)
  for i = 1, #f.rows do paintRow(i, list) end
end

-- Built the first time the panel is wanted (defined under "Building").
local build

-- Switching and commands -------------------------------------------------------------------------

-- Shows damage ("Dps") or healing ("Hps") per second.
function MT.SetKind(kind)
  MT.settings.kind = kind
  MT.Paint()
end

-- Damage per second becomes healing per second and back.
function MT.ToggleKind()
  MT.SetKind(MT.settings.kind == "Dps" and "Hps" or "Dps")
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
  local words = MT.settings.on and ("on, showing " .. (MT.KINDS[MT.settings.kind] or "?"):lower()) or "off"
  ns.Chat("Vanguard's meter is " .. words .. ". /vg meter on|off|dps|hps. The game's own meter stays until you turn it off in the game's settings.")
end

-- /vg meter [on|off|dps|hps]: switch it, or say how it stands.
function MT.Command(rest)
  if not MT.settings then return ns.Chat("Vanguard's meter is switched off under Modules (/vg > Modules).") end
  local word = (rest or ""):lower():match("^%s*(%S*)")
  if word == "on" or word == "off" then MT.SetOn(word == "on")
  elseif word == "dps" or word == "hps" then MT.SetKind(word == "dps" and "Dps" or "Hps") end
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

-- The title: a button across the panel's top that switches damage and healing.
local function addTitle(f)
  local title = CreateFrame("Button", nil, f)
  title:SetPoint("TOPLEFT", f, "TOPLEFT", 0, 0)
  title:SetPoint("TOPRIGHT", f, "TOPRIGHT", 0, 0)
  title:SetHeight(MT.HEAD)
  title:SetScript("OnClick", ns.Guard("click meter title", MT.ToggleKind))
  f.title = T.Text(title:CreateFontString(nil, "OVERLAY"), "label", "text2")
  f.title:SetPoint("LEFT", title, "LEFT", 4, 0)
end

-- The note shown while the meter has nothing to list.
local function addEmpty(f)
  f.empty = T.Text(f:CreateFontString(nil, "OVERLAY"), "small", "text2")
  f.empty:SetPoint("CENTER", f, "CENTER", 0, -MT.HEAD / 2)
  f.empty:SetText("Nothing to show")
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

-- The movable panel, left of the bags and menu bar (about 345 wide, 16 in from the edge) so the tooltip corner above them stays clear. Built when
-- first needed, so an unused meter has no mover.
function build()
  local f = T.HudPanel(CreateFrame("Frame", "Vanguard_Meter", UIParent))
  MT.frame = f
  f:SetSize(MT.WIDTH, MT.HEAD)
  ns.Mover(f, "meter", "Vanguard meter", { "BOTTOMRIGHT", "BOTTOMRIGHT", -372, 20 })
  addTitle(f)
  addEmpty(f)
  f.rows = {}
  for i = 1, MT.MAXROWS do f.rows[i] = addRow(f, i) end
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
