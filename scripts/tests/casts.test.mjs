// casts: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { CLICK_LUA, FAKE_FADES, bars, isTok, loggedIn, setCombat, spark, unitEvents } from "./helpers.mjs";

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
const castBar = (addon, unit) => addon.eval(`local b = Vanguard_CastBar_${unit}
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
  addon.eval("__fakeFader(Vanguard_CastBar_player)");
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
  addon.eval("__fakeFader(Vanguard_CastBar_player)");
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
    Vanguard_CastBar_player.SetTimerDuration = function() __timer = true return true end
    -- TEST-ONLY cast the duration object is applied to.
    __casts.player = { kind = "cast", start = 1000, finish = 2000, shielded = false }
  `);
  addon.fire("UNIT_SPELLCAST_START", "player");
  expect(addon.eval("return __timer") === true, "a cast uses the client's duration object when the bar accepts one").toBeTruthy();
  expect(addon.eval('return Vanguard_CastBar_player:GetScript("OnUpdate")') === null, "and then does not tick the bar itself").toBeTruthy();
});

it("on the client's timer a channel empties and a cast fills, as without it", () => {
  const addon = loggedIn(CAST_ENV + `
    -- TEST-ONLY: the client's timer directions, duration objects, and bars that take them (noting the direction asked for).
    Enum.StatusBarTimerDirection = { ElapsedTime = 0, RemainingTime = 1 }
    UnitCastingDuration = function() return { __duration = true } end
    UnitChannelDuration = function() return { __duration = true } end
    __dirs = {}`);
  addon.eval(`for _, unit in ipairs({ "player", "target" }) do
      _G["Vanguard_CastBar_" .. unit].SetTimerDuration = function(_, _, _, dir) __dirs[unit] = dir return true end
    end`);
  addon.eval('__casts.player = { kind = "cast", start = 1000, finish = 2000 } __casts.target = { kind = "channel", start = 1000, finish = 5000 }');
  addon.fire("UNIT_SPELLCAST_START", "player");
  addon.fire("UNIT_SPELLCAST_CHANNEL_START", "target");
  expect(addon.eval("return { __dirs.player, __dirs.target }"), "a cast by the time gone (fills), a channel by the time left (empties)").toEqual([0, 1]);
});

it("cast bars: spark, seconds left, latency and the uninterruptible edge", () => {
  const addon = loggedIn(CAST_ENV + 'GetNetStats = function() return 0, 0, 40, 150 end');
  addon.eval('__casts.player = { kind = "cast", start = 1000 * 1000, finish = 1000 * 1000 + 3000 }');
  addon.fire("UNIT_SPELLCAST_START", "player");
  addon.eval("__wfgStub.update(1)");
  const b = addon.eval(`local b = Vanguard_CastBar_player
    return { time = b.time:GetText(), lag = b.lag:IsShown() and b.lag.__width, width = b:GetWidth(), spark = b.spark.__points.TOP.relPoint,
      sparkTex = b.spark.__texture, blend = b.spark.__blend, sparkW = b.spark.__width }`);
  expect(b.time === "2.0", "the seconds left, at the bar's right").toBeTruthy();
  expect(b.lag === b.width * 150 / 3000, "your latency shaded at the end of your cast (world latency)").toBeTruthy();
  expect(b.spark === "TOPRIGHT" && /Textures\\Spark$/.test(b.sparkTex) && b.blend === "ADD" && b.sparkW === 8, "a soft spark (added light) rides the fill's edge").toBeTruthy();
  addon.eval('__casts.target = { kind = "cast", start = 1000 * 1000, finish = 1000 * 1000 + 3000, shielded = true }');
  addon.fire("UNIT_SPELLCAST_START", "target");
  const t = addon.eval(`local b = Vanguard_CastBar_target local edge
    for _, w in ipairs(__wfgStub.frames) do if w.__parent == b and w.__layer == "OVERLAY" and w.__sublevel == 7 then edge = w.__vertexColor break end end
    return { lag = b.lag:IsShown(), edge = edge }`);
  expect(t.lag === false && isTok(addon, t.edge, "shielded"), "no latency on others' bars; a cast you can't interrupt gets a gray edge").toBeTruthy();
  const noStats = loggedIn(CAST_ENV + "GetNetStats = nil");
  noStats.eval('__casts.player = { kind = "cast", start = 1000 * 1000, finish = 1000 * 1000 + 3000 }');
  noStats.fire("UNIT_SPELLCAST_START", "player");
  expect(noStats.eval("return Vanguard_CastBar_player.lag:IsShown()") === false, "no latency shade where the client can't say").toBeTruthy();
  const homeOnly = loggedIn(CAST_ENV + "GetNetStats = function() return 0, 0, 60, { __secret = true } end");
  homeOnly.eval('__casts.player = { kind = "cast", start = 1000 * 1000, finish = 1000 * 1000 + 3000 }');
  homeOnly.fire("UNIT_SPELLCAST_START", "player");
  expect(homeOnly.eval("return Vanguard_CastBar_player.lag.__width") === homeOnly.eval("return Vanguard_CastBar_player:GetWidth()") * 60 / 3000, "home latency when world latency is hidden").toBeTruthy();
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
      texts[i] = Vanguard_CastBar_player.time:GetText()
      wanted[i] = __rawFormat("%.1f", math.max(0, 1003000 - GetTime() * 1000) / 1000)
      if wanted[i] ~= wanted[i - 1] then changes = changes + 1 end
    end
    return { texts = texts, wanted = wanted, formats = __formats, changes = changes }`);
  expect(out.texts, "every frame the seconds left read as before").toEqual(out.wanted);
  expect(out.changes, "30 frames over 0.3 s cross four tenths").toBe(4);
  expect([out.formats >= 4, out.formats <= 5], "formatted once per tenth (and once more on a frame that lands on a half tenth), not 30 times").toEqual([true, true]);
  const seconds = addon.eval(`local CB, fs = ns.GetModule("CastBars"), Vanguard_CastBar_target.time
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
  const some = loggedIn(CAST_ENV, { savedVariables: "VanguardDB.profiles = { Default = { CastBars = { player = false, focus = false } } }" });
  expect(unitEvents(some, "UNIT_SPELLCAST_STOP").subs, "only the units whose bars are on").toBe("target");
});

it("a channel the client stops with an interrupter flashes red, one it lets run out flashes green", () => {
  const addon = loggedIn(CAST_ENV + FAKE_FADES);
  addon.eval("__fakeFader(Vanguard_CastBar_target)");
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

// TEST-ONLY the game's overlay cast bar (CastingBarFrame.xml): its art, finish flash and text, and the
// two calls that redraw it (the fill's atlas at each cast's start and end, and the finish flash).
const OVERLAY_ENV = `
  local b = CreateFrame("StatusBar", "OverlayPlayerCastingBarFrame", UIParent)
  for _, key in ipairs({ "Border", "Background", "TextBorder", "DropShadow", "Flash" }) do b[key] = b:CreateTexture(nil, "BACKGROUND") end
  b.Text = b:CreateFontString(nil, "OVERLAY")
  b:SetStatusBarTexture("TEST-ONLY-ATLAS")
  function b:UpdateBarFillTexture(full) self:SetStatusBarTexture(full and "TEST-ONLY-FULL" or "TEST-ONLY-FILLING") self:SetStatusBarColor(1, 1, 1) end
  function b:PlayFadeAnim() end
  b:Hide()
`;

// The overlay bar as drawn: its art's alphas, fill texture and color, flash shown, text font, painted count.
const overlay = (addon) => addon.eval(`local b = OverlayPlayerCastingBarFrame
  return { art = { b.Border.__alpha, b.Background.__alpha, b.TextBorder.__alpha, b.DropShadow.__alpha }, fill = b:GetStatusBarTexture().__texture,
    color = b.__barColor, flash = b.Flash:IsShown(), font = b.Text:GetFont() == ns.Theme.Font(), shown = b:IsShown(), painted = ns.Theme.PaintedCount() }`);

it("the game's crafting cast bar stays, drawn in the theme, through every cast", () => {
  const addon = loggedIn(OVERLAY_ENV);
  addon.eval("OverlayPlayerCastingBarFrame:UpdateBarFillTexture(false) OverlayPlayerCastingBarFrame:Show()");
  const shown = overlay(addon);
  expect([shown.shown, shown.art, shown.fill, shown.font], "shown as the game shows it, art faded, the theme's bar and font").toEqual([true, [0, 0, 0, 0], addon.eval("return ns.Theme.BarTexture()"), true]);
  expect(isTok(addon, shown.color, "cast"), "in the cast color").toBe(true);
  addon.eval("local b = OverlayPlayerCastingBarFrame b:UpdateBarFillTexture(true) b.Flash:Show() b:PlayFadeAnim()");
  const done = overlay(addon);
  expect([isTok(addon, done.color, "good"), done.fill, done.flash], "a full bar goes green in the theme's bar, the game's finish flash hidden").toEqual([true, addon.eval("return ns.Theme.BarTexture()"), false]);
  addon.eval("OverlayPlayerCastingBarFrame:Hide() OverlayPlayerCastingBarFrame.Border:SetAlpha(1) OverlayPlayerCastingBarFrame:Show()");
  const again = overlay(addon);
  expect([again.art[0], again.painted], "a second show fades the art again and paints nothing more").toEqual([0, shown.painted]);
  const off = loggedIn(OVERLAY_ENV, { savedVariables: "VanguardDB.profiles = { Default = { modules = { CastBars = false } } }" });
  off.eval("OverlayPlayerCastingBarFrame:Show()");
  expect([overlay(off).fill, overlay(off).art[0]], "with cast bars off it is the game's own").toEqual(["TEST-ONLY-ATLAS", undefined]);
  const bare = loggedIn('CreateFrame("StatusBar", "OverlayPlayerCastingBarFrame", UIParent)');
  expect([bare.eval("return ns.FrameState('vgSkinned')[OverlayPlayerCastingBarFrame]"), bare.eval("return #ns.errors"), loggedIn().eval("return #ns.errors")], "a bar without its parts, or a client without the bar, loads cleanly").toEqual([true, 0, 0]);
});

// TEST-ONLY the client's duration objects for the global cooldown and your cast, and a global cooldown spell the call records.
const RING_ENV = `
  UnitCastingDuration = function() return { __duration = "cast" } end
  UnitChannelDuration = function() return { __duration = "channel" } end
  __gcdAsked = {}
  C_Spell.GetSpellCooldownDuration = function(id) __gcdAsked[#__gcdAsked + 1] = id return { __duration = "gcd" } end
`;
const RING_ON = { savedVariables: "VanguardDB.profiles = { Default = { CastBars = { ring = true } } }" };

// A table out of Lua with the keys Lua left out (nil) set to null, one level down.
const nulls = (t) => { for (const k of ["gcd", "cast"]) for (const f of ["object", "plain", "reverse"]) t[k][f] ??= null; return t; };

// The cursor ring's two sweeps: what each was given (a duration object's tag, plain start and length) and whether it runs backwards.
const ring = (addon) => nulls(addon.eval(`local r = Vanguard_CursorRing
  local function sweep(cd) return { object = cd.__durationObject and cd.__durationObject.__duration, plain = cd.__cooldown, reverse = cd.__reverse } end
  return { shown = r:IsShown(), gcd = sweep(r.gcd), cast = sweep(r.cast), x = r:GetCenter(), y = select(2, r:GetCenter()) }`));

it("the cursor ring is off by default: nothing is made and nothing follows the mouse", () => {
  const addon = loggedIn(CAST_ENV + RING_ENV);
  expect(addon.eval("return { Vanguard_CursorRing ~= nil, ns.ticker.vgJobs['cursor ring'] ~= nil, ns.GetModule('CastBars').defaults.ring }"), "no ring, no job, default false").toEqual([false, false, false]);
  addon.fire("SPELL_UPDATE_COOLDOWN");
  expect(addon.eval("return #__gcdAsked"), "and the global cooldown is not asked about").toBe(0);
});

it("the cursor ring follows the mouse at any UI scale, takes no mouse, and stops following when hidden", () => {
  const addon = loggedIn(CAST_ENV + RING_ENV, RING_ON);
  expect([ring(addon).shown, ring(addon).x, ring(addon).y], "on, centred on the cursor").toEqual([true, 960, 540]);
  expect(addon.eval("local r = Vanguard_CursorRing return { r.__mouse, r.gcd.__mouse, r.cast.__mouse }"), "the ring and its sweeps let every click through").toEqual([false, false, false]);
  addon.eval("__wfgWorld.mouse.x, __wfgWorld.mouse.y = 200, 300");
  addon.update(0.016);
  expect([ring(addon).x, ring(addon).y], "it follows on the next frame").toEqual([200, 300]);
  addon.eval("UIParent:SetScale(0.5) __wfgWorld.mouse.x, __wfgWorld.mouse.y = 100, 150");
  addon.update(0.016);
  expect([ring(addon).x, ring(addon).y], "the cursor is in screen pixels: half-size units at half scale").toEqual([200, 300]);
  addon.eval("__wfgWorld.mouse.x = { __secret = true }");
  addon.update(0.016);
  expect([ring(addon).x, ring(addon).y, addon.eval("return #ns.errors")], "a hidden cursor position leaves it where it was").toEqual([200, 300, 0]);
  addon.eval("Vanguard_CursorRing:Hide() __wfgWorld.mouse.x, __wfgWorld.mouse.y = 400, 400");
  addon.update(0.016);
  expect([ring(addon).x, ring(addon).y], "a hidden ring is not updated").toEqual([200, 300]);
});

it("the cursor ring's outer sweep is the global cooldown, from the client's duration object", () => {
  const addon = loggedIn(CAST_ENV + RING_ENV, RING_ON);
  expect([ring(addon).gcd.object, addon.eval("return __gcdAsked[1]")], "shown at once from the global cooldown spell").toEqual(["gcd", 61304]);
  addon.eval("Vanguard_CursorRing.gcd:Clear()");
  addon.fire("SPELL_UPDATE_COOLDOWN");
  expect(ring(addon).gcd.object, "and again at each cooldown update").toBe("gcd");
  expect(addon.eval("return { Vanguard_CursorRing.gcd.__hideNumbers, Vanguard_CursorRing.gcd.__swipeColor ~= nil }"), "without numbers, in the accent").toEqual([true, true]);
});

it("the cursor ring's global cooldown falls back to plain numbers, and to nothing when they are hidden", () => {
  const plain = loggedIn(CAST_ENV + RING_ENV + "C_Spell.GetSpellCooldownDuration = nil C_Spell.GetSpellCooldown = function() return { startTime = 5, duration = 1.5 } end", RING_ON);
  expect(ring(plain).gcd.plain, "no duration object: the plain start and length").toEqual([5, 1.5]);
  plain.eval("C_Spell.GetSpellCooldown = function() return { startTime = 5, duration = 0 } end");
  plain.fire("SPELL_UPDATE_COOLDOWN");
  expect(ring(plain).gcd.plain, "a zero length clears it").toBe(null);
  const thrown = loggedIn(CAST_ENV + RING_ENV + "C_Spell.GetSpellCooldownDuration = function() error('TEST-ONLY') end C_Spell.GetSpellCooldown = function() return { startTime = 7, duration = 1.5 } end", RING_ON);
  expect(ring(thrown).gcd.plain, "a duration call that errors falls back too").toEqual([7, 1.5]);
  const hidden = loggedIn(CAST_ENV + RING_ENV + "C_Spell.GetSpellCooldownDuration = nil C_Spell.GetSpellCooldown = function() return { startTime = { __secret = true }, duration = { __secret = true } } end", RING_ON);
  expect([ring(hidden).gcd.plain, ring(hidden).gcd.object], "hidden numbers draw nothing").toEqual([null, null]);
  const none = loggedIn(CAST_ENV + RING_ENV + "C_Spell.GetSpellCooldownDuration = nil C_Spell.GetSpellCooldown = nil", RING_ON);
  expect([ring(none).gcd.plain, none.eval("return #ns.errors")], "a client with neither draws nothing and raises nothing").toEqual([null, 0]);
  const secretInfo = loggedIn(CAST_ENV + RING_ENV + "C_Spell.GetSpellCooldownDuration = nil C_Spell.GetSpellCooldown = function() return { __secret = true } end", RING_ON);
  expect(ring(secretInfo).gcd.plain, "a hidden answer draws nothing").toBe(null);
});

it("the cursor ring's inner sweep is your cast, filling for a cast and emptying for a channel, even with your cast bar off", () => {
  const addon = loggedIn(CAST_ENV + RING_ENV, { savedVariables: "VanguardDB.profiles = { Default = { CastBars = { ring = true, player = false } } }" });
  expect(ring(addon).cast.object, "no cast, no sweep").toBe(null);
  addon.eval('__casts.player = { kind = "cast", start = 1000, finish = 3000 }');
  addon.fire("UNIT_SPELLCAST_START", "player");
  expect([ring(addon).cast.object, ring(addon).cast.reverse], "a cast: the client's cast duration, filling").toEqual(["cast", true]);
  addon.eval('__casts.player = { kind = "channel", start = 1000, finish = 3000 }');
  addon.fire("UNIT_SPELLCAST_CHANNEL_START", "player");
  expect([ring(addon).cast.object, ring(addon).cast.reverse], "a channel: the channel duration, emptying").toEqual(["channel", false]);
  addon.eval("__casts.player = nil");
  addon.fire("UNIT_SPELLCAST_STOP", "player");
  expect(ring(addon).cast.object, "it clears when the cast ends").toBe(null);
  addon.eval('__casts.target = { kind = "cast", start = 1000, finish = 3000 }');
  addon.fire("UNIT_SPELLCAST_START", "target");
  expect(ring(addon).cast.object, "someone else's cast is not yours").toBe(null);
});

it("the cursor ring's cast falls back to plain times, and to nothing when they are hidden", () => {
  const plain = loggedIn(CAST_ENV + RING_ENV + "UnitCastingDuration = nil", RING_ON);
  plain.eval('__casts.player = { kind = "cast", start = 1000 * 1000, finish = 1000 * 1000 + 3000 }');
  plain.fire("UNIT_SPELLCAST_START", "player");
  expect(ring(plain).cast.plain, "no duration object: start and length in seconds").toEqual([1000, 3]);
  plain.eval('__casts.player = { kind = "cast", start = { __secret = true }, finish = { __secret = true } }');
  plain.fire("UNIT_SPELLCAST_DELAYED", "player");
  expect(ring(plain).cast.plain, "hidden times draw nothing").toBe(null);
  plain.eval('__casts.player = { kind = "cast", start = 1000 * 1000, finish = { __secret = true } }');
  plain.fire("UNIT_SPELLCAST_DELAYED", "player");
  expect(ring(plain).cast.plain, "a hidden end draws nothing either").toBe(null);
});

it("a client that cannot make cooldown frames gets no ring, and no error when the switch is on", () => {
  const addon = loggedIn(CAST_ENV + RING_ENV + "ns.Client.Has('cooldownObject') ns.Client.has.cooldownObject = false", RING_ON);
  expect(addon.eval("return { Vanguard_CursorRing == nil, ns.ticker.vgJobs['cursor ring'] == nil, #ns.errors }"), "no ring, nothing following the mouse, nothing failed").toEqual([true, true, 0]);
});

it("the cursor ring's switch under Unit frames turns it on and off at once", () => {
  const addon = loggedIn(CAST_ENV + RING_ENV + CLICK_LUA);
  addon.eval('ns.Options.Show("unitframes")');
  addon.eval('__click("Ring at the cursor: the global cooldown and your cast")');
  expect([addon.eval("return VanguardDB.profiles.Default.CastBars.ring"), ring(addon).shown, ring(addon).gcd.object, addon.eval("return ns.ticker.vgJobs['cursor ring'] ~= nil")], "on: shown, sweeping, following").toEqual([true, true, "gcd", true]);
  addon.eval('__click("Ring at the cursor: the global cooldown and your cast")');
  addon.eval("Vanguard_CursorRing.gcd:Clear()");
  addon.fire("SPELL_UPDATE_COOLDOWN");
  addon.eval('__casts.player = { kind = "cast", start = 1000, finish = 3000 }');
  addon.fire("UNIT_SPELLCAST_START", "player");
  expect([ring(addon).shown, ring(addon).gcd.object, ring(addon).cast.object, addon.eval("return ns.ticker.vgJobs['cursor ring']")], "off: hidden, not following, deaf to events").toEqual([false, null, null, null]);
  addon.eval('__click("Ring at the cursor: the global cooldown and your cast")');
  expect([ring(addon).shown, ring(addon).cast.object, addon.eval("return #ns.errors")], "on again, with the cast in progress, using the same ring").toEqual([true, "cast", 0]);
});

// TEST-ONLY a mage who knows Counterspell, and the client's duration object for its cooldown (tagged with the call it answered).
const MARK_ENV = `
  __asked = {}
  C_Spell.GetSpellCooldownDuration = function(id, ignoreGCD) __asked[#__asked + 1] = { id, ignoreGCD } return { __duration = "tag" .. id } end
`;
// Lua that puts a spell in the spellbook, so IsPlayerSpell knows it.
const KNOWS = (id) => `__wfgWorld.learn(${id}, { name = "TEST-ONLY Interrupt" })`;

// A cast bar's interrupt mark: shown, opacity (or the hidden flag it follows), what its sweep was given.
const mark = (addon, unit) => addon.eval(`local m = Vanguard_CastBar_${unit}.mark
  local cd = m.cd
  return { shown = m:IsShown(), alpha = m:GetAlpha(), follows = m.__alphaFromBoolean ~= nil, object = cd.__durationObject and cd.__durationObject.__duration or false,
    plain = cd.__cooldown or false, parts = select("#", m:GetRegions()) }`);

it("the interrupt mark: a diamond beside the target's and focus's cast bar while the cast can be interrupted and you know an interrupt", () => {
  const addon = loggedIn(CAST_ENV + MARK_ENV);
  addon.eval(KNOWS(2139));
  expect(addon.eval("return { Vanguard_CastBar_player.mark == nil, Vanguard_CastBar_target.mark ~= nil, Vanguard_CastBar_focus.mark ~= nil }"), "the target and the focus have one, you do not").toEqual([true, true, true]);
  expect(mark(addon, "target").shown, "no cast, nothing shown").toBe(false);
  addon.eval('__casts.target = { kind = "cast", start = 1000, finish = 3000, shielded = false }');
  addon.fire("UNIT_SPELLCAST_START", "target");
  const ready = mark(addon, "target");
  expect([ready.shown, ready.alpha, ready.object, ready.parts], "an interruptible cast: the mark, lit, with Counterspell's duration object on its sweep, two diamonds").toEqual([true, 1, "tag2139", 2]);
  expect(addon.eval("return __asked[1]"), "asked for Counterspell with the global cooldown left out").toEqual([2139, true]);
  addon.eval('__casts.focus = { kind = "channel", start = 1000, finish = 5000, shielded = false }');
  addon.fire("UNIT_SPELLCAST_CHANNEL_START", "focus");
  expect(mark(addon, "focus").shown, "a channel on the focus too").toBe(true);
  addon.eval('__casts.target = { kind = "cast", start = 1000, finish = 3000, shielded = true }');
  addon.fire("UNIT_SPELLCAST_NOT_INTERRUPTIBLE", "target");
  expect([mark(addon, "target").shown, mark(addon, "target").alpha], "a cast that cannot be interrupted: no mark").toEqual([true, 0]);
  addon.eval('__casts.target = { kind = "cast", start = 1000, finish = 3000, shielded = { __secret = true } }');
  addon.fire("UNIT_SPELLCAST_START", "target");
  expect([mark(addon, "target").follows, addon.eval("return issecretvalue(Vanguard_CastBar_target.mark.__alphaFromBoolean)")], "a hidden answer goes to the mark's opacity as it is").toEqual([true, true]);
});

it("the interrupt mark follows your interrupt's cooldown, only while a cast shows", () => {
  const addon = loggedIn(CAST_ENV + MARK_ENV);
  addon.eval(KNOWS(2139));
  addon.eval("__asked = {}");
  addon.fire("SPELL_UPDATE_COOLDOWN");
  expect(addon.eval("return #__asked"), "no cast showing, nothing asked").toBe(0);
  addon.eval('__casts.target = { kind = "cast", start = 1000, finish = 3000, shielded = false }');
  addon.fire("UNIT_SPELLCAST_START", "target");
  addon.eval('C_Spell.GetSpellCooldownDuration = function(id) return { __duration = "recovering" } end');
  addon.fire("SPELL_UPDATE_COOLDOWN");
  expect(mark(addon, "target").object, "a cooldown update gives the sweep the new object").toBe("recovering");
  addon.eval("__casts.target = nil");
  addon.fire("UNIT_SPELLCAST_STOP", "target");
  expect(mark(addon, "target").shown, "the flash at a cast's end takes the mark away at once").toBe(false);
});

it("the interrupt mark: which interrupt, by class and rank", () => {
  const addon = loggedIn(CAST_ENV + MARK_ENV);
  // The interrupt a class that has learned these spells would use (false for none).
  const pick = (class_, learn) => {
    addon.eval(`__wfgWorld.book = {} UnitClass = function() return "X", "${class_}", 1 end ${learn.map(KNOWS).join(" ")}`);
    return addon.eval('return ns.GetModule("CastBars").InterruptSpell() or false');
  };
  expect(pick("ROGUE", [1766, 1767]), "a rogue's best Kick rank").toBe(1767);
  expect(pick("WARRIOR", [72]), "a warrior with only Shield Bash").toBe(72);
  expect(pick("WARRIOR", [72, 6552]), "Pummel before Shield Bash").toBe(6552);
  expect(pick("SHAMAN", [8042, 8044, 10412]), "a shaman's best Earth Shock").toBe(10412);
  expect(pick("PRIEST", [15487]), "a priest's Silence").toBe(15487);
  expect(pick("MAGE", [2139]), "a mage's Counterspell").toBe(2139);
  expect(pick("MAGE", []), "an interrupt you have not learned").toBe(false);
  expect(pick("DRUID", [2139]), "a class with none").toBe(false);
  addon.eval("IsPlayerSpell = nil C_SpellBook.IsSpellKnown = nil");
  expect(addon.eval('return ns.GetModule("CastBars").InterruptSpell() or false'), "a client that cannot say what you know").toBe(false);
});

it("the interrupt mark asks C_SpellBook what you know, so it shows without the game's deprecation fallbacks", () => {
  // As Forever with loadDeprecationFallbacks off: no IsPlayerSpell global, C_SpellBook.IsSpellKnown still there.
  const addon = loggedIn(CAST_ENV + MARK_ENV + "IsPlayerSpell = nil");
  addon.eval(KNOWS(2139));
  addon.eval('__casts.target = { kind = "cast", start = 1000, finish = 3000, shielded = false }');
  addon.fire("UNIT_SPELLCAST_START", "target");
  expect([addon.eval('return ns.GetModule("CastBars").InterruptSpell() or false'), mark(addon, "target").shown], "Counterspell, and the mark beside the cast").toEqual([2139, true]);
});

it("the interrupt mark still works on a client with only the older IsPlayerSpell", () => {
  const addon = loggedIn(CAST_ENV + MARK_ENV + "C_SpellBook.IsSpellKnown = nil");
  addon.eval(KNOWS(2139));
  expect(addon.eval('return ns.GetModule("CastBars").InterruptSpell() or false'), "Counterspell, from IsPlayerSpell").toBe(2139);
});

it("the interrupt mark is not shown without an interrupt, with the switch off, or when the client hides the cooldown", () => {
  const none = loggedIn(CAST_ENV + MARK_ENV);
  none.eval('__casts.target = { kind = "cast", start = 1000, finish = 3000, shielded = false }');
  none.fire("UNIT_SPELLCAST_START", "target");
  expect(mark(none, "target").shown, "you know no interrupt").toBe(false);
  const off = loggedIn(CAST_ENV + MARK_ENV + KNOWS(2139), { savedVariables: "VanguardDB.profiles = { Default = { CastBars = { interruptMark = false } } }" });
  off.eval('__casts.target = { kind = "cast", start = 1000, finish = 3000, shielded = false }');
  off.fire("UNIT_SPELLCAST_START", "target");
  expect(mark(off, "target").shown, "the switch is off").toBe(false);
  const noApi = loggedIn(CAST_ENV + MARK_ENV + KNOWS(2139) + "C_Spell.GetSpellCooldownDuration = nil");
  noApi.eval('__casts.target = { kind = "cast", start = 1000, finish = 3000, shielded = false }');
  noApi.fire("UNIT_SPELLCAST_START", "target");
  expect([mark(noApi, "target").shown, noApi.eval("return #ns.errors")], "no duration object and no plain numbers: no mark, no error").toEqual([false, 0]);
});

it("a client that cannot make cooldown frames still gets its cast bars, without the mark", () => {
  const addon = loggedIn(CAST_ENV + MARK_ENV + KNOWS(2139) + "ns.Client.Has('cooldownObject') ns.Client.has.cooldownObject = false");
  addon.eval('__casts.target = { kind = "cast", start = 1000, finish = 3000, shielded = false }');
  addon.fire("UNIT_SPELLCAST_START", "target");
  expect(addon.eval("return { Vanguard_CastBar_target:IsShown(), Vanguard_CastBar_target.mark == nil, #ns.errors }"), "the bar shows, there is no mark and nothing failed").toEqual([true, true, 0]);
});

it("the interrupt mark's plain fallback reads the cooldown only when it is readable", () => {
  const cast = '__casts.target = { kind = "cast", start = 1000, finish = 3000, shielded = false }';
  // The mark for a target cast when the client answers a spell's cooldown with this Lua value.
  const run = (cooldown) => {
    const addon = loggedIn(CAST_ENV + MARK_ENV + KNOWS(2139) + `C_Spell.GetSpellCooldownDuration = nil C_Spell.GetSpellCooldown = function() return ${cooldown} end`);
    addon.eval(cast);
    addon.fire("UNIT_SPELLCAST_START", "target");
    return mark(addon, "target");
  };
  const recovering = run("{ startTime = 5, duration = 8 }");
  expect([recovering.shown, recovering.plain], "a readable cooldown goes to the sweep").toEqual([true, [5, 8]]);
  expect([run("{ startTime = 5, duration = 8, isOnGCD = true }").shown, run("{ startTime = 5, duration = 8, isOnGCD = true }").plain], "the global cooldown is not your interrupt's").toEqual([true, false]);
  expect([run("{ startTime = 0, duration = 0 }").shown, run("{ startTime = 0, duration = 0 }").plain], "ready: lit, no sweep").toEqual([true, false]);
  expect(run("{ startTime = { __secret = true }, duration = { __secret = true } }").shown, "hidden numbers: no mark").toBe(false);
  expect(run("{ __secret = true }").shown, "a hidden answer: no mark").toBe(false);
  expect(run("nil").shown, "no answer: no mark").toBe(false);
  const thrown = loggedIn(CAST_ENV + MARK_ENV + KNOWS(2139) + "C_Spell.GetSpellCooldownDuration = function() error('TEST-ONLY') end C_Spell.GetSpellCooldown = function() return { startTime = 7, duration = 4 } end");
  thrown.eval(cast);
  thrown.fire("UNIT_SPELLCAST_START", "target");
  expect([mark(thrown, "target").shown, mark(thrown, "target").plain], "a duration call that errors falls back to the plain numbers").toEqual([true, [7, 4]]);
});

it("the interrupt mark's switch under Unit frames applies at once", () => {
  const addon = loggedIn(CAST_ENV + MARK_ENV + CLICK_LUA + KNOWS(2139));
  addon.eval('__casts.target = { kind = "cast", start = 1000, finish = 3000, shielded = false }');
  addon.fire("UNIT_SPELLCAST_START", "target");
  expect(mark(addon, "target").shown, "on by default").toBe(true);
  addon.eval('ns.Options.Show("unitframes") __click("Interrupt mark beside the target and focus cast bars")');
  expect([addon.eval("return VanguardDB.profiles.Default.CastBars.interruptMark"), mark(addon, "target").shown], "unticked: gone from the cast on screen").toEqual([false, false]);
  addon.eval('__click("Interrupt mark beside the target and focus cast bars")');
  expect(mark(addon, "target").shown, "ticked: back").toBe(true);
});

// Your cast bar's saved-free spot and the top of the action bars' bottom stack, in UI units up from the bottom (TEST-ONLY reads).
const castSpot = (addon) => addon.eval(`local b, top = Vanguard_CastBar_player, 0
  for n = 1, 8 do local bar = _G["Vanguard_Bar" .. n] if bar and bar:IsShown() and bar:GetTop() then top = math.max(top, bar:GetTop()) end end
  return { bottom = b:GetBottom(), top = top, strata = b.__strata }`);

it("your cast bar sits above the action bars and moves up when they grow, so they never hide it", () => {
  // On a 768-tall screen one UI unit is one screen pixel, so the bars' rounded heights give the whole numbers below.
  const addon = loggedIn("__wfgStub.setScreen(1366, 768)");
  const start = castSpot(addon);
  expect([Math.round(start.bottom), start.strata], "over the default three bars (no gap between them): 4 over bar 1, drawn over the bars").toEqual([142, "HIGH"]);
  expect(Math.round(start.bottom - start.top), "about 4 above the top bar (the bars snap to whole pixels)").toBe(4);
  addon.eval('local AB = ns.GetModule("ActionBars") AB.settings.bars[1].perRow = 6 AB.Layout(1)');
  const grown = castSpot(addon);
  expect([Math.round(grown.bottom - grown.top), Math.round(grown.bottom)], "a second row on bar 1: it moves up with the stack").toEqual([4, 182]);
  addon.eval('ns.Settings("positions").cast_player = { point = "BOTTOM", relPoint = "BOTTOM", x = 0, y = 400 } local AB = ns.GetModule("ActionBars") AB.settings.bars[1].perRow = 12 AB.Layout(1)');
  expect(Math.round(castSpot(addon).bottom), "a spot you dragged it to wins").toBe(400);
  const off = loggedIn("", { savedVariables: "VanguardDB.profiles = { Default = { modules = { ActionBars = false } } }" });
  expect(off.eval("return Vanguard_CastBar_player:GetBottom()"), "with Vanguard's action bars off: its layout spot").toBeCloseTo(146, 3);
});
