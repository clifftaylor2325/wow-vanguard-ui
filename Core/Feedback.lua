-- /vg feedback: a bug report or feature request written in game, with the
-- same questions as the form on vanguardui.com/feedback. An addon can't send
-- anything to the web, so Make report puts the answers in the copy box as
-- one block (### Vanguard feedback v1 ### to ### end feedback ###), the
-- /vg report inside it for a bug; pasted into the site's form, the block
-- fills the form's fields. The checks and their words are the site's
-- (its src/feedback/fields.js), so a block that passes here passes there.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

local FB = {}
ns.Feedback = FB

FB.START, FB.END = "### Vanguard feedback v1 ###", "### end feedback ###"
FB.TITLE = "Vanguard feedback: Ctrl+C, then paste at vanguardui.com/feedback"

-- The site's limits: field -> { least, most } characters (least 0: optional).
local LIMITS = { title = { 8, 100 }, did = { 1, 2000 }, expected = { 0, 1000 }, happened = { 1, 2000 }, want = { 1, 2000 }, why = { 1, 2000 } }
-- The texts each kind checks, in the site's order, with the name its messages use.
local CHECKS = {
  bug = { { "did", "What you did" }, { "expected", "What you expected" }, { "happened", "What happened instead" } },
  feature = { { "want", "What you want" }, { "why", "Why it would help" } },
}
-- The sections of each kind's block, in order.
local SECTIONS = { bug = { "did", "expected", "happened" }, feature = { "want", "why" } }
-- The "Part of Vanguard" choices after the modules (the site's FALLBACK_AREAS).
local OTHER_AREAS = { { "command", "A command" }, { "setting", "A setting" }, { "new", "Something new" }, { "not-sure", "Not sure" } }
local KINDS = { { "bug", "Report a bug" }, { "feature", "Request a feature" } }

-- Checks -------------------------------------------------------------------------------------

-- Characters in a string (UTF-8 code points, which is what the site counts).
local function length(s)
  return select(2, s:gsub("[^\128-\191]", ""))
end

-- A text trimmed and without the game's color codes (|cAARRGGBB and |r).
local function clean(s)
  return tostring(s or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""):match("^%s*(.-)%s*$")
end

-- "2,000" for 2000 (the site's wording).
local function count(n)
  return n >= 1000 and string.format("%d,%03d", math.floor(n / 1000), n % 1000) or tostring(n)
end

-- The message when a text is missing, too short or too long, else nil.
local function lengthError(field, value, label)
  local least, most, n = LIMITS[field][1], LIMITS[field][2], length(value)
  if least > 0 and n == 0 then return label .. " is required." end
  if n > 0 and n < least then return string.format("%s needs at least %s characters.", label, count(least)) end
  if n > most then return string.format("%s can be at most %s characters (it has %s).", label, count(most), count(n)) end
end

-- The fields cleaned: kind and area as given, every text trimmed.
local function cleaned(f)
  local out = { kind = f.kind, area = f.area or "" }
  for field in pairs(LIMITS) do out[field] = clean(f[field]) end
  return out
end

-- The "Part of Vanguard" choices: none, every module by its shown name, then the four general ones.
function FB.Areas()
  local out = { { "", "Choose one" } }
  for _, name in ipairs(ns.ModuleNames()) do
    local info = ns.Options.MODULE_INFO[name]
    out[#out + 1] = { name, info and info[1] or name }
  end
  for _, a in ipairs(OTHER_AREAS) do out[#out + 1] = a end
  return out
end

-- The shown name of an area value, or nil for none or one the site doesn't know.
function FB.AreaLabel(value)
  for _, a in ipairs(FB.Areas()) do
    if a[1] == value and value ~= "" then return a[2] end
  end
end

-- The first problem with the fields, in the site's words, or nil when they pass its checks.
function FB.Check(fields)
  local f = cleaned(fields)
  if not CHECKS[f.kind] then return "Choose Report a bug or Request a feature." end
  local problem = lengthError("title", f.title, "The short summary")
  if problem then return problem end
  for _, c in ipairs(CHECKS[f.kind]) do
    problem = lengthError(c[1], f[c[1]], c[2])
    if problem then return problem end
  end
  if f.kind == "feature" and not FB.AreaLabel(f.area) then return "Choose the part of Vanguard it's about." end
end

-- The block ----------------------------------------------------------------------------------

-- A text with every line that would read as one of the block's markers (or
-- as one set off already) set off by one more space; the site takes it back.
local function body(text)
  return (text:gsub("[^\n]+", function(line)
    return (line:find("^ *%-%-%- %w+ %-%-%-$") or line:find("^ *###")) and " " .. line or line
  end))
end

-- The lines of the block's head: the markers' start, the kind, the title on one line, and a feature's area.
local function head(f)
  local lines = { FB.START, "kind: " .. f.kind, "title: " .. (f.title:gsub("%s+", " ")) }
  if f.kind == "feature" then lines[#lines + 1] = "area: " .. f.area end
  return lines
end

-- Adds a bug's /vg report to the block's lines under its own marker.
local function addReport(lines)
  lines[#lines + 1] = "--- report ---"
  lines[#lines + 1] = ns.ReportText()
end

-- The block for the site's form: the head, each text under its "--- name ---"
-- line, for a bug the /vg report under "--- report ---", then the end marker.
function FB.Text(fields)
  local f = cleaned(fields)
  local lines = head(f)
  for _, field in ipairs(SECTIONS[f.kind]) do
    lines[#lines + 1] = "--- " .. field .. " ---"
    lines[#lines + 1] = body(f[field])
  end
  if f.kind == "bug" then addReport(lines) end
  lines[#lines + 1] = FB.END
  return table.concat(lines, "\n")
end

-- The form ------------------------------------------------------------------------------------

local WIDTH, HEIGHT, PAD = 560, 470, 12
-- The height of a caption above its box, and the gap under a box.
local CAPTION, GAP = 16, 8
-- The form, built on first use. What's typed stays until the block is made or a reload.
local form

-- A caption above a field.
local function caption(parent, text, y)
  local fs = T.Text(parent:CreateFontString(nil, "OVERLAY"), "label")
  fs:SetJustifyH("LEFT")
  fs:SetText(text)
  fs:SetPoint("TOPLEFT", 0, -y)
  return fs
end

-- A multi-line edit box of at most `most` letters, the width of the form less a scroll bar, that closes the form on Escape.
local function editBox(parent, name, most)
  local edit = CreateFrame("EditBox", name, parent)
  edit:SetMultiLine(true)
  edit:SetAutoFocus(false)
  edit:SetMaxLetters(most)
  edit:SetWidth(WIDTH - 2 * PAD - 26)
  edit:SetTextInsets(6, 6, 4, 4)
  T.Text(edit, "label")
  edit:SetScript("OnEscapePressed", function() form:Hide() end)
  return edit
end

-- A multi-line text box (height high, at most `most` letters) that scrolls when the text is longer.
local function textArea(parent, name, height, most)
  local scroll = T.EditBox(CreateFrame("ScrollFrame", name .. "Scroll", parent, "UIPanelScrollFrameTemplate"))
  scroll:SetHeight(height)
  scroll.edit = editBox(scroll, name, most)
  scroll:SetScrollChild(scroll.edit)
  return scroll
end

-- A captioned text box in a group at y; the group keeps the box as group[field]. Returns the y under it.
local function addText(group, field, text, height, y)
  caption(group, text, y)
  local area = textArea(group, "Vanguard_Feedback_" .. field, height, LIMITS[field][2])
  area:SetPoint("TOPLEFT", 0, -(y + CAPTION))
  area:SetPoint("RIGHT", 0, 0)
  group[field] = area.edit
  return y + CAPTION + height + GAP
end

-- A group of fields for one kind, anchored under the summary.
local function group(f)
  local g = CreateFrame("Frame", nil, f)
  g:SetPoint("TOPLEFT", PAD, -118)
  g:SetPoint("RIGHT", -PAD, 0)
  g:SetHeight(280)
  return g
end

-- The bug fields: what you did, expected and got; the report goes in by itself.
local function bugGroup(f)
  local g = group(f)
  local y = addText(g, "did", "What did you do?", 70, 0)
  y = addText(g, "expected", "What did you expect? (optional)", 46, y)
  y = addText(g, "happened", "What happened instead?", 70, y)
  g.note = T.Text(g:CreateFontString(nil, "OVERLAY"), "small", "muted")
  g.note:SetPoint("TOPLEFT", 0, -y)
  g.note:SetText("Your /vg report (version, client and the errors caught this session) goes in the block with your answers.")
  return g
end

-- The feature fields: what you want, which part of Vanguard, and why.
local function featureGroup(f)
  local g = group(f)
  local y = addText(g, "want", "What do you want?", 70, 0)
  caption(g, "Part of Vanguard", y)
  g.area = W.Dropdown(g, FB.Areas, function() return f.area end, function(v) f.area = v end, 300)
  g.area:SetPoint("TOPLEFT", 0, -(y + CAPTION))
  y = y + CAPTION + 22 + GAP
  addText(g, "why", "Why would it help you?", 70, y)
  return g
end

-- Tab (Shift-Tab back) moves between the boxes in order, round the ends.
local function tabBetween(boxes)
  for i, box in ipairs(boxes) do
    box:SetScript("OnTabPressed", function()
      local to = IsShiftKeyDown() and (boxes[i - 1] or boxes[#boxes]) or (boxes[i + 1] or boxes[1])
      to:SetFocus()
    end)
  end
end

-- Shows the fields of the kind picked, with Tab running through them, and clears a problem shown.
local function showKind()
  local f, bug = form, form.kind == "bug"
  f.bug:SetShown(bug)
  f.feature:SetShown(not bug)
  f.problem:SetText("")
  if bug then tabBetween({ f.summary, f.bug.did, f.bug.expected, f.bug.happened }) else tabBetween({ f.summary, f.feature.want, f.feature.why }) end
end

-- The fields as typed: kind, title, area and every text.
function FB.Fields()
  local f = form
  return { kind = f.kind, title = f.summary:GetText(), area = f.area,
    did = f.bug.did:GetText(), expected = f.bug.expected:GetText(), happened = f.bug.happened:GetText(),
    want = f.feature.want:GetText(), why = f.feature.why:GetText() }
end

-- Make report: a problem with the fields is shown under them; else the block
-- opens in the copy box (selected, for Ctrl+C) and the form closes.
function FB.Make()
  local fields = FB.Fields()
  local problem = FB.Check(fields)
  form.problem:SetText(problem or "")
  if problem then return end
  form:Hide()
  ns.ShowText(FB.TITLE, FB.Text(fields))
end

-- The summary line under the kind row: its caption and a one-line box of at most 100 letters.
local function addSummary(f)
  caption(f, "Short summary (8 to 100 characters)", 70):SetPoint("TOPLEFT", PAD, -70)
  f.summary = W.Input(f, WIDTH - 2 * PAD)
  f.summary:SetMaxLetters(LIMITS.title[2])
  f.summary:SetPoint("TOPLEFT", PAD, -86)
  f.summary:SetScript("OnEscapePressed", function() f:Hide() end)
end

-- The bottom of the form: Make report, Cancel, and the problem line above them.
local function addButtons(f)
  f.make = W.Primary(f, "Make report", FB.Make, 130)
  f.make:SetPoint("BOTTOMRIGHT", -PAD, PAD)
  f.cancel = ns.DialogButton(f, "Cancel")
  f.cancel:SetPoint("RIGHT", f.make, "LEFT", -8, 0)
  f.cancel:SetScript("OnClick", function() f:Hide() end)
  f.problem = T.Text(f:CreateFontString(nil, "OVERLAY"), "label", "warn")
  f.problem:SetJustifyH("LEFT")
  f.problem:SetPoint("BOTTOMLEFT", PAD, PAD + 30)
  f.problem:SetPoint("RIGHT", -PAD, 0)
end

-- The dialog frame: a centered themed panel on the dialog strata, hidden, with its heading.
local function frame()
  local f = T.Panel(CreateFrame("Frame", "Vanguard_Feedback", UIParent), { alpha = 0.98, shadow = true })
  f:SetSize(WIDTH, HEIGHT)
  f:SetPoint("CENTER")
  f:SetFrameStrata("DIALOG")
  f:EnableMouse(true)
  f:Hide()
  f.heading = T.Text(f:CreateFontString(nil, "OVERLAY"), "heading")
  f.heading:SetPoint("TOPLEFT", PAD, -10)
  f.heading:SetText("Send feedback")
  return f
end

-- The kind row at the top: Report a bug or Request a feature; picking one shows its fields.
local function addKindRow(f)
  f.kindRow = W.Choice(f, "What would you like to send?", KINDS, function() return f.kind end, function(v) f.kind = v; showKind() end, WIDTH - 2 * PAD)
  f.kindRow:SetPoint("TOPLEFT", PAD, -34)
end

-- Builds the form once: the kind row, the summary, a group per kind, and the buttons.
local function build()
  if form then return form end
  form = frame()
  form.kind, form.area = "bug", ""
  addKindRow(form)
  addSummary(form)
  form.bug = bugGroup(form)
  form.feature = featureGroup(form)
  addButtons(form)
  return form
end

-- /vg feedback [bug|feature]: opens the form on the kind given, else on the kind last picked (a bug at first).
function FB.Open(kind)
  local f = build()
  if CHECKS[kind] then f.kind = kind end
  showKind()
  f:Show()
  f.summary:SetFocus()
end
