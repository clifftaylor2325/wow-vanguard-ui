-- The guided steps of first-run setup (Core/Setup.lua): Comfort, Game settings, Helpers and Combat walk the
-- player through Vanguard's recommended settings, and All set lists what the run changed with an Undo setup
-- button. Every row is an options row (found by its page and English caption, so the window, the search and
-- the website keep one name for each setting) or one of setup's own switches; a row this client lacks
-- isn't built. A switch only stages a pick: leaving the step applies the picks that differ from what is set,
-- after setup's profile backup. On a first run Vanguard's own rows start on their recommended value and the
-- game's own on what the game has now; a run again starts every row on what is set now, so Next, Next, Done
-- still changes nothing. The spec is docs/design/GUIDED-SETUP.md.

local _, ns = ...
local L = ns.L

local T, W, O = ns.Theme, ns.Widgets, ns.Options

local G = {}
ns.SetupGuide = G

-- The page's width: setup's, inside its margins.
local PAGE_W = ns.Setup.PAGE_W

-- Whether the game's gamepad interface is on (InputUtil, where the client has it): Larger text is recommended then.
local function gamepad()
  return type(InputUtil) == "table" and type(InputUtil.IsGamepadUIEnabled) == "function" and InputUtil.IsGamepadUIEnabled() == true
end

-- Whether the role the layout step picked (or your group role on Keep) is the tank.
local function tanking()
  return ns.Setup.ChosenRole() == "tank"
end

-- Key setup's note for the next login (Modules/KeybindsWizard.lua): on until the player turns it off here.
local function keysOffered()
  return VanguardCharDB.keysOffer ~= false
end

-- Turns key setup's next-login note on or off.
local function offerKeys(on)
  VanguardCharDB.keysOffer = on == true
end

-- The rows of each guided step, in order. A row is a caption, the options row(s) it sets ({ page key, English
-- caption }; a cycle row gives the value that counts as on and the one off is), or setup's own get and set; recommend
-- is true, or a function answering for the role or the client; game marks the game's own settings, which start on
-- what the game has now on a first run too. A row with no recommend is offered and left as it is by Use recommended.
G.ROWS = {
  comfort = {
    { key = "larger", caption = L["Larger text (115%)"], recommend = gamepad,
      get = function() return ns.Setup.Larger() end, set = function(v) ns.Setup.SetLarger(v) end },
    { key = "assist", caption = L["Colour vision: Safer colours (colour blindness)"],
      get = function() return ns.Setup.Assist() end, set = function(v) ns.Setup.SetAssist(v) end },
    { key = "calm", caption = L["Calm HUD: quiet the HUD out of combat"],
      get = function() return ns.Setup.Calm() end, set = function(v) ns.Setup.SetCalm(v) end },
    { key = "motion", caption = L["Reduce motion (no fades or flashes)"], options = { { "general", "Reduce motion (no fades or flashes)" } } },
  },
  game = {
    { key = "plates", caption = L["Enemy nameplates (the V key)"], recommend = true, game = true,
      options = { { "nameplates", "Enemy nameplates (the game's setting)" } } },
    { key = "camera", caption = L["Camera zooms out furthest (2.6 x)"], recommend = true, game = true, on = 2.6, off = 0,
      options = { { "windows", "Furthest camera zoom (the game's setting)" } } },
    { key = "classNames", caption = L["Class-coloured names in chat"], recommend = true, game = true, on = "0", off = "2",
      options = { { "chat", "Class-colored names in chat (the game's setting)" } } },
  },
  helpers = {
    { key = "loot", caption = L["Faster auto-loot"], recommend = true, options = { { "windows", "Faster auto-loot" } } },
    { key = "filter", caption = L["Filter chat: gold selling, boosting, recruiting, repeats"], recommend = true,
      options = { { "chat", "Filter chat" } } },
    { key = "history", caption = L["Keep chat history across reloads"], recommend = true, options = { { "chat", "Keep chat history" } } },
    { key = "ranks", caption = L["Spell ranks: notice older ranks, remember trainers"], recommend = true,
      options = { { "town", "Notice older ranks on bars" }, { "town", "Remember what trainers teach" } } },
    { key = "mail", caption = L["Inbox search and send-to-alt presets"], recommend = true,
      options = { { "town", "Inbox search and send-to-alt presets" } } },
    { key = "quests", caption = L["Accept and turn in quests (hold Shift to skip)"],
      options = { { "quests", "Accept quests" }, { "quests", "Turn in finished quests" } } },
  },
  combat = {
    { key = "manager", caption = L["Show the game's Cooldown Manager"], recommend = true, options = { { "cooldowns", "Show the game's manager" } } },
    { key = "glow", caption = L["Glow a buff near its end"], recommend = true, options = { { "cooldowns", "Glow a buff near its end" } } },
    { key = "timers", caption = L["Timer numbers on target and focus auras"], recommend = true,
      options = { { "unitframes", "Timer numbers on the icons" } } },
    { key = "threat", caption = L["Group threat panel"], recommend = tanking, options = { { "unitframes", "Group threat panel" } } },
    { key = "bars", caption = L["Two more bars at the right edge (bars 4 and 5)"], recommend = true,
      options = { { "actionbars", "Show bar 4" }, { "actionbars", "Show bar 5" } } },
    { key = "keys", caption = L["Key setup at your next login"], recommend = true, when = ns.IsForever, get = keysOffered, set = offerKeys },
  },
}

-- What each guided step asks, over its rows.
local QUESTIONS = {
  comfort = L["Readability and calm: pick what helps you. All of these are under General in /vg."],
  game = L["The game's own settings. Vanguard remembers what they were, so turning one off later puts yours back."],
  helpers = L["Helpers that start off. Switch on what you'd use; each is on its page in /vg."],
  combat = L["In a fight. Recommended rows follow the layout you picked."],
}
-- The All set step's line over its list, with changes and without.
local DONE_CHANGED = L["All set. Done closes setup. This run changed:"]
local DONE_SAME = L["All set. This run changed nothing: Done closes setup."]

-- The picks the switches stage (by row key), which rows the player touched this run, what each row's settings
-- were when setup opened (one value per options row), and whether this is the account's first run.
local picks, touched, snap, firstRun = {}, {}, {}, false

-- Finding the rows ---------------------------------------------------------------------------------

-- The options row on the page with that key whose English caption is `caption` (as the window shows it, after a
-- rename), or nil when this client has no such page or row.
local function optionRow(key, caption)
  for _, page in ipairs(O.PAGES) do
    if page.key == key then
      for _, row in ipairs(O.RowsOf(page)) do
        if (row.english or ns.English(row[2])) == caption then return row end
      end
    end
  end
end

-- Where a row kind keeps its getter (its setter follows it).
local GETTER_AT = { check = 3, cycle = 4 }

-- An options row's get and set as one accessor, or nil for a row that isn't a switch or a choice.
local function accessor(row)
  local at = row and GETTER_AT[row[1]]
  if at then return { get = row[at], set = row[at + 1] } end
end

-- The accessors a guided row sets: one per options row it names (nil when any is missing on this client), or
-- setup's own get and set.
local function accessors(spec)
  if spec.get then return { { get = spec.get, set = spec.set } } end
  local out = {}
  for i, ref in ipairs(spec.options) do
    out[i] = accessor(optionRow(ref[1], ref[2]))
    if not out[i] then return nil end
  end
  return out
end

-- The value that counts as the row being on (true unless the row says).
local function onValue(spec)
  if spec.on == nil then return true end
  return spec.on
end

-- The value that counts as the row being off (false unless the row says).
local function offValue(spec)
  if spec.off == nil then return false end
  return spec.off
end

-- Whether the row is on now: every setting it names holds its on value.
local function isOn(spec)
  for _, a in ipairs(spec.access) do
    if a.get() ~= onValue(spec) then return false end
  end
  return true
end

-- Sets every setting the row names on or off.
local function setOn(spec, on)
  local v = on and onValue(spec) or offValue(spec)
  for _, a in ipairs(spec.access) do a.set(v) end
end

-- What Vanguard recommends for the row now: true or false, or nil for a row it only offers.
local function recommended(spec)
  if type(spec.recommend) == "function" then return spec.recommend() == true end
  return spec.recommend
end

-- Where a row's pick starts: on a first run, on for Vanguard's own rows it recommends on; else what is set now (so
-- a row the player turned on before a first run ends isn't switched off for them).
local function startPick(spec)
  if firstRun and not spec.game and recommended(spec) == true then return true end
  return isOn(spec)
end

-- The guided rows built for this client, over every step.
local function builtRows()
  local out = {}
  for _, key in ipairs({ "comfort", "game", "helpers", "combat" }) do
    for _, spec in ipairs(G.ROWS[key]) do
      if spec.access then out[#out + 1] = spec end
    end
  end
  return out
end

-- Changes -------------------------------------------------------------------------------------------

-- Whether the row was on when setup opened (its snapshot holds every setting's on value).
local function wasOn(spec)
  for i in ipairs(spec.access) do
    if snap[spec.key][i] ~= onValue(spec) then return false end
  end
  return true
end

-- A changed row's line for the All set step: its caption and On or Off.
local function changeLine(spec)
  return ns.Format(L["{setting}: {value}"], { setting = spec.caption, value = isOn(spec) and L["On"] or L["Off"] })
end

-- The guided rows this run changed, as lines for the All set step.
function G.Changes()
  local out = {}
  for _, spec in ipairs(builtRows()) do
    if isOn(spec) ~= wasOn(spec) then out[#out + 1] = changeLine(spec) end
  end
  return out
end

-- Puts every guided row back to what it was when setup opened (the game's own settings too, which the profile
-- doesn't hold).
local function putBack()
  for _, spec in ipairs(builtRows()) do
    for i, a in ipairs(spec.access) do
      if a.get() ~= snap[spec.key][i] then a.set(snap[spec.key][i]) end
    end
  end
end

-- Undo setup: every guided row goes back to what it was when setup opened (through its setter, so the screen
-- follows), then setup puts the profile back as it was before this run's first change (ns.Setup.Undo).
function G.Undo()
  ns.Setup.Undo(putBack)
end

-- The run -------------------------------------------------------------------------------------------

-- Setup opened (before it takes its own snapshot: a first read fills a module's defaults in): takes the rows'
-- snapshot and starts their picks; first is true on the account's first run.
function G.Begin(first)
  firstRun, touched = first == true, {}
  for _, spec in ipairs(builtRows()) do
    snap[spec.key] = {}
    for i, a in ipairs(spec.access) do snap[spec.key][i] = a.get() end
    picks[spec.key] = startPick(spec)
  end
end

-- A guided step shows: a row the player hasn't touched starts again (a first run's recommendation follows the
-- layout picked since). Other steps show nothing here.
function G.Show(key)
  for _, spec in ipairs(G.ROWS[key] or {}) do
    if spec.access and not touched[spec.key] then picks[spec.key] = startPick(spec) end
  end
end

-- Leaving a guided step applies the picks that differ from what is set, after setup's profile backup (the game's
-- own rows too: the camera's value and the record of the game's old values live in the profile). Other steps apply
-- nothing here.
function G.Leave(key)
  for _, spec in ipairs(G.ROWS[key] or {}) do
    if spec.access and picks[spec.key] ~= isOn(spec) then
      ns.Setup.Backup()
      setOn(spec, picks[spec.key])
    end
  end
end

-- Use recommended: every row of the step with a recommendation takes it (an offered row stays as picked).
local function useRecommended(page)
  for _, row in ipairs(page.rows) do
    local rec = recommended(row.spec)
    if rec ~= nil then picks[row.spec.key], touched[row.spec.key] = rec, true end
  end
  G.Refresh({ [page.key] = page })
end

-- Building ------------------------------------------------------------------------------------------

-- A label as wide as the page, wrapping rather than running past the window's edge.
local function pageLabel(page, text, role, color)
  local fs = W.Label(page, text, role, color)
  fs:SetWidth(PAGE_W)
  return fs
end

-- A row's switch: it stages the pick (and marks the row touched); the row re-reads the pick.
local function addRow(page, spec)
  local r = W.Check(page, spec.caption, function() return picks[spec.key] == true end,
    function(v) picks[spec.key], touched[spec.key] = v == true, true end, PAGE_W)
  r.spec = spec
  local above = page.rows[#page.rows] or page.question
  r:SetPoint("TOPLEFT", above, "BOTTOMLEFT", 0, above == page.question and -T.SPACE.gap or 0)
  page.rows[#page.rows + 1], page.choices[#page.choices + 1] = r, r
end

-- The Use recommended button under a step's rows, as wide as its label needs.
local function addUseButton(page)
  page.use = W.Button(page, L["Use recommended"], function() useRecommended(page) end)
  page.use:SetPoint("TOPLEFT", page.rows[#page.rows] or page.question, "BOTTOMLEFT", 0, -T.SPACE.gap)
  ns.WidenToLabel(page.use)
  page.choices[#page.choices + 1] = page.use
end

-- Undo setup asks first (what this run changed goes, the profile as it was comes back), then undoes.
local function askUndo()
  ns.Ask(L["Undo everything this setup changed and put the profile back as it was? Setup then ends and offers the reload that applies it."],
    L["Undo"], G.Undo, nil, "danger")
end

-- The All set step: its line, the list filled as it shows (G.Refresh) and Undo setup, shown while there is a change.
local function buildDone(page)
  page.lines = {}
  page.undo = W.Button(page, L["Undo setup"], askUndo)
  ns.WidenToLabel(page.undo)
  page.choices[1] = page.undo
end

-- A guided step's page by key: its question, a switch per row this client has, then Use recommended; the All set step
-- its list and Undo setup.
function G.Build(page, key)
  page.key, page.rows, page.choices = key, {}, {}
  page.question = pageLabel(page, QUESTIONS[key] or DONE_SAME, "label", "text2")
  page.question:SetPoint("TOPLEFT")
  if key == "done" then return buildDone(page) end
  for _, spec in ipairs(G.ROWS[key]) do
    spec.access = spec.access or ((not spec.when or spec.when()) and accessors(spec) or nil)
    if spec.access then addRow(page, spec) end
  end
  addUseButton(page)
end

-- Showing -------------------------------------------------------------------------------------------

-- A row's caption, marked "recommended" while Vanguard recommends it on for this role and client.
local function captionNow(spec)
  if recommended(spec) == true then return ns.Format(L["{caption}  ·  recommended"], { caption = spec.caption }) end
  return spec.caption
end

-- Re-reads a guided step's switches and their marks.
local function refreshRows(page)
  for _, r in ipairs(page.rows) do
    r.label:SetText(captionNow(r.spec))
    r:Refresh()
  end
end

-- The All set step's line i, made the first time it is needed, hung under the one above.
local function doneLine(page, i)
  if page.lines[i] then return page.lines[i] end
  page.lines[i] = pageLabel(page, "", "small", "text2")
  page.lines[i]:SetPoint("TOPLEFT", page.lines[i - 1] or page.question, "BOTTOMLEFT", 0, -T.SPACE.tight)
  return page.lines[i]
end

-- Fills the All set step: its line, one line per change (setup's own first), and Undo setup under them while
-- there is one; spare lines hide.
local function refreshDone(page, changes)
  page.question:SetText(#changes > 0 and DONE_CHANGED or DONE_SAME)
  for i, text in ipairs(changes) do
    doneLine(page, i):SetText(text)
    page.lines[i]:Show()
  end
  for i = #changes + 1, #page.lines do page.lines[i]:Hide() end
  page.undo:SetShown(#changes > 0)
  page.undo:ClearAllPoints()
  page.undo:SetPoint("TOPLEFT", page.lines[#changes] or page.question, "BOTTOMLEFT", 0, -T.SPACE.gap)
end

-- The lines of a and then those of b, as one new list.
local function joined(a, b)
  local out = {}
  for _, list in ipairs({ a, b }) do
    for _, line in ipairs(list) do out[#out + 1] = line end
  end
  return out
end

-- Re-reads every guided page given (by key): the switches and marks, and the All set list (own: setup's own
-- change lines, ahead of the rows').
function G.Refresh(pages, own)
  for key, page in pairs(pages) do
    if key == "done" then refreshDone(page, joined(own or {}, G.Changes()))
    elseif G.ROWS[key] and page.rows then refreshRows(page) end
  end
end

-- How tall a guided step stands: its question, a gap, its rows grown to their captions, a gap and the button; the
-- All set step its question, its shown lines and Undo setup while it shows.
function G.Height(page)
  local h = page.question:GetStringHeight() + T.SPACE.gap
  if page.key == "done" then
    for _, line in ipairs(page.lines) do
      if line:IsShown() then h = h + line:GetStringHeight() + T.SPACE.tight end
    end
    return h + (page.undo:IsShown() and T.BUTTON_H or 0)
  end
  for _, r in ipairs(page.rows) do h = h + W.GrowRow(r) end
  return h + T.SPACE.gap + T.BUTTON_H
end
