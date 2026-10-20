---
name: add-setting
description: Add, rename or re-type a setting on an existing Vanguard module, with its default, options control, migration, feature page sentence and smoke-test step. Use when a task says "make X configurable", "add a switch for", or changes what a setting means.
---

# Add or change a setting

A setting is a key in a module's `defaults` table, read by the module from the `settings` table `ns.Module` gives `Enable`, shown on one options page. Four places change together: the default, the reader, the control and the feature page sentence.

## Steps, in order

1. **Read**: the module's `ns.Module("<Name>", { defaults = { ... } })`, where it reads the setting (`settings.<key>`), the matching `Core/Options*.lua` page, `docs/PATTERNS.md` ("A setting that changes shape") and the feature page sentence for the feature.
2. **The default** goes in `defaults`. Pick the value a new player should get, and the type it will keep forever: `ns.Settings` fills a saved value of the wrong type with the default silently, so a type change is a data loss without a migration.
3. **Read it** where the module already reads its settings, through `settings`, never through the DB directly. A setting that applies at once needs the module to react (a function the options control calls, or a `M.Refresh(settings)`); one that needs a reload is marked so in the control (`setting("<Name>", "<key>", true)` makes the options window ask for a reload).
4. **The control** on the right page: `check(caption, setting("<Name>", "<key>"))` for a switch, the page's existing row helpers for a choice, a size or a colour (read the page for the shape; `Core/OptionsBars.lua` is the clearest). The caption is player language ("Red when out of range"), not the key name. A colour or size choice offers theme tokens only.
5. **Renamed or re-typed** keys get `ns.Migrate("<Name>", function(saved) ... end)` next to the module's defaults, moving the old value to the new key or type and clearing the old key, with a test that loads `savedVariables` holding the old shape and asserts the new one. The old key is never read again.
6. **Tests** in the area's `scripts/tests/<area>.test.mjs`: the default behaviour; the setting on (or at the other value) through `savedVariables: "VanguardDB.profiles = { Default = { <Name> = { <key> = ... } } }"`; the control changing it live if it applies at once (`addon.click` on the options row, then assert on the frame). Every new Lua line runs in some test.
7. **Docs in the same commit**: the feature page sentence that describes the feature says what the setting does and its default; a `docs/SMOKE-TEST.md` sub-step (`2.1x`) that toggles it and says what changes; `Core/WhatsNewNotes.lua` gets a line under the module with `page` and `row` so the What's new click lands on it.
8. **Check**: `npm run test:quick` while iterating; `npm run quality` and `npm run coverage` once.

## Do not

- Read a setting from `VanguardDB` or a profile table directly; `settings` is the one source.
- Give a setting a default that depends on the client or the character; defaults are plain values.
- Add a setting for something the theme decides (a colour, a font size); those are theme tokens, and a per-module override is a [DECIDE] for Cliff.
