// strips: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, expectErrors, HEALING_ENV, MICRO_ENV, PLATE_ENV, RAID_ENV, STRIPS_ENV, STRIP_ENV, TIDY_ENV, UI_ENV, UNITS_ENV, block, borderOf, isTok, later, loggedIn, pinned, putAway, setCombat, strips } from "./helpers.mjs";

// TEST-ONLY damage meter: someone else's line, then yours at 1234.5 per second.
const DPS_ENV = `
  __dps = { combatSources = { { isLocalPlayer = false, amountPerSecond = 999 }, { isLocalPlayer = true, amountPerSecond = 1234.5 } } }
  Enum = Enum or {} Enum.DamageMeterSessionType = { Current = 1 } Enum.DamageMeterType = { Dps = 1 }
  C_DamageMeter = { GetCombatSessionFromType = function(kind, what) __asked = { kind, what } return __dps end }
`;
it("the info strip: your DPS in the last fight, from the game's damage meter", () => {
  const addon = loggedIn(UNITS_ENV + DPS_ENV + CLICK_LUA);
  const before = addon.eval("return Vanguard_InfoStrip:GetHeight()");
  expect(block(addon, "dps").shown, "off until you turn it on").toBe(false);
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  addon.eval(`__click("Your DPS in the last fight (from the game's damage meter)")`);
  expect([block(addon, "dps").text, addon.eval("return __asked"), addon.eval("return Vanguard_InfoStrip:GetHeight()")], "your line's figure, the current fight's DPS, on a fourth row").toEqual(["1.2K dps", [1, 1], 68]);
  setCombat(addon, true);
  addon.eval("__dps.combatSources[2].amountPerSecond = 2500");
  addon.fire("DAMAGE_METER_RESET");
  expect(addon.eval("return ns.GetModule('InfoStrip').DPS()"), "in a fight it isn't read (the client hides it)").toBe(null);
  setCombat(addon, false);
  expect(block(addon, "dps").text, "when the fight ends it shows that fight's").toBe("2.5K dps");
  // Runs lua, ends a fight, and says whether the DPS block shows.
  const hidden = (lua) => { addon.eval(lua); addon.fire("PLAYER_REGEN_ENABLED"); return block(addon, "dps").shown; };
  expect([hidden("__dps.combatSources[2].amountPerSecond = { __secret = true }"), hidden("__dps = { __secret = true }"), hidden("__dps = {}"), hidden("__dps = nil")], "hidden figures, a hidden fight, no fight: nothing shows").toEqual([false, false, false, false]);
  expect(addon.eval("return Vanguard_InfoStrip:GetHeight()"), "and the fourth row goes").toBe(before);
  addon.eval("Enum = Enum or {} Enum.DamageMeterSessionType = { Current = 1 } Enum.DamageMeterType = { Dps = 1 } __dps = { combatSources = { { isLocalPlayer = true, amountPerSecond = 0 } } }");
  expect(hidden(""), "no damage done: nothing shows").toBe(false);
  addon.eval("__asked = nil Enum.DamageMeterSessionType = nil Enum.DamageMeterType = nil");
  expect([addon.eval("return ns.GetModule('InfoStrip').DPS()"), addon.eval("return __asked")], "without the client's enums the meter is not asked with guessed numbers").toEqual([null, null]);
  const bare = loggedIn(UNITS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { InfoStrip = { dps = true } } }" });
  bare.fire("PLAYER_REGEN_ENABLED");
  expect(block(bare, "dps").shown, "a client without the damage meter shows nothing").toBe(false);
});
it("the info strip: your place in the last fight's DPS, in a group", () => {
  const addon = loggedIn(UNITS_ENV + DPS_ENV + CLICK_LUA);
  expect(block(addon, "rank").shown, "off until you turn it on").toBe(false);
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  addon.eval(`__click("Your place in the last fight's DPS")`);
  expect([block(addon, "rank").text, isTok(addon, block(addon, "rank").color, "text2"), addon.eval("return Vanguard_InfoStrip:GetHeight()")], "second of two, on the fourth row").toEqual(["#2 of 2", true, 68]);
  addon.eval("__dps.combatSources = { __dps.combatSources[2], __dps.combatSources[1], { isLocalPlayer = false } }");
  addon.fire("PLAYER_REGEN_ENABLED");
  expect([block(addon, "rank").text, isTok(addon, block(addon, "rank").color, "gold")], "at the top of three, in gold").toEqual(["#1 of 3", true]);
  // Ends a fight after lua and says whether the place shows.
  const shown = (lua) => { addon.eval(lua); addon.fire("DAMAGE_METER_RESET"); return block(addon, "rank").shown; };
  expect([shown("__dps.combatSources = { __dps.combatSources[1] }"), shown("__dps.combatSources = { { isLocalPlayer = false }, { isLocalPlayer = false } }"), shown("__dps = { __secret = true }")],
    "alone, not in the list, or a hidden fight: nothing shows").toEqual([false, false, false]);
  const bare = loggedIn(UNITS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { InfoStrip = { rank = true } } }" });
  bare.eval("Enum = Enum or {} Enum.DamageMeterSessionType = { Current = 1 } Enum.DamageMeterType = { Dps = 1 } C_DamageMeter = { GetCombatSessionFromType = function() __asked = true return { combatSources = { { isLocalPlayer = true }, {} } } end }");
  bare.fire("PLAYER_REGEN_ENABLED");
  expect([block(bare, "rank").shown, bare.eval("return __asked == nil")], "a client whose meter had no enums at login is not asked").toEqual([false, true]);
});
it("the info strip's fight reads, shared with Fight history: your line and the fight's length", () => {
  const addon = loggedIn("Enum.DamageMeterSessionType = { Current = 1 } Enum.DamageMeterType = { Dps = 1 }");
  // Your line's DPS, its place and the list's length, and the fight's seconds (false for none).
  const read = () => addon.eval("local IS = ns.GetModule('InfoStrip') local line, place, count = IS.MyLine() return { line and line.amountPerSecond or false, place or false, count or false, IS.FightSeconds() or false }");
  expect(read(), "no fight yet: nothing").toEqual([false, false, false, false]);
  addon.eval("__wfgWorld.damageSession = { combatSources = { { isLocalPlayer = false, amountPerSecond = 500 }, { isLocalPlayer = true, amountPerSecond = 412 } }, durationSeconds = 83 }");
  expect(read(), "second of two at 412, in an 83 s fight").toEqual([412, 2, 2, 83]);
  addon.eval("__wfgWorld.damageSession.durationSeconds = nil __wfgWorld.damageSeconds = 61");
  expect(read()[3], "the meter's own figure when the session has none").toBe(61);
  addon.eval("__wfgWorld.damageSession.durationSeconds = __wfgWorld.secret(83) __wfgWorld.damageSeconds = __wfgWorld.secret(83)");
  expect(read()[3], "a hidden length is not read").toBe(false);
  addon.eval("__wfgWorld.damageSession.durationSeconds = nil C_DamageMeter.GetSessionDurationSeconds = nil");
  expect(read()[3], "a client without the meter's figure").toBe(false);
  setCombat(addon, true);
  expect(read(), "in a fight nothing is read").toEqual([false, false, false, false]);
});
it("the info strip under the minimap", () => {
  const addon = loggedIn(UNITS_ENV + STRIP_ENV + CLICK_LUA);
  const dur = block(addon, "durability");
  expect(dur.text === "9%" && isTok(addon, dur.color, "bad"), "your most worn item, red at 10% or less").toBe(true);
  addon.eval("__dur[7] = { 50, 100 } __dur[1] = { 20, 100 }");
  addon.fire("UPDATE_INVENTORY_DURABILITY");
  expect(isTok(addon, block(addon, "durability").color, "warn"), "orange at 25% or less").toBe(true);
  addon.eval("__dur[1] = { 90, 100 }");
  addon.fire("UPDATE_INVENTORY_DURABILITY");
  expect(block(addon, "durability").text === "50%" && isTok(addon, block(addon, "durability").color, "text"), "plain above that").toBe(true);
  expect(block(addon, "bags").text, "free slots across the five bags").toBe("12 free");
  expect([block(addon, "system").text, block(addon, "gold").text, block(addon, "clock").text], "fps and latency, gold, the time").toEqual(["58 fps  64 ms", "12g 34s 7c", "21:04"]);
  expect(block(addon, "ammo").shown, "a mage carries no ammo").toBe(false);
  addon.eval("__fps = 30 __money = 507 __wfgStub.advance(1.1)");
  expect(block(addon, "system").text, "fps waits for the third second").toBe("58 fps  64 ms");
  addon.eval("__wfgStub.advance(2.2)");
  addon.fire("PLAYER_MONEY");
  expect([block(addon, "system").text, block(addon, "gold").text], "then updates; under a gold, no gold part").toEqual(["30 fps  64 ms", "5s 7c"]);
  addon.eval("C_Container.GetContainerNumFreeSlots = function() return 0 end");
  addon.fire("BAG_UPDATE_DELAYED");
  expect(isTok(addon, block(addon, "bags").color, "bad"), "full bags are red").toBe(true);
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  expect(addon.eval('return __click("Clock")') && block(addon, "clock").shown, "a block turns off at once").toBe(false);
  expect(addon.eval('return { ns.MoverPoint("infostrip") }'), "the strip is movable, under the minimap").toEqual(["TOPRIGHT", "TOPRIGHT", -12, -200]);
});
it("the info strip: ammo, and clients that can't answer", () => {
  const hunter = loggedIn(UNITS_ENV + STRIP_ENV + '__units.player.class = "HUNTER"');
  expect(block(hunter, "ammo").text, "a hunter's ammo").toBe("ammo 412");
  hunter.eval("__ammo = 0");
  hunter.fire("UNIT_INVENTORY_CHANGED", "player");
  expect(block(hunter, "ammo").text === "ammo 0" && isTok(hunter, block(hunter, "ammo").color, "bad"), "out of ammo is red").toBe(true);
  hunter.eval('__units.player.class = "WARRIOR"');
  hunter.fire("BAG_UPDATE_DELAYED");
  expect(block(hunter, "ammo").shown, "a warrior with none shows nothing").toBe(false);
  hunter.eval('UnitClass = function() return "x", { __secret = true } end');
  hunter.fire("BAG_UPDATE_DELAYED");
  expect(block(hunter, "ammo").shown, "a hidden class shows nothing").toBe(false);
  const bare = loggedIn(UNITS_ENV + "GetMoney = function() return { __secret = true } end GetInventoryItemDurability = nil C_Container = nil GetFramerate = nil GetNetStats = nil");
  expect(["durability", "bags", "system", "gold", "clock"].map((k) => block(bare, k).shown), "no answer, no block").toEqual([false, false, false, false, false]);
});
it("the info strip: a warlock's soul shards, across the bags and the reagent bag", () => {
  const SHARDS = `__units.player.class = "WARLOCK" issecretvalue = function(v) return type(v) == "table" and v.__secret == true end
    __wfgWorld.bags[1][3] = { itemID = 6265 } __wfgWorld.bags[2][1] = { itemID = 2589, count = 5 }
    __wfgWorld.bags[5], __wfgWorld.bagSizes[5] = { [2] = { itemID = 6265, count = 2 } }, 4
`;
  const addon = loggedIn(UNITS_ENV + SHARDS + CLICK_LUA);
  expect([block(addon, "shards").text, block(addon, "ammo").shown], "three shards (one in a bag, two in the reagent bag), where ammo would be").toEqual(["shards 3", false]);
  addon.eval("__wfgWorld.bags[1][3] = nil __wfgWorld.bags[5][2] = nil");
  addon.fire("BAG_UPDATE_DELAYED");
  expect(block(addon, "shards").text === "shards 0" && isTok(addon, block(addon, "shards").color, "bad"), "none left is red").toBe(true);
  addon.eval("__wfgWorld.bags[1][3] = { itemID = { __secret = true } }");
  addon.fire("BAG_UPDATE_DELAYED");
  expect(block(addon, "shards").text, "a hidden item doesn't count").toBe("shards 0");
  addon.slash("");
  addon.eval('__click("Bars, map, chat")');
  expect(addon.eval('return __click("Soul shards (warlocks)")') && block(addon, "shards").shown, "a switch turns it off at once").toBe(false);
  expect(block(loggedIn(UNITS_ENV + SHARDS + "C_Container.GetContainerItemInfo = nil"), "shards").shown, "a client that can't list bag items shows nothing").toBe(false);
  expect(block(loggedIn(UNITS_ENV), "shards").shown, "a mage carries no shards").toBe(false);
  expect(block(loggedIn(UNITS_ENV + 'UnitClass = function() return "x", { __secret = true } end'), "shards").shown, "a hidden class shows nothing").toBe(false);
});
// TEST-ONLY flight points: you stand at node 1, node 2 is a destination.
const TAXI_ENV = `
  __onTaxi = false
  hooksecurefunc = function(name, fn) local orig = _G[name] _G[name] = function(...) orig(...) fn(...) end end
  NumTaxiNodes = function() return 2 end
  TaxiNodeGetType = function(i) return i == 1 and "CURRENT" or "REACHABLE" end
  TaxiNodeName = function(i) return i == 1 and "TEST-ONLY Landing" or "TEST-ONLY Outpost" end
  TakeTaxiNode = function() end
  UnitOnTaxi = function() return __onTaxi end
`;
// The flight bar: shown, its text, value and max.
const flightBar = (addon) => addon.eval("local b = Vanguard_FlightTimer return { shown = b:IsShown(), text = b.text:GetText(), value = b:GetValue(), max = select(2, b:GetMinMaxValues()) }");
it("flight timer: the first flight is timed, the next counts down", () => {
  const addon = loggedIn(UNITS_ENV + TAXI_ENV);
  expect(flightBar(addon).shown, "no bar until a flight").toBe(false);
  addon.eval("TakeTaxiNode(2) __onTaxi = true __wfgStub.advance(1)");
  expect(flightBar(addon), "a route never flown: timing it").toMatchObject({ shown: true, text: "Timing this flight to TEST-ONLY Outpost" });
  addon.eval("__wfgStub.advance(90) __onTaxi = false __wfgStub.advance(1)");
  expect([flightBar(addon).shown, addon.eval('return VanguardDB.profiles.Default.Errands.flights["TEST-ONLY Landing > TEST-ONLY Outpost"]')], "landing saves the time and hides the bar").toEqual([false, 91]);
  addon.eval("TakeTaxiNode(2) __onTaxi = true __wfgStub.advance(1)");
  addon.eval("__wfgStub.advance(30)");
  expect(flightBar(addon), "the same route again counts down").toMatchObject({ shown: true, text: "TEST-ONLY Outpost  1:01", max: 91 });
  addon.eval("__onTaxi = false __wfgStub.advance(1)");
  addon.eval("TakeTaxiNode(2) __wfgStub.advance(12)");
  expect(addon.eval('return ns.GetModule("Errands").flight'), "a flight that never takes off is forgotten").toBe(null);
  addon.eval('TaxiNodeGetType = function() return { __secret = true } end TakeTaxiNode(2)');
  expect(addon.eval('return ns.GetModule("Errands").flight'), "no route when the start is hidden").toBe(null);
  expect(addon.eval("return { ns.MoverPoint('flighttimer') }"), "the bar is movable, above the cluster").toEqual(["BOTTOM", "BOTTOM", 0, 312]);
  const bare = loggedIn("");
  expect(bare.eval("return Vanguard_FlightTimer == nil and ns.GetModule('Errands').settings ~= nil"), "a client without taxi calls loads cleanly").toBe(true);
});
// TEST-ONLY model of the Forever game menu: pooled buttons numbered from 1 by InitButtons on every
// show, then a layout that orders the shown children by layoutIndex (LayoutFrame.lua).
const FOREVER_MENU_ENV = `
  HideUIPanel = function(f) f:Hide() end
  local hookAll = hooksecurefunc
  hooksecurefunc = function(t, ...) if t == GameMenuFrame then __hooked = true end return hookAll(t, ...) end
  __calls = { AddButton = 0, AddSection = 0, MarkDirty = 0 }
  GameMenuFrame = CreateFrame("Frame", "GameMenuFrame", UIParent) GameMenuFrame:Hide()
  GameMenuFrame.buttonTemplate = "GameMenuFrameButtonTemplate"
  function GameMenuFrame:Reset()
    self.nextLayoutIndex = 1
    for _, c in ipairs({ self:GetChildren() }) do
      if c.layoutIndex and c.layoutIndex >= 1 then c:Hide() c.layoutIndex = nil end
    end
  end
  function GameMenuFrame:AddButton(text, fn)
    __calls.AddButton = __calls.AddButton + 1
    local b = CreateFrame("Button", nil, self, self.buttonTemplate)
    b:SetText(text) b:SetScript("OnClick", fn)
    b.layoutIndex = self.nextLayoutIndex self.nextLayoutIndex = self.nextLayoutIndex + 1
    return b
  end
  function GameMenuFrame:AddSection() __calls.AddSection = __calls.AddSection + 1 end
  function GameMenuFrame:InitButtons()
    self:Reset() self:AddButton("Options", function() end) self:AddSection() self:AddButton("Return to Game", function() end)
  end
  function GameMenuFrame:MarkDirty() __calls.MarkDirty = __calls.MarkDirty + 1 end
  function GameMenuFrame:Layout()
    local kids = {}
    for _, c in ipairs({ self:GetChildren() }) do if c:IsShown() and c.layoutIndex then kids[#kids + 1] = c end end
    table.sort(kids, function(a, b) return a.layoutIndex < b.layoutIndex end)
    self.order = {}
    for i, c in ipairs(kids) do self.order[i] = c:GetText() or c.text:GetText() end
  end
  GameMenuFrame:SetScript("OnShow", function(self) self:InitButtons() self:Layout() end)
`;
it("a Vanguard button on the game menu opens the options", () => {
  const addon = loggedIn(FOREVER_MENU_ENV);
  expect(addon.eval("return { __calls.AddButton, __calls.AddSection, __calls.MarkDirty, __hooked == true }"), "no AddButton or AddSection, one MarkDirty; the one InitButtons hook is the Windows skin's").toEqual([0, 0, 1, true]);
  expect(addon.eval("local b = ns.gameMenuButton return { b.layoutIndex, b.bottomPadding, b:GetParent() == GameMenuFrame, b.__template, b:GetText(), b:IsShown() }"), "the menu's own template, first index, section gap under it").toEqual([0, 20, true, "GameMenuFrameButtonTemplate", "Vanguard", true]);
  addon.eval("GameMenuFrame:Show()");
  expect(addon.eval("return GameMenuFrame.order"), "first in the menu, above Options").toEqual(["Vanguard", "Options", "Return to Game"]);
  expect(addon.eval("local m = math.huge for _, c in ipairs({ GameMenuFrame:GetChildren() }) do if c ~= ns.gameMenuButton and c.layoutIndex then m = math.min(m, c.layoutIndex) end end return ns.gameMenuButton.layoutIndex < m"), "lower than every pooled button's layoutIndex").toBe(true);
  addon.eval("GameMenuFrame:Hide() GameMenuFrame:Show()");
  expect(addon.eval("local n = 0 for _, c in ipairs({ GameMenuFrame:GetChildren() }) do if c.GetText and c:GetText() == 'Vanguard' then n = n + 1 end end return { GameMenuFrame.order[1], n, __calls.AddButton }"), "still first on the next open, one button, AddButton only from the game").toEqual(["Vanguard", 1, 4]);
  addon.eval("ns.gameMenuButton:GetScript('OnClick')(ns.gameMenuButton)");
  expect(addon.eval("return { GameMenuFrame:IsShown(), Vanguard_Options and Vanguard_Options:IsShown() or ns.Options.current ~= nil }"), "clicking it closes the menu and opens the options").toEqual([false, true]);
  const old = loggedIn("GameMenuFrame = CreateFrame('Frame', 'GameMenuFrame', UIParent)");
  expect(old.eval("local b = ns.gameMenuButton return { b.text:GetText(), b.__points.TOP.rel == GameMenuFrame, b.layoutIndex == nil }"), "an older menu gets a themed button just under it, not laid out").toEqual(["Vanguard", true, true]);
  old.eval("HideUIPanel = function(f) f:Hide() end ns.gameMenuButton.__scripts.OnClick()");
  expect(old.eval("return GameMenuFrame:IsShown()"), "which closes the menu too").toBe(false);
  expect(loggedIn("").eval("return ns.gameMenuButton == nil"), "no game menu, nothing added").toBe(true);
});
// TEST-ONLY the game menu's button pool (AddButton takes from it, Reset empties it; each button has template art)
// and its header plate, as MainMenuFrameTemplates.lua and DialogHeaderTemplate make them.
const MENU_POOL_ENV = `
  GameMenuFrame.buttonPool = { __active = {} }
  function GameMenuFrame.buttonPool:EnumerateActive() return next, self.__active end
  local add, reset = GameMenuFrame.AddButton, GameMenuFrame.Reset
  function GameMenuFrame:AddButton(...) local b = add(self, ...) b.Left = b:CreateTexture(nil, "BACKGROUND") self.buttonPool.__active[b] = true return b end
  function GameMenuFrame:Reset() reset(self) self.buttonPool.__active = {} end
  local header = CreateFrame("Frame", nil, GameMenuFrame)
  header.LeftBG, header.RightBG, header.CenterBG = header:CreateTexture(), header:CreateTexture(), header:CreateTexture()
  header.Text = header:CreateFontString()
  GameMenuFrame.Header = header
`;
it("game menu: buttons made after the skin ran are skinned once, Vanguard's matches, the header plate is gone", () => {
  const addon = loggedIn(FOREVER_MENU_ENV + MENU_POOL_ENV);
  addon.eval("__spy = 0 local real = ns.Theme.Button ns.Theme.Button = function(...) __spy = __spy + 1 return real(...) end");
  addon.eval("GameMenuFrame:Show()");
  // The alpha of a menu button's template art.
  const look = (path) => addon.eval(`local b = ${path} return { b.Left and b.Left.__alpha }`);
  expect(addon.eval("return __spy"), "Vanguard's button and the two pooled ones are skinned when the menu opens").toBe(3);
  expect(borderOf(addon, "ns.gameMenuButton"), "Vanguard's button is painted like a pooled one").toEqual(borderOf(addon, "next(GameMenuFrame.buttonPool.__active)"));
  expect(look("next(GameMenuFrame.buttonPool.__active)"), "a pooled button's template art is faded").toEqual([0]);
  addon.eval("GameMenuFrame:Hide() GameMenuFrame:Show()");
  expect(addon.eval("return __spy"), "the next open makes two new buttons: only those are skinned").toBe(5);
  addon.eval("GameMenuFrame:Hide() GameMenuFrame.buttonPool.__active = {} GameMenuFrame:Show()");
  expect(addon.eval("local n = 0 for b in GameMenuFrame.buttonPool:EnumerateActive() do if ns.FrameState('vgMenuSkinned')[b] then n = n + 1 end end return n"), "every active button carries the skin").toBe(2);
  const head = addon.eval("local h = GameMenuFrame.Header local p = h.__points.TOP return { h.LeftBG:IsShown(), h.RightBG:IsShown(), h.CenterBG:IsShown(), h.Text.__font ~= nil, p.rel == GameMenuFrame, p.y }");
  expect(head, "the header plate is hidden, its title in the theme font, inside the panel").toEqual([false, false, false, true, true, -8]);
  const off = loggedIn(FOREVER_MENU_ENV + MENU_POOL_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Windows = { windows = false } } }" });
  off.eval("GameMenuFrame:Show()");
  expect([borderOf(off, "ns.gameMenuButton") == null, off.eval("return GameMenuFrame.Header.LeftBG:IsShown()")], "with the windows switched off the menu stays the game's").toEqual([true, true]);
});
it("game menu button: falls back, or goes without what the menu lacks", () => {
  expectErrors(/^GameMenu: wow-world\.lua:\d+: CreateFrame: unknown template NoSuchTemplate$/);
  const broken = loggedIn(FOREVER_MENU_ENV + 'GameMenuFrame.buttonTemplate = "NoSuchTemplate"');
  expect(broken.eval("local b = ns.gameMenuButton return { b.text:GetText(), b.__points.TOP.rel == GameMenuFrame, ns.errors[#ns.errors].text:match('^GameMenu:') ~= nil }"), "a template that can't be built: themed button under the menu, one logged error").toEqual(["Vanguard", true, true]);
  const plain = loggedIn(FOREVER_MENU_ENV + "GameMenuFrame.buttonTemplate = nil");
  expect(plain.eval("GameMenuFrame:Show() local b = ns.gameMenuButton return { b.text:GetText(), b.layoutIndex, b:GetWidth(), GameMenuFrame.order[1] }"), "a layout menu without a template gets a themed button, still first").toEqual(["Vanguard", 0, 200, "Vanguard"]);
  const clean = loggedIn(FOREVER_MENU_ENV + "GameMenuFrame.MarkDirty = nil");
  expect(clean.eval("GameMenuFrame:Show() local n = 0 for _, e in ipairs(ns.errors) do if e.text:match('^GameMenu:') then n = n + 1 end end return { GameMenuFrame.order[1], n }"), "a layout menu without MarkDirty still gets the button first, no GameMenu error").toEqual(["Vanguard", 0]);
});
// TEST-ONLY leveling numbers: level 10 of 60, 1000 of 5000 XP into the level.
const LEVEL_ENV = `
  __xp, __xpmax, __rested, __level = 1000, 5000, 2500, 10
  UnitXP = function() return __xp end
  UnitXPMax = function() return __xpmax end
  GetXPExhaustion = function() return __rested end
  UnitLevel = function() return __level end
  GetMaxPlayerLevel = function() return 60 end
`;
it("the info strip: XP and gold per hour, and time to level", () => {
  const addon = loggedIn(UNITS_ENV + STRIP_ENV + LEVEL_ENV);
  // Whether each leveling block shows.
  const rates = () => ["xprate", "leveltime", "goldrate"].map((k) => block(addon, k).shown);
  // The strip's height (two rows, or three with the leveling row).
  const height = () => addon.eval("return Vanguard_InfoStrip:GetHeight()");
  expect([rates(), height()], "nothing to say yet: two rows").toEqual([[false, false, false], 36]);
  addon.eval("__xp = 1900");
  addon.fire("PLAYER_XP_UPDATE", "player");
  later(addon, 10);
  addon.fire("PLAYER_XP_UPDATE", "player");
  expect(rates(), "the first minute's numbers jump about, so they wait").toEqual([false, false, false]);
  later(addon, 1790);
  addon.fire("PLAYER_XP_UPDATE", "player");
  expect([block(addon, "xprate").text, block(addon, "leveltime").text, height()], "900 XP in half an hour; the strip grows a row").toEqual(["1.8K xp/h", "lvl 1h 44m", 52]);
  addon.eval("__xp, __xpmax, __rested = 200, 6000, nil");
  addon.fire("PLAYER_XP_UPDATE", "player");
  expect([block(addon, "xprate").text, block(addon, "leveltime").text], "a level-up counts the old level's rest too").toEqual(["8.4K xp/h", "lvl 42m"]);
  addon.eval("__money = 128407");
  addon.fire("PLAYER_MONEY");
  const gold = block(addon, "goldrate");
  expect(gold.text === "+1g 0s/h" && isTok(addon, gold.color, "gold"), "gold earned per hour").toBe(true);
  addon.eval("__money = 123207 __wfgStub.advance(5)");
  const spent = block(addon, "goldrate");
  expect(/^-3s 9\dc\/h$/.test(spent.text) && isTok(addon, spent.color, "bad"), "the timer repaints the rates; spending shows red").toBe(true);
  addon.eval("__level = 60");
  addon.fire("PLAYER_LEVEL_UP");
  expect(rates(), "no XP numbers at the level cap").toEqual([false, false, true]);
  addon.eval("__money = 123407");
  addon.fire("PLAYER_MONEY");
  expect([rates(), height()], "no change in gold, no gold rate; back to two rows").toEqual([[false, false, false], 36]);
  addon.eval('__level = 20 __xp = { __secret = true }');
  addon.fire("PLAYER_XP_UPDATE", "player");
  expect(rates(), "hidden XP: the rate so far stays, the time to level hides").toEqual([true, false, false]);
  expect(addon.eval('local IS = ns.GetModule("InfoStrip") return { IS.ShortMoney(5), IS.ShortMoney(507), IS.Duration(30) }'), "short money and times").toEqual(["5c", "5s 7c", "1m"]);
});
it("flight timer: the taxi check runs only from picking a flight until it lands", () => {
  const addon = loggedIn(UNITS_ENV + TAXI_ENV + "__asked = 0 local real = UnitOnTaxi UnitOnTaxi = function(...) __asked = __asked + 1 return real(...) end");
  // How often the taxi state was asked so far, then reset.
  const asked = () => addon.eval("local n = __asked __asked = 0 return n");
  addon.advance(60);
  expect([asked(), addon.eval('return ns.ticker.vgJobs["flight poll"] ~= nil')], "a minute on the ground with no flight picked: never asked").toEqual([0, false]);
  addon.eval("TakeTaxiNode(2) __onTaxi = true");
  addon.advance(5);
  expect([asked(), flightBar(addon).shown], "in the air: asked twice a second, the bar up").toEqual([10, true]);
  addon.eval("__onTaxi = false");
  addon.advance(1);
  expect([addon.eval('return ns.ticker.vgJobs["flight poll"] ~= nil'), flightBar(addon).shown], "landed: the check stops").toEqual([false, false]);
  asked();
  addon.advance(30);
  expect(asked(), "and stays stopped").toBe(0);
});
// The bag and menu bar's rows' scales: each puts its buttons one 24-unit slot and a 4-unit gap apart.
const MENU = 28 / 27, BAGS = 28 / 47;
// A number to three places (sizes worked out in fractions of a unit).
const r3 = (n) => Math.round(n * 1000) / 1000;
// The bag and menu bar's width and height.
const barSize = (addon) => addon.eval("return { Vanguard_MenuStrip:GetWidth(), Vanguard_MenuStrip:GetHeight() }").map(r3);
// The bar's width around a longer row of n slots: the slots, their 4-pixel gaps, and a 12-pixel margin each side.
const barW = (n) => (n > 0 ? n * 28 - 4 : 0) + 24;
// The bar's height: a 24-pixel bags row, a 4-pixel gap and a 30-pixel menu row, inside the margins.
const BAR_H = 24 + 4 + 30 + 24;
// The bar's width around a micro menu w units wide: the game lays its buttons 27 units apart, 5 overlapping.
const menuBarW = (w) => barW(Math.round((w - 5) / 27));
it("the game's extras: duplicates hidden, minimap buttons on the map, menu strip, quest tracker", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV);
  expect(["DurabilityFrame", "TimeManagerClockButton", "GameTimeFrame"].map((n) => putAway(addon, n)), "the game's durability figure, clock and calendar button are put away").toEqual([true, true, true]);
  // The game's XP bar: still under its own parent (Edit Mode calls methods on it), and hidden.
  const xpBar = () => addon.eval("local f = StatusTrackingBarManager return { f:GetParent() == UIParent, f:IsShown() }");
  expect(xpBar(), "the game's XP bar is hidden where it is, not moved").toEqual([true, false]);
  addon.eval("StatusTrackingBarManager:Show()");
  expect(xpBar(), "when the game shows it, it's hidden again").toEqual([true, false]);
  addon.eval("StatusTrackingBarManager:SetShown(true)");
  expect(xpBar(), "however it's shown").toEqual([true, false]);
  expect(addon.eval("local M = ns.GetModule('Minimap') M.overlay:Layout() return M.overlay.Layout == M.NoLayout"), "the map's overlay answers a moved button's Layout call (the mail icon makes one when mail arrives)").toBe(true);
  const overlay = "ns.GetModule('Minimap').overlay";
  expect([pinned(addon, "MinimapCluster.Tracking", overlay), pinned(addon, "MinimapCluster.IndicatorFrame.MailFrame", overlay), pinned(addon, "AddonCompartmentFrame", overlay)],
    "tracking, mail and the addon compartment sit on the map's corners").toEqual([[true, "BOTTOMLEFT"], [true, "TOPRIGHT"], [true, "BOTTOMRIGHT"]]);
  addon.eval('MinimapCluster.Tracking:ClearAllPoints() MinimapCluster.Tracking:SetPoint("CENTER", UIParent, "CENTER", 0, 0)');
  expect(pinned(addon, "MinimapCluster.Tracking", overlay), "when the game moves one back, it returns to its corner").toEqual([true, "BOTTOMLEFT"]);
  const slots = addon.eval(`local t, a = MinimapCluster.Tracking, AddonCompartmentFrame
    return { t:GetWidth(), t:GetScale(), ns.FrameState('vgGlyph')[t].__texture:match("(%a+)$"), ns.FrameState('vgGlyph')[a].__texture:match("(%a+)$"), ns.FrameState('vgSlot')[t] ~= nil, ns.FrameState('vgSlot')[MinimapCluster.IndicatorFrame.MailFrame] == nil }`);
  expect(slots, "tracking and the addon compartment are 18-unit slot buttons with the theme's icons (unscaled); mail stays an indicator").toEqual([18, 1, "MinimapTracking", "MinimapAddons", true, true]);
  expect(addon.eval("local a = AddonCompartmentFrame a.Text = a:CreateFontString() ns.GetModule('Minimap').SlotButton(a, 'MinimapAddons') return a.Text:GetAlpha()"), "the compartment's count is faded, not left hanging off the slot").toBe(0);
  addon.eval("local a = AddonCompartmentFrame a.__scripts.OnEnter(a)");
  expect(isTok(addon, addon.eval("return ns.FrameState('vgGlyph')[AddonCompartmentFrame].__vertexColor"), "accent"), "a slot button's icon lights in the accent under the mouse").toBe(true);
  expect([pinned(addon, "BagsBar", "Vanguard_MenuStrip"), pinned(addon, "MicroMenuContainer", "Vanguard_MenuStrip")], "the bag bar and the micro menu ride in one bar, each at its row's right end").toEqual([[true, "RIGHT"], [true, "RIGHT"]]);
  expect(addon.eval("for _, e in ipairs(ns.errors) do if e.text:find('pin ') then return e.text end end return 'none'"), "pinning the first row fits both rows with no error: every row's anchor is made first").toBe("none");
  addon.eval("BagsBar:SetSize(600, 45) ns.PausePins(false)");
  expect(barSize(addon), "a bag bar 600 units wide holds 13 bags: the bar hugs their slots inside a 12-unit margin (two rows tall)").toEqual([barW(13), BAR_H]);
  addon.eval("BagsBar:SetSize(50, 20) ns.PausePins(false)");
  expect([...barSize(addon), addon.eval("return Vanguard_BagStrip == nil")], "one bag: the bar shrinks to hug its one slot, and there is no separate bag strip").toEqual([barW(1), BAR_H, true]);
  expect(addon.eval("local s = Vanguard_MenuStrip return { s:GetAlpha(), s.__mouseMotion == nil }"), "the bar is always shown by default (P2.18), nothing watching the mouse").toEqual([1, true]);
  expect(addon.eval("return { Vanguard_QuestTracker:GetWidth(), Vanguard_QuestTracker:GetHeight(), next(ObjectiveTrackerFrame.__points) == nil }"), "Vanguard's tracker is on: its spot is made (260 by 234) and the game's tracker is not pinned").toEqual([260, 234, true]);
});
it("menu strip: the game's tracker is pinned into the spot only while Vanguard's own tracker is off", () => {
  // Where the game's tracker is anchored: whether on the spot, and its height.
  const pinned = (addon) => addon.eval("local p = ObjectiveTrackerFrame.__points.TOPRIGHT return { p ~= nil and p.rel == Vanguard_QuestTracker, ObjectiveTrackerFrame:GetHeight() }");
  const saved = (profile) => ({ savedVariables: `VanguardDB.profiles.Default = ${profile}` });
  expect(pinned(loggedIn(UI_ENV + TIDY_ENV, saved("{ QuestTracker = { own = false } }"))), "Vanguard's tracker off: the game's sits under the info strip, no taller than its spot").toEqual([true, 234]);
  expect(pinned(loggedIn(UI_ENV + TIDY_ENV, saved("{ QuestTracker = { own = true } }"))), "Vanguard's tracker on: one owner only, the game's is not pinned").toEqual([false, 0]);
  expect(pinned(loggedIn(UI_ENV + TIDY_ENV, saved("{ modules = { QuestTracker = false } }"))), "the tracker module switched off altogether: the game's is pinned again").toEqual([true, 234]);
});
it("the game's extras: a protected frame is hidden once, out of combat, with no Show hook", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + "ProtectedBar = CreateFrame('Frame', 'ProtectedBar', UIParent) ProtectedBar.IsProtected = function() return true, false end __wfgStub.inCombat = true");
  // Shown, still under UIParent, and without a raw Show or SetShown hook.
  const state = () => addon.eval("local f = ProtectedBar return { f:IsShown(), f:GetParent() == UIParent, rawget(f, 'Show') == nil and rawget(f, 'SetShown') == nil }");
  addon.eval("ns.GetModule('DataBars').Suppress('ProtectedBar')");
  expect(state(), "in combat it is left alone, with no hook").toEqual([true, true, true]);
  setCombat(addon, false);
  expect(state(), "after combat it is hidden where it is, still with no hook").toEqual([false, true, true]);
  addon.eval("ProtectedBar:Show() ns.GetModule('DataBars').Suppress('ProtectedBar')");
  expect(state(), "hidden once: shown again when the game shows it, and a second Suppress does nothing").toEqual([true, true, true]);
});
it("the game's extras: each switch off leaves the game's frame alone, and missing frames are fine", () => {
  const off = loggedIn(UI_ENV + TIDY_ENV, { savedVariables: `VanguardDB.profiles = { Default = { DataBars = { xp = false, reputation = false },
    InfoStrip = { durability = false, clock = false }, Minimap = { icons = false }, MenuStrip = { menu = "always", tracker = false }, QuestTracker = { own = false } } }` });
  expect(["StatusTrackingBarManager", "DurabilityFrame", "TimeManagerClockButton"].map((n) => putAway(off, n)), "replacements off: the game's own stay").toEqual([false, false, false]);
  expect(off.eval("return MinimapCluster.Tracking:GetParent() == MinimapCluster"), "minimap buttons off: tracking stays where the game put it").toBe(true);
  expect(off.eval("return { Vanguard_MenuStrip:GetAlpha(), Vanguard_MenuStrip.__scripts.OnUpdate == nil }"), "menu strip set to Always: always shown, nothing polling").toEqual([1, true]);
  expect(off.eval("return next(ObjectiveTrackerFrame.__points) == nil and Vanguard_QuestTracker == nil"), "tracker off: the game's tracker is left alone").toBe(true);
  const bare = loggedIn(UI_ENV);
  expect(bare.eval("return Vanguard_MenuStrip ~= nil and Vanguard_QuestTracker ~= nil"), "a client without these frames still gets the strip and the spot, with nothing to pin").toBe(true);
});
it("a menu button takes clicks while the game's new indicator is shown (#243)", () => {
  // TEST-ONLY indicator: a mouse-taking child frame above the button, as the game's alert frames are.
  const ALERT_ENV = `__alert = CreateFrame("Frame", nil, CharacterMicroButton) __alert:EnableMouse(true) __alert:SetFrameLevel(CharacterMicroButton:GetFrameLevel() + 5)`;
  const addon = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + ALERT_ENV);
  expect(addon.eval("return { __alert:IsMouseEnabled() and 1 or 0, ns.FrameState('vgSlot')[CharacterMicroButton] ~= nil }"), "the indicator no longer takes the mouse, the slot is kept").toEqual([0, true]);
  addon.eval("local clicked = 0 CharacterMicroButton:HookScript('OnClick', function() clicked = clicked + 1 end) CharacterMicroButton:Click() __clicked = clicked");
  expect(addon.eval("return __clicked"), "a click reaches the button").toBe(1);
});
it("Round Four leftovers: menu glyphs, a target diamond, raid names above incoming heals", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + CLICK_LUA, { savedVariables: "VanguardDB.profiles.Default = { MenuStrip = { glyphs = true } }" });
  // A menu button's state: its icon, the icon's color, its faded art and kept flash, the icon's width.
  const glyph = (name) => addon.eval(`local b = ${name} local art
    for _, r in ipairs({ b:GetRegions() }) do if r.__texture == "TEST-ONLY-ART" then art = r.__alpha end end
    return { tex = ns.FrameState('vgGlyph')[b] and ns.FrameState('vgGlyph')[b].__texture, color = ns.FrameState('vgGlyph')[b] and ns.FrameState('vgGlyph')[b].__vertexColor, art = art, normal = b.normal.__alpha, flash = b.Flash.__alpha or 1, w = ns.FrameState('vgGlyph')[b] and ns.FrameState('vgGlyph')[b].__width }`);
  const char = glyph("CharacterMicroButton");
  expect(/Icons\\Character$/.test(char.tex) && /Icons\\MenuCog$/.test(glyph("MainMenuMicroButton").tex), "switched on, each menu button gets its Vanguard icon (a client without the rest is fine)").toBeTruthy();
  expect([char.art, char.normal, char.flash, r3(char.w * MENU)], "the game's art is faded but its alert flash stays; the icon is 20 screen pixels").toEqual([0, 0, 1, 20]);
  expect(isTok(addon, char.color, "text"), "the icon is text").toBeTruthy();
  const slot = addon.eval("local s = ns.FrameState('vgSlot')[CharacterMicroButton] return { s.__width, s.__height, s.__points.CENTER ~= nil, ns.FrameState('vgGlyph')[CharacterMicroButton]:GetParent() == s }");
  expect([r3(slot[0] * MENU), r3(slot[1] * MENU), slot[2], slot[3]], "each button sits on a centered slot 24 pixels wide and 30 tall (a 4-pixel gap to its neighbors), the icon on it").toEqual([24, 30, true, true]);
  const bag = addon.eval(`local b = MainMenuBarBackpackButton local art
    for _, r in ipairs({ b:GetRegions() }) do if r.__texture == "TEST-ONLY-ART" then art = r.__alpha end end
    return { art, b.icon.__alpha, b.icon.__texCoord[1] > 0, b.icon.__points.TOPLEFT.rel == ns.FrameState('vgSlot')[b], b.icon.__points.TOPLEFT.x }`);
  expect([...bag.slice(0, 4), r3(bag[4] * BAGS)], "bag buttons: the game's art faded, the bag icon kept, cropped and inset 3 pixels in its slot").toEqual([0, 1, true, true, 3]);
  addon.eval("CharacterMicroButton:Disable()");
  expect(isTok(addon, glyph("CharacterMicroButton").color, "disabled"), "and in the disabled tier while the button is disabled").toBeTruthy();
  addon.eval("CharacterMicroButton:Enable()");
  expect(isTok(addon, glyph("CharacterMicroButton").color, "text"), "back to text when it's enabled again").toBeTruthy();
  addon.eval('ns.Options.Show("more")');
  expect(addon.eval('return __click("Vanguard icons on the menu buttons") and VanguardDB.profiles.Default.MenuStrip.glyphs'), "the switch is on the page").toBe(false);
  const plain = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV);
  expect(plain.eval("return { ns.FrameState('vgGlyph')[CharacterMicroButton] ~= nil, CharacterMicroButton.normal.__alpha, ns.FrameState('vgSlot')[CharacterMicroButton] ~= nil }"), "by default Vanguard's icon stands on the slot, the game's faded").toEqual([true, 0, true]);
  const off = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV, { savedVariables: "VanguardDB.profiles.Default = { MenuStrip = { glyphs = false } }" });
  expect(off.eval("return { ns.FrameState('vgGlyph')[CharacterMicroButton] == nil, CharacterMicroButton.normal.__alpha == nil, ns.FrameState('vgSlot')[CharacterMicroButton] ~= nil }"), "switched off, the game's own icon stays, on its slot").toEqual([true, true, true]);

  const plates = loggedIn(UNITS_ENV + CLICK_LUA + PLATE_ENV);
  plates.fire("NAME_PLATE_UNIT_ADDED", "nameplate1");
  plates.fire("PLAYER_ENTERING_WORLD");
  // A plate's target marker: shown, texture, color and where it's anchored.
  const marker = (unit) => plates.eval(`local m = ns.FrameState('vgPlate')[__plates.${unit}].marker return { m:IsShown(), m.__texture, m.__vertexColor, m.__points.LEFT.relPoint }`);
  const target = marker("nameplate1");
  expect(target[0] === true && /Textures\\Diamond$/.test(target[1]) && isTok(plates, target[2], "accent") && target[3] === "RIGHT", "your target's plate gets an accent diamond at its right").toBeTruthy();
  // Whether a plate's target marker shows.
  const shown = (unit) => plates.eval(`return ns.FrameState('vgPlate')[__plates.${unit}].marker:IsShown()`);
  expect(shown("nameplate2"), "other plates don't").toBe(false);
  plates.eval('VanguardDB.profiles.Default.Nameplates.targetBorder = false ns.GetModule("Nameplates").Update(ns.FrameState("vgPlate")[__plates.nameplate1], "nameplate1")');
  expect(shown("nameplate1"), "and it goes with the target border switch").toBe(false);

  const raid = loggedIn(UNITS_ENV + RAID_ENV + HEALING_ENV);
  raid.eval('__spawn(1, "raid1")');
  const layers = raid.eval(`local b = Vanguard_RaidUnitButton1
    return { b.name:GetParent() == b.texts and b.status:GetParent() == b.texts and b.role:GetParent() == b.texts and b.roleShadow:GetParent() == b.texts,
      b.texts:GetFrameLevel() > b.heal:GetFrameLevel() and b.texts:GetFrameLevel() > b.shield:GetFrameLevel(), b.texts:GetFrameLevel() < b.overlay:GetFrameLevel() }`);
  expect(layers, "a tile's name, role and status sit above the incoming-heal and shield bars, under the status marks").toEqual([true, true, true]);
});
it("menu strip: set to mouseover, shown by the mouse entering and leaving it and its buttons, with nothing polling", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV, { savedVariables: 'VanguardDB.profiles.Default = { MenuStrip = { menu = "mouseover" } }' });
  // The menu strip's alpha.
  const alpha = () => addon.eval("return Vanguard_MenuStrip:GetAlpha()");
  expect(addon.eval("local s = Vanguard_MenuStrip return { s:GetScript('OnUpdate') == nil, s.__mouseMotion, s.__mouseClick }"), "no OnUpdate; the strip feels the mouse but lets clicks through").toEqual([true, true, false]);
  addon.hover("CharacterMicroButton");
  expect(alpha(), "straight onto a button: the strip shows").toBe(1);
  addon.hover("Vanguard_MenuStrip");
  expect(alpha(), "from the button onto the strip between buttons: still shown").toBe(1);
  addon.hover("EJMicroButton");
  addon.hover(null);
  expect(alpha(), "off the strip: hidden").toBe(0);
  addon.hover("MainMenuMicroButton");
  addon.eval("Vanguard_MenuStrip.__mouseOver = true");
  addon.hover(null);
  expect(alpha(), "leaving a button while still over the strip keeps it shown").toBe(1);
});
it("bag and menu bar: the bars' own frame art is hidden, the key ring gets a full slot and no fill", () => {
  const addon = strips();
  expect(addon.eval("return { MicroMenu.BorderArt.__alpha, MicroMenu.BackgroundArt.__alpha, BagsBar.BorderArt.__alpha }"), "the brass box is faded").toEqual([0, 0, 0]);
  const ring = addon.eval("local b = KeyRingButton return { b.icon.__alpha, b.icon.__points.TOPLEFT.rel == ns.FrameState('vgSlot')[b], b.icon.__texCoord[1] > 0, ns.FrameState('vgSlot')[b].__width, ns.FrameState('vgFill')[b] == nil, b:GetWidth() }");
  expect([ring[0], ring[1], ring[2], r3(ring[3] * BAGS), ring[4], ring[5]], "the key ring: widened from 33 to a bag's 45 units, its icon cropped in a full 24-pixel slot, no fill").toEqual([1, true, true, 24, true, 45]);
  const off = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV, { savedVariables: "VanguardDB.profiles.Default = { MenuStrip = { glyphs = true } }" });
  expect(off.eval("return { MicroMenu.BorderArt.__alpha, ns.FrameState('vgSlot')[KeyRingButton] ~= nil }"), "with or without the line icons, the frame art goes and the key ring is framed").toEqual([0, true]);
});
it("bag and menu bar: every row's anchor has a size, so the bars get a rect to draw in", () => {
  const addon = strips("BagsBar:SetSize(315, 45) MicroMenuContainer:SetSize(226.5, 30)");
  // The client gives a zero-sized frame no rect and draws nothing anchored to one: the bar showed its panel and divider with nothing in it (seen in game).
  const rects = (names) => addon.eval(`local out = {} for _, n in ipairs({ ${names.map((n) => JSON.stringify(n)).join(", ")} }) do out[#out + 1] = _G[n]:IsRectValid() end return out`);
  expect(addon.eval("local MS = ns.GetModule('MenuStrip') local out = {} for i, row in ipairs(MS.ROWS) do out[i] = { row.anchor:GetWidth(), row.anchor:GetHeight(), row.anchor:IsRectValid() } end return out"),
    "each row's anchor is its row's box: as wide as the row, a slot tall, with a rect").toEqual([[7 * 28 - 4, 24, true], [8 * 28 - 4, 24, true]]);
  expect(rects(["Vanguard_MenuStrip", "BagsBar", "MicroMenuContainer"]), "the bar and both of the game's bars have rects").toEqual([true, true, true]);
  addon.eval("local MS = ns.GetModule('MenuStrip') Probe = CreateFrame('Frame', 'Probe', UIParent) Probe:SetSize(10, 10) Probe:SetPoint('RIGHT', MS.ROWS[1].anchor, 'TOPRIGHT') Empty = CreateFrame('Frame', 'Empty', UIParent) Empty:SetPoint('CENTER')");
  expect(rects(["Probe"]), "the harness lays out what hangs on a row's anchor").toEqual([true]);
  addon.eval("Probe:SetPoint('RIGHT', Empty, 'TOPRIGHT')");
  expect(rects(["Empty", "Probe"]), "and, like the client, gives nothing hung on a zero-sized frame a rect").toEqual([false, false]);
  addon.eval("BagsBar:SetSize(0, 45) MicroMenuContainer:SetSize(0, 30) ns.PausePins(false)");
  expect(addon.eval("local MS = ns.GetModule('MenuStrip') return { MS.ROWS[1].anchor:GetWidth(), MS.ROWS[2].anchor:GetWidth(), Vanguard_MenuStrip:GetWidth() }"),
    "rows with no buttons keep a unit-wide anchor (the bar hugs its margins)").toEqual([1, 1, 24]);
});
it("bag and menu bar: the bags and menu the game hides on an input switch come back, after combat", () => {
  const addon = strips();
  // Whether the bag bar and the micro menu are shown themselves.
  const shown = () => addon.eval("return { BagsBar:IsShown(), MicroMenu:IsShown() }");
  addon.eval("MicroMenu:Hide() BagsBar:Hide()");
  expect(shown(), "the game's gamepad switch hides both: shown again at once").toEqual([true, true]);
  addon.eval("Vanguard_MenuStrip:Hide()");
  expect(shown(), "hidden only with the bar, they keep their own shown state").toEqual([true, true]);
  addon.eval("Vanguard_MenuStrip:Show()");
  setCombat(addon, true);
  addon.eval("MicroMenu:Hide()");
  expect(shown(), "in combat it waits").toEqual([true, false]);
  setCombat(addon, false);
  expect(shown(), "and shows it when combat ends").toEqual([true, true]);
});
// Where a seated bar's RIGHT point sits on its row's anchor (row k of the bar): { x, y } in screen units.
const seatOf = (addon, bar, k, scale) => addon.eval(`local p = ${bar}.__points.RIGHT return { p.rel == ns.GetModule("MenuStrip").ROWS[${k}].anchor, p.relPoint, p.x, p.y }`).map((v, i) => (i > 1 ? r3(v * scale) : v));
it("bag and menu bar: the rows re-fit when the game lays the bars out or resizes them", () => {
  const addon = strips();
  expect(barSize(addon), "before the game lays them out, the bar is its margins only, a bags row, a gap and a menu row tall").toEqual([24, BAR_H]);
  addon.eval("MicroMenuContainer:Layout()");
  expect(barSize(addon), "the bar grows around the laid-out micro menu").toEqual([menuBarW(378), BAR_H]);
  // Each row's last slot sits at its anchor (its button reaches past it by half the difference), its middle on the row's.
  expect(seatOf(addon, "MicroMenuContainer", 2, MENU), "the menu: the lower row, its middle 55 pixels below the top (the 12-pixel margin, the bags row, the gap and half a 30-pixel slot)").toEqual([true, "TOPRIGHT", r3((32 * MENU - 24) / 2), -55]);
  expect(seatOf(addon, "BagsBar", 1, BAGS), "the bags: the upper row, its middle 24 pixels below the top").toEqual([true, "TOPRIGHT", r3((45 * BAGS - 24) / 2), -24]);
  addon.eval("BagsBar:SetScale(1) BagsBar:Layout()");
  expect([barSize(addon)[0], r3(addon.eval("return BagsBar:GetScale()"))], "a narrower bag row leaves the bar as wide as the menu, and the game's reset of the bag bar's scale is undone").toEqual([menuBarW(378), r3(BAGS)]);
  addon.eval("MicroMenuContainer:SetSize(500, 40) MicroMenuContainer.__scripts.OnSizeChanged(MicroMenuContainer, 500, 40)");
  expect(barSize(addon)[0], "a size change alone re-fits the bar").toBe(menuBarW(500));
  expect(addon.eval("local d = ns.GetModule('MenuStrip').divider local p = d.__points.LEFT return { p.relPoint, p.x, p.y, d.__points.RIGHT.x, d:GetHeight() }"), "a one-pixel accent line between the rows, across the bar inside its margins").toEqual(["TOPLEFT", 12, -38, -12, addon.eval("return ns.Theme.Pixel(Vanguard_MenuStrip)")]);
  expect(isTok(addon, addon.eval("return ns.GetModule('MenuStrip').divider.__vertexColor"), "accent"), "in the accent").toBe(true);
  addon.eval("ns.Theme.SetAccent(0.1, 0.9, 0.2)");
  expect(addon.eval("return ns.GetModule('MenuStrip').divider.__vertexColor"), "which it follows").toEqual([0.1, 0.9, 0.2, 1]);
});
it("bag and menu bar: the game's menu icons are drawn larger than their slots, so the icon fills the slot, uncropped", () => {
  // TEST-ONLY quest log button showing one of the game's menu icons; the character button's art has no atlas,
  // and the guild button's is a menu atlas in no button state (a shine, not an icon).
  const addon = strips(`
    local b = __micro("QuestLogMicroButton")
    b.normal:SetAtlas("UI-HUD-MicroMenu-Questlog-Up")
    __micro("GuildMicroButton").normal:SetAtlas("UI-HUD-MicroMenu-Shine")
  `, { savedVariables: "VanguardDB.profiles.Default = { MenuStrip = { glyphs = false } }" });
  // A button's normal texture: its two corners' offsets from the slot's, the slot's size, the inset, and its texture coordinates.
  const place = (name) => addon.eval(`local b = ${name} local p = b.normal.__points
    return { p.TOPLEFT.x, p.TOPLEFT.y, p.BOTTOMRIGHT.x, p.BOTTOMRIGHT.y, ns.FrameState('vgSlot')[b].__width, ns.FrameState('vgSlot')[b].__height, ns.FrameState('vgInset')[b], b.normal.__texCoord == nil }`);
  const { left: l, right: r, top: t, bottom: btm } = addon.eval("return ns.GetModule('MenuStrip').ICON_BOX");
  const [x0, y0, x1, y1, w, h, d, uncropped] = place("QuestLogMicroButton");
  const fw = (w - 2 * d) / (r - l), fh = (h - 2 * d) / (btm - t);
  expect([x0 + fw * l, y0 - fh * t, x1 - fw * (1 - r), y1 + fh * (1 - btm)].map(r3), "so the icon's box lands exactly on its place, the inset in from the slot's edge").toEqual([d, -d, -d, d].map(r3));
  expect(uncropped, "and nothing is cropped (the client counts an atlas's coordinates its own way)").toBe(true);
  const [cx0, cy0, cx1, cy1, , , cd] = place("CharacterMicroButton");
  expect([cx0, cy0, cx1, cy1].map(r3), "art that isn't one of the game's menu icons fits inside the inset").toEqual([cd, -cd, -cd, cd].map(r3));
  const [gx0, gy0, gx1, gy1, , , gd] = place("GuildMicroButton");
  expect([gx0, gy0, gx1, gy1].map(r3), "and so does a menu atlas in no button state").toEqual([gd, -gd, -gd, gd].map(r3));
});
// TEST-ONLY bars laid out as the game lays them out: nine menu buttons 27 units apart (32 wide,
// overlapping by 5) from the micro menu's left, and the bags right to left from the bag bar's
// right edge, 2 units apart, the key ring last at its 33 units.
const GAME_BARS_ENV = `
  MicroMenuContainer:SetSize(9 * 27 + 5, 40)
  for i, name in ipairs({ "Character", "PlayerSpells", "Talent", "Achievement", "QuestLog", "Guild", "LFD", "Collections", "MainMenu" }) do
    local b = CreateFrame("Button", name .. "MicroButton", MicroMenuContainer) b:SetSize(32, 40) b:SetPoint("LEFT", MicroMenuContainer, "LEFT", (i - 1) * 27, 0)
  end
  BagsBar:SetSize(5 * 47 + 33, 45)
  local prev
  for i, name in ipairs({ "MainMenuBarBackpackButton", "CharacterBag0Slot", "CharacterBag1Slot", "CharacterBag2Slot", "CharacterBag3Slot", "KeyRingButton" }) do
    local b = CreateFrame("Button", name, BagsBar) b:SetSize(i == 6 and 33 or 45, 45) b.icon = b:CreateTexture()
    if prev then b:SetPoint("RIGHT", prev, "LEFT", -2, 0) else b:SetPoint("RIGHT", BagsBar, "RIGHT") end
    prev = b
  end
`;
// Every slot's screen rect (left, bottom, right, top, to three places) in a row (1 bags, 2 menu), left to right.
const slotRects = (addon, k) => addon.eval(`local MS, out = ns.GetModule("MenuStrip"), {}
  for i, b in ipairs(MS.slotted) do if ns.FrameState('vgRow')[b] == MS.ROWS[${k}] then out[#out + 1] = i end end return out`)
  .map((i) => addon.frame(`ns.FrameState("vgSlot")[ns.GetModule("MenuStrip").slotted[${i}]]`).rect)
  .map((r) => [r.left, r.bottom, r.right, r.top].map(r3)).sort((a, b) => a[0] - b[0]);
it("bag and menu bar: the bar hugs its slots, one size, one baseline per row, one pair of edges", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + GAME_BARS_ENV);
  const bar = addon.frame("Vanguard_MenuStrip").rect;
  const bags = slotRects(addon, 1), menu = slotRects(addon, 2);
  expect([bags.length, menu.length], "six bag slots (the key ring with them) over nine menu slots").toEqual([6, 9]);
  expect([bags.every((r) => r3(r[2] - r[0]) === 24 && r3(r[3] - r[1]) === 24), menu.every((r) => r3(r[2] - r[0]) === 24 && r3(r[3] - r[1]) === 30)],
    "every bag slot is 24 pixels square, the key ring's too; every menu slot is 24 wide and 30 tall").toEqual([true, true]);
  // The left edges' steps along a row.
  const steps = (row) => row.slice(1).map((r, i) => r3(r[0] - row[i][0]));
  expect([steps(bags), steps(menu)], "each row steps one slot and a 4-pixel gap at a time").toEqual([Array(5).fill(28), Array(8).fill(28)]);
  expect([new Set(bags.map((r) => r[1])).size, new Set(menu.map((r) => r[1])).size], "each row on one baseline").toEqual([1, 1]);
  const pad = [r3(menu[0][0] - bar.left), r3(bar.right - menu[8][2]), r3(menu[0][1] - bar.bottom), r3(bar.top - bags[0][3])];
  expect(pad, "the same 12-pixel padding on all four sides: the menu row spans the bar, the bags sit on top").toEqual([12, 12, 12, 12]);
  expect([r3(bags[0][0] - menu[0][0]), r3(menu[8][2] - bags[5][2])], "the shorter bag row is centered over the menu row (3 slots' room each side)").toEqual([42, 42]);
  expect(r3(bags[0][1] - menu[0][3]), "a 4-pixel gap between the rows").toBe(4);
  const line = addon.frame("ns.GetModule('MenuStrip').divider").rect;
  expect([r3(line.left), r3(line.right)], "the divider runs under the slots only, edge to edge with the longer row").toEqual([menu[0][0], menu[8][2]]);
  expect(line.bottom >= menu[0][3] && line.top <= bags[0][1], "between the rows").toBe(true);
  expect([r3(bar.right), r3(bar.bottom), r3(bar.right - bar.left)], "the bar keeps its bottom-right corner, 16 and 20 in from the screen's").toEqual([1904, 20, barW(9)]);
  addon.eval("MicroMenuContainer:SetSize(14 * 27 + 5, 40) MicroMenuContainer.__scripts.OnSizeChanged(MicroMenuContainer)");
  const wide = addon.frame("Vanguard_MenuStrip").rect;
  expect([r3(wide.right), r3(wide.right - wide.left)], "fourteen menu buttons: the bar grows to the left only").toEqual([1904, barW(14)]);
});
it("bag and menu bar: one mover keeps the menu strip's saved spot; the bag strip's spot and the line icons are dropped once", () => {
  const spots = 'positions = { menustrip = { point = "BOTTOMLEFT", relPoint = "BOTTOMLEFT", x = 400, y = 20 }, bagstrip = { point = "BOTTOMLEFT", relPoint = "BOTTOMLEFT", x = 10, y = 10 } }';
  const old = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV, { firstRun: true, savedVariables: `VanguardDB = { version = 1, setupDone = true, profiles = { Default = { MenuStrip = { glyphs = true }, ${spots} } } }` });
  const saved = old.eval("local p = VanguardDB.profiles.Default return { VanguardDB.version, p.MenuStrip.glyphs, p.positions.bagstrip == nil, p.positions.menustrip.x }");
  expect(saved, "an older file: the game's icons again and the bag strip's spot gone, the menu strip's kept").toEqual([2, false, true, 400]);
  expect(old.eval("local p = Vanguard_MenuStrip.__points.BOTTOMLEFT return { p.x, p.y, ns.FrameState('vgGlyph')[CharacterMicroButton] == nil }"), "the bar stands where the menu strip was, with the game's icons").toEqual([400, 20, true]);
  expect(old.eval("local keys = {} for _, m in ipairs(ns.MoverList()) do keys[m.key] = m.label end return { keys.menustrip, keys.bagstrip == nil }"), "one mover for the bar").toEqual(["Bags and game menu", true]);
  const now = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV, { savedVariables: "VanguardDB.profiles.Default = { MenuStrip = { glyphs = true } }" });
  expect(now.eval("return ns.FrameState('vgGlyph')[CharacterMicroButton] ~= nil"), "line icons switched on after the upgrade stay on").toBe(true);
});
it("bag and menu bar: no re-fit while pins are paused or in combat, and one queued entry per bar", () => {
  const addon = strips();
  addon.eval("ns.PausePins(true) __menuW = 600 MicroMenuContainer:Layout()");
  expect(barSize(addon)[0], "Edit Mode open: the bar waits").toBe(barW(0));
  addon.eval("ns.PausePins(false)");
  expect(barSize(addon)[0], "and fits when it closes").toBe(menuBarW(600));
  setCombat(addon, true);
  addon.eval("__menuW = 400 MicroMenuContainer:Layout()");
  const queued = addon.eval("return ns.QueuedCount()");
  addon.eval("for _ = 1, 50 do MicroMenuContainer:Layout() end");
  expect([barSize(addon)[0], addon.eval("return ns.QueuedCount()")], "in combat nothing changes, and 50 more Layout calls queue nothing more").toEqual([menuBarW(600), queued]);
  setCombat(addon, false);
  expect(barSize(addon)[0], "after combat the bar fits").toBe(menuBarW(400));
  const plain = loggedIn(UI_ENV + 'CreateFrame("Frame", "MicroMenuContainer", UIParent) function MicroMenuContainer:Layout() end');
  expect(plain.eval("return { MicroMenuContainer:GetParent() == Vanguard_MenuStrip, MicroMenuContainer.__scripts.OnSizeChanged ~= nil }"), "a client without hooksecurefunc still pins and watches the size").toEqual([true, true]);
});
it("bag and menu bar: slots are 24 screen pixels wide, take the clicks, and light up under the mouse only", () => {
  const addon = strips("", { savedVariables: "VanguardDB.profiles.Default = { MenuStrip = { glyphs = false } }" });
  // A button's slot: its side and the button's hit insets in screen pixels, its frame level against the button's, and its accent edge's color.
  const slot = (name, scale) => addon.eval(`local b = ${name} local s = ns.FrameState('vgSlot')[b] local e
    for _, w in ipairs(__wfgStub.frames) do if w.__parent == s and w.__layer == "BORDER" and w.__sublevel == 0 and w.__vertexColor and w.__vertexColor[1] > 0 then e = w.__vertexColor end end
    return { s.__width, b.__hitInsets and b.__hitInsets[3] or 0, s:GetFrameLevel() < b:GetFrameLevel(), e }`).map((v, i) => (i < 2 ? r3(v * scale) : v));
  const char = slot("CharacterMicroButton", MENU);
  expect(char.slice(0, 3), "a menu slot: 24 pixels wide and 30 tall, the 40-unit button taking clicks on the slot only, drawn under the button").toEqual([24, r3((40 * MENU - 30) / 2), true]);
  expect(char[3][3], "its accent edge is hidden while nothing touches it (a quiet slot)").toBe(0);
  expect(slot("MainMenuBarBackpackButton", BAGS).slice(0, 3), "a bag slot: the same 24 pixels").toEqual([24, r3((45 * BAGS - 24) / 2), true]);
  const accent = addon.eval("return { ns.Theme.Accent() }");
  addon.eval("CharacterMicroButton.__scripts.OnEnter(CharacterMicroButton)");
  const lit = slot("CharacterMicroButton", MENU)[3];
  expect([0, 1, 2].every((i) => lit[i] > accent[i]) && lit[3] === 1, "the mouse over it: the edge shows, brighter than the accent").toBe(true);
  addon.eval("CharacterMicroButton.__scripts.OnMouseDown(CharacterMicroButton)");
  const held = slot("CharacterMicroButton", MENU)[3];
  expect([0, 1, 2].every((i) => held[i] < accent[i]), "held down: it darkens").toBe(true);
  addon.eval("CharacterMicroButton.__mouseOver = true CharacterMicroButton.__scripts.OnMouseUp(CharacterMicroButton)");
  expect(slot("CharacterMicroButton", MENU)[3], "let go over it: bright again").toEqual(lit);
  addon.eval("CharacterMicroButton.__mouseOver = false CharacterMicroButton.__scripts.OnMouseUp(CharacterMicroButton)");
  expect(slot("CharacterMicroButton", MENU)[3][3], "let go elsewhere: hidden again").toBe(0);
  addon.eval("CharacterMicroButton.__scripts.OnLeave(CharacterMicroButton)");
  expect(slot("CharacterMicroButton", MENU)[3][3], "and when the mouse leaves").toBe(0);
  addon.eval("ns.Theme.SetAccent(0.2, 0.4, 0.6)");
  expect(slot("CharacterMicroButton", MENU)[3], "the edge follows a new accent (still hidden)").toEqual([0.2, 0.4, 0.6, 0]);
  addon.eval("CharacterMicroButton.__scripts.OnEnter(CharacterMicroButton)");
  expect(slot("CharacterMicroButton", MENU)[3][3], "and shows in it under the mouse").toBe(1);
  addon.eval("CharacterMicroButton.__scripts.OnLeave(CharacterMicroButton)");
  const well = addon.eval(`local s, out = ns.FrameState('vgSlot')[CharacterMicroButton], { bevel = {}, colors = {} }
    for _, w in ipairs(__wfgStub.frames) do if w.__parent == s and w.__vertexColor then
      if w.__layer == "BORDER" and w.__sublevel == 1 then out.bevel[#out.bevel + 1] = w.__vertexColor[4] end
      out.colors[#out.colors + 1] = w.__vertexColor
    end end
    return out`);
  expect(well.bevel, "a dark well: its bevel lines don't show").toEqual([0, 0]);
  expect(["void", "darkBar"].map((t) => well.colors.some((c) => isTok(addon, c, t))), "filled with the void color, ringed in a lighter line").toEqual([true, true]);
  expect(addon.eval("return { CharacterMicroButton.Background.__alpha, CharacterMicroButton.normal.__alpha == nil, CharacterMicroButton.Flash.__alpha == nil }"), "the game's background plate goes; its icon and alert flash stay").toEqual([0, true, true]);
  addon.eval("CharacterMicroButton:Disable()");
  expect(addon.eval("return CharacterMicroButton.normal.__desaturated"), "a disabled button's icon is grey").toBe(true);
  addon.eval("CharacterMicroButton:Enable()");
  expect(addon.eval("return CharacterMicroButton.normal.__desaturated"), "and in color again when enabled").toBe(false);
  addon.eval("CharacterMicroButton:SetScale(0.5) MicroMenuContainer:Layout()");
  expect(r3(addon.eval("return ns.FrameState('vgSlot')[CharacterMicroButton].__width") * MENU * 0.5), "a smaller button: its slot shrinks to its place in the row, re-sized by the re-fit").toBe(r3(27 * MENU * 0.5 - 4));
  expect(r3(addon.eval("return ns.FrameState('vgSlot')[EJMicroButton].__width") * MENU), "a button with no size yet gets a full slot").toBe(24);
});
it("bag and menu bar: line icons are 20 screen pixels on their slot, accent under the mouse", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV, { savedVariables: "VanguardDB.profiles.Default = { MenuStrip = { glyphs = true } }" });
  // The line icon's screen size and whether it is square and centered on the slot.
  const look = () => addon.eval(`local b = CharacterMicroButton local rel = b:GetEffectiveScale() / UIParent:GetEffectiveScale()
    return { ns.FrameState('vgGlyph')[b].__width * rel, ns.FrameState('vgGlyph')[b].__height == ns.FrameState('vgGlyph')[b].__width, ns.FrameState('vgGlyph')[b].__points.CENTER.rel == ns.FrameState('vgSlot')[b] }`);
  expect([r3(look()[0]), look()[1], look()[2]], "20 screen pixels, square, centered on the slot").toEqual([20, true, true]);
  addon.eval("CharacterMicroButton:SetScale(0.5) MicroMenuContainer:Layout()");
  expect(r3(look()[0]), "a smaller menu: the icon stays inside its smaller slot").toBe(r3(27 * MENU * 0.5 - 4 - 4));
  // The line icon's current color.
  const color = () => addon.eval("return ns.FrameState('vgGlyph')[CharacterMicroButton].__vertexColor");
  expect(isTok(addon, color(), "text"), "text at rest").toBe(true);
  addon.eval("CharacterMicroButton.__scripts.OnEnter(CharacterMicroButton)");
  expect(isTok(addon, color(), "accent"), "accent under the mouse").toBe(true);
  addon.eval("CharacterMicroButton:Disable()");
  expect(isTok(addon, color(), "disabled"), "the disabled tier while disabled, even under the mouse").toBe(true);
  addon.eval("CharacterMicroButton:Enable()");
  expect(isTok(addon, color(), "accent"), "enabled again under the mouse: accent").toBe(true);
  addon.eval("CharacterMicroButton.__scripts.OnLeave(CharacterMicroButton)");
  expect(isTok(addon, color(), "text"), "text once the mouse leaves").toBe(true);
  expect(r3(addon.eval("return MainMenuBarBackpackButton:GetWidth() * BagsBar:GetEffectiveScale() / UIParent:GetEffectiveScale()")), "bag buttons sit one slot and a gap apart (28 screen pixels with their padding)").toBe(r3(45 * BAGS));
});
// TEST-ONLY bags: the backpack (16 slots, 4 free), bag 1 empty (no bag in it), bag 2 full,
// bag 3 a soul bag (20 slots, 5 free, family 256); their buttons, with the game's bag IDs.
const BAGS_ENV = `
  __space = { [0] = { 16, 4, 0 }, [1] = { 0, 0 }, [2] = { 10, 0, 0 }, [3] = { 20, 5, 256 }, [4] = { 0, 0 } }
  C_Container.GetContainerNumSlots = function(bag) return (__space[bag] or { 0 })[1] end
  C_Container.GetContainerNumFreeSlots = function(bag) local s = __space[bag] or { 0, 0 } return s[2], s[3] end
  for i = 0, 2 do
    local b = CreateFrame("Button", "CharacterBag" .. i .. "Slot", BagsBar) b:SetSize(45, 45)
    b.icon = b:CreateTexture() b.bag = i + 1
    function b:GetBagID() return self.bag end
  end
`;
it("bag and menu bar: each bag's slot shows how full it is, the backpack how many slots are free", () => {
  const addon = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV + BAGS_ENV);
  // A bag button's fill (shown, width in screen pixels, color), its icon's alpha and greyness, and the backpack's count and its size on screen.
  const bag = (name) => addon.eval(`local b = ${name} local f = ns.FrameState('vgFill')[b]
    return { f:IsShown(), (f.__width or 0) * ${BAGS}, f.__vertexColor or false, ns.FrameState('vgIcon')[b].__alpha, ns.FrameState('vgIcon')[b].__desaturated == true }`).map((v, i) => (i === 1 ? r3(v) : v));
  const pack = bag("MainMenuBarBackpackButton");
  expect([pack[0], pack[1], isTok(addon, pack[2], "accent")], "the backpack, 12 of 16 slots used: a fill three quarters of the 18-pixel icon wide, in the accent").toEqual([true, 13.5, true]);
  const empty = bag("CharacterBag0Slot");
  expect([empty[0], empty[3], empty[4]], "no bag in the slot: no fill, the game's empty-slot art faint and grey").toEqual([false, 0.35, true]);
  const full = bag("CharacterBag1Slot");
  expect([full[0], full[1], isTok(addon, full[2], "bad"), full[3], full[4]], "a full bag: a full-width fill in red").toEqual([true, 18, true, 1, false]);
  expect(r3(bag("CharacterBag2Slot")[1]), "a soul bag fills by its own slots (15 of 20)").toBe(13.5);
  // The backpack's free count and its font size on screen.
  const count = () => addon.eval("local fs = ns.GetModule('MenuStrip').free local _, size = fs:GetFont() return { fs:GetText(), size * MainMenuBarBackpackButton:GetEffectiveScale() / UIParent:GetEffectiveScale() }");
  expect([count()[0], r3(count()[1])], "the backpack: 4 free (the soul bag's free slots hold only shards), at the theme's badge size on screen (9, the one role under 10)").toEqual(["4", addon.eval('return ns.Theme.RoleSize("badge")')]);
  addon.eval("__space[0][2] = 0 __space[1] = { 12, 12, 0 }");
  addon.fire("BAG_UPDATE_DELAYED");
  expect([bag("MainMenuBarBackpackButton")[1], bag("CharacterBag0Slot").slice(0, 1), bag("CharacterBag0Slot")[3], count()[0]], "the bags change: the backpack's fill is full, a new empty bag shows in color with no fill, 12 free").toEqual([18, [false], 1, "12"]);
  const bare = loggedIn(UI_ENV + TIDY_ENV + MICRO_ENV + STRIPS_ENV + "C_Container = nil");
  expect(bare.eval("return { ns.GetModule('MenuStrip').free:GetText(), ns.FrameState('vgFill')[MainMenuBarBackpackButton]:IsShown() }"), "a client that can't count bag slots shows no count and no fill").toEqual(["", false]);
});
