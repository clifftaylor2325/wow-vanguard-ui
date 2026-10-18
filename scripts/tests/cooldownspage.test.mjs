// cooldownspage: the Cooldowns options page and its setup wizard (Core/OptionsCooldowns.lua), in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { CLICK_LUA, TOOLS_ENV, UNITS_ENV, loggedIn, setCombat } from "./helpers.mjs";

// TEST-ONLY: a client with the Cooldown Manager available.
const CDM_ENV = "C_CooldownViewer = { IsCooldownViewerAvailable = function() return true end }\n";
const WZ = "ns.Options.CooldownWizard";
// The Cooldown Manager's settings in the profile, as a list: manager, look, gaps, tracked, glow, percent.
const saved = (addon) => addon.eval(`local g, c, l = ns.Settings("GameTools", {}), ns.Settings("CooldownGaps", {}), ns.Settings("CooldownGlow", {})
  return { g.essential or false, g.cooldowns, c.on, c.tracked, l.glow, l.percent }`);
// Opens the wizard and returns the add-on.
function wizard() {
  const addon = loggedIn(UNITS_ENV + TOOLS_ENV + CDM_ENV + CLICK_LUA);
  addon.slash("cooldowns setup");
  return addon;
}
// The wizard's showing widgets' captions, in order.
const shown = (addon) => addon.eval(`local out = {} for _, w in ipairs(${WZ}.frame.steps[${WZ}.step]) do
  out[#out + 1] = (w.label or w.text or w.caption).__text end return out`);
// A row's tooltip on hover: the shown flag and the first line.
const hover = (addon, caption) => addon.eval(`for _, w in ipairs(__wfgStub.frames) do
  if w.label and w.label.__text == "${caption}" and w:IsVisible() and w.__scripts.OnEnter then w.__scripts.OnEnter(w)
    return { GameTooltip:IsShown(), (GameTooltip.__lines[1] or {}).text or false } end end`);

it("cooldowns page: the settings moved off Combat tools, which points here; the page has a card each and a setup button", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_ENV + CDM_ENV + CLICK_LUA);
  // The captions of a page's rows, by its index in the page list.
  const labels = (page) => addon.eval(`local out = {} for _, r in ipairs(ns.Options.PAGES[${page}].rows()) do out[#out + 1] = r[2] end return out`);
  // A page's index in the page list.
  const index = (key) => addon.eval(`for i, p in ipairs(ns.Options.PAGES) do if p.key == "${key}" then return i end end`);
  const tools = labels(index("tools")).join("|");
  expect([/Cooldown Manager|Cooldown gaps|Glow/.test(tools.replace("The Cooldown Manager, the gaps row and the buff glow are on the Cooldowns page.", ""))], "Combat tools keeps none of them").toEqual([false]);
  expect(tools.includes("on the Cooldowns page"), "and says where they went").toBe(true);
  expect(labels(index("cooldowns")), "the page: setup, the manager, the gaps row, the glow").toEqual([
    "Set up cooldowns", "The game's manager", "Show the game's manager", "Vanguard look (reload)", "Gaps row", "Gaps row (reload)",
    "Add the manager's cooldowns (reload)", "Choose items and spells for the row with /vg gaps add and /vg gaps spell add.", "Buff glow",
    "Glow a buff near its end", "Glow when this much is left"]);
  expect(saved(addon), "nothing is saved until you change it").toEqual([false, true, false, false, false, 30]);
});

it("cooldowns page: a row's detail is its tooltip, and a client with no tooltip shows none", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_ENV + CDM_ENV + CLICK_LUA);
  addon.slash("cooldowns");
  expect(addon.eval("return Vanguard_Options:IsShown() and ns.Options.current"), "/vg cooldowns opens the page").toBe("cooldowns");
  expect(hover(addon, "Gaps row (reload)"), "the gaps switch explains itself").toEqual([true, expect.stringContaining("A row of icons for what the game's manager misses")]);
  addon.eval("GameTooltip = nil");
  expect(addon.eval(`for _, w in ipairs(__wfgStub.frames) do
    if w.label and w.label.__text == "Gaps row (reload)" and w:IsVisible() then w.__scripts.OnEnter(w) w.__scripts.OnLeave(w) return true end end`), "without GameTooltip nothing shows and nothing errors").toBe(true);
});

it("cooldowns page: the buttons and switches change the same saved settings as before", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_ENV + CDM_ENV + CLICK_LUA);
  addon.eval('ns.Options.Show("cooldowns")');
  for (const label of ["Show the game's manager", "Vanguard look", "Gaps row (reload)", "Add the manager's", "Glow a buff near its end"]) addon.eval(`__click("${label}")`);
  expect(saved(addon), "each switch flipped its own setting").toEqual([true, false, true, true, true, 30]);
  addon.eval('__click("Set up cooldowns")');
  expect(addon.frame("Vanguard_CooldownWizard").visible, "Set up cooldowns opens the wizard").toBe(true);
});

it("cooldowns wizard: three steps, the same switches, Back and Done, nothing changed by clicking through", () => {
  const addon = wizard();
  expect(addon.frame("Vanguard_CooldownWizard").visible, "/vg cooldowns setup opens it").toBe(true);
  expect(addon.frame(`${WZ}.frame.caption`).text, "step 1 of 3").toBe("Step 1 of 3 · Show it");
  expect(shown(addon), "step 1: the manager's two switches").toEqual(["Show the game's manager", "Vanguard look (reload)"]);
  addon.eval(`${WZ}.frame.next:GetScript("OnClick")(${WZ}.frame.next)`);
  expect(shown(addon), "step 2: the gaps row's two").toEqual(["Gaps row (reload)", "Add the manager's cooldowns (reload)"]);
  addon.eval(`${WZ}.frame.back:GetScript("OnClick")(${WZ}.frame.back)`);
  addon.eval(`${WZ}.frame.back:GetScript("OnClick")(${WZ}.frame.back)`);
  expect(addon.eval(`return ${WZ}.step`), "Back stops at the first step").toBe(1);
  for (let i = 0; i < 2; i++) addon.eval(`${WZ}.Next()`);
  expect([shown(addon), addon.eval(`return ${WZ}.frame.next.text:GetText()`)], "step 3: the glow, and Next is Done").toEqual([["Glow a buff near its end", "Glow when this much is left"], "Done"]);
  addon.eval(`${WZ}.Next()`);
  expect([addon.frame("Vanguard_CooldownWizard").visible, saved(addon)], "Done closes it; the saved settings are the defaults").toEqual([false, [false, true, false, false, false, 30]]);
});

it("cooldowns wizard: a switch in it is the page's switch, and in a fight it waits for the fight to end", () => {
  const addon = wizard();
  addon.eval('__click("Show the game\'s manager")');
  expect(saved(addon)[0], "ticking the manager in the wizard saves the same setting").toBe(true);
  addon.eval(`${WZ}.frame:Hide()`);
  setCombat(addon, true);
  addon.slash("cooldowns setup");
  expect(addon.frame("Vanguard_CooldownWizard").visible, "in combat it stays closed").toBe(false);
  setCombat(addon, false);
  expect(addon.frame("Vanguard_CooldownWizard").visible, "and opens when the fight ends").toBe(true);
});
