// Tests for scripts/forever-only-api.mjs: the WoW Forever API that Retail lacks and the addon uses,
// which the harness's Retail client removes. TEST-ONLY diffs and sources apart from the repo case.

import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { DIFF, OUT, addonSource, dataFile, eventName, foreverOnlyApi, root } from "./forever-only-api.mjs";

it("the committed list is what the API diff and today's addon give; run node scripts/forever-only-api.mjs when it is not", () => {
  const diff = JSON.parse(fs.readFileSync(path.join(root, DIFF), "utf8"));
  expect(fs.readFileSync(path.join(root, OUT), "utf8")).toBe(dataFile(diff));
});

it("a documented event name becomes the name the client fires", () => {
  expect(["GameRulesChanged", "PlayerSwingRangeUpdate", "Bc26ExperienceChanged"].map(eventName)).toEqual(["GAME_RULES_CHANGED", "PLAYER_SWING_RANGE_UPDATE", "BC26_EXPERIENCE_CHANGED"]);
});

it("a function counts by its whole name only, an event only as a quoted string", () => {
  const diff = { funcs_forever_only: ["C_X.Get", "C_X.GetMore", "Lonely", "Field"], events_forever_only: ["UnitMood", "PlayerHop"] };
  const source = 'local a = C_X.GetMore()\nlocal b = Lonely()\nself.Field = 1\nf:Field()\nns.On("UNIT_MOOD", fn) -- PLAYER_HOP';
  expect(foreverOnlyApi(diff, source)).toEqual({ functions: ["C_X.GetMore", "Lonely"], events: ["UNIT_MOOD"] });
  expect(foreverOnlyApi(diff, "f('PLAYER_HOP')").events).toEqual(["PLAYER_HOP"]);
});

it("the source is the addon's own Lua, not its libraries", () => {
  const source = addonSource(root);
  expect(source).toContain("function ns.IsForever()");
  expect(source).not.toContain("LIBSTUB_MAJOR");
});
