// probe: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/Probe.lua: /vg probe, the one out-of-combat run that asks the client the open questions,
// opens the report in a copy box and keeps it in SavedVariables; /vg probe fight for the fight reads.

import { expect, it } from "vitest";
import { chatHas, loggedIn, setCombat } from "./helpers.mjs";

// TEST-ONLY reads a Forever client may or may not have.
const PROBE_ENV = `
  C_Secrets.ShouldUnitThreatValuesBeSecret = function() return true end
  C_Secrets.HasSecretRestrictions = function() return false end
  C_Secrets.ShouldUnitComparisonBeSecret = function() error("TEST-ONLY predicate failure") end
  Enum.AddOnRestrictionType = { Combat = 0, Chat = 5 }
  Enum.AddOnRestrictionState = { Inactive = 0, Active = 2 }
  C_RestrictedActions = { GetAddOnRestrictionState = function(t) return t == 5 and 2 or 0 end, InCombatLockdown = function() return false end }
  C_ChatInfo = { InChatMessagingLockdown = function() return false end }
  C_LFGInfo = { IsLFDEnabled = function() return true end }
  C_LFGList = { Search = function() end, GetAvailableCategories = function() return { 1, 2 } end }
  C_Navigation = { GetDistance = function() return 42 end, GetNextWaypointForMap = function() return 0.5, 0.5 end }
  C_LootHistory = { GetNumItems = function() return 0 end }
  C_Seasons = { HasActiveSeason = function() return false end }
  UnitFullName = function() return "Testy", "Forever Test" end
  UnitThreatSituation = function() return 3 end
  UnitDetailedThreatSituation = function() return true, 3, 100, 100, 1 end
`;
// The report as one text, from the copy box.
const reportText = (addon) => addon.eval("return Vanguard_TextDialog.edit:GetText()");
// The report line starting with a label, or "".
const lineOf = (text, label) => text.split("\n").find((l) => l.trim().startsWith(label)) ?? "";

it("/vg probe: one run opens a report with a section per question and reads each guarded", () => {
  const addon = loggedIn(PROBE_ENV);
  addon.world.setUnit("target", { name: "TEST-ONLY Wolf", hp: 100, maxhp: 100, reaction: 2 });
  addon.slash("probe");
  const text = reportText(addon);
  for (const title of ["== Client", "== SavedVariables round trip", "== New-quest flag", "== Group listing", "== Secure paging", "== Realm and name format", "== C_Secrets predicates", "== Restrictions and lockdown", "== Navigation", "== Undocumented on Forever", "== Guide reads"]) {
    expect(text, title).toContain(title);
  }
  expect(lineOf(text, "C_Secrets.ShouldUnitThreatValuesBeSecret(player,target)"), "a predicate prints its answer").toMatch(/present, boolean true/);
  expect(lineOf(text, "C_Secrets.ShouldUnitComparisonBeSecret"), "a predicate that errors says so and the run goes on").toMatch(/present, error .*TEST-ONLY predicate failure/);
  expect(lineOf(text, "C_Secrets.ShouldSpellAuraBeSecret"), "a predicate the client lacks is missing").toMatch(/missing/);
  expect(lineOf(text, "type Chat"), "a restriction type prints its state").toMatch(/present, number 2/);
  expect(lineOf(text, "C_Navigation.GetNextWaypointForMap(").length, "the waypoint read is asked with a map and the player's spot").toBeGreaterThan(0);
  expect(lineOf(text, "UnitDetailedThreatSituation(player,target)"), "threat reads with a target").toMatch(/present, boolean true, number 3/);
  expect(lineOf(text, "C_LFGList.Search"), "a looked-for name is never called").toMatch(/present \(not called\)/);
  expect(lineOf(text, "C_LootHistory.GetPlayerInfo"), "an undocumented read this client lacks").toMatch(/missing/);
  expect(chatHas(addon, /Probe done: \d+ present, \d+ missing, \d+ errors/), "chat says how it went").toBe(true);
  expect(addon.eval("return #ns.errors"), "and nothing was caught").toBe(0);
});
it("/vg probe: the report is kept in SavedVariables and the next run finds the marker", () => {
  const addon = loggedIn(PROBE_ENV);
  addon.slash("probe");
  expect(lineOf(reportText(addon), "earlier run:"), "the first run has none").toMatch(/none saved/);
  expect(addon.eval("return { VanguardDB.probe.runs, type(VanguardDB.probe.report), VanguardCharDB.probe.runs }"), "both files hold the marker and the report").toEqual([1, "table", 1]);
  addon.slash("probe");
  expect(lineOf(reportText(addon), "earlier run:"), "the second finds the first, in this session").toMatch(/#1, build 65000, \d+ s ago, same session/);
  addon.eval("ns.Probe.session = 'another'");
  addon.slash("probe");
  expect(lineOf(reportText(addon), "earlier run:"), "a marker from another session is saved across the exit").toMatch(/earlier session/);
  addon.slash("probe last");
  expect(reportText(addon), "last reopens the saved report").toContain("Vanguard probe report");
});
it("/vg probe last: with nothing saved it says so", () => {
  const addon = loggedIn();
  addon.slash("probe last");
  expect(chatHas(addon, /no saved report yet/), "a line, no box").toBe(true);
});
it("/vg probe: in combat it refuses, and chat prints the lines when asked", () => {
  const addon = loggedIn(PROBE_ENV);
  setCombat(addon, true);
  addon.slash("probe");
  expect(chatHas(addon, /run it out of combat/), "refused").toBe(true);
  expect(addon.eval("return ns.Probe.Paging()"), "the secure frame is left alone in combat").toBe("skipped (in combat)");
  setCombat(addon, false);
  addon.slash("probe chat");
  expect(chatHas(addon, /== Secure paging/), "chat carries the section titles").toBe(true);
});
it("/vg probe: a target-less run says how to get the threat reads; a section that throws is a line", () => {
  const addon = loggedIn(PROBE_ENV);
  addon.slash("probe");
  expect(lineOf(reportText(addon), "threat reads:"), "no target").toMatch(/no target/);
  addon.eval("ns.Probe.SECTIONS[#ns.Probe.SECTIONS + 1] = { 'TEST-ONLY bad', function() error('TEST-ONLY section failure') end }");
  addon.slash("probe");
  expect(reportText(addon), "the failure is a line and the run went on").toMatch(/== TEST-ONLY bad\n\s+section failed: .*TEST-ONLY section failure/);
});
it("/vg probe: secure paging, the player's position and the widget methods report what the client gives", () => {
  const addon = loggedIn(PROBE_ENV);
  addon.eval("RegisterStateDriver = function(f) f:SetAttribute('state-page', 1) end");
  addon.eval("C_Map.GetPlayerMapPosition = function() return { GetXY = function() return 0.25, 0.75 end } end");
  addon.slash("probe");
  const text = reportText(addon);
  expect(lineOf(text, "state driver"), "the paging value is read back").toMatch(/state-page number 1/);
  expect(lineOf(text, "C_Navigation.GetNextWaypointForMap("), "asked with the map and the spot").toMatch(/GetNextWaypointForMap\(\d+,0\.25,0\.75\)/);
  expect(lineOf(text, "FontString:SetTextToFit"), "a widget method this client lacks").toMatch(/missing/);
});
it("/vg probe: a paging frame that errors is a line", () => {
  const addon = loggedIn(PROBE_ENV);
  addon.eval("RegisterStateDriver = function() error('TEST-ONLY driver failure') end");
  addon.slash("probe");
  expect(lineOf(reportText(addon), "state driver"), "the error text").toMatch(/error .*TEST-ONLY driver failure/);
});
it("/vg probe fight: arms, reads as the fight starts and 3 s in, and keeps the report after it", () => {
  const addon = loggedIn(PROBE_ENV);
  addon.slash("probe");
  addon.slash("probe fight");
  expect(chatHas(addon, /Probe: armed/), "armed").toBe(true);
  setCombat(addon, true);
  addon.fire("PLAYER_REGEN_DISABLED");
  addon.advance(4);
  addon.fire("PLAYER_REGEN_DISABLED");
  setCombat(addon, false);
  expect(chatHas(addon, /fight report is ready/), "told after the fight").toBe(true);
  addon.slash("probe last");
  const text = reportText(addon);
  expect(text, "both snapshots are in the saved report").toMatch(/== Fight, start \(in combat: true\)[\s\S]*== Fight, 3 s in/);
});
it("/vg probe fight: an unarmed fight records nothing", () => {
  const addon = loggedIn(PROBE_ENV);
  addon.fire("PLAYER_REGEN_DISABLED");
  expect(addon.eval("return ns.Probe.fight"), "nothing armed, nothing kept").toBeNull();
  expect(addon.eval("return #ns.Probe.Snapshot('now')"), "a snapshot is a list of lines").toBeGreaterThan(5);
});
it("/vg probe: anything else prints the usage", () => {
  const addon = loggedIn();
  addon.slash("probe now");
  expect(chatHas(addon, /Usage: \/vg probe \[chat\|fight\|last\]/), "the usage line").toBe(true);
});
