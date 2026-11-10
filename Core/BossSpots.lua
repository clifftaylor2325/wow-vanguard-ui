-- Boss timer spots: two empty movable frames in the layout, "Boss timers" (where a boss timer addon's
-- normal bars go) and "Boss timers, soon" (the big bars a timer moves to as it runs out). Only their
-- handles show, in unlock mode: drag them where you want the bars, then drag the other addon's bar
-- anchors onto the handles. Vanguard never reads or changes another addon's settings.

local ADDON, ns = ...

-- On a canvas under 1365 wide the normal bars' spot keeps left of the quest tracker's column (260 wide, 12 in
-- from the edge, and a gap) and just above the target of target's spot there (Modules/UnitFrames.lua).
local NARROW = { w = 1365, spot = { "BOTTOM", "BOTTOM", 360, 304, room = { right = 278 } } }

-- The spots: mover key and label, default point and size.
local SPOTS = {
  { key = "bossbars", label = ns.L["Boss timers"], default = { "BOTTOM", "BOTTOM", 360, 300, narrow = NARROW }, w = 200, h = 120 },
  { key = "bossbarssoon", label = ns.L["Boss timers, soon"], default = { "TOP", "TOP", 0, -264 }, w = 240, h = 80 },
}

-- One spot: an empty frame with a mover.
local function build(spot)
  local f = CreateFrame("Frame", "Vanguard_" .. spot.key, UIParent)
  f:SetSize(spot.w, spot.h)
  ns.Mover(f, spot.key, spot.label, spot.default)
end

ns.On("PLAYER_LOGIN", function()
  for _, spot in ipairs(SPOTS) do build(spot) end
end)
