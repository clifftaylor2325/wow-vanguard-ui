// statecues: the motion kit's four cues (T.PlayCue, T.LoopCue, T.ReadyFlash) in the headless client.

import { expect, it } from "vitest";
import { ACTIONS_ENV, UNITS_ENV, loggedIn, setCombat } from "./helpers.mjs";

// TEST-ONLY animation groups on every texture a frame makes (the headless client has none): they record the
// steps (from, to, duration) and what plays, and finish on __endCues().
const CUES_ENV = `
  __played = {}
  local function fakeGroup(tex)
    local noop = function() end
    local g = setmetatable({ scripts = {}, steps = {}, playing = false, tex = tex }, { __index = function() return noop end })
    function g:SetLooping(v) self.loop = v end
    function g:SetScript(k, fn) self.scripts[k] = fn end
    function g:Stop() self.playing = false end
    function g:IsPlaying() return self.playing end
    function g:Play() self.playing = true table.insert(__played, self) end
    function g:CreateAnimation()
      local a = setmetatable({}, { __index = function() return noop end }) table.insert(g.steps, a)
      function a:SetOrder(v) self.order = v end function a:SetDuration(v) self.duration = v end
      function a:SetFromAlpha(v) self.from = v end function a:SetToAlpha(v) self.to = v end
      return a
    end
    return g
  end
  local base = __wfgStub.methods.CreateAnimationGroup
  __wfgStub.methods.CreateAnimationGroup = function(self) if self.__kind == "Texture" then return fakeGroup(self) end return base and base(self) end
  function __endCues() for _, g in ipairs(__played) do if g.playing and g.loop ~= "REPEAT" then g.playing = false g.scripts.OnFinished() end end __played = {} end
`;
const ENV = UNITS_ENV + ACTIONS_ENV + CUES_ENV;
// An array from Lua's answer: an empty table comes back as an object.
const asList = (v) => (Array.isArray(v) ? v : []);
// The cues' groups now playing, as { loop, steps, shown } (steps: the longest one and how many).
const playing = (addon) => asList(addon.eval(`local out = {}
  for _, g in ipairs(__played) do
    if g.playing then
      local longest = 0
      for _, a in ipairs(g.steps) do longest = math.max(longest, a.duration) end
      table.insert(out, { loop = g.loop, count = #g.steps, longest = longest, shown = g.tex:IsShown() })
    end
  end
  return out`));

it("state cues: a fight starting pulses the player frame's edge once, in steps within the combat fade", () => {
  const addon = loggedIn(ENV);
  addon.eval("__played = {}");
  addon.fire("PLAYER_REGEN_DISABLED");
  const cues = playing(addon);
  expect(cues.length > 0 && cues.every((c) => c.loop === "NONE" && c.count === 2 && c.longest <= 0.15 && c.shown), "one two-step pulse on the ring, none longer than 0.15 s").toBe(true);
  addon.eval("__endCues()");
  expect(addon.eval("return ns.Theme.CueRing(ns.GetModule('UnitFrames').frames.player, 'edge')[1]:IsShown()"), "and the ring is gone after it").toBe(false);
});

it("state cues: Reduce motion and the switch each turn every cue off", () => {
  const addon = loggedIn(ENV);
  for (const off of ["reduceMotion = true", "motionCues = false"]) {
    addon.eval(`ns.Theme.Settings().${off} __played = {}`);
    addon.fire("PLAYER_REGEN_DISABLED");
    expect(playing(addon).length, `${off}: no pulse`).toBe(0);
    addon.eval("ns.Theme.Settings().reduceMotion = false ns.Theme.Settings().motionCues = true");
  }
  addon.eval("ns.Theme.Settings().reduceMotion = true");
  expect(addon.eval("return ns.Theme.CuesOn()"), "the helper says so").toBe(false);
});

it("state cues: a proc's ring breathes in steps within the combat fade, stops with the proc, and stays still with Reduce motion", () => {
  const addon = loggedIn(ENV + "GetActionInfo = function(slot) if slot == 2 then return 'spell', 424242 end end");
  addon.eval("__played = {}");
  addon.fire("SPELL_ACTIVATION_OVERLAY_GLOW_SHOW", 424242);
  const cues = playing(addon);
  expect(cues.length > 0 && cues.every((c) => c.loop === "REPEAT" && c.count === 4 && c.longest <= 0.15), "a looping breath of steps no longer than 0.15 s").toBe(true);
  addon.fire("SPELL_ACTIVATION_OVERLAY_GLOW_HIDE", 424242);
  expect(playing(addon).length, "the breath stops when the proc ends").toBe(0);
  addon.eval("ns.Theme.Settings().reduceMotion = true");
  addon.fire("SPELL_ACTIVATION_OVERLAY_GLOW_SHOW", 424242);
  expect([playing(addon).length, addon.eval("return Vanguard_Bar1Button2.glow[1]:IsShown()")], "Reduce motion: the ring shows, still").toEqual([0, true]);
  const breath = addon.eval("local g = Vanguard_Bar1Button2.glow[1] return ns.Theme.CuesOn()");
  expect(breath).toBe(false);
});

it("state cues: a running breath stops at its next loop once cues go off", () => {
  const addon = loggedIn(ENV + "GetActionInfo = function(slot) if slot == 2 then return 'spell', 424242 end end");
  addon.fire("SPELL_ACTIVATION_OVERLAY_GLOW_SHOW", 424242);
  addon.eval("ns.Theme.Settings().reduceMotion = true");
  addon.eval("for _, g in ipairs(__played) do if g.scripts.OnLoop then g.scripts.OnLoop() end end");
  expect(playing(addon).length, "the loop stops").toBe(0);
  addon.eval("ns.Theme.Settings().reduceMotion = false for _, g in ipairs(__played) do g.playing = true if g.scripts.OnLoop then g.scripts.OnLoop() end end");
  expect(playing(addon).length > 0, "with cues on the loop goes on").toBe(true);
});

it("state cues: a cooldown ending flashes the button once, only after a real cooldown (never the global one)", () => {
  const addon = loggedIn(ENV + "GetActionInfo = function(slot) if slot == 2 then return 'spell', 424242 end end C_ActionBar = { GetActionCooldown = function() return __info end }");
  // Updates button 2's cooldown with the client's answer, then ends the cooldown.
  const update = (info) => addon.eval(`__info = ${info} __played = {} ns.GetModule("ActionBars").UpdateButton(Vanguard_Bar1Button2) local c = Vanguard_Bar1Button2.cooldown c:GetScript("OnCooldownDone")(c)`);
  update("{ isOnGCD = true }");
  expect(playing(addon).length, "the global cooldown: no flash").toBe(0);
  update("{ isOnGCD = { __secret = true } }");
  expect(playing(addon).length, "a hidden answer: no flash").toBe(0);
  update("{ isOnGCD = false }");
  const flash = playing(addon);
  expect(flash.length === 1 && flash[0].loop === "NONE" && flash[0].longest <= 0.15 && flash[0].shown, "a real cooldown: one short flash").toBe(true);
  update("nil");
  expect(playing(addon).length, "a client with no answer: none").toBe(0);
});

it("state cues: low health pulses the player frame's edge below the threshold, through the client's curve, and not while dead", () => {
  const addon = loggedIn(ENV);
  // The low-health ring's first piece as [shown, alpha].
  const ring = () => addon.eval("local r = ns.Theme.CueRing(ns.GetModule('UnitFrames').frames.player, 'low') local _, _, _, a = r[1]:GetVertexColor() return { r[1]:IsShown(), a }");
  // The player at v of 100 health.
  const hp = (v) => addon.world.setUnit("player", { hp: v, maxhp: 100 });
  hp(100);
  expect(ring(), "healthy: the ring is up but clear (the client's curve gives it no opacity)").toEqual([true, 0]);
  hp(20);
  const low = ring();
  expect(low[0] && low[1] === 1, "low: shown, the client's opacity from its curve").toBe(true);
  const slow = playing(addon).filter((c) => c.loop === "REPEAT" && c.count === 12 && c.longest <= 0.15);
  expect(slow.length > 0, "slow, in steps of at most 0.15 s").toBe(true);
  addon.eval("__wfgWorld.units.player.hp = __wfgWorld.secret(10)");
  addon.fire("UNIT_HEALTH", "player");
  expect(addon.eval("local r = ns.Theme.CueRing(ns.GetModule('UnitFrames').frames.player, 'low') return r[1]:IsShown()"), "with hidden health the client's curve still decides, nothing is compared").toBe(true);
  addon.world.setUnit("player", { hp: 0, maxhp: 100, dead: true });
  addon.eval("UnitIsDeadOrGhost = function() return true end");
  addon.fire("PLAYER_DEAD");
  expect([ring()[0], playing(addon).length], "dead: the ring is gone").toEqual([false, 0]);
  addon.eval("UnitIsDeadOrGhost = function() return false end ns.Theme.Settings().motionCues = false");
  hp(10);
  addon.eval("ns.Theme.Refresh()");
  expect(ring()[0], "with the switch off the ring stays hidden").toBe(false);
  setCombat(addon, false);
});

it("hunt bars: a global cooldown never flashes a button as ready, whichever comes first: its end's read or the sweep's end", () => {
  const addon = loggedIn(ENV + "GetActionInfo = function(slot) if slot == 2 then return 'spell', 424242 end end C_ActionBar = { GetActionCooldown = function() return __info end }");
  // The client's answer for button 2, read as the coalesced repaint reads it; the sweep's own end (OnCooldownDone).
  const read = (info) => addon.eval(`__info = ${info} ns.GetModule("ActionBars").UpdateButton(Vanguard_Bar1Button2)`);
  const done = () => addon.eval("__played = {} local c = Vanguard_Bar1Button2.cooldown c:GetScript('OnCooldownDone')(c)");
  const flashes = () => playing(addon).length;
  const GCD = "{ isActive = true, isOnGCD = true, startTime = 100, duration = 1.5 }";
  const REAL = "{ isActive = true, isOnGCD = false, startTime = 100, duration = 30 }";
  const IDLE = "{ isActive = false, isOnGCD = false, startTime = 0, duration = 0 }";
  read(GCD); read(IDLE); done();
  expect(flashes(), "the global cooldown, its end read before the sweep ends: no flash").toBe(0);
  read(GCD); done(); read(IDLE);
  expect(flashes(), "the sweep ending first: no flash").toBe(0);
  read(REAL); read(IDLE); done();
  expect(flashes(), "a real cooldown, its end read first: one flash").toBe(1);
  read(REAL); done();
  expect(flashes(), "a real cooldown ending before the read: one flash").toBe(1);
});
