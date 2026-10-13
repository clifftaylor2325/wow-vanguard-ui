---
name: fix-bug
description: Fix a behaviour bug in Vanguard (a Lua error, a wrong value, a module that stops working) from an issue, a /vg errors line or a /vg report block, when nobody can run the game. Use for any issue that is not purely visual; visual ones use fix-visual-issue.
---

# Fix a bug

A bug report is a request for the fix. Reproduce it in the harness first, then fix it at the cause, then prove the same scenario passes. A fix nobody reproduced is a guess.

## Steps, in order

1. **Read the report**: the issue, the `/vg errors` line (`<where>: <file>:<line>: <message>`) or the `/vg report` block (client, modules on, skin state, caught errors). The `<where>` label is the `ns.Guard`, `ns.Try` or event name the error was caught under; grep for that string to find the handler.
2. **Read the whole function group** around the line, the README sentence for that feature (README.md is the behaviour spec) and `docs/PATTERNS.md` for the pattern involved. Decide which the bug is: the code breaks the spec, or the spec is silent and the code picked wrong. The second kind needs a README sentence in the fix.
3. **Reproduce in the harness** before changing any Lua: a scenario in the area's `scripts/tests/<area>.test.mjs` that sets up the world the report describes (`world.set`, `world.setUnit`, `world.combat`, `world.secret` for a value the client hides, `world.without` for a client that lacks an API) and acts as the player (`addon.fire`, `addon.click`, `addon.slash`). Run it and watch it fail the way the report says: `expectErrors("<where>: <text>")` names the error you expect, so the harness tells you if it is a different one. `npx vitest run scripts/tests/<area>.test.mjs -t "<name>"` runs just that case.
4. **Fix at the cause**, not where the error surfaced. The usual causes, in order of how often they turn up: a value read without `ns.PlainNumber` or `ns.IsSecret`; a game frame's child that does not exist on this client (guard with a `type()` check); a setting whose type changed without `ns.Migrate`; a handler that touches a protected frame in combat (`ns.OutOfCombat`); state kept on a game frame instead of `ns.FrameState`; an event registered twice. Keep the function at 10 lines with its comment; a fix that needs more lines becomes a named helper.
5. **Turn the reproduction into the test**: drop the `expectErrors`, assert the right behaviour, and keep the scenario's name saying what the player saw. Add a second case for the nearest sibling path if the same mistake is there (it usually is: grep for the same call).
6. **Docs in the same commit** when behaviour changed: the README sentence, the `docs/SMOKE-TEST.md` step that confirms it in game (a sub-step like `9.4a`, never renumbering), and the `/vg help` line if a command changed.
7. **Check**: `npm run test:quick` while iterating; `npm run quality` and `npm run coverage` once before the PR. Every new line of Lua runs in some test.
8. **PR**: `Fixes #<n>` in the body, the reproduction named under "Tests added", and under "Needs in-game check" the one thing Cliff should try and what should happen. The issue stays open until he has looked.

## When it cannot be reproduced

Say so in the thread with what you tried, and do not push a speculative fix. Ask for a `/vg report` and the exact `/vg errors` line, or add a probe to the batch checklist (issue #284) that records the value the harness cannot know. A fix that only adds guards "in case" is a change to review on its own, named as that in the PR.
