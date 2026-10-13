---
name: add-harness-scenario
description: Write or extend a headless-client test under scripts/tests/ for Vanguard Lua, including combat, secret values, taint and expected-error cases. Use when a change needs a test, coverage dropped under 100%, or a bug needs reproducing.
---

# Add a harness scenario

Tests run the addon's real Lua in a headless WoW client (`scripts/lib/wow-*.lua`) under Vitest. The guide is `scripts/tests/README.md`; read its "Writing a scenario", "The world" and "Input" tables before writing. `scripts/tests/scenarios.test.mjs` is the model file.

## The shape

```js
import { expect, it } from "vitest";
import { loggedIn } from "./helpers.mjs";

it("what the player does and what they see", () => {
  const addon = loggedIn();                      // a finished-setup account, logged in
  addon.world.setUnit("target", { name: "Defias Pillager", hp: 640, maxhp: 800, reaction: 2 });
  expect(addon.frame("Vanguard_target.health")).toMatchObject({ visible: true, value: 640 });
});
```

Set up the world, act as the player would, inspect what the addon drew. Assert on frames and texts, not on internal tables, unless the thing under test is a table.

## Which file

- An existing area file (`scripts/tests/<area>.test.mjs`) when the module already has one. A new file for a new area, named after the area.
- A file in `scripts/tests/login-scope.json` logs in with six heavy modules off. If your case needs one of them, add the case to the file's keep-full list by rerunning `node scripts/login-scope-probe.mjs --write`, or add it to `FULL_CASES` in `scripts/lib/login-scope.mjs` with a reason.

## Cases the rules call for

- **Combat**: `addon.world.combat(true)`, do the thing, `combat(false)`, and assert the deferred change landed. A protected call in combat fails the test by itself.
- **Secret values**: `addon.world.set("units.player.hp", addon.world.secret(100))` or `secretGeometry("derived")`. The addon must draw without erroring; assert the frame shows and no text reads the number.
- **A client without an API**: `addon.world.without("C_Timer")` or `loggedIn("C_Timer = nil")`; the module degrades, never errors.
- **Errors on purpose**: `expectErrors("<the whole error text>")` before the action. The matcher must name one error; a broad pattern is refused. A test that leaves an unexpected error in `ns.errors` fails.
- **Both clients**: `loggedIn(env, { client: RETAIL_CLIENT })` when the behaviour differs on Retail.

## Coverage

Every new Lua line must run in some test. `npm run coverage` prints per-file misses; a line only a scoped login missed goes on the keep-full list. Do not add a line of Lua you cannot reach from the world or input; if it is unreachable, it is dead.

## Do not

- Do not add a widget method to `scripts/lib/wow-widget-api.lua` without confirming it exists in the 12.1 client.
- Do not set fields on game frames from a test to make the addon pass; the taint rule is the point.
- Do not loosen `expectErrors`, skip a case, or raise the test timeout to get green.
