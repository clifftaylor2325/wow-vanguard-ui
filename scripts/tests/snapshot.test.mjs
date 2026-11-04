// The Forever snapshot: what the addon leaves on the screen after a login on
// WoW Forever, an unlock and a lock, written down in forever-snapshot.json and
// compared on every run (npm run test:quick). It is the fence round the retail
// work: a change that moves, resizes, restacks, re-labels or hides anything on
// Forever, or registers another event or module, shows up here as a short list
// of (frame, field, before, after) until the snapshot is rewritten on purpose.
//
//   npm run snapshot:update      rewrites scripts/tests/forever-snapshot.json
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
const FIELDS = ["kind", "shown", "visible", "size", "scale", "alpha", "strata", "level", "anchors", "text", "texts"];

// Lua, run once in the addon's state: __vgSnap.frames(test) answers one record per widget the test accepts,
// __vgSnap.events() every event the addon's frames listen for, __vgSnap.modules() each module and whether it is on.
// Anchors are { point, relative frame, relative point, x, y }; a frame without a name is told by its kind and its
// place among its parent's children, so a label does not change from run to run.
const LUA_RECORDER = `
  local stub = __wfgStub
  local labels = {}
  local function label(w)
    if w == nil then return nil end
    if type(w) ~= "table" then return tostring(w) end
    if w.__name then return w.__name end
    if labels[w] then return labels[w] end
    local n = 0
    for _, c in ipairs(stub.frames) do
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
  local function record(w, parents)
    local drawn = w.__kind == "Texture" or w.__kind == "FontString"
    return {
      name = w.__name, kind = w.__kind, shown = w.__shown == true, visible = w:IsVisible(),
      size = { w:GetWidth(), w:GetHeight() }, scale = w:GetScale(), alpha = w:GetAlpha(),
      strata = not drawn and w:GetFrameStrata() or nil, level = not drawn and w:GetFrameLevel() or nil, anchors = anchors(w),
      text = type(w.__text) == "string" and w.__text or nil, texts = parents[w] or {},
    }
  end
  __vgSnap = {}
  function __vgSnap.frames(test)
    local parents, out = {}, {}
    textsOf(parents)
    for _, w in ipairs(stub.frames) do
      if w.__name and test(w) then out[#out + 1] = record(w, parents) end
    end
    return out
  end
  function __vgSnap.events()
    local seen, out = {}, {}
    for _, w in ipairs(stub.frames) do
      if w.__id > stub.firstAddonFrame then
        for event in pairs(w.__events) do
          if not seen[event] then seen[event] = true; out[#out + 1] = event end
        end
      end
    end
    return out
  end
  function __vgSnap.modules()
    local out = {}
    for _, name in ipairs(ns.ModuleNames()) do out[#out + 1] = { name, ns.GetModule(name).enabled == true } end
    return out
  end
`;

// Lua: the widgets whose name starts with Vanguard.
const ADDON_FRAMES = `return __vgSnap.frames(function(w) return w.__name:find("^Vanguard") ~= nil end)`;

// Lua: the widgets the client made before the addon loaded (the ones the addon may move).
const GAME_FRAMES = `return __vgSnap.frames(function(w) return w.__id <= __wfgStub.firstAddonFrame end)`;

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

// One widget's record from the Lua one: fixed field order, rounded numbers, no field the widget does not have.
function frameOf(raw) {
  const record = {
    ...raw,
    size: asList(raw.size).map(rounded),
    scale: rounded(raw.scale),
    alpha: rounded(raw.alpha),
    anchors: asList(raw.anchors).map(anchorOf),
    texts: asList(raw.texts),
  };
  return Object.fromEntries(FIELDS.filter((field) => record[field] != null).map((field) => [field, record[field]]));
}

// A list of Lua records as an object keyed by frame name, in name order.
function framesByName(list) {
  const entries = asList(list).map((raw) => [raw.name, frameOf(raw)]);
  return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
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
    events: asList(addon.eval("return __vgSnap.events()")).sort(),
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

// What differs between two lists of plain values: "event X was added", "event X was removed".
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
    const base = { interface: 16001, modules: [{ name: "Bars", enabled: true }], events: ["A", "B"], frames: { Vanguard_a: frame, Vanguard_b: frame }, gameFrames: {} };
    const moved = { ...frame, shown: false };
    const live = { ...base, modules: [{ name: "Bars", enabled: false }], events: ["B", "C"], frames: { Vanguard_a: moved, Vanguard_c: frame }, gameFrames: { Minimap: frame } };
    expect(snapshotDifferences(base, base)).toEqual([]);
    expect(snapshotDifferences(base, live)).toEqual([
      'module added: {"name":"Bars","enabled":false}',
      'module removed: {"name":"Bars","enabled":true}',
      'event added: "C"',
      'event removed: "A"',
      "frame Vanguard_a shown: true -> false",
      `frame Vanguard_b removed`,
      `frame Vanguard_c added: ${JSON.stringify(frame)}`,
      `game frame Minimap added: ${JSON.stringify(frame)}`,
    ]);
  });

  it("a long list of differences is cut short and says how to accept them", () => {
    const report = differenceReport(Array.from({ length: MAX_LISTED + 3 }, (_, i) => `d${i}`));
    expect(report).toContain("... and 3 more");
    expect(report).toContain("npm run snapshot:update");
    expect(report).not.toContain(`d${MAX_LISTED}`);
  });
}
