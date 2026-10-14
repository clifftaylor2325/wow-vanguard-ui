-- The stat weights wizard (Gear upgrades, /vg weights wizard): three pages, the role
-- the weights are for, sliders for the stats that matter most for that kind of
-- character, and a review of every weight. Nothing is saved until Save; Cancel and
-- closing change nothing. /vg weights and its set, reset, export and import stay.

local ADDON, ns = ...

local W, UW = ns.Widgets, ns.UpgradeWeights
local UP = ns.GetModule("Upgrades")

local WZ = {}
UP.Wizard = WZ

local WIDTH, HEIGHT, ROW_WIDTH, SLIDERS = 440, 360, 400, 7
local ROLES = { { "auto", "Group role, else damage" }, { "damage", "Damage" }, { "tank", "Tank" }, { "healer", "Healer" } }
local CAPTIONS = { "Which role is this for?", "What is each stat worth?", "Review, then Save" }
-- What the wizard calls each stat (the keys of ns.UpgradeWeights.STATS).
WZ.LABELS = {
  STR = "Strength", AGI = "Agility", STA = "Stamina", INT = "Intellect", SPI = "Spirit", ARMOR = "Armor",
  AP = "Attack power", RAP = "Ranged attack power", SP = "Spell power", MP5 = "Mana per 5 seconds",
  CRIT = "Crit rating", HIT = "Hit rating", HASTE = "Haste rating", EXP = "Expertise", ARP = "Armor penetration",
  DEF = "Defense", DODGE = "Dodge", PARRY = "Parry", BLOCK = "Block rating", BLOCKVALUE = "Block value", DPS = "Weapon damage per second",
}
local frame
-- step: the page shown; role: the role picked; kind: the kind of character it makes; draft: stat -> weight;
-- stats: the stats the sliders show, the biggest default weights first.
local state = { step = 1, role = "auto", kind = "strength", draft = {}, stats = {} }

-- The stats a kind weighs most (armor aside), biggest default weight first.
local function topStats(kind)
  local out = {}
  for short in pairs(UW.KINDS[kind]) do if short ~= "ARMOR" then out[#out + 1] = short end end
  table.sort(out, function(a, b)
    local wa, wb = UW.KINDS[kind][a], UW.KINDS[kind][b]
    if wa ~= wb then return wa > wb end
    return a < b
  end)
  for i = #out, SLIDERS + 1, -1 do out[i] = nil end
  return out
end

-- The draft for the role picked: the kind it makes for your class, with the defaults and this profile's changes.
local function load()
  local _, class = UnitClass("player")
  state.kind = UW.Kind(class, UP.Role(state.role))
  state.draft = ns.Copy(UW.KINDS[state.kind])
  for short, n in pairs(UP.settings.weights[state.kind] or {}) do state.draft[short] = n end
  state.stats = topStats(state.kind)
end

-- A weight rounded to two places (a slider's float noise never reaches the draft).
local function round(n)
  return math.floor(n * 100 + 0.5) / 100
end

-- The review: every stat the draft values, biggest first, one paragraph.
local function reviewText()
  local list = {}
  for short, n in pairs(state.draft) do if n > 0 then list[#list + 1] = { short, n } end end
  table.sort(list, function(a, b) return a[2] > b[2] or (a[2] == b[2] and a[1] < b[1]) end)
  for i, e in ipairs(list) do list[i] = (WZ.LABELS[e[1]] or e[1]) .. " " .. round(e[2]) end
  return string.format("Weights for a %s, role %s:\n%s.", state.kind, UP.Role(state.role), table.concat(list, ", "))
end

-- Saves the draft: the role, and the weights that differ from the kind's defaults.
function WZ.Save()
  local changed = {}
  for short, n in pairs(state.draft) do if n ~= (UW.KINDS[state.kind][short] or 0) then changed[short] = n end end
  UP.settings.role = state.role
  UP.settings.weights[state.kind] = next(changed) and changed or nil
  UP.Changed()
  ns.Chat(string.format("Gear upgrades now weigh stats as a %s (role %s).", state.kind, UP.Role(state.role)))
end

-- Shows the page for the step: its controls, the caption, and Back, Next or Save.
local function showStep()
  for i, page in ipairs(frame.pages) do page:SetShown(i == state.step) end
  frame.caption:SetText(string.format("Step %d of 3: %s", state.step, CAPTIONS[state.step]))
  frame.back:SetShown(state.step > 1)
  frame.next.text:SetText(state.step == 3 and "Save" or "Next")
  for _, r in ipairs(frame.rows) do r:Refresh() end
  frame.review:Refresh()
end

-- The role page: the choice, and a line saying what it makes you.
local function buildRolePage(page)
  local r = W.Choice(page, "Weigh stats for", ROLES, function() return state.role end, function(v) state.role = v; load(); showStep() end, ROW_WIDTH)
  r:SetPoint("TOPLEFT", 0, 0)
  frame.rows[#frame.rows + 1] = r
  page.note = W.Text(page, function() return "That makes you a " .. state.kind .. " here. The next page starts from its weights, with this profile's changes." end)
  page.note:SetPoint("TOPLEFT", 8, -40)
  page.note:SetWidth(ROW_WIDTH - 16)
  frame.rows[#frame.rows + 1] = page.note
  return r
end

-- A slider's refresh that also names its stat, and hides the slider when the kind has none at that place.
local function ownRefresh(refresh, i)
  -- Names the slider for its stat, then refreshes it.
  return function(self)
    local short = state.stats[i]
    self:SetShown(short ~= nil)
    if short then self.label:SetText(WZ.LABELS[short] or short); refresh(self) end
  end
end

-- One slider on the tune page, for the stat at its place in the kind's list (hidden when the kind has fewer).
local function sliderRow(page, i)
  local r = W.Slider(page, "", { min = 0, max = 3, step = 0.1 }, function() return state.draft[state.stats[i]] or 0 end, function(v) state.draft[state.stats[i]] = round(v) end, ROW_WIDTH)
  r:SetPoint("TOPLEFT", 0, -(i - 1) * W.ROW_HEIGHT)
  r.Refresh = ownRefresh(r.Refresh, i)
  return r
end

-- The tune page: a slider per key stat and Defaults.
local function buildTunePage(page)
  for i = 1, SLIDERS do frame.rows[#frame.rows + 1] = sliderRow(page, i) end
  page.defaults = W.Button(page, "Defaults", function() load(); showStep() end, 100)
  page.defaults:SetPoint("TOPLEFT", 8, -SLIDERS * W.ROW_HEIGHT - 8)
end

-- The review page: every weight as it will be used.
local function buildReviewPage(page)
  frame.review = W.Text(page, reviewText)
  frame.review:SetPoint("TOPLEFT", 8, 0)
  frame.review:SetWidth(ROW_WIDTH - 16)
  frame.review:SetJustifyH("LEFT")
end

-- Goes a page on, or saves on the last one and closes.
local function advance()
  if state.step < 3 then state.step = state.step + 1; return showStep() end
  WZ.Save()
  frame:Hide()
end

-- The buttons along the foot: Cancel on the left, Back and Next (Save on the last page) on the right.
local function addButtons()
  frame.next = W.Primary(frame, "Next", advance, 100)
  frame.next:SetPoint("BOTTOMRIGHT", -12, 12)
  frame.back = W.Button(frame, "Back", function() state.step = state.step - 1; showStep() end, 100)
  frame.back:SetPoint("RIGHT", frame.next, "LEFT", -8, 0)
  frame.cancel = W.Button(frame, "Cancel", function() frame:Hide() end, 100)
  frame.cancel:SetPoint("BOTTOMLEFT", 12, 12)
end

-- An empty page of the dialog, under its caption.
local function pageFrame()
  local page = CreateFrame("Frame", nil, frame)
  page:SetPoint("TOPLEFT", 12, -60)
  page:SetSize(ROW_WIDTH, HEIGHT - 110)
  return page
end

-- Builds the dialog once: title, step caption, the three pages and the buttons.
local function build()
  frame = ns.Dialog("Vanguard_WeightsWizard", WIDTH, HEIGHT)
  frame.title:SetText("Stat weights")
  frame.rows, frame.pages = {}, {}
  frame.caption = W.Text(frame, "")
  frame.caption:SetPoint("TOPLEFT", 12, -34)
  for i, builder in ipairs({ buildRolePage, buildTunePage, buildReviewPage }) do
    frame.pages[i] = pageFrame()
    builder(frame.pages[i])
  end
  addButtons()
end

-- Opens the wizard on its first page, from the role in use and the weights this profile has.
function WZ.Open()
  if not UP.settings then return ns.Chat("Gear upgrades is switched off: turn it on under Modules first.") end
  if not frame then build() end
  state.step, state.role = 1, UP.settings.role
  load()
  showStep()
  frame:Show()
end
