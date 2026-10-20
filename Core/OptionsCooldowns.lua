-- The Cooldowns page (/vg) and its setup wizard (Set up cooldowns on the page,
-- /vg cooldowns setup): every setting of the game's Cooldown Manager and of
-- Vanguard's additions to it (the cooldown gaps row, the buff glow). The page
-- and the wizard draw the same rows, so a change in one shows in the other.
-- Core/Options.lua has the helpers and the page list.

local ADDON, ns = ...

local T, W = ns.Theme, ns.Widgets

local O = ns.Options
local moduleSettings, setting, reloadSetting, liveSetting, check, append = O.ModuleSettings, O.Setting, O.ReloadSetting, O.LiveSetting, O.Check, O.Append

local WZ = {}
O.CooldownWizard = WZ

-- The share of an aura's time left under which the Cooldown Manager's icon glows.
local GLOW_PERCENT = { min = 10, max = 60, step = 5, format = function(v) return string.format("%d%%", v) end }

-- get/set for showing the game's Cooldown Manager, which turns it on or off at once.
local function cooldownManagerSetting()
  return liveSetting("GameTools", "essential", function() ns.GetModule("GameTools").SetCooldownManager(moduleSettings("GameTools").essential) end)
end

-- Puts the Cooldown Manager glows right after a change of their switch or share.
local function applyGlow()
  ns.GetModule("CooldownGlow").Apply()
end

-- A row with its tooltip (the detail the short caption leaves out); returns the row.
local function tip(row, text)
  row.tip = text
  return row
end

-- The game's manager switches, by name.
local function managerRows()
  return {
    show = tip(check("Show the game's manager", cooldownManagerSetting()), "Turns the game's Cooldown Manager on (off again when unticked). Its essential row sits between your frames; /vg unlock moves it."),
    look = tip(check("Vanguard look (reload)", reloadSetting("GameTools", "cooldowns")), "Square icons in thin borders, the theme font and timer font on the game's Cooldown Manager."),
  }
end

-- The gaps row switches, by name.
local function gapRows()
  return {
    gaps = tip(check("Gaps row (reload)", reloadSetting("CooldownGaps", "on")), "A row of icons for what the game's manager misses: on-use trinkets, items and spells you choose (in the list below), pet abilities and totems."),
    tracked = tip(check("Add the manager's cooldowns (reload)", reloadSetting("CooldownGaps", "tracked")), "Also draws the spells the manager tracks in its essential and utility rows as Vanguard icons in the gaps row."),
  }
end

-- The glow switch and share (Modules/CooldownGlow.lua), applied at once.
local function glowRows()
  return {
    glow = tip(check("Glow a buff near its end", liveSetting("CooldownGlow", "glow", applyGlow)), "Glows a Cooldown Manager buff in its last part, where the game's own flag is missing."),
    percent = tip({ "slider", "Glow when this much is left", GLOW_PERCENT, liveSetting("CooldownGlow", "percent", applyGlow) }, "The share of the buff's time left under which its icon glows."),
  }
end

-- The key text switch (Modules/CooldownKeys.lua), applied at once.
local function keyRows()
  return {
    keys = tip(check("Key text on the manager's icons", liveSetting("CooldownKeys", "keys", function() ns.GetModule("CooldownKeys").Refresh() end)), "Shows the key you press for each spell in the manager's essential and utility rows, read from Vanguard's action bars. An icon whose spell isn't on a Vanguard bar shows none."),
  }
end

-- Every row by name: the page and the wizard draw these.
local function defs()
  local rows = managerRows()
  for _, group in ipairs({ gapRows(), glowRows(), keyRows() }) do
    for key, row in pairs(group) do rows[key] = row end
  end
  return rows
end

-- The page: the setup button, then the manager, the gaps row with its chosen items and spells
-- (Modules/CooldownGaps.lua draws that list), the glow and the key text, each in its own card.
local function pageRows()
  local d = defs()
  local top = { { "button", "Set up cooldowns", function() WZ.Open() end }, { "header", "The game's manager" }, d.show, d.look, { "header", "Gaps row" }, d.gaps, d.tracked }
  local rest = { { "header", "Buff glow" }, d.glow, d.percent, { "header", "Key text" }, d.keys }
  return append(append(top, ns.GetModule("CooldownGaps").CardRows()), rest)
end

O.AddPage({ key = "cooldowns", title = "Cooldowns", icon = "Legacy", order = 83.5, rows = pageRows })

-- The wizard ----------------------------------------------------------------------------

WZ.WIDTH, WZ.HEIGHT, WZ.PAD, WZ.ROW = 400, 280, T.SPACE.pad, T.ROW.height
-- Where the step's note starts (under the caption), and where its switches start under that.
WZ.TOP = ns.DIALOG.head + 16
WZ.BODY = WZ.TOP + 64
-- The steps in order: caption name, the note under it, and the rows each shows (names from defs).
WZ.STEPS = {
  { name = "Show it", note = "The game's Cooldown Manager keeps its essential row between your frames. Show it, and choose how it looks.", keys = { "show", "look" } },
  { name = "Gaps row", note = "A row of icons for what the manager misses. Choose its items and spells on the Cooldowns page.", keys = { "gaps", "tracked" } },
  { name = "Buff glow", note = "Glow a manager buff when it is nearly over.", keys = { "glow", "percent" } },
}

-- Builds one row's widget on the window (a switch or a slider), hidden until its step shows.
local function widget(f, row)
  local w
  if row[1] == "slider" then
    w = W.Slider(f, row[2], row[3], row[4], row[5], WZ.WIDTH - 2 * WZ.PAD)
  else
    w = W.Check(f, row[2], row[3], row[4], WZ.WIDTH - 2 * WZ.PAD)
  end
  w:Hide()
  return w
end

-- Shows step n: its note and widgets stacked from the body, the caption and the buttons that fit.
function WZ.Show(n)
  local f, step = WZ.frame, WZ.STEPS[n]
  WZ.step = n
  for _, ws in ipairs(f.steps) do for _, w in ipairs(ws) do w:Hide() end end
  for i, w in ipairs(f.steps[n]) do
    w:ClearAllPoints()
    w:SetPoint("TOPLEFT", WZ.PAD, -WZ.BODY - (i - 1) * WZ.ROW)
    w:Show()
    w:Refresh()
  end
  WZ.Decorate(f, n, step)
end

-- The note, the caption and the buttons for step n.
function WZ.Decorate(f, n, step)
  f.note:SetText(step.note)
  f.caption:SetText(string.format("Step %d of %d · %s", n, #WZ.STEPS, step.name))
  f.back:SetShown(n > 1)
  f.next.text:SetText(n == #WZ.STEPS and "Done" or "Next")
end

-- Next: the following step; on the last it is Done and closes the window.
function WZ.Next()
  if WZ.step >= #WZ.STEPS then return WZ.frame:Hide() end
  WZ.Show(WZ.step + 1)
end

-- Back one step (never before the first).
function WZ.Back()
  WZ.Show(math.max(WZ.step - 1, 1))
end

-- The footer: Back and Next or Done (the window applies as you go, so it ends in Done).
local function footer(f)
  f.next = W.Primary(f, "Next", function() WZ.Next() end)
  f.next:SetPoint("BOTTOMRIGHT", -WZ.PAD, WZ.PAD)
  f.back = W.Button(f, "Back", function() WZ.Back() end)
  f.back:SetPoint("RIGHT", f.next, "LEFT", -T.SPACE.gap, 0)
end

-- The title, the step caption (a note) and the step's note text.
local function labels(f)
  f.title:SetText("Set up cooldowns")
  f.caption = T.Text(f:CreateFontString(nil, "OVERLAY"), "small", "muted")
  f.caption:SetPoint("TOPLEFT", WZ.PAD, -ns.DIALOG.head)
  f.note = T.Text(f:CreateFontString(nil, "OVERLAY"), "label")
  f.note:SetPoint("TOPLEFT", WZ.PAD, -WZ.TOP)
  f.note:SetWidth(WZ.WIDTH - 2 * WZ.PAD)
  f.note:SetJustifyH("LEFT")
end

-- Builds the window once: a dialog (its X and Escape close it) with each step's widgets.
local function build()
  local f = ns.Dialog("Vanguard_CooldownWizard", WZ.WIDTH, WZ.HEIGHT)
  local d = defs()
  labels(f)
  f.steps = {}
  for i, step in ipairs(WZ.STEPS) do
    f.steps[i] = {}
    for j, key in ipairs(step.keys) do f.steps[i][j] = widget(f, d[key]) end
  end
  footer(f)
  return f
end

-- Opens the window on its first step; in combat it waits (the manager's switch is not for a fight).
function WZ.Open()
  if ns.InCombat() then return ns.OutOfCombat(WZ.Open, "cooldown wizard") end
  WZ.frame = WZ.frame or build()
  WZ.Show(1)
  WZ.frame:Show()
end
