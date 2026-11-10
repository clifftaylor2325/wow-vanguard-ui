// TEST-ONLY helpers for the module lifecycle (Core/Modules.lua, docs/design/MODULE-LIFECYCLE.md 4.3): the addon's
// footprint (what it has registered and shows), and the three cases every live module gets: switched off it leaves
// what a login with it off leaves, switched on late it equals a login with it on, and toggled three times it makes
// nothing new. A conversion batch calls lifecycleCases once per module it converts.

import { expect, it } from "vitest";

// Lua run in the addon's state: handler counts per event (ns.HandlerCounts), ticker keys, the events each addon frame
// listens for, the addon frames shown under a parent (by name or kind; a parentless unit event frame kept as a
// spare draws nothing), frames with a state driver, mover keys, open gates, and how many frames there are.
const FOOTPRINT = `
  local stub = __wfgStub
  local out = { handlers = ns.HandlerCounts(), tickers = {}, events = {}, shown = {}, drivers = 0, movers = {}, gates = 0 }
  for key in pairs(ns.ticker.vgJobs) do out.tickers[#out.tickers + 1] = tostring(key) end
  for _, w in ipairs(stub.frames) do
    if w.__id > stub.firstAddonFrame then
      for event in pairs(w.__events) do out.events[#out.events + 1] = event end
      if w.__parent and w:IsVisible() then out.shown[#out.shown + 1] = w.__name or w.__kind end
      if w.__states and next(w.__states) then out.drivers = out.drivers + 1 end
    end
  end
  for i, m in ipairs(ns.MoverList()) do out.movers[i] = m.key end
  for _, list in ipairs({ out.tickers, out.events, out.shown, out.movers }) do table.sort(list) end
  for _, name in ipairs(ns.ModuleNames()) do
    local scope = ns.GetModule(name).scope
    if scope and scope.on then out.gates = out.gates + scope.gateCount end
  end
  out.frames = #stub.frames
  return out
`;

// The addon's footprint now; without the frame count unless asked (a stopped module's frames stay: the client never
// frees one).
export function footprint(addon, { frames = false } = {}) {
  const f = addon.eval(FOOTPRINT);
  if (!frames) delete f.frames;
  return f;
}

// Lua for a saved-variables tail that switches `name` off in the Default profile.
export const moduleOff = (name) => `\nVanguardDB.profiles = VanguardDB.profiles or {}
VanguardDB.profiles.Default = VanguardDB.profiles.Default or {}
VanguardDB.profiles.Default.modules = VanguardDB.profiles.Default.modules or {}
VanguardDB.profiles.Default.modules.${name} = false`;

// Lua that switches a module off and on.
const toggle = (name) => `ns.SetModuleEnabled("${name}", false) ns.SetModuleEnabled("${name}", true)`;

// Switched off, `name` leaves what a login with it off leaves: no handler, ticker, subscription, shown frame,
// driver, mover or gate of its own.
function offCase(name, login) {
  it(`lifecycle: ${name} switched off leaves what a login with it off leaves`, () => {
    const offAtLogin = footprint(login(moduleOff(name)));
    const addon = login("");
    addon.eval(`ns.SetModuleEnabled("${name}", false)`);
    expect(footprint(addon)).toEqual(offAtLogin);
  });
}

// Switched on late, `name` has the footprint of a login with it on, frames included.
function lateCase(name, login) {
  it(`lifecycle: ${name} switched on late equals a login with it on`, () => {
    const onAtLogin = footprint(login(""), { frames: true });
    const addon = login(moduleOff(name));
    addon.eval(`ns.SetModuleEnabled("${name}", true)`);
    expect(footprint(addon, { frames: true })).toEqual(onAtLogin);
  });
}

// Toggled three times, `name` makes no new frame, handler or gate (the build-once rule).
function toggleCase(name, login) {
  it(`lifecycle: ${name} toggled three times makes no new frame, handler or gate`, () => {
    const addon = login("");
    const first = footprint(addon, { frames: true });
    for (let i = 0; i < 3; i++) addon.eval(toggle(name));
    expect(footprint(addon, { frames: true })).toEqual(first);
  });
}

// The three lifecycle cases for the live module `name`. login(saved) returns the addon logged in, with `saved`
// appended to its saved variables (moduleOff(name) for a login with the module off).
export function lifecycleCases(name, login) {
  offCase(name, login);
  lateCase(name, login);
  toggleCase(name, login);
}
