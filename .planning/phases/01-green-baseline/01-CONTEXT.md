# Phase 1: Green baseline - Context

**Gathered:** 2026-10-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the full test suite pass on clean `main` locally, resolve each of the seven red cases in issue #169 with a recorded outcome, and restore `npm run coverage` so it prints its report and holds the 100% floor. This phase does not add features, change CI, or run the hosted runner; hosted confirmation moves to Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Stub layout rule (cases #169-5, #169-6, #169-7)
- **D-01:** Keep the stricter "laid out" rule in `scripts/lib/wow-layout.lua`. Fix the three test fixtures so they have a size or anchor, as the client would lay them out: the chat watch toast price line, the nameplate fixture (`__plates.nameplate1`), and the raid unit buttons under the stub's header emulation. No test is loosened to pass.

### Auction tab behaviour (cases #169-1 to #169-4)
- **D-02:** Max-price filter (`auction.test.mjs:799`): the code is wrong. Listings above the list entry's `maxPrice` must be hidden. Fix the filter in the auction view and keep the test expectation.
- **D-03:** Sell-card history (`auctionledger.test.mjs:192`): listings are shown by default and history sits behind the toggle, as the test expects. Fix the sell card so it does this.

### Green bar and closing #169
- **D-04:** Phase 1 is done when clean `main` passes the full suite locally and `npm run coverage` passes the 100% floor. No hosted-runner run is required in this phase; that confirmation moves to Phase 3.
- **D-05:** Issue #169 closes when every one of the seven cases has a recorded outcome (fixed with the cause named, or shown not to reproduce on clean main) and D-04 passes.

### Claude's Discretion
- Case #169-3 (keyboard focus): when a text box has focus, keys go to the box and not to the view. This is standard game behaviour, so the fix follows it without a question.
- Case #169-5 (chat watch empty price): the fixture fix in D-01 is preferred. Claude picks the smallest change that gives the empty font string a rect the way the client does.
- Every harness or stub change cites the 12.1 Blizzard source in its commit body (success criterion 3 in the roadmap).

### Folded Todos
None.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and scope
- `.planning/ROADMAP.md` — Phase 1 success criteria and notes (updated for D-04 and D-05)
- `.planning/REQUIREMENTS.md` — CI-01 (suite green, #169 resolved) and CI-02 (coverage reports, 100% floor)
- `.planning/PROJECT.md` — Constraints (Lua 5.1, code rules, 100% coverage floor, verification rules)

### Research
- `.planning/research/SUMMARY.md` — Conflict 1: suite state disagrees across sources (751/751 locally vs seven red in #169); re-baseline on clean main
- `.planning/research/PITFALLS.md` — Pitfalls 1 (bending the stub to go green) and 2 (swallowed errors); the rule that no commit loosens a harness rule and changes a test together

### Codebase
- `.planning/codebase/TESTING.md` — test layout, harness, and coverage behaviour
- `scripts/lib/wow-layout.lua` — the stricter `laidOut` rule (`IsRectValid()` false for unlaid-out frames)
- `scripts/lua-coverage-floor.json` — the 100% floor the coverage run enforces
- `scripts/tests/README.md` — how area tests run the Lua in the headless client

### External
- GitHub issue #169 — "Full suite: seven cases red on main since the auction tabs merge"; lists the seven cases by file and line

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/lib/wow-layout.lua` already implements the laid-out rule; the fixes use it as is.
- The stub's header emulation in the raid test harness places the group buttons; the raid fixture uses it rather than a hand-made rect.

### Established Patterns
- Behaviour fixes go in `Modules/` (auction view and sell card); harness and stub changes go in `scripts/lib/` and are commit-separated from test changes.
- Area tests run the real Lua through `helpers.loggedIn()`; new assertions follow that pattern.

### Integration Points
- Auction fixes touch `Modules/AuctionHelper.lua` and the sell card in `Modules/AuctionSell.lua`. Phase 5 later splits these files, so Phase 1 changes stay small.
- Coverage: `npm run coverage` writes `coverage/lua-hits`; per the project notes it exits before reporting while any test is red, so the suite must be green before coverage can be checked.

</code_context>

<specifics>
## Specific Ideas

- The seven cases to resolve, from #169: `auction.test.mjs:257`, `auction.test.mjs:799`, `auction.test.mjs:867`, `auctionledger.test.mjs:192`, `chatwatch.test.mjs:201`, `plates.test.mjs:172`, `raid.test.mjs:95`.
- Run the seven cases with `npx vitest run scripts/tests/auction.test.mjs scripts/tests/auctionledger.test.mjs scripts/tests/chatwatch.test.mjs scripts/tests/plates.test.mjs scripts/tests/raid.test.mjs` to check progress.

</specifics>

<deferred>
## Deferred Ideas

- Hosted-runner confirmation of the green suite: moved to Phase 3 (CI measurement), per D-04.
- Splitting `Modules/AuctionHelper.lua` and `AuctionSell.lua`: Phase 5, after the Post fix.
- Dead-code removal and `ns.Every`: Phase 4.

### Reviewed Todos (not folded)
None.

</deferred>

---

*Phase: 1-Green baseline*
*Context gathered: 2026-10-09*
</content>
