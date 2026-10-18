// guideprobe: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/GuideData.lua: /vg guide probe, which reports what the client returns for the reads a
// levelling guide would use, in chat only; and the Errands flight poll's secret guard (LG-0).

import { expect, it } from "vitest";
import { chatHas, loggedIn } from "./helpers.mjs";

// TEST-ONLY quest in the log, and reads this client's world lacks.
const PROBE_ENV = `
  __wfgWorld.addQuest({ questID = 90051, title = "TEST-ONLY Wolves", level = 8 })
  C_QuestLog.IsQuestFlaggedCompleted = function() return false end
  C_QuestLog.GetQuestsOnMap = function() return { 1, 2, 3 } end
  C_TaxiMap = { GetAllTaxiNodes = function() error("TEST-ONLY taxi failure") end }
  UnitPosition = function() return 1, 2, 3, 4 end
  GetPlayerFacing = function() return 1.5 end
`;
// The probe's chat lines after running it.
const probe = (addon) => {
  addon.slash("guide probe");
  return Array.from(addon.chat());
};
// The first probe line naming a read, or "".
const line = (lines, name) => lines.find((l) => l.includes(name + ":")) ?? "";

it("guide probe: a line per read - present with its value, missing, or not called", () => {
  const addon = loggedIn(PROBE_ENV);
  const lines = probe(addon);
  expect(lines.some((l) => /Guide probe \(chat only, nothing is changed\); in combat: false/.test(l)), "a header says it changes nothing").toBe(true);
  expect(line(lines, "C_QuestLog.IsQuestFlaggedCompleted"), "a plain flag prints in full").toMatch(/present, boolean false/);
  expect(line(lines, "C_QuestLog.GetMaxNumQuestsCanAccept"), "a plain number prints in full").toMatch(/present, number 25/);
  expect(line(lines, "C_QuestLog.GetQuestsOnMap"), "a table prints its length").toMatch(/present, table of 3/);
  expect(line(lines, "C_Map.GetPlayerMapPosition"), "a map position prints plain or hidden").toMatch(/present, position plain/);
  expect(line(lines, "C_QuestLog.GetNextWaypoint"), "a read the client lacks is missing").toMatch(/missing/);
  expect(line(lines, "C_TaxiMap.GetTaxiNodesForMap"), "so is one of a namespace that has the other").toMatch(/missing/);
  expect(line(lines, "C_TaxiMap.GetAllTaxiNodes"), "a read that errors says so and the probe goes on").toMatch(/present, error .*TEST-ONLY taxi failure/);
  expect(line(lines, "UnitPosition"), "a unit read called with the player").toMatch(/present, number 1/);
  expect(line(lines, "IsInInstance"), "a read with no arguments").toMatch(/present, boolean false/);
  expect(line(lines, "QUEST_TURNED_IN"), "events not seen yet say so").toMatch(/not seen this session/);
});
it("guide probe: with no quest or no plain map, a read that needs one is not called", () => {
  const addon = loggedIn("C_Map.GetBestMapForUnit = function() return nil end C_Map.GetMapLevels = function() end C_QuestLog.GetQuestsOnMap = function() end");
  const lines = probe(addon);
  expect(line(lines, "C_QuestLog.GetDistanceSqToQuest"), "an empty log").toMatch(/present, not called \(no quest\)/);
  expect(line(lines, "C_QuestLog.GetQuestsOnMap"), "no map").toMatch(/present, not called \(no map\)/);
  expect(line(lines, "C_Map.GetMapLevels"), "no map").toMatch(/present, not called \(no map\)/);
});
it("guide probe: a secret value prints hidden and is never read", () => {
  const addon = loggedIn(PROBE_ENV);
  addon.eval("local w = __wfgWorld w.secretReads.UnitOnTaxi, w.secretReads.UnitLevel, w.secretReads.UnitIsDeadOrGhost = true, true, true");
  addon.eval("local w = __wfgWorld w.secretReads['C_Map.GetPlayerMapPosition'], w.secretReads['C_QuestLog.GetDistanceSqToQuest'] = true, true");
  addon.eval("UnitPosition = __wfgWorld.secret");
  const lines = probe(addon);
  for (const name of ["UnitOnTaxi", "UnitLevel", "UnitIsDeadOrGhost", "C_QuestLog.GetDistanceSqToQuest", "UnitPosition"]) {
    expect(line(lines, name), name + " is hidden").toMatch(/present, hidden$/);
  }
  expect(line(lines, "C_Map.GetPlayerMapPosition"), "a position the client hides whole").toMatch(/present, hidden$/);
  addon.eval("C_Map.GetPlayerMapPosition = function() return { GetXY = function() return __wfgWorld.secret(1), __wfgWorld.secret(2) end } end");
  expect(line(probe(addon).slice(-26), "C_Map.GetPlayerMapPosition"), "a position whose numbers are hidden").toMatch(/present, position hidden$/);
});
it("guide probe: QUEST_ACCEPTED and QUEST_TURNED_IN record only the types of their first arguments", () => {
  const addon = loggedIn(PROBE_ENV);
  addon.fire("QUEST_TURNED_IN", 90051, 250, 100);
  addon.fire("QUEST_ACCEPTED", addon.world.secret(7), "log");
  const lines = probe(addon);
  expect(line(lines, "QUEST_TURNED_IN"), "numbers: their types, never the ids").toMatch(/^.*QUEST_TURNED_IN: first arguments number, number$/);
  expect(line(lines, "QUEST_ACCEPTED"), "a secret is named, with the type() the client gave it").toMatch(/first arguments secret \(type table\), string$/);
  expect(chatHas(addon, /90051|250/), "no argument value reaches chat").toBe(false);
});
it("/vg guide: with anything but probe it prints how to use it", () => {
  const addon = loggedIn();
  addon.slash("guide");
  addon.slash("guide now");
  expect(chatHas(addon, /Usage: \/vg guide probe/), "the usage line").toBe(true);
});
it("Errands flight poll: a hidden taxi state is left alone, no error", () => {
  const addon = loggedIn();
  addon.eval(`local ER = ns.GetModule("Errands") ER.flight = { key = "a > b", to = "b", picked = 0 }
    __wfgWorld.secretReads.UnitOnTaxi = true ER.PollFlight()`);
  expect(addon.eval('return ns.GetModule("Errands").flight ~= nil'), "the flight is kept, not landed or dropped").toBe(true);
  addon.eval('__wfgWorld.secretReads.UnitOnTaxi = nil ns.GetModule("Errands").flight = nil ns.GetModule("Errands").PollFlight()');
  expect(addon.eval("return #ns.errors"), "and no error is left in the list").toBe(0);
});
it("guide probe: C_TooltipInfo.GetUnit is asked about your target only, and prints how many lines it gave", () => {
  const addon = loggedIn(PROBE_ENV);
  expect(line(probe(addon).slice(-26), "C_TooltipInfo.GetUnit"), "without a target it is not called").toMatch(/present, not called \(no target\)/);
  addon.world.setUnit("target", { name: "TEST-ONLY Wolf", hp: 10, maxhp: 10, reaction: 2, tooltipLines: [{ type: 8, leftText: "TEST-ONLY 1/8" }, { type: 1 }] });
  expect(line(probe(addon).slice(-26), "C_TooltipInfo.GetUnit"), "with one, its line count (never the text)").toMatch(/present, tooltip data, 2 lines/);
  addon.eval("UnitExists = function() return __wfgWorld.secret(true) end");
  expect(line(probe(addon).slice(-26), "C_TooltipInfo.GetUnit"), "a hidden answer about the target counts as none").toMatch(/not called \(no target\)/);
  addon.eval("UnitExists = nil");
  expect(line(probe(addon).slice(-26), "C_TooltipInfo.GetUnit"), "a client without UnitExists has none either").toMatch(/not called \(no target\)/);
});
