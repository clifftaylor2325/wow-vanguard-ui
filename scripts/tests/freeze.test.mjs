// The frozen surface: what players and other addons rely on staying put from one release to the next,
// written down in frozen-surface.json at each release and checked on every run (npm run test:quick).
// It holds the settings a profile saves (Module.key, as the profile holds them after a WoW Forever login
// with every module on), the /vg words (Core/Slash.lua's COMMANDS) and the functions reachable from the
// global Vanguard table (docs/API.md). Adding one is free. Removing or renaming one fails here until it is listed
// under "retired" with the migration or the reason, because a saved setting that vanishes resets players'
// choices, a /vg word that vanishes breaks their macros, and an API function that vanishes breaks other
// addons (docs/RELEASING.md, "Version policy").
//
//   npm run freeze:update      adds what is new to scripts/tests/frozen-surface.json (the release skill runs it)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { createAddon, root } from "../lib/lua-harness.mjs";
import { SETUP_DONE } from "./helpers.mjs";

const FROZEN_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "frozen-surface.json");
const KINDS = ["settings", "commands", "api"];

// Lua that answers the active profile's saved settings as sorted "Module.key" names.
const SETTINGS = `
local out = {}
for module, t in pairs(ns.Profile()) do
  if type(t) == "table" then for key in pairs(t) do out[#out + 1] = module .. "." .. tostring(key) end end
end
table.sort(out)
return out`;

// Lua that answers the global Vanguard table's functions as sorted dotted paths ("API.v1.Price"), down to
// three tables deep.
const API = `
local out = {}
local function walk(t, prefix, depth)
  for name, v in pairs(t) do
    local at = prefix .. tostring(name)
    if type(v) == "function" then out[#out + 1] = at
    elseif type(v) == "table" and depth < 3 then walk(v, at .. ".", depth + 1) end
  end
end
walk(Vanguard or {}, "", 1)
table.sort(out)
return out`;

// The /vg words: the keys of Core/Slash.lua's COMMANDS table, sorted.
export function slashWords(lua) {
  const start = lua.indexOf("\nlocal COMMANDS = {");
  const body = lua.slice(start, lua.indexOf("\n}", start));
  return [...body.matchAll(/^ {2}(\w+) = /gm)].map((m) => m[1]).sort();
}

// The surface as it is now: { settings, commands, api }, each a sorted list.
export function liveSurface() {
  const addon = createAddon({ savedVariables: SETUP_DONE });
  addon.login();
  const commands = slashWords(fs.readFileSync(path.join(root, "Core/Slash.lua"), "utf8"));
  return { settings: addon.eval(SETTINGS), commands, api: addon.eval(API) };
}

// What the frozen file lists that the live surface lacks and "retired" does not excuse, as lines.
export function vanished(frozen, live) {
  const retired = frozen.retired ?? {};
  // The names of one kind the file freezes but the addon no longer has.
  const gone = (kind) => frozen[kind].filter((n) => !live[kind].includes(n) && !(`${kind}:${n}` in retired));
  return KINDS.flatMap((kind) => gone(kind).map((n) => `${kind}: ${n}`));
}

// The frozen file with today's additions merged in, every list sorted, "retired" kept.
export function merged(frozen, live) {
  const out = {};
  for (const kind of KINDS) out[kind] = [...new Set([...(frozen?.[kind] ?? []), ...live[kind]])].sort();
  out.retired = frozen?.retired ?? {};
  return out;
}

// The committed file, or null before it exists.
function readFrozen() {
  return fs.existsSync(FROZEN_FILE) ? JSON.parse(fs.readFileSync(FROZEN_FILE, "utf8")) : null;
}

// The report a failure shows: what vanished and how to retire it on purpose.
export function vanishedReport(lines) {
  const how = 'If it is on purpose, add "<kind>:<name>": "<the migration or the reason>" under "retired" in scripts/tests/frozen-surface.json (docs/RELEASING.md, Version policy).';
  return ["Part of the frozen surface is gone:", ...lines.map((l) => `  ${l}`), how].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv.includes("--update")) throw new Error("usage: node scripts/tests/freeze.test.mjs --update");
  fs.writeFileSync(FROZEN_FILE, `${JSON.stringify(merged(readFrozen(), liveSurface()), null, 2)}\n`);
  process.stdout.write("scripts/tests/frozen-surface.json brought up to date\n");
} else {
  it("nothing frozen has vanished: saved settings, /vg words and API functions are all still there", () => {
    const lines = vanished(readFrozen(), liveSurface());
    if (lines.length > 0) throw new Error(vanishedReport(lines));
  });

  it("the frozen file lists each kind sorted and without repeats", () => {
    const frozen = readFrozen();
    for (const kind of KINDS) expect(frozen[kind], kind).toEqual([...new Set(frozen[kind])].sort());
    expect(typeof frozen.retired).toBe("object");
  });

  it("a vanished name is reported by kind; a retired one and an added one are not", () => {
    const frozen = { settings: ["A.x", "A.y"], commands: ["help", "old"], api: ["RegisterSkin"], retired: { "commands:old": "renamed to new" } };
    const live = { settings: ["A.x", "B.z"], commands: ["help", "new"], api: [] };
    expect(vanished(frozen, live)).toEqual(["settings: A.y", "api: RegisterSkin"]);
    expect(vanishedReport(["api: RegisterSkin"])).toContain('under "retired"');
  });

  it("an update adds new names, keeps old and retired ones, and sorts", () => {
    const frozen = { settings: ["B.y"], commands: ["help"], api: [], retired: { "settings:C.q": "moved" } };
    const live = { settings: ["A.x", "B.y"], commands: ["help", "unlock"], api: ["RegisterSkin"] };
    expect(merged(frozen, live)).toEqual({ settings: ["A.x", "B.y"], commands: ["help", "unlock"], api: ["RegisterSkin"], retired: { "settings:C.q": "moved" } });
    expect(merged(null, live).retired, "a first write starts with nothing retired").toEqual({});
  });

  it("reads the /vg words from the COMMANDS table only", () => {
    const lua = "local x = {\n  nope = 1,\n}\nlocal COMMANDS = {\n  -- /vg help\n  help = helpCommand,\n  unlock = unlockCommand,\n    inner = 2,\n}\n  after = 3,\n";
    expect(slashWords(lua)).toEqual(["help", "unlock"]);
  });
}
