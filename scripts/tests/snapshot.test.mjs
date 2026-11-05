// The Forever snapshot: what the addon leaves on the screen after a login on
// WoW Forever, an unlock and a lock, written down in forever-snapshot.json and
// compared on every run (npm run test:quick). It is the fence round the retail
// work: a change that moves, resizes, restacks, re-labels or hides anything on
// Forever, re-parents or silences a game frame, or moves an event to another
// frame or registers another event or module, shows up here as a short list
// of (frame, field, before, after) until the snapshot is rewritten on purpose.
//
//   npm run snapshot:update      rewrites scripts/tests/forever-snapshot.json
//
// What it records: the addon's frames (named Vanguard* ones, and unnamed ones
// that are not textures or font strings, under a label such as
// "(Button 3 of Vanguard_RaidTools)"), with the text of their font strings and
// the text colour, font and bar colour the frame itself carries; the game frames
// the addon changed; events per addon frame; and modules. Textures (path, atlas,
// vertex colour) and an unnamed font string's own font and colour are not
// recorded. A label counts same-kind siblings in creation order, so one sibling
// added in the middle shows up as added and removed lines for the ones after it.
//
// A pull request that rewrites the file says why in its body (README, "The
// Forever snapshot"). Nothing here varies from run to run: numbers are rounded
// to two decimals, names are sorted, and no time or id is recorded.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { createAddon } from "../lib/lua-harness.mjs";
import { SETUP_DONE } from "./helpers.mjs";

const SNAPSHOT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "forever-snapshot.json");

// The most differences a failure lists before it says how many more there are.
const MAX_LISTED = 40;

// The fields of a frame's record, in the order they are written.
// Game frames also carry their parent and the events they listen for, so parking or silencing one shows.
// textColor, font and barColor appear only on a frame that set them (a font string, a status bar, a button's text).
const FIELDS = ["kind", "shown", "visible", "size", "scale", "alpha", "strata", "level", "anchors", "text", "texts", "parent", "events", "textColor", "font", "barColor"];

// Lua, run once in the addon's state: __vgSnap.frames(test, extend) answers one record per widget the test accepts
// (extend, when given, adds fields to each), __vgSnap.wiring adds a game frame's parent and events,
// __vgSnap.events() each addon frame that listens for events with its sorted list, __vgSnap.modules() each module
// and whether it is on.
// Anchors are { point, relative frame, relative point, x, y }; a frame without a name is told by its kind and its
// place among its parent's children (in creation order), so a label does not change from run to run.
const LUA_RECORDER = `
  local stub = __wfgStub
  local labels = {}
  local function siblings(w)
    local p = w.__parent
    local drawn = w.__kind == "Texture" or w.__kind == "FontString"
    local list = p and (drawn and p.GetRegions or p.GetChildren)
    if list then return { list(p) } end
    return stub.frames
  end
  local function label(w)
    if w == nil then return nil end
    if type(w) ~= "table" then return tostring(w) end
    if w.__name then return w.__name end
    if labels[w] then return labels[w] end
    local n = 0
    for _, c in ipairs(siblings(w)) do
      if c.__parent == w.__parent and c.__kind == w.__kind and not c.__name then
        n = n + 1
        if c == w then break end
      end
    end
    labels[w] = "(" .. w.__kind .. " " .. n .. " of " .. tostring(label(w.__parent)) .. ")"
    return labels[w]
  end
  local function anchors(w)
    local out = {}
    for i = 1, w:GetNumPoints() do
      local point, rel, relPoint, x, y = w:GetPoint(i)
      out[#out + 1] = { point, label(rel), relPoint, x, y }
    end
    return out
  end
  local function textsOf(parents)
    for _, w in ipairs(stub.frames) do
      if w.__kind == "FontString" and not w.__name and w.__parent and type(w.__text) == "string" and w.__text ~= "" then
        local list = parents[w.__parent] or {}
        list[#list + 1] = w.__text
        parents[w.__parent] = list
      end
    end
  end
  local function eventsOf(w)
    local out = {}
    for event in pairs(w.__events) do out[#out + 1] = event end
    table.sort(out)
    return out
  end
  local function record(w, parents)
    local drawn = w.__kind == "Texture" or w.__kind == "FontString"
    return {
      name = label(w), kind = w.__kind, shown = w.__shown == true, visible = w:IsVisible(),
      size = { w:GetWidth(), w:GetHeight() }, scale = w:GetScale(), alpha = w:GetAlpha(),
      strata = not drawn and w:GetFrameStrata() or nil, level = not drawn and w:GetFrameLevel() or nil, anchors = anchors(w),
      text = type(w.__text) == "string" and w.__text or nil, texts = parents[w] or {},
      textColor = w.__textColor, font = w.__font, barColor = w.__barColor,
    }
  end
  __vgSnap = {}
  function __vgSnap.frames(test, extend)
    local parents, out = {}, {}
    textsOf(parents)
    for _, w in ipairs(stub.frames) do
      if test(w) then
        out[#out + 1] = record(w, parents)
        if extend then extend(w, out[#out]) end
      end
    end
    return out
  end
  function __vgSnap.wiring(w, r)
    r.parent = label(w.__parent) or "nil"
    r.events = eventsOf(w)
  end
  function __vgSnap.events()
    local out = {}
    for _, w in ipairs(stub.frames) do
      if w.__id > stub.firstAddonFrame and next(w.__events) then out[#out + 1] = { label(w), eventsOf(w) } end
    end
    return out
  end
  function __vgSnap.modules()
    local out = {}
    for _, name in ipairs(ns.ModuleNames()) do out[#out + 1] = { name, ns.GetModule(name).enabled == true } end
    return out
  end
`;

// Lua: the widgets whose name starts with Vanguard, and the unnamed frames the addon made that are not regions.
const ADDON_FRAMES = `return __vgSnap.frames(function(w)
  if w.__name then return w.__name:find("^Vanguard") ~= nil end
  return w.__id > __wfgStub.firstAddonFrame and w.__kind ~= "Texture" and w.__kind ~= "FontString"
end)`;

// Lua: the named widgets the client made before the addon loaded (the ones the addon may move).
const GAME_FRAMES = `return __vgSnap.frames(function(w) return w.__name ~= nil and w.__id <= __wfgStub.firstAddonFrame end, __vgSnap.wiring)`;

// A Lua list as a JS array (an empty Lua table comes back as an object).
const asList = (value) => (Array.isArray(value) ? value : []);

// A number to two decimals, with no minus zero; anything else as it is.
function rounded(value) {
  if (typeof value !== "number") return value;
  return Math.round(value * 100) / 100 + 0;
}

// One anchor as an object, its numbers rounded.
function anchorOf([point, relativeTo, relativePoint, x, y]) {
  return { point, relativeTo, relativePoint, x: rounded(x), y: rounded(y) };
}

// The list fields a widget may lack, each with its numbers rounded; an absent one is left out.
function optionalLists(raw, fields) {
  return Object.fromEntries(fields.filter((field) => raw[field] != null).map((field) => [field, asList(raw[field]).map(rounded)]));
}

// One widget's record from the Lua one: fixed field order, rounded numbers, no field the widget does not have.
function frameOf(raw) {
  const record = {
    ...raw,
    size: asList(raw.size).map(rounded),
    scale: rounded(raw.scale),
    alpha: rounded(raw.alpha),
    anchors: asList(raw.anchors).map(anchorOf),
    texts: asList(raw.texts),
    ...optionalLists(raw, ["events", "textColor", "font", "barColor"]),
  };
  return Object.fromEntries(FIELDS.filter((field) => record[field] != null).map((field) => [field, record[field]]));
}

// Orders two strings by code point, the way the snapshot sorts names.
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// A list of Lua records as an object keyed by frame name, in name order.
function framesByName(list) {
  const entries = asList(list).map((raw) => [raw.name, frameOf(raw)]);
  return Object.fromEntries(entries.sort(([a], [b]) => byText(a, b)));
}

// The addon's frames that listen for events, as { frame, events }, in frame order.
function eventsByFrame(list) {
  const entries = asList(list).map(([frame, events]) => ({ frame, events: asList(events) }));
  return entries.sort((a, b) => byText(a.frame, b.frame));
}

// The game frames the addon changed: those whose record after the session differs from the record before it.
function movedGameFrames(before, after) {
  const kept = Object.entries(after).filter(([name, record]) => JSON.stringify(before[name]) !== JSON.stringify(record));
  return Object.fromEntries(kept);
}

// Plays the session the snapshot is taken after: login, unlock, lock, two seconds.
function playSession(addon) {
  addon.login();
  addon.slash("unlock");
  addon.slash("lock");
  addon.advance(2);
}

// What the addon left, read from the Lua recorder; gameBefore is the game frames as they were before the addon loaded.
function readRecord(addon, gameBefore) {
  return {
    interface: addon.eval("return select(4, GetBuildInfo())"),
    modules: asList(addon.eval("return __vgSnap.modules()")).map(([name, enabled]) => ({ name, enabled })),
    events: eventsByFrame(addon.eval("return __vgSnap.events()")),
    frames: framesByName(addon.eval(ADDON_FRAMES)),
    gameFrames: movedGameFrames(gameBefore, framesByName(addon.eval(GAME_FRAMES))),
  };
}

// The addon on Forever after login, unlock, lock and two seconds of play, written down.
export function recordForever() {
  const addon = createAddon({ savedVariables: SETUP_DONE });
  addon.eval(LUA_RECORDER);
  const gameBefore = framesByName(addon.eval(GAME_FRAMES));
  playSession(addon);
  return readRecord(addon, gameBefore);
}

// A block of lines inside brackets, or the empty pair when there are none.
function block(open, close, lines) {
  return lines.length === 0 ? `${open}${close}` : `${open}\n${lines.join(",\n")}\n  ${close}`;
}

// A list item as one indented line.
const listedLine = (item) => `    ${JSON.stringify(item)}`;

// A frame record as one indented line, behind its name.
const keyedLine = ([name, record]) => `    ${JSON.stringify(name)}: ${JSON.stringify(record)}`;

// The record as JSON text: one line to a frame, module and event, so a rewrite diffs line by line.
export function snapshotText(snapshot) {
  return [
    "{",
    `  "interface": ${JSON.stringify(snapshot.interface)},`,
    `  "modules": ${block("[", "]", snapshot.modules.map(listedLine))},`,
    `  "events": ${block("[", "]", snapshot.events.map(listedLine))},`,
    `  "frames": ${block("{", "}", Object.entries(snapshot.frames).map(keyedLine))},`,
    `  "gameFrames": ${block("{", "}", Object.entries(snapshot.gameFrames).map(keyedLine))}`,
    "}",
    "",
  ].join("\n");
}

// An item as the text two lists are compared by.
const itemKey = (item) => JSON.stringify(item);

// What differs between two lists of plain values or records: "event X was added", "event X was removed".
function listDifferences(what, before, after) {
  const had = new Set(before.map(itemKey));
  const has = new Set(after.map(itemKey));
  return [
    ...after.filter((item) => !had.has(itemKey(item))).map((item) => `${what} added: ${itemKey(item)}`),
    ...before.filter((item) => !has.has(itemKey(item))).map((item) => `${what} removed: ${itemKey(item)}`),
  ];
}

// What differs between two frame records, one line per field: "frame field: before -> after".
function fieldDifferences(name, before, after) {
  return FIELDS.filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => `${name} ${field}: ${JSON.stringify(before[field])} -> ${JSON.stringify(after[field])}`);
}

// What differs between two maps of frame records: frames added or removed, and each field that changed.
function mapDifferences(what, before, after) {
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return names.flatMap((name) => {
    if (!(name in before)) return [`${what} ${name} added: ${JSON.stringify(after[name])}`];
    if (!(name in after)) return [`${what} ${name} removed`];
    return fieldDifferences(`${what} ${name}`, before[name], after[name]);
  });
}

// Every difference between the committed snapshot and the live one, as lines for a failure message.
export function snapshotDifferences(committed, live) {
  return [
    ...(committed.interface === live.interface ? [] : [`interface: ${committed.interface} -> ${live.interface}`]),
    ...listDifferences("module", committed.modules, live.modules),
    ...listDifferences("event", committed.events, live.events),
    ...mapDifferences("frame", committed.frames, live.frames),
    ...mapDifferences("game frame", committed.gameFrames, live.gameFrames),
  ];
}

// The failure text: the first differences, how many more there were, and how to accept them.
export function differenceReport(differences) {
  const shown = differences.slice(0, MAX_LISTED);
  const more = differences.length - shown.length;
  const rest = more > 0 ? [`... and ${more} more`] : [];
  const update = "If the change is on purpose, run `npm run snapshot:update` and say why in the PR body.";
  return ["The Forever snapshot changed:", ...shown, ...rest, update].join("\n");
}

// Rewrites forever-snapshot.json from the live record.
export function writeSnapshot() {
  fs.writeFileSync(SNAPSHOT_FILE, snapshotText(recordForever()));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv.includes("--update")) throw new Error("usage: node scripts/tests/snapshot.test.mjs --update");
  writeSnapshot();
  process.stdout.write("scripts/tests/forever-snapshot.json rewritten\n");
} else {
  it("on WoW Forever, after login, unlock and lock, the addon's frames, events and modules are as the snapshot says", () => {
    const committed = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
    const differences = snapshotDifferences(committed, JSON.parse(JSON.stringify(recordForever())));
    if (differences.length > 0) throw new Error(differenceReport(differences));
  });

  it("the snapshot is deterministic: two recordings in one process are identical", () => {
    expect(snapshotText(recordForever())).toBe(snapshotText(recordForever()));
  });

  it("the comparison names the frame, the field, what it was and what it is", () => {
    const frame = { shown: true, anchors: [{ point: "CENTER", relativeTo: "UIParent", relativePoint: "CENTER", x: 0, y: 0 }] };
    // One addon frame's entry in the events list.
    const listening = (frame, events) => ({ frame, events });
    const base = { interface: 16001, modules: [{ name: "Bars", enabled: true }], events: [listening("Vanguard_a", ["A"]), listening("Vanguard_b", ["B"])], frames: { Vanguard_a: frame, Vanguard_b: frame }, gameFrames: { PlayerFrame: { ...frame, parent: "UIParent", events: ["UNIT_HEALTH"] } } };
    const moved = { ...frame, shown: false };
    const parked = { ...frame, parent: "(Frame 1 of UIParent)", events: [] };
    const live = { ...base, modules: [{ name: "Bars", enabled: false }], events: [listening("Vanguard_a", ["A"]), listening("Vanguard_c", ["B"])], frames: { Vanguard_a: moved, Vanguard_c: frame }, gameFrames: { Minimap: frame, PlayerFrame: parked } };
    expect(snapshotDifferences(base, base)).toEqual([]);
    expect(snapshotDifferences(base, live)).toEqual([
      'module added: {"name":"Bars","enabled":false}',
      'module removed: {"name":"Bars","enabled":true}',
      'event added: {"frame":"Vanguard_c","events":["B"]}',
      'event removed: {"frame":"Vanguard_b","events":["B"]}',
      "frame Vanguard_a shown: true -> false",
      `frame Vanguard_b removed`,
      `frame Vanguard_c added: ${JSON.stringify(frame)}`,
      `game frame Minimap added: ${JSON.stringify(frame)}`,
      'game frame PlayerFrame parent: "UIParent" -> "(Frame 1 of UIParent)"',
      'game frame PlayerFrame events: ["UNIT_HEALTH"] -> []',
    ]);
  });

  it("a long list of differences is cut short and says how to accept them", () => {
    const report = differenceReport(Array.from({ length: MAX_LISTED + 3 }, (_, i) => `d${i}`));
    expect(report).toContain("... and 3 more");
    expect(report).toContain("npm run snapshot:update");
    expect(report).not.toContain(`d${MAX_LISTED}`);
  });
}
