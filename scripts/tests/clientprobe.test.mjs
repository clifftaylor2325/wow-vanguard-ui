// clientprobe: Vanguard's real Lua in the TEST-ONLY headless client (scripts/lib/lua-harness.mjs).

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { luaValue } from "../lib/lua-emit.mjs";
import { ACTIONS_ENV, AFK_ENV, AURA_FALLBACK, CLICK_LUA, ENGINE_ENV, QUEST_ENV, RAID_ENV, SETUP_DONE, TOTEMS_ENV, UNITS_ENV, chatHas, expectErrors, key, loggedIn, setCombat, totemCell } from "./helpers.mjs";

// The next session of an addon: the client writes SavedVariables at logout and
// loads them back before ADDON_LOADED; extra Lua runs before login.
function nextSession(addon, extra = "") {
  addon.fire("PLAYER_LOGOUT");
  const sv = addon.savedVariables();
  const next = createAddon({ savedVariables: `VanguardDB = ${luaValue(sv.account)}\nVanguardCharDB = ${luaValue(sv.char)}\n` });
  if (extra) next.eval(extra);
  next.login();
  return next;
}
it("a session: what you set in one login comes back in the next", () => {
  const staged = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA);
  staged.slash("profile TEST-ONLY Alt");
  // The switch applies at the next load, so the settings below are made on that profile.
  const first = nextSession(staged, UNITS_ENV + RAID_ENV + CLICK_LUA);
  first.slash("accent arcane");
  first.slash("disable Minimap");
  first.eval('ns.Settings("UnitFrames").healthFormat = "percent" ns.Settings("RaidFrames").look = "dark"');
  first.eval('ns.SetMoverPoint("uf_player", "TOPLEFT", "TOPLEFT", 40, -60)');
  const next = nextSession(first, UNITS_ENV + RAID_ENV + CLICK_LUA);
  expect(next.eval("return ns.ProfileName()"), "the character is still on its profile").toBe("TEST-ONLY Alt");
  expect(next.eval("return select(1, ns.Theme.Accent()) == ns.Theme.PRESETS.arcane[1]"), "the accent is kept").toBe(true);
  expect(next.eval("return ns.ModuleEnabled('Minimap')"), "a module turned off stays off").toBe(false);
  expect(next.eval('return { ns.Settings("UnitFrames").healthFormat, ns.Settings("RaidFrames").look }'), "module settings are kept").toEqual(["percent", "dark"]);
  expect(next.eval('return { ns.MoverPoint("uf_player") }'), "a moved frame stays where you put it").toEqual(["TOPLEFT", "TOPLEFT", 40, -60]);
  expect(next.eval("return Vanguard_Setup == nil or not Vanguard_Setup:IsShown()"), "setup doesn't come back").toBe(true);
  const third = nextSession(next, UNITS_ENV + RAID_ENV + CLICK_LUA);
  expect(third.eval("return ns.ProfileName()"), "and it holds for a third session").toBe("TEST-ONLY Alt");
});
const CLIENT_KEYS = ["auraContainer", "pixelUtil", "eventValid", "barEase", "cooldownObject", "cooldownMin", "countdownText", "keyPropagate", "damageMeter", "cooldownViewer", "swingTimer", "meterEnums"];
// TEST-ONLY: a client whose Enum lacks the four tables the capability probe asks about (the rest of the stub's Enum stays, as on the client).
const NO_PROBE_ENUMS = "Enum.StatusBarInterpolation, Enum.PlayerSwingType, Enum.DamageMeterSessionType, Enum.DamageMeterType = nil, nil, nil, nil ";
// TEST-ONLY: a client that has every optional call the probe asks about.
const CLIENT_FULL_ENV = `
  Enum.StatusBarInterpolation.ExponentialEaseOut = 1
  Enum.DamageMeterSessionType, Enum.DamageMeterType = { Current = 1 }, { Dps = 1 }
  PixelUtil = { GetNearestPixelSize = function() return 1 end }
  C_EventUtils = { IsEventValid = function() return true end }
  C_DamageMeter = { GetCombatSessionFromType = function() end }
  C_CooldownViewer = { IsCooldownViewerAvailable = function() return true end }
  C_SwingTimer = {}
`;
it("client capability probe: what this client has, and /vg status says so", () => {
  expectErrors("aura icon: eval:3: TEST-ONLY: no cooldown frames", "module PlayerAuras: eval:3: TEST-ONLY: no cooldown frames", "module ActionBars: eval:3: TEST-ONLY: no cooldown frames");
  const full = loggedIn(UNITS_ENV + CLIENT_FULL_ENV);
  expect(full.eval("return ns.Client.has"), "a client with everything: every flag is true").toEqual({ ...Object.fromEntries(CLIENT_KEYS.map((k) => [k, true])), secureSnippets: true });
  full.slash("status");
  expect(chatHas(full, /Client has: auraContainer, pixelUtil, eventValid, barEase, cooldownObject, cooldownMin, countdownText, keyPropagate, damageMeter, cooldownViewer, swingTimer, meterEnums {2}· {2}lacks: none/), "/vg status lists them in a fixed order").toBe(true);
  const bare = loggedIn();
  expect(bare.eval("return ns.Client.has"), "the default test world: its namespaces are found, the widget flags come from the widget list, what it lacks is false").toEqual({
    auraContainer: true, pixelUtil: false, eventValid: true, barEase: false, cooldownObject: true, cooldownMin: true, countdownText: true,
    keyPropagate: true, damageMeter: true, cooldownViewer: true, swingTimer: true, meterEnums: false, secureSnippets: true });
  bare.slash("status");
  expect(chatHas(bare, /Client has: auraContainer, eventValid, cooldownObject, cooldownMin, countdownText, keyPropagate, damageMeter, cooldownViewer, swingTimer {2}· {2}lacks: pixelUtil, barEase, meterEnums$/), "and the lacking ones are named").toBe(true);
  const noCooldown = loggedIn(`local real = CreateFrame
    CreateFrame = function(kind, ...) if kind == "Cooldown" then error("TEST-ONLY: no cooldown frames") end return real(kind, ...) end
    __wfgStub.transparent[CreateFrame] = true`);
  expect(noCooldown.eval("return { ns.Client.has.cooldownObject, ns.Client.has.cooldownMin, ns.Client.has.countdownText, ns.Client.has.keyPropagate }"), "a client that cannot make a Cooldown frame has none of its methods, and the probe does not fail").toEqual([false, false, false, true]);
  // [barEase, meterEnums, swingTimer] on a client with this Lua defined.
  const half = (lua) => loggedIn(NO_PROBE_ENUMS + lua).eval("return { ns.Client.has.barEase, ns.Client.has.meterEnums, ns.Client.has.swingTimer }");
  expect(half("Enum.StatusBarInterpolation, Enum.DamageMeterSessionType, Enum.DamageMeterType = {}, {}, { Dps = 1 }"), "enums without the values asked for do not count").toEqual([false, false, false]);
  expect(half("Enum.DamageMeterSessionType, Enum.DamageMeterType = { Current = 1 }, {}"), "the damage meter needs both enum values").toEqual([false, false, false]);
  expect(half("Enum.StatusBarInterpolation = { ExponentialEaseOut = 1 } C_SwingTimer = {}"), "the swing timer needs its enum as well").toEqual([true, false, false]);
});
// TEST-ONLY: a client with none of them: no aura container, no cooldown calls, no key propagation.
const CLIENT_NONE_ENV = `
  __wfgStub.noAuraContainer = true
  for _, m in ipairs({ "SetCooldownFromDurationObject", "SetMinimumCountdownDuration", "GetCountdownFontString" }) do __wfgWidgetApi.methods.Cooldown[m] = nil end
  for _, kind in pairs(__wfgWidgetApi.methods) do kind.SetPropagateKeyboardInput = nil end
  C_EventUtils, C_DamageMeter, C_CooldownViewer, C_SwingTimer = nil, nil, nil, nil
`;
it("client capability probe: every flag off, every module still enables", () => {
  expectErrors(AURA_FALLBACK);
  const addon = loggedIn(UNITS_ENV + ACTIONS_ENV + TOTEMS_ENV + ENGINE_ENV + CLIENT_NONE_ENV);
  expect(addon.eval("return ns.Client.has"), "a client with none of the optional calls").toEqual({ ...Object.fromEntries(CLIENT_KEYS.map((k) => [k, false])), secureSnippets: true });
  // The modules that are on in the settings but did not enable, on a client with and without the calls.
  const notEnabled = (a) => a.eval(`local out = {} for _, n in ipairs(ns.ModuleNames()) do
    local d = ns.GetModule(n) if d.Enable and ns.ModuleEnabled(n) and d.enabled ~= true then out[#out + 1] = n end end return out`);
  const baseline = loggedIn(UNITS_ENV + ACTIONS_ENV + TOTEMS_ENV + ENGINE_ENV);
  expect(notEnabled(addon), "every module enables as it does on a client with the calls").toEqual(notEnabled(baseline));
  expect(addon.eval("return Vanguard_Bar1Button1.cooldown.__countdown == nil"), "an action button asks for no cooldown number font").toBe(true);
  expect(totemCell(addon, 1), "a totem is timed by its start and length").toMatchObject({ sweep: [100, 120] });
  expect(totemCell(addon, 1).object, "and is given no duration object").toBeUndefined();
  expect(addon.eval(`local b = CreateFrame("StatusBar") ns.Theme.Settings().smoothBars = true ns.Theme.SetBarValue(b, 5) return { v = b:GetValue(), ease = b.__ease or "none" }`), "a bar is set without easing").toEqual({ v: 5, ease: "none" });
  // The texts of the errors an addon has caught.
  // An empty Lua table comes back as {} in the headless client, so read the values either way.
  const errs = (a) => Object.values(a.eval("local o = {} for _, e in ipairs(ns.errors) do o[#o + 1] = e.text end return o"));
  expect(errs(addon).filter((e) => !errs(baseline).includes(e)), "the missing aura container is the one thing reported more").toEqual([expect.stringMatching(/^aura containers \(using Vanguard's own icons\): .*unknown frame type AuraContainer$/)]);
  expect(addon.eval(`local h
    UIParent:SetSize(1920, 1080)
    local f = CreateFrame("Frame", nil, UIParent) f:SetSize(100, 20)
    ns.Mover(f, "a", "A", { "CENTER", "CENTER", 0, 0 }) ns.Unlock()
    for _, w in ipairs(__wfgStub.frames) do if w.mover and w.mover.key == "a" then h = w end end
    h:GetScript("OnMouseDown")(h) h:GetScript("OnKeyDown")(h, "UP")
    local p = VanguardDB.profiles.Default.positions.a
    return p and p.y`), "unlock mode: the arrow keys still nudge").toBe(1);
  const quest = loggedIn(QUEST_ENV + CLIENT_NONE_ENV);
  key(quest, "ESCAPE");
  expect(quest.eval("return ns.ModuleEnabled('QuestDialogView') and Vanguard_QuestDialog ~= nil"), "the quest dialog takes keys without propagation").toBe(true);
  const afk = loggedIn(UNITS_ENV + AFK_ENV + CLIENT_NONE_ENV);
  afk.eval("Vanguard_AfkScreen.__scripts.OnKeyDown(Vanguard_AfkScreen, 'ENTER')");
  expect(afk.eval("return Vanguard_AfkScreen ~= nil and ns.GetModule('AfkScreen').enabled"), "the away screen is built and put away by a key").toBe(true);
});
it("client capability probe: in a fight the aura container waits; first use probes early", () => {
  const combat = createAddon({ savedVariables: SETUP_DONE });
  combat.eval(UNITS_ENV);
  setCombat(combat, true);
  combat.login();
  expect([combat.eval("return ns.Client.has.auraContainer"), combat.eval("return ns.Client.has.cooldownMin"), combat.eval("return ns.Client.probed")], "logged in during a fight: the plain frames are probed, the aura container waits").toEqual([null, true, true]);
  expect(combat.eval("return ns.Client.Has('auraContainer')"), "a flag still waiting reads as false").toBe(false);
  combat.slash("status");
  expect(chatHas(combat, /lacks: auraContainer\?/), "and /vg status marks it as not yet known").toBe(true);
  setCombat(combat, false);
  expect(combat.eval("return ns.Client.has.auraContainer"), "after the fight it is asked").toBe(true);
  const early = createAddon({ savedVariables: SETUP_DONE });
  expect(early.eval("return ns.Client.Has('cooldownMin')"), "a call before ADDON_LOADED probes right then").toBe(true);
  early.eval("ns.Client.has.cooldownMin = 'TEST-ONLY-kept'");
  early.login();
  expect(early.eval("return ns.Client.has.cooldownMin"), "and the probe is not run again").toBe("TEST-ONLY-kept");
});
// How many lines of chat mention secure snippets (or the probe's own error report, "secure snippet probe: ...").
const snippetLines = (addon) => addon.chat().filter((l) => /secure snippet/.test(l)).length;
it("secure snippets: a client that compiles them keeps hover keys and says so in /vg status", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + "GetSpecialization = function() return 1 end");
  expect(addon.eval("return ns.Client.has.secureSnippets"), "the stub runs the probe's snippet, so the flag is true").toBe(true);
  expect(addon.eval('return Vanguard_SnippetProbe:GetAttribute("vgprobe")'), "the probe frame got the attribute the snippet wrote").toBe("ok");
  expect(snippetLines(addon), "nothing is said at login").toBe(0);
  addon.eval('ns.GetModule("ClickCast").Add("SHIFT-1", "spell", "TEST-ONLY Flash Heal") __spawn(1, "raid1")');
  expect(addon.eval("return Vanguard_RaidUnitButton1.__wraps.OnEnter"), "hover keys are wrapped").toMatch(/SetBindingClick\(true, "SHIFT-1", self, "vg1"\)/);
  addon.slash("status");
  expect(chatHas(addon, /secure snippets: yes/), "/vg status says yes").toBe(true);
});
// The caught errors that came from the snippet probe.
const probeErrors = (addon) => addon.eval(`local o = {} for _, e in ipairs(ns.errors) do
  if e.text:find("secure snippet probe", 1, true) then o[#o + 1] = e.text end end o.n = #o return o`);
it("secure snippets: a client whose snippets fail to compile turns hover keys off, once, and keeps mouse bindings", () => {
  const addon = loggedIn(UNITS_ENV + RAID_ENV + CLICK_LUA + `GetSpecialization = function() return 1 end
    SecureHandlerExecute = function() error("TEST-ONLY: snippets do not compile") end
    __wraps = 0 local w = SecureHandlerWrapScript SecureHandlerWrapScript = function(...) __wraps = __wraps + 1 return w(...) end`);
  expect(addon.eval("return ns.Client.has.secureSnippets"), "the probe answers no").toBe(false);
  expect(snippetLines(addon), "one chat line at login").toBe(1);
  expect(addon.chat().find((l) => /secure snippets/.test(l)), "it carries the probe's error in the same line").toMatch(/\(probe: .*TEST-ONLY: snippets do not compile\)$/);
  expect(addon.chat().find((l) => /secure snippets/.test(l)), "it names the consequence").toMatch(/hover keys are off; bar 1 pages and the raid frames are set up without them/);
  addon.eval('local CC = ns.GetModule("ClickCast") CC.Add("ctrl-BUTTON2", "spell", "TEST-ONLY Renew") CC.Add("SHIFT-1", "spell", "TEST-ONLY Flash Heal") __spawn(1, "raid1")');
  expect(addon.eval('return Vanguard_RaidUnitButton1:GetAttribute("ctrl-type2")'), "mouse bindings are still set").toBe("spell");
  expect(addon.eval('return Vanguard_RaidUnitButton1:GetAttribute("*type-vg2")'), "and so is the inert virtual button").toBe("spell");
  expect(addon.eval("return __wraps"), "no SecureHandlerWrapScript call").toBe(0);
  expect(addon.eval("return Vanguard_RaidUnitButton1.vgWrapped"), "the frame is not marked wrapped").toBe(null);
  expect(addon.eval("return ns.Client.ProbeSnippets()"), "asking again answers the same").toBe(false);
  expect(snippetLines(addon), "and does not warn again").toBe(1);
  expect(probeErrors(addon).n, "the error is in the one warning, not reported to chat a second time").toBe(0);
  addon.slash("status");
  expect(chatHas(addon, /secure snippets: no \(hover keys off\)/), "/vg status says no, and what it costs").toBe(true);
});
it("secure snippets: a snippet that runs but writes nothing, and a client without the handler API, count as no", () => {
  const silent = loggedIn("SecureHandlerExecute = function() end");
  expect(silent.eval("return ns.Client.has.secureSnippets"), "no attribute came back").toBe(false);
  expect(chatHas(silent, /can't run secure snippets/), "so it says so").toBe(true);
  expect(probeErrors(silent).n, "without an error entry: nothing threw").toBe(0);
  const missing = loggedIn("SecureHandlerExecute = nil");
  expect(missing.eval("return ns.Client.has.secureSnippets"), "no API, no snippets").toBe(false);
  expect(missing.eval("return Vanguard_SnippetProbe"), "and no probe frame was made").toBe(null);
  expect(snippetLines(missing), "one warning").toBe(1);
});
it("secure snippets: logging in during a fight defers the probe, and it runs before click casting applies", () => {
  const addon = createAddon({ savedVariables: SETUP_DONE });
  addon.eval(UNITS_ENV + RAID_ENV + CLICK_LUA + "GetSpecialization = function() return 1 end");
  setCombat(addon, true);
  addon.login();
  expect(addon.eval("return ns.Client.has.secureSnippets"), "not probed in a fight").toBe(null);
  addon.slash("status");
  expect(snippetLines(addon), "/vg status says nothing about snippets before the probe ran").toBe(0);
  expect(addon.eval("return ns.Client.ProbeSnippets()"), "asking in a fight does not probe either").toBe(null);
  setCombat(addon, false);
  expect(addon.eval("return ns.Client.has.secureSnippets"), "after the fight it is asked").toBe(true);
  addon.clearChat();
  addon.slash("status");
  expect(chatHas(addon, /secure snippets: yes/), "and /vg status then says yes").toBe(true);
  addon.eval('ns.GetModule("ClickCast").Add("SHIFT-1", "spell", "TEST-ONLY Flash Heal") __spawn(1, "raid1")');
  expect(addon.eval("return Vanguard_RaidUnitButton1.__wraps.OnLeave"), "and click casting wraps the frame").toBe("self:ClearBindings()");
});
it("secure snippets: what waits for the probe's answer runs once, after the fight, and one that fails does not stop the rest", () => {
  expectErrors("secure snippet fallback: eval:3: TEST-ONLY waiter broke");
  const addon = createAddon({ savedVariables: SETUP_DONE });
  setCombat(addon, true);
  addon.login();
  addon.eval(`__answers = {}
    ns.Client.WhenSnippetsKnown(function() error("TEST-ONLY waiter broke") end)
    ns.Client.WhenSnippetsKnown(function(worked) __answers[#__answers + 1] = worked end)`);
  expect(addon.eval("return #__answers"), "in the fight, before the probe, nothing runs").toBe(0);
  setCombat(addon, false);
  expect(addon.eval("return __answers"), "after it, the waiter gets the answer once").toEqual([true]);
  expect(addon.eval('for _, e in ipairs(ns.errors) do if e.text:find("TEST-ONLY waiter broke", 1, true) then return e.text end end'), "the failing one is reported").toMatch(/^secure snippet fallback: .*TEST-ONLY waiter broke/);
  addon.eval("ns.Client.WhenSnippetsKnown(function(worked) __answers[#__answers + 1] = worked end)");
  expect(addon.eval("return __answers"), "a later caller is answered at once").toEqual([true, true]);
});
