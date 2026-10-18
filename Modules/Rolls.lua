-- Roll tracker: a small panel (movable, out of the way of the frames) that lists
-- the group's /roll results, highest first, the top roll in your accent color,
-- and fades away 30 seconds after the last roll. Each result is read from the
-- game's roll line (RANDOM_ROLL_RESULT, in the client's language) in the system
-- chat messages; a line the client hides, or one that doesn't match, is skipped.
-- With the officer loot tools on (Modules/OfficerLoot.lua), a roll by a player who reserved
-- the item being rolled for is flagged "[SR]", and a loot item lists who reserved it.
-- Where the client has the loot history (C_LootHistory, not confirmed on every
-- client), the panel also lists the last few items the group rolled for, with
-- each member's choice and roll and who won; where it doesn't, that part stays
-- off with no error. Nothing rolls for you. /vg rolls lists the session's rolls,
-- /vg rolls clear forgets them. It forgets on logout.

local ADDON, ns = ...

local T, V = ns.Theme, ns.Visibility

local R = ns.Module("Rolls", { defaults = { show = true, loot = true, visibility = "always", showWhen = {} } })

-- Rolls kept, seconds a round of rolls stays on screen after its last roll, loot items kept, and lines drawn.
R.MAX, R.ROUND, R.ITEMS, R.LINES = 40, 30, 4, 14
-- The panel's width, a line's height and the panel's padding (UI units; a HUD card's, T.SPACE.gap).
R.WIDTH, R.LINE, R.PAD = 136, 14, T.SPACE.gap
-- A loot roll's choice, by the game's roll type.
R.CHOICES = { [0] = "Pass", [1] = "Need", [2] = "Greed", [3] = "Disenchant" }
-- This session's rolls, oldest first: { name, roll, low, high, at }; and the last loot items rolled for, oldest first.
R.rolls, R.items = {}, {}

-- Reading the roll line ----------------------------------------------------------------------

-- The text with every pattern character escaped.
local function escape(text)
  return (text:gsub("%p", "%%%0"))
end

-- The Lua pattern for the game's format string and, by argument (name, roll, low, high), which capture holds it.
-- Placeholders are %s and %d, or %1$s style where the language reorders them.
function R.Compile(format)
  local order, count = {}, 0
  local body = escape(format):gsub("%%%%(%d?)%%?%$?([sd])", function(position, kind)
    count = count + 1
    order[tonumber(position) or count] = count
    return kind == "s" and "(.-)" or "(%d+)"
  end)
  return { pattern = "^" .. body .. "$", order = order }
end

-- The name, roll, low and high in a system message, or nil when it isn't a roll line.
function R.Parse(text)
  if type(text) ~= "string" or ns.IsSecret(text) then return nil end
  R.compiled = R.compiled or (type(RANDOM_ROLL_RESULT) == "string" and R.Compile(RANDOM_ROLL_RESULT)) or false
  local found = R.compiled and { text:match(R.compiled.pattern) }
  if not found or #found < 4 then return nil end
  -- The captured text of argument i (name, roll, low, high).
  local function at(i) return found[R.compiled.order[i]] end
  return at(1), tonumber(at(2)), tonumber(at(3)), tonumber(at(4))
end

-- Recording ----------------------------------------------------------------------------------

-- Notes a roll, dropping the oldest past R.MAX, and draws it; the panel goes when the round has gone quiet.
function R.Add(name, roll, low, high)
  R.seq = (R.seq or 0) + 1
  table.insert(R.rolls, { name = name, roll = roll, low = low, high = high, at = GetTime(), seq = R.seq })
  if #R.rolls > R.MAX then table.remove(R.rolls, 1) end
  R.Paint()
  C_Timer.After(R.ROUND + 0.1, ns.Guard("timer roll panel", R.Paint))
end

-- A system message: records it when it's a roll.
local function onSystem(_, text)
  local name, roll, low, high = R.Parse(text)
  if name and roll and low and high then R.Add(name, roll, low, high) end
end

-- The latest round: the rolls sharing the newest roll's range, each within R.ROUND of the next; highest first.
function R.Round()
  local round, last = {}, R.rolls[#R.rolls]
  for i = #R.rolls, 1, -1 do
    local r = R.rolls[i]
    if r.low ~= last.low or r.high ~= last.high or (round[#round] or last).at - r.at > R.ROUND then break end
    round[#round + 1] = r
  end
  table.sort(round, function(a, b) return a.roll > b.roll or (a.roll == b.roll and a.seq < b.seq) end)
  return round
end

-- Whether the latest round is still on screen: there is one and its last roll is under R.ROUND old.
function R.Current()
  local last = R.rolls[#R.rolls]
  return last ~= nil and GetTime() - last.at <= R.ROUND
end

-- Loot history ------------------------------------------------------------------------------

-- Whether this client has the loot history calls the tracker reads.
function R.HasLoot()
  local L = C_LootHistory
  return type(L) == "table" and type(L.GetNumItems) == "function" and type(L.GetItem) == "function" and type(L.GetPlayerInfo) == "function"
end

-- One item's rolls from the loot history: { link, done, players = { { name, choice, roll, winner } } }.
function R.ReadItem(index)
  local _, link, count, done = C_LootHistory.GetItem(index)
  local players = {}
  for p = 1, ns.PlainNumber(count) or 0 do
    local name, _, kind, roll, winner = C_LootHistory.GetPlayerInfo(index, p)
    if not ns.IsSecret(name) and type(name) == "string" then
      players[#players + 1] = { name = name, choice = R.CHOICES[kind] or "?", roll = ns.PlainNumber(roll), winner = winner == true }
    end
  end
  return { link = ns.IsSecret(link) and "?" or tostring(link), done = done == true, players = players }
end

-- Reads the newest R.ITEMS items again (the loot history changed).
function R.ReadLoot()
  if not (R.settings.loot and R.HasLoot()) then return end
  local items, total = {}, ns.PlainNumber(C_LootHistory.GetNumItems()) or 0
  for i = math.max(1, total - R.ITEMS + 1), total do items[#items + 1] = R.ReadItem(i) end
  R.items = items
  R.Paint()
end

-- Reserves -----------------------------------------------------------------------------------

-- The officer loot tools (set by Modules/OfficerLoot.lua) when they are on, else nil.
function R.Reserves()
  local OL = R.reserve
  return OL and OL.On() and OL or nil
end

-- The link of the newest loot item still being rolled for, or nil.
function R.Rolling()
  for i = #R.items, 1, -1 do
    if not R.items[i].done then return R.items[i].link end
  end
end

-- The item the latest round is for: the one /vg loot focus names, else the item being rolled for.
function R.RoundItem()
  local OL = R.Reserves()
  return OL and (OL.focus or R.Rolling()) or nil
end

-- " [SR]" when the player reserved the item (a link or name), else "".
function R.Flag(name, item)
  local OL = R.Reserves()
  return (OL and item and OL.Reserved(name, item)) and " [SR]" or ""
end

-- The line naming who reserved the item, or nil when no one did.
function R.ReservedLine(item)
  local OL = R.Reserves()
  local names = OL and OL.Holders(item) or {}
  if #names == 0 then return nil end
  return { "Reserved: " .. table.concat(names, ", "), "", "row" }
end

-- Listing ------------------------------------------------------------------------------------

-- A roll's figures: "87" and its range when it isn't 1 to 100.
local function figures(r)
  return (r.low == 1 and r.high == 100) and tostring(r.roll) or string.format("%d (%d-%d)", r.roll, r.low, r.high)
end

-- The latest round as lines: a heading, then each roll, the highest ones marked "win".
function R.RollLines()
  if #R.rolls == 0 then return {} end
  local round, item = R.Round(), R.RoundItem()
  local out = { { "Rolls " .. round[1].low .. "-" .. round[1].high, "", "head" } }
  for _, r in ipairs(round) do out[#out + 1] = { r.name .. R.Flag(r.name, item), figures(r), r.roll == round[1].roll and "win" or "row" } end
  return out
end

-- One loot item as lines: its link, then each member's choice and roll; the winner marked "win".
function R.ItemLines(item)
  local out = { { item.link, item.done and "" or "rolling", "head" } }
  out[2] = R.ReservedLine(item.link)
  for _, p in ipairs(item.players) do
    out[#out + 1] = { p.name .. R.Flag(p.name, item.link), p.choice .. (p.roll and (" " .. p.roll) or ""), p.winner and "win" or "row" }
  end
  return out
end

-- Every line to draw: the current round of rolls, then the loot items, newest last; cut to R.LINES.
function R.Lines()
  local out = R.Current() and R.RollLines() or {}
  for _, item in ipairs(R.items) do
    for _, line in ipairs(R.ItemLines(item)) do out[#out + 1] = line end
  end
  return { unpack(out, 1, R.LINES) }
end

-- /vg rolls: this session's rolls, newest first.
function R.Command(arg)
  if arg == "clear" then R.rolls, R.items = {}, {} R.Paint() return ns.Chat("Rolls forgotten.") end
  if #R.rolls == 0 then return ns.Chat("No rolls seen this session yet.") end
  ns.Chat("Rolls this session, newest first:")
  for i = #R.rolls, 1, -1 do ns.Chat(R.rolls[i].name .. "  " .. figures(R.rolls[i]) .. "  (" .. R.rolls[i].low .. "-" .. R.rolls[i].high .. ")") end
end

-- Drawing ------------------------------------------------------------------------------------

-- The name in the theme for a line's kind: the winner in the accent, a heading bright, the rest gray.
local KIND_COLOR = { head = "text", win = "accent", row = "text2" }

-- Draws one line into its pair of font strings.
local function paintLine(row, line)
  row.left:SetText(line[1])
  row.right:SetText(line[2])
  T.Color(row.left, KIND_COLOR[line[3]])
  T.Color(row.right, KIND_COLOR[line[3]])
end

-- Draws the panel: shown while it's on, has lines and its visibility shows it.
function R.Paint()
  local f = R.frame
  if not f then return end
  local lines = R.Lines()
  f:SetShown(R.settings.show == true and #lines > 0 and V.Shows(f))
  f:SetHeight(#lines * R.LINE + 2 * R.PAD)
  for i, row in ipairs(f.rows) do
    row.left:SetShown(lines[i] ~= nil) row.right:SetShown(lines[i] ~= nil)
    if lines[i] then paintLine(row, lines[i]) end
  end
end

-- Building -----------------------------------------------------------------------------------

-- Line i: a name at the left and its figures at the right, one line height apart down the panel.
local function addRow(f, i)
  local y = -R.PAD - (i - 1) * R.LINE
  local left = T.Text(f:CreateFontString(nil, "OVERLAY"), "small")
  local right = T.Text(f:CreateFontString(nil, "OVERLAY"), "small")
  left:SetPoint("TOPLEFT", f, "TOPLEFT", R.PAD, y) left:SetPoint("RIGHT", f, "RIGHT", -52, 0)
  right:SetPoint("TOPRIGHT", f, "TOPRIGHT", -R.PAD, y)
  left:SetJustifyH("LEFT") left:SetWordWrap(false) right:SetJustifyH("RIGHT")
  return { left = left, right = right }
end

-- Applies the panel's visibility setting: now, or when combat ends.
function R.ApplyVisibility()
  ns.OutOfCombat(function() V.ApplyNow(R.frame, R.settings.visibility, R.settings.showWhen) end, R.frame)
end

-- Follows the panel's visibility from the start: its state's changes repaint it.
function R.WatchVisibility(f)
  f.vgOnState = R.Paint
  V.WatchHover(f)
  V.Track(f, R.ApplyVisibility)
  R.ApplyVisibility()
end

-- The movable panel, below the quest tracker's corner.
local function build()
  local f = T.HudPanel(CreateFrame("Frame", "Vanguard_Rolls", UIParent))
  R.frame = f
  f:SetSize(R.WIDTH, 2 * R.PAD + R.LINE)
  f:Hide()
  ns.Mover(f, "rolls", "Roll tracker", { "BOTTOMLEFT", "BOTTOMLEFT", 6, 330 })
  f.rows = {}
  for i = 1, R.LINES do f.rows[i] = addRow(f, i) end
  R.WatchVisibility(f)
end

-- Follows the loot history's events (only where the client has the loot history).
function R.WatchLoot()
  for _, event in ipairs({ "LOOT_HISTORY_FULL_UPDATE", "LOOT_HISTORY_ROLL_CHANGED", "LOOT_HISTORY_ROLL_COMPLETE" }) do
    ns.On(event, ns.Guard("loot history", R.ReadLoot))
  end
end

-- Module entry point (Core/Modules.lua).
function R.Enable(settings)
  R.settings = settings
  build()
  ns.On("CHAT_MSG_SYSTEM", onSystem)
  if R.HasLoot() then R.WatchLoot() end
  T.OnChanged(R.Paint)
end
