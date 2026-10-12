// The raid benchmark's logic (scripts/bench.mjs is the command, and its header
// has the method note): the options, the seeded event script, the TEST-ONLY
// raid it plays against, the timed and profiled passes, the statistics, and the
// printed and compared tables. Everything it reports is a harness measurement.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import fengari from "fengari";
import { createAddon, root } from "./lua-harness.mjs";
import { PER_SAMPLE, emptyProfile, profileSampler, useProfile } from "./lua-profile.mjs";

const { lua, to_luastring } = fengari;

// What every result is called until /vg perf in a raid confirms it.
export const LABEL = "harness measurement";
// Raid members: raid1 is you, raid2..raid40 the others.
export const RAID_SIZE = 40;
// The share of each kind of step in the script, by weight: a raid pull's mix of
// unit events, with one OnUpdate frame (1/60 s) for about every eight events.
// "cast" starts a member's cast, or stops the one they are casting.
export const MIX = [["UNIT_HEALTH", 40], ["UNIT_POWER_UPDATE", 18], ["UNIT_AURA", 16], ["cast", 12], ["OnUpdate", 12], ["GROUP_ROSTER_UPDATE", 2]];
// The defaults: steps per repetition, timed repetitions, untimed warm-ups, the seed.
export const DEFAULTS = { events: 2000, reps: 5, warmup: 1, seed: 255 };
// At most this many members are away at once; at most this many auras per member.
const MOST_AWAY = 3;
const MOST_AURAS = 4;
// How many auras and spells the Lua driver knows (AURAS and SPELLS in DRIVER).
const AURA_COUNT = 8;
const SPELL_COUNT = 4;
// The saved variables of an account that finished setup (SETUP_DONE in scripts/tests/helpers.mjs).
const SETUP_DONE = "VanguardDB = { version = 2, profiles = {}, setupDone = true }\nVanguardCharDB = {}\n";
// The addon's own files, as the profiler names them; anything else is the harness.
const ADDON_FILE = /^(Core|Modules|Libs)\//;

// Options ---------------------------------------------------------------------------------

const OPTIONS = {
  events: { type: "string" },
  reps: { type: "string" },
  warmup: { type: "string" },
  seed: { type: "string" },
  out: { type: "string" },
  compare: { type: "string" },
  budget: { type: "string" },
  summary: { type: "string" },
  "no-profile": { type: "boolean" },
};

// A whole-number option of at least `least`, or the fallback when it is not given.
function wholeOption(text, fallback, flag, least) {
  if (text === undefined) return fallback;
  const n = Number(text);
  if (!Number.isInteger(n) || n < least || !/^\d+$/.test(text)) throw new Error(`${flag} must be a whole number of ${least} or more, not "${text}"`);
  return n;
}

// The --budget percent (a number above 0), or undefined when it is not given.
function budgetOption(text) {
  if (text === undefined) return undefined;
  const n = Number(text);
  if (!(n > 0) || !Number.isFinite(n)) throw new Error(`--budget must be a percent above 0, not "${text}"`);
  return n;
}

// The bench's options from the command line; throws an Error with the reason for a bad one.
export function readOptions(argv) {
  const { values } = parseArgs({ args: argv, options: OPTIONS, strict: true });
  const opts = { events: wholeOption(values.events, DEFAULTS.events, "--events", 1), reps: wholeOption(values.reps, DEFAULTS.reps, "--reps", 1) };
  Object.assign(opts, { warmup: wholeOption(values.warmup, DEFAULTS.warmup, "--warmup", 0), seed: wholeOption(values.seed, DEFAULTS.seed, "--seed", 0) });
  Object.assign(opts, { out: values.out, compare: values.compare, summary: values.summary, profile: !values["no-profile"], budget: budgetOption(values.budget) });
  if (opts.budget !== undefined && !opts.compare) throw new Error("--budget needs --compare <file>: it limits the slowdown against an earlier result");
  return opts;
}

// The script ---------------------------------------------------------------------------------

// A seeded random number generator (mulberry32): a function giving numbers in [0, 1).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One item of a list, drawn at random.
function pick(rand, list) {
  return list[Math.floor(rand() * list.length)];
}

// A whole number from 1 to n, drawn at random.
function upTo(rand, n) {
  return 1 + Math.floor(rand() * n);
}

// The raid as the script leaves it: each member's index, whether they are in the raid, their auras and cast.
function raidState() {
  return Array.from({ length: RAID_SIZE }, (_, k) => ({ i: k + 1, present: true, auras: [], casting: false }));
}

// The members in the raid now.
function present(members) {
  return members.filter((m) => m.present);
}

// The kind of the next step, drawn by MIX's weights.
function drawKind(rand) {
  let r = rand() * MIX.reduce((n, [, w]) => n + w, 0);
  for (const [kind, weight] of MIX) {
    r -= weight;
    if (r < 0) return kind;
  }
  return MIX[0][0];
}

// A health or power step: a member's new value, in thousandths of their maximum.
function barStep(event) {
  // The step for one random member.
  return (rand, members) => [event, pick(rand, present(members)).i, upTo(rand, 1000)];
}

// An aura step: a member gains an aura they lack (its number), or loses one they have (minus its number).
function auraStep(rand, members) {
  const who = pick(rand, present(members));
  if (who.auras.length >= MOST_AURAS || (who.auras.length > 0 && rand() < 0.5)) {
    const id = pick(rand, who.auras);
    who.auras = who.auras.filter((a) => a !== id);
    return ["UNIT_AURA", who.i, -id];
  }
  const id = pick(rand, Array.from({ length: AURA_COUNT }, (_, k) => k + 1).filter((a) => !who.auras.includes(a)));
  who.auras.push(id);
  return ["UNIT_AURA", who.i, id];
}

// A cast step: a member starts casting a spell (its number), or stops the cast they had.
function castStep(rand, members) {
  const who = pick(rand, present(members));
  who.casting = !who.casting;
  return who.casting ? ["UNIT_SPELLCAST_START", who.i, upTo(rand, SPELL_COUNT)] : ["UNIT_SPELLCAST_STOP", who.i, 0];
}

// A roster step: a member other than you leaves (0), or one who left comes back (1) with no auras or cast.
function rosterStep(rand, members) {
  const away = members.filter((m) => !m.present);
  const joining = away.length >= MOST_AWAY || (away.length > 0 && rand() < 0.5);
  const who = pick(rand, joining ? away : present(members).filter((m) => m.i > 1));
  Object.assign(who, { present: joining, auras: [], casting: false });
  return ["GROUP_ROSTER_UPDATE", who.i, joining ? 1 : 0];
}

// One OnUpdate frame for every shown frame (1/60 s of game time).
function frameStep() {
  return ["OnUpdate", 0, 0];
}

const MAKERS = { UNIT_HEALTH: barStep("UNIT_HEALTH"), UNIT_POWER_UPDATE: barStep("UNIT_POWER_UPDATE"), UNIT_AURA: auraStep, cast: castStep, OnUpdate: frameStep, GROUP_ROSTER_UPDATE: rosterStep };

// The steps that bring the raid back to how it started (everyone in, no casts, no auras), so every repetition starts alike.
function closingSteps(members) {
  const steps = [];
  for (const who of members) {
    if (!who.present) steps.push(["GROUP_ROSTER_UPDATE", who.i, 1]);
    if (who.casting) steps.push(["UNIT_SPELLCAST_STOP", who.i, 0]);
    for (const id of who.auras) steps.push(["UNIT_AURA", who.i, -id]);
  }
  return steps;
}

// The script of one repetition: `events` seeded steps of [event, raid index, value], then the closing steps.
export function makeScript({ seed, events }) {
  const rand = rng(seed);
  const members = raidState();
  const steps = Array.from({ length: events }, () => MAKERS[drawKind(rand)](rand, members));
  return steps.concat(closingSteps(members));
}

// How many steps of each event a script has.
export function countEvents(steps) {
  const counts = {};
  for (const [event] of steps) counts[event] = (counts[event] ?? 0) + 1;
  return counts;
}

// The raid in the harness --------------------------------------------------------------------

// TEST-ONLY Lua: the raid's members and the step driver. The client's group header
// is not in the harness, so the driver makes the 40 tiles the way the header would
// (as RAID_ENV in scripts/tests/helpers.mjs does) and sets or clears a tile's unit
// when its member joins or leaves.
const DRIVER = `
local world, stub = __wfgWorld, __wfgStub
local CLASSES = { "WARRIOR", "PRIEST", "MAGE", "ROGUE", "DRUID", "HUNTER", "WARLOCK", "PALADIN" }
local AURAS = {
  { "Power Word: Fortitude", 1243, 1800 }, { "Mark of the Wild", 1126, 1800 }, { "Arcane Intellect", 1459, 1800 },
  { "Renew", 139, 15 }, { "Rejuvenation", 774, 12 }, { "Living Bomb", 20475, 8, "Magic" },
  { "Lucifron's Curse", 19703, 300, "Curse" }, { "Poison Bolt Volley", 25099, 10, "Poison" },
}
local SPELLS = { { "Greater Heal", 2060, 3 }, { "Flash Heal", 2061, 1.5 }, { "Healing Touch", 5185, 3.5 }, { "Frostbolt", 116, 3 } }
local POWER = { WARRIOR = { 1, "RAGE", 100 }, ROGUE = { 3, "ENERGY", 100 } }

-- A raid member's fields: class by turn, raid2-3 tanks, raid4-11 healers.
local function member(i)
  local class = CLASSES[(i - 1) % #CLASSES + 1]
  local p = POWER[class] or { 0, "MANA", 4000 }
  local role = (i <= 3 and "TANK") or (i <= 11 and "HEALER") or "DAMAGER"
  return { name = "TEST-ONLY Raider " .. i, class = class, className = class, isPlayer = true, role = role, level = 60,
    hp = 5000, maxhp = 5000, ptype = p[1], ptypeName = p[2], power = p[3], maxpower = p[3], connected = true, reaction = 5 }
end

-- Makes tile i as the client's group header would: sized, placed in a column, set up.
local function spawn(i)
  local b = CreateFrame("Button", "Vanguard_RaidUnitButton" .. i, Vanguard_Raid, "SecureUnitButtonTemplate")
  local w, h = Vanguard_Raid:GetAttribute("vg-width"), Vanguard_Raid:GetAttribute("vg-height")
  b:SetSize(w, h)
  b:SetPoint("TOPLEFT", Vanguard_Raid, "TOPLEFT", 0, -(i - 1) * h)
  Vanguard_Raid:SetSize(w, math.max(Vanguard_Raid:GetHeight(), i * h))
  Vanguard_Raid.initialConfigFunction(Vanguard_Raid, b:GetName())
  b:SetAttribute("unit", "raid" .. i)
end

-- The raid forms out of combat (you are raid1), its tiles are made, and the pull starts.
function __vgBenchRaid()
  world.units.raid1 = world.units.player
  for i = 2, ${RAID_SIZE} do world.units["raid" .. i] = member(i) end
  for i = 1, ${RAID_SIZE} do spawn(i) end
  stub.fire("GROUP_ROSTER_UPDATE")
  world.combat(true)
  return #AURAS * 100 + #SPELLS
end

local STEP = {}
-- A member's health or power, in thousandths of the maximum.
function STEP.UNIT_HEALTH(token, u, v) u.hp = math.floor(u.maxhp * v / 1000) stub.fire("UNIT_HEALTH", token) end
function STEP.UNIT_POWER_UPDATE(token, u, v) u.power = math.floor(u.maxpower * v / 1000) stub.fire("UNIT_POWER_UPDATE", token, u.ptypeName) end
-- Aura v gained (v > 0) or lost (v < 0).
function STEP.UNIT_AURA(token, _, v)
  local a = AURAS[math.abs(v)]
  if v < 0 then return world.removeAura(token, a[1]) end
  world.addAura(token, { name = a[1], spellId = a[2], duration = a[3], dispelName = a[4], isHarmful = a[4] ~= nil, sourceUnit = a[4] and "boss1" or "raid4" })
end
-- Spell v's cast starts, or the cast stops.
function STEP.UNIT_SPELLCAST_START(token, u, v)
  local s, now = SPELLS[v], GetTime() * 1000
  u.cast = { name = s[1], spellId = s[2], startMs = now, endMs = now + s[3] * 1000, interruptible = true }
  stub.fire("UNIT_SPELLCAST_START", token, "TEST-ONLY-CAST-" .. token, s[2])
end
function STEP.UNIT_SPELLCAST_STOP(token, u)
  local id = u.cast and u.cast.spellId
  u.cast = nil
  stub.fire("UNIT_SPELLCAST_STOP", token, "TEST-ONLY-CAST-" .. token, id)
end
-- A member joins (v = 1: the header gives their tile its unit) or leaves (v = 0: the header clears it).
function STEP.GROUP_ROSTER_UPDATE(token, _, v, i)
  local b = _G["Vanguard_RaidUnitButton" .. i]
  b:SetAttribute("unit", v == 1 and token or nil)
  if v == 1 then world.setUnit(token, member(i)) else world.removeUnit(token) end
end
-- One frame of 1/60 s.
function STEP.OnUpdate() stub.update(1 / 60) end

-- Plays one step of the script.
function __vgBenchStep(event, i, v)
  local token = "raid" .. i
  return STEP[event](token, world.units[token], v, i)
end
`;

// The Lua names of the events, made once so a step does not build them.
const EVENT_NAMES = new Map();

// An event's name as a Lua string.
function luaName(event) {
  if (!EVENT_NAMES.has(event)) EVENT_NAMES.set(event, to_luastring(event));
  return EVENT_NAMES.get(event);
}

const STEP_FN = to_luastring("__vgBenchStep");

// Plays one step straight through the Lua API (no chunk to compile, so the time is the step's); throws on a Lua error.
function playStep(L, [event, i, v]) {
  lua.lua_getglobal(L, STEP_FN);
  lua.lua_pushstring(L, luaName(event));
  lua.lua_pushinteger(L, i);
  lua.lua_pushinteger(L, v);
  if (lua.lua_pcall(L, 3, 0, 0) === lua.LUA_OK) return;
  const message = lua.lua_tojsstring(L, -1);
  lua.lua_pop(L, 1);
  throw new Error(`bench step ${event} raid${i} ${v}: ${message}`);
}

// The addon logged in on a finished-setup account, with the raid formed and the pull started.
export function raidAddon() {
  const addon = createAddon({ savedVariables: SETUP_DONE, instructionBudget: Infinity });
  addon.login();
  addon.eval(DRIVER);
  const known = addon.eval("return __vgBenchRaid()");
  if (known !== AURA_COUNT * 100 + SPELL_COUNT) throw new Error(`the bench driver knows ${known} (auras * 100 + spells), the script ${AURA_COUNT * 100 + SPELL_COUNT}`);
  return addon;
}

// Throws when the addon caught any error while the raid played: a run with errors measures a broken addon.
export function requireNoErrors(addon) {
  const texts = addon.eval("local t = {} for i, e in ipairs(ns.errors) do t[i] = tostring(e.text) end return t");
  const list = Array.isArray(texts) ? texts : [];
  if (list.length) throw new Error(`the addon caught ${list.length} error(s) under the raid load:\n${list.join("\n")}`);
}

// Plays the script once; returns the milliseconds spent in each event's steps.
function timedPass(addon, steps) {
  const ms = {};
  for (const step of steps) {
    const start = performance.now();
    playStep(addon.L, step);
    ms[step[0]] = (ms[step[0]] ?? 0) + performance.now() - start;
  }
  return ms;
}

// Plays the script once with each event's samples going to its own accumulator; returns them.
function samplesByEvent(addon, steps) {
  const byEvent = {};
  const kept = useProfile(emptyProfile());
  for (const step of steps) {
    useProfile((byEvent[step[0]] ??= emptyProfile()));
    playStep(addon.L, step);
  }
  useProfile(kept);
  return byEvent;
}

// Plays the script once with the profiler's sampler on the state's count hook, and puts the hook back
// after, so the timed repetitions run without it. Under npm run profile the state samples already.
function profiledPass(addon, steps) {
  const L = addon.L;
  const [hook, mask, every] = [lua.lua_gethook(L), lua.lua_gethookmask(L), lua.lua_gethookcount(L)];
  const sample = process.env.LUA_PROFILE ? null : profileSampler();
  // The state's own hook, then a sample on each count event.
  if (sample) lua.lua_sethook(L, (state, ar) => { hook(state, ar); if (ar.event === lua.LUA_HOOKCOUNT) sample(state); }, mask, every);
  try {
    return samplesByEvent(addon, steps);
  } finally {
    lua.lua_sethook(L, hook, mask, every);
  }
}

// Plays the warm-ups, the timed repetitions (one { event: ms } each) and, when opts.profile is on, one profiled repetition.
function playAll(steps, opts, progress) {
  const addon = raidAddon();
  for (let n = 0; n < opts.warmup; n++) timedPass(addon, steps);
  const reps = Array.from({ length: opts.reps }, (_, n) => {
    progress(`timed repetition ${n + 1} of ${opts.reps}`);
    return timedPass(addon, steps);
  });
  if (opts.profile) progress("profiled repetition");
  const byEvent = opts.profile ? profiledPass(addon, steps) : null;
  requireNoErrors(addon);
  return { reps, byEvent };
}

// Statistics and the result ------------------------------------------------------------------------

// The median, lowest and highest of some numbers, and the spread: (highest - lowest) as a percent of the median.
export function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return { median, min, max, spreadPct: median ? ((max - min) / median) * 100 : 0 };
}

// The Lua instructions each file ran in its own functions, in all and per event (samples times PER_SAMPLE).
export function moduleCounts(byEvent) {
  const modules = {};
  for (const [event, data] of Object.entries(byEvent)) {
    for (const [file, { self }] of Object.entries(data.files)) {
      if (!self) continue;
      const m = (modules[file] ??= { self: 0, byEvent: {} });
      m.self += self * PER_SAMPLE;
      m.byEvent[event] = (m.byEvent[event] ?? 0) + self * PER_SAMPLE;
    }
  }
  return modules;
}

// Whether a profiled file is the addon's own (not the harness's).
export function isAddonFile(file) {
  return ADDON_FILE.test(file);
}

// An event's instructions per step, the addon's and the harness's, from the module counts.
function eventInstructions(modules, event, count) {
  let addon = 0;
  let harness = 0;
  for (const [file, m] of Object.entries(modules)) {
    if (isAddonFile(file)) addon += m.byEvent[event] ?? 0;
    else harness += m.byEvent[event] ?? 0;
  }
  return { addonInstr: Math.round(addon / count), harnessInstr: Math.round(harness / count) };
}

// Each event's step count, time per step (µs) over the repetitions, and instructions per step when profiled.
export function eventRows(steps, reps, modules) {
  const rows = {};
  for (const [event, count] of Object.entries(countEvents(steps))) {
    const us = reps.map((rep) => ((rep[event] ?? 0) / count) * 1000);
    rows[event] = { count, ...stats(us), reps: us, ...(modules ? eventInstructions(modules, event, count) : {}) };
  }
  return rows;
}

// The commit the bench ran on, and whether the working tree had changes.
export function commitInfo(cwd = root) {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" });
  const status = spawnSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" });
  const commit = head.status === 0 ? head.stdout.trim() : "unknown";
  return { commit, dirty: status.status === 0 && status.stdout.trim() !== "" };
}

// Runs the bench: the script, the timed repetitions and (unless opts.profile is off) the profiled one; returns the result.
export function runBench(opts, progress = () => {}) {
  const steps = makeScript(opts);
  const { reps, byEvent } = playAll(steps, opts, progress);
  const modules = byEvent ? moduleCounts(byEvent) : null;
  const totals = reps.map((rep) => Object.values(rep).reduce((a, b) => a + b, 0));
  const settings = { seed: opts.seed, scriptEvents: opts.events, steps: steps.length, reps: opts.reps, warmup: opts.warmup, raid: RAID_SIZE, inCombat: true };
  return { label: LABEL, ...commitInfo(), date: new Date().toISOString(), node: process.version, ...settings,
    events: eventRows(steps, reps, modules), totalMs: stats(totals), modules };
}

// The result's file: coverage/bench/<commit>.json (with -dirty when the tree had changes).
export function resultFile(result) {
  return path.join(root, "coverage", "bench", `${result.commit.slice(0, 12)}${result.dirty ? "-dirty" : ""}.json`);
}

// Writes a result as JSON, creating its folder.
export function writeResult(file, result) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(result, null, 1)}\n`);
}

// Tables ----------------------------------------------------------------------------------------

// A number with a fixed count of decimals.
const fixed = (n, digits = 1) => (n == null ? "-" : n.toFixed(digits));

// A count of instructions in thousands ("12.3k").
const kilo = (n) => (n == null ? "-" : `${(n / 1000).toFixed(1)}k`);

// A change from one number to another as a signed percent ("+4.2%"); "new" or "gone" when one side is missing.
export function change(before, after) {
  if (before == null) return "new";
  if (after == null) return "gone";
  if (before === 0) return after === 0 ? "0.0%" : "new";
  const pct = ((after - before) / before) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

// A markdown table from a header row and body rows.
function table(head, rows) {
  // One row of cells.
  const line = (cells) => `| ${cells.join(" | ")} |`;
  return [line(head), line(head.map(() => "---")), ...rows.map(line)].join("\n");
}

// The result's events, the most time per step first.
function eventsByTime(result) {
  return Object.entries(result.events).sort((a, b) => b[1].median - a[1].median || (a[0] < b[0] ? -1 : 1));
}

// The per-event table: steps, median µs per step with its range and spread, instructions per step.
function eventTable(result) {
  const head = ["event", "steps per rep", "median µs/step", "min–max µs", "spread", "addon instr/step", "harness instr/step"];
  const rows = eventsByTime(result).map(([event, e]) => [event, e.count, fixed(e.median), `${fixed(e.min)}–${fixed(e.max)}`, `${fixed(e.spreadPct)}%`, kilo(e.addonInstr), kilo(e.harnessInstr)]);
  const t = result.totalMs;
  rows.push(["all steps (ms per rep)", result.steps, fixed(t.median, 2), `${fixed(t.min, 2)}–${fixed(t.max, 2)}`, `${fixed(t.spreadPct)}%`, "", ""]);
  return table(head, rows);
}

// The event a file ran the most instructions for.
function topEvent(m) {
  return Object.entries(m.byEvent).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? "-";
}

// The per-module table: the addon files that ran the most instructions in their own functions in one repetition,
// their share of the addon's, and a time estimate: their share of every instruction (the harness's too) times the median ms per rep.
function moduleTable(result, n = 15) {
  const entries = Object.entries(result.modules);
  const addon = entries.filter(([file]) => isAddonFile(file)).sort((a, b) => b[1].self - a[1].self || (a[0] < b[0] ? -1 : 1));
  const [mine, all] = [addon, entries].map((list) => list.reduce((s, [, m]) => s + m.self, 0));
  // A module's estimated milliseconds per repetition.
  const ms = (m) => fixed((m.self / all) * result.totalMs.median, 2);
  const rows = addon.slice(0, n).map(([file, m]) => [file, kilo(m.self), `${fixed((m.self / mine) * 100)}%`, ms(m), topEvent(m)]);
  return table(["module (addon file)", "instr per rep", "share of addon", "est. ms per rep", "most for"], rows);
}

// The heading lines: the label, the commit and the settings.
function heading(result) {
  return [
    `### Vanguard raid bench (${result.label})`,
    "",
    `Commit ${result.commit.slice(0, 12)}${result.dirty ? " with uncommitted changes" : ""} · ${result.raid}-member raid in combat · seed ${result.seed} · ${result.steps} steps per repetition (${result.events ? Object.keys(result.events).length : 0} kinds) · ${result.reps} timed after ${result.warmup} warm-up · Node ${result.node}`,
    "",
    "Not confirmed in game: compare with `/vg perf` in a raid. Time is the harness's wall time per step (the addon, plus the harness's own world and widget code); instructions are Lua VM instructions from the profiled repetition (1,000 per sample).",
    "",
  ];
}

// The printed result: the heading, the per-event table and, when profiled, the per-module table.
export function formatResult(result) {
  const parts = [...heading(result), eventTable(result)];
  if (result.modules) parts.push("", moduleTable(result));
  return parts.join("\n");
}

// Comparing ------------------------------------------------------------------------------------

// Each event's median µs and addon instructions per step before and after, events of either result.
export function compareEvents(before, after) {
  const names = [...new Set([...Object.keys(before.events), ...Object.keys(after.events)])].sort();
  return names.map((event) => {
    const b = before.events[event];
    const a = after.events[event];
    return { event, beforeUs: b?.median, afterUs: a?.median, timeChange: change(b?.median, a?.median), beforeInstr: b?.addonInstr, afterInstr: a?.addonInstr, instrChange: change(b?.addonInstr, a?.addonInstr) };
  });
}

// The addon files whose instructions changed the most between two profiled results (largest change first).
export function compareModules(before, after, n = 10) {
  const b = before.modules ?? {};
  const a = after.modules ?? {};
  const files = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(isAddonFile);
  const rows = files.map((file) => ({ file, before: b[file]?.self ?? 0, after: a[file]?.self ?? 0 })).filter((r) => r.before !== r.after);
  return rows.sort((x, y) => Math.abs(y.after - y.before) - Math.abs(x.after - x.before) || (x.file < y.file ? -1 : 1)).slice(0, n);
}

// Why two results' instruction counts can't be compared step for step, or "" when they can.
function scriptDifference(before, after) {
  const keys = ["seed", "scriptEvents", "raid"].filter((k) => before[k] !== after[k]);
  return keys.length ? `The scripts differ (${keys.map((k) => `${k} ${before[k]} → ${after[k]}`).join(", ")}): the steps are not the same, so read the changes as rough.` : "";
}

// The printed comparison: per event, then the modules that changed most.
export function formatCompare(before, after, beforeName) {
  const rows = compareEvents(before, after).map((r) => [r.event, fixed(r.beforeUs), fixed(r.afterUs), r.timeChange, kilo(r.beforeInstr), kilo(r.afterInstr), r.instrChange]);
  const parts = [`### Against ${beforeName} (commit ${String(before.commit).slice(0, 12)}, ${before.date ?? "no date"})`, ""];
  const differ = scriptDifference(before, after);
  if (differ) parts.push(differ, "");
  parts.push(table(["event", "before µs", "after µs", "time", "before addon instr", "after addon instr", "instructions"], rows));
  const modules = compareModules(before, after).map((r) => [r.file, kilo(r.before), kilo(r.after), change(r.before, r.after)]);
  if (modules.length) parts.push("", table(["module", "before instr", "after instr", "change"], modules));
  return parts.join("\n");
}

// The events whose median time per step grew by more than `budget` percent.
export function overBudget(before, after, budget) {
  return compareEvents(before, after).filter((r) => r.beforeUs > 0 && r.afterUs != null && ((r.afterUs - r.beforeUs) / r.beforeUs) * 100 > budget);
}
