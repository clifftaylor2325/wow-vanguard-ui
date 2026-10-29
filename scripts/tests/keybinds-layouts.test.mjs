// keybinds-layouts: key setup's class layouts (Modules/KeybindsData.lua) and resolver (Modules/KeybindsLayouts.lua)
// in the TEST-ONLY headless client: the rule over every class, page, role and level from 1 to 60, the spot checks
// the key setup report gives, side buttons, skipped buttons, replacements and the probe's list of every spell ID.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { luaValue } from "../lib/lua-emit.mjs";

// TEST-ONLY trainer levels (remembered vanilla levels from the key setup report's Appendix A, never shipped): the
// level each spell is learned at, a talent's the level its talent can first be taken. A spell Forever names later
// (D.UNKNOWN) has none.
const LEVELS = {
  HeroicStrike: 1, Rend: 4, Overpower: 12, ThunderClap: 6, MortalStrike: 30, Bloodthirst: 30, ShieldSlam: 30,
  SunderArmor: 10, Revenge: 14, ShieldBlock: 16, Disarm: 18, Whirlwind: 36, Execute: 24, Cleave: 20, Recklessness: 50,
  Pummel: 38, ShieldBash: 12, Taunt: 10, Hamstring: 8, Bloodrage: 10, ShieldWall: 28, BerserkerRage: 32,
  Retaliation: 20, Intercept: 30, Charge: 4, DemoralizingShout: 14, IntimidatingShout: 22, BattleShout: 1,
  BattleStance: 1, DefensiveStance: 10, BerserkerStance: 30,
  Wrath: 1, Moonfire: 4, Starfire: 20, Rejuvenation: 4, InsectSwarm: 20, Innervate: 40, Hurricane: 40, Maul: 10,
  Swipe: 16, DemoralizingRoar: 10, Growl: 10, FrenziedRegeneration: 36, Enrage: 12, Claw: 20, Shred: 22, Rake: 24,
  Rip: 20, FerociousBite: 32, TigersFury: 24, Bash: 14, EntanglingRoots: 8, NaturesGrasp: 10, Barkskin: 44,
  HealingTouch: 1, FeralCharge: 20, Dash: 26, FaerieFire: 18, MarkOfTheWild: 1, Thorns: 6, OmenOfClarity: 20,
  Prowl: 20, BearForm: 10, DireBearForm: 40, CatForm: 20, TravelForm: 30,
  SinisterStrike: 1, CheapShot: 26, Backstab: 4, Garrote: 14, Eviscerate: 1, Ambush: 18, SliceAndDice: 10,
  PickPocket: 4, ColdBlood: 20, AdrenalineRush: 40, Sap: 10, ExposeArmor: 14, Premeditation: 30, Distract: 22,
  Kick: 12, Gouge: 6, KidneyShot: 30, Evasion: 8, Feint: 16, Sprint: 10, Vanish: 22, Stealth: 1,
  Frostbolt: 4, Fireball: 1, FireBlast: 6, FrostNova: 10, ArcanePower: 40, Combustion: 40, ArcaneMissiles: 8,
  ArcaneExplosion: 14, Counterspell: 24, Polymorph: 8, Shoot: 1, IceBlock: 30, ManaShield: 20, Blink: 20,
  Evocation: 20, ArcaneIntellect: 1, IceArmor: 30, FrostArmor: 1, ConjureFood: 6, ConjureWater: 4,
  ShadowBolt: 1, Corruption: 4, CurseOfAgony: 8, Immolate: 1, LifeTap: 6, DrainLife: 14, Fear: 8, DeathCoil: 42,
  HealthFunnel: 12, HowlOfTerror: 40, DrainSoul: 10, DemonArmor: 20, DemonSkin: 1, UnendingBreath: 16,
  CreateHealthstone: 10,
  MindFlay: 20, Smite: 1, ShadowWordPain: 4, MindBlast: 10, HolyFire: 20, Silence: 30, PsychicScream: 14,
  PowerWordShield: 6, FlashHeal: 20, Heal: 16, LesserHeal: 1, Fade: 8, ShackleUndead: 20, Shadowform: 40,
  PowerWordFortitude: 1, InnerFire: 12, DivineSpirit: 30,
  ArcaneShot: 6, RaptorStrike: 1, AimedShot: 20, SerpentSting: 4, MultiShot: 18, ScatterShot: 30, ConcussiveShot: 8,
  FreezingTrap: 20, WingClip: 12, HuntersMark: 6, FeignDeath: 30, MendPet: 12, Disengage: 20, RapidFire: 26,
  AspectOfTheHawk: 10, AspectOfTheMonkey: 4, AspectOfTheCheetah: 20,
  SealOfRighteousness: 1, Judgement: 4, Consecration: 20, Exorcism: 20, SealOfCommand: 20, SealOfTheCrusader: 6,
  HammerOfJustice: 8, HolyShield: 40, DivineFavor: 30, DivineShield: 34, DivineProtection: 6, HolyLight: 1,
  BlessingOfFreedom: 18, Cleanse: 42, Purify: 8, DevotionAura: 1, RetributionAura: 16, BlessingOfMight: 4,
  BlessingOfWisdom: 14, BlessingOfKings: 20,
  Stormstrike: 40, LightningBolt: 1, FlameShock: 10, FrostShock: 20, ChainLightning: 32, ElementalMastery: 30,
  SearingTotem: 10, EarthShock: 4, Purge: 12, GroundingTotem: 30, StoneskinTotem: 4, HealingWave: 1, GhostWolf: 20,
  RockbiterWeapon: 1, WindfuryWeapon: 30, FlametongueWeapon: 10, LightningShield: 8,
};

// The Lua that resolves a preset for a character at a level: knows(id) is true for a spell learned by then, a
// talent only with talents "all" or that one talent alone.
const RUN = `local D, KL = ns.KeybindsData, ns.KeybindsLayouts
  local LV = {} for name, level in pairs(${luaValue(LEVELS)}) do LV[D.SPELL[name]] = level end
  local function run(class, role, level, talents, sides)
    local function knows(id)
      if not LV[id] or LV[id] > level then return false end
      return not D.TALENTS[id] or talents == "all" or talents == id
    end
    return KL.Resolve({ class = class, role = role, sides = sides ~= false }, nil, knows)
  end`;

// A list the Lua side gave back (an empty Lua table comes back as an empty object).
const asList = (v) => (Array.isArray(v) ? v : Object.values(v));

// A client with the addon loaded (the resolver needs no login).
const client = () => createAddon();

// The resolved keys for one character as "key=SpellName@slot" (or "key=COMMAND"), in order.
const keysFor = (addon, args) => addon.eval(`${RUN}
  local names = {} for name, id in pairs(D.SPELL) do names[id] = name end
  local out = {} for i, e in ipairs(run(${args})) do out[i] = e.key .. "=" .. (e.command or (names[e.spell] .. "@" .. e.slot)) end
  return out`);

it("every class: no spell twice on a page, at any level from 1 to 60, in any role, talents taken or not", () => {
  const addon = client();
  const failures = addon.eval(`${RUN}
    local fails = {}
    local function twice(where, ids)
      local seen = {}
      for _, id in ipairs(ids) do if seen[id] then fails[#fails + 1] = where .. " twice: " .. id end seen[id] = true end
    end
    local function check(class, role, level, talents)
      local shared, pages = {}, {}
      for _, e in ipairs(run(class, role, level, talents)) do
        local p = e.spell and (e.slot >= 49 and e.slot <= 72 and 0 or math.floor((e.slot - 1) / 12) + 1)
        if p == 0 then shared[#shared + 1] = e.spell elseif p then pages[p] = pages[p] or {} table.insert(pages[p], e.spell) end
      end
      twice(class .. " " .. role .. " " .. level .. " shared", shared)
      for p, ids in pairs(pages) do
        local all = {} for _, id in ipairs(shared) do all[#all + 1] = id end for _, id in ipairs(ids) do all[#all + 1] = id end
        twice(class .. " " .. role .. " " .. level .. " " .. tostring(talents) .. " page " .. p, all)
      end
    end
    for class, data in pairs(D.CLASSES) do
      local roles, modes = { "levelling" }, { "none", "all" }
      for _, spec in ipairs(data.specs or {}) do roles[#roles + 1] = spec[1] end
      for _, page in ipairs(data.pages) do for _, l in ipairs(page) do for _, c in ipairs(l) do
        local id = type(c) == "table" and c[1] or c if D.TALENTS[id] then modes[#modes + 1] = id end
      end end end
      for _, l in pairs(data.keys) do for _, c in ipairs(l) do
        local id = type(c) == "table" and c[1] or c if D.TALENTS[id] then modes[#modes + 1] = id end
      end end
      for _, role in ipairs(roles) do for level = 1, 60 do for _, mode in ipairs(modes) do check(class, role, level, mode) end end end
    end
    return fails`);
  expect(asList(failures)).toEqual([]);
}, 120000);

it("every class: each spell on its lists is picked at some level, role and talent choice", () => {
  const addon = client();
  const never = addon.eval(`${RUN}
    local names = {} for name, id in pairs(D.SPELL) do names[id] = name end
    local out = {}
    for class, data in pairs(D.CLASSES) do
      local picked, listed = {}, {}
      local function list(l) for _, c in ipairs(l) do local id = type(c) == "table" and c[1] or c if id ~= D.UNKNOWN then listed[id] = true end end end
      for _, l in pairs(data.keys) do list(l) end
      for _, p in ipairs(data.pages) do for _, l in ipairs(p) do list(l) end end
      local roles = { "levelling" } for _, spec in ipairs(data.specs or {}) do roles[#roles + 1] = spec[1] end
      local modes = { "none", "all" } for id in pairs(listed) do if D.TALENTS[id] then modes[#modes + 1] = id end end
      for _, role in ipairs(roles) do for level = 1, 60 do for _, mode in ipairs(modes) do
        for _, e in ipairs(run(class, role, level, mode)) do if e.spell then picked[e.spell] = true end end
      end end end
      for id in pairs(listed) do if not picked[id] then out[#out + 1] = class .. " " .. tostring(names[id]) end end
    end
    table.sort(out)
    return out`);
  expect(asList(never)).toEqual([]);
}, 120000);

it("the report's level-12 warrior: Battle and Defensive pages, and the keys every stance shares", () => {
  const addon = client();
  addon.eval("__wfgWorld.setStances({ { spellID = 2457, icon = 1 }, { spellID = 71, icon = 2 } })");
  expect(keysFor(addon, `"WARRIOR", "levelling", 12, "none"`)).toEqual([
    "F=ShieldBash@61", "T=Hamstring@62", "G=Bloodrage@63", "BUTTON4=Charge@66", "SHIFT-W=BattleShout@49",
    "`=SHAPESHIFTBUTTON1", "SHIFT-`=SHAPESHIFTBUTTON2",
    "1=HeroicStrike@73", "2=Rend@74", "3=Overpower@75", "4=ThunderClap@76",
    "1=SunderArmor@85", "4=HeroicStrike@88", "5=ThunderClap@89",
  ]);
});

it("roles: a Fury warrior gets Pummel, Berserker Rage and Intercept; a tank gets Taunt, Shield Wall and its shout", () => {
  const addon = client();
  const fury = keysFor(addon, `"WARRIOR", "fury", 40, "none"`);
  expect(fury.slice(0, 7)).toEqual(["F=Pummel@61", "T=Hamstring@62", "G=Bloodrage@63", "X=BerserkerRage@64",
    "BUTTON4=Intercept@66", "BUTTON5=IntimidatingShout@67", "SHIFT-W=BattleShout@49"]);
  const tank = keysFor(addon, `"WARRIOR", "tank", 40, "none"`);
  expect(tank.slice(0, 7)).toEqual(["F=ShieldBash@61", "T=Taunt@62", "G=Bloodrage@63", "X=ShieldWall@64",
    "BUTTON4=Charge@66", "BUTTON5=DemoralizingShout@67", "SHIFT-W=BattleShout@49"]);
});

it("a talent takes its key once learned: Mortal Strike on 1 and Heroic Strike moves to 4", () => {
  const addon = client();
  // The arms warrior's Battle Stance page keys, with talents taken or not.
  const battle = (talents) => keysFor(addon, `"WARRIOR", "arms", 30, ${talents}`).filter((k) => /@7[3-8]$/.test(k));
  expect(battle('"none"')).toEqual(["1=HeroicStrike@73", "2=Rend@74", "3=Overpower@75", "4=ThunderClap@76", "6=Execute@78"]);
  expect(battle('"all"')).toEqual(["1=MortalStrike@73", "2=Rend@74", "3=Overpower@75", "4=HeroicStrike@76", "6=Execute@78"]);
});

it("a mouse without side buttons puts Mouse 4 and 5 on Shift-X and Shift-T", () => {
  const addon = client();
  const keys = keysFor(addon, `"ROGUE", "levelling", 30, "none", false`);
  expect(keys.filter((k) => /@6[67]$/.test(k))).toEqual(["SHIFT-X=Sprint@66", "SHIFT-T=Vanish@67"]);
});

it("pets and stances: a warlock's ` and Shift-` are Pet Attack and Pet Follow; a form the stance bar lacks gets no key", () => {
  const addon = client();
  expect(keysFor(addon, `"WARLOCK", "levelling", 1, "none"`).filter((k) => k.startsWith("`") || k.startsWith("SHIFT-`")))
    .toEqual(["`=BONUSACTIONBUTTON1", "SHIFT-`=BONUSACTIONBUTTON2"]);
  addon.eval("__wfgWorld.setStances({ { spellID = 768, icon = 1 }, { spellID = 9634, icon = 2 } })");
  expect(keysFor(addon, `"DRUID", "levelling", 40, "none"`).filter((k) => !k.includes("@")), "Dire Bear Form counts as the bear form; no travel form on the bar")
    .toEqual(["`=SHAPESHIFTBUTTON2", "SHIFT-`=SHAPESHIFTBUTTON1"]);
});

it("a button the player took over is left out, and its spell goes to the next key that lists it", () => {
  const addon = client();
  const keys = addon.eval(`${RUN}
    local knows = function(id) return id == D.SPELL.Fireball or id == D.SPELL.Frostbolt end
    local out = {} for i, e in ipairs(KL.Resolve({ class = "MAGE", role = "frost" }, { [1] = true }, knows)) do out[i] = e.key .. "=" .. e.spell .. "@" .. e.slot end
    return out`);
  expect(keys, "key 1 is skipped, so Frostbolt goes to key 2 and Fireball has no key").toEqual(["2=116@2"]);
});

it("an entry carries the spells it replaces; an unknown class gets no entries; the live knows reads the spellbook", () => {
  const addon = client();
  const out = addon.eval(`local KL, S = ns.KeybindsLayouts, ns.KeybindsData.SPELL
    __wfgWorld.learn(S.IceArmor, { name = "Ice Armor" }) __wfgWorld.learn(S.Fireball, { name = "Fireball" })
    local entries = KL.Resolve({ class = "MAGE", role = "levelling" })
    local armor for _, e in ipairs(entries) do if e.spell == S.IceArmor then armor = e end end
    return { #entries, armor.key, armor.replaces[1], #KL.Resolve({ class = "TEST-ONLY" }) }`);
  expect(out).toEqual([2, "SHIFT-A", 168, 0]);
});

it("the preset for this character: its class, the role from its group role, side buttons", () => {
  const addon = client();
  // The preset for a paladin in a group role.
  const preset = (role) => addon.eval(`__wfgWorld.setUnit("player", { class = "PALADIN", role = ${luaValue(role)} })
    UnitGroupRolesAssigned = function() return ${luaValue(role)} end
    local p = ns.KeybindsLayouts.Preset() return { p.class, p.role, p.sides }`);
  expect(preset("TANK")).toEqual(["PALADIN", "tank", true]);
  expect(preset("HEALER")).toEqual(["PALADIN", "healer", true]);
  expect(preset("DAMAGER")).toEqual(["PALADIN", "levelling", true]);
});

it("spell IDs: every ID a layout names is in the spell list, and the probe lists each with the client's name", () => {
  const addon = client();
  const stray = addon.eval(`local D = ns.KeybindsData
    local known, out = {}, {}
    for _, id in pairs(D.SPELL) do known[id] = true end
    local function list(l, where) for _, c in ipairs(l) do local id = type(c) == "table" and c[1] or c if not known[id] then out[#out + 1] = where end end end
    for class, data in pairs(D.CLASSES) do
      for key, l in pairs(data.keys) do list(l, class .. " " .. key) end
      for n, p in ipairs(data.pages) do for k, l in ipairs(p) do list(l, class .. " page " .. n .. " key " .. k) end end
    end
    for id in pairs(D.TALENTS) do if not known[id] then out[#out + 1] = "talent " .. id end end
    return out`);
  expect(asList(stray)).toEqual([]);
  addon.world.learn(78, { name: "Heroic Strike" });
  const lines = addon.eval(`for _, s in ipairs(ns.Probe.SECTIONS) do if s[1] == "Key setup spells" then return s[2]() end end`);
  const ids = addon.eval("local out = {} for _, id in pairs(ns.KeybindsData.SPELL) do if id ~= 0 then out[#out + 1] = id end end return out");
  for (const id of ids) expect(lines.some((line) => line.includes(` ${id}: `)), `the probe lists ${id}`).toBe(true);
  expect(lines).toContain("HeroicStrike 78: 'Heroic Strike'");
  expect(lines).toContain("Rend 772: nil");
});

it("the probe's key bindings and action slots: every bound command with its keys, the bar slots and the stance bar", () => {
  const addon = client();
  addon.eval(`SetBinding("1", "ACTIONBUTTON1") __wfgWorld.setAction(1, { id = 133 }) __wfgWorld.setStances({ { spellID = 2457, icon = 7 } })`);
  // The lines of one probe section.
  const section = (title) => addon.eval(`for _, s in ipairs(ns.Probe.SECTIONS) do if s[1] == ${luaValue(title)} then return s[2]() end end`);
  expect(section("Key bindings")).toContain("'ACTIONBUTTON1', '1', nil");
  const slots = section("Action slots and stances");
  expect(slots).toContain("slot 1: 'spell', number 133");
  expect(slots).toContain("stance 1: number 7, boolean false, boolean true, number 2457");
  expect(addon.eval(`GetNumBindings = nil for _, s in ipairs(ns.Probe.SECTIONS) do if s[1] == "Key bindings" then return s[2]() end end`)).toEqual(["GetBinding: missing"]);
});
