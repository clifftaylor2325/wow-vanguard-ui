// info-strip: the info strip's readouts (DPS, fight reads, ammo, soul shards, XP and gold per hour),
// main tank frames, party pets and the faction look, in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { CLICK_LUA, STRIP_ENV, UNITS_ENV, block, isTok, later, loggedIn, setCombat } from "./helpers.mjs";

// TEST-ONLY damage meter: someone else's line, then yours at 1234.5 per second.
const DPS_ENV = `
  __dps = { combatSources = { { isLocalPlayer = false, amountPerSecond = 999 }, { isLocalPlayer = true, amountPerSecond = 1234.5 } } }
  Enum = { DamageMeterSessionType = { Current = 1 }, DamageMeterType = { Dps = 1 } }
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
  addon.eval("Enum = { DamageMeterSessionType = { Current = 1 }, DamageMeterType = { Dps = 1 } } __dps = { combatSources = { { isLocalPlayer = true, amountPerSecond = 0 } } }");
  expect(hidden(""), "no damage done: nothing shows").toBe(false);
  addon.eval("__asked = nil Enum = nil");
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
  bare.eval("Enum = { DamageMeterSessionType = { Current = 1 }, DamageMeterType = { Dps = 1 } } C_DamageMeter = { GetCombatSessionFromType = function() __asked = true return { combatSources = { { isLocalPlayer = true }, {} } } end }");
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

// TEST-ONLY group extras: a raid tank (raid1) targeting the boar, and a party pet targeting nothing.
const GROUP_EXTRAS_ENV = `
  RegisterAttributeDriver = function(frame, attr, driver) frame.__drivers = frame.__drivers or {}; frame.__drivers[attr] = driver end
  __units.raid1 = { name = "TEST-ONLY Tank", hp = 300, maxhp = 1000, power = 0, maxpower = 0, ptype = "RAGE", player = true, class = "ROGUE" }
  __units.raid1target = __units.target
  __units.partypet1 = { name = "TEST-ONLY Wolf", hp = 50, maxhp = 100, power = 0, maxpower = 0, ptype = "FOCUS", reaction = 5 }
  function __mt(i, unit)
    local b = CreateFrame("Button", "Vanguard_MainTanksUnitButton" .. i, Vanguard_MainTanks, "SecureUnitButtonTemplate")
    Vanguard_MainTanks.initialConfigFunction(Vanguard_MainTanks, b:GetName())
    b:SetAttribute("unit", unit)
    return b
  end
`;

it("main tank frames: the raid's main tanks and assists, with what each is targeting", () => {
  const addon = loggedIn(UNITS_ENV + GROUP_EXTRAS_ENV);
  const header = addon.eval(`local h = Vanguard_MainTanks
    return { h:GetAttribute("groupFilter"), h:GetAttribute("showRaid"), h:GetAttribute("template"), h.__drivers["state-visibility"], h:GetAttribute("initialConfigFunction") == ns.GetModule("MainTanks").INIT }`);
  expect(header, "a secure header of the raid's main tanks and assists, shown in a raid").toEqual(["MAINTANK,MAINASSIST", true, "SecureUnitButtonTemplate", "[group:raid] show; hide", true]);
  expect([addon.eval("return { ns.MoverPoint('maintanks') }"), addon.eval("return { Vanguard_MainTanksHolder:GetWidth(), Vanguard_MainTanksHolder:GetHeight() }")], "movable, at the top left beside the raid tools, room for four").toEqual([["TOPLEFT", "TOPLEFT", 400, -20], [236, 100]]);
  addon.eval('__mt(1, "raid1") __wfgStub.advance(0.5)');
  // The first tile: bar value and color, name, target line and its color.
  const tile = () => addon.eval("local b = Vanguard_MainTanksUnitButton1 return { b.bar.__value, b.bar.__barColor, b.name:GetText(), b.target:GetText(), b.target.__textColor }");
  const one = tile();
  expect([one[0], one[1].slice(0, 3), one[2], one[3], isTok(addon, one[4], "hostile")], "health in their class color, their name, and their target in its reaction color").toEqual([300, [1, 0.96, 0.41], "TEST-ONLY Tank", "TEST-ONLY Boar", true]);
  addon.eval("__units.raid1target = nil __wfgStub.advance(0.5)");
  expect(tile()[3], "no target, no line").toBe("");
  addon.eval('__units.raid1.name = "TEST-ONLY Renamed" Vanguard_MainTanksUnitButton1:SetAttribute("unit", "raid9") Vanguard_MainTanksUnitButton1:Hide() Vanguard_MainTanksUnitButton1:Show()');
  expect(tile()[2], "a unit that isn't there leaves the tile as it was").toBe("TEST-ONLY Tank");
  const off = loggedIn(UNITS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { MainTanks = false } } }" });
  expect(off.eval("return Vanguard_MainTanks == nil"), "switched off under Modules, nothing is built").toBe(true);
  expect(loggedIn(UNITS_ENV).eval("return Vanguard_MainTanks ~= nil"), "a client without attribute drivers still builds them").toBe(true);
});

it("main tank frames without secure snippets: the header copies the clicks; tiles are sized and set up out of combat", () => {
  const addon = loggedIn(UNITS_ENV + GROUP_EXTRAS_ENV + 'SecureHandlerExecute = function() error("TEST-ONLY: snippets do not compile") end');
  expect(addon.eval("local h = Vanguard_MainTanks return { h:GetAttribute('initialConfigFunction') == nil, h:GetAttribute('_initialAttributeNames') }"),
    "no init snippet; the header copies the clicks").toEqual([true, "*type1,*type2"]);
  addon.eval('local b = CreateFrame("Button", "Vanguard_MainTanksUnitButton1", Vanguard_MainTanks, "SecureUnitButtonTemplate") b:SetAttribute("unit", "raid1")');
  addon.fire("GROUP_ROSTER_UPDATE");
  const MT = addon.eval('local MT = ns.GetModule("MainTanks") return { MT.W, MT.H }');
  expect(addon.eval("local b = Vanguard_MainTanksUnitButton1 return { b:GetWidth(), b:GetHeight(), b:GetAttribute('*type1'), b.bar ~= nil }"),
    "the tile has its size, its click and the tile setup").toEqual([MT[0], MT[1], "target", true]);
});

it("party pets and targets: small tiles above the party, only in a party, when switched on", () => {
  expect(loggedIn(UNITS_ENV + GROUP_EXTRAS_ENV).eval("return Vanguard_PartyExtras == nil"), "off until you turn it on").toBe(true);
  const addon = loggedIn(UNITS_ENV + GROUP_EXTRAS_ENV + CLICK_LUA, { savedVariables: "VanguardDB.profiles = { Default = { PartyExtras = { show = true } } }" });
  const tiles = addon.eval(`local pet, target = Vanguard_partypet1, Vanguard_party4target
    return { #ns.GetModule("PartyExtras").tiles, pet:GetAttribute("unit"), pet.__watched, target:GetAttribute("unit"), target.__points.TOPLEFT.x, target.__points.TOPLEFT.y, Vanguard_PartyExtras.__drivers["state-visibility"] }`);
  expect(tiles, "a pet and a target tile per party member, each shown while its unit exists, the column only in a party").toEqual([8, "partypet1", true, "party4target", 94, -54, "[group:raid] hide; [group:party] show; hide"]);
  expect(addon.eval("return { ns.MoverPoint('partyextras') }"), "movable, just above the party").toEqual(["BOTTOM", "BOTTOM", -240, 606]);
  addon.eval("ns.GetModule('MainTanks').Paint(Vanguard_partypet1)");
  expect(addon.eval("return { Vanguard_partypet1.name:GetText(), Vanguard_partypet1.target == nil }"), "the pet's name on its tile, no target line").toEqual(["TEST-ONLY Wolf", true]);
  addon.slash("");
  addon.eval('__click("Unit frames")');
  expect(addon.eval('return __click("Party pets and targets, above the party (reload)") and VanguardDB.profiles.Default.PartyExtras.show'), "the switch is under Unit frames").toBe(false);
});

it("/vg factionart: which of the game's own faction pictures the client has", () => {
  const addon = loggedIn(`C_Texture = { GetAtlasInfo = function(name) if name:find("MountJournal") then return { width = 64 } end end }
    UnitFactionGroup = function() return "Horde" end`);
  addon.slash("factionart");
  const lines = addon.chat().join("\n");
  expect([/you're Horde/.test(lines), /atlas MountJournalIcons-Horde\s+\|c\w+yes/.test(lines), /atlas UI-HUD-UnitFrame-Player-PVP-HordeIcon\s+\|c\w+missing/.test(lines)], "your faction, and each atlas found or missing").toEqual([true, true, true]);
  addon.eval("ns.FactionArt.tester.SetTexture = function(_, file) return file:find('Timer') ~= nil end");
  expect(addon.eval("return { ns.FactionArt.HasFile('Interface\\\\Timer\\\\Horde-Logo'), ns.FactionArt.HasFile('Interface\\\\TargetingFrame\\\\UI-PVP-Horde') }"), "a file counts when the client loads it").toEqual([true, false]);
  addon.eval("UnitFactionGroup = function() return { __secret = true } end issecretvalue = function(v) return type(v) == 'table' and v.__secret end");
  expect(addon.eval("return ns.FactionArt.Faction()"), "a hidden answer counts as none").toBe("none");
  const bare = loggedIn("C_Texture = nil UnitFactionGroup = nil");
  expect(bare.eval("return { ns.FactionArt.HasAtlas('MountJournalIcons-Horde'), ns.FactionArt.Faction() }"), "a client without these calls has none, and no faction").toEqual([false, "none"]);
});

it("the faction look: your faction's crest and heading font, and Off", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA + '__faction = "Alliance" UnitFactionGroup = function() return __faction end');
  // A new title and label string's font file, and a new crest's texture, color and shown state.
  const look = () => addon.eval(`local T = ns.Theme
    local title, label = T.Text(UIParent:CreateFontString(), "title"), T.Text(UIParent:CreateFontString(), "label")
    local c = Vanguard_AfkScreen.crest
    return { title.__font[1]:match("[^\\\\]+$"), label.__font[1]:match("[^\\\\]+$"), c:IsShown(), (c.__texture or ""):match("[^\\\\]+$") or "", c.__vertexColor }`);
  const ally = look();
  expect(ally.slice(0, 4), "Alliance: Cinzel headings (body text stays Fira Sans), the crossed swords").toEqual(["Cinzel-SemiBold.ttf", "FiraSansCondensed-Medium.ttf", true, "lorc-crossed-swords"]);
  expect(isTok(addon, ally[4], "allianceCrest"), "in Alliance gold").toBe(true);
  expect(addon.eval("return { Vanguard_QuestDialog.crest.vgAlpha, Vanguard_QuestDialog.crest.__vertexColor[4] }"), "a faint watermark in the quest dialog").toEqual([0.1, 0.1]);
  addon.eval('__faction = "Horde"');
  addon.fire("NEUTRAL_FACTION_SELECT_RESULT");
  const horde = look();
  expect([horde[0], horde[3], isTok(addon, horde[4], "hordeCrest")], "Horde: Metamorphous and the crossed axes, in Horde red").toEqual(["Metamorphous-Regular.ttf", "lorc-crossed-axes", true]);
  addon.slash("");
  expect(addon.eval("return Vanguard_Options.crest:IsShown() and Vanguard_Options.crest.__points.LEFT.rel == Vanguard_Options.title"), "the crest beside the options window's title").toBe(true);
  addon.eval('__click("Faction look: crest and heading font")');
  const off = look();
  expect([off[0], off[2], addon.eval("return Vanguard_Options.title.__font[1]:find('Fira') ~= nil")], "Off: the usual heading font, no crests, at once").toEqual(["FiraSansCondensed-SemiBold.ttf", false, true]);
  addon.eval('__click("Faction look: crest and heading font") __faction = "Neutral" ns.Theme.Refresh()');
  expect(look().slice(0, 3), "a neutral character keeps the usual look").toEqual(["FiraSansCondensed-SemiBold.ttf", "FiraSansCondensed-Medium.ttf", false]);
  addon.eval('__faction = "Alliance" ns.Theme.Settings().font = "client" ns.Theme.Refresh()');
  expect(addon.eval("return { ns.Theme.HeadingFont() == nil, Vanguard_AfkScreen.crest:IsShown() }"), "with the game's font chosen, headings follow it (the crest stays)").toEqual([true, true]);
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
