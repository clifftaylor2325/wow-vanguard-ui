// setup: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { ACTIONS_ENV, CLICK_LUA, RAID_ENV, STRIP_ENV, SWING_ENV, TOOLS_ENV, UI_ENV, UNITS_ENV, UP, block, borderOf, button, chatHas, healing, key, later, loggedIn, overlaps, pinned, setCombat, tok, tooltip } from "./helpers.mjs";

// Clicks one of the setup wizard's buttons (next, back or close) as the player would.
const setupClick = (addon, which) => addon.eval(`local b = ForeverUI_Setup.${which} b:GetScript("OnClick")(b, "LeftButton")`);

// The setup wizard's state: the step showing (0 while closed), the account flag, and whether frames are unlocked.
const setupState = (addon) => addon.eval("return { step = ns.Setup.Step() or 0, done = ForeverUIDB.setupDone == true, unlocked = ns.Unlocked() }");

it("first-run setup: once per account, three clicks with the defaults", () => {
  const addon = loggedIn("UISpecialFrames = {}", { firstRun: true });
  expect(setupState(addon), "a new account opens setup at step 1").toEqual({ step: 1, done: false, unlocked: false });
  expect(addon.eval("return ForeverUI_Setup.caption:GetText()"), "the caption names the step").toBe("Step 1 of 3 · Layout");
  expect(addon.eval("return ForeverUI_Setup.back:IsShown()"), "there is no Back on the first step").toBe(false);
  expect(addon.eval("return UISpecialFrames[#UISpecialFrames]"), "Escape closes setup").toBe("ForeverUI_Setup");
  setupClick(addon, "next");
  expect(setupState(addon).step === 2 && addon.eval("return ForeverUI_Setup.back:IsShown()"), "Next goes to Look, which has Back").toBe(true);
  setupClick(addon, "next");
  expect(setupState(addon), "the last step unlocks the frames").toEqual({ step: 3, done: false, unlocked: true });
  expect(addon.eval("return ForeverUI_Setup.next.text:GetText()"), "the last step's button is Done").toBe("Done");
  setupClick(addon, "next");
  expect(setupState(addon), "Done closes setup, locks the frames and remembers that setup ran").toEqual({ step: 0, done: true, unlocked: false });
  const kept = addon.eval("return { raid = ForeverUIDB.profiles.Default.positions.raid == nil, look = ns.Settings('RaidFrames').look, brass = select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.brass[1] }");
  expect(kept, "the defaults change no position, style or accent").toEqual({ raid: true, look: "soft", brass: true });
  const again = loggedIn("", { firstRun: true, savedVariables: "ForeverUIDB = { setupDone = true }" });
  expect(again.eval("return ForeverUI_Setup == nil"), "setup does not open again on this account").toBe(true);
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
  setupClick(addon, "next");
  setupClick(addon, "next");
  addon.eval("__wfgStub.inCombat = true");
  addon.fire("PLAYER_REGEN_DISABLED");
  expect(setupState(addon), "a fight hides setup and locks the frames, without finishing it").toEqual({ step: 0, done: false, unlocked: false });
  setCombat(addon, false);
  expect(setupState(addon), "after the fight setup comes back on the same step, frames unlocked").toEqual({ step: 3, done: false, unlocked: true });
  addon.slash("setup");
  expect(setupState(addon), "/fui setup starts again at step 1 and locks the frames").toEqual({ step: 1, done: false, unlocked: false });
});

it("/fui setup reopens setup; Back and the close button", () => {
  const addon = loggedIn();
  addon.slash("help");
  expect(chatHas(addon, /setup\s+first-run setup again/), "/fui help lists setup").toBe(true);
  addon.slash("setup");
  expect(setupState(addon).step, "/fui setup opens it on an account that finished setup").toBe(1);
  setupClick(addon, "next");
  setupClick(addon, "back");
  expect(setupState(addon).step, "Back returns to the previous step").toBe(1);
  setupClick(addon, "close");
  expect(setupState(addon), "the close button ends setup").toEqual({ step: 0, done: true, unlocked: false });
  const upgraded = loggedIn("", { firstRun: true, savedVariables: 'ForeverUIDB = { version = 1, profiles = { Default = { theme = { reduceMotion = true } } } }' });
  expect(setupState(upgraded).step, "an account from before setup existed sees it once").toBe(1);
  upgraded.eval("ForeverUI_Setup:Hide()");
  expect(setupState(upgraded), "Escape (the client hides the frame) ends setup too").toEqual({ step: 0, done: true, unlocked: false });
});

it("setup layouts: Healing puts the raid frames under the character and turns click casting on", () => {
  const addon = loggedIn(CLICK_LUA + UNITS_ENV + RAID_ENV, { firstRun: true });
  const layouts = addon.eval("local out = {} for i, b in ipairs(ForeverUI_Setup.pages[1].choices) do out[i] = b.text:GetText() end return out");
  expect(layouts, "there are three layouts, damage and tanking first").toEqual(["Centered: damage and tanking", "Centered: healing", "Like the game's"]);
  expect(addon.eval('return __click("Centered: healing")') && addon.eval("return ForeverUI_Setup.pages[1].hint:GetText()"), "picking Healing shows what it does").toMatch(/click casting on/);
  expect(borderOf(addon, "ForeverUI_Setup.pages[1].choices[2]"), "the chosen layout is outlined in the accent").toEqual(tok(addon, "accent").slice(0, 3).concat(1));
  setupClick(addon, "next");
  expect(addon.eval("return { ns.MoverPoint('raid') }"), "Healing centers the raid frames above your frames").toEqual(["BOTTOM", "BOTTOM", 0, 342]);
  expect(addon.eval("return ns.ModuleEnabled('ClickCast') and ns.ModuleEnabled('RaidFrames')"), "click casting and the raid frames are on").toBe(true);
  setupClick(addon, "next");
  setupClick(addon, "next");
  expect(addon.eval("return ForeverUI_Reload == nil"), "nothing was off, so no reload is offered").toBe(true);
  const off = loggedIn(CLICK_LUA, { firstRun: true, savedVariables: "ForeverUIDB = { profiles = { Default = { modules = { ClickCast = false, RaidFrames = false } } } }" });
  off.eval('__click("Centered: healing")');
  setupClick(off, "next");
  expect(off.eval("return ForeverUIDB.profiles.Default.positions.raid"), "without raid frames built, the spot is saved for next time").toEqual({ point: "BOTTOM", relPoint: "BOTTOM", x: 0, y: 342 });
  expect(off.eval("return ns.ModuleEnabled('ClickCast') and ns.ModuleEnabled('RaidFrames')"), "Healing turns click casting and the raid frames on").toBe(true);
  setupClick(off, "next");
  setupClick(off, "next");
  expect(off.eval("return ForeverUI_Reload:IsShown() and ForeverUI_Reload.title:GetText()"), "a module that was off offers a reload at the end").toMatch(/Setup turned on a module that was off/);
});

it("setup layouts: Damage and tanking restores ForeverUI's defaults, undoing Healing", () => {
  const addon = loggedIn(CLICK_LUA + UNITS_ENV + RAID_ENV, { firstRun: true });
  const home = addon.eval("return { ns.MoverPoint('raid') }");
  addon.eval('__click("Centered: healing")');
  for (let i = 0; i < 3; i += 1) setupClick(addon, "next");
  expect(addon.eval("return { ns.MoverPoint('raid') }"), "Healing moved the raid frames").not.toEqual(home);
  addon.slash("setup");
  setupClick(addon, "next");
  expect(addon.eval("return { ns.MoverPoint('raid') }"), "re-running setup with the default layout puts the raid frames back").toEqual(home);
  expect(addon.eval("return ForeverUIDB.profiles.Default.positions.raid == nil"), "and forgets the saved spot").toBe(true);
  const off = loggedIn(CLICK_LUA, { firstRun: true, savedVariables: 'ForeverUIDB = { profiles = { Default = { modules = { RaidFrames = false }, positions = { raid = { point = "TOP", relPoint = "CENTER", x = 0, y = -200 } } } } }' });
  setupClick(off, "next");
  expect(off.eval("return ForeverUIDB.profiles.Default.positions.raid == nil"), "without raid frames built, the saved spot is cleared for next time").toBe(true);
});

it("setup layouts: Like the game's puts your frames at the top left; another layout puts them back", () => {
  const addon = loggedIn(CLICK_LUA + UNITS_ENV + RAID_ENV, { firstRun: true });
  // Where the player, focus, raid and boss frames are now.
  const spots = () => addon.eval("return { { ns.MoverPoint('uf_player') }, { ns.MoverPoint('uf_focus') }, { ns.MoverPoint('raid') }, { ns.MoverPoint('uf_boss1') } }");
  const home = spots();
  expect(addon.eval('return __click("Like the game\'s") and ForeverUI_Setup.pages[1].hint:GetText()'), "picking it says what it does").toMatch(/top left as the game has them/);
  setupClick(addon, "next");
  expect(spots(), "player at the top left, focus beside the target of target, party and raid down the left, bosses on the right").toEqual([["TOPLEFT", "TOPLEFT", 20, -40], ["TOPLEFT", "TOPLEFT", 480, -94], ["BOTTOMLEFT", "BOTTOMLEFT", 20, 330], ["TOPRIGHT", "TOPRIGHT", -290, -200]]);
  expect(addon.eval("return ForeverUIDB.profiles.Default.positions.maintanks"), "frames not built yet get their spot saved for later").toEqual({ point: "TOP", relPoint: "TOP", x: 60, y: -196 });
  setupClick(addon, "next");
  setupClick(addon, "next");
  addon.slash("setup");
  addon.eval('__click("Centered: healing")');
  setupClick(addon, "next");
  expect(spots().slice(0, 2).concat([spots()[3]]), "Healing puts the frames back first").toEqual([home[0], home[1], home[3]]);
  expect([addon.eval("return ForeverUIDB.profiles.Default.positions.uf_player == nil"), spots()[2]], "and then places only the raid").toEqual([true, ["BOTTOM", "BOTTOM", 0, 342]]);
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
  targetDebuffs: ["uf_target", "below", 3, 220, 22], focusDebuffs: ["uf_focus", "below", 3, 160, 20],
};

// Every built mover's [point, relPoint, x, y, w, h], read from the addon.
const moverSpots = (addon) => addon.eval(`local out = {}
  for _, m in ipairs(ns.MoverList()) do
    local f, p, rp, x, y = ns.MoverFrame(m.key), ns.MoverPoint(m.key)
    if f then out[m.key] = { p, rp, x, y, f:GetWidth(), f:GetHeight() } end
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

// Windows that open over the HUD for a moment (talking to an NPC), so they're left out of the overlap check.
const FLOATING = new Set(["questdialog", "questlog", "lossofcontrol", "talkinghead"]);

// Parts that show only with some group sizes [fewest, most]: main tanks in a raid, party pets and targets in a party.
const ONLY_WITH = { maintanks: [6, 40], partyextras: [1, 5] };

// Whether a mover's part is on screen with n players (the raid grid is drawn on its own).
const onScreen = (key, n) => key !== "raid" && !FLOATING.has(key) && (!ONLY_WITH[key] || (n >= ONLY_WITH[key][0] && n <= ONLY_WITH[key][1]));

// Every part's rect on an sw x sh screen with n players in the group (0: solo, no grid).
function layoutRects(addon, n, sw, sh) {
  const spots = moverSpots(addon), out = {};
  for (const [key, spot] of Object.entries(spots)) if (onScreen(key, n)) out[key] = rectAt(spot.slice(0, 4), spot[4], spot[5], sw, sh);
  for (const [key, [parent, side, gap, w, h]] of Object.entries(ATTACHED)) {
    const p = out[parent];
    if (p) out[key] = side === "above" ? { l: p.l, b: p.t + gap, r: p.l + w, t: p.t + gap + h } : { l: p.l, b: p.b - gap - h, r: p.l + w, t: p.b - gap };
  }
  if (n > 0) out.raid = raidRect(addon, spots.raid, n, sw, sh);
  // Chat, where ForeverUI places it, with its tabs (22 tall) above the window.
  const chat = addon.eval("local p = ChatFrame1 and ChatFrame1.__points.BOTTOMLEFT return p and { p.x, p.y, ChatFrame1:GetWidth(), ChatFrame1:GetHeight() }");
  if (chat) out.chat = rectAt(["BOTTOMLEFT", "BOTTOMLEFT", chat[0], chat[1]], chat[2], chat[3] + 22, sw, sh);
  return out;
}

// Problems on one screen: pairs that overlap and parts off screen.
function layoutProblems(rects, sw, sh) {
  const keys = Object.keys(rects), bad = [];
  keys.forEach((a, i) => keys.slice(i + 1).forEach((c) => { if (overlaps(rects[a], rects[c])) bad.push(`${a} / ${c}`); }));
  keys.forEach((k) => { const r = rects[k]; if (r.l < 0 || r.b < 0 || r.r > sw || r.t > sh) bad.push(`${k} off screen`); });
  return bad;
}

it("setup layouts: nothing overlaps or leaves the screen, solo to 40-man, at UI scale 1 and pixel-perfect", () => {
  const addon = loggedIn(UI_ENV + ACTIONS_ENV + UNITS_ENV + RAID_ENV + SWING_ENV + TOOLS_ENV + "TakeTaxiNode = function() end", { firstRun: true, savedVariables: "ForeverUIDB = { profiles = { Default = { PartyExtras = { show = true } } } }" });
  expect(addon.eval("return ChatFrame1.__points.BOTTOMLEFT ~= nil"), "chat sits in its layout spot").toBe(true);
  addon.eval("ForeverUI_InfoStrip:SetHeight(68)"); // the info strip at its tallest, with the leveling and DPS rows
  expect(["bar1", "bar2", "bar3", "cast_player", "cast_target", "cast_focus", "uf_player", "uf_target", "uf_focus", "uf_pet", "swing", "raid", "xpbar", "cdm_essential", "cdm_utility", "cdm_buffs", "damagemeter", "tooltip", "infostrip", "questtracker", "flighttimer", "uf_boss1", "raidtools", "maintanks", "partyextras"].filter((k) => !moverSpots(addon)[k]), "every part of the cluster is a mover").toEqual([]);
  for (const layout of ["damage", "healing", "classic"]) {
    addon.eval(`ns.Setup.ApplyLayout("${layout}")`);
    for (const grow of ["columns", "rows"]) {
      addon.eval(`ns.GetModule("RaidFrames").settings.layout = "${grow}"`);
      for (const [sw, sh] of [[1365, 768], [1920, 1080]]) {
        for (const n of [0, 5, 25, 40]) expect(layoutProblems(layoutRects(addon, n, sw, sh), sw, sh), `${layout}, groups as ${grow}, ${sw}x${sh}, ${n} players`).toEqual([]);
      }
    }
  }
  expect(addon.eval("return { ns.Setup.HealingPoint() }")[0], "Healing centers the grid above the focus cast bar").toEqual(["BOTTOM", "BOTTOM", 0, 342]);
});

it("setup look: accent swatches and the raid frame style apply at once", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV, { firstRun: true });
  setupClick(addon, "next");
  expect(borderOf(addon, "ForeverUI_Setup.pages[2].swatches[1]"), "the current accent (brass) is outlined").toEqual(tok(addon, "accent").slice(0, 3).concat(1));
  addon.eval("local s = ForeverUI_Setup.pages[2].swatches[2] s:GetScript('OnClick')(s)");
  expect(addon.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.arcane[1]"), "the second swatch sets the arcane accent").toBe(true);
  expect(borderOf(addon, "ForeverUI_Setup.pages[2].swatches[1]"), "brass is no longer outlined").toEqual(tok(addon, "edge").slice(0, 4));
  expect(addon.eval("local p = ForeverUI_Setup.pages[2] return { p.swatches[1].check:IsShown(), p.swatches[2].check:IsShown() }"), "the check moves to the chosen swatch").toEqual([false, true]);
  addon.eval("local b = ForeverUI_Setup.pages[2].styles[2] b:GetScript('OnClick')(b)");
  expect(addon.eval("return ns.Settings('RaidFrames').look"), "a style button sets the raid frame style").toBe("dark");
  expect(borderOf(addon, "ForeverUI_Setup.pages[2].styles[2]"), "the chosen style is outlined").toEqual(tok(addon, "accent").slice(0, 3).concat(1));
});

it("Centered layout: compact raid grid, one-time migrations, a strip with nothing to show", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + "__members = 5 GetNumGroupMembers = function() return __members end");
  const RF = "ns.GetModule('RaidFrames')";
  expect(addon.eval(`return { ${RF}.Scale(5), ${RF}.Scale(25), ${RF}.Scale(40), ${RF}.Scale(60) }`), "full size up to 10, 80% up to 25, 72% above").toEqual([1, 0.8, 0.72, 0.72]);
  // The grid's scale and the point it's pinned to on the holder.
  const grid = () => addon.eval("local p = ForeverUI_Raid.__points return { ForeverUI_Raid:GetScale(), p.BOTTOMLEFT and 'left' or p.BOTTOMRIGHT and 'right' or p.BOTTOM and 'center' }");
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
  const old = loggedIn(ACTIONS_ENV, { savedVariables: "ForeverUIDB = { profiles = { Default = { ActionBars = { spacing = 4 }, DataBars = { width = 476, height = 10 } } } }" });
  expect(old.eval("local p = ForeverUIDB.profiles.Default return { p.ActionBars.spacing, p.DataBars.width, p.DataBars.height }"), "a profile saved with the old sizes moves to the new ones").toEqual([2, 454, 6]);
  old.eval("local p = ForeverUIDB.profiles.Default p.ActionBars.spacing = 4 p.DataBars.width = 476 p.DataBars.height = 10");
  expect(old.eval("local s = ns.Settings('ActionBars', ns.GetModule('ActionBars').defaults) local d = ns.Settings('DataBars', ns.GetModule('DataBars').defaults) return { s.spacing, d.width, d.height }"), "but only once: picking those sizes again keeps them").toEqual([4, 476, 10]);
  const strip = loggedIn(UNITS_ENV + STRIP_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { InfoStrip = { durability = false, bags = false, system = false, gold = false, ammo = false, clock = false } } }" });
  expect(strip.eval("return ForeverUI_InfoStrip:IsShown()"), "a strip with every block off isn't drawn as an empty box").toBe(false);
  const chatFree = loggedIn(UI_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { Chat = { place = false } } }" });
  expect(chatFree.eval("return ChatFrame1.__points.BOTTOMLEFT == nil"), "with Keep chat in its spot off, chat stays where the game puts it").toBe(true);
});
