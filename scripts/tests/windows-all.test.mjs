// windows-all: every game window Vanguard reskins (Modules/Windows*.lua), opened once each in the TEST-ONLY
// headless client, with the skin found applied to it. The roadmap's success criterion for Phase 8 ("A harness
// check opens every window Vanguard reskins and finds the skin applied to each"). The list is read from the
// registry itself (GW.ORDER, GW.ON_DEMAND), so a window registered later is checked with no change here.

import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { WINDOWS_ENV, loggedIn } from "./helpers.mjs";

// The groups of game windows (GW.GROUPS in Modules/Windows.lua), one login each.
const GROUPS = ["windows", "popups", "timers", "social", "town", "system", "map", "menus", "tabs", "pvp"];

// Windows whose skin deliberately paints no panel on the window itself, each with why. hooked: whether the
// window is watched at all (the quest windows are not while Vanguard's quest dialog stands in for them).
const EXCEPTIONS = {
  QuestFrame: { hooked: false, why: "Vanguard's quest dialog stands in for it, so it is never hooked" },
  GossipFrame: { hooked: false, why: "Vanguard's quest dialog stands in for it, so it is never hooked" },
  RaidFrame: { hooked: true, why: "a tab inside the friends window (which has the panel): its group boxes and buttons are dressed" },
  AddonDialog: { hooked: true, why: "a full-screen click catcher: the dialog inside it (AddonDialogBackground) gets the panel" },
  SplashFrame: { hooked: true, why: "its panel is on a child one level below, so it draws under the splash art" },
  QuestMapFrame: { hooked: true, why: "the world map's quest panel, left to Vanguard's own quest log while that is on" },
  QuestLogPopupDetailFrame: { hooked: true, why: "left to Vanguard's own quest log while that is on" },
  BattlefieldMapFrame: { hooked: true, why: "its border frame gets an edge and shadow over the map, not a panel" },
  LFGListingFrame: { hooked: true, why: "a page inside the group finder (which has the panel): its Inset is panelled" },
  LFGBrowseFrame: { hooked: true, why: "a page inside the group finder (which has the panel): its Inset is panelled" },
  LFGWhoListFrame: { hooked: true, why: "a page inside the group finder (which has the panel): its Inset is panelled" },
  PVPReadyPopup: { hooked: true, why: "it draws itself on its ReadyStatus child, which gets the panel" },
  UIWidgetTopCenterContainerFrame: { hooked: true, why: "a HUD widget box: its panel is on a backdrop child, shown only while it has widgets" },
  UIWidgetBelowMinimapContainerFrame: { hooked: true, why: "a HUD widget box: its panel is on a backdrop child, shown only while it has widgets" },
  TimerTracker: { hooked: true, why: "a full-screen holder: each countdown bar it makes gets the panel" },
  PvPObjectiveBannerFrame: { hooked: true, why: "a banner whose art is its animation: only its fonts change" },
  PVPRankFrame: { hooked: true, why: "a tab inside the character pane (which has the panel): its details pane is dressed" },
};

// Builds, before login, a stub window (WINDOWS_ENV's __window: a ButtonFrameTemplate-shaped frame) for every
// window of the group the client loads at login that the stub world doesn't already have; the on-demand ones
// wait for their part of the game (__lazy). __panel(f): whether Vanguard painted a texture on the frame itself.
const groupEnv = (group) => WINDOWS_ENV + `
  local GW = ns.GetModule("Windows")
  __lazy = {}
  for addon, names in pairs(GW.ON_DEMAND) do for _, n in ipairs(names) do __lazy[n] = addon end end
  for _, name in ipairs(GW.ORDER) do
    if GW.REGISTERED[name].group == "${group}" and not __lazy[name] and not _G[name] then __window(name) end
  end
  function __panel(f)
    for _, r in ipairs({ f:GetRegions() }) do if r.__kind == "Texture" and r.__texture ~= "TEST-ONLY-ART" and r.__alpha ~= 0 then return true end end
    return false
  end
`;

// After login: the group's on-demand windows built and their parts of the game loaded (ADDON_LOADED), then every
// window of the group shown once.
const openAll = (group) => `
  local GW, loaded = ns.GetModule("Windows"), {}
  for _, name in ipairs(GW.ORDER) do
    local addon = __lazy[name]
    if GW.REGISTERED[name].group == "${group}" and addon and not _G[name] then __window(name) loaded[addon] = true end
  end
  for addon in pairs(loaded) do __wfgStub.fire("ADDON_LOADED", addon) end
  for _, name in ipairs(GW.ORDER) do
    if GW.REGISTERED[name].group == "${group}" then _G[name]:Show() end
  end
`;

// Every window of the group, by name: { hooked (the skin watches it), panel (a Vanguard texture on it) }.
const results = (addon, group) => addon.eval(`local GW, out = ns.GetModule("Windows"), {}
  for _, name in ipairs(GW.ORDER) do
    local f = _G[name]
    if GW.REGISTERED[name].group == "${group}" then out[name] = { hooked = ns.FrameState('vgWindow')[f] == true, panel = __panel(f) } end
  end
  return out`);

// The windows whose result is not what they should show: hooked and panelled, or as their exception says.
const wrong = (got) => Object.entries(got)
  .filter(([name, r]) => (EXCEPTIONS[name] ? r.hooked !== EXCEPTIONS[name].hooked : !(r.hooked && r.panel)))
  .map(([name, r]) => `${name} ${JSON.stringify(r)}`);

it("the groups and exceptions here match the registry", () => {
  const addon = createAddon();
  expect(addon.eval("return ns.GetModule('Windows').GROUPS"), "the same groups as GW.GROUPS").toEqual(GROUPS);
  expect(addon.eval(`local GW, missing = ns.GetModule("Windows"), {}
    for _, name in ipairs({ "${Object.keys(EXCEPTIONS).join('", "')}" }) do if not GW.REGISTERED[name] then missing[#missing + 1] = name end end
    return table.concat(missing, ", ")`), "every exception is a registered window").toBe("");
});

for (const group of GROUPS) {
  it(`${group}: each window is skinned when it shows`, () => {
    const addon = loggedIn(groupEnv(group));
    addon.eval(openAll(group));
    const got = results(addon, group);
    expect(wrong(got), "windows not skinned as expected").toEqual([]);
    if (group === "tabs") expect(Object.keys(got), "the tabs group dresses the other groups' windows and registers none").toEqual([]);
    else expect(Object.keys(got).length, "the group has windows").toBeGreaterThan(0);
  });
}
