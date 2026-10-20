-- Game windows, moving: the game's own windows (the character pane, the combined bag, the group finder,
-- the guild window, the spellbook and talents, the Legacy window, collections, the game menu, the auction
-- house and a few more) can be dragged by their title bar, and keep the place they are dropped on. Every
-- one of them can also be dragged by an empty spot along its top edge (a press the window itself gets, so
-- it never takes a click from a button), and the calendar, the inspect window and some others are dragged
-- that way only.
--
-- The game places these windows itself every time it opens one: the panel manager
-- (Blizzard_UIParentPanelManager: ShowUIPanel -> FramePositionDelegate -> UpdateUIPanelPositions, which
-- clears each open panel's points and anchors it to UIParent by its area, left, center or right) and the
-- bags' own layout (UpdateContainerFrameAnchors stacks the open bags from the bottom-right corner). So a
-- saved place is put back after the game has placed the window: when it shows, and after each of those
-- two calls. Nothing is moved in combat (the collections window holds protected buttons, and the game
-- refuses to move a frame anchored to them in a fight): a drag doesn't start, one still held as a fight
-- starts ends then, and putting a window back waits until the fight ends. Places are kept in the Windows
-- module's settings (moved), by window name, as the window's top-left corner in UIParent's units.
--
-- Left where the game puts them: the world map and its quest panel (maximised and minimised by the game;
-- Vanguard's own quest log has its own mover), loot and roll windows (opened at the cursor), popups and
-- the ready check (stacked by the game), the flight map and Edit Mode's window.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgDragging = ns.FrameState("vgDragging")
local vgMovable = ns.FrameState("vgMovable")
local vgMoveHandle = ns.FrameState("vgMoveHandle")
local vgPress = ns.FrameState("vgPress")

local GW = ns.GetModule("Windows")

-- The windows that can be dragged, by global name; one the client lacks (or hasn't loaded yet) is skipped.
GW.MOVABLE = {
  "CharacterFrame", "ContainerFrameCombinedBags", "GameMenuFrame", "FriendsFrame", "SocialUIFrame", "MerchantFrame",
  "MailFrame", "LFGParentFrame", "CommunitiesFrame", "PlayerSpellsFrame", "LegacySystemFrame",
  "CollectionsJournal", "AuctionHouseFrame", "ProfessionsFrame", "AchievementFrame",
}
-- The windows dragged only by an empty spot along their top edge: no drag area is laid over them, since
-- the game draws buttons (the calendar's month arrows) where one would go.
GW.MOVABLE_TOP = {
  "CalendarFrame", "InspectFrame", "TradeFrame", "DressUpFrame", "ClassTrainerFrame", "GuildBankFrame", "MacroFrame",
  "PetStableFrame", "RaidParentFrame", "OpenMailFrame", "GroupLootHistoryFrame", "ItemTextFrame", "AddonList",
  "HelpFrame", "QuestLogPopupDetailFrame",
}
-- How far down from a window's top edge a press starts a drag (units).
GW.MOVE_GRAB = 30
-- The part a window's title bar is, by window, when it isn't its TitleContainer (parentKey).
GW.MOVE_BAR = { GameMenuFrame = "Header" }
-- The pages that cover a window and carry its title (the group finder's), by window: each page's title
-- bar is a drag area too, since the page takes the press before the window does.
GW.MOVE_PAGES = { LFGParentFrame = { "LFGListingFrame", "LFGBrowseFrame", "LFGWhoListFrame" } }
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
  frame:SetPoint("TOPLEFT", UIParent, "BOTTOMLEFT", ns.SaneOffset(at.x) / scale, ns.SaneOffset(at.y) / scale)
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
  if type(frame) ~= "table" or not vgMovable[frame] or vgDragging[frame] or not GW.Moved()[name] then return end
  ns.OutOfCombat(function() GW.PutBack(name, frame) end, "move " .. name)
end

-- Every window that can be moved: the ones with a drag area, then the ones dragged by their top edge.
local function names()
  local out = {}
  for _, list in ipairs({ GW.MOVABLE, GW.MOVABLE_TOP }) do
    for _, name in ipairs(list) do out[#out + 1] = name end
  end
  return out
end

-- Puts every moved window back (after the game has laid its windows out again).
function GW.PlaceAll()
  for _, name in ipairs(names()) do place(name) end
end

-- Dragging ------------------------------------------------------------------------------------------

-- A drag on a window's title bar starts moving it; never in combat.
local function startDrag(handle)
  if ns.InCombat() then return end
  vgDragging[handle.window] = true
  handle.window:StartMoving()
end

-- Stops a window following the mouse and keeps the game's layout cache out of it.
local function stop(frame)
  frame:StopMovingOrSizing()
  frame:SetUserPlaced(false)
end

-- Runs a window's drop out of combat: StopMovingOrSizing is protected, and the collections window holds protected
-- buttons, so a drop the fight caught waits for its end (a drag still held as a fight starts ends before it: dropAll).
local function settle(frame, drop)
  ns.OutOfCombat(function() drop(frame) end, "drop " .. frame:GetName())
end

-- The drop of a title-bar drag: the window stops where it is and its place is saved.
local function dropped(frame)
  stop(frame)
  GW.SavePlace(frame:GetName(), frame)
end

-- Ends a title-bar drag (dropped, out of combat); nothing when the window isn't being dragged.
local function endDrag(frame)
  if not vgDragging[frame] then return end
  vgDragging[frame] = nil
  settle(frame, dropped)
end

-- The drop on the drag area.
local function stopDrag(handle)
  endDrag(handle.window)
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

-- Lays an invisible drag area over a title bar (or along a window's top); it moves `frame`, drawn on `parent`.
local function newHandle(parent, frame, name, bar)
  local h = CreateFrame("Frame", nil, parent)
  h.window, h.ignoreInLayout = frame, true
  placeHandle(h, parent, bar)
  h:EnableMouse(true)
  h:RegisterForDrag("LeftButton")
  h:SetScript("OnDragStart", ns.Guard("drag " .. name, startDrag))
  h:SetScript("OnDragStop", ns.Guard("drop " .. name, stopDrag))
  return h
end

-- Lays an invisible drag area over a window's title bar, and over the title bar of each page that covers
-- it (GW.MOVE_PAGES: the group finder's pages are windows of their own, with the title).
local function addHandle(frame, name)
  vgMoveHandle[frame] = newHandle(frame, frame, name, titleBar(frame, name))
  for _, key in ipairs(GW.MOVE_PAGES[name] or {}) do
    local page = _G[key]
    local bar = type(page) == "table" and titleBar(page, key)
    if bar then newHandle(page, frame, name, bar) end
  end
end

-- Whether the mouse is over the top GW.MOVE_GRAB units of a window.
local function overTop(frame)
  local _, y = GetCursorPosition()
  local top = frame:GetTop()
  if not top then return false end
  local below = top - y / frame:GetEffectiveScale()
  return below >= 0 and below <= GW.MOVE_GRAB
end

-- A press on an empty spot along a window's top edge starts moving it, never in combat. The window only
-- gets the press where none of the game's buttons or panels sits over the spot, so no click is taken.
local function pressTop(frame, button)
  if button ~= "LeftButton" or ns.InCombat() or vgDragging[frame] or not overTop(frame) then return end
  vgDragging[frame], vgPress[frame] = true, { frame:GetLeft() or 0, frame:GetTop() }
  frame:StartMoving()
end

-- The drop of a press-move that started with the window's top-left corner at `from`: it stops, and its place is
-- saved unless it never left its spot (a click).
local function released(frame, from)
  stop(frame)
  local left, top = frame:GetLeft(), frame:GetTop()
  if left and top and (math.abs(left - from[1]) >= 1 or math.abs(top - from[2]) >= 1) then GW.SavePlace(frame:GetName(), frame) end
end

-- The release of a press-move (or the window closing): dropped as `released`, out of combat.
local function releaseTop(frame)
  local from = vgPress[frame]
  if not from then return end
  vgDragging[frame], vgPress[frame] = nil, nil
  settle(frame, function() released(frame, from) end)
end

-- The window hid mid-drag (Escape, out of range), or a fight is starting: a press-move ends as it does on release; a
-- title-bar drag ends where the window is and its place is saved, so the flag never outlives the drag (the drag
-- area, hidden with the window, may not get its drop) and the saved place goes on being put back.
local function dropHidden(frame)
  if vgPress[frame] then return releaseTop(frame) end
  endDrag(frame)
end

-- Makes a window movable and kept on the screen, dragged by its top edge, and by an invisible drag area over
-- its title bar too when it is one of GW.MOVABLE.
local function makeMovable(frame, name, withHandle)
  frame:SetMovable(true)
  frame:SetClampedToScreen(true)
  if withHandle then addHandle(frame, name) end
  frame:HookScript("OnMouseDown", ns.Guard("press " .. name, pressTop))
  frame:HookScript("OnMouseUp", ns.Guard("release " .. name, releaseTop))
  frame:HookScript("OnHide", ns.Guard("release " .. name, dropHidden))
end

-- Sets a window up once, when the client has it: made movable out of combat, and put back each time it shows.
local function setUp(name, withHandle)
  local frame = _G[name]
  if type(frame) ~= "table" or type(frame.HookScript) ~= "function" or vgMovable[frame] then return end
  vgMovable[frame] = true
  ns.OutOfCombat(function() makeMovable(frame, name, withHandle) end, "move setup " .. name)
  frame:HookScript("OnShow", function() place(name) end)
end

-- Sets up every window the client has now (called again as parts of the game load their windows).
local function setUpAll()
  for _, name in ipairs(GW.MOVABLE) do setUp(name, true) end
  for _, name in ipairs(GW.MOVABLE_TOP) do setUp(name, false) end
end

-- A fight is starting (PLAYER_REGEN_DISABLED, before the lockdown): every drag still held ends now, where the window
-- is, while the game still lets a window stop; one the fight caught would follow the mouse until it ended.
local function dropAll()
  for _, name in ipairs(names()) do
    local frame = _G[name]
    if type(frame) == "table" and vgDragging[frame] then dropHidden(frame) end
  end
end

-- Entry point, from GW.Enable while "Drag game windows by their title bar" is on: the windows now and as
-- they load, every moved window put back after the game places its windows (calls the client lacks are skipped),
-- and any drag ended as a fight starts.
function GW.WatchMoves()
  setUpAll()
  ns.On("ADDON_LOADED", setUpAll)
  ns.On("PLAYER_REGEN_DISABLED", dropAll)
  for _, fn in ipairs(GW.MOVE_LAYOUTS) do
    if type(_G[fn]) == "function" then hooksecurefunc(fn, ns.Guard("hook " .. fn, GW.PlaceAll)) end
  end
end
