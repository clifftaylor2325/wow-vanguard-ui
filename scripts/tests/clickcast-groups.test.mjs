// clickcast-groups: click-casting lists kept per talent group on WoW Forever (their migration, Copy to, the wording, and
// the menu-click fix across the groups), in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, GAME_CLICKS_LUA, chatHas, loggedIn } from "./helpers.mjs";
import { CC, MENU_NOTICE, priestly, widget } from "./clickcast-helpers.mjs";

// A logged-in priest with the spellbook above, on the click-casting page when asked.
const priest = (extra = "", opts = {}) => priestly(loggedIn(CLICK_LUA + extra, opts));

// TEST-ONLY saved click-casting lists from before the lists were kept per talent group: Renew and Target, under
// the key given (the specialization index, or 0 where the client has none).
const oldList = (key) => `VanguardCharDB = { clickcast = { [${key}] = { { key = "BUTTON2", action = "spell", value = "Renew", spellID = 139 }, { key = "BUTTON1", action = "target" } } } }`;

// The keys of a saved list (by its spec key), in order, or null when there is no such list.
const savedKeys = (addon, key) => addon.eval(`local l = VanguardCharDB.clickcast[${key}] if not l then return nil end local out = {} for i, b in ipairs(l) do out[i] = b.key end return out`);

// Whether the character's talent-group migration has been stamped.
const migrated = (addon) => addon.eval("return VanguardCharDB.clickcastStamps ~= nil and VanguardCharDB.clickcastStamps.talentGroups == true");

it("the talent-group migration copies the old single list to each group without one, and runs once", () => {
  const addon = priest("__wfgWorld.specGroup = 1", { savedVariables: oldList(0) });
  expect([savedKeys(addon, 1), savedKeys(addon, 2)], "both groups start from the old list").toEqual([["BUTTON2", "BUTTON1"], ["BUTTON2", "BUTTON1"]]);
  expect([savedKeys(addon, 0), migrated(addon)], "the old list stays where it was, and the step is stamped").toEqual([["BUTTON2", "BUTTON1"], true]);
  addon.eval(`${CC}.Remove("BUTTON1")`);
  expect([savedKeys(addon, 1), savedKeys(addon, 2), savedKeys(addon, 0)], "the copies are separate lists").toEqual([["BUTTON2"], ["BUTTON2", "BUTTON1"], ["BUTTON2", "BUTTON1"]]);
  addon.eval("__wfgWorld.specGroup = 2");
  addon.fire("ACTIVE_TALENT_GROUP_CHANGED", 2, 1);
  addon.eval(`${CC}.Clear()`);
  addon.eval("__wfgWorld.specGroup = 1");
  addon.fire("ACTIVE_TALENT_GROUP_CHANGED", 1, 2);
  expect([addon.eval(`return #${CC}.Bindings(2)`), savedKeys(addon, 1), savedKeys(addon, 0)], "stamped, it does not run again with the old list still there: a cleared group stays empty").toEqual([0, ["BUTTON2"], ["BUTTON2", "BUTTON1"]]);
});

it("the talent-group migration leaves a group that has its own list alone, and uses the specialization index where there is one", () => {
  const own = ' VanguardCharDB.clickcast[2] = { { key = "BUTTON4", action = "focus" } }';
  const addon = priest("__wfgWorld.specGroup = 1", { savedVariables: oldList(0) + own });
  expect([savedKeys(addon, 1), savedKeys(addon, 2)], "Secondary keeps its own; Primary gets the old list").toEqual([["BUTTON2", "BUTTON1"], ["BUTTON4"]]);
  const indexed = priest("__wfgWorld.specGroup = 1 __wfgWorld.spec = 1", { savedVariables: oldList(1) });
  expect([savedKeys(indexed, 1), savedKeys(indexed, 2), savedKeys(indexed, 0)], "the list saved under specialization 1 is Primary's, and Secondary gets a copy").toEqual([["BUTTON2", "BUTTON1"], ["BUTTON2", "BUTTON1"], null]);
});

it("the talent-group migration waits for a client that names a talent group, and does nothing without one", () => {
  const addon = priest("", { savedVariables: oldList(0) });
  expect([savedKeys(addon, 1), migrated(addon)], "no talent groups: the list stays where it was, unstamped").toEqual([null, false]);
  expect(addon.eval(`return #${CC}.Bindings()`), "and it is still the character's list").toBe(2);
  addon.eval("__wfgWorld.specGroup = 2");
  addon.fire("ACTIVE_TALENT_GROUP_CHANGED", 2, 1);
  expect([addon.eval(`return #${CC}.Bindings()`), savedKeys(addon, 1), migrated(addon)], "once the client names a group, its change event migrates").toEqual([2, ["BUTTON2", "BUTTON1"], true]);
});

it("on WoW Forever the Click casting page speaks of talent groups, and Copy to goes across them", () => {
  const addon = priest("__wfgWorld.specGroup = 1 GetNumSpecializations = function() return 3 end");
  addon.eval(`${CC}.Add("BUTTON2", "spell", "Renew", 139)`);
  addon.eval('ns.Options.Show("clickcast")');
  const sentence = " on this character. Click a cell to pick a spell, right-click to clear, or drop a spell on it.";
  expect(addon.texts(`Bindings for Primary talents${sentence}`).length, "the line over the grid names the talent group").toBe(1);
  const copy = widget(addon, 'w.choices ~= nil and w.text ~= nil and w.text.__text == "Copy to..."');
  expect(addon.eval(`return __wfgStub.frames[${copy}].choices()`), "the other talent group, not the client's specializations").toEqual([[2, "Copy to Secondary talents"]]);
  addon.clearChat();
  addon.eval(`__wfgStub.frames[${copy}].set(2)`);
  expect([chatHas(addon, /Click-casting bindings copied to Secondary talents\./), addon.eval(`return #${CC}.Bindings(2)`)], "copied across, and said").toEqual([true, 1]);
  addon.eval("__wfgWorld.specGroup = 2");
  addon.fire("ACTIVE_TALENT_GROUP_CHANGED", 2, 1);
  addon.eval("ns.Options.Refresh()");
  expect(addon.texts(`Bindings for Secondary talents${sentence}`).length, "the line follows the group").toBe(1);
  expect(addon.eval(`return __wfgStub.frames[${copy}].choices()`), "and the copy goes back to Primary").toEqual([[1, "Copy to Primary talents"]]);
});

// TEST-ONLY saved lists of a character already moved to talent groups: Flash Heal on Middle and the menu on Right in
// Primary (key 1), Smite on Right in Secondary (key 2) when asked, and the last group the client named.
const groupLists = (remembered, secondary = "") => `VanguardCharDB = { clickcastStamps = { talentGroups = true }, clickcastGroup = ${remembered}, clickcast = {
  [1] = { { key = "BUTTON2", action = "menu" }, { key = "BUTTON3", action = "spell", value = "Flash Heal", spellID = 2061 } }${secondary} } }`;

it("Copy to never copies a list onto itself, and the page names the list it shows even when the client names no group", () => {
  const addon = priest("GetNumSpecializations = function() return 1 end", { savedVariables: groupLists(1) });
  addon.eval('ns.Options.Show("clickcast")');
  const copy = widget(addon, 'w.choices ~= nil and w.text ~= nil and w.text.__text == "Copy to..."');
  expect(addon.eval(`return __wfgStub.frames[${copy}].choices()`), "the remembered group is not offered").toEqual([[2, "Copy to Secondary talents"]]);
  expect(addon.texts("Bindings for Primary talents on this character. Click a cell to pick a spell, right-click to clear, or drop a spell on it.").length, "the line names the list on screen").toBe(1);
  addon.eval(`${CC}.CopyToSpec(1)`);
  expect(savedKeys(addon, 1), "copying a list onto itself leaves it").toEqual(["BUTTON2", "BUTTON3"]);
});

it("Copy to asks before it replaces a list that has bindings, and not before it fills an empty one", () => {
  const secondary = ', [2] = { { key = "BUTTON2", action = "spell", value = "Smite" } }';
  const addon = priest("__wfgWorld.specGroup = 1", { savedVariables: groupLists(1, secondary) });
  addon.eval('ns.Options.Show("clickcast")');
  const copy = widget(addon, 'w.choices ~= nil and w.text ~= nil and w.text.__text == "Copy to..."');
  addon.clearChat();
  addon.eval(`__wfgStub.frames[${copy}].set(2)`);
  expect([addon.eval("return Vanguard_Question:IsShown()"), addon.texts("Replace the bindings of Secondary talents with these?").length], "it asks, naming the group").toEqual([true, 1]);
  expect(savedKeys(addon, 2), "and replaces nothing yet").toEqual(["BUTTON2"]);
  addon.click("Vanguard_Question.no");
  expect(savedKeys(addon, 2), "No keeps the list").toEqual(["BUTTON2"]);
  addon.eval(`__wfgStub.frames[${copy}].set(2)`);
  addon.click("Vanguard_Question.confirm");
  expect([savedKeys(addon, 2), chatHas(addon, /copied to Secondary talents\./)], "Replace copies and says so").toEqual([["BUTTON2", "BUTTON3"], true]);
  addon.eval("__wfgWorld.specGroup = 2");
  addon.eval(`${CC}.Clear()`);
  addon.eval("__wfgWorld.specGroup = 1 ns.Options.Refresh()");
  addon.clearChat();
  addon.eval(`__wfgStub.frames[${copy}].set(2)`);
  expect([addon.eval("return Vanguard_Question:IsShown()"), savedKeys(addon, 2)], "an empty list is filled without a question").toEqual([false, ["BUTTON2", "BUTTON3"]]);
});

it("on WoW Forever the Clear all question, /vg binds and the Copy caption name the talent group, not the spec", () => {
  const addon = priest("__wfgWorld.specGroup = 1", { savedVariables: groupLists(1) });
  addon.eval('ns.Options.Show("clickcast")');
  addon.eval('return __click("Clear all")');
  expect(addon.texts("Clear every click-casting binding for Primary talents? This can't be undone.").length).toBe(1);
  addon.click("Vanguard_Question.no");
  addon.clearChat();
  addon.slash("binds");
  expect(chatHas(addon, /Click casting \(Primary talents\):/), "/vg binds names the group").toBe(true);
  addon.eval(`${CC}.Clear()`);
  addon.clearChat();
  addon.slash("binds");
  expect(chatHas(addon, /No click-casting bindings for Primary talents\./), "and so does its empty line").toBe(true);
  const plain = priest("");
  plain.slash("binds");
  expect(chatHas(plain, /No click-casting bindings for this spec\./), "without talent groups it says spec").toBe(true);
  plain.eval('ns.Options.Show("clickcast") return __click("Clear all")');
  expect(plain.texts("Clear every click-casting binding for this spec? This can't be undone.").length).toBe(1);
});

it("the talent-group migration finds the old list under the specialization index, 0 or any other key, and stamps only when it has something to go by", () => {
  // The old list under a key, the client answering a specialization index (or none), and the saved lists after login.
  const after = (key, index) => {
    const addon = priest(`__wfgWorld.specGroup = 1 ${index === null ? "" : `__wfgWorld.spec = ${index}`}`, { savedVariables: oldList(key) });
    return [savedKeys(addon, 1), savedKeys(addon, 2), migrated(addon)];
  };
  const both = [["BUTTON2", "BUTTON1"], ["BUTTON2", "BUTTON1"], true];
  expect(after(0, 5), "the list at 0 while the client now answers specialization 5").toEqual(both);
  expect(after(5, null), "the list at 5 while the client now answers none").toEqual(both);
  expect(after(3, 3), "the list at the answered index").toEqual(both);
  const fresh = priest("__wfgWorld.specGroup = 1", { savedVariables: "VanguardCharDB = {}" });
  expect([savedKeys(fresh, 1), migrated(fresh)], "nothing saved and no group in use: nothing stamped").toEqual([{}, false]);
  fresh.eval(`${CC}.Add("BUTTON4", "focus")`);
  fresh.fire("ACTIVE_TALENT_GROUP_CHANGED", 1, 1);
  expect(migrated(fresh), "once a group holds bindings the character is moved over").toBe(true);
});

// TEST-ONLY saved lists of a character already moved to talent groups, holding the old layouts' shape (Flash Heal on
// Right, the menu on Middle) in Primary (key 1) and `secondary` (Lua for key 2's list, or nothing) in Secondary.
const oldShapeGroups = (secondary = "") => `VanguardCharDB = { clickcastStamps = { talentGroups = true }, clickcastGroup = 1, clickcast = {
  [1] = { { key = "BUTTON2", action = "spell", value = "Flash Heal", spellID = 2061 }, { key = "BUTTON3", action = "menu" } }${secondary ? `, [2] = ${secondary}` : ""} } }`;

// The words the notice adds when the other talent group has the old shape too.
const ALSO_SECONDARY = `${MENU_NOTICE} This also fixes Secondary talents, which have the same bindings.`;

// The page's Copy to dropdown, as its widget id.
const copyDropdown = (addon) => widget(addon, 'w.choices ~= nil and w.text ~= nil and w.text.__text == "Copy to..."');

it("Dismiss is for the character: no talent group shows the notice afterwards", () => {
  const addon = priest(GAME_CLICKS_LUA + "__wfgWorld.specGroup = 1", { savedVariables: oldShapeGroups('{ { key = "BUTTON2", action = "spell", value = "Renew" }, { key = "BUTTON3", action = "menu" } }') });
  addon.eval('ns.Options.Show("clickcast")');
  addon.eval('__click("Dismiss")');
  addon.eval("__wfgWorld.specGroup = 2");
  addon.fire("ACTIVE_TALENT_GROUP_CHANGED", 2, 1);
  expect([addon.eval(`return ${CC}.MenuClickNeedsFix()`), addon.texts(MENU_NOTICE).length], "Secondary has the shape, and no notice").toEqual([true, 0]);
});

it("Swap them fixes every talent group that has the old shape", () => {
  const addon = priest(GAME_CLICKS_LUA + "__wfgWorld.specGroup = 1", { savedVariables: 'VanguardCharDB = { clickcast = { [0] = { { key = "BUTTON2", action = "spell", value = "Flash Heal", spellID = 2061 }, { key = "BUTTON3", action = "menu" } } } }' });
  addon.eval('ns.Options.Show("clickcast")');
  expect(addon.eval('return __click("Swap them")')).toBe(true);
  // A talent group's two bindings as "Right/Middle".
  const pair = (group) => addon.eval(`local l = ${CC}.Bindings(${group}) local out = {} for _, b in ipairs(l) do out[b.key] = b.action end return out.BUTTON2 .. "/" .. out.BUTTON3`);
  expect([pair(1), pair(2)], "Primary and Secondary both have the menu on Right and the spell on Middle").toEqual(["menu/spell", "menu/spell"]);
});

it("Swap them says in chat which lists it changed, the notice says when it also fixes the other talent group, and a macro on Right click is swapped too", () => {
  const both = 'VanguardCharDB = { clickcast = { [0] = { { key = "BUTTON2", action = "macro", value = "/cast Flash Heal" }, { key = "BUTTON3", action = "menu" } } } }';
  const addon = priest(GAME_CLICKS_LUA + "__wfgWorld.specGroup = 1", { savedVariables: both });
  addon.eval('ns.Options.Show("clickcast")');
  expect(addon.texts(`${MENU_NOTICE} This also fixes Secondary talents, which have the same bindings.`).length, "the notice names the other group").toBe(1);
  addon.clearChat();
  addon.eval('__click("Swap them")');
  expect([chatHas(addon, /Unit menu moved to Right click, and what was on Right click to Middle click \(Primary talents\)\./), chatHas(addon, /\(Secondary talents\)\./)], "one line for each list changed").toEqual([true, true]);
  expect(addon.eval(`local out = {} for _, b in ipairs(${CC}.Bindings(2)) do out[b.key] = b.action end return out.BUTTON2 .. "/" .. out.BUTTON3`), "the macro went to Middle in Secondary too").toBe("menu/macro");
});

it("Copy to an empty talent group brings the old shape there, and the notice says it now fixes both", () => {
  const addon = priest(GAME_CLICKS_LUA + "__wfgWorld.specGroup = 1", { savedVariables: oldShapeGroups() });
  addon.eval('ns.Options.Show("clickcast")');
  expect(addon.texts(MENU_NOTICE).length, "to start with the notice is about Primary alone").toBe(1);
  addon.eval(`__wfgStub.frames[${copyDropdown(addon)}].set(2)`);
  expect(addon.texts(ALSO_SECONDARY).length, "the copy was shown at once").toBe(1);
});

it("Copy to a talent group that has bindings asks first, and after Replace the notice says it fixes both", () => {
  const addon = priest(GAME_CLICKS_LUA + "__wfgWorld.specGroup = 1", { savedVariables: oldShapeGroups('{ { key = "BUTTON2", action = "spell", value = "Smite" } }') });
  addon.eval('ns.Options.Show("clickcast")');
  addon.eval(`__wfgStub.frames[${copyDropdown(addon)}].set(2)`);
  addon.click("Vanguard_Question.confirm");
  expect(addon.texts(ALSO_SECONDARY).length, "the copy was shown at once").toBe(1);
});
