# Leonardo art plan: handoff note

Written 2026-11-02. Companion to [leonardo-art-plan.md](leonardo-art-plan.md), which is the plan itself. This note says what a thread needs in order to start, and nothing else.

## What this is

A plan, not a change. Nothing in `Media/`, `Core/` or `Modules/` moves with it. It schedules painted textures, drawn ornaments and one piece of colour art for Vanguard, made with Leonardo.ai by Cliff and drawn or processed into the addon by a thread, after launch (2026-11-04) and after the code freeze lifts.

## Order of work

1. **M0-code** (one thread: probe rows and the drawn kind with its tint sheet, no shipped texture) and **M0-Cliff** (a checklist Cliff answers: plan screenshot, the shipped scenes' privacy, the Terms, the app's controls and three calibration runs, and the §9 decisions) run side by side. Nothing painted ships before C2 confirms the plan and privacy of what is already shipped.
2. **M1a** corner bracket and the High contrast fix, **M1b** rule motif and round ring, **M2** panel surfaces (with their pipeline), **M3** first-run banner (with its pipeline), one thread and one draft PR each, in that order.

## Starting a thread

Copy the block in the plan's §10 as the brief, with `<MILESTONE>` filled in. It names the files to read, the branch, the commit rule, the gate and what goes to Cliff. The thread never generates art or logs in anywhere; Cliff generates from §6.3 and sends the files.

## Rules that are easy to miss

- Small ornaments are drawn in code from a concept sheet; only surfaces and the banner use Leonardo pixels (§4.1).
- One model (Phoenix 1.0), prompt enhance off every run, private mode on, every setting recorded in `art/painted/manifest.json` (§6.1); plan tier and generation links stay in the project folder, not the repo.
- Ornaments stay tinted `accentDim`; the new surfaces cap alpha at 12/255; the ring is the one HUD-adjacent piece and has its own go/no-go (§4.2, §4.4, R10).
- No new setting, no new top-level local in `Core/Theme.lua`, nothing on the HUD, nothing that names another addon or product (§7, §10).
- Cliff sees the crispness strip, the tint sheet and the previews before any commit that changes `Media/` (§6.5, §8).
- The listing text and screenshots say which art is AI-assisted (§7).

## Still open

The plan's §9 lists the decisions (Q1 to Q6, each tagged with the milestone it blocks) and the risks (R1 to R11). The two that block shipping are Q1 (Cliff reads Leonardo's Terms on his plan) and R2 (the three shipped AFK scenes' plan and privacy are unrecorded).
