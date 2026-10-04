// visibility: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Core/Visibility.lua: visibility settings compiled to macro-conditional state drivers,
// on the action bars, the info strip, the data bars and the menu strip.

import { expect, it } from "vitest";
import { ACTIONS_ENV, DATA_ENV, MICRO_ENV, STRIPS_ENV, STRIP_ENV, TIDY_ENV, UI_ENV, UNITS_ENV, loggedIn, setCombat } from "./helpers.mjs";

// The state a setting compiles to, from Lua values.
const state = (addon, mode, when = "nil") => addon.eval(`return ns.Visibility.State(${mode}, ${when})`);

it("a visibility setting compiles to one macro-conditional state; the old four mean what they meant", () => {
  const addon = loggedIn();
  expect([state(addon, '"always"'), state(addon, "nil"), state(addon, '"TEST-ONLY-unknown"'), state(addon, '"hidden"')], "Always (also unset or unknown) shows; Hidden hides").toEqual(["show", "show", "show", "hide"]);
  expect(state(addon, '"combat"'), "In combat").toBe("[combat] show; hide");
  expect(state(addon, '"mouseover"'), "On mouseover: shown, faded until the mouse is over it").toBe("fade");
  expect(state(addon, '"custom"', "{ resting = true, vehicle = true, raid = true, group = true, combat = true }"), "every macro condition, in the checklist's order")
    .toBe("[combat] show; [group] show; [group:raid] show; [vehicleui] show; [resting] show; hide");
  expect(state(addon, '"custom"', "{ combat = true, mouseover = true }"), "Mouseover with a condition: shown on it, else faded").toBe("[combat] show; fade");
  expect(state(addon, '"custom"', "{}"), "an empty checklist shows always").toBe("show");
  expect(state(addon, '"custom"'), "and so does a missing one").toBe("show");
  expect(state(addon, '"combat"', "{ group = true }"), "a preset ignores the checklist saved beside it").toBe("[combat] show; hide");
  expect(addon.eval('local V = ns.Visibility return { V.Driver("[combat] show; fade"), V.Driver("fade"), V.Driver("[group] show; hide") }'), "a fading state's secure driver always shows").toEqual(["show", "show", "[group] show; hide"]);
  expect(state(addon, '"custom"', "{ instance = true, combat = true }"), "outside an instance, In an instance doesn't hold").toBe("[combat] show; hide");
  addon.eval("IsInInstance = function() return true, 'party' end");
  expect(state(addon, '"custom"', "{ instance = true, combat = true }"), "inside one it does: always shown").toBe("show");
  const modes = addon.eval("local V = ns.Visibility return { V.ModeOf({}), V.ModeOf({ mouseover = true }), V.ModeOf({ combat = true }), V.ModeOf({ group = true }), V.ModeOf({ combat = true, group = true }) }");
  expect(modes, "a checklist is saved as the old mode it equals").toEqual(["always", "mouseover", "combat", "custom", "custom"]);
});

// Bar n's secure visibility driver, state driver, state, alpha and mouse.
const bar = (addon, n = 2) => addon.eval(`local b = ForeverUI_Bar${n}
  return { driver = b.__states.visibility, state = b.__states.fuivis, now = b.fuiState, alpha = b:GetAlpha(), mouse = b.__mouse == true }`);

// The visibility settings of bar n as saved.
const saved = (addon, n = 2) => addon.eval(`local b = ForeverUIDB.profiles.Default.ActionBars.bars[${n}] return { b.visibility or "none", b.showWhen or {} }`);

// TEST-ONLY: clicks the chip `label` on bar n's checklist row (the options window open on the action bar page).
const chip = (addon, n, label) => addon.eval(`
  for _, w in ipairs(__wfgStub.frames) do
    if w.chips and w.acc.tbl() == ForeverUIDB.profiles.Default.ActionBars.bars[${n}] then
      for _, s in ipairs(w.chips) do if s.text:GetText() == "${label}" then s:GetScript("OnClick")(s) end end
      local lit = {} for _, s in ipairs(w.chips) do if s.fill:IsShown() then lit[#lit + 1] = s.text:GetText() end end
      return table.concat(lit, ",")
    end
  end`);

it("action bars: the checklist row in the options sets a bar's conditions, and the client's state drives it", () => {
  const addon = loggedIn(ACTIONS_ENV);
  addon.eval('ns.Options.Show("actionbars")');
  expect(chip(addon, 2, "TEST-ONLY none"), "the row shows nothing checked for a bar shown always").toBe("");
  expect(chip(addon, 2, "Group"), "checking Group lights it").toBe("Group");
  expect(saved(addon), "and saves the checklist").toEqual(["custom", { group: true }]);
  expect(bar(addon), "the bar shows only in a group").toMatchObject({ driver: "[group] show; hide", state: "[group] show; hide", now: "hide", alpha: 1, mouse: false });
  chip(addon, 2, "Combat");
  expect(bar(addon).driver, "in combat or in a group").toBe("[combat] show; [group] show; hide");
  expect(chip(addon, 2, "Group"), "unchecking Group leaves Combat").toBe("Combat");
  expect(saved(addon)[0], "saved as In combat, as before the checklist").toBe("combat");
  expect(addon.eval(`local rows = {} for _, w in ipairs(__wfgStub.frames) do if w.caption == "Visibility" and w.dropdown then rows[#rows + 1] = w end end
    return rows[2].dropdown.text:GetText()`), "bar 2's Visibility row says so").toBe("In combat");
  chip(addon, 2, "Mouseover");
  expect(bar(addon), "In combat or on mouseover: always shown, faded out of combat").toMatchObject({ driver: "show", state: "[combat] show; fade", now: "fade", alpha: 0, mouse: true });
  addon.eval('ForeverUI_Bar2:SetAttribute("state-fuivis", "show")');
  expect(bar(addon).alpha, "the client says combat started: the bar shows").toBe(1);
  addon.eval('ForeverUI_Bar2:SetAttribute("state-fuivis", "fade")');
  expect(bar(addon).alpha, "combat ended: faded again").toBe(0);
  addon.eval("local b = ForeverUI_Bar2Button1 b:GetScript('OnEnter')(b)");
  expect(bar(addon).alpha, "until the mouse is over it").toBe(1);
  addon.eval('ForeverUI_Bar2:SetAttribute("TEST-ONLY-other", 1)');
  expect(bar(addon).now, "other attributes leave the state alone").toBe("fade");
});

it("action bars: a bar shown on a checklist shows while you drag a spell, and follows instances on zone changes", () => {
  const addon = loggedIn(ACTIONS_ENV + "IsInInstance = function() return __inside == true, 'none' end",
    { savedVariables: 'ForeverUIDB.profiles.Default = { ActionBars = { bars = { [2] = { enabled = true, buttons = 12, perRow = 12, visibility = "custom", showWhen = { instance = true, raid = true } } } } }' });
  expect(bar(addon).driver, "outside an instance: in a raid only").toBe("[group:raid] show; hide");
  addon.fire("ACTIONBAR_SHOWGRID");
  expect(bar(addon).driver, "picking up a spell shows it").toBe("show");
  addon.fire("ACTIONBAR_HIDEGRID");
  expect(bar(addon).driver, "dropping it restores its driver").toBe("[group:raid] show; hide");
  addon.eval("__inside = true");
  addon.fire("ZONE_CHANGED_NEW_AREA");
  expect(bar(addon).driver, "entering an instance shows it").toBe("show");
  addon.eval("__inside = false");
  setCombat(addon, true);
  addon.fire("PLAYER_ENTERING_WORLD");
  expect(bar(addon).driver, "a zone change in a fight waits").toBe("show");
  setCombat(addon, false);
  expect(bar(addon).driver, "and applies when it ends").toBe("[group:raid] show; hide");
  expect(bar(addon, 1).driver, "a bar that doesn't check In an instance is left alone").toBe("show");
});

it("the state the client reports at registration comes from its own parser when it has one", () => {
  const addon = loggedIn(ACTIONS_ENV + '__parsed = {} SecureCmdOptionParse = function(s) __parsed[s] = true return "show" end',
    { savedVariables: 'ForeverUIDB.profiles.Default = { ActionBars = { bars = { [2] = { enabled = true, buttons = 12, perRow = 12, visibility = "combat" } } } }' });
  expect([bar(addon).now, addon.eval('return __parsed["[combat] show; hide"]')], "the client's answer for the bar's state").toEqual(["show", true]);
});

// The info strip's state, shown flag, alpha and mouse motion.
const strip = (addon) => addon.eval(`local f = ForeverUI_InfoStrip
  return { state = f.__states.fuivis, shown = f:IsShown(), alpha = f:GetAlpha(), motion = f.__mouseMotion == true, click = f.__mouseClick }`);

// TEST-ONLY: runs the setter of the row `label` on the "more" options page with a Lua value.
const setRow = (addon, label, lua) => addon.eval(`
  for _, p in ipairs(ns.Options.PAGES) do if p.key == "more" then
    for _, row in ipairs(p.rows()) do if row[2] == "${label}" then row[5](${lua}) return true end end
  end end
  return false`);

it("info strip: Always by default; in combat, on mouseover or hidden from its options, live", () => {
  const addon = loggedIn(UNITS_ENV + STRIP_ENV);
  expect(strip(addon), "shown always, nothing watching the mouse").toMatchObject({ state: "show", shown: true, alpha: 1, motion: false });
  expect(setRow(addon, "Strip visibility", '"combat"'), "the strip's Visibility row").toBe(true);
  expect(strip(addon), "In combat: hidden out of combat").toMatchObject({ state: "[combat] show; hide", shown: false });
  addon.eval('ForeverUI_InfoStrip:SetAttribute("state-fuivis", "show")');
  expect(strip(addon).shown, "shown when the client says combat started").toBe(true);
  setRow(addon, "Strip visibility", '"mouseover"');
  expect(strip(addon), "On mouseover: faded, feeling the mouse but not its clicks").toMatchObject({ shown: true, alpha: 0, motion: true, click: false });
  addon.hover("ForeverUI_InfoStrip");
  expect(strip(addon).alpha, "the mouse over it shows it").toBe(1);
  addon.hover(null);
  expect(strip(addon).alpha, "and leaving fades it").toBe(0);
  setRow(addon, "Strip visibility", '"hidden"');
  expect(strip(addon).shown, "Hidden").toBe(false);
  addon.eval('ns.GetModule("InfoStrip").Paint("clock")');
  expect(strip(addon).shown, "a block repainting doesn't bring it back").toBe(false);
  setRow(addon, "Strip visibility", '"always"');
  expect(strip(addon), "back to Always").toMatchObject({ shown: true, alpha: 1 });
});

it("data bars: one visibility for both; a hidden bar stays hidden at max level", () => {
  const addon = loggedIn(DATA_ENV, { savedVariables: 'ForeverUIDB.profiles.Default = { DataBars = { visibility = "custom", showWhen = { resting = true } } }' });
  // Both bars shown, and their state.
  const shown = () => addon.eval("return { ForeverUI_xpbar:IsShown(), ForeverUI_repbar:IsShown(), ForeverUI_xpbar.__states.fuivis }");
  expect(shown(), "only while resting").toEqual([false, false, "[resting] show; hide"]);
  addon.eval('ForeverUI_xpbar:SetAttribute("state-fuivis", "show") ForeverUI_repbar:SetAttribute("state-fuivis", "show")');
  expect(shown().slice(0, 2), "resting: both show").toEqual([true, true]);
  addon.eval("__maxLevel = true");
  addon.fire("PLAYER_XP_UPDATE");
  expect(shown()[0], "the XP bar still hides at max level").toBe(false);
  setRow(addon, "XP and reputation bars", '"always"');
  expect(shown(), "Always, from the options").toEqual([false, true, "show"]);
  const repOnly = loggedIn(DATA_ENV, { savedVariables: 'ForeverUIDB.profiles.Default = { DataBars = { xp = false, visibility = "hidden" } }' });
  expect(repOnly.eval("return { ForeverUI_xpbar == nil, ForeverUI_repbar:IsShown() }"), "with the XP bar off, the reputation bar still gets its setting").toEqual([true, false]);
});

it("menu strip: its Always/On mouseover setting is the visibility setting; In combat drives the strip securely", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV);
  // The menu strip's secure driver, alpha and mouse motion.
  const menu = () => addon.eval("local s = ForeverUI_MenuStrip return { s.__states.visibility, s:GetAlpha(), s.__mouseMotion == true }");
  expect(menu(), "Always by default").toEqual(["show", 1, false]);
  expect(setRow(addon, "Game menu buttons", '"combat"'), "the row applies at once").toBe(true);
  expect(menu(), "In combat: the client shows and hides it").toEqual(["[combat] show; hide", 1, false]);
  setRow(addon, "Game menu buttons", '"mouseover"');
  expect(menu(), "On mouseover, now without a reload").toEqual(["show", 0, true]);
  expect(addon.eval("return ForeverUIDB.profiles.Default.MenuStrip.menu"), "saved where it always was").toBe("mouseover");
});
