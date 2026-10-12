# Phase 1: Green baseline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-09
**Phase:** 1-green-baseline
**Areas discussed:** Stub laid-out rule, Auction tab intent, Green bar

---

## Stub laid-out rule

| Option | Description | Selected |
|--------|-------------|----------|
| Fix the fixtures (Recommended) | Give each fake frame a size or anchor, like the client does. The strict rule stays. | ✓ |
| Relax the rule | Accept frames the client pins itself (secure headers, empty font strings). | |
| Revert the rule | Remove the stricter rule the auction tabs merge added. | |

**User's choice:** Fix the fixtures
**Notes:** The stricter rule is kept. Cases #169-5, #169-6 and #169-7 are fixed in their fixtures.

---

## Auction tab intent (max price)

| Option | Description | Selected |
|--------|-------------|----------|
| Code is wrong (Recommended) | Hide listings above the max price. Fix the filter. | ✓ |
| Test is wrong | Showing listings above the max price is intended. | |

**User's choice:** Code is wrong
**Notes:** Case #169-2 (`auction.test.mjs:799`).

---

## Auction tab intent (sell-card history)

| Option | Description | Selected |
|--------|-------------|----------|
| Listings by default (Recommended) | Show listings first, history behind the toggle. Fix the card. | ✓ |
| History by default | Keep current behaviour and fix the test. | |

**User's choice:** Listings by default
**Notes:** Case #169-4 (`auctionledger.test.mjs:192`).

---

## Green bar

| Option | Description | Selected |
|--------|-------------|----------|
| Local, then one hosted run (Recommended) | Pass locally, then confirm one hosted run before closing #169. | |
| Local only | Pass locally on clean main and close #169. No hosted run until Phase 3. | ✓ |
| Hosted run after every fix | Confirm each fix on the hosted runner. | |

**User's choice:** Local only
**Notes:** The roadmap's Phase 1 criteria were updated to match. The hosted-runner check moves to Phase 3.

### Hosted check (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Local only (update roadmap) | Phase 1 is done on clean main locally. | ✓ |
| Keep the hosted check | One hosted run required before #169 closes. | |

**User's choice:** Local only (update roadmap)

---

## Claude's Discretion

- Case #169-3 (keyboard focus): keys go to a focused text box, not the view. Standard game behaviour; not asked.
- Case #169-5 (chat watch empty price): smallest fixture change that gives the empty font string a rect, as the client does.
- Every harness or stub change cites the 12.1 Blizzard source in its commit body.

## Deferred Ideas

- Hosted-runner confirmation of the green suite: Phase 3.
- Splitting `AuctionHelper.lua` and `AuctionSell.lua`: Phase 5.
- Dead-code removal and `ns.Every`: Phase 4.
