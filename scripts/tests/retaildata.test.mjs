// retaildata: the per-client data tables (ns.ClientData) on Retail, in the TEST-ONLY headless client. Retail gets its
// own spells, buffs, stat weights, sample roster, honor and renown; WoW Forever keeps the tables it always had (its own
// area tests check them unchanged). Every Retail spell id is checked against scripts/lib/wow-retail-data.lua's fixture
// of English names, so a table and its comments can't drift apart; the ids still need an in-game /dump (the PR lists them).

import { expect, it } from "vitest";
import { RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { RAID_ENV, UNITS_ENV, bars, chatHas, isTok, loggedIn } from "./helpers.mjs";

// Retail's thirteen class tokens.
const CLASSES = ["WARRIOR", "PALADIN", "HUNTER", "ROGUE", "PRIEST", "DEATHKNIGHT", "SHAMAN", "MAGE", "WARLOCK", "MONK", "DRUID", "DEMONHUNTER", "EVOKER"];

// The game tooltip's lines as "left | right" text.
const tipLines = (addon) => addon.eval("return GameTooltip.__lines or {}").map((l) => (l.right ? `${l.text} | ${l.right}` : l.text));

// A logged-in addon on Retail (extra Lua run before login), or on WoW Forever with forever = true.
const retail = (extra = "", options = {}) => loggedIn(extra, { client: RETAIL_CLIENT, ...options });

// Every spell id the Retail tables list that the fixture can't name, as "table: id" (empty when all are named).
const UNNAMED = `local out, fixture = {}, __wfgWorld.retailSpells
  local function check(where, ids) for _, id in pairs(ids) do if not fixture[id] then out[#out + 1] = where .. ": " .. id end end end
  for class, c in pairs(ns.ClickCastSpells.CLASSES) do
    for _, g in ipairs({ "heals", "cleanse", "buffs", "layout" }) do check("click-cast " .. class .. " " .. g, c[g]) end
  end
  local RH = ns.GetModule("RaidHealing")
  for class, ids in pairs(RH.CLASS_BUFFS) do check("buffs " .. class, ids) end
  for _, c in ipairs(RH.ALL_BUFFS) do for _, b in ipairs(c[2]) do check("all buffs " .. c[1], { b[2] }) end end
  for id in pairs(RH.FALLBACK_ICONS) do check("icons", { id }) end
  local PR = ns.GetModule("InstancePrep")
  for _, list in ipairs({ PR.FLASKS, PR.FOOD, PR.WORLD_BUFFS }) do check("prep", list) end
  for _, b in ipairs(PR.RAID_BUFFS) do check("prep " .. b[1], b[2]) end
  return table.concat(out, ", ")`;

it("retail data: every Retail spell id in the tables is one the fixture names, and its English name is the comment's", () => {
  const addon = retail();
  expect(addon.eval(UNNAMED), "no id outside the fixture").toBe("");
  const names = addon.eval(`local out = {} for _, c in ipairs(ns.GetModule("RaidHealing").ALL_BUFFS) do for _, b in ipairs(c[2]) do
    out[#out + 1] = ns.SpellName(b[2]) == b[1] end end return out`);
  expect(names.every(Boolean), "each buff row's English name is the client's name for its id").toBe(true);
  expect(addon.eval("return #ns.errors"), "nothing caught").toBe(0);
});

it("retail data: WoW Forever keeps its own tables, and Retail lists its thirteen classes", () => {
  const forever = loggedIn();
  const ask = `local W, CS = ns.UpgradeWeights, ns.ClickCastSpells
    local classes = {} for class in pairs(CS.CLASSES) do classes[#classes + 1] = class end table.sort(classes)
    return { W.STATS.SPI ~= nil, W.STATS.MASTERY ~= nil, CS.CLASSES.PRIEST.heals[1], #ns.GetModule("InstancePrep").WORLD_BUFFS, classes }`;
  expect(forever.eval(ask).slice(0, 4), "Forever: spirit, no mastery, Lesser Heal first, seven world buffs").toEqual([true, false, 2050, 7]);
  const r = retail().eval(ask);
  expect(r.slice(0, 4), "Retail: no spirit, mastery, Flash Heal first, no world buffs").toEqual([false, true, 2061, 0]);
  expect(r[4], "click-casting knows every Retail class").toEqual([...CLASSES].sort());
  const kinds = retail().eval(`local out = {} for _, class in ipairs({ ${CLASSES.map((c) => `"${c}"`).join(", ")} }) do
    out[#out + 1] = ns.UpgradeWeights.CLASSES[class] ~= nil end return out`);
  expect(kinds.every(Boolean), "the weights know every Retail class").toBe(true);
});

it("retail data: a healer's starter click layout and a raid buff come from Retail's spells", () => {
  const addon = retail("__wfgWorld.units.player.class = 'EVOKER'");
  const layout = addon.eval("local out = {} for key, b in pairs(ns.ClickCastSpells.Layout()) do out[key] = b.value or b.action end return out");
  expect(layout, "Living Flame on the middle click, Naturalize on ctrl-left, Return on alt-right").toMatchObject({ BUTTON3: "Living Flame", "ctrl-BUTTON1": "Naturalize", "alt-BUTTON2": "Return", BUTTON1: "target" });
  const priest = retail("__wfgWorld.units.player.class = 'PRIEST'");
  expect(priest.eval("return ns.SpellNames(ns.GetModule('RaidHealing').CLASS_BUFFS.PRIEST)"), "a priest watches Fortitude").toEqual(["Power Word: Fortitude"]);
  expect(priest.eval("return ns.ClickCastSpells.HasLayout()"), "and has a layout").toBe(true);
});

it("retail data: the prep card checks Retail's six raid buffs, makes no flask row and has no world buffs", () => {
  const addon = retail("__wfgWorld.units.player.class = 'WARRIOR'");
  addon.eval("ns.GetModule('InstancePrep').settings.buffs = true ns.GetModule('InstancePrep').settings.worldBuffs = true");
  // The labels of the aura rows now.
  const labels = () => addon.eval("local out = {} for i, r in ipairs(ns.GetModule('InstancePrep').AuraRows()) do out[i] = r.label end return out");
  expect(labels(), "food and the six raid buffs; no flask or world buff row").toEqual(["Food buff", "Fortitude", "Mark of the Wild", "Arcane Intellect", "Battle Shout", "Skyfury", "Blessing of the Bronze"]);
  ["Well Fed", "Skyfury", "Battle Shout"].forEach((name) => addon.world.addAura("player", { name, duration: 3600, isHelpful: true }));
  expect(labels(), "the buffs you have leave").toEqual(["Fortitude", "Mark of the Wild", "Arcane Intellect", "Blessing of the Bronze"]);
});

it("retail data: the raid preview seats Retail's later classes, in their client's power colours", () => {
  const addon = retail(UNITS_ENV + RAID_ENV + "PowerBarColor.RUNIC_POWER = { r = 0, g = 0.82, b = 1 }");
  addon.slash("preview 10");
  // Preview tile i's name and power bar colour.
  const tile = (i) => addon.eval(`local b = Vanguard_RaidPreviewTile${i} return { b.name:GetText(), b.power.__barColor }`);
  const [name, color] = tile(6);
  expect(name, "the sixth seat is a death knight").toBe("Fennick");
  expect(color.slice(0, 3), "in runic power's colour").toEqual(addon.eval("local c = PowerBarColor.RUNIC_POWER return { c.r, c.g, c.b }"));
  expect(isTok(addon, tile(1)[1], "rage"), "a warrior keeps the theme's rage").toBe(true);
  addon.slash("preview 25");
  expect([tile(12)[0], isTok(addon, tile(12)[1], "mana")], "a demon hunter, whose fury this client has no colour for: the theme's mana").toEqual(["Lorcan", true]);
  const classes = addon.eval("local set, n = {}, 0 for _, s in ipairs(ns.RaidPreview.ROSTER) do if not set[s[2]] then set[s[2]] = true n = n + 1 end end return n");
  expect(classes, "the forty seats hold all thirteen classes").toBe(13);
});

// TEST-ONLY gear for a Retail warrior: worn bracers (STR 100, CRIT 50, item level 600), and better-level bracers with
// mastery and versatility in place of crit.
const RETAIL_GEAR = `
  __wfgWorld.units.player.class = "WARRIOR"
  __gear = { [1] = { ITEM_MOD_STRENGTH_SHORT = 100, ITEM_MOD_CRIT_RATING_SHORT = 50 },
    [2] = { ITEM_MOD_STRENGTH_SHORT = 100, ITEM_MOD_MASTERY_RATING_SHORT = 30, ITEM_MOD_VERSATILITY = 30 } }
  function __link(n) return "|cff1eff00|Hitem:" .. n .. "::|h[TEST-ONLY Item " .. n .. "]|h|r" end
  __wfgWorld.itemLevels[__link(1)] = 600
  __wfgWorld.itemLevels[__link(2)] = 620
  C_Item.GetItemStats = function(link) return __gear[tonumber(tostring(link):match("item:(%d+)"))] end
`;

it("retail data: gear is weighed with mastery, versatility and item level, and /vg weights lists them", () => {
  const addon = retail(RETAIL_GEAR);
  // Gear n's score with the weights in use.
  const score = (n) => addon.eval(`local UP = ns.GetModule("Upgrades") return UP.Score(__link(${n}), (UP.Weights()))`);
  expect(score(1), "100 STR + 50 x 0.45 crit + 600 item levels").toBeCloseTo(100 + 22.5 + 600);
  expect(score(2), "100 STR + 30 x 0.4 mastery + 30 x 0.4 versatility + 620 item levels").toBeCloseTo(100 + 12 + 12 + 620);
  expect(addon.eval("return ns.GetModule('Upgrades').Score(__link(9), { STR = 1, ILVL = 1 })"), "an item with no stats or level is worth nothing").toBe(0);
  addon.slash("weights");
  expect(chatHas(addon, /Weights for strength \(role damage\): .*ILVL 1.*MASTERY 0\.4.*VERS 0\.4/), "the weights in use, Retail's stats among them").toBe(true);
  expect(addon.eval("local W = ns.GetModule('Upgrades').Wizard local o = W.Order('strength') return { W.LABELS[o[1]], W.LABELS[o[2]] }"), "the wizard names Retail's stats; item level and strength first").toEqual(["Item level", "Strength"]);
  expect(addon.eval("local W = ns.GetModule('Upgrades').Wizard local out = {} for _, s in ipairs(W.Order('strength')) do out[#out + 1] = W.LABELS[s] ~= nil end return out").every(Boolean), "a label for every slider").toBe(true);
});

// TEST-ONLY: a character at Retail's level cap, watching a major faction (id 2600) at renown 12.
const CAP_ENV = `
  IsPlayerAtEffectiveMaxLevel = function() return true end
  __wfgWorld.watchedFaction = { name = "TEST-ONLY Council", factionID = 2600, reaction = 5, currentReactionThreshold = 0, nextReactionThreshold = 0, currentStanding = 0 }
  __wfgWorld.majorFactions[2600] = { renownLevel = 12, renownReputationEarned = 1200, renownLevelThreshold = 2500 }
`;

it("retail data: at the level cap the XP bar shows honor while the game would, in honor's colour, with its own tooltip", () => {
  const addon = retail(CAP_ENV);
  expect(bars(addon).xpShown, "honor not watched: the bar hides at the cap, as before").toBe(false);
  addon.eval("__wfgWorld.honor = { cur = 1200, max = 2500, level = 34, watched = true }");
  addon.fire("HONOR_XP_UPDATE", "player");
  const b = bars(addon);
  expect([b.xpShown, b.xp, b.xpMax, b.xpText], "honor watched as XP: the honor level's progress").toEqual([true, 1200, 2500, "Honor level 34  1.2K / 2.5K (48%)"]);
  expect(isTok(addon, addon.eval("return Vanguard_xpbar.__barColor"), "focus"), "in the theme's orange").toBe(true);
  addon.eval("Vanguard_xpbar:GetScript('OnEnter')(Vanguard_xpbar)");
  expect(tipLines(addon), "its tooltip: the honor level, what is left and how far through").toEqual(["Honor level 34", "To next level | 1.3K", "Through this level | 48%"]);
  addon.eval("__wfgWorld.honor = { cur = 0, max = 2500, level = 34, battlefield = true }");
  addon.fire("ZONE_CHANGED_NEW_AREA");
  expect(bars(addon).xpText, "in a battleground it shows unwatched too").toBe("Honor level 34  0 / 2.5K (0%)");
  addon.eval("__wfgWorld.honor = { cur = 0, max = 0, level = 0, watched = true }");
  addon.fire("HONOR_LEVEL_UPDATE");
  expect(bars(addon).xpShown, "no honor range: hidden").toBe(false);
});

it("retail data: a watched major faction shows its renown on the reputation bar and in its tooltip", () => {
  const addon = retail(CAP_ENV);
  const b = bars(addon);
  expect([b.repShown, b.rep, b.repMax, b.repText], "renown 12's progress").toEqual([true, 1200, 2500, "TEST-ONLY Council  Renown 12  1.2K / 2.5K (48%)"]);
  addon.eval("Vanguard_repbar:GetScript('OnEnter')(Vanguard_repbar)");
  expect(tipLines(addon).slice(0, 3), "its tooltip: the renown level, and what the next needs").toEqual(["TEST-ONLY Council", "Standing | Renown 12", "To Renown 13 | 1.3K"]);
  addon.eval("__wfgWorld.majorFactions[2600] = { renownLevel = 25, renownReputationEarned = 0, renownLevelThreshold = 2500, maxed = true }");
  addon.fire("MAJOR_FACTION_RENOWN_LEVEL_CHANGED", 2600, 25, 24);
  expect([bars(addon).repText, bars(addon).rep, bars(addon).repMax], "the top renown: full, with no numbers").toEqual(["TEST-ONLY Council  Renown 25", 1, 1]);
  addon.eval("__wfgWorld.majorFactions[2600] = { renownLevel = 3, renownLevelThreshold = 2500 }");
  addon.fire("UPDATE_FACTION");
  expect(bars(addon).repText, "a hidden value: no numbers either").toBe("TEST-ONLY Council  Renown 3");
  addon.eval("__wfgWorld.majorFactions[2600] = { renownReputationEarned = 5 }");
  addon.fire("UPDATE_FACTION");
  expect(bars(addon).repText, "no renown level: read as an ordinary faction").toBe("TEST-ONLY Council");
  addon.eval("__wfgWorld.majorFactions = {}");
  addon.fire("UPDATE_FACTION");
  expect(bars(addon).repText, "not a major faction: its standing as on WoW Forever").toBe("TEST-ONLY Council");
  expect(addon.eval("return #ns.errors"), "nothing caught").toBe(0);
});
