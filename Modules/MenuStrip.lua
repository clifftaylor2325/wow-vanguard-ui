-- The game's always-on extras, put where they don't clutter the screen:
--   * the bag buttons and the micro menu (character, spellbook, talents, ...)
--     in one bar in the bottom-right corner: two rows of framed slots
--     (T.Slot wells, quiet: the accent edge only under the mouse), the bags over
--     the menu with a thin accent line between them. The menu row's slots
--     are taller, the game's icons' own shape, each icon filling its slot.
--     It is always shown by default; it can also show on mouseover, hide 10 s
--     after the mouse leaves it, show in combat, stay hidden, or follow a
--     checklist of conditions (Core/Visibility.lua);
--   * the quest tracker's spot, under the info strip on the right, no taller than
--     it. Vanguard's own tracker (Modules/QuestTracker.lua) fills it; only when that
--     is off is the game's tracker pinned into it and skinned here (one owner).
-- The buttons keep working as the game's own, with the game's icons and alert
-- flashes, each fitted inside a slot tile; a bag's slot shows how full the bag
-- is (red when full) and the backpack's how many slots your bags have free.
-- Vanguard's icons stand on the menu buttons; a switch brings the game's own back.
-- The bars stay where they're put when the game lays out its own frames again
-- (ns.Pin), re-fit whenever the game resizes or re-lays them out, hide the
-- bars' own frame art (the brass box), and a client without one of these frames
-- simply keeps its own.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgArrow = ns.FrameState("vgArrow")
local vgArt = ns.FrameState("vgArt")
local vgFill = ns.FrameState("vgFill")
local vgFree = ns.FrameState("vgFree")
local vgFreeBack = ns.FrameState("vgFreeBack")
local vgGlyph = ns.FrameState("vgGlyph")
local vgHeader = ns.FrameState("vgHeader")
local vgHover = ns.FrameState("vgHover")
local vgIcon = ns.FrameState("vgIcon")
local vgIcons = ns.FrameState("vgIcons")
local vgInset = ns.FrameState("vgInset")
local vgRow = ns.FrameState("vgRow")
local vgSlot = ns.FrameState("vgSlot")

local T = ns.Theme
local V = ns.Visibility

local MS = ns.Module("MenuStrip", { defaults = { menu = "always", tracker = true, glyphs = true, trackerLook = true } })

-- A slot's side and the gap between slots: screen pixels at UI scale 1, on the theme's 4 px grid.
MS.TILE, MS.GAP = 24, 4
-- The menu row's slots are taller than wide: the game's menu icons' own 4:5
-- shape (24 by 30), so an icon fills its slot undistorted.
MS.MENU_TILE_H = 30
-- The space between the bar's edge and its slots (the same on all four sides) (pixels).
MS.MARGIN = 12
-- The bar's height: the bags row, a gap and the menu row, inside the margin.
-- Its width hugs the longer row (MS.FitStrip).
MS.HEIGHT = MS.TILE + MS.GAP + MS.MENU_TILE_H + 2 * MS.MARGIN
-- Vanguard's line icons' side (pixels at UI scale 1), when they're switched on.
MS.GLYPH_PX = 20
-- How faint an empty bag slot's icon is (the game's empty bag-slot art, in grey).
MS.EMPTY_ALPHA = 0.35
-- How thick the fill along the bottom of a bag's slot is (pixels).
MS.FILL = 2
-- The backpack's free count sits this far in from its icon's corner, over a
-- dark backing this far out around it (pixels), and the backing's opacity.
MS.COUNT_PAD, MS.COUNT_BACK = 1, 0.75
-- The two rows, top first: the game's bar, its buttons' size, the padding the
-- game lays them out with (the micro menu overlaps its buttons by 5, the bag
-- bar spaces its by 2), its slots' height, how far the art sits in from a
-- slot's edge (the bag icons, full squares, get a little more air than the
-- menu icons, which are clear around their shape) and the row's middle below the bar's top
-- (pixels). Each bar is drawn at the scale that puts its buttons one slot
-- and one gap apart.
MS.ROWS = {
  { bar = "BagsBar", button = 45, pad = 2, tileH = MS.TILE, inset = 3, y = MS.MARGIN + MS.TILE / 2 },
  { bar = "MicroMenuContainer", button = 32, pad = -5, tileH = MS.MENU_TILE_H, inset = 2, y = MS.MARGIN + MS.TILE + MS.GAP + MS.MENU_TILE_H / 2 },
}
for _, row in ipairs(MS.ROWS) do row.scale = (MS.TILE + MS.GAP) / (row.button + row.pad) end
-- The quest tracker's spot: its width and the most height it gets (it ends above the
-- target of target at UI scale 1.0).
MS.TRACKER_W, MS.TRACKER_H = 260, 234
-- The game's bag buttons (backpack, bags, reagent bag, and the key ring Forever adds), framed where the client has them.
MS.BAGS = { "MainMenuBarBackpackButton", "CharacterBag0Slot", "CharacterBag1Slot", "CharacterBag2Slot", "CharacterBag3Slot", "CharacterReagentBag0Slot", "KeyRingButton" }
-- The key ring holds keys, not bag space, so its slot has no fill.
MS.NO_FILL = { KeyRingButton = true }
-- The bags counted in the backpack's free count (the backpack and bags 1 to 4).
MS.LAST_BAG = 4
-- When the bags' fill and free count are painted again.
MS.BAG_EVENTS = { "BAG_UPDATE_DELAYED", "BAG_CONTAINER_UPDATE", "PLAYER_ENTERING_WORLD" }
-- The bars' own frame art on Forever (the brass box), faded: the bar's panel is the only frame.
MS.BAR_ART = { MicroMenu = { "BorderArt", "BackgroundArt" }, BagsBar = { "BorderArt" } }
-- The frames in the bar that the game hides itself when it switches input
-- (MainActionBar_InitializeGamepad / _UnInitializeMKB), leaving the bar empty: shown again.
MS.KEEP_SHOWN = { "BagsBar", "MicroMenu" }

-- The game's menu buttons -> the name of Vanguard's line icon for each (shown when switched on). A client without one skips it.
MS.GLYPHS = {
  CharacterMicroButton = "Character", PlayerSpellsMicroButton = "Spellbook",
  SpellbookMicroButton = "Spellbook", TalentMicroButton = "Talents",
  ProfessionMicroButton = "Professions", AchievementMicroButton = "Achievements",
  QuestLogMicroButton = "Quests", GuildMicroButton = "Social", SocialsMicroButton = "Social",
  LFDMicroButton = "Group", CollectionsMicroButton = "Collections", EJMicroButton = "Journal",
  StoreMicroButton = "Shop", MainMenuMicroButton = "MenuCog", HelpMicroButton = "Help",
  WorldMapMicroButton = "Map", HousingMicroButton = "House", LegacyMicroButton = "Legacy",
}
-- A menu button's alert textures (new talents, mail...), kept when its art is faded.
MS.ALERTS = { "Flash", "FlashBorder", "FlashContent" }
-- A menu button's own background plates, faded: its slot is its background.
MS.MENU_ART = { "Background", "PushedBackground" }
-- A menu button's art fitted inside its slot, besides its state textures (its
-- icon, by state): the character button's portrait and its mask, and the
-- icon's alert glow.
MS.MENU_FIT = { "Portrait", "PortraitMask", "FlashContent" }
-- The game's menu icons (UI-HUD-MicroMenu-<name>-<state>, 64 by 82) are clear
-- around a smaller icon: the box every icon and its pressed shift fit in, as
-- fractions of the art, the slot's own 4:5 shape. An icon's texture is drawn
-- larger than its slot so this box fills it, its clear margins reaching past
-- the slot (never cropped: the client counts an atlas's coordinates its own way).
-- How far in from each edge a frame that passes clicks through has its hit area cut (more than it is wide).
MS.NO_HIT = 512
MS.ICON_BOX = { left = 0.14, right = 0.875, top = 0.16, bottom = 0.88 }
-- The states the game's menu icons come in (their atlas names' last part, lower case).
MS.ICON_STATES = { "up", "down", "disabled", "mouseover" }
-- The button state textures (faded under Vanguard's icons, greyed while disabled).
local STATES = { "GetNormalTexture", "GetPushedTexture", "GetDisabledTexture", "GetHighlightTexture" }
-- Every button on a slot, and the bag buttons with a fill.
MS.slotted, MS.filled = {}, {}

-- Account file version 2 (Core/DB.lua), a one-time reset when the bar was
-- reworked: every profile saved before it went back to the game's icons (the
-- defaults are written into saved tables, so each carried Vanguard's), and the
-- bag strip's own position went, since the bags now ride in the menu's bar.
-- Profiles saved since keep their own setting; new ones start with Vanguard's icons.
local function upgradeMenu(db)
  for _, profile in pairs(db.profiles or {}) do
    if type(profile.MenuStrip) == "table" then profile.MenuStrip.glyphs = false end
    if type(profile.positions) == "table" then profile.positions.bagstrip = nil end
  end
end
ns.UpgradeDB(2, upgradeMenu)

-- The bar ------------------------------------------------------------------------------------

-- A frame's scale relative to the screen's (1 when the client can't say).
local function relScale(f)
  local s = f:GetEffectiveScale() / UIParent:GetEffectiveScale()
  return s > 0 and s or 1
end

-- How far a row's end buttons reach past their slots (pixels).
local function overhang(row)
  return (row.button * row.scale - MS.TILE) / 2
end

-- Seats one of the game's bars in its row: drawn at the row's scale, its last
-- slot's right edge on the row's anchor (which MS.FitStrip places), its middle on the row's.
local function seat(f, row)
  f:SetParent(MS.strip)
  f:SetScale(row.scale)
  f:ClearAllPoints()
  f:SetPoint("RIGHT", row.anchor, "TOPRIGHT", overhang(row) / row.scale, -row.y / row.scale)
end

-- How many buttons the game laid out in a row (from its bar's width); 0 for a bar the client lacks.
local function rowCount(row)
  local f = _G[row.bar]
  if type(f) ~= "table" or f:GetParent() ~= MS.strip then return 0 end
  return math.max(0, math.floor(((f:GetWidth() or 0) + row.pad) / (row.button + row.pad) + 0.5))
end

-- How wide a row's slots are (pixels): its slots and the gaps between them.
function MS.RowWidth(row)
  local n = rowCount(row)
  return n > 0 and n * MS.TILE + (n - 1) * MS.GAP or 0
end

-- Sizes the bar to hug its rows, MS.MARGIN on every side, and places each
-- row's anchor: the longer row spans the bar inside the margin, the shorter
-- one is centered under or over it (on the same 4-pixel gaps). The bar's
-- mover keeps its corner, so it grows away from it. An anchor is its row's
-- box, a slot tall and never narrower than a unit: the client gives a
-- zero-sized frame no rect, and nothing anchored to one is drawn.
function MS.FitStrip()
  local w1, w2 = MS.RowWidth(MS.ROWS[1]), MS.RowWidth(MS.ROWS[2])
  local w = math.max(w1, w2)
  MS.strip:SetSize(w + 2 * MS.MARGIN, MS.HEIGHT)
  for i, row in ipairs(MS.ROWS) do
    local rw = i == 1 and w1 or w2
    row.anchor:SetSize(math.max(1, rw), MS.TILE)
    row.anchor:SetPoint("TOPRIGHT", MS.strip, "TOPRIGHT", -MS.MARGIN - (w - rw) / 2, 0)
  end
end

-- Runs a pinned bar's placement again after the game resized it or laid it out
-- again; through the pin, so pauses, combat and the pinning flag are honored.
function MS.Refit(bar)
  ns.Repin(bar)
end

-- Re-fits the bar whenever the game changes a row's size or lays it out again.
local function watchBar(f)
  f:HookScript("OnSizeChanged", MS.Refit)
  if type(f.Layout) == "function" and type(hooksecurefunc) == "function" then hooksecurefunc(f, "Layout", ns.Guard("hook Layout", MS.Refit)) end
end

-- Pins one of the game's bars into its row (on the row's own anchor, a frame
-- of ours the bar is fitted around), then fits the bar and the slots around
-- it, now and at every re-fit. Every row's anchor is made before the first
-- pin: fitting places them all.
local function pinInto(row)
  local f = _G[row.bar]
  if type(f) ~= "table" or not f.SetPoint then return end
  ns.Pin(f, function(bar)
    seat(bar, row)
    MS.FitStrip()
    MS.SizeSlots()
  end)
  watchBar(f)
end

-- Paints the line between the rows: the accent, one screen pixel thick.
function MS.PaintDivider()
  T.Tint(MS.divider, "accent")
  MS.divider:SetHeight(T.Pixel(MS.strip))
end

-- The thin accent line between the bags row and the menu row, under the
-- slots only: inside the bar's margin, which the bar hugs its rows with.
local function addDivider(strip)
  local y = -(MS.MARGIN + MS.TILE + MS.GAP / 2)
  MS.divider = T.Snap(strip:CreateTexture(nil, "ARTWORK"), "divider")
  MS.divider:SetTexture(T.WHITE)
  MS.divider:SetPoint("LEFT", strip, "TOPLEFT", MS.MARGIN, y)
  MS.divider:SetPoint("RIGHT", strip, "TOPRIGHT", -MS.MARGIN, y)
  MS.PaintDivider()
  T.OnChanged(MS.PaintDivider)
end

-- Applies the bar's visibility setting (Always, On mouseover, Auto-hide, In
-- combat, Hidden or a checklist): now, or when combat ends. The client's secure
-- state driver shows and hides it; on mouseover it fades by alpha, from the
-- mouse's own enter and leave events on it and its buttons (nothing polls),
-- feeling the mouse but letting clicks through.
function MS.ApplyVisibility()
  ns.OutOfCombat(function() V.ApplyNow(MS.strip, MS.settings.menu, MS.settings.menuWhen, true) end, MS.strip)
end

-- Follows the bar's visibility from the start: the mouse over it and the
-- frames in it, and zone changes for In an instance.
local function watchVisibility(strip)
  V.WatchHover(strip)
  V.Track(strip, MS.ApplyVisibility)
  MS.ApplyVisibility()
end

-- Fades the bars' own border and background art, whichever of it this client has.
function MS.FadeArt()
  for name, keys in pairs(MS.BAR_ART) do
    local f = _G[name]
    for _, key in ipairs(keys) do
      local t = type(f) == "table" and f[key]
      if type(t) == "table" and t.SetAlpha then t:SetAlpha(0) end
    end
  end
end

-- Shows one of the bar's frames again after the game hid it itself (out of
-- combat); one only hidden with the bar (still shown itself) is left alone.
function MS.Reshow(f)
  if f:IsShown() then return end
  ns.OutOfCombat(function() f:Show() end, "menustrip show " .. (f:GetName() or ""))
end

-- Keeps the bags and the menu shown in the bar: now, and whenever the game hides them.
local function keepShown()
  for _, name in ipairs(MS.KEEP_SHOWN) do
    local f = _G[name]
    if type(f) == "table" and f.HookScript then
      f:HookScript("OnHide", MS.Reshow)
      MS.Reshow(f)
    end
  end
end

-- Slots ---------------------------------------------------------------------------------------

-- A button's alert textures, as a set for T.FadeRegions to keep.
local function alerts(b)
  local keep = {}
  for _, key in ipairs(MS.ALERTS) do
    if type(b[key]) == "table" then keep[b[key]] = true end
  end
  return keep
end

-- Fades the button's state textures (the game swaps their art, never their alpha).
local function fadeStates(b)
  for _, get in ipairs(STATES) do
    local t = b[get] and b[get](b)
    if t then t:SetAlpha(0) end
  end
end

-- A slot's side in screen pixels: the button's place in its row less a gap,
-- at most MS.TILE (every button in a row has the same place: see fitBag).
local function slotPixels(b)
  local side = math.min(b:GetWidth(), b:GetHeight())
  if side <= 0 then side = vgRow[b].button end
  return math.min(MS.TILE, (side + vgRow[b].pad) * relScale(b) - MS.GAP)
end

-- Lets a button take clicks on its slot only, so the menu row's tall buttons
-- don't reach into the bags row.
local function hitSlot(b, w, h)
  local x, y = math.max(0, (b:GetWidth() - w) / 2), math.max(0, (b:GetHeight() - h) / 2)
  b:SetHitRectInsets(x, x, y, y)
end

-- How far a texture reaches past its place in the slot on each side (left,
-- top, right, bottom): nothing, or for one of the game's menu icons its clear
-- margins, so its icon's box (MS.ICON_BOX) fills the place.
local function reach(b, t)
  if not (vgIcons[b] and vgIcons[b][t]) then return 0, 0, 0, 0 end
  local box = MS.ICON_BOX
  local w = (vgSlot[b]:GetWidth() - 2 * vgInset[b]) / (box.right - box.left)
  local h = (vgSlot[b]:GetHeight() - 2 * vgInset[b]) / (box.bottom - box.top)
  return w * box.left, h * box.top, w * (1 - box.right), h * (1 - box.bottom)
end

-- Fits a texture inside a button's slot, its row's inset in from the edge.
local function inset(b, t)
  local d = vgInset[b]
  local l, top, r, bottom = reach(b, t)
  t:ClearAllPoints()
  t:SetPoint("TOPLEFT", vgSlot[b], "TOPLEFT", d - l, top - d)
  t:SetPoint("BOTTOMRIGHT", vgSlot[b], "BOTTOMRIGHT", r - d, d - bottom)
end

-- The fill along a bag's icon bottom, MS.FILL pixels thick, and on the
-- backpack the free count in the corner above it, at its text size on
-- screen, its backing MS.COUNT_PAD out around it.
local function placeFill(b, rel)
  vgFill[b]:SetHeight(MS.FILL / rel)
  if not vgFree[b] then return end
  local pad = MS.COUNT_PAD / rel
  vgFree[b]:SetPoint("BOTTOMRIGHT", vgIcon[b], "BOTTOMRIGHT", -pad, MS.FILL / rel + pad)
  T.TextSize(vgFree[b], T.RoleSize("badge") / rel)
  vgFreeBack[b]:SetPoint("TOPLEFT", vgFree[b], "TOPLEFT", -pad, pad)
  vgFreeBack[b]:SetPoint("BOTTOMRIGHT", vgFree[b], "BOTTOMRIGHT", pad, -pad)
end

-- Sizes a line icon: MS.GLYPH_PX on screen, never past the slot's inset.
local function sizeGlyph(b, side)
  local g = math.min(MS.GLYPH_PX / relScale(b), side - 2 * vgInset[b])
  vgGlyph[b]:SetSize(g, g)
end

-- Sizes a button's slot for its scale now: the slot (its row's shape), where
-- the button takes clicks, and the art, line icon and fill inside it.
local function sizeSlot(b)
  local rel, row = relScale(b), vgRow[b]
  local w = slotPixels(b) / rel
  local h = w * row.tileH / MS.TILE
  vgSlot[b]:SetSize(w, h)
  vgInset[b] = row.inset / rel
  hitSlot(b, w, h)
  for _, t in ipairs(vgArt[b]) do inset(b, t) end
  if vgGlyph[b] then sizeGlyph(b, w) end
  if vgFill[b] then placeFill(b, rel) end
end

-- Sizes every slot again (the bars' scale or the text size changed).
function MS.SizeSlots()
  for _, b in ipairs(MS.slotted) do sizeSlot(b) end
end

-- A button's slot tile: a quiet T.Slot well (dark, its accent edge only under
-- the mouse) one level under the button (so the button's art and alerts draw
-- over it), centered on it.
local function addSlot(b, row)
  local slot = T.Slot(CreateFrame("Frame", nil, b), { quiet = true, well = true })
  slot:SetPoint("CENTER", b, "CENTER")
  slot:SetFrameLevel(math.max(0, b:GetFrameLevel() - 1))
  vgSlot[b], vgRow[b] = slot, row
  MS.slotted[#MS.slotted + 1] = b
end

-- The slot's accent edge follows the mouse: brighter while it's over the
-- button, darker while the button is held down.
local function slotStates(b)
  b:HookScript("OnEnter", function(self) T.SlotState(vgSlot[self], "hover") end)
  b:HookScript("OnLeave", function(self) T.SlotState(vgSlot[self], nil) end)
  b:HookScript("OnMouseDown", function(self) T.SlotState(vgSlot[self], "pressed") end)
  b:HookScript("OnMouseUp", function(self) T.SlotState(vgSlot[self], self:IsMouseOver() and "hover" or nil) end)
end

-- Menu buttons --------------------------------------------------------------------------------

-- Tints a button's line icon: disabled while the button is disabled, else accent
-- while the mouse is over it, else text.
local function paintGlyph(b)
  T.Tint(vgGlyph[b], not b:IsEnabled() and "disabled" or (vgHover[b] and "accent" or "text"))
end

-- Notes whether the mouse is over a button and repaints its line icon.
local function hover(b, over)
  vgHover[b] = over
  paintGlyph(b)
end

-- Greys a menu button's own icon while the button is disabled (the game also dims it).
local function paintEnabled(b)
  local off = not b:IsEnabled()
  for _, get in ipairs(STATES) do
    local t = b[get] and b[get](b)
    if t then t:SetDesaturated(off) end
  end
  if vgGlyph[b] then paintGlyph(b) end
end

-- Vanguard's line icon in the middle of the slot instead of the game's (whose
-- art is faded, its alerts kept), lit in the accent under the mouse.
local function addGlyph(b, icon)
  T.FadeRegions(b, alerts(b))
  fadeStates(b)
  vgGlyph[b] = T.Snap(vgSlot[b]:CreateTexture(nil, "OVERLAY"))
  vgGlyph[b]:SetTexture(icon)
  vgGlyph[b]:SetPoint("CENTER", vgSlot[b], "CENTER")
  b:HookScript("OnEnter", function(self) hover(self, true) end)
  b:HookScript("OnLeave", function(self) hover(self, false) end)
end

-- Whether an atlas is one of the game's menu icons (not the portrait's art).
local function isIcon(atlas)
  local name = type(atlas) == "string" and atlas:lower() or ""
  if not name:find("^ui%-hud%-micromenu%-") or name:find("portrait", 1, true) then return false end
  for _, state in ipairs(MS.ICON_STATES) do
    if name:sub(-#state - 1) == "-" .. state then return true end
  end
  return false
end

-- The textures among a menu button's art that show one of the game's menu
-- icons (by their atlas now; the game swaps them only for others of the same shape), as a set.
local function icons(art)
  local set = {}
  for _, t in ipairs(art) do
    if isIcon(t.GetAtlas and t:GetAtlas()) then set[t] = true end
  end
  return set
end

-- Makes one of the game's frames on a menu button pass every click through: off
-- the mouse, and with no place left to hit if something turns the mouse back on.
local function passThrough(f)
  f:EnableMouse(false)
  f:SetHitRectInsets(MS.NO_HIT, MS.NO_HIT, MS.NO_HIT, MS.NO_HIT)
end

-- Lets clicks through the game's own child frames on a menu button (its
-- notification diamond overlay and any other alert), now and each time one is
-- shown, so a click reaches the button while a badge is shown. Our slot is left alone.
local function clickThrough(b)
  for _, child in ipairs({ b:GetChildren() }) do
    if child ~= vgSlot[b] then
      passThrough(child)
      child:HookScript("OnShow", ns.Guard("menustrip passthrough", function(self)
        ns.OutOfCombat(function() passThrough(self) end, "menustrip passthrough")
      end))
    end
  end
end

-- The game's art on a menu button that is fitted inside its slot: its state
-- textures and whichever of MS.MENU_FIT it has; and which of it shows the game's icons.
local function menuArt(b)
  local art = {}
  for _, get in ipairs(STATES) do
    local t = b[get] and b[get](b)
    if t then art[#art + 1] = t end
  end
  for _, key in ipairs(MS.MENU_FIT) do
    if type(b[key]) == "table" and b[key].SetPoint then art[#art + 1] = b[key] end
  end
  ns.OutOfCombat(function() clickThrough(b) end, "menustrip clickthrough " .. (b:GetName() or ""))
  return art, icons(art)
end

-- One of the game's menu buttons on a slot: its own background plates faded,
-- the game's icon filling the slot and its alerts kept (or Vanguard's
-- line icon, switched on), greyed while disabled, the slot's edge lit under
-- the mouse. Once per button.
function MS.SkinButton(b, icon)
  if vgSlot[b] then return end
  for _, key in ipairs(MS.MENU_ART) do if type(b[key]) == "table" then b[key]:SetAlpha(0) end end
  addSlot(b, MS.ROWS[2])
  vgArt[b], vgIcons[b] = menuArt(b)
  if MS.settings.glyphs then addGlyph(b, icon) end
  slotStates(b)
  b:HookScript("OnEnable", paintEnabled)
  b:HookScript("OnDisable", paintEnabled)
  paintEnabled(b)
  sizeSlot(b)
end

-- Bag buttons ---------------------------------------------------------------------------------

-- How many slots a bag has and how many of them are free; nil when the client can't say.
function MS.BagSpace(bag)
  local api = C_Container
  if type(api) ~= "table" or type(api.GetContainerNumSlots) ~= "function" then return nil end
  return ns.PlainNumber(api.GetContainerNumSlots(bag)) or 0, ns.PlainNumber((api.GetContainerNumFreeSlots(bag))) or 0
end

-- Free slots that take anything: the backpack's and bags 1 to 4 of the general
-- kind (a soul bag's or quiver's hold only shards or ammo); nil when the client can't say.
function MS.FreeSlots()
  local api = C_Container
  if type(api) ~= "table" or type(api.GetContainerNumFreeSlots) ~= "function" then return nil end
  local n = 0
  for bag = 0, MS.LAST_BAG do
    local free, family = api.GetContainerNumFreeSlots(bag)
    if (ns.PlainNumber(family) or 0) == 0 then n = n + (ns.PlainNumber(free) or 0) end
  end
  return n
end

-- One bag's slot: with no bag in it, the game's empty bag-slot art faint and
-- grey; else a fill along the bottom as wide as the bag is full, red when it is.
local function paintBag(b)
  local total, free = MS.BagSpace(b:GetBagID())
  if not total then return end
  vgIcon[b]:SetDesaturated(total == 0)
  vgIcon[b]:SetAlpha(total == 0 and MS.EMPTY_ALPHA or 1)
  vgFill[b]:SetShown(total > free)
  if total <= free then return end
  vgFill[b]:SetWidth((vgSlot[b]:GetWidth() - 2 * vgInset[b]) * (total - free) / total)
  T.Tint(vgFill[b], free == 0 and "bad" or "accent")
end

-- Every bag's fill and the backpack's free count, now (after the bags
-- changed); the count's backing only with a count to back.
function MS.PaintBags()
  for _, b in ipairs(MS.filled) do paintBag(b) end
  local n = MS.FreeSlots()
  if MS.free then MS.free:SetText(n and tostring(n) or "") end
  if MS.freeBack then MS.freeBack:SetShown(n ~= nil) end
end

-- The backpack's free count: small, in the icon's corner, over a dark backing
-- so it reads on any icon (both placed by placeFill).
local function addFree(b)
  vgFreeBack[b] = T.Snap(b:CreateTexture(nil, "OVERLAY", nil, 7))
  vgFreeBack[b]:SetTexture(T.WHITE)
  T.Tint(vgFreeBack[b], "edge", MS.COUNT_BACK)
  vgFree[b] = T.Text(b:CreateFontString(nil, "OVERLAY"), "badge")
  MS.free, MS.freeBack = vgFree[b], vgFreeBack[b]
end

-- A bag's fill along its icon's bottom (sized and painted later), and on the
-- backpack the free count.
local function addFill(b)
  vgFill[b] = T.Snap(b:CreateTexture(nil, "OVERLAY", nil, 7))
  vgFill[b]:SetTexture(T.WHITE)
  vgFill[b]:SetPoint("BOTTOMLEFT", vgIcon[b], "BOTTOMLEFT")
  vgFill[b]:Hide()
  MS.filled[#MS.filled + 1] = b
  if b == _G.MainMenuBarBackpackButton then addFree(b) end
end

-- A bag button's icon texture, by key or by the game's global name.
local function bagIcon(b)
  local icon = b.icon or b.Icon or _G[(b:GetName() or "") .. "IconTexture"]
  return type(icon) == "table" and icon.SetTexCoord and icon or nil
end

-- A bag button's icon, shown and cropped, the one art fitted in its slot; and
-- a button narrower than a bag (Forever's key ring, 33 units to a bag's 45)
-- widened to a bag's width, so it gets the same slot at the same pitch. The
-- game anchors each bag button's right edge, so it grows away from its neighbor.
local function fitBag(b, icon)
  vgIcon[b] = T.Crop(icon)
  vgArt[b] = { vgIcon[b] }
  icon:SetAlpha(1)
  if b:GetWidth() < MS.ROWS[1].button then b:SetWidth(MS.ROWS[1].button) end
end

-- One of the game's bag buttons on a slot: its art faded, the bag's icon
-- cropped inside the slot, a fill along the bottom (not on the key ring) and
-- the slot's edge following the mouse. Once per button.
function MS.SkinBag(b)
  local icon = bagIcon(b)
  if vgSlot[b] or not icon then return end
  T.FadeRegions(b, alerts(b))
  fadeStates(b)
  fitBag(b, icon)
  addSlot(b, MS.ROWS[1])
  if not MS.NO_FILL[b:GetName() or ""] and type(b.GetBagID) == "function" then addFill(b) end
  slotStates(b)
  sizeSlot(b)
end

-- Every bag and menu button this client has, on its slot; the bags' fill kept
-- up as they change, and the slots re-sized when the text size or UI scale does.
local function skinButtons()
  for _, name in ipairs(MS.BAGS) do if type(_G[name]) == "table" then MS.SkinBag(_G[name]) end end
  for name, icon in pairs(MS.GLYPHS) do
    local b = _G[name]
    if type(b) == "table" and b.CreateTexture then MS.SkinButton(b, T.Icon(icon, MS.GLYPH_PX)) end
  end
  MS.PaintBags()
  for _, e in ipairs(MS.BAG_EVENTS) do ns.On(e, MS.PaintBags) end
  T.OnChanged(function() ns.OutOfCombat(MS.SizeSlots, "menuslots") end)
end

-- The strip's own frame: a HUD panel in the bottom-right corner that the player can
-- move, with the accent line between its two rows.
local function makeStrip()
  local strip = T.HudPanel(CreateFrame("Frame", "Vanguard_MenuStrip", UIParent), { inset = true })
  strip:SetSize(2 * MS.MARGIN, MS.HEIGHT)
  ns.Mover(strip, "menustrip", "Bags and game menu", { "BOTTOMRIGHT", "BOTTOMRIGHT", -16, 20 })
  addDivider(strip)
  return strip
end

-- The bar in the bottom-right corner: the game's bag bar and micro menu in two
-- rows of slots, with the accent line between them.
local function buildStrip()
  MS.strip = makeStrip()
  for _, row in ipairs(MS.ROWS) do row.anchor = CreateFrame("Frame", nil, MS.strip) end
  for _, row in ipairs(MS.ROWS) do pinInto(row) end
  MS.FadeArt()
  keepShown()
  skinButtons()
  MS.FitStrip()
  watchVisibility(MS.strip)
end

-- The quest tracker -------------------------------------------------------------------------

-- Whether Vanguard's own quest tracker shows (it hides the game's tracker, which then has
-- no business being pinned or skinned here); not while Questie's tracker has the job.
function MS.OwnTracker()
  local qt = ns.GetModule("QuestTracker")
  return qt ~= nil and ns.ModuleEnabled("QuestTracker") and qt.Shows(ns.Settings("QuestTracker", qt.defaults))
end

-- The tracker's spot under the info strip, and the game's tracker pinned into it
-- unless Vanguard's own tracker is on.
local function buildTracker()
  MS.trackerSpot = CreateFrame("Frame", "Vanguard_QuestTracker", UIParent)
  MS.trackerSpot:SetSize(MS.TRACKER_W, MS.TRACKER_H)
  ns.Mover(MS.trackerSpot, "questtracker", "Quest tracker", { "TOPRIGHT", "TOPRIGHT", -12, -276 })
  local tracker = _G.ObjectiveTrackerFrame
  if MS.OwnTracker() or type(tracker) ~= "table" or not tracker.SetPoint then return end
  ns.Pin(tracker, function(f)
    f:ClearAllPoints()
    f:SetPoint("TOPRIGHT", MS.trackerSpot, "TOPRIGHT", 0, 0)
    f:SetHeight(MS.TRACKER_H)
  end)
end

-- The quest tracker's look ------------------------------------------------------------------

-- Tracker header art that's faded ("All Objectives", "Quests"... each have their own).
MS.HEADER_ART = { "Background", "Shine", "Glow" }
-- The tracker's font objects -> { size before Text size, bold }.
MS.TRACKER_FONTS = { ObjectiveTrackerLineFont = { 12 }, ObjectiveTrackerHeaderFont = { 13, true } }
-- The accent lines under the tracker's headers (repainted when the accent changes).
MS.rules = {}

-- Paints every header's accent line in the current accent.
local function paintRules()
  for _, rule in ipairs(MS.rules) do T.Tint(rule, "accent") end
end

-- A one-pixel accent line along a header's bottom edge.
local function addRule(header)
  local rule = T.Snap(header:CreateTexture(nil, "ARTWORK"))
  rule:SetTexture(T.WHITE)
  rule:SetPoint("BOTTOMLEFT", header, "BOTTOMLEFT")
  rule:SetPoint("BOTTOMRIGHT", header, "BOTTOMRIGHT")
  rule:SetHeight(T.Pixel(header))
  MS.rules[#MS.rules + 1] = rule
  T.Tint(rule, "accent")
end

-- Shows a header's collapse arrow: Down while open, Right while collapsed.
function MS.PaintArrow(header, collapsed)
  vgArrow[header]:SetTexture(T.Icon(collapsed and "Right" or "Down"))
end

-- A header's collapse button: the game's art faded, the theme's arrow drawn on
-- it, following the header as it collapses and opens.
local function skinToggle(header)
  local b = header.MinimizeButton
  fadeStates(b)
  vgArrow[header] = T.Tint(T.Snap(b:CreateTexture(nil, "OVERLAY")), "text2")
  vgArrow[header]:SetSize(12, 12)
  vgArrow[header]:SetPoint("CENTER", b, "CENTER")
  MS.PaintArrow(header, false)
  if type(header.SetCollapsed) == "function" then hooksecurefunc(header, "SetCollapsed", ns.Guard("hook SetCollapsed", MS.PaintArrow)) end
end

-- One tracker header in the theme: its art faded, a flat band with an accent
-- line along the bottom, its title in the heading font (its color kept). Once.
function MS.SkinHeader(header)
  if vgHeader[header] then return end
  vgHeader[header] = true
  for _, key in ipairs(MS.HEADER_ART) do if type(header[key]) == "table" then header[key]:SetAlpha(0) end end
  T.HudPanel(header, { inset = true, alpha = 0.6 })
  addRule(header)
  if type(header.Text) == "table" then T.Text(header.Text, "heading", false) end
  if type(header.MinimizeButton) == "table" then skinToggle(header) end
end

-- Every tracker header there is now: the tracker's own and each section's.
function MS.SkinTracker()
  local tracker = _G.ObjectiveTrackerFrame
  if type(tracker.Header) == "table" then MS.SkinHeader(tracker.Header) end
  for _, section in ipairs(type(tracker.modules) == "table" and tracker.modules or {}) do
    if type(section.Header) == "table" then MS.SkinHeader(section.Header) end
  end
end

-- The theme font, scaled by Text size, on the tracker's font objects (the
-- quest titles and objectives keep the game's colors), kept after every theme change.
function MS.TrackerFonts()
  T.FontObjects(MS.TRACKER_FONTS)
end

-- The quest tracker in the Vanguard look, kept up as the game adds sections
-- and as Text size or the accent changes.
local function lookTracker()
  local tracker = _G.ObjectiveTrackerFrame
  if MS.OwnTracker() or type(tracker) ~= "table" or type(hooksecurefunc) ~= "function" then return end
  MS.SkinTracker()
  MS.TrackerFonts()
  T.OnChanged(paintRules)
  if type(tracker.Update) == "function" then hooksecurefunc(tracker, "Update", ns.Guard("hook Update", MS.SkinTracker)) end
end

-- Module entry point (Core/Modules.lua): out of combat, since some of these hold secure buttons.
function MS.Enable(settings)
  MS.settings = settings
  ns.OutOfCombat(function()
    buildStrip()
    if settings.tracker then buildTracker() end
    if settings.trackerLook then lookTracker() end
  end)
end
