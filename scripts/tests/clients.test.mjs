// clients: the per-client module gate (Core/Modules.lua). A module whose `clients` leaves out the running client
// is not registered there: ns.GetModule gives nil, ns.ModuleNames leaves it out, and its options rows and /vg words
// don't show. On WoW Forever nothing changes.

import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { createAddon, RETAIL_CLIENT, root } from "../lib/lua-harness.mjs";
import { loadsOn, tocEntries } from "../lib/toc.mjs";
import { chatHas, loggedIn } from "./helpers.mjs";

// The modules only WoW Forever has: vanilla's systems (swing timer, five-second rule, spell ranks, Legacy, the
// talent tree, pet happiness and the stable) and the guides built on vanilla's quests and groups.
const FOREVER_ONLY = ["PowerTicks", "SwingTimer", "UnitExtras", "TalentPlanner", "Legacy", "QuestGuide", "SpellRanks", "PetStable", "GroupBoard"];

// ns.ModuleNames() on WoW Forever before the gate: the gate must leave it exactly as it was.
const FOREVER_MODULES = [
  "UnitFrames", "CastBars", "FrameAuras", "PlayerAuras", "ComboPoints", "ClassBars", "PowerTicks", "SwingTimer", "UnitExtras",
  "RaidFrames", "RaidAuras", "RaidHealing", "RaidStatus", "RaidTools", "MainTanks", "PartyExtras", "GroupThreat", "ActionBars",
  "SpecialBars", "Minimap", "Waypoints", "MinimapButtons", "Chat", "ChatExtras", "ChatWatch", "ChatFilter", "ChatHistory",
  "ChatWindows", "ChatBubbles", "Bags", "InfoStrip", "BrokerStrip", "MenuStrip", "Merchant", "Errands", "InstancePrep",
  "TalentPlanner", "Legacy", "AutoAccept", "Quiet", "QuestDialog", "QuestAuto", "QuestTracker", "QuestLog", "QuestHistory",
  "QuestGuide", "QuestArrow", "QuestMinimap", "Windows", "CharacterExtras", "AuctionHelper", "GameTools", "CooldownGaps",
  "CooldownGlow", "CooldownKeys", "BossDocks", "FightHistory", "Meter", "Rolls", "CraftQueue", "MailTools", "OfficerLoot",
  "GameAlerts", "AfkScreen", "DataBars", "Tooltips", "Inventory", "Upgrades", "VendorMemory", "SpellRanks", "PetStable",
  "Nameplates", "Situations", "ClickCast", "Coexist", "GroupBoard",
];

// An options page's rows, built as the window builds them (nil with no such page), and their labels.
const PAGE_ROWS = `function __rows(key)
  for _, page in ipairs(ns.Options.PAGES) do if page.key == key then return page.rows() end end
end
function __labels(key)
  local rows = __rows(key)
  if not rows then return nil end
  local out = {} for _, r in ipairs(rows) do if type(r[2]) == "string" then out[#out + 1] = r[2] end end return out
end`;

// A logged-in addon on WoW Forever, or on Retail with retail = true, with the page-label helper loaded.
function on(retail) {
  const addon = loggedIn("", retail ? { client: RETAIL_CLIENT } : {});
  addon.eval(PAGE_ROWS);
  return addon;
}

// A page's row labels.
const labels = (addon, key) => addon.eval(`return __labels("${key}")`);

it("clients: on WoW Forever every module is registered, in the same order as before the gate", () => {
  const addon = on(false);
  expect(addon.eval("return ns.ModuleNames()"), "the module list is today's, byte for byte").toEqual(FOREVER_MODULES);
  expect(addon.eval("return #ns.errors"), "nothing caught").toBe(0);
});

it("clients: each Forever-only module says so, and on Retail it is not registered and never built", () => {
  const forever = on(false);
  const retail = on(true);
  for (const name of FOREVER_ONLY) {
    expect(forever.eval(`local m = ns.GetModule("${name}") return m ~= nil and m.clients.forever == true and m.clients.retail == nil`), `${name} is WoW Forever only`).toBe(true);
    expect(retail.eval(`return ns.GetModule("${name}") == nil`), `${name} is nil on Retail`).toBe(true);
  }
  const names = retail.eval("return ns.ModuleNames()");
  expect(names, "Retail's list is Forever's without them").toEqual(FOREVER_MODULES.filter((n) => !FOREVER_ONLY.includes(n)));
  expect(retail.eval("return ns.QuestGuide ~= nil and ns.QuestGuide.settings == nil"), "the quest guide still loads for its callers, switched off").toBe(true);
  expect(retail.eval("return #ns.errors"), "nothing caught").toBe(0);
});

it("clients: ns.ClientAllows and ns.ClientData answer for the running client", () => {
  const forever = on(false);
  const retail = on(true);
  const ask = "return { ns.ClientAllows({}), ns.ClientAllows({ clients = { forever = true } }), ns.ClientAllows({ clients = { retail = true } }), ns.ClientData({ forever = 'F', retail = 'R' }) }";
  expect(forever.eval(ask), "WoW Forever: both, Forever's, not Retail's; Forever's data").toEqual([true, true, false, "F"]);
  expect(retail.eval(ask), "Retail: both, not Forever's, Retail's; Retail's data").toEqual([true, false, true, "R"]);
});

it("clients: a Retail-only module is registered on Retail and not on WoW Forever", () => {
  const define = `ns.Module("TEST-ONLY RetailThing", { clients = { retail = true }, defaults = {} })`;
  const forever = createAddon();
  const retail = createAddon({ client: RETAIL_CLIENT });
  expect(forever.eval(`${define} return ns.GetModule("TEST-ONLY RetailThing") == nil`), "WoW Forever leaves it out").toBe(true);
  expect(retail.eval(`${define} return ns.GetModule("TEST-ONLY RetailThing") ~= nil`), "Retail has it").toBe(true);
});

it("clients: a 12.x build whose project is Forever's (WOW_PROJECT_CAMELOT) counts as WoW Forever, Retail's project doesn't", () => {
  // Forever's 12.x build has Forever's events (Core/Home.lua registers its rules event there).
  const camelot = createAddon({ client: `${RETAIL_CLIENT}\n__wfgWorld.invalidEvents.GAME_RULES_CHANGED = nil\nWOW_PROJECT_ID, WOW_PROJECT_CAMELOT = 18, 18` });
  const mainline = createAddon({ client: `${RETAIL_CLIENT}\nWOW_PROJECT_ID, WOW_PROJECT_CAMELOT = 1, 18` });
  expect(camelot.eval("return ns.IsForever()"), "project 18 is Forever").toBe(true);
  expect(mainline.eval("return ns.IsForever()"), "project 1 is Retail").toBe(false);
});

it("clients: on Retail the Forever-only modules' options rows and pages don't show; on WoW Forever they do", () => {
  const forever = on(false);
  const retail = on(true);
  // Rows by page that only WoW Forever's modules (or features) put there.
  const rows = {
    unitframes: ["Combat timers", "Swing timer (reload)", "Five-second rule spark on your mana bar", "Readouts"],
    town: ["Spell ranks", "Pet stable", "Legacy"],
    quests: ["Shift-click points", "Quest-start pins on the world map"],
    actionbars: ["Your keys", "Set up keys"],
    chat: ["Group board", "Open the group board"],
  };
  for (const [page, want] of Object.entries(rows)) {
    expect(labels(forever, page), `WoW Forever's ${page} page has them`).toEqual(expect.arrayContaining(want));
    for (const label of want) expect(labels(retail, page), `Retail's ${page} page has no "${label}"`).not.toContain(label);
  }
  expect([forever.eval('return __labels("talents") ~= nil'), retail.eval('return __labels("talents") ~= nil')], "the Talents page is WoW Forever's").toEqual([true, false]);
  expect(labels(retail, "town"), "Errands stay on Retail").toContain("Errands");
});

it("clients: the Modules page lists only the modules the client has", () => {
  // The module names the Modules page has a switch for.
  const modulesOn = (addon) => addon.eval('local out = {} for _, r in ipairs(__rows("modules")) do if r[1] == "module" then out[#out + 1] = r[7] end end return out');
  expect(modulesOn(on(false)), "WoW Forever lists them").toEqual(expect.arrayContaining(FOREVER_ONLY));
  const retail = modulesOn(on(true));
  for (const name of FOREVER_ONLY) expect(retail, `Retail has no ${name} switch`).not.toContain(name);
});

it("clients: the class bars and quest arrow wording describe the running client", () => {
  // The Class bars description, the mana switch's caption and the Quests page's arrow note.
  const words = (addon) => addon.eval(`local O = ns.Options
    local note for _, r in ipairs(__rows("quests")) do if r[1] == "text" and r[2]:find("^The arrow on screen") then note = r[2] end end
    return { O.MODULE_INFO.ClassBars[2], O.MANA_BAR_LABEL, note }`);
  const [foreverInfo, foreverMana, foreverNote] = words(on(false));
  const [retailInfo, retailMana, retailNote] = words(on(true));
  expect([foreverInfo, foreverMana], "WoW Forever: totems and druid mana").toEqual(["Shaman totems above the player frame, and druid mana in forms under it. Needs Unit frames.", "Druid mana under the player frame in bear and cat form (reload)"]);
  expect([retailInfo, retailMana], "Retail: the class resources and the mana specs").toEqual([expect.stringContaining("holy power, soul shards"), expect.stringContaining("Shadow, Elemental and Balance")]);
  expect([foreverNote.includes("/vg questdata"), retailNote.includes("/vg questdata")], "/vg questdata is named only where it exists").toEqual([true, false]);
});

it("clients: on Retail the Forever-only /vg words are unknown and out of /vg help", () => {
  const retail = on(true);
  retail.slash("pets");
  expect(chatHas(retail, /Unknown command\. \/vg help/), "/vg pets is unknown").toBe(true);
  retail.slash("help");
  for (const word of ["pets", "ranks", "trainers", "legacy", "talents", "lfg", "questdata"]) {
    expect(chatHas(retail, new RegExp(`\\|r ${word}\\b`)), `/vg help has no ${word}`).toBe(false);
  }
  expect(chatHas(retail, /\|r stock\b/), "Errands' word stays").toBe(true);
  expect(retail.eval("return #ns.errors"), "nothing caught").toBe(0);
});

it("clients: on WoW Forever the same words are commands and in /vg help", () => {
  const forever = on(false);
  forever.slash("help");
  for (const word of ["pets", "ranks", "trainers", "legacy", "talents", "lfg", "questdata"]) {
    expect(chatHas(forever, new RegExp(`\\|r ${word}\\b`)), `/vg help has ${word}`).toBe(true);
  }
  forever.slash("pets");
  expect(chatHas(forever, /Unknown command/), "/vg pets runs").toBe(false);
});

it("clients: rows added with ns.RetailRows show on the Game windows card, under the window switches", () => {
  const addon = on(true);
  addon.eval('ns.RetailRows(function() return { { "text", "TEST-ONLY Retail window row" } } end)');
  const rows = labels(addon, "windows");
  const at = rows.indexOf("TEST-ONLY Retail window row");
  expect(at, "the added row is on the page").toBeGreaterThan(0);
  expect(rows[at + 1], "just above the reset button").toBe("Reset window positions");
  expect(labels(on(false), "windows"), "nothing adds any today").not.toContain("TEST-ONLY Retail window row");
});

it("clients: the dungeon card follows its switch on both clients, Retail's with its own label", () => {
  const sv = "VanguardDB.profiles.Default = { InstancePrep = { dungeonCard = true } }";
  // Shows the card on demand and walks in a door; whether the dungeon card was asked for lines or to record.
  const asked = (addon) => addon.eval(`__card = 0 ns.DungeonCard.Lines = function() __card = __card + 1 return {} end
    ns.DungeonCard.Record = function() __card = __card + 1 end
    local PR = ns.GetModule("InstancePrep") PR.ShowOnDemand() ns.Where = function() return "party" end PR.OnEnter(nil, nil, true) return __card`);
  expect(asked(loggedIn("", { savedVariables: sv })), "WoW Forever: lines and the record").toBe(2);
  const retail = loggedIn("", { savedVariables: sv, client: RETAIL_CLIENT });
  expect(retail.eval("return ns.DungeonCard.LABEL"), "Retail's card is the keystone card (Modules/RetailMythicPlus.lua)").toMatch(/keystone/);
  expect(asked(retail), "Retail: lines and the record too").toBe(2);
});

// Forever-only modules whose file still loads on Retail, as if switched off, and why.
const LOADS_SWITCHED_OFF = { QuestGuide: "the quest tracker, arrow and dialog call ns.QuestGuide" };

it("clients: every module's TOC line loads on just the clients its `clients` names (the tags are the second lock)", () => {
  const addon = createAddon();
  for (const entry of tocEntries(fs.readFileSync(path.join(root, "Vanguard.toc"), "utf8"))) {
    const name = fs.readFileSync(path.join(root, entry.path), "utf8").match(/ns\.Module\("(\w+)"/)?.[1];
    if (!name) continue;
    const clients = addon.eval(`local c = ns.GetModule("${name}").clients return c and { c.forever == true, c.retail == true } or { true, true }`);
    const retail = clients[1] || name in LOADS_SWITCHED_OFF;
    expect([loadsOn(entry, "forever"), loadsOn(entry, "retail")], `${entry.path} (${name})`).toEqual([clients[0], retail]);
  }
});
