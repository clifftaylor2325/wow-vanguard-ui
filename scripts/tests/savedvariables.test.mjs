// savedvariables: the SavedVariables every released version wrote (scripts/fixtures/savedvariables,
// made from each tag by scripts/savedvariables-fixture.mjs) load into today's addon on both clients:
// no error, the database brought up to today's version, setup and the profile kept, the options open,
// and the tables saved again load once more.

import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { FOREVER_CLIENT, RETAIL_CLIENT, createAddon } from "../lib/lua-harness.mjs";
import { root } from "../check-zip.mjs";
import { SERIALIZE_SV } from "../lib/sv-serialize.mjs";
import { loggedIn } from "./helpers.mjs";

const DIR = path.join(root, "scripts/fixtures/savedvariables");
// The released versions with a fixture, oldest first.
// Today's database version (Core/DB.lua's DB_VERSION).
const DB_VERSION = Number(fs.readFileSync(path.join(root, "Core/DB.lua"), "utf8").match(/^local DB_VERSION = (\d+)/m)[1]);
const VERSIONS = fs.readdirSync(DIR).filter((f) => f.endsWith(".lua")).map((f) => f.slice(0, -4)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

// Logs in with a version's SavedVariables as one client, plays a moment and opens the options.
function upgraded(source, client) {
  const addon = loggedIn("", { firstRun: true, savedVariables: source, client });
  addon.advance(1);
  addon.slash("");
  return addon;
}

// What a login on old SavedVariables must keep and reach: no error, setup done, the Default profile, today's DB version.
const state = (addon) => addon.eval("return { #ns.errors, VanguardDB.setupDone == true, ns.ProfileName(), VanguardDB.version, Vanguard_Options:IsShown() }");

it("there is a fixture for every release from 0.6.0 to 0.9.3", () => {
  expect(VERSIONS).toEqual(expect.arrayContaining(["0.6.0", "0.7.0", "0.7.5", "0.8.0", "0.9.0", "0.9.3"]));
});

for (const version of VERSIONS) {
  it(`${version}'s saved settings load on both clients and survive a second save`, () => {
    const source = fs.readFileSync(path.join(DIR, `${version}.lua`), "utf8");
    for (const client of [FOREVER_CLIENT, RETAIL_CLIENT]) {
      const addon = upgraded(source, client);
      expect(state(addon), `${version} on ${client ? "Retail" : "Forever"}`).toEqual([0, true, "Default", DB_VERSION, true]);
      addon.fire("PLAYER_LOGOUT");
      expect(state(upgraded(addon.eval(SERIALIZE_SV), client)), `${version} saved again and loaded`).toEqual([0, true, "Default", DB_VERSION, true]);
    }
  });
}

// Saves a table as the serializer does and runs the Lua it wrote: what VanguardDB reads back as.
function savedAndLoaded(luaTable) {
  const addon = createAddon({});
  addon.eval(`VanguardDB = ${luaTable} VanguardCharDB = {}`);
  const lua = addon.eval(SERIALIZE_SV);
  addon.eval(`VanguardDB = nil ${lua}`);
  return { lua, db: addon.eval("return VanguardDB") };
}

it("the serializer quotes a key that is a Lua keyword", () => {
  const { lua, db } = savedAndLoaded('{ profiles = { ["end"] = { a = 1 }, ["function"] = 2, plain = 3 } }');
  expect(lua).toContain('["end"] = {');
  expect(db.profiles).toEqual({ end: { a: 1 }, function: 2, plain: 3 });
});

it("the serializer writes a whole number past 2^31 exactly", () => {
  const { lua, db } = savedAndLoaded("{ money = 3000000000, debt = -5000000000 }");
  expect(lua).toContain("money = 3000000000,");
  expect(db).toEqual({ money: 3000000000, debt: -5000000000 });
});

it("the serializer writes infinity and NaN as Lua expressions, not as nil", () => {
  const { lua, db } = savedAndLoaded("{ up = math.huge, down = -math.huge }");
  expect(lua).toContain("up = math.huge,");
  expect(lua).toContain("down = -math.huge,");
  expect(db).toEqual({ up: Infinity, down: -Infinity });
  expect(savedAndLoaded("{ nan = 0/0 }").lua).toContain("nan = 0/0,");
});

it("the serializer sorts boolean keys beside number and string keys without raising", () => {
  const { lua, db } = savedAndLoaded('{ [true] = 1, [false] = 2, [1] = 3, a = 4 }');
  expect(lua.indexOf("[false]")).toBeLessThan(lua.indexOf("[true]"));
  expect(lua.indexOf("[true]")).toBeLessThan(lua.indexOf("[1]"));
  expect(db[1]).toBe(3);
});
