// casts: ForeverUI's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { FAKE_FADES, bars, isTok, loggedIn, setCombat, spark, unitEvents } from "./helpers.mjs";

// TEST-ONLY casts: __casts[unit] = { kind = "cast"|"channel", start, finish, shielded }.
const CAST_ENV = `
  __casts = {}
  UnitExists = function() return false end
  local function info(unit, kind)
    local c = __casts[unit]
    if not c or c.kind ~= kind then return nil end
    return "TEST-ONLY Spell", "", "TEST-ONLY-ICON", c.start, c.finish, false, c.shielded, c.shielded
  end
  UnitCastingInfo = function(unit) return info(unit, "cast") end
  UnitChannelInfo = function(unit) return info(unit, "channel") end
  PlayerCastingBarFrame = CreateFrame("StatusBar", "PlayerCastingBarFrame", UIParent)
  PlayerCastingBarFrame:RegisterEvent("UNIT_SPELLCAST_START")
`;

// A cast bar's state.
const castBar = (addon, unit) => addon.eval(`local b = ForeverUI_CastBar_${unit}
  return { shown = b:IsShown(), value = b.__value, color = b.__barColor, text = b.text:GetText(), icon = b.icon.__texture }`);

it("cast bars", () => {
  const addon = loggedIn(CAST_ENV);
  expect(castBar(addon, "player").shown === false, "no cast, no bar").toBeTruthy();
  addon.eval('__casts.player = { kind = "cast", start = 999000, finish = 1002000, shielded = false }');
  addon.fire("UNIT_SPELLCAST_START", "player");
  addon.update(0.01);
  let b = castBar(addon, "player");
  expect(b.shown && b.text === "TEST-ONLY Spell" && b.icon === "TEST-ONLY-ICON", "a cast shows its name and icon").toBeTruthy();
  expect(Math.abs(b.value - 1010 / 3000) < 1e-6 && isTok(addon, b.color, "cast"), "the bar fills with the cast, in the cast color").toBeTruthy();
  addon.update(1.49);
  expect(Math.abs(castBar(addon, "player").value - 2500 / 3000) < 1e-6, "and keeps filling").toBeTruthy();
  addon.eval('__casts.target = { kind = "channel", start = 1000000, finish = 1004000, shielded = true }');
  addon.fire("UNIT_SPELLCAST_CHANNEL_START", "target");
  addon.update(0.01);
  b = castBar(addon, "target");
  expect(isTok(addon, b.color, "shielded") && b.value > 0.5 && b.value < 0.7, "a channel empties; an uninterruptible cast is gray").toBeTruthy();
  addon.eval('__casts.focus = { kind = "cast", start = { __secret = true }, finish = { __secret = true } }');
  addon.fire("UNIT_SPELLCAST_START", "focus");
  addon.update(0.1);
  expect(castBar(addon, "focus").value === 1, "hidden timings show a full bar (name and icon still shown)").toBeTruthy();
  addon.eval("__casts.player = nil");
  addon.fire("UNIT_SPELLCAST_STOP", "player");
  expect(castBar(addon, "player").shown === false, "the bar hides when the cast ends").toBeTruthy();
  expect(addon.eval("return PlayerCastingBarFrame:IsEventRegistered('UNIT_SPELLCAST_START')") === false, "the default cast bar is silenced").toBeTruthy();
  expect(addon.eval("local out = {} for _, m in ipairs(ns.MoverList()) do out[m.key] = true end return out.cast_player and out.cast_target and out.cast_focus") === true, "all three are movable").toBeTruthy();
});

it("cast bar flashes on finish and interrupt", () => {
  const addon = loggedIn(CAST_ENV + FAKE_FADES);
  addon.eval("__fakeFader(ForeverUI_CastBar_player)");
  addon.eval('__casts.player = { kind = "cast", start = 1000, finish = 3000 }');
  addon.fire("UNIT_SPELLCAST_START", "player");
  addon.eval("__casts.player = nil");
  addon.fire("UNIT_SPELLCAST_STOP", "player");
  let b = castBar(addon, "player");
  expect(b.shown && b.value === 1 && isTok(addon, b.color, "good"), "a finished cast flashes full and green").toBeTruthy();
  addon.eval("__finishFades()");
  expect(castBar(addon, "player").shown === false, "then fades away").toBeTruthy();
  addon.eval('__casts.player = { kind = "cast", start = 1000, finish = 3000 }');
  addon.fire("UNIT_SPELLCAST_START", "player");
  addon.eval("__casts.player = nil");
  addon.fire("UNIT_SPELLCAST_INTERRUPTED", "player");
  addon.fire("UNIT_SPELLCAST_STOP", "player");
  b = castBar(addon, "player");
  expect(b.shown && isTok(addon, b.color, "bad") && b.text === "Interrupted", "an interrupted cast flashes red and says so (the STOP after it changes nothing)").toBeTruthy();
  addon.eval('__casts.player = { kind = "cast", start = 1000, finish = 3000 }');
  addon.fire("UNIT_SPELLCAST_START", "player");
  expect(isTok(addon, castBar(addon, "player").color, "cast") && castBar(addon, "player").text === "TEST-ONLY Spell", "a new cast replaces the flash at once").toBeTruthy();
});

it("a finished cast fades in 0.35 s, and in 0.15 s in combat", () => {
  const addon = loggedIn(CAST_ENV + FAKE_FADES);
  addon.eval("__fakeFader(ForeverUI_CastBar_player)");
  // Casts and finishes a spell on the player's bar; returns how long its fade was set to last.
  const finish = () => {
    addon.eval('__fades = {} __casts.player = { kind = "cast", start = 1000, finish = 3000 }');
    addon.fire("UNIT_SPELLCAST_START", "player");
    addon.eval("__casts.player = nil");
    addon.fire("UNIT_SPELLCAST_STOP", "player");
    return addon.eval("local d = __fades[1].duration __finishFades() return d");
  };
  expect(finish(), "out of combat").toBe(0.35);
  setCombat(addon, true);
  expect(finish(), "in combat the fade is cut to 0.15 s").toBe(0.15);
});

it("cast timing from the client's duration object", () => {
  const addon = loggedIn(CAST_ENV);
  addon.eval(`
    -- TEST-ONLY duration object for the player's cast.
    UnitCastingDuration = function() return { __duration = true } end
    -- TEST-ONLY bar that accepts a duration object.
    ForeverUI_CastBar_player.SetTimerDuration = function() __timer = true return true end
    -- TEST-ONLY cast the duration object is applied to.
    __casts.player = { kind = "cast", start = 1000, finish = 2000, shielded = false }
  `);
  addon.fire("UNIT_SPELLCAST_START", "player");
  expect(addon.eval("return __timer") === true, "a cast uses the client's duration object when the bar accepts one").toBeTruthy();
  expect(addon.eval('return ForeverUI_CastBar_player:GetScript("OnUpdate")') === null, "and then does not tick the bar itself").toBeTruthy();
});

it("cast bars: spark, seconds left, latency and the uninterruptible edge", () => {
  const addon = loggedIn(CAST_ENV + 'GetNetStats = function() return 0, 0, 40, 150 end');
  addon.eval('__casts.player = { kind = "cast", start = 1000 * 1000, finish = 1000 * 1000 + 3000 }');
  addon.fire("UNIT_SPELLCAST_START", "player");
  addon.eval("__wfgStub.update(1)");
  const b = addon.eval(`local b = ForeverUI_CastBar_player
    return { time = b.time:GetText(), lag = b.lag:IsShown() and b.lag.__width, width = b:GetWidth(), spark = b.spark.__points.TOP.relPoint,
      sparkTex = b.spark.__texture, blend = b.spark.__blend, sparkW = b.spark.__width }`);
  expect(b.time === "2.0", "the seconds left, at the bar's right").toBeTruthy();
  expect(b.lag === b.width * 150 / 3000, "your latency shaded at the end of your cast (world latency)").toBeTruthy();
  expect(b.spark === "TOPRIGHT" && /Textures\\Spark$/.test(b.sparkTex) && b.blend === "ADD" && b.sparkW === 8, "a soft spark (added light) rides the fill's edge").toBeTruthy();
  addon.eval('__casts.target = { kind = "cast", start = 1000 * 1000, finish = 1000 * 1000 + 3000, shielded = true }');
  addon.fire("UNIT_SPELLCAST_START", "target");
  const t = addon.eval(`local b = ForeverUI_CastBar_target local edge
    for _, w in ipairs(__wfgStub.frames) do if w.__parent == b and w.__layer == "OVERLAY" and w.__sublevel == 7 then edge = w.__vertexColor break end end
    return { lag = b.lag:IsShown(), edge = edge }`);
  expect(t.lag === false && isTok(addon, t.edge, "shielded"), "no latency on others' bars; a cast you can't interrupt gets a gray edge").toBeTruthy();
  const noStats = loggedIn(CAST_ENV + "GetNetStats = nil");
  noStats.eval('__casts.player = { kind = "cast", start = 1000 * 1000, finish = 1000 * 1000 + 3000 }');
  noStats.fire("UNIT_SPELLCAST_START", "player");
  expect(noStats.eval("return ForeverUI_CastBar_player.lag:IsShown()") === false, "no latency shade where the client can't say").toBeTruthy();
  const homeOnly = loggedIn(CAST_ENV + "GetNetStats = function() return 0, 0, 60, { __secret = true } end");
  homeOnly.eval('__casts.player = { kind = "cast", start = 1000 * 1000, finish = 1000 * 1000 + 3000 }');
  homeOnly.fire("UNIT_SPELLCAST_START", "player");
  expect(homeOnly.eval("return ForeverUI_CastBar_player.lag.__width") === homeOnly.eval("return ForeverUI_CastBar_player:GetWidth()") * 60 / 3000, "home latency when world latency is hidden").toBeTruthy();
});

it("cast bars read a cast as values and write the seconds left only when they read differently", () => {
  const addon = loggedIn(CAST_ENV + `__formats = 0
    local format = string.format
    __rawFormat = format
    -- TEST-ONLY spy: counts the "%.1f" formats (the seconds left).
    string.format = function(fmt, ...) if fmt == "%.1f" then __formats = __formats + 1 end return format(fmt, ...) end`);
  addon.eval('__casts.player = { kind = "cast", start = 1000 * 1000, finish = 1000 * 1000 + 3000, shielded = false } __casts.focus = { kind = "channel", start = 1, finish = 2, shielded = true }');
  expect(addon.eval('return { ns.GetModule("CastBars").Cast("player") }'), "a cast: name, icon, start, end, shielded, channel").toEqual(["TEST-ONLY Spell", "TEST-ONLY-ICON", 1000000, 1003000, false, false]);
  expect(addon.eval('return { ns.GetModule("CastBars").Cast("focus") }'), "a channel").toEqual(["TEST-ONLY Spell", "TEST-ONLY-ICON", 1, 2, true, true]);
  expect(addon.eval('return select("#", ns.GetModule("CastBars").Cast("target"))'), "nothing for no cast").toBe(1);
  addon.fire("UNIT_SPELLCAST_START", "player");
  const out = addon.eval(`local texts, wanted, changes = {}, {}, 0
    __formats = 0
    for i = 1, 30 do
      __wfgStub.update(0.01)
      texts[i] = ForeverUI_CastBar_player.time:GetText()
      wanted[i] = __rawFormat("%.1f", math.max(0, 1003000 - GetTime() * 1000) / 1000)
      if wanted[i] ~= wanted[i - 1] then changes = changes + 1 end
    end
    return { texts = texts, wanted = wanted, formats = __formats, changes = changes }`);
  expect(out.texts, "every frame the seconds left read as before").toEqual(out.wanted);
  expect(out.changes, "30 frames over 0.3 s cross four tenths").toBe(4);
  expect([out.formats >= 4, out.formats <= 5], "formatted once per tenth (and once more on a frame that lands on a half tenth), not 30 times").toEqual([true, true]);
  const seconds = addon.eval(`local CB, fs = ns.GetModule("CastBars"), ForeverUI_CastBar_target.time
    local out = {}
    for _, s in ipairs({ 1.31, 1.28, 1.26, 1.25, 1.24, 1.16 }) do __formats = 0 CB.ShowSeconds(fs, s) out[#out + 1] = { fs:GetText(), string.format("%.1f", s), __formats - 1 } end
    return out`);
  expect(seconds.map((s) => s[0]), "always what %.1f reads, a value on a half tenth included").toEqual(seconds.map((s) => s[1]));
  expect(seconds.map((s) => s[2]), "formatted only on a new tenth (or on a half tenth)").toEqual([1, 0, 0, 1, 1, 0]);
});

it("cast bars ask the client for their own units' casts only", () => {
  const addon = loggedIn(CAST_ENV + "__updates = {}");
  expect(unitEvents(addon, "UNIT_SPELLCAST_START"), "one subscription for you, your target and your focus; nothing takes every unit's casts").toEqual({ subs: "player,target,focus", plain: 0 });
  addon.eval(`local CB = ns.GetModule("CastBars") local update = CB.Update
    CB.Update = function(unit) __updates[#__updates + 1] = unit return update(unit) end
    __casts.nameplate7 = { kind = "cast", start = 1000, finish = 3000 }`);
  addon.fire("UNIT_SPELLCAST_START", "nameplate7");
  addon.fire("UNIT_SPELLCAST_DELAYED", "party2");
  expect(addon.eval("return #__updates"), "a nameplate's or a party member's cast never reaches the cast bars").toBe(0);
  addon.fire("UNIT_SPELLCAST_START", "focus");
  expect(addon.eval("return __updates[1]"), "the focus's does").toBe("focus");
  const some = loggedIn(CAST_ENV, { savedVariables: "ForeverUIDB.profiles = { Default = { CastBars = { player = false, focus = false } } }" });
  expect(unitEvents(some, "UNIT_SPELLCAST_STOP").subs, "only the units whose bars are on").toBe("target");
});

it("a channel the client stops with an interrupter flashes red, one it lets run out flashes green", () => {
  const addon = loggedIn(CAST_ENV + FAKE_FADES);
  addon.eval("__fakeFader(ForeverUI_CastBar_target)");
  // Channels on the target, then the client stops it (CHANNEL_STOP: unit, castGUID, spellID, interruptedBy); the bar after.
  const stop = (interruptedBy) => {
    addon.eval('__finishFades() __casts.target = { kind = "channel", start = 1000, finish = 5000 }');
    addon.fire("UNIT_SPELLCAST_CHANNEL_START", "target");
    addon.eval("__casts.target = nil");
    addon.fire("UNIT_SPELLCAST_CHANNEL_STOP", "target", "TEST-ONLY-Cast", 10, interruptedBy);
    const b = castBar(addon, "target");
    return [b.shown, isTok(addon, b.color, "bad") ? "red" : isTok(addon, b.color, "good") ? "green" : "other", b.text];
  };
  expect(stop("TEST-ONLY-Player-Kicker"), "kicked: red, and it says so").toEqual([true, "red", "Interrupted"]);
  expect(stop(addon.world.secret(1)), "an interrupter the client hides is still one").toEqual([true, "red", "Interrupted"]);
  expect(stop(null), "a channel that ran its course").toEqual([true, "green", "TEST-ONLY Spell"]);
});
