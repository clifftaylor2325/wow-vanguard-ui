// special: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { ACTIONS_ENV, SETUP_DONE, SPECIAL_BARS_ENV, loggedIn, setCombat } from "./helpers.mjs";

// TEST-ONLY pet buttons with the template art the client makes (a background and the state textures), a stance and an extra action button.
const BUTTONS_ENV = `
  for i = 1, 10 do
    local b = CreateFrame("CheckButton", "PetActionButton" .. i, UIParent)
    b.icon = b:CreateTexture(nil, "ARTWORK")
    b.art = b:CreateTexture(nil, "BACKGROUND")
    b.Flash = b:CreateTexture(nil, "ARTWORK")
    b.AutoCastable = b:CreateTexture(nil, "OVERLAY")
    b.slotArt = b:CreateTexture(nil, "BACKGROUND")
    b:SetCheckedTexture("TEST-ONLY-CHECKED")
  end
  StanceButton1 = CreateFrame("CheckButton", "StanceButton1", UIParent)
  StanceButton1.icon = StanceButton1:CreateTexture(nil, "ARTWORK")
  StanceButton1:SetCheckedTexture("TEST-ONLY-ACTIVE")
  ExtraActionButton1 = CreateFrame("CheckButton", "ExtraActionButton1", UIParent)`;

it("special bars", () => {
  const addon = createAddon();
  addon.eval(ACTIONS_ENV + BUTTONS_ENV);
  addon.login();
  const pet = addon.eval("local b = PetActionButton3 return { skinned = b.fuiSkinned, art = b.art.__alpha, icon = b.icon.__alpha }");
  expect(pet.skinned === true && pet.art === 0 && pet.icon === undefined, "pet buttons are restyled: art faded, icon kept").toBeTruthy();
  expect(addon.eval("return StanceButton1.fuiSkinned and ExtraActionButton1.fuiSkinned") === true, "stance and extra action buttons too").toBeTruthy();
  const exit = addon.eval("local b = ForeverUI_VehicleExit return { type = b:GetAttribute('type'), macro = b:GetAttribute('macrotext'), driver = b.__states.visibility }");
  expect(exit.type === "macro" && exit.macro === "/leavevehicle", "the vehicle exit button leaves the vehicle").toBeTruthy();
  expect(/canexitvehicle/.test(exit.driver), "and only shows while you can leave").toBeTruthy();
  expect(addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[m.key] = true end return out.vehicleexit") === true, "it is movable").toBeTruthy();
});

it("pet and stance buttons keep the textures the client shows by state", () => {
  const addon = createAddon();
  addon.eval(ACTIONS_ENV + BUTTONS_ENV);
  addon.login();
  const alphas = addon.eval(`local b = PetActionButton3
    return { b:GetCheckedTexture().__alpha == nil, b.Flash.__alpha == nil, b.AutoCastable.__alpha == nil, b.art.__alpha, b.slotArt.__alpha, StanceButton1:GetCheckedTexture().__alpha == nil }`);
  expect(alphas, "the checked texture, the attack flash, the auto-cast mark and the active stance's highlight stay; the template art goes").toEqual([true, true, true, 0, 0, true]);
  expect(addon.eval("return ExtraActionButton1:GetCheckedTexture() == nil and ExtraActionButton1.fuiSkinned"), "a button with no checked texture is still restyled").toBe(true);
});

// The bar's anchor: its point, the name of the frame it hangs from and that frame's point.
const anchorOf = (addon, bar) => addon.eval(`local p, rel, rp = ${bar}:GetPoint() return { p, rel:GetName(), rp }`);

it("the pet and stance bars sit on movers of their own, kept there when the game re-places them", () => {
  const addon = loggedIn(SPECIAL_BARS_ENV);
  expect([addon.eval('return { ns.MoverPoint("petbar") }'), addon.eval('return { ns.MoverPoint("stancebar") }')], "defaults at the bottom left, one above the other").toEqual([["BOTTOMLEFT", "BOTTOMLEFT", 8, 224], ["BOTTOMLEFT", "BOTTOMLEFT", 8, 262]]);
  expect(addon.eval("return { ForeverUI_PetActionBarSpot:GetWidth(), ForeverUI_PetActionBarSpot:GetHeight(), ForeverUI_StanceBarSpot:GetWidth(), ForeverUI_StanceBarSpot:GetHeight() }"), "each mover is as big as its bar's row of buttons").toEqual([320, 32, 200, 32]);
  expect([anchorOf(addon, "PetActionBar"), anchorOf(addon, "StanceBar")], "the bars hang from their spots' bottom left corners").toEqual([["BOTTOMLEFT", "ForeverUI_PetActionBarSpot", "BOTTOMLEFT"], ["BOTTOMLEFT", "ForeverUI_StanceBarSpot", "BOTTOMLEFT"]]);
  expect(addon.eval("local f = ns.MoverFrame('petbar') local l, b = f:GetLeft(), f:GetBottom() return { l, b }"), "the pet bar's spot is where its mover says").toEqual([8, 224]);
  addon.eval('PetActionBar:ClearAllPoints() PetActionBar:SetPoint("CENTER", UIParent, "CENTER", 0, 0)'); // Edit Mode lays the bar out again
  expect(anchorOf(addon, "PetActionBar"), "the game moving the bar puts it back on its spot").toEqual(["BOTTOMLEFT", "ForeverUI_PetActionBarSpot", "BOTTOMLEFT"]);
  addon.eval('ns.SetMoverPoint("stancebar", "BOTTOM", "BOTTOM", 100, 400)');
  expect(addon.eval("return { StanceBar:GetLeft(), StanceBar:GetBottom() }"), "dragging the stance mover takes the bar with it").toEqual([960 + 100 - 100, 400]); // the screen's center, 100 right of it, less half the 200-wide spot
});

it("the pet and stance bars are placed after combat, and left to Edit Mode when placing is off", () => {
  const fight = createAddon({ savedVariables: SETUP_DONE });
  fight.eval(SPECIAL_BARS_ENV);
  setCombat(fight, true);
  fight.login();
  expect(fight.eval("return { PetActionBar:GetPoint() }")[0], "in a fight the game's bars are left where they are").toBe("CENTER");
  setCombat(fight, false);
  expect(anchorOf(fight, "PetActionBar"), "when it ends they move to their spots").toEqual(["BOTTOMLEFT", "ForeverUI_PetActionBarSpot", "BOTTOMLEFT"]);
  const off = loggedIn(SPECIAL_BARS_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { SpecialBars = { place = false } } }" });
  expect([off.eval('return ns.MoverPoint("petbar") == nil'), off.eval("return { PetActionBar:GetPoint() }")[0]], "with placing off there are no movers and the bars stay where Edit Mode puts them").toEqual([true, "CENTER"]);
  const none = loggedIn();
  expect(none.eval('return ns.MoverPoint("petbar") == nil and ns.MoverPoint("stancebar") == nil'), "a client without the bars has nothing to place").toBe(true);
});
