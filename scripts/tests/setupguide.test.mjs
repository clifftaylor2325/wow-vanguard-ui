// setupguide: the guided steps of first-run setup (Core/SetupGuide.lua), Vanguard's real Lua in the TEST-ONLY headless
// client (scripts/lib/lua-harness.mjs): Comfort, Game settings, Helpers and Combat, their recommended marks and picks,
// Use recommended, the All set list and Undo setup.

import { expect, it } from "vitest";
import { RETAIL_CLIENT } from "../lib/lua-harness.mjs";
import { CLICK_LUA, RAID_ENV, UNITS_ENV, chatHas, loggedIn } from "./helpers.mjs";

// Clicks one of the setup wizard's buttons (next, back or close) as the player would.
const setupClick = (addon, which) => addon.eval(`local b = Vanguard_Setup.${which} b:GetScript("OnClick")(b, "LeftButton")`);
// Clicks Next n times.
const nexts = (addon, n) => { for (let i = 0; i < n; i += 1) setupClick(addon, "next"); };
// Clicks a guided step's switch row (by its 1-based place), staging its pick.
const flip = (addon, step, i) => addon.eval(`local r = Vanguard_Setup.pages.${step}.rows[${i}] r:GetScript("OnClick")(r)`);
// A guided step's rows: each row's key, its pick and whether its caption carries the recommended mark.
const rows = (addon, step) => addon.eval(`local out = {} for i, r in ipairs(Vanguard_Setup.pages.${step}.rows) do
  out[i] = { r.spec.key, r.get(), r.label:GetText():find("recommended", 1, true) ~= nil } end return out`);
// The All set step's text: its line and the change lines shown, and whether Undo setup shows.
const allSet = (addon) => addon.eval(`local p = Vanguard_Setup.pages.done local out = { p.question:GetText() }
  for _, l in ipairs(p.lines) do if l:IsShown() then out[#out + 1] = l:GetText() end end return { out, p.undo:IsShown() }`);
// The settings the helpers and combat steps set.
const applied = (addon) => addon.eval(`local s, AB = ns.Settings, ns.Settings("ActionBars")
  return { s("AutoAccept").loot, s("ChatFilter").on, s("ChatHistory").on, s("SpellRanks").barNotice, s("SpellRanks").trainerMemory, s("MailTools").on,
    s("QuestAuto").accept, s("GameTools").essential, s("CooldownGlow").glow, s("FrameAuras").timers, s("GroupThreat").show, AB.bars[4].enabled, AB.bars[5].enabled }`);

it("guided setup: the four guided steps come after Look, each with its rows, the recommended ones marked", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV, { firstRun: true });
  nexts(addon, 3);
  expect(addon.eval("return Vanguard_Setup.caption:GetText()"), "Comfort is step 4").toBe("Step 4 of 9 · Comfort");
  expect(rows(addon, "comfort"), "five comfort rows: four offered (no controller, so Larger text isn't recommended), all off, and the Shield HUD look recommended and on").toEqual([["larger", false, false], ["assist", false, false], ["calm", false, false], ["motion", false, false], ["hud", true, true]]);
  setupClick(addon, "next");
  expect(addon.eval("return Vanguard_Setup.caption:GetText()"), "then the game's settings").toBe("Step 5 of 9 · Game settings");
  expect(rows(addon, "game").map((r) => [r[0], r[2]]), "three game rows, all recommended").toEqual([["plates", true], ["camera", true], ["classNames", true]]);
  setupClick(addon, "next");
  expect(rows(addon, "helpers"), "a first run starts the helpers on their recommendation: all but quest automation").toEqual([["loot", true, true], ["filter", true, true], ["history", true, true], ["ranks", true, true], ["mail", true, true], ["quests", false, false]]);
  setupClick(addon, "next");
  expect(rows(addon, "combat"), "combat: the manager, the glow, the timers and the two bars on; the threat panel is for tanks; key setup on WoW Forever").toEqual([["manager", true, true], ["glow", true, true], ["timers", true, true], ["threat", false, false], ["bars", true, true], ["keys", true, true]]);
  expect(addon.eval("return { Vanguard_Setup.pages.helpers.use.text:GetText(), Vanguard_Setup.pages.helpers.use:IsShown() }"), "each step has Use recommended").toEqual(["Use recommended", true]);
});
it("guided setup: picks apply when a step is left, after the profile backup; nothing is set while the step shows", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV, { firstRun: true });
  nexts(addon, 5);
  expect(applied(addon), "on the helpers step nothing has changed yet").toEqual([false, false, false, false, false, false, false, false, false, false, false, false, false]);
  expect(addon.eval("return VanguardDB.profiles['Default backup'] == nil"), "and no backup was made").toBe(true);
  flip(addon, "helpers", 6);
  setupClick(addon, "next");
  expect(applied(addon).slice(0, 7), "leaving Helpers switches on the five recommended ones and the quest automation picked").toEqual([true, true, true, true, true, true, true]);
  expect(chatHas(addon, /Profile Default as it was before setup is saved as profile Default backup/), "the profile was backed up first").toBe(true);
  setupClick(addon, "next");
  expect(applied(addon).slice(7), "leaving Combat: the manager, the glow, the timers and bars 4 and 5, not the threat panel").toEqual([true, true, true, false, true, true]);
  expect(addon.eval("return Vanguard_Setup.caption:GetText()"), "Move things follows").toBe("Step 8 of 9 · Move things");
  setupClick(addon, "next");
  const [lines, undo] = allSet(addon);
  expect(lines, "All set lists every change, with On or Off").toEqual(["All set. Done closes setup. This run changed:", "Faster auto-loot: On", "Filter chat: gold selling, boosting, recruiting, repeats: On",
    "Keep chat history across reloads: On", "Spell ranks: notice older ranks, remember trainers: On", "Inbox search and send-to-alt presets: On", "Accept and turn in quests (hold Shift to skip): On",
    "Show the game's Cooldown Manager: On", "Glow a buff near its end: On", "Timer numbers on target and focus auras: On", "Two more bars at the right edge (bars 4 and 5): On"]);
  expect(undo, "and offers Undo setup").toBe(true);
  expect(addon.eval("local p = Vanguard_Setup.pages.done return p.undo:GetTop() < p.lines[10]:GetBottom() and p.undo:GetBottom() >= p:GetBottom() - 0.01"), "Undo setup sits under the last line, inside the page").toBe(true);
});
it("guided setup: Undo setup asks, then puts every row and the profile back and ends setup with a reload offer", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA, { firstRun: true });
  addon.eval('__click("Centered: healing")');
  nexts(addon, 8);
  expect(allSet(addon)[0].slice(0, 3), "setup's own change leads the list").toEqual(["All set. Done closes setup. This run changed:", "Layout: Centered: healing", "Faster auto-loot: On"]);
  addon.eval("local b = Vanguard_Setup.pages.done.undo b:GetScript('OnClick')(b)");
  expect(addon.eval("return Vanguard_Question:IsShown() and Vanguard_Question.title:GetText()"), "it asks first").toBe("Undo everything this setup changed and put the profile back as it was? Setup then ends and offers the reload that applies it.");
  addon.eval('Vanguard_Question.confirm:GetScript("OnClick")(Vanguard_Question.confirm)');
  expect(applied(addon), "every guided row is back as it was").toEqual([false, false, false, false, false, false, false, false, false, false, false, false, false]);
  expect(addon.eval("return { ns.Setup.Step() or 0, VanguardDB.setupDone, ns.Settings('RaidFrames').sortByRole, ns.Settings('positions').uf_player == nil }"), "setup ended as Done, with the profile from before Healing back (no role sort, your frame at its default size)").toEqual([0, true, false, true]);
  expect(addon.eval("return Vanguard_Reload:IsShown() and Vanguard_Reload.title:GetText()"), "then the reload that shows the restored profile, with no export question first (nothing new to keep)").toBe("Setup was undone: the profile as it was is back. Reload the UI now to apply it?");
});

it("guided setup: Undo setup with the backup profile gone still puts the guided rows back, says so in chat, and ends as an ordinary Done", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA, { firstRun: true });
  addon.eval('__click("Centered: healing")');
  nexts(addon, 8);
  addon.eval("VanguardDB.profiles['Default backup'] = nil local b = Vanguard_Setup.pages.done.undo b:GetScript('OnClick')(b) Vanguard_Question.confirm:GetScript('OnClick')(Vanguard_Question.confirm)");
  expect(applied(addon), "every guided row is back as it was").toEqual(Array(13).fill(false));
  expect(chatHas(addon, /The backup profile is gone, so only the guided steps' settings went back\./), "chat says the profile couldn't come back").toBe(true);
  expect(addon.eval("return { ns.Setup.Step() or 0, VanguardDB.setupDone, ns.Settings('RaidFrames').sortByRole }"), "setup ended as Done and Healing's settings stay").toEqual([0, true, true]);
});
it("guided setup: the game's own rows start on what the game has, Use recommended takes them, and Undo puts the game's values back", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + "__wfgWorld.cvars.nameplateShowEnemies = '0'", { firstRun: true });
  nexts(addon, 4);
  expect(rows(addon, "game").map((r) => r[1]), "enemy plates off in the game: the row starts off, though recommended").toEqual([false, false, false]);
  addon.eval("local b = Vanguard_Setup.pages.game.use b:GetScript('OnClick')(b)");
  expect(rows(addon, "game").map((r) => r[1]), "Use recommended picks all three").toEqual([true, true, true]);
  setupClick(addon, "next");
  // The game's enemy plates, the furthest-zoom setting and class-coloured names, as they stand now.
  const game = () => addon.eval("return { GetCVar('nameplateShowEnemies'), ns.Settings('Quiet').camera, GetCVar('chatClassColorOverride') }");
  expect(game(), "leaving the step sets the game's plates, the furthest zoom and class-coloured names").toEqual(["1", 2.6, "0"]);
  expect(addon.eval("return VanguardDB.profiles['Default backup'] ~= nil and VanguardDB.profiles['Default backup'].Quiet.camera"), "the profile was backed up first, with the camera as it was").toBe(0);
  nexts(addon, 3);
  expect(allSet(addon)[0].slice(1, 4), "the list names them").toEqual(["Enemy nameplates (the V key): On", "Camera zooms out furthest (2.6 x): On", "Class-coloured names in chat: On"]);
  addon.eval("local b = Vanguard_Setup.pages.done.undo b:GetScript('OnClick')(b)");
  addon.eval('Vanguard_Question.confirm:GetScript("OnClick")(Vanguard_Question.confirm)');
  expect(game(), "Undo puts the game's values back").toEqual(["0", 0, "2"]);
});
it("guided setup: the threat panel follows the layout picked, a controller recommends Larger text, and a touched row keeps its pick", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + "InputUtil = { IsGamepadUIEnabled = function() return true end }", { firstRun: true });
  addon.eval('__click("Centered: tanking")');
  nexts(addon, 3);
  expect(rows(addon, "comfort")[0], "with the gamepad on, Larger text is recommended and starts on").toEqual(["larger", true, true]);
  flip(addon, "comfort", 1);
  nexts(addon, 3);
  expect(rows(addon, "combat")[3], "a tank's run marks and picks the threat panel").toEqual(["threat", true, true]);
  for (let i = 0; i < 6; i += 1) setupClick(addon, "back");
  addon.eval('__click("Centered: damage")');
  nexts(addon, 3);
  expect(rows(addon, "comfort")[0], "Larger text, turned off by hand, stays off").toEqual(["larger", false, true]);
  nexts(addon, 3);
  expect(rows(addon, "combat")[3], "for damage the threat panel is neither marked nor picked").toEqual(["threat", false, false]);
  expect(addon.eval("return ns.Setup.ChosenRole()"), "the role the guided steps read").toBe("damage");
});
it("guided setup: a run again starts every row on what is set, so Next through to Done changes nothing and All set says so", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV);
  addon.slash("setup");
  nexts(addon, 5);
  expect(rows(addon, "helpers").map((r) => r[1]), "the helpers start off, as they are set, though recommended").toEqual([false, false, false, false, false, false]);
  nexts(addon, 3);
  expect(allSet(addon), "All set: nothing changed, no Undo").toEqual([["All set. This run changed nothing: Done closes setup."], false]);
  setupClick(addon, "next");
  expect([addon.eval("return ns.Setup.Step() or 0"), addon.eval("return Vanguard_Reload == nil or not Vanguard_Reload:IsShown()")], "Done ends it with no reload").toEqual([0, true]);
  addon.slash("setup");
  nexts(addon, 5);
  flip(addon, "helpers", 6);
  addon.eval("local b = Vanguard_Setup.pages.helpers.use b:GetScript('OnClick')(b)");
  expect(rows(addon, "helpers").map((r) => r[1]), "Use recommended turns the recommended rows on and leaves the quest automation as picked").toEqual([true, true, true, true, true, true]);
  setupClick(addon, "next");
  expect(applied(addon).slice(0, 7), "leaving applies them").toEqual([true, true, true, true, true, true, true]);
});
it("guided setup on Retail: the WoW Forever rows (spell ranks, key setup) aren't built, and the rest stand", () => {
  const addon = loggedIn("", { firstRun: true, client: RETAIL_CLIENT });
  nexts(addon, 5);
  expect(rows(addon, "helpers").map((r) => r[0]), "five helper rows").toEqual(["loot", "filter", "history", "mail", "quests"]);
  setupClick(addon, "next");
  expect(rows(addon, "combat").map((r) => r[0]), "five combat rows").toEqual(["manager", "glow", "timers", "threat", "bars"]);
  expect(addon.eval("local p = Vanguard_Setup.pages.combat return p.use:GetTop() < p.rows[5]:GetBottom()"), "Use recommended sits under the last row built").toBe(true);
});
it("guided setup: key setup's next-login note is the Combat step's last row on WoW Forever; off, setup leaves no note", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV, { firstRun: true });
  nexts(addon, 6);
  flip(addon, "combat", 6);
  nexts(addon, 3);
  expect(addon.eval("return VanguardCharDB.keysOffer"), "turned off, Done leaves key setup's note off").toBe(false);
  const kept = loggedIn(UNITS_ENV + RAID_ENV, { firstRun: true });
  nexts(kept, 9);
  expect(kept.eval("return VanguardCharDB.keysOffer"), "left on, Done leaves the note for the next login").toBe(true);
});
it("guided setup: All set names a screen preset, Pixel-perfect or Fit, and the look, after the layout", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + "__wfgStub.setScreen(2560, 1440)", { firstRun: true });
  setupClick(addon, "next");
  addon.eval('__click("Pixel-perfect (sharpest)")');
  nexts(addon, 2);
  addon.eval("local b = Vanguard_Setup.pages.look.styles[2] b:GetScript('OnClick')(b)");
  nexts(addon, 5);
  expect(allSet(addon)[0].slice(1, 3), "the screen and the look lead the list").toEqual(["Screen: Pixel-perfect (sharpest)", "Accent or raid frame style"]);
  const narrow = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + "__wfgStub.setScreen(1229, 768)", { firstRun: true });
  setupClick(narrow, "next");
  narrow.eval('__click("Fit my screen: UI scale 90%  ·  suggested")');
  nexts(narrow, 7);
  expect(allSet(narrow)[0][1], "Fit by its short name").toBe("Screen: Fit my screen");
  const preset = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + "__wfgStub.setScreen(2560, 1440)", { firstRun: true });
  setupClick(preset, "next");
  preset.eval('__click("1440p")');
  nexts(preset, 7);
  expect(allSet(preset)[0][1], "a preset by its name").toBe("Screen: 1440p");
});
