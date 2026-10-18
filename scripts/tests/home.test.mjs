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

// TEST-ONLY game rules as Forever documents them: the Classic or Modern preset enum, self-found and the game mode record.
const FOREVER_RULES = `
  Enum.ForeverExperiencePreset = { Classic = 0, Modern = 1 }
  __preset, __self = 1, true
  C_GameRules = {
    IsHardcoreActive = function() return false end,
    GetForeverExperiencePreset = function() return __preset end,
    IsSelfFoundAllowed = function() return __self end,
    GetCurrentGameModeRecordID = function() return 3 end,
  }
`;

it("home: /vg realm names the Forever preset, self-found and game mode, none of which join the key", () => {
  const addon = loggedIn(FOREVER_RULES);
  addon.slash("realm");
  expect(chatHas(addon, /Rules: preset Modern {2}· {2}self-found allowed {2}· {2}game mode 3/), "the three rules").toBe(true);
  expect(home(addon)[4], "the key stays realm and side").toBe("ForeverTest-Alliance");
  addon.eval("__preset, __self = 7, false Enum.ForeverExperiencePreset = nil");
  addon.slash("realm");
  expect(chatHas(addon, /Rules: preset 7 {2}· {2}self-found not allowed/), "a preset the enum lacks prints its number").toBe(true);
  addon.eval("C_GameRules.GetForeverExperiencePreset = function() return __wfgWorld.secret(1) end C_GameRules.IsSelfFoundAllowed = function() return 'x' end C_GameRules.GetCurrentGameModeRecordID = nil");
  addon.slash("realm");
  expect(chatHas(addon, /Rules: none named by the client/), "hidden, odd or missing answers name nothing").toBe(true);
});

it("home: a rules change that moves the data key says so once; one that does not is silent", () => {
  const addon = loggedIn(rules({ season: 2 }));
  addon.fire("GAME_RULES_CHANGED");
  expect(chatHas(addon, /rules changed/), "the first look has nothing to compare").toBe(false);
  home(addon);
  addon.eval("C_Seasons = nil");
  addon.fire("GAME_RULES_CHANGED");
  expect(chatHas(addon, /The game's rules changed: Vanguard now keeps prices and characters under ForeverTest-Alliance\./), "the key moved").toBe(true);
  addon.fire("GAME_RULES_CHANGED");
  expect(addon.eval("return #ns.errors"), "and no errors").toBe(0);
});

// Seconds: the beta's last day, and the live game's first (launch is 1793833200).
const BETA_DAY = 1793000000;
const LIVE_DAY = 1793900000;
// TEST-ONLY saved data: prices, sales, an open auction and characters, each stamped on the beta's or the live game's side.
const SAVED = `
  VanguardDB.ah = { houses = { ["ForeverTest-Alliance"] = { count = 3, lastScan = 5, prices = {
      [1] = { min = 5, t = ${BETA_DAY}, days = {} }, [2] = { min = 6, t = ${LIVE_DAY}, days = {} }, [3] = { min = 7, t = ${BETA_DAY}, days = {} } } } },
    ledgers = { ["ForeverTest-Alliance"] = { records = {
      { kind = "sold", qty = 1, amount = 7, t = ${BETA_DAY} }, { kind = "sold", qty = 1, amount = 9, t = ${LIVE_DAY} }, { kind = "sold", qty = 1, amount = 4, t = ${BETA_DAY} }, "junk", { kind = "sold", qty = 1, amount = 2 } },
      open = { [11] = { id = 1, t = ${BETA_DAY} }, [12] = { id = 2, t = ${LIVE_DAY} } } }, junk = 1 } }
  VanguardDB.inventory = { ["ForeverTest-Alliance"] = { Old = { bags = {}, updated = ${BETA_DAY} }, New = { bags = {}, updated = ${LIVE_DAY} }, Unstamped = { bags = {} } }, junk = 1 }
`;
// Dates the logged-in character's own record on the live side (the harness clock is not the date).
const liveMe = (addon) => addon.eval(`local chars = VanguardDB.inventory["ForeverTest-Alliance"] chars.Tester = chars.Tester or {} chars.Tester.updated = ${LIVE_DAY}`);
// The saved figures after a look or a clear: prices left, sales left, open left, characters left.
const left = (addon) => addon.eval(`local h = VanguardDB.ah.houses["ForeverTest-Alliance"]
  local n = 0 for _ in pairs(h.prices) do n = n + 1 end
  local o = 0 for _ in pairs(VanguardDB.ah.ledgers["ForeverTest-Alliance"].open) do o = o + 1 end
  local c = 0 for _ in pairs(VanguardDB.inventory["ForeverTest-Alliance"]) do c = c + 1 end
  return { n, #VanguardDB.ah.ledgers["ForeverTest-Alliance"].records, o, c, h.count }`);

it("home: /vg launch counts what the beta left, and clears only data stamped before launch, once launch has passed", () => {
  const addon = loggedIn("", { savedVariables: SAVED });
  liveMe(addon);
  addon.eval("__now = " + (BETA_DAY + 10) + " time = function() return __now end");
  addon.slash("launch");
  expect(chatHas(addon, /Saved from before launch \(the beta\): 2 prices, 3 sales, 1 characters\. \/vg launch clear removes them\./), "sales count the open auction; unstamped and junk entries are not counted").toBe(true);
  addon.slash("launch clear");
  expect([chatHas(addon, /Launch is on 4 November 2026/), left(addon)], "before launch nothing goes").toEqual([true, [3, 4, 2, 4, 3]]);
  addon.eval("__now = " + LIVE_DAY);
  addon.slash("launch clear");
  expect(chatHas(addon, /Cleared what was saved from before launch: 2 prices, 3 sales, 1 characters\./), "cleared").toBe(true);
  expect(left(addon), "the live prices, sales, auctions and characters stay in order; the price count is redone").toEqual([1, 2, 1, 3, 1]);
  expect(addon.eval("return VanguardDB.ah.ledgers['ForeverTest-Alliance'].records[1].amount"), "the live sale kept").toBe(9);
  addon.slash("launch");
  expect(chatHas(addon, /No prices, sales or characters saved from before launch\./), "nothing left").toBe(true);
  expect(addon.eval("return #ns.errors"), "no errors").toBe(0);
});

it("home: the first login after launch says once that beta data is saved; the Town and gear button asks before clearing", () => {
  const addon = loggedIn("", { savedVariables: SAVED + "time = function() return " + LIVE_DAY + " end" });
  addon.fire("PLAYER_LOGIN");
  expect(chatHas(addon, /Still saved from the beta: 2 prices, 3 sales, 1 characters\./), "told").toBe(true);
  addon.eval("__said = 0");
  addon.fire("PLAYER_LOGIN");
  expect(addon.eval("return VanguardDB.launchNoticed"), "and marked, so not again").toBe(true);
  addon.eval("time = function() return " + BETA_DAY + " end VanguardDB.launchNoticed = nil");
  addon.fire("PLAYER_LOGIN");
  expect(addon.eval("return VanguardDB.launchNoticed"), "before launch: not marked").toBe(null);
});

it("home: the Town and gear page has a button that asks first, naming what would go; Yes clears, No keeps", () => {
  const addon = loggedIn("", { savedVariables: SAVED + "time = function() return " + LIVE_DAY + " end" });
  liveMe(addon);
  addon.slash("");
  // Presses the page's button for the beta data, whether it is enabled, and the question shown.
  const press = () => addon.eval(`local page for _, p in ipairs(ns.Options.PAGES) do if p.key == "town" then page = p end end
    for _, row in ipairs(page.rows()) do if row[2] == "Clear data from before launch..." then local on = row[4]() row[3]() return on end end`);
  expect(press(), "enabled once launch has passed").toBe(true);
  expect(addon.eval("return Vanguard_Question.title:GetText()"), "the question names what goes").toMatch(/Clear what was saved before launch \(2 prices, 2 sales, 1 characters\)\?/);
  addon.eval("Vanguard_Question.no:GetScript('OnClick')(Vanguard_Question.no)");
  expect(left(addon)[0], "No: kept").toBe(3);
  press();
  addon.eval("Vanguard_Question.yes:GetScript('OnClick')(Vanguard_Question.yes)");
  expect(left(addon)[0], "Yes: cleared").toBe(1);
  press();
  expect(chatHas(addon, /No prices, sales or characters saved from before launch\./), "with nothing saved it only says so").toBe(true);
  addon.eval("time = function() return " + BETA_DAY + " end");
  expect(press(), "before launch the button is off").toBe(false);
});
