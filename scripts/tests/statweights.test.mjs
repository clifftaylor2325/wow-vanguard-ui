// statweights: Gear upgrades' damage styles, weights kept per class, the hit cap and guide site weight strings
// (Modules/Upgrades.lua, UpgradeWeights.lua, UpgradeStrings.lua, UpgradeWizard.lua) in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { CLICK_LUA, chatHas, loggedIn } from "./helpers.mjs";

// TEST-ONLY gear, hit and crit as rating (10 hit rating is 1%, 14 crit rating 1%): worn bracers 1 (STR 100), worn
// main hand 2 (STR 100, 1% hit) and off hand 3 (STR 100, 1% hit); bracers 4 (STR 100, 3% hit), bracers 5 (STR 100,
// 2% hit), a two-hander 6 (STR 200, 4% hit), bracers 7 (SP 100, 1% crit, 1% hit).
// __link(n) is item n's link; __pct(n) the change UP.Compare gives for it, to one place, or false for none.
const GEAR = `
  __wfgWorld.units.player.class = "WARRIOR"
  __gear = {
    [1] = { "INVTYPE_WRIST", { ITEM_MOD_STRENGTH_SHORT = 100 } },
    [2] = { "INVTYPE_WEAPONMAINHAND", { ITEM_MOD_STRENGTH_SHORT = 100, ITEM_MOD_HIT_RATING_SHORT = 10 } },
    [3] = { "INVTYPE_WEAPONOFFHAND", { ITEM_MOD_STRENGTH_SHORT = 100, ITEM_MOD_HIT_RATING_SHORT = 10 } },
    [4] = { "INVTYPE_WRIST", { ITEM_MOD_STRENGTH_SHORT = 100, ITEM_MOD_HIT_RATING_SHORT = 30 } },
    [5] = { "INVTYPE_WRIST", { ITEM_MOD_STRENGTH_SHORT = 100, ITEM_MOD_HIT_RATING_SHORT = 20 } },
    [6] = { "INVTYPE_2HWEAPON", { ITEM_MOD_STRENGTH_SHORT = 200, ITEM_MOD_HIT_RATING_SHORT = 40 } },
    [7] = { "INVTYPE_WRIST", { ITEM_MOD_SPELL_POWER_SHORT = 100, ITEM_MOD_CRIT_RATING_SHORT = 14, ITEM_MOD_HIT_RATING_SHORT = 10 } },
  }
  function __link(n) return "|cff1eff00|Hitem:" .. n .. "::|h[TEST-ONLY Item " .. n .. "]|h|r" end
  local function gear(link) return __gear[tonumber(tostring(link):match("item:(%d+)"))] end
  C_Item.GetItemInfoInstant = function(link) local g = gear(link) return tonumber(link:match("item:(%d+)")), "Armor", "Plate", g and g[1] end
  C_Item.GetItemStats = function(link) local g = gear(link) return g and g[2] end
  C_Item.IsEquippableItem = function(link) return gear(link) ~= nil end
  C_PlayerInfo = { CanUseItem = function() return true end }
  __worn = { [9] = __link(1), [16] = __link(2), [17] = __link(3) }
  GetInventoryItemLink = function(unit, slot) return __worn[slot] end
  function __pct(n) local p = ns.GetModule("Upgrades").Compare(__link(n)) return p and math.floor(p * 10 + 0.5) / 10 or false end
`;

// The kind of character the weights in use are for.
const kindOf = (addon) => addon.eval("return select(2, ns.GetModule('Upgrades').Current())");

// Makes the player a class and scores gear afresh.
const becomeClass = (addon, class_) => addon.eval(`__wfgWorld.units.player.class = "${class_}" ns.GetModule("Upgrades").Changed()`);

it("stat weights: a druid or a shaman picks a damage style on Forever, and Balance has its own estimates", () => {
  const addon = loggedIn(GEAR + CLICK_LUA);
  becomeClass(addon, "DRUID");
  expect(kindOf(addon), "a druid is Feral until it picks another style").toBe("agility");
  addon.eval('ns.Options.Show("town")');
  expect(addon.eval('return __click("Damage style")'), "the Damage style row is on Town and gear for a druid").toBe(true);
  expect([kindOf(addon), addon.eval("return ns.GetModule('Upgrades').settings.styles.DRUID")], "a click steps to Balance, kept for the class").toEqual(["balance", "balance"]);
  expect(addon.eval("local w = ns.GetModule('Upgrades').Current() return { w.SP, w.CRIT, w.HIT, w.INT, w.HASTE, w.SPI }"), "the Balance estimates, per point of rating (crit 10, hit 12 and haste 7 per 1%)").toEqual([1, 0.71, 1.2, 0.4, 0.7, 0.1]);
  addon.slash("weights");
  expect(chatHas(addon, /Weights for Balance \(role damage\)/), "/vg weights names the style").toBe(true);
  addon.eval("__wfgWorld.units.player.role = 'HEALER'");
  addon.fire("PLAYER_ROLES_ASSIGNED");
  expect(kindOf(addon), "a healer role still picks the healer weights").toBe("healer");
  addon.eval("__wfgWorld.units.player.role = 'NONE'");
  addon.fire("GROUP_LEFT");
  becomeClass(addon, "SHAMAN");
  expect(kindOf(addon), "a shaman is Elemental first").toBe("caster");
  addon.eval("ns.GetModule('Upgrades').SetStyle('enhancement')");
  expect([kindOf(addon), addon.eval("return ns.GetModule('Upgrades').Style()")], "Enhancement weighs strength").toEqual(["strength", "enhancement"]);
  addon.eval("ns.GetModule('Upgrades').SetStyle('balance')");
  expect(kindOf(addon), "a style the class doesn't have is its first").toBe("caster");
});

it("stat weights: a class without styles has no Damage style row; Retail's specialization picks instead", () => {
  const addon = loggedIn(GEAR + CLICK_LUA);
  addon.eval('ns.Options.Show("town")');
  expect([addon.eval('return __click("Damage style")'), addon.eval('return __click("Weigh stats for")')], "a warrior: no style row, the role row is there").toEqual([false, true]);
  expect(addon.eval("return ns.GetModule('Upgrades').Style() == nil"), "a warrior has no style").toBe(true);
  const retail = loggedIn(GEAR, { client: RETAIL_CLIENT });
  becomeClass(retail, "DRUID");
  expect(retail.eval("return { ns.UpgradeWeights.Style('DRUID', 'balance') == nil, next(ns.UpgradeWeights.STYLES) == nil }"), "Retail has no styles").toEqual([true, true]);
});

it("stat weights: changes are kept per class, and weights a profile kept per kind move to every class that used them", () => {
  const addon = loggedIn(GEAR);
  addon.slash("weights set str 3");
  becomeClass(addon, "PALADIN");
  expect([kindOf(addon), addon.eval("return (ns.GetModule('Upgrades').Current()).STR")], "a paladin sharing the profile keeps the strength defaults").toEqual(["strength", 1]);
  becomeClass(addon, "WARRIOR");
  expect(addon.eval("return (ns.GetModule('Upgrades').Current()).STR"), "the warrior's change stays").toBe(3);
  const old = loggedIn(GEAR, { savedVariables: "VanguardDB.profiles = { Default = { Upgrades = { weights = { caster = { SP = 2 }, healer = 5 } } } }" });
  const saved = old.eval("local w = ns.GetModule('Upgrades').settings.weights return { w.caster == nil, w.MAGE.caster.SP, w.WARLOCK.caster.SP, w.SHAMAN.caster.SP, w.DRUID == nil, w.healer }");
  expect(saved, "caster weights went to every caster class (not the druid, a caster only as Balance); a broken entry stays").toEqual([true, 2, 2, 2, true, 5]);
  becomeClass(old, "MAGE");
  expect(old.eval("return (ns.GetModule('Upgrades').Current()).SP"), "and are used").toBe(2);
  const none = loggedIn(GEAR, { savedVariables: "VanguardDB.profiles = { Default = { Upgrades = { weights = 7 } } }" });
  expect(none.eval("return type(ns.GetModule('Upgrades').settings.weights)"), "a saved value that isn't a table is left to the defaults").toBe("table");
});

it("stat weights: with a hit cap set, hit past it counts for nothing", () => {
  const addon = loggedIn(GEAR);
  const UP = "ns.GetModule('Upgrades')";
  expect(addon.eval(`return { ${UP}.Cap("strength", "HIT"), ${UP}.Cap("caster", "HIT"), ${UP}.Cap("tank", "DEF"), ${UP}.Cap("healer", "HIT") }`), "the caps each kind starts with").toEqual([8, 17, 440, 0]);
  expect([addon.eval("return __pct(4)"), addon.eval("return __pct(5)")], "0% hit, under the 8% cap: all the hit counts (30 and 20 rating at 0.9)").toEqual([27, 18]);
  addon.eval(`${UP}.SetCap("strength", "HIT", 5) __wfgWorld.units.player.hit = 4`);
  expect(addon.eval("return __pct(4)"), "4% hit, a cap of 5%: one point of the bracers' 3 counts").toBe(9);
  addon.eval("__wfgWorld.units.player.hit = 2 __wfgWorld.units.player.ratingBonus = { [6] = 2, [8] = 9 }");
  expect(addon.eval("return __pct(4)"), "the hit rating's bonus counts beside the modifier, as the character sheet adds them (melee, not spell)").toBe(9);
  addon.eval("__wfgWorld.units.player.hit = __wfgWorld.secret(4)");
  expect(addon.eval("return __pct(4)"), "a hidden hit: no cap applied").toBe(27);
  addon.eval("__wfgWorld.units.player.hit = 5 __wfgWorld.units.player.ratingBonus = nil");
  expect(addon.eval("return __pct(4)"), "at the cap: the hit is worth nothing, so they're no better").toBe(0);
  addon.eval(`__gear[1][2].ITEM_MOD_HIT_RATING_SHORT = 20 __wfgWorld.units.player.hit = 6 ${UP}.Changed()`);
  expect([addon.eval("return __pct(4)"), addon.eval("return __pct(5)")], "6% with 2 from the worn bracers: both pairs fill the same room to the cap").toEqual([0, 0]);
  addon.eval(`__gear[1][2].ITEM_MOD_HIT_RATING_SHORT = nil __wfgWorld.units.player.hit = 3 ${UP}.Changed()`);
  expect(addon.eval("return __pct(6)"), "a two-hander replaces both hands' hit: 3% less their 2 leaves 4 of room, all of its 4 counts").toBe(8.3);
  addon.eval("__wfgWorld.units.player.hit = 6");
  expect(addon.eval("return __pct(6)"), "at 6% less both hands' 2 the room is 1, which either fills (one hand's hit alone would leave none)").toBe(0);
  addon.eval("GetCombatRatingBonus = nil");
  expect(addon.eval("return __pct(4)"), "a client without rating bonuses: the modifier alone (6% is past the cap)").toBe(0);
  addon.eval("GetHitModifier = nil");
  expect(addon.eval("return __pct(4)"), "a client that won't say your hit: no cap applied").toBe(27);
  addon.eval(`${UP}.SetCap("strength", "HIT", 0)`);
  expect(addon.eval(`return ${UP}.settings.caps.WARRIOR.strength.HIT`), "a cap of 0 is none, kept over the kind's 8").toBe(0);
  addon.eval(`${UP}.SetCap("strength", "HIT", 8)`);
  expect(addon.eval(`return ${UP}.settings.caps.WARRIOR.strength.HIT == nil`), "the kind's own cap keeps nothing saved").toBe(true);
});

it("stat weights: rating turns into per cent by the client's own ratio while you have some, else the level-60 table", () => {
  const addon = loggedIn(GEAR);
  // How much hit rating makes 1% now.
  const per = () => addon.eval("return ns.GetModule('Upgrades').PerUnit('HIT', 'strength')");
  expect(per(), "no hit rating yet: 10 per 1%").toBe(10);
  addon.eval("__wfgWorld.units.player.rating = { [6] = 40 } __wfgWorld.units.player.ratingBonus = { [6] = 2 }");
  expect(per(), "40 rating giving 2%: 20 per 1% at this level").toBe(20);
  addon.eval("GetCombatRating = nil");
  expect(per(), "a client that won't say: the table").toBe(10);
});

it("stat weights: a caster's cap counts spell hit", () => {
  const addon = loggedIn(GEAR);
  becomeClass(addon, "MAGE");
  addon.eval("__worn[9] = __link(7) __gear[8] = { 'INVTYPE_WRIST', { ITEM_MOD_SPELL_POWER_SHORT = 100, ITEM_MOD_HIT_RATING_SHORT = 30 } }");
  addon.eval("ns.GetModule('Upgrades').SetCap('caster', 'HIT', 4) __wfgWorld.units.player.hit = 0 __wfgWorld.units.player.spellHit = 4");
  expect(addon.eval("return __pct(8)"), "4% spell hit with 1 from the worn bracers: room for 1 on either, so the 3% gain nothing over the crit").toBe(-8.2);
});

it("stat weights: a tank's expertise and defense count only up to their caps", () => {
  const addon = loggedIn(GEAR);
  addon.eval("ns.GetModule('Upgrades').settings.role = 'tank' ns.GetModule('Upgrades').Changed()");
  addon.eval("__gear[9] = { 'INVTYPE_WRIST', { ITEM_MOD_STRENGTH_SHORT = 100, ITEM_MOD_DEFENSE_SKILL_RATING_SHORT = 30 } } __gear[10] = { 'INVTYPE_WRIST', { ITEM_MOD_STRENGTH_SHORT = 100, ITEM_MOD_EXPERTISE_RATING_SHORT = 30 } }");
  expect([addon.eval("return __pct(9)"), addon.eval("return __pct(10)")], "far under the caps: 30 defense rating at 1 and 30 expertise rating at 0.4 over 50 of strength").toEqual([60, 24]);
  addon.eval("__wfgWorld.units.player.defense = { 300, 130 } __wfgWorld.units.player.expertise = 5");
  expect([addon.eval("return __pct(9)"), addon.eval("return __pct(10)")], "430 defense and 5% expertise: 10 of the 20 skill and 1.5 of the 3% fit under 440 and 6.5%").toEqual([30, 12]);
  addon.eval("__wfgWorld.units.player.defense = { 300, __wfgWorld.secret(130) }");
  expect(addon.eval("return __pct(9)"), "a hidden bonus counts as none (300 is far under 440)").toBe(60);
  addon.eval("UnitDefenseSkill = nil GetExpertise = nil");
  expect([addon.eval("return __pct(9)"), addon.eval("return __pct(10)")], "a client that can't say: no cap applied").toEqual([60, 24]);
});

it("stat weights: the wizard's cap boxes are saved with the weights, shown, exported and reset", () => {
  const addon = loggedIn(GEAR);
  const box = "Vanguard_WeightsWizard.caps.HIT";
  // Types text into the hit cap box and presses Enter (or leaves the box).
  const type = (text, script = "OnEnterPressed") => addon.eval(`local b = ${box} b:SetText(${JSON.stringify(text)}) b:GetScript("${script}")(b)`);
  // Clicks a wizard button by its field name.
  const click = (name) => addon.eval(`local b = Vanguard_WeightsWizard.${name} b:GetScript("OnClick")(b)`);
  // The hit cap in use for the strength kind.
  const cap = () => addon.eval("return ns.GetModule('Upgrades').Cap('strength', 'HIT')");
  addon.slash("weights wizard");
  const labels = addon.eval("local l = Vanguard_WeightsWizard.capLabels return { l.HIT:GetText(), l.EXP:GetText(), l.DEF:GetText() }");
  expect([addon.eval(`return ${box}:GetText()`), labels], "a box per cap, the hit cap at the kind's 8").toEqual(["8", ["Hit cap in per cent (0 for none)", "Expertise cap in per cent (0 for none)", "Defense cap in skill (0 for none)"]]);
  type("lots");
  expect(addon.eval(`return ${box}:GetText()`), "text puts the cap back").toBe("8");
  type("-3", "OnEditFocusLost");
  expect(addon.eval(`return ${box}:GetText()`), "a cap below 0 is none").toBe("0");
  type("9");
  click("cancel");
  expect(cap(), "Cancel keeps nothing").toBe(8);
  addon.slash("weights wizard");
  type("9");
  click("save");
  expect(cap(), "Save keeps it").toBe(9);
  addon.slash("weights");
  expect(chatHas(addon, /Caps \(past them a stat counts for nothing\): EXP 6\.5, HIT 9/), "/vg weights says the caps").toBe(true);
  addon.slash("weights wizard");
  expect(addon.eval(`return ${box}:GetText()`), "the wizard shows it again").toBe("9");
  click("defaults");
  expect(addon.eval(`return ${box}:GetText()`), "Defaults puts the kind's back").toBe("8");
  click("cancel");
  addon.slash("weights export");
  const text = addon.eval("return Vanguard_TextEdit:GetText()");
  addon.slash("weights reset");
  expect(cap(), "reset puts the cap back too").toBe(8);
  expect(addon.eval(`return { ns.GetModule("Upgrades").Import(${JSON.stringify(text)}), ns.GetModule('Upgrades').Cap('strength', 'HIT') }`), "the exported string carries the caps").toEqual([true, 9]);
  addon.eval("ns.GetModule('Upgrades').SetCap('strength', 'HIT', 0) ns.GetModule('Upgrades').SetCap('strength', 'EXP', 0)");
  addon.clearChat();
  addon.slash("weights");
  expect(chatHas(addon, /Caps/), "no caps: no caps line").toBe(false);
  const retail = loggedIn(GEAR, { client: RETAIL_CLIENT });
  retail.slash("weights wizard");
  expect(retail.eval("return { Vanguard_WeightsWizard:IsShown(), next(Vanguard_WeightsWizard.caps) == nil }"), "Retail's items have none of these: no cap boxes").toEqual([true, true]);
});

// A TEST-ONLY guide site string for a Balance druid.
const BALANCE = '( Tool: v1: "TEST-ONLY Balance": Class=Druid, Spec=1, SpellDamage=1, Healing=0.5, CritRating=10, SpellCritRating=9, HitRating=12, Intellect=0.4, Speed=2 )';

it("stat weights: a guide site's weight string sets the weights in use for your class", () => {
  const addon = loggedIn(GEAR + CLICK_LUA);
  becomeClass(addon, "DRUID");
  addon.eval("ns.GetModule('Upgrades').SetStyle('balance')");
  addon.eval('ns.Options.Show("town")');
  expect(addon.eval('return __click("Import stat weights")'), "the button on Town and gear opens the box").toBe(true);
  addon.eval(`Vanguard_TextEdit:SetText(${JSON.stringify(BALANCE)}) Vanguard_TextDialog.primary:GetScript("OnClick")(Vanguard_TextDialog.primary)`);
  expect([chatHas(addon, /Imported weights for Balance\./), chatHas(addon, /Skipped what Vanguard doesn't weigh: Speed\./)], "it says what it did, and what it skipped").toEqual([true, true]);
  const weights = addon.eval("local w = ns.GetModule('Upgrades').Current() local r = function(n) return math.floor(n * 1000 + 0.5) / 1000 end return { w.SP, r(w.CRIT), w.HIT, w.INT, w.SPI, w.STR }");
  expect(weights, "the biggest of the names one stat has, per 1% turned into per point of rating (14 crit, 10 hit); what the string leaves out is worth nothing").toEqual([1, 0.714, 1.2, 0.4, 0, 0]);
  // UP.Import of a string: { ok, why }.
  const imported = (text) => addon.eval(`local ok, why = ns.GetModule("Upgrades").Import(${JSON.stringify(text)}) return { ok, why }`);
  expect(imported(BALANCE.replace("Druid", "Mage")), "a string for another class").toEqual([false, "the string is for another class (MAGE)"]);
  expect(imported('( Tool: v1: "TEST-ONLY": Class=Druid, Luck=3 )'), "a string with no stat Vanguard weighs").toEqual([false, "no stat in it that Vanguard weighs"]);
  expect(imported('( Tool: v1: "TEST-ONLY": Agility=2 )'), "a string that names no class is taken").toEqual([true, "balance"]);
  addon.clearChat();
  addon.slash("weights import");
  addon.eval(`Vanguard_TextEdit:SetText('( Tool: v1: "TEST-ONLY": Stamina=1 )') Vanguard_TextDialog.primary:GetScript("OnClick")(Vanguard_TextDialog.primary)`);
  expect([chatHas(addon, /Imported weights/), chatHas(addon, /Skipped what/)], "a string with only stats it weighs").toEqual([true, false]);
});

it("stat weights: on Retail a guide string keeps the item level weight; Import with Gear upgrades off says so", () => {
  const retail = loggedIn(GEAR, { client: RETAIL_CLIENT });
  const done = retail.eval(`local UP = ns.GetModule("Upgrades") local ok = UP.Import('( Tool: v1: "TEST-ONLY": Class=Warrior, Strength=1, MasteryRating=0.6, Versatility=0.5 )')
    local w = UP.Current() return { ok, w.STR, w.MASTERY, w.VERS, w.ILVL, w.CRIT }`);
  expect(done, "Retail's stats, item level kept, the rest nothing").toEqual([true, 1, 0.6, 0.5, 1, 0]);
  const off = loggedIn(GEAR, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Upgrades = false } } }" });
  off.eval("ns.GetModule('Upgrades').ImportDialog()");
  expect(chatHas(off, /Gear upgrades is switched off/), "the import box doesn't open with the module off").toBe(true);
});
