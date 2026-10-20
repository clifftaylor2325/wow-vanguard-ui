---
name: ready-pr
description: Take a Vanguard branch from "code done" to a pull request that is ready for review, including the self-review pass, the two required checks and the PR body. Use before opening or un-drafting any PR on wow-vanguard-ui.
---

# Ready a PR

A push that turns CI red costs minutes the project does not have, and a draft that is marked ready runs the full suite. Do these in order, once.

1. **Self-review the diff adversarially** with the built-in `/code-review` skill (`Skill: code-review`, level medium) on the branch. Fix what it finds that is real; answer in the PR body what you chose not to fix and why. It catches what the harness cannot: a guard that runs but is wrong, a secret compared after a `type()` check, a handler registered twice, a setting whose type changed.
2. **Docs in the same commits**: feature page sentence, `/vg help` line, `docs/SMOKE-TEST.md` step, `docs/THEME.md` for fades and sounds, the work plan's checkbox under `docs/handoff/` or `.planning/`.
3. **Run once**: `npm run quality` and `npm run coverage`. Both pass; coverage is 100%. `npm run lint` if luacheck is installed. Do not run the suite again after each edit; `npm run test:quick` is for iterating.
4. **The PR body** follows `.github/PULL_REQUEST_TEMPLATE.md`: Tasks (one line per commit subject), Tests added (which test covers which code), Skipped ("None" or why), Needs in-game check (never empty for a change the player can see; nothing here was seen in game).
5. **Open as a draft**, then mark ready once. Add the `full-tests` label only when the change adds game API surface, touches the harness or cuts a release.
6. **Watch it**: subscribe to the PR, fix CI and review findings yourself, and reply in the thread only when it is green or blocked.
