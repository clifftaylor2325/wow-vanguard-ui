# Research: UX lessons for a WoW Forever UI suite

Written 2026-10-10 against commit `b032e6f` (v0.5.0), from public information about how WoW UI suites are built,
released and received. It is research, not a spec, and nothing here has been checked in a game client.

**Principles only.** These are design and engineering principles for Vanguard to implement in its own way. Copy no
other project's code, art, profiles or text.

## TL;DR

- **What wins players:** the best-received suites lead with one capability they can demonstrate (usually the layout
  editor), back performance claims with something measurable, and make the whole UI feel like one design.
- **What to adopt:** frame-to-frame anchoring with size matching and fallbacks; one profile with conditional overrides;
  robust, versioned profile strings processed across frames; one combat-deferral queue plus checks for secret values; a
  first-run window that starts from the player's current layout; patch notes grouped by module that link into the
  settings.
- **Where to compete:** not on retail breadth or release cadence. Win on Forever-specific depth (auction, quests,
  talents, vendor and inventory memory), on Vanguard's coherent Slate & Brass identity, and on reliability you can
  demonstrate, once Vanguard has been verified in game.

## 1. Positioning and messaging

- **One claim, demonstrated.** Lead with one hero capability and one proof point rather than a feature list. For
  Vanguard that could be "the most complete WoW Forever UI": everything from the bottom-centre HUD to the auction house
  in one Slate & Brass look. Show it with a short editor GIF and a before/after, not adjectives.
- **Measured performance.** Performance claims in this space are mostly marketing plus anecdote. Vanguard can do better
  by publishing a repeatable method, for example CPU time per event under a scripted raid load from its harness,
  labelled as a harness measurement until it is confirmed in game.
- **Credits as a trust signal.** Openly documenting the provenance and licence of every asset builds trust. Keep
  `art/CREDITS.md` and the CREDITS files complete.

## 2. The layout editor

**Interaction ideas that make an editor feel best-in-class**
- **Anchor anything to anything, with sides:** pick a target frame, then anchor to its left, right, top or bottom, with
  typed X/Y offsets, a snap target, centre-on-screen, or relative-to-screen.
- **Width and height matching that stays live** across spec changes and frames whose size changes (bars with a variable
  number of buttons). A matched slider locks, with a tooltip that says what it is matched to and how to unmatch;
  impossible matches are rejected with a reason.
- **Grow direction follows the anchor:** a frame anchored to the right of another grows to the right.
- **Snapping with guides, pixel nudging and pixel-perfect scale.**
- **Fallback anchors:** an anchored frame lands somewhere sensible when its target is missing.
- **Screen-edge anchors:** offsets measured from the screen's edges, so a layout survives a change of aspect ratio.
- **A real cancel:** "exit without saving" puts every dragged frame back.
- **Edit beside the live UI:** collapse the options to a small window while editing.

**Where friction and bugs cluster:** players are confused when a suite takes over the game's Edit Mode or UI scale
silently; anchors meeting dynamic content (positions after an import, matched sizes at login on some UI scales,
spec-specific anchors leaking across specs) is where bugs gather.

**Lessons**
- **Store relationships, not just coordinates.** Add a relationship layer to Vanguard's movers: anchor target plus side
  plus offset, size matching, and grow direction from the anchor. Keep the grid, nudge, scale and opacity controls.
- **Never orphan a frame:** fallback anchors, screen-edge anchors and a cancel/commit transaction.
- **Explain conflicts in place:** when a control is locked by a match, say why and how to unlock it.
- **Take over Edit Mode clearly:** say so on first open, and redirect or disable the game's scale and Edit Mode controls
  rather than overriding them silently.

## 3. Modules and profiles

- **Modules:** a small core with modules that can be switched off (with a reload), chosen at first install and changed
  later. Very large files get split as they grow.
- **One profile plus overrides:** "change any setting for a group of specs, or for a condition (dungeon, raid,
  battleground, solo, or a keybind toggle); everything you change applies only there." Players respond strongly to
  this model.
- **Import as a pipeline:** large strings processed across frames with a progress percentage instead of freezing the
  game; a specific reason when an import fails; a visible "texture not found" rather than a silent substitute;
  importing your own export doesn't duplicate anything; an import keeps local data the string doesn't carry; old
  values are converted on import rather than crashing.
- **Composable export:** an Include menu (overrides, layout, global settings, per module) so preset authors can share
  part of a UI.

**Bugs worth learning from**
- **Nil versus false:** saving "unchecked" as nil lets a defaults merge flip a true-by-default option back on at every
  login. Persist explicit false.
- **Stranded override markers:** markers that pin a setting with no way back. Strip orphaned markers on import.
- **Accurate "can't override" messages:** keep an explicit list of settings that can't be overridden (for example ones
  stored by list position).

**Lessons for Vanguard**
- Treat profile strings as a public API: a version field, migrations for every renamed or retired value, chunked
  processing with progress, specific errors, and merges that never destroy data the string doesn't carry.
- Present Situations as "one profile plus overrides", with an "Editing as: ..." banner while recording.
- Add Include toggles to export.

## 4. The game's Cooldown Manager

- **Reskin rather than replace.** Replacing the game's Cooldown Manager means endless spec-specific maintenance;
  reskinning it is the right call for a small team.
- **Pandemic glow:** since the 12.x restrictions, addons rely on the game's own pandemic flag, which is missing for many
  spells (notably heal-over-time spells). A time-threshold glow that doesn't depend on that flag is a real gap on
  Forever.
- **Don't mirror secret-driven widgets.** Copying a client-driven widget whose inputs are often secret leaks at every
  new setter and call site. Decorate the real widget, or don't show the value.

## 5. Working within the 12.x restrictions

- **Test for secret values before comparing.** Classify a value with `issecretvalue` before any comparison; prefer
  anchoring over measuring geometry, because coordinates can go secret once execution is tainted.
- **Never write onto Blizzard-owned frames.** Use `HookScript` or `hooksecurefunc`, never `SetScript`, on the game's
  frames, and never store fields on them: a field write plants taint.
- **One central combat queue** rather than a `PLAYER_REGEN_ENABLED` handler per feature.
- **12.1 raid aura filtering:** the 12.1 aura APIs show filtered aura sets without exposing the data. Bind unassigned
  aura containers to the null unit (`"none"`), not `"player"`, so a container never shows the player's buffs on the
  wrong frame.
- **Gate features per client:** gate on API presence, and hide features that can't work on a client rather than
  letting them error.
- **Small Forever-native touches are cheap and loved:** pet happiness, the five-second-rule spark, threat percent,
  spell ranks. Vanguard's quest and talent work belongs in the same category.

**Lesson:** Vanguard's 100 % line coverage proves the code runs, not that it is safe from taint. Add harness modes that
return secret values from geometry, aura and cooldown APIs, simulate combat lockdown on protected calls, and assert
that no Blizzard-owned frame field is written. A text check can't detect taint; a behavioural harness can.

## 6. Releases and changelogs

- **Fast cadence has a cost:** very frequent releases (several on some days) buy speed and goodwill but bring
  regressions that need same-day hotfixes, and syntax errors that reach players when there is no CI parse check.
- **Two audiences, two changelogs:** a player-facing one grouped by module (with "off by default" stated), and an
  engineering one with root causes. An in-game "What's new" where clicking a feature opens its setting.
- **Contribution rules worth adopting:** zero cost while disabled, cheap while enabled, new settings default off, tested
  in game before release, and a hard line against anything that can cause Lua errors.

**Lessons:** release in small batches behind a smoke test; keep CI checks for parsing, the Lua 200-local limit and a
per-client load; default new features to off.

## 7. Community and ecosystem

- **Creator installers and shared presets** are how a suite reaches casual players: profile galleries, one-click
  role-aware installers that keep local data, and third parties building on a suite's public theming builders.
- **Support:** a primary support channel with named support people, and fixes that credit the reporter.
- **Common complaints:** taint errors in other code blamed on the suite, bugs that only appear with the suite loaded,
  and cosmetic regressions after updates.

**Lessons**
- Build the integration surface before there is a community: installer registration, deep links into the options,
  Vanguard's widget and theme builders (`docs/API.md` is the natural home), and partial imports that keep local data.
- Name support people and credit reporters.
- Seed a preset gallery with two or three role presets (healer, damage, tank).

## 8. Onboarding

- **A three-step first run works:** install; pick modules; start from a layout close to the player's current one, or a
  shared preset.
- **Friction to design out:** who owns the UI scale, Edit Mode being replaced, and destructive buttons that wipe an
  imported layout.

**Lessons:** start from where the player is (Setup's "Keep my current layout" could be the default); one first-run
window with modules, a role preset and a scale check, and an immediate reload; label destructive actions with what
will be lost, and keep an automatic backup profile before any import.

## 9. Where to compete, and where not

- **Overlap is common** in bags, window skinning, item-upgrade hints, quest tracker skins and minimaps, so these alone
  don't set Vanguard apart.
- **Rarely bundled in a suite:** auction tooling, a quest dialog and log replacement, a talent planner, cross-character
  inventory and vendor memory. These matter more on Forever, where the economy, levelling and talent decisions dominate.
- **Don't compete on** retail breadth (Mythic+ timers, damage meters, flying HUDs, Cooldown Manager replacement), release
  cadence or sheer number of settings. A healer grid should aim to be correct and clear, not to match feature for
  feature.

## Recommendations

Ordered by impact relative to effort.

1. **Get verified in game on Forever now** (high impact, medium effort): a scripted smoke pass per module on Interface
   16001 and 10 to 20 alpha testers. Nothing else matters until Vanguard loads cleanly in a real client.
2. **Secret-value, taint and lockdown simulation in the harness, plus CI parse, local-count and per-client load checks**
   (high, low to medium).
3. **One first-run window** (high, low): modules, a role preset, UI scale ownership explained, an immediate reload, and
   an automatic backup profile before any import.
4. **A relationship layer for the movers** (high, medium): anchor target and side, size matching with an explained
   lock, grow direction from the anchor, fallback and screen-edge anchors, and a true cancel.
5. **Harden profile strings** (high, medium): version and migrations, chunked processing with progress, specific errors,
   honest missing-asset messages, Include toggles, and keep local data the string doesn't carry.
6. **Situations as "one profile plus overrides"** (medium-high, low to medium): an "Editing as" banner, explicit false
   values, a list of settings that can't be overridden.
7. **Two changelogs and an in-game "What's new" with links to settings** (medium, low): new settings default off.
8. **An integration API** (medium, low): installer registration, options deep links, theme and widget builders, partial
   import; seed it with Vanguard's own presets.
9. **Market Forever-native depth** (medium-high, low): auction helper, quest dialog and log, talent planner, vendor
   memory and cross-character inventory under one look, with an editor GIF and clearly labelled harness CPU numbers.
10. **A time-threshold glow on the Cooldown Manager reskin** (medium, low) that doesn't depend on the game's pandemic
    flag.

## Caveats

- Player sentiment was thin in the public material reviewed; claims about bloat, learning curve or update fatigue are
  hypotheses.
- Statements about why a suite succeeded, and about other teams' workflows, are inferences.
- Performance claims in this space are mostly unproven either way.
