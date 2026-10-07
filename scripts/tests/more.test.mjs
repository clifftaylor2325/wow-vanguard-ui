// more: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs): the
// error line, quest marks on nameplates and minimap coordinates.

import { expect, it } from "vitest";
import { CLICK_LUA, PLATE_ENV, UI_ENV, UNITS_ENV, isTok, loggedIn } from "./helpers.mjs";
import { MERCHANT_ENV } from "./more-env.mjs";

it("the error line drops what the action bar already shows, and the rest takes the game's own path", () => {
  const addon = loggedIn(MERCHANT_ENV);
  expect(addon.eval("return UIErrorsFrame:IsEventRegistered('UI_ERROR_MESSAGE')"), "the game's own handler keeps the event").toBe(true);
  addon.fire("UI_ERROR_MESSAGE", 51, "TEST-ONLY not ready");
  addon.fire("UI_ERROR_MESSAGE", 52, "TEST-ONLY Out of range");
  addon.fire("UI_ERROR_MESSAGE", 52, "TEST-ONLY Out of range");
  addon.fire("UI_ERROR_MESSAGE", 99, "TEST-ONLY Blacklisted by the game");
  addon.fire("UI_ERROR_MESSAGE", 53);
  expect(addon.eval("return UIErrorsFrame.__lines"), "noise is dropped, useful errors stay under their type as the line's ID (so repeats refresh), the game's own blacklist still applies").toEqual([["TEST-ONLY Out of range", 52], ["TEST-ONLY Out of range", 52]]);
  expect(addon.eval("return __sounds"), "and the game's handler still ran for what showed (sounds)").toBe(2);
  expect(addon.eval("return UIErrorsFrame:ShouldDisplayMessageType(7, { __secret = true })"), "a message the client hides is never compared, and shown the game's way").toBe(true);
  const none = loggedIn("UIErrorsFrame = nil");
  expect(none.eval("return ns.GetModule('Merchant').settings.errors"), "no error line on this client: nothing to filter").toBe(true);
  const old = loggedIn(MERCHANT_ENV + "UIErrorsFrame.ShouldDisplayMessageType = nil");
  expect(old.eval("return UIErrorsFrame.ShouldDisplayMessageType == nil"), "an error line without that question is left alone").toBe(true);
});

it("nameplates: a gold ! by units your quests need", () => {
  const env = "__related = { nameplate1 = true, nameplate2 = { __secret = true } } C_QuestLog = { UnitIsRelatedToActiveQuest = function(unit) return __related[unit] end }";
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + CLICK_LUA + env);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  // A plate's quest mark: shown, its icon, its color.
  const mark = (unit) => addon.eval(`local q = __plates.${unit}.vg.quest return { q:IsShown(), q.__texture, q.__vertexColor }`);
  const one = mark("nameplate1");
  expect([one[0], /Icons\\Quests$/.test(one[1]), isTok(addon, one[2], "gold")], "a quest unit gets the gold !").toEqual([true, true, true]);
  expect(addon.eval("return __plates.nameplate1.vg.quest.__points.LEFT.rel == __plates.nameplate1.vg.name"), "just right of its name").toBe(true);
  expect(mark("nameplate2")[0], "a hidden answer counts as no").toBe(false);
  addon.eval("__related.nameplate1 = nil");
  addon.fire("QUEST_LOG_UPDATE");
  expect(mark("nameplate1")[0], "it goes when your quests no longer need the unit").toBe(false);
  addon.eval("__related.nameplate1 = true");
  addon.slash("");
  addon.eval('__click("Nameplates")');
  addon.eval('__click("A gold ! by units your quests need")');
  expect(mark("nameplate1")[0], "the switch turns the marks off at once").toBe(false);
  const bare = loggedIn(UNITS_ENV + PLATE_ENV + "C_QuestLog = nil");
  bare.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  expect(bare.eval("return __plates.nameplate1.vg.quest:IsShown()"), "a client that can't say shows none").toBe(false);
});

it("minimap coordinates: asked again only after the player moves", () => {
  // TEST-ONLY world position, and a counter of map position lookups.
  const addon = loggedIn(UI_ENV + `__pos = { 100, 200, 0, 1 } UnitPosition = function() return __pos[1], __pos[2], __pos[3], __pos[4] end
    __asked = 0 local real = C_Map.GetPlayerMapPosition C_Map.GetPlayerMapPosition = function(...) __asked = __asked + 1 return real(...) end`);
  // Map position lookups so far, then reset; and the text under the map.
  const asked = () => addon.eval("local n = __asked __asked = 0 return n");
  const coords = () => addon.eval('return ns.GetModule("Minimap").coords:GetText()');
  addon.advance(2);
  expect([asked(), coords()], "standing still for two seconds: one lookup, the coordinates shown").toEqual([1, "45.7, 12.3"]);
  addon.eval("__pos[1] = 101 C_Map.GetPlayerMapPosition = function() __asked = __asked + 1 return { GetXY = function() return 0.5, 0.25 end } end");
  addon.advance(0.25);
  expect([asked(), coords()], "a step: looked up again, the new coordinates").toEqual([1, "50.0, 25.0"]);
  addon.eval("__pos[4] = 2");
  addon.advance(0.25);
  addon.eval("C_Map.GetBestMapForUnit = function() return 7 end");
  addon.advance(0.25);
  expect(asked(), "another continent, or another map at the same spot: looked up again each time").toBe(2);
  addon.eval("__pos[1] = { __secret = true }");
  addon.advance(1);
  expect(asked(), "a hidden position can't be compared: looked up on every refresh, as before").toBe(4);
});

it("minimap with no position, chat window hooks, and short numbers", () => {
  const addon = loggedIn(`
    C_Map = nil
    __hooks = {}
    -- TEST-ONLY chat hooks: hooksecurefunc, FCF_OpenTemporaryWindow and FCF_Tab_OnClick.
    hooksecurefunc = function(name, fn) __hooks[name] = fn end
    function FCF_OpenTemporaryWindow() end
    function FCF_Tab_OnClick() end
  `);
  expect(addon.eval('return ns.GetModule("Minimap").CoordsText()') === "", "coordinates are blank when the client has no map position").toBeTruthy();
  expect(addon.eval("return type(__hooks.FCF_OpenTemporaryWindow)") === "function", "a new whisper window is skinned when it opens").toBeTruthy();
  expect(addon.eval("return type(__hooks.FCF_Tab_OnClick)") === "function", "clicking a chat tab refreshes the tabs").toBeTruthy();
  expect(addon.eval('return ns.GetModule("DataBars").Short(1500000)') === "1.5M", "a million is shown as millions").toBeTruthy();
  expect(addon.eval('return ns.GetModule("DataBars").Short(12)') === "12", "a small number is shown whole").toBeTruthy();
});
