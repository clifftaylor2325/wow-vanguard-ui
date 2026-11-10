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
  for (const title of ["== Client", "== SavedVariables round trip", "== New-quest flag", "== Group listing", "== Secure paging", "== Realm and name format", "== Colour-blind mode CVars", "== C_Secrets predicates", "== Restrictions and lockdown", "== Navigation", "== Undocumented on Forever", "== Quest and map reads", "== Party, marks and bosses", "== Bars and strips"]) {
    expect(text, title).toContain(title);
  }
  expect(lineOf(text, "GetCVar(colorblindMode)"), "the colour-blind CVar is read and printed").toMatch(/present, /);
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
it("/vg probe: the chat tally counts every error line in the report, including a call that threw", () => {
  const addon = loggedIn(PROBE_ENV);
  addon.slash("probe");
  const errorLines = reportText(addon).split("\n").filter((l) => /: (present, )?error /.test(l)).length;
  expect(errorLines, "the threw predicate is one of them").toBeGreaterThan(0);
  expect(chatHas(addon, new RegExp(`Probe done: \\d+ present, \\d+ missing, ${errorLines} errors`)), "chat counts the same errors").toBe(true);
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
  expect(chatHas(addon, /nothing saved yet/), "a line, no box").toBe(true);
});
it("/vg probe: in combat it takes only the party reads, and chat prints the lines when asked", () => {
  const addon = loggedIn(PROBE_ENV);
  setCombat(addon, true);
  addon.slash("probe");
  expect(chatHas(addon, /party, mark and boss reads taken in this fight/), "the fight run").toBe(true);
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
  expect(lineOf(text, "SetTextToFit read:"), "and no read of it").toMatch(/method missing/);
});
it("/vg probe: asks a texture for the slice, SVG, sprite and load-state methods and reports presence only", () => {
  const addon = loggedIn(PROBE_ENV);
  addon.slash("probe");
  const text = reportText(addon);
  for (const method of ["IsObjectLoaded", "SetTextureSliceMode", "SetSVG", "SetSpriteSheetCell"]) {
    expect(lineOf(text, `Texture:${method}:`), `${method} is unlisted in the harness, so it reads missing`).toMatch(/missing/);
  }
  expect(lineOf(text, "Texture:SetTextureSliceMargins:"), "the harness lists this one").toMatch(/present \(not called\)/);
  addon.eval("ns.Probe.widgets.Texture.SetSVG = function() end");
  addon.slash("probe");
  expect(lineOf(reportText(addon), "Texture:SetSVG:"), "a method the client has reads present and is not called").toMatch(/present \(not called\)/);
});
it("/vg probe: reads what SetTextToFit does to a label, where the client has it", () => {
  const addon = loggedIn(PROBE_ENV);
  const fake = "ns.Probe.widgets = { FontString = { SetSize = function() end, GetFontHeight = function(s) return s.h or 12 end, GetStringWidth = function(s) return s.w or 90 end, GetText = function(s) return s.t end, SetTextToFit = function(s, t) s.h, s.w, s.t = 9, 58, t if t == 'boom' then error('TEST-ONLY fit') end end } }";
  addon.eval(fake);
  addon.slash("probe");
  expect(lineOf(reportText(addon), "SetTextToFit read:"), "before and after").toMatch(/height\/width number 12\/number 90 -> number 9\/number 58, text 'A fairly long label'/);
  addon.eval(fake.replace("'boom'", "'A fairly long label'"));
  addon.slash("probe");
  expect(lineOf(reportText(addon), "SetTextToFit read:"), "an error is a line").toMatch(/error .*TEST-ONLY fit/);
});
it("/vg probe: a restricted read is only looked for, and an error's taint line stays on its line", () => {
  const addon = loggedIn(PROBE_ENV);
  addon.eval("__nearestCalled = false C_Navigation.GetNearestPartyMemberToken = function() __nearestCalled = true return 'party1' end");
  addon.eval("C_LootHistory.GetAllEncounterInfos = function() error('TEST-ONLY blocked\\nLua Taint: Vanguard') end");
  addon.slash("probe");
  const text = reportText(addon);
  expect(lineOf(text, "C_Navigation.GetNearestPartyMemberToken"), "looked for, never called (the docs mark it HasRestrictions)").toMatch(/present \(not called\)$/);
  expect(addon.eval("return __nearestCalled"), "so the game's blocked-action message can't come from it").toBe(false);
  expect(lineOf(text, "C_LootHistory.GetAllEncounterInfos"), "the client's second error line joins the first").toMatch(/error .*TEST-ONLY blocked \| Lua Taint: Vanguard$/);
  expect(text.split("\n").some((l) => /^Lua Taint/.test(l)), "and never starts a line of its own").toBe(false);
});
it("/vg probe: reads the skill list's size, headers and two skills by ID without changing it", () => {
  const addon = loggedIn(PROBE_ENV);
  addon.eval("C_SkillInfo.GetNumSkillLines = function() return 0 end");
  addon.slash("probe");
  expect(lineOf(reportText(addon), "C_SkillInfo read:"), "a world with no skill list answers").toMatch(/lines 0, headers 0, collapsed 0; Enchanting number 0\/number 0, Cooking number 0\/number 0/);
  addon.eval("__wfgWorld.skills[333] = { rank = 150, maxRank = 225 } C_SkillInfo.GetNumSkillLines = function() return 3 end C_SkillInfo.GetSkillLineInfo = function(i) return i == 1 and { isHeader = true, isCollapsed = true } or i == 2 and { isHeader = true, isCollapsed = false } or 5 end");
  addon.slash("probe");
  expect(lineOf(reportText(addon), "C_SkillInfo read:"), "two headers, one collapsed, Enchanting ranked").toMatch(/lines 3, headers 2, collapsed 1; Enchanting number 150\/number 225/);
  addon.eval("C_SkillInfo = nil");
  addon.slash("probe");
  expect(lineOf(reportText(addon), "C_SkillInfo read:"), "no C_SkillInfo").toMatch(/missing/);
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
  expect(chatHas(addon, /Usage: \/vg probe \[chat\|\|fight\|\|last\|\|legacy\]/), "the usage line").toBe(true);
});

// TEST-ONLY quest reads and a log with two quests, one selected.
const QUEST_ENV = `
  __wfgWorld.addQuest({ questID = 90061, title = "TEST-ONLY Boars", level = 9 })
  __wfgWorld.addQuest({ questID = 90062, title = "TEST-ONLY Bears", level = 10 })
  C_QuestLog.GetSelectedQuest = function() return 90062 end
  C_QuestLog.GetAllCompletedQuestIDs = function() return { 90001, 90002 } end
  C_QuestLog.IsQuestFlaggedCompleted = function(id) return id == 90001 end
  C_QuestLog.IsQuestFlaggedCompletedOnAccount = function() return __wfgWorld.secret(true) end
  C_QuestLog.GetRequiredMoney = function(id) return id == 90062 and 500 or 0 end
  C_QuestLog.GetSuggestedGroupSize = function() return 3 end
  C_QuestLog.IsFailed = function() return false end
  C_QuestLog.IsRepeatableQuest = nil -- a read this client lacks
`;
it("/vg probe: the quest reads ask about a done quest and the selected one, and say which", () => {
  const addon = loggedIn(PROBE_ENV + QUEST_ENV);
  addon.slash("probe");
  const text = reportText(addon);
  expect(lineOf(text, "asked about:"), "the two quests by id").toMatch(/done quest 90001, selected quest 90062$/);
  expect(lineOf(text, "C_QuestLog.GetNumQuestLogEntries"), "both of the log's counts").toMatch(/present, number \d+, number \d+/);
  expect(lineOf(text, "C_QuestLog.IsQuestFlaggedCompleted(90001)"), "this character's flag on the done quest, labelled with its id").toMatch(/present, boolean true/);
  expect(lineOf(text, "C_QuestLog.IsQuestFlaggedCompletedOnAccount(90001)"), "a hidden account flag").toMatch(/present, hidden \(\w+\)$/);
  expect(lineOf(text, "C_QuestLog.GetRequiredMoney(90062)"), "money on the selected quest").toMatch(/present, number 500/);
  expect(lineOf(text, "C_QuestLog.GetSuggestedGroupSize"), "group size").toMatch(/present, number 3/);
  expect(lineOf(text, "C_QuestLog.IsRepeatableQuest"), "a read the client lacks").toMatch(/missing/);
  expect(lineOf(text, "GetQuestLogRewardXP(90061)").length, "the first quest's reward XP").toBeGreaterThan(0);
  expect(lineOf(text, "GetQuestLogRewardXP(90062)").length, "and the second's").toBeGreaterThan(0);
});
it("/vg probe: with nothing selected or done, the quest reads say why they were not called", () => {
  const addon = loggedIn(PROBE_ENV);
  addon.eval("C_QuestLog.GetSelectedQuest = function() return 0 end C_QuestLog.GetAllCompletedQuestIDs = nil C_QuestLog.GetRequiredMoney = function() return 0 end");
  addon.slash("probe");
  let text = reportText(addon);
  expect(lineOf(text, "asked about:"), "none of either").toMatch(/done quest none, selected quest none \(click a quest in the log\)/);
  expect(lineOf(text, "C_QuestLog.GetRequiredMoney"), "not called").toMatch(/not called \(no selected quest\)/);
  addon.eval("ns.GuideData.ARGS.done = function() error('TEST-ONLY args') end");
  addon.slash("probe");
  text = reportText(addon);
  expect(lineOf(text, "asked about:"), "an error counts as none").toMatch(/done quest none/);
  expect(lineOf(text, "last flight map:").length, "and the section goes on").toBeGreaterThan(0);
});
it("/vg probe: the last flight map opened is named by its system and the window that showed", () => {
  const addon = loggedIn(PROBE_ENV);
  addon.slash("probe");
  expect(lineOf(reportText(addon), "last flight map:"), "none yet").toMatch(/none opened this session/);
  addon.eval("CreateFrame('Frame', 'TaxiFrame', UIParent):Show()");
  addon.fire("TAXIMAP_OPENED", 1);
  addon.slash("probe");
  expect(lineOf(reportText(addon), "last flight map:"), "before the windows are read").toMatch(/system number 1, windows not read/);
  addon.advance(1);
  addon.slash("probe");
  expect(lineOf(reportText(addon), "last flight map:"), "the window that showed").toMatch(/system number 1, TaxiFrame shown, FlightMapFrame missing/);
  addon.eval("TaxiFrame:Hide()");
  addon.fire("TAXIMAP_OPENED", addon.world.secret(1));
  addon.advance(1);
  addon.slash("probe");
  expect(lineOf(reportText(addon), "last flight map:"), "a hidden system and a hidden window").toMatch(/system hidden \(\w+\), TaxiFrame hidden/);
});
it("/vg probe: party health, the raid mark and the boss unit print plain or hidden, with the type", () => {
  const addon = loggedIn(PROBE_ENV);
  addon.world.setUnit("party1", { name: "TEST-ONLY Ally", hp: 50, maxhp: 100 });
  addon.eval("UnitHealthMissing = function() return __wfgWorld.secret(50) end GetRaidTargetIndex = function() return 8 end");
  addon.slash("probe");
  const text = reportText(addon);
  expect(lineOf(text, "UnitExists(party1)"), "the party member is there").toMatch(/present, boolean true/);
  expect(lineOf(text, "UnitHealthMissing(party1)"), "a hidden return names its type").toMatch(/present, hidden \(\w+\)$/);
  expect(lineOf(text, "GetRaidTargetIndex(target)"), "a plain mark").toMatch(/present, number 8/);
  expect(lineOf(text, "UnitExists(boss1)"), "no boss out of a fight").toMatch(/present, /);
  expect(text, "the section says it ran out of combat").toMatch(/== Party, marks and bosses\n\s+in combat: false/);
});
it("/vg probe in a fight: each run is kept as a block, shown by last after the report", () => {
  const addon = loggedIn(PROBE_ENV);
  setCombat(addon, true);
  addon.slash("probe chat");
  expect(chatHas(addon, /in combat: true/), "chat carries the lines when asked").toBe(true);
  setCombat(addon, false);
  expect(addon.eval("return VanguardDB.probe"), "the round trip's marker is left to the full run").toBeNull();
  addon.slash("probe last");
  expect(reportText(addon), "a fight run alone can be shown").toMatch(/== In a fight \(\/vg probe\), \d+/);
  addon.slash("probe");
  setCombat(addon, true);
  addon.slash("probe");
  setCombat(addon, false);
  addon.slash("probe last");
  let text = reportText(addon);
  expect(text, "the report comes first").toMatch(/^Vanguard probe report/);
  expect(text.match(/== In a fight/g)?.length, "both fight runs of this session are kept").toBe(2);
  expect(text, "each says it ran in combat").toMatch(/In a fight[^\n]*\n\s+in combat: true\n\s+IsInInstance/);
  addon.eval("ns.Probe.COMBAT_MAX = 1");
  setCombat(addon, true);
  addon.slash("probe");
  expect(addon.eval("return #VanguardDB.probeFights"), "the oldest run goes past the cap, whole").toBe(1);
  setCombat(addon, false);
  addon.eval("ns.Probe.session = 'another'");
  addon.slash("probe");
  addon.slash("probe last");
  expect(reportText(addon), "a new report drops an earlier session's fight runs").not.toMatch(/== In a fight/);
});
it("/vg probe: the bars' reads: CVar defaults, the bar button's cooldown numbers and the watched faction", () => {
  const addon = loggedIn(PROBE_ENV);
  addon.eval("GetCVarDefault = function(name) return name == 'countdownForCooldowns' and '1' or '0' end");
  addon.slash("probe");
  let text = reportText(addon);
  expect(lineOf(text, "GetCVarDefault(countdownForCooldowns)"), "a default").toMatch(/present, '1'/);
  expect(lineOf(text, "GetCVarDefault(timeMgrUseMilitaryTime)"), "the clock's").toMatch(/present, '0'/);
  expect(lineOf(text, "bar button cooldown:"), "the harness has no getter").toMatch(/GetHideCountdownNumbers missing|no Vanguard bar button/);
  expect(lineOf(text, "watched faction:"), "nothing watched").toMatch(/none watched/);
  addon.eval(`local AB = ns.GetModule("ActionBars") AB.buttons[1] = { cooldown = { GetHideCountdownNumbers = function() return false end } }
    C_Reputation.GetWatchedFactionData = function() return { reaction = 8, currentReactionThreshold = 42000, nextReactionThreshold = 42000, currentStanding = __wfgWorld.secret(42999) } end`);
  addon.slash("probe");
  text = reportText(addon);
  expect(lineOf(text, "bar button cooldown:"), "the getter's answer").toMatch(/GetHideCountdownNumbers: present, boolean false/);
  expect(lineOf(text, "watched faction:"), "the thresholds, the standing hidden").toMatch(/reaction number 8, thresholds number 42000 to number 42000, standing hidden/);
  addon.eval(`ns.GetModule("ActionBars").buttons[1] = nil C_Reputation.GetWatchedFactionData = nil`);
  addon.slash("probe");
  text = reportText(addon);
  expect(lineOf(text, "bar button cooldown:"), "no button").toMatch(/no Vanguard bar button/);
  expect(lineOf(text, "watched faction:"), "no read").toMatch(/GetWatchedFactionData missing/);
  addon.eval("C_Reputation.GetWatchedFactionData = function() error('TEST-ONLY faction') end");
  addon.slash("probe");
  expect(lineOf(reportText(addon), "watched faction:"), "an error is a line").toMatch(/error .*TEST-ONLY faction/);
});

// A report line starting with a label, without its indent.
const clientRow = (text, label) => lineOf(text, label).trim();
// TEST-ONLY: a Forever client for the client checks: the project constants and two of the Forever-only calls.
const FOREVER_CLIENT_ENV = `
  WOW_PROJECT_MAINLINE, WOW_PROJECT_CAMELOT, WOW_PROJECT_ID = 1, 18, 18
  C_GameRules = { IsHardcoreActive = function() return false end }
  C_SwingTimer = { EnableRangeCheck = function() end }
`;
// TEST-ONLY: game frames as the client may give them: shown, hidden, forbidden, one whose read fails, one that is no frame.
const CLASS_BAR_ENV = `
  RuneFrame = { IsForbidden = function() return false end, IsShown = function() return true end }
  PaladinPowerBarFrame = { IsForbidden = function() return false end, IsShown = function() return false end }
  EncounterTimeline = { IsForbidden = function() return true end, IsShown = function() error("TEST-ONLY forbidden read") end }
  MonkHarmonyBarFrame = { IsForbidden = function() return false end }
  MonkStaggerBar = "TEST-ONLY not a frame"
  DruidComboPointBarFrame = { IsForbidden = function() return false end, IsShown = function() return true end }
`;
it("/vg probe: the client checks name the project and count the Forever-only calls the client has", () => {
  const addon = loggedIn(PROBE_ENV + FOREVER_CLIENT_ENV);
  addon.slash("probe");
  const text = reportText(addon);
  expect(text, "its own section").toContain("== Client checks (Forever and retail)");
  expect(clientRow(text, "game:"), "the project id with its name, the interface and ns.IsForever").toMatch(/^game: WOW_PROJECT_ID 18 \(CAMELOT\), interface \d+, build \d+, ns\.IsForever true$/);
  const names = addon.eval("return ns.Probe.FOREVER_ONLY");
  const present = names.filter((name) => clientRow(text, name + ":").endsWith("present (not called)")).length;
  expect(names.length, "the list holds the fourteen names the API diff found").toBe(14);
  expect(clientRow(text, "Forever-only calls found:"), "the count agrees with the lines under it").toBe(`Forever-only calls found: ${present} of 14 (a retail client finds none)`);
  expect(clientRow(text, "C_GameRules.IsHardcoreActive"), "a call that exists is only looked for").toBe("C_GameRules.IsHardcoreActive: present (not called)");
  expect(clientRow(text, "C_Trainer.GetTrainerType"), "one that does not is missing").toBe("C_Trainer.GetTrainerType: missing");
  expect(addon.eval("return #ns.errors"), "and nothing was caught").toBe(0);
});
it("/vg probe: on a retail project the project name changes, and an unknown id says so", () => {
  const retail = loggedIn(PROBE_ENV + "WOW_PROJECT_MAINLINE, WOW_PROJECT_ID = 1, 1");
  retail.slash("probe");
  expect(clientRow(reportText(retail), "game:"), "retail is MAINLINE").toMatch(/WOW_PROJECT_ID 1 \(MAINLINE\)/);
  const odd = loggedIn(PROBE_ENV + "WOW_PROJECT_ID = 99");
  odd.slash("probe");
  expect(clientRow(reportText(odd), "game:"), "an id no constant matches").toMatch(/WOW_PROJECT_ID 99 \(unknown\)/);
});
it("/vg probe: the client checks count C_Secrets and report each class bar as missing, shown, hidden or forbidden", () => {
  const addon = loggedIn(PROBE_ENV + CLASS_BAR_ENV);
  addon.slash("probe");
  const text = reportText(addon);
  expect(clientRow(text, "C_Secrets functions:"), "the count against the 27 the probe asks about").toMatch(/^C_Secrets functions: \d+ \(the API docs list 27 on both clients\)$/);
  expect(clientRow(text, "RuneFrame:"), "a shown bar").toBe("RuneFrame: present, shown");
  expect(clientRow(text, "PaladinPowerBarFrame:"), "a hidden bar").toBe("PaladinPowerBarFrame: present, hidden");
  expect(clientRow(text, "WarlockPowerFrame:"), "a bar the client lacks").toBe("WarlockPowerFrame: missing");
  expect(clientRow(text, "MonkHarmonyBarFrame:"), "a bar whose shown state cannot be read").toBe("MonkHarmonyBarFrame: present, shown state not readable");
  expect(clientRow(text, "MonkStaggerBar:"), "a global that is no frame counts as missing").toBe("MonkStaggerBar: missing");
  for (const name of ["DevourerFuryBarFrame", "RogueComboPointBarFrame", "MageArcaneChargesFrame"]) {
    expect(clientRow(text, name + ":"), "a listed bar the client lacks").toBe(name + ": missing");
  }
  expect(clientRow(text, "DruidComboPointBarFrame:"), "the druid bar is listed").toBe("DruidComboPointBarFrame: present, shown");
});
it("/vg probe: the client checks say whether the encounter timeline is loaded and its frame forbidden", () => {
  const addon = loggedIn(PROBE_ENV + CLASS_BAR_ENV);
  addon.eval("C_AddOns.IsAddOnLoaded = function(name) return name == 'Blizzard_EncounterTimeline' end");
  addon.slash("probe");
  const text = reportText(addon);
  expect(clientRow(text, "Blizzard_EncounterTimeline loaded:"), "the addon is loaded").toBe("Blizzard_EncounterTimeline loaded: true");
  expect(clientRow(text, "EncounterTimeline:"), "a forbidden frame is named so and its shown state is not read").toBe("EncounterTimeline: present, forbidden");
  const bare = loggedIn(PROBE_ENV);
  bare.slash("probe");
  expect(clientRow(reportText(bare), "Blizzard_EncounterTimeline loaded:"), "not loaded in the default world").toBe("Blizzard_EncounterTimeline loaded: false");
});

it("/vg probe legacy lists the window, its pages, the perk panel and the Legacy globals", () => {
  const addon = loggedIn("");
  addon.slash("probe legacy");
  expect(chatHas(addon, /LegacySystemFrame is not loaded \(open the Legacy window once/), "no window yet").toBe(true);
  addon.eval(`LegacySystemFrame = { TreePage = { LegacyTreeTraitPanel = { configID = 7, treeID = 9 } }, ChallengesPage = { CategoryList = {}, DetailPane = {} } }
    C_Traits = { GetTreeNodes = function() return { 1, 2, 3 } end }`);
  addon.slash("probe legacy");
  expect(chatHas(addon, /TreePage: 1 keys: LegacyTreeTraitPanel/), "a page's keys").toBe(true);
  expect(chatHas(addon, /ChallengesPage: 2 keys: CategoryList, DetailPane/), "another page's keys").toBe(true);
  expect(chatHas(addon, /RewardTrackPage: missing/), "a missing page").toBe(true);
  expect(chatHas(addon, /perk panel: configID 7, treeID 9, nodes 3/), "the panel's ids and node count").toBe(true);
  expect(chatHas(addon, /globals with Legacy in the name \(\d+\): .*LegacySystemFrame \(table\)/), "the globals").toBe(true);
});

it("/vg probe legacy copes with a window without a panel, secret ids, a failing tree call, and combat", () => {
  const addon = loggedIn("");
  addon.eval("LegacySystemFrame = { TreePage = {} }");
  addon.slash("probe legacy");
  expect(chatHas(addon, /perk panel: not found on TreePage/), "no panel").toBe(true);
  addon.eval("LegacySystemFrame.TreePage.LegacyTreeTraitPanel = { configID = __wfgWorld.secret(1), treeID = 9 } C_Traits = { GetTreeNodes = function() error('no tree') end }");
  addon.slash("probe legacy");
  expect(chatHas(addon, /perk panel: configID hidden, treeID 9, nodes unknown/), "hidden ids and a failing call").toBe(true);
  addon.eval("C_Traits = nil LegacySystemFrame.TreePage.LegacyTreeTraitPanel.treeID = nil");
  addon.slash("probe legacy");
  expect(chatHas(addon, /treeID nil|treeID table|nodes unknown/), "no trait calls").toBe(true);
  addon.world.combat(true);
  addon.slash("probe legacy");
  expect(chatHas(addon, /Not in combat\./), "nothing is read in combat").toBe(true);
});
