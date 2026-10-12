// situations: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Modules/Situations.lua: a different layout and settings for solo, party, raid,
// PvP, instance and resting, recorded with the frames' and settings' own
// controls and applied out of combat as you move between situations.

import { expect, it } from "vitest";
import { CLICK_LUA, chatHas, loggedIn, setCombat } from "./helpers.mjs";

// TEST-ONLY instance and resting state, set by the cases.
const SIT_ENV = `
  __inside, __kind, __resting = false, "none", false
  IsInInstance = function() return __inside, __kind end
  IsResting = function() return __resting end
`;

// TEST-ONLY saved profile: Default's raid override moves and shrinks the info
// strip, turns its DPS block on, and holds two keys no override may set.
const RAID_OVERRIDE = `{ positions = { infostrip = { point = "TOP", relPoint = "TOP", x = 0, y = -60, scale = 0.8 } },
  settings = { InfoStrip = { dps = true }, Nameplates = { width = 300, castBar = false } } }`;

// Saved variables whose profile `name` (Default unless given) has the raid override; more Lua after it.
const saved = (more = "", name = "Default") =>
  `VanguardDB = { version = 2, setupDone = true, profiles = { ${name} = { Situations = { overrides = { raid = ${RAID_OVERRIDE} } } } } }\n${more}`;

// A logged-in addon with SIT_ENV, the click helper and saved variables; the first apply has run.
function situated(savedVariables = "", extra = "") {
  const addon = loggedIn(SIT_ENV + CLICK_LUA + extra, { savedVariables });
  addon.advance(0.5);
  return addon;
}

// Joins (or leaves) a raid: GROUP_ROSTER_UPDATE, then the next frames.
function raid(addon, on = true) {
  if (on) addon.world.setUnit("raid1", { name: "TEST-ONLY Ally" });
  else addon.world.removeUnit("raid1");
  addon.advance(0.5);
}

// The info strip mover's [point, relPoint, x, y].
const spot = (addon) => addon.eval("return { ns.MoverPoint('infostrip') }");
// The info strip's saved entry in the active profile's positions (null when it has none).
const savedSpot = (addon) => addon.eval("return ns.Settings('positions').infostrip");
// The info strip's own DPS setting, as the module reads it.
const dps = (addon) => addon.eval("return ns.GetModule('InfoStrip').settings.dps");
// The raid override's only setting, as [module, key, value] (nil when it has another).
const ONLY_SETTING = `local settings, out = ns.Settings('Situations').overrides.raid.settings, nil
  for module, values in pairs(settings) do for key, v in pairs(values) do if out then return nil end out = { module, key, v } end end
  return out`;
// The default spot of the info strip.
const HOME = ["TOPRIGHT", "TOPRIGHT", -12, -200];

it("situations: joining a raid applies its override; leaving puts the base back without saving the override", () => {
  const addon = situated(saved());
  expect(spot(addon), "solo: the info strip at its default spot").toEqual(HOME);
  raid(addon);
  expect(spot(addon), "in a raid: the raid's spot").toEqual(["TOP", "TOP", 0, -60]);
  expect(addon.eval("return Vanguard_InfoStrip:GetScale()"), "and its scale").toBe(0.8);
  expect(dps(addon), "the DPS block switched on").toBe(true);
  expect(addon.eval("return ns.GetModule('InfoStrip').texts.dps ~= nil"), "the strip repainted its blocks").toBe(true);
  expect(addon.eval("return { ns.GetModule('Nameplates').settings.width, ns.GetModule('Nameplates').settings.castBar }"), "keys outside the allowlist are not applied").toEqual([130, true]);
  raid(addon, false);
  expect(spot(addon), "out of the raid: back at the default spot").toEqual(HOME);
  expect(addon.eval("return Vanguard_InfoStrip:GetScale()"), "at its own scale").toBe(1);
  expect([savedSpot(addon), dps(addon)], "the profile holds its own values, not the override's").toEqual([null, false]);
  expect(addon.eval("return ns.Settings('Situations').overrides.raid.positions.infostrip.point"), "the override is kept for next time").toBe("TOP");
});

it("situations: the profile on disk never holds an override (logout puts the base back first)", () => {
  const addon = situated(saved());
  raid(addon);
  expect(savedSpot(addon), "while the override is on, the mover's setter holds its spot").toMatchObject({ point: "TOP", scale: 0.8 });
  addon.fire("PLAYER_LOGOUT");
  const profile = addon.eval("return VanguardDB.profiles.Default");
  expect([profile.positions.infostrip ?? null, profile.InfoStrip.dps], "at logout the profile gets its own values back").toEqual([null, false]);
  expect(profile.Situations.overrides.raid.settings.InfoStrip.dps, "with the override still saved as an override").toBe(true);
});

it("situations: an export made while an override is on carries the profile's own values", () => {
  const addon = situated(saved());
  raid(addon);
  // The export of scope, decoded: [its info strip spot's point or false, the DPS setting, the override's DPS].
  const exported = (scope) => addon.eval(`local _, data = ns.Serialize.Decode(ns.ExportProfile(${scope}))
    local positions, strip = data.positions or data, data.InfoStrip or {}
    return { positions.infostrip and positions.infostrip.point or false, strip.dps == true, data.Situations and data.Situations.overrides.raid.settings.InfoStrip.dps or false }`);
  expect(exported("nil"), "the whole profile: its own spot and setting, the override kept as an override").toEqual([false, false, true]);
  expect(exported("'positions'")[0], "one module's settings too").toBe(false);
  expect([spot(addon), savedSpot(addon).point, dps(addon)], "the override is still on afterwards").toEqual([["TOP", "TOP", 0, -60], "TOP", true]);
  expect(addon.eval("return select('#', ns.ExportProfile('nosuch'))"), "a refusal still says why").toBe(2);
  addon.eval("ns.OwnValues = nil");
  expect(exported("'positions'")[0], "without Situations the tables are exported as they are").toBe("TOP");
});

it("situations: which situation holds, the first of pvp, instance, raid, party, resting, solo", () => {
  const addon = situated();
  // SI.Where() after setting the instance type and resting.
  const where = (inside, kind, resting) => addon.eval(`__inside, __kind, __resting = ${inside}, "${kind}", ${resting} return ns.GetModule("Situations").Where()`);
  expect(where(false, "none", false), "nothing: solo").toBe("solo");
  expect(where(false, "none", true), "in a city: resting").toBe("resting");
  addon.world.setUnit("party1", { name: "TEST-ONLY Friend" });
  expect(where(false, "none", true), "a party beats resting").toBe("party");
  addon.world.setUnit("raid1", { name: "TEST-ONLY Ally" });
  expect(where(false, "none", true), "a raid beats a party and resting").toBe("raid");
  expect(where(true, "party", true), "a dungeon: instance").toBe("instance");
  expect(where(true, "raid", true), "a raid instance: instance").toBe("instance");
  expect(where(true, "pvp", true), "a battleground beats the raid group and resting").toBe("pvp");
  expect(where(true, "arena", false), "an arena: pvp").toBe("pvp");
  expect(where(true, "scenario", false), "another instance type counts as the group you're in").toBe("raid");
  expect(addon.eval("IsInInstance, IsResting, IsInRaid, IsInGroup = nil, nil, nil, nil return ns.GetModule('Situations').Where()"), "a client that can't say: solo").toBe("solo");
});

it("situations: recording keeps only what the player changed, with the frames' and settings' own controls", () => {
  const addon = situated();
  addon.slash("situation record raid");
  expect(chatHas(addon, /Recording for Raid/), "recording starts").toBe(true);
  addon.slash("unlock");
  addon.eval(`function __handle(k) for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == k then return w end end end`);
  expect(addon.eval("return __handle('infostrip').label:GetText()"), "the handles say what's being recorded").toBe("Info strip · recording Raid");
  addon.eval("local h = __handle('infostrip') h.__left, h.__bottom = 700, 600 h:GetScript('OnDragStop')(h)");
  addon.eval("ns.SetMoverAlpha('infostrip', 0.66)");
  const dropped = savedSpot(addon);
  addon.slash("");
  addon.eval('__click("Bars, map, chat") __click("Your DPS in the last fight")');
  addon.eval('__click("Nameplates") __click("Cast bar")');
  expect(dps(addon), "the strip's own option switched the block on").toBe(true);
  addon.slash("situation stop");
  expect(addon.eval("return ns.Settings('Situations').overrides.raid.positions"), "the override: the dragged spot exactly as the drop saved it").toEqual({ infostrip: dropped });
  expect(addon.eval(ONLY_SETTING), "and the one allowlisted setting").toEqual(["InfoStrip", "dps", true]);
  expect(dropped.alpha, "with the opacity set while recording").toBe(0.66);
  expect(chatHas(addon, /Raid: 2 overrides \(1 frame, info strip\) saved\.$/), "stopping says what was kept").toBe(true);
  expect([spot(addon), savedSpot(addon), dps(addon)], "solo again: the base is back, and the profile holds it").toEqual([HOME, null, false]);
  expect(addon.eval("return ns.GetModule('Nameplates').settings.castBar"), "a setting outside the allowlist stays the player's own change").toBe(false);
  expect(addon.eval("return __handle('infostrip').label:GetText()"), "the handles' labels lose the suffix").toBe("Info strip");
  raid(addon);
  expect([spot(addon)[0], dps(addon), addon.eval("return Vanguard_InfoStrip:GetAlpha()")], "joining a raid applies the recording").toEqual([dropped.point, true, 0.66]);
});

it("situations: recording over an override starts from it; nothing changed clears it; refusals", () => {
  const addon = situated(saved());
  raid(addon);
  addon.slash("situation record raid");
  expect(spot(addon), "recording the active situation shows its override").toEqual(["TOP", "TOP", 0, -60]);
  addon.eval("ns.ResetMovers('infostrip')");
  addon.slash("situation record solo");
  expect(addon.eval("return ns.Settings('Situations').overrides.raid.positions"), "a frame put back at its base spot is no longer overridden").toBe(null);
  expect(addon.eval(ONLY_SETTING), "the setting it showed is kept").toEqual(["InfoStrip", "dps", true]);
  expect(addon.eval("return ns.GetModule('Situations').recording"), "recording another situation stops the first").toBe("solo");
  addon.slash("situation stop");
  expect(addon.eval("return ns.Settings('Situations').overrides.solo"), "a recording with no change keeps no override").toBe(null);
  expect(chatHas(addon, /Solo: no overrides saved\.$/), "and says so").toBe(true);
  addon.slash("situation stop");
  expect(chatHas(addon, /Not recording\.$/), "stop without a recording").toBe(true);
  addon.slash("situation record moon");
  expect(chatHas(addon, /Situations: solo, party, raid, pvp, instance or resting\.$/), "an unknown situation").toBe(true);
  setCombat(addon, true);
  addon.slash("situation record raid");
  expect([chatHas(addon, /Recording waits until combat ends\.$/), addon.eval("return ns.GetModule('Situations').recording")], "refused in combat").toEqual([true, null]);
});

it("situations: in combat the apply waits for combat to end", () => {
  const addon = situated(saved());
  setCombat(addon, true);
  raid(addon);
  expect(spot(addon), "joined mid-fight: nothing moves yet").toEqual(HOME);
  setCombat(addon, false);
  expect(spot(addon), "after the fight the override applies").toEqual(["TOP", "TOP", 0, -60]);
});

it("situations: a profile change puts the base back into its tables, forgets it and applies the new profile's override", () => {
  const other = `VanguardDB.profiles.Other = { Situations = { overrides = { raid = { positions = { infostrip = { point = "CENTER", relPoint = "CENTER", x = 10, y = 20 } }, settings = { MenuStrip = { menu = "hidden" } } } } } }`;
  const addon = situated(saved(other));
  raid(addon);
  addon.eval("__oldPositions, __oldStrip = ns.Settings('positions'), ns.Settings('InfoStrip')");
  addon.eval("ns.CopyProfile('Other')");
  addon.advance(0.5);
  expect(addon.eval("return { __oldPositions.infostrip == nil, __oldStrip.dps }"), "the old tables got their own values back").toEqual([true, false]);
  expect(spot(addon), "the new profile's raid override applies").toEqual(["CENTER", "CENTER", 10, 20]);
  expect(addon.eval("return ns.Settings('MenuStrip').menu"), "with its settings").toBe("hidden");
  raid(addon, false);
  expect([spot(addon), savedSpot(addon)], "leaving restores the new profile's base").toEqual([HOME, null]);
  expect(addon.eval("return ns.Settings('MenuStrip').menu"), "its menu setting too").toBe("always");
});

it("situations: the same tables told of a change get their base back and the override again", () => {
  const addon = situated(saved());
  raid(addon);
  addon.slash("situation record party");
  addon.eval("ns.SetMoverPoint('infostrip', 'LEFT', 'LEFT', 5, 5) ns.ProfileChanged()");
  addon.advance(0.5);
  expect(addon.eval("return ns.GetModule('Situations').recording"), "a recording stops unsaved").toBe(null);
  expect(addon.eval("return ns.Settings('Situations').overrides.party"), "nothing saved for it").toBe(null);
  expect([spot(addon), dps(addon)], "the raid's override is on again").toEqual([["TOP", "TOP", 0, -60], true]);
  raid(addon, false);
  expect([spot(addon), dps(addon)], "and comes off when you leave").toEqual([HOME, false]);
});

it("situations: the staged profile switch applies the other profile's override at the next login", () => {
  const addon = situated(saved(`VanguardDB.profiles.Other = {}`));
  raid(addon);
  addon.slash("profile Other");
  expect(spot(addon), "a staged switch changes nothing until the reload").toEqual(["TOP", "TOP", 0, -60]);
  addon.fire("PLAYER_LOGOUT");
  expect(addon.eval("return { VanguardDB.profiles.Default.positions.infostrip == nil, VanguardCharDB.pendingProfile }"), "Default is saved with its own spot; Other waits").toEqual([true, "Other"]);
  const next = situated(saved(`VanguardCharDB = { profile = "Default", pendingProfile = "Other" }`, "Other"), "__wfgWorld.units.raid1 = { name = 'TEST-ONLY Ally' }");
  expect([next.eval("return ns.ProfileName()"), spot(next)], "the next login: Other, in a raid, with its override").toEqual(["Other", ["TOP", "TOP", 0, -60]]);
});

it("situations: a frame reset to its default while recording is overridden back to the default", () => {
  const addon = situated(`VanguardDB = { version = 2, setupDone = true, profiles = { Default = { positions = { infostrip = { point = "LEFT", relPoint = "LEFT", x = 20, y = 0 } } } } }`);
  addon.slash("situation record raid");
  addon.slash("reset infostrip");
  addon.slash("situation stop");
  expect(addon.eval("return next(ns.Settings('Situations').overrides.raid.positions.infostrip) == nil"), "the override says: at the default").toBe(true);
  expect(spot(addon), "solo: the player's own spot").toEqual(["LEFT", "LEFT", 20, 0]);
  raid(addon);
  expect(spot(addon), "in a raid: the default").toEqual(HOME);
  raid(addon, false);
  expect([spot(addon), savedSpot(addon)], "and the player's spot comes back, saved as it was").toEqual([["LEFT", "LEFT", 20, 0], { point: "LEFT", relPoint: "LEFT", x: 20, y: 0 }]);
});

it("situations: a frame's links (anchored to another frame, matched sizes, its own size) are recorded and applied", () => {
  const addon = situated();
  // The XP bar's link and width, and the reputation bar's height: [anchored to, side, x, y, matched width, xp width, rep height].
  const links = () => addon.eval(`local to, side, x, y = ns.MoverAnchor("xpbar")
    return { to or "none", side or "none", x or 0, y or 0, ns.MoverMatch("xpbar", "width") or "none", Vanguard_xpbar:GetWidth(), Vanguard_repbar:GetHeight() }`);
  const own = links();
  addon.slash("situation record raid");
  addon.eval("ns.SetMoverAnchor('xpbar', 'infostrip', 'BOTTOM', 0, -6) ns.SetMoverMatch('xpbar', 'width', 'infostrip') ns.SetMoverSize('repbar', 'height', 12)");
  const recorded = addon.eval("local p = ns.Settings('positions') return { xpbar = p.xpbar, repbar = p.repbar }");
  const linked = links();
  expect(linked.slice(0, 5), "while recording: the XP bar under the info strip, as wide as it").toEqual(["infostrip", "BOTTOM", 0, -6, "infostrip"]);
  addon.slash("situation stop");
  expect(addon.eval("return ns.Settings('Situations').overrides.raid.positions"), "the override holds each frame's links with its spot").toEqual(recorded);
  expect(links(), "solo: the bars as they were").toEqual(own);
  raid(addon);
  expect(links(), "in a raid: anchored, matched and sized again").toEqual(linked);
  raid(addon, false);
  expect([links(), addon.eval("return ns.Settings('positions').xpbar == nil")], "out of it: the player's own layout, with nothing linked in the profile").toEqual([own, true]);
});

it("situations: a recording in progress at logout is saved, and the profile keeps its base", () => {
  const addon = situated();
  addon.slash("situation record raid");
  addon.eval("ns.SetMoverScale('infostrip', 1.25)");
  addon.fire("PLAYER_LOGOUT");
  expect(addon.eval("return { next(VanguardDB.profiles.Default.positions.infostrip or {}) == nil, ns.Settings('Situations').overrides.raid.positions.infostrip.scale }"), "the scale is the override's, not the profile's").toEqual([true, 1.25]);
});

it("situations: switched off, clearing, unknown frames and modules that aren't running", () => {
  const extra = `VanguardDB.profiles.Default.modules = { DataBars = false }
    VanguardDB.profiles.Default.Situations.overrides.party = { positions = { nosuch = { point = "TOP" } }, settings = { DataBars = { visibility = "hidden" }, Chat = { background = false } } }`;
  const addon = situated(saved(extra));
  addon.world.setUnit("party1", { name: "TEST-ONLY Friend" });
  addon.advance(0.5);
  expect(addon.eval("return { ns.GetModule('Situations').applied, ns.Settings('DataBars').visibility == nil, ns.Settings('Chat').background }"), "a frame not on screen and a module not running are skipped").toEqual(["party", true, true]);
  addon.slash("situation clear");
  expect([addon.eval("return ns.Settings('Situations').overrides.party"), chatHas(addon, /Cleared the overrides for Party\.$/)], "/vg situation clear: the active one").toEqual([null, true]);
  addon.slash("situation clear moon");
  expect(chatHas(addon, /Situations: solo, party/), "an unknown one").toBe(true);
  addon.world.removeUnit("party1");
  addon.eval("ns.Settings('Situations').enabled = false");
  raid(addon);
  expect(spot(addon), "switched off: no override").toEqual(HOME);
});

it("situations: /vg situation list prints where you are and every override", () => {
  const addon = situated(saved());
  addon.slash("situation list");
  expect(chatHas(addon, /Now: Solo · no overrides$/), "where you are").toBe(true);
  expect(chatHas(addon, /Raid: 2 overrides \(1 frame, info strip\)$/), "the raid's override, counting only what it may set").toBe(true);
  addon.slash("situation");
  addon.slash("situation dance");
  expect(chatHas(addon, /Usage: \/vg situation/), "anything else: usage").toBe(true);
  addon.slash("help");
  expect(chatHas(addon, /situation \[record/), "the help lists it").toBe(true);
});

it("situations: the options page records, stops, clears and switches overrides off", () => {
  const addon = situated(saved());
  raid(addon);
  addon.slash("");
  addon.eval('__click("Situations")');
  expect(addon.texts("Now: Raid · 2 overrides (1 frame, info strip)").length, "the page says where you are and what applies").toBe(1);
  // Stop recording and save: whether it can be clicked, and how opaque it is.
  const stopButton = () => {
    const b = addon.frames('w.text ~= nil and w.text.__text == "Stop recording and save"')[0];
    return [b.enabled, b.alpha];
  };
  expect(stopButton(), "Record for is Off: Stop recording and save is greyed out").toEqual([false, 0.5]);
  addon.eval('__click("Record for")');
  expect(addon.eval("return ns.GetModule('Situations').recording"), "Record for: the next choice, Solo").toBe("solo");
  expect(addon.find("^Recording for Solo") !== null, "the status line says so").toBe(true);
  expect(stopButton(), "recording: it can be clicked").toEqual([true, 1]);
  addon.eval('__click("Record for")');
  addon.eval("ns.SetMoverPoint('infostrip', 'BOTTOM', 'BOTTOM', 0, 300)");
  addon.eval('__click("Stop recording and save")');
  expect(addon.eval("return ns.Settings('Situations').overrides.party.positions.infostrip.point"), "the party's override is saved").toBe("BOTTOM");
  expect(stopButton(), "stopped: greyed out again").toEqual([false, 0.5]);
  addon.eval('__click("Clear the active")');
  expect([addon.eval("return ns.Settings('Situations').overrides.raid"), spot(addon)], "the raid's override is gone and so is its spot").toEqual([null, HOME]);
  addon.eval('__click("Apply situation overrides")');
  addon.advance(0.5);
  expect([addon.eval("return ns.Settings('Situations').enabled"), addon.texts("Now: Raid · no overrides").length], "switched off from the page").toEqual([false, 1]);
  for (let i = 0; i < 6; i++) addon.eval('__click("Record for")');
  expect(addon.eval("return ns.GetModule('Situations').recording"), "the choices run to Resting").toBe("resting");
  addon.eval('__click("Record for")');
  expect(addon.eval("return ns.GetModule('Situations').recording"), "then Off, which stops recording").toBe(null);
});

// TEST-ONLY: __row(text) is the shown options row whose caption starts with text; __point(text) keeps it in __hovered.
const ROW_LUA = `
  function __row(text)
    for _, w in ipairs(__wfgStub.frames) do
      local fs, shown, f = w.label, true, w
      while f do if not f.__shown then shown = false end f = f.__parent end
      if shown and type(fs) == "table" and type(fs.__text) == "string" and fs.__text:sub(1, #text) == text and w.__scripts.OnClick then return w end
    end
  end
  function __point(text) __hovered = __row(text) end
`;
// The banner's text while recording for Raid.
const RAID_BANNER = "Editing as: Raid · changes apply only in Raid";
// What a setting an override can't hold says while recording for Raid.
const NOT_RECORDED = "Not recorded for Raid: this setting changes your base profile.";
// The banner strips: the one over the options window and the one on the screen.
const OPTIONS_STRIP = "ns.GetModule('Situations').Banner.options";
const SCREEN_STRIP = "ns.GetModule('Situations').Banner.screen";
// Whether a banner strip is on screen (false while it hasn't been made).
const stripShown = (addon, ref) => addon.eval(`local f = ${ref} return f ~= nil and f:IsVisible()`);

it("situations: while recording, a banner over the options window and the unlocked screen says what you're editing", () => {
  const addon = situated();
  addon.slash("situation record raid");
  addon.slash("");
  expect(addon.texts(RAID_BANNER).length, "recording, with the options open: the banner over the window").toBe(1);
  const window = addon.frame("Vanguard_Options").rect;
  const options = addon.frame(OPTIONS_STRIP).rect;
  expect([options.bottom >= window.top, options.left, options.right], "along the window's top edge, as wide as it").toEqual([true, window.left, window.right]);
  expect(addon.eval(`return ${OPTIONS_STRIP}.button.text:GetText()`), "its button stops and saves").toBe("Stop and save");
  addon.slash("unlock");
  const screen = addon.frame(SCREEN_STRIP).rect;
  expect([addon.texts(RAID_BANNER).length, (screen.left + screen.right) / 2, screen.top], "unlocked: a second banner at the top center of the screen").toEqual([2, 960, 1072]);
  expect(screen.width > RAID_BANNER.length * 6, "wide enough for its text and button").toBe(true);
  addon.eval("ns.SetMoverPoint('infostrip', 'BOTTOM', 'BOTTOM', 0, 300)");
  addon.click(SCREEN_STRIP + ".button");
  expect(addon.eval("return ns.GetModule('Situations').recording"), "the button ends the edit").toBe(null);
  expect(chatHas(addon, /Raid: 1 override \(1 frame\) saved\.$/), "the recording is saved, and the chat says what was kept").toBe(true);
  expect([spot(addon), addon.texts(RAID_BANNER).length], "back on the base profile; both banners gone").toEqual([HOME, 0]);
  expect(addon.eval("return ns.Unlocked()"), "the frames stay unlocked").toBe(true);
  addon.slash("situation record party");
  expect(addon.texts("Editing as: Party · changes apply only in Party").length, "another recording: both banners name it").toBe(2);
  addon.click(OPTIONS_STRIP + ".button");
  expect([addon.eval("return ns.GetModule('Situations').recording"), stripShown(addon, SCREEN_STRIP)], "the window's button ends it too").toEqual([null, false]);
});

it("situations: the banner clears when the frames lock (by hand or for combat), on a profile change and at logout", () => {
  const addon = situated();
  addon.slash("situation record raid");
  addon.slash("unlock");
  expect([stripShown(addon, SCREEN_STRIP), stripShown(addon, OPTIONS_STRIP)], "unlocked, options never opened: only the screen banner").toEqual([true, false]);
  addon.world.combat(true);
  expect(stripShown(addon, SCREEN_STRIP), "combat locks the handles, and the banner goes with them").toBe(false);
  addon.click(SCREEN_STRIP + ".button");
  expect(addon.eval("return ns.GetModule('Situations').recording"), "a click in combat waits for combat to end").toBe("raid");
  addon.world.combat(false);
  expect(addon.eval("return ns.GetModule('Situations').recording"), "then stops and saves").toBe(null);
  addon.slash("situation record raid");
  addon.slash("unlock");
  addon.slash("lock");
  expect(stripShown(addon, SCREEN_STRIP), "/vg lock clears it").toBe(false);
  addon.slash("");
  expect(stripShown(addon, OPTIONS_STRIP), "opening the options while recording shows the window's banner").toBe(true);
  addon.eval("ns.ProfileChanged()");
  expect(stripShown(addon, OPTIONS_STRIP), "a profile change stops the recording, and the banner").toBe(false);
  addon.slash("situation record raid");
  addon.fire("PLAYER_LOGOUT");
  expect([stripShown(addon, OPTIONS_STRIP), addon.eval("return ns.GetModule('Situations').recording")], "logout saves the recording and clears the banner").toEqual([false, null]);
});

it("situations: while recording, a setting an override can't hold is dimmed and says so when you point at it", () => {
  const addon = situated("", ROW_LUA);
  // The tooltip's first line while it shows, else false.
  const tip = () => addon.eval("return GameTooltip ~= nil and GameTooltip:IsShown() and GameTooltip.__lines[1].text or false");
  // Points at a row, then away: [the tooltip it showed, whether its caption is muted].
  const point = (caption) => {
    addon.eval(`__point(${JSON.stringify(caption)})`);
    addon.hover("__hovered");
    const muted = JSON.stringify(addon.frame("__hovered.label").textColor) === JSON.stringify(addon.eval("return { ns.Theme.RGB('muted') }"));
    const out = [tip(), muted];
    addon.hover(null);
    return out;
  };
  addon.slash("");
  expect(point("Soft shadows under frames"), "not recording: no note").toEqual([false, false]);
  addon.slash("situation record raid");
  expect(point("Soft shadows under frames"), "recording: a theme setting changes the base profile").toEqual([NOT_RECORDED, true]);
  expect(tip(), "the note goes when the mouse leaves").toBe(false);
  addon.eval('__click("Nameplates")');
  expect(point("Cast bar"), "a nameplate setting outside the allowlist").toEqual([NOT_RECORDED, true]);
  expect(point("Threat colors while you have aggro"), "one an override holds: no note").toEqual([false, false]);
  addon.eval('__click("Bars, map, chat")');
  expect(point("Experience bar"), "the XP bars' parts need a reload").toEqual([NOT_RECORDED, true]);
  expect(point("XP and reputation bars"), "their visibility is held").toEqual([false, false]);
  expect(point("Durability"), "so are the info strip's blocks").toEqual([false, false]);
  addon.eval('__click("Action bars")');
  expect(point("Show bar 1"), "an action bar setting").toEqual([NOT_RECORDED, true]);
  expect(point("Visibility"), "and an action bar's visibility").toEqual([NOT_RECORDED, true]);
  addon.slash("situation stop");
  addon.eval('__click("Nameplates")');
  expect(point("Cast bar"), "recording stopped: the note and the dimming go").toEqual([false, false]);
  addon.eval("GameTooltip = nil");
  addon.slash("situation record raid");
  expect(point("Cast bar"), "without a tooltip the row is still dimmed").toEqual([false, true]);
});

it("situations: the page lists what an override can hold and says everything else changes the base profile", () => {
  const addon = situated("", CLICK_LUA);
  addon.slash("");
  addon.eval('__click("Situations")');
  expect(addon.texts("Frame spots, scale and opacity (move frames with /vg unlock).").length, "frames first").toBe(1);
  const holds = addon.eval("local SI, out = ns.GetModule('Situations'), {} for _, m in ipairs(SI.ORDER) do out[#out + 1] = SI.HOLDS[m] end return out");
  expect(holds.length, "a line for every module an override can set").toBe(addon.eval("local n = 0 for _ in pairs(ns.GetModule('Situations').LIVE) do n = n + 1 end return n"));
  for (const line of holds) expect(addon.texts(line).length, line).toBe(1);
  expect(addon.find("^Everything else, including any setting that needs a reload, changes your base profile") !== null, "and everything else changes the base profile").toBe(true);
});
