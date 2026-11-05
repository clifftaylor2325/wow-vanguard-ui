// retail-delves: delves on WoW Retail (Modules/RetailDelves.lua) in the TEST-ONLY headless client: the delve you are in
// named with its tier on the tracker's scenario block, and the delve windows in the Vanguard look. The calls and
// windows are scripts/lib/wow-retail-delves.lua's, after Blizzard's live source; WoW Forever never loads the file.

import { expect, it } from "vitest";
import { RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { WINDOWS_ENV, loggedIn } from "./helpers.mjs";

// The delve windows' parts of the game, in the order a player meets them.
const PARTS = ["Blizzard_DelvesCompanionConfiguration", "Blizzard_DelvesDifficultyPicker"];

// TEST-ONLY readers: whether a frame carries a Vanguard texture that shows (its panel or edge), a region's alpha,
// and whether a font string has had the theme's font put on it.
const DELVES_LUA = `
  function __panel(f)
    for _, r in ipairs({ f:GetRegions() }) do if r.__kind == "Texture" and r.__texture ~= "TEST-ONLY-ART" and r.__alpha ~= 0 then return true end end
    return false
  end
  function __alpha(r) return r.__alpha == nil and 1 or r.__alpha end
  function __gameArt(f) for _, r in ipairs({ f:GetRegions() }) do if r.__texture == "TEST-ONLY-ART" then return __alpha(r) end end end
  function __themed(fs) return fs.__font ~= nil end
`;

// A logged-in addon on Retail with both delve parts loaded (their windows built, then ADDON_LOADED fired for each).
function delves(options = {}) {
  const addon = loggedIn(WINDOWS_ENV + DELVES_LUA, { client: RETAIL_CLIENT, ...options });
  for (const part of PARTS) {
    addon.eval(`__wfgWorld.loadDelves("${part}")`);
    addon.fire("ADDON_LOADED", part);
  }
  return addon;
}

it("retail delves: the file loads on Retail only", () => {
  expect(loggedIn().eval("return ns.RetailDelves == nil"), "WoW Forever: not loaded").toBe(true);
  expect(loggedIn("", { client: RETAIL_CLIENT }).eval("return ns.RetailDelves ~= nil"), "Retail: loaded").toBe(true);
});

// A TEST-ONLY scenario of one stage, and the tracker expanded so it has the room to show.
const SCENARIO = `__wfgWorld.scenario = { name = "TEST-ONLY Fungal Folly", currentStage = 1, numStages = 1, step = { title = "TEST-ONLY Find the cache", numCriteria = 0 } }`;
const EXPANDED = "VanguardDB.profiles = { Default = { QuestTracker = { expanded = true } } }";
// The tracker's block titles as drawn.
const titles = (addon) => Object.values(addon.eval(`local f, out = Vanguard_QuestTrackerFrame, {}
  for i = 1, f.blocks.used do out[i] = f.blocks[i].title:GetText() end
  return out`));

it("retail delves: the tracker names the delve you are in with its tier, and any other scenario by its name alone", () => {
  const addon = loggedIn(`${SCENARIO} __wfgWorld.delveTier = 8`, { client: RETAIL_CLIENT, savedVariables: EXPANDED });
  expect(titles(addon)[0], "in a delve: its name and tier").toBe("TEST-ONLY Fungal Folly · Tier 8");
  addon.eval("__wfgWorld.delveTier = nil");
  addon.fire("ACTIVE_DELVE_DATA_UPDATE");
  addon.update(0);
  expect(titles(addon)[0], "out of the delve (the game's delve event redraws it): the name alone").toBe("TEST-ONLY Fungal Folly");
  addon.eval("__wfgWorld.delveTier = __wfgWorld.secret(8)");
  addon.fire("SCENARIO_UPDATE");
  addon.update(0);
  expect([titles(addon)[0], addon.eval("return #ns.errors")], "a tier the client hides: the name alone, no error").toEqual(["TEST-ONLY Fungal Folly", 0]);
});

// A TEST-ONLY delve: its step has a widget set whose one widget is the delve header (widget type 29, id 77), with
// two counters, two affixes and an unearned reward chest. `header` overrides parts of the header's info.
const DELVE = (header = "") => `${SCENARIO}
  __wfgWorld.scenario.step.widgetSetID = 5 __wfgWorld.delveTier = 8
  __wfgWorld.delveWidgets = { { widgetID = 3, widgetType = 1 }, { widgetID = 77, widgetType = 29 } }
  __wfgWorld.delveHeader = { shownState = 1, currencies = { { leadingText = "TEST-ONLY Lives", text = "3" }, { leadingText = "", text = "5/6" } },
    spells = { { spellID = 133 }, { spellID = 116 } }, rewardInfo = { shownState = 2 } }
  ${header}`;
// The game updating a widget (UPDATE_UI_WIDGET with its UIWidgetInfo): the delve header (type 29), or another kind.
const widgetUpdated = (addon, type = 29) => {
  addon.eval(`__wfgStub.fire("UPDATE_UI_WIDGET", { widgetID = 77, widgetSetID = 5, widgetType = ${type} })`);
  addon.update(0);
};
// The stage block's objective lines as drawn (the block after the delve's heading).
const lines = (addon) => (blocks(addon)[1] || [])[1];
// Each drawn block as [title, line texts].
const blocks = (addon) => Object.values(addon.eval(`local f, out = Vanguard_QuestTrackerFrame, {}
  for i = 1, f.blocks.used do local b, rows = f.blocks[i], {}
    for j = 1, b.lines.used do rows[j] = b.lines[j].text:GetText() end
    out[i] = { b.title:GetText(), rows } end
  return out`)).map(([title, rows]) => [title, Object.values(rows)]);

it("retail delves: the tracker lists the game's delve header under the stage, its counters, affixes and reward chest", () => {
  const addon = loggedIn(DELVE(), { client: RETAIL_CLIENT, savedVariables: EXPANDED });
  expect(lines(addon), "two counters, the affixes by their spells' names, the unearned chest").toEqual(
    ["TEST-ONLY Lives 3", "5/6", "Affixes: Fireball, Frostbolt", "Reward chest not earned"]);
  addon.eval(`__wfgWorld.delveHeader.rewardInfo.shownState = 1
    local QT, refresh = ns.GetModule("QuestTracker"), ns.GetModule("QuestTracker").Refresh
    __refreshes = 0
    QT.Refresh = function(...) __refreshes = __refreshes + 1 return refresh(...) end`);
  widgetUpdated(addon, 1);
  expect(addon.eval("return __refreshes"), "another widget's update (the event fires for every widget) asks no redraw").toBe(0);
  widgetUpdated(addon);
  expect([addon.eval("return __refreshes"), lines(addon).pop()], "the header's update redraws it: the earned chest").toEqual([1, "Reward chest earned"]);
  addon.eval("__wfgWorld.delveHeader.rewardInfo.shownState = 0 __wfgWorld.delveHeader.spells = {}");
  widgetUpdated(addon);
  expect(lines(addon), "no chest and no affix: the counters alone").toEqual(["TEST-ONLY Lives 3", "5/6"]);
});

it("retail delves: the header rows stay out when there is no delve, no widget set, a hidden header or hidden text", () => {
  const stage = [];
  const addon = loggedIn(DELVE("__wfgWorld.delveTier = nil"), { client: RETAIL_CLIENT, savedVariables: EXPANDED });
  expect(lines(addon), "a scenario that is no delve").toEqual(stage);
  addon.eval("__wfgWorld.delveTier = 8 __wfgWorld.scenario.step.widgetSetID = nil");
  addon.fire("SCENARIO_UPDATE");
  addon.update(0);
  expect(lines(addon), "a delve with no widget set").toEqual(stage);
  addon.eval("__wfgWorld.scenario.step.widgetSetID = 5 __wfgWorld.delveHeader.shownState = 0");
  widgetUpdated(addon);
  expect(lines(addon), "a header the game hides").toEqual(stage);
  addon.eval(`local h = __wfgWorld.delveHeader h.shownState = 1
    h.currencies = { { leadingText = "x", text = __wfgWorld.secret("3") }, { text = "" } } h.spells = { { spellID = __wfgWorld.secret(133) }, { spellID = 999999 } }
    h.rewardInfo = __wfgWorld.secret({ shownState = 1 }) __wfgWorld.delveWidgets = { __wfgWorld.secret({}), { widgetID = 77, widgetType = __wfgWorld.secret(29) } }`);
  widgetUpdated(addon);
  expect([lines(addon), addon.eval("return #ns.errors")], "hidden values and unknown spells leave no row and no error").toEqual([stage, 0]);
  addon.eval("local h = __wfgWorld.delveHeader __wfgWorld.delveWidgets = { { widgetID = 77, widgetType = 29 } } h.currencies = __wfgWorld.secret({}) h.rewardInfo = {} h.spells = __wfgWorld.secret({})");
  widgetUpdated(addon);
  expect([lines(addon), addon.eval("return #ns.errors")], "hidden lists leave no row and no error").toEqual([stage, 0]);
});

it("retail delves: the companion window and the delve door's picker keep their painted scene inside the theme's edge", () => {
  const addon = delves();
  addon.eval("DelvesCompanionConfigurationFrame:Show() DelvesDifficultyPickerFrame:Show()");
  for (const name of ["DelvesCompanionConfigurationFrame", "DelvesDifficultyPickerFrame"]) {
    const state = addon.eval(`local f = ${name} return { __gameArt(f.Border), __alpha(f.Background), __alpha(f.Bg), __panel(f), __gameArt(f.NineSlice) }`);
    expect(state, `${name}: the dialog border and the inset edge faded; the scene and the game's fill kept; the theme's edge on`).toEqual([0, 1, 1, true, 0]);
  }
  const companion = addon.eval(`local f = DelvesCompanionConfigurationFrame
    return { __themed(f.CompanionSlots.CompanionCombatRoleSlot.Label), __themed(f.CompanionSlots.CompanionCombatRoleSlot.Value), __panel(f.CompanionConfigShowAbilitiesButton) }`);
  expect(companion, "a slot's label in the theme, its value the game's; the abilities button themed").toEqual([true, false, true]);
  const picker = addon.eval(`local f = DelvesDifficultyPickerFrame
    return { __panel(f.Dropdown), __panel(f.EnterDelveButton), __panel(f.DelveRewardsContainerFrame.ScrollBar.Thumb) }`);
  expect(picker, "the tier dropdown, the Enter button and the rewards' scroll bar in the theme").toEqual([true, true, true]);
  expect(addon.eval("return #ns.errors"), "nothing caught").toBe(0);
});

it("retail delves: the companion's ability list is a game window in the Vanguard look, and the two companion windows can be dragged", () => {
  const addon = delves();
  addon.eval("DelvesCompanionAbilityListFrame:Show() DelvesCompanionConfigurationFrame:Show()");
  const list = addon.eval(`local f = DelvesCompanionAbilityListFrame
    return { __gameArt(f), __alpha(f.NineSlice), __panel(f.DelvesCompanionRoleDropdown), __panel(f.DelvesCompanionAbilityListPagingControls.NextPageButton) }`);
  expect(list, "its art and edge faded, the role dropdown and the pager in the theme").toEqual([0, 0, true, true]);
  const moves = addon.eval(`local handle, movable = ns.FrameState('vgMoveHandle'), ns.FrameState('vgMovable')
    return { handle[DelvesCompanionAbilityListFrame] ~= nil, movable[DelvesCompanionConfigurationFrame] == true, handle[DelvesCompanionConfigurationFrame] == nil }`);
  expect(moves, "the list by its title bar, the companion window by its top edge alone").toEqual([true, true, true]);
});

it("retail delves: the game windows switch off leaves the delve windows as the game drew them", () => {
  const addon = delves({ savedVariables: "VanguardDB.profiles = { Default = { Windows = { windows = false } } }" });
  addon.eval("DelvesCompanionConfigurationFrame:Show() DelvesDifficultyPickerFrame:Show()");
  expect(addon.eval("return { __gameArt(DelvesCompanionConfigurationFrame.Border), __panel(DelvesDifficultyPickerFrame), __gameArt(DelvesCompanionConfigurationFrame.NineSlice) }"), "untouched").toEqual([1, false, 1]);
});
