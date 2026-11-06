// special: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { ACTIONS_ENV, CLICK_LUA, RETAIL, SETUP_DONE, SPECIAL_BARS_ENV, UI_ENV, loggedIn, setCombat } from "./helpers.mjs";

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
  const pet = addon.eval("local b = PetActionButton3 return { skinned = ns.FrameState('vgSkinned')[b], art = b.art.__alpha, icon = b.icon.__alpha }");
  expect(pet.skinned === true && pet.art === 0 && pet.icon === undefined, "pet buttons are restyled: art faded, icon kept").toBeTruthy();
  expect(addon.eval("return ns.FrameState('vgSkinned')[StanceButton1] and ns.FrameState('vgSkinned')[ExtraActionButton1]") === true, "stance and extra action buttons too").toBeTruthy();
  const exit = addon.eval("local b = Vanguard_VehicleExit return { type = b:GetAttribute('type'), macro = b:GetAttribute('macrotext'), driver = b.__states.visibility }");
  expect(exit.type === "macro" && exit.macro === "/leavevehicle", "the vehicle exit button leaves the vehicle").toBeTruthy();
  expect(/canexitvehicle/.test(exit.driver), "and only shows while you can leave").toBeTruthy();
  expect(addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[m.key] = true end return out.vehicleexit") === true, "it is movable").toBeTruthy();
});

it("vehicle exit: on a flight a click also asks to land at the next stop, once, and not off a flight", () => {
  const addon = createAddon();
  addon.eval(ACTIONS_ENV + BUTTONS_ENV + "__early, __taxi = 0, false UnitOnTaxi = function() return __taxi end TaxiRequestEarlyLanding = function() __early = __early + 1 end");
  addon.login();
  // A mouse click on the exit: the press, then the release.
  const clickExit = () => addon.eval("Vanguard_VehicleExit:Click('LeftButton', true) Vanguard_VehicleExit:Click('LeftButton', false) return __early");
  expect(clickExit(), "off a flight: only the vehicle is left").toBe(0);
  addon.eval("__taxi = true");
  expect(clickExit(), "on a flight: one early landing for the click, not one per press").toBe(1);
  addon.eval("__taxi = __wfgWorld.secret(1)");
  expect(clickExit(), "a hidden taxi state asks for nothing").toBe(1);
  expect(addon.eval("return Vanguard_VehicleExit:GetAttribute('macrotext')"), "the secure /leavevehicle macro is untouched").toBe("/leavevehicle");
});

it("pet and stance buttons take the theme's small font on their hotkey and count, as the action bars do", () => {
  const addon = createAddon();
  addon.eval(ACTIONS_ENV + BUTTONS_ENV + `
    for _, b in ipairs({ PetActionButton3, StanceButton1 }) do
      b.HotKey, b.Count = b:CreateFontString(), b:CreateFontString()
    end
    PetActionButton4.HotKey = "not a font string"`);
  addon.login();
  const look = addon.eval(`local out = {}
    for i, b in ipairs({ PetActionButton3, StanceButton1 }) do
      out[i] = { b.HotKey.__font[1], b.HotKey.__font[2], b.Count.__font[2], b.HotKey.__textColor ~= nil, b.Count.__textColor ~= nil }
    end
    return out`);
  const small = addon.eval('return ns.Theme.RoleSize("small")');
  expect(look.map((l) => [l[0].includes("Fira"), l[1], l[2], l[3], l[4]]), "both buttons: the theme font at the small role's size, coloured").toEqual([[true, small, small, true, true], [true, small, small, true, true]]);
  expect(addon.eval("return ns.FrameState('vgSkinned')[PetActionButton4]"), "a button whose hotkey is no font string is still restyled").toBe(true);
});

it("pet and stance buttons keep the textures the client shows by state", () => {
  const addon = createAddon();
  addon.eval(ACTIONS_ENV + BUTTONS_ENV);
  addon.login();
  const alphas = addon.eval(`local b = PetActionButton3
    return { b:GetCheckedTexture().__alpha == nil, b.Flash.__alpha == nil, b.AutoCastable.__alpha == nil, b.art.__alpha, b.slotArt.__alpha, StanceButton1:GetCheckedTexture().__alpha == nil }`);
  expect(alphas, "the checked texture, the attack flash, the auto-cast mark and the active stance's highlight stay; the template art goes").toEqual([true, true, true, 0, 0, true]);
  expect(addon.eval("return ExtraActionButton1:GetCheckedTexture() == nil and ns.FrameState('vgSkinned')[ExtraActionButton1]"), "a button with no checked texture is still restyled").toBe(true);
});

// TEST-ONLY the possess bar's two buttons (PossessButtonTemplate: a secure small action button) with their slot art.
const POSSESS_ENV = `
  for i = 1, 2 do
    local b = CreateFrame("CheckButton", "PossessButton" .. i, UIParent)
    b.icon = b:CreateTexture(nil, "ARTWORK")
    b.slotArt = b:CreateTexture(nil, "BACKGROUND")
    b:SetCheckedTexture("TEST-ONLY-CHECKED")
  end`;

it("the possess bar's buttons are restyled too, out of combat, and can be left alone", () => {
  const fight = createAddon({ savedVariables: SETUP_DONE });
  fight.eval(ACTIONS_ENV + POSSESS_ENV);
  setCombat(fight, true);
  fight.login();
  expect(fight.eval("return ns.FrameState('vgSkinned')[PossessButton1] == nil"), "not in a fight").toBe(true);
  setCombat(fight, false);
  const after = fight.eval("local b = PossessButton2 return { ns.FrameState('vgSkinned')[b], b.slotArt.__alpha, b.icon.__alpha == nil, b:GetCheckedTexture().__alpha == nil, ns.Theme.PaintedCount() }");
  expect(after.slice(0, 4), "when it ends: art faded, icon and checked texture kept").toEqual([true, 0, true, true]);
  fight.eval('ns.GetModule("SpecialBars").Skin(PossessButton2)');
  expect(fight.eval("return ns.Theme.PaintedCount()"), "skinning again paints nothing more").toBe(after[4]);
  const off = loggedIn(ACTIONS_ENV + POSSESS_ENV, { savedVariables: "VanguardDB.profiles = { Default = { SpecialBars = { skinPossess = false } } }" });
  expect(off.eval("return ns.FrameState('vgSkinned')[PossessButton1] == nil and PossessButton1.slotArt.__alpha == nil"), "switched off: the game's own").toBe(true);
  const one = loggedIn(ACTIONS_ENV + 'CreateFrame("CheckButton", "PossessButton1", UIParent)');
  expect([one.eval("return ns.FrameState('vgSkinned')[PossessButton1]"), one.eval("return #ns.errors")], "a client with one bare button (or none) loads cleanly").toEqual([true, 0]);
});

// TEST-ONLY the game's pet and stance bars with their ten 30-unit buttons each, as the client makes them (mouse on, level 70).
const SEATED_ENV = SPECIAL_BARS_ENV + `
  for _, bar in ipairs({ PetActionBar, StanceBar }) do bar:EnableMouse(true) bar:SetFrameLevel(70) end
  for i = 1, 10 do
    CreateFrame("CheckButton", "PetActionButton" .. i, PetActionBar):SetSize(30, 30)
    CreateFrame("CheckButton", "StanceButton" .. i, StanceBar):SetSize(30, 30)
  end`;

// Where a button sits: its parent's name and its offsets from the parent's bottom left.
const seatOf = (addon, button) => addon.eval(`local b = ${button} local p, rel, rp, x, y = b:GetPoint() return { b:GetParent():GetName(), rel:GetName(), p, rp, x, y }`);

it("the pet and stance buttons sit on movers of their own, a row from the spot's bottom left", () => {
  const addon = loggedIn(SEATED_ENV);
  expect([addon.eval('return { ns.MoverPoint("petbar") }'), addon.eval('return { ns.MoverPoint("stancebar") }')], "defaults at the bottom left, one above the other").toEqual([["BOTTOMLEFT", "BOTTOMLEFT", 8, 250], ["BOTTOMLEFT", "BOTTOMLEFT", 8, 288]]);
  expect(addon.eval("return { Vanguard_PetActionBarSpot:GetWidth(), Vanguard_PetActionBarSpot:GetHeight(), Vanguard_StanceBarSpot:GetWidth(), Vanguard_StanceBarSpot:GetHeight() }"), "each mover is as big as its bar's row of buttons").toEqual([320, 32, 200, 32]);
  expect([seatOf(addon, "PetActionButton1"), seatOf(addon, "StanceButton3")], "each button is the spot's, 32 units after the one before").toEqual([["Vanguard_PetActionBarSpot", "Vanguard_PetActionBarSpot", "BOTTOMLEFT", "BOTTOMLEFT", 0, 0], ["Vanguard_StanceBarSpot", "Vanguard_StanceBarSpot", "BOTTOMLEFT", "BOTTOMLEFT", 64, 0]]);
  expect(addon.eval("return PetActionButton10:GetRight() - Vanguard_PetActionBarSpot:GetLeft()"), "the pet bar's ten buttons fit its spot").toBe(318);
  expect(addon.eval("return { Vanguard_StanceBarSpot:GetFrameLevel(), StanceBar.__mouse, PetActionBar.__mouse }"), "the spot is drawn at the game bar's level; the emptied bars no longer take the mouse").toEqual([70, false, false]);
  addon.eval('ns.SetMoverPoint("stancebar", "BOTTOM", "BOTTOM", 100, 400)');
  expect(addon.eval("return { StanceButton1:GetLeft(), StanceButton1:GetBottom() }"), "dragging the stance mover takes the buttons with it").toEqual([960 + 100 - 100, 400]); // the screen's center, 100 right of it, less half the 200-wide spot
});

it("the game re-stacking its bars in a fight leaves the buttons on their spots", () => {
  const fight = loggedIn(SEATED_ENV);
  setCombat(fight, true);
  fight.eval('StanceBar:ClearAllPoints() StanceBar:SetPoint("BOTTOMLEFT", UIParent, "BOTTOM", -200, 100)'); // Edit Mode lays its bottom bars out again
  expect(fight.eval("return { StanceButton1:GetLeft(), StanceButton1:GetBottom() }"), "the stance buttons stay over the chat, clear of the bar stack").toEqual([8, 288]);
  setCombat(fight, false);
  expect(fight.eval("return #ns.errors"), "nothing waits for the fight to end").toBe(0);
});

it("the spots hide as the game hides its bars: a vehicle, an override bar, mind control, no pet, a pet battle", () => {
  const forever = loggedIn(SEATED_ENV);
  // The pet and stance spots' visibility drivers.
  const drivers = (addon) => addon.eval("return { Vanguard_PetActionBarSpot.__states.visibility, Vanguard_StanceBarSpot.__states.visibility }");
  expect(drivers(forever), "Forever has no pet battles").toEqual(["[vehicleui][overridebar][nopet] hide; show", "[vehicleui][possessbar][overridebar] hide; show"]);
  const retail = loggedIn(RETAIL + SEATED_ENV);
  expect(drivers(retail).map((d) => d.startsWith("[petbattle] hide; ")), "Retail hides them in a pet battle too").toEqual([true, true]);
});

it("the pet and stance bars are placed after combat, and left to Edit Mode when placing is off", () => {
  const fight = createAddon({ savedVariables: SETUP_DONE });
  fight.eval(SEATED_ENV);
  setCombat(fight, true);
  fight.login();
  expect(fight.eval("return PetActionButton1:GetParent():GetName()"), "in a fight the game's buttons are left on its bar").toBe("PetActionBar");
  setCombat(fight, false);
  expect(seatOf(fight, "PetActionButton1")[0], "when it ends they move to their spot").toBe("Vanguard_PetActionBarSpot");
  const off = loggedIn(SEATED_ENV, { savedVariables: "VanguardDB.profiles = { Default = { SpecialBars = { place = false } } }" });
  expect([off.eval('return ns.MoverPoint("petbar") == nil'), off.eval("return PetActionButton1:GetParent():GetName()"), off.eval("return StanceBar.__mouse")], "with placing off there are no movers and the bars and buttons are the game's").toEqual([true, "PetActionBar", true]);
  const bare = loggedIn(SPECIAL_BARS_ENV);
  expect([bare.eval('return ns.MoverPoint("stancebar") ~= nil'), bare.eval("return #ns.errors")], "a client whose bar has no buttons yet still gets the spot").toEqual([true, 0]);
  const none = loggedIn();
  expect(none.eval('return ns.MoverPoint("petbar") == nil and ns.MoverPoint("stancebar") == nil'), "a client without the bars has nothing to place").toBe(true);
});

it("options: one switch restyles the pet, stance, possess and extra buttons", () => {
  const addon = loggedIn(UI_ENV + CLICK_LUA);
  addon.slash("");
  addon.eval('__click("Action bars")');
  addon.eval('__click("Restyle the pet, stance, possess and extra action buttons")');
  expect(addon.eval("local s = VanguardDB.profiles.Default.SpecialBars return { s.skinPet, s.skinStance, s.skinPossess, s.skinExtra }"), "all four off together").toEqual([false, false, false, false]);
});
