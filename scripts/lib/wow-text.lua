-- Text metrics for the TEST-ONLY WoW stub (scripts/lib/wow-stub.lua): how wide and how tall a
-- font string's text draws. Loads after the stub and before the layout, which sizes font strings
-- by these. Never shipped in game.
--
-- Two modes, in stub.textMetrics:
--   "rough" (the default): 6 px a character and 14 px a line at any size, what the layout has
--     always used, so the rest of the suite keeps its numbers.
--   "font": the real advance widths of the addon's own fonts (__wfgFontEms, read from Media/Fonts by
--     scripts/lib/truetype.mjs) at the string's size and text scale, word-wrapped at its width, a
--     line as tall as the font's size. The text-fit audit (scripts/lib/wow-textfit.lua) runs in it.

local stub = __wfgStub
local methods = stub.methods
local EMS = __wfgFontEms or {}

stub.textMetrics = "rough"

-- Rough mode: a character's width and a line's height, in units.
local ROUGH = { char = 6, line = 14, wrap = 300 }
-- Font mode: the size of a string with no font of its own (the game's 12), the ems of a character
-- the font has no advance for, the ems of an inline icon (|T and |A: a line tall and square), and
-- how much wider than Fira Sans Condensed a font with no metrics here draws (the game's Friz
-- Quadrata is about that much wider), measured with Fira Sans Condensed's advances.
local FONT = { size = 12, missing = 0.6, icon = 1, wider = 1.2, base = "FiraSansCondensed-Medium" }

-- The text as the client draws it: colour codes and hyperlink wrappers dropped, |n a newline,
-- || one bar, and each texture or atlas escape one "\1" (an icon).
local function drawnText(text)
  local s = tostring(text or ""):gsub("||", "\2"):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")
  s = s:gsub("|H.-|h", ""):gsub("|h", ""):gsub("|n", "\n"):gsub("|T.-|t", "\1"):gsub("|A.-|a", "\1")
  return (s:gsub("\2", "|"))
end
stub.drawnText = drawnText

-- A UTF-8 character's code point.
local function codePoint(ch)
  if #ch == 1 then return ch:byte() end
  local bytes = { ch:byte(1, -1) }
  local code = bytes[1] % 2 ^ (7 - #bytes)
  for i = 2, #bytes do code = code * 64 + bytes[i] % 64 end
  return code
end

-- Every face measured so far, by advances and size, each keeping the widths of the runs it measured.
local faces = setmetatable({}, { __mode = "k" })

-- The face for some advances at a size (in units) and a width factor, made once.
local function faceFor(ems, size, wider)
  faces[ems] = faces[ems] or {}
  local key = size * wider
  faces[ems][key] = faces[ems][key] or { ems = ems, px = key, size = size, widths = {} }
  return faces[ems][key]
end

-- How a font string's text is measured: its font's advances, the em scale to pixels (its size
-- after the text scale), and the extra width of a font with no metrics.
local function faceOf(fs)
  local f = fs.__font or (type(fs.__fontObject) == "table" and fs.__fontObject.__font) or {}
  local name = type(f[1]) == "string" and f[1]:match("([^\\/]+)%.[tT][tT][fF]$")
  local ems = name and EMS[name]
  local size = (tonumber(f[2]) or FONT.size) * (fs.__textScale or 1)
  return faceFor(ems or EMS[FONT.base] or FONT, size, ems and 1 or FONT.wider)
end

-- The width of a run of drawn text (no newlines) in a face, in units (measured once per face).
local function runWidth(run, face)
  if face.widths[run] then return face.widths[run] end
  local ems = 0
  for ch in run:gmatch("[%z\1-\127\192-\247][\128-\191]*") do
    ems = ems + (ch == "\1" and FONT.icon or face.ems[codePoint(ch)] or FONT.missing)
  end
  face.widths[run] = ems * face.px
  return face.widths[run]
end

-- The drawn text's lines (split at newlines).
local function linesOf(text)
  local out = {}
  for line in (drawnText(text) .. "\n"):gmatch("(.-)\n") do out[#out + 1] = line end
  return out
end

-- The width of a font string's longest line, unwrapped, in its own units.
local function naturalWidth(fs)
  local face, widest = faceOf(fs), 0
  for _, line in ipairs(linesOf(fs.__text)) do widest = math.max(widest, runWidth(line, face)) end
  return widest
end

-- Places one word on the wrap state { lines, used }: on the current line when it fits, else on the
-- next; a word wider than a line is broken over as many lines as it fills, as the client breaks it.
local function placeWord(state, w, space, width)
  local need = state.used > 0 and state.used + space + w or w
  if need <= width + 0.5 then state.used = need return end
  local extra = math.max(1, math.ceil(w / width - 0.001))
  state.lines = state.lines + (state.used > 0 and 1 or 0) + extra - 1
  state.used = w - (extra - 1) * width
end

-- How many lines one line of text wraps to in width units.
local function wrapLine(line, face, width)
  local state, space = { lines = 1, used = 0 }, runWidth(" ", face)
  if width <= 0 then return 1 end
  for word in line:gmatch("%S+") do placeWord(state, runWidth(word, face), space, width) end
  return state.lines
end

-- How many lines a font string's text takes at width units (font mode): each line wrapped unless
-- word wrap is off; no more than its max lines.
local function lineCount(fs, width)
  local face, lines = faceOf(fs), 0
  for _, line in ipairs(linesOf(fs.__text)) do
    lines = lines + ((fs.__noWrap or not width) and 1 or wrapLine(line, face, width))
  end
  local most = fs.__maxLines or 0
  return most > 0 and math.min(lines, most) or lines, lines
end
stub.textLineCount = lineCount

-- Rough mode's height: 14 px per wrapped line at 6 px per character, wrapped at the set width (else 300).
local function roughHeight(text, width)
  local lines = 0
  for line in (text .. "\n"):gmatch("(.-)\n") do
    lines = lines + math.max(1, math.ceil(#line * ROUGH.char / width))
  end
  return lines * ROUGH.line
end

-- The height of n lines of a font string: each a line of its size, with its spacing between.
local function linesHeight(fs, n)
  return n * faceOf(fs).size + math.max(0, n - 1) * (fs.__spacing or 0)
end

-- Rough mode's width of the longest line: 6 per byte.
local function roughWidth(fs)
  local longest = 0
  for line in (tostring(fs.__text or "") .. "\n"):gmatch("(.-)\n") do longest = math.max(longest, #line) end
  return longest * ROUGH.char
end

-- The width of a font string's longest line, unwrapped (rough or measured, by the mode).
local function unbounded(fs)
  return stub.textMetrics == "font" and naturalWidth(fs) or roughWidth(fs)
end

-- The width a font string's text asks for in its own units: its set width when it has one, else its longest line.
function stub.textWidth(fs)
  return fs.__width or unbounded(fs)
end

-- The height a font string's text takes, wrapped at width units (font mode; rough mode wraps at the
-- set width, else 300). Real clients measure the rendered text: the preview feeds measured heights
-- back in through stub.stringHeights.
function stub.textHeight(fs, width)
  local measured = stub.stringHeights and stub.stringHeights[fs.__id]
  if measured then return measured end
  local text = tostring(fs.__text or "")
  if text == "" then return 0 end
  if stub.textMetrics ~= "font" then return roughHeight(text, fs.__width or ROUGH.wrap) end
  return linesHeight(fs, (lineCount(fs, fs.__width or width)))
end

-- The text's height (stub.textHeight), at the string's width as laid out.
function methods:GetStringHeight()
  local width = stub.textMetrics == "font" and self.__points and next(self.__points) and stub.rectOf(self).width / self:GetEffectiveScale()
  return stub.textHeight(self, width or nil)
end

-- The text's unwrapped width, whatever width the string was given.
function methods:GetUnboundedStringWidth() return unbounded(self) end

-- Max lines, text scale and line spacing: recorded, read back, and measured with.
function methods:SetMaxLines(n) self.__maxLines = n end
function methods:GetMaxLines() return self.__maxLines or 0 end
function methods:SetTextScale(s) self.__textScale = s end
function methods:GetTextScale() return self.__textScale or 1 end
function methods:SetSpacing(px) self.__spacing = px end
function methods:GetSpacing() return self.__spacing or 0 end
-- Word wrap on a font string (the preview reads it), and whether it is on.
function methods:SetWordWrap(on) self.__noWrap = not on end
function methods:CanWordWrap() return not self.__noWrap end
-- Vertical justification, recorded (the text-fit audit places the text in its box by it).
function methods:SetJustifyV(j) self.__justifyV = j end
-- A line's height: the font's size after the text scale.
function methods:GetLineHeight() return faceOf(self).size end
