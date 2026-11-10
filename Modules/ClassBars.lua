-- Class bars on the player frame, for what hiding the game's player frame
-- took with it (its totem frame and its druid mana bar live inside it):
--   * shamans: one cell per totem slot, with the totem's icon and time left, in a row above
--     the frame (under it the row met the chat's tab bar and its Find and Copy tiles, B4-1);
--     right-click a cell to destroy that totem, as the game's own buttons do;
--   * druids: your mana under the frame while a form shows rage or energy instead (on Retail
--     also Balance druids, Shadow priests and Elemental shamans, whose power bar shows another power);
--   * on Retail, the class resources the game's player frame draws (Modules/RetailClassBars.lua).
-- In instanced combat the client may hide totem values from addons. The icon
-- and the client's duration object still go straight to the widgets; whether
-- a totem is down is then left to the client too, where it offers that.

local ADDON, ns = ...

local T = ns.Theme
local A = ns.Auras
local UF = ns.GetModule("UnitFrames")

local CB = ns.Module("ClassBars", {
  defaults = { totems = true, druidMana = true, size = 22, manaHeight = 6 },
  live = true, requires = { "UnitFrames" },
})

CB.SLOTS = 4
-- The distance between the player frame's edge and the totem row above it or the mana bar under it.
CB.ROW_OFFSET = 3
-- The classes whose mana goes under the frame while their power bar shows another power, by client.
CB.MANA_CLASSES = ns.ClientData({ forever = { DRUID = true }, retail = { DRUID = true, PRIEST = true, SHAMAN = true } })
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

-- The totem row, just above the player frame, over its tab where the look gives it one (UF.Crown); the chat window
-- reaches up beside it, so under it the cells covered the chat's tiles.
local function buildTotems(player, size)
  CB.totems = CreateFrame("Frame", nil, player)
  CB.totems:SetSize(CB.SLOTS * (size + 3), size)
  CB.totems:SetPoint("BOTTOMLEFT", UF.Crown(player), "TOPLEFT", 0, CB.ROW_OFFSET)
  UF.RaiseDeckReach("top", CB.ROW_OFFSET + size)
  CB.totemCells = {}
  for slot = 1, CB.SLOTS do CB.totemCells[slot] = totemCell(CB.totems, slot, size) end
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

-- Lets clicks through an empty cell out of combat; a secure cell can't change in a fight (CB.ArmTotems readies every
-- cell as one starts).
local function takeClicks(c, down)
  if down ~= nil and not ns.InCombat() then c:EnableMouse(down) end
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
  takeClicks(c, down)
end

-- Repaints every totem cell (PLAYER_TOTEM_UPDATE, and after a fight, which sets each cell's clicks again).
function CB.UpdateTotems()
  if not CB.cells or type(GetTotemInfo) ~= "function" then return end
  for slot, c in ipairs(CB.cells) do paintCell(c, slot) end
end

-- A fight is starting (PLAYER_REGEN_DISABLED, before the lockdown): every cell takes clicks, so a totem dropped in the
-- fight can still be right-clicked away; once it ends the cells are repainted, which sets each cell's clicks again.
function CB.ArmTotems()
  for _, c in ipairs(CB.cells or {}) do c:EnableMouse(true) end
  ns.AfterCombat(CB.UpdateTotems, "totem clicks")
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
  CB.manaHolder:SetPoint("TOPLEFT", player, "BOTTOMLEFT", 0, -CB.ROW_OFFSET)
  CB.manaHolder:SetPoint("TOPRIGHT", player, "BOTTOMRIGHT", 0, -CB.ROW_OFFSET)
  CB.manaHolder:SetHeight(height)
  UF.RaiseDeckReach("bottom", CB.ROW_OFFSET + height)
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

-- The totem row on the player frame: made the first time (a frame is never freed), then handed to the scope and
-- shown again, with its cells (CB.cells is the row's only while the module runs: Modules/CooldownGaps.lua reads it).
local function showTotems(settings, scope)
  local player = UF.frames.player
  if not (player and scope:Running()) then return end
  if not CB.totems then buildTotems(player, settings.size) end
  CB.cells = CB.totemCells
  scope:Frame(CB.totems):Show()
  CB.UpdateTotems()
end

-- Shamans: build the totem row out of combat (after the unit frames) and follow totems.
local function enableTotems(settings, scope)
  ns.OutOfCombat(function() showTotems(settings, scope) end)
  scope:On("PLAYER_TOTEM_UPDATE", CB.UpdateTotems)
  scope:On("PLAYER_ENTERING_WORLD", CB.UpdateTotems)
  scope:On("PLAYER_REGEN_DISABLED", CB.ArmTotems)
end

-- The druid mana bar on the player frame: made the first time, then handed to the scope again (UpdateMana shows it
-- in a form).
local function showMana(settings, scope)
  local player = UF.frames.player
  if not (player and scope:Running()) then return end
  if not CB.manaHolder then buildMana(player, settings.manaHeight) end
  scope:Frame(CB.manaHolder)
  CB.UpdateMana()
end

-- Druids: build the mana bar out of combat and follow your mana and forms (only yours).
local function enableMana(settings, scope)
  ns.OutOfCombat(function() showMana(settings, scope) end)
  scope:OnUnit({ "UNIT_POWER_UPDATE", "UNIT_POWER_FREQUENT", "UNIT_MAXPOWER", "UNIT_DISPLAYPOWER" }, CB.UpdateMana, "player")
  scope:On("UPDATE_SHAPESHIFT_FORM", CB.UpdateMana)
end

-- Module entry point (Core/Modules.lua): each class gets only its own bars, and on Retail its class
-- resource (CB.EnableResources, from Modules/RetailClassBars.lua, which only Retail loads).
function CB.Enable(settings, scope)
  local _, class = UnitClass("player")
  if ns.IsSecret(class) then return end
  if class == "SHAMAN" and settings.totems then enableTotems(settings, scope) end
  if CB.MANA_CLASSES[class] and settings.druidMana then enableMana(settings, scope) end
  if CB.EnableResources then CB.EnableResources(class, scope) end
end

-- Switched off: the totem cells are no longer the row CooldownGaps leaves to the class bars (the frames themselves
-- go with the scope).
function CB.Disable()
  CB.cells = nil
end
