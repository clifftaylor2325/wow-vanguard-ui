-- Class bars under the player frame, for what hiding the game's player frame
-- took with it (its totem frame and its druid mana bar live inside it):
--   * shamans: one cell per totem slot, with the totem's icon and time left;
--     right-click a cell to destroy that totem, as the game's own buttons do;
--   * druids: your mana while a form shows rage or energy instead.
-- In instanced combat the client may hide totem values from addons. The icon
-- and the client's duration object still go straight to the widgets; whether
-- a totem is down is then left to the client too, where it offers that.

local ADDON, ns = ...

local T = ns.Theme
local A = ns.Auras
local UF = ns.GetModule("UnitFrames")

local CB = ns.Module("ClassBars", { defaults = { totems = true, druidMana = true, size = 22, manaHeight = 6 } })

CB.SLOTS = 4
-- The mana power type (Enum.PowerType.Mana).
CB.MANA = 0

-- Totems -----------------------------------------------------------------------------------

-- One totem cell: a secure button (destroying a totem is a protected action),
-- dressed like an aura icon, with the client's countdown numbers.
local function totemCell(bar, slot, size)
  local c = CreateFrame("Button", nil, bar, "SecureActionButtonTemplate")
  local parts = A.Dress(c, { size = size })
  c.icon, c.cooldown = parts.icon, parts.cooldown
  A.Countdown(c.cooldown, size)
  c:SetPoint("LEFT", bar, "LEFT", (slot - 1) * (size + 3), 0)
  c:RegisterForClicks("RightButtonUp")
  -- An addon's secure button acts on the press while key-down casting is on (the default), so a cell
  -- heard only on the release would never act: it acts on the release whatever that CVar says.
  c:SetAttribute("useOnKeyDown", false)
  c:SetAttribute("type2", "destroytotem")
  c:SetAttribute("totem-slot", slot)
  return c
end

-- The totem row, just under the player frame.
local function buildTotems(player, size)
  CB.totems = CreateFrame("Frame", nil, player)
  CB.totems:SetSize(CB.SLOTS * (size + 3), size)
  CB.totems:SetPoint("TOPLEFT", player, "BOTTOMLEFT", 0, -3)
  CB.cells = {}
  for slot = 1, CB.SLOTS do CB.cells[slot] = totemCell(CB.totems, slot, size) end
  CB.UpdateTotems()
end

-- The client's duration object for a totem slot, or nil when it has none to give.
local function totemObject(slot)
  if not ns.Client.Has("cooldownObject") or type(GetTotemDuration) ~= "function" then return nil end
  return GetTotemDuration(slot)
end

-- A totem's sweep: the client's duration object where it has one (it works
-- while totem values are hidden), else the plain start and length.
local function totemSweep(cd, slot, start, duration)
  local object = totemObject(slot)
  if object ~= nil then
    cd:SetCooldownFromDurationObject(object)
    return
  end
  local s, len = ns.PlainNumber(start), ns.PlainNumber(duration)
  if s and len and len > 0 then cd:SetCooldown(s, len) else cd:Clear() end
end

-- Whether a totem is down, or nil when the client hides it.
local function totemDown(have, duration)
  if ns.IsSecret(have) or ns.IsSecret(duration) then return nil end
  return have == true and (ns.PlainNumber(duration) or 0) > 0
end

-- Paints one cell from its slot. Cells are secure, so they show and hide by
-- alpha (allowed in combat); a hidden answer goes to the client's own
-- alpha-from-boolean where it has one, else the cell keeps its last state.
local function paintCell(c, slot)
  local have, _, start, duration, icon = GetTotemInfo(slot)
  c.icon:SetTexture(icon)
  totemSweep(c.cooldown, slot, start, duration)
  local down = totemDown(have, duration)
  if down ~= nil then c:SetAlpha(down and 1 or 0) elseif c.SetAlphaFromBoolean then c:SetAlphaFromBoolean(have) end
end

-- Repaints every totem cell (PLAYER_TOTEM_UPDATE).
function CB.UpdateTotems()
  if not CB.cells or type(GetTotemInfo) ~= "function" then return end
  for slot, c in ipairs(CB.cells) do paintCell(c, slot) end
end

-- Druid mana -------------------------------------------------------------------------------

-- True while a form shows a power other than mana (bear: rage, cat: energy).
function CB.InForm()
  local kind = type(UnitPowerType) == "function" and ns.PlainNumber(UnitPowerType("player")) or nil
  return kind ~= nil and kind ~= CB.MANA
end

-- The thin mana bar just under the player frame, in the mana color.
local function buildMana(player, height)
  CB.manaHolder = T.HudPanel(CreateFrame("Frame", nil, player), { inset = true })
  CB.manaHolder:SetPoint("TOPLEFT", player, "BOTTOMLEFT", 0, -3)
  CB.manaHolder:SetPoint("TOPRIGHT", player, "BOTTOMRIGHT", 0, -3)
  CB.manaHolder:SetHeight(height)
  local px = T.Pixel(CB.manaHolder)
  CB.mana = T.BarColor(T.StyleBar(CreateFrame("StatusBar", nil, CB.manaHolder)), "mana")
  CB.mana:SetPoint("TOPLEFT", px, -px); CB.mana:SetPoint("BOTTOMRIGHT", -px, px)
  CB.UpdateMana()
end

-- Fills the mana bar (values go straight to the bar, hidden or not) and shows it in a form.
function CB.UpdateMana()
  if not CB.mana then return end
  CB.manaHolder:SetShown(CB.InForm())
  CB.mana:SetMinMaxValues(0, UnitPowerMax("player", CB.MANA))
  T.SetBarValue(CB.mana, UnitPower("player", CB.MANA))
end

-- Enabling -----------------------------------------------------------------------------------

-- Shamans: build the totem row out of combat (after the unit frames) and follow totems.
local function enableTotems(settings)
  ns.OutOfCombat(function() if UF.frames.player then buildTotems(UF.frames.player, settings.size) end end)
  ns.On("PLAYER_TOTEM_UPDATE", CB.UpdateTotems)
  ns.On("PLAYER_ENTERING_WORLD", CB.UpdateTotems)
end

-- Druids: build the mana bar out of combat and follow your mana and forms (only yours).
local function enableMana(settings)
  ns.OutOfCombat(function() if UF.frames.player then buildMana(UF.frames.player, settings.manaHeight) end end)
  ns.OnUnit({ "UNIT_POWER_UPDATE", "UNIT_POWER_FREQUENT", "UNIT_MAXPOWER", "UNIT_DISPLAYPOWER" }, CB.UpdateMana, "player")
  ns.On("UPDATE_SHAPESHIFT_FORM", CB.UpdateMana)
end

-- Module entry point (Core/Modules.lua): each class gets only its own bar.
function CB.Enable(settings)
  local _, class = UnitClass("player")
  if ns.IsSecret(class) then return end
  if class == "SHAMAN" and settings.totems then enableTotems(settings) end
  if class == "DRUID" and settings.druidMana then enableMana(settings) end
end
