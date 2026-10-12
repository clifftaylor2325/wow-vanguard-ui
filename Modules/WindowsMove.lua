-- Game windows, moving: the game's own windows (the character pane, the combined bag, the group finder,
-- the guild window, the spellbook and talents, the Legacy window, collections, the game menu, the auction
-- house and a few more) can be dragged by their title bar, and keep the place they are dropped on.
--
-- The game places these windows itself every time it opens one: the panel manager
-- (Blizzard_UIParentPanelManager: ShowUIPanel -> FramePositionDelegate -> UpdateUIPanelPositions, which
-- clears each open panel's points and anchors it to UIParent by its area, left, center or right) and the
-- bags' own layout (UpdateContainerFrameAnchors stacks the open bags from the bottom-right corner). So a
-- saved place is put back after the game has placed the window: when it shows, and after each of those
-- two calls. Nothing is moved in combat (the collections window holds protected buttons, and the game
-- refuses to move a frame anchored to them in a fight): a drag doesn't start, and putting a window back
-- waits until the fight ends. Places are kept in the Windows module's settings (moved), by window name,
-- as the window's top-left corner in UIParent's units.
--
-- Left where the game puts them: the world map and its quest panel (maximised and minimised by the game;
-- Vanguard's own quest log has its own mover), loot and roll windows (opened at the cursor), popups and
-- the ready check (stacked by the game), the flight map and Edit Mode's window.

local ADDON, ns = ...

local GW = ns.GetModule("Windows")

-- The windows that can be dragged, by global name; one the client lacks (or hasn't loaded yet) is skipped.
GW.MOVABLE = {
  "CharacterFrame", "ContainerFrameCombinedBags", "GameMenuFrame", "FriendsFrame", "SocialUIFrame", "MerchantFrame",
  "MailFrame", "LFGParentFrame", "CommunitiesFrame", "PlayerSpellsFrame", "SpellBookFrame", "LegacySystemFrame",
  "CollectionsJournal", "TransmogFrame", "AuctionHouseFrame", "ProfessionsFrame", "AchievementFrame",
}
-- The part a window's title bar is, by window, when it isn't its TitleContainer (parentKey).
GW.MOVE_BAR = { GameMenuFrame = "Header" }
-- The drag area (units): `trim` is left off the title bar's right end (the close and minimize buttons sit
-- there); a window without a title bar gets a strip `height` tall along its top, `left` in from its left
-- edge (the portrait and its button) and `right` in from its right edge.
GW.MOVE_STRIP = { trim = 40, height = 24, left = 58, right = 64 }
-- The game's calls that place its windows again; every moved window is put back after each.
GW.MOVE_LAYOUTS = { "UpdateUIPanelPositions", "UpdateContainerFrameAnchors" }

-- Saved places ---------------------------------------------------------------------------------

-- The saved places by window name (the Windows module's settings, read even while the module is off).
function GW.Moved()
  return ns.Settings("Windows", GW.defaults).moved
end

-- Saves where a frame sits now under key: its top-left corner in UIParent's units (its own scale taken out,
-- since the game scales the bags to fit the screen).
function GW.SavePlace(key, frame)
  local scale, left, top = frame:GetScale(), frame:GetLeft(), frame:GetTop()
  if not (left and top) then return end
  GW.Moved()[key] = { x = left * scale, y = top * scale }
end

-- Puts a frame on the place saved under key; nothing when there is none. The caller keeps it out of combat.
function GW.PutBack(key, frame)
  local at, scale = GW.Moved()[key], frame:GetScale()
  if type(at) ~= "table" or type(at.x) ~= "number" or type(at.y) ~= "number" then return end
  frame:ClearAllPoints()
  frame:SetPoint("TOPLEFT", UIParent, "BOTTOMLEFT", at.x / scale, at.y / scale)
end

-- Forgets every saved place: each window goes back where the game puts it the next time it opens.
function GW.ResetMoves()
  local moved = GW.Moved()
  for key in pairs(moved) do moved[key] = nil end
end

-- Putting windows back ----------------------------------------------------------------------------

-- Puts one window back on its saved place (not while it's being dragged), out of combat: in a fight
-- it waits, once per window, until the fight ends.
local function place(name)
  local frame = _G[name]
  if type(frame) ~= "table" or not frame.vgMovable or frame.vgDragging or not GW.Moved()[name] then return end
  ns.OutOfCombat(function() GW.PutBack(name, frame) end, "move " .. name)
end

-- Puts every moved window back (after the game has laid its windows out again).
function GW.PlaceAll()
  for _, name in ipairs(GW.MOVABLE) do place(name) end
end

-- Dragging ------------------------------------------------------------------------------------------

-- A drag on a window's title bar starts moving it; never in combat.
local function startDrag(handle)
  if ns.InCombat() then return end
  handle.window.vgDragging = true
  handle.window:StartMoving()
end

-- The drop: the window stops, the game's own layout cache is kept out of it, and its place is saved.
local function stopDrag(handle)
  local frame = handle.window
  if not frame.vgDragging then return end
  frame.vgDragging = nil
  frame:StopMovingOrSizing()
  frame:SetUserPlaced(false)
  GW.SavePlace(frame:GetName(), frame)
end

-- The window's title bar: its TitleContainer or the part GW.MOVE_BAR names, or nil.
local function titleBar(frame, name)
  local bar = frame[GW.MOVE_BAR[name] or "TitleContainer"]
  return type(bar) == "table" and type(bar.GetFrameLevel) == "function" and bar or nil
end

-- Lays the drag area over the title bar short of its right end, or along the window's top when it has none,
-- one level above the bar (or the window).
local function placeHandle(h, frame, bar)
  local s = GW.MOVE_STRIP
  if bar then
    h:SetPoint("TOPLEFT", bar, "TOPLEFT")
    h:SetPoint("BOTTOMRIGHT", bar, "BOTTOMRIGHT", -s.trim, 0)
  else
    h:SetPoint("TOPLEFT", frame, "TOPLEFT", s.left, 0)
    h:SetPoint("BOTTOMRIGHT", frame, "TOPRIGHT", -s.right, -s.height)
  end
  h:SetFrameLevel((bar or frame):GetFrameLevel() + 1)
end

-- Makes a window movable, kept on the screen, with an invisible drag area over its title bar.
local function makeMovable(frame, name)
  frame:SetMovable(true)
  frame:SetClampedToScreen(true)
  local h = CreateFrame("Frame", nil, frame)
  h.window = frame
  placeHandle(h, frame, titleBar(frame, name))
  h:EnableMouse(true)
  h:RegisterForDrag("LeftButton")
  h:SetScript("OnDragStart", ns.Guard("drag " .. name, startDrag))
  h:SetScript("OnDragStop", ns.Guard("drop " .. name, stopDrag))
  frame.vgMoveHandle = h
end

-- Sets a window up once, when the client has it: made movable out of combat, and put back each time it shows.
local function setUp(name)
  local frame = _G[name]
  if type(frame) ~= "table" or type(frame.HookScript) ~= "function" or frame.vgMovable then return end
  frame.vgMovable = true
  ns.OutOfCombat(function() makeMovable(frame, name) end, "move setup " .. name)
  frame:HookScript("OnShow", function() place(name) end)
end

-- Sets up every window the client has now (called again as parts of the game load their windows).
local function setUpAll()
  for _, name in ipairs(GW.MOVABLE) do setUp(name) end
end

-- Entry point, from GW.Enable while "Drag game windows by their title bar" is on: the windows now and as
-- they load, and every moved window put back after the game places its windows (calls the client lacks are skipped).
function GW.WatchMoves()
  setUpAll()
  ns.On("ADDON_LOADED", setUpAll)
  for _, fn in ipairs(GW.MOVE_LAYOUTS) do
    if type(_G[fn]) == "function" then hooksecurefunc(fn, ns.Guard("hook " .. fn, GW.PlaceAll)) end
  end
end
