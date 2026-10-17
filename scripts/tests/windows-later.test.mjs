// The game windows that load with their own part of the game (spellbook and talents, professions, inspect, guild
// bank, collections, achievements): the real Vanguard Lua in the TEST-ONLY headless client, each window a model of
// the Blizzard XML (Camelot over Mainline) with the parts its skin reaches.

import { expect, it } from "vitest";
import { INSIDES_LUA, loggedIn, WINDOWS_ENV, windowState } from "./helpers.mjs";

// TEST-ONLY readers shared by the models below: __button(b) whether the theme painted a flat button on b, __arrow(b)
// whether it is a theme arrow button, __plate(b) whether a control tile was put behind a button that has no art of
// its own, __box(b) whether an edit box lost its art and kept its magnifier, __lit(fs, role, token) whether a font
// string takes the role and the colour.
const READERS_ENV = `${WINDOWS_ENV}${INSIDES_LUA}
  function __button(b) return ns.Theme.HoverParts(b) ~= nil end
  function __arrow(b) return ns.Theme.ArrowParts(b) ~= nil end
  function __plate(b) return select("#", b:GetRegions()) > 0 end
  function __box(b) return __faded(b, b.searchIcon) and b.searchIcon.__alpha == 1 end
  function __lit(fs, role, token) return __looks(fs, role, token) end
  function __mkbutton(parent, art) local b = CreateFrame("Button", nil, parent) if art then b[art] = __art(b) end return b end
  function __mkbox(parent) local b = CreateFrame("EditBox", nil, parent) __art(b) b.searchIcon = __art(b) return b end
  function __mkcheck(parent)
    local b = CreateFrame("CheckButton", nil, parent) __art(b) b.Text = __text(b, "label")
    return b
  end
  -- A ScrollBox as the game keeps it: its rows, ForEachFrame, and the acquire callbacks ScrollUtil registers.
  ScrollUtil = { AddAcquiredFrameCallback = function(box, cb, owner) table.insert(box.callbacks, function(row) cb(owner, row) end) end }
  function __list(parent)
    local box = CreateFrame("Frame", nil, parent)
    box.rows, box.callbacks = {}, {}
    function box:ForEachFrame(fn) for _, row in ipairs(self.rows) do fn(row) end end
    function box:Acquire(row) table.insert(self.rows, row) for _, cb in ipairs(self.callbacks) do cb(row) end return row end
    return box
  end
  function __mkpaging(parent)
    local p = CreateFrame("Frame", nil, parent)
    p.PrevPageButton, p.NextPageButton, p.PageText = __mkbutton(p, "Normal"), __mkbutton(p, "Normal"), __text(p, "1 / 3")
    return p
  end
`;

// TEST-ONLY spellbook and talents (Camelot Blizzard_PlayerSpellsFrame.xml, SpellBook/Blizzard_SpellBookFrame.xml,
// ClassTalents/Blizzard_ClassTalentsFrame.xml): the window, the book with its parchment, page area, search box,
// settings dropdown and paging controls, and the talent tree with its backdrop, effects and controls.
const SPELLS_ENV = `${READERS_ENV}
  local f = __window("PlayerSpellsFrame")
  local book = CreateFrame("Frame", nil, f) f.SpellBookFrame = book
  for _, key in ipairs({ "TopBar", "BookBGLeft", "BookBGRight", "Bookmark" }) do book[key] = __art(book) end
  book.PagedSpellsFrame = __well(nil, book) book.PagedSpellsFrame.PagingControls = __mkpaging(book.PagedSpellsFrame)
  book.SearchBox, book.SettingsDropdown = __mkbox(book), __mkbutton(book, "Icon")
  local t = CreateFrame("Frame", nil, f) f.TalentsFrame = t
  for _, key in ipairs({ "Background", "ClassBackground", "BackgroundBorder", "DividerHorizontalLeft", "OverlayBackgroundMid" }) do t[key] = __art(t) end
  for _, key in ipairs(ns.GetModule("Windows").TALENT_FX) do t[key] = __art(t) end
  for _, key in ipairs({ "ApplyButton", "InspectCopyButton", "ResetButton", "UndoButton" }) do t[key] = __mkbutton(t) end
  t.ActiveSpec = CreateFrame("Frame", nil, t) t.ActiveSpec.ActivateButton = __mkbutton(t.ActiveSpec)
  t.SearchBox, t.SearchOptionsDropdown = __mkbox(t), __mkbutton(t, "Arrow")
  t.LoadSystem = CreateFrame("Frame", nil, t) t.LoadSystem.Dropdown = __mkbutton(t.LoadSystem, "Arrow")
  t.ClassCurrencyDisplay = CreateFrame("Frame", nil, t) t.ClassCurrencyDisplay.Border = __art(t.ClassCurrencyDisplay)
  -- TEST-ONLY reader of the spellbook and talents (see spellsState).
  function __spellsState()
    local fx = 0
    for _, key in ipairs(ns.GetModule("Windows").TALENT_FX) do if t[key]:GetAlpha() == 1 then fx = fx + 1 end end
    local backdrop = 0
    for _, key in ipairs({ "Background", "ClassBackground", "BackgroundBorder", "DividerHorizontalLeft", "OverlayBackgroundMid" }) do if t[key].__alpha == 0 then backdrop = backdrop + 1 end end
    local paged, paging = book.PagedSpellsFrame, book.PagedSpellsFrame.PagingControls
    return { parchment = __faded(book), paged = __faded(paged) and paged.NineSlice.__alpha == 0 and __sunk(paged), search = __box(book.SearchBox),
      settings = __button(book.SettingsDropdown) and book.SettingsDropdown.Icon.__alpha == 1, arrows = __arrow(paging.PrevPageButton) and __arrow(paging.NextPageButton),
      count = __lit(paging.PageText, "small", "text2"), fx = fx, backdrop = backdrop, tree = __sunk(t),
      buttons = __button(t.ApplyButton) and __button(t.InspectCopyButton) and __button(t.ActiveSpec.ActivateButton),
      icons = __plate(t.ResetButton) and __plate(t.UndoButton), talentSearch = __box(t.SearchBox),
      dropdowns = __button(t.SearchOptionsDropdown) and t.SearchOptionsDropdown.Arrow.__alpha == 1 and __button(t.LoadSystem.Dropdown) and t.LoadSystem.Dropdown.Arrow.__alpha == 1,
      currency = t.ClassCurrencyDisplay.Border.__alpha, painted = ns.Theme.PaintedCount(), errors = #ns.errors }
  end
`;
// The spellbook and talents' parts as the skin leaves them (see __spellsState).
const spellsState = (addon) => addon.eval("return __spellsState()");
it("R2.14 the spellbook and the talents: parchment faded to an inset, controls and arrows in the theme, the tree's effects kept", () => {
  const addon = loggedIn(SPELLS_ENV);
  addon.fire("ADDON_LOADED", "Blizzard_PlayerSpells");
  addon.eval("PlayerSpellsFrame:Show()");
  const first = spellsState(addon);
  expect(first, "book art faded, pages an inset, search box with its magnifier, settings picture kept, arrows and count themed").toMatchObject({
    parchment: true, paged: true, search: true, settings: true, arrows: true, count: true, errors: 0,
  });
  expect(first, "the tree's backdrop faded and sunk with its effects kept, five controls, the search box, two dropdowns with arrows, the currency plate faded").toMatchObject({
    fx: 10, backdrop: 5, tree: true, buttons: true, icons: true, talentSearch: true, dropdowns: true, currency: 0,
  });
  expect(windowState(addon, "PlayerSpellsFrame"), "and the window skin as ever").toMatchObject({ art: 0, panel: true, title: true });
  addon.eval("PlayerSpellsFrame:Hide() PlayerSpellsFrame:Show()");
  expect(spellsState(addon).painted, "a second show paints nothing new").toBe(first.painted);
});
it("R2.14 the spellbook and the talents: the windows group off leaves them the game's; a bare or odd window loads cleanly", () => {
  const off = loggedIn(SPELLS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { windows = false } } }" });
  off.fire("ADDON_LOADED", "Blizzard_PlayerSpells");
  off.eval("PlayerSpellsFrame:Show()");
  expect(spellsState(off), "nothing faded or painted").toMatchObject({ parchment: false, paged: false, tree: false, buttons: false });
  const bare = loggedIn(`${WINDOWS_ENV}__window("PlayerSpellsFrame")`);
  bare.fire("ADDON_LOADED", "Blizzard_PlayerSpells");
  bare.eval("PlayerSpellsFrame:Show()");
  expect([windowState(bare, "PlayerSpellsFrame").panel, bare.eval("return #ns.errors")], "a bare window is skinned, no part missing is an error").toEqual([true, 0]);
  const odd = loggedIn(`${SPELLS_ENV} PlayerSpellsFrame.SpellBookFrame.PagedSpellsFrame = 1 PlayerSpellsFrame.SpellBookFrame.SearchBox = {} PlayerSpellsFrame.TalentsFrame.ClassCurrencyDisplay = 1
    PlayerSpellsFrame.TalentsFrame.LoadSystem = {} PlayerSpellsFrame.TalentsFrame.ActiveSpec = 1`);
  odd.fire("ADDON_LOADED", "Blizzard_PlayerSpells");
  odd.eval("PlayerSpellsFrame:Show()");
  expect(odd.eval("return #ns.errors"), "odd parts are skipped").toBe(0);
  const noTalents = loggedIn(`${SPELLS_ENV} PlayerSpellsFrame.TalentsFrame = {} PlayerSpellsFrame.SpellBookFrame = nil`);
  noTalents.fire("ADDON_LOADED", "Blizzard_PlayerSpells");
  noTalents.eval("PlayerSpellsFrame:Show()");
  expect(noTalents.eval("return #ns.errors"), "a window without a book or a talent tree is skinned without an error").toBe(0);
});

// TEST-ONLY professions (Camelot Blizzard_ProfessionsFrame.xml, Blizzard_ProfessionsCrafting.xml, the recipe list and
// the recipe schematic form templates): the crafting page with its list (rows are acquired later), form, rank bar,
// quantity box, buttons, link dropdown and eleven gear slots; __form is the shared form, __slot a reagent slot.
const PROF_ENV = `${READERS_ENV}
  function __slot(form)
    local slot = CreateFrame("Frame", nil, form) slot.Button = __itemButton(nil, slot) slot.Name = __text(slot, "Iron Bar")
    return slot
  end
  function __form(parent)
    local form = __well(nil, parent) form.MinimalBackground = __art(form)
    form.TrackRecipeCheckbox, form.AllocateBestQualityCheckbox = __mkcheck(form), __mkcheck(form)
    form.RecipeLevelDropdown, form.OutputSubText = __mkbutton(form, "Arrow"), __text(form, "Makes")
    form.RecipeSourceButton = CreateFrame("Button", nil, form) form.RecipeSourceButton.Text = __text(form.RecipeSourceButton, "Locked")
    form.FirstCraftBonus = CreateFrame("Frame", nil, form) form.FirstCraftBonus.Text = __text(form.FirstCraftBonus, "First")
    form.reagentSlots = { [1] = { __slot(form) } }
    function form:Init() table.insert(self.reagentSlots[1], __slot(self)) end
    return form
  end
  -- A recipe row as the game acquires it (SetSelected shows the selected overlay), or a category row (none).
  function __recipeRow(box, category)
    local row = CreateFrame("Button", nil, box) row.Label = __text(row, "Mining")
    if not category then
      row.SelectedOverlay, row.HighlightOverlay = __art(row), __art(row) row.SelectedOverlay:Hide()
      function row:SetSelected(selected) self.SelectedOverlay:SetShown(selected) self.HighlightOverlay:SetShown(not selected) end
    end
    return box:Acquire(row)
  end
  local f = __window("ProfessionsFrame")
  local page = CreateFrame("Frame", nil, f) f.CraftingPage = page __art(page)
  local list = __well(nil, page) page.RecipeList = list
  list.BackgroundNineSlice = CreateFrame("Frame", nil, list) list.BackgroundNineSlice:CreateTexture(nil, "BORDER")
  list.FilterDropdown, list.SearchBox, list.NoResultsText, list.ScrollBox = __mkbutton(list, "Arrow"), __mkbox(list), __text(list, "None"), __list(list)
  __recipe, __category = __recipeRow(list.ScrollBox), __recipeRow(list.ScrollBox, true)
  page.SchematicForm = __form(page)
  page.RankBar = CreateFrame("Frame", nil, page) page.RankBar.Fill, page.RankBar.Border = __art(page.RankBar), __art(page.RankBar)
  page.CreateMultipleInputBox, page.MinimizedSearchBox, page.LinkButton = __mkbox(page), __mkbox(page), __mkbutton(page, "Icon")
  for _, key in ipairs(ns.GetModule("Windows").PROF_BUTTONS) do page[key] = __mkbutton(page) end
  for _, key in ipairs(ns.GetModule("Windows").PROF_SLOTS) do page[key] = __itemButton(nil, page) end
  page.GearSlotDivider = CreateFrame("Frame", nil, page) __art(page.GearSlotDivider)
  -- TEST-ONLY reader of the recipe form (see formState): its parts as the skin leaves them.
  function __formState(form)
    local slots = 0
    for _, slot in ipairs(form.reagentSlots[1]) do
      if slot.Button.icon.__texCoord ~= nil and __themed(slot.Name) then slots = slots + 1 end
    end
    return { inset = __faded(form) and form.NineSlice.__alpha == 0 and __sunk(form), slots = slots, level = __button(form.RecipeLevelDropdown),
      checks = ns.Theme.CheckParts(form.TrackRecipeCheckbox) ~= nil and ns.Theme.CheckParts(form.AllocateBestQualityCheckbox) ~= nil,
      label = __lit(form.TrackRecipeCheckbox.Text, "small", "text"), sub = __lit(form.OutputSubText, "label", "text"),
      source = __lit(form.RecipeSourceButton.Text, "label", "text"), bonus = __lit(form.FirstCraftBonus.Text, "label", "text") }
  end
  -- TEST-ONLY reader of the crafting page (see profState).
  function __profState()
    local gear = 0
    for _, key in ipairs(ns.GetModule("Windows").PROF_SLOTS) do if page[key].icon.__texCoord ~= nil then gear = gear + 1 end end
    local list = page.RecipeList
    return { page = __faded(page), list = __faded(list) and list.NineSlice.__alpha == 0 and list.BackgroundNineSlice:GetAlpha() == 0 and __sunk(list),
      filter = __button(list.FilterDropdown) and list.FilterDropdown.Arrow.__alpha == 1, search = __box(list.SearchBox), none = __lit(list.NoResultsText, "label", "text"),
      rank = __faded(page.RankBar, page.RankBar.Fill) and page.RankBar.Fill.__alpha ~= 0 and __sunk(page.RankBar), box = __faded(page.CreateMultipleInputBox),
      small = __box(page.MinimizedSearchBox), buttons = __button(page.ViewGuildCraftersButton) and __button(page.CreateButton) and __button(page.CreateAllButton),
      link = __button(page.LinkButton) and page.LinkButton.Icon.__alpha == 1, gear = gear, divider = __faded(page.GearSlotDivider),
      recipe = ns.Theme.RowParts(__recipe) ~= nil and __faded(__recipe), category = ns.Theme.RowParts(__category) == nil,
      form = __formState(page.SchematicForm), painted = ns.Theme.PaintedCount(), errors = #ns.errors }
  end
`;
// The crafting page's parts as the skin leaves them (see __profState).
const profState = (addon) => addon.eval("return __profState()");
it("R2.15 the professions window: list, form, rank bar, controls and gear slots in the theme", () => {
  const addon = loggedIn(PROF_ENV);
  addon.fire("ADDON_LOADED", "Blizzard_Professions");
  addon.eval("ProfessionsFrame:Show()");
  const first = profState(addon);
  expect(first, "the page's texture faded; the list a sunk well with its filter, search box and notice; the rank bar a track around its fill").toMatchObject({
    page: true, list: true, filter: true, search: true, none: true, rank: true, errors: 0,
  });
  expect(first, "the quantity box, the minimized search box, three buttons, the link picture, eleven gear slots and the divider").toMatchObject({
    box: true, small: true, buttons: true, link: true, gear: 11, divider: true,
  });
  expect(first, "a recipe row a theme row with its overlays faded; a category row left as the game draws it").toMatchObject({ recipe: true, category: true });
  expect(first.form, "the form: a sunk well, two check boxes with small labels, the level dropdown, three notes, the slot it held").toMatchObject({
    inset: true, checks: true, label: true, level: true, sub: true, source: true, bonus: true, slots: 1,
  });
  expect(windowState(addon, "ProfessionsFrame"), "and the window skin as ever").toMatchObject({ art: 0, panel: true, title: true });
  addon.eval("ProfessionsFrame:Hide() ProfessionsFrame:Show()");
  expect(profState(addon).painted, "a second show paints nothing new").toBe(first.painted);
});
it("R2.15 the professions window: reagent slots the form fills in when it shows a recipe, and the selected recipe", () => {
  const addon = loggedIn(PROF_ENV);
  addon.fire("ADDON_LOADED", "Blizzard_Professions");
  addon.eval("ProfessionsFrame:Show() local form = ProfessionsFrame.CraftingPage.SchematicForm form:Init() form:Init()");
  expect(addon.eval("return __formState(ProfessionsFrame.CraftingPage.SchematicForm).slots"), "three slots, each in the item look with its name in small text").toBe(3);
  addon.eval("ProfessionsFrame:Hide() ProfessionsFrame:Show() ProfessionsFrame.CraftingPage.SchematicForm:Init()");
  expect(addon.eval("return __formState(ProfessionsFrame.CraftingPage.SchematicForm).slots"), "the form is hooked once, a slot made later is skinned").toBe(4);
  // The first recipe row's selected fill and rail, as shown.
  const lit = () => addon.eval("return { ns.Theme.RowParts(__recipe).fill:IsShown(), ns.Theme.RowParts(__recipe).rail:IsShown() }");
  expect(lit(), "a row that is not selected shows no selected look").toEqual([false, false]);
  addon.eval("__recipe:SetSelected(true)");
  expect(lit(), "the game selects it: the one selected look").toEqual([true, true]);
  addon.eval("__recipe:SetSelected(nil)");
  expect(lit(), "the game deselects it (nil too)").toEqual([false, false]);
  expect(addon.eval(`local row = __recipeRow(ProfessionsFrame.CraftingPage.RecipeList.ScrollBox) row.SelectedOverlay:Show() local late = __recipeRow(ProfessionsFrame.CraftingPage.RecipeList.ScrollBox)
    late.SelectedOverlay:Show() ns.GetModule("Windows").SkinSchematicForm(nil) return { ns.Theme.RowParts(late) ~= nil, ns.Theme.RowParts(late).fill:IsShown() }`), "a row acquired later is a theme row, selected when the game had it selected").toEqual([true, false]);
});
it("R2.15 the inspect recipe window: the same form skin", () => {
  const addon = loggedIn(`${PROF_ENV}
    local inspect = __window("InspectRecipeFrame") inspect.SchematicForm = __form(inspect)`);
  addon.fire("ADDON_LOADED", "Blizzard_Professions");
  addon.eval("InspectRecipeFrame:Show() InspectRecipeFrame.SchematicForm:Init()");
  expect(addon.eval("return __formState(InspectRecipeFrame.SchematicForm)"), "the form a sunk well, its check boxes, notes, dropdown and both reagent slots themed").toMatchObject({
    inset: true, checks: true, label: true, level: true, sub: true, source: true, bonus: true, slots: 2,
  });
  expect(windowState(addon, "InspectRecipeFrame"), "and the window skin as ever").toMatchObject({ art: 0, panel: true, title: true });
});
it("R2.15 the professions window: the windows group off leaves them the game's; a bare or odd window loads cleanly", () => {
  const off = loggedIn(PROF_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { windows = false } } }" });
  off.fire("ADDON_LOADED", "Blizzard_Professions");
  off.eval("ProfessionsFrame:Show()");
  expect(profState(off), "nothing faded or painted").toMatchObject({ page: false, list: false, recipe: false });
  const bare = loggedIn(`${WINDOWS_ENV}__window("ProfessionsFrame") __window("InspectRecipeFrame")`);
  bare.fire("ADDON_LOADED", "Blizzard_Professions");
  bare.eval("ProfessionsFrame:Show() InspectRecipeFrame:Show()");
  expect([windowState(bare, "ProfessionsFrame").panel, windowState(bare, "InspectRecipeFrame").panel, bare.eval("return #ns.errors")], "bare windows are skinned, no part missing is an error").toEqual([true, true, 0]);
  const odd = loggedIn(`${PROF_ENV} local page = ProfessionsFrame.CraftingPage page.RecipeList.ScrollBox = {} page.RankBar = 1 page.LinkButton = {}
    page.SchematicForm.reagentSlots = { [1] = { 1, {} }, [2] = 1 } page.SchematicForm.Init = nil page.SchematicForm.TrackRecipeCheckbox = {}
    __recipe.CreateTexture = nil InspectRecipeFrame = nil ProfessionsFrame.CraftingPage = 1`);
  odd.fire("ADDON_LOADED", "Blizzard_Professions");
  odd.eval("ProfessionsFrame:Show()");
  expect(odd.eval("return #ns.errors"), "odd parts are skipped").toBe(0);
  const noForm = loggedIn(`${PROF_ENV} local page = ProfessionsFrame.CraftingPage page.SchematicForm = {} page.RecipeList = {} page.SchematicForm.reagentSlots = 1`);
  noForm.fire("ADDON_LOADED", "Blizzard_Professions");
  noForm.eval("ProfessionsFrame:Show()");
  expect(noForm.eval("return #ns.errors"), "a form or list that is no frame is skipped").toBe(0);
});

// TEST-ONLY inspect window (Camelot Blizzard_InspectUI.xml, InspectPaperDollFrame.xml): the window, the model with its
// backdrop and border textures, the gear slots (each with a BorderFrame child holding the slot art), the View button
// and the three lines over the model.
const INSPECT_ENV = `${READERS_ENV}
  local f = __window("InspectFrame")
  local model = __well("InspectModelFrame", f) model.BackgroundOverlay = __art(model)
  local paper = CreateFrame("Frame", "InspectPaperDollFrame", f) paper.ViewButton = __mkbutton(paper)
  for _, name in ipairs(ns.GetModule("Windows").EQUIP_SLOTS) do
    if name ~= "Ammo" then
      local slot = __itemButton("Inspect" .. name .. "Slot", paper) slot.BorderFrame = CreateFrame("Frame", nil, slot) __art(slot.BorderFrame)
    end
  end
  for _, name in ipairs({ "InspectTitleText", "InspectGuildText", "InspectLevelText" }) do _G[name] = __text(paper, name) end
  -- TEST-ONLY reader of the inspect window (see inspectState).
  function __inspectState()
    local slots, plates = 0, 0
    for _, name in ipairs(ns.GetModule("Windows").EQUIP_SLOTS) do
      local slot = _G["Inspect" .. name .. "Slot"]
      if slot and slot.icon.__texCoord ~= nil then slots = slots + 1 end
      if slot and __faded(slot.BorderFrame) then plates = plates + 1 end
    end
    return { model = __faded(model) and model.BackgroundOverlay.__alpha == 0 and model.NineSlice.__alpha == 0 and __sunk(model), slots = slots, plates = plates,
      view = __button(paper.ViewButton), title = __lit(InspectTitleText, "small", "text2"), guild = __lit(InspectGuildText, "small", "text2"),
      level = __lit(InspectLevelText, "heading", "text"), painted = ns.Theme.PaintedCount(), errors = #ns.errors }
  end
`;
// The inspect window's parts as the skin leaves them (see __inspectState).
const inspectState = (addon) => addon.eval("return __inspectState()");
it("R2.16 the inspect window: model on an inset, nineteen gear slots in the item look, button and texts themed", () => {
  const addon = loggedIn(INSPECT_ENV);
  addon.fire("ADDON_LOADED", "Blizzard_InspectUI");
  addon.eval("InspectFrame:Show()");
  const first = inspectState(addon);
  expect(first, "the model's backdrop and border faded and sunk; the slots and their bronze frames; the View button; the lines").toMatchObject({
    model: true, slots: 19, plates: 19, view: true, title: true, guild: true, level: true, errors: 0,
  });
  expect(windowState(addon, "InspectFrame"), "and the window skin as ever").toMatchObject({ art: 0, panel: true, title: true });
  addon.eval("InspectFrame:Hide() InspectFrame:Show()");
  expect(inspectState(addon).painted, "a second show paints nothing new").toBe(first.painted);
});
it("R2.16 the inspect window: the windows group off leaves it the game's; a bare or odd window loads cleanly", () => {
  const off = loggedIn(INSPECT_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { windows = false } } }" });
  off.fire("ADDON_LOADED", "Blizzard_InspectUI");
  off.eval("InspectFrame:Show()");
  expect(inspectState(off), "nothing faded or painted").toMatchObject({ model: false, slots: 0, view: false });
  const bare = loggedIn(`${WINDOWS_ENV}__window("InspectFrame")`);
  bare.fire("ADDON_LOADED", "Blizzard_InspectUI");
  bare.eval("InspectFrame:Show()");
  expect([windowState(bare, "InspectFrame").panel, bare.eval("return #ns.errors")], "a bare window is skinned, no part missing is an error").toEqual([true, 0]);
  const odd = loggedIn(`${INSPECT_ENV} InspectPaperDollFrame.ViewButton = 1 InspectHeadSlot = 1 InspectNeckSlot.BorderFrame = 1 InspectModelFrame = {}`);
  odd.fire("ADDON_LOADED", "Blizzard_InspectUI");
  odd.eval("InspectFrame:Show()");
  const noPaper = loggedIn(`${INSPECT_ENV} InspectPaperDollFrame = 1`);
  noPaper.fire("ADDON_LOADED", "Blizzard_InspectUI");
  noPaper.eval("InspectFrame:Show()");
  expect([odd, noPaper].map((a) => a.eval("return #ns.errors")), "odd parts are skipped").toEqual([0, 0]);
});

// TEST-ONLY flight map (Blizzard_FlightMap.xml): the map frame and its BorderFrame (a portrait frame with an underlay
// and a top border texture over the whole map).
const FLIGHT_ENV = `${WINDOWS_ENV}${INSIDES_LUA}
  local f = CreateFrame("Frame", "FlightMapFrame", UIParent) f:Hide()
  local border = __window("TestOnlyFlightBorder") f.BorderFrame = border
  border.Underlay, border.TopBorder = border:CreateTexture(), border:CreateTexture()
  border.CloseButton:CreateTexture() border.CloseButton:SetPoint("TOPRIGHT", border, "TOPRIGHT", 5, 5)
`;
it("R2.16 the flight map: the border frame's art, underlay and edge faded, close button and title in the theme", () => {
  const addon = loggedIn(FLIGHT_ENV);
  addon.fire("ADDON_LOADED", "Blizzard_FlightMap");
  addon.eval("FlightMapFrame:Show()");
  // The border frame's underlay, top border, bronze frame and portrait alphas.
  const art = () => addon.eval("local b = FlightMapFrame.BorderFrame return { b.Underlay:GetAlpha(), b.TopBorder:GetAlpha(), b.NineSlice.__alpha, b.PortraitContainer.__alpha }");
  expect(art(), "underlay, top border, bronze frame and portrait faded").toEqual([0, 0, 0, 0]);
  const border = windowState(addon, "FlightMapFrame.BorderFrame");
  expect(border, "the border has its title in the heading role and a panel without a fill").toMatchObject({ title: true });
  expect(addon.eval("local p = FlightMapFrame.BorderFrame.CloseButton.__points.CENTER return p.x"), "the close button is placed 24 in from the right edge like the other windows'").toBeCloseTo(-24, 0);
  addon.eval("FlightMapFrame:Hide() FlightMapFrame:Show()");
  expect(windowState(addon, "FlightMapFrame.BorderFrame").painted, "a second show paints nothing new").toBe(border.painted);
});
it("R2.16 the flight map: the windows group off leaves it the game's; a map without a border loads cleanly", () => {
  const off = loggedIn(FLIGHT_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { windows = false } } }" });
  off.fire("ADDON_LOADED", "Blizzard_FlightMap");
  off.eval("FlightMapFrame:Show()");
  expect(off.eval("return FlightMapFrame.BorderFrame.Underlay:GetAlpha()"), "the underlay is the game's").toBe(1);
  const bare = loggedIn(`${WINDOWS_ENV}CreateFrame("Frame", "FlightMapFrame", UIParent):Hide()`);
  bare.fire("ADDON_LOADED", "Blizzard_FlightMap");
  bare.eval("FlightMapFrame:Show()");
  const odd = loggedIn(`${FLIGHT_ENV} FlightMapFrame.BorderFrame = {}`);
  odd.fire("ADDON_LOADED", "Blizzard_FlightMap");
  odd.eval("FlightMapFrame:Show()");
  expect([bare, odd].map((a) => a.eval("return #ns.errors")), "none of them reports an error").toEqual([0, 0]);
});

// TEST-ONLY guild bank (Blizzard_GuildBankUI.xml): the window with its tab title plate and labels, seven columns of
// fourteen item buttons on a slot-grid texture, the money plate and three money lines, the push buttons, the search
// box and the info and log areas.
const BANK_ENV = `${READERS_ENV}
  local f = __window("GuildBankFrame")
  f.TabTitle, f.LimitLabel, f.ErrorMessage = __text(f, "Tab 1"), __text(f, "Limit"), __text(f, "No tabs")
  for c = 1, 7 do
    local column = __well(nil, f) f["Column" .. c] = column
    for i = 1, 14 do column["Button" .. i] = __itemButton(nil, column) end
  end
  f.MoneyFrameBG = __well(nil, f)
  f.MoneyFrame, f.WithdrawMoneyFrame = __moneyLine("GuildBankMoneyFrame", f), __moneyLine("GuildBankWithdrawMoneyFrame", f)
  __moneyLine("GuildBankFrameTabCostMoneyFrame", f)
  f.DepositButton, f.WithdrawButton = __mkbutton(f), __mkbutton(f)
  f.BuyInfo = CreateFrame("Frame", nil, f) f.BuyInfo.PurchaseButton = __mkbutton(f.BuyInfo)
  f.Info = CreateFrame("Frame", nil, f) f.Info.SaveButton, f.Info.ScrollFrame = __mkbutton(f.Info), __well(nil, f.Info)
  f.Log = CreateFrame("Frame", nil, f) f.Log.MessageFrame = __well(nil, f.Log)
  GuildItemSearchBox = __mkbox(f)
  GuildBankMoneyLimitLabel, GuildBankFrameTabCost = __text(f.MoneyFrameBG, "Withdraw"), __text(f.BuyInfo, "Costs")
  -- TEST-ONLY reader of the guild bank (see bankState).
  function __bankState()
    local items, columns = 0, 0
    for c = 1, 7 do
      local column = f["Column" .. c]
      if __faded(column) and __sunk(column) then columns = columns + 1 end
      for i = 1, 14 do if column["Button" .. i].icon.__texCoord ~= nil then items = items + 1 end end
    end
    return { columns = columns, items = items, plate = __faded(f.MoneyFrameBG) and __sunk(f.MoneyFrameBG),
      money = __themed(f.MoneyFrame.GoldButton.Text) and __themed(f.WithdrawMoneyFrame.CopperButton.Text) and __themed(GuildBankFrameTabCostMoneyFrame.SilverButton.Text),
      buttons = __button(f.DepositButton) and __button(f.WithdrawButton) and __button(f.BuyInfo.PurchaseButton) and __button(f.Info.SaveButton),
      search = __box(GuildItemSearchBox), info = __sunk(f.Info.ScrollFrame), log = __sunk(f.Log.MessageFrame) and not __sunk(f.Log),
      title = __lit(f.TabTitle, "heading", "text"), limit = __lit(f.LimitLabel, "small", "text2"), notice = __lit(f.ErrorMessage, "label", "text"),
      labels = __lit(GuildBankMoneyLimitLabel, "small", "text2") and __lit(GuildBankFrameTabCost, "small", "text2"),
      painted = ns.Theme.PaintedCount(), errors = #ns.errors }
  end
`;
// The guild bank's parts as the skin leaves them (see __bankState).
const bankState = (addon) => addon.eval("return __bankState()");
it("R2.17 the guild bank: columns faded and inset, ninety-eight slots in the item look, money, controls and texts themed", () => {
  const addon = loggedIn(BANK_ENV);
  addon.fire("ADDON_LOADED", "Blizzard_GuildBankUI");
  addon.eval("GuildBankFrame:Show()");
  const first = bankState(addon);
  expect(first, "seven columns on insets, ninety-eight item buttons, the money plate sunk, three money lines, four buttons, the search box").toMatchObject({
    columns: 7, items: 98, plate: true, money: true, buttons: true, search: true, errors: 0,
  });
  expect(first, "the info area and the log's message frame insets, the tab title, the limit labels and the notice in their roles").toMatchObject({
    info: true, log: true, title: true, limit: true, notice: true, labels: true,
  });
  expect(windowState(addon, "GuildBankFrame"), "and the window skin as ever").toMatchObject({ art: 0, panel: true, title: true });
  addon.eval("GuildBankFrame:Hide() GuildBankFrame:Show()");
  expect(bankState(addon).painted, "a second show paints nothing new").toBe(first.painted);
});
it("R2.17 the guild bank: the windows group off leaves it the game's; a bare or odd window loads cleanly", () => {
  const off = loggedIn(BANK_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { windows = false } } }" });
  off.fire("ADDON_LOADED", "Blizzard_GuildBankUI");
  off.eval("GuildBankFrame:Show()");
  expect(bankState(off), "nothing faded or painted").toMatchObject({ columns: 0, items: 0, plate: false, buttons: false });
  const bare = loggedIn(`${WINDOWS_ENV}__window("GuildBankFrame")`);
  bare.fire("ADDON_LOADED", "Blizzard_GuildBankUI");
  bare.eval("GuildBankFrame:Show()");
  expect([windowState(bare, "GuildBankFrame").panel, bare.eval("return #ns.errors")], "a bare window is skinned, no part missing is an error").toEqual([true, 0]);
  const odd = loggedIn(`${BANK_ENV} local f = GuildBankFrame f.Column1 = 1 f.Column2.Button1 = 1 f.MoneyFrame = {} f.Info = 1 f.Log = { MessageFrame = 1 } f.BuyInfo = {} GuildItemSearchBox = {} GuildBankFrameTabCostMoneyFrame = 1 f.TabTitle = 1`);
  odd.fire("ADDON_LOADED", "Blizzard_GuildBankUI");
  odd.eval("GuildBankFrame:Show()");
  expect(odd.eval("return #ns.errors"), "odd parts are skipped").toBe(0);
});

// TEST-ONLY collections journals (Camelot over Classic Blizzard_MountCollection.xml, PetCollection, ToyBox,
// HeirloomCollection, CollectionTemplates): the window and its four pages with the parts each has.
const JOURNAL_ENV = `${READERS_ENV}
  local f = __window("CollectionsJournal")
  local function bar(parent) local b = CreateFrame("StatusBar", nil, parent) b.border = __art(b) b:SetStatusBarTexture("TEST-ONLY-ART") return b end
  local function count(parent) local c = __well(nil, parent) c.Label, c.Count = __text(c, "Mounts"), __text(c, "12") return c end
  local mount = CreateFrame("Frame", "MountJournal", f)
  mount.LeftInset, mount.RightInset, mount.BottomLeftInset = __well(nil, mount), __well(nil, mount), __well(nil, mount)
  mount.searchBox, mount.FilterDropdown, mount.MountButton, mount.MountCount = __mkbox(mount), __mkbutton(mount, "Arrow"), __mkbutton(mount), count(mount)
  local pet = CreateFrame("Frame", "PetJournal", f)
  pet.LeftInset, pet.RightInset, pet.searchBox = __well(nil, pet), __well(nil, pet), __mkbox(pet)
  pet.FilterDropdown, pet.SummonButton, pet.PetCount = __mkbutton(pet, "Arrow"), __mkbutton(pet), count(pet)
  local toys = CreateFrame("Frame", "ToyBox", f)
  toys.progressBar, toys.searchBox, toys.FilterDropdown, toys.iconsFrame = bar(toys), __mkbox(toys), __mkbutton(toys, "Arrow"), __well(nil, toys)
  toys.PagingFrame, toys.ProgressTracker = __mkpaging(toys), count(toys)
  local heirlooms = CreateFrame("Frame", "HeirloomsJournal", f)
  heirlooms.progressBar, heirlooms.SearchBox, heirlooms.FilterDropdown = bar(heirlooms), __mkbox(heirlooms), __mkbutton(heirlooms, "Arrow")
  heirlooms.ClassDropdown, heirlooms.iconsFrame, heirlooms.PagingFrame = __mkbutton(heirlooms, "Arrow"), __well(nil, heirlooms), __mkpaging(heirlooms)
  -- TEST-ONLY reader of the journals (see journalState).
  function __journalState()
    local function well(w) return __faded(w) and w.NineSlice.__alpha == 0 and __sunk(w) end
    local function plate(c) return well(c) and __lit(c.Label, "small", "text2") end
    local function track(b) return b.border.__alpha == 0 and __sunk(b) and b:GetStatusBarTexture().__alpha ~= 0 end
    local function drop(d) return __button(d) and d.Arrow.__alpha == 1 end
    return { mount = well(mount.LeftInset) and well(mount.RightInset) and well(mount.BottomLeftInset), pet = well(pet.LeftInset) and well(pet.RightInset),
      counts = plate(mount.MountCount) and plate(pet.PetCount) and plate(toys.ProgressTracker), bars = track(toys.progressBar) and track(heirlooms.progressBar),
      search = __box(mount.searchBox) and __box(pet.searchBox) and __box(toys.searchBox) and __box(heirlooms.SearchBox),
      dropdowns = drop(mount.FilterDropdown) and drop(pet.FilterDropdown) and drop(toys.FilterDropdown) and drop(heirlooms.FilterDropdown) and drop(heirlooms.ClassDropdown),
      buttons = __button(mount.MountButton) and __button(pet.SummonButton), grids = well(toys.iconsFrame) and well(heirlooms.iconsFrame),
      paging = __arrow(toys.PagingFrame.PrevPageButton) and __arrow(heirlooms.PagingFrame.NextPageButton) and __lit(toys.PagingFrame.PageText, "small", "text2"),
      painted = ns.Theme.PaintedCount(), errors = #ns.errors }
  end
`;
// The journals' parts as the skin leaves them (see __journalState).
const journalState = (addon) => addon.eval("return __journalState()");
it("R2.18 the collections journals: wells and grids as insets, counts, bars, search boxes, dropdowns, buttons and arrows themed", () => {
  const addon = loggedIn(JOURNAL_ENV);
  addon.fire("ADDON_LOADED", "Blizzard_Collections");
  addon.eval("CollectionsJournal:Show()");
  const first = journalState(addon);
  expect(first, "the mount and pet wells and the toy and heirloom grids sunk, three count plates, two collected-count bars").toMatchObject({
    mount: true, pet: true, grids: true, counts: true, bars: true, errors: 0,
  });
  expect(first, "the four search boxes, five dropdowns with arrows, the Mount and Summon buttons, the paging arrows and count").toMatchObject({
    search: true, dropdowns: true, buttons: true, paging: true,
  });
  addon.eval("CollectionsJournal:Hide() CollectionsJournal:Show()");
  expect(journalState(addon).painted, "a second show paints nothing new").toBe(first.painted);
});
it("R2.18 the collections journals: the tabs switch off leaves them the game's; absent or odd pages load cleanly", () => {
  const off = loggedIn(JOURNAL_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { tabs = false } } }" });
  off.fire("ADDON_LOADED", "Blizzard_Collections");
  off.eval("CollectionsJournal:Show()");
  expect(journalState(off), "nothing faded or painted").toMatchObject({ mount: false, grids: false, search: false, buttons: false });
  const none = loggedIn(`${WINDOWS_ENV}__window("CollectionsJournal")`);
  none.fire("ADDON_LOADED", "Blizzard_Collections");
  none.eval("CollectionsJournal:Show()");
  const odd = loggedIn(`${JOURNAL_ENV} MountJournal.LeftInset = 1 PetJournal.PetCount = 1 ToyBox.progressBar = {} ToyBox.PagingFrame = 1 HeirloomsJournal.iconsFrame = {} PetJournal.searchBox = {}
    HeirloomsJournal.ClassDropdown = {} MountJournal.MountCount = { Label = 1 } ToyBox = 5`);
  odd.fire("ADDON_LOADED", "Blizzard_Collections");
  odd.eval("CollectionsJournal:Show()");
  expect([none, odd].map((a) => a.eval("return #ns.errors")), "none of them reports an error").toEqual([0, 0]);
});

// TEST-ONLY achievements window (Mainline Blizzard_AchievementUI.xml, which Camelot loads): the window with its
// header plate, categories, header row (back, filter, search box with its preview and progress bar), the four list
// areas (each with a gold border child), summary headers and bars, comparison cards, the search results window and
// pooled rows (category, achievement, statistic, comparison).
const ACHIEVEMENT_ENV = `${READERS_ENV}
  local f = __window("AchievementFrame")
  local function border(parent) local b = CreateFrame("Frame", nil, parent) b.NineSlice = CreateFrame("Frame", nil, b) b.NineSlice:CreateTexture() return b end
  local function bar(parent) local b = CreateFrame("StatusBar", nil, parent) b.Left = __art(b) b:SetStatusBarTexture("TEST-ONLY-ART") return b end
  local function area(name, scroll)
    local a = __well(name, f) a.border = border(a) if scroll then a.ScrollBox = __list(a) end
    return a
  end
  f.Header = CreateFrame("Frame", nil, f) f.Header.Left, f.Header.Shield, f.Header.Title = __art(f.Header), __art(f.Header), __text(f.Header, "Achievement Points")
  f.Categories = area(nil, true)
  local d = CreateFrame("Frame", nil, f) f.HeaderDetails = d __art(d)
  d.Back, d.Filters = __mkbutton(d), CreateFrame("Frame", nil, d)
  d.Filters.FilterDropdown, d.Filters.SearchBox = __mkbutton(d.Filters, "Arrow"), __mkbox(d.Filters)
  local list = CreateFrame("Frame", nil, d.Filters.SearchBox) d.Filters.SearchBox.SearchPreviewContainer = list __art(list)
  d.Filters.SearchBox.SearchProgressBar = bar(d.Filters.SearchBox)
  area("AchievementFrameAchievements", true) area("AchievementFrameStats", true) __art(CreateFrame("Frame", "AchievementFrameStatsBG", f))
  area("AchievementFrameSummary") area("AchievementFrameComparison")
  for _, name in ipairs(ns.GetModule("Windows").ACH_HEADS) do
    local head = CreateFrame("Frame", name, f) __art(head) _G[name .. "Title"] = __text(head, "Latest Unlocked")
  end
  AchievementFrameSummaryCategoriesStatusBar = bar(f)
  for i = 1, 12 do _G["AchievementFrameSummaryCategoriesCategory" .. i] = bar(f) end
  local c = AchievementFrameComparison
  c.Summary = CreateFrame("Frame", nil, c) c.Summary.Player, c.Summary.Friend = border(c.Summary), border(c.Summary)
  c.Summary.Player.StatusBar, c.Summary.Friend.StatusBar = bar(c.Summary.Player), bar(c.Summary.Friend)
  c.AchievementContainer, c.StatContainer = CreateFrame("Frame", nil, c), CreateFrame("Frame", nil, c)
  c.AchievementContainer.ScrollBox, c.StatContainer.ScrollBox = __list(c.AchievementContainer), __list(c.StatContainer)
  local sr = CreateFrame("Frame", nil, f) f.SearchResults = sr __art(sr)
  sr.TitleText, sr.CloseButton = __text(sr, "Results"), CreateFrame("Button", nil, sr)
  -- Rows as the game acquires them.
  function __categoryRow(box)
    local row = CreateFrame("Frame", nil, box) row.Button = CreateFrame("Button", nil, row) row.Button.Background, row.Button.Label = __art(row.Button), __text(row.Button, "Quests")
    function row:UpdateSelectionState() end function row:Init() end
    return box:Acquire(row)
  end
  function __cardRow(box)
    local row = CreateFrame("Button", nil, box) row.Background, row.Check, row.PlusMinus = __art(row), __art(row), __art(row)
    row.NineSlice, row.Description = border(row).NineSlice, __text(row, "Kill things") row.NineSlice:SetParent(row)
    row.Tracked = CreateFrame("CheckButton", nil, row) row.Tracked.Art = __art(row.Tracked)
    function row:Saturate() self.Description:SetTextColor(0, 0, 0, 1) end
    return box:Acquire(row)
  end
  function __pairRow(box) local row = CreateFrame("Frame", nil, box) row.Player, row.Friend = __well(nil, row), __well(nil, row) return box:Acquire(row) end
  function __flatRow(box) local row = CreateFrame("Button", nil, box) __art(row) return box:Acquire(row) end
  -- TEST-ONLY reader of the achievements window (see achievementState).
  function __achievementState()
    local function tile(a) return __faded(a) and __sunk(a) end
    local function edge(a) for _, child in ipairs({ a:GetChildren() }) do if child.NineSlice and child.NineSlice:GetAlpha() ~= 0 then return false end end return true end
    local function track(b) return b.Left.__alpha == 0 and __sunk(b) end
    local function panelled(p) for _, r in ipairs({ p:GetRegions() }) do if r.__texture ~= "TEST-ONLY-ART" and r.__alpha ~= 0 then return true end end return false end
    local areas = 0
    for _, a in ipairs({ f.Categories, AchievementFrameAchievements, AchievementFrameStats, AchievementFrameSummary, AchievementFrameComparison }) do
      if tile(a) and a.NineSlice.__alpha == 0 and edge(a) then areas = areas + 1 end
    end
    local heads = __faded(AchievementFrameSummaryAchievementsHeader) and __lit(AchievementFrameSummaryAchievementsHeaderTitle, "section", "text2")
      and AchievementFrameSummaryCategoriesHeaderTitle:GetText() == "LATEST UNLOCKED"
    local bars, cats = track(AchievementFrameSummaryCategoriesStatusBar), 0
    for i = 1, 12 do if track(_G["AchievementFrameSummaryCategoriesCategory" .. i]) then cats = cats + 1 end end
    local details, box = f.HeaderDetails, f.HeaderDetails.Filters.SearchBox
    return { plate = __faded(f.Header, f.Header.Shield) and f.Header.Shield.__alpha ~= 0 and __titled(f.Header.Title), areas = areas, heads = heads,
      bars = bars and cats == 12 and track(c.Summary.Player.StatusBar) and track(c.Summary.Friend.StatusBar), cards = c.Summary.Player.NineSlice:GetAlpha() == 0,
      streaks = __faded(details), back = __button(details.Back), filter = __button(details.Filters.FilterDropdown) and details.Filters.FilterDropdown.Arrow.__alpha == 1,
      search = __box(box), preview = __faded(box.SearchPreviewContainer) and panelled(box.SearchPreviewContainer), progress = track(box.SearchProgressBar),
      stats = __faded(AchievementFrameStatsBG), results = __faded(f.SearchResults) and panelled(f.SearchResults) and __titled(f.SearchResults.TitleText) and __plate(f.SearchResults.CloseButton),
      painted = ns.Theme.PaintedCount(), errors = #ns.errors }
  end
  -- TEST-ONLY reader of a pooled row (see rowState).
  function __achievementRow(row)
    local tracked = ns.Theme.CheckParts(row.Tracked) ~= nil and row.Tracked.Art.__alpha == 0
    return { card = row.Background.__alpha == 0 and row.NineSlice:GetAlpha() == 0, marks = row.Check.__alpha ~= 0 and row.PlusMinus.__alpha ~= 0, tracked = tracked,
      light = row.Description.__textColor[1] == (ns.Theme.RGB("text")) }
  end
`;
// A pooled row's parts as the skin leaves them (see __achievementRow).
const rowState = (addon, row) => addon.eval(`return __achievementRow(${row})`);
it("R2.19 the achievements window: plate, areas, header row, summary and the search results window in the theme", () => {
  const addon = loggedIn(ACHIEVEMENT_ENV);
  addon.fire("ADDON_LOADED", "Blizzard_AchievementUI");
  addon.eval("AchievementFrame:Show()");
  // The achievements window's parts as the skin leaves them.
  const read = () => addon.eval("return __achievementState()");
  const first = read();
  expect(first, "the plate faded with its shield kept and its title in the heading role; five areas on insets with their gold borders faded").toMatchObject({
    plate: true, areas: 5, stats: true, errors: 0,
  });
  expect(first, "the summary's headers as section heads, its thirteen bars and the comparison's two as flat tracks, the comparison cards without borders").toMatchObject({
    heads: true, bars: true, cards: true,
  });
  expect(first, "the header row: streaks, back, filter, the search box with its preview as a panel and its progress bar; the results window").toMatchObject({
    streaks: true, back: true, filter: true, search: true, preview: true, progress: true, results: true,
  });
  expect(windowState(addon, "AchievementFrame"), "and the window skin as ever").toMatchObject({ art: 0, panel: true, title: true });
  addon.eval("AchievementFrame:Hide() AchievementFrame:Show()");
  expect(read().painted, "a second show paints nothing new").toBe(first.painted);
});
it("R2.19 the achievements window: pooled rows are dressed as the lists make them, categories are selectable rows", () => {
  const addon = loggedIn(ACHIEVEMENT_ENV + `
    __early = __cardRow(AchievementFrameAchievements.ScrollBox) __flatRow(AchievementFrameStats.ScrollBox)`);
  addon.fire("ADDON_LOADED", "Blizzard_AchievementUI");
  addon.eval("AchievementFrame:Show()");
  expect(rowState(addon, "__early"), "an achievement row that was there: card faded, expand and tracked marks kept, track box a theme box, text light").toMatchObject({
    card: true, marks: true, tracked: true, light: true,
  });
  addon.eval(`__late = __cardRow(AchievementFrameAchievements.ScrollBox) __late:Saturate()`);
  expect(rowState(addon, "__late"), "a row acquired later, and the black the game gives a completed description made light again").toMatchObject({ card: true, marks: true, tracked: true, light: true });
  addon.eval(`__stat = __flatRow(AchievementFrameStats.ScrollBox) __stat2 = __flatRow(AchievementFrameComparison.StatContainer.ScrollBox) __pair = __pairRow(AchievementFrameComparison.AchievementContainer.ScrollBox)`);
  expect(addon.eval("return { __faded(__stat), __faded(__stat2), __faded(__pair.Player) and __pair.Player.NineSlice.__alpha == 0, #ns.errors }"), "statistic rows and comparison rows lose their plates").toEqual([true, true, true, 0]);
  addon.eval("__cat = __categoryRow(AchievementFrame.Categories.ScrollBox) __cat:Init()");
  // The category row's theme parts, whether its selected fill and rail show, and its label.
  const lit = () => addon.eval("local p = ns.Theme.RowParts(__cat.Button) return { p ~= nil, p.fill:IsShown(), p.rail:IsShown(), __lit(__cat.Button.Label, 'label', 'text') }");
  expect(lit(), "a category row: a theme row, not selected, its label in the text colour").toEqual([true, false, false, true]);
  addon.eval("__cat:UpdateSelectionState(true)");
  expect(lit().slice(1, 3), "the game selects it: the one selected look").toEqual([true, true]);
  addon.eval("__cat:UpdateSelectionState(nil)");
  expect(lit().slice(1, 3), "and deselects it").toEqual([false, false]);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});
it("R2.19 the achievements window: the windows group off leaves it the game's; a bare or odd window loads cleanly", () => {
  const off = loggedIn(ACHIEVEMENT_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { windows = false } } }" });
  off.fire("ADDON_LOADED", "Blizzard_AchievementUI");
  off.eval("AchievementFrame:Show()");
  expect(off.eval("return __achievementState()"), "nothing faded or painted").toMatchObject({ plate: false, areas: 0, back: false, results: false });
  const bare = loggedIn(`${WINDOWS_ENV}__window("AchievementFrame")`);
  bare.fire("ADDON_LOADED", "Blizzard_AchievementUI");
  bare.eval("AchievementFrame:Show()");
  expect([windowState(bare, "AchievementFrame").panel, bare.eval("return #ns.errors")], "a bare window is skinned, no part missing is an error").toEqual([true, 0]);
  const odd = loggedIn(`${ACHIEVEMENT_ENV} local f = AchievementFrame f.Header = 1 f.Categories = {} f.HeaderDetails = { Filters = 1 } f.SearchResults = 1 AchievementFrameStats = 1
    AchievementFrameSummaryAchievementsHeader = 1 AchievementFrameSummaryCategoriesStatusBar = 1 AchievementFrameComparison.Summary = 1 AchievementFrameAchievements.ScrollBox = {}`);
  odd.fire("ADDON_LOADED", "Blizzard_AchievementUI");
  odd.eval("AchievementFrame:Show()");
  const oddRows = loggedIn(ACHIEVEMENT_ENV + `
    local box = AchievementFrameAchievements.ScrollBox box:Acquire(1) box:Acquire({}) AchievementFrame.Categories.ScrollBox:Acquire({ Button = 1 }) AchievementFrameComparison.AchievementContainer.ScrollBox:Acquire(1)
    local plain = CreateFrame("Button", nil, box) plain.Tracked = {} box:Acquire(plain) AchievementFrame.Header.Title = 1 AchievementFrameSummaryCategoriesHeaderTitle = {}`);
  oddRows.fire("ADDON_LOADED", "Blizzard_AchievementUI");
  oddRows.eval("AchievementFrame:Show()");
  expect([odd, oddRows].map((a) => a.eval("return #ns.errors")), "odd parts are skipped").toEqual([0, 0]);
});
