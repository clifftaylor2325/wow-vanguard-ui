// retail-mythicplus: Retail's Mythic+ (Modules/RetailMythicPlus.lua) and the two Retail situations (Modules/Situations.lua),
// on the TEST-ONLY Retail client (RETAIL_CLIENT, with scripts/lib/wow-retail-mythicplus.lua's stubs).

import { expect, it } from "vitest";
import { RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { chatHas, loggedIn } from "./helpers.mjs";

// The tracker expanded, so every block has the room to show.
const EXPANDED = "VanguardDB.profiles = { Default = { QuestTracker = { expanded = true } } }";

// A logged-in Retail client; extra Lua runs before login.
const retail = (extra = "", savedVariables = EXPANDED) => loggedIn(extra, { client: RETAIL_CLIENT, savedVariables });

// Each drawn tracker block as [title, lines] (a line's count after its text, as the tracker splits them).
const blocks = (addon) => Object.values(addon.eval(`local f = Vanguard_QuestTrackerFrame
  local out = {}
  for i = 1, f.blocks.used do
    local b, lines = f.blocks[i], {}
    for j = 1, b.lines.used do local l = b.lines[j] lines[j] = l.count:GetText() ~= "" and (l.text:GetText() .. " " .. l.count:GetText()) or l.text:GetText() end
    out[i] = { b.title:GetText(), lines }
  end
  return out`)).map(([title, lines]) => [title, Object.values(lines)]);

// TEST-ONLY season: one dungeon with a 33-minute timer, two affixes, this week's three, and the dungeon's instance.
const SEASON = `
  local w = __wfgWorld
  w.challengeMaps[501] = { name = "TEST-ONLY Vault", timeLimit = 1980, instance = 2652 }
  w.challengeMaps[502] = { name = "TEST-ONLY Spire", timeLimit = 1800, instance = 2660 }
  w.affixNames[9], w.affixNames[10], w.affixNames[148] = "TEST-ONLY Tyrannical", "TEST-ONLY Fortified", "TEST-ONLY Xal'atath's Bargain"
  w.weekAffixes = { 10, 148, 999 }
`;

// TEST-ONLY key stage: a boss, a done boss, the enemy forces (weighted: its quantity is the percentage) and one hidden.
const STAGE = `
  __wfgWorld.scenario = { name = "TEST-ONLY Vault", currentStage = 1, numStages = 1,
    step = { title = "TEST-ONLY Vault", numCriteria = 4 },
    criteria = {
      { description = "TEST-ONLY Boss defeated", quantity = 0, totalQuantity = 1, completed = false },
      { description = "TEST-ONLY First boss defeated", quantity = 1, totalQuantity = 1, completed = true },
      { description = "TEST-ONLY Enemy Forces", quantity = 45.6, totalQuantity = 460, quantityString = "210%", isWeightedProgress = true, completed = false },
      __wfgWorld.secret(1),
    } }
`;

// Starts a +12 in TEST-ONLY Vault with two deaths that cost ten seconds, then lets the tracker redraw.
const startKey = (addon, key = "{ mapID = 501, level = 12, affixes = { 10, 148 }, deaths = 2, lost = 10 }") => {
  addon.eval(`__wfgWorld.startKey(${key})`);
  addon.update(0);
};

it("retail mythic+: a running key tops the tracker: its name and level, the timer, deaths, affixes and the stage", () => {
  const addon = retail(SEASON + STAGE);
  startKey(addon);
  expect(blocks(addon), "the key block in place of the scenario block").toEqual([
    ["TEST-ONLY Vault +12", []],
    ["0:00 / 33:00", ["Deaths: 2 (10 s lost)", "Affixes: TEST-ONLY Fortified, TEST-ONLY Xal'atath's Bargain",
      "TEST-ONLY Boss defeated 0/1", "TEST-ONLY First boss defeated 1/1", "TEST-ONLY Enemy Forces 45%"]]]);
  addon.advance(65, 1);
  expect(blocks(addon)[1][0], "the timer ticks once a second").toBe("1:05 / 33:00");
  addon.advance(1980, 30);
  expect(blocks(addon)[1][0], "past the limit it says so").toBe("34:05 / 33:00 · over time");
});

it("retail mythic+: outside a key the scenario block draws as before", () => {
  const addon = retail(SEASON + STAGE);
  expect(blocks(addon)[0], "a scenario outside a key: its name").toEqual(["TEST-ONLY Vault", []]);
  startKey(addon);
  expect(blocks(addon)[0][0], "a key runs: its block").toBe("TEST-ONLY Vault +12");
  addon.eval("__wfgWorld.startKey(nil)");
  addon.update(0);
  expect(blocks(addon)[1][0], "reset: back to the stage row").toBe("TEST-ONLY Vault");
  expect(addon.eval("return #ns.errors"), "nothing caught").toBe(0);
});

// CR-5: the key block draws in the scenario block's place, so it stops the scenario countdown's tick itself.
it("retail mythic+: a scenario countdown ticking before a key stops once the key block draws", () => {
  const addon = retail(SEASON + STAGE + "__wfgWorld.scenario.criteria[1].duration, __wfgWorld.scenario.criteria[1].elapsed = 180, 60");
  // Whether the scenario countdown's tick is running.
  const ticking = () => addon.eval("return ns.ticker.vgJobs['scenario timer'] ~= nil");
  expect(ticking(), "before the key: the timed criterion's countdown ticks").toBe(true);
  startKey(addon);
  expect(ticking(), "the key block in its place: that tick stops (the key's own timer ticks instead)").toBe(false);
});

it("retail mythic+: what the client hides in a key is left out, never compared", () => {
  const addon = retail(SEASON + STAGE);
  startKey(addon, "{ mapID = __wfgWorld.secret(501), level = __wfgWorld.secret(12), affixes = __wfgWorld.secret({}), deaths = __wfgWorld.secret(1), started = __wfgWorld.secret(0) }");
  expect(blocks(addon).slice(0, 2), "no name, level, timer, deaths or affixes: the plain words and the stage").toEqual([
    ["Mythic+", []], ["Mythic+ timer", ["TEST-ONLY Boss defeated 0/1", "TEST-ONLY First boss defeated 1/1", "TEST-ONLY Enemy Forces 45%"]]]);
  addon.eval("__wfgWorld.key.level, __wfgWorld.key.started, __wfgWorld.key.mapID = 7, __wfgStub.now, 999");
  addon.fire("CHALLENGE_MODE_DEATH_COUNT_UPDATED");
  addon.update(0);
  expect(blocks(addon)[0][0], "a dungeon the client can't name: Mythic+ and the level").toBe("Mythic+ +7");
  expect(blocks(addon)[1][0], "no limit: the time alone").toBe("0:00");
  expect(addon.eval("return #ns.errors"), "nothing caught").toBe(0);
});

// The dungeon card's switch on, standing in TEST-ONLY Vault (instance 2652) in a party instance.
const CARD = "VanguardDB.profiles = { Default = { InstancePrep = { dungeonCard = true } } }";
const DOOR = `
  IsInInstance = function() return true, "party" end
  GetInstanceInfo = function() return "TEST-ONLY Vault", "party", 23, "Mythic", 5, 0, false, 2652 end
  __wfgWorld.ownedKey = { mapID = 502, level = 9 }
`;

// The card's shown lines.
const cardLines = (addon) => Object.values(addon.eval(`local out = {}
  for _, fs in ipairs(ns.GetModule("InstancePrep").card.info) do if fs:IsShown() then out[#out + 1] = fs:GetText() end end
  return out`));

it("retail mythic+: the dungeon card shows the dungeon's Mythic+ timer, your keystone and this week's affixes", () => {
  const addon = retail(SEASON + DOOR, CARD);
  addon.eval("ns.GetModule('InstancePrep').ShowOnDemand()");
  expect(cardLines(addon), "no level range: the timer, then the key and the affixes").toEqual([
    "TEST-ONLY Vault · Mythic+ timer 33:00 · 5-player Mythic", "Your keystone: TEST-ONLY Spire +9",
    "Affixes: TEST-ONLY Fortified, TEST-ONLY Xal'atath's Bargain"]);
  startKey(addon, "{ mapID = 501, level = 12, affixes = { 9 } }");
  addon.eval("__wfgWorld.ownedKey = nil ns.GetModule('InstancePrep').ShowOnDemand()");
  expect(cardLines(addon).slice(1), "in a key: no keystone in the bags, the key's own affixes").toEqual(["Affixes: TEST-ONLY Tyrannical"]);
  addon.eval("GetInstanceInfo = function() return 'TEST-ONLY Crypt', 'party', 1, 'Normal', 5, 0, false, 1 end __wfgWorld.weekAffixes = {} __wfgWorld.key = nil ns.GetModule('InstancePrep').ShowOnDemand()");
  expect(cardLines(addon), "a dungeon with no Mythic+ timer, no key, no affixes: the heading alone").toEqual(["TEST-ONLY Crypt · 5-player Normal"]);
});

it("retail mythic+: the card's switch on Town and gear names what Retail's card shows", () => {
  const addon = retail();
  expect(addon.eval("return ns.DungeonCard.LABEL"), "Retail's label").toBe("Dungeon card: your keystone, the affixes and the Mythic+ timer on the checklist");
  expect(addon.eval("return ns.DungeonCard.FIRST_BAG"), "the key scan starts at the backpack (no key ring)").toBe(0);
});

// TEST-ONLY saved profile: a Mythic+ override that moves the info strip.
const KEY_OVERRIDE = `VanguardDB.profiles = { Default = { Situations = { overrides = {
  mythicplus = { positions = { infostrip = { point = "TOP", relPoint = "TOP", x = 0, y = -60 } } } } } } }`;
// The situation you are in.
const where = (addon) => addon.eval("return ns.GetModule('Situations').Where()");

it("retail situations: a running key is Mythic+ and a delve is Delve, both before Instance", () => {
  const addon = retail("IsInInstance = function() return true, 'party' end");
  expect(where(addon), "a dungeon with no key").toBe("instance");
  startKey(addon, "{ mapID = 501, level = 2 }");
  expect(where(addon), "a key runs").toBe("mythicplus");
  addon.eval("__wfgWorld.key = nil __wfgWorld.delveTier = 8 IsInInstance = function() return true, 'scenario' end");
  expect(where(addon), "in a delve").toBe("delve");
  addon.eval("IsInInstance = function() return false, 'none' end");
  expect(where(addon), "delve data held outside an instance is no delve").toBe("solo");
  addon.eval("__wfgWorld.delveTier = nil IsInInstance = function() return true, 'scenario' end");
  expect(where(addon), "a scenario that is no delve: no situation of its own").toBe("solo");
  expect(addon.eval("return ns.GetModule('Situations').UNKNOWN"), "the commands' list names both").toBe("Situations: solo, party, raid, pvp, instance, mythicplus, delve or resting.");
});

it("retail situations: Record for offers Mythic+ and Delve, and a key's override applies when the key starts", () => {
  const addon = retail("IsInInstance = function() return true, 'party' end", KEY_OVERRIDE);
  addon.advance(0.5);
  const choices = Object.values(addon.eval("local out = {} for i, c in ipairs(ns.GetModule('Situations').CHOICES) do out[i] = c[2] end return out"));
  expect(choices.slice(-2), "the last two choices").toEqual(["Mythic+", "Delve"]);
  expect(addon.eval("return { ns.MoverPoint('infostrip') }")[0], "in a dungeon before the key: the base spot").toBe("TOPRIGHT");
  addon.eval("__wfgWorld.startKey({ mapID = 501, level = 2 })");
  addon.advance(0.5);
  expect(addon.eval("return { ns.MoverPoint('infostrip') }"), "the key starts: the Mythic+ spot").toEqual(["TOP", "TOP", 0, -60]);
  addon.eval("__wfgWorld.startKey(nil)");
  addon.advance(0.5);
  expect(addon.eval("return { ns.MoverPoint('infostrip') }")[0], "reset: back to the base").toBe("TOPRIGHT");
});

it("situations on WoW Forever: no Mythic+ or Delve, even where the client answers yes to both", () => {
  const addon = loggedIn(`IsInInstance = function() return true, 'party' end
    C_ChallengeMode = { IsChallengeModeActive = function() return true end } C_DelvesUI = { HasActiveDelve = function() return true end }`);
  const SI = "ns.GetModule('Situations')";
  expect(where(addon), "a dungeon is an instance").toBe("instance");
  expect(addon.eval(`return { #${SI}.NAMES, #${SI}.CHOICES, ${SI}.LABELS.mythicplus == nil }`), "six situations, seven choices, no Mythic+ label").toEqual([6, 7, true]);
  addon.slash("situation record mythicplus");
  expect(chatHas(addon, /Situations: solo, party, raid, pvp, instance or resting\./), "a Mythic+ recording is refused").toBe(true);
});

// A Retail client with Blizzard_ChallengesUI loaded and both its windows shown; options as loggedIn's.
function challenges(savedVariables = "") {
  const addon = loggedIn("", { client: RETAIL_CLIENT, savedVariables });
  addon.eval("__wfgWorld.loadChallenges()");
  addon.fire("ADDON_LOADED", "Blizzard_ChallengesUI");
  addon.eval("ChallengesFrame:Show() ChallengesKeystoneFrame:Show()");
  return addon;
}

// The alpha of each named part (a region's own, 1 when never set).
const alphas = (addon, frame, keys) => addon.eval(`local f, out = ${frame}, {}
  for i, key in ipairs({ ${keys.map((k) => `"${k}"`).join(", ")} }) do local a = f[key].__alpha out[i] = a == nil and 1 or a end
  return out`);

it("retail mythic+: the keystone window sits on a theme panel with its runes and slot, the tab's well border faded", () => {
  const addon = challenges();
  expect(alphas(addon, "ChallengesKeystoneFrame", ["InstructionBackground", "Divider", "RuneBG", "RunesLarge", "SlotBG", "KeystoneFrame"]),
    "the band and divider fade, the runes and slot stay").toEqual([0, 0, 1, 1, 1, 1]);
  expect(addon.eval("local n = 0 for _, r in ipairs({ ChallengesKeystoneFrame:GetRegions() }) do if r.__texture == 'TEST-ONLY-ART' and r.__alpha == 0 then n = n + 1 end end return n"),
    "the backdrop fades with them").toBe(3);
  expect(alphas(addon, "ChallengesFrameInset", ["NineSlice"]), "the tab's well border").toEqual([0]);
  expect(alphas(addon, "ChallengesFrame", ["Background"]), "the dungeon's painting stays").toEqual([1]);
});

it("retail mythic+: the keystone window has the corner brackets other windows have (H27-6-3)", () => {
  const addon = challenges();
  expect(addon.eval(`local n = 0 for _, w in ipairs(__wfgStub.frames) do
      if w.__kind == "Texture" and w.__parent and w.__parent:GetParent() == ChallengesKeystoneFrame and tostring(w.__texture):find("OrnamentCorner") then n = n + 1 end end
    return n`), "four brackets").toBe(4);
});

it("retail mythic+: the keystone window's dungeon name and lines are theme text at the game's sizes (H27-6-3, choice A)", () => {
  const addon = loggedIn("", { client: RETAIL_CLIENT });
  addon.eval(`__wfgWorld.loadChallenges() for _, key in ipairs({ "DungeonName", "PowerLevel", "TimeLimit", "Instructions" }) do ChallengesKeystoneFrame[key] = ChallengesKeystoneFrame:CreateFontString(nil, "ARTWORK") end`);
  addon.fire("ADDON_LOADED", "Blizzard_ChallengesUI");
  expect(addon.eval(`local f, out = ChallengesKeystoneFrame, {}
    for _, key in ipairs({ "DungeonName", "PowerLevel", "TimeLimit", "Instructions" }) do
      local fs = f[key] out[#out + 1] = fs.__textColor[1] == ns.Theme.RGB("text") and select(2, fs:GetFont()) end
    return out`), "light text at 30, 30, 16 and 18").toEqual([30, 30, 16, 18]);
});

it("retail mythic+: with the group finder switch off the Mythic+ windows stay the game's", () => {
  const addon = challenges("VanguardDB.profiles = { Default = { Windows = { finder = false } } }");
  expect(alphas(addon, "ChallengesKeystoneFrame", ["Divider"]), "untouched").toEqual([1]);
  expect(alphas(addon, "ChallengesFrameInset", ["NineSlice"]), "untouched").toEqual([1]);
});
