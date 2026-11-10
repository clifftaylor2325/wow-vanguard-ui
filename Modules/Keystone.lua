-- The keystone (/vg → Unit frames → Keystone → Show the keystone): Vanguard's crest on a brass rail between your frame and your
-- target's, the one mark in the middle of the HUD. Crossed swords light under the crest in a fight, and, with its
-- second switch, the global cooldown sweeps a ring round the crest. It shows with the Shield HUD look ("auto", the
-- default), or always, or never; and it steps aside while the Versus deck holds the pair, while either frame of the
-- pair has been moved, and while the Cooldown Manager's essential row sits across it. It dims with your frames
-- under the Calm HUD.

local ADDON, ns = ...

local T, V = ns.Theme, ns.Visibility

-- A part of the unit frames module (its keystone and keystoneSweep settings), in a file of its own; UF.Enable
-- starts it.
local UF = ns.GetModule("UnitFrames")
local KS = {}
UF.Keystone = KS

-- Sizes in units: the rail's height, the crest, the ring the global cooldown sweeps, the swords and their gap under
-- the crest.
KS.SIZE = { rail = 2, crest = 36, ring = 44, swords = 14, gap = 2 }
-- The frames the rail runs between (their movers, and the Cooldown Manager row's, are what move it).
KS.ENDS = { "player", "target" }
KS.MOVERS = { uf_player = true, uf_target = true, cdm_essential = true }
-- The Cooldown Manager row that shares the gap between the frames.
KS.ROW = "EssentialCooldownViewer"

-- The rail: a strip at mid-height from each frame to the ring, in the dim accent.
local function addRails(f, inner)
  local half = KS.SIZE.ring / 2
  f.rails = {}
  for i, side in ipairs({ "LEFT", "RIGHT" }) do
    local t = T.Tint(T.Snap(inner:CreateTexture(nil, "ARTWORK")), "accentDim")
    t:SetTexture(T.WHITE)
    t:SetHeight(KS.SIZE.rail)
    t:SetPoint(side, inner, side)
    t:SetPoint(side == "LEFT" and "RIGHT" or "LEFT", inner, "CENTER", side == "LEFT" and -half or half, 0)
    f.rails[i] = t
  end
end

-- The crest in the middle and the swords under it (hidden until a fight); the ring waits for its switch.
local function addMarks(f, inner)
  f.crest = T.Logo(inner, KS.SIZE.crest)
  f.crest:SetPoint("CENTER", inner, "CENTER")
  f.swords = T.Tint(T.Snap(inner:CreateTexture(nil, "OVERLAY"), "icon"), "bad")
  f.swords:SetTexture(T.Icon("Combat"))
  f.swords:SetSize(KS.SIZE.swords, KS.SIZE.swords)
  f.swords:SetPoint("TOP", f.crest, "BOTTOM", 0, -KS.SIZE.gap)
  f.swords:Hide()
end

-- Pins the keystone between the pair: your frame's right edge to your target's left, as tall as your frame.
local function pin(f)
  local frames = ns.GetModule("UnitFrames").frames
  local player, target = frames[KS.ENDS[1]], frames[KS.ENDS[2]]
  f:SetPoint("LEFT", player, "RIGHT")
  f:SetPoint("RIGHT", target, "LEFT")
  f:SetPoint("TOP", player, "TOP")
  f:SetPoint("BOTTOM", player, "BOTTOM")
end

-- The holder: under the frames, taking no mouse, with the part the Calm HUD dims with your frames inside it.
local function holder()
  local f = CreateFrame("Frame", "Vanguard_Keystone", UIParent)
  f:SetFrameStrata("BACKGROUND")
  f:EnableMouse(false)
  f.inner = CreateFrame("Frame", nil, f)
  f.inner:SetAllPoints()
  V.Calm(f.inner, "frames")
  return f
end

-- Makes the keystone once: the holder shown or hidden by the rules, pinned between the pair, with the rail and
-- the marks inside it.
local function build()
  if KS.frame then return KS.frame end
  local f = holder()
  pin(f)
  addRails(f, f.inner)
  addMarks(f, f.inner)
  KS.frame = f
  return f
end

-- A frame's rectangle (left, right, bottom, top) as plain numbers, or nil where the client hides one.
local function rect(frame)
  local l, r = ns.PlainNumber(frame:GetLeft()), ns.PlainNumber(frame:GetRight())
  local b, t = ns.PlainNumber(frame:GetBottom()), ns.PlainNumber(frame:GetTop())
  if l and r and b and t then return l, r, b, t end
  return nil
end

-- Whether the Cooldown Manager's essential row is shown across the keystone (not while a rectangle is hidden).
local function rowAcross(f)
  local row = _G[KS.ROW]
  if not (row and row:IsShown()) then return false end
  local l, r, b, t = rect(f)
  local rl, rr, rb, rt = rect(row)
  if not (l and rl) then return false end
  return rl < r and rr > l and rb < t and rt > b
end

-- Whether the keystone shows: by its setting ("on", "off", or "auto": with the Shield look), and never while the
-- deck holds the pair, a frame of the pair has been moved, or the Cooldown Manager's essential row sits across it.
local function wanted(f)
  local show = UF.settings.keystone
  if show == "off" or (show ~= "on" and T.HudLook() ~= "shield") then return false end
  if not (UF and UF.frames and UF.frames[KS.ENDS[1]] and UF.frames[KS.ENDS[2]]) then return false end
  if UF.settings.deck == true or ns.HudLayout() ~= "centered" then return false end
  for key in pairs(KS.MOVERS) do
    if key ~= "cdm_essential" and ns.MoverSaved(key) then return false end
  end
  return not rowAcross(f)
end

-- Whether the ring sweeps: the sweep switch, where the client has duration objects.
local function sweeping()
  return UF.settings.keystoneSweep == true and ns.Client.Has("cooldownObject")
end

-- The ring round the crest (a cast bars ring, a Cooldown frame), made the first time the sweep asks for it.
local function ring(f)
  if not f.ring then
    local CB = ns.GetModule("CastBars")
    f.ring = CB.RingPart(f.inner, KS.SIZE.ring)
    CB.QuietRing(f.ring)
  end
  return f.ring
end

-- Shows the ring and sweeps it with the global cooldown now, or hides it (a ring never asked for stays unmade).
local function applySweep(f)
  if sweeping() then
    local r = ring(f)
    r:Show() r.back:Show()
    ns.GetModule("CastBars").SweepGlobal(r)
  elseif f.ring then
    f.ring:Hide() f.ring.back:Hide()
  end
end

-- Lights the swords while you fight (the fight's start and end, and every apply).
local function paintCombat(f)
  f.swords:SetShown(ns.InCombat() == true)
end

-- Shows or hides the keystone to match its rules and its switches, out of combat (the rules read the row's place).
function KS.Apply()
  if not UF.settings then return end
  ns.OutOfCombat(function()
    local f = build()
    f:SetShown(wanted(f))
    applySweep(f)
    paintCombat(f)
  end, "keystone")
end

-- Sweeps the ring again when a cooldown changes, while it shows.
local function sweepNow()
  local f = KS.frame
  if f and f:IsShown() and f.ring and f.ring:IsShown() then ns.GetModule("CastBars").SweepGlobal(f.ring) end
end

-- Paints the swords for a fight starting or ending, once the keystone exists.
local function combatChanged()
  if KS.frame then paintCombat(KS.frame) end
end

-- Follows the Cooldown Manager's essential row showing or hiding, where the client has it.
local function watchRow()
  local row = _G[KS.ROW]
  if not row then return end
  row:HookScript("OnShow", ns.Guard("keystone row", KS.Apply))
  row:HookScript("OnHide", ns.Guard("keystone row", KS.Apply))
end

-- Started by UF.Enable: place it (again once the world is in, after the game's rows are placed), then follow the
-- look, the movers, the row, cooldowns and fights.
function KS.Enable()
  KS.Apply()
  ns.On("PLAYER_ENTERING_WORLD", KS.Apply)
  T.OnChanged(KS.Apply)
  ns.OnMoverPlaced(function(key) if KS.MOVERS[key] then KS.Apply() end end)
  ns.On("SPELL_UPDATE_COOLDOWN", sweepNow)
  ns.On("PLAYER_REGEN_DISABLED", combatChanged)
  ns.On("PLAYER_REGEN_ENABLED", combatChanged)
  watchRow()
end

-- The options rows' apply: Show the keystone and Global cooldown on the keystone.
function UF.ApplyKeystone()
  KS.Apply()
end
