// inventory: other characters' bags and bank (Modules/Inventory.lua) in the TEST-ONLY headless client.

import { expect, it } from "vitest";
import { chatHas, loggedIn } from "./helpers.mjs";

// TEST-ONLY bags: 5 linen in the backpack and 3 in bag 1, one other item; a bank of two
// bought tabs (bags 6 and 7) holding 4 linen; and a tooltip that records its lines.
const BAGS_ENV = `
  __wfgWorld.bags = { [0] = { [1] = { itemID = 2589, count = 5 } }, { [2] = { itemID = 2589, count = 3 }, [3] = { itemID = 118 } }, {}, {}, {} }
  __wfgWorld.bags[6] = { [1] = { itemID = 2589, count = 4 } }
  __wfgWorld.bags[7] = {}
  __wfgWorld.bagSizes[6], __wfgWorld.bagSizes[7] = 8, 8
  Enum.BankType = { Character = 0, Account = 2 }
  C_Bank = { FetchPurchasedBankTabData = function(kind) if kind == 0 then return { { ID = 6 }, { ID = 7 } } end end }
  __tt = {}
  function __tt:AddLine(text, r, g, b) self.lines[#self.lines + 1] = { text, { r, g, b } } end
  function __tt:AddDoubleLine(left, right, lr, lg, lb, rr, rg, rb) self.lines[#self.lines + 1] = { left .. " " .. right, { lr, lg, lb } } end
  function __tip(link) __tt.lines = {} ns.GetModule("Inventory").AddLines(__tt, link) local out = {} for i, l in ipairs(__tt.lines) do out[i] = l[1] end return out end
`;

// This character's record (Tester, a mage on Forever Test, Alliance).
const mine = (addon) => addon.eval('return VanguardDB.inventory["ForeverTest-Alliance"].Tester');

it("inventory: the bags are read at login and half a second after they change, the bank while it's open", () => {
  const addon = loggedIn(BAGS_ENV);
  expect([mine(addon).bags, mine(addon).class], "bags counted by item at login, with the class").toEqual([{ 2589: 8, 118: 1 }, "MAGE"]);
  expect(mine(addon).bank, "the bank isn't read until it's open").toEqual({});
  addon.eval("__wfgWorld.bags[0][1].count = 10");
  addon.fire("BAG_UPDATE_DELAYED");
  addon.fire("BAG_UPDATE_DELAYED");
  expect(mine(addon).bags[2589], "not read at once").toBe(8);
  addon.advance(0.6, 0.1);
  expect(mine(addon).bags[2589], "read once the changes settle").toBe(13);
  addon.fire("BANKFRAME_OPENED");
  expect(mine(addon).bank, "the bank's bought tabs, read when it opens").toEqual({ 2589: 4 });
  addon.eval("__wfgWorld.bags[7][1] = { itemID = 118, count = 2 }");
  addon.fire("PLAYERBANKSLOTS_CHANGED");
  addon.advance(0.6, 0.1);
  expect(mine(addon).bank, "and as it changes while open").toEqual({ 2589: 4, 118: 2 });
  addon.fire("BANKFRAME_CLOSED");
  addon.eval("__wfgWorld.bags[6][1] = nil");
  addon.fire("BAG_UPDATE_DELAYED");
  addon.advance(0.6, 0.1);
  expect(mine(addon).bank, "shut: the last reading is kept").toEqual({ 2589: 4, 118: 2 });
  const bare = loggedIn();
  expect(bare.eval("return #ns.GetModule('Inventory').BankBags()"), "a client without bank tabs: no bank containers").toBe(0);
});

it("inventory: an item taken from the bank just before it closes leaves the bank's reading", () => {
  const addon = loggedIn(BAGS_ENV);
  addon.fire("BANKFRAME_OPENED");
  addon.eval("__wfgWorld.bags[6][1] = nil __wfgWorld.bags[0][2] = { itemID = 2589, count = 4 }");
  addon.fire("BAG_UPDATE_DELAYED");
  addon.advance(0.1, 0.05);
  addon.fire("BANKFRAME_CLOSED");
  addon.advance(0.6, 0.1);
  expect([mine(addon).bags[2589], mine(addon).bank], "in the bags only").toEqual([12, {}]);
});

// TEST-ONLY saved characters on this realm and side: two with linen (one with a class),
// one without any, a broken entry, and the logged-in character itself.
const ALTS = `VanguardDB.inventory = { ["ForeverTest-Alliance"] = {
  Alpha = { class = "WARRIOR", bags = { [2589] = 5 }, bank = { [2589] = 3 } },
  Bravo = { bags = { [2589] = 2 } },
  Charlie = { class = "ROGUE", bags = { [118] = 1 }, bank = {} },
  Broken = true,
}, ["Other Realm - Horde"] = { Zed = { bags = { [2589] = 99 } } } }`;

it("inventory: item tooltips list who else has it, in their class color, then the total", () => {
  const addon = loggedIn(BAGS_ENV, { savedVariables: ALTS });
  addon.eval("C_Item.GetItemCount = function() return 8 end");
  expect(addon.eval('return __tip("item:2589:0:0")'), "each other character here with it, by name, then everyone's total").toEqual(["Alpha 8 (bank 3)", "Bravo 2", "Total 18"]);
  expect(addon.eval('__tip("item:2589") local c = RAID_CLASS_COLORS.WARRIOR return { __tt.lines[1][2][1] == c.r, __tt.lines[2][2][1] == ns.Theme.RGB("text") }'), "a known class in its color, else the text color").toEqual([true, true]);
  expect(addon.eval('return { #__tip("item:999"), #__tip("TEST-ONLY not a link") }'), "nobody else has it, or no item id: no lines").toEqual([0, 0]);
  addon.eval("ns.GetModule('Inventory').settings.alts = false");
  expect(addon.eval('return #__tip("item:2589")'), "switched off: no lines").toBe(0);
  expect(addon.eval("local IV = ns.GetModule('Inventory') for _, fn in ipairs(ns.GetModule('Tooltips').itemLines) do if fn == IV.AddLines then return true end end"), "added to every item tooltip").toBe(true);
});

it("inventory: a crowd of characters is cut to six names", () => {
  let crowd = "";
  for (let i = 1; i <= 8; i += 1) crowd += `Alt${i} = { bags = { [2589] = 1 } }, `;
  const addon = loggedIn(BAGS_ENV, { savedVariables: `VanguardDB.inventory = { ["ForeverTest-Alliance"] = { ${crowd} } }` });
  addon.eval("C_Item.GetItemCount = function() return 0 end");
  const lines = addon.eval('return __tip("item:2589")');
  expect([lines.length, lines[5], lines[6], lines[7]], "six names, how many more, and the total of all eight").toEqual([8, "Alt6 1", "+2 more", "Total 8"]);
});

it("inventory: /vg inventory lists, forgets one, or forgets them all", () => {
  const addon = loggedIn(BAGS_ENV, { savedVariables: ALTS });
  addon.slash("inventory");
  expect([chatHas(addon, /Characters remembered here: 5\./), chatHas(addon, /^.*Tester: bags read today/)], "how many, and when each was read").toEqual([true, true]);
  addon.slash("inventory forget alpha");
  expect([chatHas(addon, /Forgot Alpha's bags and bank\./), addon.eval('return VanguardDB.inventory["ForeverTest-Alliance"].Alpha == nil')], "any case").toEqual([true, true]);
  addon.slash("inventory forget Nobody");
  expect(chatHas(addon, /No character called Nobody is remembered here\./), "an unknown name").toBe(true);
  addon.slash("inventory clear");
  expect([chatHas(addon, /Forgot every character's bags and bank\./), addon.eval("return VanguardDB.inventory == nil")], "clear forgets every realm").toEqual([true, true]);
  addon.clearChat();
  addon.slash("inventory");
  expect(chatHas(addon, /No characters remembered here yet\./), "then nobody is listed").toBe(true);
});

it("inventory: a client that can't say your name or read bags stores nothing and breaks nothing", () => {
  const addon = loggedIn("C_Container = { GetContainerNumFreeSlots = function() return 0 end }");
  expect([mine(addon).bags, addon.eval("return #ns.errors")], "no bags read, no error").toEqual([{}, 0]);
  const nameless = addon.eval(`local IV, real = ns.GetModule("Inventory"), UnitName
    UnitName = function() return nil end
    local record, before = IV.Mine(), 0
    UnitName = real
    for _ in pairs(IV.Characters()) do before = before + 1 end
    return { kept = before, bags = record.bags }`);
  expect(nameless, "no name: a record kept nowhere").toEqual({ kept: 1, bags: {} });
});

it("inventory: each record keeps level, money, rested XP and time played, and /vg alts lists them", () => {
  const addon = loggedIn(BAGS_ENV + "GetMoney = function() return 34567 end GetXPExhaustion = function() return 500 end UnitXPMax = function() return 2000 end UnitLevel = function() return 12 end", { savedVariables: ALTS });
  expect([mine(addon).level, mine(addon).money, mine(addon).rested], "read at login").toEqual([12, 34567, 25]);
  addon.fire("TIME_PLAYED_MSG", 90000 + 4 * 3600, 100);
  addon.eval("GetXPExhaustion = function() return nil end");
  addon.fire("PLAYER_LOGOUT");
  expect([mine(addon).played, mine(addon).rested], "the played total is kept; no rested XP clears it").toEqual([90000 + 4 * 3600, undefined]);
  addon.eval("VanguardDB.inventory['ForeverTest-Alliance'].Alpha.money = 1000 VanguardDB.inventory['ForeverTest-Alliance'].Alpha.level = 5 VanguardDB.inventory['ForeverTest-Alliance'].Alpha.rested = 40 VanguardDB.inventory['ForeverTest-Alliance'].Alpha.played = 7200");
  addon.slash("alts");
  expect(chatHas(addon, /Alpha: level 5, .*, 40% rested, played 2h$/), "a known character's whole line").toBe(true);
  expect(chatHas(addon, /Bravo: level \?$/), "one with nothing known").toBe(true);
  expect(chatHas(addon, /Tester: level 12, .*, played 1d 5h$/), "this character, with a day and hours played").toBe(true);
  expect(chatHas(addon, /All together: /), "and the money of all of them").toBe(true);
});

it("inventory: the Game windows page lists every character's overview line", () => {
  const addon = loggedIn(BAGS_ENV + "UnitLevel = function() return 12 end", { savedVariables: ALTS });
  const lines = addon.eval("return ns.GetModule('Inventory').AltLines()");
  expect(lines.some((l) => /^Alpha: level/.test(l)) && /^All together: /.test(lines[lines.length - 1]), "a line each, then the total").toBe(true);
  addon.eval('ns.Options.Show("windows")');
  const shown = addon.eval(`for _, w in ipairs(__wfgStub.frames) do if w.GetText and w:GetText() and tostring(w:GetText()):find("^Tester: level 12") then return true end end return false`);
  expect(shown, "the page shows this character's line").toBe(true);
});

it("inventory: /vg alts <name> lists that character's items, biggest first, and says when nobody has the name", () => {
  const addon = loggedIn(BAGS_ENV, { savedVariables: ALTS });
  addon.slash("alts alpha");
  expect(chatHas(addon, /Alpha carries 1 kind\(s\) of item\.$/), "bags and bank together").toBe(true);
  expect(chatHas(addon, /8 × /), "5 in the bags and 3 in the bank").toBe(true);
  addon.eval("local r = VanguardDB.inventory['ForeverTest-Alliance'].Charlie for i = 1, 20 do r.bags[1000 + i] = i end r.bags[118] = 1 r.bags[119] = 1 r.bank[119] = 5")
  addon.slash("alts Charlie");
  expect(chatHas(addon, /20 × item 1020$/) && chatHas(addon, /6 × item 119$/), "the biggest stacks first").toBe(true);
  addon.slash("alts nobody");
  expect(chatHas(addon, /No character called nobody is remembered here/), "an unknown name").toBe(true);
});

it("inventory: /vg alts and /vg inventory forget find a name with an accented capital typed in lower case", () => {
  const addon = loggedIn(BAGS_ENV);
  addon.eval("local c = ns.GetModule('Inventory').Characters() c['Élodie'] = { level = 20, money = 5, bags = { [2589] = 3 }, bank = {} }");
  addon.slash("alts élodie");
  expect([chatHas(addon, /Élodie carries 1 kind\(s\) of item\./), chatHas(addon, /No character called/)], "her items").toEqual([true, false]);
  addon.slash("inventory forget ÉLODIE");
  expect(addon.eval("return ns.GetModule('Inventory').Characters()['Élodie']"), "forgotten").toBeNull();
  expect(addon.eval("return { strcmputf8i('a', 'B'), strcmputf8i('b', 'A'), strcmputf8i('×', '÷') }"), "the harness compare orders too").toEqual([-1, 1, -1]);
});
