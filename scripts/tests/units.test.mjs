// units: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { CLICK_LUA, FOREVER_ENV, NO_RAID, RETAIL, SETUP_DONE, SWING_ENV, TICKS_ENV, TOTEMS_ENV, UNITS_ENV, bars, borderOf, button, isTok, key, later, loggedIn, marks, putAway, setCombat, spark, tok, totemCell, unitEvents } from "./helpers.mjs";

// A frame's state for the unit-frame tests.
const ufState = (addon, key) => addon.eval(`
  local f = Vanguard_${key}
  return { shown = f:IsShown(), watched = f.__watched == true, unit = f:GetAttribute("unit"),
    type1 = f:GetAttribute("*type1"), type2 = f:GetAttribute("*type2"),
    hp = f.health.__value, max = f.health.__max, color = f.health.__barColor,
    power = f.power.__value, powerColor = f.power.__barColor,
    name = f.name:GetText(), text = f.healthText:GetText() }`);

it("unit frames", () => {
  const addon = loggedIn(UNITS_ENV, NO_RAID);
  const player = ufState(addon, "player");
  expect(player.unit === "player" && player.type1 === "target" && player.type2 === "togglemenu", "player frame is a secure unit button").toBeTruthy();
  expect(player.hp === 900 && player.max === 1000 && player.text === "900", "player health bar and text").toBeTruthy();
  expect(player.color[0] === 0.25 && player.color[2] === 0.92, "players get their class color").toBeTruthy();
  expect(player.power === 50 && isTok(addon, player.powerColor, "mana"), "power bar value and mana color").toBeTruthy();
  expect(player.name === "<name>" && !player.watched, "player name; player frame is always shown").toBeTruthy();
  const target = ufState(addon, "target");
  expect(target.watched, "target frame shows and hides with its unit").toBeTruthy();
  expect(target.hp?.__secret && target.max?.__secret, "secret health goes to the bar untouched").toBeTruthy();
  expect(target.text?.__secret, "secret health text comes from the client's formatter").toBeTruthy();
  expect(isTok(addon, target.color, "hostile"), "hostile units are red").toBeTruthy();
  expect(ufState(addon, "party1").text === "Dead", "dead units say Dead").toBeTruthy();
  const hidden = addon.eval("return { parentShown = PlayerFrame:GetParent():IsShown(), events = PlayerFrame:IsEventRegistered('UNIT_HEALTH') }");
  expect(hidden.parentShown === false && hidden.events === false, "the Blizzard player frame is hidden and silenced").toBeTruthy();
  const movers = addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[#out + 1] = m.key end return out");
  expect(["uf_player", "uf_target", "uf_targettarget", "uf_focus", "uf_pet", "uf_party1"].every((k) => movers.includes(k)), "every frame group is movable").toBeTruthy();
});

it("unit frame events", () => {
  const addon = loggedIn(UNITS_ENV);
  addon.eval("__units.player.hp = 400");
  addon.fire("UNIT_HEALTH", "player");
  expect(ufState(addon, "player").hp === 400, "UNIT_HEALTH updates the bar").toBeTruthy();
  addon.eval('__units.focus = { name = "TEST-ONLY Focus", hp = 10, maxhp = 20, power = 0, maxpower = 0, ptype = "MANA", reaction = 5 }');
  addon.fire("PLAYER_FOCUS_CHANGED");
  const focus = ufState(addon, "focus");
  expect(focus.name === "TEST-ONLY Focus" && isTok(addon, focus.color, "friendly"), "focus change fills the focus frame; friendly is green").toBeTruthy();
  addon.eval('__units.targettarget = { name = "TEST-ONLY ToT", hp = 1, maxhp = 2, power = 0, maxpower = 0, ptype = "MANA" }');
  addon.update(0.25);
  expect(ufState(addon, "targettarget").name === "TEST-ONLY ToT", "target of target refreshes on a timer").toBeTruthy();
});

it("target of target: health and power on every look, its name only when it's someone else", () => {
  // TEST-ONLY GUIDs from the units table, and a counter of target-of-target name updates.
  const addon = loggedIn(UNITS_ENV + "UnitGUID = function(unit) return __units[unit] and __units[unit].guid end");
  addon.eval(`__names = 0 local UF = ns.GetModule("UnitFrames") local real = UF.UpdateName
    UF.UpdateName = function(f) if f.unit == "targettarget" then __names = __names + 1 end return real(f) end
    __units.targettarget = { guid = "TEST-ONLY-1", name = "TEST-ONLY ToT", hp = 1, maxhp = 2, power = 0, maxpower = 0, ptype = "MANA" }`);
  // Target-of-target name updates so far, then reset.
  const names = () => addon.eval("local n = __names __names = 0 return n");
  addon.advance(1);
  expect([names(), ufState(addon, "targettarget").name], "a second of looks: the name is set once").toEqual([1, "TEST-ONLY ToT"]);
  addon.eval("__units.targettarget.hp = 2");
  addon.advance(0.5);
  expect([names(), ufState(addon, "targettarget").hp], "its health still follows, with no name update").toEqual([0, 2]);
  addon.eval('__units.targettarget = { guid = "TEST-ONLY-2", name = "TEST-ONLY Other", hp = 5, maxhp = 5, power = 0, maxpower = 0, ptype = "MANA" }');
  addon.advance(0.5);
  expect([names(), ufState(addon, "targettarget").name], "someone else: the name follows once").toEqual([1, "TEST-ONLY Other"]);
  addon.eval('__units.targettarget.name = "TEST-ONLY Renamed"');
  addon.advance(0.5);
  expect([names(), ufState(addon, "targettarget").name], "the same unit with a new name: the name follows").toEqual([1, "TEST-ONLY Renamed"]);
  addon.eval("__units.targettarget.guid = { __secret = true }");
  addon.advance(1);
  expect(names(), "a hidden GUID can't be compared: every look updates the name").toBe(4);
});

it("unit frames wait for combat", () => {
  const addon = createAddon();
  addon.eval(UNITS_ENV + "__wfgStub.inCombat = true");
  addon.login();
  expect(addon.eval("return Vanguard_player") === null, "no secure frames are built in combat").toBeTruthy();
  addon.eval("__wfgStub.inCombat = false");
  addon.fire("PLAYER_REGEN_ENABLED");
  expect(addon.eval("return Vanguard_player ~= nil") === true, "they are built when combat ends").toBeTruthy();
});

it("unit frame health text settings apply at once", () => {
  const addon = loggedIn(RETAIL + UNITS_ENV + CLICK_LUA + "UnitHealthPercent = function() return 90 end CurveConstants = { ScaleTo100 = 1 }");
  addon.slash("");
  addon.eval('__click("Unit frames")');
  expect(addon.eval('return __click("Show health numbers") and Vanguard_player.healthText:GetText()'), "turning health numbers off clears them at once").toBe("");
  expect(addon.eval("return Vanguard_Options.reload:IsShown()"), "with no reload").toBe(false);
  addon.eval('__click("Show health numbers")');
  expect(addon.eval('return __click("Health as") and Vanguard_player.healthText:GetText()'), "switching to percent shows it at once").toMatch(/%$/);
  expect(addon.eval('return __click("Shaman totems") and VanguardDB.profiles.Default.ClassBars.totems'), "the totem switch is on the page (after a reload)").toBe(false);
  expect(addon.eval('return __click("Druid mana") and VanguardDB.profiles.Default.ClassBars.druidMana'), "and the druid mana switch").toBe(false);
});

it("class bars: totems for shamans, mana in forms for druids", () => {
  const addon = loggedIn(UNITS_ENV + TOTEMS_ENV);
  expect(addon.eval('local CB = ns.GetModule("ClassBars") return { #CB.cells, select(2, CB.totems:GetPoint()) == Vanguard_player }'), "a shaman gets four totem cells under the player frame").toEqual([4, true]);
  expect(totemCell(addon, 1), "a totem that is down shows its icon, its sweep and the client's numbers").toMatchObject({ alpha: 1, icon: "TEST-ONLY-ICON-Totem", sweep: [100, 120], numbers: true, type2: "destroytotem", slot: 1 });
  expect(totemCell(addon, 2).alpha, "an empty slot is see-through (cells are secure, so alpha, not Hide)").toBe(0);
  addon.eval('GetTotemDuration = function(slot) return { __duration = slot } end __totems[2] = { true, "TEST-ONLY Totem 2", 200, 60, "TEST-ONLY-ICON-Two" }');
  addon.fire("PLAYER_TOTEM_UPDATE");
  expect(totemCell(addon, 2), "a new totem shows, timed by the client's duration object").toMatchObject({ alpha: 1, icon: "TEST-ONLY-ICON-Two", object: { __duration: 2 } });
  addon.eval('ns.GetModule("ClassBars").cells[2].cooldown.__durationObject = "TEST-ONLY-stale" GetTotemDuration = function() return nil end');
  addon.fire("PLAYER_TOTEM_UPDATE");
  expect(totemCell(addon, 2), "a client that has no duration object to give: the plain start and length, the old object untouched").toMatchObject({ sweep: [200, 60], object: "TEST-ONLY-stale" });
  addon.eval('GetTotemDuration = function(slot) return { __duration = slot } end');
  addon.eval("__totems[1] = { { __secret = true }, 'x', { __secret = true }, { __secret = true }, 'TEST-ONLY-ICON-Totem' }");
  addon.fire("PLAYER_TOTEM_UPDATE");
  expect(totemCell(addon, 1), "a hidden answer goes to the client's alpha-from-boolean; the cell keeps its alpha").toMatchObject({ alpha: 1, follows: { __secret: true } });
  const off = loggedIn(UNITS_ENV + TOTEMS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { ClassBars = { totems = false } } }" });
  expect(off.eval('return ns.GetModule("ClassBars").cells == nil'), "totems can be turned off").toBe(true);
  const noFrames = loggedIn(UNITS_ENV + TOTEMS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { UnitFrames = false } } }" });
  expect(noFrames.eval('return ns.GetModule("ClassBars").cells == nil'), "no player frame (the game's own shows its totems), no row").toBe(true);
  const early = loggedIn(UNITS_ENV + TOTEMS_ENV + "GetTotemInfo = nil");
  expect(early.eval('ns.GetModule("ClassBars").UpdateTotems() return ns.GetModule("ClassBars").cells[1].__alpha'), "no totem call on this client: cells stay as built").toBe(null);
});

it("class bars: a right-click on a totem cell destroys it, with key-down casting on or off", () => {
  const addon = loggedIn(UNITS_ENV + TOTEMS_ENV);
  // Which phases of a right-click run the cell's secure action: [press, release].
  const acts = () => addon.eval('local c = ns.GetModule("ClassBars").cells[1] return { __wfgStub.secureActs(c, "RightButton", true), __wfgStub.secureActs(c, "RightButton", false) }');
  expect(acts(), "key-down casting on (the game's default): the release acts").toEqual([false, true]);
  addon.eval('SetCVar("ActionButtonUseKeyDown", "0")');
  expect(acts(), "key-down casting off: still the release").toEqual([false, true]);
});

it("class bars: druid mana while a form shows rage or energy", () => {
  const addon = loggedIn(UNITS_ENV + '__units.player.class = "DRUID" __form = 1 UnitPowerType = function() return __form end');
  // The mana bar: shown, max and value.
  const mana = () => addon.eval('local CB = ns.GetModule("ClassBars") return { CB.manaHolder:IsShown(), select(2, CB.mana:GetMinMaxValues()), CB.mana:GetValue() }');
  expect(mana(), "in bear form the mana bar shows your mana").toEqual([true, 100, 50]);
  addon.eval("__form = 0 __units.player.power = 70");
  addon.fire("UNIT_POWER_UPDATE", "target");
  expect(mana()[0], "another unit's power changes nothing").toBe(true);
  addon.fire("UPDATE_SHAPESHIFT_FORM");
  expect(mana(), "back in caster form it hides").toEqual([false, 100, 70]);
  addon.eval("__form = { __secret = true }");
  addon.fire("UNIT_DISPLAYPOWER", "player");
  expect(mana()[0], "a hidden power type counts as no form").toBe(false);
  const other = loggedIn(UNITS_ENV + 'UnitClass = function() return "x", { __secret = true } end');
  expect(other.eval('local CB = ns.GetModule("ClassBars") return CB.cells == nil and CB.mana == nil'), "a hidden or other class builds nothing").toBe(true);
  const combat = createAddon({ savedVariables: SETUP_DONE });
  combat.eval(UNITS_ENV + '__units.player.class = "DRUID" UnitPowerType = function() return 3 end');
  setCombat(combat, true);
  combat.login();
  expect(combat.eval('return ns.GetModule("ClassBars").mana == nil'), "logging in during combat waits").toBe(true);
  setCombat(combat, false);
  expect(combat.eval('return ns.GetModule("ClassBars").manaHolder:IsShown()'), "and builds the bar when combat ends").toBe(true);
});

it("unit frames on WoW Forever: levels, health percent, classification", () => {
  const addon = loggedIn(UNITS_ENV + FOREVER_ENV + `
    UnitLevel = function(unit) return ({ player = 60, target = -1, focus = { __secret = true } })[unit] or 12 end
    GetCreatureDifficultyColor = function(level) return { r = 1, g = 0.1, b = 0.1 } end
    UnitClassification = function(unit) return ({ target = "worldboss", focus = "rare" })[unit] or "normal" end
    CurveConstants = { ScaleTo100 = { __curve = true } }
    UnitHealthPercent = function(unit, predicted, curve) return 84 end
    __units.focus = { name = "TEST-ONLY Focus", hp = 1, maxhp = 2, power = 0, maxpower = 0, ptype = "MANA", reaction = 5 }`, NO_RAID);
  addon.fire("PLAYER_TARGET_CHANGED");
  addon.fire("PLAYER_FOCUS_CHANGED");
  const f = addon.eval(`local p, t, fo = Vanguard_player, Vanguard_target, Vanguard_focus
    return { level = p.level:GetText(), color = p.level.__textColor, boss = t.level:GetText(), hidden = fo.level:GetText(), hiddenColor = fo.level.__textColor,
      health = p.healthText:GetText(), mark = t.class:IsShown() and t.class.__vertexColor, rare = fo.class.__vertexColor, playerMark = p.class }`);
  expect(f.level === "60" && f.color[1] === 0.1 && f.boss === "??" && f.hidden === "", "the level left of the name, colored by difficulty; ?? for a boss; nothing when hidden").toBeTruthy();
  expect(isTok(addon, f.hiddenColor, "text2"), "a hidden level falls back to the plain text color").toBeTruthy();
  expect(f.health === "84%", "health as a percent from the client's own percent").toBeTruthy();
  expect(isTok(addon, f.mark, "bad") && isTok(addon, f.rare, "text2") && f.playerMark == null, "a diamond marks bosses, rares and elites on the target and focus").toBeTruthy();
  addon.eval("UnitLevel = function(unit) return unit == 'player' and 61 or 12 end");
  addon.fire("UNIT_LEVEL", "player");
  expect(addon.eval("return Vanguard_player.level:GetText()"), "when you level, your frame shows the new level").toBe("61");
  addon.eval("UnitLevel = function(unit) return unit == 'player' and 62 or 14 end");
  addon.fire("PLAYER_LEVEL_UP", 62);
  expect(addon.eval("return { Vanguard_player.level:GetText(), Vanguard_target.level:GetText() }"), "a level-up refreshes every frame (their level colors are relative to yours)").toEqual(["62", "14"]);
  addon.eval("UnitHealthPercent = function() error('TEST-ONLY') end");
  addon.fire("UNIT_HEALTH", "player");
  expect(addon.eval("return Vanguard_player.healthText:GetText()") === "900", "if the client's percent fails, the value shows").toBeTruthy();
  const retail = loggedIn(RETAIL + UNITS_ENV, NO_RAID);
  expect(retail.eval("return Vanguard_player.level == nil") === true && retail.eval("return Vanguard_player.healthText:GetText()") === "900", "elsewhere: no level, health as a value").toBeTruthy();
});

it("unit frames: a hidden percent text is handed on as it is, Dead wins over it, a plain percent still shows", () => {
  const addon = loggedIn(UNITS_ENV + FOREVER_ENV + "CurveConstants = { ScaleTo100 = { __curve = true } } UnitHealthPercent = function() return 84 end", NO_RAID);
  // HealthText with the percent format on, and string.format answering the percent's "%d%%" with `format` (a Lua value) when given.
  const text = (setup, format) => addon.eval(`local UF = ns.GetModule("UnitFrames") UF.settings.healthFormat = "percent" ${setup}
    __s = __wfgWorld.secret() local real = string.format
    string.format = function(f, ...) if f == "%d%%" and ${format ? "true" : "false"} then return ${format || "nil"} end return real(f, ...) end
    local ok, t = pcall(UF.HealthText, "player") string.format = real
    return { ok, t == __s, tostring(t) }`);
  expect(text("", "__s"), "a percent the client hides comes back as it is, with no error").toEqual([true, true, expect.any(String)]);
  expect(text("", ""), "a plain percent").toEqual([true, false, "84%"]);
  expect(text("UnitIsDeadOrGhost = function() return true end", "__s"), "Dead wins over the percent").toEqual([true, false, "Dead"]);
});

it("unit frames: a hidden health text goes to the text as it is, and with health numbers off it is never asked for", () => {
  const addon = loggedIn(UNITS_ENV, NO_RAID);
  // The target's health text after a health event with HealthText answering `answer`: [the text is that answer, HealthText calls].
  const shown = (setup) => addon.eval(`local UF = ns.GetModule("UnitFrames") ${setup}
    __asked = 0 __s = __wfgWorld.secret() local real = UF.HealthText
    UF.HealthText = function() __asked = __asked + 1 return __s end
    __wfgStub.fire("UNIT_HEALTH", "target") UF.HealthText = real
    return { Vanguard_target.healthText:GetText() == __s, __asked, Vanguard_target.healthText:GetText() == "" }`);
  expect(shown(""), "health numbers on: the hidden text is shown untouched").toEqual([true, 1, false]);
  expect(shown("UF.settings.healthText = false"), "off: empty, and the text is never read").toEqual([false, 0, true]);
});

it("a ?? (boss or far higher) level reads in the hardest difficulty color, not the easiest", () => {
  const addon = loggedIn(FOREVER_ENV, NO_RAID);
  addon.world.setUnit("target", { name: "TEST-ONLY Skull", hp: 1, maxhp: 1, reaction: 2, level: -1 });
  addon.world.setUnit("focus", { name: "TEST-ONLY Big", hp: 1, maxhp: 1, reaction: 2, level: 70 });
  addon.fire("PLAYER_FOCUS_CHANGED");
  const t = addon.eval("local t, f = Vanguard_target.level, Vanguard_focus.level return { t:GetText(), t.__textColor, f.__textColor }");
  expect(t[0], "the level reads ??").toBe("??");
  expect(t[1], "in the color the client gives a unit five or more levels above you").toEqual(t[2]);
});

it("combo points for rogues and druids", () => {
  const addon = loggedIn(UNITS_ENV + `__units.player.class = "ROGUE" __cp = 3
    GetComboPoints = function(unit, target) return __cp end`, NO_RAID);
  // The pips' state: shown, how many lit, how many in all.
  const pips = () => addon.eval(`local CP = ns.GetModule("ComboPoints") local lit = 0
    for _, p in ipairs(CP.pips) do if p.fill:IsShown() then lit = lit + 1 end end
    return { shown = CP.bar:IsShown(), lit = lit, n = #CP.pips }`);
  let p = pips();
  expect(p.shown && p.lit === 3 && p.n === 5, "five pips above the player frame, one lit per point").toBeTruthy();
  addon.eval("__cp = 0");
  addon.fire("UNIT_POWER_UPDATE", "player", "COMBO_POINTS");
  expect(pips().shown === false, "hidden while you have no points").toBeTruthy();
  addon.eval("__cp = { __secret = true }");
  addon.fire("PLAYER_TARGET_CHANGED");
  expect(pips().shown === false, "a hidden count shows nothing").toBeTruthy();
  expect(addon.eval('Enum = Enum or {} Enum.PowerType = { ComboPoints = 4 } UnitPower = function() return 2 end return ns.GetModule("ComboPoints").Count()'), "a hidden count is never tested or swapped for your power: 0").toBe(0);
  const druid = loggedIn(UNITS_ENV + `__units.player.class = "DRUID"
    GetComboPoints = nil Enum = Enum or {} Enum.PowerType = { ComboPoints = 4 } UnitPower = function(unit, kind) return kind == 4 and 2 or 0 end`, NO_RAID);
  expect(druid.eval('local CP = ns.GetModule("ComboPoints") return CP.bar:IsShown() and CP.Count()') === 2, "without the older call, your combo-point power is read").toBeTruthy();
  const mage = loggedIn(UNITS_ENV, NO_RAID);
  expect(mage.eval('return ns.GetModule("ComboPoints").bar') === null, "other classes build nothing").toBeTruthy();
  const noFrames = loggedIn(UNITS_ENV + '__units.player.class = "ROGUE"', { savedVariables: "VanguardDB = { profiles = { Default = { modules = { UnitFrames = false, RaidFrames = false } } } }" });
  expect(noFrames.eval('local CP = ns.GetModule("ComboPoints") CP.Update() return CP.bar') === null, "no player frame, no pips").toBeTruthy();
});

it("power ticks: the five-second rule after a mana spell", () => {
  const addon = loggedIn(UNITS_ENV + TICKS_ENV);
  addon.eval("ns.GetModule('PowerTicks').bar:SetWidth(200)");
  expect(addon.eval("local PT = ns.GetModule('PowerTicks') return { PT.mode, PT.spark:GetParent() == Vanguard_player.power }"), "a mana user gets the mana spark on the player frame's power bar").toEqual(["mana", true]);
  expect(spark(addon), "no spark before a cast").toEqual([false, -1, false]);
  addon.fire("UNIT_SPELLCAST_SUCCEEDED", "target", "x", 90001);
  addon.fire("UNIT_SPELLCAST_SUCCEEDED", "player", "x", 90002);
  addon.fire("UNIT_SPELLCAST_SUCCEEDED", "player", "x", { __secret: true });
  expect(spark(addon)[0], "another unit's cast, a free spell or a hidden spell starts nothing").toBe(false);
  addon.fire("UNIT_SPELLCAST_SUCCEEDED", "player", "x", 90001);
  expect(spark(addon), "a mana spell starts the spark at the left").toEqual([true, 0, true]);
  addon.eval("__wfgStub.advance(2.5)");
  expect(spark(addon)[1], "halfway through the five seconds it's halfway along").toBe(100);
  addon.eval("__wfgStub.advance(3)");
  expect([spark(addon)[0], spark(addon)[2]], "after five seconds it hides and its timer stops").toEqual([false, false]);
  addon.fire("UNIT_POWER_FREQUENT", "player", "MANA");
  expect(spark(addon)[0], "mana going up is not an energy tick").toBe(false);
  addon.eval("C_Spell.GetSpellPowerCost = nil");
  addon.fire("UNIT_SPELLCAST_SUCCEEDED", "player", "x", 90001);
  expect(spark(addon)[0], "a client that can't say what a spell costs: no spark").toBe(false);
});

it("power ticks: the spark moves on one anchor, as tall as the bar, with no anchors cleared per frame", () => {
  const addon = loggedIn(UNITS_ENV + TICKS_ENV);
  addon.eval(`local PT = ns.GetModule('PowerTicks')
    PT.bar:SetWidth(200)
    __clears, __sets = 0, 0
    local set = PT.spark.SetPoint
    -- TEST-ONLY spies: the spark's anchor calls.
    PT.spark.ClearAllPoints = function() __clears = __clears + 1 end
    PT.spark.SetPoint = function(...) __sets = __sets + 1 return set(...) end`);
  addon.fire("UNIT_SPELLCAST_SUCCEEDED", "player", "x", 90001);
  addon.eval("for i = 1, 10 do __wfgStub.update(0.25) end");
  const out = addon.eval(`local PT = ns.GetModule('PowerTicks') local n = 0 for _ in pairs(PT.spark.__points) do n = n + 1 end
    return { __clears, __sets, n, PT.spark:GetHeight() == PT.bar:GetHeight() and PT.bar:GetHeight() > 0 }`);
  expect(out, "the start and 10 frames: 11 moves of its one anchor, none cleared; as tall as the bar").toEqual([0, 11, 1, true]);
  expect(spark(addon), "and it is where the sweep is (halfway after 2.5 s)").toEqual([true, 100, true]);
});

it("power ticks: energy every two seconds, and forms switch", () => {
  const addon = loggedIn(UNITS_ENV + TICKS_ENV + "__ptype = 3");
  addon.eval("ns.GetModule('PowerTicks').bar:SetWidth(200)");
  addon.fire("UNIT_POWER_FREQUENT", "player", "ENERGY");
  expect(spark(addon)[0], "the first reading is only a starting point").toBe(false);
  addon.eval("__units.player.power = 70");
  addon.fire("UNIT_POWER_FREQUENT", "target", "ENERGY");
  addon.fire("UNIT_POWER_FREQUENT", "player", "ENERGY");
  expect(spark(addon), "energy going up is a tick: the spark starts").toEqual([true, 0, true]);
  addon.eval("__wfgStub.advance(2.5)");
  expect(spark(addon), "and keeps crossing every two seconds").toEqual([true, 50, true]);
  addon.eval("__units.player.power = { __secret = true }");
  addon.fire("UNIT_POWER_FREQUENT", "player", "ENERGY");
  addon.eval("__units.player.power = 10");
  addon.fire("UNIT_POWER_FREQUENT", "player", "ENERGY");
  expect(spark(addon)[1], "a hidden value and a drop (an ability) don't restart it").toBe(50);
  addon.fire("UNIT_SPELLCAST_SUCCEEDED", "player", "x", 90001);
  expect(spark(addon)[1], "casts don't move the energy spark").toBe(50);
  addon.fire("UNIT_DISPLAYPOWER", "player");
  expect(spark(addon)[0], "the same power type keeps it").toBe(true);
  addon.eval("__ptype = 1");
  addon.fire("UPDATE_SHAPESHIFT_FORM");
  expect([addon.eval("return ns.GetModule('PowerTicks').mode"), ...spark(addon)], "rage (bear form) has no spark").toEqual([null, false, 50, false]);
});

it("power ticks: the energy spark stops its timer when no tick comes (full energy)", () => {
  const addon = loggedIn(UNITS_ENV + TICKS_ENV + "__ptype = 3");
  addon.eval("ns.GetModule('PowerTicks').bar:SetWidth(200)");
  addon.fire("UNIT_POWER_FREQUENT", "player", "ENERGY");
  addon.eval("__units.player.power = 70");
  addon.fire("UNIT_POWER_FREQUENT", "player", "ENERGY");
  addon.eval("__wfgStub.advance(5.5)");
  expect(spark(addon), "two missed sweeps on, the spark still crosses").toEqual([true, 150, true]);
  addon.eval("__wfgStub.advance(1)");
  expect([spark(addon)[0], spark(addon)[2]], "after three sweeps with no tick it hides and its timer stops").toEqual([false, false]);
  addon.eval("__units.player.power = 90");
  addon.fire("UNIT_POWER_FREQUENT", "player", "ENERGY");
  expect(spark(addon), "the next tick starts it again").toEqual([true, 0, true]);
});

it("power ticks: switches, and no player frame", () => {
  const addon = loggedIn(UNITS_ENV + TICKS_ENV + CLICK_LUA);
  addon.slash("");
  addon.eval('__click("Unit frames")');
  expect(addon.eval('return __click("Five-second rule") and ns.GetModule("PowerTicks").mode'), "the mana spark switches off at once").toBe(null);
  expect(addon.eval('return __click("Energy tick") and VanguardDB.profiles.Default.PowerTicks.energy'), "the energy switch is on the page").toBe(false);
  const off = loggedIn(UNITS_ENV + TICKS_ENV + "__ptype = 3", { savedVariables: "VanguardDB.profiles = { Default = { PowerTicks = { energy = false } } }" });
  expect(off.eval("return ns.GetModule('PowerTicks').mode"), "energy switched off: no spark").toBe(null);
  const noFrames = loggedIn(UNITS_ENV + TICKS_ENV + CLICK_LUA, { savedVariables: "VanguardDB.profiles = { Default = { modules = { UnitFrames = false } } }" });
  expect(noFrames.eval("return ns.GetModule('PowerTicks').spark == nil"), "no player frame, no spark").toBe(true);
  noFrames.slash("");
  noFrames.eval('__click("Unit frames")');
  expect(noFrames.eval('return __click("Five-second rule") and VanguardDB.profiles.Default.PowerTicks.mana'), "the switch still saves").toBe(false);
});

// Each swing row: shown, its fill (value of max) and its seconds left.
const swings = (addon) => addon.eval(`local SW = ns.GetModule("SwingTimer") local out = {}
  for id = 0, 2 do local r = SW.rows[id] out[id + 1] = { r:IsShown(), r:GetValue(), select(2, r:GetMinMaxValues()), r.time:GetText() } end
  return out`);

it("swing timer: a row per hand, from the client's own swings", () => {
  const addon = loggedIn(UNITS_ENV + SWING_ENV);
  expect(swings(addon).map((r) => r[0]), "nothing shows before you swing").toEqual([false, false, false]);
  addon.fire("PLAYER_SWING", 2.6, 0);
  addon.fire("PLAYER_SWING", 1.4, 1);
  expect(swings(addon).slice(0, 2), "main hand and off hand start empty, timed by the client").toEqual([[true, 0, 2.6, "2.6"], [true, 0, 1.4, "1.4"]]);
  addon.eval("__wfgStub.advance(1)");
  expect(swings(addon)[0], "a second later the main hand has filled that much").toEqual([true, 1, 2.6, "1.6"]);
  addon.eval("__wfgStub.advance(0.5)");
  expect(swings(addon)[1][0], "the off hand hides once its swing lands").toBe(false);
  addon.fire("PLAYER_SWING", { __secret: true }, 0);
  addon.fire("PLAYER_SWING", 0, 0);
  addon.fire("PLAYER_SWING", 2, 7);
  expect(swings(addon)[0][1], "a hidden or empty length, or an unknown hand, changes nothing").toBe(1.5);
  addon.eval("__wfgStub.advance(2)");
  expect([swings(addon)[0][0], addon.eval("return Vanguard_SwingTimer.__scripts.OnUpdate == nil")], "once every swing has landed the timer stops").toEqual([false, true]);
  addon.fire("PLAYER_SWING", 2, 2);
  addon.fire("PLAYER_DEAD");
  expect(swings(addon)[2][0], "dying clears the rows").toBe(false);
});

it("swing timer: a weapon swap restarts a swing under way at the new weapon's speed", () => {
  // TEST-ONLY weapon speeds: main hand, off hand, ranged.
  const addon = loggedIn(UNITS_ENV + SWING_ENV + "__speeds = { 2.6, 1.4 } UnitAttackSpeed = function() return unpack(__speeds) end");
  addon.fire("PLAYER_SWING", 2.6, 0);
  addon.fire("PLAYER_SWING", 1.4, 1);
  addon.eval("__wfgStub.advance(1) __speeds = { 3.8 }");
  addon.fire("WEAPON_SLOT_CHANGED");
  const after = swings(addon);
  expect(after[0], "the main hand starts over, timed by the new two-hander (as the game's own swing timer does)").toEqual([true, 0, 3.8, "3.8"]);
  expect(after[1][0], "the off hand, now empty, stops").toBe(false);
  expect(after[2][0], "a hand that wasn't swinging stays hidden").toBe(false);
  addon.eval("__speeds = { { __secret = true } }");
  addon.fire("WEAPON_SLOT_CHANGED");
  expect(swings(addon)[0][0], "a speed the client hides: no guess, the row stops").toBe(false);
});

it("swing timer: who sees it", () => {
  // Whether a login with this setup and these saved settings builds the swing rows.
  const wanted = (env, saved) => loggedIn(UNITS_ENV + env, saved ? { savedVariables: saved } : undefined).eval("return ns.GetModule('SwingTimer').rows ~= nil");
  expect(wanted(SWING_ENV.replace("WARRIOR", "MAGE")), "a mage doesn't, by default").toBe(false);
  expect(wanted(SWING_ENV.replace("WARRIOR", "MAGE"), "VanguardDB.profiles = { Default = { SwingTimer = { show = 'always' } } }"), "unless it's set to always").toBe(true);
  expect(wanted(SWING_ENV, "VanguardDB.profiles = { Default = { SwingTimer = { show = 'never' } } }"), "never is never").toBe(false);
  expect(wanted(SWING_ENV.replace('"WARRIOR"', '{ __secret = true }')), "a hidden class: no timer").toBe(false);
  expect(wanted(SWING_ENV.replace("C_SwingTimer = {}", "C_SwingTimer = nil")), "a client without swings: no timer").toBe(false);
  expect(wanted(SWING_ENV + "Enum.PlayerSwingType = nil"), "or without swing types").toBe(false);
  const partial = loggedIn(UNITS_ENV + SWING_ENV + "Enum.PlayerSwingType = { MainHand = 0 }");
  expect(partial.eval("local n = 0 for _ in pairs(ns.GetModule('SwingTimer').rows) do n = n + 1 end return n"), "a row only for each hand the client names").toBe(1);
  const addon = loggedIn(UNITS_ENV + SWING_ENV + CLICK_LUA);
  addon.slash("");
  addon.eval('__click("Unit frames")');
  expect(addon.eval('return __click("Swing timer") and VanguardDB.profiles.Default.SwingTimer.show'), "the switch is on the page").toBe("always");
});

// TEST-ONLY the game's own swing bars (Blizzard_SwingTimer.xml): background and frame art, a fill
// with its two labels and the label's shadow, and the range look that sets the art's alpha again.
const GAME_SWING_ENV = `
  for _, hand in ipairs({ "MainHand", "OffHand", "Ranged" }) do
    local f = CreateFrame("Frame", "SwingTimer" .. hand .. "Frame", UIParent)
    f.Background, f.Border = f:CreateTexture(nil, "BACKGROUND"), f:CreateTexture(nil, "BACKGROUND")
    f.StatusBar = CreateFrame("StatusBar", nil, f)
    f.StatusBar.TypeLabelShadow = f.StatusBar:CreateTexture(nil, "OVERLAY")
    f.StatusBar.TypeLabel, f.StatusBar.TimeLabel = f.StatusBar:CreateFontString(nil, "OVERLAY"), f.StatusBar:CreateFontString(nil, "OVERLAY")
    f.ApplyRangePresentation = function(self) self.Background:SetAlpha(0.4) self.Border:SetAlpha(0.4) end
    f:RegisterEvent("PLAYER_ENTERING_WORLD")
  end
`;

// One game swing bar as drawn: art alphas, fill texture and color, label font, shadow shown, panel.
const gameSwing = (addon, hand) => addon.eval(`local f = SwingTimer${hand}Frame local bar = f.StatusBar
  return { bg = f.Background.__alpha, border = f.Border.__alpha, texture = bar:GetStatusBarTexture() and bar:GetStatusBarTexture().__texture,
    color = bar.__barColor, font = bar.TimeLabel:GetFont() == ns.Theme.Font(), shadow = bar.TypeLabelShadow:IsShown(), painted = ns.Theme.PaintedCount() }`);

it("swing timer: the game's own bars are put away while Vanguard's is on, out of combat", () => {
  const addon = loggedIn(UNITS_ENV + SWING_ENV + GAME_SWING_ENV);
  expect(["MainHand", "OffHand", "Ranged"].map((h) => putAway(addon, `SwingTimer${h}Frame`)), "all three hidden, as the game's unit frames are").toEqual([true, true, true]);
  expect(addon.eval("return SwingTimerMainHandFrame:IsEventRegistered('PLAYER_ENTERING_WORLD') or ns.FrameState('vgSkinned')[SwingTimerMainHandFrame] == true"), "no events, and not dressed").toBe(false);
  const fight = createAddon({ savedVariables: SETUP_DONE });
  fight.eval(UNITS_ENV + SWING_ENV + GAME_SWING_ENV);
  setCombat(fight, true);
  fight.login();
  expect(putAway(fight, "SwingTimerMainHandFrame"), "in a fight they wait").toBe(false);
  setCombat(fight, false);
  expect(putAway(fight, "SwingTimerMainHandFrame"), "and go when it ends").toBe(true);
  expect(fight.eval("return #ns.errors"), "nothing errors").toBe(0);
});

it("swing timer: with Vanguard's off, the game's own bars are drawn in the theme", () => {
  const addon = loggedIn(UNITS_ENV + SWING_ENV + GAME_SWING_ENV, { savedVariables: "VanguardDB.profiles = { Default = { SwingTimer = { show = 'never' } } }" });
  const main = gameSwing(addon, "MainHand");
  expect([main.bg, main.border, main.texture, main.font, main.shadow], "art faded, the theme's bar and font, the label's shadow gone").toEqual([0, 0, addon.eval("return ns.Theme.BarTexture()"), true, false]);
  expect(isTok(addon, main.color, "accent") && isTok(addon, gameSwing(addon, "OffHand").color, "text2") && isTok(addon, gameSwing(addon, "Ranged").color, "focus"), "each hand in its row's color, as Vanguard's rows").toBe(true);
  expect(putAway(addon, "SwingTimerMainHandFrame"), "the game's bars stay the game's").toBe(false);
  addon.eval("SwingTimerMainHandFrame:ApplyRangePresentation() SwingTimerMainHandFrame:Hide() SwingTimerMainHandFrame:Show()");
  const again = gameSwing(addon, "MainHand");
  expect([again.bg, again.border, again.painted], "the range look and a second show fade the art again, painting nothing more").toEqual([0, 0, main.painted]);
  const bare = loggedIn(UNITS_ENV + SWING_ENV + 'CreateFrame("Frame", "SwingTimerMainHandFrame", UIParent) SwingTimerOffHandFrame = CreateFrame("Frame", nil, UIParent) SwingTimerOffHandFrame.StatusBar = CreateFrame("StatusBar", nil, SwingTimerOffHandFrame)', { savedVariables: "VanguardDB.profiles = { Default = { SwingTimer = { show = 'never' } } }" });
  expect([bare.eval("return ns.FrameState('vgSkinned')[SwingTimerMainHandFrame] == nil and ns.FrameState('vgSkinned')[SwingTimerOffHandFrame]"), bare.eval("return #ns.errors")], "a bar without its fill is left alone; one without labels, art or range look is still dressed").toEqual([true, 0]);
  expect(loggedIn(UNITS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { SwingTimer = { show = 'never' } } }" }).eval("return #ns.errors"), "a client without the game's swing timer loads cleanly").toBe(0);
});

// TEST-ONLY threat and pet: threat on the target and your pet's mood.
const EXTRAS_ENV = `
  __threatInfo = { false, 0, 42 }
  UnitDetailedThreatSituation = function(a, b) return __threatInfo[1], __threatInfo[2], __threatInfo[3], 0, 0 end
  __happy = 3
  GetPetHappiness = function() return __happy, 0, 0 end
`;

it("threat on your target and your pet's happiness", () => {
  const addon = loggedIn(UNITS_ENV + EXTRAS_ENV + CLICK_LUA);
  // The threat text above the target frame: its text and color.
  const threat = () => addon.eval("local UX = ns.GetModule('UnitExtras') return { UX.threat:GetText(), UX.threat.__textColor, select(2, UX.threat:GetPoint()) == Vanguard_target }");
  expect(threat(), "under aggro, your share shows above the target frame in the secondary color").toEqual(["42%", tok(addon, "text2"), true]);
  addon.eval("__threatInfo = { true, 3, 100 }");
  addon.fire("UNIT_THREAT_SITUATION_UPDATE", "player");
  expect(threat().slice(0, 2), "with aggro it turns the threat color").toEqual(["100%", tok(addon, "threat3")]);
  addon.eval("__threatInfo = { false, 7, 99.6 }");
  addon.fire("UNIT_THREAT_LIST_UPDATE", "target");
  expect(threat().slice(0, 2), "rounded, and the color caps at the top threat color").toEqual(["100%", tok(addon, "threat3")]);
  for (const info of ["{ false, { __secret = true }, 50 }", "{ false, 0, 0 }", "{ nil, nil, nil }"]) {
    addon.eval(`__threatInfo = ${info}`);
    addon.fire("PLAYER_TARGET_CHANGED");
    expect(threat()[0], `no threat to show (${info}): the text clears`).toBe("");
  }
  // The pet's mood glyph: shown, its color, its glyph.
  const dot = () => addon.eval("local d = ns.GetModule('UnitExtras').happy return { d:IsShown(), d.__vertexColor, (d.__texture or ''):match('[^\\\\]+$') }");
  expect(dot(), "a happy pet gets a check in the good color").toEqual([true, tok(addon, "good"), "Check"]);
  addon.eval("__happy = 2");
  addon.fire("UNIT_HAPPINESS", "pet");
  expect(dot(), "a content one, a triangle in warn").toEqual([true, tok(addon, "warn"), "Warn"]);
  addon.eval("__happy = 1");
  addon.fire("UNIT_HAPPINESS", "pet");
  expect(dot(), "an unhappy one, a cross in bad").toEqual([true, tok(addon, "bad"), "Close"]);
  addon.eval("__happy = nil");
  addon.fire("UNIT_PET", "player");
  expect(dot()[0], "no pet with moods: no dot").toBe(false);
  addon.eval("GetPetHappiness = nil");
  expect(addon.eval("return ns.GetModule('UnitExtras').Happiness()"), "a client without moods has none").toBe(null);
  addon.slash("");
  addon.eval('__click("Unit frames")');
  expect(addon.eval('return __click("Your threat on your target") and VanguardDB.profiles.Default.UnitExtras.threat'), "the threat switch is on the page").toBe(false);
  expect(addon.eval('return __click("happiness") and VanguardDB.profiles.Default.UnitExtras.happiness'), "and the pet's").toBe(false);
});

it("a creature someone else tagged is grey on the unit frames, as on the game's frames", () => {
  const addon = loggedIn(UNITS_ENV + `__tapped = { target = true }
    UnitIsTapDenied = function(unit) return __tapped[unit] end
    UnitPlayerControlled = function(unit) return __units[unit] and __units[unit].controlled end`);
  expect(isTok(addon, ufState(addon, "target").color, "tapped"), "another player's mob is grey").toBe(true);
  addon.eval("__tapped.target = false");
  addon.fire("UNIT_FACTION", "target");
  expect(isTok(addon, ufState(addon, "target").color, "hostile"), "let go, it is red again on the faction change the game re-greys on").toBe(true);
  addon.eval("__tapped.target = true __units.target.controlled = true");
  addon.fire("UNIT_FACTION", "target");
  expect(isTok(addon, ufState(addon, "target").color, "hostile"), "a player's pet or demon is never tagged").toBe(true);
  addon.eval("__units.target.controlled = nil __tapped.target = { __secret = true }");
  addon.fire("UNIT_FACTION", "target");
  expect(isTok(addon, ufState(addon, "target").color, "hostile"), "a hidden answer counts as untagged").toBe(true);
  addon.eval("__tapped.player = true");
  expect(ufState(addon, "player").color[0], "players keep their class color").toBe(0.25);
});

it("a released player reads Ghost and a feigning hunter reads alive", () => {
  const addon = loggedIn(UNITS_ENV + `UnitIsGhost = function(unit) return __units[unit].ghost end
    UnitIsFeignDeath = function(unit) return __units[unit].feign end`, NO_RAID);
  // The party frame's health text.
  const text = () => ufState(addon, "party1").text;
  expect(text(), "dead and not released: Dead").toBe("Dead");
  addon.eval("__units.party1.ghost = true");
  addon.fire("UNIT_HEALTH", "party1");
  expect(text(), "released: Ghost").toBe("Ghost");
  addon.eval("__units.party1.ghost = { __secret = true }");
  addon.fire("UNIT_HEALTH", "party1");
  expect(text(), "a hidden ghost answer: Dead").toBe("Dead");
  addon.eval("__units.party1.ghost = nil __units.party1.feign = true");
  addon.fire("UNIT_HEALTH", "party1");
  expect(text(), "feigning (the client calls it dead): the health shows").toBe("0");
});

it("a raid target icon sits on every unit frame's top edge, following the Raid target icons switch", () => {
  const addon = loggedIn(UNITS_ENV + "__marks = { target = 8, party1 = 1 } GetRaidTargetIndex = function(unit) return __marks[unit] end", NO_RAID);
  // The raid icon on a unit frame: shown, its sheet cell, and where it sits.
  const icon = (key) => addon.eval(`local t = Vanguard_${key}.raidIcon local p, rel, rp = t:GetPoint()
    return { t:IsShown(), t:IsShown() and t.__texCoord or false, p, rel == Vanguard_${key}, rp }`);
  expect(icon("target"), "skull on the target: the last cell, centred on the top edge").toEqual([true, [0.75, 1, 0.25, 0.5], "CENTER", true, "TOP"]);
  expect(icon("party1").slice(0, 2), "star on a party member").toEqual([true, [0, 0.25, 0, 0.25]]);
  expect(icon("player")[0], "no mark: none").toBe(false);
  addon.eval("__marks = { player = 2, target = { __secret = true } }");
  addon.fire("RAID_TARGET_UPDATE");
  expect([icon("player")[0], icon("target")[0], icon("party1")[0]], "a new mark shows at once, a hidden one shows nothing, a cleared one goes").toEqual([true, false, false]);
  addon.eval('__units.targettarget = { name = "TEST-ONLY ToT", hp = 1, maxhp = 2, power = 0, maxpower = 0, ptype = "MANA" } __marks.targettarget = 3');
  addon.update(0.25);
  expect(icon("targettarget")[0], "the target of target's mark follows its timer").toBe(true);
  addon.eval("ns.Settings('RaidStatus').raidIcons = false ns.GetModule('UnitFrames').RefreshRaidIcons()");
  expect(icon("player")[0], "the switch off: no marks").toBe(false);
});

// The tooltip's owner, unit, shown state and lines, after hovering (or leaving) a unit frame.
const hover = (addon, key, script = "OnEnter") => addon.eval(`
  local f = Vanguard_${key}
  f:GetScript("${script}")(f)
  local lines = {}
  for i, l in ipairs(GameTooltip.__lines or {}) do lines[i] = l.text end
  return { owned = GameTooltip:GetOwner() == f, unit = GameTooltip.__unit, shown = GameTooltip:IsShown(), lines = lines }`);

it("hovering a unit frame shows its unit's tooltip, as the game's frames do", () => {
  const addon = loggedIn(UNITS_ENV + EXTRAS_ENV, NO_RAID);
  for (const key of ["player", "target", "party1"]) {
    const t = hover(addon, key);
    expect([t.owned, t.unit, t.shown], `${key}: the frame owns the tooltip, showing its unit`).toEqual([true, key, true]);
  }
  expect(addon.eval("return Vanguard_target.UpdateTooltip ~= nil"), "the tooltip can keep it fresh while the mouse stays").toBe(true);
  hover(addon, "target");
  expect(hover(addon, "target", "OnLeave").shown, "leaving hides it").toBe(false);
  hover(addon, "player");
  addon.eval("GameTooltip:SetOwner(UIParent)");
  expect(hover(addon, "target", "OnLeave").shown, "but a tooltip something else took over is left alone").toBe(true);
  addon.eval("GameTooltip:Hide() GameTooltip.IsForbidden = function() return true end");
  const forbidden = hover(addon, "target");
  expect(forbidden.shown, "a forbidden tooltip is never touched").toBe(false);
  expect(hover(addon, "target", "OnLeave").shown, "on leave either").toBe(false);
});

it("the pet frame's tooltip adds your hunter pet's mood", () => {
  const addon = loggedIn(UNITS_ENV + EXTRAS_ENV + `__units.pet = { name = "TEST-ONLY Wolf", hp = 1, maxhp = 1, power = 0, maxpower = 0, ptype = "FOCUS" }
    GetPetHappiness = function() return __happy, __damage, 0 end __damage = 125`);
  // The pet tooltip's lines and the mood line's red.
  const pet = () => addon.eval(`Vanguard_pet:GetScript("OnEnter")(Vanguard_pet)
    local lines = GameTooltip.__lines return { lines[1].text, lines[2] and lines[2].text or false, lines[2] and lines[2].r or false }`);
  expect(pet(), "a happy pet: its mood and the damage it gives, in the good color").toEqual(["TEST-ONLY Wolf", "Happy: 125% damage", addon.eval("return (ns.Theme.RGB('good'))")]);
  addon.eval("__happy, __damage = 1, { __secret = true }");
  expect(pet().slice(0, 2), "a hidden damage figure leaves just the mood").toEqual(["TEST-ONLY Wolf", "Unhappy"]);
  addon.eval("__happy = nil");
  expect(pet()[1], "a pet without moods: no line").toBe(false);
  addon.eval("ns.GetModule('Tooltips').settings.hideInCombat = true __wfgStub.inCombat = true __happy = 3");
  addon.eval("GameTooltip.SetUnit = function(self, unit) self.__lines = { { text = unit } } self:Hide() end");
  expect([pet()[1], addon.eval("return GameTooltip:IsShown()")], "a tooltip hidden for the fight stays hidden, with no line added").toEqual([false, false]);
});

it("unit events: combo points, the druid's mana, power ticks and threat ask the client for your own units only", () => {
  const addon = loggedIn(UNITS_ENV + EXTRAS_ENV + TICKS_ENV + `__units.player.class = "DRUID" __cp = 2
    GetComboPoints = function() return __cp end`, NO_RAID);
  // Who hears the event (see unitEvents).
  const heard = (event) => unitEvents(addon, event);
  const frameUnits = ["boss1", "boss2", "boss3", "boss4", "boss5", "focus", "party1", "party2", "party3", "party4", "pet", "player", "target", "targettarget"];
  // The unit frames' subscriptions (one per frame, for its unit) sorted in with `own`, as unitEvents lists them.
  const withFrames = (...own) => [...frameUnits, ...own].sort().join(" ");
  expect(heard("UNIT_HEALTH"), "the unit frames: one subscription per frame, for its own unit").toEqual({ subs: withFrames(), plain: 0 });
  expect(heard("UNIT_POWER_UPDATE"), "combo points and the mana bar: your power only, nothing takes every unit's").toEqual({ subs: withFrames("player", "player"), plain: 0 });
  expect(heard("UNIT_POWER_FREQUENT"), "the energy tick too").toEqual({ subs: "player player player", plain: 0 });
  expect(heard("UNIT_MAXPOWER")).toEqual({ subs: withFrames("player", "player"), plain: 0 });
  expect(heard("UNIT_DISPLAYPOWER"), "a form's power type: the mana bar and the spark").toEqual({ subs: withFrames("player", "player"), plain: 0 });
  expect(heard("UNIT_SPELLCAST_SUCCEEDED"), "the five-second rule and the craft queue: your casts").toEqual({ subs: "player player", plain: 0 });
  expect([heard("UNIT_THREAT_LIST_UPDATE").subs, heard("UNIT_THREAT_SITUATION_UPDATE").subs], "threat: your target's list (the threat panel, and the target frame's tag mark), and your own situation").toEqual(["target target", "player"]);
  // How many combo-point pips are lit.
  const lit = () => addon.eval('local n = 0 for _, p in ipairs(ns.GetModule("ComboPoints").pips) do if p.fill:IsShown() then n = n + 1 end end return n');
  addon.eval("__cp = 4");
  addon.fire("UNIT_POWER_UPDATE", "target", "COMBO_POINTS");
  expect(lit(), "another unit's power event repaints nothing").toBe(2);
  addon.fire("UNIT_POWER_FREQUENT", "player", "COMBO_POINTS");
  expect(lit(), "yours does").toBe(4);
});

it("threat and happiness only where the client and settings allow", () => {
  // Whether a login with this setup and these saved settings builds the threat text and the mood dot.
  const built = (env, saved) => loggedIn(UNITS_ENV + env, saved ? { savedVariables: saved } : undefined)
    .eval("local UX = ns.GetModule('UnitExtras') return { UX.threat ~= nil, UX.happy ~= nil }");
  expect(built("UnitThreatSituation = nil UnitDetailedThreatSituation = nil C_PetInfo = nil GetPetHappiness = nil"), "a client without either builds neither").toEqual([false, false]);
  expect(built(EXTRAS_ENV, "VanguardDB.profiles = { Default = { UnitExtras = { threat = false, happiness = false } } }"), "both can be switched off").toEqual([false, false]);
  expect(built(EXTRAS_ENV, "VanguardDB.profiles = { Default = { modules = { UnitFrames = false } } }"), "no unit frames, nothing to add to").toEqual([false, false]);
  expect(loggedIn(UNITS_ENV + EXTRAS_ENV).eval("return ns.GetModule('UnitExtras').Threat ~= nil"), "the module loads").toBe(true);
});

// The player frame's Calm HUD state: its state driver, the state now and its alpha (to the hundredth).
const calm = (addon, key = "player") => addon.eval(`local f = Vanguard_${key}
  return { driver = f.__states and f.__states.vgvis or "none", now = f.vgState or "none", alpha = math.floor(f:GetAlpha() * 100 + 0.5) / 100 }`);

it("Calm HUD: frames dim out of combat, come back for a fight, a hostile target or the mouse, and stay clickable", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA, NO_RAID);
  expect(calm(addon), "off by default: no state driver, full strength").toEqual({ driver: "none", now: "none", alpha: 1 });
  addon.slash("");
  addon.eval('__click("Unit frames") __click("Calm HUD")');
  expect(addon.eval("return VanguardDB.profiles.Default.UnitFrames.calm"), "the switch saves it").toBe(true);
  expect(calm(addon), "on: the client's state dims the frame").toEqual({ driver: "[combat] show; [harm,nodead] show; dim", now: "dim", alpha: 0.35 });
  expect(calm(addon, "focus").driver, "the focus frame dims too").toBe("[combat] show; [harm,nodead] show; dim");
  expect(addon.eval("return Vanguard_player:GetAttribute('*type1')"), "still a clickable unit button").toBe("target");
  addon.eval("local f = Vanguard_player f:GetScript('OnEnter')(f)");
  expect(calm(addon).alpha, "under the mouse it is at full strength").toBe(1);
  addon.eval("local f = Vanguard_player f:GetScript('OnLeave')(f)");
  expect(calm(addon).alpha, "and dims again when the mouse leaves").toBe(0.35);
  addon.eval('Vanguard_player:SetAttribute("state-vgvis", "show")');
  expect(calm(addon).alpha, "a fight or a hostile target: the client says show").toBe(1);
  addon.eval('Vanguard_player:SetAttribute("state-vgvis", "dim")');
  setCombat(addon, true);
  addon.eval('__click("Calm HUD")');
  expect(calm(addon).driver, "switching it off in combat waits").toBe("[combat] show; [harm,nodead] show; dim");
  setCombat(addon, false);
  expect(calm(addon), "and brings the frame back when the fight ends").toEqual({ driver: "show", now: "show", alpha: 1 });
});

it("Calm HUD: setup's look step and the situations offer it", () => {
  const addon = loggedIn(UNITS_ENV, NO_RAID);
  addon.eval("ns.Setup.Open()");
  expect(addon.eval("return Vanguard_Setup.pages.look.calm ~= nil and ns.Setup.Calm()"), "the look step has the switch, off").toBe(false);
  addon.eval("local r = Vanguard_Setup.pages.look.calm r:GetScript('OnClick')(r)");
  expect(addon.eval("return ns.Setup.Calm()") && calm(addon).alpha === 0.35, "turning it on there dims the frames at once").toBe(true);
  expect(addon.eval('return VanguardDB.profiles["Default backup"] ~= nil'), "after the usual backup").toBe(true);
  expect(addon.eval('return ns.GetModule("Situations").Holds("UnitFrames", "calm")'), "a situation can hold it").toBe(true);
});

// The Versus deck as drawn: shown, its two anchors, the crest's anchor, and whether the target's bars fill from the right.
const deck = (addon) => addon.eval(`local d, t = ns.GetModule("UnitFrames").deck, Vanguard_target
  local fills = t.health:GetReverseFill() and t.power:GetReverseFill()
  if not d then return { shown = false, fills = fills } end
  return { shown = d:IsShown(), left = d.__points.TOPLEFT.rel == Vanguard_player, right = d.__points.BOTTOMRIGHT.rel == Vanguard_target,
    crest = d.crest.__points.CENTER.relPoint, strata = d.__strata, fills = fills }`);

// How many shown corner pieces of an art a frame has, and the art of each mask on a texture by corner (TEST-ONLY reads).
const corners = (addon, name, art) => addon.eval(`local n = 0 for _, r in ipairs({ ${name}:GetRegions() }) do if tostring(r.__texture):find("${art}") and r:IsShown() then n = n + 1 end end return n`);
const maskArt = (addon, region) => addon.eval(`local out = {} for i, m in ipairs(${region}.__masks or {}) do out[i] = next(m.__points) .. " " .. tostring(m.__texture):match("[^\\\\]+$") end table.sort(out) return out`);

it("Versus deck: one rounded panel behind the player and target, the crest at the seam, the target's bars mirrored", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA, NO_RAID);
  expect(deck(addon), "off by default: no panel, bars fill from the left").toEqual({ shown: false, fills: false });
  addon.slash("");
  addon.eval('__click("Unit frames") __click("Versus deck: your")');
  expect(addon.eval("return VanguardDB.profiles.Default.UnitFrames.deck"), "the switch saves it").toBe(true);
  expect(deck(addon), "on: the panel spans both frames, under everything (background strata), the crest on its top edge, the target fills from the right")
    .toEqual({ shown: true, left: true, right: true, crest: "TOP", strata: "BACKGROUND", fills: true });
  expect(borderOf(addon, "ns.GetModule('UnitFrames').deck"), "an accent border round the panel").toEqual(tok(addon, "accent").slice(0, 3).concat(1));
  expect(["ns.GetModule('UnitFrames').deck", "Vanguard_player", "Vanguard_target"].map((f) => [corners(addon, f, "CornerLine"), corners(addon, f, "CornerCut")]), "the panel and both frames round their corners, none cut").toEqual([[4, 0], [4, 0], [4, 0]]);
  expect([maskArt(addon, "Vanguard_target.health:GetStatusBarTexture()"), maskArt(addon, "Vanguard_player.power.bg")], "their bars are rounded inside the arcs, still two masks each")
    .toEqual([["TOPLEFT CornerRoundMask", "TOPRIGHT CornerRoundMaskTR"], ["BOTTOMLEFT CornerRoundMaskBL", "BOTTOMRIGHT CornerRoundMaskBR"]]);
  expect(corners(addon, "Vanguard_focus", "CornerCutLine"), "frames outside the deck keep their shield corners").toBe(4);
  expect(addon.eval("return { select(2, Vanguard_player.name:GetFont()), select(2, Vanguard_target.healthText:GetFont()) }"), "names and health in the title size")
    .toEqual(addon.eval("return { select(2, ns.Theme.Text(UIParent:CreateFontString(), 'title'):GetFont()), select(2, ns.Theme.Text(UIParent:CreateFontString(), 'title'):GetFont()) }"));
  addon.eval('__click("Calm HUD")');
  expect(addon.eval("return ns.GetModule('UnitFrames').deck.vgStateString"), "the deck dims with the Calm HUD").toBe("[combat] show; [harm,nodead] show; dim");
  setCombat(addon, true);
  addon.eval('__click("Versus deck: your")');
  expect(deck(addon).shown, "switching it off in combat waits").toBe(true);
  setCombat(addon, false);
  expect(deck(addon), "and takes it away when the fight ends").toMatchObject({ shown: false, fills: false });
  expect([corners(addon, "Vanguard_player", "CornerCutLine"), maskArt(addon, "Vanguard_target.health.bg")], "the two frames get their shield corners back, bars too").toEqual([4, ["TOPLEFT CornerCutMask", "TOPRIGHT CornerCutMaskTR"]]);
  expect(addon.eval("return { select(2, Vanguard_player.name:GetFont()), select(2, Vanguard_target.healthText:GetFont()) }"), "the texts back in their own sizes")
    .toEqual(addon.eval("return { select(2, ns.Theme.Text(UIParent:CreateFontString(), 'name'):GetFont()), select(2, ns.Theme.Text(UIParent:CreateFontString(), 'number'):GetFont()) }"));
});

// Each party frame's visibility driver and whether it has a unit watch, with `savedVariables` (UnitFrames builds them).
const partyWatch = (savedVariables) => loggedIn(UNITS_ENV, { savedVariables }).eval(`local out = {}
  for i = 1, 4 do local f = _G["Vanguard_party" .. i] out[i] = { f.__drivers and f.__drivers["state-visibility"] or false, f.__watched or false } end
  return out`);
// What partyWatch should find: each frame hides in a raid and shows while its unit exists, by one driver.
const PARTY_DRIVERS = [1, 2, 3, 4].map((i) => [`[group:raid] hide; [@party${i},exists] show; hide`, false]);

it("separate party frames hide in a raid: one visibility driver, no unit watch", () => {
  expect(partyWatch("VanguardDB.profiles = { Default = { RaidFrames = { showInParty = false } } }")).toEqual(PARTY_DRIVERS);
});

it("separate party frames hide in a raid with the raid frames module off too", () => {
  expect(partyWatch(NO_RAID.savedVariables)).toEqual(PARTY_DRIVERS);
});
