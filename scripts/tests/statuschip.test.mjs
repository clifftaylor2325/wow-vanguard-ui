// statuschip: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).
// The status chip above the player frame (Modules/UnitExtras.lua): Eating, Drinking, Well Fed, and a missing-buff hint.

import { expect, it } from "vitest";
import { expectErrors, isTok, loggedIn, setCombat } from "./helpers.mjs";

const CHIP = "VanguardDB.profiles = { Default = { UnitExtras = { chip = true } } }";
const CHIP_AND_PREP = "VanguardDB.profiles = { Default = { UnitExtras = { chip = true }, InstancePrep = { buffs = true } } }";

// What the chip shows: whether it is up, its text, the icon's texture, and where it sits against the player frame.
const chip = (addon) => addon.eval(`local f = Vanguard_StatusChip
  if not f then return nil end
  return { shown = f:IsShown(), text = f.text:GetText(), icon = f.icon.__texture, width = f:GetWidth(), above = f:IsShown() and f:GetBottom() > Vanguard_player:GetTop() - 1 and f:GetLeft() == Vanguard_player:GetLeft() + 12 }`);
// Gives the player a helpful aura, then lets the chip's once-a-frame update run.
const gain = (addon, name) => { addon.world.addAura("player", { name, duration: 60 }); addon.advance(1); };
// Takes an aura away and lets the update run.
const lose = (addon, name) => { addon.world.removeAura("player", name); addon.advance(1); };

it("status chip: off until switched on, then it names eating, drinking and being well fed with the buff's icon", () => {
  const off = loggedIn("");
  gain(off, "Food");
  expect(chip(off), "off by default: no chip is made").toBeNull();
  const addon = loggedIn("", { savedVariables: CHIP });
  expect(chip(addon).shown, "nothing to say: hidden").toBe(false);
  gain(addon, "Food");
  expect(chip(addon), "eating: its text, the buff's own icon, above the player frame's corner").toMatchObject({ shown: true, text: "Eating", icon: "TEST-ONLY-ICON-Food", above: true });
  const eating = chip(addon).width;
  lose(addon, "Food");
  gain(addon, "Drink");
  expect(chip(addon), "drinking").toMatchObject({ shown: true, text: "Drinking", icon: "TEST-ONLY-ICON-Drink" });
  lose(addon, "Drink");
  gain(addon, "Well Fed");
  expect([chip(addon).text, chip(addon).width > eating, addon.eval("return ns.Theme.RGB('good') == select(1, Vanguard_StatusChip.text:GetTextColor())")], "well fed, in the good color, the chip sized to its text").toEqual(["Well Fed", true, true]);
  lose(addon, "Well Fed");
  expect(chip(addon).shown, "the buff gone: hidden again").toBe(false);
});

it("status chip: with Instance prep's buff checks on it says what is missing, in a warning, with a glyph", () => {
  const addon = loggedIn("", { savedVariables: CHIP_AND_PREP });
  addon.advance(1);
  const first = chip(addon);
  expect([first.shown, /^Missing: Flask \+\d$/.test(first.text), first.icon], "the first missing buff and how many more, with the warning glyph").toEqual([true, true, addon.eval("return ns.Theme.Icon('Warn')")]);
  expect(addon.eval("return select(1, Vanguard_StatusChip.text:GetTextColor()) == ns.Theme.RGB('warn') and select(1, Vanguard_StatusChip.icon:GetVertexColor()) == ns.Theme.RGB('warn')"), "in the warning color, not by color alone").toBe(true);
  gain(addon, "Flask of the Titans");
  expect(chip(addon).text.startsWith("Missing: Food buff"), "the next one named").toBe(true);
  for (const name of ["Well Fed", "Power Word: Fortitude", "Mark of the Wild", "Arcane Intellect"]) gain(addon, name);
  expect(chip(addon), "everything there: Well Fed wins, and no hint").toMatchObject({ shown: true, text: "Well Fed" });
  lose(addon, "Well Fed");
  expect(chip(addon).text, "the food gone: its hint again").toBe("Missing: Food buff");
  lose(addon, "Flask of the Titans");
  expect(chip(addon).text, "the flask gone too: both, and the rest still counted").toBe("Missing: Flask +1");
  const noChecks = loggedIn("", { savedVariables: CHIP });
  noChecks.advance(1);
  expect(chip(noChecks).shown, "with the buff checks off there is no hint").toBe(false);
  const noPrep = loggedIn("", { savedVariables: "VanguardDB.profiles = { Default = { UnitExtras = { chip = true }, modules = { InstancePrep = false } } }" });
  noPrep.advance(1);
  expect(chip(noPrep).shown, "with Instance prep off there is no hint").toBe(false);
});

it("status chip: gone in a fight and while aura values are hidden or you are dead; back after", () => {
  const addon = loggedIn("", { savedVariables: CHIP_AND_PREP });
  gain(addon, "Well Fed");
  expect(chip(addon).shown, "shown out of combat").toBe(true);
  addon.fire("PLAYER_REGEN_DISABLED");
  expect(chip(addon).shown, "hidden the moment a fight starts").toBe(false);
  setCombat(addon, true);
  gain(addon, "Drink");
  expect(chip(addon).shown, "and it stays hidden while auras change in the fight").toBe(false);
  setCombat(addon, false);
  expect(chip(addon).shown, "shown again").toBe(true);
  addon.eval("__wfgWorld.aurasSecret = true");
  addon.fire("UNIT_AURA", "player");
  addon.advance(1);
  expect(chip(addon).shown, "no guess while the client hides aura values").toBe(false);
  addon.eval("__wfgWorld.aurasSecret = false");
  addon.world.setUnit("player", { dead: true });
  addon.fire("PLAYER_DEAD");
  expect(chip(addon).shown, "not while you are dead").toBe(false);
  addon.world.setUnit("player", { dead: false });
  addon.fire("PLAYER_ALIVE");
  expect(chip(addon).shown, "back when you rise").toBe(true);
  addon.eval("UnitIsDeadOrGhost = function() return __wfgWorld.secret(true) end");
  addon.fire("PLAYER_ALIVE");
  expect(chip(addon).shown, "a hidden answer about your being dead counts as hidden").toBe(false);
});

it("status chip: a client without the aura lookup says nothing, and the switch is on the Unit frames page", () => {
  const addon = loggedIn("C_UnitAuras.GetAuraDataBySpellName = nil", { savedVariables: CHIP });
  addon.world.addAura("player", { name: "Food", duration: 60 });
  addon.advance(1);
  expect(chip(addon).shown, "no lookup: nothing to say").toBe(false);
  const on = loggedIn("", { savedVariables: CHIP });
  on.eval("__wfgWorld.units.player.auras = { { name = 'Food', icon = { __secret = true }, auraInstanceID = 1, isHelpful = true } }");
  on.fire("UNIT_AURA", "player");
  on.advance(1);
  expect([chip(on).shown, chip(on).text], "a hidden icon still names the state, with the warning glyph").toEqual([true, "Eating"]);
  expect(loggedIn("").eval("return ns.GetModule('UnitExtras').settings.chip"), "off by default").toBe(false);
});
