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
