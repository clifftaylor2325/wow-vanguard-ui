// windows-town: the town group of game windows (Modules/WindowsTown.lua), in the
// TEST-ONLY headless client. Cases follow docs/handoff/RESKIN-PLAN.md section 0 ("Writing a task's test").

import { expect, it } from "vitest";
import { WINDOWS_ENV, loggedIn, setCombat, windowState } from "./helpers.mjs";

const OFF = "VanguardDB.profiles = { Default = { Windows = { town = false } } }";

// Any error Vanguard reported from the windows modules, or "none".
const windowErrors = (addon) => addon.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') then return e.text end end return 'none'");

// The alphas of the Lua expressions given (each a frame or texture), in order.
const alphas = (addon, ...parts) => addon.eval(`return { ${parts.map((p) => `(${p}):GetAlpha()`).join(", ")} }`);

// Whether each Lua expression (a frame) has been given a Vanguard look: it has regions of its own now.
const dressed = (addon, ...frames) => addon.eval(`return { ${frames.map((f) => `select('#', (${f}):GetRegions()) > 0`).join(", ")} }`);

it("the town group loads cleanly on a client without its windows", () => {
  const addon = loggedIn("");
  expect(addon.eval("return ns.GetModule('Windows').settings.town"), "its switch is on by default").toBe(true);
  expect(windowErrors(addon)).toBe("none");
});

// TEST-ONLY pet stable (Blizzard_StableUI, Camelot): the window with the parts the skin dresses.
const STABLE_ENV = `${WINDOWS_ENV}
  local f = __window("PetStableFrame")
  for _, key in ipairs({ "Background", "Border", "PetShadow" }) do f[key] = f:CreateTexture() end
  local scene = CreateFrame("Frame", nil, f) f.modelScene = scene
  scene.Background, scene.PetShadow = scene:CreateTexture(), scene:CreateTexture()
  scene.PetModelSceneShadow, scene.Inset = CreateFrame("Frame", nil, scene), CreateFrame("Frame", nil, scene)
  local bar = CreateFrame("Frame", nil, f) f.expBar = bar
  bar.StatusBar = CreateFrame("StatusBar", nil, bar) bar.StatusBar.Background = bar.StatusBar:CreateTexture()
  bar.overlay = CreateFrame("Frame", nil, bar) bar.overlay.art = bar.overlay:CreateTexture() bar.overlay.xpText = bar.overlay:CreateFontString(nil, "OVERLAY")
  f.purchaseButton = CreateFrame("Button", nil, f)
  f.loyaltyLevel = CreateFrame("Frame", nil, f) f.loyaltyLevel.levelText = f.loyaltyLevel:CreateFontString(nil, "ARTWORK")
  for _, name in ipairs({ "PetStableLevelText", "PetStableLoyaltyText", "PetStableSlotText", "PetStableCostLabel" }) do f:CreateFontString(name, "ARTWORK") end
  local slot = CreateFrame("CheckButton", "PetStableCurrentPet", f) slot.Text = slot:CreateFontString(nil, "BACKGROUND")
`;

it("S2.1 the pet stable: art faded, pet scene and experience bar dressed, purchase button and texts in the theme", () => {
  const addon = loggedIn(STABLE_ENV);
  addon.eval("PetStableFrame:Show()");
  const first = windowState(addon, "PetStableFrame");
  expect(first, "the window skin").toMatchObject({ art: 0, nine: 0, panel: true, title: true });
  const f = "PetStableFrame";
  expect(alphas(addon, `${f}.Background`, `${f}.Border`, `${f}.modelScene.Background`, `${f}.modelScene.PetShadow`, `${f}.modelScene.PetModelSceneShadow`, `${f}.modelScene.Inset`, `${f}.expBar.StatusBar.Background`), "its own art and the scene's faded").toEqual([0, 0, 0, 0, 0, 0, 0]);
  expect(addon.eval(`return { ${f}.expBar.overlay.art:GetAlpha(), ${f}.expBar.overlay.xpText:GetAlpha(), ${f}.expBar.StatusBar:GetStatusBarTexture() ~= nil }`), "the bar's frame art faded, its text kept, the theme's bar texture").toEqual([0, 1, true]);
  expect(dressed(addon, `${f}.modelScene`, `${f}.expBar`, `${f}.purchaseButton`), "the scene and bar get panels, the purchase button is a theme button").toEqual([true, true, true]);
  expect(addon.eval(`return { ${f}.loyaltyLevel.levelText:GetFont() ~= nil, PetStableLevelText:GetFont() ~= nil, PetStableCurrentPet.Text:GetFont() ~= nil }`), "texts in the theme font").toEqual([true, true, true]);
  addon.eval("PetStableFrame:Hide() PetStableFrame:Show()");
  expect(windowState(addon, "PetStableFrame").painted, "a second show paints nothing more").toBe(first.painted);
});

it("S2.1 the pet stable: its group switched off leaves it the game's; a client with a bare window loads cleanly", () => {
  const off = loggedIn(STABLE_ENV, { savedVariables: OFF });
  off.eval("PetStableFrame:Show()");
  expect([windowState(off, "PetStableFrame").art !== 0, off.eval("return ns.FrameState('vgWindow')[PetStableFrame] == nil")], "not hooked, art left").toEqual([true, true]);
  const bare = loggedIn('CreateFrame("Frame", "PetStableFrame", UIParent):Hide()');
  bare.eval("PetStableFrame:Show()");
  expect([bare.eval("return ns.FrameState('vgWindow')[PetStableFrame]"), windowErrors(bare)], "a window without the parts is skinned, no error").toEqual([true, "none"]);
});

// TEST-ONLY trainer (Blizzard_TrainerUI, loads on demand): the window, its list as the game's ScrollBox hands out rows.
const TRAINER_ENV = `${WINDOWS_ENV}
  ScrollBoxListMixin = { Event = { OnAcquiredFrame = "OnAcquiredFrame" } }
  function __trainer()
    local f = __window("ClassTrainerFrame")
    f.BG = f:CreateTexture() f.BG:SetTexture("TEST-ONLY-ART2") f:CreateTexture("ClassTrainerFrameMoneyBg")
    f.bottomInset = CreateFrame("Frame", nil, f) f.bottomInset.NineSlice = CreateFrame("Frame", nil, f.bottomInset)
    f.FilterDropdown = CreateFrame("Button", nil, f)
    CreateFrame("Button", "ClassTrainerTrainButton", f)
    local box = { rows = {}, callbacks = {} }
    function box:RegisterCallback(event, fn, owner) self.callbacks[event] = { fn, owner } end
    function box:ForEachFrame(fn) for _, row in ipairs(self.rows) do fn(row) end end
    f.ScrollBox = box
    return f
  end
  -- A row as the game acquires it: a skill row (plate, name, requirements) or a category row (plate pieces).
  function __row(box, category)
    local row = CreateFrame("Button", nil, UIParent)
    row.plate = row:CreateTexture() row.GetNormalTexture = function() return row.plate end
    if category then
      row.LeftPiece, row.RightPiece, row.CenterPiece = row:CreateTexture(), row:CreateTexture(), row:CreateTexture()
    else
      row.name, row.subText, row.nameSubText = row:CreateFontString(), row:CreateFontString(), row:CreateFontString()
      row.selectedTex, row.icon = row:CreateTexture(), row:CreateTexture()
    end
    return row
  end
`;

it("S2.2 the trainer: window, filter and train buttons themed, rows dressed as the list acquires them", () => {
  const addon = loggedIn(TRAINER_ENV + "local box = __trainer().ScrollBox table.insert(box.rows, __row(box))");
  addon.fire("ADDON_LOADED", "Blizzard_TrainerUI");
  addon.eval("ClassTrainerFrame:Show()");
  const first = windowState(addon, "ClassTrainerFrame");
  expect(first, "the window skin").toMatchObject({ art: 0, nine: 0, panel: true, title: true });
  const f = "ClassTrainerFrame";
  expect(alphas(addon, `${f}.BG`, "ClassTrainerFrameMoneyBg", `${f}.bottomInset.NineSlice`), "backdrop, money plate and inset art faded").toEqual([0, 0, 0]);
  expect(dressed(addon, `${f}.bottomInset`, `${f}.FilterDropdown`, "ClassTrainerTrainButton"), "inset panel, filter and Train buttons themed").toEqual([true, true, true]);
  expect(addon.eval(`local row = ${f}.ScrollBox.rows[1] return { row.plate:GetAlpha(), row.name:GetFont() ~= nil, row.subText:GetFont() ~= nil, row.selectedTex:GetAlpha(), row.icon:GetAlpha() }`), "the row that was there: plate faded, texts in the theme font, the selected mark and icon kept").toEqual([0, true, true, 1, 1]);
  addon.eval(`local box = ${f}.ScrollBox local skill, head = __row(box), __row(box, true)
    local cb = box.callbacks.OnAcquiredFrame cb[1](cb[2], skill) cb[1](cb[2], head) cb[1](cb[2], nil) box.skill, box.head = skill, head`);
  expect(addon.eval(`local b = ${f}.ScrollBox return { b.skill.plate:GetAlpha(), b.skill.name:GetFont() ~= nil, b.head.plate:GetAlpha(), b.head.LeftPiece:GetAlpha(), b.head.CenterPiece:GetAlpha() }`), "rows acquired later: a skill row and a category row").toEqual([0, true, 0, 0, 0]);
  addon.eval(`${f}:Hide() ${f}:Show()`);
  expect([windowState(addon, f).painted, addon.eval(`local n = 0 for _ in pairs(${f}.ScrollBox.callbacks) do n = n + 1 end return n`)], "a second show paints nothing more and watches the list once").toEqual([first.painted, 1]);
});

it("S2.2 the trainer: group off leaves it the game's; a trainer without a list or mixin loads cleanly", () => {
  const off = loggedIn(TRAINER_ENV + "__trainer()", { savedVariables: OFF });
  off.fire("ADDON_LOADED", "Blizzard_TrainerUI");
  off.eval("ClassTrainerFrame:Show()");
  expect([windowState(off, "ClassTrainerFrame").art !== 0, off.eval("return ClassTrainerFrame.ScrollBox.callbacks.OnAcquiredFrame == nil")], "not hooked").toEqual([true, true]);
  const bare = loggedIn('CreateFrame("Frame", "ClassTrainerFrame", UIParent):Hide()');
  bare.fire("ADDON_LOADED", "Blizzard_TrainerUI");
  bare.eval("ClassTrainerFrame:Show()");
  const plain = loggedIn(TRAINER_ENV + "__trainer() ScrollBoxListMixin = nil");
  plain.fire("ADDON_LOADED", "Blizzard_TrainerUI");
  const noEvent = loggedIn(TRAINER_ENV + "__trainer() ScrollBoxListMixin.Event = nil");
  noEvent.fire("ADDON_LOADED", "Blizzard_TrainerUI");
  const noCallbacks = loggedIn(TRAINER_ENV + "__trainer() ClassTrainerFrame.ScrollBox = {}");
  noCallbacks.fire("ADDON_LOADED", "Blizzard_TrainerUI");
  expect([bare, plain, noEvent, noCallbacks].map(windowErrors), "none of them reports an error").toEqual(["none", "none", "none", "none"]);
  expect(plain.eval("return ClassTrainerFrame.ScrollBox.callbacks.OnAcquiredFrame == nil"), "no list events without the game's mixin").toBe(true);
});

// TEST-ONLY helpers for button art: a button whose normal and disabled textures are an arrow, as the money arrows are.
const ARROWS_ENV = `
  function __arrow(parent, name)
    local b = CreateFrame("Button", name, parent)
    b.up, b.off = b:CreateTexture(), b:CreateTexture()
    b.GetNormalTexture, b.GetDisabledTexture = function() return b.up end, function() return b.off end
    return b
  end
`;

// TEST-ONLY side dress-up, stack split and coin pickup windows.
const DRESSUP_ENV = `${WINDOWS_ENV}${ARROWS_ENV}
  local d = __window("SideDressUpFrame")
  d.BGTopLeft, d.BGBottomLeft = d:CreateTexture(), d:CreateTexture()
  for _, n in ipairs({ "SideDressUpFrameTop", "SideDressUpFrameBackgroundTop", "SideDressUpFrameBackgroundBot" }) do d:CreateTexture(n) end
  d.ResetButton = CreateFrame("Button", nil, d)
  d.ModelScene = CreateFrame("Frame", nil, d) d.ModelScene.ControlFrame = CreateFrame("Frame", nil, d.ModelScene)
  for _, key in ipairs({ "zoomInButton", "rotateLeftButton" }) do
    local b = CreateFrame("Button", nil, d.ModelScene.ControlFrame) b.Icon = b:CreateTexture() d.ModelScene.ControlFrame[key] = b
  end
  local s = __window("StackSplitFrame")
  for _, key in ipairs({ "SingleItemSplitBackground", "MultiItemSplitBackground" }) do s[key] = s:CreateTexture() end
  s.FrameGlow = CreateFrame("Frame", nil, s)
  s.OkayButton, s.CancelButton = CreateFrame("Button", nil, s), CreateFrame("Button", nil, s)
  s.LeftButton, s.RightButton = __arrow(s), __arrow(s)
  s.StackSplitText = s:CreateFontString(nil, "BACKGROUND")
  local c = __window("CoinPickupFrame")
  for _, n in ipairs({ "CoinPickupGoldIcon", "CoinPickupSilverIcon" }) do c:CreateTexture(n) end
  CreateFrame("Button", "CoinPickupOkayButton", c) CreateFrame("Button", "CoinPickupCancelButton", c)
  __arrow(c, "CoinPickupLeftButton") __arrow(c, "CoinPickupRightButton") c:CreateFontString("CoinPickupText", "ARTWORK")
`;

it("S2.3 side dress-up, stack split and coin pickup: plates faded, buttons themed with their glyphs kept", () => {
  const addon = loggedIn(DRESSUP_ENV);
  addon.eval("SideDressUpFrame:Show() StackSplitFrame:Show() CoinPickupFrame:Show()");
  const first = ["SideDressUpFrame", "StackSplitFrame", "CoinPickupFrame"].map((n) => windowState(addon, n));
  expect(first.map((s) => s.panel), "a panel on each").toEqual([true, true, true]);
  expect([first[0].art, first[1].art, first[2].art], "the game's plates faded").toEqual([0, 0, 0]);
  const d = "SideDressUpFrame";
  expect(alphas(addon, `${d}.BGTopLeft`, `${d}.BGBottomLeft`, "SideDressUpFrameTop", "SideDressUpFrameBackgroundBot"), "the dress-up window's named art").toEqual([0, 0, 0, 0]);
  expect(dressed(addon, `${d}.ResetButton`, `${d}.ModelScene.ControlFrame.zoomInButton`), "Reset and the model's buttons themed").toEqual([true, true]);
  expect(addon.eval(`local b = ${d}.ModelScene.ControlFrame.rotateLeftButton return b.Icon:GetAlpha()`), "a model button keeps its icon").toBe(1);
  const s = "StackSplitFrame";
  expect(alphas(addon, `${s}.SingleItemSplitBackground`, `${s}.MultiItemSplitBackground`, `${s}.FrameGlow`), "the stack window's plates and glow").toEqual([0, 0, 0]);
  expect(dressed(addon, `${s}.OkayButton`, `${s}.CancelButton`, `${s}.LeftButton`, `${s}.RightButton`), "its four buttons themed").toEqual([true, true, true, true]);
  expect(alphas(addon, `${s}.LeftButton.up`, `${s}.RightButton.off`), "the arrows stay visible").toEqual([1, 1]);
  expect(addon.eval(`return ${s}.StackSplitText:GetFont() ~= nil`), "the amount in the theme font").toBe(true);
  expect(alphas(addon, "CoinPickupGoldIcon", "CoinPickupSilverIcon", "CoinPickupLeftButton.up"), "the coin icons and arrows stay").toEqual([1, 1, 1]);
  expect(dressed(addon, "CoinPickupOkayButton", "CoinPickupCancelButton", "CoinPickupLeftButton"), "its buttons themed").toEqual([true, true, true]);
  expect(addon.eval("return CoinPickupText:GetFont() ~= nil"), "its amount in the theme font").toBe(true);
  addon.eval("SideDressUpFrame:Hide() SideDressUpFrame:Show() StackSplitFrame:Hide() StackSplitFrame:Show() CoinPickupFrame:Hide() CoinPickupFrame:Show()");
  expect(windowState(addon, "CoinPickupFrame").painted, "showing them again paints nothing more").toBe(first[2].painted);
});

it("S2.3 side dress-up, stack split and coin pickup: group off leaves them the game's; bare windows load cleanly", () => {
  const off = loggedIn(DRESSUP_ENV, { savedVariables: OFF });
  off.eval("SideDressUpFrame:Show() StackSplitFrame:Show() CoinPickupFrame:Show()");
  expect(["SideDressUpFrame", "StackSplitFrame", "CoinPickupFrame"].map((n) => windowState(off, n).art !== 0), "art left").toEqual([true, true, true]);
  const bare = loggedIn('for _, n in ipairs({ "SideDressUpFrame", "StackSplitFrame", "CoinPickupFrame" }) do CreateFrame("Frame", n, UIParent):Hide() end');
  bare.eval("SideDressUpFrame:Show() StackSplitFrame:Show() CoinPickupFrame:Show()");
  expect([bare.eval("return ns.FrameState('vgWindow')[StackSplitFrame]"), windowErrors(bare)], "windows without their parts").toEqual([true, "none"]);
});

// TEST-ONLY separate bag windows (ContainerFrame1-7): a window per bag, each holding item buttons the way
// the game's ContainerFrameMixin hands them out (EnumerateValidItems) and refilling them in UpdateItems.
const BAGS_ENV = `${WINDOWS_ENV}
  function __bag(name, slots)
    local f = __window(name) f.items = {}
    for i = 1, slots do
      local b = CreateFrame("Button", nil, f) b.icon = b:CreateTexture() b.IconBorder = b:CreateTexture() f.items[i] = b
    end
    function f:EnumerateValidItems() return ipairs(self.items) end
    function f:UpdateItems() end
    return f
  end
  __bag("ContainerFrame1", 2) __bag("ContainerFrame2", 1)
`;

// How many of a bag window's item buttons have the Bags module's item look.
const skinnedItems = (addon, name) => addon.eval(`local n = 0 for _, b in ipairs(${name}.items) do if ns.FrameState('vgSkinned')[b] then n = n + 1 end end return n`);

it("S2.4 separate bag windows: with Combined bags off the window and its items take the Bags look", () => {
  const addon = loggedIn(BAGS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Bags = { combined = false } } }" });
  addon.eval("ContainerFrame1:Show()");
  const first = windowState(addon, "ContainerFrame1");
  expect([first.art, first.panel, skinnedItems(addon, "ContainerFrame1")], "the window skinned and both item slots done").toEqual([0, true, 2]);
  addon.eval("local b = CreateFrame('Button', nil, ContainerFrame1) b.icon = b:CreateTexture() b.IconBorder = b:CreateTexture() table.insert(ContainerFrame1.items, b) ContainerFrame1:UpdateItems()");
  expect(skinnedItems(addon, "ContainerFrame1"), "a slot the game adds is dressed when it fills the bag").toBe(3);
  addon.eval("ContainerFrame1:Hide() ContainerFrame1:Show() ContainerFrame2:Show()");
  expect([windowState(addon, "ContainerFrame2").panel, skinnedItems(addon, "ContainerFrame2")], "another bag too").toEqual([true, 1]);
  const painted = windowState(addon, "ContainerFrame2").painted;
  addon.eval("ContainerFrame1:Hide() ContainerFrame1:Show() ContainerFrame1:UpdateItems()");
  expect(windowState(addon, "ContainerFrame2").painted, "showing and refilling again paints nothing more").toBe(painted);
});

it("S2.4 separate bag windows: the Bags module or the town group off leaves them the game's; a bag without item calls is fine", () => {
  const noBags = loggedIn(BAGS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Bags = false } } }" });
  noBags.eval("ContainerFrame1:Show()");
  expect([windowState(noBags, "ContainerFrame1").art !== 0, skinnedItems(noBags, "ContainerFrame1"), noBags.eval("return ns.FrameState('vgBagItems')[ContainerFrame1] == nil")], "Bags off: nothing").toEqual([true, 0, true]);
  const off = loggedIn(BAGS_ENV, { savedVariables: OFF });
  off.eval("ContainerFrame1:Show()");
  expect([windowState(off, "ContainerFrame1").art !== 0, skinnedItems(off, "ContainerFrame1")], "town off: nothing").toEqual([true, 0]);
  const bare = loggedIn(`${WINDOWS_ENV} __window("ContainerFrame3").UpdateItems = function() end local f = __window("ContainerFrame4") f.UpdateItems = function() end f.EnumerateValidItems = function() return ipairs({}) end`);
  bare.eval("ContainerFrame3:Show() ContainerFrame3:UpdateItems() ContainerFrame4:Show() ContainerFrame4:UpdateItems()");
  expect([windowState(bare, "ContainerFrame3").panel, windowErrors(bare)], "windows without the item calls are skinned, no error").toEqual([true, "none"]);
  // The game lists a bag window's slots before it has made their buttons (a window not opened yet).
  const empty = loggedIn(`${BAGS_ENV} function ContainerFrame2:EnumerateValidItems() local i = 0 return function() i = i + 1 if i <= 2 then return i, self.items[i] end end end`, { savedVariables: "VanguardDB.profiles = { Default = { Bags = { combined = false } } }" });
  empty.eval("ContainerFrame2:Show()");
  expect([windowState(empty, "ContainerFrame2").panel, skinnedItems(empty, "ContainerFrame2"), empty.eval("return #ns.errors")], "a slot with no button yet is skipped: the window and its one button are skinned, no error").toEqual([true, 1, 0]);
});

// TEST-ONLY master looter window and group loot history. MasterLooterFrame_UpdatePlayers makes the player
// buttons as the game does: named player<column * 10 + row>, with gaps when a column has fewer than ten rows.
const LOOT_ENV = `${WINDOWS_ENV}
  local m = __window("MasterLooterFrame")
  m.Item = CreateFrame("Frame", nil, m)
  for _, key in ipairs({ "NameBorderLeft", "NameBorderRight", "NameBorderMid", "IconBorder" }) do m.Item[key] = m.Item:CreateTexture() end
  m.HighlightFrame = CreateFrame("Frame", nil, m)
  m.player1 = CreateFrame("Button", nil, m)
  function MasterLooterFrame_UpdatePlayers() m.player11 = m.player11 or CreateFrame("Button", nil, m) end
  local h = __window("GroupLootHistoryFrame") h.ClosePanelButton = CreateFrame("Button", nil, h)
`;

it("S2.5 loot dialogs: master looter and loot history skinned, player buttons themed as the game lists them", () => {
  const addon = loggedIn(LOOT_ENV);
  addon.eval("MasterLooterFrame:Show() GroupLootHistoryFrame:Show()");
  const first = windowState(addon, "MasterLooterFrame");
  expect(first, "the master looter window skin").toMatchObject({ art: 0, nine: 0, panel: true, title: true });
  expect(windowState(addon, "GroupLootHistoryFrame"), "the history window skin").toMatchObject({ art: 0, panel: true });
  const m = "MasterLooterFrame";
  expect(alphas(addon, `${m}.Item.NameBorderLeft`, `${m}.Item.NameBorderMid`, `${m}.HighlightFrame`), "the name plate and glow faded").toEqual([0, 0, 0]);
  expect(alphas(addon, `${m}.Item.IconBorder`), "the item's quality ring stays").toEqual([1]);
  expect(dressed(addon, `${m}.player1`, "GroupLootHistoryFrame.ClosePanelButton"), "a player button and the history close button themed").toEqual([true, true]);
  addon.eval("MasterLooterFrame_UpdatePlayers()");
  expect(dressed(addon, `${m}.player11`), "a player button the game makes when it lists candidates").toEqual([true]);
  const painted = windowState(addon, m).painted;
  addon.eval(`${m}:Hide() ${m}:Show() MasterLooterFrame_UpdatePlayers()`);
  expect(windowState(addon, m).painted, "showing and listing again paints nothing more").toBe(painted);
});

it("S2.5 loot dialogs: group off leaves them the game's; a window without its parts or the game's list call loads cleanly", () => {
  const off = loggedIn(LOOT_ENV, { savedVariables: OFF });
  off.eval("MasterLooterFrame:Show() GroupLootHistoryFrame:Show()");
  expect([windowState(off, "MasterLooterFrame").art !== 0, windowState(off, "GroupLootHistoryFrame").art !== 0, off.eval("return ns.FrameState('vgPlayers')[MasterLooterFrame] == nil")], "not hooked").toEqual([true, true, true]);
  const bare = loggedIn('CreateFrame("Frame", "MasterLooterFrame", UIParent):Hide() CreateFrame("Frame", "GroupLootHistoryFrame", UIParent):Hide()');
  bare.eval("MasterLooterFrame:Show() GroupLootHistoryFrame:Show()");
  expect([bare.eval("return ns.FrameState('vgWindow')[MasterLooterFrame]"), windowErrors(bare)], "bare windows: skinned, no list hook, no error").toEqual([true, "none"]);
});

// TEST-ONLY icon picker popup (IconSelectorPopupFrameTemplate): the frame with its header box and parts.
const PICKER_ENV = `${WINDOWS_ENV}${ARROWS_ENV}
  function __picker(name)
    local f = __window(name) f.BG = f:CreateTexture()
    local box = CreateFrame("Frame", nil, f) f.BorderBox = box
    box.NineSlice = CreateFrame("Frame", nil, box) box.NineSlice:CreateTexture()
    box.SelectedIconArea = CreateFrame("Frame", nil, box)
    box.IconSelectorEditBox = CreateFrame("EditBox", nil, box) box.IconSelectorEditBox:CreateTexture()
    box.OkayButton, box.CancelButton = CreateFrame("Button", nil, box), CreateFrame("Button", nil, box)
    return f
  end
`;

// TEST-ONLY macro window and stopwatch.
const MACRO_ENV = `${PICKER_ENV}
  __window("MacroFrame") __picker("MacroPopupFrame") __picker("GuildBankPopupFrame") __picker("GearManagerPopupFrame")
  for _, n in ipairs({ "MacroEditButton", "MacroCancelButton", "MacroSaveButton", "MacroDeleteButton", "MacroNewButton", "MacroExitButton" }) do CreateFrame("Button", n, MacroFrame) end
  local w = __window("StopwatchFrame")
  local tab = CreateFrame("Frame", "StopwatchTabFrame", w) tab.art = tab:CreateTexture() tab:CreateFontString("StopwatchTitle", "BACKGROUND")
  CreateFrame("Button", "StopwatchCloseButton", tab) __arrow(w, "StopwatchPlayPauseButton") __arrow(w, "StopwatchResetButton")
  __window("InspectRecipeFrame")
`;

it("S2.6 macro, icon pickers, stopwatch, recipe inspection: skinned when their part of the game loads", () => {
  const addon = loggedIn(MACRO_ENV);
  for (const part of ["Blizzard_MacroUI", "Blizzard_GuildBankUI", "Blizzard_TimeManager", "Blizzard_Professions"]) addon.fire("ADDON_LOADED", part);
  addon.eval("for _, n in ipairs({ 'MacroFrame', 'MacroPopupFrame', 'GuildBankPopupFrame', 'GearManagerPopupFrame', 'StopwatchFrame', 'InspectRecipeFrame' }) do _G[n]:Show() end");
  const shown = ["MacroFrame", "MacroPopupFrame", "GuildBankPopupFrame", "GearManagerPopupFrame", "StopwatchFrame", "InspectRecipeFrame"].map((n) => windowState(addon, n));
  expect(shown.map((s) => [s.art, s.panel]), "each is faded and has a panel").toEqual(Array(6).fill([0, true]));
  expect(dressed(addon, "MacroEditButton", "MacroExitButton"), "the macro window's loose buttons themed").toEqual([true, true]);
  for (const n of ["MacroPopupFrame", "GuildBankPopupFrame", "GearManagerPopupFrame"]) {
    expect(addon.eval(`local b = ${n}.BorderBox return { ${n}.BG:GetAlpha(), b.NineSlice:GetAlpha(), select('#', b.SelectedIconArea:GetRegions()) > 0, select('#', b.IconSelectorEditBox:GetRegions()) > 1, select('#', b.OkayButton:GetRegions()) > 0, select('#', b.CancelButton:GetRegions()) > 0 }`), `${n}: BG and border faded, icon area inset, name box and buttons themed`).toEqual([0, 0, true, true, true, true]);
  }
  expect(alphas(addon, "StopwatchTabFrame.art", "StopwatchPlayPauseButton.up", "StopwatchResetButton.off"), "the title tab's art faded, the play and reset pictures kept").toEqual([0, 1, 1]);
  expect(dressed(addon, "StopwatchCloseButton", "StopwatchPlayPauseButton", "StopwatchResetButton"), "its three buttons themed").toEqual([true, true, true]);
  expect(addon.eval("return StopwatchTitle:GetFont() ~= nil"), "the title in the theme font").toBe(true);
  const painted = windowState(addon, "StopwatchFrame").painted;
  addon.eval("for _, n in ipairs({ 'MacroFrame', 'MacroPopupFrame', 'StopwatchFrame' }) do _G[n]:Hide() _G[n]:Show() end");
  expect(windowState(addon, "StopwatchFrame").painted, "showing them again paints nothing more").toBe(painted);
});

it("S2.6 macro, icon pickers, stopwatch, recipe inspection: group off leaves them the game's; bare windows load cleanly", () => {
  const off = loggedIn(MACRO_ENV, { savedVariables: OFF });
  for (const part of ["Blizzard_MacroUI", "Blizzard_TimeManager"]) off.fire("ADDON_LOADED", part);
  off.eval("MacroPopupFrame:Show() StopwatchFrame:Show() GearManagerPopupFrame:Show()");
  expect(["MacroPopupFrame", "StopwatchFrame", "GearManagerPopupFrame"].map((n) => windowState(off, n).art !== 0), "art left").toEqual([true, true, true]);
  const bare = loggedIn('for _, n in ipairs({ "MacroPopupFrame", "GuildBankPopupFrame", "GearManagerPopupFrame", "StopwatchFrame" }) do CreateFrame("Frame", n, UIParent):Hide() end');
  for (const part of ["Blizzard_MacroUI", "Blizzard_GuildBankUI", "Blizzard_TimeManager"]) bare.fire("ADDON_LOADED", part);
  bare.eval("MacroPopupFrame:Show() StopwatchFrame:Show() GearManagerPopupFrame:Show()");
  const plain = loggedIn(`${PICKER_ENV} __picker("MacroPopupFrame").BorderBox.IconSelectorEditBox = {}`);
  plain.fire("ADDON_LOADED", "Blizzard_MacroUI");
  plain.eval("MacroPopupFrame:Show()");
  expect([bare, plain].map(windowErrors), "windows without their parts, or a box that isn't one: no error").toEqual(["none", "none"]);
  expect(plain.eval("return ns.FrameState('vgWindow')[MacroPopupFrame]"), "the plain popup is still skinned").toBe(true);
});

// TEST-ONLY small dialogs: the ghost button, the message dialog, the addon dialog (a full-screen frame holding
// the dialog) and the currency transfer window.
const DIALOGS_ENV = `${WINDOWS_ENV}
  local g = CreateFrame("Button", "GhostFrame", UIParent) g:CreateTexture() g:Hide()
  CreateFrame("Frame", "GhostFrameContentsFrame", g):CreateFontString("GhostFrameContentsFrameText", "ARTWORK")
  local b = __window("BasicMessageDialog") b.Border = CreateFrame("Frame", nil, b) b.Border:CreateTexture()
  local a = CreateFrame("Frame", "AddonDialog", UIParent) a:Hide()
  local box = CreateFrame("Frame", "AddonDialogBackground", a) box:CreateTexture("AddonDialogBackgroundBg")
  CreateFrame("Button", "AddonDialogButton1", box) CreateFrame("Button", "AddonDialogButton2", box)
  local c = __window("CurrencyTransferMenu") c.Content = CreateFrame("Frame", nil, c)
  c.Content.ConfirmButton, c.Content.CancelButton = CreateFrame("Button", nil, c.Content), CreateFrame("Button", nil, c.Content)
`;

it("S2.7 small dialogs: ghost button, message dialog, addon dialog and currency transfer take the theme", () => {
  const addon = loggedIn(DIALOGS_ENV);
  addon.eval("GhostFrame:Show() BasicMessageDialog:Show() AddonDialog:Show() CurrencyTransferMenu:Show()");
  expect(addon.eval("return select('#', GhostFrame:GetRegions()) > 1"), "the ghost button is a theme button (its own texture and the theme's)").toBe(true);
  expect(addon.eval("return GhostFrameContentsFrameText:GetFont() ~= nil"), "its text in the theme font").toBe(true);
  const message = windowState(addon, "BasicMessageDialog");
  expect(message, "the message dialog: art faded, panel").toMatchObject({ art: 0, panel: true });
  expect(alphas(addon, "BasicMessageDialog.Border"), "its Border faded").toEqual([0]);
  expect(dressed(addon, "BasicMessageDialogButton1", "BasicMessageDialogButton2"), "its button row themed").toEqual([true, true]);
  expect(alphas(addon, "AddonDialogBackgroundBg"), "the addon dialog's art faded").toEqual([0]);
  expect(addon.eval("local n = 0 for _, r in ipairs({ AddonDialogBackground:GetRegions() }) do if r.__alpha ~= 0 then n = n + 1 end end return { n > 0, ns.FrameState('vgWindow')[AddonDialog], select('#', AddonDialog:GetRegions()) }"), "its panel sits on the dialog, not on the full-screen catcher").toEqual([true, true, 0]);
  expect(dressed(addon, "AddonDialogButton1", "AddonDialogButton2", "CurrencyTransferMenu.Content.ConfirmButton", "CurrencyTransferMenu.Content.CancelButton"), "the addon dialog's and the transfer window's buttons themed").toEqual([true, true, true, true]);
  expect(windowState(addon, "CurrencyTransferMenu"), "the transfer window skin").toMatchObject({ art: 0, panel: true });
  const painted = message.painted;
  addon.eval("BasicMessageDialog:Hide() BasicMessageDialog:Show() AddonDialog:Hide() AddonDialog:Show() GhostFrame:Hide() GhostFrame:Show()");
  expect(windowState(addon, "BasicMessageDialog").painted, "showing them again paints nothing more").toBe(painted);
});

it("S2.7 small dialogs: the ghost button waits for the end of combat", () => {
  const addon = loggedIn(DIALOGS_ENV.replace("local g = CreateFrame", "__wfgStub.inCombat = true local g = CreateFrame"));
  addon.eval("GhostFrame:Show()");
  expect(addon.eval("return { ns.FrameState('vgWindow')[GhostFrame], select('#', GhostFrame:GetRegions()) }"), "hooked, but not painted in combat (only its own texture)").toEqual([true, 1]);
  setCombat(addon, false);
  expect(addon.eval("return select('#', GhostFrame:GetRegions()) > 1"), "dressed once combat ends").toBe(true);
});

it("S2.7 small dialogs: group off leaves them the game's; a client without the dialogs or their parts loads cleanly", () => {
  const off = loggedIn(DIALOGS_ENV, { savedVariables: OFF });
  off.eval("GhostFrame:Show() BasicMessageDialog:Show() AddonDialog:Show()");
  expect([windowState(off, "BasicMessageDialog").art !== 0, off.eval("return ns.FrameState('vgWindow')[GhostFrame] == nil"), off.eval("return ns.FrameState('vgWindow')[AddonDialog] == nil")], "not hooked").toEqual([true, true, true]);
  const bare = loggedIn('CreateFrame("Frame", "AddonDialog", UIParent):Hide() CreateFrame("Frame", "CurrencyTransferMenu", UIParent):Hide()');
  bare.eval("AddonDialog:Show() CurrencyTransferMenu:Show()");
  expect([bare.eval("return ns.FrameState('vgWindow')[CurrencyTransferMenu]"), windowErrors(bare)], "an addon dialog without its box, a transfer window without content: skinned, no error").toEqual([true, "none"]);
});
