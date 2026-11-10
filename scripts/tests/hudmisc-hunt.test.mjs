// hud-misc bug hunt: the bag, minimap, strip and merchant modules against what the live client hands back.

import { expect, it } from "vitest";
import { UI_ENV, loggedIn } from "./helpers.mjs";

it("minimap: a shown state the client holds secret is never handed to the map's box", () => {
  const addon = loggedIn(UI_ENV);
  addon.eval(`Vanguard_Minimap.SetShown = function(self, shown)
    if issecretvalue(shown) then error("Secret values are only allowed during untainted execution") end
    self.__calls = (self.__calls or 0) + 1
  end
  Minimap.IsShown = function() return { __secret = true } end`);
  addon.eval("Minimap:Hide()");
  expect(addon.eval("return { #ns.errors, Vanguard_Minimap.__calls or 0 }"), "no error, and the box was not asked").toEqual([0, 0]);
});

// TEST-ONLY bags with a bank of one tab (bag 6) holding 4 linen.
const BANK_ENV = `
  __wfgWorld.bags = { [0] = {}, {}, {}, {}, {} }
  __wfgWorld.bags[6] = { [1] = { itemID = 2589, count = 4 } }
  __wfgWorld.bagSizes[6] = 8
  Enum.BankType = { Character = 0, Account = 2 }
  __tabs = { { ID = 6 } }
  C_Bank = { FetchPurchasedBankTabData = function() return __tabs end }
`;

it("inventory: a bank answer that is missing or empty never wipes the remembered bank", () => {
  const addon = loggedIn(BANK_ENV);
  const bank = () => addon.eval('return VanguardDB.inventory["ForeverTest-Alliance"].Tester.bank');
  addon.fire("BANKFRAME_OPENED");
  expect(bank(), "read while open").toEqual({ 2589: 4 });
  for (const answer of ["nil", "{}"]) {
    addon.eval(`__tabs = ${answer}`);
    addon.fire("BANKFRAME_OPENED");
    addon.fire("PLAYERBANKSLOTS_CHANGED");
    addon.advance(0.6, 0.1);
    expect(bank(), `tab data ${answer}: the old record stays`).toEqual({ 2589: 4 });
  }
  addon.eval("__tabs = { { ID = 6 } } __wfgWorld.bags[6][1] = nil");
  addon.fire("PLAYERBANKSLOTS_CHANGED");
  expect(bank(), "a real answer with no items clears it").toEqual({});
});

// TEST-ONLY damage meter: someone else's line, then yours at 1234.5 per second.
const METER_ENV = `
  __dps = { combatSources = { { isLocalPlayer = false, amountPerSecond = 999 }, { isLocalPlayer = true, amountPerSecond = 1234.5 } } }
  Enum = Enum or {} Enum.DamageMeterSessionType = { Current = 1 } Enum.DamageMeterType = { Dps = 1 }
  C_DamageMeter = { GetCombatSessionFromType = function() return __dps end }
  Enum.AddOnRestrictionType = { Combat = 0, Encounter = 1 } Enum.AddOnRestrictionState = { Inactive = 0, Active = 2 }
  __restricted = {}
  C_RestrictedActions = { GetAddOnRestrictionState = function(t) return __restricted[t] or 0 end }
`;
// Your DPS and your place, and how many errors were raised.
const meter = (addon) => addon.eval("local IS = ns.GetModule('InfoStrip') return { IS.DPS() or 0, (IS.Rank()) or 0, #ns.errors }");

it("info strip: a hidden damage-meter line, or list of lines, is skipped, not indexed", () => {
  const addon = loggedIn(METER_ENV);
  expect(meter(addon), "plain lines: your figure and place").toEqual([1234.5, 2, 0]);
  addon.eval("__dps.combatSources[1] = __wfgWorld.secret(1)");
  expect(meter(addon), "a hidden line beside yours: yours is still found, no error").toEqual([1234.5, 2, 0]);
  addon.eval("__dps.combatSources = __wfgWorld.secret(2)");
  expect([meter(addon), addon.eval("return ns.GetModule('InfoStrip').MeterSources('Dps') == nil")], "a hidden list: nothing, no error").toEqual([[0, 0, 0], true]);
});

it("info strip: no meter lines are read while the client restricts the fight or the encounter", () => {
  const addon = loggedIn(METER_ENV);
  for (const kind of [0, 1]) {
    addon.eval(`__restricted[${kind}] = 2`);
    expect(meter(addon), `restriction ${kind} active, no combat flag: nothing read`).toEqual([0, 0, 0]);
    addon.eval(`__restricted[${kind}] = nil`);
  }
  expect(meter(addon), "restrictions over: read again").toEqual([1234.5, 2, 0]);
});

it("bags: a bank window the game makes after login is still watched, once, when a part loads or the bank opens", () => {
  for (const event of [["ADDON_LOADED", "Blizzard_BankUI"], ["BANKFRAME_OPENED"]]) {
    const addon = loggedIn("BankFrame = nil BankPanel = nil");
    addon.eval("__watched = 0 table.insert(ns.GetModule('Bags').BANK_PARTS, function() __watched = __watched + 1 end)");
    addon.fire(...event);
    expect(addon.eval("return __watched"), "no bank window yet: nothing watched").toBe(0);
    addon.eval(`BankFrame = CreateFrame("Frame", "BankFrame", UIParent) BankPanel = CreateFrame("Frame", "BankPanel", BankFrame)`);
    addon.fire(...event);
    addon.fire(...event);
    expect([addon.eval("return __watched"), addon.eval("return #ns.errors")], `${event[0]}: watched once the window exists, not twice`).toEqual([1, 0]);
  }
});
