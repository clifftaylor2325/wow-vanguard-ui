-- Cast bars for you, your target, your focus and your pet: spell icon, name, the
-- bar filling as the cast goes (emptying for a channel), gray when the cast
-- can't be interrupted. Each is movable in unlock mode. The game's cast bar
-- over the professions window while crafting is kept, in the theme.
--
-- Timing: where the client gives a cast duration object and the bar can
-- run it (StatusBar:SetTimerDuration), the client animates the bar itself,
-- hidden values and all. Otherwise start/end times in milliseconds drive it,
-- when they're plain numbers; if they're hidden, the bar shows full with
-- the spell's name and icon.
--
-- The cursor ring (off by default): two thin rings at the mouse, the outer one
-- sweeping the global cooldown and the inner one your own cast (filling as it goes,
-- emptying for a channel). Both are cooldown sweeps handed the client's duration
-- objects, so nothing is read or compared when the client hides the times. The ring
-- follows the cursor only while it shows, takes no mouse input, and has no fade.

-- The interrupt mark (on by default): beside the target's and the focus's cast bar, a
-- small diamond while the cast can be interrupted and you know an interrupt: filled
-- and bright when it is ready, hollow and dim while it recovers. The client's duration
-- object for the spell goes straight to a cooldown sweep over the diamond's core, so
-- nothing is compared when the client hides the cooldown or whether the cast can be
-- interrupted (that goes to the mark's opacity as it is). No fade; the mark goes with the bar.

-- Empowered casts (Retail's Evoker): the client reports them as channels with stages. Their bar fills
-- as a cast does, to the end of the hold at the last stage, with a thin mark where each stage ends
-- (from plain stage times only). WoW Forever has none, and doesn't listen for them.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgSkinned = ns.FrameState("vgSkinned")

local T = ns.Theme
local L = ns.L

local CB = ns.Module("CastBars", {
  defaults = { player = true, target = true, focus = true, hideBlizzard = true, interruptMark = true, ring = false },
})

-- Unit -> mover label, size and default point (the Centered layout; Modules/UnitFrames.lua).
local LAYOUT = {
  -- Yours: centered just above the action bars, between the player and target frames (CB.PlayerPoint
  -- moves it up with the bars' stack; this is its spot over the default three bars).
  player = { label = L["Player cast bar"], w = 220, h = 18, point = { "BOTTOM", "BOTTOM", 0, 146, underFrames = true } },
  -- The target's sits over its buff row (Modules/FrameAuras.lua), the focus's over the focus frame.
  target = { label = L["Target cast bar"], w = 240, h = 16, point = { "BOTTOM", "BOTTOM", 240, 262 } },
  focus = { label = L["Focus cast bar"], w = 160, h = 14, point = { "BOTTOM", "BOTTOM", -270, 324 } },
  -- Your pet's, small, just left of the pet frame, between the combo points and the focus's debuffs
  -- (built only while the game's bars are put away).
  pet = { label = L["Pet cast bar"], w = 100, h = 10, point = { "BOTTOM", "BOTTOM", -300, 252 } },
}
-- The bars that get the interrupt mark: casts you might interrupt (never yours or your pet's).
CB.MARKED = { target = true, focus = true }
-- The default sizes and points, for layouts placed around them (Core/Setup.lua).
CB.LAYOUT = LAYOUT
-- The game's own cast bars (their 12.x names), put away for good while the hideBlizzard setting is on (the default).
local BLIZZARD = { "PlayerCastingBarFrame", "PetCastingBarFrame" }
-- The art on the game's overlay cast bar (OverlayPlayerCastingBarFrame, CastingBarFrame.xml),
-- faded by alpha; its finish flash is hidden instead (the game animates the flash's alpha).
CB.OVERLAY_ART = { "Border", "Background", "TextBorder", "DropShadow" }

CB.bars = {}

-- Reading casts -----------------------------------------------------------------------

-- The unit's cast from UnitCastingInfo as CB.Cast's values, or nothing when there is none. The uninterruptible
-- flag is its 8th return.
local function castInfo(unit)
  local get = _G.UnitCastingInfo
  if type(get) ~= "function" then return nil end
  local name, _, icon, startMS, endMS, _, _, shielded = get(unit)
  if type(name) == "nil" then return nil end
  return name, icon, startMS, endMS, shielded, false
end

-- An empowered cast's end with its hold at the last stage added, as the client's own bar adds it (when both are plain).
local function withHold(unit, endMS)
  local plainEnd, hold = ns.PlainNumber(endMS), ns.PlainNumber(GetUnitEmpowerHoldAtMaxTime(unit))
  if not plainEnd or not hold then return endMS end
  return plainEnd + hold
end

-- The unit's channel from UnitChannelInfo as CB.Cast's values, or nothing when there is none. The uninterruptible
-- flag is its 7th return and the stages of an empowered cast its 10th (never hidden): that one fills as a cast.
local function channelInfo(unit)
  local get = _G.UnitChannelInfo
  if type(get) ~= "function" then return nil end
  local name, _, icon, startMS, endMS, _, shielded, _, _, stages = get(unit)
  if type(name) == "nil" then return nil end
  if type(stages) == "number" and stages > 0 then return name, icon, startMS, withHold(unit, endMS), shielded, false, stages end
  return name, icon, startMS, endMS, shielded, true
end

-- The unit's current cast or channel as values (no table each time it's
-- asked): name, icon, startMS, endMS, shielded, channel, and an empowered
-- cast's stages; nil when there is none. (Checked with type() so a hidden
-- name is never tested for truth.)
function CB.Cast(unit)
  local name, icon, startMS, endMS, shielded, channel = castInfo(unit)
  if type(name) ~= "nil" then return name, icon, startMS, endMS, shielded, channel end
  return channelInfo(unit)
end

-- Whether the unit is casting or channeling.
local function casting(unit)
  return type((CB.Cast(unit))) ~= "nil"
end

-- A plain true (hidden counts as false).
local function isTrue(v)
  return not ns.IsSecret(v) and v == true
end

-- The client's call for a cast's duration object: an empowered cast's includes its hold at the last stage.
local function durationCall(channel, stages)
  if stages then return _G.UnitEmpoweredChannelDuration end
  return channel and _G.UnitChannelDuration or _G.UnitCastingDuration
end

-- The client's duration object for a cast, where it has one.
local function castDuration(unit, channel, stages)
  local get = durationCall(channel, stages)
  if type(get) ~= "function" then return nil end
  local ok, d = pcall(get, unit)
  return ok and d or nil
end

-- Showing ----------------------------------------------------------------------------

-- Shows seconds left ("2.4") on a font string, formatting only when the text
-- would read differently: the key changes exactly when "%.1f" would (a value
-- on a half tenth gets a key of its own, so the rounding there stays the
-- formatter's). Saves a new string per bar per frame. Plain numbers only.
function CB.ShowSeconds(fs, seconds)
  local t = seconds * 10 + 0.5
  local key = math.floor(t)
  if key == t then key = -key - 1 end
  if key == fs.vgTenth then return end
  fs.vgTenth = key
  fs:SetText(string.format("%.1f", seconds))
end

-- Clears a font string CB.ShowSeconds writes to, so the next call writes again.
function CB.ClearSeconds(fs)
  fs.vgTenth = nil
  fs:SetText("")
end

-- Moves the bar by plain times and shows the seconds left; hidden times leave it full.
local function onUpdate(bar)
  local startMS, endMS = ns.PlainNumber(bar.startMS), ns.PlainNumber(bar.endMS)
  if not startMS or not endMS or endMS <= startMS then return end
  local now = GetTime() * 1000
  local share = math.max(0, math.min(1, (now - startMS) / (endMS - startMS)))
  bar:SetValue(bar.channel and (1 - share) or share)
  CB.ShowSeconds(bar.time, math.max(0, endMS - now) / 1000)
end

-- Your latency in ms (to the world server, else home), or nil where the client can't say.
local function latency()
  if type(GetNetStats) ~= "function" then return nil end
  local _, _, home, world = GetNetStats()
  return ns.PlainNumber(world) or ns.PlainNumber(home)
end

-- Your own latency at the end of your cast bar (plain times only): the part
-- of the cast the server may already count as done, so you can queue the next.
local function showLatency(bar, startMS, endMS, channel)
  startMS, endMS = ns.PlainNumber(startMS), ns.PlainNumber(endMS)
  local lag = latency()
  bar.lag:SetShown(bar.unit == "player" and not channel and lag ~= nil and startMS ~= nil and endMS ~= nil and endMS > startMS)
  if bar.lag:IsShown() then bar.lag:SetWidth(bar:GetWidth() * math.min(1, lag / (endMS - startMS))) end
end

-- How the client's timer fills the bar: at once (no easing), by the time gone for a
-- cast and by the time left for a channel, so a channel empties as it does on plain
-- times. Its default is the time gone (SimpleStatusBarAPIDocumentation, SetTimerDuration).
local function timerArgs(channel)
  local dirs, ease = Enum and Enum.StatusBarTimerDirection, Enum and Enum.StatusBarInterpolation
  return ease and ease.Immediate, dirs and (channel and dirs.RemainingTime or dirs.ElapsedTime)
end

-- Writes only the seconds left while the client's timer fills the bar (plain times only).
local function tickSeconds(bar)
  local endMS = ns.PlainNumber(bar.endMS)
  if endMS then CB.ShowSeconds(bar.time, math.max(0, endMS - GetTime() * 1000) / 1000) end
end

-- Hands the bar to the client's timer; false where the client has none or the bar won't take it.
local function runTimer(bar, unit, channel, stages)
  local duration = castDuration(unit, channel, stages)
  return duration ~= nil and bar.SetTimerDuration ~= nil and pcall(bar.SetTimerDuration, bar, duration, timerArgs(channel))
end

-- Starts the bar's timing: the client's own timer where it can (the seconds still ticked from plain
-- times), else plain times on each frame.
local function startTiming(bar, unit, startMS, endMS, channel, stages)
  CB.ClearSeconds(bar.time)
  showLatency(bar, startMS, endMS, channel)
  bar.startMS, bar.endMS, bar.channel = startMS, endMS, channel
  if runTimer(bar, unit, channel, stages) then
    return bar:SetScript("OnUpdate", ns.PlainNumber(startMS) and ns.PlainNumber(endMS) and tickSeconds or nil)
  end
  bar:SetMinMaxValues(0, 1)
  bar:SetValue(1)
  bar:SetScript("OnUpdate", onUpdate)
end

-- Colors a bar whose uninterruptible flag the client hides: the client picks between the shielded
-- color and the cast's own, since Lua cannot branch on a hidden flag. Without that call, the cast's own.
local function paintHiddenKind(bar, shielded, channel)
  local pick = C_CurveUtil and C_CurveUtil.EvaluateColorFromBoolean
  local own = channel and "channel" or "cast"
  if type(pick) ~= "function" or type(CreateColor) ~= "function" then return T.BarColor(bar, own) end
  bar:SetStatusBarColor(pick(shielded, CreateColor(T.RGB("shielded")), CreateColor(T.RGB(own))):GetRGB())
end

-- A bar's fill color for a cast: shielded, or the cast's or channel's own.
local function paintKind(bar, shielded, channel)
  if ns.IsSecret(shielded) then return paintHiddenKind(bar, shielded, channel) end
  T.BarColor(bar, isTrue(shielded) and "shielded" or channel and "channel" or "cast")
end

-- A cast's look on its bar: the color and edge for its kind, its icon and name. A hidden flag gets no
-- edge (an edge cannot follow it).
local function paintCast(bar, name, icon, shielded, channel)
  paintKind(bar, shielded, channel)
  T.SetBorder(bar, isTrue(shielded) and "shielded" or nil)
  bar.icon:SetTexture(icon)
  bar.text:SetText(name)
end

-- The share of an empowered cast's time at the end of each of its stages, from plain times (none while any is hidden).
local function stageShares(unit, startMS, endMS, stages)
  local s, e = ns.PlainNumber(startMS), ns.PlainNumber(endMS)
  local shares, sum = {}, 0
  if not s or not e or e <= s then return shares end
  for i = 1, stages do
    local length = ns.PlainNumber(GetUnitEmpowerStageDuration(unit, i - 1))
    if not length then return {} end
    sum = sum + length
    shares[i] = sum / (e - s)
  end
  return shares
end

-- A thin light mark across a bar: where a stage of an empowered cast ends.
local function stageMark(bar)
  local m = T.Tint(T.Snap(bar:CreateTexture(nil, "ARTWORK", nil, 3)), "white", 0.8)
  m:SetTexture(T.WHITE)
  m:SetWidth(2 * T.Pixel(bar))
  return m
end

-- Puts one stage mark at its share of the bar's width, or hides it when that stage has none.
local function placeMark(bar, m, share)
  m:SetShown(share ~= nil)
  if share == nil then return end
  m:ClearAllPoints()
  m:SetPoint("TOP", bar, "TOPLEFT", bar:GetWidth() * share, 0)
  m:SetPoint("BOTTOM", bar, "BOTTOMLEFT", bar:GetWidth() * share, 0)
end

-- Marks where each stage of an empowered cast ends on its bar, and clears the marks for any other cast.
function CB.MarkStages(bar, unit, startMS, endMS, stages)
  if not stages and not bar.stageMarks then return end
  local shares = stages and stageShares(unit, startMS, endMS, stages) or {}
  bar.stageMarks = bar.stageMarks or {}
  for i = #bar.stageMarks + 1, #shares do bar.stageMarks[i] = stageMark(bar) end
  for i, m in ipairs(bar.stageMarks) do placeMark(bar, m, shares[i]) end
end

-- Shows the unit's cast on a bar made by CB.Build, or hides the bar when it isn't casting.
function CB.Show(bar, unit)
  local name, icon, startMS, endMS, shielded, channel, stages = CB.Cast(unit)
  local cast = type(name) ~= "nil"
  if not cast and bar.vgFinishing then return end
  if cast then bar.vgFinishing = nil T.StopFade(bar) end
  bar:SetShown(cast)
  if not cast then return bar:SetScript("OnUpdate", nil) end
  paintCast(bar, name, icon, shielded, channel)
  startTiming(bar, unit, startMS, endMS, channel, stages)
  CB.MarkStages(bar, unit, startMS, endMS, stages)
  if bar.mark then CB.PaintMark(bar, shielded) end
end

-- A cast ended on a showing bar: flash it full (good: green; otherwise red
-- with the reason), then fade it out. A new cast cancels the flash.
function CB.Finish(bar, reason)
  if not bar:IsShown() or bar.vgFinishing then return end
  bar.vgFinishing = true
  bar:SetScript("OnUpdate", nil)
  bar:SetMinMaxValues(0, 1)
  bar:SetValue(1)
  T.BarColor(bar, reason == "good" and "good" or "bad")
  if reason ~= "good" then bar.text:SetText(reason) end
  if bar.mark then bar.mark:Hide() end
  T.FadeOut(bar, 0.35, function() bar.vgFinishing = nil end)
end

-- Shows the unit's cast on its own bar (player, target, focus, pet), if it has one.
function CB.Update(unit)
  if CB.bars[unit] then CB.Show(CB.bars[unit], unit) end
end

-- Building ---------------------------------------------------------------------------

-- How far the text sits in from a bar's ends, and the room the seconds left keep at its right (units): a long
-- spell name (a translation runs longer) stops short of it, cut on one line, instead of running under it.
CB.TEXT_INSET, CB.TIME_ROOM = 4, 30

-- The icon to the left, the spell name on the bar and the seconds left at its right.
local function addParts(bar, h)
  bar.icon = T.Snap(T.Crop(bar:CreateTexture(nil, "ARTWORK")))
  bar.icon:SetSize(h, h)
  bar.icon:SetPoint("RIGHT", bar, "LEFT", -3, 0)
  local role = h >= 18 and "label" or "small"
  bar.text = T.Text(bar:CreateFontString(nil, "OVERLAY"), role)
  bar.text:SetPoint("LEFT", CB.TEXT_INSET, 0)
  ns.EndAt(bar.text, bar, CB.TEXT_INSET + CB.TIME_ROOM)
  bar.time = T.Text(bar:CreateFontString(nil, "OVERLAY"), role, "white")
  bar.time:SetPoint("RIGHT", -CB.TEXT_INSET, 0)
end

-- A soft spark riding the fill's edge, and the latency shade at the bar's end.
local function addSpark(bar)
  local fill = bar:GetStatusBarTexture()
  bar.spark = T.Tint(T.Spark(bar, 8), "white", 0.8)
  bar.spark:SetPoint("TOP", fill, "TOPRIGHT")
  bar.spark:SetPoint("BOTTOM", fill, "BOTTOMRIGHT")
  bar.lag = T.Tint(T.Snap(bar:CreateTexture(nil, "ARTWORK", nil, 2)), "shade")
  bar.lag:SetTexture(T.WHITE)
  bar.lag:SetPoint("TOPRIGHT"); bar.lag:SetPoint("BOTTOMRIGHT")
  bar.lag:Hide()
end

-- Makes a status bar a themed cast bar (w x h), hidden until CB.Show finds a cast.
function CB.Build(bar, w, h)
  bar:SetSize(w, h)
  T.StyleBar(bar)
  T.HudPanel(bar, { inset = true })
  addParts(bar, h)
  addSpark(bar)
  bar:Hide()
  return bar
end

-- The widths a cast bar may be given in unlock mode (matched to another frame, or set under
-- General → Layout); its height stays its own, as its icon and text are sized to it.
CB.WIDTHS = { 80, 600 }

-- The interrupt mark ---------------------------------------------------------------------

-- Interrupts by class: the families you may know (the one to use first first), each from its
-- highest rank down. Vanilla ranks, plus the retail classes' own (ids from live
-- Blizzard_CooldownBroadcaster/TrackedCooldowns.lua InterruptSpellsBySpec; Warlock's pet
-- interrupt is left out).
CB.INTERRUPTS = {
  -- Kick.
  ROGUE = { { 1769, 1768, 1767, 1766 } },
  -- Pummel, then Shield Bash.
  WARRIOR = { { 6554, 6552 }, { 1672, 1671, 72 } },
  -- Counterspell.
  MAGE = { { 2139 } },
  -- Wind Shear (the retail interrupt, which comes first so a retail Shaman is not given Earth Shock's
  -- shared shock cooldown), then Earth Shock.
  SHAMAN = { { 57994 }, { 10414, 10413, 10412, 8046, 8045, 8044, 8042 } },
  -- Silence (a talent).
  PRIEST = { { 15487 } },
  -- Retail: Mind Freeze.
  DEATHKNIGHT = { { 47528 } },
  -- Retail: Disrupt.
  DEMONHUNTER = { { 183752 } },
  -- Retail: Skull Bash, then Solar Beam (Balance).
  DRUID = { { 106839 }, { 78675 } },
  -- Retail: Counter Shot, then Muzzle (Survival).
  HUNTER = { { 147362 }, { 187707 } },
  -- Retail: Spear Hand Strike.
  MONK = { { 116705 } },
  -- Retail: Rebuke.
  PALADIN = { { 96231 } },
  -- Retail: Quell.
  EVOKER = { { 351338 } },
}

-- True unless the client plainly says the spell can't be cast now for a reason other than power (a stance or a
-- shield it needs); a hidden or missing answer counts as castable.
local function castableNow(id)
  local usable, noPower = ns.CallIf(C_Spell, "IsSpellUsable", id)
  if ns.IsSecret(usable) or ns.IsSecret(noPower) or usable == nil then return true end
  return usable == true or noPower == true
end

-- The best known rank of a family (its ranks run highest first), or nil.
local function bestKnown(family, known)
  for _, id in ipairs(family) do
    if known(id) then return id end
  end
end

-- The interrupt you know and would use: the first family with a rank you know and can cast now (stance, shield),
-- else the first you know, or nil.
function CB.InterruptSpell()
  local _, class = UnitClass("player")
  local known, fallback = ns.SpellKnownCall(), nil
  if not known then return nil end
  for _, family in ipairs(CB.INTERRUPTS[class] or {}) do
    local id = bestKnown(family, known)
    if id and castableNow(id) then return id end
    fallback = fallback or id
  end
  return fallback
end

-- Sweeps the mark from a spell's plain start and length when the client gives them; false when it hides them.
local function plainMark(cd, spell)
  local info = C_Spell and C_Spell.GetSpellCooldown and C_Spell.GetSpellCooldown(spell)
  if type(info) ~= "table" or ns.IsSecret(info) then return false end
  local start, length = ns.PlainNumber(info.startTime), ns.PlainNumber(info.duration)
  if not (start and length) then return false end
  if isTrue(info.isOnGCD) or length <= 0 then cd:Clear() else cd:SetCooldown(start, length) end
  return true
end

-- Sweeps the mark with the spell's cooldown (the global cooldown left out): the client's duration object where it
-- has one, else plain numbers; false when the client says neither.
function CB.SweepMark(cd, spell)
  local get = C_Spell and C_Spell.GetSpellCooldownDuration
  if type(get) == "function" and ns.Client.Has("cooldownObject") then
    local ok, object = pcall(get, spell, true)
    if ok and object ~= nil then cd:SetCooldownFromDurationObject(object) return true end
  end
  return plainMark(cd, spell)
end

-- Shows or hides the mark beside a bar, and sets how lit it is: nothing without an interrupt you know (or with the
-- switch off); gone while the cast can't be interrupted (a hidden answer goes to its opacity as it is).
function CB.PaintMark(bar, shielded)
  local mark, spell = bar.mark, CB.settings.interruptMark and CB.InterruptSpell()
  bar.vgShielded = shielded
  mark:SetShown(spell and CB.SweepMark(mark.cd, spell) or false)
  if ns.IsSecret(shielded) and mark.SetAlphaFromBoolean then return mark:SetAlphaFromBoolean(shielded, 0, 1) end
  mark:SetAlpha(isTrue(shielded) and 0 or 1)
end

-- Repaints the marks on the bars showing a cast (your interrupt's cooldown changed, or the switch did).
function CB.RefreshMarks()
  for _, bar in pairs(CB.bars) do
    if bar.mark and bar:IsShown() then CB.PaintMark(bar, bar.vgShielded) end
  end
end

-- One diamond of the mark, centred in its frame, size units across, in a colour.
local function diamond(parent, size, token)
  local d = T.Tint(parent:CreateTexture(nil, "ARTWORK"), token)
  d:SetTexture(T.Texture("Diamond"))
  d:SetSize(size, size)
  d:SetPoint("CENTER")
  return d
end

-- The sweep over the mark's core: dark, in the core's shape, plain and out of the mouse's way.
local function markSweep(mark, core)
  local cd = CreateFrame("Cooldown", nil, mark, "CooldownFrameTemplate")
  cd:SetAllPoints(core)
  cd:SetSwipeTexture(T.Texture("Diamond"))
  cd:SetSwipeColor(T.RGB("inset"))
  cd:SetDrawEdge(false)
  cd:SetDrawBling(false)
  cd:SetHideCountdownNumbers(true)
  cd:EnableMouse(false)
  return cd
end

-- The mark to the right of a cast bar h high: a muted diamond with an accent core, which the sweep darkens (hollow
-- against filled) while your interrupt recovers. Hidden until a cast shows it.
local function addMark(bar, h)
  local mark = CreateFrame("Frame", nil, bar)
  mark:SetSize(h, h)
  mark:SetPoint("LEFT", bar, "RIGHT", 3, 0)
  diamond(mark, h, "muted")
  mark.cd = markSweep(mark, diamond(mark, h - 6, "accent"))
  mark:Hide()
  bar.mark = mark
end

-- How far above the action bars' bottom stack your cast bar sits.
CB.ABOVE_BARS = 4

-- Your cast bar's default point: CB.ABOVE_BARS over the top of Vanguard's bottom action bar stack, which
-- grows with more bars or rows, so the bars never cover it; its layout point while those bars are off. It is
-- part of the block under your frames (Core/Layout.lua, HudLift).
function CB.PlayerPoint()
  local p, AB = LAYOUT.player.point, ns.GetModule("ActionBars")
  if not ns.ModuleLive("ActionBars") then return p end
  return { p[1], p[2], p[3], AB.StackTop(ns.Settings("ActionBars", AB.defaults)) + CB.ABOVE_BARS, underFrames = true }
end

-- Moves your cast bar's default point with the action bars' stack (a position you dragged it to still wins).
function CB.FitPlayer()
  ns.SetMoverDefault("cast_player", CB.PlayerPoint())
end

-- A themed cast bar for a unit, hidden until it casts; movable, and Vanguard may set its width. It
-- draws over the action bars (high strata), so a bar dragged over it never hides a cast.
local function createBar(unit)
  local def = LAYOUT[unit]
  local bar = CB.Build(CreateFrame("StatusBar", "Vanguard_CastBar_" .. unit, UIParent), def.w, def.h)
  bar.unit = unit
  bar:SetFrameStrata("HIGH")
  if CB.MARKED[unit] and ns.Client.Has("cooldownObject") then addMark(bar, def.h) end
  ns.Mover(bar, "cast_" .. unit, def.label, unit == "player" and CB.PlayerPoint() or def.point)
  ns.MoverSizable("cast_" .. unit, { width = CB.WIDTHS })
  return bar
end

-- Hides a default cast bar for good, as the unit frames hide the game's: no events, parented to a hidden frame, and
-- parked again when Edit Mode's layout apply hands it back to UIParent and shows it (UpdateShownState).
local function hideBlizzard(name)
  ns.GetModule("UnitFrames").HideBlizzard(name)
end

-- The game's overlay cast bar ---------------------------------------------------------

-- The color token for the overlay bar's fill: "cast" while casting; once full, "good", or "bad" when the
-- game has typed the cast Interrupted (it fills the bar for a failed cast too). A hidden type counts as good.
local function overlayKind(bar, full)
  if full ~= true then return "cast" end
  local barType, interrupted = bar.barType, CastingBarType and CastingBarType.Interrupted
  if interrupted ~= nil and not ns.IsSecret(barType) and barType == interrupted then return "bad" end
  return "good"
end

-- The overlay bar's look: the theme's bar texture in the cast color (good once the cast is
-- full, as Vanguard's own bar flashes), its art faded, its text in the theme font. The game
-- sets its own fill again at each cast's start and end (UpdateBarFillTexture), so this follows.
local function styleOverlay(bar, full)
  T.BarColor(T.StyleBar(bar), overlayKind(bar, full))
  for _, key in ipairs(CB.OVERLAY_ART) do
    if type(bar[key]) == "table" and bar[key].SetAlpha then bar[key]:SetAlpha(0) end
  end
  if type(bar.Text) == "table" and bar.Text.SetFont then T.Text(bar.Text, "small", false) end
end

-- Hides the overlay bar's finish flash once the game has started it (PlayFadeAnim).
local function hideFlash(bar)
  if type(bar.Flash) == "table" and bar.Flash.Hide then bar.Flash:Hide() end
end

-- The game's cast bar over the professions window while crafting (not a secure frame,
-- and never hidden: it is the only cast bar there): a flat inset panel, the look now, on
-- every show and after the game redraws it. Once; a client without it is skipped.
function CB.SkinOverlay()
  local bar = _G.OverlayPlayerCastingBarFrame
  if type(bar) ~= "table" or not bar.SetStatusBarTexture or vgSkinned[bar] then return end
  vgSkinned[bar] = true
  T.HudPanel(bar, { inset = true })
  styleOverlay(bar)
  bar:HookScript("OnShow", ns.Guard("show overlay cast bar", styleOverlay))
  if type(hooksecurefunc) ~= "function" then return end
  if type(bar.UpdateBarFillTexture) == "function" then hooksecurefunc(bar, "UpdateBarFillTexture", ns.Guard("hook UpdateBarFillTexture", styleOverlay)) end
  if type(bar.PlayFadeAnim) == "function" then hooksecurefunc(bar, "PlayFadeAnim", ns.Guard("hook PlayFadeAnim", hideFlash)) end
end

-- Events ------------------------------------------------------------------------------

-- Every event that can start, change or end a cast.
local CAST_EVENTS = {
  "UNIT_SPELLCAST_START", "UNIT_SPELLCAST_STOP", "UNIT_SPELLCAST_FAILED", "UNIT_SPELLCAST_INTERRUPTED",
  "UNIT_SPELLCAST_DELAYED", "UNIT_SPELLCAST_CHANNEL_START", "UNIT_SPELLCAST_CHANNEL_UPDATE",
  "UNIT_SPELLCAST_CHANNEL_STOP", "UNIT_SPELLCAST_INTERRUPTIBLE", "UNIT_SPELLCAST_NOT_INTERRUPTIBLE",
}
-- And an empowered cast's, on the client that has them.
CB.EMPOWER_EVENTS = ns.ClientData({
  forever = {}, retail = { "UNIT_SPELLCAST_EMPOWER_START", "UNIT_SPELLCAST_EMPOWER_UPDATE", "UNIT_SPELLCAST_EMPOWER_STOP" },
})
for _, event in ipairs(CB.EMPOWER_EVENTS) do CAST_EVENTS[#CAST_EVENTS + 1] = event end
CB.EVENTS = CAST_EVENTS

-- The cursor ring ---------------------------------------------------------------------

-- The global cooldown's spell: the shared cooldown is reported on it.
CB.GCD_SPELL = 61304
-- The ring's two sizes in units: the outer (the global cooldown) and the inner (your cast).
CB.RING = { outer = 38, inner = 28 }

-- The client's duration object for the global cooldown, or nil where it has none to give.
local function gcdObject()
  local get = C_Spell and C_Spell.GetSpellCooldownDuration
  if type(get) ~= "function" or not ns.Client.Has("cooldownObject") then return nil end
  local ok, object = pcall(get, CB.GCD_SPELL)
  return ok and object or nil
end

-- Sweeps a ring from a duration object, else from a plain start and length (seconds) when both are readable, else clears it.
local function sweepRing(cd, object, start, length)
  start, length = ns.PlainNumber(start), ns.PlainNumber(length)
  if object ~= nil then return cd:SetCooldownFromDurationObject(object) end
  if start and length and length > 0 then return cd:SetCooldown(start, length) end
  cd:Clear()
end

-- Sweeps the outer ring with the global cooldown now.
function CB.RingGlobal()
  local info = C_Spell and C_Spell.GetSpellCooldown and C_Spell.GetSpellCooldown(CB.GCD_SPELL)
  local plain = type(info) == "table" and not ns.IsSecret(info)
  sweepRing(CB.ring.gcd, gcdObject(), plain and info.startTime, plain and info.duration)
end

-- Sweeps the inner ring with your cast or channel now, or clears it when you are not casting.
function CB.RingCast()
  local name, _, startMS, endMS, _, channel, stages = CB.Cast("player")
  local cd = CB.ring.cast
  if type(name) == "nil" then return cd:Clear() end
  cd:SetReverse(not channel)
  local start, finish = ns.PlainNumber(startMS), ns.PlainNumber(endMS)
  sweepRing(cd, castDuration("player", channel, stages), start and start / 1000, start and finish and (finish - start) / 1000)
end

-- Puts the ring's centre on the cursor (the cursor is in screen pixels, the ring's anchor in UIParent units).
local function followCursor()
  local cx, cy = GetCursorPosition()
  local x, y = ns.PlainNumber(cx), ns.PlainNumber(cy)
  if x and y then CB.ring:SetPoint("CENTER", UIParent, "BOTTOMLEFT", x / UIParent:GetEffectiveScale(), y / UIParent:GetEffectiveScale()) end
end

-- One ring of the pair: a faint full circle, with the accent sweep over it in the same shape.
local function ringPart(parent, size)
  local back = T.Tint(parent:CreateTexture(nil, "BACKGROUND"), "text2", 0.35)
  back:SetTexture(T.Texture("KnobLine"))
  back:SetSize(size, size)
  back:SetPoint("CENTER")
  local cd = CreateFrame("Cooldown", nil, parent, "CooldownFrameTemplate")
  cd:SetAllPoints(back)
  cd:SetSwipeTexture(T.Texture("KnobLine"))
  cd:SetSwipeColor(T.RGB("accent"))
  return cd
end

-- Makes the sweep of a ring plain and out of the mouse's way: no edge line, no end flash, no numbers, no clicks.
local function quietRing(cd)
  cd:SetDrawEdge(false)
  cd:SetDrawBling(false)
  cd:SetHideCountdownNumbers(true)
  cd:EnableMouse(false)
end

-- Makes the ring (once): a frame that takes no mouse input, with the two rings in it.
local function buildRing()
  if CB.ring then return CB.ring end
  local ring = CreateFrame("Frame", "Vanguard_CursorRing", UIParent)
  ring:SetSize(CB.RING.outer, CB.RING.outer)
  ring:SetFrameStrata("FULLSCREEN_DIALOG")
  ring:EnableMouse(false)
  ring.gcd, ring.cast = ringPart(ring, CB.RING.outer), ringPart(ring, CB.RING.inner)
  quietRing(ring.gcd)
  quietRing(ring.cast)
  CB.ring = ring
  return ring
end

-- Whether the ring is showing (so its events have something to do).
local function ringShown()
  return CB.ring ~= nil and CB.ring:IsShown()
end

-- Your cast events refresh the inner ring; the global cooldown's refresh the outer one. Subscribed once, on first use.
local function listenRing()
  if CB.ringListening then return end
  CB.ringListening = true
  ns.OnUnit(CAST_EVENTS, function() if ringShown() then CB.RingCast() end end, "player")
  ns.On("SPELL_UPDATE_COOLDOWN", function() if ringShown() then CB.RingGlobal() end end)
end

-- Puts the ring away and stops following the cursor.
local function putRingAway()
  ns.Every("cursor ring", nil)
  if CB.ring then CB.ring:Hide() end
end

-- Turns the ring on or off to match the setting, at once: while on it follows the cursor, and shows the global cooldown
-- and your cast as they are now.
function CB.ApplyRing()
  if not (CB.settings and CB.settings.ring and ns.Client.Has("cooldownObject")) then return putRingAway() end
  buildRing():Show()
  listenRing()
  ns.Every("cursor ring", 0, followCursor, CB.ring)
  followCursor()
  CB.RingGlobal()
  CB.RingCast()
end

-- Events that end a cast, and how the bar says so.
local FINISH = {
  UNIT_SPELLCAST_STOP = "good", UNIT_SPELLCAST_CHANNEL_STOP = "good", UNIT_SPELLCAST_EMPOWER_STOP = "good",
  UNIT_SPELLCAST_INTERRUPTED = L["Interrupted"], UNIT_SPELLCAST_FAILED = L["Failed"],
}

-- How an ending event says the cast went, from its fourth argument. A channel's stop
-- names who interrupted it (nil when it ran its course; a hidden name is still someone),
-- as the client's own cast bar reads it (CastingBarFrame.lua, UNIT_SPELLCAST_CHANNEL_STOP);
-- an empowered cast's stop says whether it completed (a plain false: interrupted).
local function finishReason(event, fourth)
  if event == "UNIT_SPELLCAST_CHANNEL_STOP" and type(fourth) ~= "nil" then return L["Interrupted"] end
  if event == "UNIT_SPELLCAST_EMPOWER_STOP" and not ns.IsSecret(fourth) and fourth == false then return L["Interrupted"] end
  return FINISH[event]
end

-- A cast event for one of our units: an end flashes the bar, anything else refreshes it.
local function onCast(event, unit, _, _, fourth)
  local bar = CB.bars[unit]
  if bar and FINISH[event] and not casting(unit) then return CB.Finish(bar, finishReason(event, fourth)) end
  CB.Update(unit)
end

-- Builds the bars switched on (yours, your target's, your focus's); returns their units. Your pet's bar
-- is built while the game's bars are put away (its pet cast bar with them), so your pet's casts still show.
local function createBars(settings)
  local units = {}
  for _, unit in ipairs({ "player", "target", "focus" }) do
    if settings[unit] then CB.bars[unit], units[#units + 1] = createBar(unit), unit end
  end
  if settings.hideBlizzard and settings.player then CB.bars.pet = createBar("pet") end
  return units
end

-- Your pet's casts (on a subscription of its own: one takes three units) and your pet coming or going.
local function listenPet()
  ns.OnUnit(CAST_EVENTS, onCast, "pet")
  ns.OnUnit("UNIT_PET", function() CB.Update("pet") end, "player")
end

-- Cast events come only for the units with a bar (the client sends every nameplate's casts to whoever
-- asks for all), and the bars follow a new target, focus or pet.
local function listen(units)
  ns.OnUnit(CAST_EVENTS, onCast, unpack(units))
  if CB.bars.pet then listenPet() end
  ns.On("PLAYER_TARGET_CHANGED", function() CB.Update("target") end)
  ns.On("PLAYER_FOCUS_CHANGED", function() CB.Update("focus") end)
  ns.On("SPELL_UPDATE_COOLDOWN", CB.RefreshMarks)
  ns.On("UPDATE_SHAPESHIFT_FORM", CB.RefreshMarks)
  ns.On("PLAYER_ENTERING_WORLD", function() for unit in pairs(CB.bars) do CB.Update(unit) end end)
end

-- Repaints the sweeps coloured by token after a theme change (a Cooldown's swipe colour is not a vertex colour, so
-- T.Tint cannot keep it): the ring's accent, the interrupt marks' inset.
function CB.PaintSweeps()
  if CB.ring then
    CB.ring.gcd:SetSwipeColor(T.RGB("accent"))
    CB.ring.cast:SetSwipeColor(T.RGB("accent"))
  end
  for _, bar in pairs(CB.bars) do
    if bar.mark then bar.mark.cd:SetSwipeColor(T.RGB("inset")) end
  end
end

-- Module entry point (Core/Modules.lua).
function CB.Enable(settings)
  CB.settings = settings
  local units = createBars(settings)
  if settings.hideBlizzard then ns.OutOfCombat(function() for _, n in ipairs(BLIZZARD) do hideBlizzard(n) end end) end
  CB.SkinOverlay()
  listen(units)
  CB.ApplyRing()
  T.OnChanged(CB.PaintSweeps)
end
