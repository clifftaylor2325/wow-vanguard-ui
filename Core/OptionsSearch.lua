-- The options window's settings search: what you type in the header's box lists the settings that match under it
-- (a caption, the page it is on), and a click or Enter opens the page and marks the row. "changed" lists every
-- setting that differs from its default. Pages and rows come from Core/OptionsWindow.lua (O.RowsOf).

local ADDON, ns = ...

local T, W, O = ns.Theme, ns.Widgets, ns.Options

-- Words a player may type for a setting that its caption doesn't say, by the caption in lower case.
O.KEYWORDS = {
  ["safer colours"] = "colour blind colorblind color blind colour vision deuteranopia protanopia tritanopia accessibility",
  ["text size"] = "font size bigger smaller larger readable zoom",
  ["font"] = "typeface lettering text",
  ["reduce motion (no fades or flashes)"] = "animation animations fades flashes accessibility",
  ["interface sounds"] = "audio mute noise volume",
  ["pixel-perfect scale"] = "ui scale resolution crisp blurry",
  ["theme variant"] = "dark light colours colors surfaces skin",
  ["corners"] = "round rounded square panels",
  ["move frames"] = "move unlock drag position layout edit mode",
  ["its scale"] = "scale size bigger smaller",
  ["export profile"] = "backup save share copy",
  ["import"] = "profile backup restore paste",
  ["minimap shape"] = "map round square",
}

-- The most settings the list shows, and how wide it is and what each line holds (units).
local MAX_HITS, LIST_WIDTH, PAGE_WIDTH = 8, 360, 110

-- The settings a search found: { page = key, title = the page's title, caption = the row's, row = the row }.
O.hits = nil

-- A choice row's choice names ("Square", "Jade"), as one string.
local function choiceNames(row)
  if row[1] ~= "cycle" or type(row[3]) ~= "table" then return "" end
  local names = {}
  for _, choice in ipairs(row[3]) do names[#names + 1] = tostring(choice[2]) end
  return table.concat(names, " ")
end

-- The words of a row that a search reads: its caption, tip, keywords, choice names, the note under it and
-- "reload" when it applies on reload, in lower case.
local function haystack(row, note)
  local caption = tostring(row[2])
  local words = { caption, row.tip or "", O.KEYWORDS[caption:lower()] or "", choiceNames(row), note or "", row.reload and "reload" or "" }
  return table.concat(words, " "):lower()
end

-- Whether every word of the (lower-case) text is in the row's words (with the note under it).
local function matches(row, words, note)
  local text = haystack(row, note)
  for _, word in ipairs(words) do
    if not text:find(word, 1, true) then return false end
  end
  return true
end

-- The words of a search text.
local function wordsOf(text)
  local words = {}
  for word in text:gmatch("%S+") do words[#words + 1] = word end
  return words
end

-- The kinds of row the list can show: a switch, choice or slider, a module's switch, and a button (a hit on a
-- button only opens its page and marks it; some buttons reset or delete).
local SETTING_KINDS = { check = true, cycle = true, slider = true, module = true, button = true }

-- Whether a row is one the list can show: a setting with a caption.
local function isSetting(row)
  return SETTING_KINDS[row[1]] == true and type(row[2]) == "string"
end

-- The note row under row i ({ "text", words, "note" }), if there is one: its words.
local function noteUnder(rows, i)
  local below = rows[i + 1]
  return below and below[1] == "text" and below[3] == "note" and below[2] or nil
end

-- Every setting that passes `wanted(row, note)`, page by page in the nav's order, up to MAX_HITS; then how many
-- more passed.
local function collect(wanted)
  local out, more = {}, 0
  for _, page in ipairs(O.NavOrder()) do
    local rows = O.RowsOf(page)
    for i, row in ipairs(rows) do
      local hit = isSetting(row) and wanted(row, noteUnder(rows, i))
      if hit and #out == MAX_HITS then more = more + 1 end
      if hit and #out < MAX_HITS then out[#out + 1] = { page = page.key, title = page.title, caption = row[2], row = row } end
    end
  end
  return out, more
end

-- The settings that match a (lower-case) search text, and how many more the list has no room for; "changed" is
-- the ones off their default.
function O.FindSettings(text)
  if text == "changed" then return collect(function(row) return O.RowChanged(row) end) end
  local words = wordsOf(text)
  return collect(function(row, note) return matches(row, words, note) end)
end

-- Hit lines ------------------------------------------------------------------------------------

-- A line's caption (left, one line) and its page's title (muted, right).
local function lineTexts(line)
  line.caption = T.Text(line:CreateFontString(nil, "OVERLAY"), "label", "text")
  line.caption:SetPoint("LEFT", T.SPACE.pad, 0)
  line.caption:SetWidth(LIST_WIDTH - PAGE_WIDTH - 4 * T.SPACE.pad)
  line.caption:SetJustifyH("LEFT")
  line.caption:SetWordWrap(false)
  line.page = T.Text(line:CreateFontString(nil, "OVERLAY"), "small", "muted")
  line.page:SetPoint("RIGHT", -T.SPACE.pad, 0)
  line.page:SetWidth(PAGE_WIDTH)
  line.page:SetJustifyH("RIGHT")
end

-- Clicking a line opens its setting.
local function openLine(line)
  O.HideHits()
  O.OpenHit(line.hit)
end

-- Line i of the list: a list row, the caption and the page's title on it.
local function hitLine(list, i)
  local line = W.Row(list, T.ROW.height, { width = LIST_WIDTH - 2 * T.SPACE.tight })
  line:SetPoint("TOPLEFT", T.SPACE.tight, -(T.SPACE.tight + (i - 1) * T.ROW.height))
  line:SetScript("OnClick", ns.Guard("click search result", openLine))
  lineTexts(line)
  return line
end

-- The raised panel the list sits in, over the page, under the search box's right end.
local function listPanel(window)
  local list = T.Panel(CreateFrame("Frame", nil, window), { raised = true, shadow = true })
  list:SetFrameLevel(window:GetFrameLevel() + 50)
  list:SetWidth(LIST_WIDTH)
  list:SetPoint("TOPRIGHT", window.search, "BOTTOMRIGHT", 0, -T.SPACE.tight)
  list.none = T.Text(list:CreateFontString(nil, "OVERLAY"), "label", "muted")
  list.none:SetPoint("TOPLEFT", T.SPACE.pad, -T.SPACE.col)
  list.none:SetText("No setting matches.")
  list.more = T.Text(list:CreateFontString(nil, "OVERLAY"), "small", "muted")
  list.more:SetPoint("BOTTOMLEFT", T.SPACE.pad, T.SPACE.tight + T.SPACE.gap)
  return list
end

-- The list under the search box, built on first use: MAX_HITS lines in a panel.
local function listFrame()
  local window = O.Frame()
  if window.results then return window.results end
  local list = listPanel(window)
  list.lines = {}
  for i = 1, MAX_HITS do list.lines[i] = hitLine(list, i) end
  window.results = list
  return list
end

-- Fills the list with the hits (a line each; the rest hidden) and sizes it; no hits says so, and a last line says
-- how many more there are.
local function fillList(list, hits, more)
  for i, line in ipairs(list.lines) do
    line.hit = hits[i]
    line:SetShown(hits[i] ~= nil)
    if hits[i] then line.caption:SetText(hits[i].caption) line.page:SetText(hits[i].title) end
  end
  list.none:SetShown(#hits == 0)
  list.more:SetText(more > 0 and string.format("%d more: type more words", more) or "")
  list:SetHeight(2 * T.SPACE.tight + (math.max(#hits, 1) + (more > 0 and 1 or 0)) * T.ROW.height)
end

-- Hides the list.
function O.HideHits()
  local window = O.Frame()
  if window and window.results then window.results:Hide() end
end

-- Lists the settings that match the (lower-case) search text under the box; nothing for an empty box.
function O.ShowHits(text)
  O.hits = nil
  if text == "" then return O.HideHits() end
  if not O.Frame() then return end
  local more
  O.hits, more = O.FindSettings(text)
  if #O.hits == 0 and O.matches and O.matches[1] then return O.HideHits() end
  local list = listFrame()
  fillList(list, O.hits, more)
  list:Show()
end
