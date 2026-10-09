// spellbook: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { loggedIn } from "./helpers.mjs";

it("the spellbook is one of the framed windows, so it gets the flat Vanguard panel", () => {
  const addon = loggedIn();
  expect(addon.eval("return ns.GetModule('Windows').REGISTERED.SpellBookFrame ~= nil"), "registered with the other framed windows").toBe(true);
});
