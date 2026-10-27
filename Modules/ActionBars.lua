-- Action bars: up to eight bars of secure action buttons in the theme.
-- Bar 1 pages like the default main bar (stances, vehicles, bonus bars,
-- Shift+number pages) through a secure state driver, so paging works in
-- combat. The default key bindings (ACTIONBUTTON1, MULTIACTIONBAR1BUTTON1,
-- ...) are pointed at these buttons, so your keys keep working.
--
-- Values the client may hide (Midnight secrets), like cooldown times, are
-- handed straight to the widgets and never compared or computed with.
--
-- Each bar has its own button count, row length, button size and
-- visibility; empty slots stay invisible unless you are dragging a spell
-- or item (Modules/ActionBarLayout.lua). The right-edge bars start off.
-- With Masque loaded, Masque skins the buttons instead (Core/Masque.lua).

local ADDON, ns = ...

local T = ns.Theme
local L = ns.L

local AB = ns.Module("ActionBars", {
  defaults = {
    hideBlizzard = true,
    lockButtons = true,
    backing = "auto",
    rangeTint = true,
    size = 38,
    spacing = 2,
    -- Per bar: on/off, buttons shown, buttons per row, and visibility
    -- (always, mouseover, combat or hidden). A bar's own `size` wins over
    -- the shared size above once the player sets one. The right-edge bars
    -- (4 and 5) start off and show on mouseover when turned on (profiles
-- that already had them on keep Always: see keepOldRightBars).
    bars = {
      { enabled = true, buttons = 12, perRow = 12, visibility = "always" },
      { enabled = true, buttons = 12, perRow = 12, visibility = "always" },
      { enabled = true, buttons = 12, perRow = 12, visibility = "always" },
      { enabled = false, buttons = 12, perRow = 1, visibility = "mouseover" },
      { enabled = false, buttons = 12, perRow = 1, visibility = "mouseover" },
      { enabled = false, buttons = 12, perRow = 12, visibility = "always" },
      { enabled = false, buttons = 12, perRow = 12, visibility = "always" },
      { enabled = false, buttons = 12, perRow = 12, visibility = "always" },
    },
  },
})

-- Per bar: first action slot (bar 1 is paged instead), key binding prefix, and
-- either a default point or `stack` (stacked at the bottom center; see StackPoint).
local BARS = {
  { slot = 1, bind = "ACTIONBUTTON", stack = true },
  { slot = 61, bind = "MULTIACTIONBAR1BUTTON", stack = true },
  { slot = 49, bind = "MULTIACTIONBAR2BUTTON", stack = true },
  { slot = 25, bind = "MULTIACTIONBAR3BUTTON", point = { "RIGHT", "RIGHT", -4, 0 } },
  { slot = 37, bind = "MULTIACTIONBAR4BUTTON", point = { "RIGHT", "RIGHT", -46, 0 } },
  { slot = 145, bind = "MULTIACTIONBAR5BUTTON", stack = true },
  { slot = 157, bind = "MULTIACTIONBAR6BUTTON", stack = true },
  { slot = 169, bind = "MULTIACTIONBAR7BUTTON", stack = true },
}

-- The bottom stack starts this far up (over the data bars); the bars touch (BAR_GAP is 0, kept as the one
-- place to space the stack again).
local STACK_BASE, BAR_GAP = 24, 0

-- The page the game gives a special bar state, from the C_ActionBar getter `getter`; `fallback` (the
-- client's ActionBarType value) when the client has no such getter or it answers nothing plain.
function AB.StatePage(getter, fallback)
  local fn = C_ActionBar and C_ActionBar[getter]
  local page = type(fn) == "function" and ns.PlainNumber(fn())
  return page and page > 0 and math.floor(page) or fallback
end

-- The vehicle, override and temporary shapeshift pages on the 12.x engine (pages 13 to 15 are bars 6 to 8),
-- used when the client does not name them (AB.StatePage).
AB.FALLBACK_PAGES = { vehicle = 16, override = 18, shapeshift = 17 }

-- Bar 1's page for each state: vehicle/possess, override, shapeshift, then
-- Shift+number pages, then (on page 1 only, as the game's main bar does)
-- dragonriding and the class bonus bars (stances, stealth, forms). The vehicle, override and temporary
-- shapeshift pages are the game's own.
function AB.BuildPageDriver()
  local fallback = AB.FALLBACK_PAGES
  return "[vehicleui][possessbar] " .. AB.StatePage("GetVehicleBarIndex", fallback.vehicle)
    .. "; [overridebar] " .. AB.StatePage("GetOverrideBarIndex", fallback.override)
    .. "; [shapeshift] " .. AB.StatePage("GetTempShapeshiftBarIndex", fallback.shapeshift) .. "; "
    .. "[bar:2] 2; [bar:3] 3; [bar:4] 4; [bar:5] 5; [bar:6] 6; "
    .. "[bonusbar:5] 11; [bonusbar:1] 7; [bonusbar:2] 8; [bonusbar:3] 9; [bonusbar:4] 10; 1"
end
AB.PAGE_DRIVER = AB.BuildPageDriver()

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
-- The game's action buttons on those bars, by name prefix (1 to 12 each), as
-- the client's ActionButtonUtil.ActionBarButtonNames lists them.
local BLIZZARD_BUTTONS = {
  "ActionButton", "MultiBarBottomLeftButton", "MultiBarBottomRightButton", "MultiBarLeftButton",
  "MultiBarRightButton", "MultiBar5Button", "MultiBar6Button", "MultiBar7Button",
}

-- Short names for the hotkey text: each modifier (Meta, the Mac's Command key, is "Cmd", since M is a mouse
-- button), a key by its whole name, and the numbered keys (BUTTON4 is M4, NUMPAD1 is N1); any other key as it is.
AB.KEY_SHORT = {
  mods = { SHIFT = "S", CTRL = "C", ALT = "A", META = "Cmd" },
  keys = {
    SPACE = "Sp", BACKSPACE = "Bs", MOUSEWHEELUP = "WU", MOUSEWHEELDOWN = "WD", CAPSLOCK = "Cap",
    PAGEUP = "PU", PAGEDOWN = "PD", INSERT = "Ins", DELETE = "Del", HOME = "Hm", END = "End",
    NUMPADPLUS = "N+", NUMPADMINUS = "N-", NUMPADMULTIPLY = "N*", NUMPADDIVIDE = "N/", NUMPADDECIMAL = "N.",
  },
  numbered = { { "^BUTTON(%d+)$", "M" }, { "^NUMPAD(%d+)$", "N" } },
}

AB.buttons = {}
AB.bars = {}
-- Where each stacked bar was last stacked (bar number -> its default y) and the stack's top then, so a
-- re-stack after a scale change moves only what the bars' new rounded heights moved (AB.RestackMoved).
AB.stacked, AB.stackedTop = {}, nil
-- The Masque group the action buttons are in, when Masque is loaded.
AB.MASQUE = "Action bars"

-- Whether bar n sits on the right edge of the screen (bars 4 and 5; the
-- stacked bottom bars have no fixed point).
function AB.RightEdge(n)
  local def = BARS[n]
  return def ~= nil and def.point ~= nil and def.point[1] == "RIGHT"
end

-- Profiles saved before bars had a visibility setting: a right-edge bar that
-- was already on keeps showing always. It is told apart by having no saved
-- visibility; a bar the player turns on later was saved with the default
-- (On mouseover) filled in, so it keeps that.
local function keepOldRightBars(saved)
  for n, barSettings in pairs(type(saved.bars) == "table" and saved.bars or {}) do
    if AB.RightEdge(n) and type(barSettings) == "table" and barSettings.enabled == true and barSettings.visibility == nil then
      barSettings.visibility = "always"
    end
  end
end
-- Profiles saved before the Centered layout hold the old button size (36) and
-- spacing (4) as values (ForeverUI 0.3.0 wrote every default in): once, put
-- them back to the new defaults, which match the data bars' new width.
local function centeredSpacing(saved)
  if (saved.layout or 0) >= 2 then return end
  if saved.size == 36 then saved.size = nil end
  if saved.spacing == 4 then saved.spacing = nil end
  saved.layout = 2
end

-- Every upgrade of saved action bar settings, oldest first.
local function migrate(saved)
  keepOldRightBars(saved)
  centeredSpacing(saved)
end
ns.Migrate("ActionBars", migrate)

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

-- One key's short name, without its modifiers ("BACKSPACE" -> "Bs", "BUTTON4" -> "M4", "Q" -> "Q").
local function shortKeyName(key)
  local short = AB.KEY_SHORT
  if short.keys[key] then return short.keys[key] end
  for _, numbered in ipairs(short.numbered) do
    local n = key:match(numbered[1])
    if n then return numbered[2] .. n end
  end
  return key
end

-- A key binding shortened for the hotkey text ("SHIFT-1" -> "S1", "CTRL-BUTTON4" -> "CM4"): the modifiers
-- at its front one by one, then the key by its whole name, so a key named inside another stays whole.
function AB.ShortKey(key)
  if type(key) ~= "string" then return "" end
  local names, mods, mod, rest = AB.KEY_SHORT.mods, "", key:match("^(%u+)%-(.+)$")
  while mod and names[mod] do
    mods, key = mods .. names[mod], rest
    mod, rest = key:match("^(%u+)%-(.+)$")
  end
  return mods .. shortKeyName(key)
end

-- Updating a button ----------------------------------------------------------------------

-- Icon, or an empty slot when there is no action (see AB.UpdateEmpty).
local function updateIcon(b)
  local texture = call("GetActionTexture", b.action)
  b.hasAction = ns.IsSecret(texture) or texture ~= nil
  b.icon:SetTexture(texture)
  b.icon:SetShown(b.hasAction)
  AB.UpdateEmpty(b)
end

-- Whether an action uses up something you carry (a reagent, a potion).
local function usesUp(action)
  for _, name in ipairs({ "IsConsumableAction", "IsStackableAction" }) do
    local v = call(name, action)
    if not ns.IsSecret(v) and v == true then return true end
  end
  return false
end

-- A slot's use count: C_ActionBar.GetActionUseCount, else the older global
-- (on Forever only loaded with the game's deprecation fallbacks).
local function useCount(slot)
  local fn = C_ActionBar and C_ActionBar.GetActionUseCount
  if type(fn) == "function" then return fn(slot) end
  return call("GetActionCount", slot)
end

-- Charges or item count: always for something that gets used up (so running
-- out shows 0, as the game's buttons do), otherwise only above 1. A hidden
-- count shows nothing.
local function updateCount(b)
  local count = ns.PlainNumber(useCount(b.action))
  local shown = count ~= nil and (count > 1 or usesUp(b.action))
  b.count:SetText(shown and tostring(count) or "")
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

-- Icon tint tokens, by state. Out of range wins over the others.
local TINT = { range = "outOfRange", power = "noPower", unusable = "unusable", ok = "white" }

-- Tints the icon for the button's range and usable state.
local function paintIcon(b)
  local tint = (b.outOfRange and AB.settings.rangeTint) and TINT.range or TINT[b.usable or "ok"]
  T.Tint(b.icon, tint)
end

-- "ok", "power" (not enough power) or "unusable". Secret answers count as usable.
local function usableState(slot)
  local usable, noPower = call("IsUsableAction", slot)
  if ns.IsSecret(usable) or usable then
    return "ok"
  end
  if not ns.IsSecret(noPower) and noPower then
    return "power"
  end
  return "unusable"
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

-- Shows the equipped-item ring (where Vanguard skins the button) while its action is an item you wear;
-- the client is asked only about a slot with an action, and a hidden answer counts as no.
local function updateEquipped(b)
  if not b.equipped then return end
  local on = b.hasAction and isTrue(call("IsEquippedAction", b.action))
  T.ShowInnerRing(b.equipped, b, "good", on)
end

-- The hotkey text from the binding this button answers to.
local function updateHotkey(b)
  local key = GetBindingKey and GetBindingKey(b.binding)
  b.hotkey:SetText(AB.ShortKey(key))
end

-- A button's action slot: on bar 1 without snippets, its ID on the page the
-- bar's driver last set; else the slot its action attribute names.
function AB.ActionSlot(b)
  local page = b.vgBar and b.vgBar.vgPaged and b.vgBar.vgPage
  if page then return (page - 1) * AB.MAX_BUTTONS + b:GetID() end
  return b:GetAttribute("action")
end

-- Everything on a button, for its current action slot.
function AB.UpdateButton(b)
  b.action = AB.ActionSlot(b)
  AB.UpdateGlow(b)
  updateIcon(b)
  updateCount(b)
  updateCooldown(b)
  updateUsable(b)
  updateChecked(b)
  updateEquipped(b)
  updateHotkey(b)
  AB.WatchRange(b)
end

-- Proc glow ----------------------------------------------------------------------------

-- The spell id on a button's action (nil for items, macros, empty or hidden).
function AB.ActionSpell(b)
  if type(GetActionInfo) ~= "function" or not b.action then return nil end
  local kind, id = GetActionInfo(b.action)
  if ns.IsSecret(kind) or ns.IsSecret(id) or kind ~= "spell" then return nil end
  return id
end

-- Whether the client says a spell is lit (proc'd) right now.
local function overlayed(spell)
  local overlayApi = _G.C_SpellActivationOverlay
  local check = type(overlayApi) == "table" and overlayApi.IsSpellOverlayed or _G.IsSpellOverlayed
  local lit = spell and type(check) == "function" and check(spell)
  return not ns.IsSecret(lit) and lit == true
end

-- Lights the accent glow while the button's spell is proc'd.
function AB.UpdateGlow(b)
  if b.glow then T.ShowGlow(b.glow, overlayed(AB.ActionSpell(b))) end
end

-- A proc started (on) or ended: light or clear every button with that spell.
local function onOverlay(on)
  return function(_, spell)
    for _, b in ipairs(AB.buttons) do
      if b.glow and not ns.IsSecret(spell) and AB.ActionSpell(b) == spell then T.ShowGlow(b.glow, on) end
    end
  end
end

-- Runs fn on every button.
local function each(fn)
  for _, b in ipairs(AB.buttons) do
    fn(b)
  end
end

-- Repaints every button's icon tint, for a change to "Red when out of range".
function AB.RepaintIcons()
  each(paintIcon)
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

-- The icon, one screen pixel inside the border and cropped past the baked-in edge.
local function addIcon(b)
  local px = T.Pixel(b)
  b.icon = b:CreateTexture(nil, "ARTWORK")
  b.icon:SetPoint("TOPLEFT", px, -px)
  b.icon:SetPoint("BOTTOMRIGHT", -px, px)
  T.Crop(b.icon)
end

-- The count (bottom right, white) and hotkey (top right, light gray, one line cut at the button's width) texts.
local function addTexts(b)
  b.count = T.Text(b:CreateFontString(nil, "OVERLAY"), "small")
  b.count:SetPoint("BOTTOMRIGHT", -2, 2)
  T.Color(b.count, "white")
  b.hotkey = T.Text(b:CreateFontString(nil, "OVERLAY"), "small")
  b.hotkey:SetPoint("TOPLEFT", 2, -2)
  b.hotkey:SetPoint("TOPRIGHT", -2, -2)
  b.hotkey:SetJustifyH("RIGHT")
  b.hotkey:SetWordWrap(false)
  T.Color(b.hotkey, "text2")
end

-- The client's cooldown numbers keep off the last second and a half.
local function skipShortCountdown(cd)
  if ns.Client.Has("cooldownMin") then cd:SetMinimumCountdownDuration(1500) end
end

-- A button under this many units wide gets the aura timers' small countdown font: the plain one is
-- wider than its icon with minute values.
AB.SMALL_BUTTON = 30

-- The client's cooldown numbers on a button in the theme's font (they show when the game's "Show numbers
-- for cooldowns" option is on), sized to the button: the small timer font on a small one.
function AB.ThemeCountdown(b, size)
  local fs = ns.Client.Has("countdownText") and b.cooldown:GetCountdownFontString()
  if fs then T.Text(fs, size < AB.SMALL_BUTTON and "auraTimerSmall" or "cooldown", "white") end
end

-- The icon, count, hotkey, cooldown and checked highlight on a button.
local function addRegions(b)
  addIcon(b)
  addTexts(b)
  b.cooldown = CreateFrame("Cooldown", nil, b, "CooldownFrameTemplate")
  b.cooldown:SetAllPoints(b.icon)
  skipShortCountdown(b.cooldown)
  b.glow = T.Glow(b, 6)
  b:SetCheckedTexture(T.WHITE)
  T.Tint(b:GetCheckedTexture(), "checked")
  if not ns.Masque.Group(AB.MASQUE) then b.equipped = T.InnerRing(b) end
end

-- The mouse came over a button: the tooltip of the action in the slot it shows
-- now (b.action follows bar 1's page, the action attribute may not), and the
-- client's UpdateTooltip hook refreshes it while it stays up. An empty slot shows none.
local function showTooltip(b)
  GameTooltip_SetDefaultAnchor(GameTooltip, b)
  if GameTooltip:SetAction(b.action) then
    b.UpdateTooltip = showTooltip
    GameTooltip:Show()
  else
    b.UpdateTooltip = nil
    GameTooltip:Hide()
  end
end

-- The mouse left a button: its tooltip goes.
local function hideTooltip(b)
  b.UpdateTooltip = nil
  GameTooltip:Hide()
end

-- Secure attributes: click to use the action in a slot, and, as the game's own
-- buttons do, cast on yourself, your focus or the unit under the mouse while
-- the self-cast, focus-cast or mouseover-cast modifier is held.
local function wireAttributes(b, action, index)
  b:SetAttribute("type", "action")
  b:SetAttribute("action", action)
  b:SetAttribute("index", index)
  b:SetAttribute("checkselfcast", true)
  b:SetAttribute("checkfocuscast", true)
  b:SetAttribute("checkmouseovercast", true)
end

-- Scripts: click on either edge of the press, drag to move actions, the tooltip.
local function wireScripts(b)
  b:RegisterForClicks("AnyUp", "AnyDown")
  b:RegisterForDrag("LeftButton", "RightButton")
  b:SetScript("OnDragStart", onDragStart)
  b:SetScript("OnReceiveDrag", onReceiveDrag)
  b:SetScript("OnAttributeChanged", onAttributeChanged)
  b:SetScript("OnEnter", showTooltip)
  b:SetScript("OnLeave", hideTooltip)
end

-- Secure attributes and scripts of a button.
local function wireButton(b, action, index)
  wireAttributes(b, action, index)
  wireScripts(b)
end

-- Hands a button and its regions to Masque, when it is loaded.
local function addToMasque(b)
  local regions = { Icon = b.icon, Cooldown = b.cooldown, Count = b.count, HotKey = b.hotkey, Checked = b:GetCheckedTexture() }
  ns.Masque.Add(AB.MASQUE, b, regions, "Action")
end

-- One secure action button on a bar (sized and placed by AB.LayoutBar), in
-- Vanguard's button skin, or Masque's when it is loaded.
local function createButton(bar, n, index, def)
  local name = string.format("Vanguard_Bar%dButton%d", n, index)
  local b = CreateFrame("CheckButton", name, bar, "SecureActionButtonTemplate")
  b.binding, b.vgBar = def.bind .. index, bar
  if not ns.Masque.Group(AB.MASQUE) then T.Button(b) end
  addRegions(b)
  addToMasque(b)
  wireButton(b, def.slot + index - 1, index)
  AB.buttons[#AB.buttons + 1] = b
  return b
end

-- Height of bar k's button grid in UIParent's units: its rows of its own button size (else the shared
-- size), the size and the gap rounded to whole screen pixels as AB.LayoutBar sizes the bar (against
-- the built bar, or UIParent before it is built), times the scale you gave the bar (ns.MoverLook), so
-- the bar stacked above it starts on its top edge at any UI scale and at any scale of its own.
local function barHeight(settings, barSettings, k)
  local f = AB.bars[k] or UIParent
  local size, gap = T.PixelRound(f, barSettings.size or settings.size), T.PixelRound(f, settings.spacing)
  local scale = ns.MoverLook("bar" .. k)
  return (math.ceil(barSettings.buttons / barSettings.perRow) * (size + gap) - gap) * scale
end

-- Width of bar k's button grid in UIParent's units, rounded and scaled as barHeight is: its columns
-- (the buttons it has, at most its buttons per row) of its own button size.
local function barWidth(settings, barSettings, k)
  local f = AB.bars[k] or UIParent
  local size, gap = T.PixelRound(f, barSettings.size or settings.size), T.PixelRound(f, settings.spacing)
  local columns = math.min(barSettings.buttons, barSettings.perRow)
  return (columns * (size + gap) - gap) * ns.MoverLook("bar" .. k)
end

-- Half of bar 1's width in UIParent's units (0 while bar 1 is off or the module is): the vehicle exit button
-- sits beside it.
function AB.Bar1HalfWidth()
  local bar1 = AB.settings and AB.settings.bars[1]
  if not (bar1 and bar1.enabled) then return 0 end
  return barWidth(AB.settings, bar1, 1) / 2
end

-- The width of the bottom stack's first bar in UIParent's units (0 before the module has its
-- settings), for frames that keep clear of it.
---@return number
function AB.StackWidth()
  local bar1 = AB.settings and AB.settings.bars[1]
  return bar1 and barWidth(AB.settings, bar1, 1) or 0
end

-- Moves the vehicle exit button's default spot to clear bar 1's current width.
local function fitVehicleExit()
  ns.GetModule("SpecialBars").FitExit(AB.Bar1HalfWidth())
end

-- The room between the right-edge bars and the screen's edge, and between the two.
AB.RIGHT_GAP = 4

-- The default point of a bar that is not in the bottom stack: its own spot, except bar 5, which sits
-- one bar 4's width (and a gap) inside bar 4 while that bar is on, whatever its button size or rows.
local function rightPoint(n, settings)
  local bar4 = settings.bars[4]
  if n ~= 5 or not (bar4 and bar4.enabled) then return BARS[n].point end
  return { "RIGHT", "RIGHT", -(2 * AB.RIGHT_GAP + barWidth(settings, bar4, 4)), 0 }
end

-- Default point for stacked bar n: every enabled stacked bar with a higher
-- number sits below it, so bar 1 is always the top row.
function AB.StackPoint(n, settings)
  local y = STACK_BASE
  for k = #BARS, n + 1, -1 do
    local barSettings = settings.bars[k]
    if BARS[k].stack and barSettings and barSettings.enabled then
      y = y + barHeight(settings, barSettings, k) + BAR_GAP
    end
  end
  return { "BOTTOM", "BOTTOM", 0, y }
end

-- Where the bottom stack ends: the top edge of its highest bar (bar 1 while it is on), in units
-- up from the screen's bottom, or the stack's base with no stacked bar on.
---@param settings table the ActionBars settings
---@return number
function AB.StackTop(settings)
  return AB.StackPoint(0, settings)[4] - BAR_GAP
end

-- The coordinate that changes when a bar's default point does: a bottom bar's y, a right-edge bar's x.
local function moveKey(point)
  return point[1] == "RIGHT" and point[3] or point[4]
end

-- Bar n's default point now: its place in the bottom stack, or its spot on the right edge.
local function defaultPoint(n, settings)
  return BARS[n].stack and AB.StackPoint(n, settings) or rightPoint(n, settings)
end

-- Gives bar n its default point now, unless that is where it was last put; says whether it moved.
-- The bar moves there unless you dragged it somewhere (a saved position wins).
local function restackBar(n)
  local point = defaultPoint(n, AB.settings)
  if moveKey(point) == AB.stacked[n] then return false end
  AB.stacked[n] = moveKey(point)
  ns.SetMoverDefault("bar" .. n, point)
  return true
end

-- Re-stacks the bottom bars after a bar's buttons, rows or size changed: each stacked bar whose
-- default point moved gets it, and the cast bar follows the stack's top. Only call out of combat.
function AB.Restack()
  for n in pairs(AB.bars) do restackBar(n) end
  AB.stackedTop = AB.StackTop(AB.settings)
  ns.GetModule("CastBars").FitPlayer()
  fitVehicleExit()
end

-- Re-stacks after a scale change only what the bars' new rounded heights moved, the cast bar following
-- only when the stack's top did. Placing a frame (ns.SetMoverDefault) rounds every pixel-sized frame
-- again (T.Rescale), which runs T.OnScale's listeners, so a re-stack that placed something every time
-- would run this without end. Nothing to do while the module is off (no settings, no bars).
function AB.RestackMoved()
  if not AB.settings then return end
  for n in pairs(AB.bars) do restackBar(n) end
  fitVehicleExit()
  local top = AB.StackTop(AB.settings)
  if top == AB.stackedTop then return end
  AB.stackedTop = top
  ns.GetModule("CastBars").FitPlayer()
end

-- The bar's actionpage changed (bar 1 without snippets): its buttons show that page's slots.
function AB.OnBarPage(bar, name, value)
  if name ~= "actionpage" then return end
  bar.vgPage = tonumber(value)
  for _, b in ipairs(bar.vgButtons) do AB.UpdateButton(b) end
end

-- Bar 1 on a client that can't run secure snippets: the driver sets the bar's
-- own actionpage (no snippet), and each button, its index as its ID, reads it
-- from the bar when clicked, so stances, forms and Shift+number still page in
-- a fight. Out of combat (ns.Client.WhenSnippetsKnown); undoes the snippet paging.
function AB.PageWithoutSnippets(bar)
  if bar.vgPaged then return end
  bar.vgPaged = true
  UnregisterStateDriver(bar, "page")
  bar:SetAttribute("_onstate-page", nil)
  for i, b in ipairs(bar.vgButtons) do b:SetID(i) b:SetAttribute("useparent-actionpage", true) end
  bar:HookScript("OnAttributeChanged", AB.OnBarPage)
  RegisterAttributeDriver(bar, "actionpage", AB.PAGE_DRIVER)
end

-- Bar 1 pages through a secure state driver and a snippet, or, on a client
-- that can't run snippets, through its own actionpage (decided once the probe answers).
local function addPaging(bar)
  ns.Client.WhenSnippetsKnown(function(worked) if worked == false then AB.PageWithoutSnippets(bar) end end)
  if bar.vgPaged then return end
  bar:SetAttribute("_onstate-page", AB.ON_PAGE)
  RegisterStateDriver(bar, "page", AB.PAGE_DRIVER)
end

-- One bar: a secure header holding all twelve buttons (the layout shows as
-- many as the bar's settings ask for), movable in unlock mode, starting at
-- `point` (its place in the bottom stack, or its fixed default).
local function createBar(n, def, point)
  local bar = CreateFrame("Frame", "Vanguard_Bar" .. n, UIParent, "SecureHandlerStateTemplate")
  bar.vgIndex, bar.vgButtons = n, {}
  for i = 1, AB.MAX_BUTTONS do bar.vgButtons[i] = createButton(bar, n, i, def) end
  AB.bars[n] = bar
  AB.LayoutBar(n)
  if n == 1 then addPaging(bar) end
  AB.WatchHover(bar)
  AB.ApplyVisibility(n)
  ns.Mover(bar, "bar" .. n, ns.Format(L["Action bar {n}"], { n = n }), point)
  return bar
end

-- Key bindings ------------------------------------------------------------------------

local bindingOwner

-- Points every default action binding at the matching Vanguard button
-- (only buttons the bar's layout shows). Override bindings are cleared and
-- rebuilt; protected, so out of combat.
function AB.ApplyBindings()
  bindingOwner = bindingOwner or CreateFrame("Frame")
  ClearOverrideBindings(bindingOwner)
  for _, b in ipairs(AB.buttons) do
    for _, key in ipairs(b:IsShown() and { GetBindingKey(b.binding) } or {}) do
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
  ns.EditModeReplaced(f)
end

-- Silences the game's action buttons (hidden with their bars), so they stop
-- reacting to events of their own (out of combat, from build).
local function silenceButtons()
  for _, prefix in ipairs(BLIZZARD_BUTTONS) do
    for i = 1, 12 do
      local b = _G[prefix .. i]
      if type(b) == "table" and b.UnregisterAllEvents then b:UnregisterAllEvents() end
    end
  end
end

-- Hides the game's bars and silences their buttons.
local function hideBlizzardBars()
  for _, name in ipairs(BLIZZARD_BARS) do hideBlizzard(name) end
  silenceButtons()
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

-- Asks the client to report range changes for the button's slot (or checks range now). When the
-- slot changes (a page, a stance), the old slot's watch is turned off, one off for each on as
-- Blizzard's buttons do, and the tint is asked for the new slot instead of kept from the old.
function AB.WatchRange(b)
  if not rangeEvents() then return updateRange(b) end
  if b.rangeSlot == b.action then return end
  if b.rangeSlot then pcall(C_ActionBar.EnableActionRangeCheck, b.rangeSlot, false) end
  b.rangeSlot = b.action
  pcall(C_ActionBar.EnableActionRangeCheck, b.action, true)
  updateRange(b)
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
  ns.Every("action bar range", 0.2, function() each(updateRange) end)
end

-- What you carry or wear changed: item counts, and whether an item can be used.
local function refreshCarried()
  each(updateCount)
  each(updateUsable)
end

-- An icon may have changed (a form's attack icon, a macro, a spell that morphs).
local function refreshIcons()
  each(updateIcon)
end

-- Equipment changed: icons of equipped items, then counts and usability.
local function onEquipment()
  refreshIcons()
  refreshCarried()
  each(updateEquipped)
end

-- Event -> what it refreshes.
local EVENTS = {
  -- One handler per event; most refresh one part of every button.
  PLAYER_ENTERING_WORLD = function() each(AB.UpdateButton) end,
  ACTIONBAR_SLOT_CHANGED = onSlotChanged,
  -- One cooldown event: the client fires both for a cast, and its own action
  -- buttons follow ACTIONBAR_UPDATE_COOLDOWN alone.
  ACTIONBAR_UPDATE_COOLDOWN = function() each(updateCooldown) end,
  ACTIONBAR_UPDATE_USABLE = function() each(updateUsable) end,
  SPELL_UPDATE_USABLE = function() each(updateUsable) end,
  ACTIONBAR_UPDATE_STATE = function() each(updateChecked) end,
  -- What the game's own buttons also follow: items you carry or wear, forms,
  -- macros, and spells whose icon or charges change.
  BAG_UPDATE_DELAYED = refreshCarried,
  PLAYER_EQUIPMENT_CHANGED = onEquipment,
  UPDATE_SHAPESHIFT_FORM = refreshIcons,
  UPDATE_MACROS = refreshIcons,
  SPELL_UPDATE_ICON = refreshIcons,
  SPELL_UPDATE_CHARGES = function() each(updateCount) end,
  UPDATE_BINDINGS = function() ns.OutOfCombat(AB.ApplyBindings, "action bar keys") end,
  ACTION_RANGE_CHECK_UPDATE = onRangeUpdate,
  SPELL_ACTIVATION_OVERLAY_GLOW_SHOW = onOverlay(true),
  SPELL_ACTIVATION_OVERLAY_GLOW_HIDE = onOverlay(false),
  ACTIONBAR_SHOWGRID = function() AB.SetGrid(true) end,
  ACTIONBAR_HIDEGRID = function() AB.SetGrid(false) end,
}

-- Setup ---------------------------------------------------------------------------------

-- The point bar n is built at: its place in the bottom stack (remembered, so the re-stack after the
-- build moves only what the built bars' own rounding changed) or its own default spot.
local function buildPoint(n, settings)
  local point = defaultPoint(n, settings)
  AB.stacked[n] = moveKey(point)
  return point
end

-- Builds every enabled bar and takes over the default bindings. The stack is placed again once the
-- bars exist, since a scaled bar's height rounds to its own pixels only then.
local function build(settings)
  for n, def in ipairs(BARS) do
    local barSettings = settings.bars[n]
    if barSettings and barSettings.enabled then createBar(n, def, buildPoint(n, settings)) end
  end
  AB.RestackMoved()
  if settings.hideBlizzard then hideBlizzardBars() end
  AB.ApplyBindings()
  each(AB.UpdateButton)
  AB.UpdateBackings()
end

-- Module entry point (Core/Modules.lua): build out of combat, then listen.
function AB.Enable(settings)
  AB.settings = settings
  ns.OutOfCombat(function() build(settings) end)
  for event, fn in pairs(EVENTS) do
    ns.On(event, fn)
  end
  if settings.rangeTint and not rangeEvents() then pollRange() end
  ns.OnUnit("UNIT_INVENTORY_CHANGED", refreshCarried, "player")
  T.OnChanged(function() ns.OutOfCombat(AB.UpdateBackings, "action bar backings") end)
end
