-- Vanguard meter, part two: the spell breakdown and the report to chat. A click on a meter
-- line opens a panel of that player's spells for the kind and segment shown, from the game's
-- damage meter (GetCombatSessionSourceFromType); /vg meter report puts the top lines in your
-- chat or sends them to a channel. Figures are handed to the bars and texts as the game gives
-- them and never counted, compared or sorted here; a report holds only plain figures and names
-- (so only out of combat), and a hidden one is left out, never guessed.

local ADDON, ns = ...

local T = ns.Theme
local L = ns.L
local MT = ns.GetModule("Meter")

-- The channels /vg meter report sends to, by the word typed; the lines a report holds at most and by default.
MT.CHANNELS = { say = "SAY", party = "PARTY", raid = "RAID", instance = "INSTANCE_CHAT", guild = "GUILD" }
MT.REPORT_MAX, MT.REPORT_DEFAULT = 10, 5
-- The rows the spell panel has.
MT.DETAIL_ROWS = 8
-- The gap between the meter and its spell panel.
MT.DETAIL_SPACE = 4

-- Spells ---------------------------------------------------------------------------------------

-- The spells of one line (a meter line, as a table) for the kind and segment shown: the game's list,
-- top first; nil where the client has no such call, refuses it or keeps the list hidden.
function MT.SpellList(src)
  local get = C_DamageMeter and C_DamageMeter.GetCombatSessionSourceFromType
  local session, which = MT.Enum("DamageMeterSessionType", MT.settings.session or "Current"), MT.Enum("DamageMeterType", MT.settings.kind)
  if type(get) ~= "function" or session == nil or which == nil then return nil end
  local ok, result = pcall(get, session, which, src.sourceGUID, src.sourceCreatureID)
  if not ok or ns.IsSecret(result) or type(result) ~= "table" then return nil end
  if ns.IsSecret(result.combatSpells) or type(result.combatSpells) ~= "table" then return nil end
  MT.spellTotal = ns.PlainNumber(result.totalAmount)
  return result.combatSpells
end

-- A spell's name: the game's, else its ID as text; "" where the call refuses. A hidden name
-- goes straight on, untested (a truth test on it raises).
local function spellName(spell)
  local get = C_Spell and C_Spell.GetSpellName
  local ok, name = pcall(get or tostring, spell.spellID)
  if ok then return name end
  return ""
end

-- Fills one spell row from one spell, scaled to the top spell's total.
local function fillSpell(row, spell, top)
  row:SetStatusBarColor(T.RGB("accent"))
  MT.Give(row, "SetMinMaxValues", 0, MT.Figure(top and top.totalAmount))
  MT.Give(row, "SetValue", MT.Figure(spell.totalAmount))
  MT.Give(row.name, "SetText", spellName(spell))
  MT.Give(row.value, "SetText", MT.WithShare(spell.totalAmount, spell.totalAmount, MT.spellTotal))
end

-- Repaints the spell panel from the game's list for its line; hidden rows past the list.
function MT.PaintDetail()
  local d = MT.detail
  if not d or not d:IsShown() then return end
  local spells = MT.SpellList(d.src)
  d.empty:SetShown(spells == nil or spells[1] == nil)
  for i, row in ipairs(d.rows) do
    local spell = i <= MT.DETAIL_ROWS and MT.LineAt(spells, i) or nil
    row:SetShown(spell ~= nil)
    if spell then fillSpell(row, spell, MT.LineAt(spells, 1)) end
  end
end

-- Closes the spell panel.
function MT.CloseDetail()
  if MT.detail then MT.detail:Hide() end
end

-- The panel's title: a button across its top that closes it, with the player's name on it.
local function addDetailTitle(d)
  local title = CreateFrame("Button", nil, d)
  title:SetPoint("TOPLEFT", d, "TOPLEFT", 0, 0)
  title:SetPoint("TOPRIGHT", d, "TOPRIGHT", 0, 0)
  title:SetHeight(MT.HEAD)
  title:SetScript("OnClick", ns.Guard("close meter detail", MT.CloseDetail))
  d.title = ns.WindowTitle(title, "", { kind = "card" }).title
end

-- The note shown while the panel has no spells to list.
local function addDetailEmpty(d)
  d.empty = T.Text(d:CreateFontString(nil, "OVERLAY"), "label", "muted")
  d.empty:SetPoint("CENTER", d, "CENTER", 0, -MT.HEAD / 2)
  d.empty:SetText(L["No spell detail yet"])
end

-- Built the first time a line is clicked: a panel beside the meter, its rows the meter's own look; Escape closes it.
local function buildDetail()
  local d = T.HudPanel(CreateFrame("Frame", "Vanguard_MeterDetail", UIParent))
  ns.CloseOnEscape(d)
  d:SetSize(MT.WIDTH, MT.HEAD + MT.DETAIL_ROWS * (MT.ROW + MT.GAP) + MT.GAP)
  addDetailTitle(d)
  addDetailEmpty(d)
  d.rows = {}
  for i = 1, MT.DETAIL_ROWS do d.rows[i] = MT.AddRow(d, i) end
  MT.detail = d
  return d
end

-- The game's death recap link for a Deaths line (its deathRecapID), or nil without a plain ID, the call or a link.
function MT.RecapLink(src)
  local id, get = src.deathRecapID, C_DeathRecap and C_DeathRecap.GetRecapLink
  if type(get) ~= "function" or ns.IsSecret(id) or type(id) ~= "number" or id <= 0 then return nil end
  local ok, link = pcall(get, id)
  if ok and type(link) == "string" and not ns.IsSecret(link) and link ~= "" then return link end
  return nil
end

-- On the Deaths view, a click also puts the game's recap link for that death in your chat (click it to open the recap).
function MT.SayRecap(src)
  local link = MT.settings.kind == "Deaths" and MT.RecapLink(src)
  if link then ns.Chat(ns.Format(L["Death recap: {link}"], { link = link })) end
end

-- A meter line's source as a plain key ("GUID:creature ID"), or nil when the client hides either.
local function sourceKey(src)
  local guid, creature = src.sourceGUID, src.sourceCreatureID
  if ns.IsSecret(guid) or ns.IsSecret(creature) or type(guid) ~= "string" then return nil end
  return guid .. ":" .. tostring(creature)
end

-- Whether the open panel shows this line's source. The meter repaints from a new read every
-- half second and the client hands out new tables each time, so the source is matched by key.
local function showing(d, src)
  if d.src == src then return true end
  local key = d.src and sourceKey(src)
  return key ~= nil and key == sourceKey(d.src)
end

-- The panel's anchors on each side of the meter: its own corner, the meter's corner, the side's sign.
local DETAIL_SIDES = { left = { "BOTTOMRIGHT", "BOTTOMLEFT", -1 }, right = { "BOTTOMLEFT", "BOTTOMRIGHT", 1 } }

-- The side of the meter away from the screen's middle (left for a meter on the left half), where the panel opens
-- clear of the bars and frames round the character. Measured in screen pixels, since the meter may be scaled.
local function farSide()
  local left, right = MT.frame:GetLeft(), MT.frame:GetRight()
  local middle = UIParent:GetWidth() * UIParent:GetEffectiveScale() / 2
  if not (left and right) then return "left" end
  return (left + right) / 2 * MT.frame:GetEffectiveScale() < middle and "left" or "right"
end

-- Whether the panel fits on a side of the meter on the screen (a meter that has no place yet fits).
local function fitsOn(d, side)
  local left, right = MT.frame:GetLeft(), MT.frame:GetRight()
  if not (left and right) then return true end
  local need, scale = (d:GetWidth() + MT.DETAIL_SPACE) * d:GetEffectiveScale(), MT.frame:GetEffectiveScale()
  if side == "left" then return left * scale >= need end
  return right * scale + need <= UIParent:GetWidth() * UIParent:GetEffectiveScale()
end

-- How far (in the panel's units) to lift it from the meter's bottom to clear the top of bar 1 by the gap: 0
-- while the bars are off or the meter is above them already.
local function liftAboveBars(d)
  local bars, meter = ns.MoverFrame("bar1"), MT.frame
  local top, bottom = bars and bars:GetTop(), meter:GetBottom()
  if not (top and bottom) then return 0 end
  local lift = top * bars:GetEffectiveScale() + MT.DETAIL_SPACE - bottom * meter:GetEffectiveScale()
  return math.max(0, lift / d:GetEffectiveScale())
end

-- Puts the panel on the meter's side away from the screen's middle, level with its bottom, when it fits
-- there; else on the other side, lifted above bar 1 (the meter sits beside the bars there).
local function placeDetail(d)
  local side, lift = farSide(), 0
  if not fitsOn(d, side) then side, lift = side == "left" and "right" or "left", liftAboveBars(d) end
  local own, meter, sign = unpack(DETAIL_SIDES[side])
  d:ClearAllPoints()
  d:SetPoint(own, MT.frame, meter, sign * MT.DETAIL_SPACE, lift)
end

-- Opens the panel for a meter line (a click on the same player's row again closes it).
function MT.OpenDetail(src)
  local d = MT.detail or buildDetail()
  if d:IsShown() and showing(d, src) then return d:Hide() end
  placeDetail(d)
  d.src = src
  MT.Give(d.title, "SetText", src.name)
  d:Show()
  MT.PaintDetail()
  MT.SayRecap(src)
end

local paint = MT.Paint

-- The meter's repaint also repaints the panel, or closes it once the meter is off or hidden.
function MT.Paint()
  paint()
  local meterShown = MT.frame and MT.frame:IsShown()
  if meterShown then return MT.PaintDetail() end
  MT.CloseDetail()
end

-- Report ---------------------------------------------------------------------------------------

-- A line's text for a report: "1. Tess 12.3K", or nil when its name or figure is hidden or missing.
local function reportLine(i, src)
  local name, n = src and src.name, src and ns.PlainNumber(src[MT.Field()])
  if type(name) ~= "string" or ns.IsSecret(name) or not n then return nil end
  return i .. ". " .. name .. " " .. MT.Short(n)
end

-- The report as one line: the kind and segment, then the top n lines whose figures are plain; nil with none.
function MT.ReportText(n)
  local list, parts = MT.Sources(), {}
  for i = 1, n do
    parts[#parts + 1] = reportLine(i, MT.LineAt(list, i))
  end
  if #parts == 0 then return nil end
  return MT.TitleText() .. ": " .. table.concat(parts, "  ")
end

-- The Report button: your chat, or the channel picked under Combat tools (say, party, raid, instance, guild).
function MT.ReportClick()
  local to = MT.settings.reportTo
  MT.Report(MT.CHANNELS[to] and to or "")
end

-- /vg meter report [channel] [lines]: the top lines in your chat, or sent to say, party, raid, instance or guild.
function MT.Report(arg)
  local word, count = (arg or ""):match("^(%a*)%s*(%d*)")
  local n = math.min(tonumber(count) or MT.REPORT_DEFAULT, MT.REPORT_MAX)
  if ns.InCombat() then return ns.Chat(L["Not in combat: the game's damage meter is hidden until the fight is over."]) end
  local text = n > 0 and MT.ReportText(n)
  if not text then return ns.Chat(L["No report to show: the meter has no plain figures yet."]) end
  if word == "" then return ns.Chat(text) end
  if not MT.CHANNELS[word] then return ns.Chat(L["Send the report to say, party, raid, instance or guild."]) end
  ns.SendChat(text, MT.CHANNELS[word])
end
