// data: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { DATA_ENV, bars, chatHas, loggedIn, setCombat } from "./helpers.mjs";

it("data bars", () => {
  const addon = loggedIn(DATA_ENV);
  const b = bars(addon);
  expect(b.xp === 12300 && b.xpMax === 40000 && Math.abs(b.rested - 478 * 17300 / 40000) < 1e-9, "XP bar with rested overlay out to XP + rested").toBeTruthy();
  expect(b.xpText === "Level 42  12.3K / 40.0K (30%)  rested 5.0K", `XP text (got ${b.xpText})`).toBeTruthy();
  expect(b.xpTextShown === false, "text shows on hover only by default").toBeTruthy();
  addon.eval("Vanguard_xpbar:GetScript('OnEnter')(Vanguard_xpbar)");
  expect(addon.eval("return Vanguard_xpbar.text:IsShown()") === true, "hovering shows it").toBeTruthy();
  expect(b.rep === 1200 && b.repMax === 6000 && b.repColor[1] === 0.6, "reputation within the current standing, friendly green").toBeTruthy();
  expect(b.repText === "TEST-ONLY Faction  1.2K / 6.0K (20%)", `reputation text (got ${b.repText})`).toBeTruthy();
  addon.eval("__maxLevel = true; __faction = nil");
  addon.fire("PLAYER_XP_UPDATE");
  addon.fire("UPDATE_FACTION");
  const after = bars(addon);
  expect(after.xpShown === false && after.repShown === false, "XP hides at max level; reputation hides with nothing watched").toBeTruthy();
  const movers = addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[#out + 1] = m.key end return out");
  expect(movers.includes("xpbar") && movers.includes("repbar"), "both bars are movable").toBeTruthy();
});

// Where each bar's text sits: its anchor point, the bar point it is on, and its x offset.
const textPlace = (addon) => addon.eval(`local out = {}
  for i, bar in ipairs({ Vanguard_xpbar, Vanguard_repbar }) do local p, _, rel, x = bar.text:GetPoint(1) out[i] = { p, rel, x } end
  return out`);
it("data bar texts: on thin bars the XP text goes to the left end and the reputation text to the right, so they never overlap", () => {
  const addon = loggedIn(DATA_ENV, { savedVariables: "VanguardDB.profiles = { Default = { DataBars = { text = 'always' } } }" });
  expect(textPlace(addon), "6 px bars under 10 px text: each at its own end, a cell gap in").toEqual([["LEFT", "LEFT", 4], ["RIGHT", "RIGHT", -4]]);
  addon.eval("ns.SetMoverSize('xpbar', 'height', 20)");
  expect(textPlace(addon)[0], "a bar as tall as its text: centred again").toEqual(["CENTER", "CENTER", 0]);
  addon.eval("ns.SetMoverSize('xpbar', 'height', 12) ns.Theme.Settings().textScale = 1.3 ns.Theme.Refresh()");
  expect(textPlace(addon)[0], "a larger text size than the bar: back to its end").toEqual(["LEFT", "LEFT", 4]);
});

// The game's standing words (GlobalStrings), and a female form for one, as GetText gives them.
const STANDINGS_ENV = `
  for i, w in ipairs({ "Hated", "Hostile", "Unfriendly", "Neutral", "Friendly", "Honored", "Revered", "Exalted" }) do _G["FACTION_STANDING_LABEL" .. i] = w end
  UnitSex = function() return __sex or 2 end
  GetText = function(key, sex) return sex == 3 and key == "FACTION_STANDING_LABEL5" and "TEST-ONLY Friendly (her)" or _G[key] end
  __opened = {} ToggleCharacter = function(tab) __opened[#__opened + 1] = tab end`;
// The tooltip's lines on hover over the reputation bar, "left | right".
const repTip = (addon) => addon.eval(`Vanguard_repbar:GetScript("OnEnter")(Vanguard_repbar)
  local out = {} for i, l in ipairs(GameTooltip.__lines or {}) do out[i] = l.right and (l.text .. " | " .. l.right) or l.text end return out`);

it("the reputation bar's numbers start with the standing", () => {
  const addon = loggedIn(DATA_ENV + STANDINGS_ENV);
  expect(bars(addon).repText).toBe("TEST-ONLY Faction  Friendly  1.2K / 6.0K (20%)");
});

it("the reputation bar's tooltip: standing, what the next one needs, how far through, and the click", () => {
  const addon = loggedIn(DATA_ENV + STANDINGS_ENV);
  expect(repTip(addon)).toEqual(["TEST-ONLY Faction", "Standing | Friendly", "To Honored | 4.8K", "Through this standing | 20%", "Click: the reputation list"]);
  addon.eval("Vanguard_repbar:GetScript('OnLeave')(Vanguard_repbar)");
  expect(addon.eval("return GameTooltip:IsShown()"), "leaving hides it").toBe(false);
});

it("the reputation bar names the standing in your character's form of the word", () => {
  const addon = loggedIn(DATA_ENV + STANDINGS_ENV + "\n  __sex = 3");
  expect(bars(addon).repText).toBe("TEST-ONLY Faction  TEST-ONLY Friendly (her)  1.2K / 6.0K (20%)");
});

it("the tooltip switch turns the reputation bar's tooltip off too", () => {
  const addon = loggedIn(DATA_ENV + STANDINGS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { DataBars = { tooltip = false } } }" });
  repTip(addon);
  expect(addon.eval("return GameTooltip:IsShown()")).toBe(false);
});

it("at Exalted the reputation bar is full and reads just the faction and its standing, whatever range the game gives", () => {
  const addon = loggedIn(DATA_ENV + STANDINGS_ENV + `
  __faction = { name = "TEST-ONLY Faction", reaction = 8, currentReactionThreshold = 42000, nextReactionThreshold = 42999, currentStanding = 42999 }`);
  const b = bars(addon);
  expect([b.rep, b.repMax, b.repText, repTip(addon)]).toEqual([1, 1, "TEST-ONLY Faction  Exalted", ["TEST-ONLY Faction", "Standing | Exalted", "Click: the reputation list"]]);
});

it("an empty range the game gives below Exalted reads as full, with no numbers", () => {
  const addon = loggedIn(DATA_ENV + STANDINGS_ENV + `
  __faction = { name = "TEST-ONLY Faction", reaction = 7, currentReactionThreshold = 21000, nextReactionThreshold = 21000, currentStanding = 21000 }`);
  const b = bars(addon);
  expect([b.rep, b.repMax, b.repText]).toEqual([1, 1, "TEST-ONLY Faction  Revered"]);
});

it("a reputation range the client hides never reads as maxed: an empty bar with the standing and no numbers", () => {
  const addon = loggedIn(DATA_ENV + STANDINGS_ENV + `
  __faction = { name = "TEST-ONLY Faction", reaction = 5, currentReactionThreshold = { __secret = true }, nextReactionThreshold = { __secret = true }, currentStanding = 4200 }`);
  const b = bars(addon);
  expect([b.rep, b.repText, repTip(addon)]).toEqual([0, "TEST-ONLY Faction  Friendly", ["TEST-ONLY Faction", "Standing | Friendly", "Click: the reputation list"]]);
});

it("a standing the client hides names no standing, and the bar takes Neutral's colour", () => {
  const addon = loggedIn(DATA_ENV + STANDINGS_ENV + `
  __faction = { name = "TEST-ONLY Faction", reaction = { __secret = true }, currentReactionThreshold = 0, nextReactionThreshold = 100, currentStanding = { __secret = true } }`);
  const neutral = loggedIn(DATA_ENV + `
  __faction = { name = "TEST-ONLY Faction", reaction = 4, currentReactionThreshold = 0, nextReactionThreshold = 100, currentStanding = 0 }`);
  expect([bars(addon).repText, repTip(addon), bars(addon).repColor]).toEqual(["TEST-ONLY Faction  0 / 100 (0%)", ["TEST-ONLY Faction", "To the next standing | 100", "Through this standing | 0%", "Click: the reputation list"], bars(neutral).repColor]);
});

it("a left-click on the reputation bar opens the reputation list; a right-click doesn't", () => {
  const addon = loggedIn(DATA_ENV + STANDINGS_ENV);
  for (const button of ["LeftButton", "RightButton"]) addon.eval(`Vanguard_repbar:GetScript("OnMouseUp")(Vanguard_repbar, "${button}")`);
  expect(addon.eval("return __opened")).toEqual(["ReputationFrame"]);
});

it("in a fight a click on the reputation bar opens nothing, and chat and the tooltip say so", () => {
  const addon = loggedIn(DATA_ENV + STANDINGS_ENV);
  setCombat(addon, true);
  addon.eval('Vanguard_repbar:GetScript("OnMouseUp")(Vanguard_repbar, "LeftButton")');
  expect([addon.eval("return #__opened"), chatHas(addon, /The reputation list doesn't open from Vanguard in a fight/), repTip(addon).at(-1)]).toEqual([0, true, "Click: the reputation list (not in a fight)"]);
});

it("at the level cap the reputation bar takes the XP bar's spot, unless it was moved", () => {
  const addon = loggedIn(DATA_ENV);
  // How high the reputation bar sits above the screen's bottom.
  const repY = () => addon.eval("return Vanguard_repbar.__points.BOTTOM.y");
  expect(repY(), "while levelling it sits above the XP bar").toBe(12);
  addon.eval("__maxLevel = true");
  addon.fire("PLAYER_LEVEL_UP");
  expect(repY(), "at the cap it moves down into the XP bar's spot").toBe(4);
  addon.eval('ns.SetMoverPoint("repbar", "BOTTOM", "BOTTOM", 0, 300) __maxLevel = false');
  addon.fire("PLAYER_XP_UPDATE");
  expect(repY(), "a spot the player picked stays").toBe(300);
});

it("with the XP bar turned off the reputation bar starts in the XP bar's spot", () => {
  const addon = loggedIn(DATA_ENV, { savedVariables: "VanguardDB.profiles = { Default = { DataBars = { xp = false } } }" });
  expect(addon.eval("return Vanguard_repbar.__points.BOTTOM.y")).toBe(4);
});
