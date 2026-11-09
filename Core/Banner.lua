-- The welcome banner (art plan M3): Cliff's painted dusk landscape, a strip under the title on setup's steps and
-- on the What's new window, with Vanguard's crest and name over its open sky like the store banner. Setup's later
-- steps show the AFK screen's painted scenes in the same strip (Core/Setup.lua). It is part of its window (it fades
-- and hides with it), so it adds no fade or sound of its own. A picture's file is set the first time a strip shows
-- it, so it costs nothing until a window opens.

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

-- The shade under the brand mark: the theme's shade colour at T.BANNER_MARK.shade on the left, fading to clear.
local function addShade(mark)
  local r, g, b = T.RGB("shade")
  mark.shade = mark:CreateTexture(nil, "BACKGROUND")
  mark.shade:SetTexture(T.WHITE)
  mark.shade:SetPoint("TOPLEFT")
  mark.shade:SetPoint("BOTTOMLEFT")
  mark.shade:SetGradient("HORIZONTAL", CreateColor(r, g, b, T.BANNER_MARK.shade), CreateColor(r, g, b, 0))
end

-- The brand mark over the picture's open sky (the left side): the shade, the crest near the left edge and the
-- addon's name beside it. B.Show sizes them to the picture's height.
local function addMark(strip)
  local mark = CreateFrame("Frame", nil, strip)
  mark:SetAllPoints(strip.art)
  addShade(mark)
  mark.crest = mark:CreateTexture(nil, "ARTWORK")
  mark.crest:SetPoint("LEFT", T.SPACE.col, 0)
  mark.name = mark:CreateFontString(nil, "OVERLAY")
  mark.name:SetPoint("LEFT", mark.crest, "RIGHT", T.SPACE.col, 0)
  strip.mark = mark
end

-- A strip `width` units wide for a window, empty (no height) until B.Show gives it some. Its picture hangs from the
-- strip's top, so the strip's own height is the picture's and the gap under it.
function B.Create(window, width)
  local strip = CreateFrame("Frame", nil, window)
  strip:SetWidth(width)
  strip.art = strip:CreateTexture(nil, "ARTWORK")
  strip.art:SetPoint("TOPLEFT")
  strip.art:SetPoint("TOPRIGHT")
  addMark(strip)
  strip:SetHeight(B.EMPTY)
  return strip
end

-- Sets the picture's file when it changes, and the crest's once, when the strip first has room to show.
local function load(strip, file)
  if strip.file ~= file then
    strip.file = file
    strip.art:SetTexture(T.MEDIA .. "Art\\" .. file)
  end
  if strip.loaded then return end
  strip.loaded = true
  strip.mark.crest:SetTexture(T.MEDIA .. "Art\\" .. T.BANNER_MARK.file)
end

-- Sizes the brand mark to a picture `height` units tall: the crest and the name a share of it (T.BANNER_MARK), the
-- shade across its reach of the strip's width. The name is the addon's own (never translated), in the brand's gold.
local function sizeMark(strip, height)
  local mark, spec = strip.mark, T.BANNER_MARK
  local side = math.floor(height * spec.crest)
  mark.crest:SetSize(side, side)
  mark.shade:SetWidth(strip:GetWidth() * spec.reach)
  mark.name:SetFont(T.FONTS.alliance, math.floor(height * spec.name), "")
  mark.name:SetShadowOffset(1, -1)
  mark.name:SetShadowColor(T.RGB("textShadow"))
  mark.name:SetText(ADDON)
  T.Color(mark.name, spec.color)
end

-- Crops a picture drawn `shown` units tall out of a strip `width` wide, keeping the middle of the picture.
local function crop(strip, shown)
  local kept = shown / (strip:GetWidth() / B.RATIO)
  strip.art:SetTexCoord(0, 1, (1 - kept) / 2, (1 + kept) / 2)
end

-- Shows the strip with `height` units of picture (0 hides it), and the gap under it. `height` comes from B.Height.
-- `scene` names another 2:1 painting from Media/Art in place of the welcome banner (setup's later steps show the
-- AFK screen's scenes); the brand mark sits only over the welcome banner's open sky.
function B.Show(strip, height, scene)
  local file = scene or B.FILE
  strip.art:SetHeight(math.max(height, B.EMPTY))
  strip.art:SetShown(height > 0)
  strip.mark:SetShown(height > 0 and file == B.FILE)
  strip:SetHeight(height > 0 and height + T.SPACE.col or B.EMPTY)
  if height <= 0 then return end
  load(strip, file)
  crop(strip, height)
  sizeMark(strip, height)
end

-- The room a window has for a strip: the share of the screen it may fill, less its height without one.
function B.Room(base)
  return UIParent:GetHeight() * B.SCREEN_SHARE - base
end
