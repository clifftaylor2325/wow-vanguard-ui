# Testing ForeverUI without the game

`npm test` runs the addon's real Lua (every file `ForeverUI.toc` loads) inside a
headless WoW client written for the tests: a Lua 5.1-faithful VM (fengari with
5.1 shims), the frame API with real layout, a world model behind the game API,
and input. Each `scripts/tests/<area>.test.mjs` file is one area of the addon
and runs in parallel with the others under Vitest.

Everything here is TEST-ONLY: nothing in `scripts/lib/wow-*.lua` ships in game.

## The pieces

| File | What it is |
| --- | --- |
| `scripts/lib/lua-harness.mjs` | Loads the client and the addon into a Lua state; the JS scenario API below. |
| `scripts/lib/wow-widget-api.lua` | The allowlist of widget methods (anything else errors, as a wrong method would in game). |
| `scripts/lib/wow-stub.lua` | Frames, regions, scripts, events, the clock, Lua 5.1 shims, and the input drivers. |
| `scripts/lib/wow-layout.lua` | Anchors, sizes and scale resolved to screen rects (1920x1080, origin bottom-left). |
| `scripts/lib/wow-world.lua` | The world: units, auras, actions, spells, quests, bags, the map, timers, Blizzard frames. |
| `scripts/lib/wow-inspect.lua` | A widget as a plain snapshot: what it draws, where, and its children. |
| `scripts/lua-engine.test.mjs` | The client's own tests (5.1 printing, layout, events, timers, input, inspectors). |

## Writing a scenario

```js
import { expect, it } from "vitest";
import { loggedIn } from "./helpers.mjs";

it("targeting a hostile shows the target frame", () => {
  const addon = loggedIn();                                      // the addon, logged in on a finished-setup account
  addon.world.setUnit("target", { name: "Defias Pillager", hp: 640, maxhp: 800, reaction: 2 });
  expect(addon.frame("ForeverUI_target.health")).toMatchObject({ visible: true, value: 640, max: 800 });
  expect(addon.texts("Defias Pillager").length).toBe(1);
  addon.world.removeUnit("target");
  expect(addon.frame("ForeverUI_target").visible).toBe(false);
});
```

The pattern is: **set up the world, act as the player would, inspect what the
addon drew.** `scripts/tests/scenarios.test.mjs` has more.

### Loading the addon

- `createAddon({ savedVariables })` (from `../lib/lua-harness.mjs`): the addon
  files are run, SavedVariables Lua is run after them, nothing has fired yet.
- `loggedIn(env)` (from `./helpers.mjs`): a finished-setup account, `env` Lua
  run before login, then `login()` fires ADDON_LOADED, PLAYER_LOGIN and
  PLAYER_ENTERING_WORLD. To test an older or stricter client, nil out an API
  in `env` (`"C_Timer = nil"`) or call `addon.world.without("C_Timer")`.

### The world (`addon.world`)

The world starts as WoW Forever (interface 16001) with one level 60 human mage,
"Tester", out of combat, with no target, auras, actions, quests or group. Every
change fires the events the client would.

| Call | Effect |
| --- | --- |
| `setUnit(token, fields)` | Creates or changes a unit (`name, hp, maxhp, power, maxpower, ptypeName, reaction, level, class, isPlayer, connected, dead, role, ...`). A new target fires PLAYER_TARGET_CHANGED; changed fields fire their UNIT_* events. |
| `removeUnit(token)` | The unit is gone (target lost, pet dismissed). |
| `unit(token)` | The unit's fields, or null. |
| `combat(true/false)` | PLAYER_REGEN_DISABLED / PLAYER_REGEN_ENABLED, with `InCombatLockdown()` to match. |
| `addAura(unit, aura)` / `removeAura(unit, name)` | Auras (`name, duration, applications, isHarmful, dispelName, sourceUnit, icon, spellId`); containers refresh and UNIT_AURA fires. |
| `setAction(slot, fields)` | An action slot: `{ id: 133 }` is Fireball (world spells: 133, 1459, 116, 2136, 118), plus `cooldown: { start, duration }`, `usable`, `count`, `charges`, ... |
| `addQuest(quest)` | A quest in the log (`questID, title, level, watched, objectives: [{ text, finished, type }]`). |
| `learn(id, fields)` / `forgetAll()` | A spell in the spellbook (`name, icon, rank, helpful, passive, offSpec`; `C_SpellBook` reads them, SPELLS_CHANGED fires), or an empty spellbook. |
| `openNpc(data)` | A gossip or quest giver window. |
| `secret(n)` | A secret value (as the client hides numbers in instanced combat): `set("units.player.hp", secret(100))`. |
| `get(field)` / `set(field, value)` | Any world field by path: `set("money", 12345)`, `set("build.interface", 120007)`. |
| `without(...names)` | Removes global APIs, as an older client would lack them. |

The world's tables are open: `addon.eval("__wfgWorld.units.player.level = 10")`
is fine when no call covers a case.

### Input

| Call | Effect |
| --- | --- |
| `click(ref, button = "LeftButton")` | PreClick, OnMouseDown, OnMouseUp, OnClick, PostClick on a frame. |
| `hover(ref)` / `hover(null)` | The mouse onto a frame (OnEnter, `IsMouseOver`), or off everything (OnLeave). |
| `wheel(ref, delta)`, `key(ref, key)` | OnMouseWheel (on the frame, or the nearest parent that takes the wheel, as in game), OnKeyDown. |
| `drag(ref, point, x, y)` | Drags a frame to a point on the screen and drops it. |
| `type(ref, text)`, `enter(ref)` | An edit box's text (OnTextChanged), and Enter in it (OnEnterPressed). |
| `keys({ shift: true })` | Modifier keys held (`IsShiftKeyDown()`...). |
| `mouse(x, y)` | The cursor at screen pixels (`GetCursorPosition`). |
| `slash("unlock")`, `chat()` | A `/fui` command, and the chat lines the addon printed. |
| `fire(event, ...)`, `update(dt)`, `advance(seconds)` | A raw event, one OnUpdate, or the clock forward (timers and OnUpdates run). |

A frame `ref` is a global name with optional fields (`"ForeverUI_player.health"`),
a `ns` path (`"ns.GetModule('Minimap').frame"`) or a widget id from a snapshot.

### Inspecting

| Call | Returns |
| --- | --- |
| `frame(ref)` | A snapshot or null: `{ name, kind, parent, shown, visible, rect: { left, bottom, width, height, right, top }, text, textColor, font, texture, atlas, color, vertexColor, alpha, value, min, max, barColor, checked, enabled, cooldown, scale, strata, level, attributes, mouse, children }`. |
| `frames(predicate)` | Snapshots of every widget passing a Lua predicate on `w`: `frames('w.__kind == "Cooldown" and w:IsVisible()')`. |
| `screen()` | The visible top-level frames the addon made, with rects: for on-screen and overlap checks. |
| `texts(text)` | Every visible font string reading exactly `text`. |
| `find(pattern)` | The first visible widget whose name or text matches a Lua pattern. |
| `eval(lua)` | Anything else, with `ns` (the addon's namespace) in scope; the first result comes back as JS. |

Rects are screen pixels on a 1920x1080 screen (`addon.eval("__wfgStub.setScreen(2560, 1440)")`
changes it). Text is measured at 6 px per character and 14 px per line.

### Errors

A Lua error throws in JS with the addon file and line it came from, and errors
the addon catches with `ns.Try` land in `ns.errors`. Numbers print as the
game's Lua 5.1 prints them (`3`, not `3.0`), so string assertions match the
game.

## Conventions

- Names, texts and icons a test makes up carry `TEST-ONLY` so a leak into the
  addon is obvious.
- A case asserts on what the player would see (visible, text, rect, color),
  not on how the addon got there; internal fields (`w.__shown`) are for the
  predicates in `frames()`.
- Coverage of the addon's Lua is enforced (`npm run coverage`): a new feature
  comes with the scenario that exercises it.
- `npm run quality` applies to the tests too: every function has a comment
  above it and at most 10 lines of body code.
