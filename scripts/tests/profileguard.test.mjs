// profileguard: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { luaValue } from "../lib/lua-emit.mjs";
import { CLICK_LUA, chatHas, loggedIn, setCombat } from "./helpers.mjs";

// Settings-loss guard (Core/SettingsGuard.lua) -----------------------------------------------------

// Logs out (the guard leaves its stamps and backup), then logs in again with `account` and `char` Lua
// for the saved files (each defaults to what the first session saved; "nil" drops a file).
function relog(addon, { account, char, extra = CLICK_LUA } = {}) {
  addon.fire("PLAYER_LOGOUT");
  const sv = addon.savedVariables();
  const next = createAddon({ savedVariables: `VanguardDB = ${account ?? luaValue(sv.account)}\nVanguardCharDB = ${char ?? luaValue(sv.char)}\n` });
  next.eval(extra);
  next.login();
  return next;
}
// Answers the yes/no question: its yes button, or No.
const answer = (addon, yes) => addon.eval(`local b = Vanguard_Question.${yes ? "yes" : "no"} b:GetScript("OnClick")(b, "LeftButton")`);
// The question's text while it shows, else null.
const question = (addon) => addon.eval("return Vanguard_Question and Vanguard_Question:IsShown() and Vanguard_Question.title:GetText() or nil");
// Whether setup is showing.
const setupShown = (addon) => addon.eval("return Vanguard_Setup ~= nil and Vanguard_Setup:IsShown()");
it("settings-loss guard: logout leaves the same stamp in both files, the character's profile and a backup string", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.fire("PLAYER_LOGOUT");
  const sv = addon.savedVariables();
  expect(typeof sv.char.guard.stamp, "a stamp in this character's file").toBe("number");
  expect(sv.account.guard.stamp, "the same stamp in the account file").toBe(sv.char.guard.stamp);
  expect(sv.account.guard.chars["Tester-ForeverTest"], "the account notes the profile each character uses").toEqual({ profile: "Default", stamp: sv.char.guard.stamp });
  expect(sv.char.guard.profile, "the backup names its profile").toBe("Default");
  expect(sv.char.guard.backup.startsWith("VG1:profile:"), "and holds it as a whole-profile string").toBe(true);
  const unnamed = loggedIn("UnitName = function() return nil end");
  unnamed.eval("ns.SettingsGuard.Save()");
  expect(unnamed.eval("return { next(VanguardDB.guard.chars) == nil, type(VanguardCharDB.guard.backup) }"), "a character the client won't name gets no note, but keeps its backup").toEqual([true, "string"]);
});
it("settings-loss guard: a blank account file next to this character's stamp offers the backup, and Restore brings the profile back", () => {
  const first = loggedIn(CLICK_LUA);
  first.slash("accent arcane");
  first.eval('ns.SetMoverPoint("infostrip", "TOPLEFT", "TOPLEFT", 40, -60)');
  const lost = relog(first, { account: "nil" });
  expect(chatHas(lost, /saved settings didn't load this session \(the account file came back blank\)\. This character kept a backup\.$/), "chat says so").toBe(true);
  expect(question(lost), "a question offers the backup").toBe("Vanguard's saved settings didn't load. Restore profile Default from this character's backup?");
  expect(setupShown(lost), "setup waits: it's not a first run").toBe(false);
  lost.eval('ns.Options.Show("general")');
  expect(lost.texts("Vanguard's saved settings didn't load this session.").length, "the General page starts with the notice").toBe(1);
  expect(lost.eval('return __click("Restore the backup")'), "with Restore on it").toBe(true);
  expect(lost.eval("return { VanguardDB.profiles.Default.positions.infostrip.x, VanguardDB.setupDone, VanguardCharDB.setupDone }"), "the profile is back, and setup has run").toEqual([40, true, true]);
  expect(lost.eval("return Vanguard_Reload:IsShown() and Vanguard_Reload.title:GetText()"), "the reload that applies it is offered").toBe("Restored profile Default from this character's backup. Reload the UI now to apply it?");
  expect(lost.texts("Vanguard's saved settings didn't load this session.").length, "the notice goes").toBe(0);
  const back = relog(lost);
  expect(back.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.arcane[1]"), "after the reload the accent is back").toBe(true);
  expect([question(back), chatHas(back, /didn't load/)], "and nothing is offered again").toEqual([null, false]);
});
it("settings-loss guard: an account file older than this character's last session; Restore from the question", () => {
  const first = loggedIn(CLICK_LUA);
  first.slash("accent fel");
  first.fire("PLAYER_LOGOUT");
  const sv = first.savedVariables();
  const old = { ...sv.account, guard: { stamp: sv.char.guard.stamp - 100, chars: {} }, profiles: { Default: {} } };
  const lost = relog(first, { account: luaValue(old) });
  expect(chatHas(lost, /the account file came back older than this character's last session/), "chat says the account file is older").toBe(true);
  answer(lost, true);
  expect(lost.eval("return VanguardDB.profiles.Default.theme.accent[1] == ns.Theme.PRESETS.fel[1]"), "Restore puts the newer profile back").toBe(true);
  const same = relog(first, { account: luaValue({ ...old, guard: { stamp: sv.char.guard.stamp, chars: {} } }) });
  expect(question(same), "an account file as new as the character's stamp is fine").toBe(null);
});
it("settings-loss guard: without a backup it offers to paste a string; Not now leaves the notice, and an unanswered loss keeps the stamps", () => {
  const lost = relog(loggedIn(CLICK_LUA), { account: "nil", char: "{ guard = { stamp = 5 } }" });
  expect(chatHas(lost, /Paste a profile string you exported to get them back\.$/), "chat says to paste a string").toBe(true);
  expect(question(lost), "the question offers it").toBe("Vanguard's saved settings didn't load. Paste a profile string you exported?");
  answer(lost, false);
  expect(chatHas(lost, /The General and Profiles pages in \/vg can still restore them/), "Not now says where the restore still is").toBe(true);
  lost.eval('ns.Options.Show("profiles")');
  expect(lost.eval('return __click("Restore the backup")'), "no Restore without a backup").toBe(false);
  expect(lost.eval('return __click("Paste a profile string")') && lost.eval("return Vanguard_TextDialog:IsShown()"), "Paste opens the import box").toBe(true);
  lost.fire("PLAYER_LOGOUT");
  expect(lost.eval("return { VanguardCharDB.guard.stamp, VanguardDB.guard == nil }"), "logout leaves the stamps as they were").toEqual([5, true]);
  const fresh = relog(loggedIn(CLICK_LUA), { account: "nil", char: "{ guard = { stamp = 5 } }" });
  fresh.eval('ns.Options.Show("profiles")');
  expect(fresh.eval('return __click("Start fresh")') && setupShown(fresh), "Start fresh runs setup").toBe(true);
  fresh.fire("PLAYER_LOGOUT");
  expect(fresh.eval("return VanguardCharDB.guard.stamp ~= 5 and VanguardDB.guard.stamp == VanguardCharDB.guard.stamp"), "once answered, logout stamps both files again").toBe(true);
});
it("settings-loss guard: a pasted whole profile answers the loss at logout", () => {
  const text = loggedIn().eval('ns.Profile().positions = { uf_player = { point = "TOP", x = 3, y = 4 } } return ns.ExportProfile()');
  const lost = relog(loggedIn(CLICK_LUA), { account: "nil", char: "{ guard = { stamp = 5 } }" });
  answer(lost, true);
  lost.eval(`Vanguard_TextEdit:SetText(${JSON.stringify(text)}) Vanguard_TextDialog.primary:GetScript("OnClick")(Vanguard_TextDialog.primary)`);
  expect(lost.eval("return VanguardCharDB.pendingProfile"), "the string became a profile this character uses after the reload").toBe("Imported");
  lost.fire("PLAYER_LOGOUT");
  expect(lost.eval("return VanguardCharDB.guard.stamp ~= 5 and VanguardDB.guard.chars['Tester-ForeverTest'].profile"), "so logout stamps both files, noting the imported profile").toBe("Imported");
});
it("settings-loss guard: a backup that can't be read says so; a damaged guard and a name that isn't a profile name", () => {
  const broken = relog(loggedIn(CLICK_LUA), { account: '{ guard = "TEST-ONLY" }', char: '{ guard = { stamp = 5, profile = "TEST-ONLY/bad", backup = "TEST-ONLY" } }' });
  expect(question(broken), "a damaged account guard counts as blank; a bad name restores as Restored").toBe("Vanguard's saved settings didn't load. Restore profile Restored from this character's backup?");
  answer(broken, true);
  expect(chatHas(broken, /The backup can't be restored: not a Vanguard profile string\.$/), "a backup that can't be read says why").toBe(true);
  broken.eval('VanguardDB.guard = { chars = "TEST-ONLY" } ns.SettingsGuard.lost = nil ns.SettingsGuard.Save()');
  expect(broken.eval("return type(VanguardDB.guard.chars['Tester-ForeverTest'])"), "logout repairs a damaged list of characters").toBe("table");
});
it("settings-loss guard: a restore reads the backup like an import: no string keys in the profile, and a newer format is refused", () => {
  const addon = loggedIn(CLICK_LUA);
  const restored = addon.eval(`local str = ns.ExportProfile()
    VanguardCharDB.guard = { stamp = 1, profile = "Saved", backup = str }
    ns.SettingsGuard.Restore()
    local p = VanguardDB.profiles.Saved
    ns.Theme.Settings().reduceMotion = not ns.Theme.Settings().reduceMotion
    return { format = p.format, version = p.addonVersion, display = p.display, match = ns.MatchingProfile(ns.StripPayload(select(2, ns.Serialize.Decode(str)))) }`);
  expect(restored, "the string's own keys stay out, so the same string matches the restored profile").toEqual({ match: "Saved" });
  addon.clearChat();
  addon.eval(`VanguardDB.profiles.Saved = nil
    VanguardCharDB.guard.backup = ns.Serialize.Encode("profile", { format = ns.PROFILE_FORMAT + 1, theme = {} })
    ns.SettingsGuard.Restore()`);
  expect(chatHas(addon, /The backup can't be restored: it was made by a newer version of Vanguard: update Vanguard, then import it again\.$/), "a backup from a newer Vanguard says why").toBe(true);
  expect(addon.eval("return VanguardDB.profiles.Saved == nil"), "and restores nothing").toBe(true);
  addon.eval('VanguardCharDB.guard.backup = ns.ExportProfile("theme") ns.SettingsGuard.Restore()');
  expect(chatHas(addon, /The backup can't be restored: it isn't a whole profile\.$/), "nor does a partial string").toBe(true);
});
it("settings-loss guard: the backup keeps this computer's own state (combined bags, graphics undo), which a restore brings back", () => {
  const first = loggedIn(CLICK_LUA);
  first.eval('local p = ns.Profile() p.Bags = { combined = true, applied = true, prior = "0" } p.Graphics = { undo = { graphicsQuality = "6" } }');
  const lost = relog(first, { account: "nil" });
  answer(lost, true);
  expect(lost.eval("local p = VanguardDB.profiles.Default return { p.Bags.applied, p.Bags.prior, p.Graphics.undo.graphicsQuality }"), "the restored profile has them").toEqual([true, "0", "6"]);
  lost.eval("ns.OwnValues = nil ns.SettingsGuard.lost = nil ns.SettingsGuard.Save()");
  expect(lost.eval("local _, data = ns.Serialize.Decode(VanguardCharDB.guard.backup) return data.Bags.prior"), "without Situations the backup is the profile as it is").toBe("0");
});
it("settings-loss guard: this character's file came back blank, so it uses its profile again and setup stays shut", () => {
  const first = loggedIn(CLICK_LUA, { savedVariables: "VanguardDB.profiles.Alt = {}\n" });
  first.slash("profile Alt");
  const alt = relog(first);
  const lost = relog(alt, { char: "nil" });
  expect(lost.eval("return VanguardCharDB.pendingProfile"), "the profile the account file noted is staged").toBe("Alt");
  expect(chatHas(lost, /it uses profile Alt again, after a reload\.$/), "chat says so").toBe(true);
  expect(lost.eval("return Vanguard_Reload:IsShown() and Vanguard_Reload.title:GetText()"), "and the reload is offered").toBe("This character used profile Alt. Reload the UI now to apply it?");
  expect([setupShown(lost), lost.eval("return VanguardCharDB.setupDone")], "setup isn't owed again").toEqual([false, true]);
  const def = relog(loggedIn(CLICK_LUA), { char: "nil" });
  expect([chatHas(def, /it uses profile Default again\.$/), def.eval("return Vanguard_Reload == nil")], "on the profile it loaded with, no reload is needed").toEqual([true, true]);
  const gone = relog(alt, { char: "nil", account: luaValue({ ...alt.savedVariables().account, profiles: { Default: {} } }) });
  expect([gone.eval("return VanguardCharDB.pendingProfile"), chatHas(gone, /uses profile/), setupShown(gone)], "a profile deleted since is left alone").toEqual([null, false, false]);
});
it("settings-loss guard: a first run, and files saved before the guard, fire nothing", () => {
  const first = loggedIn(CLICK_LUA, { firstRun: true });
  expect([question(first), setupShown(first)], "a first run gets setup, not a restore").toEqual([null, true]);
  const old = loggedIn(CLICK_LUA, { savedVariables: "VanguardDB = { version = 2, setupDone = true, profiles = { Default = {} } }\nVanguardCharDB = { profile = 'Default' }\n" });
  expect([question(old), chatHas(old, /didn't load/)], "files without stamps are trusted").toEqual([null, false]);
  const newChar = loggedIn(CLICK_LUA, { firstRun: true, savedVariables: "VanguardDB = { version = 2, setupDone = true, profiles = { Default = {} }, guard = { stamp = 5, chars = {} } }\n" });
  expect([chatHas(newChar, /didn't load/), setupShown(newChar)], "a new character the account file doesn't know gets setup").toEqual([false, true]);
});

// Saved data size (Core/SettingsGuard.lua) ------------------------------------------------------------

// The Lua that gives the account file three price homes (the one in use, an old one and an older one),
// each with `n` priced items, under a budget of `budget` bytes.
const crowdedLua = (budget, n) => `
  local G, ah = ns.SettingsGuard, VanguardDB.ah
  G.BUDGET = ${budget}
  ah.houses = {}
  local function home(key, t)
    local prices = {}
    for i = 1, ${n} do prices[i] = { min = i * 100, t = t, days = { [1] = i } } end
    ah.houses[key] = { prices = prices, count = ${n} }
  end
  home(ns.Home.Key(), 3000) home("Old-Alliance", 2000) home("Older-Alliance", 1000)`;
// A logged-in addon with those three homes.
function crowded(budget, n = 30) {
  const addon = loggedIn(CLICK_LUA);
  addon.eval(crowdedLua(budget, n));
  return addon;
}
// Which price homes are left, sorted.
const homes = (addon) => addon.eval("local k = {} for key in pairs(VanguardDB.ah.houses) do k[#k + 1] = key end table.sort(k) return k");

it("saved data size: the estimate counts text, ends on a loop and ignores what isn't a table", () => {
  const addon = loggedIn(CLICK_LUA);
  expect(addon.eval('return { ns.SettingsGuard.Bytes("abc"), ns.SettingsGuard.Bytes(12345), ns.SettingsGuard.Bytes(true) }'), "a string counts its quotes, a number its digits").toEqual([5, 5, 4]);
  expect(addon.eval("local t = {} t.me = t return ns.SettingsGuard.Bytes(t) > 0"), "a table that holds itself is walked once").toBe(true);
  expect(addon.eval("local G = ns.SettingsGuard return G.Bytes({ a = { 'x' } }) < G.Bytes({ a = { 'x' }, b = { 'yyyyyyyy' } })"), "more data is more bytes").toBe(true);
  expect(addon.eval("return #ns.SettingsGuard.Sizes('TEST-ONLY')"), "a damaged file has no keys").toBe(0);
  expect(addon.eval("local s = ns.SettingsGuard.Sizes({ small = {}, big = { 'xxxxxxxxxxxxxxxx' } }) return { s[1].name, s[2].name }"), "keys come largest first").toEqual(["big", "small"]);
});
it("saved data size: over its budget, the oldest price homes go first and the one in use stays", () => {
  const addon = crowded(1);
  const one = addon.eval("return ns.SettingsGuard.Bytes(VanguardDB.ah.houses['Old-Alliance'], 1)");
  addon.eval(`ns.SettingsGuard.BUDGET = ns.SettingsGuard.Bytes(VanguardDB) - ${one} / 2`);
  addon.eval("ns.SettingsGuard.Audit()");
  expect(homes(addon), "the oldest home is dropped, and that was enough").toEqual([addon.eval("return ns.Home.Key()"), "Old-Alliance"].sort());
  expect(chatHas(addon, /saved data was too large: it dropped the auction prices of 1 realm and side\(s\), oldest first/), "chat says so").toBe(true);
  expect(chatHas(addon, /still large/), "it fits now").toBe(false);
  const full = crowded(1);
  full.eval("ns.SettingsGuard.Audit()");
  expect([homes(full).length, chatHas(full, /It is still large; \/vg mem lists what holds the most/)], "a budget nothing can meet keeps the home in use and says it is still large").toEqual([1, true]);
});
it("saved data size: within the budget nothing is dropped or said, and a file with only the home in use says so", () => {
  const ok = crowded(10 * 1024 * 1024);
  ok.eval("ns.SettingsGuard.Audit()");
  expect([homes(ok).length, chatHas(ok, /too large|size budget/)], "nothing happens").toEqual([3, false]);
  const lone = loggedIn(CLICK_LUA);
  lone.eval("VanguardDB.ah = nil VanguardDB.profiles.Default.junk = string.rep('x', 400) ns.SettingsGuard.BUDGET = 100 ns.SettingsGuard.Audit()");
  expect(chatHas(lone, /over its size budget; \/vg mem lists what holds the most/), "with no price home to drop it points at /vg mem").toBe(true);
});
it("saved data size: the check runs a while after login, out of combat, and a client without timers skips it", () => {
  const addon = crowded(1);
  addon.advance(14);
  expect(homes(addon).length, "not yet").toBe(3);
  setCombat(addon, true);
  addon.advance(2);
  expect(homes(addon).length, "not in combat").toBe(3);
  setCombat(addon, false);
  expect(homes(addon).length, "right after the fight").toBe(1);
  const bare = loggedIn("C_Timer = nil");
  expect(bare.eval("return ns.SettingsGuard.Bytes(VanguardDB) > 0"), "a client without timers still logs in").toBe(true);
});
it("saved data size: SAVED_VARIABLES_TOO_LARGE for Vanguard trims to half the budget; another addon's is ignored", () => {
  const addon = crowded(1);
  addon.eval("ns.SettingsGuard.BUDGET = ns.SettingsGuard.Bytes(VanguardDB)");
  addon.fire("SAVED_VARIABLES_TOO_LARGE", "SomeOtherAddon");
  expect(homes(addon).length, "another addon's file is not ours").toBe(3);
  addon.fire("SAVED_VARIABLES_TOO_LARGE", "Vanguard");
  expect(homes(addon).length, "two homes go, to reach half the budget").toBe(1);
  expect(chatHas(addon, /The game says Vanguard's saved data is too large\. Vanguard's saved data was too large: it dropped the auction prices of 2 realm/), "and chat says what happened").toBe(true);
  const none = loggedIn(CLICK_LUA);
  none.eval("VanguardDB.ah = nil ns.SettingsGuard.BUDGET = 1")
  none.fire("SAVED_VARIABLES_TOO_LARGE", "Vanguard");
  expect(chatHas(none, /no price data left to drop/), "with nothing to drop it says so").toBe(true);
});
it("saved data size: /vg mem reports the saved files, and waits out of combat", () => {
  const addon = loggedIn(CLICK_LUA);
  addon.slash("mem");
  expect(chatHas(addon, /Saved data \(estimate\): account file [\d.]+ [KM]B of a 6\.0 MB budget; largest: \w+ /), "the account file's estimate and its largest keys").toBe(true);
  expect(chatHas(addon, /This character's file: [\d.]+ [KM]B \(/), "and this character's file").toBe(true);
  const fight = loggedIn(CLICK_LUA);
  setCombat(fight, true);
  fight.eval("ns.SettingsGuard.SizeReport()");
  expect(chatHas(fight, /Saved data sizes are read out of combat/), "in combat it waits").toBe(true);
});
