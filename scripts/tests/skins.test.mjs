// skins: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { chatHas, loggedIn } from "./helpers.mjs";

it("skin API", () => {
  const addon = loggedIn(`
    ForeverUI.RegisterSkin("Early", function(S) __early = S.apiVersion; S.Panel(CreateFrame("Frame", nil, UIParent)) end)
    ForeverUI.RegisterSkin("Early", function() __dup = true end)
    ForeverUI.RegisterSkin("Broken", function() error("oops") end)
  `);
  expect(addon.eval("return __early") === 1, "a skin registered before login runs at login with apiVersion 1").toBeTruthy();
  expect(addon.eval("return __dup") === null, "the first registration of a name wins").toBeTruthy();
  expect(chatHas(addon, /skin for Broken failed: .*oops/), "a failing skin is reported, not raised").toBeTruthy();
  addon.eval('ForeverUI.RegisterSkin("Late", function() __late = true end)');
  expect(addon.eval("return __late") === true, "a skin registered after login runs at once").toBeTruthy();
  const off = loggedIn('ForeverUI.RegisterSkin("Muted", function() __muted = true end)', {
    savedVariables: "ForeverUIDB = { profiles = { Default = { skins = { Muted = false } } } }",
  });
  expect(off.eval("return __muted") === null, "a skin turned off in the profile never runs").toBeTruthy();
  off.clearChat();
  off.slash("skins");
  expect(chatHas(off, /Muted/), "/fui skins lists registered skins").toBeTruthy();
});

it("skin SetFont and a UI scale change", () => {
  const addon = loggedIn();
  const size = addon.eval(`
    -- TEST-ONLY skin, only so SetFont runs.
    ForeverUI.RegisterSkin("TESTONLY", function(S)
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
