// clickcast-presets: the click-casting starter layouts on WoW Forever (Modules/ClickCastPresets.lua and its page rows,
// Modules/ClickCastPresetRows.lua): every class's layouts, Undo, the better spells offered as they are learned, Click to
// heal's guide, the other-addon line, and what the game's click handler does with each style, in the TEST-ONLY
// headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, GAME_ENGINE_LUA, RAID_ENV, RETAIL, UNITS_ENV, chatHas, loggedIn } from "./helpers.mjs";
import { CC, bindings, priestly } from "./clickcast-helpers.mjs";

const CP = "ns.ClickCastPresets";

// A logged-in character of a class that knows every spell the presets list for it, each named "TEST-ONLY <id>".
function knowsAll(cls, extra = "") {
  const addon = loggedIn(CLICK_LUA + extra);
  addon.eval(`__wfgWorld.units.player.class = "${cls}"
    for _, rows in pairs(${CP}.CLASSES.${cls}) do
      for _, row in ipairs(rows) do for i = 2, #row do __wfgWorld.learn(row[i], { name = "TEST-ONLY " .. row[i], helpful = true }) end end
    end`);
  return addon;
}

// A preset's bindings as { key: "action" or spell name } after applying it through the page's dropdown (saying
// Replace when it asks before replacing the player's own mouse bindings).
function picked(addon, label) {
  addon.eval('ns.Options.Show("clickcast")');
  addon.eval('__click("Starter layout...")');
  expect(addon.eval(`return __click(${JSON.stringify(label)})`), `the dropdown offers ${label}`).toBe(true);
  if (addon.eval("return Vanguard_Question ~= nil and Vanguard_Question:IsShown()")) addon.click("Vanguard_Question.confirm");
  return shortBindings(addon);
}

// The list shown as { key: spell name, or the action for an action }.
const shortBindings = (addon) => Object.fromEntries(Object.entries(bindings(addon)).map(([k, v]) => {
  const [action, value] = v.split(":");
  return [k, action === "spell" ? value : action];
}));

// What the starter layout dropdown offers now.
const choices = (addon) => addon.eval(`local out = { "" } for _, c in ipairs(${CP}.Choices()) do out[#out + 1] = c[2] end return out`).slice(1);

// The shown texts that hold a piece of text.
const textsWith = (addon, piece) => addon.eval(`local out = { "" } for _, w in ipairs(__wfgStub.frames) do
    if w.__kind == "FontString" and w:IsVisible() and type(w.__text) == "string" and w.__text:find(${JSON.stringify(piece)}, 1, true) then out[#out + 1] = w.__text end
  end return out`).slice(1);

// The game's click profile: Target and Open menu on these buttons (each "shift-LeftButton" or "RightButton").
const gameProfile = (addon, target, menu) => addon.eval(`local function entry(id, spec)
    local prefix, button = spec:match("^(.-)(%a+Button)$")
    return { type = 3, actionID = id, button = button, modifiers = prefix == "shift-" and __wfgWorld.modifierBits.shift or 0 }
  end
  __wfgWorld.clickProfile = { entry(1, "${target}"), entry(2, "${menu}") }`);

const SHARED = { "alt-BUTTON3": "focus", "ctrl-shift-BUTTON3": "assist" };

it("click presets: a priest's Click to select puts the best spell on each click, with Target, the menu, Focus and Assist", () => {
  expect(picked(knowsAll("PRIEST"), "Healer: click to select")).toEqual({
    BUTTON1: "target", BUTTON2: "menu", BUTTON3: "TEST-ONLY 2061", "shift-BUTTON3": "TEST-ONLY 596", "shift-BUTTON1": "TEST-ONLY 2060",
    "shift-BUTTON2": "TEST-ONLY 139", "ctrl-BUTTON1": "TEST-ONLY 527", "ctrl-BUTTON2": "TEST-ONLY 528", "alt-BUTTON1": "TEST-ONLY 17",
    "alt-BUTTON2": "TEST-ONLY 2006", ...SHARED,
  });
});

it("click presets: Click to heal moves the heals to Left and Right and Target and the menu to Shift (a client without the game's click bindings applies it at once)", () => {
  const addon = knowsAll("SHAMAN", "C_ClickBindings = nil");
  expect(picked(addon, "Healer: click to heal")).toEqual({
    BUTTON1: "TEST-ONLY 8004", BUTTON2: "TEST-ONLY 331", BUTTON3: "TEST-ONLY 1064", "shift-BUTTON3": "TEST-ONLY 61295",
    "shift-BUTTON1": "target", "shift-BUTTON2": "menu", "ctrl-BUTTON1": "TEST-ONLY 526", "ctrl-BUTTON2": "TEST-ONLY 2870",
    "alt-BUTTON2": "TEST-ONLY 2008", "ctrl-shift-BUTTON1": "TEST-ONLY 16188", ...SHARED,
  });
});

it("click presets: a paladin's emergency spells sit on Ctrl + Shift, and the grid opens with those columns", () => {
  const addon = knowsAll("PALADIN");
  const list = picked(addon, "Healer: click to select");
  expect([list["ctrl-shift-BUTTON1"], list["ctrl-shift-BUTTON2"]], "Lay on Hands and Blessing of Protection").toEqual(["TEST-ONLY 633", "TEST-ONLY 1022"]);
  expect([textsWith(addon, "Ctrl + Shift").length + textsWith(addon, "CTRL + SHIFT").length > 0, addon.texts("Fewer modifiers").length], "the Ctrl + Shift column shows, and the switch says Fewer").toEqual([true, 1]);
  addon.eval('__click("Fewer modifiers")');
  expect([textsWith(addon, "Ctrl + Shift").length + textsWith(addon, "CTRL + SHIFT").length, addon.texts("More modifiers").length], "Fewer hides them, whatever the bindings").toEqual([0, 1]);
});

it("click presets: damage or tanking keeps Target and the menu, with a class's helpful clicks", () => {
  const druid = picked(knowsAll("DRUID"), "Damage or tank");
  expect(druid, "a druid: Rebirth on the emergency row").toEqual({ BUTTON1: "target", BUTTON2: "menu", "ctrl-shift-BUTTON1": "TEST-ONLY 20484", ...SHARED });
  const warrior = knowsAll("WARRIOR");
  expect(choices(warrior), "a warrior has only that layout").toEqual(["Damage or tank"]);
  expect(picked(warrior, "Damage or tank"), "Target, the menu, Focus and Assist").toEqual({ BUTTON1: "target", BUTTON2: "menu", ...SHARED });
});

it("click presets: every class's layouts bind only spells the character knows, none twice", () => {
  for (const cls of ["PRIEST", "PALADIN", "DRUID", "SHAMAN", "MAGE", "WARLOCK", "WARRIOR", "ROGUE", "HUNTER"]) {
    const addon = knowsAll(cls);
    for (const label of choices(addon)) {
      const spells = Object.values(picked(addon, label)).filter((v) => v.startsWith("TEST-ONLY"));
      expect(new Set(spells).size, `${cls} ${label}: no spell twice`).toBe(spells.length);
    }
  }
  const unknown = knowsAll("PRIEST");
  unknown.eval("__wfgWorld.units.player.class = 'TEST-ONLY'");
  expect(choices(unknown), "a class without layouts still gets the damage one").toEqual(["Damage or tank"]);
});

it("click presets: a level 1 priest gets Lesser Heal on Middle; each better spell is told once in chat and offered on the page", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('__wfgWorld.units.player.class = "PRIEST"');
  addon.world.learn(2050, { name: "Lesser Heal", rank: 1, helpful: true });
  expect(picked(addon, "Healer: click to select").BUTTON3, "the best spell it knows").toBe("Lesser Heal");
  addon.clearChat();
  addon.world.learn(2054, { name: "Heal", rank: 1, helpful: true });
  addon.update(0.1);
  addon.update(0.1);
  expect(chatHas(addon, /Click casting: you can put Heal on Middle click now/), "chat tells it once the spellbook is read again").toBe(true);
  expect(addon.texts("Middle click could cast Heal instead of Lesser Heal.").length, "the page offers it").toBe(1);
  addon.clearChat();
  addon.world.learn(9999, { name: "TEST-ONLY Smite", helpful: false });
  addon.update(0.1);
  addon.update(0.1);
  expect(chatHas(addon, /you can put/), "told once only").toBe(false);
  addon.eval('__click("Use Heal")');
  expect([shortBindings(addon).BUTTON3, addon.texts("Middle click could cast Heal instead of Lesser Heal.").length], "Use puts it on, and the offer goes").toEqual(["Heal", 0]);
});

it("click presets: a spell an earlier click took is passed over, then offered to the next click once it is free", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('__wfgWorld.units.player.class = "PRIEST"');
  addon.world.learn(2054, { name: "Heal", rank: 1, helpful: true });
  const list = picked(addon, "Healer: click to select");
  expect([list.BUTTON3, list["shift-BUTTON1"]], "Heal on Middle, Shift + Left left empty (Greater Heal unknown)").toEqual(["Heal", undefined]);
  expect(addon.texts("Shift + Left click could cast Heal.").length, "nothing to offer while Middle has it").toBe(0);
  addon.world.learn(2061, { name: "Flash Heal", rank: 1, helpful: true });
  addon.update(0.1);
  addon.update(0.1);
  addon.eval('__click("Use Flash Heal")');
  expect(addon.texts("Shift + Left click could cast Heal.").length, "Heal is free: Shift + Left is offered it").toBe(1);
  addon.eval('__click("Keep as it is")');
  expect([addon.texts("Shift + Left click could cast Heal.").length, shortBindings(addon)["shift-BUTTON1"]], "Keep as it is: the offer goes, nothing is bound").toEqual([0, undefined]);
  addon.eval('ns.Options.RebuildPage("clickcast") ns.Options.Show("clickcast")');
  expect(addon.texts("Shift + Left click could cast Heal.").length, "and it stays away").toBe(0);
});

it("click presets: a key holding a spell the row doesn't list is the player's own, and gets no offer", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('__wfgWorld.units.player.class = "PRIEST"');
  addon.world.learn(2050, { name: "Lesser Heal", rank: 1, helpful: true });
  picked(addon, "Healer: click to select");
  addon.eval(`${CC}.Add("BUTTON3", "spell", "TEST-ONLY Own") ${CC}.Add("alt-BUTTON1", "target")`);
  addon.world.learn(2054, { name: "Heal", rank: 1, helpful: true });
  addon.world.learn(17, { name: "Power Word: Shield", rank: 1, helpful: true });
  expect(addon.eval(`local out = { "" } for _, u in ipairs(${CP}.Upgrades()) do out[#out + 1] = u.key end return out`).slice(1), "neither the player's spell (Middle) nor the player's action (Alt + Left): only the empty Shift + Left").toEqual(["shift-BUTTON1"]);
  addon.eval(`${CC}.Add("BUTTON3", "spell", "Lesser Heal") ${CC}.Add("alt-BUTTON1", "spell", "TEST-ONLY Gone")`);
  expect(addon.eval(`local u = ${CP}.Upgrades()[1] return { #${CP}.Upgrades(), u.key, u.from, u.to }`), "a lower spell of the row is offered over").toEqual([1, "BUTTON3", "Lesser Heal", "Heal"]);
  addon.eval(`__wfgWorld.spells[2061] = { name = "Flash Heal", helpful = true } ${CC}.Add("BUTTON3", "spell", "Flash Heal")`);
  expect(addon.eval(`local out = { "" } for _, u in ipairs(${CP}.Upgrades()) do out[#out + 1] = u.key .. ">" .. u.to end return out`).slice(1), "a better spell of the row not learned yet is never offered down (Shift + Left gets Heal instead)").toEqual(["shift-BUTTON1>Heal"]);
});

it("click presets: Undo puts back the list as it was (hover keys included), and offers stop", () => {
  const addon = priestly(loggedIn(CLICK_LUA));
  addon.eval(`${CC}.Add("ctrl-BUTTON2", "spell", "TEST-ONLY Own") ${CC}.Add("SHIFT-1", "spell", "Renew", 139)`);
  const before = bindings(addon);
  const after = picked(addon, "Healer: click to select");
  expect([after["SHIFT-1"], after["ctrl-BUTTON2"]], "the hover key stays, the mouse binding is replaced").toEqual(["Renew", "Cure Disease"]);
  addon.eval('__click("Undo")');
  expect(addon.eval("return Vanguard_Question:IsShown()"), "Undo asks first").toBe(true);
  addon.click("Vanguard_Question.confirm");
  expect(bindings(addon), "after asking, the old list is back").toEqual(before);
  expect([addon.eval(`return ${CP}.Record() == nil`), textsWith(addon, "These bindings came from the starter layout").length], "the record and the row go").toEqual([true, 0]);
  expect([addon.eval(`return ${CP}.Undo()`), addon.eval(`return #${CP}.Upgrades()`)], "nothing more to undo, and no offers").toEqual([false, 0]);
});

it("click presets: Undo of a layout put on an empty list empties it; after a second layout it still goes back to the list before the first", () => {
  const addon = priestly(loggedIn(CLICK_LUA));
  addon.eval(`${CP}.Apply("select") ${CP}.Undo()`);
  expect(Object.keys(bindings(addon)).length, "empty again").toBe(0);
  addon.eval(`${CC}.Add("ctrl-BUTTON2", "spell", "TEST-ONLY Own")`);
  const own = bindings(addon);
  addon.eval(`${CP}.Apply("select") ${CP}.Apply("heal") ${CP}.Apply("other")`);
  expect([addon.eval(`return ${CP}.Applied().id`), addon.eval(`return ${CP}.Undo()`), bindings(addon)], "three layouts later, Undo brings back the player's own list").toEqual(["other", true, own]);
});

it("click presets: picking a layout over the player's own mouse bindings asks first; No changes nothing", () => {
  const addon = priestly(loggedIn(CLICK_LUA));
  addon.eval(`${CC}.Add("BUTTON4", "spell", "TEST-ONLY Own")`);
  addon.eval('ns.Options.Show("clickcast") __click("Starter layout...") __click("Damage or tank")');
  expect(addon.eval("return Vanguard_Question:IsShown()"), "it asks").toBe(true);
  addon.click("Vanguard_Question.no");
  expect([shortBindings(addon), addon.eval(`return ${CP}.Record() == nil`)], "nothing changed").toEqual([{ BUTTON4: "TEST-ONLY Own" }, true]);
  addon.eval(`${CP}.Apply("other")`);
  addon.eval('ns.Options.Show("clickcast") __click("Starter layout...") __click("Healer: click to select")');
  expect(addon.eval("return Vanguard_Question:IsShown()"), "a list as a layout made it is replaced without asking").toBe(false);
  addon.eval(`${CC}.Add("BUTTON5", "spell", "TEST-ONLY Own")`);
  addon.eval('ns.Options.Show("clickcast") __click("Starter layout...") __click("Damage or tank")');
  expect(addon.eval("return Vanguard_Question:IsShown()"), "once the player changed it, it asks again").toBe(true);
});

it("click presets: Clear all, Import and Copy to drop a list's record; a click the player cleared gets no offer", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('__wfgWorld.units.player.class = "PRIEST"');
  addon.world.learn(2050, { name: "Lesser Heal", rank: 1, helpful: true });
  addon.world.learn(17, { name: "Power Word: Shield", rank: 1, helpful: true });
  addon.eval(`${CP}.Apply("select") ${CC}.Remove("alt-BUTTON1")`);
  addon.world.learn(2054, { name: "Heal", rank: 1, helpful: true });
  // The keys offered a better spell now, in order.
  const offers = () => addon.eval(`local out = { "" } for _, u in ipairs(${CP}.Upgrades()) do out[#out + 1] = u.key end return out`).slice(1);
  expect(offers(), "Middle's better heal (Shift + Left, left empty by the layout, waits while Middle is offered Heal); not Alt + Left, which the player cleared").toEqual(["BUTTON3"]);
  const text = addon.eval(`return ${CC}.Export()`);
  addon.eval(`${CC}.Clear()`);
  expect([addon.eval(`return ${CP}.Record() == nil`), offers()], "Clear all: no record, no offers").toEqual([true, []]);
  addon.eval(`${CP}.Apply("select") ${CC}.Import(${JSON.stringify(text)})`);
  expect(addon.eval(`return ${CP}.Record() == nil`), "Import drops it too").toBe(true);
  addon.eval(`${CP}.Apply("select") VanguardCharDB.clickcastPresets[2] = { preset = "select", undo = "" } ${CC}.CopyToSpec(2)`);
  expect(addon.eval(`return { VanguardCharDB.clickcastPresets[2] == nil, ${CP}.Record() ~= nil }`), "Copy to drops the target list's, keeps this one's").toEqual([true, true]);
});

it("click presets: Undo of a saved list that no longer imports says why and keeps the record", () => {
  const addon = priestly(loggedIn(CLICK_LUA));
  addon.eval(`${CP}.Apply("select") VanguardCharDB.clickcastPresets[${CC}.CurrentKey()].undo = "TEST-ONLY not a string" ns.Options.Show("clickcast")`);
  addon.eval('__click("Undo")');
  addon.click("Vanguard_Question.confirm");
  expect([chatHas(addon, /^.*Can't undo: /), addon.eval(`return ${CP}.CanUndo()`), shortBindings(addon).BUTTON3], "chat says why; the layout and its Undo stay").toEqual([true, true, "Flash Heal"]);
});

it("click presets: Click to select over a game profile with Target and the menu moved off Left and Right shows the guide", () => {
  const addon = priestly(loggedIn(CLICK_LUA));
  gameProfile(addon, "shift-LeftButton", "shift-RightButton");
  picked(addon, "Healer: click to select");
  expect(textsWith(addon, "This layout puts Target on Left click"), "the plain clicks' guide, with both to bind").toEqual([expect.stringContaining("Still to bind in the game's window: Target on Left click.\nStill to bind in the game's window: Open menu on Right click.\nPut on now, the clicks still to bind do nothing until you bind them there.")]);
  expect(Object.keys(bindings(addon)).length, "nothing bound yet").toBe(0);
  addon.eval('__click("Put the layout on")');
  expect([shortBindings(addon).BUTTON1, textsWith(addon, "This layout puts Target").length], "put on anyway; the guide goes").toEqual(["target", 0]);
});

it("click presets: after More or Fewer modifiers, a new layout opens the columns its bindings use again", () => {
  const addon = priestly(loggedIn(CLICK_LUA));
  picked(addon, "Healer: click to select");
  addon.eval('__click("Fewer modifiers")');
  expect(addon.texts("More modifiers").length, "hidden on asking").toBe(1);
  picked(addon, "Damage or tank");
  expect(addon.texts("Fewer modifiers").length, "the next layout's Assist opens them again").toBe(1);
});

it("click presets: Click to heal shows its guide until the game binds Target and the menu on Shift, then puts the heals on", () => {
  const addon = priestly(loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + GAME_ENGINE_LUA + `__units.player.class = "PRIEST"
    ToggleClickBindingFrame = function() __gameWindow = (__gameWindow or 0) + 1 end`));
  addon.eval(`${CC}.Add("BUTTON3", "spell", "TEST-ONLY Own") __spawn(1, "raid1")`);
  picked(addon, "Healer: click to heal");
  expect([shortBindings(addon).BUTTON3, textsWith(addon, "Click to heal puts your heals").length], "nothing changes yet; the guide shows").toEqual(["TEST-ONLY Own", 1]);
  expect(textsWith(addon, "Still to bind"), "what is left to bind, in the game's words").toEqual([expect.stringContaining("Still to bind in the game's window: Target on Shift + Left click.\nStill to bind in the game's window: Open menu on Shift + Right click.")]);
  addon.eval('__click("Open the game\'s window")');
  expect(addon.eval("return __gameWindow"), "the button opens the game's window").toBe(1);
  gameProfile(addon, "shift-LeftButton", "shift-RightButton");
  addon.eval('ns.Options.Show("clickcast")');
  addon.update(0.1);
  addon.update(0.1);
  expect(textsWith(addon, "Both are bound in the game's window.").length, "coming back, the page sees both bound").toBe(1);
  addon.eval('__click("Put heals on Left and Right")');
  expect(addon.eval("return Vanguard_Question:IsShown()"), "the player's own Middle click: it asks once, now").toBe(true);
  addon.click("Vanguard_Question.confirm");
  // What the game's click handler does with a click (and the modifiers held) on the raid tile.
  const click = (button, prefix) => addon.eval(`return __engineClick(Vanguard_RaidUnitButton1, "${button}", "${prefix}")`);
  expect([click("LeftButton", ""), click("RightButton", ""), click("RightButton", "shift-"), click("LeftButton", "shift-")], "heals on the plain clicks, the menu and Target on Shift").toEqual(["spell", "spell", "togglemenu", "target"]);
  expect(textsWith(addon, "Click to heal puts your heals").length, "the guide goes").toBe(0);
});

it("click presets: the guide's Cancel changes nothing; Click to select's menu click works on the game's default profile", () => {
  const addon = priestly(loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + GAME_ENGINE_LUA + '__units.player.class = "PRIEST"'));
  addon.eval('__spawn(1, "raid1")');
  picked(addon, "Healer: click to heal");
  addon.eval('__click("Cancel")');
  expect([textsWith(addon, "Click to heal puts your heals").length, Object.keys(bindings(addon)).length], "the guide goes, nothing is bound").toEqual([0, 0]);
  picked(addon, "Healer: click to select");
  // What the game's click handler does with a plain click on the raid tile.
  const click = (button) => addon.eval(`return __engineClick(Vanguard_RaidUnitButton1, "${button}", "")`);
  expect([click("LeftButton"), click("RightButton"), click("MiddleButton")], "Target, the menu, the main heal").toEqual(["target", "togglemenu", "spell"]);
});

it("click presets: in a fight the list changes at once and the frames take it when the fight ends", () => {
  const addon = priestly(loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + '__units.player.class = "PRIEST"'));
  addon.eval('__spawn(1, "raid1")');
  addon.world.combat(true);
  addon.eval(`${CP}.Apply("select")`);
  // The raid tile's middle-click type, as the frames hold it.
  const middle = () => addon.eval('return Vanguard_RaidUnitButton1:GetAttribute("type3")');
  expect([shortBindings(addon).BUTTON3, middle()], "saved, not applied").toEqual(["Flash Heal", null]);
  addon.world.combat(false);
  expect(middle(), "applied after the fight").toBe("spell");
});

it("click presets: another addon's raid frames or click casting: a line says why, and no layout is offered", () => {
  const addon = priestly(loggedIn(CLICK_LUA + '__wfgStub.world.loaded.VuhDo = true __wfgStub.world.loaded.Clique = true'));
  addon.eval('ns.Options.Show("clickcast")');
  expect(addon.texts("You use Clique for click casting. Vanguard's click casting works only on its own frames, so no starter layout is offered.").length, "the first by name").toBe(1);
  expect([choices(addon), addon.frames('w.text and w.text.GetText and w.text:GetText() == "Starter layout..." and w:IsShown()').length], "nothing to pick").toEqual([[], 0]);
  expect(addon.eval('local out = {} for _, o in ipairs(ns.GetModule("Coexist").Overlaps("RaidFrames")) do out[#out + 1] = o.addon .. ": " .. o.what end return out'), "Coexist names the overlaps").toEqual(["VuhDo: raid frames"]);
});

it("click presets: a retail client keeps the class layout button and offers no presets", () => {
  const addon = priestly(loggedIn(RETAIL + CLICK_LUA));
  addon.eval('ns.Options.Show("clickcast")');
  expect([choices(addon), addon.eval('return __click("Priest healing layout")')], "the old button").toEqual([[], true]);
  expect(addon.eval(`return ${CP}.Record() == nil`), "it keeps no preset record").toBe(true);
  const blocked = priestly(loggedIn(RETAIL + CLICK_LUA + "__wfgStub.world.loaded.VuhDo = true"));
  blocked.eval('ns.Options.Show("clickcast")');
  expect([textsWith(blocked, "Vanguard's click casting works only on its own frames").length, blocked.eval('return __click("Priest healing layout")')], "another raid frame addon changes nothing there").toEqual([0, true]);
});

it("click presets: once another raid frame addon is on, a list made earlier gets no more offers", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('__wfgWorld.units.player.class = "PRIEST"');
  addon.world.learn(2050, { name: "Lesser Heal", rank: 1, helpful: true });
  addon.eval(`${CP}.Apply("select")`);
  addon.world.learn(2054, { name: "Heal", rank: 1, helpful: true });
  expect(addon.eval(`return #${CP}.Upgrades()`), "offered").toBe(1);
  addon.eval('__wfgStub.world.loaded.Cell = true');
  addon.fire("ADDON_LOADED", "Cell");
  expect(addon.eval(`return #${CP}.Upgrades()`), "not now").toBe(0);
});

it("click presets: an unknown saved layout offers nothing, and the page still builds", () => {
  const addon = priestly(loggedIn(CLICK_LUA));
  addon.eval(`${CP}.Apply("select") VanguardCharDB.clickcastPresets[${CC}.CurrentKey()].preset = "TEST-ONLY gone"`);
  expect(addon.eval(`return { #${CP}.Upgrades(), ${CP}.CanUndo() }`), "no offers, no Undo").toEqual([0, false]);
  addon.eval('ns.Options.Show("clickcast")');
  expect(addon.texts("Starter layout...").length, "the page is there").toBe(1);
});

it("click presets: taking an offer on a list with the player's own clicks keeps them the player's: the next pick still asks", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('__wfgWorld.units.player.class = "PRIEST"');
  addon.world.learn(2050, { name: "Lesser Heal", rank: 1, helpful: true });
  addon.eval(`${CP}.Apply("select") ${CC}.Add("BUTTON4", "spell", "TEST-ONLY Own")`);
  addon.world.learn(2054, { name: "Heal", rank: 1, helpful: true });
  addon.eval(`${CP}.Use(${CP}.Upgrades()[1])`);
  expect(addon.eval(`return ${CP}.HasOwnClicks()`), "Button 4 is still the player's").toBe(true);
});

it("click presets: a saved record with odd fields is read as empty ones, and a stale offer does nothing", () => {
  const addon = priestly(loggedIn(CLICK_LUA));
  addon.eval(`${CP}.Apply("select") local rec = VanguardCharDB.clickcastPresets[${CC}.CurrentKey()] rec.open, rec.told, rec.kept = 5, "x", true`);
  expect(addon.eval(`${CC}.Add("BUTTON4", "target") return { #${CP}.Upgrades(), type(${CP}.Record().kept) }`), "no error, empty sets").toEqual([0, "table"]);
  addon.eval(`${CC}.Clear() ${CP}.Use({ key = "BUTTON3", to = "Heal" }) ${CP}.Keep({ key = "BUTTON3", to = "Heal" })`);
  expect(Object.keys(bindings(addon)).length, "nothing bound").toBe(0);
});

it("click presets: the guide's button applies the layout it was shown for, even once the guide has gone", () => {
  const addon = priestly(loggedIn(CLICK_LUA));
  addon.eval(`${CC}.Add("BUTTON4", "spell", "TEST-ONLY Own")`);
  gameProfile(addon, "shift-LeftButton", "shift-RightButton");
  picked(addon, "Healer: click to select");
  addon.eval('__click("Put the layout on")');
  addon.eval('__click("Cancel")');
  addon.click("Vanguard_Question.confirm");
  expect([shortBindings(addon).BUTTON1, addon.eval(`return ${CP}.Applied().id`)], "Replace still applies Click to select").toEqual(["target", "select"]);
});

it("click presets: a click the layout left empty, bound and then emptied by the player, is the player's own", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('__wfgWorld.units.player.class = "PRIEST"');
  addon.world.learn(2050, { name: "Lesser Heal", rank: 1, helpful: true });
  addon.eval(`${CP}.Apply("select") ${CC}.Add("alt-BUTTON1", "spell", "TEST-ONLY Own") ${CC}.Remove("alt-BUTTON1")`);
  addon.world.learn(17, { name: "Power Word: Shield", rank: 1, helpful: true });
  expect(addon.eval(`return #${CP}.Upgrades()`), "no offer for Alt + Left").toBe(0);
});

it("click presets: the guide belongs to the list it was picked on, and its button asks before replacing the player's own bindings", () => {
  const addon = priestly(loggedIn(CLICK_LUA + "__wfgWorld.specGroup = 1"));
  picked(addon, "Healer: click to heal");
  expect(textsWith(addon, "Click to heal puts your heals").length, "the guide on Primary").toBe(1);
  addon.eval("__wfgWorld.specGroup = 2");
  addon.fire("ACTIVE_TALENT_GROUP_CHANGED", 2, 1);
  addon.eval('ns.Options.RebuildPage("clickcast") ns.Options.Show("clickcast")');
  expect(textsWith(addon, "Click to heal puts your heals").length, "not on Secondary").toBe(0);
  addon.eval("__wfgWorld.specGroup = 1");
  addon.fire("ACTIVE_TALENT_GROUP_CHANGED", 1, 2);
  addon.eval(`${CC}.Add("BUTTON4", "spell", "TEST-ONLY Own") ns.Options.RebuildPage("clickcast") ns.Options.Show("clickcast")`);
  addon.eval('__click("Put heals on Left and Right")');
  expect([addon.eval("return Vanguard_Question:IsShown()"), shortBindings(addon).BUTTON4], "back on Primary, it asks first").toEqual([true, "TEST-ONLY Own"]);
});

it("click presets: the guide says when it can't read the game's binding, and an interaction for the other action is no cover", () => {
  const addon = priestly(loggedIn(CLICK_LUA + "GetStringFromModifiers = function() return 'TEST-ONLY ???' end"));
  gameProfile(addon, "shift-LeftButton", "shift-RightButton");
  picked(addon, "Healer: click to heal");
  expect(textsWith(addon, "can't read"), "both Shift clicks are unreadable").toEqual([expect.stringContaining("Vanguard can't read what the game's window binds to Shift + Left click: check that it is Target.")]);
  addon.eval("__wfgWorld.clickProfile = { { type = 3, actionID = 2, button = 'LeftButton', modifiers = 0 }, { type = 3, actionID = 1, button = 'RightButton', modifiers = 0 } }");
  expect(addon.eval(`return #${CP}.Unbound("select")`), "Open menu on Left and Target on Right cover neither").toBe(2);
});

it("click presets: working in an extra modifier column keeps the columns open when its last binding goes", () => {
  const addon = priestly(loggedIn(CLICK_LUA));
  picked(addon, "Damage or tank");
  addon.eval(`local c for _, w in ipairs(__wfgStub.frames) do if w.key == "ctrl-shift-BUTTON3" and w.iconFrame and w:IsVisible() then c = w end end
    c.__scripts.OnClick(c, "RightButton")`);
  expect([shortBindings(addon)["ctrl-shift-BUTTON3"], addon.texts("Fewer modifiers").length], "Assist cleared, the columns stay").toEqual([undefined, 1]);
});

it("click presets: /vg probe names each preset spell id the client knows", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.world.learn(2061, { name: "Flash Heal", rank: 1, helpful: true });
  const lines = addon.eval(`for _, s in ipairs(ns.Probe.SECTIONS) do if s[1] == "Click-casting starter layout spells" then return s[2]() end end`);
  expect(lines, "one line per id").toEqual(expect.arrayContaining(["spell 2061: present, Flash Heal", "spell 2050: missing"]));
});

it("click casting: See all your keys opens the Action bars page on its Your keys tab", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.eval('ns.Options.Show("clickcast") ns.Options.ShowTab("Keys while hovering a frame")');
  addon.eval('__click("See all your keys")');
  expect(addon.eval("return ns.Options.current"), "the Action bars page").toBe("actionbars");
  expect(addon.eval(`local v for _, c in ipairs({ Vanguard_Options:GetChildren() }) do if c.cards and c:IsShown() then v = c end end return v.cards[v.tab].tabName`), "on Your keys").toBe("Your keys");
});
