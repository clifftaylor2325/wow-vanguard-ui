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

it("the reputation bar names the standing and explains itself on hover", () => {
  const addon = loggedIn(DATA_ENV + STANDINGS_ENV);
  expect(bars(addon).repText, "the standing word after the faction").toBe("TEST-ONLY Faction  Friendly  1.2K / 6.0K (20%)");
  expect(repTip(addon), "the standing, what the next needs, how far through, and the click").toEqual(["TEST-ONLY Faction", "Standing | Friendly", "To Honored | 4.8K", "Through this standing | 20%", "Click: the reputation list"]);
  addon.eval("Vanguard_repbar:GetScript('OnLeave')(Vanguard_repbar)");
  expect(addon.eval("return GameTooltip:IsShown()"), "leaving hides it").toBe(false);
  addon.eval("__sex = 3");
  addon.fire("UPDATE_FACTION");
  expect(bars(addon).repText, "the word in your character's form").toBe("TEST-ONLY Faction  TEST-ONLY Friendly (her)  1.2K / 6.0K (20%)");
  addon.eval("ns.GetModule('DataBars').settings.tooltip = false GameTooltip:Hide()");
  repTip(addon);
  expect(addon.eval("return GameTooltip:IsShown()"), "the tooltip switch turns it off").toBe(false);
});

it("the reputation bar at the top standing: a full bar and its name, with no range to show", () => {
  const addon = loggedIn(DATA_ENV + STANDINGS_ENV + `
  __faction = { name = "TEST-ONLY Faction", reaction = 8, currentReactionThreshold = 42000, nextReactionThreshold = 42000, currentStanding = 42999 }`);
  const b = bars(addon);
  expect([b.rep, b.repMax, b.repText], "full, no numbers").toEqual([1, 1, "TEST-ONLY Faction  Exalted"]);
  expect(repTip(addon), "just the standing").toEqual(["TEST-ONLY Faction", "Standing | Exalted", "Click: the reputation list"]);
  addon.eval("__faction = { name = 'TEST-ONLY Faction', reaction = 9, currentReactionThreshold = 0, nextReactionThreshold = 100, currentStanding = { __secret = true } }");
  addon.fire("UPDATE_FACTION");
  expect([bars(addon).repText, repTip(addon)[1]], "a standing the game has no word for, and a hidden figure, read plainly").toEqual(["TEST-ONLY Faction  0 / 100 (0%)", "To the next standing | 100"]);
});

it("a click on the reputation bar opens the reputation list, out of a fight", () => {
  const addon = loggedIn(DATA_ENV + STANDINGS_ENV);
  // Clicks the reputation bar with a mouse button.
  const click = (button) => addon.eval(`Vanguard_repbar:GetScript("OnMouseUp")(Vanguard_repbar, "${button}")`);
  click("LeftButton");
  click("RightButton");
  expect(addon.eval("return __opened"), "a left-click opens it; a right-click doesn't").toEqual(["ReputationFrame"]);
  setCombat(addon, true);
  click("LeftButton");
  expect([addon.eval("return #__opened"), chatHas(addon, /The reputation list doesn't open from Vanguard in a fight/), repTip(addon).at(-1)], "in a fight: nothing opens, chat says so, the hint too").toEqual([1, true, "Click: the reputation list (not in a fight)"]);
});

