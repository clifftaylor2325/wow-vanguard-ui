// bars: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { ACTIONS_ENV, SETUP_DONE, UNITS_ENV, bars, button, chatHas, key, loggedIn, overlaps, setCombat } from "./helpers.mjs";

it("action bars", () => {
  const addon = loggedIn(ACTIONS_ENV);
  const bars = addon.eval("local out = {} for n = 1, 8 do out[n] = _G['Vanguard_Bar' .. n] ~= nil end return out");
  expect(JSON.stringify(bars) === JSON.stringify([true, true, true, false, false, false, false, false]), "bars 1-3 on by default; the right-edge bars 4-5 and bars 6-8 off").toBeTruthy();
  const b1 = button(addon, 1, 1);
  expect(b1.type === "action" && b1.action === 1 && b1.icon === "TEST-ONLY-A", "bar 1 button 1 is secure action slot 1 with its icon").toBeTruthy();
  expect(b1.hotkey === "1" && b1.checked === true, "hotkey text; the current action is checked").toBeTruthy();
  const b2 = button(addon, 1, 2);
  expect(b2.hotkey === "S2" && b2.count === "5", "SHIFT-2 shows as S2; counts above 1 show").toBeTruthy();
  expect(b2.color[2] === 1 && b2.color[0] === 0.4, "out of power tints blue").toBeTruthy();
  const b3 = button(addon, 1, 3);
  expect(b3.color[0] === 0.4 && b3.color[2] === 0.4, "unusable dims gray").toBeTruthy();
  expect(b3.cooldown[0]?.__secret && b3.cooldown[1]?.__secret, "a secret cooldown goes to the widget untouched").toBeTruthy();
  expect(button(addon, 1, 4).shown === false, "an empty slot hides its icon").toBeTruthy();
  expect(button(addon, 2, 1).action === 61 && button(addon, 2, 1).hotkey === "CM4", "bar 2 is slots 61-72 on MULTIACTIONBAR1; CTRL-BUTTON4 shows CM4").toBeTruthy();
  const o = addon.eval("return __overrides");
  expect(o["1"] === "Vanguard_Bar1Button1:LeftButton" && o["SHIFT-2"] === "Vanguard_Bar1Button2:LeftButton", "default bindings click the Vanguard buttons").toBeTruthy();
  expect(o["CTRL-BUTTON4"] === "Vanguard_Bar2Button1:LeftButton", "bar 2 bindings too").toBeTruthy();
  expect(/\[vehicleui\]/.test(addon.eval("return Vanguard_Bar1.__states.page")), "bar 1 has a secure page driver").toBeTruthy();
  expect(addon.eval("return Vanguard_Bar2.__states.page") === null, "other bars don't page").toBeTruthy();
  expect(addon.eval("return MainMenuBar:GetParent():IsShown()") === false, "the default main bar is hidden").toBeTruthy();
  const movers = addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[#out + 1] = m.key end return out");
  expect(["bar1", "bar2", "bar3"].every((k) => movers.includes(k)), "every bar is movable").toBeTruthy();
});

// Each action bar's default y offset (bottom-center stack), bars 1-8; null when off or not stacked.
const stackY = (addon) => addon.eval(`local out = {}
  for n = 1, 8 do
    local point, _, _, y = ns.MoverPoint("bar" .. n)
    out[n] = point == "BOTTOM" and y or false
  end
  return out`);

it("reagent and item counts show even at 0 and 1", () => {
  const addon = loggedIn(ACTIONS_ENV + `
    __actions[1].count = 0 __actions[1].reagent = true
    __actions[2].count = 1 __actions[2].stack = true
    __actions[3].count = 1
    __actions[4] = { tex = "TEST-ONLY-D", count = 0, usable = true, reagent = { __secret = true } }
    IsConsumableAction = function(slot) return (__actions[slot] or {}).reagent end
    IsStackableAction = function(slot) return (__actions[slot] or {}).stack == true end`);
  // The count text on bar 1's button n.
  const count = (n) => addon.eval(`return Vanguard_Bar1Button${n}.count:GetText()`);
  expect(count(1), "a spell out of its reagent shows 0").toBe("0");
  expect(count(2), "the last potion shows 1").toBe("1");
  expect(count(3), "a plain action with one charge shows nothing").toBe("");
  expect(count(4), "a hidden answer counts as not used up").toBe("");
});

it("counts show on a client without the deprecated GetActionCount (C_ActionBar.GetActionUseCount)", () => {
  const addon = loggedIn(ACTIONS_ENV + "GetActionCount = nil C_ActionBar.GetActionUseCount = function(slot) return (__actions[slot] or {}).count or 0 end");
  expect([button(addon, 1, 2).count, button(addon, 1, 1).count], "a stack of 5 shows 5; nothing to count shows nothing").toEqual(["5", ""]);
});

it("action bars stack with bar 1 on top", () => {
  const addon = loggedIn(ACTIONS_ENV);
  expect(JSON.stringify(stackY(addon)) === JSON.stringify([104, 64, 24, false, false, false, false, false]), `bar 3 at the bottom, bar 1 on top (got ${JSON.stringify(stackY(addon))})`).toBeTruthy();
  const six = loggedIn(ACTIONS_ENV, { savedVariables: "VanguardDB = { profiles = { Default = { ActionBars = { bars = { [6] = { enabled = true } } } } } }" });
  const y6 = stackY(six);
  expect(y6[5] === 24 && y6[2] === 64 && y6[0] === 144, `turning on bar 6 puts it underneath; bar 1 stays on top (got ${JSON.stringify(y6)})`).toBeTruthy();
});

it("action bar stack follows button size and rows", () => {
  const big = loggedIn(ACTIONS_ENV, { savedVariables: "VanguardDB = { profiles = { Default = { ActionBars = { size = 44 } } } }" });
  expect(JSON.stringify(stackY(big).slice(0, 3)) === JSON.stringify([116, 70, 24]), "bigger buttons stack without overlapping").toBeTruthy();
  const two = loggedIn(ACTIONS_ENV, { savedVariables: "VanguardDB = { profiles = { Default = { ActionBars = { bars = { [3] = { perRow = 6 } } } } } }" });
  expect(JSON.stringify(stackY(two).slice(0, 3)) === JSON.stringify([144, 104, 24]), "a two-row bar pushes the bars above it up by its height").toBeTruthy();
});

it("a moved action bar keeps its spot until reset", () => {
  const moved = loggedIn(ACTIONS_ENV, { savedVariables: 'VanguardDB = { profiles = { Default = { positions = { bar1 = { point = "BOTTOM", relPoint = "BOTTOM", x = 0, y = 40 } } } } }' });
  expect(stackY(moved)[0] === 40, "a position you saved wins").toBeTruthy();
  moved.slash("reset all");
  expect(stackY(moved)[0] === 104, "/vg reset all puts bar 1 back on top").toBeTruthy();
});

it("the bottom stack follows per-bar size and rows, live", () => {
  const addon = loggedIn(ACTIONS_ENV, { savedVariables: "VanguardDB = { profiles = { Default = { ActionBars = { bars = { [2] = { size = 48 } } } } } }" });
  expect(JSON.stringify(stackY(addon).slice(0, 3)) === JSON.stringify([114, 64, 24]), `a bar's own button size sets its row height (got ${JSON.stringify(stackY(addon))})`).toBeTruthy();
  // Bar n's frame: its bottom offset on screen.
  const frameY = (n) => addon.eval(`return Vanguard_Bar${n}.__points.BOTTOM.y`);
  addon.eval('local AB = ns.GetModule("ActionBars") AB.settings.bars[3].perRow = 6 AB.SettingChanged(3, "perRow")');
  expect(JSON.stringify(stackY(addon).slice(0, 3)) === JSON.stringify([154, 104, 24]) && frameY(1) === 154 && frameY(2) === 104, "changing a bar's buttons per row re-stacks at once: bar 1 stays on top, nothing overlaps").toBeTruthy();
  setCombat(addon, true);
  addon.eval('local AB = ns.GetModule("ActionBars") AB.settings.bars[3].size = 48 AB.SettingChanged(3, "size")');
  expect(frameY(1) === 154, "in combat the stack waits (secure frames don't move)").toBeTruthy();
  setCombat(addon, false);
  expect(frameY(2) === 124 && frameY(1) === 174, "and re-stacks when combat ends").toBeTruthy();
  addon.eval('ns.SetMoverPoint("bar1", "BOTTOM", "BOTTOM", 0, 300) ns.Unlock() local AB = ns.GetModule("ActionBars") AB.settings.bars[3].perRow = 12 AB.SettingChanged(3, "perRow") ns.SetMoverDefault("TEST-ONLY missing", { "CENTER", "CENTER", 0, 0 })');
  expect(frameY(1) === 300 && frameY(2) === 74, "a bar you dragged keeps its spot; the others re-stack (with unlock mode on)").toBeTruthy();
  addon.eval("ns.Lock()");
});

it("action bar paging and events", () => {
  const addon = loggedIn(ACTIONS_ENV);
  // Run the secure page snippet the way the client would, with a minimal restricted env.
  addon.eval(`
    local bar = Vanguard_Bar1
    local snippet = assert(loadstring and loadstring(ns.GetModule("ActionBars").ON_PAGE) or load(ns.GetModule("ActionBars").ON_PAGE, "page", "t", setmetatable({}, { __index = _G })))
    local kids = {}
    for _, w in ipairs(__wfgStub.frames) do if w.__parent == bar then kids[#kids + 1] = w end end
    local env = { self = { SetAttribute = function() end, GetChildren = function() return unpack(kids) end }, newstate = 7, ipairs = ipairs, newtable = function(...) return { ... } end }
    if setfenv then setfenv(snippet, env) else snippet = load(ns.GetModule("ActionBars").ON_PAGE, "page", "t", env) end
    snippet()`);
  const paged = button(addon, 1, 1);
  expect(paged.action === 73 && paged.icon === "TEST-ONLY-PAGE7", "page 7 re-points button 1 to slot 73 and it refreshes").toBeTruthy();
  addon.eval('__actions[61] = { tex = "TEST-ONLY-NEW", count = 0, usable = true }');
  addon.fire("ACTIONBAR_SLOT_CHANGED", 61);
  expect(button(addon, 2, 1).icon === "TEST-ONLY-NEW", "ACTIONBAR_SLOT_CHANGED refreshes that slot").toBeTruthy();
  addon.eval('__binds.ACTIONBUTTON3 = { "Q" }');
  addon.eval("__wfgStub.inCombat = true");
  addon.fire("UPDATE_BINDINGS");
  expect(addon.eval("return __overrides.Q") === null, "binding changes wait for combat to end").toBeTruthy();
  addon.eval("__wfgStub.inCombat = false");
  addon.fire("PLAYER_REGEN_ENABLED");
  expect(addon.eval("return __overrides.Q") === "Vanguard_Bar1Button3:LeftButton" && button(addon, 1, 3).hotkey === "Q", "then they apply").toBeTruthy();
});

it("action bar dragging", () => {
  const addon = loggedIn(ACTIONS_ENV);
  // Starts a drag on bar 1 button 2; returns the slot picked up, if any.
  const drag = () => addon.eval("local b = Vanguard_Bar1Button2; b:GetScript('OnDragStart')(b); return __picked");
  expect(drag() === null, "locked buttons don't drag without Shift").toBeTruthy();
  addon.eval("IsShiftKeyDown = function() return true end");
  expect(drag() === 2, "Shift-drag picks the action up").toBeTruthy();
  addon.eval("local b = Vanguard_Bar2Button5; b:GetScript('OnReceiveDrag')(b)");
  expect(addon.eval("return __placed") === 65, "dropping onto a button places the action in its slot").toBeTruthy();
});

// TEST-ONLY: runs the setter of bar n's row `label` on the action bar options page,
// as its control would, with a Lua value; false when there is no such row.
const setBarOption = (addon, n, label, lua) => addon.eval(`
  local page, card
  for _, p in ipairs(ns.Options.PAGES) do if p.key == "actionbars" then page = p end end
  for _, row in ipairs(page.rows()) do
    if row[1] == "header" then card = row[2] end
    if card and card:match("^Bar ${n}") and row[2] == ${JSON.stringify(label)} then row[#row](${lua}) return true end
  end
  return false`);

// TEST-ONLY: what the getter of bar n's row `label` on the action bar options page says.
const getBarOption = (addon, n, label) => addon.eval(`
  local page, card
  for _, p in ipairs(ns.Options.PAGES) do if p.key == "actionbars" then page = p end end
  for _, row in ipairs(page.rows()) do
    if row[1] == "header" then card = row[2] end
    if card and card:match("^Bar ${n}") and row[2] == ${JSON.stringify(label)} then return row[#row - 1]() end
  end`);

// Bar 2's secure visibility driver, alpha, and whether it takes the mouse.
const barVis = (addon, n = 2) => addon.eval(`local bar = Vanguard_Bar${n}
  return { driver = bar.__states.visibility, alpha = bar:GetAlpha(), mouse = bar.__mouse }`);

it("action bar visibility: each mode's state driver and mouseover alpha", () => {
  const addon = loggedIn(ACTIONS_ENV);
  const start = barVis(addon);
  expect(start.driver === "show" && start.alpha === 1 && start.mouse === false, "a bar shown always: driver show, full alpha, doesn't take the mouse").toBeTruthy();
  const modes = { mouseover: "show", combat: "[combat] show; hide", hidden: "hide", always: "show" };
  for (const [mode, driver] of Object.entries(modes)) {
    expect(setBarOption(addon, 2, "Visibility", JSON.stringify(mode)), `the Visibility row sets ${mode}`).toBeTruthy();
    expect(barVis(addon).driver === driver, `${mode} registers the secure state driver "${driver}" (got ${barVis(addon).driver})`).toBeTruthy();
  }
  setBarOption(addon, 2, "Visibility", '"mouseover"');
  expect(barVis(addon).alpha === 0 && barVis(addon).mouse === true, "a mouseover bar starts faded out and takes the mouse").toBeTruthy();
  // TEST-ONLY: count every Show, Hide and SetShown on bar 2 from here on.
  addon.eval("__shows = 0 local bar = Vanguard_Bar2 bar.Show = function() __shows = __shows + 1 end bar.Hide = bar.Show bar.SetShown = bar.Show");
  setCombat(addon, true);
  addon.eval("local b = Vanguard_Bar2Button3 b:GetScript('OnEnter')(b)");
  expect(barVis(addon).alpha === 1, "hovering a button fades the bar in, in combat too").toBeTruthy();
  addon.eval("Vanguard_Bar2.__mouseOver = true local b = Vanguard_Bar2Button3 b:GetScript('OnLeave')(b)");
  expect(barVis(addon).alpha === 1, "moving off a button while still over the bar keeps it shown").toBeTruthy();
  addon.eval("Vanguard_Bar2.__mouseOver = false local bar = Vanguard_Bar2 bar:GetScript('OnLeave')(bar)");
  expect(barVis(addon).alpha === 0, "leaving the bar fades it out").toBeTruthy();
  addon.eval("local bar = Vanguard_Bar2 bar:GetScript('OnEnter')(bar)");
  expect(barVis(addon).alpha === 1 && addon.eval("return __shows") === 0, "mouseover only changes alpha: never Show, Hide or SetShown").toBeTruthy();
  setBarOption(addon, 2, "Visibility", '"combat"');
  expect(barVis(addon).driver === "show", "a visibility change made in combat waits").toBeTruthy();
  setCombat(addon, false);
  expect(barVis(addon).driver === "[combat] show; hide", "and applies when combat ends").toBeTruthy();
  addon.eval('VanguardDB.profiles.Default.ActionBars.bars[2].visibility = "TEST-ONLY-unknown" ns.GetModule("ActionBars").ApplyVisibility(2)');
  expect(barVis(addon).driver === "show" && barVis(addon).alpha === 1, "an unknown visibility counts as Always").toBeTruthy();
});

it("action bar empty slots hide until the grid shows", () => {
  const addon = loggedIn(ACTIONS_ENV + '__actions[5] = { tex = { __secret = true }, count = 0, usable = true }');
  // Button i of bar n's alpha.
  const alpha = (n, i) => addon.eval(`return Vanguard_Bar${n}Button${i}:GetAlpha()`);
  expect(alpha(1, 1) === 1 && alpha(1, 4) === 0 && alpha(2, 2) === 0, "buttons with an action show; empty slots are invisible (no empty squares at level 1)").toBeTruthy();
  expect(alpha(1, 5) === 1, "a secret icon counts as an action").toBeTruthy();
  addon.fire("ACTIONBAR_SHOWGRID");
  expect(alpha(1, 4) === 1 && alpha(2, 2) === 1, "picking up a spell or item (ACTIONBAR_SHOWGRID) shows the empty slots").toBeTruthy();
  addon.eval('__actions[4] = { tex = "TEST-ONLY-DROPPED", count = 0, usable = true }');
  addon.fire("ACTIONBAR_SLOT_CHANGED", 4);
  addon.fire("ACTIONBAR_HIDEGRID");
  expect(alpha(1, 4) === 1 && alpha(1, 6) === 0 && alpha(2, 2) === 0, "dropping it (ACTIONBAR_HIDEGRID) hides the empty slots again; the filled one stays").toBeTruthy();
  setCombat(addon, true);
  addon.eval("Vanguard_Bar1Button2:SetAttribute('action', 74)");
  expect(alpha(1, 2) === 0, "a slot that turns empty when bar 1 pages in combat hides at once (alpha, no waiting)").toBeTruthy();
});

it("the right-edge bars start off and show on mouseover when turned on", () => {
  const addon = loggedIn(ACTIONS_ENV);
  const s = addon.eval("local b = VanguardDB.profiles.Default.ActionBars.bars return { b[4].enabled, b[5].enabled, b[4].visibility, b[5].visibility }");
  expect(s[0] === false && s[1] === false && addon.eval("return Vanguard_Bar4 == nil and Vanguard_Bar5 == nil") === true, "bars 4 and 5 start off; nothing is built for them").toBeTruthy();
  expect(s[2] === "mouseover" && s[3] === "mouseover" && getBarOption(addon, 4, "Visibility") === "mouseover", "and are set to On mouseover for when they are turned on").toBeTruthy();
  const titles = addon.eval('local out = {} for _, p in ipairs(ns.Options.PAGES) do if p.key == "actionbars" then for _, r in ipairs(p.rows()) do if r[1] == "header" then out[#out + 1] = r[2] end end end end return out');
  expect(titles.includes("Bar 4, right edge") && titles.includes("Bar 5, right edge") && titles.includes("Bar 1"), `each bar has its own card; the right-edge ones say so (got ${titles})`).toBeTruthy();
  expect(setBarOption(addon, 4, "Show bar 4", "true") && addon.eval("return VanguardDB.profiles.Default.ActionBars.bars[4].enabled") === true, "Show bar 4 turns it on (after a reload)").toBeTruthy();
  const saved4 = addon.eval("local b = VanguardDB.profiles.Default.ActionBars.bars[4] return { b.enabled, b.visibility, b.buttons, b.perRow }");
  expect(JSON.stringify(saved4) === JSON.stringify([true, "mouseover", 12, 1]), `a fresh enable is saved with On mouseover (got ${JSON.stringify(saved4)})`).toBeTruthy();
  const on = loggedIn(ACTIONS_ENV, { savedVariables: 'VanguardDB = { profiles = { Default = { ActionBars = { bars = { [4] = { enabled = true, visibility = "mouseover", buttons = 12, perRow = 1 } } } } } }' });
  const bar4 = barVis(on, 4);
  expect(bar4.driver === "show" && bar4.alpha === 0 && bar4.mouse === true, "turned on, bar 4 is faded out until the mouse is over it").toBeTruthy();
  const second = on.eval("local _, _, _, x, y = Vanguard_Bar4Button2:GetPoint(1) return { x, y }");
  expect(second[0] === 0 && second[1] === -40, "one button per row, as before").toBeTruthy();
});

// TEST-ONLY profile saved before bars had a visibility setting: bar 4 was on
// (the old default), bar 5 had been turned off.
const OLD_BARS_PROFILE = `VanguardDB = { profiles = { Default = { ActionBars = { size = 36, spacing = 4, bars = {
  { enabled = true, buttons = 12, perRow = 12 }, { enabled = true, buttons = 12, perRow = 12 }, { enabled = true, buttons = 12, perRow = 12 },
  { enabled = true, buttons = 12, perRow = 1 }, { enabled = false, buttons = 12, perRow = 1 },
  { enabled = false, buttons = 12, perRow = 12 }, { enabled = false, buttons = 12, perRow = 12 }, { enabled = false, buttons = 12, perRow = 12 } } } } } }`;

it("an old profile keeps its right-edge bar on Always; a fresh enable gets On mouseover", () => {
  const old = loggedIn(ACTIONS_ENV, { savedVariables: OLD_BARS_PROFILE });
  const bar4 = barVis(old, 4);
  expect(bar4.driver === "show" && bar4.alpha === 1 && bar4.mouse === false, "bar 4, already on in the old profile, still shows always").toBeTruthy();
  expect(getBarOption(old, 4, "Visibility") === "always" && getBarOption(old, 2, "Visibility") === "always", "its Visibility reads Always; so do the other bars").toBeTruthy();
  expect(getBarOption(old, 5, "Visibility") === "mouseover", "bar 5, off in the old profile, is set to On mouseover for when it is turned on").toBeTruthy();
  setBarOption(old, 5, "Show bar 5", "true");
  // Each read goes through ns.Settings, so the upgrade runs again on what is now saved.
  const saved5 = old.eval("local b = VanguardDB.profiles.Default.ActionBars.bars[5] return { b.enabled, b.visibility }");
  expect(saved5[0] === true && saved5[1] === "mouseover" && getBarOption(old, 5, "Visibility") === "mouseover", "turning bar 5 on fresh saves On mouseover, and the upgrade leaves it (it has a saved visibility)").toBeTruthy();
  expect(getBarOption(old, 4, "Visibility") === "always", "bar 4 stays Always").toBeTruthy();
  // A new profile's fresh enable is checked in "the right-edge bars start off and show on mouseover when turned on".
});

// ACTIONS_ENV's three bars of twelve buttons hold three actions: the other 33 slots are empty.
const EMPTY_SLOTS = 33;

it("In combat bars show during a drag out of combat; a drag that starts in combat leaves secure visibility alone", () => {
  const addon = loggedIn(ACTIONS_ENV);
  setBarOption(addon, 2, "Visibility", '"combat"');
  // TEST-ONLY: count every state driver registration from here on.
  addon.eval("__regs = 0 local register = RegisterStateDriver RegisterStateDriver = function(...) __regs = __regs + 1 return register(...) end");
  addon.fire("ACTIONBAR_SHOWGRID");
  expect(barVis(addon).driver === "show" && barVis(addon, 3).driver === "show", "picking up a spell out of combat shows the In combat bar").toBeTruthy();
  expect(addon.eval("return __regs") === 1, "only the In combat bar's driver changes").toBeTruthy();
  addon.fire("ACTIONBAR_HIDEGRID");
  expect(barVis(addon).driver === "[combat] show; hide", "dropping it restores the bar's own driver").toBeTruthy();
  addon.eval("__regs = 0");
  setCombat(addon, true);
  addon.fire("ACTIONBAR_SHOWGRID");
  addon.fire("ACTIONBAR_HIDEGRID");
  expect(addon.eval("return __regs") === 0 && addon.eval("return ns.QueuedCount()") === EMPTY_SLOTS, "a drag that starts in combat changes no driver and queues only the empty slots' mouse, one entry each").toBeTruthy();
  setCombat(addon, false);
  expect(addon.eval("return __regs") === 0 && barVis(addon).driver === "[combat] show; hide", "not even after combat ends").toBeTruthy();
  addon.fire("ACTIONBAR_SHOWGRID");
  setCombat(addon, true);
  addon.fire("ACTIONBAR_HIDEGRID");
  expect(barVis(addon).driver === "show" && addon.eval("return ns.QueuedCount()") === EMPTY_SLOTS + 1, "a drag that ends after combat starts restores the driver once combat ends (and the empty slots' mouse)").toBeTruthy();
  setCombat(addon, false);
  expect(barVis(addon).driver === "[combat] show; hide", "and then it does").toBeTruthy();
});

it("mouseover bars are revealed during a drag and restored after", () => {
  const addon = loggedIn(ACTIONS_ENV);
  setBarOption(addon, 2, "Visibility", '"mouseover"');
  // TEST-ONLY: count every Show, Hide and SetShown on bar 2 from here on.
  addon.eval("__shows = 0 local bar = Vanguard_Bar2 bar.Show = function() __shows = __shows + 1 end bar.Hide = bar.Show bar.SetShown = bar.Show");
  setCombat(addon, true);
  addon.fire("ACTIONBAR_SHOWGRID");
  expect(barVis(addon).alpha === 1, "picking up a spell reveals the mouseover bar, in combat too").toBeTruthy();
  addon.fire("ACTIONBAR_HIDEGRID");
  expect(barVis(addon).alpha === 0, "dropping it fades the bar out again").toBeTruthy();
  addon.fire("ACTIONBAR_SHOWGRID");
  addon.eval("Vanguard_Bar2.__mouseOver = true");
  addon.fire("ACTIONBAR_HIDEGRID");
  expect(barVis(addon).alpha === 1, "unless the mouse is still over the bar").toBeTruthy();
  expect(addon.eval("return __shows") === 0 && addon.eval("return ns.QueuedCount()") === EMPTY_SLOTS && barVis(addon).driver === "show", "alpha only: no Show or Hide, driver unchanged; only the empty slots' mouse waits").toBeTruthy();
});

it("Hidden bar bindings stay intact", () => {
  const addon = loggedIn(ACTIONS_ENV);
  setBarOption(addon, 2, "Visibility", '"hidden"');
  expect(barVis(addon).driver === "hide", "a Hidden bar isn't drawn").toBeTruthy();
  expect(addon.eval("return __overrides['CTRL-BUTTON4']") === "Vanguard_Bar2Button1:LeftButton", "but its key still clicks its button").toBeTruthy();
  addon.fire("UPDATE_BINDINGS");
  expect(addon.eval("return __overrides['CTRL-BUTTON4']") === "Vanguard_Bar2Button1:LeftButton", "also after the bindings are rebuilt").toBeTruthy();
  const help = addon.eval('local page for _, p in ipairs(ns.Options.PAGES) do if p.key == "actionbars" then page = p end end local rows = page.rows() for i, r in ipairs(rows) do if r[2] == "Visibility" then return rows[i + 1] end end');
  expect(help[0] === "text" && /keys.*still casts/.test(help[1]), `the Visibility row's help text says so (got ${JSON.stringify(help)})`).toBeTruthy();
});

it("action bar layout: per-bar buttons, rows and size, deferred in combat", () => {
  const addon = loggedIn(ACTIONS_ENV + '__binds.MULTIACTIONBAR1BUTTON12 = { "F12" }');
  // Bar 2's size, button 7's offset and size, and whether button 12 shows.
  const lay = () => addon.eval(`local bar, b7 = Vanguard_Bar2, Vanguard_Bar2Button7
    local _, _, _, x, y = b7:GetPoint(1)
    return { w = bar:GetWidth(), h = bar:GetHeight(), x7 = x, y7 = y, size = b7:GetWidth(), shown12 = Vanguard_Bar2Button12:IsShown() }`);
  const before = lay();
  expect(JSON.stringify(before) === JSON.stringify({ w: 478, h: 38, x7: 240, y7: 0, size: 38, shown12: true }), `bar 2 starts as one row of 12 at the shared 38 px (got ${JSON.stringify(before)})`).toBeTruthy();
  expect(getBarOption(addon, 2, "Button size") === 38 && addon.eval("return __overrides.F12") === "Vanguard_Bar2Button12:LeftButton", "its size row reads the shared size; button 12 has its key").toBeTruthy();
  setCombat(addon, true);
  setBarOption(addon, 2, "Buttons per row", 6);
  setBarOption(addon, 2, "Buttons", 10);
  setBarOption(addon, 2, "Button size", 40);
  expect(JSON.stringify(lay()) === JSON.stringify(before) && addon.eval("return ns.QueuedCount()") === 3, "layout changes made in combat wait for it to end (secure frames)").toBeTruthy();
  setCombat(addon, false);
  const after = lay();
  expect(JSON.stringify(after) === JSON.stringify({ w: 250, h: 82, x7: 0, y7: -42, size: 40, shown12: false }), `then bar 2 is two rows of 6 at 40 px, showing 10 buttons (got ${JSON.stringify(after)})`).toBeTruthy();
  expect(addon.eval("return __overrides.F12") === null && getBarOption(addon, 2, "Button size") === 40, "a hidden button gives up its key; the bar keeps its own size").toBeTruthy();
  expect(addon.eval("return Vanguard_Bar3Button1:GetWidth()") === 38, "other bars keep theirs").toBeTruthy();
});

it("action button cooldowns, the C_ActionBar API and range polling", () => {
  const addon = loggedIn(ACTIONS_ENV + `
    -- TEST-ONLY: no range events, and no unit exists, so range polling does not mark buttons red.
    C_ActionBar = nil
    UnitExists = function() return false end`);
  addon.update(0.25);
  expect(addon.eval("return Vanguard_Bar1Button1.outOfRange") === false, "without range events, buttons are polled and an unknown range is not red").toBeTruthy();
  addon.eval(`
    C_ActionBar = { GetActionTexture = function() return "TEST-ONLY-CAPI" end }
    ns.GetModule("ActionBars").UpdateButton(Vanguard_Bar1Button1)
  `);
  expect(addon.eval("return Vanguard_Bar1Button1.icon.__texture") === "TEST-ONLY-CAPI", "C_ActionBar is used when it has the call").toBeTruthy();
  addon.eval(`
    -- TEST-ONLY cooldown duration object.
    GetActionCooldownDuration = function() return { __duration = true } end
    -- TEST-ONLY sweep that records the duration object.
    Vanguard_Bar1Button1.cooldown.SetCooldownFromDurationObject = function() __obj = true return true end
  `);
  addon.fire("ACTIONBAR_UPDATE_COOLDOWN");
  expect(addon.eval("return __obj") === true, "a cooldown duration object is passed straight to the sweep").toBeTruthy();
  addon.eval(`
    GetActionCooldownDuration = nil
    -- TEST-ONLY cooldown given as a table of start and duration.
    GetActionCooldown = function() return { startTime = 5, duration = 2 } end
  `);
  addon.fire("ACTIONBAR_UPDATE_COOLDOWN");
  const cd = addon.eval("return Vanguard_Bar1Button1.cooldown.__cooldown");
  expect(cd[0] === 5 && cd[1] === 2, "a cooldown given as a table uses its start and duration").toBeTruthy();
});

it("a dropped spell named by GetSpellInfo", () => {
  const addon = loggedIn(`
    -- TEST-ONLY: C_Spell is absent, so the name comes from GetSpellInfo.
    C_Spell = nil
    -- TEST-ONLY spell id on the cursor.
    GetSpellInfo = function(id) return id == 90001 and "TEST-ONLY Spark" or nil end
    GetCursorInfo = function() return "spell", nil, nil, 90001 end
    -- TEST-ONLY cursor clear, so the drop can finish.
    ClearCursor = function() __cleared = true end
  `);
  addon.eval('ns.Options.Show("clickcast")');
  addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.key == "BUTTON4" and w.iconFrame then w:GetScript("OnReceiveDrag")(w) end end');
  expect(addon.eval('local b = ns.GetModule("ClickCast").Binding("BUTTON4") return b and b.value') === "TEST-ONLY Spark", "without C_Spell.GetSpellName, a spell dropped on a cell is named by GetSpellInfo").toBeTruthy();
  expect(addon.eval("return __cleared"), "and the cursor is cleared").toBe(true);
});

it("action bar cooldown numbers in the theme's font", () => {
  const addon = loggedIn(UNITS_ENV + ACTIONS_ENV);
  const cd = addon.eval(`local cd = Vanguard_Bar1Button1.cooldown local fs = cd:GetCountdownFontString() return { font = fs.__font, color = fs.__textColor }`);
  expect(cd.font[0].includes("SemiBold") && cd.font[1] === 14, "the client's countdown numbers use the theme's bold font").toBeTruthy();
});

// TEST-ONLY: a client whose secure snippets fail to compile (the probe's call throws).
const NO_SNIPPETS = 'SecureHandlerExecute = function() error("TEST-ONLY: snippets do not compile") end\n';
// The slot bar 1's button i shows (its action attribute keeps page 1's slot without snippets).
const shownSlot = (addon, i) => addon.eval(`return Vanguard_Bar1Button${i}.action`);

it("bar 1 pages without secure snippets: the driver sets the bar's own actionpage, the buttons read it", () => {
  const addon = loggedIn(ACTIONS_ENV + NO_SNIPPETS);
  const PAGE_DRIVER = addon.eval('return ns.GetModule("ActionBars").PAGE_DRIVER');
  expect(addon.eval("local b = Vanguard_Bar1 return { b.__drivers.actionpage, b.__states == nil or b.__states.page == nil, b:GetAttribute('_onstate-page') == nil }"),
    "an attribute driver on actionpage replaces the state driver and its snippet").toEqual([PAGE_DRIVER, true, true]);
  expect(addon.eval("local b = Vanguard_Bar1Button3 return { b:GetID(), b:GetAttribute('useparent-actionpage') }"), "each button has its index as its ID and reads the page from the bar").toEqual([3, true]);
  expect(shownSlot(addon, 1), "until the driver sets a page, the button shows its own slot").toBe(1);
  addon.eval("Vanguard_Bar1:SetAttribute('actionpage', '7')");
  expect([shownSlot(addon, 1), button(addon, 1, 1).icon, shownSlot(addon, 3)], "page 7 (a stance): the buttons show slots 73 and 75").toEqual([73, "TEST-ONLY-PAGE7", 75]);
  addon.eval("Vanguard_Bar1:SetAttribute('TEST-ONLY', 1)");
  expect(shownSlot(addon, 1), "another attribute changes nothing").toBe(73);
  expect(addon.eval("local b = Vanguard_Bar2Button3 return { b:GetID(), Vanguard_Bar2.__drivers == nil or Vanguard_Bar2.__drivers.actionpage == nil }"), "the other bars keep their fixed slots").toEqual([0, true]);
  addon.eval('ns.GetModule("ActionBars").PageWithoutSnippets(Vanguard_Bar1)');
  const refreshes = addon.eval(`local AB = ns.GetModule("ActionBars") local n, update = 0, AB.UpdateButton
    AB.UpdateButton = function(b) n = n + 1 return update(b) end
    Vanguard_Bar1:SetAttribute("actionpage", "8") AB.UpdateButton = update return n`);
  expect(refreshes, "switching twice hooks the bar once: a page change refreshes each of the 12 buttons once").toBe(12);
});

it("bar 1 without secure snippets, found out after a login in a fight: the snippet paging is undone when it ends", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE });
  addon.eval(ACTIONS_ENV + NO_SNIPPETS);
  setCombat(addon, true);
  addon.login();
  setCombat(addon, false);
  expect(addon.eval("return ns.Client.has.secureSnippets"), "the probe answered after the fight").toBe(false);
  expect(addon.eval("local b = Vanguard_Bar1 return { b.__drivers and b.__drivers.actionpage ~= nil, b.__states == nil or b.__states.page == nil, b:GetAttribute('_onstate-page') == nil, Vanguard_Bar1Button1:GetID() }"),
    "bar 1 then pages without the snippet").toEqual([true, true, true, 1]);
});

it("bar 1 with secure snippets keeps the snippet paging", () => {
  const addon = loggedIn(ACTIONS_ENV);
  expect(addon.eval("local b = Vanguard_Bar1 return { b.__states.page ~= nil, b:GetAttribute('_onstate-page') ~= nil, b.__drivers == nil or b.__drivers.actionpage == nil, Vanguard_Bar1Button1:GetID() }"),
    "the state driver and its snippet, buttons without IDs").toEqual([true, true, true, 0]);
});

// TEST-ONLY game action buttons on the game's bars, each listening to cooldown and usable events as the game's do.
const GAME_BUTTONS = `
  for _, name in ipairs({ "ActionButton1", "ActionButton12", "MultiBarBottomLeftButton3", "MultiBar7Button12" }) do
    local b = CreateFrame("CheckButton", name, MainMenuBar)
    b:RegisterEvent("ACTIONBAR_UPDATE_COOLDOWN") b:RegisterEvent("SPELL_UPDATE_USABLE")
  end
`;

it("the game's hidden action buttons are silenced, and one cooldown event refreshes the sweeps", () => {
  const addon = loggedIn(ACTIONS_ENV + GAME_BUTTONS);
  expect(addon.eval(`local out = {} for _, name in ipairs({ "ActionButton1", "ActionButton12", "MultiBarBottomLeftButton3", "MultiBar7Button12" }) do
    out[#out + 1] = _G[name]:IsEventRegistered("ACTIONBAR_UPDATE_COOLDOWN") or _G[name]:IsEventRegistered("SPELL_UPDATE_USABLE") end return out`),
    "no game action button listens to events any more").toEqual([false, false, false, false]);
  addon.eval("__cooldowns = 0 local get = GetActionCooldown GetActionCooldown = function(...) __cooldowns = __cooldowns + 1 return get(...) end");
  addon.fire("SPELL_UPDATE_COOLDOWN");
  expect(addon.eval("return __cooldowns"), "SPELL_UPDATE_COOLDOWN no longer re-reads every button's cooldown").toBe(0);
  addon.eval("__actions[1].cd = { 10, 30 }");
  addon.fire("ACTIONBAR_UPDATE_COOLDOWN");
  expect([addon.eval("return __cooldowns > 0"), addon.eval("return Vanguard_Bar1Button1.cooldown.__cooldown")], "ACTIONBAR_UPDATE_COOLDOWN does, and the sweep shows it").toEqual([true, [10, 30]]);
  const kept = loggedIn(ACTIONS_ENV + GAME_BUTTONS, { savedVariables: "VanguardDB.profiles = { Default = { ActionBars = { hideBlizzard = false } } }" });
  expect(kept.eval('return ActionButton1:IsEventRegistered("ACTIONBAR_UPDATE_COOLDOWN")'), "with the game's bars kept, its buttons keep their events").toBe(true);
});

// The tooltip's owner name, the slot it shows, its first line, and whether it is up.
const tip = (addon) => addon.eval("local o = GameTooltip:GetOwner() return { owner = o and o:GetName(), action = GameTooltip.__action, line = GameTooltip.__lines and GameTooltip.__lines[1].text, shown = GameTooltip:IsShown() }");

it("action buttons show their action's tooltip on hover and hide it on leave", () => {
  const addon = loggedIn();
  addon.world.setAction(1, { id: 133 });
  addon.hover("Vanguard_Bar1Button1");
  expect(tip(addon), "hovering slot 1 shows Fireball's tooltip, owned by the button").toEqual({ owner: "Vanguard_Bar1Button1", action: 1, line: "Fireball", shown: true });
  expect(addon.eval("return type(Vanguard_Bar1Button1.UpdateTooltip)"), "the client can refresh it through UpdateTooltip").toBe("function");
  addon.world.setAction(1, { id: 116 });
  addon.eval("Vanguard_Bar1Button1:UpdateTooltip()");
  expect(tip(addon), "the refresh shows what is in the slot now").toEqual({ owner: "Vanguard_Bar1Button1", action: 1, line: "Frostbolt", shown: true });
  addon.hover(null);
  expect([tip(addon).shown, addon.eval("return Vanguard_Bar1Button1.UpdateTooltip")], "leaving hides the tooltip and drops the refresh").toEqual([false, null]);
  addon.hover("Vanguard_Bar1Button2");
  expect([tip(addon).action, tip(addon).shown, addon.eval("return Vanguard_Bar1Button2.UpdateTooltip")], "an empty slot shows no tooltip").toEqual([2, false, null]);
});

it("a paged bar 1 button's tooltip is for the slot it shows now, not its action attribute", () => {
  const addon = loggedIn(NO_SNIPPETS);
  addon.world.setAction(1, { id: 133 });
  addon.world.setAction(73, { id: 118 });
  addon.eval("Vanguard_Bar1:SetAttribute('actionpage', '7')");
  addon.hover("Vanguard_Bar1Button1");
  expect([addon.eval("return Vanguard_Bar1Button1:GetAttribute('action')"), tip(addon)], "page 7 shows slot 73's Polymorph though the attribute still says 1").toEqual([1, { owner: "Vanguard_Bar1Button1", action: 73, line: "Polymorph", shown: true }]);
});

it("the mouseover fade still follows hovering an action button", () => {
  const addon = loggedIn();
  addon.world.setAction(61, { id: 133 });
  addon.eval("local AB = ns.GetModule('ActionBars') ns.Settings('ActionBars').bars[2].visibility = 'mouseover' AB.ApplyVisibility(2)");
  expect(addon.eval("return Vanguard_Bar2:GetAlpha()"), "bar 2 starts faded out").toBe(0);
  addon.hover("Vanguard_Bar2Button1");
  expect([addon.eval("return Vanguard_Bar2:GetAlpha()"), tip(addon).owner], "hovering one of its buttons shows the bar and a tooltip").toEqual([1, "Vanguard_Bar2Button1"]);
});

it("action buttons cast on yourself, your focus or the mouseover with the game's modifiers", () => {
  const addon = loggedIn();
  const attrs = addon.eval(`local out = {}
    for _, name in ipairs({ "Vanguard_Bar1Button1", "Vanguard_Bar1Button12", "Vanguard_Bar3Button7" }) do
      local b = _G[name]
      out[#out + 1] = { b:GetAttribute("checkselfcast"), b:GetAttribute("checkfocuscast"), b:GetAttribute("checkmouseovercast"), b:GetAttribute("type") }
    end
    return out`);
  expect(attrs, "every button turns the three cast checks on, as the game's buttons do, and still uses its action").toEqual(Array(3).fill([true, true, true, "action"]));
});

it("bag, equipment, form, macro and charge events refresh the buttons they change", () => {
  const addon = loggedIn(ACTIONS_ENV);
  addon.eval("__actions[2].count = 9 __actions[3].usable = true");
  addon.fire("BAG_UPDATE_DELAYED");
  expect([button(addon, 1, 2).count, button(addon, 1, 3).color.slice(0, 3)], "BAG_UPDATE_DELAYED re-counts and re-checks usability").toEqual(["9", [1, 1, 1]]);
  addon.eval("__actions[2].count = 7");
  addon.fire("UNIT_INVENTORY_CHANGED", "target");
  expect(button(addon, 1, 2).count, "another unit's inventory changes nothing").toBe("9");
  addon.fire("UNIT_INVENTORY_CHANGED", "player");
  expect(button(addon, 1, 2).count, "your own inventory re-counts").toBe("7");
  addon.eval("__actions[2].count = 6 __actions[1].tex = 'TEST-ONLY-EQUIPPED'");
  addon.fire("PLAYER_EQUIPMENT_CHANGED", 13, false);
  expect([button(addon, 1, 2).count, button(addon, 1, 1).icon], "an equipment change re-counts and repaints icons").toEqual(["6", "TEST-ONLY-EQUIPPED"]);
  for (const [event, tex] of [["UPDATE_SHAPESHIFT_FORM", "TEST-ONLY-FORM"], ["UPDATE_MACROS", "TEST-ONLY-MACRO"], ["SPELL_UPDATE_ICON", "TEST-ONLY-MORPH"]]) {
    addon.eval(`__actions[1].tex = '${tex}'`);
    addon.fire(event);
    expect(button(addon, 1, 1).icon, `${event} repaints the icon`).toBe(tex);
  }
  addon.eval("__actions[2].count = 2");
  addon.fire("SPELL_UPDATE_CHARGES");
  expect(button(addon, 1, 2).count, "SPELL_UPDATE_CHARGES re-counts").toBe("2");
});

// Whether button i of bar 1 takes the mouse, and its alpha.
const takesMouse = (addon, i) => addon.eval(`return Vanguard_Bar1Button${i}.__mouse`);
const alphaOf = (addon, i) => addon.eval(`return Vanguard_Bar1Button${i}:GetAlpha()`);

it("empty slots take no mouse, so blank bar space passes clicks through; a drag turns it back on", () => {
  const addon = loggedIn(ACTIONS_ENV);
  expect([takesMouse(addon, 1), takesMouse(addon, 4)], "a slot with an action takes the mouse; an empty one doesn't").toEqual([true, false]);
  addon.fire("ACTIONBAR_SHOWGRID");
  expect([takesMouse(addon, 4), alphaOf(addon, 4)], "picking up a spell or item shows the empty slots and lets you drop onto them").toEqual([true, 1]);
  addon.fire("ACTIONBAR_HIDEGRID");
  expect([takesMouse(addon, 4), alphaOf(addon, 4), takesMouse(addon, 1)], "dropping it hides them and takes the mouse off again").toEqual([false, 0, true]);
  addon.eval('__actions[4] = { tex = "TEST-ONLY-DROPPED", count = 0, usable = true }');
  addon.fire("ACTIONBAR_SLOT_CHANGED", 4);
  expect(takesMouse(addon, 4), "a slot that gets an action takes the mouse").toBe(true);
  addon.eval("__actions[4] = nil");
  addon.fire("ACTIONBAR_SLOT_CHANGED", 4);
  expect(takesMouse(addon, 4), "and loses it when the action is taken away").toBe(false);
});

it("in combat an empty slot's mouse waits for the fight to end, one entry per button, the last state winning", () => {
  const addon = loggedIn(ACTIONS_ENV);
  setCombat(addon, true);
  addon.eval('__actions[4] = { tex = "TEST-ONLY-DROPPED", count = 0, usable = true }');
  addon.fire("ACTIONBAR_SLOT_CHANGED", 4);
  const queued = addon.eval("return ns.QueuedCount()");
  expect([alphaOf(addon, 4), takesMouse(addon, 4)], "a slot filled in combat shows at once (alpha is allowed); its mouse waits").toEqual([1, false]);
  addon.eval("__actions[4] = nil");
  addon.fire("ACTIONBAR_SLOT_CHANGED", 4);
  addon.eval('__actions[4] = { tex = "TEST-ONLY-AGAIN", count = 0, usable = true }');
  addon.fire("ACTIONBAR_SLOT_CHANGED", 4);
  expect(addon.eval("return ns.QueuedCount()"), "emptied and filled again, the button still has one queued entry").toBe(queued);
  setCombat(addon, false);
  expect(takesMouse(addon, 4), "after the fight the last state applies: filled, so it takes the mouse").toBe(true);
  setCombat(addon, true);
  addon.eval("__actions[4] = nil");
  addon.fire("ACTIONBAR_SLOT_CHANGED", 4);
  expect([alphaOf(addon, 4), takesMouse(addon, 4)], "a slot emptied in combat hides at once and keeps its mouse until the fight ends").toEqual([0, true]);
  setCombat(addon, false);
  expect(takesMouse(addon, 4), "then it lets clicks through").toBe(false);
});

// TEST-ONLY key bindings the game keeps (in the world's table): SetBinding moves a key to a
// command (nil unbinds it), SaveBindings records the set it saved, and the keybind banner
// records whether a key goes on to the game.
const BIND_ENV = `
  SetBinding = function(key, command)
    for _, keys in pairs(__wfgWorld.bindings) do for i = #keys, 1, -1 do if keys[i] == key then table.remove(keys, i) end end end
    if command then __wfgWorld.bindings[command] = __wfgWorld.bindings[command] or {} table.insert(__wfgWorld.bindings[command], key) end
    return true
  end
  GetCurrentBindingSet = function() return 2 end
  SaveBindings = function(set) __savedSet = set end
`;

// The keybind banner: shown, whether the last key went on to the game, and whether the wash
// shows on the button under the mouse (its catcher, the frame that takes the mouse while the mode is on).
const binder = (addon) => addon.eval(`local f, AB = Vanguard_KeybindMode, ns.GetModule("ActionBars")
  return { shown = f:IsShown(), passed = f.__passed == true, mark = AB.bindHover ~= nil and AB.bindHover.vgCatcher.wash:IsShown() }`);

// The tooltip's lines while it shows (its text only), or null when hidden.
const tipLines = (addon) => addon.eval(`if not GameTooltip:IsShown() then return nil end
  local out = {} for _, l in ipairs(GameTooltip.__lines) do out[#out + 1] = l.text end return out`);

// The keys bound to a command.
const boundTo = (addon, command) => addon.eval(`return table.concat(__wfgWorld.bindings.${command} or {}, ",")`);

it("keybind mode: hover a button and press a key to bind it; a modifier alone waits; Escape leaves", () => {
  const addon = loggedIn(BIND_ENV);
  addon.slash("keybind");
  addon.eval("Vanguard_KeybindMode.SetPropagateKeyboardInput = function(self, v) self.__passed = v end");
  expect(binder(addon), "/vg keybind shows the banner").toMatchObject({ shown: true, mark: false });
  expect(addon.eval("return Vanguard_Bar1Button4:GetAlpha()"), "empty slots show, so they can be bound").toBe(1);
  addon.key("Vanguard_KeybindMode", "Q");
  expect([binder(addon).passed, boundTo(addon, "ACTIONBUTTON4")], "a key with no button under the mouse goes on to the game").toEqual([true, ""]);
  expect(addon.eval("return Vanguard_Bar1Button4.vgCatcher:IsShown()"), "a catcher sits over every button, taking the mouse").toBe(true);
  addon.hover("Vanguard_Bar1Button4.vgCatcher");
  expect([binder(addon).mark, addon.eval("return Vanguard_Bar1Button3.vgCatcher.wash:IsShown()")], "the button under the mouse is marked, the others not").toEqual([true, false]);
  expect(tipLines(addon), "and its tooltip names it, its keys (none yet) and what to do").toEqual(["Bar 1 button 4", "Keys: no key", expect.stringMatching(/^Press a key, the middle or a side mouse button, or roll the wheel.*Backspace clears\.$/)]);
  addon.key("Vanguard_KeybindMode", "LSHIFT");
  expect([binder(addon).passed, boundTo(addon, "ACTIONBUTTON4")], "Shift alone binds nothing (and stays with the mode)").toEqual([false, ""]);
  addon.keys({ shift: true });
  addon.key("Vanguard_KeybindMode", "Q");
  addon.keys({ shift: false });
  expect([boundTo(addon, "ACTIONBUTTON4"), addon.eval("return __savedSet")], "Shift-Q is bound to the button's command and saved in the set in use").toEqual(["SHIFT-Q", 2]);
  expect([addon.eval("return Vanguard_Bar1Button4.hotkey:GetText()"), addon.eval("return __wfgWorld.overrides['SHIFT-Q'].target")], "the hotkey shows it, and the key clicks the button").toEqual(["SQ", "Vanguard_Bar1Button4:LeftButton"]);
  expect([chatHas(addon, /SHIFT-Q bound to Bar 1 button 4\.$/), tipLines(addon)[1]], "chat says so (the key was free), and the tooltip follows").toEqual([true, "Keys: SHIFT-Q"]);
  addon.hover("Vanguard_Bar1Button1.vgCatcher");
  addon.keys({ alt: true, ctrl: true });
  addon.key("Vanguard_KeybindMode", "F");
  addon.keys({ alt: false, ctrl: false });
  expect([boundTo(addon, "ACTIONBUTTON1"), addon.eval("return GetBindingAction('1')")], "the new key replaces the button's old one").toEqual(["ALT-CTRL-F", ""]);
  addon.hover(null);
  expect([binder(addon).mark, tipLines(addon)], "leaving the button drops the mark and the tooltip").toEqual([false, null]);
  addon.hover("Vanguard_Bar1Button2.vgCatcher");
  addon.key("Vanguard_KeybindMode", "ESCAPE");
  expect([binder(addon).shown, binder(addon).passed, addon.eval("return Vanguard_Bar1Button5:GetAlpha()")], "Escape leaves (and doesn't open the game menu); empty slots hide again").toEqual([false, false, 0]);
  expect([tipLines(addon), addon.eval("return Vanguard_Bar1Button2.vgCatcher:IsShown()")], "the tooltip and the catchers go with it").toEqual([null, false]);
});

it("keybind mode: the mouse's side buttons and wheel bind too; Backspace clears; a taken key says whose it was", () => {
  const addon = loggedIn(BIND_ENV + `
    __wfgWorld.bindings.MOVEFORWARD = { "W" }
    __wfgWorld.bindings.JUMP = { "SPACE" }
    BINDING_NAME_MOVEFORWARD = "Move Forward"
  `);
  addon.slash("keybind");
  addon.hover("Vanguard_Bar1Button4.vgCatcher");
  addon.click("Vanguard_Bar1Button4.vgCatcher", "LeftButton");
  addon.click("Vanguard_Bar1Button4.vgCatcher", "RightButton");
  expect([boundTo(addon, "ACTIONBUTTON4"), chatHas(addon, /bound to Bar 1 button 4/)], "left and right click bind nothing").toEqual(["", false]);
  addon.keys({ ctrl: true });
  addon.click("Vanguard_Bar1Button4.vgCatcher", "Button4");
  addon.keys({ ctrl: false });
  expect([boundTo(addon, "ACTIONBUTTON4"), addon.eval("return Vanguard_Bar1Button4.hotkey:GetText()")], "a side button binds, with the modifiers held").toEqual(["CTRL-BUTTON4", "CM4"]);
  addon.click("Vanguard_Bar1Button4.vgCatcher", "MiddleButton");
  expect(boundTo(addon, "ACTIONBUTTON4"), "the middle button too").toBe("BUTTON3");
  addon.wheel("Vanguard_Bar1Button4.vgCatcher", 1);
  expect(boundTo(addon, "ACTIONBUTTON4"), "wheel up").toBe("MOUSEWHEELUP");
  addon.wheel("Vanguard_Bar1Button4.vgCatcher", -1);
  expect([boundTo(addon, "ACTIONBUTTON4"), addon.eval("return Vanguard_Bar1Button4.hotkey:GetText()")], "wheel down").toEqual(["MOUSEWHEELDOWN", "WD"]);
  addon.key("Vanguard_KeybindMode", "BACKSPACE");
  expect([boundTo(addon, "ACTIONBUTTON4"), addon.eval("return Vanguard_Bar1Button4.hotkey:GetText()"), tipLines(addon)[1]], "Backspace clears the button's keys").toEqual(["", "", "Keys: no key"]);
  expect(chatHas(addon, /Bar 1 button 4 unbound \(was MOUSEWHEELDOWN\)\.$/), "and says what it had").toBe(true);
  addon.key("Vanguard_KeybindMode", "DELETE");
  expect(chatHas(addon, /Bar 1 button 4 has no key\.$/), "Delete clears too; with no key it only says so").toBe(true);
  addon.key("Vanguard_KeybindMode", "W");
  expect([boundTo(addon, "ACTIONBUTTON4"), boundTo(addon, "MOVEFORWARD"), chatHas(addon, /W bound to Bar 1 button 4, taken from Move Forward\.$/)], "a key the game used is taken, and chat says from what").toEqual(["W", "", true]);
  addon.key("Vanguard_KeybindMode", "SPACE");
  expect(chatHas(addon, /SPACE bound to Bar 1 button 4, taken from JUMP\.$/), "a command with no name is named as is").toBe(true);
  addon.key("Vanguard_KeybindMode", "1");
  expect([boundTo(addon, "ACTIONBUTTON1"), chatHas(addon, /1 bound to Bar 1 button 4, taken from Bar 1 button 1\.$/)], "a key from another Vanguard button names that button").toEqual(["", true]);
  addon.key("Vanguard_KeybindMode", "1");
  expect(chatHas(addon, /1 bound to Bar 1 button 4\.$/), "binding the button's own key again is not a take").toBe(true);
  addon.hover("Vanguard_Bar1Button1.vgCatcher");
  setCombat(addon, true);
  expect(addon.eval("return ns.GetModule('ActionBars').ClearKeys(Vanguard_Bar1Button4)"), "no clearing in combat").toBe(false);
  addon.fire("PLAYER_REGEN_DISABLED");
  expect([addon.eval("return Vanguard_KeybindMode:IsShown()"), tipLines(addon), binder(addon).mark], "a fight ends the mode, with its tooltip and mark").toEqual([false, null, false]);
});

it("keybind mode: out of combat only, ends when a fight starts; from the options; needs the bars", () => {
  const addon = loggedIn(BIND_ENV);
  addon.slash("keybind");
  addon.slash("keybind");
  expect(addon.eval("return Vanguard_KeybindMode:IsShown()"), "/vg keybind again leaves").toBe(false);
  addon.slash("keybind");
  setCombat(addon, true);
  addon.fire("PLAYER_REGEN_DISABLED");
  expect(addon.eval("return Vanguard_KeybindMode:IsShown()"), "a fight ends it").toBe(false);
  addon.slash("keybind");
  expect([addon.eval("return Vanguard_KeybindMode:IsShown()"), chatHas(addon, /Keybind mode waits until you're out of combat\.$/)], "and it can't start in one").toEqual([false, true]);
  expect(addon.eval("return ns.GetModule('ActionBars').BindKey(Vanguard_Bar1Button2, 'TEST-ONLY-K')"), "no binding changes in combat").toBe(false);
  addon.key("Vanguard_KeybindMode", "Q");
  setCombat(addon, false);
  addon.eval('for _, p in ipairs(ns.Options.PAGES) do if p.key == "actionbars" then for _, r in ipairs(p.rows()) do if r[2] == "Keybind mode" then r[3]() end end end end');
  expect(addon.eval("return Vanguard_KeybindMode:IsShown()"), "the Keybind mode button on the Action bars page starts it").toBe(true);
  const off = loggedIn(BIND_ENV, { savedVariables: "VanguardDB = { profiles = { Default = { modules = { ActionBars = false } } } }" });
  off.slash("keybind");
  expect([off.eval("return Vanguard_KeybindMode == nil"), chatHas(off, /Keybind mode needs Vanguard.s action bars/)], "without the bars it says why").toEqual([true, true]);
});

// TEST-ONLY reading of a macro-conditional driver, as the client reads it: the value of the first
// clause one of whose [...] groups has every condition in `holds` (a clause with no group always matches).
const driverValue = (driver, holds) => {
  for (const clause of driver.split(";")) {
    const groups = clause.match(/\[[^\]]*\]/g) || [];
    const met = groups.length === 0 || groups.some((g) => g.slice(1, -1).split(",").every((c) => holds.includes(c.trim())));
    if (met) return clause.replace(/\[[^\]]*\]/g, "").trim();
  }
  return null;
};

it("bar 1 pages like the game's main bar: a Shift+number page wins over a stance, form or stealth bar", () => {
  const driver = loggedIn(ACTIONS_ENV).eval('return ns.GetModule("ActionBars").PAGE_DRIVER');
  expect([driverValue(driver, []), driverValue(driver, ["bonusbar:1"]), driverValue(driver, ["bonusbar:3"])], "page 1, and on page 1 a stance's or form's own page").toEqual(["1", "7", "9"]);
  expect([driverValue(driver, ["bonusbar:1", "bar:2"]), driverValue(driver, ["bonusbar:3", "bar:6"])], "in a stance or form, Shift+2 and Shift+6 show pages 2 and 6, as the game's main bar does").toEqual(["2", "6"]);
  expect([driverValue(driver, ["vehicleui", "bar:2"]), driverValue(driver, ["overridebar", "bar:3"]), driverValue(driver, ["shapeshift", "bar:4", "bonusbar:1"])], "a vehicle, override or temporary shapeshift bar still wins").toEqual(["12", "14", "13"]);
});
