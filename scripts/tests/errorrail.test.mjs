// The error rail: a callback wrapped in ns.Guard (a game hook, a click, a
// timer) reports its failure under its label instead of letting it escape, and
// the error guard (scripts/lib/error-guard.mjs) judges what the addon caught.
// Every entry made on purpose here is named with expectErrors.

import { expect, it } from "vitest";
import { check, expectErrors } from "../lib/error-guard.mjs";
import { loggedIn } from "./helpers.mjs";

it("a throwing SetPostItem hook is reported and the Post path goes on", () => {
  const addon = loggedIn();
  addon.world.openAuctionHouse();
  addon.update(0);
  addon.eval(`ns.GetModule("AuctionHelper").TakeItem = function() error("TEST-ONLY take", 0) end`);
  expect(() => addon.world.postFromBag(0, 2), "the bag click does not throw").not.toThrow();
  expect(addon.eval("return __wfgWorld.ah.postItem.slotIndex"), "the game's own SetPostItem still ran").toBe(2);
  const text = "hook SetPostItem: TEST-ONLY take";
  expect(addon.eval("return ns.errors[#ns.errors].text"), "the entry carries the hook's label").toBe(text);
  expect(() => check([addon], []), "an unnamed entry fails the guard").toThrow(/hook SetPostItem: TEST-ONLY take[\s\S]*\(x1\)[\s\S]*expectErrors\(/);
  expect(() => check([addon], [text]), "a named entry passes").not.toThrow();
  expectErrors(text);
});
