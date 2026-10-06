// windows-town: the town group of game windows (Modules/WindowsTown.lua), in the
// TEST-ONLY headless client. Cases follow docs/handoff/RESKIN-PLAN.md section 0 ("Writing a task's test").

import { expect, it } from "vitest";
import { WINDOWS_ENV, loggedIn, windowState } from "./helpers.mjs";

const OFF = "VanguardDB.profiles = { Default = { Windows = { town = false } } }";

// Any error Vanguard reported from the windows modules, or "none".
const windowErrors = (addon) => addon.eval("for _, e in ipairs(ns.errors) do if e.text:find('Windows') then return e.text end end return 'none'");

// The alphas of the Lua expressions given (each a frame or texture), in order.
const alphas = (addon, ...parts) => addon.eval(`return { ${parts.map((p) => `(${p}):GetAlpha()`).join(", ")} }`);

// Whether each Lua expression (a frame) has been given a Vanguard look: it has regions of its own now.
const dressed = (addon, ...frames) => addon.eval(`return { ${frames.map((f) => `select('#', (${f}):GetRegions()) > 0`).join(", ")} }`);

it("the town group loads cleanly on a client without its windows", () => {
  const addon = loggedIn("");
  expect(addon.eval("return ns.GetModule('Windows').settings.town"), "its switch is on by default").toBe(true);
  expect(windowErrors(addon)).toBe("none");
});

// TEST-ONLY pet stable (Blizzard_StableUI, Camelot): the window with the parts the skin dresses.
const STABLE_ENV = `${WINDOWS_ENV}
  local f = __window("PetStableFrame")
  for _, key in ipairs({ "Background", "Border", "PetShadow" }) do f[key] = f:CreateTexture() end
  local scene = CreateFrame("Frame", nil, f) f.modelScene = scene
  scene.Background, scene.PetShadow = scene:CreateTexture(), scene:CreateTexture()
  scene.PetModelSceneShadow, scene.Inset = CreateFrame("Frame", nil, scene), CreateFrame("Frame", nil, scene)
  local bar = CreateFrame("Frame", nil, f) f.expBar = bar
  bar.StatusBar = CreateFrame("StatusBar", nil, bar) bar.StatusBar.Background = bar.StatusBar:CreateTexture()
  bar.overlay = CreateFrame("Frame", nil, bar) bar.overlay.art = bar.overlay:CreateTexture() bar.overlay.xpText = bar.overlay:CreateFontString(nil, "OVERLAY")
  f.purchaseButton = CreateFrame("Button", nil, f)
  f.loyaltyLevel = CreateFrame("Frame", nil, f) f.loyaltyLevel.levelText = f.loyaltyLevel:CreateFontString(nil, "ARTWORK")
  for _, name in ipairs({ "PetStableLevelText", "PetStableLoyaltyText", "PetStableSlotText", "PetStableCostLabel" }) do f:CreateFontString(name, "ARTWORK") end
  local slot = CreateFrame("CheckButton", "PetStableCurrentPet", f) slot.Text = slot:CreateFontString(nil, "BACKGROUND")
`;

it("S2.1 the pet stable: art faded, pet scene and experience bar dressed, purchase button and texts in the theme", () => {
  const addon = loggedIn(STABLE_ENV);
  addon.eval("PetStableFrame:Show()");
  const first = windowState(addon, "PetStableFrame");
  expect(first, "the window skin").toMatchObject({ art: 0, nine: 0, panel: true, title: true });
  const f = "PetStableFrame";
  expect(alphas(addon, `${f}.Background`, `${f}.Border`, `${f}.modelScene.Background`, `${f}.modelScene.PetShadow`, `${f}.modelScene.PetModelSceneShadow`, `${f}.modelScene.Inset`, `${f}.expBar.StatusBar.Background`), "its own art and the scene's faded").toEqual([0, 0, 0, 0, 0, 0, 0]);
  expect(addon.eval(`return { ${f}.expBar.overlay.art:GetAlpha(), ${f}.expBar.overlay.xpText:GetAlpha(), ${f}.expBar.StatusBar:GetStatusBarTexture() ~= nil }`), "the bar's frame art faded, its text kept, the theme's bar texture").toEqual([0, 1, true]);
  expect(dressed(addon, `${f}.modelScene`, `${f}.expBar`, `${f}.purchaseButton`), "the scene and bar get panels, the purchase button is a theme button").toEqual([true, true, true]);
  expect(addon.eval(`return { ${f}.loyaltyLevel.levelText:GetFont() ~= nil, PetStableLevelText:GetFont() ~= nil, PetStableCurrentPet.Text:GetFont() ~= nil }`), "texts in the theme font").toEqual([true, true, true]);
  addon.eval("PetStableFrame:Hide() PetStableFrame:Show()");
  expect(windowState(addon, "PetStableFrame").painted, "a second show paints nothing more").toBe(first.painted);
});

it("S2.1 the pet stable: its group switched off leaves it the game's; a client with a bare window loads cleanly", () => {
  const off = loggedIn(STABLE_ENV, { savedVariables: OFF });
  off.eval("PetStableFrame:Show()");
  expect([windowState(off, "PetStableFrame").art !== 0, off.eval("return PetStableFrame.vgWindow == nil")], "not hooked, art left").toEqual([true, true]);
  const bare = loggedIn('CreateFrame("Frame", "PetStableFrame", UIParent):Hide()');
  bare.eval("PetStableFrame:Show()");
  expect([bare.eval("return PetStableFrame.vgWindow"), windowErrors(bare)], "a window without the parts is skinned, no error").toEqual([true, "none"]);
});
