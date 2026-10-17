// spellbook: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { loggedIn } from "./helpers.mjs";

it("the spellbook (PlayerSpellsFrame on the 12.x engine) is a framed window, skinned when its part of the game loads", () => {
  const addon = loggedIn();
  expect(addon.eval("local GW = ns.GetModule('Windows') return { GW.REGISTERED.PlayerSpellsFrame.group, GW.ON_DEMAND.Blizzard_PlayerSpells[1] }"), "registered under the windows group, with Blizzard_PlayerSpells").toEqual(["windows", "PlayerSpellsFrame"]);
});
