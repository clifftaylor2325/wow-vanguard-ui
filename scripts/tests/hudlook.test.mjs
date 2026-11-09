// The HUD look (Core/HudLook.lua): Shield, the default, points every unit frame away from the character, fills its
// bars toward it, mirrors the target's texts and draws a hairline in your rim and your target's; Plain gives the
// flat frames back. The tools take the shield cuts under Shield, and the keystone (Modules/Keystone.lua) stands
// between your frame and your target's. docs/features/look-and-layout.md (HUD look) and unit-frames.md (Keystone).
import { expect, it } from "vitest";
import { CLICK_LUA, NO_RAID, TOOLS_ENV, UNITS_ENV, isTok, loggedIn, setCombat, tok } from "./helpers.mjs";

// The frames on Plain from the start (a profile that kept it), with no raid frames.
const PLAIN = { savedVariables: 'VanguardDB = { profiles = { Default = { modules = { RaidFrames = false }, theme = { hudLook = "plain" } } } }' };

// TEST-ONLY duration objects, so the keystone's ring has a global cooldown to sweep.
const GCD_ENV = `
  __gcdAsked = {}
  C_Spell.GetSpellCooldownDuration = function(id) __gcdAsked[#__gcdAsked + 1] = id return { __duration = "gcd" } end
`;

// A unit frame's shape (TEST-ONLY reads): half its height in whole pixels (a point's depth), each corner's size in
// pixels and look, which edges show (the border's and the hairline's alike), the health bar's masks by corner, whether
// the bars fill from the right, and where the name and the health text anchor on the health bar.
const SHAPE_LUA = `local f, T = Vanguard_%KEY%, ns.Theme
  local px, corners, edges = T.Pixel(f), {}, {}
  for _, p in ipairs({ "TOPLEFT", "TOPRIGHT", "BOTTOMLEFT", "BOTTOMRIGHT" }) do corners[#corners + 1] = math.floor(T.CornerAt(f, p) / px + 0.5) .. " " .. tostring(T.CornerLook(f, p)) end
  for _, r in ipairs({ f:GetRegions() }) do
    if tostring(r.__texture):find("WHITE8X8") and r:IsShown() then
      if r:GetWidth() == px and r:GetHeight() > 20 then edges[r.__points.TOPLEFT and "LEFT" or "RIGHT"] = true end
      if r:GetHeight() == px and r:GetWidth() > 20 then edges[r.__points.TOPLEFT and "TOP" or "BOTTOM"] = true end
    end
  end
  local sides = {}
  for side in pairs(edges) do sides[#sides + 1] = side end
  table.sort(sides)
  local masks = {}
  for i, m in ipairs(f.health:GetStatusBarTexture().__masks or {}) do masks[i] = next(m.__points) .. " " .. tostring(m.__texture):match("[^\\\\]+$") end
  table.sort(masks)
  local function at(fs) local p, rel, relPoint, x = fs:GetPoint(1) return p .. " " .. relPoint .. " " .. math.floor(x * 100 + 0.5) / 100 end
  return { half = math.floor(f:GetHeight() / px / 2), corners = corners, edges = sides, masks = masks, reverse = f.health:GetReverseFill() and f.power:GetReverseFill(),
    name = at(f.level or f.name), health = at(f.healthText), justify = f.name.__justifyH }`;

// The shape of the unit frame `key`.
const shape = (addon, key) => addon.eval(SHAPE_LUA.replace("%KEY%", key));

// The baked depth a point of `depth` pixels draws its line from (Core/HudLook.lua T.PointLine).
const baked = (depth) => [12, 14, 16, 18, 20, 22, 24, 30, 36].reduce((best, d) => (Math.abs(d - depth) < Math.abs(best - depth) ? d : best));

// The shown one-pixel lines on a frame in a token's colour: the hairline's edges (TEST-ONLY reads).
const hairlines = (addon, key, token) => addon.eval(`local f, T, n = Vanguard_${key}, ns.Theme, 0
  local r, g, b = T.RGB("${token}")
  for _, t in ipairs({ f:GetRegions() }) do
    local tr, tg, tb = t:GetVertexColor()
    local thin = t:GetWidth() == T.Pixel(f) or t:GetHeight() == T.Pixel(f)
    if t:IsShown() and thin and math.abs(tr - r) < 1e-6 and math.abs(tg - g) < 1e-6 and math.abs(tb - b) < 1e-6 then n = n + 1 end
  end
  return n`);

// How many shown corner pieces of an art a frame has (TEST-ONLY reads).
const pieces = (addon, name, art) => addon.eval(`local n = 0 for _, r in ipairs({ ${name}:GetRegions() }) do if tostring(r.__texture):find("${art}") and r:IsShown() then n = n + 1 end end return n`);

it("Shield (the default): the player frame points left and the target right, each point half the frame deep, with no border up the pointed end and the bars cut to it", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA, NO_RAID);
  expect(addon.eval("return { ns.Theme.Settings().hudLook, ns.Theme.HudLook() }"), "the setting and the look").toEqual(["shield", "shield"]);
  const player = shape(addon, "player");
  const half = player.half;
  expect(half > 12 && player.corners, "the player's two left corners are points half the frame's height deep (whole pixels), its right corners square").toEqual([`${half} point`, "0 nil", `${half} point`, "0 nil"]);
  expect(player.edges, "the border and the hairline run along the top, the bottom and the square end only").toEqual(["BOTTOM", "RIGHT", "TOP"]);
  expect(player.masks, "the health bar is cut at the two left corners with the point masks").toEqual(["BOTTOMLEFT PointMaskBL", "TOPLEFT PointMask"]);
  const target = shape(addon, "target");
  expect([target.corners, target.edges, target.masks], "the target mirrors: points on the right").toEqual([["0 nil", `${half} point`, "0 nil", `${half} point`], ["BOTTOM", "LEFT", "TOP"], ["BOTTOMRIGHT PointMaskBR", "TOPRIGHT PointMaskTR"]]);
  const tot = shape(addon, "targettarget");
  expect([tot.half < half, tot.corners], "the target of target points right too, half its own 24-unit height deep").toEqual([true, ["0 nil", `${tot.half} point`, "0 nil", `${tot.half} point`]]);
  expect([shape(addon, "focus").corners[0], shape(addon, "pet").corners[0]], "focus and pet point left with the player").toEqual([`${shape(addon, "focus").half} point`, `${tot.half} point`]);
  expect([pieces(addon, "Vanguard_focus", `PointLine${baked(shape(addon, "focus").half)}`), pieces(addon, "Vanguard_player", `PointLine${baked(half)}`), pieces(addon, "Vanguard_player", "PointFill"), pieces(addon, "Vanguard_player", "CornerCutLine")], "the point's two line pieces are the line baked nearest its depth (the player's hairline adds two), with fills under them, and no 8-pixel cuts").toEqual([2, 4, 2, 0]);
});

it("Shield: fills grow toward the character, the target's texts and marks mirror the player's, and a brass hairline runs in both rims, brighter in a fight", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA, NO_RAID);
  const [player, target, focus] = ["player", "target", "focus"].map((k) => shape(addon, k));
  expect([player.reverse, target.reverse, focus.reverse, shape(addon, "pet").reverse], "left-pointing frames fill from the right (the inner edge), the target from the left").toEqual([true, false, true, true]);
  const inset = addon.eval("local v = ns.GetModule('UnitFrames').TEXT_INSET + math.max(0, ns.Theme.CornerAt(Vanguard_player, 'TOPLEFT') - (ns.Theme.Pixel(Vanguard_player) + (Vanguard_player.vgHeight - ns.GetModule('UnitFrames').settings.powerHeight - 3 * ns.Theme.Pixel(Vanguard_player)) / 2)) return math.floor(v * 100 + 0.5) / 100");
  expect(inset > 4 && inset < 14, "the name starts past the point's reach at the health bar's middle (more than the plain inset of 4)").toBe(true);
  expect([player.name, player.health, player.justify], "the player's level and name read from the left, the health text ends short of the swords at the right").toEqual([`LEFT LEFT ${inset}`, "RIGHT RIGHT -10", "LEFT"]);
  expect([target.name, target.health, target.justify], "the target's read from the right, its health text at the left end, short of the diamond").toEqual([`RIGHT RIGHT -${inset}`, "LEFT LEFT 10", "RIGHT"]);
  expect(addon.eval("local t = Vanguard_target return { (select(3, t.class:GetPoint(1))), (select(4, t.class:GetPoint(1))), (select(3, t.tag:GetPoint(1))), (select(4, t.tag:GetPoint(1))), (select(3, Vanguard_player.combat:GetPoint(1))) }"), "the diamond and tag mark sit over the target's top-left corner, the swords over the player's top-right").toEqual(["TOPLEFT", 2, "TOPLEFT", 18, "TOPRIGHT"]);
  expect([hairlines(addon, "player", "accentDim"), hairlines(addon, "target", "accentDim"), hairlines(addon, "focus", "accentDim")], "three hairline edges (not up the point) in the dim accent on your frame and your target's, none on the focus").toEqual([3, 3, 0]);
  setCombat(addon, true);
  addon.eval("ns.GetModule('UnitFrames').RefreshCombat()");
  expect([hairlines(addon, "player", "accent"), hairlines(addon, "player", "accentDim")], "in a fight the player's hairline steps up to the accent").toEqual([3, 0]);
  setCombat(addon, false);
  expect(hairlines(addon, "player", "accentDim"), "and back when it ends").toBe(3);
});

it("Plain: the HUD look row under Look gives the flat frames back at once, texts in their old places, the shield cuts following the switch", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA, NO_RAID);
  addon.slash("");
  addon.eval('__click("HUD look")');
  expect(addon.eval("return VanguardDB.profiles.Default.theme.hudLook"), "the cycle row saves Plain").toBe("plain");
  const target = shape(addon, "target");
  expect([target.corners, target.edges, target.reverse, target.name, target.health, target.justify], "the target has 8-pixel cuts on every corner, four edges, fills from the left and reads from the left")
    .toEqual([["8 cut", "8 cut", "8 cut", "8 cut"], ["BOTTOM", "LEFT", "RIGHT", "TOP"], false, "LEFT LEFT 4", "RIGHT RIGHT -10", "LEFT"]);
  expect(shape(addon, "player").half > 12, "the frames are still as tall").toBe(true);
  expect([shape(addon, "player").reverse, hairlines(addon, "player", "accentDim"), addon.eval("return select(3, Vanguard_target.class:GetPoint(1))")], "the player fills from the left, no hairline, the diamond back at the top right").toEqual([false, 0, "TOPRIGHT"]);
  addon.eval('__click("Shield corners on unit frames")');
  expect(shape(addon, "target").corners, "the switch off squares them").toEqual(["0 nil", "0 nil", "0 nil", "0 nil"]);
  addon.eval('__click("HUD look")');
  expect([addon.eval("return ns.Theme.Settings().hudLook"), shape(addon, "target").corners[1]], "cycling back to Shield points them again whatever the switch says").toEqual(["shield", `${shape(addon, "target").half} point`]);
  expect(addon.eval('ns.Theme.Settings().hudLook = "pennant" return ns.Theme.HudLook()'), "a saved look no release knows reads as Plain").toBe("plain");
});

it("the point's line is the one baked nearest its depth, cropped to that depth and flipped to its corner", () => {
  const addon = loggedIn();
  expect(addon.eval("return ns.Theme.POINT_DEPTHS")).toEqual([12, 14, 16, 18, 20, 22, 24, 30, 36]);
  expect(addon.eval('return { ns.Theme.PointLine(18, "TOPLEFT") }'), "18 on a 32 canvas: cropped to 18/32, top left as drawn").toEqual(["PointLine18", [0, 0.5625, 0, 0.5625]]);
  expect(addon.eval('return { ns.Theme.PointLine(17.3, "BOTTOMRIGHT") }'), "17.3 takes 18, flipped both ways").toEqual(["PointLine18", [0.5625, 0, 0.5625, 0]]);
  expect(addon.eval('return { ns.Theme.PointLine(13, "TOPRIGHT") }'), "13 takes 12 (a 16 canvas), flipped across").toEqual(["PointLine12", [0.75, 0, 0, 0.75]]);
  expect(addon.eval('return { ns.Theme.PointLine(80, "BOTTOMLEFT") }'), "past the largest, 36 on a 64 canvas").toEqual(["PointLine36", [0, 0.5625, 0.5625, 0]]);
});

it("a taller target frame (a role layout) deepens its point and moves its texts; a hidden height keeps the last depth", () => {
  const addon = loggedIn(UNITS_ENV, NO_RAID);
  const before = shape(addon, "target");
  addon.eval("local UF = ns.GetModule('UnitFrames') UF.settings.targetHeight = 48 UF.ApplySizes()");
  const taller = shape(addon, "target");
  expect([taller.half > before.half, taller.corners[1], addon.eval("return Vanguard_target.vgHeight")], "deeper on 48").toEqual([true, `${taller.half} point`, 48]);
  addon.eval("local t = Vanguard_target local h = t.GetHeight t.GetHeight = function() return { __secret = true } end ns.Theme.RepaintFrame(t) t.GetHeight = h");
  expect([shape(addon, "target").corners[1], addon.eval("return #ns.errors")], "a hidden height repaints at the depth it had, without an error").toEqual([`${taller.half} point`, 0]);
  expect(addon.eval("return ns.Theme.CornerLook(ns.Theme.HudPanel(CreateFrame('Frame', nil, UIParent), { role = 'unit' }), 'TOPLEFT')"), "a unit frame with no height yet is square").toBe(null);
});

it("the tools: under Shield the cast bars and the bar backing take the shield cuts while the switch is on, and the backing's Auto comes on", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA, NO_RAID);
  expect([pieces(addon, "Vanguard_CastBar_player", "CornerCutLine"), addon.eval("return ns.GetModule('ActionBars').WantsBacking()")], "the player's cast bar is cut, the bars want their plinth").toEqual([4, true]);
  addon.eval("ns.Theme.Settings().shield = false ns.Theme.Refresh()");
  expect([pieces(addon, "Vanguard_CastBar_player", "CornerCutLine"), shape(addon, "player").corners[0]], "the switch off squares the tools, the frames keep their points").toEqual([0, `${shape(addon, "player").half} point`]);
  addon.eval('ns.Theme.Settings().shield = true ns.Theme.Settings().hudLook = "plain" ns.Theme.Refresh()');
  expect([pieces(addon, "Vanguard_CastBar_player", "CornerCutLine"), addon.eval("return ns.GetModule('ActionBars').WantsBacking()")], "Plain: the cast bar is square again and Auto means no plinth").toEqual([0, false]);
  addon.eval("ns.GetModule('ActionBars').settings.backing = 'on'");
  expect(addon.eval("return ns.GetModule('ActionBars').WantsBacking()"), "On is on under any look").toBe(true);
});

// The keystone as drawn (TEST-ONLY reads): shown, its anchors, the rail, the ring and the swords.
const keystone = (addon) => addon.eval(`local f = Vanguard_Keystone
  if not f then return { made = false } end
  return { made = true, shown = f:IsShown(), left = f.__points.LEFT.rel == Vanguard_player, right = f.__points.RIGHT.rel == Vanguard_target, top = f.__points.TOP.rel == Vanguard_player,
    strata = f.__strata, mouse = f.__mouse, rails = #f.rails, crest = math.floor(f.crest:GetWidth() + 0.5), ring = f.ring:IsShown(), swords = f.swords:IsShown(), sweep = f.ring.__durationObject and f.ring.__durationObject.__duration or "none" }`);

it("the keystone: the crest on a rail between your frame and your target's, under them, taking no mouse, swords lit in a fight, no ring until its switch", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA + GCD_ENV, NO_RAID);
  expect(keystone(addon), "shown by default with the Shield look").toEqual({ made: true, shown: true, left: true, right: true, top: true, strata: "BACKGROUND", mouse: false, rails: 2, crest: 36, ring: false, swords: false, sweep: "none" });
  expect(addon.eval("local r = Vanguard_Keystone.rails[1] return { r:GetHeight(), r.__points.LEFT.relPoint, r.__points.RIGHT.x }"), "a two-unit rail from the frame to the ring's edge").toEqual([2, "LEFT", -22]);
  expect(isTok(addon, addon.eval("return { Vanguard_Keystone.rails[2]:GetVertexColor() }"), "accentDim"), "in the dim accent").toBe(true);
  setCombat(addon, true);
  addon.fire("PLAYER_REGEN_DISABLED");
  expect(keystone(addon).swords, "the swords light when a fight starts").toBe(true);
  setCombat(addon, false);
  expect(keystone(addon).swords, "and go when it ends").toBe(false);
  addon.slash("");
  addon.eval('__click("Unit frames") __click("Global cooldown on the keystone")');
  expect([addon.eval("return VanguardDB.profiles.Default.Keystone.sweep"), keystone(addon).ring, keystone(addon).sweep, addon.eval("return __gcdAsked[1]")], "the switch shows the ring and sweeps it with the global cooldown").toEqual([true, true, "gcd", 61304]);
  addon.eval("Vanguard_Keystone.ring:Clear()");
  addon.fire("SPELL_UPDATE_COOLDOWN");
  expect(keystone(addon).sweep, "and again at each cooldown update").toBe("gcd");
  addon.eval('__click("Global cooldown on the keystone")');
  expect([keystone(addon).ring, addon.eval("return Vanguard_Keystone.ring.back:IsShown()")], "off again: the ring and its track go").toEqual([false, false]);
  addon.eval('__click("General") __click("Calm HUD")');
  expect(addon.eval("return Vanguard_Keystone.inner.vgStateString"), "it dims with your frames under the Calm HUD").toBe("[combat] show; [harm,nodead] show; dim");
});

it("the keystone steps aside: for the deck, a moved frame, the Cooldown Manager's row across it, Plain under Auto, and Never; Always shows it under Plain", () => {
  const addon = loggedIn(UNITS_ENV + CLICK_LUA, NO_RAID);
  // Whether the keystone shows now.
  const shown = () => keystone(addon).shown;
  addon.eval("local UF = ns.GetModule('UnitFrames') UF.settings.deck = true UF.ApplyDeck()");
  expect(shown(), "the deck holds the pair").toBe(false);
  addon.eval("local UF = ns.GetModule('UnitFrames') UF.settings.deck = false UF.ApplyDeck()");
  expect(shown(), "back without it").toBe(true);
  addon.eval('ns.SetMoverPoint("uf_target", "BOTTOM", "BOTTOM", 300, 196)');
  expect(shown(), "a moved target frame").toBe(false);
  addon.eval('ns.ResetMovers("uf_target")');
  expect(shown(), "back when it is reset").toBe(true);
  addon.eval('ns.Theme.Settings().hudLook = "plain" ns.Theme.Refresh()');
  expect(shown(), "Auto follows the look: off under Plain").toBe(false);
  addon.slash("");
  addon.eval('__click("Unit frames") __click("Keystone")');
  expect([addon.eval("return VanguardDB.profiles.Default.Keystone.show"), shown()], "the row cycles to Always, which shows it under Plain").toEqual(["on", true]);
  addon.eval('__click("Keystone")');
  expect([addon.eval("return VanguardDB.profiles.Default.Keystone.show"), shown()], "then Never").toEqual(["off", false]);
  addon.eval('__click("Keystone") ns.Theme.Settings().hudLook = "shield" ns.Theme.Refresh()');
  expect(shown(), "and round to Auto, shown again under Shield").toBe(true);
});

it("the keystone hides while the Cooldown Manager's essential row sits across it, and comes back when the row goes or moves", () => {
  const addon = loggedIn(UNITS_ENV + TOOLS_ENV + "EssentialCooldownViewer:SetSize(236, 32)", NO_RAID);
  expect([addon.eval("return EssentialCooldownViewer:IsShown()"), keystone(addon).shown], "on this tall canvas the row is placed under the frames, clear of the keystone").toEqual([true, true]);
  // The row's spot moved into the gap, where a 1080p screen (no HUD lift) has it by default: Vanguard places the row on it.
  addon.eval('ns.SetMoverPoint("cdm_essential", "BOTTOM", "BOTTOM", 0, 310)');
  expect(keystone(addon).shown, "the row across the gap: the keystone waits").toBe(false);
  addon.eval("EssentialCooldownViewer:Hide()");
  expect(keystone(addon).shown, "the row hidden: the keystone shows").toBe(true);
  addon.eval("EssentialCooldownViewer:Show()");
  expect(keystone(addon).shown, "shown again: it hides").toBe(false);
  addon.eval('ns.ResetMovers("cdm_essential")');
  expect(keystone(addon).shown, "the row back out of the way: it shows").toBe(true);
  addon.eval("local h = EssentialCooldownViewer.GetTop EssentialCooldownViewer.GetTop = function() return { __secret = true } end ns.GetModule('Keystone').Apply() EssentialCooldownViewer.GetTop = h");
  expect([keystone(addon).shown, addon.eval("return #ns.errors")], "a hidden rectangle counts as no overlap, without an error").toEqual([true, 0]);
});

it("the keystone waits for the fight to end before it changes, and is left unmade with the unit frames off", () => {
  const addon = loggedIn(UNITS_ENV, NO_RAID);
  setCombat(addon, true);
  addon.eval('ns.GetModule("Keystone").settings.show = "off" ns.GetModule("Keystone").Apply()');
  expect(keystone(addon).shown, "in a fight it stays").toBe(true);
  setCombat(addon, false);
  expect(keystone(addon).shown, "and goes when it ends").toBe(false);
  const off = loggedIn("", { savedVariables: "VanguardDB = { profiles = { Default = { modules = { UnitFrames = false, RaidFrames = false } } } }" });
  expect([off.eval("return Vanguard_Keystone ~= nil and Vanguard_Keystone:IsShown()"), off.eval("return #ns.errors")], "no frames to stand between: hidden, no error").toEqual([false, 0]);
});
