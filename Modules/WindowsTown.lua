-- Game windows, town group: Stable, trainer, side dress-up, stack split, coin pickup, separate bags, loot dialogs, icon pickers, stopwatch, in the
-- Vanguard look. Filled by stream S2 of docs/handoff/RESKIN-PLAN.md; registers with
-- GW.Add (Modules/Windows.lua) at file scope, so the windows are watched at login.

local ADDON, ns = ...

local T = ns.Theme

local GW = ns.GetModule("Windows")

-- Helpers shared by the windows below -------------------------------------------------------------

-- Themes each button of a frame, named by parentKey in keys, that this client has.
local function keyButtons(frame, keys)
  for _, key in ipairs(keys) do
    local button = frame[key]
    if type(button) == "table" and button.GetRegions then T.Button(button) end
  end
end

-- Themes each button named in names that this client has.
local function namedButtons(names)
  for _, name in ipairs(names) do
    local button = _G[name]
    if type(button) == "table" and button.GetRegions then T.Button(button) end
  end
end

-- Gives a texture back its alpha (a button's glyph, which T.Button faded with the rest of its art).
local function showTexture(texture)
  if type(texture) == "table" and texture.SetAlpha then texture:SetAlpha(1) end
end

-- A button whose arrow is its normal and disabled texture (the money arrows): a theme button that keeps its arrow.
local function arrowButton(button)
  if type(button) ~= "table" or not button.GetRegions then return end
  T.Button(button)
  showTexture(button.GetNormalTexture and button:GetNormalTexture())
  showTexture(button.GetDisabledTexture and button:GetDisabledTexture())
end

-- Puts the theme font (colour left as the game set it) on each font string of a frame named in keys.
local function keyFonts(frame, keys, role)
  for _, key in ipairs(keys) do
    local fs = frame[key]
    if type(fs) == "table" and fs.SetFont then T.Text(fs, role, false) end
  end
end

-- The same for font strings named in names.
local function namedFonts(names, role)
  for _, name in ipairs(names) do
    local fs = _G[name]
    if type(fs) == "table" and fs.SetFont then T.Text(fs, role, false) end
  end
end

-- Fades each part of a frame named in keys, whole (a frame with all it holds, or a texture), by alpha.
local function fadeWhole(frame, keys)
  for _, key in ipairs(keys) do
    local part = frame[key]
    if type(part) == "table" and part.SetAlpha then part:SetAlpha(0) end
  end
end

-- Stable --------------------------------------------------------------------------------------------

-- The art of the pet stable window and of its pet scene (which also has an inset frame of art): faded whole.
local STABLE_ART = { "Background", "Border", "PetShadow", "PetModelSceneShadow" }
-- The stable's texts the game draws in gold or white: their font goes to the theme's.
local STABLE_TEXTS = { "PetStableLevelText", "PetStableLoyaltyText", "PetStableSlotText", "PetStableCostLabel" }
-- The pet slots (the current pet and two stabled ones), whose captions take the theme font.
local STABLE_SLOTS = { "PetStableCurrentPet", "PetStableStabledPet1", "PetStableStabledPet2" }

-- The pet's experience bar: the theme's bar texture on its fill, the game's frame art faded
-- (its text kept), a dark panel behind it.
local function styleExpBar(bar)
  if type(bar) ~= "table" then return end
  local fill = type(bar.StatusBar) == "table" and bar.StatusBar or bar
  if type(fill.SetStatusBarTexture) == "function" then T.StyleBar(fill) end
  if type(bar.overlay) == "table" then T.FadeRegions(bar.overlay) end
  fadeWhole(fill, { "Background" })
  T.Panel(bar, { inset = true, noSheen = true })
end

-- The pet scene: its art faded and an inset panel behind the model.
local function styleStableScene(scene)
  if type(scene) ~= "table" then return end
  fadeWhole(scene, STABLE_ART)
  fadeWhole(scene, { "Inset" })
  T.Panel(scene, { inset = true, noSheen = true })
end

-- The captions over the pet slots, and the loyalty level number, in the theme font.
local function styleStableCaptions(frame)
  namedFonts(STABLE_TEXTS, "label")
  for _, name in ipairs(STABLE_SLOTS) do
    if type(_G[name]) == "table" then keyFonts(_G[name], { "Text" }, "small") end
  end
  if type(frame.loyaltyLevel) == "table" then keyFonts(frame.loyaltyLevel, { "levelText" }, "small") end
end

-- The pet stable (hunters): the window skin, its pet scene, experience bar, purchase button and texts.
function GW.SkinStable(frame)
  GW.Skin(frame)
  fadeWhole(frame, STABLE_ART)
  styleStableScene(frame.modelScene)
  styleExpBar(frame.expBar)
  keyButtons(frame, { "purchaseButton" })
  styleStableCaptions(frame)
end

GW.Add("town", "framed", { "PetStableFrame" }, GW.SkinStable)

-- Trainer -------------------------------------------------------------------------------------------

-- A skill row's text parts, in the theme font: the name, the requirements and the name's side note.
local TRAINER_ROW_TEXTS = { "name", "subText", "nameSubText" }
-- The three pieces of a category header row's plate (faded; its label and fold icon stay).
local TRAINER_PLATE = { "LeftPiece", "RightPiece", "CenterPiece" }

-- One row of the trainer list as the game acquires it (callback of the list: owner, row, data): the row's
-- plate faded, the skill's selected mark, disabled shade, lock and icon kept, its texts in the theme font.
local function skinTrainerRow(_, row)
  if type(row) ~= "table" then return end
  fadeWhole(row, TRAINER_PLATE)
  local plate = type(row.GetNormalTexture) == "function" and row:GetNormalTexture()
  if type(plate) == "table" then plate:SetAlpha(0) end
  keyFonts(row, TRAINER_ROW_TEXTS, "small")
end

-- The list's rows now and each row it acquires later (the game reuses its rows, one callback is enough).
local function watchTrainerRows(box)
  local mixin = _G.ScrollBoxListMixin
  if type(box) ~= "table" or box.vgTrainerRows or type(box.RegisterCallback) ~= "function" then return end
  if type(mixin) ~= "table" or type(mixin.Event) ~= "table" then return end
  box.vgTrainerRows = true
  box:RegisterCallback(mixin.Event.OnAcquiredFrame, skinTrainerRow, GW)
  if type(box.ForEachFrame) == "function" then box:ForEachFrame(function(row) skinTrainerRow(nil, row) end) end
end

-- A frame that is only art in the game (an inset): its art faded and a dark panel in its place.
local function insetPanel(part)
  if type(part) ~= "table" or not part.GetRegions then return end
  T.FadeRegions(part)
  fadeWhole(part, { "NineSlice" })
  T.Panel(part, { inset = true, noSheen = true })
end

-- The class trainer: the window skin, its backdrop and money plate faded, the lower inset a dark panel,
-- the filter button and its rows in the theme (Vanguard's Train all, beside Train, is already themed).
function GW.SkinTrainer(frame)
  GW.Skin(frame)
  GW.FadeParts(frame, { "BG" })
  GW.FadeNamed({ "ClassTrainerFrameMoneyBg" })
  insetPanel(frame.bottomInset)
  keyButtons(frame, { "FilterDropdown" })
  watchTrainerRows(frame.ScrollBox)
end

GW.AddButtons("ClassTrainerFrame", { "ClassTrainerTrainButton" })
GW.Add("town", "onDemand", "Blizzard_TrainerUI", { "ClassTrainerFrame" }, GW.SkinTrainer)

-- Dress-up, stack split, coin pickup ----------------------------------------------------------------

-- The side dress-up window's art: parts by key, and the textures the game names.
local DRESSUP_ART = { "BGTopLeft", "BGBottomLeft" }
local DRESSUP_NAMED = { "SideDressUpFrameTop", "SideDressUpFrameBackgroundTop", "SideDressUpFrameBackgroundBot" }
-- The model's control buttons (zoom, rotate, reset): their icon is the part that stays.
local MODEL_CONTROLS = { "zoomInButton", "zoomOutButton", "rotateLeftButton", "rotateRightButton", "resetButton" }
-- The stack split window's art (the money plates, and its glow).
local SPLIT_ART = { "SingleItemSplitBackground", "MultiItemSplitBackground", "FrameGlow" }
-- The coin pickup window's coin icons (kept) and its buttons.
local COIN_ICONS = { "CoinPickupGoldIcon", "CoinPickupSilverIcon", "CoinPickupCopperIcon" }
local COIN_BUTTONS = { "CoinPickupOkayButton", "CoinPickupCancelButton" }

-- The model scene's zoom, rotate and reset buttons as theme buttons that keep their icons.
local function styleModelControls(scene)
  local box = type(scene) == "table" and scene.ControlFrame
  if type(box) ~= "table" then return end
  for _, key in ipairs(MODEL_CONTROLS) do
    local button = box[key]
    if type(button) == "table" and button.GetRegions then
      T.Button(button)
      showTexture(button.Icon)
    end
  end
end

-- The side dress-up window (beside the auction house and merchant): the window skin, the game's
-- plates faded, the Reset and model buttons in the theme.
function GW.SkinSideDressUp(frame)
  GW.Skin(frame)
  GW.FadeParts(frame, DRESSUP_ART)
  GW.FadeNamed(DRESSUP_NAMED)
  keyButtons(frame, { "ResetButton" })
  styleModelControls(frame.ModelScene)
end

-- The stack split window: the window skin, its money plates and glow faded, the arrows keep their
-- arrow, Okay and Cancel in the theme, the amount in the theme font.
function GW.SkinStackSplit(frame)
  GW.Skin(frame)
  fadeWhole(frame, SPLIT_ART)
  keyButtons(frame, { "OkayButton", "CancelButton" })
  arrowButton(frame.LeftButton)
  arrowButton(frame.RightButton)
  keyFonts(frame, { "StackSplitText", "StackItemCountText" }, "number")
end

-- The coins window the money frame opens: a panel, its plate faded (the coin icons stay), the buttons themed.
function GW.SkinCoinPickup(frame)
  T.Panel(frame, { shadow = true })
  local keep = {}
  for _, name in ipairs(COIN_ICONS) do keep[_G[name] or false] = true end
  T.FadeRegions(frame, keep)
  namedButtons(COIN_BUTTONS)
  arrowButton(_G.CoinPickupLeftButton)
  arrowButton(_G.CoinPickupRightButton)
  namedFonts({ "CoinPickupText" }, "number")
end

GW.Add("town", "popups", { "SideDressUpFrame" }, GW.SkinSideDressUp)
GW.Add("town", "popups", { "StackSplitFrame" }, GW.SkinStackSplit)
GW.Add("town", "popups", { "CoinPickupFrame" }, GW.SkinCoinPickup)

-- Separate bag windows ------------------------------------------------------------------------------

-- The item buttons a separate bag window shows now, in the Bags module's item look (it skips buttons already done).
local function skinBagItems(frame)
  if type(frame.EnumerateValidItems) ~= "function" then return end
  for _, button in frame:EnumerateValidItems() do ns.GetModule("Bags").SkinItem(button) end
end

-- One of the separate bag windows (shown when Combined bags is off): the Bags module's window skin, and
-- its items again each time the game fills the bag. Nothing when the Bags module is switched off.
function GW.SkinBagWindow(frame)
  local bags = ns.GetModule("Bags")
  if not (bags and ns.ModuleEnabled("Bags")) then return end
  bags.SkinWindow(frame)
  if frame.vgBagItems or type(frame.UpdateItems) ~= "function" or type(hooksecurefunc) ~= "function" then return end
  frame.vgBagItems = true
  hooksecurefunc(frame, "UpdateItems", skinBagItems)
end

GW.Add("town", "framed", { "ContainerFrame1", "ContainerFrame2", "ContainerFrame3", "ContainerFrame4", "ContainerFrame5", "ContainerFrame6", "ContainerFrame7" }, GW.SkinBagWindow)
