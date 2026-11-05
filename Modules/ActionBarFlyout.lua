-- Action bar flyouts: a slot holding a flyout (a Mage's Teleport or Portal, a
-- Hunter's Call Pet) opens a list of its spells beside the button.
--
-- The game's own button click would hand Vanguard's button to the protected
-- SpellFlyout, which asks it for methods only the game's buttons have. So the
-- click is taken over with a secure snippet (SecureHandlerWrapScript) that
-- opens a flyout of our own, Vanguard_Flyout, and never calls SpellFlyout.
-- The spells of each flyout are written onto the flyout frame as attributes
-- out of combat (the restricted environment can't ask the client for them);
-- the snippet only reads them, so it works in combat. Nothing the addon
-- writes is ever handed to a protected game frame.
--
-- The frame is made when a flyout first sits on a bar, so a character with
-- none has nothing extra.

local ADDON, ns = ...

local AB = ns.GetModule("ActionBars")
local T = ns.Theme

-- The flyout's spell buttons (the most spells a flyout holds; a larger one is cut short), their side,
-- the gap between buttons, the action slots to look through (the last bar's last slot is 180), and the game
-- setting that says which edge of a click the game acts on.
AB.FLYOUT = { max = 20, size = 32, gap = 2, slots = 180, frame = "Vanguard_Flyout", close = "Vanguard_FlyoutClose", edgeCVar = "ActionButtonUseKeyDown" }

-- Runs in the secure environment before a bar button's click. On a flyout slot it lists the flyout's
-- spells beside the button (above it, below it, or toward the screen's middle from a side edge) and
-- stops the click; on anything else it closes the list. The click's other edge (the game acts on
-- key down or up, by the Action Button key-down setting) is stopped too, so the list opens once.
AB.FLYOUT_PRE = [[
  local kind, id = GetActionInfo(self:GetAttribute("action") or 0)
  if kind ~= "flyout" then control:Hide() return end
  if (down and "down" or "up") ~= control:GetAttribute("edge") then return false end
  if control:IsShown() and control:GetAttribute("opened-by") == self:GetName() then control:Hide() return false end
  local count = control:GetAttribute("flyout-" .. id .. "-count") or 0
  if count == 0 then control:Hide() return false end
  local gap, dir = control:GetAttribute("gap"), "UP"
  local left, bottom, width, height = self:GetRect()
  if left then
    local scale = self:GetEffectiveScale()
    local x, y = (left + width / 2) * scale, (bottom + height / 2) * scale
    local screenWidth, screenHeight = control:GetAttribute("screen-width"), control:GetAttribute("screen-height")
    if x < screenWidth * 0.15 then dir = "RIGHT" elseif x > screenWidth * 0.85 then dir = "LEFT" elseif y > screenHeight / 2 then dir = "DOWN" end
  end
  local point, relative, dx, dy = "BOTTOM", "TOP", 0, gap
  if dir == "DOWN" then point, relative, dy = "TOP", "BOTTOM", -gap
  elseif dir == "LEFT" then point, relative, dx, dy = "RIGHT", "LEFT", -gap, 0
  elseif dir == "RIGHT" then point, relative, dx, dy = "LEFT", "RIGHT", gap, 0 end
  local previous = self
  for i, child in ipairs(newtable(control:GetChildren())) do
    if i <= count then
      child:ClearAllPoints()
      child:SetPoint(point, previous, relative, dx, dy)
      child:SetAttribute("spell", control:GetAttribute("flyout-" .. id .. "-" .. i))
      child:Show()
      previous = child
    else
      child:Hide()
    end
  end
  control:Hide()
  control:SetAttribute("opened-by", self:GetName())
  control:Show()
  return false
]]

-- Runs before a spell button's click: it closes the list after the click the game acts on.
AB.FLYOUT_CHILD_PRE = [[
  if (down and "down" or "up") == control:GetAttribute("edge") then return nil, true end
]]

-- Escape closes the list while it shows: a key binding to the close button, held only then.
AB.FLYOUT_ON_SHOW = 'self:SetBindingClick(true, "ESCAPE", "' .. AB.FLYOUT.close .. '")'

-- Clicking the close button hides the list.
AB.FLYOUT_CLOSE = 'self:GetFrameRef("flyout"):Hide()'

-- The icon of a spell button, from the spell the snippet set on it.
local function paintChild(child)
  local spell = child:GetAttribute("spell")
  child.icon:SetTexture(spell and C_Spell.GetSpellTexture(spell))
end

-- The tooltip of a spell button's spell.
local function showSpell(child)
  local spell = child:GetAttribute("spell")
  if not spell then return end
  GameTooltip_SetDefaultAnchor(GameTooltip, child)
  GameTooltip:SetSpellByID(spell)
  GameTooltip:Show()
end

-- Hides the spell tooltip.
local function hideSpell()
  GameTooltip:Hide()
end

-- One spell button of the list: a secure button that casts its spell, in the bar buttons' skin.
local function makeChild(flyout, i)
  local child = CreateFrame("Button", string.format("%s%d", AB.FLYOUT.frame, i), flyout, "SecureActionButtonTemplate")
  child:SetSize(AB.FLYOUT.size, AB.FLYOUT.size)
  child:SetAttribute("type", "spell")
  child:RegisterForClicks("AnyUp", "AnyDown")
  T.Button(child)
  child.icon = child:CreateTexture(nil, "ARTWORK")
  child.icon:SetAllPoints()
  T.Crop(child.icon)
  return child
end

-- Gives a spell button its scripts and the secure wrap that closes the list after a cast.
local function wireChild(flyout, child)
  child:SetScript("OnEnter", ns.Guard("flyout spell tooltip", showSpell))
  child:SetScript("OnLeave", ns.Guard("flyout spell tooltip", hideSpell))
  SecureHandlerWrapScript(child, "OnClick", flyout, AB.FLYOUT_CHILD_PRE, "control:Hide()")
end

-- The button that Escape clicks: it hides the list (made apart from it, so the snippet's children are the spell buttons).
local function makeClose(flyout)
  local close = CreateFrame("Button", AB.FLYOUT.close, UIParent, "SecureHandlerClickTemplate")
  close:SetAttribute("_onclick", AB.FLYOUT_CLOSE)
  SecureHandlerSetFrameRef(close, "flyout", flyout)
  return close
end

-- Paints the spell buttons when the list opens (the snippet has set their spells just before).
local function paintOpen(flyout)
  for _, child in ipairs(flyout.vgChildren) do paintChild(child) end
end

-- The list's spell buttons, wired.
local function makeChildren(flyout)
  flyout.vgChildren = {}
  for i = 1, AB.FLYOUT.max do
    flyout.vgChildren[i] = makeChild(flyout, i)
    wireChild(flyout, flyout.vgChildren[i])
  end
end

-- The list's own place: a button's size at the screen's middle, set once as it is made (out of combat), so the
-- secure frame is never left without a rect. Its spell buttons are placed against the bar button that opens it.
local function placeFlyout(flyout)
  flyout:SetFrameStrata("HIGH")
  flyout:SetPoint("CENTER")
  flyout:SetSize(AB.FLYOUT.size, AB.FLYOUT.size)
end

-- The list: a secure handler holding the spell buttons, shown by the bar buttons' snippet.
local function makeFlyout()
  local flyout = CreateFrame("Frame", AB.FLYOUT.frame, UIParent, "SecureHandlerShowHideTemplate")
  placeFlyout(flyout)
  flyout:SetAttribute("gap", AB.FLYOUT.gap)
  flyout:SetAttribute("_onshow", AB.FLYOUT_ON_SHOW)
  flyout:SetAttribute("_onhide", "self:ClearBindings()")
  makeChildren(flyout)
  flyout:HookScript("OnShow", ns.Guard("flyout paint", paintOpen))
  return flyout
end

-- Wraps one bar button's click with the snippet (out of combat: a bar's buttons are made then).
local function wrapButton(b)
  SecureHandlerWrapScript(b, "OnClick", AB.flyout, AB.FLYOUT_PRE)
  b.vgFlyoutWrapped = true
end

-- Wraps a bar button made after the list exists (the buttons made before it are wrapped when it is made).
function AB.WrapFlyout(b)
  if AB.flyout and not b.vgFlyoutWrapped then wrapButton(b) end
end

-- The flyouts on the bars' slots, as a set of ids.
local function flyoutIds()
  local ids = {}
  for slot = 1, AB.FLYOUT.slots do
    local kind, id = GetActionInfo(slot)
    id = kind == "flyout" and ns.PlainNumber(id)
    if id then ids[id] = true end
  end
  return ids
end

-- Whether a Call Pet spell has a pet in its slot (the game leaves an empty slot out of the list); any other spell does.
local function hasPet(spell)
  if type(GetCallPetSpellInfo) ~= "function" then return true end
  local index, name = GetCallPetSpellInfo(spell)
  return not index or (name ~= nil and name ~= "")
end

-- The spells of a flyout the character can use, in the game's order (at most as many as the list has buttons).
local function knownSpells(id)
  local spells = {}
  local _, _, slots = GetFlyoutInfo(id)
  for k = 1, slots or 0 do
    local spell, _, isKnown = GetFlyoutSlotInfo(id, k)
    if isKnown and hasPet(spell) and #spells < AB.FLYOUT.max then spells[#spells + 1] = spell end
  end
  return spells
end

-- Writes a flyout's usable spells onto the list's frame, for the snippet to read.
local function storeFlyout(flyout, id)
  local spells = knownSpells(id)
  flyout:SetAttribute("flyout-" .. id .. "-count", #spells)
  for i, spell in ipairs(spells) do flyout:SetAttribute("flyout-" .. id .. "-" .. i, spell) end
end

-- Writes what the snippet can't ask the client: the screen's size in pixels and which edge of a click the game acts on.
local function storeScreen(flyout)
  flyout:SetAttribute("screen-width", UIParent:GetWidth() * UIParent:GetEffectiveScale())
  flyout:SetAttribute("screen-height", UIParent:GetHeight() * UIParent:GetEffectiveScale())
  flyout:SetAttribute("edge", GetCVarBool(AB.FLYOUT.edgeCVar) and "down" or "up")
end

-- Makes the list and wraps every bar button, once a flyout first sits on a bar.
local function ensureFlyout()
  if AB.flyout then return end
  AB.flyout = makeFlyout()
  makeClose(AB.flyout)
  for _, b in ipairs(AB.buttons) do wrapButton(b) end
end

-- Stores every flyout on the bars (out of combat: the frame's attributes are protected).
function AB.ShowFlyouts()
  local ids = flyoutIds()
  if not next(ids) and not AB.flyout then return end
  ensureFlyout()
  storeScreen(AB.flyout)
  for id in pairs(ids) do storeFlyout(AB.flyout, id) end
end

-- Stores the flyouts now, or when the fight ends.
local function store()
  ns.OutOfCombat(AB.ShowFlyouts, "action bar flyouts")
end

-- Stores the flyouts on the next frame, once for a burst of changes (a bar's slots all change together on a
-- page or a talent swap, and each store reads every slot).
local function refresh()
  ns.Soon("action bar flyouts", store)
end

-- A game setting changed: only the Action Button key-down setting matters to the list (the client sends
-- every setting's change; the name is matched without case to be safe).
local function onSettingChanged(_, name)
  if type(name) == "string" and name:lower() == AB.FLYOUT.edgeCVar:lower() then refresh() end
end

-- Keeps the stored flyouts current: when spells, slots, the screen or the key-down setting change, and at login.
local function watchFlyouts()
  for _, event in ipairs({ "SPELLS_CHANGED", "ACTIONBAR_SLOT_CHANGED", "PLAYER_ENTERING_WORLD", "DISPLAY_SIZE_CHANGED", "UI_SCALE_CHANGED" }) do
    ns.On(event, refresh)
  end
  ns.On("CVAR_UPDATE", onSettingChanged)
  refresh()
end

-- Watches the flyouts only on a client that runs secure snippets: on one that can't, the wrap on every bar
-- button would fail before the game's click, so no button would act at all.
function AB.WatchFlyouts()
  ns.Client.WhenSnippetsKnown(function(worked) if worked then watchFlyouts() end end)
end
