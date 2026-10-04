// masque: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// Core/Masque.lua: with Masque loaded, buttons and aura icons go to Masque groups.

import { expect, it } from "vitest";
import { loggedIn } from "./helpers.mjs";

// TEST-ONLY LibStub and Masque: groups record the buttons handed to them; the
// theme records which frames get ForeverUI's button skin and panels.
const MASQUE_ENV = `
  __groups = {}
  local Masque = {}
  function Masque:Group(addon, name)
    local g = { addon = addon, name = name, buttons = {} }
    function g:AddButton(button, regions, kind) self.buttons[#self.buttons + 1] = { button = button, regions = regions, kind = kind } end
    __groups[name] = g
    return g
  end
  LibStub = setmetatable({}, { __call = function(_, name, silent) __silent = silent if name == "Masque" then return Masque end end })
`;

// TEST-ONLY game pet and stance buttons, and a record of ForeverUI's own skins.
const SKINS_ENV = `
  for _, name in ipairs({ "PetActionButton1", "StanceButton1" }) do
    local b = CreateFrame("CheckButton", name, UIParent)
    b.icon = b:CreateTexture(nil, "ARTWORK")
    b.art = b:CreateTexture(nil, "BACKGROUND")
  end
  __buttoned, __panelled = {}, {}
  local T = ns.Theme
  local button, panel = T.Button, T.Panel
  T.Button = function(b) __buttoned[b] = true return button(b) end
  T.Panel = function(f, o) __panelled[f] = true return panel(f, o) end
`;

// A group's size, and whether it holds a frame (Lua expression).
const group = (addon, name, frame) => addon.eval(`local g = __groups["${name}"]
  if not g then return { count = 0 } end
  local found for _, e in ipairs(g.buttons) do if e.button == ${frame} then found = e end end
  return { count = #g.buttons, addon = g.addon, kind = found and found.kind or "none", has = found ~= nil,
    icon = found and found.regions and found.regions.Icon == ${frame}.icon, hotkey = found and found.regions and found.regions.HotKey == ${frame}.hotkey }`);

// Whether an aura icon frame has ForeverUI's theme edge (a painted child frame).
const edged = (addon, frame) => addon.eval(`for _, c in ipairs({ ${frame}:GetChildren() }) do if __panelled[c] then return true end end return false`);

it("with Masque loaded, action, pet and stance buttons and aura icons go to Masque groups, without ForeverUI's skin", () => {
  const addon = loggedIn(MASQUE_ENV + SKINS_ENV);
  addon.world.addAura("player", { name: "TEST-ONLY Buff", duration: 0, icon: "TEST-ONLY-ICON" });
  const bar = group(addon, "Action bars", "ForeverUI_Bar1Button1");
  expect(bar, "every action button, with its icon and hotkey, as an action button of ForeverUI's").toMatchObject({ count: 36, addon: "ForeverUI", kind: "Action", has: true, icon: true, hotkey: true });
  expect(addon.eval("return __buttoned[ForeverUI_Bar1Button1] == nil and __silent == true"), "ForeverUI's button skin is skipped; Masque is asked for silently").toBe(true);
  const special = addon.eval('local g = __groups["Pet, stance and extra buttons"] return { #g.buttons, g.buttons[1].regions == nil, PetActionButton1.art.__alpha == nil, __panelled[PetActionButton1] == nil }');
  expect(special, "the game's pet and stance buttons, regions found by Masque, not restyled").toEqual([2, true, true, true]);
  const auras = addon.eval('local g = __groups["Buffs and debuffs"] local e = g.buttons[#g.buttons] return { #g.buttons > #ns.GetModule("PlayerAuras").cells, e.kind, e.regions.Icon ~= nil, e.regions.Cooldown ~= nil }');
  expect(auras, "your buff and debuff icons, and the weapon enchant cells").toEqual([true, "Aura", true, true]);
  addon.world.setUnit("target", { name: "TEST-ONLY Target", hp: 1, maxhp: 2, reaction: 2 });
  expect(addon.eval('local g = __groups["Target and focus auras"] return g ~= nil and #g.buttons > 0 and g.buttons[1].kind'), "the target and focus auras in a group of their own").toBe("Aura");
  expect(addon.eval('local g = __groups["Buffs and debuffs"] for _, e in ipairs(g.buttons) do for _, c in ipairs({ e.button:GetChildren() }) do if __panelled[c] then return true end end end return false'), "with no theme edge").toBe(false);
});

it("without Masque (or without LibStub) nothing changes", () => {
  const plain = loggedIn(SKINS_ENV);
  expect(plain.eval("return { __buttoned[ForeverUI_Bar1Button1] == true, PetActionButton1.fuiSkinned == true, PetActionButton1.art.__alpha, ns.Masque.Lib() == nil }"), "ForeverUI's skins, as before").toEqual([true, true, 0, true]);
  plain.world.addAura("player", { name: "TEST-ONLY Buff", duration: 0, icon: "TEST-ONLY-ICON" });
  expect(plain.eval('local PA = ns.GetModule("PlayerAuras") local c = PA.cells[1] for _, ch in ipairs({ c:GetChildren() }) do if __panelled[ch] then return true end end return false'), "aura icons keep the theme edge").toBe(true);
  const noMasque = loggedIn('LibStub = function() return nil end' + SKINS_ENV);
  expect(noMasque.eval("return { ns.Masque.Lib() == nil, ns.Masque.Group('Action bars') == nil, ns.Masque.Add('Action bars', ForeverUI_Bar1Button1), __buttoned[ForeverUI_Bar1Button1] == true }"), "LibStub without Masque: the same").toEqual([true, true, false, true]);
  expect(edged(noMasque, "ns.GetModule('PlayerAuras').cells[1]"), "weapon enchant cells keep their edge too").toBe(true);
});
