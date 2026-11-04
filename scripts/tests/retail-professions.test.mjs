// retail-professions: the professions window's Retail pages and Retail's profession windows (Modules/RetailProfessions.lua)
// in the Vanguard look, in the TEST-ONLY headless client. The windows are built by scripts/lib/wow-retail-professions.lua
// after Blizzard's live source, as their part of the game loads; WoW Forever never loads the file.

import { expect, it } from "vitest";
import { RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { WINDOWS_ENV, expectErrors, loggedIn } from "./helpers.mjs";

// The profession parts of the game this file dresses.
const PARTS = ["Blizzard_Professions", "Blizzard_ProfessionsBook", "Blizzard_ProfessionsCustomerOrders"];

// TEST-ONLY readers: whether a frame carries a Vanguard texture that shows (a panel or a theme control), the alpha of
// the game's own art on a frame (nil without any), and whether a font string is in the theme's font.
const PROF_LUA = `
  function __panel(f)
    for _, r in ipairs({ f:GetRegions() }) do if r.__kind == "Texture" and r.__texture ~= "TEST-ONLY-ART" and r.__alpha ~= 0 then return true end end
    return false
  end
  function __alpha(r) return r.__alpha == nil and 1 or r.__alpha end
  function __gameArt(f) for _, r in ipairs({ f:GetRegions() }) do if r.__texture == "TEST-ONLY-ART" then return __alpha(r) end end end
  function __themed(fs) return fs.__font ~= nil end
`;

// A logged-in addon on Retail with the profession parts loaded (their windows built, then ADDON_LOADED fired for each);
// options.before runs first, options.savedVariables at login.
function professions(options = {}) {
  const addon = loggedIn(WINDOWS_ENV + PROF_LUA, { client: RETAIL_CLIENT, savedVariables: options.savedVariables });
  if (options.before) addon.eval(options.before);
  for (const part of PARTS) {
    addon.eval(`__wfgWorld.loadProfessions("${part}")`);
    addon.fire("ADDON_LOADED", part);
  }
  return addon;
}

it("retail professions: the file loads on Retail only", () => {
  expect(loggedIn().eval("return ns.RetailProfessions == nil"), "WoW Forever: not loaded").toBe(true);
  expect(loggedIn("", { client: RETAIL_CLIENT }).eval("return ns.RetailProfessions ~= nil"), "Retail: loaded").toBe(true);
});

it("retail professions: the specialisation page's dividers and footer fade and its buttons take the theme; the tree stays", () => {
  const addon = professions();
  addon.eval("ProfessionsFrame:Show()");
  const spec = addon.eval(`local p = ProfessionsFrame.SpecPage
    return { __gameArt(p.VerticalDivider), __gameArt(p.TopDivider), __gameArt(p.PanelFooter), __panel(p.ApplyButton), __panel(p.BackToFullTreeButton),
      __panel(p.DetailedView.SpendPointsButton), __panel(p.DetailedView.UnlockPathButton) }`);
  expect(spec, "art faded, the page's and the path's push buttons themed").toEqual([0, 0, 0, true, true, true, true]);
  expect(addon.eval("return #ns.errors"), "nothing caught").toBe(0);
});

it("retail professions: the crafting orders page's tabs, lists, order view and money lines take the theme", () => {
  const addon = professions();
  addon.eval("ProfessionsFrame:Show()");
  const browse = addon.eval(`local b = ProfessionsFrame.OrdersPage.BrowseFrame
    return { __panel(b.PublicOrdersButton), __panel(b.PersonalOrdersButton), __gameArt(b.RecipeList), __alpha(b.RecipeList.NineSlice), __alpha(b.RecipeList.BackgroundNineSlice), __panel(b.RecipeList),
      __panel(b.SearchButton), __panel(b.FavoritesSearchButton), __gameArt(b.OrderList), __panel(b.OrderList.ScrollBar.Thumb), __gameArt(b.OrdersRemainingDisplay) }`);
  expect(browse, "tabs, the recipe list and order list on insets, buttons, the scroll bar; the remaining-orders plate faded").toEqual([true, true, 0, 0, 0, true, true, true, 0, true, 0]);
  const view = addon.eval(`local v = ProfessionsFrame.OrdersPage.OrderView
    return { __panel(v.OrderInfo), __panel(v.OrderInfo.StartOrderButton), __themed(v.OrderInfo.FinalTipMoneyDisplayFrame.GoldDisplay.Text),
      __panel(v.OrderDetails), __panel(v.OrderDetails.SchematicForm), __panel(v.CreateButton), __panel(v.CompleteOrderButton) }`);
  expect(view, "the order's info and details on insets, the recipe form, the money lines and the buttons").toEqual([true, true, true, true, true, true, true]);
});

it("retail professions: the crafting orders recipe list is the crafting page's: its rows are theme rows following the game's selection, its no-results text themed", () => {
  const addon = professions();
  addon.eval("ProfessionsFrame:Show()");
  // Whether the first recipe row is a theme row, and whether its selected look shows.
  const lit = () => addon.eval(`local row = ProfessionsFrame.OrdersPage.BrowseFrame.RecipeList.ScrollBox.rows[1]
    return { ns.Theme.RowParts(row) ~= nil, ns.Theme.RowParts(row).fill:IsShown() }`);
  expect(lit(), "a row is a theme row, not selected").toEqual([true, false]);
  addon.eval("ProfessionsFrame.OrdersPage.BrowseFrame.RecipeList.ScrollBox.rows[1]:SetSelected(true)");
  expect(lit(), "the game selects it: the selected look").toEqual([true, true]);
  expect(addon.eval("return __themed(ProfessionsFrame.OrdersPage.BrowseFrame.RecipeList.NoResultsText)"), "the no-results text in the theme font").toBe(true);
});

it("retail professions: an order's minimum-quality icon keeps its picture while the details' own art fades", () => {
  const addon = professions();
  addon.eval("ProfessionsFrame:Show()");
  expect(addon.eval("local d = ProfessionsFrame.OrdersPage.OrderView.OrderDetails return { __alpha(d.MinimumQualityIcon), __gameArt(d) }"), "icon shown, background faded").toEqual([1, 0]);
});

it("retail professions: a page that fails is reported by name, and the other page is still dressed", () => {
  expectErrors("professions orders list: eval:2: TEST-ONLY odd favourites button");
  const addon = professions({ before: "ns.GetModule('Windows').SkinPlate = function() error('TEST-ONLY odd favourites button') end" });
  addon.eval("ProfessionsFrame:Show()");
  expect(addon.eval("local where = {} for i, e in ipairs(ns.errors) do where[i] = e.text end return table.concat(where, ' ')"), "the orders list, by name").toMatch(/professions orders list/);
  expect(addon.eval("local v = ProfessionsFrame.OrdersPage.OrderView return { __panel(ProfessionsFrame.SpecPage.ApplyButton), __panel(v.CreateButton) }"),
    "the specialisation page and the order view are dressed").toEqual([true, true]);
});

it("retail professions: the profession book and the crafting orders window are game windows in the Vanguard look, and can be dragged", () => {
  const addon = professions();
  addon.eval("ProfessionsBookFrame:Show() ProfessionsCustomerOrdersFrame:Show()");
  const book = addon.eval(`return { __gameArt(ProfessionsBookFrame), __alpha(ProfessionsBookPage1), __alpha(ProfessionsBookPage2),
    __gameArt(PrimaryProfession1.statusBar), __panel(SecondaryProfession3.statusBar), PrimaryProfession1.missingText.__textColor ~= nil, PrimaryProfession1.rank.__textColor == nil }`);
  expect(book, "the window and its pages faded, the skill bars flat, the ink texts light (the rank's white kept)").toEqual([0, 0, 0, 0, true, true, true]);
  const orders = addon.eval(`local f = ProfessionsCustomerOrdersFrame
    return { __gameArt(f), __panel(f.MoneyFrameInset), __gameArt(f.MoneyFrameBorder), __themed(f.MoneyFrameBorder.MoneyFrame.CopperDisplay.Text) }`);
  expect(orders, "the window skin, its money line on an inset, the gold edge faded, the figures themed").toEqual([0, true, 0, true]);
  expect(addon.eval("local handle = ns.FrameState('vgMoveHandle') return { handle[ProfessionsBookFrame] ~= nil, handle[ProfessionsCustomerOrdersFrame] ~= nil }"), "both by their title bar").toEqual([true, true]);
});

it("retail professions: the game windows switch off leaves every profession window as the game drew it", () => {
  const addon = professions({ savedVariables: "VanguardDB.profiles = { Default = { Windows = { windows = false } } }" });
  addon.eval("ProfessionsFrame:Show() ProfessionsBookFrame:Show()");
  expect(addon.eval("return { __gameArt(ProfessionsFrame.SpecPage.TopDivider), __alpha(ProfessionsBookPage1) }"), "untouched").toEqual([1, 1]);
});
