// unit frame depth (A3-1): headless-client tests for the per-frame sizes, text formats, heal prediction and status marks.

import { expect, it } from "vitest";
import { FOREVER_ENV, NO_RAID, UNITS_ENV, loggedIn, setCombat } from "./helpers.mjs";

it("a health event asks for the down state once, and a reaction colour comes back as three numbers", () => {
  const addon = loggedIn(UNITS_ENV, NO_RAID);
  const asked = addon.eval(`__n = 0 local real = UnitIsDeadOrGhost
    UnitIsDeadOrGhost = function(...) __n = __n + 1 return real(...) end
    __wfgStub.fire("UNIT_HEALTH", "target") UnitIsDeadOrGhost = real return __n`);
  expect(asked, "one DownState per health event (it was three)").toBe(1);
  const color = addon.eval(`local UF = ns.GetModule("UnitFrames") return { UF.UnitColor("target") }`);
  expect(color, "a hostile target's colour is r, g, b").toHaveLength(3);
});

// Every frame's [width, height, the width it was given, the height it was given] (TEST-ONLY read; the first two are
// rounded to whole pixels, so the tests compare the given ones).
const sizes = (addon, keys) => addon.eval(`local out = {} for _, k in ipairs({ ${keys.map((k) => `"${k}"`).join(", ")} }) do
  local f = _G["Vanguard_" .. k] out[#out + 1] = { f:GetWidth(), f:GetHeight(), f.vgWidth, f.vgHeight } end return out`);

it("frame sizes: every old fixed size is the slider's default, and a slider moves the frame without a reload", () => {
  const addon = loggedIn(UNITS_ENV, NO_RAID);
  const keys = ["player", "target", "targettarget", "focus", "pet", "party1", "party4"];
  expect(sizes(addon, keys).map((s) => s.slice(2, 4)), "the sizes the frames had before").toEqual([[240, 36], [240, 36], [120, 24], [160, 30], [120, 24], [160, 32], [160, 32]]);
  addon.eval('local get, set = ns.Options.LiveMethod("UnitFrames", "playerWidth", "ApplySizes") set(300) local _, setH = ns.Options.LiveMethod("UnitFrames", "partyHeight", "ApplySizes") setH(40)');
  expect(sizes(addon, ["player", "party1", "party4"]).map((s) => s.slice(2, 4)), "the player's width and the whole party's height follow at once").toEqual([[300, 36], [160, 40], [160, 40]]);
  expect(sizes(addon, ["player"])[0][0], "the game's own width is that, to the pixel").toBeCloseTo(300, 0);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("frame sizes: a saved number outside the range is kept inside it, a word is the default", () => {
  const addon = loggedIn(UNITS_ENV, NO_RAID);
  addon.eval('local UF = ns.GetModule("UnitFrames") UF.settings.focusWidth = 9999 UF.settings.focusHeight = 2 UF.settings.petWidth = "wide" UF.ApplySizes()');
  expect(sizes(addon, ["focus", "pet"]).map((s) => s.slice(2, 4)), "400 and 24 at most and least; the default for a word").toEqual([[400, 24], [120, 24]]);
  expect(addon.eval('return ns.GetModule("UnitFrames").FrameSize("boss1") == nil'), "the boss frames have no sliders").toBe(true);
});

it("frame sizes: a change in a fight waits for it to end, the last ask winning", () => {
  const addon = loggedIn(UNITS_ENV, NO_RAID);
  setCombat(addon, true);
  addon.eval('local UF = ns.GetModule("UnitFrames") UF.settings.targetWidth = 200 UF.ApplySizes() UF.settings.targetWidth = 220 UF.ApplySizes()');
  expect(sizes(addon, ["target"])[0].slice(2, 4), "unchanged in the fight").toEqual([240, 36]);
  setCombat(addon, false);
  expect(sizes(addon, ["target"])[0].slice(2, 4), "the last width after it").toEqual([220, 36]);
});

// The unit environment with the client's missing-health call and a percent that always says 84 (TEST-ONLY).
const TEXT_ENV = UNITS_ENV + FOREVER_ENV + `
  CurveConstants = { ScaleTo100 = { __curve = true } }
  UnitHealthPercent = function() return 84 end
  UnitHealthMissing = function(unit)
    local h, m = __units[unit].hp, __units[unit].maxhp
    if issecretvalue(h) or issecretvalue(m) then return { __secret = true } end
    return m - h
  end
`;

// The health text, and the power text, of a frame after `setup` (a format picked), as plain text, "secret" or "-" for none.
const texts = (addon, setup, key = "player") => addon.eval(`local UF = ns.GetModule("UnitFrames") ${setup} UF.Refresh()
  local f = _G["Vanguard_${key}"]
  local function show(t) if type(t) == "table" and t.__secret then return "secret" end return t or "-" end
  return { show(f.healthText:GetText()), show(f.powerText:GetText()), f.powerText:IsShown() }`);

it("text formats: value, percent, both and deficit, in plain text", () => {
  const addon = loggedIn(TEXT_ENV, NO_RAID);
  // The player's health text in a format.
  const health = (format) => texts(addon, `UF.settings.healthFormat = "${format}"`)[0];
  expect([health("value"), health("percent"), health("both"), health("deficit")], "player health 900 of 1000").toEqual(["900", "84%", "900  84%", "-100"]);
  addon.eval("__units.player.hp = 1000");
  expect(health("deficit"), "nothing missing says nothing").toBe("");
  expect(health("nonsense"), "a format no release knows reads as the value").toBe("1000");
});

it("text formats: hidden values go to the text whole, never joined or computed on", () => {
  const addon = loggedIn(TEXT_ENV, NO_RAID);
  // The target's (hidden) health text in a format.
  const health = (format) => texts(addon, `UF.settings.healthFormat = "${format}"`, "target")[0];
  expect([health("value"), health("deficit")], "a hidden value and a hidden deficit show as the client formats them").toEqual(["secret", "secret"]);
  expect(health("both"), "both falls back to the percent alone").toBe("84%");
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("power text: off by default; value, percent, both and deficit when picked, empty for the dead", () => {
  const addon = loggedIn(TEXT_ENV, NO_RAID);
  // The player's texts with the power format picked.
  const power = (format) => texts(addon, `UF.settings.powerFormat = "${format}" UF.ApplyPowerText()`);
  expect(power("none"), "no power text, hidden").toEqual(["84%", "-", false]);
  expect([power("value")[1], power("percent")[1], power("both")[1], power("deficit")[1]], "50 of 100").toEqual(["50", "50%", "50  50%", "-50"]);
  expect(power("value")[2], "shown on a 36 tall frame").toBe(true);
  expect(texts(addon, 'UF.settings.powerFormat = "value" UF.ApplyPowerText() ns.GetModule("UnitFrames").frames.party1.vgDown = nil', "party1")[1], "an empty bar has no power").toBe("");
});

it("power text: hidden power falls back to the value; a frame too short for two lines shows none", () => {
  const addon = loggedIn(TEXT_ENV, NO_RAID);
  addon.eval('__units.player.power = { __secret = true }');
  expect(texts(addon, 'UF.settings.powerFormat = "percent" UF.ApplyPowerText()')[1], "a hidden amount: the client's own value text").toBe("secret");
  expect(texts(addon, 'UF.settings.playerHeight = 24 UF.ApplySizes()')[2], "24 tall: no room under the health text").toBe(false);
});

it("power text: sits under the health text, and mid-bar on a frame drawn bare", () => {
  const addon = loggedIn(TEXT_ENV, NO_RAID);
  texts(addon, 'UF.settings.powerFormat = "value" UF.ApplyPowerText()');
  // Where the health text and the power text anchor on the player frame.
  const points = () => addon.eval("return { (Vanguard_player.healthText:GetPoint()), (Vanguard_player.powerText:GetPoint()) }");
  const roomy = points();
  expect(roomy[0].startsWith("TOP") && roomy[1].startsWith("BOTTOM"), "health text on the top line, power text on the bottom").toBe(true);
  addon.eval('ns.Theme.Settings().hudLook = "hairline" ns.Theme.Refresh()');
  expect(points(), "bare: the health text is in the name row, the power text mid-bar").toEqual([expect.stringMatching(/^(LEFT|RIGHT)$/), expect.stringMatching(/^(LEFT|RIGHT)$/)]);
});

// The unit environment with amounts on their way and soaked, the target's hidden (TEST-ONLY).
const PREDICTION_ENV = UNITS_ENV + `
  __units.player.incoming, __units.player.absorb = 200, 150
  __units.target.incoming, __units.target.absorb = { __secret = true }, { __secret = true }
  UnitGetIncomingHeals = function(unit) return __units[unit].incoming end
  UnitGetTotalAbsorbs = function(unit) return __units[unit].absorb end
`;

// A frame's heal and shield bars: shown, value, maximum, the side they fill from, and whether the first is hidden or secret.
const bars = (addon, key) => addon.eval(`local f = _G["Vanguard_${key}"]
  local function v(x) if type(x) == "table" and x.__secret then return "secret" end return x end
  return { f.heal:IsShown(), v(f.heal:GetValue()), v(select(2, f.heal:GetMinMaxValues())), f.shield:IsShown(), v(f.shield:GetValue()), f.heal.__reverse == f.health.__reverse }`);

it("heal prediction and shields: bars on the player, target and party frames from the raid frames' calculator", () => {
  const addon = loggedIn(PREDICTION_ENV, NO_RAID);
  expect(bars(addon, "player"), "200 on its way and 150 soaked, against the health maximum").toEqual([true, 200, 1000, true, 150, true]);
  expect(bars(addon, "target").slice(0, 5), "hidden amounts go to the bars whole").toEqual([true, "secret", "secret", true, "secret"]);
  expect(addon.eval("return { Vanguard_pet.heal == nil, Vanguard_focus.heal == nil, Vanguard_party1.heal ~= nil }"), "not on the pet and focus frames").toEqual([true, true, true]);
  addon.eval("__units.player.incoming = 300");
  addon.fire("UNIT_HEAL_PREDICTION", "player");
  expect(bars(addon, "player")[1], "its own event repaints").toBe(300);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("heal prediction and shields: each has a switch that applies at once, and the bars follow the fill's side", () => {
  const addon = loggedIn(PREDICTION_ENV, NO_RAID);
  addon.eval('local _, set = ns.Options.LiveMethod("UnitFrames", "healPrediction", "ApplyPrediction") set(false)');
  expect(bars(addon, "player").slice(0, 5), "heals off: hidden and empty; the shield still shows").toEqual([false, 0, 1000, true, 150]);
  addon.eval('local _, set = ns.Options.LiveMethod("UnitFrames", "absorbs", "ApplyPrediction") set(false)');
  expect(bars(addon, "player")[3], "shields off").toBe(false);
  addon.eval('ns.Theme.Settings().hudLook = "plain" ns.Theme.Refresh()');
  expect(bars(addon, "target")[5] && bars(addon, "player")[5], "the Plain look: the bars fill the way the health does").toBe(true);
});

// The unit environment with the calls the status marks read (TEST-ONLY): you lead and rest, a party member tanks and is flagged.
const STATUS_ENV = UNITS_ENV + `
  __units.player.leader, __units.party1.role, __units.party1.pvp = true, "TANK", true
  __rest = true
  IsResting = function() return __rest end
  UnitIsGroupLeader = function(unit) return __units[unit].leader == true end
  UnitGroupRolesAssigned = function(unit) return __units[unit].role or "NONE" end
  UnitIsPVP = function(unit) return __units[unit].pvp == true end
`;

// Which marks show on a frame, in the order they read: [leader, role, rest, pvp] as 1 or 0, and the first shown mark's anchor point.
const marks = (addon, key) => addon.eval(`local row = _G["Vanguard_${key}"].status
  local out = {} for i, n in ipairs({ "leader", "role", "rest", "pvp" }) do out[i] = row[n]:IsShown() and 1 or 0 end
  out[5] = (row.leader:IsShown() and row.leader or row.role:IsShown() and row.role or row.rest):GetPoint() return out`);

it("status marks: leader, role, resting and PvP over the frame's outer corner", () => {
  const addon = loggedIn(STATUS_ENV, NO_RAID);
  expect(marks(addon, "player").slice(0, 4), "you lead and rest; no role, not flagged").toEqual([1, 0, 1, 0]);
  expect(marks(addon, "party1").slice(0, 4), "a tank, flagged, not leading, never resting").toEqual([0, 1, 0, 1]);
  expect(marks(addon, "player")[4], "from the outer top corner of the player frame (its left)").toBe("BOTTOMLEFT");
  addon.eval("__rest = false __units.player.leader = false");
  addon.fire("PLAYER_UPDATE_RESTING");
  expect(marks(addon, "player").slice(0, 4), "the events repaint").toEqual([0, 0, 0, 0]);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("status marks: the switch takes them away at once, and a hidden answer shows nothing", () => {
  const addon = loggedIn(STATUS_ENV, NO_RAID);
  addon.eval('UnitIsGroupLeader = function() return { __secret = true } end');
  addon.fire("PARTY_LEADER_CHANGED");
  expect(marks(addon, "player").slice(0, 4), "a hidden leader answer is no mark").toEqual([0, 0, 1, 0]);
  addon.eval('local _, set = ns.Options.LiveMethod("UnitFrames", "statusMarks", "ApplyStatus") set(false)');
  expect(marks(addon, "player").slice(0, 4), "switched off").toEqual([0, 0, 0, 0]);
});

it("status marks: they follow a name tab, and wait for the fight to end to move", () => {
  const addon = loggedIn(STATUS_ENV, NO_RAID);
  addon.eval('ns.Theme.Settings().hudLook = "tabs" ns.Theme.Refresh()');
  expect(addon.eval('return select(2, Vanguard_player.status.leader:GetPoint()) == Vanguard_player.tab'), "over the tab under the Tabs look").toBe(true);
  setCombat(addon, true);
  addon.eval("__rest = false __units.player.leader = false");
  addon.fire("PLAYER_UPDATE_RESTING");
  expect(marks(addon, "player").slice(0, 4), "the marks go at once even in a fight").toEqual([0, 0, 0, 0]);
  setCombat(addon, false);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});
