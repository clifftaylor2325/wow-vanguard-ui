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
