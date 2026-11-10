// setup: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { ACTIONS_ENV, CLICK_LUA, RAID_ENV, UNITS_ENV, borderOf, chatHas, loggedIn, setCombat, tok } from "./helpers.mjs";

// Clicks one of the setup wizard's buttons (next, back or close) as the player would.
const setupClick = (addon, which) => addon.eval(`local b = Vanguard_Setup.${which} b:GetScript("OnClick")(b, "LeftButton")`);
// The setup wizard's state: the step showing (0 while closed), the account flag, and whether frames are unlocked.
const setupState = (addon) => addon.eval("return { step = ns.Setup.Step() or 0, done = VanguardDB.setupDone == true, unlocked = ns.Unlocked() }");
it("the setup wizard sits above the unlock handles on the last step, so their labels never draw over it", () => {
  const addon = loggedIn("UISpecialFrames = {}", { firstRun: true });
  for (let i = 0; i < 7; i++) setupClick(addon, "next");
  expect(setupState(addon), "step 8 unlocks the frames").toEqual({ step: 8, done: false, unlocked: true });
  expect(addon.eval("return Vanguard_Setup.__strata"), "the wizard is on the full-screen dialog strata").toBe("FULLSCREEN_DIALOG");
  expect(addon.frames('w.__strata == "HIGH" and w.mover ~= nil and w:IsVisible()').length, "the unlock handles are up, on the HIGH strata under the wizard").toBeGreaterThan(0);
});
it("the setup wizard's title and step caption are centred across the window", () => {
  const addon = loggedIn("UISpecialFrames = {}", { firstRun: true });
  expect(addon.eval("local w, t, c = Vanguard_Setup, Vanguard_Setup.title, Vanguard_Setup.caption return { math.abs(select(1, t:GetCenter()) - select(1, w:GetCenter())) < 1, math.abs(select(1, c:GetCenter()) - select(1, w:GetCenter())) < 1 }"), "the title and the caption sit on the window's centre line").toEqual([true, true]);
});
it("the setup wizard's title block: the title sits on the window's 24 line (the X's) in the display role and text colour, the faction crest (T.CREST.title) sits just right of it, the step caption is small text2 under it", () => {
  const addon = loggedIn("UISpecialFrames = {}", { firstRun: true });
  const [inset, pad, gap, tight, crest, small, title] = addon.eval("local T = ns.Theme return { T.CONTROL.inset, T.SPACE.pad, T.SPACE.gap, T.SPACE.tight, T.CREST.title, T.RoleSize('small'), T.RoleSize('display') }");
  const block = addon.eval(`local f = Vanguard_Setup local t, c, k = f.title.__points.CENTER, f.caption.__points.TOP, f.crest.__points.LEFT
    return { t.rel == f, t.relPoint, t.x, t.y, select(2, f.title:GetFont()), f.crest:GetWidth(), k.rel == f.title, k.relPoint, k.x, c.rel == f.title, c.relPoint, c.y, (select(2, f.caption:GetFont())) }`);
  expect(block, "the title's middle is T.CONTROL.inset down the window's top centre, on the X's line; the crest a gap right of the title; the caption a tight gap under it").toEqual([true, "TOP", 0, -inset, title, crest, true, "RIGHT", gap, true, "BOTTOM", -tight, small]);
  const colors = addon.eval("local f = Vanguard_Setup return { f.title.__textColor, f.caption.__textColor }");
  expect([colors[0], colors[1]], "the title in the text colour, the caption in text2").toEqual([tok(addon, "text").slice(0, 3).concat(1), tok(addon, "text2").slice(0, 3).concat(1)]);
  expect(addon.eval("local f = Vanguard_Setup return f.crest:GetLeft() >= f.title:GetRight() and math.abs((f.crest:GetTop() + f.crest:GetBottom()) / 2 - (f.title:GetTop() + f.title:GetBottom()) / 2) < 1"), "the crest sits right of the title, centred on its line").toBe(true);
  const foot = addon.eval("local f = Vanguard_Setup return { f.next.__points.BOTTOMRIGHT.x, f.next.__points.BOTTOMRIGHT.y, f.back:GetWidth(), f.skip:GetWidth(), f.skip.__points.BOTTOMLEFT.x }");
  expect(foot, "Next sits T.SPACE.pad from the corner; Back is the usual 120 wide, Skip a pad in and as wide as the room left of Back").toEqual([-pad, pad, 120, 440 - 2 * pad - 240 - 2 * gap, pad]);
  expect(addon.eval("local f = Vanguard_Setup return f.skip:GetRight() < f.back:GetLeft()"), "Skip stops short of Back (a gap between), so a long label (German) has room").toBe(true);
});
it("the setup wizard is a dialog: the dialog alpha, the shared X at the window offset closes it, and Escape is wired", () => {
  const addon = loggedIn("UISpecialFrames = {}", { firstRun: true });
  const alpha = addon.eval(`for _, t in ipairs(__wfgStub.frames) do if t.__kind == "Texture" and t.__parent == Vanguard_Setup and t.__layer == "BACKGROUND" and t.__vertexColor then return t.__vertexColor[4] end end`);
  expect(alpha, "the window is T.ALPHA.dialog").toBe(addon.eval("return ns.Theme.ALPHA.dialog"));
  const close = addon.eval(`local b = CreateFrame("Button", nil, UIParent) ns.Theme.PlaceClose(b, Vanguard_Setup) local p, c = b.__points.CENTER, Vanguard_Setup.close.__points.CENTER return { p.x == c.x and p.y == c.y, c.relPoint }`);
  expect(close, "the X is where T.PlaceClose puts every window's").toEqual([true, "TOPRIGHT"]);
  expect(addon.eval("local n = 0 for _, name in ipairs(UISpecialFrames) do if name == 'Vanguard_Setup' then n = n + 1 end end return n"), "Escape closes it, wired once").toBe(1);
  setupClick(addon, "close");
  expect(setupState(addon).step, "the X closes setup").toBe(0);
});
it("first-run setup: once per account, nine clicks with the defaults; a first run applies the recommended helpers", () => {
  const addon = loggedIn("UISpecialFrames = {}", { firstRun: true });
  expect(setupState(addon), "a new account opens setup at step 1").toEqual({ step: 1, done: false, unlocked: false });
  expect(addon.eval("return Vanguard_Setup.caption:GetText()"), "the caption names the step").toBe("Step 1 of 9 · Layout");
  expect(addon.eval("return Vanguard_Setup.back:IsShown()"), "there is no Back on the first step").toBe(false);
  expect(addon.eval("return UISpecialFrames[#UISpecialFrames]"), "Escape closes setup").toBe("Vanguard_Setup");
  setupClick(addon, "next");
  expect(setupState(addon).step === 2 && addon.eval("return Vanguard_Setup.back:IsShown()"), "Next goes to Screen, which has Back").toBe(true);
  expect(addon.eval("return Vanguard_Setup.caption:GetText()"), "the second step is the screen").toBe("Step 2 of 9 · Screen");
  setupClick(addon, "next");
  expect(addon.eval("return { GetCVar('useUiScale'), GetCVar('uiScale') }"), "Keep is picked the first time too, so the UI scale is left alone").toEqual({});
  for (let i = 0; i < 5; i += 1) setupClick(addon, "next");
  expect(setupState(addon), "the move step unlocks the frames").toEqual({ step: 8, done: false, unlocked: true });
  setupClick(addon, "next");
  expect([setupState(addon), addon.eval("return Vanguard_Setup.next.text:GetText()")], "All set locks them again, and its button is Done").toEqual([{ step: 9, done: false, unlocked: false }, "Done"]);
  setupClick(addon, "next");
  expect(setupState(addon), "Done closes setup, locks the frames and remembers that setup ran").toEqual({ step: 0, done: true, unlocked: false });
  const kept = addon.eval("return { raid = (VanguardDB.profiles.Default.positions or {}).raid == nil, look = ns.Settings('RaidFrames').look, brass = select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.brass[1], backup = VanguardDB.profiles['Default backup'] ~= nil, loot = ns.Settings('AutoAccept').loot, filter = ns.Settings('ChatFilter').on }");
  expect(kept, "Keep and Keep change no position, style or accent; a first run's helpers start recommended, after the backup; the chat filter is only offered (A1-4)").toEqual({ raid: true, look: "soft", brass: true, backup: true, loot: true, filter: false });
  addon.eval('Vanguard_Question.no:GetScript("OnClick")(Vanguard_Question.no)');
  expect(addon.eval("return Vanguard_Reload:IsShown() and Vanguard_Reload.title:GetText()"), "a first run changed settings, so Done offers the reload").toBe("Setup is done. Reload the UI now to apply it?");
  const again = loggedIn("", { firstRun: true, savedVariables: "VanguardDB = { setupDone = true } VanguardCharDB = {}" });
  expect(again.eval("return Vanguard_Setup == nil"), "setup does not open again for a character that played on this account").toBe(true);
});
it("setup: Done offers the reload once a step changed something, and not after a run that kept everything", () => {
  const changed = loggedIn(UNITS_ENV + RAID_ENV, { firstRun: true });
  setupClick(changed, "next");
  setupClick(changed, "next");
  changed.eval("local b = Vanguard_Setup.pages.look.styles[3] b:GetScript('OnClick')(b)");
  for (let i = 0; i < 7; i += 1) setupClick(changed, "next");
  changed.eval('Vanguard_Question.no:GetScript("OnClick")(Vanguard_Question.no)');
  expect(changed.eval("return Vanguard_Reload:IsShown() and Vanguard_Reload.title:GetText()"), "a new raid frame style is a change").toBe("Setup is done. Reload the UI now to apply it?");
  changed.eval("Vanguard_Reload:Hide()");
  changed.slash("setup");
  for (let i = 0; i < 9; i += 1) setupClick(changed, "next");
  expect(changed.eval("return { ns.Setup.Step() or 0, Vanguard_Reload:IsShown() }"), "a rerun that kept everything ends with no offer").toEqual([0, false]);
});
it("first-run setup waits for combat and steps aside in a fight", () => {
  const addon = loggedIn("__wfgStub.inCombat = true", { firstRun: true });
  expect(setupState(addon).step, "logging in during combat does not open setup").toBe(0);
  expect(chatHas(addon, /Setup opens when combat ends/), "it says when setup will open").toBe(true);
  const queued = addon.eval("return ns.QueuedCount()");
  addon.slash("setup");
  expect(addon.eval("return ns.QueuedCount()"), "asking again in combat queues nothing more").toBe(queued);
  setCombat(addon, false);
  expect(setupState(addon).step, "setup opens once combat ends").toBe(1);
  for (let i = 0; i < 7; i += 1) setupClick(addon, "next");
  addon.eval("__wfgStub.inCombat = true");
  addon.fire("PLAYER_REGEN_DISABLED");
  expect(setupState(addon), "a fight hides setup and locks the frames, without finishing it").toEqual({ step: 0, done: false, unlocked: false });
  setCombat(addon, false);
  expect(setupState(addon), "after the fight setup comes back on the same step, frames unlocked").toEqual({ step: 8, done: false, unlocked: true });
  addon.slash("setup");
  expect(setupState(addon), "/vg setup while it is open leaves it on its step, frames unlocked").toEqual({ step: 8, done: false, unlocked: true });
});
it("/vg setup reopens setup; Back and the close button", () => {
  const addon = loggedIn();
  addon.slash("help");
  expect(chatHas(addon, /setup\s+first-run setup again/), "/vg help lists setup").toBe(true);
  addon.slash("setup");
  expect(setupState(addon).step, "/vg setup opens it on an account that finished setup").toBe(1);
  setupClick(addon, "next");
  setupClick(addon, "back");
  expect(setupState(addon).step, "Back returns to the previous step").toBe(1);
  setupClick(addon, "close");
  expect(setupState(addon), "the close button ends setup; it had run already, so it stays done").toEqual({ step: 0, done: true, unlocked: false });
  expect(chatHas(addon, /opens again at your next login/), "setup wasn't owed, so closing it promises nothing").toBe(false);
  const upgraded = loggedIn("", { firstRun: true, savedVariables: 'VanguardDB = { version = 1, profiles = { Default = { theme = { reduceMotion = true } } } }' });
  expect(setupState(upgraded).step, "an account from before setup existed sees it").toBe(1);
  upgraded.eval("Vanguard_Setup:Hide()");
  expect(setupState(upgraded), "Escape (the client hides the frame) closes setup without finishing it").toEqual({ step: 0, done: false, unlocked: false });
});
it("G6-1 Escape on setup with a reload owed hides setup and stops there, so the reload offer it opens stays up", () => {
  const addon = loggedIn("UISpecialFrames = {}", { firstRun: true });
  addon.eval("ns.Setup.ApplyLayout('damage')");
  addon.key("Vanguard_Setup", "ESCAPE");
  expect(addon.eval("return { Vanguard_Setup:IsShown(), Vanguard_Reload ~= nil and Vanguard_Reload:IsShown() }"), "setup closed, the reload offer shown").toEqual([false, true]);
});
it("E6-1 setup stays open when the whole UI is hidden (Alt-Z, a movie or a cinematic); Done and the close button still finish it", () => {
  const addon = loggedIn(CLICK_LUA, { firstRun: true });
  setupClick(addon, "next");
  addon.eval("ns.Unlock()");
  addon.clearChat();
  addon.eval("UIParent:Hide()");
  addon.eval("UIParent:Show()");
  expect(setupState(addon), "the wizard stays on its step with the frames unlocked").toMatchObject({ step: 2, unlocked: true });
  expect(chatHas(addon, /Setup opens again at your next login/), "and promises nothing").toBe(false);
  setupClick(addon, "close");
  expect(setupState(addon), "the close button still ends it").toMatchObject({ step: 0, unlocked: false });
  expect(chatHas(addon, /Setup opens again at your next login/), "owed setup says it opens again").toBe(true);
  addon.slash("setup");
  for (let i = 0; i < 7; i++) setupClick(addon, "next");
  addon.eval("UIParent:Hide() UIParent:Show()");
  expect(setupState(addon), "on the move step the wizard is still open and unlocked").toMatchObject({ step: 8, unlocked: true });
  setupClick(addon, "next");
  setupClick(addon, "next");
  expect(setupState(addon), "Done still finishes it").toMatchObject({ step: 0, done: true });
});
// TEST-ONLY saved variables: an account that ran setup, with a moved raid grid in Default, and no file for this character yet.
const SET_UP_ACCOUNT = 'VanguardDB = { version = 2, setupDone = true, profiles = { Default = { positions = { raid = { point = "TOP", relPoint = "TOP", x = 0, y = -300 } } } } }\n';
it("first-run setup: closing it early asks again at the next login; Skip setup ends it", () => {
  const addon = loggedIn(CLICK_LUA, { firstRun: true });
  expect(addon.eval("return Vanguard_Setup.skip:IsShown()"), "the first step offers Skip setup").toBe(true);
  setupClick(addon, "next");
  expect(addon.eval("return Vanguard_Setup.skip:IsShown()"), "later steps don't").toBe(false);
  setupClick(addon, "close");
  expect(setupState(addon).done || addon.eval("return VanguardCharDB.setupDone == true"), "closing early is not finishing").toBe(false);
  expect(chatHas(addon, /Setup opens again at your next login/), "it says setup comes back").toBe(true);
  const next = loggedIn(CLICK_LUA, { firstRun: true, savedVariables: "VanguardDB = { version = 2, profiles = {} }\nVanguardCharDB = {}" });
  expect(setupState(next).step, "so the next login opens it again").toBe(1);
  expect(next.eval('return __click("Skip setup")') && setupState(next), "Skip setup closes it as done").toEqual({ step: 0, done: true, unlocked: false });
  expect(next.eval("return VanguardCharDB.setupDone"), "for this character too").toBe(true);
  expect(chatHas(next, /Run setup again any time/), "and says how to run it again").toBe(true);
  expect(next.eval("return (VanguardDB.profiles.Default.positions or {}).raid == nil"), "Skip applies nothing").toBe(true);
});
it("first-run setup: a new character on a set-up account picks its profile first; old characters aren't asked", () => {
  const known = loggedIn("", { firstRun: true, savedVariables: SET_UP_ACCOUNT + "VanguardCharDB = { profile = 'Default' }" });
  expect(setupState(known).step, "a character that played before isn't asked").toBe(0);
  const addon = loggedIn(CLICK_LUA, { firstRun: true, savedVariables: SET_UP_ACCOUNT });
  expect(addon.eval("return Vanguard_Setup.caption:GetText()"), "a new character starts on the profile step").toBe("Step 1 of 10 · Profile");
  const choices = addon.eval("local out = {} for i, b in ipairs(Vanguard_Setup.pages.profile.choices) do out[i] = b.text:GetText() end return out");
  expect(choices, "share the account's profile, or one named after the character").toEqual(["Share profile Default with your other characters", "A profile of its own: Tester"]);
  setupClick(addon, "next");
  expect(addon.eval("return { ns.ProfileName(), Vanguard_Setup.caption:GetText(), Vanguard_Setup.back:IsShown() }"), "sharing keeps Default; Back still reaches the profile step").toEqual(["Default", "Step 2 of 10 · Layout", true]);
  expect(addon.eval("return Vanguard_Setup.pages.layout.hint:GetText()"), "a shared profile that ran setup starts on Keep").toMatch(/^Moves nothing/);
  for (let i = 0; i < 9; i += 1) setupClick(addon, "next");
  expect(addon.eval("return { VanguardCharDB.setupDone, VanguardCharDB.pickProfile == nil, VanguardDB.profiles.Default.positions.raid.y }"), "Done finishes it for this character and moves nothing").toEqual([true, true, -300]);
  const again = loggedIn("", { firstRun: true, savedVariables: SET_UP_ACCOUNT + "VanguardCharDB = { profile = 'Default', setupDone = false, pickProfile = true }" });
  expect(again.eval("return Vanguard_Setup.caption:GetText()"), "a new character that closed it early gets the profile step again").toBe("Step 1 of 10 · Profile");
});
it("first-run setup: a profile of its own copies the shared one without a reload, and your role's layout is marked", () => {
  const addon = loggedIn(CLICK_LUA + UNITS_ENV + RAID_ENV + "__units.player.role = 'HEALER'", { firstRun: true, savedVariables: SET_UP_ACCOUNT });
  addon.eval('__click("A profile of its own")');
  setupClick(addon, "next");
  expect(addon.eval("return { ns.ProfileName(), VanguardCharDB.editModeProfile, Vanguard_Setup.back:IsShown() }"), "the character uses its new profile at once, and Back can't undo it").toEqual(["name", "name", false]);
  expect(addon.eval("return { Vanguard_Setup.pages.layout.hint:GetText(), Vanguard_Setup.pages.layout.choices[3].text:GetText() }"), "a healer's new profile starts on Keep, with Healing marked")
    .toEqual(["Moves nothing: your frames stay where they are.", "Centered: healing  ·  your role"]);
  addon.eval('__click("Centered: healing")');
  setupClick(addon, "next");
  expect(addon.eval("return { VanguardDB.profiles.name.positions.raid.point == nil, VanguardDB.profiles.Default.positions.raid.y }"), "Healing leaves the new profile's raid grid at its default spot (only larger); Default keeps its own").toEqual([true, -300]);
  expect(addon.eval("return ns.Settings('positions') == VanguardDB.profiles.name.positions"), "the running settings are the new profile's").toBe(true);
  setupClick(addon, "back");
  expect(setupState(addon).step, "Back stops at the layout step").toBe(2);
  // The name the fork gives a character called name, with Default and name taken.
  const fork = (name) => addon.eval(`return ns.ForkName(${JSON.stringify(name)})`);
  expect([fork("name"), fork("Ælfric"), fork("Ææ"), fork(undefined)], "a taken name is numbered; letters a profile can't hold are dropped").toEqual(["name 2", "lfric", "Character", "Character"]);
});
it("hunt setup: a player name the client hides (a secret string) names the fork's profile Character instead of raising", () => {
  const addon = loggedIn(CLICK_LUA, { firstRun: true, savedVariables: SET_UP_ACCOUNT });
  addon.world.setUnit("player", { name: addon.world.secret("Tester") });
  expect(addon.eval("return ns.ForkName(UnitName('player'))"), "the profile step names its own-profile choice without reading the name").toBe("Character");
  expect(addon.eval("ns.Setup.ApplyProfile('new') return ns.ProfileName()"), "forking for a hidden name works").toBe("Character");
});
it("Y8-2 first-run setup: once setup changes the shared profile, Back doesn't reach the Profile step", () => {
  const addon = loggedIn(CLICK_LUA, { firstRun: true, savedVariables: SET_UP_ACCOUNT });
  setupClick(addon, "next");
  addon.eval('__click("Centered: healing")');
  setupClick(addon, "next");
  setupClick(addon, "back");
  expect([setupState(addon).step, addon.eval("return Vanguard_Setup.back:IsShown()")], "Back stops at the layout step, so the change can't be left in Default by a later profile of its own").toEqual([2, false]);
});

it("H30-3-1 first-run setup: once setup changed the shared profile, setup opened again doesn't ask for a profile", () => {
  const addon = loggedIn(CLICK_LUA, { firstRun: true, savedVariables: SET_UP_ACCOUNT });
  setupClick(addon, "next");
  addon.eval('__click("Centered: healing")');
  setupClick(addon, "next");
  addon.eval("Vanguard_Setup:Hide()");
  addon.slash("setup");
  expect(addon.eval("return { Vanguard_Setup.caption:GetText(), VanguardCharDB.pickProfile == nil, ns.ProfileNames() }"), "it starts at the layout and the question is gone").toEqual(["Step 1 of 9 · Layout", true, ["Default", "Default backup"]]);
});

it("first-run setup: once a profile of its own is made, setup opened again doesn't offer the Profile step", () => {
  const addon = loggedIn(CLICK_LUA, { firstRun: true, savedVariables: SET_UP_ACCOUNT });
  addon.eval('__click("A profile of its own")');
  setupClick(addon, "next");
  addon.eval("Vanguard_Setup:Hide()");
  addon.slash("setup");
  expect(addon.eval("return { Vanguard_Setup.caption:GetText(), ns.ProfileNames() }"), "it starts at the layout, and no second copy is made").toEqual(["Step 1 of 9 · Layout", ["Default", "Tester"]]);
});
it("first-run setup: the Profile step's choices name the profile in use when setup opens again", () => {
  const addon = loggedIn(CLICK_LUA, { firstRun: true, savedVariables: SET_UP_ACCOUNT });
  addon.eval("Vanguard_Setup:Hide() ns.ForkProfile('Alt') VanguardCharDB.pickProfile = true");
  addon.slash("setup");
  expect(addon.eval("local c = Vanguard_Setup.pages.profile.choices return { c[1].text:GetText(), c[2].text:GetText(), c[2].hint }"), "the labels follow the profile now in use")
    .toEqual(["Share profile Alt with your other characters", "A profile of its own: Tester", "Starts as a copy of Alt; changes here stay on this character."]);
});
it("setup's backup is once per run: /vg graphics apply after setup closed backs the profile up again", () => {
  const addon = loggedIn("__fps = 45 GetFramerate = function() return __fps end __wfgWorld.cvars.graphicsQuality, __wfgWorld.cvars.renderScale = '6', '1'");
  addon.slash("setup");
  addon.eval("ns.Setup.SetLarger(true) Vanguard_Setup:Hide() ns.Settings('ActionBars').size = 50");
  addon.slash("graphics");
  addon.advance(5, 1);
  addon.clearChat();
  addon.slash("graphics apply");
  expect(chatHas(addon, /as it was before setup is saved as profile Default backup/), "chat names the new backup").toBe(true);
  expect(addon.eval("return VanguardDB.profiles['Default backup'].ActionBars.size"), "which holds the sizes from after setup").toBe(50);
});
it("first-run setup: a new character starts on the profile the account's characters used last, and its Profile step offers to share that one", () => {
  const notes = `{ ["Alice-ForeverTest"] = { profile = "Main", stamp = 10 }, ["Carl-ForeverTest"] = { profile = "Gone", stamp = 20 }, ["Dan-ForeverTest"] = { profile = "Default", stamp = 5 } }`;
  const sv = `VanguardDB = { version = 2, setupDone = true, profiles = { Default = {}, Main = { positions = { raid = { point = "TOP", relPoint = "TOP", x = 0, y = -222 } } } }, guard = { stamp = 20, chars = ${notes} } }\n`;
  const addon = loggedIn(CLICK_LUA, { firstRun: true, savedVariables: sv });
  expect(addon.eval("return { ns.ProfileName(), Vanguard_Setup.pages.profile.choices[1].text:GetText() }"), "Main, the newest note whose profile still exists")
    .toEqual(["Main", "Share profile Main with your other characters"]);
  expect(addon.eval("return ns.Settings('positions').raid.y"), "with that profile's settings").toBe(-222);
  const none = loggedIn(CLICK_LUA, { firstRun: true, savedVariables: `VanguardDB = { version = 2, setupDone = true, profiles = { Default = {} }, guard = { stamp = 5, chars = { ["Carl-ForeverTest"] = { profile = "Gone", stamp = 5 } } } }\n` });
  expect(none.eval("return ns.ProfileName()"), "Default when no note's profile is left").toBe("Default");
});
it("setup again: Keep and Keep change nothing; Run setup in the options; Start over owes setup after the reload", () => {
  const addon = loggedIn(CLICK_LUA + ACTIONS_ENV + UNITS_ENV + RAID_ENV + "__wfgStub.setScreen(2560, 1440)");
  addon.eval('ns.SetMoverPoint("raid", "TOP", "TOP", 0, -300)');
  const before = addon.eval("return { { ns.MoverPoint('raid') }, GetCVar('uiScale') or 'unset', ns.GetModule('ActionBars').settings.size }");
  addon.eval('ns.Options.Show("general")');
  expect(addon.eval('return __click("Run setup")') && setupState(addon).step, "General's Run setup opens setup").toBe(1);
  expect(addon.eval("return Vanguard_Options:IsShown()"), "with the options out of the way").toBe(false);
  for (let i = 0; i < 9; i += 1) setupClick(addon, "next");
  expect(addon.eval("return { { ns.MoverPoint('raid') }, GetCVar('uiScale') or 'unset', ns.GetModule('ActionBars').settings.size }"), "clicking through keeps positions, UI scale and sizes").toEqual(before);
  addon.eval('ns.Options.Show("profiles")');
  expect(addon.eval('return __click("Start over")'), "Profiles has Start over").toBe(true);
  expect(addon.eval("return Vanguard_Question.title:GetText()"), "it asks first, saying what is lost and where the copy goes")
    .toBe("Start over? Every setting in profile Default goes back to Vanguard's defaults, for every character that uses it. A copy is kept as profile Default backup.");
  addon.eval('Vanguard_Question.confirm:GetScript("OnClick")(Vanguard_Question.confirm)');
  expect(addon.eval("return { VanguardCharDB.setupDone, VanguardDB.profiles.Default.positions == nil, VanguardDB.profiles['Default backup'].positions.raid.y, VanguardCharDB.setupBackup }"), "it backs the profile up, resets it, owes setup and hands setup the backup").toEqual([false, true, -300, "Default backup"]);
  expect(chatHas(addon, /Profile Default as it was is saved as profile Default backup\./), "and says where the copy went").toBe(true);
  const after = loggedIn("", { firstRun: true, savedVariables: "VanguardDB = { version = 2, setupDone = true, profiles = { Default = {} } }\nVanguardCharDB = { setupDone = false }" });
  expect(after.eval("return { Vanguard_Setup.caption:GetText(), Vanguard_Setup.pages.layout.hint:GetText() }"), "after the reload setup opens on its layouts, Keep picked").toEqual(["Step 1 of 9 · Layout", "Moves nothing: your frames stay where they are."]);
});
it("setup after Start over keeps Start over's backup: its first change doesn't copy the reset profile over it", () => {
  const sv = "VanguardDB = { version = 2, setupDone = true, backupOf = { ['Default backup'] = 'Default' }, profiles = { Default = {}, ['Default backup'] = { positions = { raid = { point = 'TOP', relPoint = 'TOP', x = 0, y = -300 } } } } }\nVanguardCharDB = { setupDone = false, setupBackup = 'Default backup' }";
  const addon = loggedIn("", { firstRun: true, savedVariables: sv });
  addon.clearChat();
  addon.eval("ns.Setup.Backup()");
  expect(addon.eval("return VanguardDB.profiles['Default backup'].positions.raid.y"), "the backup still holds the settings from before Start over").toBe(-300);
  expect(chatHas(addon, /Profile Default as it was before setup is saved as profile Default backup\./), "and chat names it").toBe(true);
});
it("setup closed early keeps its backup for the next owed run, until Done; a run after Done backs up afresh", () => {
  const addon = loggedIn("", { firstRun: true });
  // The action button size the backup profile holds.
  const size = () => addon.eval("return VanguardDB.profiles['Default backup'].ActionBars.size");
  addon.eval("ns.Settings('ActionBars').size = 40 ns.Setup.Backup() ns.Settings('ActionBars').size = 50 Vanguard_Setup:Hide()");
  addon.slash("setup");
  addon.eval("ns.Setup.Backup()");
  expect(size(), "the second run keeps the backup of the profile as it was before the first").toBe(40);
  for (let i = 0; i < 9; i += 1) setupClick(addon, "next");
  expect(addon.eval("return VanguardCharDB.setupBackup"), "Done lets the backup go").toBe(null);
  addon.slash("setup");
  addon.eval("ns.Setup.Backup()");
  expect(size(), "a run after Done backs up the profile as it is now").toBe(50);
});
it("/vg setup while setup is open leaves the run as it is: same step, same backup", () => {
  const addon = loggedIn("");
  addon.slash("setup");
  setupClick(addon, "next");
  addon.eval("ns.Settings('ActionBars').size = 40 ns.Setup.Backup() ns.Settings('ActionBars').size = 50");
  addon.slash("setup");
  addon.eval("ns.Setup.Backup()");
  expect([setupState(addon).step, addon.eval("return VanguardDB.profiles['Default backup'].ActionBars.size")], "still on step 2, the backup from before the run").toEqual([2, 40]);
});
it("setup look: accent swatches and the raid frame style apply at once", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV, { firstRun: true });
  setupClick(addon, "next");
  setupClick(addon, "next");
  expect(borderOf(addon, "Vanguard_Setup.pages.look.swatches[1]"), "the current accent (brass) is outlined").toEqual(tok(addon, "accent").slice(0, 3).concat(1));
  addon.eval("local s = Vanguard_Setup.pages.look.swatches[2] s:GetScript('OnClick')(s)");
  expect(addon.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.arcane[1]"), "the second swatch sets the arcane accent").toBe(true);
  expect(borderOf(addon, "Vanguard_Setup.pages.look.swatches[1]"), "brass is no longer outlined").toEqual(tok(addon, "edge").slice(0, 4));
  expect(addon.eval("local p = Vanguard_Setup.pages.look return { p.swatches[1].check:IsShown(), p.swatches[2].check:IsShown() }"), "the check moves to the chosen swatch").toEqual([false, true]);
  addon.eval("local b = Vanguard_Setup.pages.look.styles[2] b:GetScript('OnClick')(b)");
  expect(addon.eval("return ns.Settings('RaidFrames').look"), "a style button sets the raid frame style").toBe("dark");
  expect(borderOf(addon, "Vanguard_Setup.pages.look.styles[2]"), "the chosen style is outlined").toEqual(tok(addon, "accent").slice(0, 3).concat(1));
  const captions = addon.eval("local out = {} for i, b in ipairs(Vanguard_Setup.pages.look.styles) do out[i] = { b.text:GetText(), b.text.__textColor } end return out");
  expect(captions.map(([t, c]) => [t, ...c.slice(0, 3)]), "each tile's short name under it, the chosen one in the accent's text colour")
    .toEqual([["Softened", ...tok(addon, "text").slice(0, 3)], ["Dark", ...tok(addon, "accentText").slice(0, 3)], ["Bright", ...tok(addon, "text").slice(0, 3)]]);
});
it("setup look: an accent or look change made outside the wizard re-marks the swatches and keeps the dark tile's class-coloured name", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV, { firstRun: true });
  setupClick(addon, "next");
  setupClick(addon, "next");
  addon.eval("local b = Vanguard_Setup.pages.look.styles[2] b:GetScript('OnClick')(b)");
  addon.slash("accent jade");
  addon.update(0.25);
  const marks = addon.eval(`local out = {} for i, s in ipairs(Vanguard_Setup.pages.look.swatches) do
    local jade = s.rgb[1] == ns.Theme.PRESETS.jade[1] and s.rgb[2] == ns.Theme.PRESETS.jade[2]
    if s.check:IsShown() or jade then out[#out + 1] = { jade, s.check:IsShown() } end end return out`);
  expect(marks, "only the jade swatch is checked").toEqual([[true, true]]);
  const [name, class_] = addon.eval(`local c = Vanguard_Setup.pages.look.styles[2].name.__textColor
    return { { c[1], c[2], c[3] }, { ns.GetModule("UnitFrames").HealthColor("player") } }`);
  expect(name, "the dark tile's name stays in the class colour").toEqual(class_);
});
// The style tiles on setup's Look step: each one's size, bar color and fill, and its name's text and color.
const styleTiles = (addon) => addon.eval(`local out = {}
  for i, b in ipairs(Vanguard_Setup.pages.look.styles) do
    local c, t = b.bar.__barColor, b.name.__textColor
    out[i] = { b:GetWidth(), b:GetHeight(), { c[1], c[2], c[3] }, b.bar:GetValue(), b.name:GetText(), { t[1], t[2], t[3] } }
  end
  return out`);
it("setup comfort: Larger text and Safer colours stage a pick, apply when the step is left after the profile backup, and fit the page", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV, { firstRun: true });
  for (let i = 0; i < 3; i += 1) setupClick(addon, "next");
  // Text size, Safer colours and the two switches' picks (rows 1 and 2 of the Comfort step).
  const state = () => addon.eval("local p = Vanguard_Setup.pages.comfort return { ns.Theme.Settings().textScale, ns.Theme.Settings().colorAssist == true, p.rows[1].get(), p.rows[2].get() }");
  expect(state(), "both off to begin with").toEqual([1, false, false, false]);
  addon.eval("local b = Vanguard_Setup.pages.comfort.rows[1] b:GetScript('OnClick')(b)");
  addon.eval("local b = Vanguard_Setup.pages.comfort.rows[2] b:GetScript('OnClick')(b)");
  expect(state(), "the switches are picked; nothing is set until the step is left").toEqual([1, false, true, true]);
  setupClick(addon, "next");
  expect(state().slice(0, 2), "leaving the step: larger text is 115% and Safer colours is on").toEqual([1.15, true]);
  expect(chatHas(addon, /as it was before setup is saved as profile/), "the profile was backed up before the first change").toBe(true);
  setupClick(addon, "back");
  addon.eval("local b = Vanguard_Setup.pages.comfort.rows[1] b:GetScript('OnClick')(b)");
  setupClick(addon, "next");
  expect(state().slice(0, 1), "switching it off and leaving goes back to 100%").toEqual([1]);
  expect(addon.eval("local p = Vanguard_Setup.pages.comfort return { p.use:GetBottom() >= p:GetBottom(), p.rows[1]:GetTop() < p.question:GetBottom() }"), "Use recommended is inside the page, and the rows sit under the question").toEqual([true, true]);
});
it("setup look: each raid frame style is a small raid tile drawn in that style, in your class color", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV, { firstRun: true });
  setupClick(addon, "next");
  setupClick(addon, "next");
  expect(addon.eval("return Vanguard_Setup.caption:GetText()"), "Look is step 3 of 9").toBe("Step 3 of 9 · Look");
  const mage = [0.25, 0.78, 0.92];
  const soft = addon.eval(`return { ns.GetModule("RaidFrames").Soften(${mage.join(", ")}) }`);
  const [white, dark] = [tok(addon, "text").slice(0, 3), tok(addon, "darkBar").slice(0, 3)];
  expect(styleTiles(addon), "softened and bright class bars with light names; a dark bar with the name in the class color").toEqual([
    [100, 48, soft, 0.75, "<name>", white], [100, 48, dark, 0.75, "<name>", mage], [100, 48, mage, 0.75, "<name>", white]]);
  expect(addon.eval("local p = Vanguard_Setup.pages.look local a, b = p.styles[1], p.styles[2] return { select(4, b:GetPoint(1)) - select(4, a:GetPoint(1)), a.text:GetText() }"), "side by side, 16 apart").toEqual([116, "Softened"]);
  addon.eval("local b = Vanguard_Setup.pages.look.styles[3] b:GetScript('OnClick')(b)");
  expect([addon.eval("return ns.Settings('RaidFrames').look"), borderOf(addon, "Vanguard_Setup.pages.look.styles[3]")], "clicking the bright tile picks it").toEqual(["class", tok(addon, "accent").slice(0, 3).concat(1)]);
  setupClick(addon, "next");
  expect(addon.eval("return Vanguard_Setup.caption:GetText()"), "then Comfort is step 4 of 9").toBe("Step 4 of 9 · Comfort");
});
it("first-run setup: Done suggests exporting a profile string; Skip and a rerun don't", () => {
  const addon = loggedIn(ACTIONS_ENV + UNITS_ENV + RAID_ENV + CLICK_LUA + "__wfgStub.setScreen(2560, 1440)", { firstRun: true });
  setupClick(addon, "next");
  setupClick(addon, "next");
  addon.eval("local b = Vanguard_Setup.pages.look.styles[3] b:GetScript('OnClick')(b)");
  for (let i = 0; i < 7; i += 1) setupClick(addon, "next");
  expect(addon.eval("return Vanguard_Question:IsShown() and Vanguard_Question.title:GetText()"), "Done asks about keeping a copy").toBe("Keep a copy of these settings outside the game? Export a profile string and save it somewhere safe; /vg import brings it back.");
  addon.eval('Vanguard_Question.yes:GetScript("OnClick")(Vanguard_Question.yes)');
  expect(addon.eval("return Vanguard_TextDialog:IsShown() and Vanguard_TextEdit:GetText():sub(1, 12)"), "Export shows the whole profile's string to copy").toBe("VG1:profile:");
  expect(chatHas(addon, /Setup is done\. Type \/reload once you've copied the string\.$/), "the reload Done owes is said in chat, not over the string").toBe(true);
  expect(addon.eval("return Vanguard_Reload == nil"), "with no dialog on top").toBe(true);
  const skipped = loggedIn(CLICK_LUA, { firstRun: true });
  skipped.eval('__click("Skip setup")');
  expect(skipped.eval("return Vanguard_Question == nil"), "Skip setup asks nothing").toBe(true);
  skipped.slash("setup");
  for (let i = 0; i < 9; i += 1) setupClick(skipped, "next");
  expect(skipped.eval("return Vanguard_Question == nil"), "nor does finishing setup again").toBe(true);
});

it("the setup wizard takes Tab focus over the showing page's choices, then Skip and Next, and Enter presses the focused one", () => {
  const addon = loggedIn("UISpecialFrames = {}", { firstRun: true });
  // Which of the wizard's buttons wears the ring: its index in choices (c1, c2...) or its name.
  const where = () => addon.eval(`local f = Vanguard_Setup
    local function on(b) local p = ns.Theme.FocusParts(b) return p ~= nil and p.ring.top:IsShown() end
    for _, page in pairs(f.pages) do for i, b in ipairs(page.choices or {}) do if on(b) then return "c" .. i end end end
    for _, name in ipairs({ "skip", "back", "next" }) do if on(f[name]) then return name end end
    return "none"`);
  const choices = addon.eval("local n = 0 for _, page in pairs(Vanguard_Setup.pages) do if page:IsShown() then n = #(page.choices or {}) end end return n");
  expect(where(), "no ring until Tab").toBe("none");
  addon.key("Vanguard_Setup", "TAB");
  expect(where(), "Tab starts at the page's first choice").toBe("c1");
  for (let i = 1; i < choices; i++) addon.key("Vanguard_Setup", "TAB");
  addon.key("Vanguard_Setup", "TAB");
  expect(where(), "after the last choice comes Skip setup (first step), then Next (Back is hidden)").toBe("skip");
  addon.key("Vanguard_Setup", "TAB");
  expect(where(), "then Next").toBe("next");
  addon.key("Vanguard_Setup", "ENTER");
  expect(addon.eval("return ns.Setup.Step()"), "Enter on the focused Next goes to step 2").toBe(2);
  addon.eval("Vanguard_Setup:Hide()");
  expect(where(), "closing the wizard clears the ring").toBe("none");
});

// What runs past the showing page's room: each choice's hint (picked in turn) under the footer's top or past the
// window's right margin, the question past that margin, and a move-step line under the footer's top (within a
// pixel: the window's width is rounded to whole pixels, the text's isn't), as a list ("" when all fits).
const overflow = (addon) => addon.eval(`local f, pad = Vanguard_Setup, ns.Theme.SPACE.pad
  local floor, right, out = f.next:GetTop(), f:GetRight() - pad + 1, {}
  local page
  for _, p in pairs(f.pages) do if p:IsShown() then page = p end end
  for _, b in ipairs(page.choices or {}) do
    b:GetScript("OnClick")(b, "LeftButton")
    if page.hint:GetBottom() < floor or page.hint:GetRight() > right then out[#out + 1] = b.value end
  end
  if page.question and page.question:GetRight() > right then out[#out + 1] = "question" end
  for i, line in ipairs(page.lines or {}) do if line:GetBottom() < floor or line:GetRight() > right then out[#out + 1] = "line " .. i end end
  return table.concat(out, ", ")`);
it("setup: every layout's and screen preset's description, the questions and the move step's lines fit above the buttons and inside the window", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV, { firstRun: true });
  expect(overflow(addon), "the layout step: Centered: healing's long description too").toBe("");
  setupClick(addon, "next");
  expect(overflow(addon), "the screen step: its question wraps inside the window").toBe("");
  for (let i = 0; i < 6; i += 1) setupClick(addon, "next");
  expect(overflow(addon), "the move step").toBe("");
  const inside = addon.eval(`local out = {} for _, key in ipairs({ "comfort", "game", "helpers", "combat" }) do local p = Vanguard_Setup.pages[key] out[#out + 1] = p.use:GetBottom() >= p:GetBottom() - 0.01 end return out`);
  expect(inside, "every guided step's Use recommended button stays inside its page").toEqual([true, true, true, true]);
});
it("setup: the screen step's question wraps under itself, and its first choice sits under the wrapped lines", () => {
  const addon = loggedIn("", { firstRun: true });
  setupClick(addon, "next");
  const q = addon.eval("local p = Vanguard_Setup.pages.screen return { p.question:GetStringHeight() > 14, p.choices[1]:GetTop() <= p.question:GetBottom() - ns.Theme.SPACE.gap + 0.01 }");
  expect(q, "the question takes two lines, and the rows start a gap under it").toEqual([true, true]);
});
it("setup: a longer description (a translation, say) grows the window instead of running onto the buttons", () => {
  const plain = loggedIn("", { firstRun: true });
  const long = loggedIn("local l = ns.Setup.LAYOUTS[3] l.hint = string.rep(l.hint .. ' ', 3)", { firstRun: true });
  // The wizard's height.
  const height = (addon) => addon.eval("return Vanguard_Setup:GetHeight()");
  expect(height(long), "the window is taller").toBeGreaterThan(height(plain));
  expect(overflow(long), "and every description still fits").toBe("");
  setupClick(long, "next");
  expect(overflow(long), "the screen step, in the same taller window").toBe("");
});
it("setup: a new character's profile step fits, and a choice's label stays on one line inside its row (a longer one is cut short)", () => {
  const addon = loggedIn("", { firstRun: true, savedVariables: SET_UP_ACCOUNT });
  expect(overflow(addon), "the profile step").toBe("");
  const row = addon.eval("local b = Vanguard_Setup.pages.profile.choices[1] return { b.text:GetRight() <= b:GetRight(), b.text.__noWrap == true }");
  expect(row, "a choice's label ends inside its row, on one line").toEqual([true, true]);
});
it("the setup wizard's Skip button widens to its label when the first step shows, so German at 130% is not cut (B2-7)", () => {
  const addon = createAddon({ textFit: true, client: '__wfgWorld.locale = "deDE" UISpecialFrames = {}' });
  addon.login();
  // Skip's width, the width its label needs at full size, and whether it stops short of Next with Back hidden.
  const skip = () => addon.eval("local f = Vanguard_Setup return { f.skip:GetWidth(), math.ceil(ns.Theme.FullWidth(f.skip.text)) + 2 * ns.Theme.SPACE.gap, f.skip:GetRight() < f.next:GetLeft() and not f.back:IsShown() }");
  const [normal] = skip();
  addon.eval("ns.Theme.Settings().textScale = 1.3 ns.Theme.Refresh()");
  setupClick(addon, "next");
  setupClick(addon, "back");
  const [width, need, clear] = skip();
  expect(width, "Skip is as wide as its label at full size and a gap each side").toBeGreaterThanOrEqual(need);
  expect(width, "wider than it was at 100%").toBeGreaterThan(normal);
  expect(clear, "into Back's empty slot, short of Next").toBe(true);
});
it("the setup comfort step's switch rows grow to a wrapped caption and stack by their heights, so captions never crowd (B2-4)", () => {
  const addon = createAddon({ textFit: true, client: '__wfgWorld.locale = "deDE" UISpecialFrames = {}' });
  addon.login();
  addon.eval("ns.Theme.Settings().textScale = 1.3 ns.Theme.Refresh()");
  for (let i = 0; i < 3; i += 1) setupClick(addon, "next");
  // For each of the five rows: whether its caption is inside it, its height, and whether the next row starts at its bottom.
  const rows = addon.eval(`local p = Vanguard_Setup.pages.comfort local out = {}
    for i, r in ipairs(p.rows) do
      local nextRow = p.rows[i + 1]
      out[i] = { r.label:GetTop() <= r:GetTop() + 0.01 and r.label:GetBottom() >= r:GetBottom() - 0.01, r:GetHeight(), not nextRow or math.abs(nextRow:GetTop() - r:GetBottom()) < 0.01 }
    end return out`);
  expect(rows.map((r) => r[0]), "every caption sits inside its row").toEqual([true, true, true, true, true]);
  expect(rows.map((r) => r[2]), "each row starts where the one above ends").toEqual([true, true, true, true, true]);
  expect(Math.max(...rows.map((r) => r[1])), "a wrapped caption's row is taller than a one-line row").toBeGreaterThan(28);
  expect(addon.eval("local p = Vanguard_Setup.pages.comfort return p.use:GetBottom() >= p:GetBottom() - 0.01"), "and the page is as tall as its last control").toBe(true);
});
