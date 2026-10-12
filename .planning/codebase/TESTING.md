---
last_mapped_commit: b032e6fa4cdd5d06b96dce6136ccb4bbc44fc94b
last_mapped_at: 2026-10-09
---
# Testing Patterns

**Analysis Date:** 2026-10-09

## Test Framework

**Runner:**
- Vitest (JS), config `vitest.config.mjs` at repo root. Projects include `quick` (used by `npm run test:quick`).
- Tests run in parallel, one worker per core. `VITEST_MAX_WORKERS=n` caps it.
- The Lua addon runs inside a headless WoW client written for the tests: a Lua 5.1-faithful VM (fengari with 5.1 shims), a frame API with real layout, and a world model. Everything is test-only and ships nothing in game.

**Assertion Library:**
- Vitest `expect` (with `toMatchObject`, `toEqual`, `expect.arrayContaining`, and assertion messages as second argument, e.g. `expect(x, "the default layout is drawn")`).

**Coverage:**
- Lua line coverage via `scripts/coverage-lua.mjs`, floor set in `scripts/lua-coverage-floor.json` (`{ "lines": 100 }`).

**Run Commands:**

```bash
npm run test:quick   # JS tests + one Lua smoke test (~10 s); what a PR's quick check runs
npm test             # all tests (JS + Lua harness): vitest run
npm run verify       # npm test && npm run quality (code-quality scan)
npm run coverage     # all tests with line coverage; floor 100% (scripts/lua-coverage-floor.json)
npm run lint         # luacheck . (only if installed)
```

Before calling a change done: `npm run verify` and `npm run coverage` must both pass.

**Known coverage caveat:** `npm run coverage` exits before reporting while any test is red. Compute from `coverage/lua-hits` in that case. Worktrees need their own `npm ci`.

## Test File Organization

**Location:**
- All tests live in `scripts/tests/`, separate from the addon source. No co-located tests.
- Shared helpers: `scripts/tests/helpers.mjs` (`loggedIn`, `tok`, `isTok`, `setCombat`, `chatHas`, `RETAIL`, `SETUP_DONE`, `WINDOWS_ENV`, `windowState`).
- Setup file: `scripts/tests/setup.mjs`.

**Naming:**
- `scripts/tests/<area>.test.mjs`, lowercase, one file per area of the addon: `auction.test.mjs`, `auctionledger.test.mjs`, `raid.test.mjs`, `options.test.mjs`, `profiles.test.mjs`.
- Multi-part areas use a hyphen: `windows-map.test.mjs`, `windows-social.test.mjs`.
- Cross-cutting: `scenarios.test.mjs` (more end-to-end scenarios), `smoke.test.mjs` (the one PR gate case), `fallbacks.test.mjs` (old or stricter clients), `core.test.mjs`.

**Structure:**

```
scripts/tests/
  helpers.mjs          # shared setup and inspection
  smoke.test.mjs       # PR gate: npm run test:quick
  <area>.test.mjs      # one per addon area
scripts/lib/
  lua-harness.mjs      # loads the client and addon into a Lua state
  wow-widget-api.lua   # allowlist of widget methods (others error, as in game)
  wow-stub.lua         # frames, events, clock, Lua 5.1 shims, input drivers
  wow-layout.lua       # anchors, sizes, scale to screen rects (1920x1080)
  wow-world.lua        # units, auras, actions, spells, quests, bags, map, timers
  wow-inspect.lua      # widget snapshots
scripts/lua-engine.test.mjs  # tests of the client itself
```

## Test Structure

**Suite Organization:**
Each case is one `it(...)` with a plain-sentence name. Scenarios follow set up world, act as the player, inspect what the addon drew:

```js
import { expect, it } from "vitest";
import { loggedIn } from "./helpers.mjs";

it("targeting a hostile shows the target frame", () => {
  const addon = loggedIn();
  addon.world.setUnit("target", { name: "Defias Pillager", hp: 640, maxhp: 800, reaction: 2 });
  expect(addon.frame("Vanguard_target.health")).toMatchObject({ visible: true, value: 640, max: 800 });
  expect(addon.texts("Defias Pillager").length).toBe(1);
  addon.world.removeUnit("target");
  expect(addon.frame("Vanguard_target").visible).toBe(false);
});
```

**Patterns:**
- Setup: `loggedIn(extraLua, { firstRun, savedVariables })` runs the addon, sets SavedVariables, and fires ADDON_LOADED, PLAYER_LOGIN, PLAYER_ENTERING_WORLD. Account setup is skipped by default via `SETUP_DONE`.
- Older or stricter clients: nil out an API in extra Lua (`"C_Timer = nil"`) or call `addon.world.without("C_Timer")`.
- Retail-like build: `RETAIL` string sets `__wfgWorld.build.interface = 120007`.
- Teardown: none needed. Each `loggedIn()` creates a fresh Lua state.
- Assertions carry messages when the intent is not obvious: `expect(..., "unlock shows the movers")`.
- Assertions check what the player sees (visible, text, rect, color), not internal state. Internal fields like `w.__shown` are for `frames()` predicates only.

**Driving the addon:**
- The world (`addon.world`): `setUnit`, `removeUnit`, `combat`, `addAura`, `setAction`, `addQuest`, `learn`, `openNpc`, `openAuctionHouse`, `openMailbox`, `openProfession`, `set(field, value)`, `get(field)`, `without(...)`, `secret(n)`.
- Input: `click`, `hover`, `wheel`, `key`, `drag`, `type`, `enter`, `keys({ shift: true })`, `mouse(x, y)`, `slash("unlock")`, `fire(event, ...)`, `advance(seconds)`.
- Inspection: `frame(ref)`, `frames(predicate)`, `screen()`, `texts(text)`, `find(pattern)`, `chat()`, `eval(lua)`.
- Errors: `addon.eval("return #ns.errors")` must be 0 unless the case is testing a caught error.

## Mocking

**Framework:** None in the Vitest sense. The client is a fake WoW environment (`scripts/lib/wow-*.lua`). Mocks are world state and client stubs, not `vi.mock`.

**Patterns:**

```js
addon.world.setUnit("target", { name: "Defias Pillager", hp: 640, maxhp: 800 });
addon.world.addAura("player", { name: "TEST-ONLY Buff", duration: 30, applications: 1 });
addon.world.without("C_Timer");
addon.eval("__wfgWorld.units.player.level = 10");
```

**Restricted calls:** In the auction house, every restricted call (PostItem, PlaceBid, CancelAuction and so on) is recorded in `world.ah.restricted` with `clicked` and `path`. Tests assert on this log to check that a restricted call was made inside a click.

**What to Mock:**
- Anything the client provides: units, auras, spells, quests, bags, map, timers, windows, mail, auction house, professions. Use the `world` API so events fire as they would in game.
- Client versions: nil out APIs with `without` or extra Lua to test fallbacks.
- Secret values: `world.secret(n)` for numbers the client hides in instanced combat.

**What NOT to Mock:**
- The addon's own code. Tests run the real Lua from `Vanguard.toc`.
- The layout engine. Rects come from `wow-layout.lua` at 1920x1080 (change with `__wfgStub.setScreen(w, h)`).
- Widget methods: a method not in `scripts/lib/wow-widget-api.lua` errors on purpose. Add it only after confirming it exists in the 12.1 client.

## Fixtures and Factories

**Test Data:**
- Account state: `SETUP_DONE` (finished setup), `VanguardDB` and `VanguardCharDB` literals, passed as `savedVariables`.
- Unit, aura, quest and spell data are plain JS objects passed to `world` methods.
- Fake names carry `TEST-ONLY` so a leak into the addon is obvious: `"TEST-ONLY Buff"`, `"TEST-ONLY-ART"`. Use this convention for any made-up text, icon or name.
- Window fixtures: `WINDOWS_ENV` in `helpers.mjs` defines `__window(name)`, a ButtonFrameTemplate-shaped frame, plus `MerchantFrame`, `StaticPopup1`, `MirrorTimer1`. Read back with `windowState(addon, name)`.

**Location:**
- `scripts/tests/helpers.mjs` for shared fixtures and environments.
- Per-area constants inside the area test file.

## Coverage

**Requirements:** 100% line coverage of addon Lua (`scripts/lua-coverage-floor.json`, `"lines": 100`). A new line of addon Lua needs a test that executes it.

**View Coverage:**

```bash
npm run coverage

# If a test is red, read the hits from coverage/lua-hits instead

```

**Scope:** Coverage is enforced on the full suite. A pull request's quick check runs only `smoke.test.mjs`. The full suite runs weekly, before releases, from the Actions tab, or on PRs labelled `full-tests`.

**Known red tests:** Triage against base before chasing. Pre-existing failures are tracked in issue #169 (raid tiles, plate glow, chat watch price, per the project's notes).

## Test Types

**Harness scenario tests (majority):**
- Load the real addon into the headless client, drive it, inspect the drawn frames and chat.
- Location: `scripts/tests/<area>.test.mjs`.

**Client self-tests:**
- Test the headless client's own Lua 5.1 behavior, layout, events, timers, input and inspectors.
- Location: `scripts/lua-engine.test.mjs`.

**Smoke test:**
- One case: load, login, unlock, lock, two seconds of play, no caught errors.
- Location: `scripts/tests/smoke.test.mjs`. Runs in `npm run test:quick`.

**Unit tests of build and tooling:**
- Node tests for scripts: `scripts/pkgmeta.test.mjs` (`.pkgmeta` ignore list), media build (`node scripts/build-media.mjs --check`), code-quality rules.

**E2E tests:** Not used. The game can't be run here. Anything that needs the real client is marked as needing an in-game check, and listed in `docs/SMOKE-TEST.md`.

**Visual previews:** `npm run preview` writes `preview/*.png` (needs Playwright). `npm run media` regenerates `Media/`.

## Common Patterns

**Async Testing:**
The client has no real async. Timers and OnUpdates run when time advances, so tests advance the clock:

```js
addon.world.setAction(1, { id: 133, cooldown: { start: 0, duration: 10 } });
addon.advance(10);
expect(addon.frame("Vanguard_Bar1_1.cooldown")).toMatchObject({ visible: false });
```

**Error Testing:**
Caught errors land in `ns.errors`, and the case asserts the entry:

```js
addon.world.set("units.player.hp", addon.world.secret(100));
expect(addon.eval("return #ns.errors")).toBe(0);
```

A Lua error that is not caught throws in JS with the addon file and line. Wrap the call in `expect(() => ...).toThrow()` when the error is the expected behavior.

**Chat Output:**

```js
expect(chatHas(addon, /Vanguard: .*unlocked/)).toBe(true);
```

**Numbers in strings:** The client prints Lua 5.1 numbers as the game does (`3`, not `3.0`). String assertions can match game output directly.

**Naming and Text Rules:**
- Test names and fixture text use plain English sentences.
- Any text a test makes up carries `TEST-ONLY`.
- Assert on player-visible outcomes, not on the path the addon took.

**Code-quality applies to tests:** Every function in a test file has a comment above it, and the body is at most 10 lines. Test case callbacks passed to `it(...)` are exempt from the body limit.

## Adding a Test

1. Read `scripts/tests/README.md`.
2. Pick the area file `scripts/tests/<area>.test.mjs` (create one only for a new area).
3. Use `loggedIn()` and the `world` API. Act as the player, then inspect the frames and chat.
4. Name the case as a plain sentence. Add assertion messages for non-obvious checks.
5. Run `npx vitest run scripts/tests/<area>.test.mjs`, then `npm run verify` and `npm run coverage`.
6. For a new Lua line, confirm coverage hits it. If it can only run in the real client, mark it as needing an in-game check in the PR.

---

*Testing analysis: 2026-10-09*
