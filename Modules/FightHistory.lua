-- Fight history: your damage per second in each fight this session, as a thin
-- strip of up to 20 bars under the game's damage meter (the latest in the
-- accent), with a tooltip listing the fights, and /vg fights. Each fight is
-- read from the game's damage meter half a second after combat ends (never in
-- combat), through the info strip's reads; a figure the client hides is kept as
-- an empty slot, so the count stays right. The strip is off until switched on,
-- but fights are recorded anyway, so turning it on shows the history at once.
-- It forgets on logout. The recap after a fight is in Modules/FightRecap.lua.

local ADDON, ns = ...

local T, V, W = ns.Theme, ns.Visibility, ns.Widgets

local FH = ns.Module("FightHistory", { defaults = { strip = false, recap = false, visibility = "always", showWhen = {} } })

-- Fights kept, the shortest one recorded (seconds), and the wait after combat for the meter to finish.
FH.MAX, FH.MIN_SECONDS, FH.DELAY = 20, 2, 0.5
-- The strip's size, each bar's width and gap, and the tallest bar (UI units).
FH.WIDTH, FH.HEIGHT, FH.SLOT, FH.GAP, FH.TALL = 300, 14, 12, 2, 10
-- The bars' row is centered along the strip.
FH.INSET = (FH.WIDTH - FH.MAX * FH.SLOT - (FH.MAX - 1) * FH.GAP) / 2
-- This session's fights, oldest first: { duration, dps, rank, sources, at }.
FH.fights = {}

-- Recording ----------------------------------------------------------------------------------

-- The fight that just ended, or nil: no meter, in combat, hidden, or under FH.MIN_SECONDS.
-- dps, rank and sources are nil when the client hides them or your line isn't in the list.
function FH.Read()
  local IS = ns.GetModule("InfoStrip")
  local duration = IS.FightSeconds()
  if not duration or duration < FH.MIN_SECONDS then return nil end
  local line, place, count = IS.MyLine()
  local dps = line and ns.PlainNumber(line.amountPerSecond)
  return { duration = duration, dps = dps, rank = place, sources = ns.PlainNumber(count), at = GetTime() }
end

-- Records the fight that just ended (if there is one), dropping the oldest past FH.MAX.
function FH.Record()
  local fight = FH.Read()
  if not fight then return end
  table.insert(FH.fights, fight)
  if #FH.fights > FH.MAX then table.remove(FH.fights, 1) end
  FH.Paint()
  FH.Announce()
end

-- Combat ended: one read FH.DELAY later, once the meter has finished the fight (a second end of
-- combat before then waits for the same read). FH.waiting is that read's ticket, so a read already
-- taken by onPull is not taken again.
local function onRegen()
  if type(C_Timer) ~= "table" or type(C_Timer.After) ~= "function" then return FH.Record() end
  if FH.waiting then return end
  local ticket = {}
  FH.waiting = ticket
  C_Timer.After(FH.DELAY, ns.Guard("timer fight history record", function()
    if FH.waiting == ticket then FH.waiting = nil FH.Record() end
  end))
end

-- A pull while that read waits: read now, before the lockdown starts and the meter moves on to the
-- new fight, which would lose the last one.
local function onPull()
  if not FH.waiting then return end
  FH.waiting = nil
  FH.Record()
end

-- Drawing ------------------------------------------------------------------------------------

-- The highest DPS among the fights (each is plain, read through ns.PlainNumber); nil when none has one.
function FH.Peak()
  local peak
  for _, fight in ipairs(FH.fights) do
    if fight.dps and (not peak or fight.dps > peak) then peak = fight.dps end
  end
  return peak
end

-- One slot's bar: hidden for no fight or a hidden figure, else its share of the
-- peak (at least a pixel), in the accent for the latest fight.
local function paintBar(bar, fight, peak, latest)
  local dps = fight and fight.dps
  bar:SetShown(dps ~= nil)
  if dps == nil then return end
  local share = peak > 0 and dps / peak or 0
  bar:SetHeight(math.max(T.Pixel(FH.frame), share * FH.TALL))
  T.Tint(bar, latest and "accent" or "muted")
end

-- Shows the strip while it's on, has a fight and its visibility shows it, and draws each fight's bar.
function FH.Paint()
  local f = FH.frame
  f:SetShown(FH.settings.strip == true and #FH.fights > 0 and V.Shows(f))
  local peak = FH.Peak()
  for i, bar in ipairs(f.bars) do paintBar(bar, FH.fights[i], peak, i == #FH.fights) end
end

-- Listing ------------------------------------------------------------------------------------

-- Seconds as "1:23".
local function clock(seconds)
  return string.format("%d:%02d", math.floor(seconds / 60), math.floor(seconds % 60))
end

-- A fight's figures: "412 dps  #2 of 5" (the place only in a group), "no dps" when hidden.
local function figures(fight)
  local dps = fight.dps and (ns.GetModule("DataBars").Short(math.floor(fight.dps)) .. " dps") or "no dps"
  if fight.rank and fight.sources and fight.sources > 1 then return string.format("%s  #%d of %d", dps, fight.rank, fight.sources) end
  return dps
end

-- Each fight, newest first, as { "#1  1:23", "412 dps  #2 of 5" } (#1 is the latest).
function FH.Lines()
  local out = {}
  for i = #FH.fights, 1, -1 do
    local fight = FH.fights[i]
    out[#out + 1] = { string.format("#%d  %s", #out + 1, clock(fight.duration)), figures(fight) }
  end
  return out
end

-- The strip's tooltip: a title, then each fight, newest first.
function FH.Tooltip(f)
  GameTooltip:SetOwner(f, "ANCHOR_TOP")
  GameTooltip:SetText("Fight history", T.RGB("text"))
  local r, g, b = T.RGB("text2")
  for _, line in ipairs(FH.Lines()) do GameTooltip:AddDoubleLine(line[1], line[2], r, g, b, T.RGB("text")) end
  GameTooltip:Show()
end

-- /vg fights: each fight this session, newest first.
function FH.Command()
  local lines = FH.Lines()
  if #lines == 0 then return ns.Chat("No fights recorded this session yet.") end
  ns.Chat("Your fights this session, newest first:")
  for _, line in ipairs(lines) do ns.Chat(line[1] .. "  " .. line[2]) end
end

-- Building -----------------------------------------------------------------------------------

-- Slot i's bar, standing on the strip's floor in its place along the row (oldest at the left).
local function addBar(f, i)
  local bar = W.Flat(f, "ARTWORK", "muted")
  bar:SetWidth(FH.SLOT)
  bar:SetPoint("BOTTOMLEFT", f, "BOTTOMLEFT", FH.INSET + (i - 1) * (FH.SLOT + FH.GAP), (FH.HEIGHT - FH.TALL) / 2)
  bar:Hide()
  return bar
end

-- Under the mouse: a hover wash and the tooltip (the strip takes no clicks).
local function watchMouse(f)
  f.wash = W.Flat(f, "OVERLAY", "hover")
  f.wash:SetAllPoints()
  f.wash:Hide()
  f:SetMouseMotionEnabled(true)
  f:SetMouseClickEnabled(false)
  f:SetScript("OnEnter", function() f.wash:Show() FH.Tooltip(f) end)
  f:SetScript("OnLeave", function() f.wash:Hide() GameTooltip:Hide() end)
end

-- Applies the strip's visibility setting: now, or when combat ends.
function FH.ApplyVisibility()
  ns.OutOfCombat(function() V.ApplyNow(FH.frame, FH.settings.visibility, FH.settings.showWhen) end, FH.frame)
end

-- Follows the strip's visibility from the start: its state's changes repaint it.
local function watchVisibility(f)
  f.vgOnState = FH.Paint
  V.WatchHover(f)
  V.Track(f, FH.ApplyVisibility)
  FH.ApplyVisibility()
end

-- The movable strip, just under the damage meter.
local function build()
  local f = T.HudPanel(CreateFrame("Frame", "Vanguard_FightHistory", UIParent))
  FH.frame = f
  f:SetSize(FH.WIDTH, FH.HEIGHT)
  ns.Mover(f, "fighthistory", "Fight history", { "BOTTOMRIGHT", "BOTTOMRIGHT", -16, 103 })
  f.bars = {}
  for i = 1, FH.MAX do f.bars[i] = addBar(f, i) end
  watchMouse(f)
  watchVisibility(f)
end

-- Module entry point (Core/Modules.lua).
function FH.Enable(settings)
  FH.settings = settings
  build()
  ns.On("PLAYER_REGEN_ENABLED", onRegen)
  ns.On("PLAYER_REGEN_DISABLED", onPull)
  T.OnChanged(FH.Paint)
end
