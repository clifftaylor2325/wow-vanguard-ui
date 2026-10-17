-- Game windows, town group: Stable, trainer, side dress-up, stack split, coin pickup, separate bags, loot dialogs, icon pickers, stopwatch,
-- and the inside of the merchant window (its rows, buttons and money lines), in the Vanguard look. Filled by stream S2 of
-- docs/handoff/RESKIN-PLAN.md; registers with GW.Add (Modules/Windows.lua) at file scope, so the windows are watched at login.

local ADDON, ns = ...

-- Per-frame state kept off the game's frames (Core/Events.lua, ns.FrameState).
local vgBagItems = ns.FrameState("vgBagItems")
local vgMerchant = ns.FrameState("vgMerchant")
local vgPlayers = ns.FrameState("vgPlayers")

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
      GW.ShowTexture(button.Icon)
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
  GW.SkinGlyph(frame.LeftButton)
  GW.SkinGlyph(frame.RightButton)
  keyFonts(frame, { "StackSplitText", "StackItemCountText" }, "number")
end

-- The coins window the money frame opens: a panel, its plate faded (the coin icons stay), the buttons themed.
function GW.SkinCoinPickup(frame)
  T.Panel(frame, { shadow = true })
  local keep = {}
  for _, name in ipairs(COIN_ICONS) do keep[_G[name] or false] = true end
  T.FadeRegions(frame, keep)
  namedButtons(COIN_BUTTONS)
  GW.SkinGlyph(_G.CoinPickupLeftButton)
  GW.SkinGlyph(_G.CoinPickupRightButton)
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
  if vgBagItems[frame] or type(frame.UpdateItems) ~= "function" or type(hooksecurefunc) ~= "function" then return end
  vgBagItems[frame] = true
  hooksecurefunc(frame, "UpdateItems", ns.Guard("hook UpdateItems", skinBagItems))
end

GW.Add("town", "framed", { "ContainerFrame1", "ContainerFrame2", "ContainerFrame3", "ContainerFrame4", "ContainerFrame5", "ContainerFrame6", "ContainerFrame7" }, GW.SkinBagWindow)

-- Merchant ------------------------------------------------------------------------------------------

-- The merchant window's frame and tabs are the windows and tabs groups' (Modules/Windows.lua, Modules/WindowsTabs.lua);
-- this group dresses what it holds, and leaves every button's own script alone (buying, selling and repairing are the
-- game's clicks; constraint S).

-- How many rows a page of the merchant window has (MerchantItem1-12, MerchantItemTemplate: a slot plate, a name plate,
-- the name, an item button, a price and a token price); the buyback slot under them has the same parts.
GW.MERCHANT_ITEMS = 12
-- The repair, repair-all, guild repair and sell-junk buttons: square tiles with an icon (their slot plate faded).
local MERCHANT_TILES = { "MerchantRepairItemButton", "MerchantRepairAllButton", "MerchantGuildBankRepairButton", "MerchantSellAllJunkButton" }
-- The page arrows (their arrow is their normal and disabled texture; a PREV or NEXT caption beside it).
local MERCHANT_ARROWS = { "MerchantPrevPageButton", "MerchantNextPageButton" }
-- The gold-edged plates behind the money line and the token line, and the insets under them.
local MERCHANT_PLATES = { "MerchantMoneyBg", "MerchantExtraCurrencyBg" }
local MERCHANT_INSETS = { "MerchantMoneyInset", "MerchantExtraCurrencyInset" }
-- How many denominations a token price can show (SmallAlternateCurrencyFrameTemplate's Item1-3).
local ALT_CURRENCIES = 3

-- The font strings a frame draws itself (a page arrow's caption) in the theme font, their colour kept.
local function regionFonts(frame, role)
  for _, region in ipairs({ frame:GetRegions() }) do
    if region.GetObjectType and region:GetObjectType() == "FontString" then T.Text(region, role, false) end
  end
end

-- A row's token price (named frame .. Item1-3): each denomination's figure in the theme font, its icon kept.
local function skinAltCurrency(name)
  for i = 1, ALT_CURRENCIES do
    local button = _G[name .. "Item" .. i]
    if type(button) == "table" then keyFonts(button, { "Text" }, "number") end
  end
end

-- One merchant row, or the buyback slot, by name: its slot and name plates faded, its item button in the bags' item
-- look (a thin border in the item's quality colour), its name in the theme font, its price and token price too.
local function skinMerchantRow(name)
  local row, bags = _G[name], ns.GetModule("Bags")
  if type(row) ~= "table" then return end
  fadeWhole(row, { "SlotTexture" })
  GW.FadeNamed({ name .. "NameFrame" })
  keyFonts(row, { "Name" }, "small")
  if bags and bags.SkinItem then bags.SkinItem(row.ItemButton) end
  GW.SkinMoney(_G[name .. "MoneyFrame"])
  skinAltCurrency(name .. "AltCurrencyFrame")
end

-- The repair, guild repair and sell-junk tiles as theme buttons that keep their icon (one this client lacks is skipped).
local function skinMerchantTiles()
  for _, name in ipairs(MERCHANT_TILES) do
    local button = _G[name]
    if type(button) == "table" and button.GetRegions then
      T.Button(button)
      GW.ShowTexture(button.Icon)
    end
  end
end

-- A page arrow as a theme button that keeps its arrow, its caption in the theme font.
local function skinPageArrow(button)
  if type(button) ~= "table" or not button.GetRegions then return end
  GW.SkinGlyph(button)
  regionFonts(button, "label")
end

-- The window's foot: the page arrows and page count, the money line in the theme font, the gold-edged plates
-- faded and the insets under them dark panels.
local function skinMerchantFooter()
  for _, name in ipairs(MERCHANT_ARROWS) do skinPageArrow(_G[name]) end
  namedFonts({ "MerchantPageText" }, "label")
  GW.SkinMoney(_G.MerchantMoneyFrame)
  GW.FadeNamed(MERCHANT_PLATES)
  for _, name in ipairs(MERCHANT_INSETS) do insetPanel(_G[name]) end
end

-- The inside of the merchant window: every row of the page, the buyback slot, the tiles, the filter button and the
-- foot. Safe to run again (it runs on every show and each time the game fills a page).
function GW.SkinMerchant()
  local frame = _G.MerchantFrame
  if type(frame) ~= "table" then return end
  for i = 1, GW.MERCHANT_ITEMS do skinMerchantRow("MerchantItem" .. i) end
  skinMerchantRow("MerchantBuyBackItem")
  skinMerchantTiles()
  keyButtons(frame, { "FilterDropdown" })
  skinMerchantFooter()
end

-- At login, after the Windows module enabled, with the town group on: the merchant window's inside now, on every
-- show, and after the game fills a page of rows (MerchantFrame_UpdateMerchantInfo, Blizzard_UIPanels_Game
-- MerchantFrame.lua, which MerchantFrame_Update calls for the merchant tab), so paging keeps the look. Once.
local function watchMerchant()
  local frame = _G.MerchantFrame
  if not (GW.settings and GW.settings.town) or type(frame) ~= "table" or not frame.HookScript or vgMerchant[frame] then return end
  vgMerchant[frame] = true
  GW.SkinMerchant()
  frame:HookScript("OnShow", ns.Guard("show merchant", GW.SkinMerchant))
  if type(hooksecurefunc) ~= "function" or type(_G.MerchantFrame_UpdateMerchantInfo) ~= "function" then return end
  hooksecurefunc("MerchantFrame_UpdateMerchantInfo", ns.Guard("hook MerchantFrame_UpdateMerchantInfo", GW.SkinMerchant))
end

ns.On("PLAYER_LOGIN", watchMerchant)

-- Loot dialogs --------------------------------------------------------------------------------------

-- How many player buttons the master looter window can hold (the game's MAX_RAID_MEMBERS); they are
-- player1 ... player40 and, with several columns of fewer than ten rows, not numbered without gaps.
local MASTER_PLAYERS = 40
-- The loot plate behind the item's name in the master looter window (the icon and its quality ring stay).
local MASTER_ART = { "NameBorderLeft", "NameBorderRight", "NameBorderMid" }

-- The master looter window's player buttons (the game makes them as it lists the candidates) as theme buttons.
local function dressMasterPlayers()
  local frame = _G.MasterLooterFrame
  if type(frame) ~= "table" then return end
  for i = 1, MASTER_PLAYERS do
    local button = frame["player" .. i]
    if type(button) == "table" and button.GetRegions then T.Button(button) end
  end
end

-- The master looter window (a child of the loot window): the window skin, the item's name plate and the
-- highlight glow faded, and each player button themed now and whenever the game lists the candidates.
function GW.SkinMasterLooter(frame)
  GW.Skin(frame)
  if type(frame.Item) == "table" then fadeWhole(frame.Item, MASTER_ART) end
  fadeWhole(frame, { "HighlightFrame" })
  dressMasterPlayers()
  if vgPlayers[frame] or type(_G.MasterLooterFrame_UpdatePlayers) ~= "function" or type(hooksecurefunc) ~= "function" then return end
  vgPlayers[frame] = true
  hooksecurefunc("MasterLooterFrame_UpdatePlayers", ns.Guard("hook MasterLooterFrame_UpdatePlayers", dressMasterPlayers))
end

-- The group loot history window: the window skin, and its close button (named ClosePanelButton there).
function GW.SkinLootHistory(frame)
  GW.Skin(frame)
  GW.DressClose(frame, frame.ClosePanelButton)
end

GW.Add("town", "framed", { "MasterLooterFrame" }, GW.SkinMasterLooter)
GW.Add("town", "framed", { "GroupLootHistoryFrame" }, GW.SkinLootHistory)

-- Macro, icon pickers, stopwatch, recipe inspection ------------------------------------------------------

-- The macro window's own buttons (none is in a button row).
local MACRO_BUTTONS = { "MacroEditButton", "MacroCancelButton", "MacroSaveButton", "MacroDeleteButton", "MacroNewButton", "MacroExitButton" }
GW.AddButtons("MacroFrame", MACRO_BUTTONS)

-- The icon picker's header: the selected icon's area gets an inset panel, the name box and the Okay and
-- Cancel buttons are themed; the box's own border art (a nine-slice) is faded.
local function styleIconPickerBox(box)
  if type(box) ~= "table" then return end
  fadeWhole(box, { "NineSlice" })
  insetPanel(box.SelectedIconArea)
  if type(box.IconSelectorEditBox) == "table" and box.IconSelectorEditBox.SetText then T.EditBox(box.IconSelectorEditBox) end
  keyButtons(box, { "OkayButton", "CancelButton" })
end

-- A popup made from IconSelectorPopupFrameTemplate (the macro, guild bank and equipment set popups): the
-- window skin (its BG faded, a flat panel with a shadow) and the header parts in the theme.
function GW.SkinIconPicker(frame)
  GW.Skin(frame)
  styleIconPickerBox(frame.BorderBox)
end

-- The stopwatch: its two background plates and the title tab's art faded under a flat panel, the close,
-- play and reset buttons in the theme (play and reset keep their pictures), the title in the theme font.
function GW.SkinStopwatch(frame)
  GW.Skin(frame)
  if type(_G.StopwatchTabFrame) == "table" then T.FadeRegions(_G.StopwatchTabFrame) end
  GW.DressClose(frame, _G.StopwatchCloseButton)
  GW.SkinGlyph(_G.StopwatchPlayPauseButton)
  GW.SkinGlyph(_G.StopwatchResetButton)
  namedFonts({ "StopwatchTitle" }, "small")
end

GW.Add("town", "onDemand", "Blizzard_MacroUI", { "MacroFrame" })
GW.Add("town", "onDemand", "Blizzard_MacroUI", { "MacroPopupFrame" }, GW.SkinIconPicker)
GW.Add("town", "onDemand", "Blizzard_GuildBankUI", { "GuildBankPopupFrame" }, GW.SkinIconPicker)
GW.Add("town", "framed", { "GearManagerPopupFrame" }, GW.SkinIconPicker)
GW.Add("town", "onDemand", "Blizzard_TimeManager", { "StopwatchFrame" }, GW.SkinStopwatch)
GW.Add("town", "onDemand", "Blizzard_Professions", { "InspectRecipeFrame" })

-- Small dialogs -------------------------------------------------------------------------------------

-- The Release Spirit / return to graveyard button's text, and the buttons the message and addon dialogs keep outside Button1-4.
local GHOST_TEXT = { "GhostFrameContentsFrameText" }
local ADDON_DIALOG_BUTTONS = { "AddonDialogButton1", "AddonDialogButton2" }
GW.AddButtons("BasicMessageDialog", { "BasicMessageDialogButton" })

-- The ghost button as a theme button with its text in the theme font (textures and font strings only).
local function dressGhost(frame)
  T.Button(frame)
  namedFonts(GHOST_TEXT, "label")
end

-- The button a dead player gets to return to the graveyard: dressed out of combat (it is shown from the game's
-- secure code; in combat the dressing waits, and a button already dressed keeps its look).
function GW.SkinGhost(frame)
  ns.OutOfCombat(function() dressGhost(frame) end, "WindowsTown.ghost")
end

-- The addon list's confirmation dialog: the window is a full-screen catcher with a dialog in it, so the
-- dialog (AddonDialogBackground) gets the window skin and its two buttons are themed (the catcher itself is left alone).
function GW.SkinAddonDialog()
  local box = _G.AddonDialogBackground
  if type(box) ~= "table" then return end
  GW.Skin(box)
  namedButtons(ADDON_DIALOG_BUTTONS)
end

-- The currency transfer window: the window skin and its Confirm and Cancel buttons.
function GW.SkinCurrencyTransfer(frame)
  GW.Skin(frame)
  if type(frame.Content) == "table" then keyButtons(frame.Content, { "ConfirmButton", "CancelButton" }) end
end

GW.Add("town", "framed", { "GhostFrame" }, GW.SkinGhost)
GW.Add("town", "popups", { "BasicMessageDialog" })
GW.Add("town", "popups", { "AddonDialog" }, GW.SkinAddonDialog)
GW.Add("town", "framed", { "CurrencyTransferMenu" }, GW.SkinCurrencyTransfer)
