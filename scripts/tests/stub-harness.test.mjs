// stub-harness: the TEST-ONLY client's widgets (scripts/lib/wow-stub.lua): how methods resolve, scripts and
// shown state, the base every frame test stands on.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";

it("replacing a method a widget kind already resolved reaches new and existing widgets of that kind", () => {
  const addon = createAddon();
  const seen = addon.eval(`local old = CreateFrame("Frame") old:SetScale(2)
    local orig = __wfgStub.methods.SetScale
    __wfgStub.methods.SetScale = function(self) self.__marked = true end
    local fresh = CreateFrame("Frame") fresh:SetScale(3) old:SetScale(3)
    local button = CreateFrame("Button") button:SetScale(3)
    __wfgStub.methods.SetScale = orig
    return { fresh = fresh.__marked == true, old = old.__marked == true, button = button.__marked == true }`);
  expect(seen).toEqual({ fresh: true, old: true, button: true });
});

it("HookScript refuses a script the widget's kind lacks, as SetScript does", () => {
  const addon = createAddon();
  expect(addon.eval(`local ok, err = pcall(function() CreateFrame("Frame"):HookScript("OnClick", function() end) end)
    return { ok, err:match("Frame doesn't have a \\"OnClick\\" script") ~= nil }`)).toEqual([false, true]);
});

it("buttons, check buttons, sliders and edit boxes take OnEnable and OnDisable hooks, run by Disable and Enable", () => {
  const addon = createAddon();
  const runs = addon.eval(`local out = {}
    for _, kind in ipairs({ "Button", "CheckButton", "Slider", "EditBox" }) do
      local w, seen = CreateFrame(kind), {}
      w:HookScript("OnDisable", function() seen[#seen + 1] = "off" end)
      w:HookScript("OnEnable", function() seen[#seen + 1] = "on" end)
      w:Disable() w:Enable() out[kind] = table.concat(seen, " ")
    end
    return out`);
  expect(runs).toEqual({ Button: "off on", CheckButton: "off on", Slider: "off on", EditBox: "off on" });
});

it("SetShown runs OnShow and OnHide as Show and Hide do, but not a hook on the frame's Show", () => {
  const addon = createAddon();
  const runs = addon.eval(`local f, seen = CreateFrame("Frame"), {}
    f:SetScript("OnShow", function() seen[#seen + 1] = "show" end)
    f:SetScript("OnHide", function() seen[#seen + 1] = "hide" end)
    f:Hide() f:SetShown(true) f:SetShown(true) f:SetShown(nil) f:SetShown(false)
    hooksecurefunc(f, "Show", function() seen[#seen + 1] = "Show hook" end)
    f:SetShown(true)
    return table.concat(seen, " ")`);
  expect(runs).toBe("hide show hide show");
});
