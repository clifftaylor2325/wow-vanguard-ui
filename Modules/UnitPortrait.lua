-- Portraits on the player, target and focus frames: a square at the frame's outer end, the unit's 2D portrait (the
-- client's own portrait texture call) or, for a player, the class icon. Off until a frame's choice is switched on. A
-- part of the unit frames module (the playerPortrait, targetPortrait and focusPortrait settings), in a file of its own;
-- UF.build starts it (UF.Portrait.Attach). The bars step in from the portrait (UF.PortraitRoom).
-- The portrait needs a square end: it is hidden while the HUD look points or cuts the frame's outer corners deeper than
-- PT.MAX_CORNER (Shield, Plain with the shield corners on, the Versus deck's rounding), and the bars take the room back.

local ADDON, ns = ...

local T = ns.Theme

local UF = ns.GetModule("UnitFrames")
local PT = {}
UF.Portrait = PT

-- The frames that carry one.
PT.KEYS = { player = true, target = true, focus = true }
-- The choices a frame's setting holds ("off" for anything else).
PT.CHOICES = { portrait = true, class = true }
-- What changes a unit's portrait (the target and focus also repaint when they change: PT.UNIT_CHANGES).
PT.EVENTS = { "UNIT_PORTRAIT_UPDATE", "UNIT_MODEL_CHANGED" }
-- The deepest cut or rounding (units) an outer corner may have and still leave the square its room: Rimmed's four.
PT.MAX_CORNER = 4
-- The client's sheet of class icons (CLASS_ICON_TCOORDS holds each class's square on it).
PT.SHEET = "Interface\\TargetingFrame\\UI-Classes-Circles"

-- What a frame shows: "portrait", "class" or "off".
---@param f table a unit frame
---@return string
function PT.Choice(f)
  local choice = UF.settings[f.key .. "Portrait"]
  return PT.CHOICES[choice] and choice or "off"
end

-- Whether the frame's outer end is square enough to hold the portrait under the HUD look in force.
local function fits(f)
  local point = "TOP" .. f.outer
  return T.CornerLook(f, point) ~= "point" and T.CornerAt(f, point) <= PT.MAX_CORNER
end

-- The portrait's side: the frame's height less the bar inset above and below.
local function side(f)
  return f.vgHeight - 2 * UF.BarInset(f)
end

-- Works out how much of a frame's width the portrait takes, with its gap to the bars (units; 0 while it is off or
-- hidden by the look), and keeps it on the frame for PT.Room. Called as the parts are laid out (UF.PlaceParts), the
-- only time the settings and the look change it. From the size the frame was given: a fight may hide the one it reports.
---@param f table a unit frame
---@return number
function PT.Measure(f)
  local room = 0
  if PT.KEYS[f.key] and PT.Choice(f) ~= "off" and fits(f) then room = side(f) + UF.BarInset(f) end
  f.vgPortraitRoom = room
  return room
end

-- How much of a frame's width the portrait takes, as PT.Measure last found it: one field read, so a refresh costs
-- nothing while the portrait is off.
---@param f table a unit frame
---@return number
function PT.Room(f)
  return f.vgPortraitRoom or 0
end

-- The unit's class icon square on the client's sheet, or nil (not a player, a hidden class, or no sheet).
local function classSquare(unit)
  if not ns.IsTrue(UnitIsPlayer(unit)) or type(CLASS_ICON_TCOORDS) ~= "table" then return nil end
  local _, class = UnitClass(unit)
  if ns.IsSecret(class) then return nil end
  return CLASS_ICON_TCOORDS[class]
end

-- Paints the portrait: the class icon where the choice and the unit give one, else the unit's 2D portrait.
local function paint(f)
  local square = PT.Choice(f) == "class" and classSquare(f.unit)
  if square then
    f.portrait:SetTexture(PT.SHEET)
    return f.portrait:SetTexCoord(unpack(square))
  end
  f.portrait:SetTexCoord(0, 1, 0, 1)
  if type(SetPortraitTexture) == "function" then SetPortraitTexture(f.portrait, f.unit) end
end

-- Shows or hides the portrait for the frame's choice, the look and whether its unit exists, and paints it.
---@param f table a unit frame with a portrait
function PT.Update(f)
  if not f.portrait then return end
  local on = PT.Room(f) > 0 and ns.IsTrue(UnitExists(f.unit))
  f.portrait:SetShown(on)
  f.portraitBack:SetShown(on)
  if on then paint(f) end
end

-- Puts the portrait at the frame's outer end, a bar inset in, and paints it. Out of combat: it follows a layout of the
-- secure button (UF.PlaceParts).
---@param f table a unit frame with a portrait
function PT.Place(f)
  local inset, outer = UF.BarInset(f), f.outer
  local x = outer == "LEFT" and inset or -inset
  f.portraitBack:ClearAllPoints()
  f.portraitBack:SetPoint(outer, f, outer, x, 0)
  f.portraitBack:SetSize(side(f), side(f))
  f.portrait:ClearAllPoints()
  f.portrait:SetAllPoints(f.portraitBack)
  PT.Update(f)
end

-- Gives the frame its portrait and the dark square behind it, on the text layer, hidden until PT.Place shows them.
local function add(f)
  f.portraitBack = f.layer:CreateTexture(nil, "BACKGROUND")
  f.portraitBack:SetColorTexture(T.RGB("shade"))
  f.portrait = f.layer:CreateTexture(nil, "ARTWORK")
  f.portraitBack:Hide()
  f.portrait:Hide()
end

-- What changes the unit a frame shows (the target, the focus, a new zone): the frames repaint.
PT.UNIT_CHANGES = { "PLAYER_TARGET_CHANGED", "PLAYER_FOCUS_CHANGED", "PLAYER_ENTERING_WORLD" }

-- Paints the portraits again (a frame with none shown does nothing).
function PT.Refresh()
  for key in pairs(PT.KEYS) do
    if UF.frames[key] then PT.Update(UF.frames[key]) end
  end
end

-- Starts hearing the unit changes, once.
function PT.Listen()
  if PT.listening then return end
  PT.listening = true
  for _, event in ipairs(PT.UNIT_CHANGES) do ns.On(event, PT.Refresh) end
end

-- Adds the portraits to the frames that carry them (once the unit frames are built) and follows their unit's changes.
function PT.Attach()
  for key in pairs(PT.KEYS) do
    local f = UF.frames[key]
    if f and not f.portrait then
      add(f)
      f.vgPortraitEvents = ns.OnUnit(PT.EVENTS, function() PT.Update(f) end, f.unit)
      PT.Place(f)
    end
  end
  PT.Listen()
end

-- The switches changed (Unit frames page): the three frames lay their bars out again and paint, out of combat.
function PT.Apply()
  for key in pairs(PT.KEYS) do
    if UF.frames[key] then UF.PlaceParts(UF.frames[key]) end
  end
end
