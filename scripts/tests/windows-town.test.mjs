// windows-town: the town group of game windows (Modules/WindowsTown.lua), in the
// TEST-ONLY headless client. Cases follow docs/handoff/RESKIN-PLAN.md section 0 ("Writing a task's test").

import { expect, it } from "vitest";
import { INSIDES_LUA, WINDOWS_ENV, loggedIn, setCombat, windowState } from "./helpers.mjs";

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

// TEST-ONLY readers of a window's parts (the ones the later windows share): __button(b) whether the theme painted a flat
// button on b, __lit(fs, role, token) whether a font string takes the role and the colour, __quiet(b) how many of a slot's
// accent edges are hidden (4 at rest, none while the mouse is over it or holds it).
const TOWN_READERS = `${WINDOWS_ENV}${INSIDES_LUA}
  function __button(b) return ns.Theme.HoverParts(b) ~= nil end
  function __lit(fs, role, token) return __looks(fs, role, token) end
  function __quiet(b)
    local n = 0
    for _, w in ipairs(__wfgStub.frames) do
      if w.__parent == b and w.__kind == "Texture" and w.__layer == "BORDER" and w.__vertexColor and w.__vertexColor[4] == 0 then n = n + 1 end
    end
    return n
  end
`;

// TEST-ONLY scroll lists as the game builds them: ScrollUtil (the acquire callbacks), a ScrollBox holding rows (__box), a scroll
// bar shaped like MinimalScrollBar whose track holds a piece of game art (__scrollBar) and a selector tile
// (SelectorButtonTemplate: slot plate, hover strip, selected mark, icon as the normal texture).
const SCROLL_ENV = `
  ScrollUtil = { AddAcquiredFrameCallback = function(box, cb, owner) table.insert(box.callbacks, function(row) cb(owner, row) end) end }
  function __box(rows)
    local box = { rows = rows or {}, callbacks = {} }
    function box:ForEachFrame(fn) for _, row in ipairs(self.rows) do fn(row) end end
    return box
  end
  function __scrollBar(parent)
    local b = CreateFrame("Frame", nil, parent) b.Track = CreateFrame("Frame", nil, b) b.Thumb = CreateFrame("Button", nil, b.Track)
    __art(b.Track) return b
  end
  function __tile(parent)
    local b = CreateFrame("CheckButton", nil, parent or UIParent)
    b.plate, b.glow, b.SelectedTexture, b.Icon = __art(b), __art(b), b:CreateTexture(), b:CreateTexture()
    b.GetNormalTexture = function() return b.Icon end
    b.GetHighlightTexture = function() return b.glow end
    return b
  end
  -- Whether a tile is a quiet slot with its plate and hover strip faded and its icon and selected mark kept.
  function __tiled(b)
    return ns.FrameState("vgSelectorTiles")[b] == true and b.plate:GetAlpha() == 0 and b.glow:GetAlpha() == 0 and b.Icon:GetAlpha() == 1
      and b.SelectedTexture:GetAlpha() == 1 and __quiet(b) == 4
  end
`;

// TEST-ONLY pet stable (Blizzard_StableUI, Camelot): the window with the parts the skin dresses.
const STABLE_ENV = `${TOWN_READERS}
  local f = __window("PetStableFrame")
  f.Background, f.insideFrameBottom = __art(f), __art(f)
  local scene = CreateFrame("Frame", nil, f) f.modelScene = scene
  scene.Background, scene.PetShadow = __art(scene), __art(scene)
  scene.PetModelSceneShadow, scene.Inset = CreateFrame("Frame", nil, scene), CreateFrame("Frame", nil, scene)
  scene.ControlFrame = CreateFrame("Frame", nil, scene)
  for _, key in ipairs({ "zoomInButton", "resetButton" }) do
    local b = CreateFrame("Button", nil, scene.ControlFrame) b.Icon = __art(b) scene.ControlFrame[key] = b
  end
  local bar = CreateFrame("Frame", nil, f) f.expBar = bar
  bar.Fill, bar.Text = __art(bar), __text(bar, "250 / 400") __art(bar)
  f.purchaseButton = CreateFrame("Button", nil, f)
  for _, name in ipairs({ "PetStableLevelText", "PetStableLoyaltyText", "PetStableSlotText", "PetStableCostLabel" }) do
    f:CreateFontString(name, "ARTWORK"):SetFont("TEST-ONLY-GAME", 12, "")
  end
  for _, name in ipairs({ "PetStableCurrentPet", "PetStableStabledPet1", "PetStableStabledPet2" }) do
    local slot = CreateFrame("CheckButton", name, f)
    slot.rim, slot.lockIcon, slot.genericPetIcon, slot.currentGlow, slot.checked = __art(slot), __art(slot), __art(slot), __art(slot), __art(slot)
    slot.icon = __art(slot, name .. "IconTexture") slot.Text = __text(slot, "Pets")
    slot.GetCheckedTexture = function() return slot.checked end
  end
  for _, key in ipairs({ "TopDividerFrame", "BottomDividerFrame" }) do
    f[key] = CreateFrame("Frame", nil, f) f[key].horzDivider = __art(f[key])
  end
  PetStableMoneyFrame = __moneyLine("PetStableMoneyFrame", f)
  PetStableMoneyFrame.Border = CreateFrame("Frame", nil, PetStableMoneyFrame) __art(PetStableMoneyFrame.Border)
  PetStableCostMoneyFrame = __moneyLine("PetStableCostMoneyFrame", f)
  -- TEST-ONLY reader of the pet stable (see stableState).
  function __stableState()
  local f, scene, bar = PetStableFrame, PetStableFrame.modelScene, PetStableFrame.expBar
  local slot = PetStableCurrentPet
  local controls = scene.ControlFrame
  local dividers = 0
  for _, key in ipairs({ "TopDividerFrame", "BottomDividerFrame" }) do
    if f[key].horzDivider:GetAlpha() == 0 and ns.Theme.DividerParts(f[key].horzDivider) ~= nil then dividers = dividers + 1 end
  end
  return {
    scene = __faded(scene, scene.PetShadow) and scene.Background:GetAlpha() == 0 and scene.Inset:GetAlpha() == 0 and scene.PetModelSceneShadow:GetAlpha() == 0 and __sunk(scene),
    shadow = scene.PetShadow:GetAlpha(), controls = __button(controls.zoomInButton) and __button(controls.resetButton) and controls.zoomInButton.Icon:GetAlpha() == 1,
    bar = bar.Fill:GetAlpha() == 1 and __sunk(bar) and __faded(bar, bar.Fill) and __themed(bar.Text),
    texts = __lit(PetStableLevelText, "label", "text") and __lit(PetStableSlotText, "label", "text") and __lit(PetStableCostLabel, "label", "text")
      and __themed(PetStableLoyaltyText) and PetStableLoyaltyText.__textColor == nil,
    captions = __lit(PetStableCurrentPet.Text, "small", "text") and __lit(PetStableStabledPet1.Text, "small", "text"),
    slotArt = slot.rim:GetAlpha() == 0 and slot.lockIcon:GetAlpha() == 1 and slot.genericPetIcon:GetAlpha() == 1 and slot.currentGlow:GetAlpha() == 1
      and slot.icon:GetAlpha() == 1 and slot.checked:GetAlpha() == 1,
    slots = select('#', PetStableStabledPet2:GetRegions()) > 6 and __quiet(PetStableStabledPet2) == 4,
    dividers = dividers, purchase = __button(f.purchaseButton),
    money = __faded(PetStableMoneyFrame.Border) and __sunk(PetStableMoneyFrame.Border) and __themed(PetStableMoneyFrame.GoldButton.Text) and __themed(PetStableCostMoneyFrame.CopperButton.Text),
    painted = ns.Theme.PaintedCount(), errors = #ns.errors }
  end
`;

// The stable's parts as the skin leaves them (see __stableState in STABLE_ENV).
const stableState = (addon) => addon.eval("return __stableState()");

it("R2.21 the pet stable: scene, experience bar, three slot tiles, rules, money lines and texts in the theme", () => {
  const addon = loggedIn(STABLE_ENV);
  addon.eval("PetStableFrame:Show()");
  const first = stableState(addon);
  expect(windowState(addon, "PetStableFrame"), "the window skin").toMatchObject({ art: 0, nine: 0, panel: true, title: true });
  expect(first, "the scene faded to an inset with its pet shadow kept; the model's buttons themed with their icons").toMatchObject({ scene: true, shadow: 1, controls: true });
  expect(first, "the experience bar's track faded, its fill kept, an inset behind it, its text in the theme font").toMatchObject({ bar: true });
  expect(first, "the gold texts in the text colour, the white loyalty line only in the theme font, the slot captions small").toMatchObject({ texts: true, captions: true });
  expect(first, "the slots lose their rims and keep icon, lock, generic picture, glow and checked mark; the purchase button is a theme button").toMatchObject({ slotArt: true, slots: true, purchase: true });
  expect(first, "both rules are one pixel of divider; the money lines: the coin box an inset, the figures in the theme font").toMatchObject({ dividers: 2, money: true, errors: 0 });
  expect(addon.eval("return PetStableFrame.insideFrameBottom.__alpha"), "the sunk strip's art faded").toBe(0);
  expect(addon.eval("local foot = ns.FrameState('vgStableFoot')[PetStableFrame] return { foot ~= nil, foot:GetFrameLevel() == PetStableFrame:GetFrameLevel(), foot.__points.TOPLEFT.rel == PetStableFrame.insideFrameBottom, foot.__points.BOTTOMRIGHT.rel == PetStableFrame.insideFrameBottom }"), "an inset panel laid corner to corner where it was, level with the window").toEqual([true, true, true, true]);
  addon.eval("PetStableFrame:Hide() PetStableFrame:Show()");
  expect(stableState(addon).painted, "a second show paints nothing more").toBe(first.painted);
});

it("R2.21 the pet stable: a slot's accent edge follows the mouse", () => {
  const addon = loggedIn(STABLE_ENV);
  addon.eval("PetStableFrame:Show()");
  // How many of the current pet slot's accent edges are hidden now.
  const quiet = () => addon.eval("return __quiet(PetStableCurrentPet)");
  expect(quiet(), "at rest the edge is hidden").toBe(4);
  addon.hover("PetStableCurrentPet");
  expect(quiet(), "under the mouse it shows").toBe(0);
  addon.hover(null);
  addon.eval("__wfgStub.runScript(PetStableCurrentPet, 'OnMouseDown')");
  expect(quiet(), "held, it shows (darker)").toBe(0);
  addon.eval("__wfgStub.runScript(PetStableCurrentPet, 'OnMouseUp')");
  expect(quiet(), "let go away from the slot, it is hidden again").toBe(4);
  addon.eval("PetStableFrame:Hide() PetStableFrame:Show() PetStableFrame:Hide() PetStableFrame:Show()");
  addon.hover("PetStableCurrentPet");
  addon.hover(null);
  expect(quiet(), "showing the window again hooked nothing twice").toBe(4);
});

it("R2.21 the pet stable: its group switched off leaves it the game's; windows and slots without their parts load cleanly", () => {
  const off = loggedIn(STABLE_ENV, { savedVariables: OFF });
  off.eval("PetStableFrame:Show()");
  expect([windowState(off, "PetStableFrame").art !== 0, off.eval("return ns.FrameState('vgWindow')[PetStableFrame] == nil")], "not hooked, art left").toEqual([true, true]);
  const bare = loggedIn('CreateFrame("Frame", "PetStableFrame", UIParent):Hide()');
  bare.eval("PetStableFrame:Show()");
  expect([bare.eval("return ns.FrameState('vgWindow')[PetStableFrame]"), windowErrors(bare)], "a window without the parts is skinned, no error").toEqual([true, "none"]);
  const odd = loggedIn(`${STABLE_ENV} PetStableCurrentPet.GetCheckedTexture = nil PetStableStabledPet1 = {} PetStableFrame.insideFrameBottom = {} PetStableFrame.TopDividerFrame.horzDivider = nil PetStableMoneyFrame.Border = nil`);
  odd.eval("PetStableFrame:Show()");
  expect([odd.eval("return ns.FrameState('vgPetSlots')[PetStableCurrentPet]"), odd.eval("return ns.FrameState('vgPetSlots')[PetStableStabledPet1]"), windowErrors(odd)], "a slot without a checked texture is dressed, one that is no frame is skipped; a strip that is no texture, a divider and a coin box that are missing are skipped").toEqual([true, null, "none"]);
});

// TEST-ONLY trainer (Blizzard_TrainerUI, loads on demand): the window, its list as the game's ScrollBox hands out rows,
// and the two row initialisers the game fills them with (the skill's sets the selected strip, the category's the label font).
const TRAINER_ENV = `${TOWN_READERS}
  ScrollUtil = { AddAcquiredFrameCallback = function(box, cb, owner) table.insert(box.callbacks, function(row) cb(owner, row) end) end }
  -- A row as the game acquires it: a skill row (plates, name, requirements, price, icon, lock, shade, selected strip) or a
  -- category row (plate pieces and its label); sel is whether the skill is the chosen one.
  function __row(sel, category)
    local row = CreateFrame("Button", nil, UIParent)
    if category then
      row.LeftPiece, row.RightPiece, row.CenterPiece = row:CreateTexture(), row:CreateTexture(), row:CreateTexture()
      row.Label = __text(row, "Fire")
    else
      row.plate, row.glow = row:CreateTexture(), row:CreateTexture()
      row.GetNormalTexture, row.GetHighlightTexture = function() return row.plate end, function() return row.glow end
      row.name, row.subText, row.nameSubText = __text(row), __text(row), __text(row)
      row.selectedTex, row.icon, row.lock, row.disabledBG = row:CreateTexture(), row:CreateTexture(), row:CreateTexture(), row:CreateTexture()
      if not sel then row.selectedTex:Hide() end
      row.money = __moneyLine(nil, row)
    end
    return row
  end
  function ClassTrainerFrame_InitServiceButton(row, data) if data == "chosen" then row.selectedTex:Show() else row.selectedTex:Hide() end end
  function ClassTrainerFrame_InitCategoryButton(row) row.Label:SetFont("TEST-ONLY-GAME", 14, "") end
  function __trainer()
    local f = __window("ClassTrainerFrame")
    f.BG = f:CreateTexture() f.BG:SetTexture("TEST-ONLY-ART2") f:CreateTexture("ClassTrainerFrameMoneyBg")
    f.bottomInset = CreateFrame("Frame", nil, f) f.bottomInset.NineSlice = CreateFrame("Frame", nil, f.bottomInset)
    f.FilterDropdown = CreateFrame("Button", nil, f)
    CreateFrame("Button", "ClassTrainerTrainButton", f)
    f.money = __moneyLine(nil, f)
    f.trainingPoints = CreateFrame("Frame", nil, f) f.trainingPoints.text = __text(f.trainingPoints, "3")
    local bar = CreateFrame("StatusBar", "ClassTrainerStatusBar", f) bar.rankText = __text(bar, "Rank 3")
    f.ScrollBar = CreateFrame("Frame", nil, f) f.ScrollBar.Track = CreateFrame("Frame", nil, f.ScrollBar)
    f.ScrollBar.Thumb = CreateFrame("Button", nil, f.ScrollBar.Track) __art(f.ScrollBar.Track)
    f.skillStepButton = __row(false)
    local box = { rows = {}, callbacks = {} }
    function box:ForEachFrame(fn) for _, row in ipairs(self.rows) do fn(row) end end
    f.ScrollBox = box
    return f
  end
`;

it("S2.2 the trainer: window, bars, texts and rows in the theme; skill rows follow the game's selection, category rows are section heads", () => {
  const addon = loggedIn(TRAINER_ENV + "local box = __trainer().ScrollBox table.insert(box.rows, __row(true)) table.insert(box.rows, __row(false))");
  addon.fire("ADDON_LOADED", "Blizzard_TrainerUI");
  addon.eval("ClassTrainerFrame:Show()");
  const first = windowState(addon, "ClassTrainerFrame");
  expect(first, "the window skin").toMatchObject({ art: 0, nine: 0, panel: true, title: true });
  const f = "ClassTrainerFrame";
  expect(alphas(addon, `${f}.BG`, "ClassTrainerFrameMoneyBg", `${f}.bottomInset.NineSlice`), "backdrop, money plate and inset art faded").toEqual([0, 0, 0]);
  expect(dressed(addon, `${f}.bottomInset`, `${f}.FilterDropdown`, "ClassTrainerTrainButton"), "inset panel, filter and Train buttons themed").toEqual([true, true, true]);
  expect(addon.eval(`return { __themed(${f}.money.GoldButton.Text), __lit(${f}.trainingPoints.text, "small", "text"), __themed(ClassTrainerStatusBar.rankText), ${f}.ScrollBar.Track:GetRegions():GetAlpha() }`), "the money line, training points and rank text in the theme font, the scroll bar's track faded").toEqual([true, true, true, 0]);
  expect(addon.eval(`local bar = ClassTrainerStatusBar return { bar.__barTexture ~= nil, bar.__barColor[1] == ns.Theme.RGB("accent") }`), "the rank bar a flat track with the accent fill").toEqual([true, true]);
  expect(addon.eval(`local row = ${f}.ScrollBox.rows[1] return { row.plate:GetAlpha(), row.glow:GetAlpha(), row.selectedTex:GetAlpha(), row.icon:GetAlpha(), row.lock:GetAlpha(), row.disabledBG:GetAlpha() }`), "a row there already: plates and strip faded, icon, lock and shade kept").toEqual([0, 0, 0, 1, 1, 1]);
  expect(addon.eval(`local row = ${f}.ScrollBox.rows[1] return { __themed(row.name), __themed(row.subText), __themed(row.nameSubText), __themed(row.money.CopperButton.Text) }`), "its texts and price in the theme font").toEqual([true, true, true, true]);
  expect(addon.eval(`local r = ${f}.ScrollBox.rows return { ns.Theme.RowParts(r[1]).rail:IsShown(), ns.Theme.RowParts(r[2]).rail:IsShown() }`), "the chosen skill shows the selected look, the other does not").toEqual([true, false]);
  expect(addon.eval(`return ns.Theme.RowParts(${f}.skillStepButton) ~= nil`), "the profession step above the list is a row too").toBe(true);
  addon.eval(`local box = ${f}.ScrollBox local skill, head = __row(false), __row(false, true)
    box.callbacks[1](skill) box.callbacks[1](head) box.skill, box.head = skill, head`);
  expect(addon.eval(`local b = ${f}.ScrollBox return { b.skill.plate:GetAlpha(), __themed(b.skill.name), b.head.LeftPiece:GetAlpha(), b.head.CenterPiece:GetAlpha(), __lit(b.head.Label, "section", "text2") }`), "rows acquired later: a skill row and a category row with its label a section head").toEqual([0, true, 0, 0, true]);
  addon.eval(`local b = ${f}.ScrollBox ClassTrainerFrame_InitServiceButton(b.skill, "chosen")`);
  expect(addon.eval(`return ns.Theme.RowParts(${f}.ScrollBox.skill).rail:IsShown()`), "the game picks the skill: the row takes the selected look").toBe(true);
  addon.eval(`local b = ${f}.ScrollBox ClassTrainerFrame_InitServiceButton(b.skill, "other")`);
  expect(addon.eval(`return ns.Theme.RowParts(${f}.ScrollBox.skill).rail:IsShown()`), "the game fills the row with another skill: the look goes").toBe(false);
  addon.eval(`local b = ${f}.ScrollBox ClassTrainerFrame_InitCategoryButton(b.head)`);
  expect(addon.eval(`return __lit(${f}.ScrollBox.head.Label, "section", "text2")`), "the game puts its gold label font back as it fills the row: the section look returns").toBe(true);
  addon.eval(`local b = ${f}.ScrollBox b.head.Label:SetFont("TEST-ONLY-GAME", 14, "") __wfgStub.runScript(b.head, "OnEnter")`);
  expect(addon.eval(`return __lit(${f}.ScrollBox.head.Label, "section", "text2")`), "and when the mouse enters the row").toBe(true);
  addon.eval(`${f}:Hide() ${f}:Show()`);
  expect(windowState(addon, f).painted, "a second show paints nothing more").toBe(first.painted);
});

it("S2.2 the trainer: group off leaves it the game's; a trainer missing parts loads cleanly", () => {
  const off = loggedIn(TRAINER_ENV + "__trainer()", { savedVariables: OFF });
  off.fire("ADDON_LOADED", "Blizzard_TrainerUI");
  off.eval("ClassTrainerFrame:Show()");
  expect([windowState(off, "ClassTrainerFrame").art !== 0, off.eval("return #ClassTrainerFrame.ScrollBox.callbacks")], "not hooked").toEqual([true, 0]);
  const bare = loggedIn('CreateFrame("Frame", "ClassTrainerFrame", UIParent):Hide()');
  bare.fire("ADDON_LOADED", "Blizzard_TrainerUI");
  bare.eval("ClassTrainerFrame:Show()");
  const plain = loggedIn(TRAINER_ENV + "__trainer() ScrollUtil = nil ClassTrainerFrame_InitServiceButton = nil ClassTrainerFrame_InitCategoryButton = nil ClassTrainerStatusBar.SetStatusBarTexture = nil");
  plain.fire("ADDON_LOADED", "Blizzard_TrainerUI");
  plain.eval("ClassTrainerFrame:Show()");
  const noBox = loggedIn(TRAINER_ENV + "__trainer() ClassTrainerFrame.ScrollBox = {} ClassTrainerFrame.ScrollBar = nil ClassTrainerFrame.skillStepButton.name = {} hooksecurefunc = nil");
  noBox.fire("ADDON_LOADED", "Blizzard_TrainerUI");
  noBox.eval("ClassTrainerFrame:Show()");
  expect([bare, plain, noBox].map(windowErrors), "none of them reports an error").toEqual(["none", "none", "none"]);
  expect(plain.eval("return #ClassTrainerFrame.ScrollBox.callbacks"), "no list events without the game's ScrollUtil").toBe(0);
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
const DRESSUP_ENV = `${TOWN_READERS}${ARROWS_ENV}
  local d = __window("SideDressUpFrame")
  d.BGTopLeft, d.BGBottomLeft = d:CreateTexture(), d:CreateTexture()
  for _, n in ipairs({ "SideDressUpFrameTop", "SideDressUpFrameBackgroundTop", "SideDressUpFrameBackgroundBot" }) do d:CreateTexture(n) end
  d.ResetButton = CreateFrame("Button", nil, d)
  d.ModelScene = CreateFrame("Frame", nil, d) __art(d.ModelScene) d.ModelScene.ControlFrame = CreateFrame("Frame", nil, d.ModelScene)
  for _, key in ipairs({ "zoomInButton", "rotateLeftButton" }) do
    local b = CreateFrame("Button", nil, d.ModelScene.ControlFrame) b.Icon = b:CreateTexture() d.ModelScene.ControlFrame[key] = b
  end
  local s = __window("StackSplitFrame")
  for _, key in ipairs({ "SingleItemSplitBackground", "MultiItemSplitBackground" }) do s[key] = s:CreateTexture() end
  s.FrameGlow = CreateFrame("Frame", nil, s)
  s.OkayButton, s.CancelButton = CreateFrame("Button", nil, s), CreateFrame("Button", nil, s)
  s.LeftButton, s.RightButton = __arrow(s), __arrow(s)
  s.StackSplitText = s:CreateFontString(nil, "BACKGROUND") s.StackItemCountText = __text(s, "x / 20")
  local c = __window("CoinPickupFrame")
  for _, n in ipairs({ "CoinPickupGoldIcon", "CoinPickupSilverIcon" }) do c:CreateTexture(n) end
  CreateFrame("Button", "CoinPickupOkayButton", c) CreateFrame("Button", "CoinPickupCancelButton", c)
  __arrow(c, "CoinPickupLeftButton") __arrow(c, "CoinPickupRightButton") c:CreateFontString("CoinPickupText", "ARTWORK") c:CreateFontString("CoinPickupLabel", "ARTWORK")
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
  expect(addon.eval(`return { __faded(${d}.ModelScene), __sunk(${d}.ModelScene) }`), "the model sits on an inset: the game's art faded").toEqual([true, true]);
  const s = "StackSplitFrame";
  expect(alphas(addon, `${s}.SingleItemSplitBackground`, `${s}.MultiItemSplitBackground`, `${s}.FrameGlow`), "the stack window's plates and glow").toEqual([0, 0, 0]);
  expect(dressed(addon, `${s}.OkayButton`, `${s}.CancelButton`, `${s}.LeftButton`, `${s}.RightButton`), "its four buttons themed").toEqual([true, true, true, true]);
  expect(alphas(addon, `${s}.LeftButton.up`, `${s}.RightButton.off`), "the arrows stay visible").toEqual([0, 0]);
  expect(addon.eval(`return { ${s}.StackSplitText:GetFont() ~= nil, __lit(${s}.StackItemCountText, "number", "text") }`), "the amount in the theme font, the stack count in the text colour (not gold)").toEqual([true, true]);
  expect(addon.eval(`local field = ns.FrameState("vgAmountFields")[${s}] return { field ~= nil, field.__parent == ${s}, __sunk(field) }`), "a field round the amount, between the arrows: a thin border, no fill over the number").toEqual([true, true, false]);
  expect(alphas(addon, "CoinPickupGoldIcon", "CoinPickupSilverIcon", "CoinPickupLeftButton.up"), "the coin icons and arrows stay").toEqual([1, 1, 1]);
  expect(dressed(addon, "CoinPickupOkayButton", "CoinPickupCancelButton", "CoinPickupLeftButton"), "its buttons themed").toEqual([true, true, true]);
  expect(addon.eval("return { CoinPickupText:GetFont() ~= nil, CoinPickupLabel:GetFont() ~= nil, ns.FrameState('vgAmountFields')[CoinPickupFrame] ~= nil }"), "its amount and the label beside it in the theme font, with a field round the amount").toEqual([true, true, true]);
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
const BAGS_ENV = `${TOWN_READERS}
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
  -- The backpack's money line in its coin box (ContainerMoneyFrameTemplate).
  ContainerFrame1.MoneyFrame = __moneyLine(nil, ContainerFrame1) ContainerFrame1.MoneyFrame.Border = __well(nil, ContainerFrame1.MoneyFrame)
`;

// How many of a bag window's item buttons have the Bags module's item look.
const skinnedItems = (addon, name) => addon.eval(`local n = 0 for _, b in ipairs(${name}.items) do if ns.FrameState('vgSkinned')[b] then n = n + 1 end end return n`);

it("S2.4 separate bag windows: with Combined bags off the window and its items take the Bags look", () => {
  const addon = loggedIn(BAGS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Bags = { combined = false } } }" });
  addon.eval("ContainerFrame1:Show()");
  const first = windowState(addon, "ContainerFrame1");
  expect([first.art, first.panel, skinnedItems(addon, "ContainerFrame1")], "the window skinned and both item slots done").toEqual([0, true, 2]);
  expect(addon.eval("local m = ContainerFrame1.MoneyFrame return { __themed(m.GoldButton.Text), __faded(m.Border), __sunk(m.Border) }"), "the backpack's money line in the theme font, its coin box a flat inset").toEqual([true, true, true]);
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
const LOOT_ENV = `${TOWN_READERS}${SCROLL_ENV}
  local m = __window("MasterLooterFrame")
  m.Item = CreateFrame("Frame", nil, m)
  for _, key in ipairs({ "NameBorderLeft", "NameBorderRight", "NameBorderMid", "IconBorder" }) do m.Item[key] = m.Item:CreateTexture() end
  m.HighlightFrame = CreateFrame("Frame", nil, m)
  m.player1 = CreateFrame("Button", nil, m)
  function MasterLooterFrame_UpdatePlayers() m.player11 = m.player11 or CreateFrame("Button", nil, m) end
  local h = __window("GroupLootHistoryFrame") h.ClosePanelButton = CreateFrame("Button", nil, h)
  h.EncounterDropdown = CreateFrame("Button", nil, h) h.EncounterDropdown.Arrow = __art(h.EncounterDropdown)
  h.Timer = CreateFrame("Frame", nil, h) h.Timer.Background, h.Timer.Fill, h.Timer.Border = __art(h.Timer), __art(h.Timer), __art(h.Timer)
  h.NoInfoString = __text(h, "No loot yet") h.ScrollBar = __scrollBar(h)
  -- A roll card as LootHistoryElementTemplate builds it (plate frame, item, three result lines, item name), or the Passed heading.
  function __lootRow(header)
    local row = CreateFrame("Frame", nil, UIParent)
    if header then __text(row, "Passed") return row end
    row.BackgroundArtFrame = CreateFrame("Frame", nil, row) __art(row.BackgroundArtFrame)
    row.Item = __itemButton(nil, row) row.ItemName = __text(row, "Sword")
    for info, key in pairs({ WinningRollInfo = "WinningRoll", PendingRollInfo = "CurrentWinnerText", AllPassedInfo = "AllPassedText" }) do
      row[info] = CreateFrame("Frame", nil, row) row[info][key] = __text(row[info], "text")
    end
    return row
  end
  h.ScrollBox = __box({ __lootRow(), __lootRow(true) })
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

it("R2.23 the loot history: encounter picker, countdown, empty message and roll cards in the theme; rows follow the list", () => {
  const addon = loggedIn(LOOT_ENV);
  addon.eval("GroupLootHistoryFrame:Show()");
  const h = "GroupLootHistoryFrame";
  expect(addon.eval(`local f = ${h} return { select('#', f.EncounterDropdown:GetRegions()) > 1, f.EncounterDropdown.Arrow:GetAlpha(), __lit(f.NoInfoString, "label", "text"), f.ScrollBar.Track:GetRegions():GetAlpha() }`), "the picker a flat button with its theme arrow, the message in the text colour, the scroll bar's track faded").toEqual([true, 0, true, 0]);
  expect(addon.eval(`local t = ${h}.Timer return { t.Background:GetAlpha(), t.Border:GetAlpha(), t.Fill:GetAlpha(), __sunk(t) }`), "the countdown: track and frame art faded, the fill kept, a flat inset behind").toEqual([0, 0, 1, true]);
  const card = `local r = ${h}.ScrollBox.rows[1] return { r.BackgroundArtFrame:GetAlpha(), ns.FrameState("vgSkinned")[r.Item] == true, __lit(r.WinningRollInfo.WinningRoll, "small", "text"), __lit(r.PendingRollInfo.CurrentWinnerText, "small", "text"), __lit(r.AllPassedInfo.AllPassedText, "small", "text"), __themed(r.ItemName) }`;
  expect(addon.eval(card), "a card there already: its plate faded, its item in the bags' item look, its result lines in the text colour, its item name left to the game").toEqual([0, true, true, true, true, false]);
  expect(addon.eval(`return __lit(${h}.ScrollBox.rows[2]:GetRegions(), "heading", "text")`), "the Passed heading in the heading text and the text colour").toBe(true);
  addon.eval(`local box = ${h}.ScrollBox box.new = __lootRow() box.callbacks[1](box.new) box.callbacks[1](nil) box.callbacks[1]({})`);
  expect(addon.eval(`local r = ${h}.ScrollBox.new return { r.BackgroundArtFrame:GetAlpha(), ns.FrameState("vgSkinned")[r.Item] == true }`), "a card the list acquires later").toEqual([0, true]);
  const painted = windowState(addon, h).painted;
  addon.eval(`${h}:Hide() ${h}:Show()`);
  expect([windowState(addon, h).painted, addon.eval(`return #${h}.ScrollBox.callbacks`)], "a second show paints nothing more and watches the list once").toEqual([painted, 1]);
});

it("S2.5 loot dialogs: group off leaves them the game's; a window without its parts or the game's list call loads cleanly", () => {
  const off = loggedIn(LOOT_ENV, { savedVariables: OFF });
  off.eval("MasterLooterFrame:Show() GroupLootHistoryFrame:Show()");
  expect([windowState(off, "MasterLooterFrame").art !== 0, windowState(off, "GroupLootHistoryFrame").art !== 0, off.eval("return ns.FrameState('vgPlayers')[MasterLooterFrame] == nil")], "not hooked").toEqual([true, true, true]);
  const bare = loggedIn('CreateFrame("Frame", "MasterLooterFrame", UIParent):Hide() CreateFrame("Frame", "GroupLootHistoryFrame", UIParent):Hide()');
  bare.eval("MasterLooterFrame:Show() GroupLootHistoryFrame:Show()");
  expect([bare.eval("return ns.FrameState('vgWindow')[MasterLooterFrame]"), windowErrors(bare)], "bare windows: skinned, no list hook, no error").toEqual([true, "none"]);
  const odd = loggedIn(LOOT_ENV + "GroupLootHistoryFrame.Timer = {} GroupLootHistoryFrame.ScrollBox = __box({ {} })");
  odd.eval("GroupLootHistoryFrame:Show()");
  expect(windowErrors(odd), "a countdown that is no frame and a row that is no frame: skipped").toBe("none");
});

// TEST-ONLY icon picker popup (IconSelectorPopupFrameTemplate): the frame with its header box and parts.
const PICKER_ENV = `${TOWN_READERS}${SCROLL_ENV}${ARROWS_ENV}
  function __picker(name)
    local f = __window(name) f.BG = f:CreateTexture()
    local box = CreateFrame("Frame", nil, f) f.BorderBox = box
    box.NineSlice = CreateFrame("Frame", nil, box) box.NineSlice:CreateTexture()
    box.SelectedIconArea = CreateFrame("Frame", nil, box)
    box.SelectedIconArea.SelectedIconButton = __tile(box.SelectedIconArea)
    box.SelectedIconArea.SelectedIconText = CreateFrame("Frame", nil, box.SelectedIconArea)
    box.SelectedIconArea.SelectedIconText.SelectedIconHeader = __text(box.SelectedIconArea.SelectedIconText, "Current icon")
    box.IconTypeDropdown = CreateFrame("Button", nil, box) box.IconTypeDropdown.Arrow = __art(box.IconTypeDropdown)
    f.IconSelector = CreateFrame("Frame", nil, f) f.IconSelector.ScrollBox = __box({ __tile(f.IconSelector) }) f.IconSelector.ScrollBar = __scrollBar(f.IconSelector)
    box.IconSelectorEditBox = CreateFrame("EditBox", nil, box) box.IconSelectorEditBox:CreateTexture()
    box.OkayButton, box.CancelButton = CreateFrame("Button", nil, box), CreateFrame("Button", nil, box)
    return f
  end
`;

// TEST-ONLY macro window and stopwatch.
const MACRO_ENV = `${PICKER_ENV}
  local mf = __window("MacroFrame")
  CREATE_MACROS = "Create macros"
  mf.heading, mf.other = __text(mf, CREATE_MACROS), __text(mf, "Enter Macro Name:")
  mf:CreateFontString("MacroFrameSelectedMacroName", "ARTWORK"):SetFont("TEST-ONLY-GAME", 14, "")
  mf.SelectedMacroButton = __tile(mf)
  mf.MacroSelector = CreateFrame("Frame", nil, mf) mf.MacroSelector.ScrollBox = __box({ __tile(mf.MacroSelector) }) mf.MacroSelector.ScrollBar = __scrollBar(mf.MacroSelector)
  local back = __well("MacroFrameTextBackground", mf)
  local scrolling = CreateFrame("ScrollFrame", "MacroFrameScrollFrame", mf) scrolling.ScrollBar = __scrollBar(scrolling)
  CreateFrame("EditBox", "MacroFrameText", scrolling):SetFont("TEST-ONLY-GAME", 12, "")
  __picker("MacroPopupFrame") __picker("GuildBankPopupFrame") __picker("GearManagerPopupFrame")
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
  expect(addon.eval(`return { __lit(MacroFrame.heading, "heading", "text"), __themed(MacroFrame.other), __lit(MacroFrameSelectedMacroName, "heading", "text") }`), "the Create macros heading and the selected macro's name in the heading text and the text colour; the other captions left alone").toEqual([true, false, true]);
  expect(addon.eval(`return { __tiled(MacroFrame.SelectedMacroButton), __tiled(MacroFrame.MacroSelector.ScrollBox.rows[1]) }`), "the selected macro and the grid's tile: quiet slots, icon and selected mark kept").toEqual([true, true]);
  expect(addon.eval(`local f = MacroFrame return { __faded(MacroFrameTextBackground), MacroFrameTextBackground.NineSlice:GetAlpha(), __sunk(MacroFrameTextBackground), MacroFrameText:GetFont() ~= "TEST-ONLY-GAME" }`), "the text field: backdrop faded under a flat inset, the text in the theme font").toEqual([true, 0, true, true]);
  expect(addon.eval(`return { MacroFrame.MacroSelector.ScrollBar.Track:GetRegions():GetAlpha(), MacroFrameScrollFrame.ScrollBar.Track:GetRegions():GetAlpha() }`), "both scroll bars dressed with the window").toEqual([0, 0]);
  for (const n of ["MacroPopupFrame", "GuildBankPopupFrame", "GearManagerPopupFrame"]) {
    expect(addon.eval(`local b = ${n}.BorderBox return { ${n}.BG:GetAlpha(), b.NineSlice:GetAlpha(), select('#', b.SelectedIconArea:GetRegions()) > 0, select('#', b.IconSelectorEditBox:GetRegions()) > 1, select('#', b.OkayButton:GetRegions()) > 0, select('#', b.CancelButton:GetRegions()) > 0 }`), `${n}: BG and border faded, icon area inset, name box and buttons themed`).toEqual([0, 0, true, true, true, true]);
    expect(addon.eval(`local b, f = ${n}.BorderBox, ${n} return { __tiled(b.SelectedIconArea.SelectedIconButton), __lit(b.SelectedIconArea.SelectedIconText.SelectedIconHeader, "small", "text"), select('#', b.IconTypeDropdown:GetRegions()) > 1, b.IconTypeDropdown.Arrow:GetAlpha(), __tiled(f.IconSelector.ScrollBox.rows[1]), f.IconSelector.ScrollBar.Track:GetRegions():GetAlpha() }`), `${n}: the selected icon a quiet slot, its heading in the text colour, the type dropdown flat with its arrow, the grid's tiles quiet slots, the scroll bar dressed`).toEqual([true, true, true, 0, true, 0]);
  }
  expect(alphas(addon, "StopwatchTabFrame.art", "StopwatchPlayPauseButton.up", "StopwatchResetButton.off"), "the title tab's art faded, the play and reset pictures kept").toEqual([0, 1, 1]);
  expect(dressed(addon, "StopwatchCloseButton", "StopwatchPlayPauseButton", "StopwatchResetButton"), "its three buttons themed").toEqual([true, true, true]);
  expect(addon.eval("return StopwatchTitle:GetFont() ~= nil and StopwatchTitle.__textColor[1] == (ns.Theme.RGB('text'))"), "the title in the theme font and the text colour").toBe(true);
  const painted = windowState(addon, "StopwatchFrame").painted;
  addon.eval("for _, n in ipairs({ 'MacroFrame', 'MacroPopupFrame', 'StopwatchFrame' }) do _G[n]:Hide() _G[n]:Show() end");
  expect(windowState(addon, "StopwatchFrame").painted, "showing them again paints nothing more").toBe(painted);
});

it("R2.23 the macro window: a tile's accent edge follows the mouse; tiles the grid hands out later are dressed", () => {
  const addon = loggedIn(MACRO_ENV);
  addon.fire("ADDON_LOADED", "Blizzard_MacroUI");
  addon.eval("MacroFrame:Show()");
  const tile = "MacroFrame.SelectedMacroButton";
  expect(addon.eval(`return __quiet(${tile})`), "at rest the edge is hidden").toBe(4);
  addon.hover(tile);
  expect(addon.eval(`return __quiet(${tile})`), "under the mouse it shows").toBe(0);
  addon.hover(null);
  addon.eval(`__wfgStub.runScript(${tile}, "OnMouseDown")`);
  expect(addon.eval(`return __quiet(${tile})`), "held, it shows").toBe(0);
  addon.eval(`__wfgStub.runScript(${tile}, "OnMouseUp")`);
  expect(addon.eval(`return __quiet(${tile})`), "let go away from it, hidden again").toBe(4);
  addon.eval(`local box = MacroFrame.MacroSelector.ScrollBox box.new = __tile(UIParent) box.callbacks[1](box.new) box.callbacks[1](box.new) box.callbacks[1](nil)`);
  expect(addon.eval("return __tiled(MacroFrame.MacroSelector.ScrollBox.new)"), "a tile acquired later (and again): dressed once").toBe(true);
});

it("S2.6 macro, icon pickers, stopwatch, recipe inspection: group off leaves them the game's; bare windows load cleanly", () => {
  const off = loggedIn(MACRO_ENV, { savedVariables: OFF });
  for (const part of ["Blizzard_MacroUI", "Blizzard_TimeManager"]) off.fire("ADDON_LOADED", part);
  off.eval("MacroPopupFrame:Show() StopwatchFrame:Show() GearManagerPopupFrame:Show()");
  expect(["MacroPopupFrame", "StopwatchFrame", "GearManagerPopupFrame"].map((n) => windowState(off, n).art !== 0), "art left").toEqual([true, true, true]);
  const bare = loggedIn('for _, n in ipairs({ "MacroPopupFrame", "GuildBankPopupFrame", "GearManagerPopupFrame", "StopwatchFrame" }) do CreateFrame("Frame", n, UIParent):Hide() end');
  for (const part of ["Blizzard_MacroUI", "Blizzard_GuildBankUI", "Blizzard_TimeManager"]) bare.fire("ADDON_LOADED", part);
  bare.eval("MacroPopupFrame:Show() StopwatchFrame:Show() GearManagerPopupFrame:Show()");
  const plain = loggedIn(`${PICKER_ENV} __picker("MacroPopupFrame").BorderBox.IconSelectorEditBox = {} MacroPopupFrame.BorderBox.SelectedIconArea.SelectedIconButton = {}`);
  plain.fire("ADDON_LOADED", "Blizzard_MacroUI");
  plain.eval("MacroPopupFrame:Show()");
  expect([bare, plain].map(windowErrors), "windows without their parts, or a box that isn't one: no error").toEqual(["none", "none"]);
  expect(plain.eval("return ns.FrameState('vgWindow')[MacroPopupFrame]"), "the plain popup is still skinned").toBe(true);
});

// TEST-ONLY small dialogs: the ghost button, the message dialog, the addon dialog (a full-screen frame holding
// the dialog) and the currency transfer window.
const DIALOGS_ENV = `${TOWN_READERS}
  local g = CreateFrame("Button", "GhostFrame", UIParent) g:CreateTexture() g:Hide()
  CreateFrame("Frame", "GhostFrameContentsFrame", g):CreateFontString("GhostFrameContentsFrameText", "ARTWORK")
  local b = __window("BasicMessageDialog") b.Border = CreateFrame("Frame", nil, b) b.Border:CreateTexture()
  local a = CreateFrame("Frame", "AddonDialog", UIParent) a:Hide()
  local box = CreateFrame("Frame", "AddonDialogBackground", a) box:CreateTexture("AddonDialogBackgroundBg") box:CreateFontString("AddonDialogText", "ARTWORK")
  CreateFrame("Button", "AddonDialogButton1", box) CreateFrame("Button", "AddonDialogButton2", box)
  local c = __window("CurrencyTransferMenu") c.Content = CreateFrame("Frame", nil, c)
  c.Content.ConfirmButton, c.Content.CancelButton = CreateFrame("Button", nil, c.Content), CreateFrame("Button", nil, c.Content)
  local content = c.Content
  for _, key in ipairs({ "SourceSelector", "AmountSelector", "SourceBalancePreview", "PlayerBalancePreview" }) do content[key] = CreateFrame("Frame", nil, content) end
  content.SourceSelector.SourceLabel, content.SourceSelector.PlayerName = __text(content.SourceSelector, "Source"), __text(content.SourceSelector, "Bob")
  content.SourceSelector.Dropdown = CreateFrame("Button", nil, content.SourceSelector) content.SourceSelector.Dropdown.Arrow = __art(content.SourceSelector.Dropdown)
  content.AmountSelector.TransferAmountLabel = __text(content.AmountSelector, "Amount")
  content.AmountSelector.InputBox = CreateFrame("EditBox", nil, content.AmountSelector) __art(content.AmountSelector.InputBox)
  content.AmountSelector.MaxQuantityButton = CreateFrame("Button", nil, content.AmountSelector)
  content.TransactionDivider = __art(content)
  content.SourceBalancePreview.Label, content.PlayerBalancePreview.Label = __text(content.SourceBalancePreview, "Bob after"), __text(content.PlayerBalancePreview, "You after")
`;

it("S2.7 small dialogs: ghost button, message dialog, addon dialog and currency transfer take the theme", () => {
  const addon = loggedIn(DIALOGS_ENV);
  addon.eval("GhostFrame:Show() BasicMessageDialog:Show() AddonDialog:Show() CurrencyTransferMenu:Show()");
  expect(addon.eval("return select('#', GhostFrame:GetRegions()) > 1"), "the ghost button is a theme button (its own texture and the theme's)").toBe(true);
  expect(addon.eval("return { __lit(GhostFrameContentsFrameText, 'label', 'text'), __lit(AddonDialogText, 'label', 'text') }"), "the ghost button's text and the addon dialog's message in the label font and the text colour (not gold)").toEqual([true, true]);
  const message = windowState(addon, "BasicMessageDialog");
  expect(message, "the message dialog: art faded, panel").toMatchObject({ art: 0, panel: true });
  expect(alphas(addon, "BasicMessageDialog.Border"), "its Border faded").toEqual([0]);
  expect(dressed(addon, "BasicMessageDialogButton1", "BasicMessageDialogButton2"), "its button row themed").toEqual([true, true]);
  expect(alphas(addon, "AddonDialogBackgroundBg"), "the addon dialog's art faded").toEqual([0]);
  expect(addon.eval("local n = 0 for _, r in ipairs({ AddonDialogBackground:GetRegions() }) do if r.__alpha ~= 0 then n = n + 1 end end return { n > 0, ns.FrameState('vgWindow')[AddonDialog], select('#', AddonDialog:GetRegions()) }"), "its panel sits on the dialog, not on the full-screen catcher").toEqual([true, true, 0]);
  expect(dressed(addon, "AddonDialogButton1", "AddonDialogButton2", "CurrencyTransferMenu.Content.ConfirmButton", "CurrencyTransferMenu.Content.CancelButton"), "the addon dialog's and the transfer window's buttons themed").toEqual([true, true, true, true]);
  expect(windowState(addon, "CurrencyTransferMenu"), "the transfer window skin").toMatchObject({ art: 0, panel: true });
  expect(addon.eval(`local c = CurrencyTransferMenu.Content return { select('#', c.SourceSelector.Dropdown:GetRegions()) > 1, c.SourceSelector.Dropdown.Arrow:GetAlpha(), __faded(c.AmountSelector.InputBox), select('#', c.AmountSelector.MaxQuantityButton:GetRegions()) > 0 }`), "the source dropdown flat with its arrow, the amount box an edit box, the Max button themed").toEqual([true, 0, true, true]);
  expect(addon.eval(`local c = CurrencyTransferMenu.Content return { __lit(c.SourceSelector.SourceLabel, "label", "text"), __lit(c.AmountSelector.TransferAmountLabel, "label", "text"), __lit(c.SourceBalancePreview.Label, "label", "text"), __lit(c.PlayerBalancePreview.Label, "label", "text"), __themed(c.SourceSelector.PlayerName) }`), "the form's four labels in the text colour; the character name left to the game").toEqual([true, true, true, true, false]);
  expect(addon.eval("local d = CurrencyTransferMenu.Content.TransactionDivider return { d:GetAlpha(), ns.Theme.DividerParts(d) ~= nil }"), "the rule above the transaction faded under one pixel of divider").toEqual([0, true]);
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

// TEST-ONLY merchant window inside (Blizzard_UIPanels_Game MerchantFrame.xml, on WINDOWS_ENV's MerchantFrame): twelve
// rows and the buyback slot (a slot plate, a named name plate, the name, an item button, a money line, a token price),
// the repair and sell-junk tiles, the page arrows with their captions, the page count, the money line, its plates and
// insets, the filter button, and the game's call that fills a page.
const MERCHANT_ENV = `${TOWN_READERS}${ARROWS_ENV}
  function __money(name, parent)
    local m = CreateFrame("Frame", name, parent)
    for _, key in ipairs({ "GoldButton", "SilverButton", "CopperButton" }) do
      local b = CreateFrame("Button", name .. key, m) b.Text = b:CreateFontString(name .. key .. "Text", "ARTWORK") b.coin = b:CreateTexture() m[key] = b
    end
    return m
  end
  function __merchantRow(name)
    local row = CreateFrame("Frame", name, MerchantFrame)
    row.SlotTexture = row:CreateTexture(name .. "SlotTexture", "BACKGROUND") row:CreateTexture(name .. "NameFrame", "BACKGROUND")
    row.Name = row:CreateFontString(name .. "Name", "BACKGROUND")
    row.ItemButton = CreateFrame("Button", name .. "ItemButton", row) row.ItemButton.icon = row.ItemButton:CreateTexture() row.ItemButton.IconBorder = row.ItemButton:CreateTexture()
    __money(name .. "MoneyFrame", row)
    local alt = CreateFrame("Frame", name .. "AltCurrencyFrame", row)
    for i = 1, 3 do CreateFrame("Button", name .. "AltCurrencyFrameItem" .. i, alt).Text = alt:CreateFontString(nil, "ARTWORK") end
    return row
  end
  for i = 1, 12 do __merchantRow("MerchantItem" .. i) end
  __merchantRow("MerchantBuyBackItem")
  for _, n in ipairs({ "MerchantRepairItemButton", "MerchantRepairAllButton", "MerchantGuildBankRepairButton", "MerchantSellAllJunkButton" }) do
    local b = CreateFrame("Button", n, MerchantFrame) b:CreateTexture(nil, "BACKGROUND"):SetTexture("TEST-ONLY-ART") b.Icon = b:CreateTexture(nil, "BORDER")
  end
  for _, n in ipairs({ "MerchantPrevPageButton", "MerchantNextPageButton" }) do __arrow(MerchantFrame, n):CreateFontString(nil, "BACKGROUND") end
  MerchantFrame:CreateFontString("MerchantPageText", "BORDER")
  __money("MerchantMoneyFrame", MerchantFrame)
  for _, n in ipairs({ "MerchantMoneyBg", "MerchantExtraCurrencyBg" }) do CreateFrame("Frame", n, MerchantFrame):CreateTexture() end
  for _, n in ipairs({ "MerchantMoneyInset", "MerchantExtraCurrencyInset" }) do CreateFrame("Frame", n, MerchantFrame).NineSlice = CreateFrame("Frame", nil, MerchantFrame) end
  MerchantFrame.FilterDropdown = CreateFrame("Button", nil, MerchantFrame)
  function MerchantFrame_UpdateMerchantInfo() end
`;

// One merchant row's look, by name: its plates' alphas, its item button in the bags' item look, its name and
// price figures in the theme font.
const merchantRow = (addon, name) => addon.eval(`local row, money = ${name}, ${name}MoneyFrame
  return { row.SlotTexture:GetAlpha(), ${name}NameFrame:GetAlpha(), ns.FrameState("vgSkinned")[row.ItemButton] == true, row.Name:GetFont() ~= nil,
    money.GoldButton.Text:GetFont() ~= nil, money.CopperButton.Text:GetFont() ~= nil, money.GoldButton.coin:GetAlpha(), ${name}AltCurrencyFrameItem1.Text:GetFont() ~= nil }`);

// The alpha of a tile's TEST-ONLY-ART plate (its own texture, faded by the theme button), or -1 without one.
const plateAlpha = (addon, name) => addon.eval(`for _, r in ipairs({ ${name}:GetRegions() }) do if r.__texture == "TEST-ONLY-ART" then return r:GetAlpha() end end return -1`);

it("R1.3 the merchant: rows, buyback slot, repair tiles, page arrows and money lines take the theme, and keep it as pages turn", () => {
  const addon = loggedIn(MERCHANT_ENV);
  addon.eval("MerchantFrame:Show()");
  expect(windowState(addon, "MerchantFrame"), "the window skin (the windows group's)").toMatchObject({ art: 0, panel: true });
  const row = [0, 0, true, true, true, true, 1, true];
  expect([merchantRow(addon, "MerchantItem1"), merchantRow(addon, "MerchantItem12"), merchantRow(addon, "MerchantBuyBackItem")], "first and last rows and the buyback slot: plates faded, slot in the bags' look, name and prices in the theme font, coin kept").toEqual([row, row, row]);
  expect(addon.eval("return { ns.Theme.HoverParts(MerchantRepairAllButton) ~= nil, ns.Theme.HoverParts(MerchantSellAllJunkButton) ~= nil, MerchantRepairAllButton.Icon:GetAlpha(), MerchantGuildBankRepairButton.Icon:GetAlpha(), ns.Theme.HoverParts(MerchantFrame.FilterDropdown) ~= nil }"), "the tiles and the filter button are theme buttons, the tiles keep their icon").toEqual([true, true, 1, 1, true]);
  expect([plateAlpha(addon, "MerchantRepairItemButton"), plateAlpha(addon, "MerchantSellAllJunkButton")], "the tiles' slot plates faded").toEqual([0, 0]);
  expect(alphas(addon, "MerchantPrevPageButton.up", "MerchantNextPageButton.off", "MerchantMoneyBg", "MerchantExtraCurrencyBg", "MerchantMoneyInset.NineSlice"), "the page arrows kept; the money plates and the insets' art faded").toEqual([0, 0, 0, 0, 0]);
  expect(addon.eval("local fs for _, r in ipairs({ MerchantPrevPageButton:GetRegions() }) do if r:GetObjectType() == 'FontString' then fs = r end end return { __lit(fs, 'label', 'text'), __lit(MerchantPageText, 'label', 'text'), MerchantMoneyFrame.SilverButton.Text:GetFont() ~= nil }"), "the arrow's caption and the page count in the label font and the text colour (not gold), the money line in the theme font").toEqual([true, true, true]);
  expect(dressed(addon, "MerchantPrevPageButton", "MerchantMoneyInset", "MerchantExtraCurrencyInset"), "the arrows are theme buttons; dark panels under the money and token lines").toEqual([true, true, true]);
  addon.eval("MerchantItem3.SlotTexture:SetAlpha(1) MerchantFrame_UpdateMerchantInfo()");
  expect(alphas(addon, "MerchantItem3.SlotTexture"), "a page turn runs the pass again").toEqual([0]);
  const painted = windowState(addon, "MerchantFrame").painted;
  addon.eval("MerchantFrame:Hide() MerchantFrame:Show() MerchantFrame_UpdateMerchantInfo()");
  expect(windowState(addon, "MerchantFrame").painted, "showing and paging again paints nothing more").toBe(painted);
});

it("R1.3 the merchant: the town group off leaves its inside the game's (the window stays the windows group's); a merchant without the sell-junk button, the guild repair button or the page call loads cleanly", () => {
  const off = loggedIn(MERCHANT_ENV, { savedVariables: OFF });
  off.eval("MerchantFrame:Show() MerchantFrame_UpdateMerchantInfo()");
  expect([windowState(off, "MerchantFrame").panel, merchantRow(off, "MerchantItem1"), plateAlpha(off, "MerchantRepairAllButton"), off.eval("return ns.FrameState('vgMerchant')[MerchantFrame] == nil")], "window skinned; rows and tiles untouched; not hooked").toEqual([true, [1, 1, false, false, false, false, 1, false], 1, true]);
  const lean = loggedIn(`${MERCHANT_ENV} MerchantSellAllJunkButton = nil MerchantGuildBankRepairButton = nil MerchantFrame_UpdateMerchantInfo = nil`);
  lean.eval("MerchantFrame:Show()");
  expect([merchantRow(lean, "MerchantItem1")[0], plateAlpha(lean, "MerchantRepairAllButton"), windowErrors(lean)], "without those parts: the rest is done, no error").toEqual([0, 0, "none"]);
  const bare = loggedIn(WINDOWS_ENV);
  bare.eval("MerchantFrame:Show()");
  expect([bare.eval("return ns.FrameState('vgMerchant')[MerchantFrame]"), windowErrors(bare)], "a merchant window with none of its parts: watched, no error").toEqual([true, "none"]);
  const noWindows = loggedIn(MERCHANT_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Windows = false } } }" });
  noWindows.eval("MerchantFrame:Show()");
  expect([merchantRow(noWindows, "MerchantItem1")[0], windowErrors(noWindows)], "the Windows module off: nothing, no error").toEqual([1, "none"]);
});

// TEST-ONLY: the auction house's multisell progress frame (parchment, end caps, a casting-bar-shaped progress bar with an icon and text, a cancel button).
const MULTISELL_ENV = `${TOWN_READERS}
  local f = __window("AuctionHouseMultisellProgressFrame")
  f.Left, f.Right = f:CreateTexture(), f:CreateTexture()
  local bar = CreateFrame("StatusBar", nil, f) bar:SetStatusBarTexture("TEST-ONLY-ART") bar.Background = bar:CreateTexture() bar.Border = bar:CreateTexture()
  bar.Icon = bar:CreateTexture() bar.Text = __text(bar, "Creating 0/5") f.ProgressBar = bar
  f.CancelButton = CreateFrame("Button", nil, f) f.CancelButton:SetNormalTexture("TEST-ONLY-ART")
`;

it("R3.4b the auction house multisell progress: flat panel and track, icon and cancel cross kept, text in the label font", () => {
  const addon = loggedIn(MULTISELL_ENV);
  addon.fire("ADDON_LOADED", "Blizzard_AuctionHouseUI");
  addon.eval("AuctionHouseMultisellProgressFrame:Show()");
  expect(addon.eval(`local f = AuctionHouseMultisellProgressFrame local bar = f.ProgressBar
    return { __faded(f), f.Left:GetAlpha(), __faded(bar), bar.Icon:GetAlpha(), __lit(bar.Text, "label", "text"), bar.__barTexture ~= nil, select("#", f.CancelButton:GetRegions()) > 0 }`),
    "frame and end caps faded, the bar a flat track, the icon shown, the text lit, the cancel cross on a tile").toEqual([true, 0, true, 1, true, true, true]);
  const painted = windowState(addon, "AuctionHouseMultisellProgressFrame").painted;
  addon.eval("AuctionHouseMultisellProgressFrame:Hide() AuctionHouseMultisellProgressFrame:Show()");
  expect(windowState(addon, "AuctionHouseMultisellProgressFrame").painted, "showing it again paints nothing more").toBe(painted);
});

it("R3.4b the auction house multisell progress: group off leaves it the game's; a frame without its parts loads cleanly", () => {
  const off = loggedIn(MULTISELL_ENV, { savedVariables: OFF });
  off.fire("ADDON_LOADED", "Blizzard_AuctionHouseUI");
  off.eval("AuctionHouseMultisellProgressFrame:Show()");
  expect(windowState(off, "AuctionHouseMultisellProgressFrame").art !== 0, "art left").toBe(true);
  const bare = loggedIn('CreateFrame("Frame", "AuctionHouseMultisellProgressFrame", UIParent):Hide()');
  bare.fire("ADDON_LOADED", "Blizzard_AuctionHouseUI");
  bare.eval("AuctionHouseMultisellProgressFrame:Show()");
  const plain = loggedIn(`${MULTISELL_ENV} AuctionHouseMultisellProgressFrame.ProgressBar.Icon = {}`);
  plain.fire("ADDON_LOADED", "Blizzard_AuctionHouseUI");
  plain.eval("AuctionHouseMultisellProgressFrame:Show()");
  expect([windowErrors(bare), windowErrors(plain)], "a frame with no bar, a bar whose icon is not a texture: no error").toEqual(["none", "none"]);
});
