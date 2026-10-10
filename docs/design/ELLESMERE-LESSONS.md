# Research: what Vanguard can learn from EllesmereUI

Written 2026-10-10 against commit `b032e6f` (v0.5.0). This is competitive research gathered from public web sources
(CurseForge, GitHub, Icy Veins, Wago, X and others, listed at the end), not a spec. Nothing here has been checked in a
game client. Statements marked "inferred" are interpretation, and "not found" is not proof of absence.

**Principles only.** EllesmereUI uses a custom license and credits third-party art used with permission. Every lesson
below is a design idea for Vanguard to implement independently in its own style. Copy none of its code, textures or text.

## TL;DR

- **What won:** EllesmereUI (EUI) markets itself on three claims: "the most intuitive UI editor in WoW", "extreme
  performance optimization" and modularity. It won the $2,500 grand prize in CurseForge's community-voted Addon Trials for
  Midnight (results July 15, 2026). Its CurseForge page shows 6,958,223 downloads on a project created seven months ago,
  and v9.4 shipped on Oct 7, 2026 for both Retail and Forever.
- **What to learn (principles only):** frame-to-frame anchoring with size matching and fallbacks; one profile with
  conditional overrides; robust, versioned profile strings processed across frames; a single combat-deferral queue plus
  checks for secret values; a first-run module picker that starts from the player's current layout; patch notes grouped by
  module and flavor that link into the settings.
- **Where to compete, and where not to:** don't race EUI on retail breadth (Cooldown Manager replacement, M+ timer, damage
  meters, Skyriding) or on its cadence of roughly 400 releases. Win on Forever-specific depth that EUI lacks or has only
  thinly, on Vanguard's coherent Slate & Brass identity, and on reliability you can demonstrate, but only once Vanguard
  has been verified in game.

## Key findings

| Area | What EllesmereUI does (confirmed) | Lesson for Vanguard |
|---|---|---|
| Positioning | Tagline: "the most intuitive UI editor in WoW with extreme performance optimization and endless customization"; a performance screenshot in an 11-image gallery | Lead with one hero capability and one proof point, not a feature list |
| Editor | Anchor to anything, width/height match, snap, pixel-perfect, grow direction follows the anchor, fallback anchors, screen-edge anchors | Model relationships between frames, not just absolute positions |
| Profiles | Whole-UI, per-module and CDM exports; Settings Overrides by spec group, content type or keybind; large strings processed across frames | Put "situations" on top of a single profile; treat import as a migration pipeline |
| 12.x restrictions | Explicit `issecretvalue` guards, a central CombatQueue, null-unit aura binding, willingness to revert clever hacks | Make secret values and taint first-class cases in the test harness |
| Cadence | Multiple releases on some days (four on Aug 31, 2026); 5,364 commits; 41 pages of GitHub releases | Ship small, write for users, but gate releases on in-game smoke tests |
| Ecosystem | Wago preset gallery, OakUI (83.5K downloads), KitnUI, a ported anchor system in NaowhForever | Publish an integration surface for profile installers early |
| Gaps | No auction tooling, talent planner, cross-character inventory or vendor memory in the sources reviewed | These are Vanguard's moat on Forever |

## 1. Product positioning and messaging

**Confirmed.**
- **Tagline and pillars.** The CurseForge description opens with the tagline, then names six pillars: Intuitive UI Editor,
  Unlock Mode ("the most advanced unlock system in WoW"), Extreme Performance Optimization ("minimize CPU usage to a
  borderline obsessive degree"), Modular Addon System, Modern Visual Design and Deep Customization. It follows with a list
  of 20+ included modules, from Action Bars to Party Mode.
- **The page itself.** The gallery has 11 images, one of them a performance image. The page links GitHub source, Discord,
  Twitch, YouTube, X and Patreon. The license is custom, not an open-source license.
- **Contest result.** CurseForge's contest page lists EllesmereUI as "01 Grand Prize · $2,500" out of an $8,100 pool. The
  CurseForge Blog gives 2nd Place ($1,500) to Danders Frames and 3rd Place ($1,000) to Coolinator, and the contest page
  lists 4th to 10th as "7 WINNERS | $300 EACH". Icy Veins also reported ten $100 mid-contest winners. CurseForge's blog
  called EllesmereUI "a clean, high-performance UI overhaul engineered for high-level play and custom display
  configurations."
- **How the win was decided.** Icy Veins reported: "Out of hundreds of submissions, the top ten have been chosen...
  Community voting is open until 13th July, with the final rankings announced on 15th July." CurseForge's X post announcing
  the results is dated Jul 15, 2026.
- **Reach.** Addon Radar recorded 627,041 downloads in the 7 days to late September and a best "Hot" rank of #5 on
  Sep 10, 2026.

**Inferred: why it won.**
- **Popularity.** The final ranking was a community vote, so EUI's existing user base and the author's reach as a
  streamer and pro healer (his X bio cites Nascent and earlier esports teams) likely mattered as much as judging.
- **Timing.** It arrived exactly as Midnight's addon restrictions broke older suites.

**Credits as a trust signal.** The page openly credits permissions. ElvUI's team allowed the use of pixel-perfect logic,
Atrocity allowed his panel textures, and JiberishUI icons are "used with permission." Vanguard should match it by
documenting the provenance of every asset in its own art (`art/CREDITS.md`).

**Lessons**
- **One claim, demonstrated.** EUI's story is "the editor is the product." Vanguard's equivalent could be "the most
  complete WoW Forever UI": everything from the bottom-center HUD to the auction house, in one consistent Slate & Brass
  look. Show it with a short editor GIF and a before/after, not adjectives.
- **Back performance claims with numbers.** EUI's performance claim is marketing. The strongest public evidence is a
  single user tweet (March 11, 2026) about FPS and 1% lows. Vanguard can do better by publishing a repeatable method, for
  example CPU time per event under a scripted raid load from its harness, labelled as a harness measurement until it is
  confirmed in game.

## 2. Unlock Mode, the visual layout editor

**Confirmed interaction ideas**
- **Anchor anything to anything, with sides.** You pick a target, then Anchor to Left/Right/Top/Bottom. A NaowhForever PR
  that ports "EllesmereUI's anchor system" describes the full set: hover a mover to get an Anchor link and a cog, pick a
  target, choose a side, type Offset X/Y, select a snap target, centre on screen, or hold the frame Relative to Screen.
- **Width/height matching that stays live.** v5.2.2 made matching "dynamic across spec swapping and dynamic bars like
  cdm." Matched sliders lock, with a tooltip saying "Width / Height matched to X. Unmatch to edit," and invalid matches
  get rejection tooltips (PR #2509).
- **Grow direction follows the anchor.** Since v5.2.2, "elements that are anchored will grow in the direction they are
  anchored (so anchored right = grow right)." Unanchored elements grow centred by default.
- **Snap with guides, pixel shifting, pixel-perfect scale.** v5.7.4 (Mar 29, 2026) improved "Pixel Perfect Height/Width
  matching, unlock mode element snapping and pixel shifting." A "Set UI Scale to 0.5333" shortcut exists for
  pixel-perfect scale.
- **Fallback Anchors** (July 2026). Anchored elements "land safely when their target is missing."
- **Screen-edge anchors** (PR #2087). These are invisible strips just outside each screen edge, so the same edge-offset
  maths applies and a profile survives a change of aspect ratio.
- **Exit Without Saving.** It works as a real transaction: v9.3.5 fixed frames that "kept dragged position on unlock
  cancel."
- **Edit next to the live UI.** A "Collapse Options Window" button (v9.3) shrinks the options to a mini window so you can
  see your UI while you edit.

**What users praise and complain about.** The only verified evidence is limited.
- **Praise.** One user wrote "I rejoined wow just to use ellesmereui settings overrides" (Jul 13, 2026). The March tweet
  praised FPS.
- **Friction, from a guide author.** Azortharion's guide has to explain that "Blizzard's Edit Mode does not move them any
  more. Type /eui and use Unlock Mode instead." It also has to warn that EUI sets the UI scale itself, so the game's own
  slider "won't do anything."
- **Bugs** cluster where anchors meet dynamic content: positions after an import, matched sizes at login on some UI
  scales, and spec-specific anchors leaking across specs. All of these are fixed in v9.x notes.

**Lessons**
- **Store relationships.** Vanguard's grid, snap and nudge editor stores positions. Add a relationship layer: anchor
  target plus side plus offset, match width/height to a target, and grow direction derived from the anchor.
  Relationships, not coordinates, are what make one layout work across specs, resolutions and dynamic bar sizes.
- **Never orphan a frame.** Add fallback anchors, screen-edge anchors and a cancel/commit transaction.
- **Explain conflicts in place.** When a slider is locked by a match, say why, and say how to unlock it.
- **Take over Edit Mode clearly.** If Vanguard owns layout, tell the user on first open, and redirect or disable
  Blizzard's scale and Edit Mode controls instead of silently overriding them.

## 3. Modular architecture and the profile system

**Modules**
- **Separate addons in one download.** Each module is its own addon folder (EllesmereUIActionBars, ...CooldownManager,
  ...ForeverEssentials, and so on) around a core. They share the core's pixel-perfect, panel, glow, font, locale and
  conditions libraries.
- **Standalone editions for some.** Several modules also ship separately: Nameplates (53.4K downloads), Unit Frames
  (88.9K), Raid & Party (74.6K), Resource Bars (43.0K) and Forever Essentials (3.3K, beta).
- **Enabling and disabling.** You choose modules at first install and can change them later through a power button per
  module with "Disable & Reload."
- **Large files being split.** The October releases split big files into smaller ones (Cooldown Manager into twelve files
  plus eleven hook files, Raid Frames into seventeen, Unlock Mode into Movers, Tools, Positions and Anchors).

**Profiles: confirmed timeline**
- **Mar 11, 2026.** "Spec based profile system + CDM profile systems," popular presets, and export/import for "Complete
  UI, Per-Addon, and CDM Spell Profile."
- **v8.4.5, Jul 13, 2026: Settings Overrides.** "Change any setting for a group of specs ... or based on a condition:
  Dungeon, Raid, Arena, Battleground, Solo, or an out-of-combat keybind toggle. Click the class glyph next to the search
  bar, pick who or when, and everything you change applies only there." The older per-spec Resource Bars mode was retired
  and its setups were "migrated automatically."
- **v8.4.7.** "Pasting or importing a very large profile or preset string now processes across frames with a progress
  percentage instead of freezing the game." Missing textures show "Texture Not Found" instead of a silent substitute, and
  re-importing your own export no longer duplicates override groups.
- **v8.5.2, Jul 20.** Export became a single flow with an Include menu (Overrides, Unlock Mode Layout, Global Settings).
  Imports now "keep your current spell layouts for any specs the import string does not carry."
- **Earlier (a June update).** Import failures "now show a specific reason instead of a generic error."
- **v8.6.4.** Importing an old value converts it to the matching new style instead of crashing.

**Bugs worth learning from (v9.0.8 to v9.1.5)**
- **Nil versus false.** Saving "unchecked" as nil let the defaults merge flip a true-by-default option back on at every
  login.
- **Stranded override markers.** These pinned elements with no way back. The fix strips orphaned markers on import when
  overrides are not included.
- **"Can't override" banners for edits that had actually landed.** Override capture needs an explicit blacklist and
  accurate messaging.

**Lessons**
- **Profile strings are a public API.** Version them, write migrations for every renamed or retired value, and process
  decode and apply in chunks across frames with progress. Fail with a specific reason, never substitute silently, and
  merge without destroying data the string doesn't carry.
- **Make Situations a layer, not a fork.** Vanguard already has situations and overrides. Present them as EUI does: one
  profile, plus "edit as: Healers / Raid / keybind" with a visible banner while editing in that context. Persist explicit
  false values, and keep a capture blacklist for settings stored by list position.
- **Make export composable.** Offer Include toggles (layout, overrides, global settings, per-module) so preset authors can
  ship part of a UI.

## 4. Cooldown Manager and tracking bars

**Confirmed**
- **A display layer over Blizzard's data.** EUI's CDM re-displays Blizzard's Cooldown Manager data (there is a "Repopulate
  from Blizzard" action).
- **Bar features.** Bar Grouping (v7.2.4), growth directions for all CDM bars (v7.7.7), Threshold Text, per-trinket
  settings that follow swaps, and Global Tracking Bar Groups "instead of rebuilding the same setup thirteen times"
  (v8.4.5).
- **Tracking bars that follow cooldowns.** Cooldown tracking bars that drain with a spell's cooldown (v8.4.7). Talent
  Conditions and out-of-range coloring per icon (v9.3).
- **Pandemic glow.** It is tied to Blizzard's flag. v7.2.4 (Apr 27, 2026) says Blizzard removed the way addons could
  create good pandemic tracking, so EUI is forced to use Blizzard's flag, which is missing for many spells, specifically
  HoTs like Lifebloom and Rejuvenation. A user reported that nameplate pandemic glow stopped showing in 12.1 (issue #1391,
  Aug 13). A user on Forever reported that pandemic glow "wasn't working in Forever" (issue #1946 comment, Oct 9, 2026).
  That issue asks for a time-threshold glow "not only spells Blizzard marks as pandemic."
- **Forever caveat.** On Forever, CDM works only "for the specs that blizzard has data for" (the developer, as quoted by
  Icy Veins on Sep 28).
- **Workarounds and reversals.**
  - **Blizzard's target-change stall.** v9.1.8 works around a Blizzard CDM stall: its target-change refresh only fires
    when the target's GUID changes.
  - **A reverted hack.** v9.1.3 reverted a "clone" countdown widget. The reason given was that mirroring a C-driven
    widget "whose inputs are secret half the time, leaks at every new setter and call site." The cosmetic fix was deferred
    to "an opt-in setting."

**Lessons**
- **Reskinning is the right call.** Vanguard reskins Blizzard's CDM rather than replacing it, which is correct for a small
  team. EUI's own history shows that replacement drags in endless spec-specific maintenance.
- **Put effort where EUI is weak on Forever.** Make the reskin rock-solid, then add a time-threshold glow that doesn't
  depend on Blizzard's pandemic flag. On Forever, durations of your own debuffs are typically readable outside restricted
  content, but verify this against secret-value behaviour in game.
- **Don't mirror secret-driven widgets.** If a value can be secret, decorate the real widget or don't show the value at
  all.

## 5. Midnight/12.x restrictions and WoW Forever specifics

**Confirmed patterns**
- **Test for secret values before comparing.** The fixes in v9.1.8 "Classify with issecretvalue ahead of the comparisons"
  on tooltip anchor points. Quest tracker geometry is anchored instead of measured, because coordinates go secret once
  execution is tainted.
- **Never write onto Blizzard frames.** HookScript("OnSizeChanged") replaced hooksecurefunc on SetSize, because a field
  write onto a Blizzard frame planted taint (v9.1.6). EUI's PR checklist codifies "No writes onto Blizzard-owned frames"
  and "HookScript/hooksecurefunc only, never SetScript on Blizzard frames."
- **One central combat queue.** v9.3.7 moved conditions, spec overrides, search and party mode onto a single
  `EllesmereUI.CombatQueue` instead of each having its own PLAYER_REGEN_ENABLED frame.
- **12.1 raid aura filtering.** Blizzard's 12.1 aura APIs display filtered aura sets without exposing the underlying data.
  v9.0.9 adapted to 12.1.0 build 69497's identity gate. It binds unassigned aura containers to the engine's null unit
  "none" rather than "player," so a container never shows the local player's buffs on the wrong frame. EUI shipped one
  build for live and the 12.1 PTR ("PTR Ready - One Version for Both").
- **Forever Essentials and Forever features.**
  - **At launch.** Icy Veins (Sep 28) attributes its feature list to "the creator's Reddit post". Together with the
    v9.2.9/v9.3 notes it covers: Threat Meter (later a resizable, snapping window with Tank % and /euitm commands), Flight
    Timer, heal and spell-cost prediction, faction indicators, level-difficulty colors, buff dispel-type borders,
    character-sheet item stats and DPS, pet power bar and hunter pet happiness, and last-name display.
  - **Later additions.** Sunder Armor on nameplates, threat % text, druid mana in forms, a mana regen "five second rule"
    spark, a loot feed and auto-uprank.
  - **Forever style.** A "WoW Forever Style" (gryphon end caps, day/night minimap orb) became the default for new Forever
    installs.
  - **Pet happiness came from a user request.** A user asked for it in issue #2159, and it shipped in v9.2.9 (Sep 25).
- **Retiring what doesn't fit Forever.** Retail-only features are removed on Forever ("whose group finder has no premade
  group list").

**Lessons**
- **Teach the harness taint and secrets.** Vanguard's 100% line coverage proves the code runs, not that it is safe from
  taint. Add harness modes that return secret values from geometry, aura and cooldown APIs, simulate combat lockdown on
  protected calls, and assert that no Blizzard-owned frame field is written. EUI's own contributors note that taint and
  secrets "stay as judgment rules" because a text check "cannot detect them reliably," which is exactly the gap a
  behavioural harness can fill.
- **Gate features per client, not per version string.** Gate on API presence, and hide or remove features that cannot work
  on a client rather than letting them error. (Vanguard's own rule is `ns.IsForever`, by interface version, for
  Forever detection; this lesson is about feature availability.)
- **Small Forever-native touches are cheap and loved.** Pet happiness, the five-second-rule spark, threat % and spell
  ranks are cheap to build and visibly Forever-native. Vanguard's quest and talent work belongs in the same category.

## 6. Release cadence and changelog practice

**Confirmed**
- **Volume.** The GitHub release list spans 41 pages, and 10 releases are shown per page. Inferred from that: roughly 400
  tags since March 2026. The repository has 5,364 commits, 277 open issues and 95 open PRs.
- **Same-day releases.** Four releases went out on Aug 31, 2026 (v9.0.9 to v9.1.2), and two days later v9.1.3 reverted a
  9.1.1 change.
- **Two audiences, two formats.**
  - **For users (CurseForge).** Major Features / Additional Features / Bug Fixes, each line prefixed with module and,
    where relevant, "WoW Forever -" (for example "WoW Forever - Forever Essentials: Threat Meter Window").
  - **For developers (GitHub).** Long engineering explanations of root causes.
  - **In game.** A patch notes tab where "clicking any new feature ... will take you straight to the setting."
- **Contribution rules.**
  - **PR template.** Includes "Zero cost while disabled," "Cheap while enabled," "New settings default OFF," and "Tested
    in-game on live."
  - **README policy.** "Any feature that can cause lua errors in any way will be rejected." No PRs for the chat module
    because of taint risk.
  - **Reports.** Bug reports often originate in Discord threads and are linked from PRs.
- **Weak spots.**
  - **Broken builds.** A contributor PR on Oct 9, 2026 says "Syntax errors and 200-local overflows landed on main and
    broke whole files in game," and adds CI guardrails plus an AGENTS.md. Some commits are co-authored by AI tools.
  - **Untested code reaching review.** Some PRs explicitly say in-game behaviour was not tested.
  - **Growing download.** CurseForge file pages show the zip at 16.9 MB for v9.0.8 (Aug 29), 22.2 MB for v9.3 (Sep 27)
    and 22.4 MB for v9.3.4 (Sep 30).

**What it implies (inferred).** EUI runs a hub-and-spoke workflow: Discord triage by named support leads, a volunteer
developer bench, and rapid merges. That buys speed and goodwill, and it costs regressions that need same-day hotfixes.

**Lessons**
- **Write two changelogs.** A user-facing one grouped by module and flavor, with defaults stated ("off by default"), and
  an engineering one. Ship an in-game "What's new" that deep-links to the setting.
- **Release in small batches, behind a smoke test.** Vanguard's harness is an advantage EUI lacks. Add a CI gate EUI had
  to retrofit: a parse check, a local-count check, and a per-client load check. Never release without a scripted in-game
  smoke run (`docs/SMOKE-TEST.md`).
- **Default new features to off.** That one rule removes most surprise regressions for existing users.

## 7. Community and ecosystem

**Confirmed**
- **Channels.** Discord (primary support), Twitch, YouTube tutorials ("EUI Tutorials" episodes, for example Settings
  Overrides), X announcements with tens of thousands of views (30.9K on Mar 11, 35.4K on Jul 13, 93K on Sep 27) and
  Patreon. Wago Addons distributes it too.
- **Its own site.** ellesmereui.com has a presets gallery, "Share Your UI" submissions, guides, patch notes and a staff
  page.
- **Third parties.**
  - **Shared presets.** Wago.io's EllesmereUI import browser reports 277 results. The top entry, Yusha's "YushaUI
    DPS/Tank Profile" (Sep 12, 2026; 2,010 views, 27 stars), is described as "A fully completed EllesmereUI Profile,
    including CDM Layouts for all DPS and Tank Specs."
  - **OakUI.** 83.5K downloads; a one-click, role-aware installer for Retail and Forever that "preserves your local
    EllesmereUI Cooldown Manager ... configuration."
  - **KitnUI.** Switched from ElvUI to EUI and is "Built on EllesmereUI's public theming builders," with its own tab
    inside EUI's config panel.
  - **NaowhForever.** Ported EUI's anchor model into its own unlock mode.
  - **Support for installers.** EUI fixed deep-linking into its options for profile installers (v8.9.0).
- **Criticism (verified, limited).**
  - **Taint errors in user reports.** Issue #1952 reported "The execution is tainted by EllesmereUI." Similar errors were
    fixed in PRs #2141 and #2153 (Sep 20).
  - **Bugs that only appear with EUI.** One user found a minimap bug they did not see when using Leatrix+ instead (#2591,
    Oct 9). There are also cosmetic bugs in the current version (#2611, Oct 10).
  - **Follow-up.** The team typically answers with a merged fix, and the PR text names the reporter.

**Not verified.** Reddit threads, CurseForge's 1.4k comments, and Wowhead/Icy Veins comment sections could not be read.
Claims about bloat, the learning curve or update fatigue are therefore not supported by user quotes here and should be
treated as hypotheses.

**Lessons**
- **Build the integration surface before you have a community.** Offer a documented way to register an installer,
  deep-link to a settings page, reuse Vanguard's widget and theme builders, and import partial profiles that keep local
  data. Installers built by creators are how EUI reached casual players. (`docs/API.md` is the natural home.)
- **Name your support people and attribute fixes.** Crediting reporters and contributors by name is cheap and builds
  loyalty.
- **Seed a preset gallery yourself.** Ship two or three role presets (healer with VuhDo-style raid frames, DPS, tank) so a
  Wago-style gallery isn't empty on day one.

## 8. Onboarding and first-run experience

**Confirmed**
- **Three steps.** The download page's flow is: install; "Pick your modules" (a first-run picker, changeable later); then
  "When you first login, EUI will set its default layout to be similar to your Blizzard Edit Mode. Start from that ... or
  browse through our collection of community made presets."
- **Fixes to the first-run picker.** The picker's Reload button now reloads immediately (v9.3), and new Forever installs
  start on the Forever style.
- **Inference: presets carry most onboarding.** Much of the real onboarding happens through creator installers and preset
  strings with written guides (OakUI, KitnUI, AzorUI).
- **Inference: friction points.** Those guides still have to explain UI scale ownership, Edit Mode being replaced, and
  destructive buttons ("do not press 'Repopulate from Blizzard CDM' ... It wipes the layout you just imported").

**Lessons**
- **Start from where the user is.** Seed Vanguard's fixed bottom-center layout from the player's current frame positions
  where sensible, rather than imposing a layout cold. (Setup already has "Keep my current layout"; the question is whether
  it should be the default.)
- **First run: three choices.** Offer modules, a role preset and a scale check, in one window, with an immediate reload.
- **Label destructive actions.** Use a confirmation that says what will be lost, and keep an automatic pre-import backup
  profile.

## 9. Gaps in EllesmereUI that Vanguard can exploit, and where not to compete

**Where EUI overlaps Vanguard (confirmed).**
- **Bags and window skinning.** Bags (with bank grouping), deep window skinning ("Blizzard Window Skinning", tooltips and
  popups) and a character sheet that compares item upgrades ("better items").
- **Quest Tracker skin and minimap.** It also has a Quest Tracker skin and a minimap.
- **Thin on the auction house.** Auction House support is only a skin plus "Auto Set Current Expansion on AH."
- **Implication.** Vanguard's gear scoring and window skinning are not unique by themselves.

**Not found in EUI in the sources reviewed (absence is not proof):**
- auction tooling (pricing or posting helpers);
- quest dialog or log replacement;
- a talent planner;
- cross-character inventory;
- vendor memory.

These matter more on Forever, where the economy, levelling and talent decisions dominate play.

**Do not compete on:** retail breadth (M+ timer, damage meters, Skyriding HUD, CDM replacement, Party Mode), cadence of
releases, or sheer volume of settings ("over 130 new settings" in one collaboration). EUI also has a head start in raid
aura tooling for 12.1 (Debuff Manager, private auras, targeted spells returning on raid frames in June 2026). A VuhDo-style
frame should aim to be correct and clear, not to match feature for feature.

## Recommendations

Ordered by impact relative to effort.

1. **Get verified in game on Forever now.** High impact, medium effort. Run a scripted smoke pass per module on Interface
   16001, and recruit 10 to 20 alpha testers. EUI credits its alpha testers, and nothing else on this list matters until
   Vanguard loads cleanly in a real client.
2. **Add secret-value, taint and lockdown simulation to the harness, plus CI parse and per-client load checks.** High
   impact, low-to-medium effort. This turns Vanguard's strongest asset into protection against EUI's most common class of
   bugs.
3. **Ship a single first-run window.** High impact, low effort. It should offer modules, a role preset (healer, DPS or
   tank), UI scale ownership explained, and an immediate reload, plus an automatic backup profile before any import.
4. **Add a relationship layer to the movers.** High impact, medium effort. Include anchor target plus side, width/height
   match with an explained lock, grow direction from the anchor, fallback and screen-edge anchors, and a true cancel. Keep
   Vanguard's grid, nudge and opacity controls.
5. **Harden profile strings.** High impact, medium effort. Use a version field and migrations, chunked processing across
   frames with progress, specific error reasons, "Texture Not Found"-style honesty, Include toggles, and keep local data
   the string doesn't carry.
6. **Reframe Situations as "one profile plus overrides."** Medium-high impact, low-medium effort. Show an "Editing as: ..."
   banner, store explicit false values, and keep a capture blacklist.
7. **Write two changelogs, with an in-game "What's new" that deep-links to settings.** Medium impact, low effort. New
   settings default to off, and every line is prefixed with its module.
8. **Publish an integration API.** Medium impact, low effort. Cover installer registration, options deep links, theme and
   widget builders, and partial import. Seed it with your own presets.
9. **Market Forever-native depth.** Medium-high impact, low effort, because it is already built. Show auction helper,
   quest dialog/log, talent planner, vendor memory and cross-character inventory under one Slate & Brass look, with a
   short editor GIF and harness-measured CPU numbers clearly labelled.
10. **Add a time-threshold glow to the CDM reskin.** Medium impact, low effort. It should not depend on Blizzard's
    pandemic flag, which is an open request on Forever in EUI's tracker.

## Caveats

- **Version mismatch.** The original brief cited v8.5.x. The current release is v9.4 (Oct 7, 2026), and v8.5.x dates from
  roughly July 2026.
- **User sentiment is thin.** The evidence comes mainly from GitHub issues and a few tweets. Reddit and CurseForge
  comments could not be retrieved, so claims about bloat, the learning curve and update fatigue are unverified.
- **Some facts are not confirmed.** KitnUI could not be confirmed as a large installer: its CurseForge page shows 478
  downloads. OakUI is the larger third-party installer.
- **Performance is unproven either way.** EUI's performance claims are the developer's marketing plus anecdote. No
  independent benchmark was found.
- **Absence is not proof.** Features listed as absent from EUI are "not found in sources reviewed," not confirmed absent.
- **Interpretation is labelled.** Statements about why EUI won, and about its workflow, are inferences.
- **Principles only.** See the note at the top.

## Sources

Retrieved around 2026-10-10 by an automated web research run. Numbers and dates are as that run reported them.

1. CurseForge, EllesmereUI project page: https://www.curseforge.com/wow/addons/ellesmereui
2. X (EllesmereGaming): https://x.com/EllesmereGaming/status/2031589223942275113
3. X (EllesmereGaming): https://x.com/EllesmereGaming/status/2076655546522870177
4. CurseForge file (v8.4.7): https://www.curseforge.com/wow/addons/ellesmereui/files/8439038
5. GitHub repository: https://github.com/EllesmereGaming/EllesmereUI
6. GitHub releases: https://github.com/EllesmereGaming/EllesmereUI/releases
7. Addon Radar: https://addon-radar.com/addon/ellesmereui
8. X (EllesmereGaming): https://x.com/EllesmereGaming/status/2031589223942275113?lang=en
9. GitHub, NaowhForever PR #146: https://github.com/nwh-gaming-ab/NaowhForever/pull/146
10. X (EllesmereGaming): https://x.com/EllesmereGaming/status/2034877836989743267
11. GitHub PR #2509: https://github.com/EllesmereGaming/EllesmereUI/pull/2509
12. CurseForge file: https://www.curseforge.com/wow/addons/ellesmereui/files/7832350
13. CurseForge file: https://www.curseforge.com/wow/addons/ellesmereui/files/7998447
14. GitHub PR #2087: https://github.com/EllesmereGaming/EllesmereUI/pull/2087
15. GitHub release v9.3.5: https://github.com/EllesmereGaming/EllesmereUI/releases/tag/v9.3.5
16. CurseForge file: https://www.curseforge.com/wow/addons/ellesmereui/files/8988935
17. Azortharion UI guide: https://azortharion.com/ui/
18. CurseForge, EllesmereUI Forever Essentials: https://www.curseforge.com/wow/addons/ellesmereui-forever-essentials
19. ellesmereui.com download page: https://ellesmereui.com/download
20. CurseForge file: https://www.curseforge.com/wow/addons/ellesmereui/files/8425382
21. CurseForge file: https://www.curseforge.com/wow/addons/ellesmereui/files/8471325
22. X (EllesmereGaming): https://x.com/EllesmereGaming/status/2066935461747069226
23. CurseForge file: https://www.curseforge.com/wow/addons/ellesmereui/files/8518122
24. Wago, OakUI: https://addons.wago.io/addons/oakui
25. CurseForge file: https://www.curseforge.com/wow/addons/ellesmereui/files/8112628
26. GitHub issue #1391: https://github.com/EllesmereGaming/EllesmereUI/issues/1391
27. GitHub issue #1946: https://github.com/EllesmereGaming/EllesmereUI/issues/1946
28. Icy Veins, EllesmereUI on WoW Forever: https://www.icy-veins.com/wow-forever/news/wow-forever-players-can-now-build-their-perfect-ui-with-ellesmereui/
29. WoW Forever Guides, addons: https://wowforeverguides.com/addons
30. GitHub PR #2097: https://github.com/EllesmereGaming/EllesmereUI/pull/2097
31. GitHub PR #2201: https://github.com/EllesmereGaming/EllesmereUI/pull/2201
32. WoWCarry, 12.1 addon aura changes: https://wowcarry.com/blog/wow/wow-12-1-addon-aura-changes
33. CurseForge file: https://www.curseforge.com/wow/addons/ellesmereui/files/8969649
34. GitHub issue #2159: https://github.com/EllesmereGaming/EllesmereUI/issues/2159
35. GitHub PR #2582: https://github.com/EllesmereGaming/EllesmereUI/pull/2582
36. GitHub PR #2141: https://github.com/EllesmereGaming/EllesmereUI/pull/2141
37. GitHub PR #2153: https://github.com/EllesmereGaming/EllesmereUI/pull/2153
38. YouTube: https://www.youtube.com/watch?v=8VKV26lrGSc
39. X (EllesmereGaming): https://x.com/EllesmereGaming/status/2104149296194998329
40. CurseForge file: https://www.curseforge.com/wow/addons/ellesmereui/files/8498802
41. CurseForge, OakUI: https://www.curseforge.com/wow/addons/oakui
42. GitHub, KitnUI: https://github.com/Bmwascher/KitnUI
43. CurseForge, KitnUI file: https://www.curseforge.com/wow/addons/kitnui/files/8762865
44. CurseForge file: https://www.curseforge.com/wow/addons/ellesmereui/files/8665168
45. GitHub issue #1952: https://github.com/EllesmereGaming/EllesmereUI/issues/1952
46. GitHub issue #2591: https://github.com/EllesmereGaming/EllesmereUI/issues/2591
47. GitHub issue #2611: https://github.com/EllesmereGaming/EllesmereUI/issues/2611
48. GitHub PR #1292: https://github.com/EllesmereGaming/EllesmereUI/pull/1292
49. X (EllesmereGaming): https://x.com/EllesmereGaming/status/2041698743330992559
50. X (EllesmereGaming): https://x.com/EllesmereGaming/status/2036539214289051691
51. Seramate, targeted spells on raid frames: https://seramate.com/news/2026/06/12/ellesmereui-targeted-spells-raid-frames-1f166c2a
