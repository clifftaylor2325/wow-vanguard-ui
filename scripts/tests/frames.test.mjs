// frames: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { ACTIONS_ENV, CLICK_LUA, HEALING_ENV, RAID_ENV, TICKS_ENV, UI_ENV, UNITS_ENV, bars, button, isTok, loggedIn, marks, raidButton, spark } from "./helpers.mjs";

it("frames pass: bar texture, smoothing, raid style, shields, glows", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + HEALING_ENV + CLICK_LUA + `
    Enum = { StatusBarInterpolation = { ExponentialEaseOut = 1 } }
    __setValueArgs = {}
    local sv = __wfgStub.methods and __wfgStub.methods.SetValue`);
  addon.eval('__spawn(1, "raid1")');
  const tex = addon.eval("return Vanguard_RaidUnitButton1.health.__barTexture.__texture");
  expect(/Media\\Textures\\Bar$/.test(tex), "raid health uses the Vanguard bar texture").toBeTruthy();
  expect(/Media\\Textures\\Stripes$/.test(addon.eval("return Vanguard_RaidUnitButton1.shield.__barTexture.__texture")), "shields are striped").toBeTruthy();
  expect(/Bar$/.test(addon.eval("return Vanguard_player.health.__barTexture.__texture")), "unit frames use it too").toBeTruthy();
  addon.eval('ns.Options.Show("raid")');
  addon.eval('__click("Style")');
  const dark = addon.eval("local b = Vanguard_RaidUnitButton1 return { bar = b.health.__barColor, name = b.name.__textColor }");
  expect(isTok(addon, dark.bar, "darkBar") && dark.name[0] === 0.78, "the dark raid style: dark bars, class-colored names (at once)").toBeTruthy();
  addon.eval('ns.Options.Show("general")');
  addon.eval('__click("Bar texture")');
  expect(/Media\\Textures\\BarSoft$/.test(addon.eval("return ns.Theme.BarTexture()")) && addon.eval("return Vanguard_Options.reload:IsShown()") === true, "Soft bars are an option (on reload)").toBeTruthy();
  addon.eval('__click("Bar texture")');
  expect(addon.eval("return ns.Theme.BarTexture()") === "Interface\\Buttons\\WHITE8X8", "and Flat bars").toBeTruthy();
  // The interpolation the player health bar was last given with smoothing on or off ("none" for a plain set).
  const eased = (on) => addon.eval(`ns.Theme.Settings().smoothBars = ${on} ns.Theme.SetBarValue(Vanguard_player.health, 7) return Vanguard_player.health.__ease or "none"`);
  expect([eased(true), eased(false)], "smooth bars ask the client to ease the value; off, a plain set").toEqual([1, "none"]);
  const glow = addon.eval(`local f = CreateFrame("Frame", nil, UIParent) local g = ns.Theme.Glow(f, 6)
    local hidden = not g[1]:IsShown() ns.Theme.ShowGlow(g, true) return { n = #g, hidden = hidden, shown = g[1]:IsShown(), tex = g[1].__texture, color = g[1].__vertexColor }`);
  expect(glow.n === 8 && glow.hidden && glow.shown && /Glow$/.test(glow.tex) && isTok(addon, glow.color, "accent"), "a glow is eight hidden Glow pieces, shown in the accent").toBeTruthy();
});

// What Vanguard painted on a frame: soft shadow pieces, a sheen line, and the
// layer (and sublevel) of its border.
const paintedOn = (addon, path) => addon.eval(`local f, out = ${path}, { shadow = 0, sheen = 0 }
  for _, w in ipairs(__wfgStub.frames) do
    if w.__parent == f and type(w.__texture) == "string" and w.__texture:find("Shadow$") then out.shadow = out.shadow + 1 end
    if w.__parent == f and w.__layer == "BORDER" and w.__points.TOPLEFT and w.__points.TOPLEFT.y ~= 0 then out.sheen = out.sheen + 1 end
    if w.__parent == f and w.__points.TOPLEFT and w.__points.TOPRIGHT and w.__height and not out.edge then out.edge = { w.__layer, w.__sublevel or 0 } end
  end
  return out`);

it("brass art: a calmer HUD, soft sparks, corner diamonds and role marks", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + TICKS_ENV + CLICK_LUA);
  const player = paintedOn(addon, "Vanguard_player");
  expect(player.shadow === 0 && player.sheen === 0 && player.edge[0] === "BORDER", "HUD frames: no soft shadow, no sheen, the border under their content").toBeTruthy();
  const cast = paintedOn(addon, "Vanguard_CastBar_player");
  expect(cast.shadow === 0 && cast.edge[0] === "OVERLAY" && cast.edge[1] === 7, "a status bar's border sits over its fill").toBeTruthy();
  const window = paintedOn(addon, 'ns.Theme.Panel(CreateFrame("Frame", nil, UIParent), { shadow = true })');
  expect(window.shadow === 8 && window.sheen === 1, "floating windows keep their shadow and sheen").toBeTruthy();
  const tick = addon.eval("local s = ns.GetModule('PowerTicks').spark return { s.__texture, s.__blend, s.__width, s.__layer }");
  expect(/Textures\\Spark$/.test(tick[0]) && tick[1] === "ADD" && tick[2] === 6 && tick[3] === "OVERLAY", "the power bar's spark is the soft Spark too").toBeTruthy();
  addon.eval('__units.raid4 = { name = "TEST-ONLY Healer", hp = 1, maxhp = 1, power = 0, maxpower = 0, ptype = "MANA", player = true, class = "PRIEST", role = "HEALER" }');
  addon.eval('__units.raid5 = { name = "TEST-ONLY Hidden", hp = 1, maxhp = 1, power = 0, maxpower = 0, ptype = "MANA", player = true, class = "PRIEST", role = { __secret = true } }');
  addon.eval('__spawn(4, "raid4") __spawn(5, "raid5")');
  const healer = raidButton(addon, 4);
  expect(/Icons\\RoleHealer$/.test(healer.role) && raidButton(addon, 5).role === false, "healers get a cross; a hidden role shows no mark").toBeTruthy();
  const mark = addon.eval("local b = Vanguard_RaidUnitButton4 return { b.role.__vertexColor, b.roleShadow:IsShown(), b.roleShadow.__vertexColor, b.role.__sublevel > b.roleShadow.__sublevel }");
  expect(isTok(addon, mark[0], "text2") && mark[1] === true && isTok(addon, mark[2], "textShadow") && mark[3] === true, "the mark is text2 over a dark shadow").toBeTruthy();
  addon.eval('ns.Options.Show("general")');
  expect(addon.eval('return __click("Soft shadows under frames") and ns.Theme.Settings().hudShadow') === true && addon.eval("return Vanguard_Options.reload:IsShown()") === true, "Soft shadows under frames is a switch (on reload)").toBeTruthy();
  const shadowed = loggedIn(UNITS_ENV, { savedVariables: "VanguardDB.profiles.Default = { theme = { hudShadow = true } }" });
  const withShadow = paintedOn(shadowed, "Vanguard_player");
  expect(withShadow.shadow === 8 && withShadow.sheen === 0, "with it on, HUD frames get the soft shadow (still no sheen)").toBeTruthy();
  const map = loggedIn(UI_ENV);
  // Each corner diamond as [texture, color, width, the map corner it's centered on].
  const corners = () => map.eval("local out = {} for i, d in ipairs(ns.GetModule('Minimap').corners) do out[i] = { d.__texture, d.__vertexColor, d.__width, d.__points.CENTER.relPoint } end return out");
  const four = corners();
  expect(four.length === 4 && four.every((c) => /Textures\\Diamond$/.test(c[0]) && isTok(map, c[1], "accent") && c[2] === 8), "four accent diamonds on the minimap").toBeTruthy();
  expect(four.map((c) => c[3]).join(",") === "TOPLEFT,TOPRIGHT,BOTTOMLEFT,BOTTOMRIGHT", "one centered on each corner").toBeTruthy();
  map.eval("ns.Theme.SetAccent(0.1, 0.2, 0.3)");
  expect(corners()[0][1][2] === 0.3, "they follow the accent live").toBeTruthy();
});

it("proc glow on action buttons", () => {
  const addon = loggedIn(ACTIONS_ENV + "GetActionInfo = function(slot) if slot == 2 then return 'spell', 424242 end end");
  // Whether only button 2 (the one holding the spell) glows.
  const glowShown = () => addon.eval("return Vanguard_Bar1Button2.glow[1]:IsShown() and not Vanguard_Bar1Button1.glow[1]:IsShown()");
  addon.fire("SPELL_ACTIVATION_OVERLAY_GLOW_SHOW", 424242);
  expect(glowShown() === true, "a proc lights the button holding that spell, and only it").toBeTruthy();
  addon.fire("SPELL_ACTIVATION_OVERLAY_GLOW_HIDE", 424242);
  expect(addon.eval("return Vanguard_Bar1Button2.glow[1]:IsShown()") === false, "and goes out when the proc ends").toBeTruthy();
});
