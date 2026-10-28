// skins: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { chatHas, expectErrors, loggedIn } from "./helpers.mjs";

it("skin API", () => {
  expectErrors("skin for Broken: eval:5: oops");
  const addon = loggedIn(`
    Vanguard.RegisterSkin("Early", function(S) __early = S.apiVersion; S.Panel(CreateFrame("Frame", nil, UIParent)) end)
    Vanguard.RegisterSkin("Early", function() __dup = true end)
    Vanguard.RegisterSkin("Broken", function() error("oops") end)
  `);
  expect(addon.eval("return __early") === 1, "a skin registered before login runs at login with apiVersion 1").toBeTruthy();
  expect(addon.eval("return __dup") === null, "the first registration of a name wins").toBeTruthy();
  expect(chatHas(addon, /skin for Broken: .*oops/), "a failing skin is reported, not raised").toBeTruthy();
  expect(addon.eval("for _, s in ipairs(ns.SkinList()) do if s.name == 'Broken' then return s.error end end"), "and /vg skins still knows the error").toMatch(/oops/);
  addon.eval('Vanguard.RegisterSkin("Late", function() __late = true end)');
  expect(addon.eval("return __late") === true, "a skin registered after login runs at once").toBeTruthy();
  const off = loggedIn('Vanguard.RegisterSkin("Muted", function() __muted = true end)', {
    savedVariables: "VanguardDB = { profiles = { Default = { skins = { Muted = false } } } }",
  });
  expect(off.eval("return __muted") === null, "a skin turned off in the profile never runs").toBeTruthy();
  off.clearChat();
  off.slash("skins");
  expect(chatHas(off, /Muted/), "/vg skins lists registered skins").toBeTruthy();
});

it("skin SetFont and a UI scale change", () => {
  const addon = loggedIn();
  const size = addon.eval(`
    -- TEST-ONLY skin, only so SetFont runs.
    Vanguard.RegisterSkin("TESTONLY", function(S)
      local fs = UIParent:CreateFontString()
      S.SetFont(fs)
      __size = select(2, fs:GetFont())
    end)
    return __size
  `);
  expect(size === 12, "S.SetFont with no size uses 12 when the font string has none").toBeTruthy();
  addon.fire("UI_SCALE_CHANGED");
  addon.fire("DISPLAY_SIZE_CHANGED");
  expect(addon.eval("return ns.Theme.PaintedCount()") > 0, "a scale change repaints").toBeTruthy();
});
it("/vg skins switches a skin whose name has a space", () => {
  const addon = loggedIn();
  addon.eval("Vanguard.RegisterSkin('TEST-ONLY My Addon', function() end)");
  addon.slash("skins TEST-ONLY My Addon off");
  expect(addon.eval("return ns.Settings('skins')['TEST-ONLY My Addon']"), "the whole name before the state").toBe(false);
  expect(chatHas(addon, /Skin for TEST-ONLY My Addon off\./), "and says so").toBe(true);
});

it("a skin's erroring theme listener stops no other listener", () => {
  expectErrors(/^skin theme change: eval:\d+: addon bug$/);
  const addon = loggedIn();
  addon.eval(`
    -- TEST-ONLY skin whose listener errors, then a listener registered after it.
    Vanguard.RegisterSkin("TESTONLY", function(S) S.OnChanged(function() error("addon bug") end) end)
    __after = 0
    ns.Theme.OnChanged(function() __after = __after + 1 end)
    ns.Theme.Refresh()
  `);
  expect(addon.eval("return __after"), "the listener after the failing one still runs").toBe(1);
});

it("a skin theme listener that is not a function is ignored, and the same function is kept once", () => {
  const addon = loggedIn();
  const ran = addon.eval(`
    -- TEST-ONLY skin: junk listeners, then one function registered twice.
    __ran = 0
    Vanguard.RegisterSkin("TESTONLY", function(S)
      local count = function() __ran = __ran + 1 end
      S.OnChanged(true) S.OnChanged("Refresh") S.OnChanged({}) S.OnChanged(count) S.OnChanged(count)
    end)
    ns.Theme.Refresh()
    return __ran
  `);
  expect(ran, "a bad listener raises nothing and a repeat registration runs once").toBe(1);
});

it("a theme listener that registers another one does not run it in the same refresh", () => {
  const addon = loggedIn();
  const runs = addon.eval(`
    -- TEST-ONLY listener that registers a new listener each time it runs.
    __runs = { first = 0, second = 0 }
    ns.Theme.OnChanged(function()
      __runs.first = __runs.first + 1
      if __runs.first == 1 then ns.Theme.OnChanged(function() __runs.second = __runs.second + 1 end) end
    end)
    ns.Theme.Refresh()
    local afterOne = __runs.second
    ns.Theme.Refresh()
    return { afterOne, __runs.second }
  `);
  expect(runs, "the new listener first runs on the next refresh").toEqual([0, 1]);
});
