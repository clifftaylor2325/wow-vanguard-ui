-- The stat weights wizard (Gear upgrades, /vg weights wizard): one panel with a slider
-- for every stat Gear upgrades knows, for the weights in use (the kind of character your
-- class and the Weigh stats for role make). The stats that kind values come first, the
-- biggest first, then the rest by name. Nothing is saved until Save; Cancel and closing
-- change nothing; Defaults puts the sliders back to the kind's defaults. /vg weights and
-- its set, reset, export and import stay.

local ADDON, ns = ...

local T, W, UW = ns.Theme, ns.Widgets, ns.UpgradeWeights
local UP = ns.GetModule("Upgrades")

local WZ = {}
UP.Wizard = WZ

local WIDTH, HEIGHT, BOX_WIDTH = 460, 440, 60
-- A stat's row is the list's width: the dialog less its insets and the thumb's gutter. Its slider takes what its
-- exact-value box (BOX_WIDTH, a gap away) leaves.
local ROW_WIDTH = WIDTH - 2 * T.SPACE.pad - T.SPACE.col
local SLIDER_WIDTH = ROW_WIDTH - BOX_WIDTH - T.SPACE.gap
-- What the wizard calls each stat (the keys of ns.UpgradeWeights.STATS).
WZ.LABELS = {
  STR = "Strength", AGI = "Agility", STA = "Stamina", INT = "Intellect", SPI = "Spirit", ARMOR = "Armor",
  AP = "Attack power", RAP = "Ranged attack power", SP = "Spell power", MP5 = "Mana per 5 seconds",
  CRIT = "Crit rating", HIT = "Hit rating", HASTE = "Haste rating", EXP = "Expertise", ARP = "Armor penetration",
  DEF = "Defense", DODGE = "Dodge", PARRY = "Parry", BLOCK = "Block rating", BLOCKVALUE = "Block value", DPS = "Weapon damage per second",
}
local frame
-- kind: the kind of character the weights are for; draft: stat -> weight; stats: every stat, in slider order.
local state = { kind = "strength", draft = {}, stats = {} }

-- Every stat, the ones the kind values first (biggest default weight first), then the rest by name.
function WZ.Order(kind)
  local out, defaults = {}, UW.KINDS[kind]
  for short in pairs(UW.STATS) do out[#out + 1] = short end
  table.sort(out, function(a, b)
    local wa, wb = defaults[a] or 0, defaults[b] or 0
    if wa ~= wb then return wa > wb end
    return WZ.LABELS[a] < WZ.LABELS[b]
  end)
  return out
end

-- The draft: the weights in use for the kind (the defaults with this profile's changes), and the kind's sliders.
local function loadWeights()
  local weights, kind = UP.Weights()
  state.kind, state.stats = kind, WZ.Order(kind)
  state.draft = weights
end

-- The draft as the kind's bare defaults (the Defaults button; the same kind and sliders as loadWeights).
local function loadDefaults()
  loadWeights()
  state.draft = ns.Copy(UW.KINDS[state.kind])
end

-- A weight rounded to two places (a slider's float noise never reaches the draft).
local function round(n)
  return math.floor(n * 100 + 0.5) / 100
end

-- Saves the draft: the weights that differ from the kind's defaults (none: the defaults).
function WZ.Save()
  local changed = {}
  for short, n in pairs(state.draft) do if n ~= (UW.KINDS[state.kind][short] or 0) then changed[short] = n end end
  UP.settings.weights[state.kind] = next(changed) and changed or nil
  UP.Changed()
  ns.Chat(string.format("Stat weights saved for %s (role %s).", state.kind, UP.Role()))
end

-- Re-reads every slider and the line naming who the weights are for.
local function refresh()
  frame.caption:SetText(string.format("Weights for %s (role %s). The Weigh stats for choice under Gear upgrades picks the role; 0 makes a stat worthless.", state.kind, UP.Role()))
  for _, r in ipairs(frame.rows) do r:Refresh() end
end

-- A slider's refresh that also names its stat and shows the exact weight in its box (unless you're typing there).
local function ownRefresh(base, i)
  -- Names the slider for its stat, fills its box, then refreshes it.
  return function(self)
    self.label:SetText(WZ.LABELS[state.stats[i]])
    if not self.box:HasFocus() then self.box:SetText(tostring(self.get())) end
    base(self)
  end
end

-- Takes the number typed in a slider's box (any finite number, past the slider's ends too); anything else puts the weight back.
local function typed(r)
  local n = UP.ParseWeight(r.box:GetText())
  if n then r.set(n) end
  r.box:ClearFocus()
  r:Refresh()
end

-- A box beside the slider for an exact weight; Enter or leaving the box takes it.
local function addBox(r, list)
  r.box = W.Input(list, BOX_WIDTH)
  r.box:SetPoint("LEFT", r, "RIGHT", T.SPACE.gap, 0)
  r.box:SetScript("OnEnterPressed", ns.Guard("type weight", function() typed(r) end))
  r.box:SetScript("OnEditFocusLost", ns.Guard("type weight", function() typed(r) end))
end

-- The slider for the stat at place i in the list, with its box.
local function sliderRow(list, i)
  local r = W.Slider(list, "", { min = 0, max = 3, step = 0.1 }, function() return state.draft[state.stats[i]] or 0 end, function(v) state.draft[state.stats[i]] = round(v) end, SLIDER_WIDTH)
  r:SetPoint("TOPLEFT", 0, -(i - 1) * T.ROW.height)
  addBox(r, list)
  r.Refresh = ownRefresh(r.Refresh, i)
  return r
end

-- The scrolling list with a slider per stat: a dialog scroll view under the caption, over the buttons, with the
-- thumb in the right pad.
local function addList()
  local stats = #WZ.Order("caster")
  frame.view = ns.ScrollView(frame, { width = ROW_WIDTH })
  frame.view:SetPoint("TOPLEFT", frame.caption, "BOTTOMLEFT", 0, -T.SPACE.gap)
  frame.view:SetPoint("BOTTOMRIGHT", -(T.SPACE.pad + T.SPACE.col), ns.DIALOG.foot)
  frame.view:Fit(T.ROW.height * stats)
  frame.list = frame.view.child
  for i = 1, stats do frame.rows[i] = sliderRow(frame.list, i) end
end

-- The buttons along the foot: Defaults on the left, Cancel and Save on the right.
local function addButtons()
  frame.save = W.Primary(frame, "Save", function() WZ.Save(); frame:Hide() end)
  frame.save:SetPoint("BOTTOMRIGHT", -T.SPACE.pad, T.SPACE.pad)
  frame.cancel = W.Button(frame, "Cancel", function() frame:Hide() end)
  frame.cancel:SetPoint("RIGHT", frame.save, "LEFT", -T.SPACE.gap, 0)
  frame.defaults = W.Button(frame, "Defaults", function() loadDefaults(); refresh() end)
  frame.defaults:SetPoint("BOTTOMLEFT", T.SPACE.pad, T.SPACE.pad)
end

-- Builds the dialog once: title, the line saying who it's for, the sliders and the buttons.
local function build()
  frame = ns.Dialog("Vanguard_WeightsWizard", WIDTH, HEIGHT)
  frame.title:SetText("Stat weights")
  frame.rows = {}
  frame.caption = T.Text(W.Text(frame, ""), "small", "muted")
  frame.caption:SetPoint("TOPLEFT", T.SPACE.pad, -ns.DIALOG.head)
  frame.caption:SetWidth(WIDTH - 2 * T.SPACE.pad)
  addList()
  addButtons()
end

-- Opens the wizard with the weights this profile uses now.
function WZ.Open()
  if not UP.settings then return ns.Chat("Gear upgrades is switched off: turn it on under Modules first.") end
  if not frame then build() end
  loadWeights()
  refresh()
  frame:Show()
end
