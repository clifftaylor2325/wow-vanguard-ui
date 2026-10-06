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
