// Unit events go through ns.OnUnit (Core/Events.lua), which gives each subscription its
// own frame registered for its units only. A frame's own RegisterUnitEvent, or its own
// RegisterEvent of a UNIT_ event (or of a name this scan can't read), in Core/ or Modules/
// fails here unless ALLOWED names the file, how many such calls it has, and why.
// ns.On("UNIT_...") is not a direct registration: the shared frame is the path for
// raid-wide unit events (RaidFrames, RaidHealing, RaidAuras), which can't be narrowed
// to the three units a subscription takes.

import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { tokenizeLua } from "./lib/code-quality.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIRS = ["Core", "Modules"];
const CALLS = new Set(["RegisterUnitEvent", "RegisterEvent"]);

// The files that register unit events on a frame of their own: how many calls, and why.
const ALLOWED = {
  "Core/Events.lua": {
    calls: 3,
    reason: "the helpers themselves: ns.On's one shared frame, and ns.OnUnit's subscription frames (RegisterUnitEvent, or RegisterEvent on a client without it)",
  },
};

// The 1-based line of a character offset in src.
function lineOf(src, offset) {
  return src.slice(0, offset).split("\n").length;
}

// True when tokens[i] is a call of a frame's RegisterUnitEvent or RegisterEvent (f:Name( or f.Name().
function isRegisterCall(tokens, i) {
  const t = tokens[i];
  return t.kind === "word" && CALLS.has(t.text) && [":", "."].includes(tokens[i - 1]?.text) && tokens[i + 1]?.text === "(";
}

// The direct unit-event registrations in one Lua source: { line, call, event } for every
// RegisterUnitEvent call, and every RegisterEvent call whose event is a UNIT_ string or not a string.
function directRegistrations(src) {
  const tokens = tokenizeLua(src).filter((t) => t.kind !== "comment");
  const found = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!isRegisterCall(tokens, i)) continue;
    const arg = tokens[i + 2];
    const event = arg ? src.slice(arg.start, arg.end) : "";
    if (tokens[i].text === "RegisterUnitEvent" || !/^["']/.test(event) || /^["']UNIT_/.test(event)) found.push({ line: lineOf(src, tokens[i].start), call: tokens[i].text, event });
  }
  return found;
}

// Every Lua file under Core/ and Modules/, as a repo-relative path with forward slashes.
function addonFiles() {
  const files = DIRS.flatMap((dir) => fs.readdirSync(path.join(ROOT, dir), { recursive: true }).map((f) => `${dir}/${String(f).split(path.sep).join("/")}`));
  return files.filter((f) => f.endsWith(".lua")).sort();
}

// File -> its direct unit-event registrations, for the files that have any.
function scan() {
  const out = {};
  for (const file of addonFiles()) {
    const found = directRegistrations(fs.readFileSync(path.join(ROOT, file), "utf8"));
    if (found.length) out[file] = found;
  }
  return out;
}

it("unit events: no file in Core/ or Modules/ registers one on its own frame, except the allowed ones", () => {
  const found = scan();
  const unexpected = Object.entries(found).filter(([file]) => !ALLOWED[file]).flatMap(([file, regs]) => regs.map((r) => `${file}:${r.line}: ${r.call}(${r.event}`));
  expect(unexpected, "use ns.OnUnit (Core/Events.lua), or add the file to ALLOWED with its reason").toEqual([]);
  for (const [file, { calls, reason }] of Object.entries(ALLOWED)) {
    expect(reason.length, `${file}: the allow-list gives a reason`).toBeGreaterThan(0);
    expect((found[file] || []).length, `${file}: ${calls} direct registrations allowed (${reason})`).toBe(calls);
  }
});

it("unit events: the scan finds direct registrations and ignores the rest", () => {
  const src = `-- TEST-ONLY source, never loaded
    f:RegisterUnitEvent("UNIT_HEALTH", "player")
    f:RegisterEvent("UNIT_AURA")
    f:RegisterEvent(event)
    f.RegisterEvent(f, "PLAYER_LOGIN")
    f:RegisterEvent("PLAYER_LOGIN")
    -- f:RegisterUnitEvent("UNIT_POWER_UPDATE", "player")
    local s = "f:RegisterUnitEvent("
    local plain = type(f.RegisterUnitEvent) ~= "function"
    ns.On("UNIT_AURA", fn)`;
  const found = directRegistrations(src).map((r) => `${r.line} ${r.call} ${r.event}`);
  expect(found, "a unit filter, a UNIT_ event, a name it can't read, a dot call; not a plain event, a comment, a string or a lookup").toEqual([
    '2 RegisterUnitEvent "UNIT_HEALTH"',
    '3 RegisterEvent "UNIT_AURA"',
    "4 RegisterEvent event",
    "5 RegisterEvent f",
  ]);
});
