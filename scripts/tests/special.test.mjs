// special: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { ACTIONS_ENV, bars, button } from "./helpers.mjs";

it("special bars", () => {
  const addon = createAddon();
  addon.eval(ACTIONS_ENV + `
    for i = 1, 10 do
      local b = CreateFrame("CheckButton", "PetActionButton" .. i, UIParent)
      b.icon = b:CreateTexture(nil, "ARTWORK")
      b.art = b:CreateTexture(nil, "BACKGROUND")
    end
    StanceButton1 = CreateFrame("CheckButton", "StanceButton1", UIParent)
    StanceButton1.icon = StanceButton1:CreateTexture(nil, "ARTWORK")
    ExtraActionButton1 = CreateFrame("CheckButton", "ExtraActionButton1", UIParent)`);
  addon.login();
  const pet = addon.eval("local b = PetActionButton3 return { skinned = b.fuiSkinned, art = b.art.__alpha, icon = b.icon.__alpha }");
  expect(pet.skinned === true && pet.art === 0 && pet.icon === undefined, "pet buttons are restyled: art faded, icon kept").toBeTruthy();
  expect(addon.eval("return StanceButton1.fuiSkinned and ExtraActionButton1.fuiSkinned") === true, "stance and extra action buttons too").toBeTruthy();
  const exit = addon.eval("local b = ForeverUI_VehicleExit return { type = b:GetAttribute('type'), macro = b:GetAttribute('macrotext'), driver = b.__states.visibility }");
  expect(exit.type === "macro" && exit.macro === "/leavevehicle", "the vehicle exit button leaves the vehicle").toBeTruthy();
  expect(/canexitvehicle/.test(exit.driver), "and only shows while you can leave").toBeTruthy();
  expect(addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[m.key] = true end return out.vehicleexit") === true, "it is movable").toBeTruthy();
});
