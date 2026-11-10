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
