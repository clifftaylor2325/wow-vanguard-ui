// retailhousing: Retail's housing windows in the Vanguard look (Modules/RetailHousing.lua), in the TEST-ONLY headless
// client. The windows are built by scripts/lib/wow-retail-housing.lua after Blizzard's live source, as their part of the
// game loads; WoW Forever has no housing and never loads the file.

import { expect, it } from "vitest";
import { RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { WINDOWS_ENV, loggedIn } from "./helpers.mjs";

// The housing addons, in the order a player meets them.
const PARTS = ["Blizzard_HousingDashboard", "Blizzard_HousingHouseFinder", "Blizzard_HouseEditor", "Blizzard_HousingModelPreview"];

// TEST-ONLY: whether a frame carries a Vanguard texture that shows (a panel), and the alpha of a region.
const HOUSING_LUA = `
  function __panel(f)
    for _, r in ipairs({ f:GetRegions() }) do if r.__kind == "Texture" and r.__texture ~= "TEST-ONLY-ART" and r.__alpha ~= 0 then return true end end
    return false
  end
  function __alpha(r) return r.__alpha == nil and 1 or r.__alpha end
  -- A window's own art and its NineSlice's alpha, and whether its title is in the theme.
  function __skinned(f)
    local art for _, r in ipairs({ f:GetRegions() }) do if r.__texture == "TEST-ONLY-ART" then art = __alpha(r) end end
    return { art, __alpha(f.NineSlice), __alpha(f.PortraitContainer) }
  end
`;

// A logged-in addon on Retail with every housing part loaded (its windows built, then ADDON_LOADED fired for each).
function housing(options = {}) {
  const addon = loggedIn(WINDOWS_ENV + HOUSING_LUA, { client: RETAIL_CLIENT, ...options });
  for (const part of PARTS) {
    addon.eval(`__wfgWorld.loadHousing("${part}")`);
    addon.fire("ADDON_LOADED", part);
  }
  return addon;
}

it("retail housing: the file loads on Retail only", () => {
  expect(loggedIn().eval("return ns.RetailHousing == nil"), "WoW Forever: not loaded").toBe(true);
  expect(loggedIn("", { client: RETAIL_CLIENT }).eval("return ns.RetailHousing ~= nil"), "Retail: loaded").toBe(true);
});

it("retail housing: the dashboard and the house finder are game windows in the Vanguard look, and can be dragged", () => {
  const addon = housing();
  addon.eval("HousingDashboardFrame:Show() HouseFinderFrame:Show() HousingModelPreviewFrame:Show()");
  for (const name of ["HousingDashboardFrame", "HouseFinderFrame", "HousingModelPreviewFrame"]) {
    expect(addon.eval(`return __skinned(${name})`), `${name}: the game's art, edge and portrait faded`).toEqual([0, 0, 0]);
  }
  expect(addon.eval("local handle = ns.FrameState('vgMoveHandle') return { handle[HousingDashboardFrame] ~= nil, handle[HouseFinderFrame] ~= nil }"), "both get a drag area on the title bar").toEqual([true, true]);
  expect(addon.eval("return #ns.errors"), "nothing caught").toBe(0);
});

it("retail housing: the decor catalog, the collection and the plot tooltips are dressed", () => {
  const addon = housing();
  addon.eval("HousingDashboardFrame:Show() HouseFinderFrame:Show()");
  const catalog = addon.eval(`local c = HousingDashboardFrame.CatalogContent
    return { __alpha(c.Background), __alpha(c.Categories.Background), __alpha(c.Categories.TopBorder), __panel(c.OptionsContainer.ScrollBar.Thumb),
      __alpha(HousingDashboardFrame.CollectionContent.Background),
      __alpha(HousingDashboardFrame.CollectionContent.Categories.Background), __alpha(HousingDashboardFrame.CollectionContent.Categories.TopBorder) }`);
  expect(catalog, "the parchment and category art faded, the scroll bar's thumb in the theme, the collection's parchment and category art faded").toEqual([0, 0, 0, true, 0, 0, 0]);
  const tips = addon.eval(`return { __panel(HouseFinderFrame.SelectedPlotTooltip), __alpha(HouseFinderFrame.SelectedPlotTooltip.NineSlice), __panel(HouseFinderHighlightedPlotTooltip),
    __alpha(HouseFinderFrame.SelectedPlotTooltip.Arrow), __alpha(HouseFinderHighlightedPlotTooltip.Arrow) }`);
  expect(tips, "both plot tooltips on a theme panel, the game's edge and pointer arrow faded").toEqual([true, 0, true, 0, 0]);
});

it("retail housing: only the house editor's decor storage is dressed, never the screen-wide editor", () => {
  const addon = housing();
  addon.eval("HouseEditorFrame:Show()");
  expect(addon.eval("return { __panel(HouseEditorFrame), __panel(HouseEditorFrame.StoragePanel), __alpha(HouseEditorFrame.StoragePanel.Background) }"),
    "the editor itself bare; its storage on a theme panel, the chest art faded").toEqual([false, true, 0]);
});

it("retail housing: the game windows switch off leaves every housing window as the game drew it", () => {
  const addon = housing({ savedVariables: "VanguardDB.profiles = { Default = { Windows = { windows = false } } }" });
  addon.eval("HousingDashboardFrame:Show() HouseEditorFrame:Show()");
  expect(addon.eval("return { __alpha(HousingDashboardFrame.CatalogContent.Background), __panel(HouseEditorFrame.StoragePanel) }"), "untouched").toEqual([1, false]);
});
