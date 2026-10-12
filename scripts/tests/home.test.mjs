// home: where shared data is kept (Core/Home.lua) in the TEST-ONLY headless client: the key by
// realm, ruleset and side, the move from older keys, two-part names and /vg realm.

import { expect, it } from "vitest";
import { chatHas, loggedIn } from "./helpers.mjs";

// TEST-ONLY ruleset calls: a season on (C_Seasons) and Hardcore rules (C_GameRules), as given.
const rules = ({ season = null, hardcore = false } = {}) => `
  C_Seasons = { HasActiveSeason = function() return ${season !== null} end, GetActiveSeason = function() return ${JSON.stringify(season)} end }
  C_GameRules = { IsHardcoreActive = function() return ${hardcore} end }
`;

// ns.Home's answers now: realm name, realm, ruleset, side, key.
const home = (addon) => addon.eval("local H = ns.Home return { H.RealmName(), H.Realm(), H.Ruleset() or false, H.Side(), H.Key() }");

it("home: the key is realm and side, with the ruleset when the client names one", () => {
  const addon = loggedIn();
  expect(home(addon), "no ruleset calls: realm and side, as before").toEqual(["Forever Test", "ForeverTest", false, "Alliance", "ForeverTest-Alliance"]);
  addon.eval(rules({ season: 2 }));
  expect(home(addon)[4], "a season on").toBe("ForeverTest-season2-Alliance");
  addon.eval(rules({ season: "" }));
  expect(home(addon)[4], "a season with no plain ID counts as none").toBe("ForeverTest-Alliance");
  addon.eval(rules({ hardcore: true }));
  expect(home(addon)[4], "Hardcore rules").toBe("ForeverTest-hardcore-Alliance");
  addon.eval("C_Seasons = { HasActiveSeason = function() error('TEST-ONLY') end } C_GameRules = { IsHardcoreActive = function() return __wfgWorld.secret(true) end }");
  expect(home(addon)[4], "a call that fails or answers secret names none").toBe("ForeverTest-Alliance");
});

it("home: without the realm calls or a side the key still builds", () => {
  const addon = loggedIn();
  addon.eval("GetNormalizedRealmName = function() return '' end");
  expect(home(addon)[1], "an empty normalized name: the shown name").toBe("Forever Test");
  addon.eval("GetNormalizedRealmName = nil GetRealmName = function() error('TEST-ONLY') end UnitFactionGroup = nil");
  expect([home(addon)[1], home(addon)[3], addon.eval("return ns.Home.OldKeys()")], "no realm, no side")
    .toEqual(["?", "none", ["?-none", "? - ?"]]);
});

it("home: data kept under an older key moves to the new one once; a key already in use keeps its data", () => {
  const saved = `VanguardDB.inventory = { ["Forever Test - Alliance"] = { Alpha = { class = "MAGE", bags = { [2589] = 3 }, bank = {} } } }
    VanguardDB.ah = { houses = { ["ForeverTest-Alliance"] = { count = 1, lastScan = 0, prices = { [2589] = { min = 5, t = 1, days = {} } } } },
      ledgers = { ["ForeverTest-Alliance"] = { records = { { kind = "sold", qty = 1, amount = 7, t = 1 } }, open = {} } } }`;
  const addon = loggedIn(rules({ season: 3 }), { savedVariables: saved });
  // A saved table's keys, sorted.
  const keys = (t) => addon.eval(`local out = {} for k in pairs(${t}) do out[#out + 1] = k end table.sort(out) return out`);
  addon.eval("ns.AuctionLedger.Book() ns.AuctionPrices.House()");
  expect(keys("VanguardDB.inventory"), "characters: the old \"Realm - Faction\" key moved").toEqual(["ForeverTest-season3-Alliance"]);
  expect(addon.eval("return VanguardDB.inventory['ForeverTest-season3-Alliance'].Alpha.bags[2589]"), "with Alpha's bags").toBe(3);
  expect([keys("VanguardDB.ah.houses"), keys("VanguardDB.ah.ledgers")], "prices and sales: the realm and faction key moved")
    .toEqual([["ForeverTest-season3-Alliance"], ["ForeverTest-season3-Alliance"]]);
  addon.eval("VanguardDB.inventory['ForeverTest-Alliance'] = { Beta = {} }");
  expect([addon.eval("return ns.Home.Adopt(VanguardDB.inventory)"), keys("VanguardDB.inventory")], "once: a key in use takes nothing more")
    .toEqual(["ForeverTest-season3-Alliance", ["ForeverTest-Alliance", "ForeverTest-season3-Alliance"]]);
});

it("home: two-part names: your realm is left off for show; you are your name, alone or with your realm", () => {
  const addon = loggedIn();
  // A name as ns.Home.Display shows it.
  const shown = (n) => addon.eval(`return ns.Home.Display(${JSON.stringify(n)})`);
  expect([shown("Ally-ForeverTest"), shown("Ally-Elsewhere"), shown("Ally")], "your realm off, others kept").toEqual(["Ally", "Ally-Elsewhere", "Ally"]);
  // Whether ns.Home.IsMe takes the name for you.
  const me = (n) => addon.eval(`return ns.Home.IsMe(${JSON.stringify(n)})`);
  expect([me("Tester"), me("Tester-ForeverTest"), me("Tester-Elsewhere"), me("Ally")], "you").toEqual([true, true, false, false]);
  addon.eval("__wfgWorld.units.player.name = __wfgWorld.secret('Tester')");
  expect(me("Tester"), "a hidden name is never you").toBe(false);
});

it("home: /vg realm prints the realm, ruleset, side, data key and how your name reads", () => {
  const addon = loggedIn(rules({ season: 2 }));
  addon.slash("realm");
  expect([chatHas(addon, /Realm: Forever Test \(as in names: ForeverTest\)/), chatHas(addon, /Ruleset: season2/),
    chatHas(addon, /Side: Alliance {3}Data key: ForeverTest-season2-Alliance/), chatHas(addon, /Your name in chat: Tester-ForeverTest \(shown as Tester\)/)],
  "four lines").toEqual([true, true, true, true]);
  addon.eval("C_Seasons = nil C_GameRules = nil __wfgWorld.units.player.name = __wfgWorld.secret('Tester')");
  addon.slash("realm");
  expect([chatHas(addon, /Ruleset: none named by the client/), chatHas(addon, /Your name in chat: \?-ForeverTest/)], "none named; a hidden name").toEqual([true, true]);
});
