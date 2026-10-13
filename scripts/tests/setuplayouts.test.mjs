// setuplayouts: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { ACTIONS_ENV, CLICK_LUA, MICRO_ENV, RAID_ENV, SPECIAL_BARS_ENV, STRIPS_ENV, STRIP_ENV, SWING_ENV, TIDY_ENV, TOOLS_ENV, UI_ENV, UNITS_ENV, UP, borderOf, chatHas, key, loggedIn, overlaps, px, setCombat, tok } from "./helpers.mjs";

// Clicks one of the setup wizard's buttons (next, back or close) as the player would.
const setupClick = (addon, which) => addon.eval(`local b = Vanguard_Setup.${which} b:GetScript("OnClick")(b, "LeftButton")`);
it("setup layouts: your specialization's role, else your group role, marks your layout", () => {
  // The layout setup marks as your role's, with this Lua run before login.
  const guess = (lua) => loggedIn(lua, { firstRun: true }).eval("return ns.Setup.GuessLayout()");
  expect(guess(""), "no role: damage and tanking").toBe("damage");
  expect(guess("__wfgWorld.units.player.role = 'TANK'"), "a tank: damage and tanking").toBe("damage");
  expect(guess("__wfgWorld.spec = 2 GetSpecializationRole = function(i) return i == 2 and 'HEALER' or 'DAMAGER' end"), "a healing spec: healing").toBe("healing");
  expect(guess("__wfgWorld.spec = 1 __wfgWorld.units.player.role = 'HEALER' GetSpecializationRole = function() return 'DAMAGER' end"), "the spec wins over the group role").toBe("damage");
  const healer = loggedIn("__wfgWorld.units.player.role = 'HEALER'", { firstRun: true });
  expect(healer.eval("return { Vanguard_Setup.pages.layout.hint:GetText(), Vanguard_Setup.pages.layout.choices[2].text:GetText() }"), "a new account's healer starts on Keep too, Healing marked as theirs")
    .toEqual(["Moves nothing: your frames stay where they are.", "Centered: healing  ·  your role"]);
});
it("setup layouts: Healing puts the raid frames under the character and turns click casting on", () => {
  const addon = loggedIn(CLICK_LUA + UNITS_ENV + RAID_ENV, { firstRun: true });
  const layouts = addon.eval("local out = {} for i, b in ipairs(Vanguard_Setup.pages.layout.choices) do out[i] = b.text:GetText() end return out");
  expect(layouts, "three layouts, damage and tanking first (marked as your role's: no role says healer), then Keep").toEqual(["Centered: damage and tanking  ·  your role", "Centered: healing", "Like the game's", "Keep my current layout"]);
  expect(addon.eval('return __click("Centered: healing")') && addon.eval("return Vanguard_Setup.pages.layout.hint:GetText()"), "picking Healing shows what it does").toMatch(/click casting on/);
  expect(borderOf(addon, "Vanguard_Setup.pages.layout.choices[2]"), "the chosen layout is outlined in the accent").toEqual(tok(addon, "accent").slice(0, 3).concat(1));
  setupClick(addon, "next");
  expect(addon.eval("return { ns.MoverPoint('raid') }"), "Healing centers the raid frames above your frames").toEqual(["BOTTOM", "BOTTOM", 0, 342]);
  expect(addon.eval("return ns.ModuleEnabled('ClickCast') and ns.ModuleEnabled('RaidFrames')"), "click casting and the raid frames are on").toBe(true);
  expect(chatHas(addon, /Profile Default as it was before setup is saved as profile Default backup\./), "the profile was backed up before Healing applied").toBe(true);
  for (let i = 0; i < 3; i += 1) setupClick(addon, "next");
  addon.eval('Vanguard_Question.no:GetScript("OnClick")(Vanguard_Question.no)');
  expect(addon.eval("return Vanguard_Reload.title:GetText()"), "nothing was off, so the reload is Done's own").toMatch(/^Setup is done\./);
  const off = loggedIn(CLICK_LUA, { firstRun: true, savedVariables: "VanguardDB = { profiles = { Default = { modules = { ClickCast = false, RaidFrames = false } } } }" });
  off.eval('__click("Centered: healing")');
  setupClick(off, "next");
  expect(off.eval("return VanguardDB.profiles.Default.positions.raid"), "without raid frames built, the spot is saved for next time").toEqual({ point: "BOTTOM", relPoint: "BOTTOM", x: 0, y: 342 });
  expect(off.eval("return ns.ModuleEnabled('ClickCast') and ns.ModuleEnabled('RaidFrames')"), "Healing turns click casting and the raid frames on").toBe(true);
  for (let i = 0; i < 3; i += 1) setupClick(off, "next");
  expect(off.eval("return Vanguard_Question:IsShown() and Vanguard_Reload == nil"), "a first run's Done asks about exporting first").toBe(true);
  off.eval('Vanguard_Question.no:GetScript("OnClick")(Vanguard_Question.no)');
  expect(off.eval("return Vanguard_Reload:IsShown() and Vanguard_Reload.title:GetText()"), "a module that was off offers a reload at the end").toMatch(/Setup turned on a module that was off/);
});
it("setup layouts: Damage and tanking restores Vanguard's defaults, undoing Healing", () => {
  const addon = loggedIn(CLICK_LUA + UNITS_ENV + RAID_ENV, { firstRun: true });
  const home = addon.eval("return { ns.MoverPoint('raid') }");
  addon.eval('__click("Centered: healing")');
  for (let i = 0; i < 4; i += 1) setupClick(addon, "next");
  expect(addon.eval("return { ns.MoverPoint('raid') }"), "Healing moved the raid frames").not.toEqual(home);
  addon.slash("setup");
  expect(addon.eval("return Vanguard_Setup.pages.layout.hint:GetText()"), "running setup again picks Keep").toMatch(/^Moves nothing/);
  setupClick(addon, "next");
  expect(addon.eval("return { ns.MoverPoint('raid') }"), "and Keep leaves the raid frames where Healing put them").not.toEqual(home);
  setupClick(addon, "back");
  addon.eval('__click("Centered: damage and tanking")');
  setupClick(addon, "next");
  expect(addon.eval("return { ns.MoverPoint('raid') }"), "picking Damage and tanking puts the raid frames back").toEqual(home);
  expect(addon.eval("return VanguardDB.profiles.Default.positions.raid == nil"), "and forgets the saved spot").toBe(true);
  const off = loggedIn(CLICK_LUA, { firstRun: true, savedVariables: 'VanguardDB = { profiles = { Default = { modules = { RaidFrames = false }, positions = { raid = { point = "TOP", relPoint = "CENTER", x = 0, y = -200 } } } } }' });
  off.eval('__click("Centered: damage and tanking")');
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
  expect([addon.eval("return VanguardDB.profiles.Default.positions.uf_player == nil"), spots()[2]], "and then places only the raid").toEqual([true, ["BOTTOM", "BOTTOM", 0, 342]]);
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
// The raid grid for n players: groups of five as columns side by side (or as rows
// stacked up), drawn at the compact scale, pinned to the holder's side.
function raidRect(addon, spot, n, sw, sh) {
  const s = addon.eval("local s = ns.GetModule('RaidFrames').settings return { s.width, s.height, s.spacing, s.layout }");
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
// hold a boss mod's bars only during boss fights, and are empty otherwise).
const FLOATING = new Set(["questlog", "lossofcontrol", "talkinghead", "prepcard", "chatwatch", "bossbars", "bossbarssoon"]);
// The quest dialog (at its greatest height) must clear the cluster around your character
// in the centered layouts; it may cover the group frames above it while you talk to an NPC.
// Like the game's has no cluster there (your frames are at the top left), so it isn't checked there.
const DIALOG_MAY_COVER = new Set(["raid", "maintanks", "partyextras"]);
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
  if (n > 0) out.raid = raidRect(addon, spots.raid, n, sw, sh);
  // Chat is a mover: its tabs (22 tall) ride above the window.
  if (out.chat) out.chat.t += 22;
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
// at its tallest (with the leveling and DPS rows) and the bag and menu bar at its
// laid-out size (404 wide, 68 tall: the bags row over the menu row's 14 slots).
function wholeHud() {
  const addon = loggedIn(UI_ENV + ACTIONS_ENV + UNITS_ENV + RAID_ENV + SWING_ENV + TOOLS_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV + SPECIAL_BARS_ENV + "TakeTaxiNode = function() end", { firstRun: true, savedVariables: "VanguardDB = { profiles = { Default = { PartyExtras = { show = true } } } }" });
  addon.eval("Vanguard_InfoStrip:SetHeight(68)");
  addon.eval("MicroMenuContainer:Layout() BagsBar:Layout()");
  return addon;
}
// Every part's rect in a layout preset: the quest dialog only in the centered ones.
function presetRects(addon, layout, n, sw, sh) {
  const rects = layoutRects(addon, n, sw, sh);
  if (layout === "classic") delete rects.questdialog;
  return rects;
}
// Overlaps and parts off an sw x sh screen in a layout preset, for each raid growth and group size (solo, 5, 25, 40).
function problemsAt(addon, layout, sw, sh, label) {
  const bad = [];
  for (const grow of ["columns", "rows"]) {
    addon.eval(`ns.GetModule("RaidFrames").settings.layout = "${grow}"`);
    for (const n of [0, 5, 25, 40]) for (const p of layoutProblems(presetRects(addon, layout, n, sw, sh), sw, sh)) bad.push(`${label}, groups as ${grow}, ${n} players: ${p}`);
  }
  return bad;
}
it("setup layouts: nothing overlaps or leaves the screen, solo to 40-man, at UI scale 1 and pixel-perfect", () => {
  const addon = wholeHud();
  expect(addon.eval("return ChatFrame1.__points.BOTTOMLEFT ~= nil"), "chat sits in its layout spot").toBe(true);
  expect(moverSpots(addon).menustrip.slice(4, 6).map((n) => Math.round(n * 10) / 10), "the bag and menu bar hugs its 14 menu slots").toEqual([412, 82]);
  expect(["bar1", "bar2", "bar3", "cast_player", "cast_target", "cast_focus", "uf_player", "uf_target", "uf_focus", "uf_pet", "swing", "raid", "xpbar", "cdm_essential", "cdm_utility", "cdm_buffs", "damagemeter", "fighthistory", "tooltip", "infostrip", "questtracker", "flighttimer", "uf_boss1", "raidtools", "maintanks", "partyextras", "petbar", "stancebar", "chat", "questdialog"].filter((k) => !moverSpots(addon)[k]), "every part of the cluster is a mover").toEqual([]);
  expect(moverSpots(addon).questdialog.slice(3, 6), "the quest dialog is checked at its greatest size, 8 px over the focus cast bar").toEqual([346, 560, 360]);
  for (const layout of ["damage", "healing", "classic"]) {
    addon.eval(`ns.Setup.ApplyLayout("${layout}")`);
    // The bags ride over the menu in one bar, so it is no wider than the menu row and clears the bars at 1365.
    for (const [sw, sh] of [[1365, 768], [1920, 1080]]) expect(problemsAt(addon, layout, sw, sh, `${layout}, ${sw}x${sh}`)).toEqual([]);
  }
  expect(addon.eval("return { ns.Setup.HealingPoint() }")[0], "Healing centers the grid above the focus cast bar").toEqual(["BOTTOM", "BOTTOM", 0, 342]);
});
it("setup screens: with each screen preset, nothing overlaps or leaves its own screen, in every layout, solo to 40-man", () => {
  const addon = wholeHud();
  const presets = addon.eval("local out = {} for i, p in ipairs(ns.Setup.SCREENS) do out[i] = { p.key, p.w, p.h, p.ui } end return out");
  expect(presets.map((p) => p[0]), "1080p, 1440p, 4K and ultrawide").toEqual(["1080", "1440", "4k", "ultrawide"]);
  for (const [key, w, h, ui] of presets) {
    // The screen in UI units at the preset's UI scale: 768 tall at scale 1.
    const sw = (768 * w) / h / ui, sh = 768 / ui;
    for (const layout of ["damage", "healing", "classic"]) {
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
  expect(borderOf(addon, "Vanguard_Setup.pages.screen.choices[6]"), "Keep is picked, outlined in the accent").toEqual(tok(addon, "accent").slice(0, 3).concat(1));
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
    for (const layout of ["damage", "healing", "classic"]) {
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
it("Centered layout: compact raid grid, one-time migrations, a strip with nothing to show", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + "__members = 5 GetNumGroupMembers = function() return __members end");
  const RF = "ns.GetModule('RaidFrames')";
  expect(addon.eval(`return { ${RF}.Scale(5), ${RF}.Scale(25), ${RF}.Scale(40), ${RF}.Scale(60) }`), "full size up to 10, 80% up to 25, 72% above").toEqual([1, 0.8, 0.72, 0.72]);
  // The grid's scale and the point it's pinned to on the holder.
  const grid = () => addon.eval("local p = Vanguard_Raid.__points return { Vanguard_Raid:GetScale(), p.BOTTOMLEFT and 'left' or p.BOTTOMRIGHT and 'right' or p.BOTTOM and 'center' }");
  expect(grid(), "a party is full size, growing up from just above the player frame").toEqual([1, "center"]);
  addon.eval("__members = 40");
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(grid(), "a 40-man raid is drawn at 72%").toEqual([0.72, "center"]);
  addon.eval('ns.SetMoverPoint("raid", "BOTTOMRIGHT", "BOTTOMRIGHT", -20, 344)');
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(grid()[1], "moved to the right edge, it grows from there").toBe("right");
  addon.eval("ns.Setup.ApplyLayout('healing')");
  expect(grid()[1], "the healing layout centers it").toBe("center");
  addon.eval(`${RF}.settings.compact = false`);
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(grid()[0], "compact off: always full size").toBe(1);
  const old = loggedIn(ACTIONS_ENV, { savedVariables: "VanguardDB = { profiles = { Default = { ActionBars = { spacing = 4 }, DataBars = { width = 476, height = 10 } } } }" });
  expect(old.eval("local p = VanguardDB.profiles.Default return { p.ActionBars.spacing, p.DataBars.width, p.DataBars.height }"), "a profile saved with the old sizes moves to the new ones").toEqual([2, 478, 6]);
  old.eval("local p = VanguardDB.profiles.Default p.ActionBars.spacing = 4 p.DataBars.width = 476 p.DataBars.height = 10");
  expect(old.eval("local s = ns.Settings('ActionBars', ns.GetModule('ActionBars').defaults) local d = ns.Settings('DataBars', ns.GetModule('DataBars').defaults) return { s.spacing, d.width, d.height }"), "but only once: picking those sizes again keeps them").toEqual([4, 476, 10]);
  const strip = loggedIn(UNITS_ENV + STRIP_ENV, { savedVariables: "VanguardDB.profiles = { Default = { InfoStrip = { durability = false, bags = false, system = false, gold = false, ammo = false, clock = false } } }" });
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
  const old = loggedIn(ACTIONS_ENV + UNITS_ENV, { savedVariables: 'VanguardDB = { profiles = { Default = { ActionBars = { size = 36 }, DataBars = { width = 454, layout = 2 }, positions = { uf_player = { point = "BOTTOM", relPoint = "BOTTOM", x = -250, y = 180 } } } } }' });
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
