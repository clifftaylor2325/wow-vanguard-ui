# Prompt for the implementing model

Paste the block below as the first message of a Claude Code session opened in a clone of `clifftaylor2325/wow-forever-ui` (a cheaper model and lower effort are fine; the plan carries the context). Replace `<PHASE>` with the phase you want done, e.g. `P0`.

```text
You are working in the ForeverUI repository (a World of Warcraft addon for WoW Forever, written in Lua 5.1 with a Node/Vitest test harness). Your instructions are in docs/handoff/WORKPLAN.md. Read that file in full before doing anything else, then read README.md.

Carry out phase <PHASE> of the work plan, task by task, in order, following section 0 ("How to work") exactly:
- Work on the branch the plan names for the phase. One task = one commit, subject "<task id> <area>: <change>".
- Before each task read every file it names in full. Make the change, add or update tests in the area file under scripts/tests/ (see scripts/tests/README.md) so that `npm run verify` and `npm run coverage` pass (the coverage floor is 100 % of lines), run `npm run lint` if luacheck is installed, and tick the task's checkbox in docs/handoff/WORKPLAN.md in the same commit. Update the README sentence for any behaviour you change.
- Obey the repository's enforced rules: a comment above every function, at most 10 code lines per function body, no colour or font-size literals outside Core/Theme.lua, every new WoW global added to .luacheckrc read_globals, every new widget method added to scripts/lib/wow-widget-api.lua only after confirming it exists in the 12.1 client.
- Obey the game's rules: nothing protected in combat (use ns.OutOfCombat), never read or compare a possibly secret value (ns.IsSecret / ns.PlainNumber), prefer C_Item / C_Spell / C_UnitAuras, detect Forever by interface version (ns.IsForever).
- The addon has never been run in the game and you cannot run it either. For tasks tagged [VERIFY IN GAME], implement and test under the stub, then list them in the PR description under "needs in-game check". Never claim in-game behaviour you did not observe.
- Stop and ask me only for tasks tagged [DECIDE] when the decision changes the implementation. For anything else, make the smallest reasonable choice and record it in the commit body.
- If `npm ci` fails with HTTP 403 host_not_allowed, tell me the sandbox is blocking registry.npmjs.org and stop.

When the phase is complete, open one pull request for the branch with: the list of tasks done (ids and one line each), tests added, anything skipped and why, and the "needs in-game check" list. Then give me a short summary in chat (under 200 words).
```

## Tips for the person running it

- Run one phase per session; P0 first. P1 is the heaviest; P2 tasks are mostly independent and can be split across two sessions if a session runs long.
- Answer the five questions in section 7 of the work plan before starting P3/P4.
- After P0 merges, run `docs/SMOKE-TEST.md` in the Forever beta and paste `/fui errors` and `/fui status` output into the next session's first message. In-game findings should be added to the plan as new tasks before P1.
- Line numbers in the plan are from commit `619d5c9`; they drift as commits land. The plan quotes identifiers next to each line so the model can grep.
