-- The managed-frame containers for the TEST-ONLY client: the game's bottom and right containers that hold
-- its alert, cast, cooldown and tracker frames. Loads after wow-taint.lua. Never shipped in game.
--
-- A frame built from BottomManagedFrameTemplate or RightManagedFrameTemplate carries OnShow and OnHide scripts
-- that hand it to its container, and the container re-parents it and lays out every shown child again: each one
-- gets ClearAllPoints and SetPoint, the container gets SetSize. Nothing in it checks InCombatLockdown, so it runs in
-- a fight too, and when the addon's own Show, Hide or SetShown started it, the run has the addon's code on its stack
-- (wow-taint.lua blocks its calls on a protected frame, such as ExtraAbilityContainer while it holds
-- ExtraActionButton1). Source, identical on both clients:
--   Interface/AddOns/Blizzard_ManagedFrameSystem/Shared/ManagedFrameSystem.xml ManagedFrameTemplate (OnShow, OnHide),
--     BottomManagedFrameTemplate (align center), RightManagedFrameTemplate (align right),
--     ManagedFrameContainerBaseTemplate (VerticalLayoutFrame, respectChildScale, BottomManagedLayoutContainer)
--   Interface/AddOns/Blizzard_ManagedFrameSystem/[Family]/ManagedFrameSystem.xml ManagedFrameContainer (spacing 10)
--   Interface/AddOns/Blizzard_ManagedFrameSystem/Shared/ManagedFrameSystem.lua ManagedFrameMixin:OnShow/OnHide,
--     ManagedFrameContainerMixin:AddManagedFrame/UpdateFrame/RemoveManagedFrame
--   Interface/AddOns/Blizzard_SharedXML/LayoutFrame.lua BaseLayoutMixin:AddLayoutChildren/GetLayoutChildren,
--     LayoutMixin:Layout, VerticalLayoutMixin:LayoutChildren
-- Left out (approximations): the containers' own place on the screen, the action-bar-override alpha, the objective
-- tracker's UpdateHeight, the bottom row container (layoutOnBottom) laying out on its own, and the re-layout of every
-- held frame when UIParent shows again (UpdateManagedFrameContainers).

local stub = __wfgStub
local world = stub.world
local type = __wfgRawType

-- The managed frames by name, with the layoutIndex their XML gives them: { forever, retail } (retail falls back to
-- forever). Bottom ones: ExtraAbilityContainer.xml, GroupLootFrame.xml, CastingBarFrame.xml, CooldownViewer.xml,
-- UnitPowerBarAlt.xml (EncounterBar), TalkingHeadUI.xml, TutorialFrame.xml, ArchaeologyProgressBar.xml,
-- Blizzard_AuctionHouseMultisell.xml. Right ones: Blizzard_ObjectiveTracker.xml, DurabilityFrame.xml,
-- VehicleSeatIndicator.xml, TargetFrame.xml (BossTargetFrameContainer), Blizzard_QuestTimer.xml,
-- Blizzard_UIWidgetBelowMinimapFrame.xml, Deprecated_ArenaUI.xml, and Forever's QuestLogFrame.xml (QuestWatchFrame).
local MANAGED = {
  bottom = {
    ExtraAbilityContainer = { 15, 12 }, GroupLootContainer = { 3 }, PlayerCastingBarFrame = { 2 },
    EssentialCooldownViewer = { 13, 10 }, UtilityCooldownViewer = { 14, 11 }, BuffIconCooldownViewer = { 12, 9 },
    EncounterBar = { 6 }, TalkingHeadFrame = { 8 }, TutorialFrameAlertButton = { 24 },
    ArcheologyDigsiteProgressBar = { 7 }, AuctionHouseMultisellProgressFrame = { 61 },
  },
  right = {
    ObjectiveTrackerFrame = { 50 }, DurabilityFrame = { 9 }, VehicleSeatIndicator = { 3 }, BossTargetFrameContainer = { 4 },
    QuestTimerFrame = { 13, 2 }, UIWidgetBelowMinimapContainerFrame = { 1 }, ArenaEnemyFramesContainer = { 12 },
    QuestWatchFrame = { 50 },
  },
}
local ALIGN = { bottom = "center", right = "right" }
local SPACING = 10

-- The two containers, the game's frames on UIParent, each with its bottom row container.
local containers = {}
for side, name in pairs({ bottom = "BottomManagedFrameContainer", right = "RightManagedFrameContainer" }) do
  local c = stub.newWidget("Frame", name, UIParent)
  c.BottomManagedLayoutContainer = stub.newWidget("Frame", nil, c)
  c.BottomManagedLayoutContainer:Hide()
  containers[side] = { frame = c, showing = {} }
end
stub.managedContainers = containers

-- A child's size and scale as the layout reads them (true values: the game's own code measures).
local function measure(child)
  return rawget(child, "__width") or 0, rawget(child, "__height") or 0, rawget(child, "__scale") or 1
end

-- The container's shown children with a layoutIndex, not ignored, in layoutIndex order (GetLayoutChildren).
local function layoutChildren(frame)
  local list = {}
  for _, child in ipairs({ frame:GetChildren() }) do
    if child:IsShown() and not child.ignoreInLayout and child.layoutIndex then list[#list + 1] = child end
  end
  table.sort(list, function(a, b) return a.layoutIndex < b.layoutIndex end)
  return list
end

-- Lays the container's children out top to bottom and sizes it to them (VerticalLayoutMixin:LayoutChildren, Layout).
local function layout(frame)
  local top, wide = 0, 0
  for i, child in ipairs(layoutChildren(frame)) do
    local width, height, scale = measure(child)
    if i > 1 then top = top + SPACING end
    child:ClearAllPoints()
    child:SetPoint(child.align == "right" and "TOPRIGHT" or "TOP", 0, -top / scale)
    top, wide = top + height * scale, math.max(wide, width * scale)
  end
  frame:SetSize(wide, top)
end

-- AddManagedFrame and UpdateFrame: a shown frame in its default place is taken in, re-parented and laid out.
local function addManaged(box, w)
  if w.ignoreFramePositionManager or not w:IsShown() then return end
  if type(w.IsInDefaultPosition) == "function" and not w:IsInDefaultPosition() then return end
  box.showing[w] = true
  w:ClearAllPoints()
  w:SetParent(w.layoutOnBottom and box.frame.BottomManagedLayoutContainer or box.frame)
  layout(box.frame)
end

-- RemoveManagedFrame: a frame that hides leaves the container, which lays out the rest again.
local function removeManaged(box, w)
  if not box.showing[w] then return end
  box.showing[w] = nil
  if type(w.IsInDefaultPosition) ~= "function" then w:ClearAllPoints() end
  layout(box.frame)
end

-- The layoutIndex a managed frame's XML gives it on the client the test runs.
local function indexFor(row)
  return world.client == "retail" and row[2] or row[1]
end

-- The template on one frame: its key values (unless a stand-in set them) and the OnShow and OnHide scripts.
local function applyTemplate(w, side, row)
  local box = containers[side]
  rawset(w, "__managed", side)
  if w.layoutIndex == nil then w.layoutIndex = indexFor(row) end
  if w.align == nil then w.align = ALIGN[side] end
  w:SetScript("OnShow", function(self) addManaged(box, self) end)
  w:SetScript("OnHide", function(self) removeManaged(box, self) end)
end

-- Gives one of the game's managed frames, by name, its template.
local function manage(w)
  local name = rawget(w, "__name")
  if type(name) ~= "string" or not rawget(w, "__byGame") or rawget(w, "__managed") then return w end
  for side, rows in pairs(MANAGED) do
    if rows[name] then applyTemplate(w, side, rows[name]) end
  end
  return w
end

for _, w in ipairs(stub.frames) do manage(w) end

local createFrame = CreateFrame
-- CreateFrame: a game or test frame made under a managed frame's name gets the template (a test's stand-in). The
-- wrapper only passes the call on (stub.transparent), so wow-taint.lua still reads the frame's owner from its caller.
function CreateFrame(...)
  local w = manage(createFrame(...))
  return w
end
stub.transparent[CreateFrame] = true

local newWidget = stub.newWidget
-- Frames the world makes directly get the template too.
stub.newWidget = function(...)
  local w = manage(newWidget(...))
  return w
end
stub.transparent[stub.newWidget] = true
