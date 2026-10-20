// setuplayouts: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { ACTIONS_ENV, CLICK_LUA, MICRO_ENV, RAID_ENV, SPECIAL_BARS_ENV, STRIPS_ENV, STRIP_ENV, SWING_ENV, TIDY_ENV, TOOLS_ENV, UI_ENV, UNITS_ENV, UP, borderOf, chatHas, key, loggedIn, overlaps, px, setCombat, tok } from "./helpers.mjs";

// Clicks one of the setup wizard's buttons (next, back or close) as the player would.
const setupClick = (addon, which) => addon.eval(`local b = Vanguard_Setup.${which} b:GetScript("OnClick")(b, "LeftButton")`);
it("setup layouts: your specialization's role, else your group role, marks your layout", () => {
  // The layout setup marks as your role's, with this Lua run before login.
  const guess = (lua) => loggedIn(lua, { firstRun: true }).eval("return ns.Setup.GuessLayout()");
  expect(guess(""), "no role: damage").toBe("damage");
  expect(guess("__wfgWorld.units.player.role = 'TANK'"), "a tank: tanking").toBe("tank");
  expect(guess("__wfgWorld.spec = 2 GetSpecializationRole = function(i) return i == 2 and 'HEALER' or 'DAMAGER' end"), "a healing spec: healing").toBe("healing");
  expect(guess("__wfgWorld.spec = 1 __wfgWorld.units.player.role = 'HEALER' GetSpecializationRole = function() return 'DAMAGER' end"), "the spec wins over the group role").toBe("damage");
  const healer = loggedIn("__wfgWorld.units.player.role = 'HEALER'", { firstRun: true });
  expect(healer.eval("return { Vanguard_Setup.pages.layout.hint:GetText(), Vanguard_Setup.pages.layout.choices[3].text:GetText() }"), "a new account's healer starts on Keep too, Healing marked as theirs")
    .toEqual(["Moves nothing: your frames stay where they are.", "Centered: healing  ·  your role"]);
});
it("setup layouts: Healing puts the raid frames under the character and turns click casting on", () => {
  const addon = loggedIn(CLICK_LUA + UNITS_ENV + RAID_ENV, { firstRun: true });
  const layouts = addon.eval("local out = {} for i, b in ipairs(Vanguard_Setup.pages.layout.choices) do out[i] = b.text:GetText() end return out");
  expect(layouts, "five layouts, damage first (marked as your role's: no role says healer or tank), then Keep").toEqual(["Centered: damage  ·  your role", "Centered: tanking", "Centered: healing", "Versus deck", "Like the game's", "Keep my current layout"]);
  expect(addon.eval('return __click("Centered: healing")') && addon.eval("return Vanguard_Setup.pages.layout.hint:GetText()"), "picking Healing shows what it does").toMatch(/click casting on/);
  expect(addon.eval("local c = Vanguard_Setup.pages.layout.choices return { c[3].selected, c[3 == 1 and 2 or 1].selected, c[3].rail:IsShown(), c[3 == 1 and 2 or 1].rail:IsShown() }"), "the chosen layout wears the selected rail; the others rest flat").toEqual([true, false, true, false]);
  setupClick(addon, "next");
  expect(addon.eval("return { ns.MoverPoint('raid') }"), "Healing leaves the raid frames at their default spot, over your player frame").toEqual(["BOTTOM", "BOTTOM", -240, 344]);
  expect(addon.eval("return ns.ModuleEnabled('ClickCast') and ns.ModuleEnabled('RaidFrames')"), "click casting and the raid frames are on").toBe(true);
  const role = "return { ns.Settings('RaidFrames').showPower, ns.Settings('RaidFrames').sortByRole, ns.Settings('RaidAuras').hots, ns.Settings('RaidHealing').healPrediction, ns.Settings('Nameplates').debuffs, ns.Settings('Nameplates').threat }";
  expect(addon.eval(role), "Healing sets power bars, sort by role, HoTs and incoming heals on the raid frames, short debuff rows and no threat colours on nameplates").toEqual([true, true, true, true, 2, false]);
  expect(chatHas(addon, /Profile Default as it was before setup is saved as profile Default backup\./), "the profile was backed up before Healing applied").toBe(true);
  for (let i = 0; i < 3; i += 1) setupClick(addon, "next");
  addon.eval('Vanguard_Question.no:GetScript("OnClick")(Vanguard_Question.no)');
  expect(addon.eval("return Vanguard_Reload.title:GetText()"), "nothing was off, so the reload is for the layout's settings").toMatch(/^The layout's raid frame, raid aura and nameplate settings show after a reload\./);
  const off = loggedIn(CLICK_LUA, { firstRun: true, savedVariables: "VanguardDB = { profiles = { Default = { modules = { ClickCast = false, RaidFrames = false } } } }" });
  off.eval('__click("Centered: healing")');
  setupClick(off, "next");
  expect(off.eval("return VanguardDB.profiles.Default.positions.raid.point == nil and VanguardDB.profiles.Default.positions.raid.scale"), "without raid frames built, no spot is saved (the default by group size applies), only the larger size").toBe(1.15);
  expect(off.eval("return ns.ModuleEnabled('ClickCast') and ns.ModuleEnabled('RaidFrames')"), "Healing turns click casting and the raid frames on").toBe(true);
  expect(off.eval(role), "with the raid frames off, Healing still saves their settings for when they load").toEqual([true, true, true, true, 2, false]);
  for (let i = 0; i < 3; i += 1) setupClick(off, "next");
  expect(off.eval("return Vanguard_Question:IsShown() and Vanguard_Reload == nil"), "a first run's Done asks about exporting first").toBe(true);
  off.eval('Vanguard_Question.no:GetScript("OnClick")(Vanguard_Question.no)');
  expect(off.eval("return Vanguard_Reload:IsShown() and Vanguard_Reload.title:GetText()"), "a module that was off offers a reload at the end").toMatch(/Setup turned on a module that was off/);
});
it("setup layouts: Damage restores Vanguard's defaults, undoing Healing", () => {
  const addon = loggedIn(CLICK_LUA + UNITS_ENV + RAID_ENV, { firstRun: true });
  const home = addon.eval("return { ns.MoverPoint('raid') }");
  addon.eval('__click("Centered: healing")');
  for (let i = 0; i < 4; i += 1) setupClick(addon, "next");
  expect(addon.eval("return { ns.MoverPoint('raid') }"), "Healing leaves the raid frames at their default spot").toEqual(home);
  addon.slash("setup");
  expect(addon.eval("return Vanguard_Setup.pages.layout.hint:GetText()"), "running setup again picks Keep").toMatch(/^Moves nothing/);
  setupClick(addon, "next");
  expect(addon.eval("return { ns.MoverPoint('raid') }"), "and Keep leaves the raid frames where they are").toEqual(home);
  setupClick(addon, "back");
  addon.eval('__click("Centered: damage")');
  setupClick(addon, "next");
  expect(addon.eval("return { ns.MoverPoint('raid') }"), "picking Damage puts the raid frames back").toEqual(home);
  expect(addon.eval("return VanguardDB.profiles.Default.positions.raid == nil"), "and forgets the saved spot").toBe(true);
  expect(addon.eval("return { ns.Settings('RaidFrames').showPower, ns.Settings('RaidFrames').sortByRole, ns.Settings('RaidAuras').hots, ns.Settings('RaidHealing').healPrediction, ns.Settings('Nameplates').debuffs, ns.Settings('Nameplates').threat }"), "Damage takes the power bars, role sort, HoTs and incoming heals off the raid frames, longer debuff rows and threat colours on nameplates").toEqual([false, false, false, false, 6, true]);
  const off = loggedIn(CLICK_LUA, { firstRun: true, savedVariables: 'VanguardDB = { profiles = { Default = { modules = { RaidFrames = false }, positions = { raid = { point = "TOP", relPoint = "CENTER", x = 0, y = -200 } } } } }' });
  off.eval('__click("Centered: damage")');
  setupClick(off, "next");
  expect(off.eval("return VanguardDB.profiles.Default.positions.raid == nil"), "without raid frames built, the saved spot is cleared for next time").toBe(true);
});
it("setup layouts: Like the game's puts your frames at the top left; another layout puts them back", () => {
  const addon = loggedIn(CLICK_LUA + UNITS_ENV + RAID_ENV, { firstRun: true });
  // Where the player, focus, raid and boss frames are now.
  const spots = () => addon.eval("return { { ns.MoverPoint('uf_player') }, { ns.MoverPoint('uf_focus') }, { ns.MoverPoint('raid') }, { ns.MoverPoint('uf_boss1') } }");
  const home = spots();
  expect(addon.eval('return __click("Like the game\'s") and Vanguard_Setup.pages.layout.hint:GetText()'), "picking it says what it does").toMatch(/top left as the game has them/);
  setupClick(addon, "next");
  expect(spots(), "player at the top left, focus beside the target of target, party and raid down the left, bosses on the right").toEqual([["TOPLEFT", "TOPLEFT", 20, -40], ["TOPLEFT", "TOPLEFT", 520, -94], ["BOTTOMLEFT", "BOTTOMLEFT", 20, 330], ["TOPRIGHT", "TOPRIGHT", -290, -200]]);
  expect(addon.eval("return VanguardDB.profiles.Default.positions.maintanks"), "frames not built yet get their spot saved for later").toEqual({ point: "TOP", relPoint: "TOP", x: 100, y: -196 });
  for (let i = 0; i < 3; i += 1) setupClick(addon, "next");
  addon.slash("setup");
  addon.eval('__click("Centered: healing")');
  setupClick(addon, "next");
  expect(spots().slice(0, 2).concat([spots()[3]]), "Healing puts the frames back first").toEqual([home[0], home[1], home[3]]);
  expect([addon.eval("return VanguardDB.profiles.Default.positions.uf_player.point == nil"), spots()[2]], "and then places nothing: the raid frames keep their default spot").toEqual([true, home[2]]);
});
// Where a point name sits across and up a rect (0 = left or bottom, 1 = right or top).
const ACROSS = (point) => (/LEFT/.test(point) ? 0 : /RIGHT/.test(point) ? 1 : 0.5);
// The rect { l, b, r, t } of a w x h frame anchored at [point, relPoint, x, y] on UIParent, on an sw x sh screen.
function rectAt([point, relPoint, x, y], w, h, sw, sh) {
  const l = ACROSS(relPoint) * sw + x - ACROSS(point) * w;
  const b = UP(relPoint) * sh + y - UP(point) * h;
  return { l, b, r: l + w, t: b + h };
}
// Rows that ride on frames rather than being movers: parent mover, side, gap, w, h
// (Modules/ComboPoints.lua: 5 pips of 14 + 3; Modules/FrameAuras.lua: buffs 18, debuffs 22 with crowd control).
const ATTACHED = {
  combo: ["uf_player", "above", 2, 85, 14], targetBuffs: ["uf_target", "above", 3, 160, 18],
  targetDebuffs: ["uf_target", "below", 3, 240, 22], focusDebuffs: ["uf_focus", "below", 3, 160, 20],
};
// Every built mover's [point, relPoint, x, y, w, h, scale], read from the addon: the
// size on screen (its own size times its scale; the offsets are already in screen units).
const moverSpots = (addon) => addon.eval(`local out = {}
  for _, m in ipairs(ns.MoverList()) do
    local f, p, rp, x, y = ns.MoverFrame(m.key), ns.MoverPoint(m.key)
    if f then local s = f:GetScale() out[m.key] = { p, rp, x, y, f:GetWidth() * s, f:GetHeight() * s, s } end
  end
  return out`);
// The raid holder's spot with n players, as moverSpots gives it: the default moves with the group's
// size (RF.SpotFor), so it is read with the default for n set, then set back for a solo player.
const raidSpot = (addon, n) => addon.eval(`local RF = ns.GetModule("RaidFrames") RF.PlaceFor(${n})
  local f, p, rp, x, y = ns.MoverFrame("raid"), ns.MoverPoint("raid") local s = f:GetScale()
  RF.PlaceFor(0)
  return { p, rp, x, y, f:GetWidth() * s, f:GetHeight() * s, s }`);
// The raid grid for n players: groups of five as columns side by side (or as rows stacked up, as
// RF.LayoutFor(n) says), drawn at the compact scale, pinned to the holder's side.
function raidRect(addon, n, sw, sh) {
  const s = addon.eval(`local RF = ns.GetModule('RaidFrames') local s = RF.settings return { s.width, s.height, s.spacing, RF.LayoutFor(${n}) }`);
  const spot = raidSpot(addon, n);
  const scale = addon.eval(`return ns.GetModule('RaidFrames').Scale(${n})`);
  const groups = Math.ceil(n / 5), five = [5 * (s[0] + s[2]) - s[2], 5 * (s[1] + s[2]) - s[2]];
  const across = [groups * (s[0] + s[2]) - s[2], groups * (s[1] + s[2]) - s[2]];
  const w = (s[3] === "rows" ? five[0] : across[0]) * scale, h = (s[3] === "rows" ? across[1] : five[1]) * scale;
  const holder = rectAt(spot.slice(0, 4), spot[4], spot[5], sw, sh);
  const l = /LEFT/.test(spot[0]) ? holder.l : /RIGHT/.test(spot[0]) ? holder.r - w : (holder.l + holder.r) / 2 - w / 2;
  return { l, b: holder.b, r: l + w, t: holder.b + h };
}
// Windows that open over the HUD for a moment, so they're left out of the overlap check
// (the Instance prep card shows at an instance's door or a ready check and fades after 20 s;
// the Chat watch toast shows for 8 s when a watched phrase is said; the boss timer spots
// hold a boss mod's bars only during boss fights, and are empty otherwise; the flight timer shows only on a taxi,
// when nothing else on the HUD is in use).
const FLOATING = new Set(["questlog", "lossofcontrol", "talkinghead", "prepcard", "chatwatch", "bossbars", "bossbarssoon", "flighttimer"]);
// The quest dialog (at its greatest height) must clear the cluster around your character
// in the centered layouts; it may cover the group frames above it, and the quest arrow on a small screen, while you talk to an NPC.
// Like the game's has no cluster there (your frames are at the top left), so it isn't checked there.
const DIALOG_MAY_COVER = new Set(["raid", "maintanks", "partyextras", "questarrow"]);
// Whether a pair is the quest dialog over a group frame.
const dialogMayCover = (a, c) => (a === "questdialog" && DIALOG_MAY_COVER.has(c)) || (c === "questdialog" && DIALOG_MAY_COVER.has(a));
// Parts that show only with some group sizes [fewest, most]: main tanks in a raid, party pets and targets in a party.
const ONLY_WITH = { maintanks: [6, 40], partyextras: [1, 5] };
// Whether a mover's part is on screen with n players (the raid grid is drawn on its own).
const onScreen = (key, n) => key !== "raid" && !FLOATING.has(key) && (!ONLY_WITH[key] || (n >= ONLY_WITH[key][0] && n <= ONLY_WITH[key][1]));
// A row riding on a part's rect p (scaled with its frame by s): above or below it.
const attachedRect = (p, s, [, side, gap, w, h]) => (side === "above"
  ? { l: p.l, b: p.t + gap * s, r: p.l + w * s, t: p.t + (gap + h) * s }
  : { l: p.l, b: p.b - (gap + h) * s, r: p.l + w * s, t: p.b - gap * s });
// Every part's rect on an sw x sh screen with n players in the group (0: solo, no grid).
function layoutRects(addon, n, sw, sh) {
  const spots = moverSpots(addon), out = {};
  for (const [key, spot] of Object.entries(spots)) if (onScreen(key, n)) out[key] = rectAt(spot.slice(0, 4), spot[4], spot[5], sw, sh);
  for (const [key, row] of Object.entries(ATTACHED)) if (out[row[0]]) out[key] = attachedRect(out[row[0]], spots[row[0]][6], row);
  if (n > 0) out.raid = raidRect(addon, n, sw, sh);
  // Chat is a mover: its panel reaches a gap past the window's left, right and bottom (over the
  // scroll column on the right) and the tab bar's height above its top, and its side buttons
  // stack left of the panel. Its first-time size depends on the screen's width.
  if (out.chat) {
    const [w, h, bar, column, gap, stack] = addon.eval(`local CH = ns.GetModule("Chat") local w, h = CH.DefaultSize(${sw}) return { w, h, CH.BAR, CH.SIDE_COLUMN, ns.Theme.SPACE.tight, CH.STACK_ROOM }`);
    out.chat = { l: out.chat.l - gap - stack, b: out.chat.b - gap, r: out.chat.l + w + column + gap, t: out.chat.b + h + bar };
  }
  return out;
}
// Problems on one screen: pairs that overlap and parts off screen.
function layoutProblems(rects, sw, sh) {
  const keys = Object.keys(rects), bad = [];
  keys.forEach((a, i) => keys.slice(i + 1).forEach((c) => { if (overlaps(rects[a], rects[c]) && !dialogMayCover(a, c)) bad.push(`${a} / ${c}`); }));
  keys.forEach((k) => { const r = rects[k]; if (r.l < 0 || r.b < 0 || r.r > sw || r.t > sh) bad.push(`${k} off screen`); });
  return bad;
}
// The whole HUD logged in on a new account, party pets and targets on, the info strip
// at its tallest (with the leveling and DPS rows), the roll tracker at its most lines and the bag and
// menu bar at its laid-out size (404 wide, 68 tall: the bags row over the menu row's 14 slots).
function wholeHud() {
  const addon = loggedIn(UI_ENV + ACTIONS_ENV + UNITS_ENV + RAID_ENV + SWING_ENV + TOOLS_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV + SPECIAL_BARS_ENV + "TakeTaxiNode = function() end", { firstRun: true, savedVariables: "VanguardDB = { profiles = { Default = { PartyExtras = { show = true } } } }" });
  addon.eval("Vanguard_InfoStrip:SetHeight(68)");
  addon.eval('local R = ns.GetModule("Rolls") Vanguard_Rolls:SetHeight(R.LINES * R.LINE + 2 * R.PAD)');
  addon.eval("MicroMenuContainer:Layout() BagsBar:Layout()");
  return addon;
}
// Every part's rect in a layout preset: the quest dialog only in the centered ones.
function presetRects(addon, layout, n, sw, sh) {
  const rects = layoutRects(addon, n, sw, sh);
  if (layout === "classic") delete rects.questdialog;
  return rects;
}
// The quest arrow sits at the top centre (Cliff's spot, 2026-10-19); on a screen under 1400 wide the top
// of a full 40-player raid grid reaches it, so there it may cover the grid (either moves with /vg unlock).
const arrowMayCover = (p, n, sw) => p === "questarrow / raid" && n === 40 && sw < 1400;
// Overlaps and parts off an sw x sh screen in a layout preset, for each raid growth and group size (solo, 5, 25, 40).
function problemsAt(addon, layout, sw, sh, label) {
  const bad = [];
  for (const grow of ["columns", "rows"]) {
    addon.eval(`ns.GetModule("RaidFrames").settings.layout = "${grow}"`);
    for (const n of [0, 5, 25, 40]) for (const p of layoutProblems(presetRects(addon, layout, n, sw, sh), sw, sh)) if (!arrowMayCover(p, n, sw)) bad.push(`${label}, groups as ${grow}, ${n} players: ${p}`);
  }
  return bad;
}
it("setup layouts: nothing overlaps or leaves the screen, solo to 40-man, at UI scale 1 and pixel-perfect", () => {
  const addon = wholeHud();
  expect(addon.eval("return ChatFrame1.__points.BOTTOMLEFT ~= nil"), "chat sits in its layout spot").toBe(true);
  expect(moverSpots(addon).menustrip.slice(4, 6).map((n) => Math.round(n * 10) / 10), "the bag and menu bar hugs its 14 menu slots").toEqual([412, 82]);
  expect(["bar1", "bar2", "bar3", "cast_player", "cast_target", "cast_focus", "uf_player", "uf_target", "uf_focus", "uf_pet", "swing", "raid", "xpbar", "cdm_essential", "cdm_utility", "cdm_buffs", "damagemeter", "fighthistory", "tooltip", "infostrip", "questtracker", "flighttimer", "uf_boss1", "raidtools", "maintanks", "partyextras", "petbar", "stancebar", "chat", "questdialog"].filter((k) => !moverSpots(addon)[k]), "every part of the cluster is a mover").toEqual([]);
  expect(moverSpots(addon).questdialog.slice(3, 6), "the quest dialog is checked at its greatest size, 8 px over the focus cast bar").toEqual([346, 560, 360]);
  for (const layout of ["damage", "tank", "healing", "versus", "classic"]) {
    addon.eval(`ns.Setup.ApplyLayout("${layout}")`);
    // The bags ride over the menu in one bar, so it is no wider than the menu row and clears the bars at 1365.
    for (const [sw, sh] of [[1365, 768], [1920, 1080]]) expect(problemsAt(addon, layout, sw, sh, `${layout}, ${sw}x${sh}`)).toEqual([]);
  }
});
it("setup screens: with each screen preset, nothing overlaps or leaves its own screen, in every layout, solo to 40-man", () => {
  const addon = wholeHud();
  const presets = addon.eval("local out = {} for i, p in ipairs(ns.Setup.SCREENS) do out[i] = { p.key, p.w, p.h, p.ui } end return out");
  expect(presets.map((p) => p[0]), "1080p, 1440p, 4K and ultrawide").toEqual(["1080", "1440", "4k", "ultrawide"]);
  for (const [key, w, h, ui] of presets) {
    // The screen in UI units at the preset's UI scale: 768 tall at scale 1.
    const sw = (768 * w) / h / ui, sh = 768 / ui;
    for (const layout of ["damage", "tank", "healing", "versus", "classic"]) {
      addon.eval(`ns.Setup.ApplyLayout("${layout}") ns.Setup.ApplyScreen("${key}")`);
      expect(problemsAt(addon, layout, sw, sh, `${key} (${Math.round(sw)}x${Math.round(sh)}), ${layout}`)).toEqual([]);
    }
  }
  expect(addon.eval("return { ns.GetModule('ActionBars').settings.size, ns.GetModule('RaidFrames').settings.width, ns.Theme.Settings().textScale }"), "the last preset (ultrawide) set the buttons, tiles and text").toEqual([38, 110, 1.05]);
});
// The screen step's choices (their labels) and the hint under them.
const screenPage = (addon) => addon.eval("local p = Vanguard_Setup.pages.screen local out = {} for i, b in ipairs(p.choices) do out[i] = b.text:GetText() end return { out, p.hint:GetText() }");
// What the screen presets set: the UI scale settings, the shared button size, bar 1's buttons, the raid tile size, the text size and pixel-perfect scale.
const screenSizes = (addon) => addon.eval(`local AB, RF, t = ns.GetModule("ActionBars"), ns.Settings("RaidFrames"), ns.Theme.Settings()
  return { GetCVar("useUiScale") or "unset", GetCVar("uiScale") or "unset", AB.settings.size, Vanguard_Bar1Button1:GetWidth(), RF.width, RF.height, t.textScale, t.pixelScale }`);
it("setup screen: this screen's preset is picked; Keep changes nothing; a preset sets the UI scale, buttons, tiles and text", () => {
  const addon = loggedIn(ACTIONS_ENV + UNITS_ENV + RAID_ENV + CLICK_LUA + "__wfgStub.setScreen(2560, 1440)", { firstRun: true, savedVariables: "VanguardDB = { profiles = { Default = { theme = { pixelScale = true } } } }" });
  setupClick(addon, "next");
  const [labels, hint] = screenPage(addon);
  expect(labels, "four presets, this screen's marked, then Pixel-perfect and Keep").toEqual(["1080p (1920 x 1080)", "1440p (2560 x 1440)  ·  your screen", "4K (3840 x 2160)", "Ultrawide (3440 x 1440)", "Pixel-perfect (sharpest)", "Keep my current sizes"]);
  expect(addon.eval("local c = Vanguard_Setup.pages.screen.choices return { c[6].selected, c[6 == 1 and 2 or 1].selected, c[6].rail:IsShown(), c[6 == 1 and 2 or 1].rail:IsShown() }"), "Keep is picked: it wears the selected rail; the others rest flat").toEqual([true, false, true, false]);
  expect(hint, "Keep says it changes nothing, and who sets the UI scale now").toBe("Changes nothing: your UI scale stays with Vanguard's pixel-perfect scale (General, Look), your sizes as they are.");
  addon.eval('__click("1440p")');
  expect(screenPage(addon)[1], "a preset says what it sets, and that it moves the game's own slider").toBe("Moves the game's UI Scale slider to 70% (Vanguard's pixel-perfect scale goes off); action buttons 38 px, raid tiles 110 x 48, text 105%.");
  const before = screenSizes(addon);
  addon.eval('__click("Keep my current sizes")');
  setupClick(addon, "next");
  expect(screenSizes(addon), "and it doesn't").toEqual(before);
  setupClick(addon, "back");
  addon.eval('__click("1440p")');
  setupClick(addon, "next");
  expect(screenSizes(addon), "1440p: UI scale 70%, 38 px buttons laid out at once (in whole screen pixels), 110 x 48 tiles, text 105%, pixel-perfect scale off").toEqual(["1", "0.7", 38, px(addon, 38), 110, 48, 1.05, false]);
  setupClick(addon, "next");
  setupClick(addon, "next");
  addon.eval('Vanguard_Question.no:GetScript("OnClick")(Vanguard_Question.no)');
  expect(addon.eval("return Vanguard_Reload:IsShown() and Vanguard_Reload.title:GetText()"), "new tile sizes offer a reload at the end").toMatch(/^The new raid tile size shows after a reload/);
});
// What Pixel-perfect sets on a w x h screen: { ui, pixel, button, tile, textScale }.
const pixelPreset = (addon, w, h) => addon.eval(`__wfgStub.setScreen(${w}, ${h}) local p = ns.Setup.PixelPreset()
  return { math.floor(p.ui * 1e6 + 0.5) / 1e6, p.pixel, p.button, p.tile[1], p.tile[2], p.textScale }`);
it("setup screen: Pixel-perfect is a whole-pixel scale, with Vanguard's own sizes grown to make up for it (#225)", () => {
  const addon = loggedIn();
  expect(pixelPreset(addon, 1920, 1080), "1080p: 71%, 1 pixel per unit; the 1080p preset's buttons and text grown by 0.8 / 0.711, its tiles kept").toEqual([0.711111, 1, 43, 100, 48, 1.15]);
  expect(pixelPreset(addon, 2560, 1440), "1440p: 53%; text stops at the slider's 130%").toEqual([0.533333, 1, 50, 110, 48, 1.3]);
  expect(pixelPreset(addon, 3840, 2160), "4K: 2 pixels per unit (71%), so a little smaller than the 4K preset").toEqual([0.711111, 2, 35, 110, 48, 1]);
  expect(pixelPreset(addon, 1366, 768)[0], "a small screen: 100%").toBe(1);
  expect([1080, 1200, 1440, 1600, 2160, 2880].map((h) => addon.eval(`return ns.Setup.PixelMultiple(${h})`)), "one pixel per unit up to about 1600 tall, two at 4K").toEqual([1, 1, 1, 1, 2, 2]);
});
it("setup screen: picking Pixel-perfect turns on Vanguard's pixel-perfect scale and leaves the game's UI scale alone (#225)", () => {
  const addon = loggedIn(ACTIONS_ENV + UNITS_ENV + RAID_ENV + CLICK_LUA + "__wfgStub.setScreen(2560, 1440)", { firstRun: true });
  setupClick(addon, "next");
  addon.eval('__click("Pixel-perfect (sharpest)")');
  expect(screenPage(addon)[1], "its hint says why and what it sets").toBe("Sharpest: every line on whole screen pixels. Vanguard's pixel-perfect scale at 53%; action buttons 50 px, raid tiles 110 x 48, text 130%.");
  setupClick(addon, "next");
  expect(screenSizes(addon), "the game's UI scale untouched; 50 px buttons (whole pixels already), 110 x 48 tiles, text 130%, pixel-perfect on").toEqual(["unset", "unset", 50, 50, 110, 48, 1.3, true]);
  expect([addon.eval("return UIParent:GetScale()"), addon.eval("return ns.Theme.Settings().pixelMultiple")], "UIParent at 768 / 1440, one pixel per unit").toEqual([768 / 1440, 1]);
});
it("setup screen: with Pixel-perfect, nothing overlaps or leaves the screen, in every layout, solo to 40-man (#225)", () => {
  const addon = wholeHud();
  for (const [w, h] of [[1920, 1080], [2560, 1440], [3840, 2160], [3440, 1440]]) {
    addon.eval(`__wfgStub.setScreen(${w}, ${h})`);
    const n = addon.eval(`return ns.Setup.PixelMultiple(${h})`);
    for (const layout of ["damage", "tank", "healing", "versus", "classic"]) {
      addon.eval(`ns.Setup.ApplyLayout("${layout}") ns.Setup.ApplyScreen("pixel")`);
      expect(problemsAt(addon, layout, w / n, h / n, `pixel-perfect ${w}x${h}, ${layout}`)).toEqual([]);
    }
  }
});
it("setup screen: which preset fits which screen, and the UI scale setting", () => {
  const addon = loggedIn();
  // The preset picked for a w x h screen.
  const detect = (w, h) => addon.eval(`__wfgStub.setScreen(${w}, ${h}) return ns.Setup.DetectScreen()`);
  expect([detect(1920, 1080), detect(1920, 1200), detect(2560, 1440), detect(3840, 2160), detect(3440, 1440), detect(2560, 1080), detect(1366, 768)], "by height, ultrawide by shape, small screens kept").toEqual(["1080", "1080", "1440", "4k", "ultrawide", "ultrawide", "keep"]);
  expect(addon.eval("GetPhysicalScreenSize = nil return ns.Setup.DetectScreen()"), "a client that can't say keeps the sizes").toBe("keep");
  addon.eval("ns.SetUIScale(0.5)");
  expect(addon.eval("return GetCVar('uiScale')"), "the UI scale keeps to the game's own range (65% to 115%)").toBe("0.65");
  addon.eval("ns.SetUIScale(2) ns.Setup.ApplyScreen('keep') ns.SetUIScale('big')");
  expect(addon.eval("return GetCVar('uiScale')"), "Keep and a bad value change nothing").toBe("1.15");
  setCombat(addon, true);
  addon.eval("ns.SetUIScale(0.9)");
  expect(addon.eval("return GetCVar('uiScale')"), "in combat it waits").toBe("1.15");
  setCombat(addon, false);
  expect(addon.eval("return GetCVar('uiScale')"), "and applies when combat ends").toBe("0.9");
  addon.eval("C_CVar = nil SetCVar = nil ns.SetUIScale(1)");
  expect(addon.eval("return GetCVar('uiScale')"), "a client without the setting is left alone").toBe("0.9");
});
it("raid frames: up to 10 sit over your player frame, a bigger raid stacks its groups as rows at the left; a saved spot wins", () => {
  const addon = loggedIn(CLICK_LUA + UNITS_ENV + RAID_ENV + "__members = 5 GetNumGroupMembers = function() return __members end");
  const RF = "ns.GetModule('RaidFrames')";
  // The raid after n players: its spot, then its layout and the header's point and column anchor.
  const state = (n) => { addon.eval(`__members = ${n}`); addon.fire("GROUP_ROSTER_UPDATE"); return addon.eval(`return { ns.MoverPoint('raid') }`).concat(addon.eval(`return { ${RF}.LayoutFor(${n}), Vanguard_Raid:GetAttribute('point'), Vanguard_Raid:GetAttribute('columnAnchorPoint') }`)); };
  expect(state(5), "a party: over your player frame, groups as columns").toEqual(["BOTTOM", "BOTTOM", -240, 344, "columns", "BOTTOM", "LEFT"]);
  expect(state(10), "10 players: the same").toEqual(["BOTTOM", "BOTTOM", -240, 344, "columns", "BOTTOM", "LEFT"]);
  expect(state(25), "25: left of your character, groups stacked as rows").toEqual(["BOTTOMLEFT", "BOTTOM", -500, 344, "rows", "LEFT", "BOTTOM"]);
  expect(state(40), "40: the same").toEqual(["BOTTOMLEFT", "BOTTOM", -500, 344, "rows", "LEFT", "BOTTOM"]);
  // A roster change in combat leaves the secure header, its anchor and the holder's default alone until the fight ends.
  addon.eval("__secureSets = 0 local set = Vanguard_Raid.SetAttribute Vanguard_Raid.SetAttribute = function(...) __secureSets = __secureSets + 1 return set(...) end");
  setCombat(addon, true);
  addon.eval("__members = 5");
  addon.fire("GROUP_ROSTER_UPDATE");
  expect([addon.eval("return __secureSets"), addon.eval("return { ns.MoverPoint('raid') }"), addon.eval("return Vanguard_Raid:GetAttribute('point')")], "in combat nothing is re-anchored or re-laid out").toEqual([0, ["BOTTOMLEFT", "BOTTOM", -500, 344], "LEFT"]);
  setCombat(addon, false);
  expect([addon.eval("return { ns.MoverPoint('raid') }"), addon.eval("return Vanguard_Raid:GetAttribute('point')")], "and it follows when combat ends").toEqual([["BOTTOM", "BOTTOM", -240, 344], "BOTTOM"]);
  expect(state(5), "and back over your player frame when the raid shrinks").toEqual(["BOTTOM", "BOTTOM", -240, 344, "columns", "BOTTOM", "LEFT"]);
  expect(addon.eval("return { Vanguard_RaidHolder:GetWidth(), Vanguard_RaidHolder:GetHeight() }"), "the holder is one group's size in the layout").toEqual([100, 256]);
  addon.eval(`${RF}.settings.stackBig = false`);
  expect(state(40), "with Stack big raids off, a raid keeps the old spot and columns").toEqual(["BOTTOM", "BOTTOM", -240, 344, "columns", "BOTTOM", "LEFT"]);
  addon.eval(`${RF}.settings.stackBig = true ${RF}.settings.layout = "rows"`);
  expect(state(5)[4], "Groups as rows is still rows for a party").toBe("rows");
  addon.eval(`${RF}.settings.layout = "columns"`);
  expect(state(40).slice(0, 4), "a raid of 40 at the left again").toEqual(["BOTTOMLEFT", "BOTTOM", -500, 344]);
  addon.eval('ns.Options.Show("raid") __click("Stack big raids at the left (more than 10 players)")');
  expect([addon.eval(`return ${RF}.settings.stackBig`), addon.eval("return { ns.MoverPoint('raid') }")], "the option turns it off at once, for the real frames").toEqual([false, ["BOTTOM", "BOTTOM", -240, 344]]);
  const moved = loggedIn(UNITS_ENV + RAID_ENV + "__members = 40 GetNumGroupMembers = function() return __members end", { savedVariables: 'VanguardDB = { profiles = { Default = { positions = { raid = { point = "BOTTOMRIGHT", relPoint = "BOTTOMRIGHT", x = -20, y = 344 } } } } }' });
  moved.fire("GROUP_ROSTER_UPDATE");
  expect(moved.eval("return { ns.MoverPoint('raid') }"), "frames you already moved keep their spot at every size").toEqual(["BOTTOMRIGHT", "BOTTOMRIGHT", -20, 344]);
  expect(moved.eval("local p = Vanguard_Raid.__points return p.BOTTOMRIGHT ~= nil"), "the grid is pinned to the right of the holder at the saved spot").toBe(true);
  moved.eval("ns.ResetMovers('raid')");
  expect([moved.eval("return { ns.MoverPoint('raid') }"), moved.eval("local p = Vanguard_Raid.__points return p.BOTTOMLEFT ~= nil")], "a reset puts a raid of 40 at the left default, and the grid follows at once, without a roster change").toEqual([["BOTTOMLEFT", "BOTTOM", -500, 344], true]);
});
it("Centered layout: compact raid grid, one-time migrations, a strip with nothing to show", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + "__members = 5 GetNumGroupMembers = function() return __members end");
  const RF = "ns.GetModule('RaidFrames')";
  expect(addon.eval(`return { ${RF}.Scale(5), ${RF}.Scale(25), ${RF}.Scale(40), ${RF}.Scale(60) }`), "full size up to 10, 80% up to 25, 72% above").toEqual([1, 0.8, 0.72, 0.72]);
  // The grid's scale and the point it's pinned to on the holder.
  const grid = () => addon.eval("local p = Vanguard_Raid.__points return { Vanguard_Raid:GetScale(), p.BOTTOMLEFT and 'left' or p.BOTTOMRIGHT and 'right' or p.BOTTOM and 'center' }");
  expect(grid(), "a party is full size, growing up from just above the player frame").toEqual([1, "center"]);
  addon.eval("__members = 40");
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(grid(), "a 40-man raid is drawn at 72%, pinned at its left (it stacks as rows, left of your character)").toEqual([0.72, "left"]);
  addon.eval('ns.SetMoverPoint("raid", "BOTTOMRIGHT", "BOTTOMRIGHT", -20, 344)');
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(grid()[1], "moved to the right edge, it grows from there").toBe("right");
  addon.eval("ns.Setup.ApplyLayout('healing')");
  expect(grid()[1], "the healing layout puts the default back: a 40-man still sits at the left").toBe("left");
  addon.eval(`${RF}.settings.compact = false`);
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(grid()[0], "compact off: always full size").toBe(1);
  const old = loggedIn(ACTIONS_ENV, { savedVariables: "VanguardDB = { profiles = { Default = { ActionBars = { size = 36, spacing = 4 }, DataBars = { width = 476, height = 10 } } } }" });
  expect(old.eval("local p = VanguardDB.profiles.Default return { p.ActionBars.size, p.ActionBars.spacing, p.DataBars.width, p.DataBars.height }"), "a profile saved with the old sizes moves to the new ones, buttons too").toEqual([38, 2, 478, 6]);
  old.eval("local p = VanguardDB.profiles.Default p.ActionBars.size = 36 p.ActionBars.spacing = 4 p.DataBars.width = 476 p.DataBars.height = 10");
  expect(old.eval("local s = ns.Settings('ActionBars', ns.GetModule('ActionBars').defaults) local d = ns.Settings('DataBars', ns.GetModule('DataBars').defaults) return { s.size, s.spacing, d.width, d.height }"), "but only once: picking those sizes again keeps them").toEqual([36, 4, 476, 10]);
  const strip = loggedIn(UNITS_ENV + STRIP_ENV, { savedVariables: "VanguardDB.profiles = { Default = { InfoStrip = { durability = false, bags = false, system = false, gold = false, ammo = false, clock = false, date = false } } }" });
  expect(strip.eval("return Vanguard_InfoStrip:IsShown()"), "a strip with every block off isn't drawn as an empty box").toBe(false);
  const chatFree = loggedIn(UI_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Chat = { place = false } } }" });
  expect(chatFree.eval("return ChatFrame1.__points.BOTTOMLEFT == nil"), "with Keep chat in its spot off, chat stays where the game puts it").toBe(true);
});
it("default sizes for a 1080p screen: 240 x 36 unit frames with 12 px names, 38 px buttons; a saved profile keeps its sizes", () => {
  const addon = loggedIn(ACTIONS_ENV + UNITS_ENV);
  // The player frame's size and name size, bar 1's button size, the XP bar's width and the 1080p preset's buttons.
  const sizes = (a) => a.eval(`return { Vanguard_player:GetWidth(), Vanguard_player:GetHeight(), select(2, Vanguard_player.name:GetFont()),
    Vanguard_Bar1Button1:GetWidth(), ns.Settings("DataBars").width, ns.Setup.ScreenPreset("1080").button }`);
  expect(sizes(addon), "a new profile: the plan's 1080p sizes (frames in whole screen pixels), and the 1080p preset agrees").toEqual([px(addon, 240), px(addon, 36), 12, px(addon, 38), 478, 38]);
  const old = loggedIn(ACTIONS_ENV + UNITS_ENV, { savedVariables: 'VanguardDB = { profiles = { Default = { ActionBars = { size = 36, layout = 2 }, DataBars = { width = 454, layout = 2 }, positions = { uf_player = { point = "BOTTOM", relPoint = "BOTTOM", x = -250, y = 180 } } } } }' });
  expect(sizes(old).slice(3, 5), "a profile that saved the old button size and bar width keeps them").toEqual([px(old, 36), 454]);
  expect(old.eval("return { ns.MoverPoint('uf_player') }"), "and a frame it moved stays put").toEqual(["BOTTOM", "BOTTOM", -250, 180]);
});
// Every status bar with a fill, by its fill texture: how many use each.
const BAR_MATERIALS = `local out = {}
  for _, w in ipairs(__wfgStub.frames) do
    local t = w.__kind == "StatusBar" and w.__barTexture and w.__barTexture.__texture
    if t then out[t] = (out[t] or 0) + 1 end
  end
  return out`;
it("one bar material (#234): every Vanguard bar on the whole HUD uses the theme's bar texture, and a new pick reaches them all", () => {
  const addon = wholeHud();
  const used = addon.eval(BAR_MATERIALS);
  expect([Object.keys(used), Object.values(used).reduce((a, b) => a + b, 0) > 20], "one texture, on every bar on screen (unit frames, raid tiles, cast bars, XP, ...)").toEqual([[addon.eval("return ns.Theme.BarTexture()")], true]);
  const soft = loggedIn(UI_ENV + ACTIONS_ENV + UNITS_ENV + RAID_ENV + SWING_ENV + TOOLS_ENV, { savedVariables: 'VanguardDB = { profiles = { Default = { theme = { barTexture = "soft" } } } }' });
  expect(Object.keys(soft.eval(BAR_MATERIALS)), "the Soft material on all of them").toEqual([soft.eval('return ns.Theme.Texture("BarSoft")')]);
});

it("setup layouts: each role sizes the frames its own way: a taller target for damage and more for tanking, a larger raid and smaller own frames for healing", () => {
  const addon = loggedIn(CLICK_LUA + UNITS_ENV + RAID_ENV, { firstRun: true });
  // The target frame's height (to the whole unit; it snaps to screen pixels), the player, target and raid scales, and the nameplates' buff row.
  const sizes = () => addon.eval("local f = ns.GetModule('UnitFrames').frames return { math.floor(f.target:GetHeight() + 0.5), f.player:GetScale(), f.target:GetScale(), Vanguard_RaidHolder:GetScale(), ns.Settings('Nameplates').buffs }");
  expect(sizes().slice(0, 4), "Vanguard's defaults").toEqual([36, 1, 1, 1]);
  addon.eval("ns.Setup.ApplyLayout('damage')");
  expect(sizes(), "damage: a taller target").toEqual([40, 1, 1, 1, 0]);
  addon.eval("ns.Setup.ApplyLayout('tank')");
  expect(sizes(), "tanking: the tallest target and the Tank preset (buff rows on nameplates)").toEqual([44, 1, 1, 1, 3]);
  addon.eval("ns.Setup.ApplyLayout('healing')");
  expect(sizes().slice(0, 4), "healing: the target back to 36, your frames smaller, the raid larger").toEqual([36, 0.9, 0.9, 1.15]);
  addon.eval("ns.Setup.ApplyLayout('versus')");
  expect(sizes().slice(0, 4), "Versus deck after Healing (no role says healer): your frame and your target's one size and height again").toEqual([36, 1, 1, 1]);
  addon.eval("ns.Setup.ApplyLayout('classic')");
  expect(sizes().slice(0, 4), "Like the game's puts every size back").toEqual([36, 1, 1, 1]);
  setCombat(addon, true);
  addon.eval("ns.Setup.ApplyLayout('tank')");
  expect(sizes()[0], "in a fight the target frame waits").toBe(36);
  setCombat(addon, false);
  expect(sizes()[0], "and grows when it ends").toBe(44);
  const healer = loggedIn(CLICK_LUA + UNITS_ENV + RAID_ENV + "__wfgWorld.spec = 2 GetSpecializationRole = function() return 'HEALER' end", { firstRun: true });
  healer.eval("ns.Setup.ApplyLayout('versus')");
  expect(healer.eval("local f = ns.GetModule('UnitFrames').frames return { f.player:GetScale(), f.target:GetScale(), Vanguard_RaidHolder:GetScale(), VanguardDB.profiles.Default.positions.uf_player.scale == nil }"), "a healer's Versus deck: the raid larger, the duel frames one size").toEqual([1, 1, 1.15, true]);
  const bare = loggedIn(CLICK_LUA, { firstRun: true, savedVariables: "VanguardDB = { profiles = { Default = { modules = { UnitFrames = false } } } }" });
  bare.eval("ns.Setup.ApplyLayout('tank')");
  expect(bare.eval("return { VanguardDB.profiles.Default.UnitFrames.targetHeight, #ns.errors }"), "without unit frames built, the height is saved for later").toEqual([44, 0]);
});
it("setup layouts: Versus deck is your role's centered layout with the deck on; another layout takes it off", () => {
  const addon = loggedIn(CLICK_LUA + UNITS_ENV + RAID_ENV, { firstRun: true });
  expect(addon.eval('return __click("Versus deck")') && addon.eval("return Vanguard_Setup.pages.layout.hint:GetText()"), "picking it says what it does").toMatch(/crest between them/);
  setupClick(addon, "next");
  const deck = "return { ns.Settings('UnitFrames').deck, ns.GetModule('UnitFrames').deck:IsShown(), ns.Settings('RaidFrames').showPower }";
  expect(addon.eval(deck), "the deck on and shown, with the damage settings (no role says healer)").toEqual([true, true, false]);
  addon.eval("ns.Setup.ApplyLayout('classic')");
  expect(addon.eval(deck).slice(0, 2), "another layout takes the deck off").toEqual([false, false]);
  const healer = loggedIn(CLICK_LUA + UNITS_ENV + RAID_ENV + "__wfgWorld.spec = 2 GetSpecializationRole = function() return 'HEALER' end", { firstRun: true });
  healer.eval("ns.Setup.ApplyLayout('versus')");
  expect(healer.eval("return { ns.Settings('UnitFrames').deck, ns.Settings('RaidFrames').showPower, ns.ModuleEnabled('ClickCast') }"), "a healer: the deck with the Healing layout (its settings, click casting on)").toEqual([true, true, true]);
});
