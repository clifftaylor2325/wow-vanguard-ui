// plates: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { AURA_FALLBACK, CLICK_LUA, UI_ENV, PLATE_ENV, UNITS_ENV, expectErrors, isTok, loggedIn, plate, setCombat, unitEvents } from "./helpers.mjs";

it("a nameplate first drawn in combat gets the client's aura container after the fight", () => {
  // The client built last (noAuraContainer) has no AuraContainer: its probe leaves the D-06 notice.
  expectErrors(AURA_FALLBACK);
  // No plate frames built ahead, so the plate is drawn in the fight.
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + "__units.nameplate2 = nil ns.GetModule('Nameplates').POOL = 0");
  setCombat(addon, true);
  addon.eval("__units.nameplate2 = __units.party1");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  // nameplate2's debuff row: on the engine, its frame kind, and its unit.
  const row = () => addon.eval("local f = ns.FrameState('vgPlate')[__plates.nameplate2] return { engine = f.debuffsOnEngine, kind = f.debuffs.frame.__kind, unit = f.debuffs.unit or f.debuffs.frame.__unit }");
  expect(row(), "in combat a container can't be made, so the plate gets the fallback icons").toMatchObject({ engine: false, kind: "Frame", unit: "nameplate2" });
  addon.eval("__old = ns.FrameState('vgPlate')[__plates.nameplate2].debuffs.frame");
  setCombat(addon, false);
  expect(row(), "after the fight it gets the client's own container, on the same unit").toMatchObject({ engine: true, kind: "AuraContainer", unit: "nameplate2" });
  expect(addon.eval("return __old:IsShown()"), "and the fallback row is put away").toBe(false);
  const old = loggedIn(UNITS_ENV + PLATE_ENV + "__wfgStub.noAuraContainer = true");
  setCombat(old, true);
  old.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  setCombat(old, false);
  expect(old.eval("return ns.FrameState('vgPlate')[__plates.nameplate2].debuffsOnEngine"), "a client without the container keeps the fallback").toBe(false);
});
// TEST-ONLY plates nameplate<from>..nameplate<to>, each a hostile like the target.
const morePlates = (from, to) => `for i = ${from}, ${to} do
    local p = CreateFrame("Frame", nil, UIParent)
    p.UnitFrame, p.IsForbidden = CreateFrame("Frame", nil, p), function() return false end
    __plates["nameplate" .. i], __units["nameplate" .. i] = p, __units.target
  end`;
it("nameplate frames are built ahead at login, so a pull of 30 plates builds none", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV);
  expect(addon.eval("return #ns.GetModule('Nameplates').pool"), "40 built ahead, two taken by the plates on screen at login").toBe(38);
  addon.eval(morePlates(4, 33));
  const before = addon.eval("return #__wfgStub.frames");
  for (let i = 4; i <= 33; i++) addon.fire("NAME_PLATE_UNIT_ADDED", `nameplate${i}`);
  expect(addon.eval("return #__wfgStub.frames") - before, "30 plates added: no new frame").toBe(0);
  const p = addon.eval(`local plate = __plates.nameplate20 local f = ns.FrameState('vgPlate')[plate] local at = f.__points.CENTER
    return { f:IsVisible(), f:GetParent() == plate, at.rel == plate, f.events.__unitEvents.UNIT_HEALTH[1], #ns.GetModule('Nameplates').pool }`);
  expect(p, "each frame moved onto its plate, shown, listening for its unit").toEqual([true, true, true, "nameplate20", 8]);
  addon.eval(morePlates(34, 42));
  for (let i = 34; i <= 42; i++) addon.fire("NAME_PLATE_UNIT_ADDED", `nameplate${i}`);
  expect(addon.eval("return { #ns.GetModule('Nameplates').pool, ns.FrameState('vgPlate')[__plates.nameplate42]:IsVisible() }"), "past the pool, a plate still gets a frame").toEqual([0, true]);
  expect(loggedIn(UNITS_ENV).eval("return #ns.GetModule('Nameplates').pool"), "a client without addon nameplates builds none").toBe(0);
});
it("a fallback debuff row put away after a fight is reused by the next plate drawn in one", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + "ns.GetModule('Nameplates').POOL = 0");
  addon.eval(morePlates(5, 6));
  setCombat(addon, true);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate5");
  addon.eval("__row = ns.FrameState('vgPlate')[__plates.nameplate5].debuffs");
  setCombat(addon, false);
  expect(addon.eval("return { #ns.GetModule('Nameplates').spare.debuffs, ns.FrameState('vgPlate')[__plates.nameplate5].debuffsOnEngine }"), "after the fight the plate gets the engine row and the fallback row is kept").toEqual([1, true]);
  setCombat(addon, true);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate6");
  const row = addon.eval(`local f = ns.FrameState('vgPlate')[__plates.nameplate6] local at = __row.frame.__points.BOTTOMLEFT
    return { f.debuffs == __row, __row.frame:GetParent() == f, at.rel == f, at.relPoint, __row.frame:IsShown(), __row.unit, #ns.GetModule('Nameplates').spare.debuffs }`);
  expect(row, "the next plate drawn in a fight takes it, over its own frame, on its unit").toEqual([true, true, true, "TOPLEFT", true, "nameplate6", 0]);
});
it("nameplates", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA + PLATE_ENV);
  const accent = addon.eval("return { ns.Theme.Accent() }");
  // Whether two colors have the same r, g, b.
  const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate3");
  let one = plate(addon, "nameplate1");
  expect(one.drawn && one.default === false, "our frame is drawn and the default one hidden").toBeTruthy();
  expect(one.hp?.__secret, "hidden health goes to the bar untouched").toBeTruthy();
  expect(isTok(addon, one.color, "hostile") && one.name === "TEST-ONLY Boar", "reaction color and name").toBeTruthy();
  expect(one.dot === "TEST-ONLY-DOT", "your debuffs show over the name").toBeTruthy();
  const row = addon.eval(`local c = ns.FrameState('vgPlate')[__plates.nameplate1].debuffs.frame local b = c.__groups[1].buttons[1]
    return { unit = c.__unit, timer = b.__durationText ~= nil, mouse = b.__mouse, sort = c.__groups[1].opts.sortMethod, point = c.__points.BOTTOMLEFT.relPoint }`);
  expect(row.unit === "nameplate1" && row.timer && row.mouse === false && row.point === "TOPLEFT", "a row over the plate that follows its unit, with timers, letting clicks through").toBeTruthy();
  expect(same(one.edge, accent), "your target gets an accent border (over the fill)").toBeTruthy();
  expect(addon.eval("return ns.FrameState('vgPlate')[__plates.nameplate1].glow[1]:IsShown()"), "and an accent glow around it").toBe(true);
  expect(plate(addon, "nameplate3").drawn === false && plate(addon, "nameplate3").default === true, "a plate kept from addons is left alone").toBeTruthy();
  addon.eval("__plates.nameplate1.UnitFrame:Show()");
  expect(plate(addon, "nameplate1").default === false, "the default frame stays hidden").toBeTruthy();
  addon.eval("__threat.nameplate1 = 3");
  addon.fire("UNIT_THREAT_LIST_UPDATE", "nameplate1");
  expect(isTok(addon, plate(addon, "nameplate1").color, "threat3"), "red while you have aggro").toBeTruthy();
  addon.eval("__threat.nameplate1 = { __secret = true }");
  addon.fire("UNIT_THREAT_LIST_UPDATE", "nameplate1");
  expect(isTok(addon, plate(addon, "nameplate1").color, "hostile"), "hidden threat: back to the reaction color").toBeTruthy();
  addon.eval("__cast.nameplate1 = true");
  addon.fire("UNIT_SPELLCAST_START", "nameplate1");
  expect(plate(addon, "nameplate1").cast === "TEST-ONLY Spell", "casts show under the plate").toBeTruthy();
  addon.fire("NAME_PLATE_UNIT_REMOVED", "nameplate1");
  expect(plate(addon, "nameplate1").drawn === false, "a removed plate is hidden until reused").toBeTruthy();
  addon.fire("PLAYER_ENTERING_WORLD");
  const two = plate(addon, "nameplate2");
  expect(two.drawn && two.color[0] === 1 && two.color[1] === 0.96, "after a reload, plates on screen are picked up (class color)").toBeTruthy();
  expect(!same(two.edge, accent), "only your target has the accent border").toBeTruthy();
  addon.eval('ns.Options.Show("nameplates")');
  expect(addon.eval('return __click("Threat colors while you have aggro")') && addon.eval("return VanguardDB.profiles.Default.Nameplates.threat") === false, "the options page works").toBeTruthy();
});
it("each nameplate asks the client for its own unit's events, once", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV);
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate2");
  expect(unitEvents(addon, "UNIT_HEALTH").subs, "health: one subscription per plate, for its unit").toBe("nameplate1 nameplate2");
  expect(unitEvents(addon, "UNIT_SPELLCAST_START"), "casts: each plate's own, beside the cast bars' units; nothing takes every unit's").toEqual({ subs: "nameplate1 nameplate2 player,target,focus", plain: 0 });
  addon.eval("__units.party1 = { name = 'TEST-ONLY Friend', hp = 120, maxhp = 500, reaction = 5 } __units.nameplate2 = __units.party1");
  addon.fire("UNIT_HEALTH", "nameplate2");
  expect(addon.eval("return ns.FrameState('vgPlate')[__plates.nameplate2]:GetValue()"), "a plate's own unit event repaints it").toBe(120);
  addon.fire("NAME_PLATE_UNIT_REMOVED", "nameplate1");
  expect(unitEvents(addon, "UNIT_HEALTH").subs, "a removed plate stops listening").toBe("nameplate2");
  addon.eval("__plates.nameplate5, __units.nameplate5 = __plates.nameplate1, __units.target");
  addon.fire("NAME_PLATE_UNIT_ADDED", "nameplate5");
  expect(unitEvents(addon, "UNIT_FACTION").subs, "the client reuses a plate for another unit: it listens for that one").toBe("nameplate2 nameplate5");
});
it("/vg plates reports the game's plate settings and sets the enemy one, out of combat", () => {
  const addon = loggedIn(UNITS_ENV + PLATE_ENV + "UnitCanAttack = function(_, unit) return unit == 'nameplate1' end SetCVar('nameplateShowFriendlyPlayers', 1) SetCVar('nameplateShowFriendlyNPCs', 0)");
  addon.eval("SetCVar('nameplateShowEnemies', 0)");
  addon.slash("plates");
  expect(addon.chat().join("\n"), "counts, the four settings and the hint").toMatch(/Plates: 2 drawn, 1 of them units you can attack\. .*Enemy nameplates off, Friendly players on, Friendly NPCs off, Show all unknown\.[\s\S]*The game draws no enemy plates/);
  addon.slash("plates enemies on");
  expect(addon.eval("return GetCVar('nameplateShowEnemies')"), "switched on").toBe("1");
  setCombat(addon, true);
  addon.slash("plates enemies off");
  expect(addon.eval("return GetCVar('nameplateShowEnemies')"), "not changed in a fight").toBe("1");
  setCombat(addon, false);
  expect(addon.eval("return GetCVar('nameplateShowEnemies')"), "changed once the fight ends").toBe("0");
});
it("the Nameplates page switches the game's enemy and friendly plates, out of combat", () => {
  const addon = loggedIn(UI_ENV + CLICK_LUA + "SetCVar('nameplateShowFriendlyPlayers', 1) SetCVar('nameplateShowFriendlyNPCs', 0)");
  addon.eval("SetCVar('nameplateShowEnemies', 0)");
  addon.eval('ns.Options.Show("nameplates")');
  addon.eval('__click("Enemy nameplates")');
  addon.eval('__click("Friendly players\' nameplates")');
  addon.eval('__click("Friendly NPCs\' nameplates")');
  expect(addon.eval("return { GetCVar('nameplateShowEnemies'), GetCVar('nameplateShowFriendlyPlayers'), GetCVar('nameplateShowFriendlyNPCs') }"), "each row flips the game's own setting").toEqual(["1", "0", "1"]);
  setCombat(addon, true);
  addon.eval('__click("Enemy nameplates")');
  expect(addon.eval("return GetCVar('nameplateShowEnemies')"), "not in a fight").toBe("1");
  setCombat(addon, false);
  expect(addon.eval("return GetCVar('nameplateShowEnemies')"), "once the fight ends").toBe("0");
});
it("enemy plates are turned on once per character, then left to the player", () => {
  const addon = loggedIn("SetCVar('nameplateShowEnemies', 0)");
  expect(addon.eval("return { GetCVar('nameplateShowEnemies'), VanguardCharDB.enemyPlatesSet }"), "on at the first login").toEqual(["1", true]);
  addon.eval("SetCVar('nameplateShowEnemies', 0) ns.GetModule('Nameplates').EnemyPlatesOnce()");
  expect(addon.eval("return GetCVar('nameplateShowEnemies')"), "the player turned them off: they stay off").toBe("0");
  expect(addon.eval("VanguardCharDB = nil ns.GetModule('Nameplates').EnemyPlatesOnce() return GetCVar('nameplateShowEnemies')"), "no saved settings yet: nothing changes").toBe("0");
  expect(loggedIn("SetCVar = nil").eval("return VanguardCharDB.enemyPlatesSet"), "a client without SetCVar: no error, marked done").toBe(true);
});
// TEST-ONLY the game's personal resource display (Blizzard_PersonalResourceDisplay.xml): the health, power and
// alternate power bars, each with a backdrop texture, a heal prediction texture and the three value texts.
const PRD_ENV = `
  PersonalResourceDisplayFrame = CreateFrame("Frame", "PersonalResourceDisplayFrame", UIParent)
  PersonalResourceDisplayFrame:SetSize(200, 75) PersonalResourceDisplayFrame:SetPoint("BOTTOM", UIParent, "CENTER", 0, -120) PersonalResourceDisplayFrame:Hide()
  local function bar(parent, key)
    local b = CreateFrame("StatusBar", nil, parent)
    b:SetSize(200, 12) b:SetPoint("TOP") b:SetStatusBarTexture("TEST-ONLY-BAR") b:SetStatusBarColor(0, 0, 1)
    b.bg = b:CreateTexture(nil, "BACKGROUND") b.bg:SetTexture("TEST-ONLY-BG")
    b.myHealPrediction = b:CreateTexture(nil, "BORDER") b.myHealPrediction:SetTexture("TEST-ONLY-HEAL")
    for _, k in ipairs({ "TextString", "LeftText", "RightText" }) do b[k] = b:CreateFontString(nil, "OVERLAY") b[k]:SetFont("TEST-ONLY-FRIZQT", 10, "") end
    parent[key] = b
  end
  PersonalResourceDisplayFrame.HealthBarsContainer = CreateFrame("Frame", nil, PersonalResourceDisplayFrame)
  bar(PersonalResourceDisplayFrame.HealthBarsContainer, "healthBar") bar(PersonalResourceDisplayFrame, "PowerBar") bar(PersonalResourceDisplayFrame, "AlternatePowerBar")
`;
// One of the display's bars: its backdrop's and heal prediction's alpha, its fill texture and colour, whether
// Vanguard painted a panel on it, and its value text's font (true when the theme's bold face) and flags.
const resourceBar = (addon, path) => addon.eval(`local b = PersonalResourceDisplayFrame.${path}
  local panel = 0 for _, r in ipairs({ b:GetRegions() }) do if r.__kind == "Texture" and r ~= b.bg and r ~= b.myHealPrediction and r ~= b:GetStatusBarTexture() and r:GetAlpha() ~= 0 then panel = panel + 1 end end
  local path, _, flags = b.TextString:GetFont()
  return { bg = b.bg:GetAlpha(), heal = b.myHealPrediction:GetAlpha(), fill = b:GetStatusBarTexture().__texture, color = b.__barColor, panel = panel > 0, font = path == ns.Theme.Font(true), flags = flags }`);
it("the game's personal resource display takes the plate look, and keeps its colours, values and place", () => {
  const addon = loggedIn(PRD_ENV);
  addon.eval("PersonalResourceDisplayFrame:Show()");
  const health = resourceBar(addon, "HealthBarsContainer.healthBar");
  expect(health, "the health bar: backdrop faded, the heal prediction kept, the theme's fill on a panel, the plate font").toMatchObject({ bg: 0, heal: 1, fill: addon.eval("return ns.Theme.BarTexture()"), color: [0, 0, 1, 1], panel: true, font: true, flags: "OUTLINE" });
  expect([resourceBar(addon, "PowerBar").bg, resourceBar(addon, "AlternatePowerBar").fill === health.fill], "the power and alternate power bars too").toEqual([0, true]);
  expect(addon.frame("PersonalResourceDisplayFrame").rect, "the display is neither moved nor resized").toMatchObject({ width: 200, height: 75 });
  expect(addon.eval("return PersonalResourceDisplayFrame.__points.BOTTOM.relPoint"), "it keeps the game's anchor").toBe("CENTER");
  const painted = addon.eval("return ns.Theme.PaintedCount()");
  addon.eval("PersonalResourceDisplayFrame.PowerBar.bg:SetAlpha(1) PersonalResourceDisplayFrame:Hide() PersonalResourceDisplayFrame:Show()");
  expect([resourceBar(addon, "PowerBar").bg, addon.eval("return ns.Theme.PaintedCount()")], "shown again: the art faded again, nothing painted twice").toEqual([0, painted]);
  const off = loggedIn(PRD_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Nameplates = false } } }" });
  off.eval("PersonalResourceDisplayFrame:Show()");
  expect(resourceBar(off, "PowerBar"), "with the module off the game's bars are left alone").toMatchObject({ bg: 1, fill: "TEST-ONLY-BAR", panel: false, font: false, flags: "" });
  const bare = loggedIn('PersonalResourceDisplayFrame = CreateFrame("Frame", "PersonalResourceDisplayFrame", UIParent)');
  bare.eval("PersonalResourceDisplayFrame:Show()");
  expect(bare.eval("return #ns.errors"), "a display without those bars: nothing to dress, no error").toBe(0);
});
