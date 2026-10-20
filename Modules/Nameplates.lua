-- Nameplates in the Vanguard look: a flat health bar in the unit's class
-- or reaction color (or its threat color while you have aggro), the name
-- above it with its level (colored by how hard it is for you), your debuffs over the name, the raid target icon to the left,
-- a cast bar under it, an accent border and glow on your target, a faint wash on
-- the plate under the mouse, a player's buffs right of the bar (defensives and
-- important ones, and yours on friends), the health percent and value on enemy plates while the
-- game's own Info display setting asks for them, and a gold "!" by the name of units
-- your quests need (when the client says so plainly, or the unit's tooltip data lists one of your quests). The game's personal
-- resource display (its health and power bars under your character, with its
-- nameplateShowSelf setting on) takes the same look: the theme's bar texture on
-- flat panels, texts in the plate font; its colours, values and place stay the game's.
--
-- Vanguard draws its own frame on each nameplate the client gives it and
-- hides the default one; the client still places, sizes and stacks the
-- plates. Plates the client keeps from addons (forbidden ones, such as
-- friendly plates in some instances) are left as they are.
--
-- The mouse hits a plate only inside its hit-test points, which the client's
-- own frame sets around its own name and bar (and clears for name-only friendly
-- players). That frame is hidden here, so Vanguard sets them around its own
-- name and bar instead, and has the client stack plates by that same box.
--
-- Written for WoW Forever. Health goes to the bar as the client gives it,
-- hidden or not. Threat and names are only read when they are plain.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgHooked = ns.FrameState("vgHooked")
local vgStacked = ns.FrameState("vgStacked")
local vgPlate = ns.FrameState("vgPlate")

local T = ns.Theme
local CB = ns.GetModule("CastBars")
local RS = ns.GetModule("RaidStatus")
local UF = ns.GetModule("UnitFrames")

local NP = ns.Module("Nameplates", {
  defaults = { width = 130, height = 10, level = true, threat = true, castBar = true, debuffs = 4, buffs = 3, targetBorder = true, timers = true, questMarks = true, tagMarks = true },
})

local ICON = 18
-- A player's buff icons, right of the bar.
NP.BUFF = 16
-- How far the click area reaches past each side of the bar (as the client's own plates).
NP.HIT_PAD = 10
-- The mouseover wash's opacity over the bar.
NP.HOVER = 0.2
-- How often (seconds) a shown wash checks that the mouse is still over a unit.
NP.HOVER_POLL = 0.1
-- The target marker's size (a diamond right of your target's plate).
NP.MARKER = 8
-- The quest mark's size (a "!" right of the name).
NP.QUEST = 12
-- How many screen pixels the accent glow around your target's plate reaches out.
NP.GLOW = 2
-- The game's Info display setting (its Nameplates options), whose health percent and
-- value bits Vanguard's enemy plates follow; NP.info holds them as last read.
NP.INFO_CVAR = "nameplateInfoDisplay"
NP.info = { percent = false, value = false }
-- Plates shorter than this (the smallest Height) have no room for the health numbers.
NP.NUMBERS_MIN_HEIGHT = 10

NP.plates = {}
-- Every frame we built for a plate (the client reuses plates, so each keeps one).
NP.built = {}
-- How many plate frames are built ahead, at login: a pull that brings 30
-- plates at once then builds none (each is some 20 frames).
NP.POOL = 40
-- The frames built ahead that no plate has taken yet.
NP.pool = {}
-- Fallback aura rows put away after a fight, for the next plate drawn in one (by row).
NP.spare = { debuffs = {}, buffs = {} }

-- Values -----------------------------------------------------------------------------------

-- The client's nameplate for a unit, or nil (none, or kept from addons).
function NP.PlateFor(unit)
  local api = _G.C_NamePlate
  local plate = type(api) == "table" and api.GetNamePlateForUnit and api.GetNamePlateForUnit(unit)
  if type(plate) ~= "table" or (plate.IsForbidden and plate:IsForbidden()) then return nil end
  return plate
end

-- Your threat color on a unit, or nil when you have none (or it is hidden).
function NP.ThreatColor(unit)
  local status = type(UnitThreatSituation) == "function" and UnitThreatSituation("player", unit) or nil
  if ns.IsSecret(status) or type(status) ~= "number" or status < 1 then return nil end
  return T.TOKENS["threat" .. math.min(status, 3)]
end

-- The bar color: grey on a mob another player has tagged (while the tag marks are on), else threat
-- while you have aggro (if on), else class or reaction.
function NP.Color(unit)
  if NP.settings.tagMarks == true and UF.TagState(unit) == "theirs" then return T.RGB("tapped") end
  local threat = NP.settings.threat and NP.ThreatColor(unit)
  if threat then return threat[1], threat[2], threat[3] end
  return UF.UnitColor(unit)
end

-- True when the line is a quest title or a quest objective of the unit's tooltip (a hidden line or type counts as no).
local function questLine(line)
  if ns.IsSecret(line) or type(line) ~= "table" or ns.IsSecret(line.type) then return false end
  local kinds = Enum.TooltipDataLineType
  return line.type == kinds.QuestObjective or line.type == kinds.QuestTitle
end

-- The lines of the unit's tooltip data from the client, or nil (no call, no data, a hidden answer).
local function tooltipLines(unit)
  local get = type(C_TooltipInfo) == "table" and C_TooltipInfo.GetUnit
  if type(get) ~= "function" or type(Enum) ~= "table" or type(Enum.TooltipDataLineType) ~= "table" then return nil end
  local ok, data = pcall(get, unit)
  if not ok or ns.IsSecret(data) or type(data) ~= "table" or ns.IsSecret(data.lines) then return nil end
  return type(data.lines) == "table" and data.lines or nil
end

-- True when the unit's tooltip carries a quest line of yours (its title or an objective).
function NP.QuestTooltip(unit)
  for _, line in ipairs(tooltipLines(unit) or {}) do
    if questLine(line) then return true end
  end
  return false
end

-- True when one of your active quests needs the unit: the client's own answer when it says so plainly,
-- else a quest title or objective line in the unit's tooltip (a hidden answer counts as no).
function NP.QuestUnit(unit)
  local fn = C_QuestLog and C_QuestLog.UnitIsRelatedToActiveQuest
  local related = type(fn) == "function" and fn(unit)
  if not ns.IsSecret(related) and related == true then return true end
  return NP.QuestTooltip(unit)
end

-- True when the unit is `other` (your target, the mouseover; hidden counts as no).
local function isUnit(unit, other)
  local same = UnitIsUnit(unit, other)
  return not ns.IsSecret(same) and same == true
end

-- The unit whose buffs a plate shows: its own when it is a player, else nil
-- (a hidden answer counts as not a player).
function NP.BuffUnit(unit)
  local player = unit and type(UnitIsPlayer) == "function" and UnitIsPlayer(unit)
  if ns.IsSecret(player) or player ~= true then return nil end
  return unit
end

-- Building ---------------------------------------------------------------------------------

-- An accent diamond just right of the plate and an accent glow around it,
-- shown on your target's plate.
local function addMarker(f)
  f.glow = T.Glow(f, NP.GLOW)
  f.marker = T.Snap(f:CreateTexture(nil, "OVERLAY"))
  f.marker:SetTexture(T.Texture("Diamond"))
  f.marker:SetSize(NP.MARKER, NP.MARKER)
  f.marker:SetPoint("LEFT", f, "RIGHT", 4, 0)
  f.marker:Hide()
end

-- A gold quest "!" (Vanguard's QuestBang mark) just right of the name, shown on units your quests need.
local function addQuestMark(f)
  f.quest = f:CreateTexture(nil, "OVERLAY")
  f.quest:SetTexture(T.Icon("QuestBang"))
  f.quest:SetSize(NP.QUEST, NP.QUEST)
  f.quest:SetPoint("LEFT", f.name, "RIGHT", 2, 0)
  T.Tint(f.quest, "gold")
  f.quest:Hide()
end

-- The tag mark just left of the level: a green check on mobs you have tagged, a grey X on another player's.
local function addTagMark(f)
  f.tag = f:CreateTexture(nil, "OVERLAY")
  f.tag:SetSize(NP.QUEST, NP.QUEST)
  f.tag:SetPoint("RIGHT", f.level, "LEFT", -2, 0)
  f.tag:Hide()
end

-- The name above the bar (its level just left of it, the quest mark just
-- right), the raid icon to its left and the target marker to its right.
local function addTexts(f)
  f.name = T.Text(f:CreateFontString(nil, "OVERLAY"), "world")
  f.name:SetPoint("BOTTOM", f, "TOP", 0, 3)
  f.level = T.Text(f:CreateFontString(nil, "OVERLAY"), "world")
  f.level:SetPoint("RIGHT", f.name, "LEFT", -3, 0)
  f.raidIcon = f:CreateTexture(nil, "OVERLAY")
  f.raidIcon:SetSize(ICON, ICON)
  f.raidIcon:SetPoint("RIGHT", f, "LEFT", -4, 0)
  f.raidIcon:Hide()
  addMarker(f)
  addQuestMark(f)
end

-- The health numbers at the bar's right end (shown on enemy plates while the game's
-- Info display asks): the percent, and the value left of it. Never measured.
local function addNumbers(f)
  f.healthPercent = T.Text(f:CreateFontString(nil, "OVERLAY"), "barSmall")
  f.healthPercent:SetPoint("RIGHT", f, "RIGHT", -2, 0)
  f.healthValue = T.Text(f:CreateFontString(nil, "OVERLAY"), "barSmall")
  f.healthPercent:Hide()
  f.healthValue:Hide()
end

-- The box the mouse hits and the client stacks by (nothing drawn, no mouse of
-- its own): from the top of the name to half a bar under the bar, reaching
-- NP.HIT_PAD past each side of it, as the client's own plates do.
local function addHitArea(f, s)
  f.hit = CreateFrame("Frame", nil, f)
  f.hit:SetPoint("TOP", f.name, "TOP", 0, 0)
  f.hit:SetPoint("BOTTOM", f, "BOTTOM", 0, -s.height / 2)
  f.hit:SetWidth(s.width + 2 * NP.HIT_PAD)
end

-- A faint white wash over the bar, shown while the mouse is over the plate's unit.
local function addHover(f)
  f.hover = T.Snap(f:CreateTexture(nil, "OVERLAY"))
  f.hover:SetTexture(T.WHITE)
  f.hover:SetAllPoints(f)
  T.Tint(f.hover, "hover", NP.HOVER)
  f.hover:Hide()
end

-- Your debuffs in a row over the name, soonest to expire first, with timers
-- (a plate is where you watch your damage over time): an aura container that
-- follows the plate's unit (Core/Auras.lua).
function NP.DebuffSpec(f, s)
  return { point = { "BOTTOMLEFT", f, "TOPLEFT", 0, 16 }, grow = "RIGHT", growY = "UP", lineSize = s.width, gap = 2, timer = s.timers, mouse = false,
    groups = { { filter = "HARMFUL|PLAYER|!CROWD_CONTROL", max = s.debuffs, size = ICON, debuff = true, sort = "ExpirationOnly" },
      { filter = "HARMFUL|PLAYER|CROWD_CONTROL", max = s.debuffs > 0 and 1 or 0, size = ICON, debuff = true } } }
end

-- A player's buffs in a row right of the bar, past the target marker: big
-- defensives, then external ones, then important buffs (immunities, major
-- cooldowns), then yours (none on an enemy). A container's groups are fixed
-- and a plate is reused for friend and foe, so the same groups serve both;
-- each leaves out what an earlier one shows. Up to s.buffs a row; a player
-- with more gets a row above.
function NP.BuffSpec(f, s)
  local gap = 2
  -- One group of up to s.buffs icons through `filter`.
  local function group(filter) return { filter = filter, max = s.buffs, size = NP.BUFF } end
  return { point = { "BOTTOMLEFT", f, "BOTTOMRIGHT", NP.MARKER + 8, (s.height - NP.BUFF) / 2 }, grow = "RIGHT", growY = "UP",
    lineSize = s.buffs * (NP.BUFF + gap), gap = gap, timer = s.timers, mouse = false,
    groups = { group("HELPFUL|BIG_DEFENSIVE"), group("HELPFUL|EXTERNAL_DEFENSIVE|!BIG_DEFENSIVE"),
      group("HELPFUL|IMPORTANT|!BIG_DEFENSIVE|!EXTERNAL_DEFENSIVE"),
      group("HELPFUL|PLAYER|!IMPORTANT|!BIG_DEFENSIVE|!EXTERNAL_DEFENSIVE") } }
end

-- The cast bar under the health bar; its icon (left of it) lines up with the plate's left edge.
local function addCastBar(f, s)
  f.cast = CB.Build(CreateFrame("StatusBar", nil, f), s.width - s.height - 3, s.height)
  f.cast:SetPoint("TOPRIGHT", f, "BOTTOMRIGHT", 0, -4)
end

-- A plate's aura rows (its debuffs, a player's buffs) -> the NP function giving each one's spec.
local ROW_SPECS = { debuffs = "DebuffSpec", buffs = "BuffSpec" }

-- The unit a plate's row follows while the plate shows `unit` (buffs only on players).
local function rowUnit(key, unit)
  if key == "buffs" then return NP.BuffUnit(unit) end
  return unit
end

-- A fallback row put away after a fight, moved over another plate's frame.
local function reuseRow(row, f, key)
  row.frame:SetParent(f)
  row.frame:ClearAllPoints()
  row.frame:SetPoint(unpack(NP[ROW_SPECS[key]](f, NP.settings).point))
  row.frame:Show()
  return row
end

-- One of a plate's aura rows on the backend in use, noting whether that was
-- the client's engine (a plate first drawn in combat gets the fallback: a row
-- put away after an earlier fight when there is one, else a new one).
local function addRow(f, key)
  local spare = ns.Auras.Backend() ~= ns.AuraEngine and table.remove(NP.spare[key])
  f[key] = spare and reuseRow(spare, f, key) or ns.Auras.Container(f, NP[ROW_SPECS[key]](f, NP.settings), rowUnit(key, f.unit))
  f[key .. "OnEngine"] = ns.Auras.Backend() == ns.AuraEngine
end

-- A plate's texts, tag mark, click area and mouseover wash.
local function addOverlays(f, s)
  addTexts(f)
  addNumbers(f)
  addTagMark(f)
  addHitArea(f, s)
  addHover(f)
end

-- A plate's debuff row, and its buff row unless switched off.
local function addRows(f, s)
  addRow(f, "debuffs")
  if s.buffs > 0 then addRow(f, "buffs") end
end

-- Our frame for a client nameplate: health bar, texts, click area, mouseover
-- wash, debuffs, a player's buffs, cast bar, and its own unit events
-- (ns.SetUnits points them at the plate's unit). `parent` is the plate, or the
-- hidden holder of the frames built ahead.
local function build(parent)
  local s = NP.settings
  local f = CreateFrame("StatusBar", nil, parent)
  f:SetSize(s.width, s.height)
  f:SetPoint("CENTER")
  T.HudPanel(T.StyleBar(f), { inset = true })
  addOverlays(f, s)
  addRows(f, s)
  if s.castBar then addCastBar(f, s) end
  f.events, NP.built[#NP.built + 1] = ns.OnUnit(NP.UNIT_EVENTS, NP.OnUnitEvent), f
  return f
end

-- A plate's fallback row swapped for one on the client's engine, on the
-- plate's unit; the fallback row is put away for the next fight.
local function upgradeRow(f, key)
  f[key]:SetUnit(nil)
  f[key].frame:Hide()
  table.insert(NP.spare[key], f[key])
  addRow(f, key)
  NP.UpdateAuras(f, f.unit)
end

-- After a fight: plates first drawn in it got the fallback icons, so give
-- them the client's own aura containers now that they can be made.
local function upgradeRows()
  if not ns.AuraEngine.Available() then return end
  for _, f in ipairs(NP.built) do
    for key in pairs(ROW_SPECS) do
      if f[key] and not f[key .. "OnEngine"] then upgradeRow(f, key) end
    end
  end
end

-- Builds the plate frames ahead (out of combat, at login), hidden until a
-- plate takes one; none on a client without nameplates for addons.
function NP.FillPool()
  if type(_G.C_NamePlate) ~= "table" then return end
  NP.holder = NP.holder or CreateFrame("Frame")
  NP.holder:Hide()
  for _ = #NP.pool + 1, NP.POOL do NP.pool[#NP.pool + 1] = build(NP.holder) end
end

-- A frame for a plate: one built ahead while any is left, else a new one, moved onto the plate.
local function claim(plate)
  local f = table.remove(NP.pool) or build(plate)
  f:SetParent(plate)
  f:ClearAllPoints()
  f:SetPoint("CENTER", plate)
  return f
end

-- Points a plate's click area at our name and bar (f.hit), where the client
-- lets it change now: for addon code in combat, only on the tick a unit is
-- first given to the plate. The client clamps it to the plate's own bounds
-- (some 230 wide, 152 in the classic style), so at the widest bar on classic
-- plates the outer few pixels can't be clicked. Nothing on a client without it.
function NP.ApplyHitArea(plate)
  local f = plate and vgPlate[plate]
  if not f or not f.unit or type(plate.CanChangeHitTestPoints) ~= "function" or not plate:CanChangeHitTestPoints() then return end
  ns.Try("nameplate click area", plate.SetAllHitTestPoints, plate, f.hit)
end

-- Has the client stack a plate by our name and bar rather than its own taller
-- frame; tried again on the plate's next unit if the client refused it.
local function stackByHitArea(plate)
  if vgStacked[plate] or type(plate.SetStackingBoundsFrame) ~= "function" then return end
  vgStacked[plate] = (pcall(plate.SetStackingBoundsFrame, plate, vgPlate[plate].hit))
end

-- A plate given a unit: the client stacks it by our box, and clicks land in it.
local function takeHitArea(plate)
  stackByHitArea(plate)
  NP.ApplyHitArea(plate)
end

-- The client's own frame set its plate's click area around its own (hidden)
-- name and bar, or cleared it for a name-only friendly player: put ours back.
-- The client moves its frames between plates, so the plate is asked each time.
local function reapplyHitArea(uf)
  NP.ApplyHitArea(type(uf.GetNamePlateFrame) == "function" and uf:GetNamePlateFrame() or uf:GetParent())
end

-- Hides the client's own frame on a plate, and keeps it hidden, and its
-- click area ours.
local function hideDefault(plate)
  local uf = plate.UnitFrame
  if type(uf) ~= "table" or not uf.Hide then return end
  uf:Hide()
  if not vgHooked[uf] then
    vgHooked[uf] = true
    uf:HookScript("OnShow", uf.Hide)
    if type(uf.UpdateHitTestArea) == "function" then hooksecurefunc(uf, "UpdateHitTestArea", ns.Guard("hook UpdateHitTestArea", reapplyHitArea)) end
  end
end

-- Personal resource display ----------------------------------------------------------------

-- The bars of the game's personal resource display (PersonalResourceDisplayFrame, the health
-- and power bars under your character with the game's nameplateShowSelf setting on): the keys
-- from the display to each bar.
NP.PRD_BARS = { { "HealthBarsContainer", "healthBar" }, { "PowerBar" }, { "AlternatePowerBar" } }
-- The value texts on each of those bars (the game's TextStatusBar template).
NP.PRD_TEXTS = { "TextString", "LeftText", "RightText" }

-- A bar's content textures, kept as its art fades: the fill, and the heal, absorb and cost
-- predictions the game draws over it (everything but its background layer, which is the art).
local function barContent(bar)
  local keep = {}
  for _, region in ipairs({ bar:GetRegions() }) do
    if region.GetDrawLayer and region:GetDrawLayer() ~= "BACKGROUND" then keep[region] = true end
  end
  return keep
end

-- One of the display's bars in the plate look: its backdrop art faded, the theme's bar texture
-- on a flat inset panel, its value texts in the plate font. The game keeps its colour, values and size.
local function dressResourceBar(bar)
  T.FadeRegions(bar, barContent(bar))
  T.HudPanel(T.StyleBar(bar), { inset = true })
  for _, key in ipairs(NP.PRD_TEXTS) do
    if type(bar[key]) == "table" and bar[key].SetFont then T.Text(bar[key], "world", false) end
  end
end

-- One of the display's bars by its keys, or nil where this client's display lacks it.
local function resourceBar(frame, keys)
  local bar = frame[keys[1]]
  if keys[2] and type(bar) == "table" then bar = bar[keys[2]] end
  if type(bar) == "table" and bar.SetStatusBarTexture then return bar end
  return nil
end

-- The game's personal resource display in the plate look: each bar this client has. Safe to
-- run again and cheap, so it runs on every show in case a client resets a bar's art between fights.
function NP.SkinPersonalResources(frame)
  for _, keys in ipairs(NP.PRD_BARS) do
    local bar = resourceBar(frame, keys)
    if bar then dressResourceBar(bar) end
  end
end

-- Dresses the game's personal resource display (where this client has it) now and on every show.
local function watchPersonalResources()
  local frame = _G.PersonalResourceDisplayFrame
  if type(frame) ~= "table" or not frame.HookScript then return end
  NP.SkinPersonalResources(frame)
  frame:HookScript("OnShow", ns.Guard("show personal resources", NP.SkinPersonalResources))
end

-- Updating ---------------------------------------------------------------------------------

-- The level left of the name, where it's switched on.
local function updateLevel(f, unit)
  if NP.settings.level then return UF.PaintLevel(f.level, unit) end
  f.level:SetText("")
end

-- The health numbers' text, on a plate that shows them (NP.PaintNumbers decides that): the
-- health path reads no setting and makes no closure. Hidden numbers go to the text as they are.
function NP.UpdateNumbers(f, unit)
  if not f.vgNumbers then return end
  if NP.info.percent then f.healthPercent:SetText(UF.PercentText(unit)) end
  if NP.info.value then f.healthValue:SetText(UF.ShortNumber(UnitHealth(unit))) end
end

-- The bar's fill (health goes to the bar as the client gives it, hidden or not), and the numbers on it.
function NP.UpdateHealth(f, unit)
  f:SetMinMaxValues(0, UnitHealthMax(unit))
  T.SetBarValue(f, UnitHealth(unit))
  NP.UpdateNumbers(f, unit)
end

-- Whether a plate shows health numbers: a unit you can attack (a hidden answer counts as no),
-- with one of the game's bits on, on a plate tall enough.
local function wantsNumbers(unit)
  local can = type(UnitCanAttack) == "function" and UnitCanAttack("player", unit)
  local enemy = not ns.IsSecret(can) and can == true
  return enemy and (NP.info.percent or NP.info.value) and NP.settings.height >= NP.NUMBERS_MIN_HEIGHT
end

-- The value sits at the bar's right end, or left of the percent while that shows.
local function placeValue(f)
  f.healthValue:ClearAllPoints()
  if NP.info.percent then return f.healthValue:SetPoint("RIGHT", f.healthPercent, "LEFT", -3, 0) end
  f.healthValue:SetPoint("RIGHT", f, "RIGHT", -2, 0)
end

-- Works out whether a plate shows health numbers (when it is drawn, its unit's faction changes,
-- or the game's setting does), places and shows them, and fills them in.
function NP.PaintNumbers(f, unit)
  f.vgNumbers = wantsNumbers(unit) == true
  f.healthPercent:SetShown(f.vgNumbers and NP.info.percent)
  f.healthValue:SetShown(f.vgNumbers and NP.info.value)
  placeValue(f)
  NP.UpdateNumbers(f, unit)
end

-- The bar's color: tapped grey, threat, class or reaction (see NP.Color).
function NP.UpdateColor(f, unit)
  f:SetStatusBarColor(NP.Color(unit))
end

-- The name, and the level left of it.
function NP.UpdateName(f, unit)
  f.name:SetText(UnitName(unit))
  updateLevel(f, unit)
end

-- The raid target icon left of the plate.
function NP.UpdateIcon(f, unit)
  RS.PaintIcon(f.raidIcon, RS.RaidIcon(unit))
end

-- Your target's accent border, glow and marker. They are repainted only when
-- the plate's target state or its scale (the pixel size of the edge and the
-- glow) changed since they were last painted, or when `force` says the theme did.
function NP.UpdateTarget(f, unit, force)
  local target, scale = NP.settings.targetBorder and isUnit(unit, "target") or false, f:GetEffectiveScale()
  if not force and target == f.vgTarget and scale == f.vgScale then return end
  f.vgTarget, f.vgScale = target, scale
  T.SetBorder(f, target and { T.Accent() } or nil)
  T.SizeGlow(f.glow, f, NP.GLOW)
  T.ShowGlow(f.glow, target)
  f.marker:SetShown(target)
  if target then T.Tint(f.marker, "accent") end
end

-- Repaints a plate's target border, glow and marker whatever its state (the accent changed).
local function repaintTarget(f, unit)
  NP.UpdateTarget(f, unit, true)
end

-- Health bar, color, name and level, raid icon, and your target's border, glow and marker.
function NP.Update(f, unit)
  NP.UpdateHealth(f, unit)
  NP.UpdateColor(f, unit)
  NP.UpdateName(f, unit)
  NP.UpdateIcon(f, unit)
  NP.UpdateTarget(f, unit)
end

-- Shows a plate's quest mark while the unit is one your quests need (and the marks are on).
function NP.PaintQuest(f, unit)
  f.quest:SetShown(NP.settings.questMarks == true and NP.QuestUnit(unit))
end

-- Paints a plate's tag mark for whoever tagged its unit (none while the marks are off), and its bar,
-- which goes grey on another player's mob.
function NP.PaintTag(f, unit)
  UF.PaintTagMark(f.tag, NP.settings.tagMarks == true and UF.TagState(unit) or nil)
  NP.UpdateColor(f, unit)
end

-- Points the debuff row at the plate's unit (the client reuses plates for
-- other units), and the buff row at it while it is a player; the buff row is
-- hidden otherwise. A nil unit empties both.
function NP.UpdateAuras(f, unit)
  f.debuffs:SetUnit(unit)
  if not f.buffs then return end
  local player = NP.BuffUnit(unit)
  f.buffs:SetUnit(player)
  f.buffs.frame:SetShown(player ~= nil)
end

-- Shows a plate's mouseover wash while the mouse is over its unit; true when shown.
function NP.UpdateHover(f, unit)
  local on = isUnit(unit, "mouseover")
  f.hover:SetShown(on)
  return on
end

-- Everything on one plate (a plate under the mouse wakes the mouseover watch).
local function refresh(f, unit)
  NP.PaintNumbers(f, unit)
  NP.Update(f, unit)
  NP.PaintQuest(f, unit)
  NP.PaintTag(f, unit)
  NP.UpdateAuras(f, unit)
  if NP.UpdateHover(f, unit) then NP.WatchHover(true) end
  if f.cast then CB.Show(f.cast, unit) end
end

-- Runs fn(frame, unit) for every plate we drew on.
local function each(fn)
  for unit, f in pairs(NP.plates) do fn(f, unit) end
end

-- Repaints everything on every plate on screen, as a live setting changed (levels,
-- threat colors, the target border, quest marks): the options and Situations call it.
function NP.RefreshAll()
  each(refresh)
end

-- Whether one of the game's Info display bits is on; a client without the setting, or no answer, is off.
local function infoBit(key)
  local get, kinds = C_CVar and C_CVar.GetCVarBitfield, Enum and Enum.NamePlateInfoDisplay
  if type(get) ~= "function" or type(kinds) ~= "table" or not kinds[key] then return false end
  return get(NP.INFO_CVAR, kinds[key]) == true
end

-- Reads the game's health number bits again (at login, and after any game setting changed)
-- and repaints the numbers on every plate.
function NP.ReadInfoDisplay()
  NP.info.percent, NP.info.value = infoBit("CurrentHealthPercent"), infoBit("CurrentHealthValue")
  each(NP.PaintNumbers)
end

-- Events -----------------------------------------------------------------------------------

-- A nameplate appeared: draw on it (once per plate, with a frame built ahead) and fill it in.
local function onAdded(_, unit)
  local plate = NP.PlateFor(unit)
  if not plate then return end
  vgPlate[plate] = vgPlate[plate] or claim(plate)
  hideDefault(plate)
  NP.plates[unit] = vgPlate[plate]
  vgPlate[plate].unit = unit
  takeHitArea(plate)
  ns.SetUnits(vgPlate[plate].events, unit)
  vgPlate[plate]:Show()
  refresh(vgPlate[plate], unit)
end

-- A nameplate went away: forget it (the client reuses the plate).
local function onRemoved(_, unit)
  local f = NP.plates[unit]
  if f then f:Hide(); f.unit = nil; NP.UpdateAuras(f, nil); ns.SetUnits(f.events) end
  NP.plates[unit] = nil
end

-- After a login or reload: pick up the plates already on screen.
local function scan()
  for i = 1, 40 do
    local unit = "nameplate" .. i
    if UnitExists(unit) and not NP.plates[unit] then onAdded(nil, unit) end
  end
end

-- Shows the unit's cast under its plate, where the plate has a cast bar.
local function showCast(f, unit)
  if f.cast then CB.Show(f.cast, unit) end
end

-- A plate's unit event -> what it repaints on that plate. Each plate asks the
-- client for its own unit's events only (ns.OnUnit), so 30 plates don't each
-- hear the other 29 (or the raid's).
-- A plate's unit changed faction: its tag mark and bar, and whether it shows health numbers (it may now be an enemy).
local function onFaction(f, unit)
  NP.PaintTag(f, unit)
  NP.PaintNumbers(f, unit)
end

-- Health moves the fill and its numbers only; threat, flags and faction (a tap change can come as any) repaint the tag mark and the bar.
local UNIT_HANDLERS = {
  UNIT_HEALTH = NP.UpdateHealth, UNIT_MAXHEALTH = NP.UpdateHealth, UNIT_NAME_UPDATE = NP.UpdateName,
  UNIT_FACTION = onFaction, UNIT_THREAT_LIST_UPDATE = NP.PaintTag,
  UNIT_FLAGS = NP.PaintTag, UNIT_LEVEL = NP.UpdateName,
}
for _, event in ipairs(CB.EVENTS) do UNIT_HANDLERS[event] = showCast end
NP.UNIT_EVENTS = {}
for event in pairs(UNIT_HANDLERS) do table.insert(NP.UNIT_EVENTS, event) end

-- A unit event for a plate's unit: repaint what it changed on that plate.
function NP.OnUnitEvent(event, unit)
  local f = NP.plates[unit]
  if f then UNIT_HANDLERS[event](f, unit) end
end

-- The mouse moved onto a unit: wash the plate it is over (if any), and watch
-- for it leaving, which the client sends no event for.
local function onMouseover()
  local any = false
  for unit, f in pairs(NP.plates) do any = NP.UpdateHover(f, unit) or any end
  NP.WatchHover(any)
end

-- While a wash shows: clears the washes once the mouse is over no unit (a
-- hidden answer counts as none), and stops watching.
local function pollHover()
  local over = UnitExists("mouseover")
  if not ns.IsSecret(over) and over == true then return end
  each(function(f) f.hover:Hide() end)
  NP.WatchHover(false)
end

-- Starts (or stops) the mouseover watch: a look every NP.HOVER_POLL seconds.
function NP.WatchHover(on)
  ns.Every("nameplate hover", on and NP.HOVER_POLL or nil, pollHover)
end

-- Your quests changed (the log, or a unit's quest progress): repaint every plate's quest mark on the next frame.
function NP.QuestsChanged()
  ns.Soon("nameplate quest marks", function() each(NP.PaintQuest) end)
end

-- Event -> handler.
local EVENTS = {
  PLAYER_ENTERING_WORLD = scan,
  NAME_PLATE_UNIT_ADDED = onAdded, NAME_PLATE_UNIT_REMOVED = onRemoved,
  PLAYER_TARGET_CHANGED = function() each(NP.UpdateTarget) end, RAID_TARGET_UPDATE = function() each(NP.UpdateIcon) end,
  -- Your new level changes how hard every unit is for you.
  PLAYER_LEVEL_UP = function() each(NP.UpdateName) end,
  PLAYER_REGEN_ENABLED = upgradeRows, UPDATE_MOUSEOVER_UNIT = onMouseover,
  -- Joining or leaving the tagger's group changes who tagged each mob.
  GROUP_ROSTER_UPDATE = function() each(NP.PaintTag) end,
  -- Your quests changed: which units they need may have too.
  QUEST_LOG_UPDATE = NP.QuestsChanged, UNIT_QUEST_LOG_CHANGED = NP.QuestsChanged,
  -- A game setting changed: maybe the Info display's health numbers.
  CVAR_UPDATE = NP.ReadInfoDisplay,
}

-- Module entry point (Core/Modules.lua): builds the plate frames ahead, out of combat, and
-- dresses the game's personal resource display.
function NP.Enable(settings)
  NP.settings = settings
  NP.ReadInfoDisplay()
  ns.OutOfCombat(NP.FillPool)
  NP.EnemyPlatesOnce()
  watchPersonalResources()
  for event, fn in pairs(EVENTS) do ns.On(event, fn) end
  T.OnChanged(function() each(repaintTarget) end)
end

-- Slash -------------------------------------------------------------------------------------

-- A game setting as "on", "off" or "unknown" (a client without it, or a hidden answer).
local function cvarState(name)
  local v = type(GetCVar) == "function" and GetCVar(name) or nil
  if ns.IsSecret(v) or v == nil then return "unknown" end
  return (v == "1" or v == 1) and "on" or "off"
end

-- How many plates we dressed, and how many of those are units you can attack.
local function countPlates()
  local total, enemies = 0, 0
  for unit in pairs(NP.plates) do
    total = total + 1
    local can = UnitCanAttack("player", unit)
    if not ns.IsSecret(can) and can == true then enemies = enemies + 1 end
  end
  return total, enemies
end

-- Sets one of the game's own plate settings (a CVar) to on or off, once out of combat;
-- a client without SetCVar changes nothing.
local function setGameSetting(name, on)
  if type(SetCVar) ~= "function" then return end
  ns.OutOfCombat(function() SetCVar(name, on and 1 or 0) end, "plates " .. name)
end

-- /vg plates enemies on|off: the game's own enemy plate setting, once out of combat.
local function setEnemies(on)
  setGameSetting("nameplateShowEnemies", on)
  ns.Chat("Enemy nameplates " .. (on and "on" or "off") .. (ns.InCombat() and " after the fight." or "."))
end

-- Turns the game's enemy plates on once per character (#377: the game ships them off, so
-- Vanguard had nothing to dress); after that the V key and the Nameplates page decide.
function NP.EnemyPlatesOnce()
  if type(VanguardCharDB) ~= "table" or VanguardCharDB.enemyPlatesSet then return end
  VanguardCharDB.enemyPlatesSet = true
  setGameSetting("nameplateShowEnemies", true)
end

-- get/set for a check row on one of the game's own plate settings (the V and Shift-V keys).
function NP.GameSetting(name)
  return function() return cvarState(name) == "on" end, function(v) setGameSetting(name, v) end
end

-- /vg plates: what the game's plate settings are and how many plates Vanguard drew (#377).
-- Vanguard dresses every plate the game makes, so no enemy plate means the game made none.
function NP.Command(rest)
  if rest == "enemies on" or rest == "enemies off" then return setEnemies(rest == "enemies on") end
  local total, enemies = countPlates()
  ns.Chat(("Plates: %d drawn, %d of them units you can attack. Game's Enemy nameplates %s, Friendly players %s, Friendly NPCs %s, Show all %s."):format(total, enemies,
    cvarState("nameplateShowEnemies"), cvarState("nameplateShowFriendlyPlayers"), cvarState("nameplateShowFriendlyNPCs"), cvarState("nameplateShowAll")))
  if cvarState("nameplateShowEnemies") == "off" then
    ns.Chat("The game draws no enemy plates, so there is nothing to dress. Turn on Enemy nameplates in /vg > Nameplates, or press V.")
  end
end

-- Options ------------------------------------------------------------------------------------

-- get/set for one of this module's settings, and its default; reload says it applies after a reload.
local function setting(key, reload)
  return ns.Options.Tag(function() return ns.Settings("Nameplates", NP.defaults)[key] end, "Nameplates", key),
    function(v)
      ns.Settings("Nameplates", NP.defaults)[key] = v
      if reload then ns.Options.NeedReload() else NP.RefreshAll() end
    end, NP.defaults[key]
end

-- Whether the client has the game's Info display setting (a client without it gets no rows for
-- it): reading one of its bits answers nil there.
local function hasInfoDisplay()
  local get = C_CVar and C_CVar.GetCVarBitfield
  return type(get) == "function" and get(NP.INFO_CVAR, 1) ~= nil
end

-- Sets one of the game's Info display bits, once out of combat, then reads them all again
-- (Vanguard writes it only when you tick its row).
local function setInfoBit(key, on)
  local set, kinds = C_CVar and C_CVar.SetCVarBitfield, Enum and Enum.NamePlateInfoDisplay
  if type(set) ~= "function" or type(kinds) ~= "table" or not kinds[key] then return end
  ns.OutOfCombat(function() set(NP.INFO_CVAR, kinds[key], on); NP.ReadInfoDisplay() end, "plates " .. key)
end

-- get/set for a check row on one of the game's Info display bits.
function NP.InfoSetting(key)
  return function() return infoBit(key) end, function(v) setInfoBit(key, v) end
end

-- The game's own plate settings Vanguard mirrors: which plates it draws (the V and Shift-V keys)
-- and, where the client has them, the Info display's health numbers.
function NP.GameRows()
  local rows = { { "check", "Enemy nameplates (the game's setting, the V key)", NP.GameSetting("nameplateShowEnemies") }, { "check", "Friendly players' nameplates (the game's setting)", NP.GameSetting("nameplateShowFriendlyPlayers") }, { "check", "Friendly NPCs' nameplates (the game's setting)", NP.GameSetting("nameplateShowFriendlyNPCs") } }
  if not hasInfoDisplay() then return rows end
  rows[#rows + 1] = { "check", "Health percent on enemy plates (the game's setting)", NP.InfoSetting("CurrentHealthPercent") }
  rows[#rows + 1] = { "check", "Health value on enemy plates (the game's setting)", NP.InfoSetting("CurrentHealthValue") }
  return rows
end

-- This module's own rows: looks first, then debuffs, buffs and size (after a reload).
local function lookRows()
  return {
    { "check", "Levels, colored by how hard the unit is for you", setting("level") },
    { "check", "Threat colors while you have aggro", setting("threat") },
    { "check", "Accent border, glow and marker on your target", setting("targetBorder") }, { "check", "Cast bar", setting("castBar", true) },
    { "check", "A gold ! by units your quests need", setting("questMarks") }, { "check", "Tag marks: a green check on mobs you tagged, a grey X and grey bar on another player's", setting("tagMarks") },
    { "cycle", "Your debuffs shown", { { 0, "none" }, { 4, "4" }, { 6, "6" } }, setting("debuffs", true) }, { "cycle", "Buffs on players (defensives, and yours on friends)", { { 0, "none" }, { 3, "3" }, { 5, "5" } }, setting("buffs", true) },
    { "check", "Timer numbers on your debuffs (reload)", setting("timers", true) },
    { "cycle", "Width", { { 110, "110" }, { 130, "130" }, { 160, "160" } }, setting("width", true) }, { "cycle", "Height", { { 8, "8" }, { 10, "10" }, { 14, "14" } }, setting("height", true) } }
end

-- The Nameplates page: the game's plate settings it mirrors, then this module's own.
function NP.OptionRows()
  local rows = { { "header", "Nameplates" }, { "text", "Turn the whole module off under Modules to keep the default plates." } }
  for _, row in ipairs(NP.GameRows()) do rows[#rows + 1] = row end
  for _, row in ipairs(lookRows()) do rows[#rows + 1] = row end
  return rows
end

ns.Options.AddPage({
  key = "nameplates",
  title = "Nameplates",
  icon = "NavNameplates",
  order = 65,
  rows = function() return NP.OptionRows() end,
})
