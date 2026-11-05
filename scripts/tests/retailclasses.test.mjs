// retailclasses: the class resources, charged combo points and empowered casts of Retail's classes
// (Modules/RetailClassBars.lua, ComboPoints.lua, CastBars.lua), in the TEST-ONLY headless client
// as Retail (RETAIL_CLIENT; the calls behind them are scripts/lib/wow-retail-classes.lua).

import { expect, it } from "vitest";
import { RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { isTok, loggedIn, setCombat } from "./helpers.mjs";

// A Retail character of `cls` in spec `spec` (nil: none), with `lua` run before login (__p is the player unit).
const retail = (cls, spec, lua = "", opts = {}) => loggedIn(`local __p = __wfgWorld.units.player __p.class = "${cls}"
  __p.powers, __p.maxpowers = {}, {} __wfgWorld.spec = ${spec ?? "nil"} ${lua}`, { client: RETAIL_CLIENT, ...opts });

// How full each shown pip of a resource row is, 0 to 1 to two places ("secret" for a hidden value).
const fills = (addon, kind) => addon.eval(`local row = ns.GetModule("ClassBars").resourceFrames.${kind} local out = {}
  for i, p in ipairs(row.pips) do if p:IsShown() then
    local lo, hi = p.bar:GetMinMaxValues() local v = p.bar:GetValue()
    out[i] = issecretvalue(v) and "secret" or math.floor(math.max(0, math.min(1, (v - lo) / (hi - lo))) * 100 + 0.5) / 100
  end end return out`);

// Whether a resource's frame is shown (null when it was never built).
const shown = (addon, kind) => addon.eval(`local f = ns.GetModule("ClassBars").resourceFrames.${kind} return f and f:IsShown()`);

it("holy power: a pip per point above the player frame, a hidden count still fills them", () => {
  const addon = retail("PALADIN", 1, "__p.powers[9], __p.maxpowers[9] = 3, 5");
  const place = addon.eval(`local row = ns.GetModule("ClassBars").resourceFrames.holyPower local p, rel, rp = row:GetPoint()
    return { p, rel == Vanguard_player, rp, row:GetWidth() }`);
  expect(place, "on the player frame's top left, five pips of 14 and a gap of 3").toEqual(["BOTTOMLEFT", true, "TOPLEFT", 5 * 17]);
  expect(fills(addon, "holyPower"), "three of five").toEqual([1, 1, 1, 0, 0]);
  addon.eval("__wfgWorld.units.player.powers[9] = __wfgWorld.secret(4)");
  addon.fire("UNIT_POWER_FREQUENT", "player", "HOLY_POWER");
  expect(fills(addon, "holyPower"), "a hidden count goes to every pip as it is").toEqual(Array(5).fill("secret"));
  expect(addon.eval('return { ns.Theme.RGB("holyPower") }'), "in the holy power colour").toEqual(addon.eval('return { ns.GetModule("ClassBars").resourceFrames.holyPower.pips[1].bar:GetStatusBarColor() }'));
});

it("a warlock below level 10 has no soul shard pips until the level-up to 10", () => {
  const addon = retail("WARLOCK", 1, "__p.powers[7], __p.maxpowers[7] = 2, 5 __p.level = 5");
  expect(shown(addon, "soulShards"), "level 5: no row").toBeFalsy();
  addon.eval("__wfgWorld.units.player.level = 10");
  addon.fire("PLAYER_LEVEL_UP", 10);
  expect(shown(addon, "soulShards"), "level 10: the pips show").toBe(true);
});

it("soul shards fill by tenths for a Destruction warlock, whole for the others", () => {
  const destro = retail("WARLOCK", 3, "__p.powers[7], __p.maxpowers[7] = 2, 5 __p.rawPowers = { [7] = 27 }");
  expect(fills(destro, "soulShards"), "2.7 shards").toEqual([1, 1, 0.7, 0, 0]);
  destro.eval("UnitPowerDisplayMod = function() return 0 end");
  destro.fire("UNIT_POWER_FREQUENT", "player", "SOUL_SHARDS");
  expect(fills(destro, "soulShards"), "no display mod from the client: whole shards").toEqual([1, 1, 0, 0, 0]);
  const affliction = retail("WARLOCK", 1, "__p.powers[7], __p.maxpowers[7] = 2, 5 __p.rawPowers = { [7] = 27 }");
  expect(fills(affliction, "soulShards"), "Affliction counts whole shards").toEqual([1, 1, 0, 0, 0]);
});

it("arcane charges show for Arcane only, and follow a spec change", () => {
  const addon = retail("MAGE", 1, "__p.powers[16], __p.maxpowers[16] = 2, 4");
  expect(fills(addon, "arcaneCharges"), "two of four charges").toEqual([1, 1, 0, 0]);
  addon.eval("__wfgWorld.spec = 3");
  addon.fire("PLAYER_SPECIALIZATION_CHANGED", "party1");
  expect(shown(addon, "arcaneCharges"), "another unit's spec change changes nothing").toBe(true);
  addon.fire("PLAYER_SPECIALIZATION_CHANGED", "player");
  expect(shown(addon, "arcaneCharges"), "Frost has no resource row").toBe(false);
  addon.fire("UNIT_POWER_FREQUENT", "player", "MANA");
  expect(addon.eval('return ns.GetModule("ClassBars").kind'), "and repaints nothing").toBe(null);
  const frost = retail("MAGE", 3);
  expect(frost.eval('return next(ns.GetModule("ClassBars").resourceFrames)'), "a Frost mage builds no resource").toBe(null);
  expect(retail("WARRIOR", 1).eval('return ns.GetModule("ClassBars").resourceFrames'), "a class without one sets up nothing").toBe(null);
  const unknown = retail("MAGE", null);
  expect(unknown.eval('return next(ns.GetModule("ClassBars").resourceFrames)'), "no spec from the client: none").toBe(null);
});

it("a spec change in a fight waits for it to end; with no player frame nothing is built", () => {
  const addon = retail("MONK", 3, "__p.powers[12], __p.maxpowers[12] = 4, 6");
  expect(fills(addon, "chi"), "Windwalker chi: six pips, four lit").toEqual([1, 1, 1, 1, 0, 0]);
  setCombat(addon, true);
  addon.eval("__wfgWorld.spec = 1");
  addon.fire("PLAYER_SPECIALIZATION_CHANGED", "player");
  expect(shown(addon, "stagger"), "not in the fight").toBe(null);
  setCombat(addon, false);
  expect([shown(addon, "stagger"), shown(addon, "chi")], "after it, the stagger bar replaces chi").toEqual([true, false]);
  addon.eval("__wfgWorld.spec = 3");
  addon.fire("PLAYER_SPECIALIZATION_CHANGED", "player");
  expect([shown(addon, "stagger"), shown(addon, "chi")], "and back again, reusing the built row").toEqual([false, true]);
  const noFrames = retail("PALADIN", 1, "", { savedVariables: "VanguardDB.profiles = { Default = { modules = { UnitFrames = false } } }" });
  expect(noFrames.eval('local CB = ns.GetModule("ClassBars") CB.ShowResource() return next(CB.resourceFrames)'), "no player frame, no row").toBe(null);
});

it("stagger: a thin bar under the player frame, amber past 30% of your health and vermilion past 60%", () => {
  const addon = retail("MONK", 1, "__p.maxhp = 1000 __p.stagger = 0");
  // The stagger bar's value, maximum and colour token.
  const bar = () => addon.eval(`local b = ns.GetModule("ClassBars").resourceFrames.stagger.bar
    return { v = b:GetValue(), max = select(2, b:GetMinMaxValues()), token = ns.Theme.barColored[b].token }`);
  const place = addon.eval(`local h = ns.GetModule("ClassBars").resourceFrames.stagger local p, rel, rp = h:GetPoint(1) return { p, rel == Vanguard_player, rp }`);
  expect(place, "just under the player frame").toEqual(["TOPLEFT", true, "BOTTOMLEFT"]);
  expect(bar(), "no stagger").toEqual({ v: 0, max: 1000, token: "good" });
  addon.eval("__wfgWorld.units.player.stagger = 400");
  addon.advance(0.25);
  expect(bar(), "read again a moment later: 40% is amber").toEqual({ v: 400, max: 1000, token: "warn" });
  addon.eval("__wfgWorld.units.player.stagger = 650");
  addon.advance(0.25);
  expect(bar().token, "65% is vermilion").toBe("bad");
  addon.eval("__wfgWorld.units.player.stagger = __wfgWorld.secret(100)");
  addon.advance(0.25);
  expect(addon.eval('local b = ns.GetModule("ClassBars").resourceFrames.stagger.bar return { issecretvalue(b:GetValue()), ns.Theme.barColored[b].token }'), "a hidden stagger goes to the bar, which keeps its colour").toEqual([true, "bad"]);
  addon.eval("__wfgWorld.units.player.stagger, __wfgWorld.units.player.maxhp = 10, 0");
  addon.fire("UNIT_MAXPOWER", "player");
  expect(bar().token, "no health to measure against: the colour stays").toBe("bad");
});

it("runes: ready ones on the left, the others filling as they come back", () => {
  const addon = retail("DEATHKNIGHT", 2, `__wfgWorld.runes = { [2] = { start = GetTime() - 5, duration = 10 },
    [4] = { start = __wfgWorld.secret(1), duration = 10 }, [6] = { start = GetTime(), duration = 0 } }`);
  expect(fills(addon, "runes"), "three ready, one halfway, a hidden one and one with no time read as empty").toEqual([1, 1, 1, 0.5, 0, 0]);
  addon.advance(2.5);
  expect(fills(addon, "runes")[3], "the rune coming back fills each frame").toBe(0.75);
  addon.eval("__wfgWorld.runes = {}");
  addon.fire("RUNE_POWER_UPDATE", 2, true);
  expect(fills(addon, "runes"), "all back").toEqual(Array(6).fill(1));
  expect(addon.eval('return ns.Theme.barColored[ns.GetModule("ClassBars").resourceFrames.runes.pips[1].bar].token'), "in the rune colour").toBe("runes");
});

it("essence: the next point fills as it recharges, at the client's rate", () => {
  const addon = retail("EVOKER", 1, `__p.powers[19], __p.maxpowers[19] = 3, 5 __p.partial = { [19] = 500 }
    __wfgWorld.powerRegen = { [19] = 0.25 }`);
  expect(fills(addon, "essence"), "three, and half of the fourth").toEqual([1, 1, 1, 0.5, 0]);
  addon.advance(1);
  expect(fills(addon, "essence")[3], "a second later at a quarter point a second").toBe(0.75);
  addon.eval("__wfgWorld.units.player.powers[19] = 5");
  addon.fire("UNIT_POWER_FREQUENT", "player", "ESSENCE");
  expect(fills(addon, "essence"), "full: nothing recharges").toEqual(Array(5).fill(1));
  addon.eval("__wfgWorld.units.player.powers[19], __wfgWorld.powerRegen[19], __wfgWorld.units.player.partial[19] = 1, nil, 0");
  addon.fire("UNIT_POWER_FREQUENT", "player", "ESSENCE");
  addon.advance(2.5);
  expect(fills(addon, "essence")[1], "no rate from the client: a point every five seconds").toBe(0.5);
  addon.eval("__wfgWorld.units.player.powers[19] = __wfgWorld.secret(2)");
  addon.fire("UNIT_POWER_FREQUENT", "player", "ESSENCE");
  expect(fills(addon, "essence"), "a hidden count fills whole points only").toEqual(Array(5).fill("secret"));
});

it("mana under the player frame for Shadow priests on Retail", () => {
  const addon = retail("PRIEST", 3, "__p.ptype, __p.ptypeName = 13, 'INSANITY'");
  expect(addon.eval('return ns.GetModule("ClassBars").manaHolder:IsShown()'), "Shadow's power bar shows insanity: mana goes under it").toBe(true);
  const forever = loggedIn('__wfgWorld.units.player.class = "PRIEST" __wfgWorld.units.player.ptype = 13');
  expect(forever.eval('local CB = ns.GetModule("ClassBars") return { CB.mana == nil, CB.resourceFrames == nil, CB.EnableResources == nil }'), "WoW Forever: no priest mana bar, no class resources").toEqual([true, true, true]);
});

it("charged combo points light in their own colour", () => {
  const addon = retail("ROGUE", 1, "__p.combo, __p.maxcombo = 3, 5 __p.charged = { 2, 5 }");
  // Each pip's lit state and fill colour token.
  const pips = () => addon.eval(`local out = {} for i, p in ipairs(ns.GetModule("ComboPoints").pips) do
    local c = { p.fill:GetVertexColor() } out[i] = { p.fill:IsShown(), c[1], c[2], c[3] } end return out`);
  const charged = addon.eval('return { ns.Theme.RGB("charged") }').slice(0, 3);
  const energy = addon.eval('return { ns.Theme.RGB("energy") }').slice(0, 3);
  expect(pips().map((p) => [p[0], p.slice(1)]), "the second and fifth are charged").toEqual([
    [true, energy], [true, charged], [true, energy], [false, energy], [false, charged]]);
  addon.eval("__wfgWorld.units.player.charged = { __wfgWorld.secret(1), 3 }");
  addon.fire("UNIT_POWER_POINT_CHARGE", "player");
  expect(pips().map((p) => p.slice(1)), "the charge moves; a hidden pip number is skipped").toEqual([energy, energy, charged, energy, energy]);
  addon.eval("__wfgWorld.units.player.charged = __wfgWorld.secret(1)");
  addon.fire("UNIT_POWER_POINT_CHARGE", "player");
  expect(pips().every((p) => isTok(addon, p.slice(1), "energy")), "a hidden list charges none").toBe(true);
});

it("an Evoker's empowered cast fills to the end of its hold, with a mark where each stage ends", () => {
  const addon = retail("EVOKER", 1);
  const start = addon.eval("return GetTime() * 1000");
  addon.eval(`__wfgWorld.units.player.cast = { name = "TEST-ONLY Fire Breath", channel = true, startMs = ${start}, endMs = ${start + 2000},
    stages = 3, stageMs = { 500, 750, 750 }, holdMs = 1000 }`);
  addon.fire("UNIT_SPELLCAST_EMPOWER_START", "player", "TEST-ONLY-GUID", 357208);
  // The player bar: shown, filling (not a channel), its end, and where each shown stage mark sits as a share of the bar.
  const bar = () => addon.eval(`local b = ns.GetModule("CastBars").bars.player local marks = {}
    for i, m in ipairs(b.stageMarks or {}) do if m:IsShown() then local _, _, _, x = m:GetPoint(1) marks[i] = math.floor(x / b:GetWidth() * 1000 + 0.5) / 1000 end end
    return { shown = b:IsShown(), channel = b.channel, endMS = b.endMS - ${start}, marks = marks }`);
  expect(bar(), "three stages over three seconds with the hold").toEqual({ shown: true, channel: false, endMS: 3000, marks: [0.167, 0.417, 0.667] });
  addon.eval("__wfgWorld.units.player.cast.stageMs[2] = __wfgWorld.secret(1)");
  addon.fire("UNIT_SPELLCAST_EMPOWER_UPDATE", "player", "TEST-ONLY-GUID", 357208);
  expect(bar().marks, "a hidden stage length: no marks").toEqual({});
  addon.eval(`__wfgWorld.units.player.cast.stageMs[2] = 750 __wfgWorld.units.player.cast.startMs = __wfgWorld.secret(1)`);
  addon.fire("UNIT_SPELLCAST_EMPOWER_UPDATE", "player", "TEST-ONLY-GUID", 357208);
  expect(bar().marks, "hidden times: no marks either").toEqual({});
  addon.eval(`__wfgWorld.units.player.cast = { name = "TEST-ONLY Living Flame", startMs = ${start}, endMs = ${start + 2000} }`);
  addon.fire("UNIT_SPELLCAST_START", "player", "TEST-ONLY-GUID2", 361469);
  expect(bar().marks, "a plain cast after it clears the marks").toEqual({});
});

it("an empowered cast's end: let go is done, cut short is interrupted", () => {
  const addon = retail("EVOKER", 1);
  // Starts an empowered cast on the player's bar (its hold hidden when `hold` is "secret").
  const begin = (hold = 1000) => {
    const start = addon.eval("return GetTime() * 1000");
    addon.eval(`__wfgWorld.units.player.cast = { name = "TEST-ONLY Fire Breath", channel = true, startMs = ${start}, endMs = ${start + 2000},
      stages = 3, stageMs = { 500, 750, 750 }, holdMs = ${hold === "secret" ? "__wfgWorld.secret(1)" : hold} }`);
    addon.fire("UNIT_SPELLCAST_EMPOWER_START", "player", "TEST-ONLY-GUID", 357208);
    return start;
  };
  // Ends the cast with the stop event's `complete`, and gives the bar's text and colour token.
  const end = (complete) => addon.eval(`__wfgWorld.units.player.cast = nil
    __wfgStub.fire("UNIT_SPELLCAST_EMPOWER_STOP", "player", "TEST-ONLY-GUID", 357208, ${complete})
    local b = ns.GetModule("CastBars").bars.player return { b.text:GetText(), ns.Theme.barColored[b].token }`);
  begin();
  expect(end("true"), "released: the bar flashes done").toEqual(["TEST-ONLY Fire Breath", "good"]);
  addon.advance(1);
  begin();
  expect(end("false"), "not completed: interrupted").toEqual(["Interrupted", "bad"]);
  addon.advance(1);
  begin();
  expect(end("__wfgWorld.secret(true)")[1], "a hidden answer is not read: done").toBe("good");
  addon.advance(1);
  const start = begin("secret");
  expect(addon.eval(`return ns.GetModule("CastBars").bars.player.endMS - ${start}`), "a hidden hold leaves the end as the client gave it").toBe(2000);
});

// A Retail Demon Hunter or Evoker's alternate bar: its value, maximum, colour token and whether it shows.
const altBar = (addon) => addon.eval(`local h = ns.GetModule("ClassBars").altFrame if not h then return nil end
  local v = h.bar:GetValue()
  local _, hi = h.bar:GetMinMaxValues()
  return { v = issecretvalue(v) and "secret" or v, max = hi, token = ns.Theme.barColored[h.bar].token, shown = h:IsShown() }`);

it("soul fragments: a Devourer's bar under the frame counts Dark Heart stacks against the game's cap", () => {
  const addon = retail("DEMONHUNTER", 3, "__wfgWorld.maxApplications = { [1225789] = 35 }");
  expect(altBar(addon), "no stacks yet").toEqual({ v: 0, max: 35, token: "soulFragments", shown: true });
  const place = addon.eval('local h = ns.GetModule("ClassBars").altFrame local p, rel, rp = h:GetPoint(1) return { p, rel == Vanguard_player, rp }');
  expect(place, "under the player frame").toEqual(["TOPLEFT", true, "BOTTOMLEFT"]);
  addon.eval("__wfgWorld.addAura('player', { name = 'TEST-ONLY Dark Heart', spellId = 1225789, applications = 12 })");
  expect(altBar(addon).v, "on an aura change").toBe(12);
  addon.eval("__wfgWorld.addAura('player', { name = 'TEST-ONLY Meta', spellId = 1217607 }) __wfgWorld.addAura('player', { name = 'TEST-ONLY Whispers', spellId = 1227702, applications = 20 }) __wfgWorld.collapsingStarCost = 30");
  addon.eval("local ask = C_Spell.GetSpellMaxCumulativeAuraApplications __capAsks = 0 C_Spell.GetSpellMaxCumulativeAuraApplications = function(...) __capAsks = __capAsks + 1 return ask(...) end");
  addon.fire("UNIT_AURA", "player");
  expect([altBar(addon).v, altBar(addon).max], "in Void Metamorphosis: Silence the Whispers against the Collapsing Star's cost").toEqual([20, 30]);
  expect(addon.eval("return __capAsks"), "and Dark Heart's cap is not asked for").toBe(0);
  addon.eval("__wfgWorld.collapsingStarCost = __wfgWorld.secret(25) __wfgWorld.units.player.auras[1].applications = __wfgWorld.secret(7)");
  addon.fire("UNIT_AURA", "player");
  expect(altBar(addon).max, "a hidden maximum falls back to the usual one").toBe(30);
  addon.eval("__wfgWorld.units.player.auras = { { spellId = 1225789, applications = __wfgWorld.secret(7) } }");
  addon.fire("UNIT_AURA", "player");
  expect(altBar(addon).v, "a hidden count goes to the bar as it is").toBe("secret");
  addon.eval("__wfgWorld.units.player.auras = { __wfgWorld.secret({ spellId = 1225789 }) }");
  addon.fire("UNIT_AURA", "player");
  expect(altBar(addon).v, "a hidden aura reads empty").toBe(0);
});

it("Ebon Might: an Augmentation bar counts the seconds left against twenty, and stops when it ends", () => {
  const addon = retail("EVOKER", 3, "__p.powers[19], __p.maxpowers[19] = 3, 5");
  expect(altBar(addon), "no Ebon Might").toEqual({ v: 0, max: 20, token: "ebonMight", shown: true });
  expect(fills(addon, "essence"), "Augmentation keeps its essence pips").toEqual([1, 1, 1, 0, 0]);
  addon.eval("local set = ns.Theme.SetBarValue __themed = 0 ns.Theme.SetBarValue = function(bar, v) if bar == ns.GetModule('ClassBars').altFrame.bar then __themed = __themed + 1 end return set(bar, v) end");
  addon.eval("__wfgWorld.addAura('player', { name = 'TEST-ONLY Ebon Might', spellId = 395296, duration = 10 })");
  expect(altBar(addon).v, "ten seconds left").toBe(10);
  expect(addon.eval("return __themed > 0"), "filled through the theme's bar setter, as the other bars are").toBe(true);
  addon.advance(4);
  expect(altBar(addon).v, "four seconds on").toBe(6);
  addon.advance(7);
  expect(altBar(addon).v, "run out").toBe(0);
  addon.eval("__wfgWorld.addAura('player', { name = 'TEST-ONLY Ebon Might', spellId = 395296, expirationTime = __wfgWorld.secret(99) })");
  expect(altBar(addon).v, "a hidden time reads empty").toBe(0);
  addon.eval("__wfgWorld.units.player.auras = { __wfgWorld.secret({ spellId = 395296 }) }");
  addon.fire("UNIT_AURA", "player");
  expect(altBar(addon).v, "a hidden aura reads empty").toBe(0);
});

it("alternate bars follow the spec, and other specs and classes have none", () => {
  const addon = retail("EVOKER", 3);
  // Whether the Ebon Might countdown is on the ticker.
  const counting = () => addon.eval('return ns.ticker.vgJobs["class ebon might"] ~= nil');
  addon.eval("__wfgWorld.addAura('player', { name = 'TEST-ONLY Ebon Might', spellId = 395296, duration = 10 })");
  expect(counting(), "Ebon Might running: the bar counts down").toBe(true);
  addon.eval("__wfgWorld.spec = 1");
  addon.fire("PLAYER_SPECIALIZATION_CHANGED", "player");
  expect(altBar(addon).shown, "Devastation has no Ebon Might bar").toBe(false);
  expect(counting(), "and its countdown stops with it").toBe(false);
  addon.fire("UNIT_AURA", "player");
  expect(altBar(addon).shown, "and an aura change paints nothing").toBe(false);
  expect(retail("DEMONHUNTER", 1).eval('return ns.GetModule("ClassBars").altFrame'), "a Havoc Demon Hunter builds none").toBe(null);
  expect(retail("WARRIOR", 1).eval('return ns.GetModule("ClassBars").altFrame'), "nor a Warrior").toBe(null);
});
