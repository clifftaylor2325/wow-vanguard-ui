---
name: add-game-api
description: Add a WoW client API (a C_ namespace function, a global, an event, a widget method or a frame template) to Vanguard's test harness so the addon can use it. Use when a test fails with "attempt to call a nil value" on a game function or method, or a task needs an API the harness lacks.
---

# Add a game API to the harness

The harness (`scripts/lib/wow-*.lua`) models the 12.1 client. Anything the addon calls that the harness does not list is nil on purpose, so a misspelled or imagined API fails the test the way it fails in game. Adding one is a claim about the real client; make the claim only with evidence.

## Steps, in order

1. **Confirm the API exists on the 12.1 client**: Blizzard's `wow-ui-source` (the `Interface/AddOns/Blizzard_*` code for the version the TOC names, 120007) or the warcraft.wiki.gg API page, and that it exists on WoW Forever when the code will run there (`ns.IsForever`). Note the source in the commit body. No source, no API: the addon then guards the call with a `type()` check and falls back.
2. **Where it goes**:
   - A widget method: its name in the right list in `scripts/lib/wow-widget-api.lua` (`REGION`, frame, button, texture, font string, status bar). Unlisted methods are nil; listed ones the stub does not model are no-ops. If the addon reads what the method returns, model it in `scripts/lib/wow-stub.lua` next to the methods of that kind.
   - A global function or `C_*` namespace member: `scripts/lib/wow-world.lua`, in the section for that part of the game, answering from `world.<field>` so a test can set what it returns (`world.set("units.player.hp", ...)`). The pattern is `C_Item = C_Item or {}` then the function.
   - An event: nothing to add for `ns.On`; `addon.fire("<EVENT>", ...)` sends any name. A world change that should fire it (a unit's health changing fires `UNIT_HEALTH`) goes in `wow-world.lua` beside the change.
   - A frame template: `scripts/tests/helpers.mjs` builds the game's frames a test needs (`WINDOWS_ENV`, `__window(name)`); a new template's parts are added there, with the same `type()`-guarded reads in the addon because the real client's copy can differ.
3. **The read-globals list**: every global the addon reads goes in `read_globals` in `.luacheckrc`, with a comment naming the module that uses it, or luacheck fails the PR.
4. **Secrets and combat**: a function that can return a hidden value on Forever (`UnitHealth`, aura values, cooldowns) returns `world.secret(...)` when `world.aurasSecret` or the unit's field is secret, so the addon's `ns.PlainNumber` path is exercised. A protected method goes through the taint rules in `scripts/lib/wow-taint.lua` (blocked in combat for the addon's code).
5. **The test**: a case in `scripts/lua-engine.test.mjs` for a harness feature with its own behaviour (a world field that fires an event), or the area test that needed it. The addon's own use is covered by the area test.
6. **Docs**: `scripts/tests/README.md` lists the world's calls and fields; add the new one to its table. The `full-tests` label goes on the PR, because it adds game API surface.

## Do not

- Add a method to make a test pass. The method is nil because the client may lack it.
- Model a return value you have not seen documented; a wrong model hides a real error until the game.
- Change `scripts/lib/wow-taint.lua` or the secret helpers in `wow-world.lua` without saying so in the thread first; those are the harness's rules, and a change there is an Opus-level task in `CLAUDE.md`.
