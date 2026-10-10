// The error rail: a callback wrapped in ns.Guard (a game hook, a click, a
// timer) reports its failure under its label instead of letting it escape, and
// the error guard (scripts/lib/error-guard.mjs) judges what the addon caught.
// Every entry made on purpose here is named with expectErrors.

import { expect, it } from "vitest";
import { caught, check, expectErrors } from "../lib/error-guard.mjs";
import { AURA_FALLBACK, loggedIn } from "./helpers.mjs";

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

it("a throwing OnClick callback is reported under its click label", () => {
  const addon = loggedIn();
  addon.eval(`
    local b = CreateFrame("Button", "TestOnlyGuardButton", UIParent)
    b:SetSize(40, 20)
    b:SetPoint("CENTER")
    b:SetScript("OnClick", ns.Guard("click TEST-ONLY", function(...)
      __guardArgs = { ... }
      error("TEST-ONLY click", 0)
    end))`);
  expect(() => addon.click("TestOnlyGuardButton"), "the click does not throw").not.toThrow();
  expect(addon.eval("return { __guardArgs[1] == TestOnlyGuardButton, __guardArgs[2] }"), "the callback got the button and the mouse button").toEqual([true, "LeftButton"]);
  expect(addon.eval("return ns.errors[#ns.errors].text")).toBe("click TEST-ONLY: TEST-ONLY click");
  expectErrors("click TEST-ONLY: TEST-ONLY click");
});

it("a throwing timer callback is reported under its timer label", () => {
  const addon = loggedIn();
  addon.eval(`C_Timer.After(1, ns.Guard("timer TEST-ONLY", function() error("TEST-ONLY timer", 0) end))`);
  expect(() => addon.advance(1), "the clock runs on").not.toThrow();
  expect(addon.eval("return ns.errors[#ns.errors].text")).toBe("timer TEST-ONLY: TEST-ONLY timer");
  expectErrors("timer TEST-ONLY: TEST-ONLY timer");
});

it("ns.Guard hands a non-function back, passes arguments through and returns nothing", () => {
  const addon = loggedIn();
  expect(addon.eval(`return ns.Guard("x", nil) == nil`), "nil still clears a script").toBe(true);
  expect(addon.eval("local t = {} return ns.Guard('x', t) == t"), "a table comes back as the same table").toBe(true);
  expect(addon.eval(`return select("#", ns.Guard("x", function() return 1 end)())`), "no values come back").toBe(0);
  addon.eval(`ns.Guard("x", function(...) __guardSeen = { ... } end)("a", "b")`);
  expect(addon.eval("return __guardSeen"), "the arguments reach the callback").toEqual(["a", "b"]);
});

it("an entry ns.ClearErrors removed is still judged", () => {
  const addon = loggedIn();
  addon.eval(`ns.Report("TEST-ONLY rail", "x") ns.ClearErrors()`);
  expect(addon.eval("return #ns.errors"), "the list is empty").toBe(0);
  expect(caught(addon).map((e) => e.text), "the harvest still lists it").toEqual(["TEST-ONLY rail: x"]);
  expect(() => check([addon], []), "and an unnamed one fails").toThrow(/TEST-ONLY rail: x/);
  expectErrors("TEST-ONLY rail: x");
});

it("the aura-container fallback notice is the one AURA_FALLBACK names", () => {
  const addon = loggedIn("__wfgStub.noAuraContainer = true");
  expect(addon.eval("return ns.AuraEngine.Available()"), "the client lacks AuraContainer").toBe(false);
  expect(caught(addon).some((e) => AURA_FALLBACK.test(e.text)), "the notice is in ns.errors").toBe(true);
  expect(() => check([addon], [AURA_FALLBACK]), "naming it passes the guard").not.toThrow();
  expectErrors(AURA_FALLBACK);
});
