-- The text-fit audit for the TEST-ONLY WoW stub: finds text that does not fit where the addon put it.
-- Run it with the font metrics on (stub.textMetrics = "font", scripts/lib/wow-text.lua) and,
-- for translations, the pseudo-locale below. Loaded after the layout. Never shipped in game.
--
-- __wfgTextFit(root) looks at every shown font string under root (every top-level frame the addon
-- made when root is nil) and returns what it finds, one entry each:
--   cut      the text is wider or taller than the box it was given, so the client cuts it short
--            (an ellipsis, or lines dropped), or "squeezed to no width" (or height): the text, or a frame it
--            hangs on, is pinned on both sides of an axis with no room between them (its right edge on or left
--            of its left), so the client draws none of it
--   spill    the text runs out over an edge of the frame it sits in (a label wider than its button)
--   overlap  the text draws over other text, or over a control that is not its own (wrapped text
--            with no room left below it, running into the buttons)

local stub = __wfgStub

-- How far (units) text may run past an edge before it counts, a pseudo-translation's growth (a
-- third longer, and at least two more letters), and the least alpha that still draws.
local FIT = { slack = 1, growth = 0.35, least = 2, alpha = 0.05 }
-- The widget kinds a player clicks or types in: text drawn over one hides it.
local CONTROLS = { Button = true, CheckButton = true, EditBox = true, Slider = true }

-- The pseudo-translations made so far: longer text -> the English key it came from.
__wfgPseudoKeys = {}

-- The letters a text pads itself with: its own letters and digits (codes and {slots} left out), else x.
local function padFor(text, n)
  local letters = stub.drawnText(text):gsub("{%w+}", ""):gsub("[^%w]", "")
  if letters == "" then letters = "x" end
  return letters:rep(math.ceil(n / #letters)):sub(1, n)
end

-- A text as a longer translation might read: itself with a third more letters on its last word.
local function pseudo(text)
  local n = math.max(FIT.least, math.ceil(#stub.drawnText(text) * FIT.growth))
  local longer = text .. padFor(text, n)
  __wfgPseudoKeys[longer] = text
  return longer
end

-- A pseudo-locale's lookup: the key made longer, kept in the table so ns.English still finds the key.
local function pseudoLookup(t, key)
  local longer = pseudo(key)
  rawset(t, key, longer)
  return longer
end

-- Makes a string table (ns.L) a pseudo-locale: every text it hands out a third longer.
function __wfgPseudoLocale(L)
  setmetatable(L, { __index = pseudoLookup })
end

-- Whether a is b or under it.
local function within(a, b)
  while a do
    if a == b then return true end
    a = a.__parent
  end
  return false
end

-- Its alpha times every parent's.
local function drawnAlpha(w)
  local a = 1
  while w do a, w = a * (w.__alpha or 1), w.__parent end
  return a
end

-- The overlap of two rects, or nil when they share no area.
local function intersect(a, b)
  local left, bottom = math.max(a.left, b.left), math.max(a.bottom, b.bottom)
  local right, top = math.min(a.left + a.width, b.left + b.width), math.min(a.bottom + a.height, b.bottom + b.height)
  if right <= left or top <= bottom then return nil end
  return { left = left, bottom = bottom, width = right - left, height = top - bottom }
end

-- The scroll frame a widget scrolls in, if any (the nearest above it).
local function scrollerOf(w)
  local p = w.__parent
  while p and p.__kind ~= "ScrollFrame" do p = p.__parent end
  return p
end

-- A widget's rect cut to every frame above it that clips its children, up to the scroll frame it
-- scrolls in (scrolling brings the rest into view); nil when none of it shows.
local function clipped(w, r)
  local p = w.__parent
  while p and r and p.__kind ~= "ScrollFrame" do
    if p.__clips then r = p:IsRectValid() and intersect(r, stub.rectOf(p)) or nil end
    p = p.__parent
  end
  return r
end

-- Whether a widget's anchors pin both sides of an axis (LEFT and RIGHT, or TOP and BOTTOM).
local function pinsBoth(w, lo, hi)
  local a, b = false, false
  for point in pairs(w.__points) do
    a = a or point:find(lo) ~= nil
    b = b or point:find(hi) ~= nil
  end
  return a and b
end

-- The box a font string was given: whether its width and height are fixed, and their size in its units.
local function boxOf(fs)
  local r, scale = stub.rectOf(fs), fs:GetEffectiveScale()
  return {
    rect = r, scale = scale, width = r.width / scale, height = r.height / scale,
    fixedWidth = stub.givenTextWidth(fs) ~= nil or pinsBoth(fs, "LEFT", "RIGHT"),
    fixedHeight = stub.givenTextHeight(fs) ~= nil or pinsBoth(fs, "TOP", "BOTTOM"),
  }
end

-- How tall n lines of a font string draw, in its units.
local function linesTall(fs, n)
  return n * fs:GetLineHeight() + math.max(0, n - 1) * fs:GetSpacing()
end

-- Where a span of size `size` starts along one side of a box (start, length): at the low end (LEFT),
-- the high end (RIGHT) or centred. Vertical justification in those terms (the box's top is its high end).
local function justify(start, length, size, how)
  if how == "LEFT" then return start end
  if how == "RIGHT" then return start + length - size end
  return start + (length - size) / 2
end
local VERTICAL = { TOP = "RIGHT", BOTTOM = "LEFT" }

-- The rect a font string's letters cover on screen: its box, shrunk to the text in it as justified
-- (the client centres text unless told otherwise).
local function inkRect(fs, box)
  local r, s = box.rect, box.scale
  local shown = stub.textLineCount(fs, box.fixedWidth and box.width or nil)
  local w = math.min(fs:GetUnboundedStringWidth(), box.width) * s
  local h = math.min(linesTall(fs, shown), box.height) * s
  local bottom = justify(r.bottom, r.height, h, VERTICAL[fs.__justifyV] or "CENTER")
  return { left = justify(r.left, r.width, w, fs.__justifyH or "CENTER"), bottom = bottom, width = w, height = h }
end

-- Why a font string's text is cut short in its box, or nil: too wide for one line it can't wrap, more
-- lines than it may draw, or taller than a fixed height.
local function cutReason(fs, box)
  if not box.fixedWidth then return nil end
  local shown, all = stub.textLineCount(fs, box.width)
  if fs.__noWrap and fs:GetUnboundedStringWidth() > box.width + FIT.slack then return "wider than its box" end
  if all > shown then return "more lines than it may draw" end
  if box.fixedHeight and linesTall(fs, all) > box.height + FIT.slack then return "taller than its box" end
end

-- Whether rect a runs past rect b's edges by more than the slack (in screen pixels at scale s).
local function runsOut(a, b, s)
  local slack = FIT.slack * s
  return a.left < b.left - slack or a.left + a.width > b.left + b.width + slack
    or a.bottom < b.bottom - slack or a.bottom + a.height > b.bottom + b.height + slack
end

-- Whether a font string's text runs out over an edge of its parent: partly inside it and partly out
-- (a label wholly outside its frame, a caption beside a check box, is placed there).
local function spills(fs, ink, scale)
  local parent = fs.__parent
  if not (parent and parent ~= UIParent and parent:IsRectValid()) then return false end
  local pr = stub.rectOf(parent)
  return intersect(ink, pr) ~= nil and runsOut(ink, pr, scale)
end

-- A short name for a text in a finding: the English it was made from when the pseudo-locale made it.
local function textName(text)
  return __wfgPseudoKeys[text] or stub.drawnText(text)
end

-- The global name of the nearest named frame at or above w (below UIParent), for a finding's place.
local function placeOf(w)
  while w and w ~= UIParent and not w.__name do w = w.__parent end
  return w and w ~= UIParent and w.__name or "top level"
end

-- The window a widget belongs to: its ancestor (or itself) that sits on UIParent, or its topmost one.
local function windowOf(w)
  while w.__parent and w.__parent ~= UIParent do w = w.__parent end
  return w
end

-- Whether a widget draws: shown all the way up, laid out, and not faded out.
local function drawn(w)
  return w:IsVisible() and w:IsRectValid() and drawnAlpha(w) > FIT.alpha
end

-- Whether a control shows something of its own (an invisible click area over a row hides nothing).
local function looksLikeControl(w)
  if not CONTROLS[w.__kind] then return false end
  for _, region in ipairs({ w:GetRegions() }) do
    if region:IsShown() and (region.__texture or region.__color or region.__text or region.__atlas) then return true end
  end
  return false
end

-- The axis a widget's anchors leave no room on: pinned on both sides with its far edge on or before its near one.
local function squeezedAxis(w)
  local r = stub.rectOf(w)
  if r.width <= 0 and pinsBoth(w, "LEFT", "RIGHT") then return "width" end
  if r.height <= 0 and pinsBoth(w, "TOP", "BOTTOM") then return "height" end
end

-- The axis a text is squeezed out on: its own, or that of a frame it hangs on through its anchors (the client gives
-- a rect to nothing anchored to a frame without one). The squeeze is the first frame up the chain whose own anchors
-- sit on laid-out frames; a chain that ends on a frame with no rect for another reason (unanchored, or 0 x 0 on
-- purpose) hides the text instead, and gives nil, as does a chain where everything has room.
local function squeezeOf(w, depth)
  if depth >= 64 then return nil end
  for _, p in pairs(w.__points) do
    local rel = p.rel
    if rel and rel ~= UIParent and not rel:IsRectValid() then return squeezeOf(rel, depth + 1) end
  end
  return squeezedAxis(w)
end

-- Whether a font string would show some text: shown all the way up, not faded out, and not blank.
local function showsText(fs)
  return fs:IsVisible() and drawnAlpha(fs) > FIT.alpha and fs.__text ~= nil and stub.drawnText(fs.__text):find("%S") ~= nil
end

-- One text the audit looks at: { fs, box, ink (clipped to what shows), name }, or { fs, name, squeezed = axis } for
-- one squeezed out of sight (no ink); nil when it draws nothing.
local function measured(fs)
  if not showsText(fs) then return nil end
  local axis = squeezeOf(fs, 0)
  if axis then return { fs = fs, name = textName(fs.__text), squeezed = axis } end
  if not fs:IsRectValid() then return nil end
  local box = boxOf(fs)
  local ink = clipped(fs, inkRect(fs, box))
  return ink and { fs = fs, box = box, ink = ink, name = textName(fs.__text), scroller = scrollerOf(fs), window = windowOf(fs) }
end

-- One control the audit looks at: { frame, rect (clipped to what shows), window, scroller }; nil when it shows nothing.
local function control(w)
  local shows = looksLikeControl(w) and drawn(w) and clipped(w, stub.rectOf(w))
  return shows and { frame = w, rect = shows, window = windowOf(w), scroller = scrollerOf(w) } or nil
end

-- Adds the shown texts and controls at and under frame w to the lists, skipping hidden branches.
local function collect(w, texts, controls)
  if not w:IsShown() then return end
  for _, region in ipairs({ w:GetRegions() }) do
    if region.__kind == "FontString" then texts[#texts + 1] = measured(region) end
  end
  controls[#controls + 1] = control(w)
  for _, child in ipairs({ w:GetChildren() }) do collect(child, texts, controls) end
end

-- Whether the addon made a widget: made after the client's frames at load (stub.firstAddonFrame) and not the game's.
-- The world's windows and Retail's stubs are made later but are the game's (wow-taint.lua marks them __byGame;
-- scripts/tests/README.md "Who owns a frame"). wow-inspect.lua's screen and the lifecycle footprint ask it too.
function stub.addonMade(w)
  return w.__id > stub.firstAddonFrame and rawget(w, "__byGame") ~= true
end

-- Every text and control under root (or under every top-level frame the addon made, when nil).
local function gather(root)
  local texts, controls = {}, {}
  if root then collect(root, texts, controls) return texts, controls end
  for _, w in ipairs(stub.frames) do
    local made = stub.addonMade(w)
    if made and w.__kind == "FontString" then texts[#texts + 1] = measured(w) end
    if made then controls[#controls + 1] = control(w) end
  end
  return texts, controls
end

-- A finding: its kind, the text, where it is, and what it ran into (another text or a control).
local function finding(kind, t, other)
  return { kind = kind, text = t.name, place = placeOf(t.fs), other = other, size = t.fs:GetLineHeight() }
end

-- What a control is called in a finding: its label's text, else its kind.
local function controlName(c)
  for _, region in ipairs({ c:GetRegions() }) do
    if region.__text and region.__text ~= "" and region:IsShown() then return textName(region.__text) end
  end
  return c.__kind
end

-- The cut and spill findings for one text (a squeezed one is cut whole, and has no ink to spill).
local function ownFindings(t, out)
  if t.squeezed then out[#out + 1] = finding("cut", t, "squeezed to no " .. t.squeezed) return end
  local why = cutReason(t.fs, t.box)
  if why then out[#out + 1] = finding("cut", t, why) end
  if spills(t.fs, t.ink, t.box.scale) then out[#out + 1] = finding("spill", t) end
end

-- Whether two rects overlap by more than the slack each way (touching edges do not count).
local function overlaps(a, b)
  local across = math.min(a.left + a.width, b.left + b.width) - math.max(a.left, b.left)
  local down = math.min(a.bottom + a.height, b.bottom + b.height) - math.max(a.bottom, b.bottom)
  return across > FIT.slack and down > FIT.slack
end

-- Whether a text draws over a control: one in the same window and scroll view that is not its own (one
-- window over another, an unlock handle over its frame, is a matter of where frames sit, not of text).
local function coversControl(t, c)
  if c.window ~= t.window or c.scroller ~= t.scroller or not overlaps(t.ink, c.rect) then return false end
  return not within(t.fs, c.frame)
end

-- The overlap findings for one text against the texts after it (in the same window and scroll view) and the controls;
-- a squeezed text draws nothing, so it overlaps nothing.
local function overlapFindings(texts, i, controls, out)
  local t = texts[i]
  if t.squeezed then return end
  for j = i + 1, #texts do
    local o = texts[j]
    local together = not o.squeezed and o.window == t.window and o.scroller == t.scroller
    if together and overlaps(t.ink, o.ink) then out[#out + 1] = finding("overlap", t, o.name) end
  end
  for _, c in ipairs(controls) do
    if coversControl(t, c) then out[#out + 1] = finding("overlap", t, controlName(c.frame)) end
  end
end

-- Every fit problem under root (see the top of this file).
function __wfgTextFit(root)
  local texts, controls = gather(root)
  local out = {}
  for i, t in ipairs(texts) do
    ownFindings(t, out)
    overlapFindings(texts, i, controls, out)
  end
  return out
end
