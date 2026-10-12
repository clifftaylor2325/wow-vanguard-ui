// units: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { CLICK_LUA, FOREVER_ENV, NO_RAID, RETAIL, SETUP_DONE, SWING_ENV, TICKS_ENV, TOTEMS_ENV, UNITS_ENV, bars, button, isTok, key, later, loggedIn, marks, putAway, setCombat, spark, tok, totemCell, unitEvents } from "./helpers.mjs";

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
  expect(addon.eval("return SwingTimerMainHandFrame:IsEventRegistered('PLAYER_ENTERING_WORLD') or SwingTimerMainHandFrame.vgSkinned == true"), "no events, and not dressed").toBe(false);
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
  expect([bare.eval("return SwingTimerMainHandFrame.vgSkinned == nil and SwingTimerOffHandFrame.vgSkinned"), bare.eval("return #ns.errors")], "a bar without its fill is left alone; one without labels, art or range look is still dressed").toEqual([true, 0]);
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
  // The pet's mood dot: shown, its color.
  const dot = () => addon.eval("local d = ns.GetModule('UnitExtras').happy return { d:IsShown(), d.__color }");
  expect(dot(), "a happy pet gets a green dot").toEqual([true, tok(addon, "good")]);
  addon.eval("__happy = 1");
  addon.fire("UNIT_HAPPINESS", "pet");
  expect(dot(), "an unhappy one, red").toEqual([true, tok(addon, "bad")]);
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
  expect(heard("UNIT_SPELLCAST_SUCCEEDED"), "the five-second rule: your casts").toEqual({ subs: "player", plain: 0 });
  expect([heard("UNIT_THREAT_LIST_UPDATE").subs, heard("UNIT_THREAT_SITUATION_UPDATE").subs], "threat: your target's list, and your own situation").toEqual(["target", "player"]);
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
