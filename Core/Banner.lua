-- The welcome banner (art plan M3): Cliff's painted dusk landscape, a strip under the title on setup's first step and
-- on the What's new window. It is part of its window (it fades and hides with it), so it adds no fade or sound of
-- its own. The picture's file is set the first time a strip shows, so it costs nothing until a window opens.

local ADDON, ns = ...
local T = ns.Theme

local B = {}
ns.Banner = B

-- The picture (Media/Art/), its width over its height, and the share of the screen a window may fill with it.
B.FILE, B.RATIO, B.SCREEN_SHARE = "banner-dusk", 2, 0.85

-- The least height worth showing: under it the strip is left out rather than cropped to a sliver. A strip with nothing
-- to show keeps EMPTY units, because a frame of no height is read by the game as having no size set.
B.MIN_HEIGHT, B.EMPTY = 80, 0.001

-- The height of a strip `width` units wide that has `room` units to spare: the whole picture, or as much of it as the
-- room allows, or 0 when the room is under MIN_HEIGHT.
function B.Height(width, room)
  local height = math.floor(math.min(width / B.RATIO, room))
  return height >= B.MIN_HEIGHT and height or 0
end

-- A strip `width` units wide for a window, empty (no height) until B.Show gives it some. Its picture hangs from the
-- strip's top, so the strip's own height is the picture's and the gap under it.
function B.Create(window, width)
  local strip = CreateFrame("Frame", nil, window)
  strip:SetWidth(width)
  strip.art = strip:CreateTexture(nil, "ARTWORK")
  strip.art:SetPoint("TOPLEFT")
  strip.art:SetPoint("TOPRIGHT")
  strip:SetHeight(B.EMPTY)
  return strip
end

-- Sets the picture's file once, when the strip first has room to show.
local function load(strip)
  if strip.loaded then return end
  strip.loaded = true
  strip.art:SetTexture(T.MEDIA .. "Art\\" .. B.FILE)
end

-- Crops a picture drawn `shown` units tall out of a strip `width` wide, keeping the middle of the picture.
local function crop(strip, shown)
  local kept = shown / (strip:GetWidth() / B.RATIO)
  strip.art:SetTexCoord(0, 1, (1 - kept) / 2, (1 + kept) / 2)
end

-- Shows the strip with `height` units of picture (0 hides it), and the gap under it. `height` comes from B.Height.
function B.Show(strip, height)
  strip.art:SetHeight(math.max(height, B.EMPTY))
  strip.art:SetShown(height > 0)
  strip:SetHeight(height > 0 and height + T.SPACE.col or B.EMPTY)
  if height <= 0 then return end
  load(strip)
  crop(strip, height)
end

-- The room a window has for a strip: the share of the screen it may fill, less its height without one.
function B.Room(base)
  return UIParent:GetHeight() * B.SCREEN_SHARE - base
end
