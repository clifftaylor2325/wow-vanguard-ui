// extras: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { AFK_ENV, CLICK_LUA, FAKE_FADES, RAID_ENV, UNITS_ENV, chatHas, isTok, loggedIn, raidButton, setCombat } from "./helpers.mjs";

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
it("main tank tiles: hovering one out of combat shows its unit's tooltip", () => {
  const addon = loggedIn(UNITS_ENV + GROUP_EXTRAS_ENV);
  addon.eval('__mt(1, "raid1")');
  expect(addon.eval("local b = Vanguard_MainTanksUnitButton1 b:GetScript('OnEnter')(b) return { GameTooltip:GetOwner() == b, GameTooltip.__unit }"), "the tile owns the tooltip, showing its unit").toEqual([true, "raid1"]);
});
it("main tank tiles take their handle's scale and opacity (the header sits beside its holder)", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV);
  // The header's scale and opacity.
  const look = () => addon.eval("return { Vanguard_MainTanks:GetScale(), Vanguard_MainTanks:GetAlpha() }");
  expect(look(), "at 100% as built").toEqual([1, 1]);
  addon.eval('ns.SetMoverScale("maintanks", 2) ns.SetMoverAlpha("maintanks", 0.3)');
  expect(look(), "at the handle's scale and opacity").toEqual([2, 0.3]);
  setCombat(addon, true);
  addon.eval('ns.SetMoverScale("maintanks", 1)');
  expect(look()[0], "in combat the secure header waits").toBe(2);
  setCombat(addon, false);
  expect(look()[0], "and follows once the fight is over").toBe(1);
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
  expect(addon.eval('return __click("Party pets and targets, above the party") and VanguardDB.profiles.Default.PartyExtras.show'), "the switch is under Unit frames").toBe(false);
});
it("party pets and targets: on a canvas under 676 tall the column sits right of the party, on screen", () => {
  // The column's spot and rect on a w x h canvas, with the raid frames' party column's right edge.
  const at = (w, h) => {
    const addon = loggedIn(UNITS_ENV + GROUP_EXTRAS_ENV + `__wfgStub.setScreen(${w}, ${h})`, { savedVariables: "VanguardDB.profiles = { Default = { PartyExtras = { show = true } } }" });
    const r = addon.frame("Vanguard_PartyExtras").rect, party = addon.frame("Vanguard_RaidHolder").rect;
    return { spot: addon.eval("return { ns.MoverPoint('partyextras') }"), top: r.bottom + r.height, left: r.left, partyRight: party.left + party.width };
  };
  expect(at(1365, 768).spot, "768 tall: just above the party, as before").toEqual(["BOTTOM", "BOTTOM", -240, 606]);
  const short = at(835, 668);
  expect([short.spot, short.top <= 668, short.left > short.partyRight], "668 tall (UI scale 1.15): right of the party column, its top on the screen").toEqual([["BOTTOMLEFT", "BOTTOM", -66, 396], true, true]);
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
it("the faction look: the crest only by default, the crest and heading font, and Off", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA + '__faction = "Alliance" UnitFactionGroup = function() return __faction end');
  addon.eval('ns.Theme.Settings().faction = "auto" ns.Theme.Refresh()');
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
  addon.eval('__click("Faction look")');
  const off = look();
  expect([off[0], off[2], addon.eval("return Vanguard_Options.title.__font[1]:find('Fira') ~= nil")], "Off: the usual heading font, no crests, at once").toEqual(["FiraSansCondensed-SemiBold.ttf", false, true]);
  // Off, then Crest only, then Crest and heading font: the cycle's order.
  addon.eval('__click("Faction look") __click("Faction look") __faction = "Neutral" ns.Theme.Refresh()');
  expect(look().slice(0, 3), "a neutral character keeps the usual look").toEqual(["FiraSansCondensed-SemiBold.ttf", "FiraSansCondensed-Medium.ttf", false]);
  addon.eval('__faction = "Alliance" ns.Theme.Settings().faction = "crest" ns.Theme.Refresh()');
  expect(look().slice(0, 3), "Crest only: the usual headings, the crest shown").toEqual(["FiraSansCondensed-SemiBold.ttf", "FiraSansCondensed-Medium.ttf", true]);
  addon.eval('ns.Theme.Settings().faction = "auto" ns.Theme.Refresh()');
  addon.eval('ns.Theme.Settings().font = "client" ns.Theme.Refresh()');
  expect(addon.eval("return { ns.Theme.HeadingFont() == nil, Vanguard_AfkScreen.crest:IsShown() }"), "with the game's font chosen, headings follow it (the crest stays)").toEqual([true, true]);
});
// TEST-ONLY trainer: two services you can learn (5s and 20s), one you can't yet, one learned; 22s on hand.
const TRAINER_ENV = `
  __services = { { "TEST-ONLY Bolt", "available", 500 }, { "TEST-ONLY Ward", "unavailable", 100 }, { "TEST-ONLY Blast", "available", 2000 }, { "TEST-ONLY Old", "used", 0 } }
  __money, __learned = 2200, {}
  GetMoney = function() return __money end
  GetNumTrainerServices = function() return #__services end
  GetTrainerServiceInfo = function(i) local s = __services[i] return s[1], "", s[2], false end
  GetTrainerServiceCost = function(i) return __services[i][3] end
  BuyTrainerService = function(i) __learned[#__learned + 1] = __services[i][1] __money = __money - __services[i][3] __services[i][2] = "used" end
  C_Timer = { After = function(_, fn) fn() end }
  function __loadTrainer(withTrain)
    ClassTrainerFrame = CreateFrame("Frame", "ClassTrainerFrame", UIParent)
    if withTrain then ClassTrainerTrainButton = CreateFrame("Button", "ClassTrainerTrainButton", ClassTrainerFrame) end
  end
`;
// The Train all button: its label, whether it's enabled, and where it sits.
const trainButton = (addon) => addon.eval(`local b = ns.GetModule("Errands").trainButton
  if not b then return false end
  local p = b.__points.RIGHT or b.__points.BOTTOMLEFT
  return { text = b.text:GetText(), enabled = b:IsEnabled(), shown = b:IsShown(), by = p.rel:GetName() }`);
it("Train all at a trainer: learns what you can afford, one at a time", () => {
  const addon = loggedIn(TRAINER_ENV);
  expect(trainButton(addon), "no trainer window yet, no button").toBe(false);
  addon.eval("__loadTrainer(true)");
  addon.fire("ADDON_LOADED", "Blizzard_TrainerUI");
  addon.fire("TRAINER_SHOW");
  expect(trainButton(addon), "on the trainer's window, beside its own Train button, with the count one click learns").toEqual({ text: "Train all (1)", enabled: true, shown: true, by: "ClassTrainerTrainButton" });
  addon.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');
  expect(addon.eval("return __learned"), "learns what 22s pays for, then stops").toEqual(["TEST-ONLY Bolt"]);
  expect(chatHas(addon, /Trained 1 skill\(s\) for 5s 0c\./), "and says what it cost").toBe(true);
  expect(trainButton(addon).enabled, "the one left costs more than you have").toBe(false);
  addon.eval("__money = 5000");
  addon.fire("TRAINER_UPDATE");
  setCombat(addon, true);
  addon.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');
  expect(addon.eval("return #__learned"), "nothing in combat").toBe(1);
  setCombat(addon, false);
  addon.fire("TRAINER_CLOSED");
  addon.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');
  expect(addon.eval("return #__learned"), "nor once the trainer closed").toBe(1);
  addon.fire("TRAINER_SHOW");
  addon.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');
  expect([addon.eval("return __learned"), trainButton(addon).text], "then the rest").toEqual([["TEST-ONLY Bolt", "TEST-ONLY Blast"], "Train all"]);
  const loaded = loggedIn(TRAINER_ENV + "__loadTrainer(false)", { savedVariables: "VanguardDB.profiles = { Default = { Errands = { trainAll = false } } }" });
  loaded.fire("TRAINER_SHOW");
  expect(trainButton(loaded), "a window already loaded gets it too; switched off it hides").toMatchObject({ shown: false, by: "ClassTrainerFrame" });
});
it("Train all: its tooltip says what the list costs and what one click buys, greyed out too", () => {
  const addon = loggedIn(TRAINER_ENV + "__loadTrainer(true)");
  addon.fire("TRAINER_SHOW");
  // The tooltip's text as the button shows it on hover.
  const tip = () => addon.eval('local b = ns.GetModule("Errands").trainButton b.__scripts.OnEnter(b) return GameTooltip.__lines[1].text');
  expect(tip(), "two skills, one affordable").toBe("2 skill(s) for 25s 0c; you can afford 1 (5s 0c).");
  addon.eval("__money = 9000");
  addon.fire("TRAINER_UPDATE");
  expect([tip(), addon.eval('return ns.GetModule("Errands").trainButton.text:GetText()')], "all of them, and the count says so").toEqual(["2 skill(s) for 25s 0c.", "Train all (2)"]);
  addon.eval("__money = 100");
  addon.fire("TRAINER_UPDATE");
  expect(tip(), "greyed out, it says why").toBe("Not enough gold for any: the cheapest is 5s 0c.");
  addon.eval('__services = {} ns.GetModule("Errands").trainButton.__scripts.OnLeave()');
  expect([tip(), addon.eval("return GameTooltip:IsShown()")], "nothing to learn").toEqual(["Nothing to learn here right now.", true]);
  addon.eval('ns.GetModule("Errands").trainButton.__scripts.OnLeave()');
  expect(addon.eval("return GameTooltip:IsShown()"), "leaving hides it").toBe(false);
});
// TEST-ONLY trainer as the game reports it: GetTrainerServiceInfo is name, kind, texture, ...; buying
// changes nothing until the server answers (money and list as they were), or removes the service from the list.
const FOREVER_TRAINER_ENV = `
  __services = { { "TEST-ONLY Bolt", "available", 500 }, { "TEST-ONLY Ward", "unavailable", 100 }, { "TEST-ONLY Blast", "available", 2000 }, { "TEST-ONLY Gust", "available", 1000 } }
  __money, __learned, __shrink = 3200, {}, false
  GetMoney = function() return __money end
  GetNumTrainerServices = function() return #__services end
  GetTrainerServiceInfo = function(i) local s = __services[i] return s[1], s[2], 134400, 1, "Rank 1" end
  GetTrainerServiceCost = function(i) return __services[i][3] end
  BuyTrainerService = function(i) __learned[#__learned + 1] = __services[i][1] if __shrink then table.remove(__services, i) end end
  ClassTrainerFrame = CreateFrame("Frame", "ClassTrainerFrame", UIParent)
`;
it("Train all is narrow enough to leave the player's money line clear", () => {
  const addon = loggedIn(TRAINER_ENV);
  addon.eval("__loadTrainer(true) ClassTrainerTrainButton:SetHeight(25)");
  addon.fire("ADDON_LOADED", "Blizzard_TrainerUI");
  expect(addon.eval('return ns.GetModule("Errands").trainButton:GetWidth()')).toBeLessThanOrEqual(100);
  expect(addon.eval('return { ns.GetModule("Errands").trainButton:GetHeight(), ClassTrainerTrainButton:GetHeight() }'), "same height as Train").toEqual([25, 25]);
});
it("Train all in one click: no purchase twice, the budget counted before the game answers, a list that re-indexes", () => {
  const addon = loggedIn(FOREVER_TRAINER_ENV);
  addon.fire("TRAINER_SHOW");
  addon.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');
  expect(addon.eval("return __learned"), "32s on hand, game still showing everything: Bolt (5s) and Blast (20s), not Gust (10s: only 7s left), none twice").toEqual(["TEST-ONLY Bolt", "TEST-ONLY Blast"]);
  expect(chatHas(addon, /Trained 2 skill\(s\) for 25s 0c\./), "one line for the whole click").toBe(true);
  const shrinking = loggedIn(FOREVER_TRAINER_ENV + "__shrink = true __money = 100000");
  shrinking.fire("TRAINER_SHOW");
  shrinking.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');
  expect(shrinking.eval("return __learned"), "the list shrinking under the buying (indexes shifting) skips and repeats nothing").toEqual(["TEST-ONLY Bolt", "TEST-ONLY Blast", "TEST-ONLY Gust"]);
  const capped = loggedIn(FOREVER_TRAINER_ENV + "__shrink = true __money = 100000 ns.GetModule('Errands').TRAIN_STEPS = 2");
  capped.fire("TRAINER_SHOW");
  capped.eval('ns.GetModule("Errands").trainButton.__scripts.OnClick()');
  expect(capped.eval("return #__learned"), "a click learns at most TRAIN_STEPS services").toBe(2);
  const plan = loggedIn(FOREVER_TRAINER_ENV + "__money = 100000 ns.GetModule('Errands').TRAIN_STEPS = 1");
  plan.fire("TRAINER_SHOW");
  expect(plan.eval("return ns.GetModule('Errands').TrainPlan().count"), "the count it shows stops at the same cap").toBe(1);
});
// TEST-ONLY merchant stock: 90011 sells singly (5c, stacks of 20), 90012 in fives (40c for 5), 90013 is sold out.
const STOCK_ENV = `
  __goods = { { id = 90011, price = 5, stack = 1, left = -1, max = 20 }, { id = 90012, price = 40, stack = 5, left = -1, max = 10 }, { id = 90013, price = 1, stack = 1, left = 0, max = 20 } }
  __have, __buys, __money = { [90011] = 5 }, {}, 100000
  GetMoney = function() return __money end
  GetMerchantNumItems = function() return #__goods end
  GetMerchantItemLink = function(i) return "|cffffffff|Hitem:" .. __goods[i].id .. "::|h[TEST-ONLY Good]|h|r" end
  GetMerchantItemMaxStack = function(i) return __goods[i].max end
  C_MerchantFrame = { GetItemInfo = function(i) local g = __goods[i] return { price = g.price, stackCount = g.stack, numAvailable = g.left } end }
  BuyMerchantItem = function(i, n) local g = __goods[i] __buys[#__buys + 1] = { g.id, n } __have[g.id] = (__have[g.id] or 0) + n __money = __money - math.ceil(g.price / g.stack * n) end
  C_Item = { GetItemCount = function(id) return __have[id] or 0 end, GetItemInfo = function(id) if id == 90011 then return "TEST-ONLY Bread" end end }
  C_Timer = { After = function(_, fn) fn() end }
`;
it("keep stocked: /vg stock sets the list, a merchant tops you up", () => {
  const addon = loggedIn(STOCK_ENV);
  addon.slash("stock");
  expect(chatHas(addon, /stock list is empty/), "an empty list says how to add").toBe(true);
  addon.slash("stock |cffffffff|Hitem:90011::|h[TEST-ONLY Bread]|h|r 45");
  addon.slash("stock item:90012 12");
  addon.slash("stock 90013 3");
  addon.slash("stock 90014");
  expect(chatHas(addon, /Keeping 45 × TEST-ONLY Bread\./) && chatHas(addon, /Usage: \/vg stock/), "a shift-clicked item and an amount; no amount, the usage").toBe(true);
  addon.slash("stock");
  expect(chatHas(addon, /Keep 12 × item 90012/), "the list, by name where the game knows it").toBe(true);
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return __buys"), "40 more bread in stacks of 20, 12 of the fives rounded up to whole fives, nothing sold out").toEqual([[90011, 20], [90011, 20], [90012, 10], [90012, 5]]);
  expect(chatHas(addon, /Bought 40 × TEST-ONLY Bread for 2s 0c\./) && chatHas(addon, /Bought 15 × item 90012 for 1s 20c\./), "and says what it bought").toBe(true);
  addon.eval("__buys = {}");
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return #__buys"), "nothing when you have enough").toBe(0);
  addon.eval("__have = {} __buys = {} __money = 150");
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return __buys"), "it stops when you can't pay for the next stack").toEqual([[90011, 20]]);
  addon.fire("MERCHANT_CLOSED");
  addon.slash("stock item:90011 0");
  addon.slash("stock clear");
  expect(chatHas(addon, /TEST-ONLY Bread is off your stock list/) && addon.eval("return next(VanguardCharDB.stockList)") === null, "0 removes an item, clear empties the list").toBe(true);
  const old = loggedIn(STOCK_ENV + "C_Timer = nil C_MerchantFrame = nil GetMerchantItemInfo = function(i) local g = __goods[i] return 'x', '', g.price, g.stack, g.left end", { savedVariables: "VanguardDB.profiles = { Default = { Errands = { stockList = { [90012] = 5 } } } }" });
  old.fire("MERCHANT_SHOW");
  expect(old.eval("return __buys"), "a client with the old merchant call (and no timers)").toEqual([[90012, 5]]);
  const off = loggedIn(STOCK_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Errands = { stock = false, stockList = { [90012] = 5 } } } }" });
  off.fire("MERCHANT_SHOW");
  expect(off.eval("return #__buys"), "switched off it buys nothing").toBe(0);
});
// TEST-ONLY item details for the Keep stocked window: 90011 stacks to 20 and has an icon; 90012's info isn't cached.
const STOCK_WINDOW_ENV = STOCK_ENV + `
  C_Item.GetItemInfo = function(id) if id == 90011 then return "TEST-ONLY Bread", "", 1, 1, 1, "", "", 20 end end
  C_Item.GetItemIconByID = function(id) return "TEST-ONLY-ICON-" .. id end
`;
// The Keep stocked window's shown rows, each { name, where, amount, icon }, and whether the empty line shows.
// (An empty Lua table comes back as {}, so no rows is made [] here.)
const stockWindow = (addon) => {
  const w = addon.eval(`local f, rows = Vanguard_StockList, {}
    for i = 1, f.rows.used do local r = f.rows[i] rows[i] = { r.name:GetText(), r.where:GetText(), r.amount:GetText(), r.icon:GetTexture() or false } end
    return { shown = f:IsShown(), rows = rows, empty = f.empty:IsShown() }`);
  return { ...w, rows: Array.isArray(w.rows) ? w.rows : [] };
};
it("keep stocked: Edit list... on Town and gear opens the window, empty at first", () => {
  const addon = loggedIn(CLICK_LUA + STOCK_WINDOW_ENV);
  addon.eval('ns.Options.Show("town")');
  addon.eval('for _, w in ipairs(__wfgStub.frames) do if w.caption == "Edit list..." and w:IsVisible() then w.__scripts.OnClick(w) end end');
  expect(stockWindow(addon), "open, no rows, the line saying how to add one").toEqual({ shown: true, rows: [], empty: true });
  expect(addon.eval("return Vanguard_StockList.title:GetText()")).toBe("Keep stocked");
  const off = loggedIn(STOCK_WINDOW_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { Errands = false } } }" });
  off.eval("ns.GetModule('Errands').StockWindow.Open()");
  expect([chatHas(off, /Errands is off/), off.eval("return Vanguard_StockList == nil")], "Errands off: it says so and builds nothing").toEqual([true, true]);
});
it("keep stocked: an item dragged onto the slot is added with a stack, a row shows where to buy it, and Remove takes it off", () => {
  const addon = loggedIn(STOCK_WINDOW_ENV);
  addon.eval("ns.GetModule('Errands').StockWindow.Open()");
  addon.eval("__wfgWorld.cursor = { type = 'item', id = 90011 } local s = Vanguard_StockList.slot s.__scripts.OnReceiveDrag(s)");
  addon.eval("__wfgWorld.cursor = { type = 'item', id = 90012 } local s = Vanguard_StockList.slot s.__scripts.OnClick(s)");
  expect(stockWindow(addon).rows, "one stack of Bread (20); 90012's stack unknown: 20; never seen at a merchant").toEqual([
    ["TEST-ONLY Bread", "where to buy: not seen yet", "20", "TEST-ONLY-ICON-90011"], ["item 90012", "where to buy: not seen yet", "20", "TEST-ONLY-ICON-90012"]]);
  expect(addon.eval("return { __wfgWorld.cursor == nil, VanguardCharDB.stockList[90011] }"), "the cursor is emptied; the list has it").toEqual([true, 20]);
  addon.eval("VanguardCharDB.stockList[90011] = 45 __wfgWorld.cursor = { type = 'item', id = 90011 } local s = Vanguard_StockList.slot s.__scripts.OnClick(s)");
  expect(stockWindow(addon).rows[0][2], "an item already on the list keeps its amount").toBe("45");
  addon.eval("__wfgWorld.cursor = { type = 'spell', id = 133 } local s = Vanguard_StockList.slot s.__scripts.OnClick(s)");
  addon.eval("local s = Vanguard_StockList.slot s.__scripts.OnClick(s)");
  expect(stockWindow(addon).rows.length, "a spell, or nothing held: nothing added").toBe(2);
  addon.eval("local VM = ns.GetModule('VendorMemory') VM.enabled, VM.Where, VM.Text = true, function(id) return id == 90012 and { { n = 'TEST-ONLY Thomas' } } or nil end, function(e) return e.n end");
  addon.eval("ns.GetModule('Errands').StockWindow.Refresh()");
  expect(stockWindow(addon).rows[1][1], "Vendor memory knows a merchant: sold by them").toBe("sold by TEST-ONLY Thomas");
  addon.eval("local b = Vanguard_StockList.rows[1].remove b.__scripts.OnClick(b)");
  expect([stockWindow(addon).rows.map((r) => r[0]), addon.eval("return VanguardCharDB.stockList[90011]")], "Remove: the row and the list entry go").toEqual([["item 90012"], null]);
});
it("keep stocked: an amount saves as you type, 0 or an empty box takes the item off when you leave it", () => {
  const addon = loggedIn(STOCK_WINDOW_ENV);
  addon.eval("VanguardCharDB.stockList = { [90011] = 20, [90012] = 5 } ns.GetModule('Errands').StockWindow.Open()");
  // Types text into row i's amount box, as the player would.
  const type = (i, text) => addon.eval(`local b = Vanguard_StockList.rows[${i}].amount b:SetText("${text}") b.__scripts.OnTextChanged(b, true)`);
  // Leaves row i's amount box.
  const leave = (i) => addon.eval(`local b = Vanguard_StockList.rows[${i}].amount b.__scripts.OnEditFocusLost(b)`);
  type(1, "60");
  expect(addon.eval("return VanguardCharDB.stockList[90011]"), "saved at once").toBe(60);
  type(1, "");
  expect(addon.eval("return VanguardCharDB.stockList[90011]"), "an empty box waits").toBe(60);
  leave(2);
  expect(addon.eval("return Vanguard_StockList.rows[2].amount:GetText()"), "leaving a kept amount shows it").toBe("5");
  leave(1);
  expect([addon.eval("return VanguardCharDB.stockList[90011]"), stockWindow(addon).rows.map((r) => r[0])], "left empty: off the list").toEqual([null, ["item 90012"]]);
  type(1, "0");
  leave(1);
  expect(stockWindow(addon), "0: off the list too; the list is empty").toEqual({ shown: true, rows: [], empty: true });
  addon.eval("VanguardCharDB.stockList = { [90011] = 20 } ns.GetModule('Errands').StockWindow.Refresh()");
  type(1, "");
  addon.eval("local SW, b = ns.GetModule('Errands').StockWindow, Vanguard_StockList.rows[1].amount SW.painting = true b.__scripts.OnEditFocusLost(b) SW.painting = nil");
  expect(addon.eval("return VanguardCharDB.stockList[90011]"), "a box hidden by a repaint while you type keeps the item").toBe(20);
  addon.eval("VanguardCharDB.stockList = {}");
  addon.eval("local b = Vanguard_StockList.rows[1].amount b.__scripts.OnEditFocusLost(b) b.__scripts.OnTextChanged(b, true)");
  expect(addon.eval("return next(VanguardCharDB.stockList)"), "a box whose item is gone does nothing").toBe(null);
});
it("keep stocked: Clear list asks first, and /vg stock changes show in the open window", () => {
  const addon = loggedIn(STOCK_WINDOW_ENV);
  addon.eval("ns.GetModule('Errands').StockWindow.Open()");
  addon.eval("local b = Vanguard_StockList.clear b.__scripts.OnClick(b)");
  expect(addon.eval("return Vanguard_Question == nil or not Vanguard_Question:IsShown()"), "an empty list: nothing to ask").toBe(true);
  addon.slash("stock item:90011 45");
  expect(stockWindow(addon).rows.map((r) => r[2]), "/vg stock adds it to the open window").toEqual(["45"]);
  addon.eval("local b = Vanguard_StockList.clear b.__scripts.OnClick(b)");
  expect(addon.eval("return VanguardCharDB.stockList[90011]"), "asked, not yet cleared").toBe(45);
  addon.eval("local q = ns.QuestionFrame and ns.QuestionFrame() for _, w in ipairs(__wfgStub.frames) do if w.text and w.text.__text == 'Clear list' and w:IsVisible() and w ~= Vanguard_StockList.clear then w.__scripts.OnClick(w) end end");
  expect(stockWindow(addon).rows, "yes: the list is empty").toEqual([]);
  addon.slash("stock item:90011 5");
  addon.slash("stock clear");
  expect(stockWindow(addon).rows, "/vg stock clear empties the open window").toEqual([]);
  addon.eval("local b = Vanguard_StockList.done b.__scripts.OnClick(b)");
  expect(stockWindow(addon).shown, "Done closes it").toBe(false);
});
it("keep stocked: an item's name arriving repaints the open window on the next frame", () => {
  const addon = loggedIn(STOCK_WINDOW_ENV);
  addon.eval("VanguardCharDB.stockList = { [90012] = 5 } ns.GetModule('Errands').StockWindow.Open()");
  addon.eval("local get = C_Item.GetItemInfo C_Item.GetItemInfo = function(id) if id == 90012 then return 'TEST-ONLY Water' end return get(id) end");
  addon.fire("GET_ITEM_INFO_RECEIVED", 90012);
  addon.update(0);
  expect(stockWindow(addon).rows[0][0]).toBe("TEST-ONLY Water");
  addon.eval("Vanguard_StockList:Hide()");
  addon.fire("GET_ITEM_INFO_RECEIVED", 90012);
  addon.eval("C_Item.GetItemIconByID = nil ns.GetModule('Errands').StockWindow.Open()");
  expect(stockWindow(addon).rows[0][3], "a client without the icon call: no icon").toBe(false);
});
it("keep stocked: the list is this character's own, never the shared profile's", () => {
  const hunter = loggedIn(STOCK_ENV);
  hunter.slash("stock item:90014 400");
  expect(hunter.eval("return { VanguardCharDB.stockList[90014], VanguardDB.profiles.Default.Errands.stockList == nil }"), "kept in this character's file; the profile (and its export) has no list").toEqual([400, true]);
  const alt = loggedIn(STOCK_ENV + "__goods[4] = { id = 90014, price = 100, stack = 200, left = -1, max = 200 }", { savedVariables: "VanguardDB.profiles = { Default = { Errands = {} } } VanguardCharDB = { profile = 'Default' }" });
  alt.fire("MERCHANT_SHOW");
  expect(alt.eval("return __buys"), "another character on the same profile buys nothing").toEqual({});
});
it("keep stocked: a list saved in the profile moves to the first character who logs in, and leaves the profile", () => {
  const first = loggedIn(STOCK_ENV + "__have = {}", WANT_5);
  expect(first.eval("return { VanguardCharDB.stockList[90011], VanguardDB.profiles.Default.Errands.stockList == nil }"), "this character has it now; the profile doesn't").toEqual([5, true]);
  first.fire("MERCHANT_SHOW");
  expect(first.eval("return __buys"), "and it buys from it").toEqual([[90011, 5]]);
  const own = loggedIn(STOCK_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Errands = { stockList = { [90011] = 5 } } } } VanguardCharDB = { profile = 'Default', stockList = { [90012] = 3 } }" });
  expect(own.eval("return { VanguardCharDB.stockList[90011] or false, VanguardCharDB.stockList[90012], VanguardDB.profiles.Default.Errands.stockList == nil }"), "a character with its own list keeps it; the profile's goes").toEqual([false, 3, true]);
});
it("keep stocked: an item sold in stacks (ammo) is bought in whole stacks", () => {
  const addon = loggedIn(STOCK_ENV + "__goods[4] = { id = 90014, price = 100, stack = 200, left = -1, max = 200 }", { savedVariables: "VanguardDB.profiles = { Default = { Errands = { stockList = { [90014] = 450 } } } }" });
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return __buys"), "450 wanted: two full stacks and the last 50 rounded up to a whole stack of 200").toEqual([[90014, 200], [90014, 200], [90014, 200]]);
  expect(chatHas(addon, /Bought 600 × item 90014 for 3s 0c\./), "and it says what it really bought").toBe(true);
});
// TEST-ONLY stock list wanting item 90011 (5 of it).
const WANT_5 = { savedVariables: "VanguardDB.profiles = { Default = { Errands = { stockList = { [90011] = 5 } } } }" };
// Stock environment with item 90011 sold for 20 marks of honor: the copper price reads 0 (the table says it has an extended cost).
const MARKS_ENV = STOCK_ENV + "__have = {} __goods[1].price = 0 __goods[1].ext = true C_MerchantFrame.GetItemInfo = function(i) local g = __goods[i] return { price = g.price, stackCount = g.stack, numAvailable = g.left, hasExtendedCost = g.ext == true } end ";
it("keep stocked never buys an item that costs honor, badges or other items as if it were free", () => {
  const marks = loggedIn(MARKS_ENV, WANT_5);
  marks.fire("MERCHANT_SHOW");
  expect(marks.eval("return __buys"), "the table says it has an extended cost").toEqual({});
  const costInfo = loggedIn(MARKS_ENV + "__goods[1].price = 5 __goods[1].ext = nil GetMerchantItemCostInfo = function(i) return 1 end", WANT_5);
  costInfo.fire("MERCHANT_SHOW");
  expect(costInfo.eval("return __buys"), "the cost call says so").toEqual({});
  const old = loggedIn(MARKS_ENV + "C_MerchantFrame = nil GetMerchantItemInfo = function(i) return 'x', '', 0, 1, -1 end", WANT_5);
  old.fire("MERCHANT_SHOW");
  expect(old.eval("return __buys"), "a copper price of 0 buys nothing").toEqual({});
  const gold = loggedIn(MARKS_ENV + "__goods[1].price = 5 __goods[1].ext = nil", WANT_5);
  gold.fire("MERCHANT_SHOW");
  expect(gold.eval("return __buys"), "the same item for gold is bought").toEqual([[90011, 5]]);
});
it("keep stocked notes only what arrived: a purchase that fails ends the run and is not reported as bought", () => {
  const none = loggedIn(STOCK_ENV + "__have = {} BuyMerchantItem = function(i, n) __buys[#__buys + 1] = { __goods[i].id, n } end", WANT_5);
  none.fire("MERCHANT_SHOW");
  expect(none.eval("return __buys"), "one try, then it stops").toEqual([[90011, 5]]);
  expect([chatHas(none, /Bought /), chatHas(none, /Stopped buying TEST-ONLY Bread: the last purchase did not arrive in full/)], "nothing reported bought; says why it stopped").toEqual([false, true]);
  const part = loggedIn(STOCK_ENV + "__have = {} __goods[1].max = 4 BuyMerchantItem = function(i, n) __buys[#__buys + 1] = { __goods[i].id, n } __have[90011] = 2 end", WANT_5);
  part.fire("MERCHANT_SHOW");
  expect([part.eval("return #__buys"), chatHas(part, /Bought 2 × TEST-ONLY Bread for 0s 10c\./), chatHas(part, /Stopped buying/)], "half arrived: that half is reported, the run ends").toEqual([1, true, true]);
});
it("keep stocked waits for each purchase to arrive before the next, and trusts a client that cannot count items", () => {
  const wait = loggedIn(STOCK_ENV + "__have = {} __goods[1].max = 2 __later = {} C_Timer = { After = function(s, fn) if s == 0.2 then __later[#__later + 1] = fn end end }", WANT_5);
  wait.fire("MERCHANT_SHOW");
  expect(wait.eval("return #__buys"), "one chunk, then the wait").toBe(1);
  wait.eval("__later[1]()");
  wait.eval("__later[2]()");
  wait.eval("__later[3]()");
  expect([wait.eval("return #__buys"), chatHas(wait, /Bought 5 × TEST-ONLY Bread for 0s 25c\./)], "each next chunk after the last arrived (2, 2, 1)").toEqual([3, true]);
  const blind = loggedIn(STOCK_ENV + "__have = {} C_Item.GetItemCount = nil BuyMerchantItem = function(i, n) __buys[#__buys + 1] = { __goods[i].id, n } end", WANT_5);
  blind.fire("MERCHANT_SHOW");
  expect([blind.eval("return #__buys"), chatHas(blind, /Bought 5 × TEST-ONLY Bread for 0s 25c\./)], "no item count: the purchase is taken as made").toEqual([1, true]);
});
it("keep stocked: closing the merchant ends the run, and the next merchant's item at that place is not bought", () => {
  const swap = loggedIn(STOCK_ENV + "__have = {} __goods[1].max = 2 __later = {} C_Timer = { After = function(s, fn) if s == 0.2 then __later[#__later + 1] = fn end end }", WANT_5);
  swap.fire("MERCHANT_SHOW");
  swap.fire("MERCHANT_CLOSED");
  expect(chatHas(swap, /Bought 2 × TEST-ONLY Bread for 0s 10c\./) && !chatHas(swap, /Stopped buying/), "the run ends and says what arrived").toBe(true);
  swap.eval("__goods = { { id = 77777, price = 50000, stack = 1, left = -1, max = 20 } }");
  swap.fire("MERCHANT_SHOW");
  swap.eval("for _, f in ipairs(__later) do f() end");
  expect([swap.eval("return #__buys"), swap.eval("return ns.GetModule('Errands').stocking")], "the old run's timer buys nothing at the new merchant").toEqual([1, null]);
  const moved = loggedIn(STOCK_ENV + "__have = {} __goods[1].max = 2 __later = {} C_Timer = { After = function(s, fn) if s == 0.2 then __later[#__later + 1] = fn end end }", WANT_5);
  moved.fire("MERCHANT_SHOW");
  moved.eval("__goods[1] = { id = 77777, price = 50000, stack = 1, left = -1, max = 20 }");
  moved.eval("__later[1]()");
  expect(moved.eval("return #__buys"), "the merchant has something else at the order's place: no buy").toBe(1);
});
// TEST-ONLY group: you lead a party; every raid tool call is recorded.
const TOOLS_GROUP_ENV = `
  __leader, __assist, __inGroup, __inRaid, __markable, __calls = true, false, true, false, true, {}
  local function log(text) __calls[#__calls + 1] = text end
  IsInGroup = function() return __inGroup end
  IsInRaid = function() return __inRaid end
  UnitIsGroupLeader = function() return __leader end
  UnitIsGroupAssistant = function() return __assist end
  IsEveryoneAssistant = function() return false end
  C_PartyInfo = { DoReadyCheck = function() log("ready") end, DoCountdown = function(n) log("pull " .. n) end, ConvertToRaid = function() log("raid") end }
  InitiateRolePoll = function() log("roles") end
  SetRaidTarget = function(unit, i) log("mark " .. unit .. " " .. i) end
  CanBeRaidTarget = function() return __markable end
  function __tool(i, button) local b = Vanguard_RaidTools.list[i] b.__scripts.OnClick(b, button or "LeftButton") end
`;
it("raid tools: calls, target icons and world markers for the leader and assistants", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_GROUP_ENV);
  // Whether the bar shows, and whether its Raid button does.
  const state = () => addon.eval("local a = Vanguard_RaidTools.actions return { Vanguard_RaidTools:IsShown(), a.ConvertToRaid:IsShown() }");
  expect(state(), "a party's leader sees the bar, with Raid").toEqual([true, true]);
  addon.eval("for i = 1, 4 do __tool(i) end __tool(2, 'RightButton') __tool(5) __tool(13)");
  expect(addon.eval("return __calls"), "ready check, pull 10 (right-click cancels), roles, convert; skull on the target, then clear").toEqual(["ready", "pull 10", "roles", "raid", "pull 0", "mark target 1", "mark target 0"]);
  addon.eval("__markable = false __calls = {} __tool(5)");
  expect(addon.eval("return #__calls"), "a target that can't be marked is left alone").toBe(0);
  expect(addon.eval(`local m, c = Vanguard_RaidTools.list[14], Vanguard_RaidTools.list[22]
    return { m:GetAttribute("type"), m:GetAttribute("marker"), m:GetAttribute("action1"), m:GetAttribute("action2"), c:GetAttribute("action") }`), "world markers are the game's secure marker buttons").toEqual(["worldmarker", 1, "toggle", "clear", "clear"]);
  expect(addon.eval("return { Vanguard_RaidTools.list[14]:GetAttribute('useOnKeyDown'), Vanguard_RaidTools.list[22]:GetAttribute('useOnKeyDown') }"), "the marker buttons act on the release they listen for, even with key-down casting on").toEqual([false, false]);
  addon.eval("__inRaid, __leader, __assist = true, false, true");
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(state(), "a raid assistant sees it too, without Raid").toEqual([true, false]);
  addon.eval("__assist = false");
  setCombat(addon, true);
  addon.fire("PARTY_LEADER_CHANGED");
  expect(state()[0], "in combat it waits").toBe(true);
  setCombat(addon, false);
  expect(state()[0], "then hides for a plain raid member").toBe(false);
  const bare = loggedIn(UNITS_ENV + TOOLS_GROUP_ENV + "C_PartyInfo = { DoReadyCheck = C_PartyInfo.DoReadyCheck } InitiateRolePoll = nil");
  expect(bare.eval("local out = {} for k in pairs(Vanguard_RaidTools.actions) do out[#out + 1] = k end return out"), "only the calls this client has").toEqual(["DoReadyCheck"]);
  const solo = loggedIn(UNITS_ENV + TOOLS_GROUP_ENV + "__inGroup = false");
  expect(solo.eval("return Vanguard_RaidTools:IsShown()"), "hidden out of a group").toBe(false);
});
it("raid tools: in a raid the bar is sized by the three buttons showing, not the hidden Raid label (deDE 'Schlachtzug')", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_GROUP_ENV);
  addon.eval("Vanguard_RaidTools.actions.ConvertToRaid.text:SetText('Schlachtzug')");
  addon.fire("PLAYER_ENTERING_WORLD");
  // The bar's width, its drawn width, the Ready button's width and where the Roles button ends from the bar's left.
  const bar = () => addon.eval("local b = Vanguard_RaidTools return { b:GetWidth(), b:GetRight() - b:GetLeft(), b.actions.DoReadyCheck:GetWidth(), b.actions.InitiateRolePoll:GetRight() - b:GetLeft() }");
  const party = bar();
  expect(party[0], "in a party the long Raid label widens the buttons and the bar").toBeGreaterThan(addon.eval("return ns.GetModule('RaidTools').ROW_W"));
  addon.eval("__inRaid, __leader, __assist = true, false, true");
  addon.fire("GROUP_ROSTER_UPDATE");
  const raid = bar();
  expect(raid[0], "in a raid the bar is back at its icon rows' width").toBe(addon.eval("return ns.GetModule('RaidTools').ROW_W"));
  expect(raid[2], "and the three buttons are narrower than with Raid").toBeLessThan(party[2]);
  addon.eval("__inRaid, __leader, __assist = false, true, false");
  addon.fire("GROUP_ROSTER_UPDATE");
  expect(bar(), "back in a party it widens again").toEqual(party);
});

it("raid frames: groups as rows, and the main tank's shield", () => {
  const rows = loggedIn(UNITS_ENV + RAID_ENV, { savedVariables: "VanguardDB.profiles = { Default = { RaidFrames = { layout = 'rows' } } }" });
  expect(rows.eval(`local h = Vanguard_Raid return { h:GetAttribute("point"), h:GetAttribute("columnAnchorPoint"), h:GetAttribute("xOffset"), h:GetAttribute("yOffset"), Vanguard_RaidHolder:GetWidth(), Vanguard_RaidHolder:GetHeight() }`), "each group a row of five, groups stacked up; the holder is one row").toEqual(["LEFT", "BOTTOM", 4, 0, 516, 48]);
  const addon = loggedIn(UNITS_ENV + RAID_ENV + 'GetPartyAssignment = function(kind, unit) return (unit == "raid1" and kind == "MAINTANK") or (unit == "raid2" and kind == "MAINASSIST") end');
  addon.eval('__spawn(1, "raid1") __spawn(2, "raid2") __spawn(3, "raid3")');
  // Whether tile i's role mark shows, and its color.
  const tint = (i) => addon.eval(`local b = Vanguard_RaidUnitButton${i} return { b.role:IsShown(), b.role.__vertexColor }`);
  expect(raidButton(addon, 1).role === addon.eval("return ns.Theme.Icon('RoleTank')") && isTok(addon, tint(1)[1], "accent"), "the main tank's shield in the accent").toBe(true);
  expect(raidButton(addon, 2).role === addon.eval("return ns.Theme.Icon('RoleTank')") && isTok(addon, tint(2)[1], "text2"), "the main assist's in text2").toBe(true);
  expect(tint(3)[0], "no assignment, no role: no mark").toBe(false);
});
// TEST-ONLY merchant: repairs for 50s; bag 0 holds a gray item, a gray with no value, and a white.
const MERCHANT_ENV = `
  C_MerchantFrame = nil
  __repairs, __used = {}, {}
  CanMerchantRepair = function() return __canRepair end
  __canRepair, __cost, __gold = true, 5000, 10000
  GetRepairAllCost = function() return __cost, true end
  GetMoney = function() return __gold end
  RepairAllItems = function(guild) __repairs[#__repairs + 1] = guild end
  __bag = { { quality = 0 }, { quality = 0, hasNoValue = true }, { quality = 1 }, { quality = { __secret = true } } }
  __sticky = 1
  C_Container = { GetContainerNumSlots = function(bag) return bag == 0 and 4 or 0 end,
    GetContainerItemInfo = function(bag, slot) return __bag[slot] end,
    UseContainerItem = function(bag, slot) __used[#__used + 1] = slot if __sticky > 0 then __sticky = __sticky - 1 else __bag[slot] = nil end end }
  C_Timer = { After = function(_, fn) fn() end }
  ERR_ABILITY_COOLDOWN = "TEST-ONLY not ready"
  -- The client's message names by type: 51 is a noisy one, 52 is not; past 60 the client refuses the index.
  GetGameMessageInfo = function(i) if i > 60 then error("bad index") end return ({ [51] = "ERR_ABILITY_COOLDOWN", [52] = "ERR_OUT_OF_RANGE" })[i] or "ERR_OTHER" end
  -- The game's own error line: its handler asks ShouldDisplayMessageType, which reads the game's blacklist
  -- (type 99 on it; SetMessageTypeEnabled adds to it), shows the message under its type as the line's ID,
  -- and plays the type's sound.
  UIErrorsFrame = CreateFrame("Frame", "UIErrorsFrame", UIParent) UIErrorsFrame:RegisterEvent("UI_ERROR_MESSAGE")
  __blacklist = { [99] = true }
  function UIErrorsFrame:SetMessageTypeEnabled(messageType, enabled) __blacklist[messageType] = not enabled end
  function UIErrorsFrame:ShouldDisplayMessageType(messageType) return not __blacklist[messageType] end
  __askGame = UIErrorsFrame.ShouldDisplayMessageType
  function UIErrorsFrame:AddMessage(text, r, g, b, a, id) self.__lines = self.__lines or {} self.__lines[#self.__lines + 1] = { text, id } end
  UIErrorsFrame:SetScript("OnEvent", function(self, event, messageType, message)
    if type(message) == "string" and self:ShouldDisplayMessageType(messageType, message) then self:AddMessage(message, 1, 0.1, 0.1, 1, messageType) __sounds = (__sounds or 0) + 1 end
  end)
`;
it("at a merchant: repair with your own gold, sell junk", () => {
  const addon = loggedIn(MERCHANT_ENV);
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return __repairs"), "repairs with your own gold, not the guild's").toEqual([false]);
  expect(chatHas(addon, /Repaired for 50s 0c/) && chatHas(addon, /Selling 1 junk item/), "and says so").toBe(true);
  expect(addon.eval("return { __used, __bag[1] == nil }"), "the gray item is sold, tried again when the first try didn't take").toEqual([[1, 1], true]);
  addon.eval("__gold = 100 __repairs = {}");
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return #__repairs") === 0 && chatHas(addon, /Not enough gold to repair/), "no repair you can't pay for").toBe(true);
  addon.eval("__cost = 0");
  addon.fire("MERCHANT_SHOW");
  addon.eval("__canRepair = false");
  addon.fire("MERCHANT_SHOW");
  addon.eval("C_MerchantFrame = { SellAllJunkItems = function() __all = true end }");
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return __all"), "the client's own one-step sale where it has one").toBe(true);
  const off = loggedIn(MERCHANT_ENV, { savedVariables: "VanguardDB.profiles = { Default = { Merchant = { repair = false, junk = false, errors = false } } }" });
  off.fire("MERCHANT_SHOW");
  expect(off.eval("return { #__repairs, #__used, UIErrorsFrame:IsEventRegistered('UI_ERROR_MESSAGE') }"), "each part can be turned off").toEqual([0, 0, true]);
  const bare = loggedIn("CanMerchantRepair = nil");
  bare.fire("MERCHANT_SHOW");
  expect(bare.eval("return #ns.GetModule('Merchant').NoisyTypes()"), "a client without these calls does nothing").toBe(0);
});
it("junk selling stops when the merchant closes or a fight starts: no retry uses a bag item with no merchant open", () => {
  const addon = loggedIn(MERCHANT_ENV + "__sticky = 5 __later = {} C_Timer = { After = function(s, fn) if s == 0.3 then __later[#__later + 1] = fn end end }");
  const MC = "ns.GetModule('Merchant')";
  addon.fire("MERCHANT_SHOW");
  expect(addon.eval("return __used"), "the first pass sells at once").toEqual([1]);
  addon.fire("MERCHANT_CLOSED");
  addon.eval("local t = __later __later = {} for _, f in ipairs(t) do f() end");
  expect(addon.eval("return __used"), "the retry after the merchant closed uses nothing").toEqual([1]);
  addon.eval(`${MC}.SellJunk(3)`);
  expect(addon.eval("return __used"), "nor does a call with no merchant open").toEqual([1]);
  addon.fire("MERCHANT_SHOW");
  addon.eval("__used = {}");
  setCombat(addon, true);
  addon.eval(`${MC}.SellJunk(3)`);
  expect(addon.eval("return __used"), "nor one in combat").toEqual({});
});
it("the error line drops what the action bar already shows, and the rest takes the game's own path", () => {
  const addon = loggedIn(MERCHANT_ENV);
  expect(addon.eval("return UIErrorsFrame:IsEventRegistered('UI_ERROR_MESSAGE')"), "the game's own handler keeps the event").toBe(true);
  addon.fire("UI_ERROR_MESSAGE", 51, "TEST-ONLY not ready");
  addon.fire("UI_ERROR_MESSAGE", 52, "TEST-ONLY Out of range");
  addon.fire("UI_ERROR_MESSAGE", 52, "TEST-ONLY Out of range");
  addon.fire("UI_ERROR_MESSAGE", 99, "TEST-ONLY Blacklisted by the game");
  addon.fire("UI_ERROR_MESSAGE", 53);
  expect(addon.eval("return UIErrorsFrame.__lines"), "noise is dropped, useful errors stay under their type as the line's ID (so repeats refresh), the game's own blacklist still applies").toEqual([["TEST-ONLY Out of range", 52], ["TEST-ONLY Out of range", 52]]);
  expect(addon.eval("return __sounds"), "and the game's handler still ran for what showed (sounds)").toBe(2);
  expect(addon.eval("return UIErrorsFrame.ShouldDisplayMessageType == __askGame"), "the game's own method is never replaced").toBe(true);
  const none = loggedIn("UIErrorsFrame = nil");
  expect(none.eval("return ns.GetModule('Merchant').settings.errors"), "no error line on this client: nothing to filter").toBe(true);
  const old = loggedIn(MERCHANT_ENV + "UIErrorsFrame.SetMessageTypeEnabled = nil");
  old.fire("UI_ERROR_MESSAGE", 51, "TEST-ONLY not ready");
  expect(old.eval("return UIErrorsFrame.__lines"), "an error line without the per-type switch is left alone").toEqual([["TEST-ONLY not ready", 51]]);
});
it("the AFK screen: a dimmed screen and a card while you're away", () => {
  const addon = loggedIn(UNITS_ENV + AFK_ENV);
  // The AFK screen and its card's texts.
  const afk = () => addon.eval(`local f = Vanguard_AfkScreen
    return { shown = f:IsShown(), name = f.name:GetText(), who = f.who:GetText(), where = f.where:GetText(), away = f.away:GetText(), clock = f.clock:GetText(), xp = f.xp:IsShown() and f.xp.__value, color = f.name.__textColor }`);
  expect(afk().shown, "hidden while you're here").toBe(false);
  addon.eval("__afk = true");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  const card = afk();
  expect(card, "your name, level and class, where you are, the time away and the clock, your XP").toMatchObject({ shown: true, name: "<name>", who: "Level 42 Class", where: "TEST-ONLY Vale  ·  TEST-ONLY Hamlet", away: "Away 0:00", clock: "21:04", xp: 300 });
  expect(card.color.slice(0, 3), "the name in your class color").toEqual([0.25, 0.78, 0.92]);
  expect(addon.eval("return { Vanguard_AfkScreen.__strata, Vanguard_AfkScreen.dim.__vertexColor[4] }"), "over the whole UI, dimmed").toEqual(["FULLSCREEN_DIALOG", 0.75]);
  addon.eval("__wfgStub.advance(65, 1)");
  expect(afk().away, "the time away ticks").toBe("Away 1:05");
  expect(addon.eval("return ns.GetModule('AfkScreen').AwayText(3725)"), "past an hour").toBe("Away 1:02:05");
  addon.fire("PLAYER_FLAGS_CHANGED", "party1");
  addon.eval("__afk = false");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  expect(afk().shown, "back: it goes").toBe(false);
});
it("the AFK screen fades in over 0.4 s and, when a fight starts, out in 0.15 s", () => {
  const addon = loggedIn(UNITS_ENV + AFK_ENV + FAKE_FADES);
  addon.eval("__fakeFader(Vanguard_AfkScreen) __afk = true");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  expect(addon.eval("local d = __fades[1].duration __finishFades() return d"), "away: the screen fades in slowly").toBe(0.4);
  addon.fire("PLAYER_REGEN_DISABLED");
  expect(addon.eval("return __fades[1].duration"), "a fight puts it away quickly (0.2 s outside one)").toBe(0.15);
});
it("the AFK screen: clicks, keys and fights put it away; what the client can't say is left out", () => {
  const addon = loggedIn(UNITS_ENV + AFK_ENV);
  // Marks you away (or back) and says so.
  const away = (on) => { addon.eval(`__afk = ${on}`); addon.fire("PLAYER_FLAGS_CHANGED", "player"); return addon.eval("return Vanguard_AfkScreen:IsShown()"); };
  expect(away(true), "away").toBe(true);
  addon.eval("Vanguard_AfkScreen.__scripts.OnMouseDown(Vanguard_AfkScreen)");
  expect([addon.eval("return Vanguard_AfkScreen:IsShown()"), away(true)], "a click puts it away, and it stays away while you are").toEqual([false, false]);
  away(false);
  expect(away(true), "next time you're away it's back").toBe(true);
  addon.eval("Vanguard_AfkScreen.__scripts.OnKeyDown(Vanguard_AfkScreen, 'ENTER')");
  expect(addon.eval("return Vanguard_AfkScreen:IsShown()"), "a key puts it away too").toBe(false);
  away(false);
  away(true);
  setCombat(addon, true);
  addon.fire("PLAYER_REGEN_DISABLED");
  expect([addon.eval("return Vanguard_AfkScreen:IsShown()"), away(true)], "a fight puts it away; it doesn't open in one").toEqual([false, false]);
  setCombat(addon, false);
  expect(addon.eval("return Vanguard_AfkScreen:IsShown()"), "after the fight, still away: it's back").toBe(true);
  addon.eval("__level = 60 UnitClass = function() return { __secret = true }, { __secret = true } end GetSubZoneText = function() return 'TEST-ONLY Vale' end ns.GetModule('AfkScreen').Paint()");
  const capped = addon.eval("local f = Vanguard_AfkScreen return { f.xp:IsShown(), f.who:GetText(), f.where:GetText(), f.name.__textColor }");
  expect(capped.slice(0, 3), "at the cap no XP bar; a hidden class is left out; no spot within the zone").toEqual([false, "Level 60", "TEST-ONLY Vale"]);
  expect(isTok(addon, capped[3], "accent"), "the name in the accent when the class is hidden").toBe(true);
  addon.eval("UnitIsAFK = function() return { __secret = true } end");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  expect(addon.eval("return Vanguard_AfkScreen:IsShown()"), "a hidden away flag counts as here").toBe(false);
  // The modules that read the unit calls this client lacks are off: a client without UnitClass breaks them, and the card is the point here.
  const needUnits = ["UnitFrames", "ComboPoints", "ClassBars", "SwingTimer", "InfoStrip", "Inventory"].map((name) => name + " = false").join(", ");
  const bare = loggedIn("UnitName = nil UnitLevel = nil UnitClass = nil UnitXP = nil", { savedVariables: `VanguardDB.profiles = { Default = { modules = { ${needUnits} } } }` });
  bare.eval("ns.GetModule('AfkScreen').Paint()");
  expect(bare.eval("local f = Vanguard_AfkScreen return { f.name:GetText(), f.who:GetText(), f.xp:IsShown() }"), "a client that can't say much gets a blank card, no errors").toEqual(["", "", false]);
});
it("the AFK screen's backdrop: your faction's passage under the card, in its heading font and crest color", () => {
  const addon = loggedIn(UNITS_ENV + AFK_ENV + CLICK_LUA + '__faction = "Alliance" UnitFactionGroup = function() return __faction end');
  addon.eval('ns.Theme.Settings().faction = "auto" ns.Theme.Refresh()');
  // The passage's shown state, font file, opening words, attribution, color and wrap width.
  const passage = () => addon.eval(`local f = Vanguard_AfkScreen
    return { f.passage:IsShown(), f.passage.__font[1]:match("[^\\\\]+$"), f.passage:GetText():sub(1, 14), f.by:GetText(), f.passage.__textColor, f.passage:GetWidth() }`);
  addon.eval("__afk = true");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  const ally = passage();
  expect(ally.slice(0, 4), "Alliance: Varian's letter, in Cinzel").toEqual([true, "Cinzel-SemiBold.ttf", "My son, a terr", "Varian Wrynn, to his son Anduin"]);
  expect([isTok(addon, ally[4], "allianceCrest"), ally[5]], "in Alliance gold, wrapped under the card").toEqual([true, 640]);
  expect(addon.eval("return Vanguard_AfkScreen.passage.__font[2] > ns.Theme.RoleSize('title')"), "a size over the title's").toBe(true);
  addon.eval('__faction = "Horde"');
  addon.fire("NEUTRAL_FACTION_SELECT_RESULT");
  const horde = passage();
  expect([horde[0], horde[1], horde[2], horde[3], isTok(addon, horde[4], "hordeCrest")], "Horde: the Blood Oath, in Metamorphous and Horde red").toEqual([true, "Metamorphous-Regular.ttf", "Lok'tar ogar! ", "The Blood Oath of the Horde", true]);
  addon.slash("");
  addon.eval('__click("Faction look")');
  expect(addon.eval("local f = Vanguard_AfkScreen return { f.passage:IsShown(), f.by:IsShown() }"), "the faction look off: no passage").toEqual([false, false]);
  addon.eval('__click("Faction look") __click("Faction look") __faction = "Neutral" ns.Theme.Refresh()');
  expect(addon.eval("return Vanguard_AfkScreen.passage:IsShown()"), "a neutral character: none").toBe(false);
});
it("the AFK screen: after a fight while you're still away, the time away runs on from when you went away", () => {
  const addon = loggedIn(UNITS_ENV + AFK_ENV);
  addon.eval("__afk = true");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  addon.eval("__wfgStub.advance(300, 1)");
  setCombat(addon, true);
  addon.fire("PLAYER_REGEN_DISABLED");
  addon.eval("__wfgStub.advance(10, 1)");
  setCombat(addon, false);
  addon.eval("__wfgStub.advance(1, 1)");
  expect(addon.eval("return { Vanguard_AfkScreen:IsShown(), Vanguard_AfkScreen.away:GetText() }"), "back on screen, still counting").toEqual([true, "Away 5:11"]);
  addon.eval("__afk = false");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  addon.eval("__afk = true");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  expect(addon.eval("return Vanguard_AfkScreen.away:GetText()"), "back, then away again: it starts over").toBe("Away 0:00");
});
// Marks you away and says whether the AFK screen shows.
const goAway = (addon) => {
  addon.eval("__afk = true");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  return addon.eval("return Vanguard_AfkScreen:IsShown()");
};
it("A-13 the AFK screen stays shut in a dungeon, raid, battleground or arena, but not in the open world or a scenario", () => {
  const addon = loggedIn(UNITS_ENV + AFK_ENV + '__where = "party" IsInInstance = function() return __where ~= "none", __where end');
  expect(goAway(addon), "in a dungeon").toBe(false);
  for (const kind of ["raid", "pvp", "arena"]) {
    addon.eval(`__where = "${kind}"`);
    expect(goAway(addon), kind).toBe(false);
  }
  addon.eval('__where = "scenario"');
  expect(goAway(addon), "a scenario").toBe(true);
});
it("A-13 the AFK screen waits while you cast or channel, tries once more 30 s on, and a hidden cast counts as casting", () => {
  const addon = loggedIn(UNITS_ENV + AFK_ENV + "__cast, __channel = 'TEST-ONLY Hearthstone', nil UnitCastingInfo = function() return __cast end UnitChannelInfo = function() return __channel end");
  expect(goAway(addon), "casting: shut").toBe(false);
  addon.eval("__cast, __channel = nil, 'TEST-ONLY Drink'");
  addon.eval("__wfgStub.advance(30, 1)");
  expect(addon.eval("return Vanguard_AfkScreen:IsShown()"), "the retry: still channelling, still shut").toBe(false);
  addon.eval("__channel = nil");
  addon.eval("__wfgStub.advance(60, 1)");
  expect(addon.eval("return Vanguard_AfkScreen:IsShown()"), "only one retry each time you're away").toBe(false);
  addon.eval("__afk = false");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  addon.eval("__cast = 'TEST-ONLY Hearthstone'");
  expect(goAway(addon), "away again while casting: shut").toBe(false);
  addon.eval("__cast = nil __wfgStub.advance(30, 1)");
  expect(addon.eval("return Vanguard_AfkScreen:IsShown()"), "the cast over by the retry: it opens").toBe(true);
  addon.eval("__afk = false");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  addon.eval("__cast = { __secret = true }");
  expect(goAway(addon), "a hidden cast answer: shut").toBe(false);
});
it("A-13 a ready check or a popup puts the AFK screen away at once, so the first click lands on the prompt; it comes back next time you're away", () => {
  const addon = loggedIn(UNITS_ENV + AFK_ENV + FAKE_FADES);
  addon.eval("__fakeFader(Vanguard_AfkScreen)");
  goAway(addon);
  addon.eval("__finishFades()");
  addon.fire("READY_CHECK", "TEST-ONLY leader", 30);
  expect(addon.eval("return Vanguard_AfkScreen:IsShown()"), "a ready check: gone, no fade").toBe(false);
  addon.fire("PLAYER_REGEN_ENABLED");
  expect(addon.eval("return Vanguard_AfkScreen:IsShown()"), "and it stays away while the prompt may still be up").toBe(false);
  addon.eval("__afk = false");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  goAway(addon);
  addon.eval("__finishFades()");
  addon.eval('StaticPopup_Show("TEST-ONLY_INVITE")');
  expect(addon.eval("return Vanguard_AfkScreen:IsShown()"), "a popup: gone").toBe(false);
  addon.eval("__afk = false");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  goAway(addon);
  addon.eval("__finishFades() StaticPopupSpecial_Show(CreateFrame('Frame', 'TEST-ONLY_RolePoll', UIParent))");
  expect(addon.eval("return Vanguard_AfkScreen:IsShown()"), "a prompt frame of its own: gone").toBe(false);
});
it("the AFK screen: a long zone line wraps clear of the faction crest and above the away row", () => {
  const addon = loggedIn(UNITS_ENV + AFK_ENV + "__wfgStub.setScreen(1920, 1080) GetRealZoneText = function() return 'TEST-ONLY Östliche Pestländer' end GetSubZoneText = function() return 'TEST-ONLY Kapelle des Hoffnungsvollen Lichts' end");
  addon.eval("__afk = true");
  addon.fire("PLAYER_FLAGS_CHANGED", "player");
  const [where, crest, away] = ["where", "crest", "away"].map((key) => addon.frame(`Vanguard_AfkScreen.${key}`).rect);
  expect(where.left, "the zone line starts right of the crest").toBeGreaterThanOrEqual(crest.right);
  expect(where.bottom, "and its second line stays above the away row").toBeGreaterThanOrEqual(away.top);
  expect(addon.eval("return Vanguard_AfkScreen.where:GetMaxLines()"), "at most two lines").toBe(2);
});
