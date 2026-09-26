-- Action bars: up to eight bars of secure action buttons in the theme.
-- Bar 1 pages like the default main bar (stances, vehicles, bonus bars,
-- Shift+number pages) through a secure state driver, so paging works in
-- combat. The default key bindings (ACTIONBUTTON1, MULTIACTIONBAR1BUTTON1,
-- ...) are pointed at these buttons, so your keys keep working.
--
-- Values the client may hide (Midnight secrets), like cooldown times, are
-- handed straight to the widgets and never compared or computed with.

local ADDON, ns = ...

local T = ns.Theme

local AB = ns.Module("ActionBars", {
  defaults = {
    hideBlizzard = true,
    lockButtons = true,
    rangeTint = true,
    size = 36,
    spacing = 4,
    bars = {
      { enabled = true, buttons = 12, perRow = 12 },
      { enabled = true, buttons = 12, perRow = 12 },
      { enabled = true, buttons = 12, perRow = 12 },
      { enabled = true, buttons = 12, perRow = 1 },
      { enabled = true, buttons = 12, perRow = 1 },
      { enabled = false, buttons = 12, perRow = 12 },
      { enabled = false, buttons = 12, perRow = 12 },
      { enabled = false, buttons = 12, perRow = 12 },
    },
  },
})

-- Per bar: first action slot (bar 1 is paged instead), key binding prefix, default point.
local BARS = {
  { slot = 1, bind = "ACTIONBUTTON", point = { "BOTTOM", "BOTTOM", 0, 40 } },
  { slot = 61, bind = "MULTIACTIONBAR1BUTTON", point = { "BOTTOM", "BOTTOM", 0, 82 } },
  { slot = 49, bind = "MULTIACTIONBAR2BUTTON", point = { "BOTTOM", "BOTTOM", 0, 124 } },
  { slot = 25, bind = "MULTIACTIONBAR3BUTTON", point = { "RIGHT", "RIGHT", -4, 0 } },
  { slot = 37, bind = "MULTIACTIONBAR4BUTTON", point = { "RIGHT", "RIGHT", -46, 0 } },
  { slot = 145, bind = "MULTIACTIONBAR5BUTTON", point = { "BOTTOM", "BOTTOM", 0, 166 } },
  { slot = 157, bind = "MULTIACTIONBAR6BUTTON", point = { "BOTTOM", "BOTTOM", 0, 208 } },
  { slot = 169, bind = "MULTIACTIONBAR7BUTTON", point = { "BOTTOM", "BOTTOM", 0, 250 } },
}

-- Bar 1's page for each state: vehicle/possess, override, shapeshift,
-- dragonriding, class bonus bars (stances, stealth, forms), then Shift+number pages.
AB.PAGE_DRIVER = "[vehicleui][possessbar] 12; [overridebar] 14; [shapeshift] 13; [bonusbar:5] 11; "
  .. "[bonusbar:1] 7; [bonusbar:2] 8; [bonusbar:3] 9; [bonusbar:4] 10; "
  .. "[bar:2] 2; [bar:3] 3; [bar:4] 4; [bar:5] 5; [bar:6] 6; 1"

-- Runs in the secure environment when the page changes: re-points each button.
AB.ON_PAGE = [[
  self:SetAttribute("page", newstate)
  for _, button in ipairs(newtable(self:GetChildren())) do
    local index = button:GetAttribute("index")
    if index then
      button:SetAttribute("action", (newstate - 1) * 12 + index)
    end
  end
]]

-- The default action bar frames this module replaces (only those this client has).
local BLIZZARD_BARS = {
  "MainMenuBar", "MainActionBar", "MultiBarBottomLeft", "MultiBarBottomRight",
  "MultiBarRight", "MultiBarLeft", "MultiBar5", "MultiBar6", "MultiBar7",
}

-- Short key names for the hotkey text.
local KEY_SHORT = {
  { "SHIFT%-", "S" }, { "CTRL%-", "C" }, { "ALT%-", "A" }, { "META%-", "M" },
  { "MOUSEWHEELUP", "WU" }, { "MOUSEWHEELDOWN", "WD" }, { "BUTTON", "M" },
  { "NUMPAD", "N" }, { "SPACE", "Sp" },
}

AB.buttons = {}
AB.bars = {}

-- Client API ----------------------------------------------------------------------------

-- The client's action function `name`: C_ActionBar's when it has one, else the global.
local function api(name)
  local fn = C_ActionBar and C_ActionBar[name]
  if type(fn) == "function" then
    return fn
  end
  return _G[name]
end

-- Calls an action API if the client has it; nil otherwise.
local function call(name, ...)
  local fn = api(name)
  if type(fn) == "function" then
    return fn(...)
  end
  return nil
end

-- A key binding shortened for the hotkey text ("SHIFT-1" -> "S1").
function AB.ShortKey(key)
  if type(key) ~= "string" then
    return ""
  end
  for _, pair in ipairs(KEY_SHORT) do
    key = key:gsub(pair[1], pair[2])
  end
  return key
end

-- Updating a button ----------------------------------------------------------------------

-- Icon, or an empty slot when there is no action.
local function updateIcon(b)
  local texture = call("GetActionTexture", b.action)
  b.icon:SetTexture(texture)
  b.icon:SetShown(ns.IsSecret(texture) or texture ~= nil)
end

-- Charges or item count, shown only when it is a plain number above 1.
local function updateCount(b)
  local count = ns.PlainNumber(call("GetActionCount", b.action))
  b.count:SetText(count and count > 1 and tostring(count) or "")
end

-- The cooldown sweep. A duration object (Midnight) goes to the widget as is;
-- otherwise start and duration are passed through without being inspected
-- (a failed call just leaves the sweep as it was).
local function updateCooldown(b)
  local duration = call("GetActionCooldownDuration", b.action)
  if duration ~= nil and b.cooldown.SetCooldownFromDurationObject then
    return pcall(b.cooldown.SetCooldownFromDurationObject, b.cooldown, duration)
  end
  local start, length = call("GetActionCooldown", b.action)
  if type(start) == "table" and not ns.IsSecret(start) then
    start, length = start.startTime, start.duration
  end
  pcall(b.cooldown.SetCooldown, b.cooldown, start, length)
end

-- Icon tints, by state. Out of range wins over the others.
local TINT = {
  range = { 0.9, 0.3, 0.3 },
  power = { 0.4, 0.5, 1 },
  unusable = { 0.4, 0.4, 0.4 },
  ok = { 1, 1, 1 },
}

-- Tints the icon for the button's range and usable state.
local function paintIcon(b)
  local tint = (b.outOfRange and AB.settings.rangeTint) and TINT.range or TINT[b.usable or "ok"]
  b.icon:SetVertexColor(tint[1], tint[2], tint[3])
end

-- "ok", "power" (not enough power) or "unusable". Secret answers count as usable.
local function usableState(slot)
  local usable, noPower = call("IsUsableAction", slot)
  if ns.IsSecret(usable) or usable then
    return "ok"
  end
  return (noPower and not ns.IsSecret(noPower)) and "power" or "unusable"
end

-- Dims an action that can't be used now; blue when it's for lack of power.
local function updateUsable(b)
  b.usable = usableState(b.action)
  paintIcon(b)
end

-- Range, from the client's range events where it has them (see the
-- Range section below), else asked directly: red only for a plain "out of range".
local function updateRange(b)
  local inRange = call("IsActionInRange", b.action)
  b.outOfRange = not ns.IsSecret(inRange) and inRange == false
  paintIcon(b)
end

-- True for a plain true (a secret counts as false).
local function isTrue(value)
  return not ns.IsSecret(value) and value == true
end

-- Highlights the action while it is current (casting, auto-attack...).
local function updateChecked(b)
  b:SetChecked(isTrue(call("IsCurrentAction", b.action)) or isTrue(call("IsAutoRepeatAction", b.action)))
end

-- The hotkey text from the binding this button answers to.
local function updateHotkey(b)
  local key = GetBindingKey and GetBindingKey(b.binding)
  b.hotkey:SetText(AB.ShortKey(key))
end

-- Everything on a button, for its current action slot.
function AB.UpdateButton(b)
  b.action = b:GetAttribute("action")
  updateIcon(b)
  updateCount(b)
  updateCooldown(b)
  updateUsable(b)
  updateChecked(b)
  updateHotkey(b)
  AB.WatchRange(b)
end

-- Runs fn on every button.
local function each(fn)
  for _, b in ipairs(AB.buttons) do
    fn(b)
  end
end

-- Building ------------------------------------------------------------------------------

-- Drag an action off the button (Shift needed while buttons are locked).
local function onDragStart(b)
  if not AB.settings.lockButtons or (IsShiftKeyDown and IsShiftKeyDown()) then
    call("PickupAction", b.action)
    AB.UpdateButton(b)
  end
end

-- Drop what's on the cursor onto the button.
local function onReceiveDrag(b)
  call("PlaceAction", b.action)
  AB.UpdateButton(b)
end

-- The secure page driver for bar 1 re-points buttons; refresh when it does.
local function onAttributeChanged(b, name)
  if name == "action" then
    AB.UpdateButton(b)
  end
end

-- The icon, inset 1 px inside the border and cropped past the baked-in edge.
local function addIcon(b)
  b.icon = b:CreateTexture(nil, "ARTWORK")
  b.icon:SetPoint("TOPLEFT", 1, -1)
  b.icon:SetPoint("BOTTOMRIGHT", -1, 1)
  b.icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
end

-- The count (bottom right, white) and hotkey (top right, light gray) texts.
local function addTexts(b)
  b.count = T.SetFont(b:CreateFontString(nil, "OVERLAY"), 11)
  b.count:SetPoint("BOTTOMRIGHT", -2, 2)
  b.count:SetTextColor(1, 1, 1)
  b.hotkey = T.SetFont(b:CreateFontString(nil, "OVERLAY"), 10)
  b.hotkey:SetPoint("TOPRIGHT", -2, -2)
  b.hotkey:SetTextColor(0.85, 0.85, 0.85)
end

-- The icon, count, hotkey, cooldown and checked highlight on a button.
local function addRegions(b)
  addIcon(b)
  addTexts(b)
  b.cooldown = CreateFrame("Cooldown", nil, b, "CooldownFrameTemplate")
  b.cooldown:SetAllPoints(b.icon)
  b:SetCheckedTexture(T.WHITE)
  b:GetCheckedTexture():SetVertexColor(1, 1, 1, 0.25)
end

-- Secure attributes and scripts: click to use, drag to move actions.
local function wireButton(b, action, index)
  b:SetAttribute("type", "action")
  b:SetAttribute("action", action)
  b:SetAttribute("index", index)
  b:RegisterForClicks("AnyUp", "AnyDown")
  b:RegisterForDrag("LeftButton", "RightButton")
  b:SetScript("OnDragStart", onDragStart)
  b:SetScript("OnReceiveDrag", onReceiveDrag)
  b:SetScript("OnAttributeChanged", onAttributeChanged)
end

-- One secure action button on a bar.
local function createButton(bar, n, index, def)
  local name = string.format("ForeverUI_Bar%dButton%d", n, index)
  local b = CreateFrame("CheckButton", name, bar, "SecureActionButtonTemplate")
  b.binding = def.bind .. index
  b:SetSize(AB.settings.size, AB.settings.size)
  T.Button(b)
  addRegions(b)
  wireButton(b, def.slot + index - 1, index)
  AB.buttons[#AB.buttons + 1] = b
  return b
end

-- Places button i in a grid of perRow columns.
local function layoutButton(b, i, perRow)
  local step = AB.settings.size + AB.settings.spacing
  local col, row = (i - 1) % perRow, math.floor((i - 1) / perRow)
  b:ClearAllPoints()
  b:SetPoint("TOPLEFT", col * step, -row * step)
end

-- Sizes a bar to fit its buttons.
local function sizeBar(bar, count, perRow)
  local step = AB.settings.size + AB.settings.spacing
  local cols = math.min(count, perRow)
  local rows = math.ceil(count / perRow)
  bar:SetSize(cols * step - AB.settings.spacing, rows * step - AB.settings.spacing)
end

-- Bar 1 pages through a secure state driver.
local function addPaging(bar)
  bar:SetAttribute("_onstate-page", AB.ON_PAGE)
  RegisterStateDriver(bar, "page", AB.PAGE_DRIVER)
end

-- One bar: a secure header holding its buttons, movable in unlock mode.
local function createBar(n, def, settings)
  local bar = CreateFrame("Frame", "ForeverUI_Bar" .. n, UIParent, "SecureHandlerStateTemplate")
  for i = 1, settings.buttons do
    layoutButton(createButton(bar, n, i, def), i, settings.perRow)
  end
  sizeBar(bar, settings.buttons, settings.perRow)
  if n == 1 then addPaging(bar) end
  ns.Mover(bar, "bar" .. n, "Action bar " .. n, def.point)
  AB.bars[n] = bar
  return bar
end

-- Key bindings ------------------------------------------------------------------------

local bindingOwner

-- Points every default action binding at the matching ForeverUI button.
-- Override bindings are cleared and rebuilt; protected, so out of combat.
function AB.ApplyBindings()
  bindingOwner = bindingOwner or CreateFrame("Frame")
  ClearOverrideBindings(bindingOwner)
  for _, b in ipairs(AB.buttons) do
    for _, key in ipairs({ GetBindingKey(b.binding) }) do
      SetOverrideBindingClick(bindingOwner, false, key, b:GetName(), "LeftButton")
    end
  end
  each(updateHotkey)
end

-- Blizzard bars ------------------------------------------------------------------------

local hiddenParent

-- Hides a default bar for good by parenting it to a hidden frame.
local function hideBlizzard(name)
  local f = _G[name]
  if type(f) ~= "table" or not f.SetParent then
    return
  end
  hiddenParent = hiddenParent or CreateFrame("Frame")
  hiddenParent:Hide()
  f:SetParent(hiddenParent)
end

-- Events ------------------------------------------------------------------------------

-- Refreshes buttons showing a given action slot (or all with no slot).
local function onSlotChanged(_, slot)
  for _, b in ipairs(AB.buttons) do
    if slot == nil or slot == 0 or b.action == slot then
      AB.UpdateButton(b)
    end
  end
end

-- Range ------------------------------------------------------------------------------
-- Clients with C_ActionBar.EnableActionRangeCheck push range changes as
-- ACTION_RANGE_CHECK_UPDATE; older ones are asked five times a second.

-- True when the client pushes range changes for action slots.
local function rangeEvents()
  return C_ActionBar and type(C_ActionBar.EnableActionRangeCheck) == "function"
end

-- Asks the client to report range changes for the button's slot (or checks range now).
function AB.WatchRange(b)
  if rangeEvents() then
    pcall(C_ActionBar.EnableActionRangeCheck, b.action, true)
  else
    updateRange(b)
  end
end

-- ACTION_RANGE_CHECK_UPDATE: red when the slot checks range and is out of it.
local function onRangeUpdate(_, slot, inRange, checksRange)
  for _, b in ipairs(AB.buttons) do
    if b.action == slot then
      b.outOfRange = not ns.IsSecret(checksRange) and checksRange == true and not ns.IsSecret(inRange) and inRange == false
      paintIcon(b)
    end
  end
end

-- Without range events: re-check every button five times a second.
local function pollRange()
  local elapsed = 0
  local ticker = CreateFrame("Frame")
  ticker:SetScript("OnUpdate", function(_, dt)
    elapsed = elapsed + dt
    if elapsed >= 0.2 then
      elapsed = 0
      each(updateRange)
    end
  end)
end

-- Event -> what it refreshes.
local EVENTS = {
  -- One handler per event; most refresh one part of every button.
  PLAYER_ENTERING_WORLD = function() each(AB.UpdateButton) end,
  ACTIONBAR_SLOT_CHANGED = onSlotChanged,
  ACTIONBAR_UPDATE_COOLDOWN = function() each(updateCooldown) end,
  SPELL_UPDATE_COOLDOWN = function() each(updateCooldown) end,
  ACTIONBAR_UPDATE_USABLE = function() each(updateUsable) end,
  SPELL_UPDATE_USABLE = function() each(updateUsable) end,
  ACTIONBAR_UPDATE_STATE = function() each(updateChecked) end,
  UPDATE_BINDINGS = function() ns.OutOfCombat(AB.ApplyBindings) end,
  ACTION_RANGE_CHECK_UPDATE = onRangeUpdate,
}

-- Setup ---------------------------------------------------------------------------------

-- Builds every enabled bar and takes over the default bindings.
local function build(settings)
  for n, def in ipairs(BARS) do
    local bar = settings.bars[n]
    if bar and bar.enabled then createBar(n, def, bar) end
  end
  if settings.hideBlizzard then
    for _, name in ipairs(BLIZZARD_BARS) do hideBlizzard(name) end
  end
  AB.ApplyBindings()
  each(AB.UpdateButton)
end

-- Module entry point (Core/Modules.lua): build out of combat, then listen.
function AB.Enable(settings)
  AB.settings = settings
  ns.OutOfCombat(function() build(settings) end)
  for event, fn in pairs(EVENTS) do
    ns.On(event, fn)
  end
  if settings.rangeTint and not rangeEvents() then pollRange() end
end
